import { findNode } from './document'
import type { Registry } from './registry'
import type {
  Diagnostic,
  DiagnosticInput,
  EvaluationContext,
  GraphDocument,
  GraphNode,
  LogEntry,
  RunOptions,
  RunResult,
  Value,
  VariableSnapshot,
} from './types'
import { cloneValue } from './values'
import { validateDocument } from './validate'

const DEFAULT_MAX_STEPS = 10_000
const MAX_EXEC_DEPTH = 256
const MAX_DATA_DEPTH = 256

/**
 * Hybrid executor.
 * Exec wires push control flow. Data wires are pulled when a node reads an input.
 * Pure nodes are recomputed on each read so loops see fresh values.
 * A data cycle and a runaway exec loop both stop the run instead of hanging.
 */
export function runDocument(document: GraphDocument, registry: Registry, options: RunOptions = {}): RunResult {
  const validation = options.skipValidation ? [] : validateDocument(document, registry)
  if (validation.some((diagnostic) => diagnostic.level === 'error')) {
    return {
      ok: false,
      logs: [],
      diagnostics: validation,
      variables: snapshotVariables(document, new Map(document.variables.map((variable) => [variable.name, cloneValue(variable.value)]))),
    }
  }

  const runtime = new Runtime(document, registry, options)
  runtime.emit(options.event ?? 'start')
  const diagnostics = [...validation, ...runtime.diagnostics]
  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    logs: runtime.logs,
    diagnostics,
    variables: snapshotVariables(document, runtime.variables),
  }
}

class Runtime {
  readonly logs: LogEntry[] = []
  readonly diagnostics: Diagnostic[] = []
  readonly variables: Map<string, Value>
  private readonly outputs = new Map<string, Map<string, Value>>()
  private readonly evaluating = new Set<string>()
  private readonly payload: Readonly<Record<string, unknown>>
  private readonly maxSteps: number
  private steps = 0
  private execDepth = 0
  private stopped = false
  private dataDepth = 0
  private reportedLimit = false

  constructor(
    private readonly document: GraphDocument,
    private readonly registry: Registry,
    options: RunOptions,
  ) {
    this.variables = new Map(document.variables.map((variable) => [variable.name, cloneValue(variable.value)]))
    this.payload = Object.freeze({ ...(options.payload ?? {}) })
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  }

  emit(event: string): void {
    const entries = this.document.nodes
      .filter((node) => this.registry.getNodeType(node.typeId)?.event === event)
      .sort((left, right) => left.y - right.y || left.x - right.x)

    if (entries.length === 0) {
      this.diagnostics.push({
        level: 'warning',
        code: 'no-entry',
        message: `Нет нод, подписанных на событие «${event}».`,
      })
      return
    }

    for (const node of entries) {
      if (this.stopped) return
      const definition = this.registry.getNodeType(node.typeId)
      if (!definition) continue
      if (definition.execute) {
        this.runExec(node.id)
        continue
      }
      if (!this.enter(node.id)) return
      for (const port of definition.outputs) {
        if (port.kind === 'exec') this.fire(node.id, port.id)
      }
    }
  }

  private runExec(nodeId: string): boolean {
    if (!this.enter(nodeId)) return false
    if (this.execDepth >= MAX_EXEC_DEPTH) {
      this.stopped = true
      if (!this.reportedLimit) {
        this.reportedLimit = true
        this.diagnostics.push({
          level: 'error',
          code: 'exec-depth',
          message: 'Слишком глубокая цепочка выполнения. Похоже, поток зациклился.',
          nodeId,
        })
      }
      return false
    }
    const node = findNode(this.document, nodeId)
    const definition = node ? this.registry.getNodeType(node.typeId) : undefined
    if (!node || !definition?.execute) return true
    this.execDepth += 1
    try {
      definition.execute(this.contextFor(node))
    } catch (error) {
      this.logs.push({
        level: 'error',
        message: error instanceof Error ? error.message : 'Нода завершилась с ошибкой',
      })
      this.diagnostics.push({
        level: 'error',
        code: 'node-error',
        message: error instanceof Error ? error.message : 'Нода завершилась с ошибкой',
        nodeId,
      })
      this.stopped = true
      return false
    } finally {
      this.execDepth -= 1
    }
    return !this.stopped
  }

  private fire(nodeId: string, portId: string): boolean {
    const edges = this.document.edges.filter((edge) => edge.sourceNodeId === nodeId && edge.sourcePortId === portId)
    for (const edge of edges) {
      if (!this.runExec(edge.targetNodeId)) return false
    }
    return !this.stopped
  }

  private enter(nodeId: string): boolean {
    if (this.stopped) return false
    this.steps += 1
    if (this.steps > this.maxSteps) {
      this.stopped = true
      if (!this.reportedLimit) {
        this.reportedLimit = true
        this.diagnostics.push({
          level: 'error',
          code: 'exec-limit',
          message: 'Выполнение остановлено: превышен лимит шагов. Проверьте цикл в потоке.',
          nodeId,
        })
      }
      return false
    }
    return true
  }

  private contextFor(node: GraphNode): EvaluationContext {
    return {
      payload: this.payload,
      getInput: (portId) => this.readInput(node, portId),
      setOutput: (portId, value) => this.writeOutput(node, portId, value),
      getProperty: (propertyId) => this.readProperty(node, propertyId),
      getVariable: (name) => this.readVariable(name, node.id),
      setVariable: (name, value) => this.writeVariable(name, value, node.id),
      trigger: (portId) => this.fire(node.id, portId),
      log: (message) => this.logs.push({ level: 'info', message }),
      report: (diagnostic) => this.report(diagnostic, node.id),
    }
  }

