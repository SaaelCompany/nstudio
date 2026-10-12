import type { Value } from './values'

export type { Value }

export type PortKind = 'exec' | 'data'
export type PortDirection = 'input' | 'output'
export type NodeRole = 'event' | 'exec' | 'pure' | 'inert'
export type DiagnosticLevel = 'error' | 'warning'
export type PropertyWidget = 'default' | 'variable' | 'text'

export interface CategoryDefinition {
  id: string
  label: string
  color: string
}

export interface DataTypeDefinition {
  id: string
  label: string
  color: string
  defaultValue: () => Value
  /** Extra source types this type accepts. Exact matches and "any" are always allowed. */
  accepts?: string[]
}

export interface PortDefinition {
  id: string
  label: string
  kind: PortKind
  /** Required for data ports. Exec ports leave this empty. */
  dataType?: string
}

export interface PropertyOption {
  value: string
  label: string
}

export interface PropertyDefinition {
  id: string
  label: string
  dataType: string
  defaultValue: Value
  options?: PropertyOption[]
  /** Editor hint. The core stores the value either way. */
  widget?: PropertyWidget
}

/**
 * Context passed to pure and executable nodes.
 * Pure nodes may only read inputs and write outputs.
 * Calling trigger, setVariable, or log from a pure node is a plugin bug.
 */
export interface EvaluationContext {
  getInput(portId: string): Value
  setOutput(portId: string, value: Value): void
  getProperty(propertyId: string): Value
  getVariable(name: string): Value
  setVariable(name: string, value: Value): void
  /** Fire an exec output. Returns false when the runtime has stopped. */
  trigger(outputPortId: string): boolean
  log(message: string): void
  report(diagnostic: DiagnosticInput): void
  /** Opaque bag supplied by the host for this event, for example `{ dt }`. */
  readonly payload: Readonly<Record<string, unknown>>
}

export interface NodeTypeDefinition {
  id: string
  title: string
  category: string
  description: string
  role: NodeRole
  /** Event name that wakes this node. Required for role "event". */
  event?: string
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  properties: PropertyDefinition[]
  compute?: (ctx: EvaluationContext) => void
  execute?: (ctx: EvaluationContext) => void
}

export interface EnginePlugin {
  id: string
  name: string
  version: string
  description?: string
  register(api: PluginApi): void
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description?: string
}

export type SceneValue = string | number | boolean | null

export interface SceneField {
  id: string
  label: string
  kind: 'text' | 'number' | 'color' | 'select'
  options?: PropertyOption[]
}

/** A placeable object kind contributed by a plugin. Instances copy its defaults. */
export interface SceneObjectKind {
  id: string
  title: string
  description: string
  defaultWidth: number
  defaultHeight: number
  defaultProps: Record<string, SceneValue>
  fields: SceneField[]
}

/** Visual treatment drawn on one instance. `filter` is preview-only and is not saved. */
export interface EffectDefinition {
  id: string
  title: string
  description: string
  fields: SceneField[]
  defaultProps: Record<string, SceneValue>
  filter?: (props: Record<string, SceneValue>) => string
}

/**
 * Data attached to an object type. The core stores it and does not run a game loop.
 * A later module reads the values and applies the behavior.
 */
export interface BehaviorDefinition {
  id: string
  title: string
  description: string
  fields: SceneField[]
  defaultProps: Record<string, SceneValue>
}

/** One attached effect or behavior. The kind id points at a registered module. */
export interface SceneModule {
  id: string
  kind: string
  props: Record<string, SceneValue>
}

export interface SceneObjectType {
  id: string
  name: string
  kind: string
  defaults: Record<string, SceneValue>
  behaviors: SceneModule[]
}

export interface SceneLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
}

export interface SceneInstance {
  id: string
  typeId: string
  layerId: string
  name: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  opacity: number
  props: Record<string, SceneValue>
  effects: SceneModule[]
}

export interface Scene {
  id: string
  name: string
  width: number
  height: number
  background: string
  layers: SceneLayer[]
  instances: SceneInstance[]
  /** Event sheet for this layout. The document mirrors the active scene. */
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface SceneProject {
  activeSceneId: string
  activeLayerId: string
  objectTypes: SceneObjectType[]
  scenes: Scene[]
}

export interface PluginApi {
  registerCategory(category: CategoryDefinition): void
  registerDataType(dataType: DataTypeDefinition): void
  registerNodeType(nodeType: NodeTypeDefinition): void
  registerSceneObject(kind: SceneObjectKind): void
  registerEffect(effect: EffectDefinition): void
  registerBehavior(behavior: BehaviorDefinition): void
}

export interface GraphNode {
  id: string
  typeId: string
  x: number
  y: number
  properties: Record<string, Value>
  /** Inline values used when a data input has no wire. */
  inputs: Record<string, Value>
  /** Opaque plugin storage. The core round-trips this without interpreting it. */
  extensions: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
}

export interface GraphVariable {
  id: string
  name: string
  dataType: string
  value: Value
}

export interface GraphDocument {
  version: 1
  id: string
  name: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  variables: GraphVariable[]
  /** Opaque plugin storage keyed by plugin id. */
  extensions: Record<string, unknown>
  /** Layouts shown in the scene editor. */
  scenes: SceneProject
}

export interface Diagnostic {
  level: DiagnosticLevel
  code: string
  message: string
  nodeId?: string
  edgeId?: string
}

export type DiagnosticInput = Omit<Diagnostic, 'level'> & { level?: DiagnosticLevel }

export interface LogEntry {
  level: 'info' | 'error'
  message: string
}

export interface VariableSnapshot {
  name: string
  dataType: string
  value: Value
}

export interface RunOptions {
  event?: string
  payload?: Record<string, unknown>
  maxSteps?: number
  /**
   * Skip the document check. The runtime still refuses data cycles and runaway
   * exec loops. Hosts that just validated can set this to avoid doing it twice.
   */
  skipValidation?: boolean
}

export interface RunResult {
  ok: boolean
  logs: LogEntry[]
  diagnostics: Diagnostic[]
  variables: VariableSnapshot[]
}

export interface ResolvedPort extends PortDefinition {
  direction: PortDirection
  node: GraphNode
  definition: NodeTypeDefinition
}
