import { EngineError } from './errors'
import { createId } from './ids'
import type { Registry } from './registry'
import type { Diagnostic, GraphDocument, GraphEdge, GraphNode, GraphVariable, ResolvedPort, Value } from './types'
import { areTypesCompatible, cloneValue } from './values'

export const DOCUMENT_VERSION = 1 as const

export function createDocument(name = 'Без названия'): GraphDocument {
  return {
    version: DOCUMENT_VERSION,
    id: createId('doc'),
    name,
    nodes: [],
    edges: [],
    variables: [],
    extensions: {},
  }
}

export function createNode(
  registry: Registry,
  typeId: string,
  x: number,
  y: number,
  id = createId('node'),
): GraphNode {
  const definition = registry.getNodeType(typeId)
  if (!definition) throw new EngineError(`Неизвестный тип ноды «${typeId}»`)
  const properties: Record<string, Value> = {}
  for (const property of definition.properties) {
    properties[property.id] = cloneValue(property.defaultValue)
  }
  const inputs: Record<string, Value> = {}
  for (const port of definition.inputs) {
    if (port.kind === 'data' && port.dataType) {
      inputs[port.id] = registry.requireDataType(port.dataType).defaultValue()
    }
  }
  return { id, typeId, x, y, properties, inputs, extensions: {} }
}

export function addNode(document: GraphDocument, node: GraphNode): GraphDocument {
  if (document.nodes.some((item) => item.id === node.id)) {
    throw new EngineError(`Нода «${node.id}» уже есть в документе`)
  }
  return { ...document, nodes: [...document.nodes, node] }
}

export function moveNodes(
  document: GraphDocument,
  positions: Record<string, { x: number; y: number }>,
): GraphDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      const next = positions[node.id]
      return next ? { ...node, x: next.x, y: next.y } : node
    }),
  }
}

export function removeNodes(document: GraphDocument, nodeIds: readonly string[]): GraphDocument {
  const removed = new Set(nodeIds)
  return {
    ...document,
    nodes: document.nodes.filter((node) => !removed.has(node.id)),
    edges: document.edges.filter((edge) => !removed.has(edge.sourceNodeId) && !removed.has(edge.targetNodeId)),
  }
}

export function setDocumentName(document: GraphDocument, name: string): GraphDocument {
  return { ...document, name }
}

export function setNodeProperty(
  document: GraphDocument,
  nodeId: string,
  propertyId: string,
  value: Value,
): GraphDocument {
  return mapNode(document, nodeId, (node) => ({
    ...node,
    properties: { ...node.properties, [propertyId]: cloneValue(value) },
  }))
}

export function setNodeInput(
  document: GraphDocument,
  nodeId: string,
  portId: string,
  value: Value,
): GraphDocument {
  return mapNode(document, nodeId, (node) => ({
    ...node,
    inputs: { ...node.inputs, [portId]: cloneValue(value) },
  }))
}

export interface ConnectResult {
  ok: boolean
  document: GraphDocument
  diagnostic?: Diagnostic
}

export function connectNodes(
  document: GraphDocument,
  registry: Registry,
  fromNodeId: string,
  fromPortId: string,
  toNodeId: string,
  toPortId: string,
): ConnectResult {
  const from = resolvePort(document, registry, fromNodeId, fromPortId)
  const to = resolvePort(document, registry, toNodeId, toPortId)
  if (!from || !to) {
    return reject(document, 'missing-port', 'Не удалось найти порт для соединения')
  }

  let source = from
  let target = to
  if (from.direction === 'input' && to.direction === 'output') {
    source = to
    target = from
  }
  if (source.direction !== 'output' || target.direction !== 'input') {
    return reject(document, 'port-direction', 'Соединять можно только выход со входом')
  }
  if (source.node.id === target.node.id) {
    return reject(document, 'same-node', 'Нельзя соединить ноду саму с собой', source.node.id)
  }
  if (source.kind !== target.kind) {
    return reject(document, 'kind-mismatch', 'Нельзя соединить поток выполнения с данными', target.node.id)
  }
  if (source.kind === 'data') {
    const sourceType = source.dataType ?? 'any'
    const targetType = target.dataType ?? 'any'
    const compatible = areTypesCompatible(sourceType, targetType, registry.getDataType(targetType))
    if (!compatible) {
      const sourceLabel = registry.getDataType(sourceType)?.label ?? sourceType
      const targetLabel = registry.getDataType(targetType)?.label ?? targetType
      return reject(
        document,
        'type-mismatch',
        `Тип «${sourceLabel}» не подходит ко входу типа «${targetLabel}»`,
        target.node.id,
      )
    }
  }

  const duplicate = document.edges.some(
    (edge) =>
      edge.sourceNodeId === source.node.id &&
      edge.sourcePortId === source.id &&
      edge.targetNodeId === target.node.id &&
      edge.targetPortId === target.id,
  )
  if (duplicate) return { ok: true, document }

  // Data inputs stay single-wire. Exec inputs can gather several wires: the node runs once per signal.
  const edges =
    target.kind === 'data'
      ? document.edges.filter((edge) => !(edge.targetNodeId === target.node.id && edge.targetPortId === target.id))
      : document.edges
  const edge: GraphEdge = {
    id: createId('edge'),
    sourceNodeId: source.node.id,
    sourcePortId: source.id,
    targetNodeId: target.node.id,
    targetPortId: target.id,
  }
  return { ok: true, document: { ...document, edges: [...edges, edge] } }
}

