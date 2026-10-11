import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { areTypesCompatible, resolvePort } from '../core'
import type { Engine, GraphDocument, Value } from '../core'
import { frameNodes, screenToWorld, wirePath, zoomAt } from './geometry'
import type { Point, Viewport } from './geometry'
import { NodeCard } from './NodeCard'
import { NodeTypeList } from './NodeTypeList'

interface CanvasProps {
  engine: Engine
  document: GraphDocument
  viewport: Viewport
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  onViewport: (viewport: Viewport) => void
  onSelect: (nodeIds: string[], edgeIds: string[]) => void
  onPreviewDocument: (document: GraphDocument) => void
  onCommitDrag: () => void
  onConnect: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => void
  onDisconnect: (nodeId: string, portId: string) => void
  onAddNode: (typeId: string, x: number, y: number) => void
  onDeleteSelection: () => void
  onChangeProperty: (nodeId: string, propertyId: string, value: Value, mode: 'preview' | 'commit') => void
  onChangeInput: (nodeId: string, portId: string, value: Value, mode: 'preview' | 'commit') => void
  onEditEnd: () => void
}

interface LinkDraft {
  nodeId: string
  portId: string
  from: Point
  to: Point
}

type MenuState =
  | { kind: 'add'; x: number; y: number; worldX: number; worldY: number }
  | { kind: 'node'; x: number; y: number; nodeId: string }
  | null

type Gesture =
  | { type: 'pan'; pointerId: number; startX: number; startY: number; origin: Viewport }
  | {
      type: 'move'
      pointerId: number
      startX: number
      startY: number
      origin: GraphDocument
      positions: Record<string, Point>
    }
  | { type: 'link'; pointerId: number; nodeId: string; portId: string }

