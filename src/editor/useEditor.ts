import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activeScene,
  addNode,
  addObjectType,
  addVariable,
  connectNodes,
  createNode,
  disconnectPort,
  duplicateInstances,
  Engine,
  placeInstance,
  removeEdges,
  removeInstances,
  removeNodes,
  removeVariable,
  setDocumentName,
  setNodeInput,
  setNodeProperty,
  updateInstances,
  updateVariable,
} from '../core'
import type { Diagnostic, GraphDocument, LogEntry, RunResult, SceneValue, Value, VariableSnapshot } from '../core'
import { notePlugin } from '../example-plugin'
import type { Viewport } from './geometry'

const DOCUMENT_KEY = 'nstudio.document.v1'
const VIEWPORT_KEY = 'nstudio.viewport.v1'
const SCENE_VIEWPORT_KEY = 'nstudio.sceneViewport.v1'

export type EditorMode = 'scene' | 'nodes'

export interface EditorState {
  document: GraphDocument
  past: GraphDocument[]
  future: GraphDocument[]
  viewport: Viewport
  sceneViewport: Viewport
  mode: EditorMode
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedInstanceIds: string[]
  gridEnabled: boolean
  snapEnabled: boolean
  gridSize: number
  logs: LogEntry[]
  diagnostics: Diagnostic[]
  variables: VariableSnapshot[]
  notice: string | null
  pluginEpoch: number
  runEvent: string
  ran: boolean
}

function loadDocument(engine: Engine): GraphDocument {
  try {
    const raw = localStorage.getItem(DOCUMENT_KEY)
    if (raw) return engine.deserialize(raw)
  } catch {
    // A damaged autosave should not block the editor.
  }
  return engine.createDemoDocument()
}

function loadViewport(key: string): Viewport {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { x: 48, y: 40, zoom: 1 }
    const parsed = JSON.parse(raw) as Partial<Viewport>
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.zoom === 'number') {
      return { x: parsed.x, y: parsed.y, zoom: parsed.zoom }
    }
  } catch {
    // Ignore a damaged viewport and use the default frame.
  }
  return { x: 48, y: 40, zoom: 1 }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