export function removeEdges(document: GraphDocument, edgeIds: readonly string[]): GraphDocument {
  const removed = new Set(edgeIds)
  return { ...document, edges: document.edges.filter((edge) => !removed.has(edge.id)) }
}

export function disconnectPort(document: GraphDocument, nodeId: string, portId: string): GraphDocument {
  return {
    ...document,
    edges: document.edges.filter(
      (edge) =>
        !(edge.sourceNodeId === nodeId && edge.sourcePortId === portId) &&
        !(edge.targetNodeId === nodeId && edge.targetPortId === portId),
    ),
  }
}

export function addVariable(
  document: GraphDocument,
  registry: Registry,
  partial?: { name?: string; dataType?: string },
): GraphDocument {
  const dataType = partial?.dataType ?? 'number'
  if (!registry.getDataType(dataType)) throw new EngineError(`Неизвестный тип данных «${dataType}»`)
  const name = uniqueName(document, partial?.name?.trim() || 'переменная')
  const variable: GraphVariable = {
    id: createId('var'),
    name,
    dataType,
    value: registry.requireDataType(dataType).defaultValue(),
  }
  return { ...document, variables: [...document.variables, variable] }
}

export function updateVariable(
  document: GraphDocument,
  variableId: string,
  patch: Partial<Pick<GraphVariable, 'name' | 'dataType' | 'value'>>,
  registry?: Registry,
): GraphDocument {
  const current = document.variables.find((variable) => variable.id === variableId)
  if (!current) throw new EngineError('Переменная не найдена')
  let name = current.name
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim()
    if (!trimmed) throw new EngineError('Имя переменной не может быть пустым')
    const taken = document.variables.some((variable) => variable.id !== variableId && variable.name === trimmed)
    if (taken) throw new EngineError(`Переменная «${trimmed}» уже есть`)
    name = trimmed
  }
  let dataType = patch.dataType ?? current.dataType
  let value = patch.value ? cloneValue(patch.value) : current.value
  if (patch.dataType && patch.dataType !== current.dataType) {
    if (registry && !registry.getDataType(patch.dataType)) {
      throw new EngineError(`Неизвестный тип данных «${patch.dataType}»`)
    }
    if (value.type !== patch.dataType) {
      value = registry ? registry.requireDataType(patch.dataType).defaultValue() : value
    }
    dataType = patch.dataType
  }
  if (value.type !== dataType && dataType !== 'any' && value.type !== 'any') {
    throw new EngineError(`Значение переменной «${name}» не совпадает с типом «${dataType}»`)
  }
  return {
    ...document,
    variables: document.variables.map((variable) =>
      variable.id === variableId ? { ...variable, name, dataType, value } : variable,
    ),
  }
}

export function removeVariable(document: GraphDocument, variableId: string): GraphDocument {
  return { ...document, variables: document.variables.filter((variable) => variable.id !== variableId) }
}

export function resolvePort(
  document: GraphDocument,
  registry: Registry,
  nodeId: string,
  portId: string,
): ResolvedPort | null {
  const node = document.nodes.find((item) => item.id === nodeId)
  if (!node) return null
  const definition = registry.getNodeType(node.typeId)
  if (!definition) return null
  const input = definition.inputs.find((port) => port.id === portId)
  if (input) return { ...input, direction: 'input', node, definition }
  const output = definition.outputs.find((port) => port.id === portId)
  if (output) return { ...output, direction: 'output', node, definition }
  return null
}

export function findNode(document: GraphDocument, nodeId: string): GraphNode | undefined {
  return document.nodes.find((node) => node.id === nodeId)
}

function mapNode(document: GraphDocument, nodeId: string, mapper: (node: GraphNode) => GraphNode): GraphDocument {
  if (!document.nodes.some((node) => node.id === nodeId)) {
    throw new EngineError(`Нода «${nodeId}» не найдена`)
  }
  return { ...document, nodes: document.nodes.map((node) => (node.id === nodeId ? mapper(node) : node)) }
}

function uniqueName(document: GraphDocument, base: string): string {
  const names = new Set(document.variables.map((variable) => variable.name))
  if (!names.has(base)) return base
  let index = 2
  while (names.has(`${base}_${index}`)) index += 1
  return `${base}_${index}`
}

function reject(document: GraphDocument, code: string, message: string, nodeId?: string): ConnectResult {
  return { ok: false, document, diagnostic: { level: 'error', code, message, nodeId } }
}
