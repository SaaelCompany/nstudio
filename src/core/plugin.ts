import type { EnginePlugin } from './types'

/** Identity helper so a plugin object is checked against the public type. */
export function definePlugin(plugin: EnginePlugin): EnginePlugin {
  return plugin
}