  private readInput(node: GraphNode, portId: string): Value {
    const definition = this.registry.getNodeType(node.typeId)
    const port = definition?.inputs.find((item) => item.id === portId)
    const fallback = () => this.defaultFor(port?.dataType, node.inputs[portId])
    const edge = this.document.edges.find((item) => item.targetNodeId === node.id && item.targetPortId === portId)
    if (!edge) return fallback()
    return this.pull(edge.sourceNodeId, edge.sourcePortId) ?? fallback()
  }

  private pull(nodeId: string, portId: string): Value | undefined {
    const node = findNode(this.document, nodeId)
    if (!node) return undefined
    const definition = this.registry.getNodeType(node.typeId)
    if (!definition) return undefined

    if (definition.role === 'pure' && definition.compute) {
      if (this.evaluating.has(node.id)) {
        this.report(
          { level: 'error', code: 'data-cycle', message: 'Цикл в потоке данных остановил чтение значения.' },
          node.id,
        )
        this.stopped = true
        return undefined
      }
      if (this.dataDepth >= MAX_DATA_DEPTH) {
        this.report(
          { level: 'error', code: 'data-depth', message: 'Слишком глубокая цепочка данных.' },
          node.id,
        )
        this.stopped = true
        return undefined
      }
      this.evaluating.add(node.id)
      this.dataDepth += 1
      try {
        definition.compute(this.contextFor(node))
      } catch (error) {
        this.report(
          {
            level: 'error',
            code: 'node-error',
            message: error instanceof Error ? error.message : 'Чистая нода завершилась с ошибкой',
          },
          node.id,
        )
        this.stopped = true
      } finally {
        this.dataDepth -= 1
        this.evaluating.delete(node.id)
      }
    }

    return this.outputs.get(node.id)?.get(portId)
  }

  private writeOutput(node: GraphNode, portId: string, value: Value): void {
    const definition = this.registry.getNodeType(node.typeId)
    const port = definition?.outputs.find((item) => item.id === portId && item.kind === 'data')
    if (!port) {
      this.report({ code: 'unknown-port', message: `У ноды нет выхода данных «${portId}»` }, node.id)
      return
    }
    const stored = cloneValue(value)
    if (port.dataType && port.dataType !== 'any' && stored.type !== port.dataType && stored.type !== 'any') {
      this.report(
        {
          code: 'type-mismatch',
          message: `Выход «${port.label}» ожидает «${port.dataType}», получено «${stored.type}»`,
        },
        node.id,
      )
      return
    }
    let bucket = this.outputs.get(node.id)
    if (!bucket) {
      bucket = new Map()
      this.outputs.set(node.id, bucket)
    }
    bucket.set(portId, stored)
  }

  private readProperty(node: GraphNode, propertyId: string): Value {
    const definition = this.registry.getNodeType(node.typeId)
    const property = definition?.properties.find((item) => item.id === propertyId)
    const value = node.properties[propertyId] ?? property?.defaultValue
    if (!value) {
      this.report({ code: 'missing-property', message: `Свойство «${propertyId}» не задано` }, node.id)
      return { type: 'any', data: null }
    }
    return cloneValue(value)
  }

  private readVariable(name: string, nodeId: string): Value {
    const value = this.variables.get(name)
    if (!value) {
      this.report({ level: 'warning', code: 'missing-variable', message: `Переменная «${name}» не задана` }, nodeId)
      return { type: 'any', data: null }
    }
    return cloneValue(value)
  }

  private writeVariable(name: string, value: Value, nodeId: string): void {
    const trimmed = name.trim()
    if (!trimmed) {
      this.report({ code: 'variable-name', message: 'Не выбрана переменная для записи' }, nodeId)
      return
    }
    const declared = this.document.variables.find((variable) => variable.name === trimmed)
    const stored = cloneValue(value)
    if (declared && declared.dataType !== 'any' && stored.type !== declared.dataType) {
      this.report(
        {
          code: 'variable-type',
          message: `Переменная «${trimmed}» ожидает тип «${declared.dataType}», получено «${stored.type}»`,
        },
        nodeId,
      )
      return
    }
    this.variables.set(trimmed, stored)
  }

  private defaultFor(dataType: string | undefined, inline: Value | undefined): Value {
    if (inline) return cloneValue(inline)
    if (dataType && this.registry.getDataType(dataType)) return this.registry.requireDataType(dataType).defaultValue()
    return { type: 'any', data: null }
  }

  private report(diagnostic: DiagnosticInput, nodeId: string): void {
    this.diagnostics.push({
      level: diagnostic.level ?? 'error',
      code: diagnostic.code,
      message: diagnostic.message,
      nodeId: diagnostic.nodeId ?? nodeId,
      edgeId: diagnostic.edgeId,
    })
    if ((diagnostic.level ?? 'error') === 'error') {
      this.logs.push({ level: 'error', message: diagnostic.message })
    }
  }
}

function snapshotVariables(document: GraphDocument, variables: Map<string, Value>): VariableSnapshot[] {
  const declared = new Set(document.variables.map((variable) => variable.name))
  const snapshots: VariableSnapshot[] = document.variables.map((variable) => ({
    name: variable.name,
    dataType: variable.dataType,
    value: cloneValue(variables.get(variable.name) ?? variable.value),
  }))
  for (const [name, value] of variables) {
    if (declared.has(name)) continue
    snapshots.push({ name, dataType: value.type, value: cloneValue(value) })
  }
  return snapshots
}