export function useEditor() {
  const engineRef = useRef<Engine | null>(null)
  if (!engineRef.current) engineRef.current = new Engine()
  const engine = engineRef.current
  const editOrigin = useRef<GraphDocument | null>(null)
  const dragOrigin = useRef<GraphDocument | null>(null)

  const [state, setState] = useState<EditorState>(() => ({
    document: loadDocument(engine),
    past: [],
    future: [],
    viewport: loadViewport(VIEWPORT_KEY),
    sceneViewport: loadViewport(SCENE_VIEWPORT_KEY),
    mode: 'scene',
    selectedNodeIds: [],
    selectedEdgeIds: [],
    selectedInstanceIds: [],
    gridEnabled: true,
    snapEnabled: true,
    gridSize: 32,
    logs: [],
    diagnostics: [],
    variables: [],
    notice: null,
    pluginEpoch: 0,
    runEvent: 'start',
    ran: false,
  }))
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(DOCUMENT_KEY, engine.serialize(state.document))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [engine, state.document])

  useEffect(() => {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify(state.viewport))
  }, [state.viewport])

  useEffect(() => {
    localStorage.setItem(SCENE_VIEWPORT_KEY, JSON.stringify(state.sceneViewport))
  }, [state.sceneViewport])

  const reset = useCallback((document: GraphDocument) => {
    editOrigin.current = null
    dragOrigin.current = null
    setState((current) => ({
      ...current,
      document,
      past: [],
      future: [],
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedInstanceIds: [],
      logs: [],
      diagnostics: [],
      variables: [],
      notice: null,
      runEvent: 'start',
      ran: false,
    }))
  }, [])

  const undo = useCallback(() => {
    setState((current) => {
      const previous = current.past.at(-1)
      if (!previous) return current
      return {
        ...current,
        past: current.past.slice(0, -1),
        future: [current.document, ...current.future],
        document: previous,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedInstanceIds: [],
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState((current) => {
      const next = current.future[0]
      if (!next) return current
      return {
        ...current,
        past: [...current.past, current.document],
        future: current.future.slice(1),
        document: next,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedInstanceIds: [],
      }
    })
  }, [])

  const setViewport = useCallback((viewport: Viewport) => {
    setState((current) => ({ ...current, viewport }))
  }, [])

  const setSceneViewport = useCallback((sceneViewport: Viewport) => {
    setState((current) => ({ ...current, sceneViewport }))
  }, [])

  const select = useCallback((selectedNodeIds: string[], selectedEdgeIds: string[]) => {
    setState((current) => ({ ...current, selectedNodeIds, selectedEdgeIds }))
  }, [])

  const selectInstances = useCallback((selectedInstanceIds: string[]) => {
    setState((current) => ({ ...current, selectedInstanceIds }))
  }, [])

  const previewDocument = useCallback((document: GraphDocument) => {
    setState((current) => {
      if (!dragOrigin.current) dragOrigin.current = current.document
      return { ...current, document }
    })
  }, [])

  const commitDrag = useCallback(() => {
    const origin = dragOrigin.current
    dragOrigin.current = null
    if (!origin) return
    setState((current) => {
      if (JSON.stringify(origin) === JSON.stringify(current.document)) return current
      return { ...current, past: [...current.past, origin].slice(-100), future: [] }
    })
  }, [])

  const endEdit = useCallback(() => {
    const origin = editOrigin.current
    editOrigin.current = null
    if (!origin) return
    setState((current) => {
      if (JSON.stringify(origin) === JSON.stringify(current.document)) return current
      return { ...current, past: [...current.past, origin].slice(-100), future: [] }
    })
  }, [])

  const changeField = useCallback(
    (produce: (document: GraphDocument) => GraphDocument, mode: 'preview' | 'commit') => {
      setState((current) => {
        try {
          const next = produce(current.document)
          if (mode === 'preview') {
            if (!editOrigin.current) editOrigin.current = current.document
            return { ...current, document: next, notice: null }
          }
          const origin = editOrigin.current
          editOrigin.current = null
          const base = origin ?? current.document
          if (JSON.stringify(base) === JSON.stringify(next)) return { ...current, document: next, notice: null }
          return {
            ...current,
            document: next,
            past: [...current.past, base].slice(-100),
            future: [],
            notice: null,
          }
        } catch (error) {
          return { ...current, notice: messageOf(error) }
        }
      })
    },
    [],
  )

  const addNodeAt = useCallback(
    (typeId: string, x: number, y: number) => {
      setState((current) => {
        try {
          const node = createNode(engine.registry, typeId, x, y)
          return {
            ...current,
            past: [...current.past, current.document].slice(-100),
            future: [],
            document: addNode(current.document, node),
            selectedNodeIds: [node.id],
            selectedEdgeIds: [],
            notice: null,
          }
        } catch (error) {
          return { ...current, notice: messageOf(error) }
        }
      })
    },
    [engine],
  )

  const connect = useCallback(
    (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => {
      setState((current) => {
        const result = connectNodes(current.document, engine.registry, fromNodeId, fromPortId, toNodeId, toPortId)
        if (!result.ok) return { ...current, notice: result.diagnostic?.message ?? 'Не удалось соединить' }
        const edge = result.document.edges.at(-1)
        return {
          ...current,
          past: [...current.past, current.document].slice(-100),
          future: [],
          document: result.document,
          selectedNodeIds: [],
          selectedEdgeIds: edge ? [edge.id] : [],
          notice: null,
        }
      })
    },
    [engine],
  )

  const disconnect = useCallback((nodeId: string, portId: string) => {
    setState((current) => {
      const next = disconnectPort(current.document, nodeId, portId)
      if (next.edges.length === current.document.edges.length) return current
      return {
        ...current,
        past: [...current.past, current.document].slice(-100),
        future: [],
        document: next,
        notice: null,
      }
    })
  }, [])

  const deleteSelection = useCallback(() => {
    setState((current) => {
      if (current.mode === 'scene') {
        if (current.selectedInstanceIds.length === 0) return current
        const scene = activeScene(current.document)
        return {
          ...current,
          past: [...current.past, current.document].slice(-100),
          future: [],
          document: removeInstances(current.document, scene.id, current.selectedInstanceIds),
          selectedInstanceIds: [],
          notice: null,
        }
      }
      if (current.selectedNodeIds.length === 0 && current.selectedEdgeIds.length === 0) return current
      const withoutNodes = removeNodes(current.document, current.selectedNodeIds)
      const next = removeEdges(withoutNodes, current.selectedEdgeIds)
      return {
        ...current,
        past: [...current.past, current.document].slice(-100),
        future: [],
        document: next,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        notice: null,
      }
    })
  }, [])

  const duplicateInstancesSelection = useCallback(() => {
    setState((current) => {
      if (current.mode !== 'scene' || current.selectedInstanceIds.length === 0) return current
      try {
        const scene = activeScene(current.document)
        const duplicated = duplicateInstances(current.document, scene.id, current.selectedInstanceIds)
        if (duplicated.instanceIds.length === 0) return current
        return {
          ...current,
          past: [...current.past, current.document].slice(-100),
          future: [],
          document: duplicated.document,
          selectedInstanceIds: duplicated.instanceIds,
          notice: null,
        }
      } catch (error) {
        return { ...current, notice: messageOf(error) }
      }
    })
  }, [])

  const nudgeInstances = useCallback((dx: number, dy: number) => {
    setState((current) => {
      if (current.selectedInstanceIds.length === 0) return current
      try {
        const scene = activeScene(current.document)
        const locked = new Set(scene.layers.filter((layer) => layer.locked).map((layer) => layer.id))
        const movable = new Set(
          scene.instances
            .filter((instance) => current.selectedInstanceIds.includes(instance.id) && !locked.has(instance.layerId))
            .map((instance) => instance.id),
        )
        if (movable.size === 0) return current
        const next = updateInstances(current.document, scene.id, (instance) =>
          movable.has(instance.id) ? { x: instance.x + dx, y: instance.y + dy } : null,
        )
        if (JSON.stringify(next) === JSON.stringify(current.document)) return current
        return {
          ...current,
          past: [...current.past, current.document].slice(-100),
          future: [],
          document: next,
          notice: null,
        }
      } catch (error) {
        return { ...current, notice: messageOf(error) }
      }
    })
  }, [])

  const placeType = useCallback(
    (typeId: string, x: number, y: number) => {
      setState((current) => {
        try {
          const type = current.document.scenes.objectTypes.find((item) => item.id === typeId)
          const kind = type ? engine.registry.getSceneObject(type.kind) : undefined
          const placed = placeInstance(current.document, typeId, x, y, {
            width: kind?.defaultWidth,
            height: kind?.defaultHeight,
          })
          return finishPlace(current, placed.document, placed.instanceId)
        } catch (error) {
          return { ...current, notice: messageOf(error) }
        }
      })
    },
    [engine],
  )

  const createFromKind = useCallback(
    (kindId: string, x: number, y: number, defaults?: Record<string, SceneValue>) => {
      setState((current) => {
        try {
          const kind = engine.registry.getSceneObject(kindId)
          if (!kind) return { ...current, notice: `Объект «${kindId}» не зарегистрирован` }
          const added = addObjectType(current.document, kind, undefined, defaults)
          const placed = placeInstance(added.document, added.typeId, x, y, {
            width: kind.defaultWidth,
            height: kind.defaultHeight,
          })
          return finishPlace(current, placed.document, placed.instanceId)
        } catch (error) {
          return { ...current, notice: messageOf(error) }
        }
      })
    },
    [engine],
  )

  const run = useCallback(() => {
    const current = stateRef.current
    const result: RunResult = engine.run(current.document, { event: current.runEvent })
    const error = result.diagnostics.find((diagnostic) => diagnostic.level === 'error')
    setState((latest) => ({
      ...latest,
      logs: result.logs,
      diagnostics: result.diagnostics,
      variables: result.variables,
      ran: true,
      notice: error?.message ?? null,
    }))
  }, [engine])

  const loadExamplePlugin = useCallback(() => {
    try {
      engine.use(notePlugin)
      setState((current) => ({
        ...current,
        pluginEpoch: current.pluginEpoch + 1,
        notice: 'Плагин «Заметки» подключён. Нода появилась в палитре.',
      }))
    } catch (error) {
      setState((current) => ({ ...current, notice: messageOf(error) }))
    }
  }, [engine])

  const save = useCallback(() => {
    const document = stateRef.current.document
    const blob = new Blob([engine.serialize(document)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${slug(document.name)}.nstudio.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [engine])

  const openText = useCallback(
    (raw: string) => {
      try {
        reset(engine.deserialize(raw))
      } catch (error) {
        setState((current) => ({ ...current, notice: messageOf(error) }))
      }
    },
    [engine, reset],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      const typing = target instanceof Element && Boolean(target.closest('input, textarea, select'))
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        save()
        return
      }
      if (meta && event.key === 'Enter') {
        event.preventDefault()
        run()
        return
      }
      if (typing) return
      const current = stateRef.current
      if (current.mode === 'scene' && meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateInstancesSelection()
        return
      }
      if (current.mode === 'scene' && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        const step = event.shiftKey ? current.gridSize : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        nudgeInstances(dx, dy)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelection, duplicateInstancesSelection, nudgeInstances, redo, run, save, undo])

  const events = uniqueEvents(state.document, engine)

  return {
    engine,
    state,
    events,
    exampleLoaded: engine.listPlugins().some((plugin) => plugin.id === notePlugin.id),
    setViewport,
    setSceneViewport,
    setMode: (mode: EditorMode) => setState((current) => ({ ...current, mode })),
    setGridEnabled: (gridEnabled: boolean) => setState((current) => ({ ...current, gridEnabled })),
    setSnapEnabled: (snapEnabled: boolean) => setState((current) => ({ ...current, snapEnabled })),
    setGridSize: (gridSize: number) =>
      setState((current) => ({ ...current, gridSize: Math.min(256, Math.max(1, Math.round(gridSize))) })),
    select,
    selectInstances,
    previewDocument,
    commitDrag,
    endEdit,
    editDocument: changeField,
    notify: (notice: string | null) => setState((current) => ({ ...current, notice })),
    placeType,
    createFromKind,
    undo,
    redo,
    addNodeAt,
    connect,
    disconnect,
    deleteSelection,
    run,
    setRunEvent: (runEvent: string) => setState((current) => ({ ...current, runEvent })),
    renameDocument: (name: string) => changeField((document) => setDocumentName(document, name), 'commit'),
    changeProperty: (nodeId: string, propertyId: string, value: Value, mode: 'preview' | 'commit') =>
      changeField((document) => setNodeProperty(document, nodeId, propertyId, value), mode),
    changeInput: (nodeId: string, portId: string, value: Value, mode: 'preview' | 'commit') =>
      changeField((document) => setNodeInput(document, nodeId, portId, value), mode),
    addVariable: (dataType = 'number') =>
      changeField((document) => addVariable(document, engine.registry, { dataType }), 'commit'),
    updateVariable: (variableId: string, patch: Parameters<typeof updateVariable>[2]) =>
      changeField((document) => updateVariable(document, variableId, patch, engine.registry), 'commit'),
    removeVariable: (variableId: string) => changeField((document) => removeVariable(document, variableId), 'commit'),
    newDocument: () => reset(engine.createBlankDocument()),
    loadDemo: () => reset(engine.createDemoDocument()),
    loadExamplePlugin,
    save,
    openText,
  }
}

function finishPlace(current: EditorState, document: GraphDocument, instanceId: string): EditorState {
  const scene = activeScene(document)
  const layer = scene.layers.find((item) => item.id === document.scenes.activeLayerId)
  return {
    ...current,
    past: [...current.past, current.document].slice(-100),
    future: [],
    document,
    selectedInstanceIds: [instanceId],
    notice: layer && !layer.visible ? 'Объект создан на скрытом слое' : null,
  }
}

function uniqueEvents(document: GraphDocument, engine: Engine): string[] {
  const events = new Set<string>()
  for (const node of document.nodes) {
    const event = engine.registry.getNodeType(node.typeId)?.event
    if (event) events.add(event)
  }
  if (!events.has('start')) events.add('start')
  return [...events]
}

function slug(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
  return cleaned || 'project'
}
