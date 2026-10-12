import { resolvePort } from './document'
import type { Registry } from './registry'
import type { Diagnostic, GraphDocument, GraphEdge } from './types'
import { areTypesCompatible } from './values'

export function validateDocument(document: GraphDocument, registry: Registry): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const nodeIds = new Set<string>()

  for (const node of document.nodes) {
    if (nodeIds.has(node.id)) {
      diagnostics.push({
        level: 'error',
        code: 'duplicate-id',
        message: `Идентификатор ноды «${node.id}» повторяется`,
        nodeId: node.id,
      })
    }
    nodeIds.add(node.id)
    if (!registry.getNodeType(node.typeId)) {
      diagnostics.push({
        level: 'error',
        code: 'unknown-node-type',
        message: `Неизвестный тип ноды «${node.typeId}». Подключите плагин, который его регистрирует.`,
        nodeId: node.id,
      })
    }
  }

  const edgeIds = new Set<string>()
  const incoming = new Map<string, GraphEdge>()
  for (const edge of document.edges) {
    if (edgeIds.has(edge.id)) {
      diagnostics.push({
        level: 'error',
        code: 'duplicate-id',
        message: `Идентификатор связи «${edge.id}» повторяется`,
        edgeId: edge.id,
      })
    }
    edgeIds.add(edge.id)

    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      diagnostics.push({
        level: 'error',
        code: 'missing-node',
        message: 'Связь указывает на ноду, которой нет в документе',
        edgeId: edge.id,
      })
      continue
    }

    const source = resolvePort(document, registry, edge.sourceNodeId, edge.sourcePortId)
    const target = resolvePort(document, registry, edge.targetNodeId, edge.targetPortId)
    if (!source || !target) {
      if (registry.getNodeType(document.nodes.find((node) => node.id === edge.sourceNodeId)?.typeId ?? '')
        && registry.getNodeType(document.nodes.find((node) => node.id === edge.targetNodeId)?.typeId ?? '')) {
        diagnostics.push({
          level: 'error',
          code: 'unknown-port',
          message: 'Связь указывает на порт, которого нет у ноды',
          edgeId: edge.id,
          nodeId: edge.targetNodeId,
        })
      }
      continue
    }
    if (source.direction !== 'output' || target.direction !== 'input') {
      diagnostics.push({
        level: 'error',
        code: 'port-direction',
        message: 'Связь должна идти с выхода на вход',
        edgeId: edge.id,
      })
    }
    if (source.node.id === target.node.id) {
      diagnostics.push({
        level: 'error',
        code: 'same-node',
        message: 'Нельзя соединить ноду саму с собой',
        edgeId: edge.id,
        nodeId: source.node.id,
      })
    }
    if (source.kind !== target.kind) {
      diagnostics.push({
        level: 'error',
        code: 'kind-mismatch',
        message: 'Нельзя соединить поток выполнения с данными',
        edgeId: edge.id,
        nodeId: target.node.id,
      })
    } else if (source.kind === 'data') {
      const sourceType = source.dataType ?? 'any'
      const targetType = target.dataType ?? 'any'
      if (!areTypesCompatible(sourceType, targetType, registry.getDataType(targetType))) {
        diagnostics.push({
          level: 'error',
          code: 'type-mismatch',
          message: `Тип «${sourceType}» не подходит ко входу «${targetType}»`,
          edgeId: edge.id,
          nodeId: target.node.id,
        })
      }
    }

    if (target.kind === 'data') {
      const key = `${edge.targetNodeId}:${edge.targetPortId}`
      const previous = incoming.get(key)
      if (previous) {
        diagnostics.push({
          level: 'error',
          code: 'fan-in',
          message: 'У входа данных может быть только один провод',
          edgeId: edge.id,
          nodeId: edge.targetNodeId,
        })
      } else {
        incoming.set(key, edge)
      }
    }
  }

  const names = new Set<string>()
  for (const variable of document.variables) {
    if (!variable.name.trim()) {
      diagnostics.push({ level: 'error', code: 'variable-name', message: 'У переменной пустое имя' })
    } else if (names.has(variable.name)) {
      diagnostics.push({
        level: 'error',
        code: 'variable-name',
        message: `Имя «${variable.name}» используется у нескольких переменных`,
      })
    }
    names.add(variable.name)
    if (!registry.getDataType(variable.dataType)) {
      diagnostics.push({
        level: 'error',
        code: 'unknown-type',
        message: `Неизвестный тип переменной «${variable.dataType}»`,
      })
    } else if (variable.value.type !== variable.dataType && variable.dataType !== 'any' && variable.value.type !== 'any') {
      diagnostics.push({
        level: 'error',
        code: 'variable-type',
        message: `Значение переменной «${variable.name}» не совпадает с её типом`,
      })
    }
  }

  const cycle = findDataCycle(document, registry)
  if (cycle) {
    diagnostics.push({
      level: 'error',
      code: 'data-cycle',
      message: 'Цикл в потоке данных. Разорвите кольцо или передайте значение через переменную.',
      nodeId: cycle[0],
    })
  }

  return diagnostics
}

function findDataCycle(document: GraphDocument, registry: Registry): string[] | null {
  const adjacent = new Map<string, string[]>()
  for (const node of document.nodes) adjacent.set(node.id, [])
  for (const edge of document.edges) {
    if (!isDataEdge(document, registry, edge)) continue
    adjacent.get(edge.targetNodeId)?.push(edge.sourceNodeId)
  }

  const color = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []

  const visit = (nodeId: string): string[] | null => {
    color.set(nodeId, 1)
    stack.push(nodeId)
    for (const next of adjacent.get(nodeId) ?? []) {
      const state = color.get(next) ?? 0
      if (state === 1) {
        const start = stack.indexOf(next)
        return stack.slice(start)
      }
      if (state === 0) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    color.set(nodeId, 2)
    return null
  }

  for (const node of document.nodes) {
    if ((color.get(node.id) ?? 0) === 0) {
      const found = visit(node.id)
      if (found) return found
    }
  }
  return null
}

function isDataEdge(document: GraphDocument, registry: Registry, edge: GraphEdge): boolean {
  const source = resolvePort(document, registry, edge.sourceNodeId, edge.sourcePortId)
  const target = resolvePort(document, registry, edge.targetNodeId, edge.targetPortId)
  return source?.kind === 'data' && target?.kind === 'data'
}