export function Canvas(props: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const portElements = useRef(new Map<string, HTMLButtonElement>())
  const gesture = useRef<Gesture | null>(null)
  const viewportRef = useRef(props.viewport)
  const documentRef = useRef(props.document)
  viewportRef.current = props.viewport
  documentRef.current = props.document
  const [anchors, setAnchors] = useState<Record<string, Point>>({})
  const [draft, setDraft] = useState<LinkDraft | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const didFrame = useRef(false)

  const registerPort = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) portElements.current.set(key, element)
    else portElements.current.delete(key)
  }, [])

  const measure = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const next: Record<string, Point> = {}
    for (const [key, element] of portElements.current) {
      const rect = element.getBoundingClientRect()
      next[key] = {
        x: rect.left + rect.width / 2 - bounds.left,
        y: rect.top + rect.height / 2 - bounds.top,
      }
    }
    setAnchors(next)
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, props.document, props.viewport, props.selectedNodeIds, props.selectedEdgeIds, menu])

  useLayoutEffect(() => {
    if (didFrame.current) return
    didFrame.current = true
    try {
      if (localStorage.getItem('nstudio.viewport.v1')) return
    } catch {
      return
    }
    const canvas = canvasRef.current
    if (!canvas || propsRef.current.document.nodes.length === 0) return
    propsRef.current.onViewport(frameNodes(propsRef.current.document.nodes, canvas.clientWidth, canvas.clientHeight))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [measure])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('.menu, .overlay')) return
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()
      const focal = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const current = viewportRef.current
      props.onViewport(zoomAt(current, focal, current.zoom * Math.exp(-event.deltaY * 0.0014)))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [props])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    return {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.interactive, input, textarea, select, .menu, .overlay')) return
    if (event.button === 1) {
      beginPan(event)
      return
    }
    if (event.button !== 0) return

    const port = target.closest<HTMLElement>('.port')
    if (port?.dataset.nodeId && port.dataset.portId) {
      if (event.altKey) {
        props.onDisconnect(port.dataset.nodeId, port.dataset.portId)
        return
      }
      beginLink(event, port.dataset.nodeId, port.dataset.portId)
      return
    }

    const node = target.closest<HTMLElement>('.node')
    if (node?.dataset.nodeId) {
      beginMove(event, node.dataset.nodeId)
      return
    }

    const edge = target.closest<SVGElement>('[data-edge-id]')
    if (edge?.dataset.edgeId) {
      props.onSelect([], event.shiftKey ? [...props.selectedEdgeIds, edge.dataset.edgeId] : [edge.dataset.edgeId])
      return
    }

    setMenu(null)
    props.onSelect([], [])
    beginPan(event)
  }

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      type: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: viewportRef.current,
    }
  }

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>, nodeId: string) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const selected = props.selectedNodeIds.includes(nodeId)
      ? props.selectedNodeIds
      : event.shiftKey
        ? [...props.selectedNodeIds, nodeId]
        : [nodeId]
    if (!props.selectedNodeIds.includes(nodeId) || event.shiftKey) props.onSelect(selected, [])
    const positions: Record<string, Point> = {}
    for (const id of selected) {
      const node = documentRef.current.nodes.find((item) => item.id === id)
      if (node) positions[id] = { x: node.x, y: node.y }
    }
    gesture.current = {
      type: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: documentRef.current,
      positions,
    }
  }

  const beginLink = (event: ReactPointerEvent<HTMLDivElement>, nodeId: string, portId: string) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
    const from = anchors[`${nodeId}:${portId}`] ?? localPoint(event)
    gesture.current = { type: 'link', pointerId: event.pointerId, nodeId, portId }
    setDraft({ nodeId, portId, from, to: localPoint(event) })
    setMenu(null)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.type === 'pan') {
      props.onViewport({
        ...current.origin,
        x: current.origin.x + (event.clientX - current.startX),
        y: current.origin.y + (event.clientY - current.startY),
      })
      return
    }
    if (current.type === 'move') {
      const zoom = viewportRef.current.zoom
      const dx = (event.clientX - current.startX) / zoom
      const dy = (event.clientY - current.startY) / zoom
      const positions: Record<string, Point> = {}
      for (const [id, position] of Object.entries(current.positions)) {
        positions[id] = { x: position.x + dx, y: position.y + dy }
      }
      props.onPreviewDocument({
        ...current.origin,
        nodes: current.origin.nodes.map((node) => {
          const next = positions[node.id]
          return next ? { ...node, x: next.x, y: next.y } : node
        }),
      })
      return
    }
    setDraft((previous) => (previous ? { ...previous, to: localPoint(event) } : previous))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    if (current.type === 'move') props.onCommitDrag()
    if (current.type === 'link') {
      const element = window.document.elementFromPoint(event.clientX, event.clientY)
      const port = element instanceof Element ? element.closest<HTMLElement>('.port') : null
      if (port?.dataset.nodeId && port.dataset.portId) {
        props.onConnect(current.nodeId, current.portId, port.dataset.nodeId, port.dataset.portId)
      }
      setDraft(null)
    }
  }

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('.menu, .overlay, .interactive')) return
    event.preventDefault()
    const point = localPoint(event)
    const bounds = canvasRef.current?.getBoundingClientRect()
    const x = Math.max(8, Math.min(point.x, (bounds?.width ?? 320) - 280))
    const y = Math.max(8, Math.min(point.y, (bounds?.height ?? 240) - 280))
    const node = target.closest<HTMLElement>('.node')
    if (node?.dataset.nodeId) {
      props.onSelect([node.dataset.nodeId], [])
      setMenu({ kind: 'node', x, y, nodeId: node.dataset.nodeId })
      return
    }
    const edge = target.closest<SVGElement>('[data-edge-id]')
    if (edge?.dataset.edgeId) {
      props.onSelect([], [edge.dataset.edgeId])
      props.onDeleteSelection()
      return
    }
    const world = screenToWorld(point, viewportRef.current)
    setMenu({ kind: 'add', x, y, worldX: world.x, worldY: world.y })
  }

  const onDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (![...event.dataTransfer.types].includes('application/x-nstudio-node')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const typeId = event.dataTransfer.getData('application/x-nstudio-node')
    if (!typeId) return
    event.preventDefault()
    const world = screenToWorld(localPoint(event), viewportRef.current)
    props.onAddNode(typeId, world.x - 110, world.y - 24)
    setMenu(null)
  }

  const fit = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    props.onViewport(frameNodes(props.document.nodes, canvas.clientWidth, canvas.clientHeight))
  }

  const variableNames = props.document.variables.map((variable) => variable.name)
  const registry = props.engine.registry
  const categories = registry.listCategories()
  const colorOf = (categoryId: string) => categories.find((category) => category.id === categoryId)?.color ?? '#8e99a8'
  const typeColor = (dataType?: string) => (dataType ? registry.getDataType(dataType)?.color ?? '#a8b0bc' : '#a8b0bc')
  const defaultFor = (dataType: string) => registry.requireDataType(dataType).defaultValue()

  return (
    <div
      className="canvas"
      ref={canvasRef}
      data-testid="canvas"
      aria-label="Граф нод"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        backgroundSize: `${24 * props.viewport.zoom}px ${24 * props.viewport.zoom}px`,
        backgroundPosition: `${props.viewport.x}px ${props.viewport.y}px`,
      }}
    >
      <svg className="wires" aria-hidden="true">
        {props.document.edges.map((edge) => {
          const from = anchors[`${edge.sourceNodeId}:${edge.sourcePortId}`]
          const to = anchors[`${edge.targetNodeId}:${edge.targetPortId}`]
          if (!from || !to) return null
          const source = resolvePort(props.document, registry, edge.sourceNodeId, edge.sourcePortId)
          const color = source?.kind === 'data' ? typeColor(source.dataType) : '#d7dbe3'
          const selected = props.selectedEdgeIds.includes(edge.id)
          const path = wirePath(from, to)
          return (
            <g key={edge.id}>
              <path className="wire-hit" data-edge-id={edge.id} d={path} />
              <path className={selected ? 'wire selected' : 'wire'} d={path} stroke={color} />
            </g>
          )
        })}
        {draft ? <path className="wire draft" d={wirePath(draft.from, draft.to)} /> : null}
      </svg>
      <div
        className="world"
        style={{ transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.zoom})` }}
      >
        {props.document.nodes.map((node) => {
          const definition = registry.getNodeType(node.typeId)
          const connected = new Set(
            props.document.edges.filter((edge) => edge.targetNodeId === node.id).map((edge) => edge.targetPortId),
          )
          return (
            <NodeCard
              key={node.id}
              node={node}
              definition={definition}
              color={definition ? colorOf(definition.category) : '#e25b45'}
              selected={props.selectedNodeIds.includes(node.id)}
              variableNames={variableNames}
              connectedInputs={connected}
              portState={(portId) => compatibility(props.document, props.engine, draft, node.id, portId)}
              registerPort={registerPort}
              onPointerDown={() => {}}
              onPortPointerDown={() => {}}
              onChangeProperty={props.onChangeProperty}
              onChangeInput={props.onChangeInput}
              onEditEnd={props.onEditEnd}
              defaultFor={defaultFor}
              typeColor={typeColor}
            />
          )
        })}
      </div>
      {props.document.nodes.length === 0 ? (
        <div className="canvas-hint">Добавьте ноду из палитры или правой кнопкой мыши</div>
      ) : null}
      <div className="overlay zoom-controls">
        <button type="button" onClick={() => props.onViewport(zoomAt(props.viewport, centerOf(canvasRef.current), props.viewport.zoom / 1.1))}>
          −
        </button>
        <button type="button" onClick={fit}>
          Вместить
        </button>
        <button type="button" onClick={() => props.onViewport(zoomAt(props.viewport, centerOf(canvasRef.current), props.viewport.zoom * 1.1))}>
          +
        </button>
      </div>
      {menu?.kind === 'add' ? (
        <div className="menu" style={{ left: menu.x, top: menu.y }}>
          <NodeTypeList
            types={registry.listNodeTypes()}
            categories={categories}
            autoFocus
            onPick={(typeId) => {
              props.onAddNode(typeId, menu.worldX, menu.worldY)
              setMenu(null)
            }}
          />
        </div>
      ) : null}
      {menu?.kind === 'node' ? (
        <div className="menu menu-compact" style={{ left: menu.x, top: menu.y }}>
          <button
            type="button"
            onClick={() => {
              props.onDeleteSelection()
              setMenu(null)
            }}
          >
            Удалить ноду
          </button>
        </div>
      ) : null}
    </div>
  )
}

function centerOf(canvas: HTMLDivElement | null): Point {
  if (!canvas) return { x: 0, y: 0 }
  return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }
}

function compatibility(
  document: GraphDocument,
  engine: Engine,
  draft: LinkDraft | null,
  nodeId: string,
  portId: string,
): 'idle' | 'source' | 'compatible' | 'incompatible' {
  if (!draft) return 'idle'
  if (draft.nodeId === nodeId && draft.portId === portId) return 'source'
  const from = resolvePort(document, engine.registry, draft.nodeId, draft.portId)
  const to = resolvePort(document, engine.registry, nodeId, portId)
  if (!from || !to) return 'incompatible'
  let source = from
  let target = to
  if (from.direction === 'input' && to.direction === 'output') {
    source = to
    target = from
  }
  if (source.direction !== 'output' || target.direction !== 'input') return 'incompatible'
  if (source.node.id === target.node.id || source.kind !== target.kind) return 'incompatible'
  if (source.kind === 'data') {
    const sourceType = source.dataType ?? 'any'
    const targetType = target.dataType ?? 'any'
    if (!areTypesCompatible(sourceType, targetType, engine.registry.getDataType(targetType))) return 'incompatible'
  }
  return 'compatible'
}
