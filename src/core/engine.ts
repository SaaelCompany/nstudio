import { corePlugin } from './builtins'
import { createBlankDocument, createDemoDocument } from './sample'
import { createDocument } from './document'
import { Registry } from './registry'
import { runDocument } from './runtime'
import { deserializeDocument, serializeDocument } from './serialize'
import type { EnginePlugin, GraphDocument, PluginInfo, RunOptions, RunResult } from './types'
import { validateDocument } from './validate'

export interface EngineOptions {
  /** Core types and nodes. Turn off only in tests that want an empty registry. */
  loadCore?: boolean
}

/** Facade plugins and the editor talk to. */
export class Engine {
  readonly registry = new Registry()

  constructor(options: EngineOptions = {}) {
    if (options.loadCore !== false) this.use(corePlugin)
  }

  use(plugin: EnginePlugin): void {
    this.registry.beginPlugin(plugin)
    try {
      plugin.register(this.registry.api)
      this.registry.commitPlugin(plugin)
    } catch (error) {
      this.registry.rollbackPlugin()
      throw error
    }
  }

  listPlugins(): PluginInfo[] {
    return this.registry.listPlugins()
  }

  createDocument(name?: string): GraphDocument {
    return createDocument(name)
  }

  createBlankDocument(): GraphDocument {
    return createBlankDocument(this.registry)
  }

  createDemoDocument(): GraphDocument {
    return createDemoDocument(this.registry)
  }

  validate(document: GraphDocument): ReturnType<typeof validateDocument> {
    return validateDocument(document, this.registry)
  }

  run(document: GraphDocument, options?: RunOptions): RunResult {
    return runDocument(document, this.registry, options)
  }

  serialize(document: GraphDocument): string {
    return serializeDocument(document)
  }

  deserialize(raw: string): GraphDocument {
    return deserializeDocument(raw)
  }
}
