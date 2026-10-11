import type { DataTypeDefinition } from './types'

/** Concrete value that travels along a data wire. */
export interface Value {
  /** Registered data type id, for example "number". */
  type: string
  data: unknown
}

export function numberValue(data: number): Value {
  return { type: 'number', data }
}

export function stringValue(data: string): Value {
  return { type: 'string', data }
}

export function booleanValue(data: boolean): Value {
  return { type: 'boolean', data }
}

export function anyValue(data: unknown): Value {
  return { type: 'any', data }
}

export function cloneValue(value: Value): Value {
  return { type: value.type, data: structuredClone(value.data) }
}

export function asNumber(value: Value): number {
  const { data } = value
  if (typeof data === 'number') return data
  if (typeof data === 'boolean') return data ? 1 : 0
  if (typeof data === 'string' && data.trim() !== '') {
    const parsed = Number(data)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function isTruthy(value: Value): boolean {
  const { data } = value
  if (typeof data === 'boolean') return data
  if (typeof data === 'number') return data !== 0 && !Number.isNaN(data)
  if (typeof data === 'string') return data.length > 0
  return data != null
}

export function valuesEqual(left: Value, right: Value): boolean {
  if (typeof left.data === 'object' || typeof right.data === 'object') {
    return left.type === right.type && JSON.stringify(left.data) === JSON.stringify(right.data)
  }
  return Object.is(left.data, right.data)
}

export function formatValue(value: Value): string {
  const { data } = value
  if (data === null || data === undefined) return 'null'
  if (typeof data === 'string') return data
  if (typeof data === 'number' || typeof data === 'boolean') return String(data)
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

export function areTypesCompatible(
  sourceType: string,
  targetType: string,
  targetDefinition?: DataTypeDefinition,
): boolean {
  if (sourceType === targetType || sourceType === 'any' || targetType === 'any') return true
  return targetDefinition?.accepts?.includes(sourceType) ?? false
}
