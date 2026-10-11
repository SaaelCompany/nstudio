import { describe, expect, it } from 'vitest'
import { frameNodes, screenToWorld, wirePath, zoomAt } from './geometry'

describe('viewport geometry', () => {
  it('keeps the focal point fixed while zooming', () => {
    const viewport = { x: 40, y: 20, zoom: 1 }
    const focal = { x: 140, y: 80 }
    const before = screenToWorld(focal, viewport)
    const next = zoomAt(viewport, focal, 2)
    expect(screenToWorld(focal, next)).toEqual(before)
    expect(next.zoom).toBe(2)
  })

  it('frames nodes inside the canvas', () => {
    const viewport = frameNodes(
      [
        { x: 0, y: 0 },
        { x: 400, y: 200 },
      ],
      800,
      600,
    )
    expect(viewport.zoom).toBeGreaterThan(0)
    expect(viewport.zoom).toBeLessThanOrEqual(1)
  })

  it('builds a cubic wire', () => {
    expect(wirePath({ x: 0, y: 0 }, { x: 120, y: 40 })).toMatch(/^M 0 0 C /)
  })
})
