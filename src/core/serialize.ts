import { DOCUMENT_VERSION } from './document'
import { EngineError } from './errors'
import { parseSceneProject } from './scene'
import type { GraphDocument, GraphEdge, GraphNode, GraphVariable, Value } from './types'

export function serializeDocument(document: GraphDocument): string {
  return JSON.stringify(document, null, 2)
}

export function deserializeDocument(raw: string): GraphDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new EngineError('Файл не является JSON')
  }
  if (!isRecord(parsed)) throw new EngineError('Документ должен быть объектом')
  if (parsed.version !== DOCUMENT_VERSION) {
    throw new EngineError(`Версия документа ${String(parsed.version)} не поддерживается. Ожидается ${DOCUMENT_VERSION}.`)
  }

  const nodes = expectArray(parsed.nodes, 'nodes').map(parseNode)
  const edges = expectArray(parsed.edges, 'edges').map(parseEdge)
  const variables = expectArray(parsed.variables, 'variables').map(parseVariable)
  assertUnique(nodes.map((node) => node.id), 'нод')
  assertUnique(edges.map((edge) => edge.id), 'связей')
  assertUnique(variables.map((variable) => variable.id), 'переменных')

  return {
    version: DOCUMENT_VERSION,
    id: expectString(parsed.id, 'id'),
    name: expectString(parsed.name, 'name'),
    nodes,
    edges,
    variables,
    extensions: parseExtensions(parsed.extensions),
    scenes: parseSceneProject(parsed.scenes),
  }
}

function parseNode(raw: unknown): GraphNode {
  if (!isRecord(raw)) throw new EngineError('Нода должна быть объектом')
  return {
    id: expectString(raw.id, 'node.id'),
    typeId: expectString(raw.typeId, 'node.typeId'),
    x: expectFinite(raw.x, 'node.x'),
    y: expectFinite(raw.y, 'node.y'),
    properties: parseValueMap(raw.properties, 'node.properties'),
    inputs: parseValueMap(raw.inputs, 'node.inputs'),
    extensions: parseExtensions(raw.extensions),
  }
}

function parseEdge(raw: unknown): GraphEdge {
  if (!isRecord(raw)) throw new EngineError('Связь должна быть объектом')
  return {
    id: expectString(raw.id, 'edge.id'),
    sourceNodeId: expectString(raw.sourceNodeId, 'edge.sourceNodeId'),
    sourcePortId: expectString(raw.sourcePortId, 'edge.sourcePortId'),
    targetNodeId: expectString(raw.targetNodeId, 'edge.targetNodeId'),
    targetPortId: expectString(raw.targetPortId, 'edge.targetPortId'),
  }
}

function parseVariable(raw: unknown): GraphVariable {
  if (!isRecord(raw)) throw new EngineError('Переменная должна быть объектом')
  return {
    id: expectString(raw.id, 'variable.id'),
    name: expectString(raw.name, 'variable.name'),
    dataType: expectString(raw.dataType, 'variable.dataType'),
    value: parseValue(raw.value, 'variable.value'),
  }
}

function parseValueMap(raw: unknown, label: string): Record<string, Value> {
  if (raw === undefined) return {}
  if (!isRecord(raw)) throw new EngineError(`${label} должен быть объектом`)
  const result: Record<string, Value> = {}
  for (const [key, value] of Object.entries(raw)) {
    result[key] = parseValue(value, `${label}.${key}`)
  }
  return result
}

function parseValue(raw: unknown, label: string): Value {
  if (!isRecord(raw)) throw new EngineError(`${label} должен быть значением { type, data }`)
  const type = expectString(raw.type, `${label}.type`)
  if (!isJsonValue(raw.data)) throw new EngineError(`${label}.data содержит неподдерживаемые данные`)
  return { type, data: raw.data }
}

function parseExtensions(raw: unknown): Record<string, unknown> {
  if (raw === undefined) return {}
  if (!isRecord(raw) || !isJsonValue(raw)) throw new EngineError('extensions должен быть JSON-объектом')
  return raw
}

function assertUnique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new EngineError(`В документе повторяются идентификаторы ${label}`)
  }
}

function expectArray(raw: unknown, label: string): unknown[] {
  if (!Array.isArray(raw)) throw new EngineError(`Поле ${label} должно быть массивом`)
  return raw
}

function expectString(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') throw new EngineError(`Поле ${label} должно быть непустой строкой`)
  return raw
}

function expectFinite(raw: unknown, label: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new EngineError(`Поле ${label} должно быть числом`)
  return raw
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown): boolean {
  if (value === null) return true
  const kind = typeof value
  if (kind === 'string' || kind === 'boolean') return true
  if (kind === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (isRecord(value)) return Object.values(value).every(isJsonValue)
  return false
}
