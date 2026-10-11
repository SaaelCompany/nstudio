export interface Point {
  x: number
  y: number
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2.25

export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.min(max, Math.max(min, zoom))
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  }
}

export function zoomAt(viewport: Viewport, focal: Point, nextZoom: number, min = MIN_ZOOM, max = MAX_ZOOM): Viewport {
  const zoom = clampZoom(nextZoom, min, max)
  const world = screenToWorld(focal, viewport)
  return {
    zoom,
    x: focal.x - world.x * zoom,
    y: focal.y - world.y * zoom,
  }
}

export function frameNodes(nodes: { x: number; y: number }[], width: number, height: number): Viewport {
  if (nodes.length === 0 || width <= 0 || height <= 0) return { x: 80, y: 60, zoom: 1 }
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x)) + 260
  const maxY = Math.max(...nodes.map((node) => node.y)) + 160
  const boundsWidth = Math.max(1, maxX - minX)
  const boundsHeight = Math.max(1, maxY - minY)
  const zoom = clampZoom(Math.min((width - 96) / boundsWidth, (height - 96) / boundsHeight, 1))
  return {
    zoom,
    x: (width - boundsWidth * zoom) / 2 - minX * zoom,
    y: (height - boundsHeight * zoom) / 2 - minY * zoom,
  }
}

export function frameLayout(width: number, height: number, viewWidth: number, viewHeight: number): Viewport {
  if (viewWidth <= 0 || viewHeight <= 0) return { x: 48, y: 40, zoom: 1 }
  const zoom = clampZoom(Math.min((viewWidth - 96) / width, (viewHeight - 96) / height, 1), 0.1, 4)
  return {
    zoom,
    x: (viewWidth - width * zoom) / 2,
    y: (viewHeight - height * zoom) / 2,
  }
}

export function wirePath(from: Point, to: Point): string {
  const bend = Math.max(48, Math.abs(to.x - from.x) * 0.45)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}
