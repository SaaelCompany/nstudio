import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  activeScene,
  angleFromPointer,
  boundsIntersect,
  instanceBounds,
  resizeBox,
  snapValue,
  updateInstances,
} from '../core'
import type { GraphDocument, ResizeHandle, SceneBox, SceneInstance, SceneObjectType, SceneValue } from '../core'
import { frameLayout, screenToWorld, zoomAt } from './geometry'
import type { Point, Viewport } from './geometry'
import { readImageFile } from './images'

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SCENE_ZOOM_MIN = 0.1
const SCENE_ZOOM_MAX = 4

interface SceneCanvasProps {
  document: GraphDocument
  viewport: Viewport
  selectedIds: string[]
  gridEnabled: boolean
  gridSize: number
  onViewport: (viewport: Viewport) => void
  onSelect: (ids: string[]) => void
  onPreviewDocument: (document: GraphDocument) => void
  onCommitDrag: () => void
  onPlaceType: (typeId: string, x: number, y: number) => void
  onPlaceKind: (kindId: string, x: number, y: number, defaults?: Record<string, SceneValue>) => void
  onToggleGrid: () => void
  onNotice: (message: string) => void
}

type Gesture =
  | { type: 'pending-pan'; pointerId: number; start: Point; last: Point }
  | { type: 'pan'; pointerId: number; last: Point }
  | { type: 'pending-move'; pointerId: number; instanceId: string; start: Point; startWorld: Point; ids: string[]; additive: boolean }
  | { type: 'move'; pointerId: number; startWorld: Point; origins: Record<string, Point>; primaryId: string }
  | { type: 'resize'; pointerId: number; id: string; handle: ResizeHandle; startWorld: Point; box: SceneBox }
  | { type: 'rotate'; pointerId: number; id: string; box: SceneBox }
  | { type: 'pending-marquee'; pointerId: number; start: Point; additive: boolean; base: string[] }
  | { type: 'marquee'; pointerId: number; start: Point; current: Point; additive: boolean; base: string[] }

