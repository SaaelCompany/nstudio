export function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`
  return `${prefix}_${random}`
}

export const PLUGIN_ID = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]*)*$/
export const NODE_TYPE_ID = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]*)+$/
export const CATEGORY_ID = /^[a-z][a-z0-9_-]*$/
export const PORT_ID = /^[a-zA-Z][a-zA-Z0-9]*$/
export const EVENT_NAME = /^[a-z][a-z0-9_-]{0,40}$/