export function SceneCanvas(props: SceneCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const didFrame = useRef(false)
  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null)
  const scene = activeScene(props.document)

  useLayoutEffect(() => {
    if (didFrame.current) return
    didFrame.current = true
    const stage = stageRef.current
    if (!stage || !isSentinel(propsRef.current.viewport)) return
    const current = activeScene(propsRef.current.document)
    propsRef.current.onViewport(frameLayout(current.width, current.height, stage.clientWidth, stage.clientHeight))
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = stage.getBoundingClientRect()
      const focal = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const current = propsRef.current.viewport
      propsRef.current.onViewport(zoomAt(current, focal, current.zoom * Math.exp(-event.deltaY * 0.0014), SCENE_ZOOM_MIN, SCENE_ZOOM_MAX))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const bounds = stageRef.current?.getBoundingClientRect()
    return { x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) }
  }

  const frame = () => {
    const stage = stageRef.current
    if (!stage) return
    props.onViewport(frameLayout(scene.width, scene.height, stage.clientWidth, stage.clientHeight))
  }

  const zoomBy = (factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    const focal = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 }
    props.onViewport(zoomAt(props.viewport, focal, props.viewport.zoom * factor, SCENE_ZOOM_MIN, SCENE_ZOOM_MAX))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('.zoom-controls')) return
    const handle = target?.closest('[data-handle]')?.getAttribute('data-handle') ?? null
    const instanceId = target?.closest('[data-instance-id]')?.getAttribute('data-instance-id') ?? null
    const onLayout = Boolean(target?.closest('[data-testid="scene-layout"]'))
    const screen = localPoint(event)
    const world = screenToWorld(screen, props.viewport)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (event.button === 1) {
      gesture.current = { type: 'pan', pointerId: event.pointerId, last: screen }
      return
    }
    if (handle === 'rotate' && instanceId) {
      const instance = scene.instances.find((item) => item.id === instanceId)
      if (!instance) return
      gesture.current = { type: 'rotate', pointerId: event.pointerId, id: instanceId, box: boxOf(instance) }
      props.onSelect([instanceId])
      return
    }
    if (handle && isHandle(handle) && instanceId) {
      const instance = scene.instances.find((item) => item.id === instanceId)
      if (!instance) return
      gesture.current = {
        type: 'resize',
        pointerId: event.pointerId,
        id: instanceId,
        handle,
        startWorld: world,
        box: boxOf(instance),
      }
      props.onSelect([instanceId])
      return
    }
    if (instanceId) {
      const selected = props.selectedIds
      const ids = event.shiftKey || selected.includes(instanceId) ? selected : [instanceId]
      if (!event.shiftKey && !selected.includes(instanceId)) props.onSelect(ids)
      gesture.current = {
        type: 'pending-move',
        pointerId: event.pointerId,
        instanceId,
        start: screen,
        startWorld: world,
        ids: ids.includes(instanceId) ? ids : [...ids, instanceId],
        additive: event.shiftKey,
      }
      return
    }
    if (onLayout) {
      gesture.current = {
        type: 'pending-marquee',
        pointerId: event.pointerId,
        start: screen,
        additive: event.shiftKey,
        base: event.shiftKey ? props.selectedIds : [],
      }
      return
    }
    gesture.current = { type: 'pending-pan', pointerId: event.pointerId, start: screen, last: screen }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const screen = localPoint(event)
    const world = screenToWorld(screen, propsRef.current.viewport)
    if (current.type === 'pending-pan') {
      if (distance(current.start, screen) < 4) return
      gesture.current = { type: 'pan', pointerId: current.pointerId, last: screen }
      return
    }
    if (current.type === 'pan') {
      const dx = screen.x - current.last.x
      const dy = screen.y - current.last.y
      const viewport = propsRef.current.viewport
      propsRef.current.onViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy })
      gesture.current = { ...current, last: screen }
      return
    }
    if (current.type === 'pending-move') {
      if (distance(current.start, screen) < 4) return
      const sceneNow = activeScene(propsRef.current.document)
      const locked = new Set(sceneNow.layers.filter((layer) => layer.locked).map((layer) => layer.id))
      const ids = current.ids.filter((id) => {
        const instance = sceneNow.instances.find((item) => item.id === id)
        return instance && !locked.has(instance.layerId)
      })
      const origins: Record<string, Point> = {}
      for (const id of ids) {
        const instance = sceneNow.instances.find((item) => item.id === id)
        if (instance) origins[id] = { x: instance.x, y: instance.y }
      }
      const primaryId = origins[current.instanceId] ? current.instanceId : ids[0]
      if (!primaryId) return
      gesture.current = { type: 'move', pointerId: current.pointerId, startWorld: current.startWorld, origins, primaryId }
      applyMove(gesture.current, world)
      return
    }
    if (current.type === 'move') {
      applyMove(current, world)
      return
    }
    if (current.type === 'resize') {
      const next = resizeBox(current.box, current.handle, world.x - current.startWorld.x, world.y - current.startWorld.y)
      const sceneId = activeScene(propsRef.current.document).id
      propsRef.current.onPreviewDocument(
        updateInstances(propsRef.current.document, sceneId, (instance) => (instance.id === current.id ? next : null)),
      )
      return
    }
    if (current.type === 'rotate') {
      let angle = angleFromPointer(current.box, world.x, world.y)
      if (event.shiftKey) angle = (Math.round(angle / 15) * 15) % 360
      const sceneId = activeScene(propsRef.current.document).id
      propsRef.current.onPreviewDocument(
        updateInstances(propsRef.current.document, sceneId, (instance) => (instance.id === current.id ? { angle } : null)),
      )
      return
    }
    if (current.type === 'pending-marquee') {
      if (distance(current.start, screen) < 4) return
      gesture.current = { ...current, type: 'marquee', current: screen }
      setMarquee({ start: current.start, current: screen })
      applyMarquee(current.start, screen, current.additive, current.base)
      return
    }
    if (current.type === 'marquee') {
      gesture.current = { ...current, current: screen }
      setMarquee({ start: current.start, current: screen })
      applyMarquee(current.start, screen, current.additive, current.base)
    }
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    setMarquee(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (current.type === 'pending-move') {
      const selected = propsRef.current.selectedIds
      if (current.additive) {
        const next = selected.includes(current.instanceId)
          ? selected.filter((id) => id !== current.instanceId)
          : [...selected, current.instanceId]
        propsRef.current.onSelect(next)
      } else {
        propsRef.current.onSelect([current.instanceId])
      }
      return
    }
    if (current.type === 'pending-marquee' || current.type === 'pending-pan') {
      if (!current.type.includes('pan') || current.type === 'pending-pan') {
        if (!(current.type === 'pending-marquee' && current.additive)) propsRef.current.onSelect([])
      }
      return
    }
    if (current.type === 'move' || current.type === 'resize' || current.type === 'rotate') propsRef.current.onCommitDrag()
  }

  const applyMove = (current: Extract<Gesture, { type: 'move' }>, world: Point) => {
    const primary = current.origins[current.primaryId]
    if (!primary) return
    let dx = world.x - current.startWorld.x
    let dy = world.y - current.startWorld.y
    const { gridEnabled, gridSize } = propsRef.current
    if (gridEnabled && gridSize > 1) {
      dx = snapValue(primary.x + dx, gridSize) - primary.x
      dy = snapValue(primary.y + dy, gridSize) - primary.y
    }
    const sceneId = activeScene(propsRef.current.document).id
    propsRef.current.onPreviewDocument(
      updateInstances(propsRef.current.document, sceneId, (instance) => {
        const origin = current.origins[instance.id]
        return origin ? { x: origin.x + dx, y: origin.y + dy } : null
      }),
    )
  }

  const applyMarquee = (start: Point, current: Point, additive: boolean, base: string[]) => {
    const viewport = propsRef.current.viewport
    const first = screenToWorld(start, viewport)
    const second = screenToWorld(current, viewport)
    const left = Math.min(first.x, second.x)
    const top = Math.min(first.y, second.y)
    const right = Math.max(first.x, second.x)
    const bottom = Math.max(first.y, second.y)
    const sceneNow = activeScene(propsRef.current.document)
    const hits = sceneNow.instances
      .filter((instance) => {
        const layer = sceneNow.layers.find((item) => item.id === instance.layerId)
        if (!layer?.visible || layer.locked) return false
        return boundsIntersect(left, top, right, bottom, instanceBounds(instance))
      })
      .map((instance) => instance.id)
    const next = additive ? [...base, ...hits.filter((id) => !base.includes(id))] : hits
    propsRef.current.onSelect(next)
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const screen = localPoint(event)
    const world = screenToWorld(screen, props.viewport)
    const file = event.dataTransfer.files[0]
    if (file) {
      void readImageFile(file).then(
        (src) => props.onPlaceKind('core.sprite', world.x, world.y, { src }),
        (error: unknown) => props.onNotice(error instanceof Error ? error.message : 'Не удалось прочитать изображение'),
      )
      return
    }
    const plain = event.dataTransfer.getData('text/plain')
    const typeId = event.dataTransfer.getData('application/x-nstudio-object') || prefixed(plain, 'object:')
    const kindId = event.dataTransfer.getData('application/x-nstudio-kind') || prefixed(plain, 'kind:')
    if (typeId) props.onPlaceType(typeId, world.x, world.y)
    else if (kindId) props.onPlaceKind(kindId, world.x, world.y)
  }

  return (
    <div
      ref={stageRef}
      className="canvas scene-stage"
      data-testid="scene-stage"
      style={{ ['--scene-zoom' as string]: props.viewport.zoom }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(event) => event.preventDefault()}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={onDrop}
    >
      <div className="world" style={{ transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.zoom})` }}>
        <div
          className="scene-layout"
          data-testid="scene-layout"
          style={{
            width: scene.width,
            height: scene.height,
            backgroundColor: scene.background,
            backgroundImage: props.gridEnabled
              ? 'linear-gradient(to right, rgba(244, 240, 232, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(244, 240, 232, 0.1) 1px, transparent 1px)'
              : undefined,
            backgroundSize: props.gridEnabled ? `${props.gridSize}px ${props.gridSize}px` : undefined,
          }}
        >
          {scene.layers.map((layer) =>
            layer.visible
              ? scene.instances
                  .filter((instance) => instance.layerId === layer.id)
                  .map((instance) => (
                    <SceneObject
                      key={instance.id}
                      instance={instance}
                      type={props.document.scenes.objectTypes.find((item) => item.id === instance.typeId)}
                      selected={props.selectedIds.includes(instance.id)}
                      single={props.selectedIds.length === 1}
                      locked={layer.locked}
                    />
                  ))
              : null,
          )}
        </div>
      </div>
      {marquee ? (
        <div
          className="marquee"
          style={{
            left: Math.min(marquee.start.x, marquee.current.x),
            top: Math.min(marquee.start.y, marquee.current.y),
            width: Math.abs(marquee.current.x - marquee.start.x),
            height: Math.abs(marquee.current.y - marquee.start.y),
          }}
        />
      ) : null}
      <div className="zoom-controls">
        <button type="button" onClick={() => zoomBy(1 / 1.1)} aria-label="Уменьшить">
          −
        </button>
        <button type="button" data-testid="grid-toggle" aria-pressed={props.gridEnabled} onClick={props.onToggleGrid}>
          Сетка
        </button>
        <button type="button" onClick={frame}>
          В кадр
        </button>
        <button type="button" onClick={() => zoomBy(1.1)} aria-label="Увеличить">
          +
        </button>
      </div>
    </div>
  )
}

function SceneObject({
  instance,
  type,
  selected,
  single,
  locked,
}: {
  instance: SceneInstance
  type: SceneObjectType | undefined
  selected: boolean
  single: boolean
  locked: boolean
}) {
  const showHandles = selected && single && !locked
  return (
    <div
      className={`scene-instance${selected ? ' selected' : ''}${locked ? ' locked' : ''}`}
      data-testid="scene-instance"
      data-instance-id={instance.id}
      style={{
        left: instance.x,
        top: instance.y,
        width: instance.width,
        height: instance.height,
        transform: `rotate(${instance.angle}deg)`,
        pointerEvents: locked ? 'none' : 'auto',
      }}
    >
      <div className="scene-body" style={{ opacity: instance.opacity }}>
        <InstanceBody instance={instance} type={type} />
      </div>
      {showHandles ? (
        <>
          {HANDLES.map((handle) => (
            <span key={handle} className={`handle handle-${handle}`} data-handle={handle} />
          ))}
          <span className="handle handle-rotate" data-handle="rotate" />
        </>
      ) : null}
    </div>
  )
}

function InstanceBody({ instance, type }: { instance: SceneInstance; type: SceneObjectType | undefined }) {
  const kind = type?.kind
  if (kind === 'core.shape') {
    const fill = typeof instance.props.fill === 'string' ? instance.props.fill : '#e2a23a'
    return <div className="scene-shape" style={{ background: fill, borderRadius: instance.props.shape === 'ellipse' ? '50%' : 0 }} />
  }
  if (kind === 'core.text') {
    const align = instance.props.align === 'left' || instance.props.align === 'right' ? instance.props.align : 'center'
    const size = typeof instance.props.size === 'number' && instance.props.size > 0 ? instance.props.size : 36
    const color = typeof instance.props.color === 'string' ? instance.props.color : '#f4f0e8'
    return (
      <div className="scene-text" style={{ color, fontSize: size, textAlign: align }}>
        {typeof instance.props.text === 'string' ? instance.props.text : ''}
      </div>
    )
  }
  if (kind === 'core.sprite') {
    const src = typeof instance.props.src === 'string' ? instance.props.src : ''
    if (src.startsWith('data:image/') || src.startsWith('blob:') || /^https?:\/\//.test(src)) {
      return (
        <div className="scene-sprite">
          <img src={src} alt="" draggable={false} />
        </div>
      )
    }
    return <div className="sprite-empty">Спрайт</div>
  }
  return <div className="scene-fallback">{instance.name || type?.name || 'Объект'}</div>
}

function boxOf(instance: SceneInstance): SceneBox {
  return { x: instance.x, y: instance.y, width: instance.width, height: instance.height, angle: instance.angle }
}

function isHandle(value: string): value is ResizeHandle {
  return HANDLES.some((handle) => handle === value)
}

function isSentinel(viewport: Viewport): boolean {
  return viewport.x === 48 && viewport.y === 40 && viewport.zoom === 1
}

function distance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function prefixed(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : ''
}
