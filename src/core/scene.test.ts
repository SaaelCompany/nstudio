import { describe, expect, it } from 'vitest'
import { definePlugin } from './plugin'
import {
  Engine,
  EngineError,
  activeScene,
  angleFromPointer,
  patchLayer,
  placeInstance,
  removeScene,
  resizeBox,
} from './index'

describe('scene layout', () => {
  it('grows the east edge and keeps the origin', () => {
    const next = resizeBox({ x: 10, y: 20, width: 100, height: 40, angle: 0 }, 'e', 20, 0)
    expect(next).toMatchObject({ x: 10, y: 20, width: 120, height: 40 })
  })

  it('shrinks from the west and shifts the origin', () => {
    const next = resizeBox({ x: 10, y: 20, width: 100, height: 40, angle: 0 }, 'w', 20, 0)
    expect(next).toMatchObject({ x: 30, y: 20, width: 80, height: 40 })
  })

  it('resizes the local east edge after a quarter turn', () => {
    const next = resizeBox({ x: 0, y: 0, width: 100, height: 40, angle: 90 }, 'e', 0, 20)
    expect(next.width).toBeCloseTo(120, 4)
    expect(next.height).toBeCloseTo(40, 4)
    expect(next.x).toBeCloseTo(0, 4)
    expect(next.y).toBeCloseTo(0, 4)
  })

  it('points angle 0 at the handle above the center', () => {
    expect(angleFromPointer({ x: 0, y: 0, width: 100, height: 40, angle: 0 }, 50, 0)).toBeCloseTo(0, 5)
  })

  it('places an object, keeps the last scene, and round-trips', () => {
    const engine = new Engine()
    let document = engine.createBlankDocument()
    const sceneId = document.scenes.activeSceneId
    const typeId = document.scenes.objectTypes[0]?.id
    if (!typeId) throw new Error('нет стартового типа')
    const placed = placeInstance(document, typeId, 100, 80)
    document = placed.document
    const instance = activeScene(document).instances.find((item) => item.id === placed.instanceId)
    expect(instance).toMatchObject({ x: 20, y: 32, width: 160, height: 96 })
    expect(() => removeScene(document, sceneId)).toThrow(/хотя бы одна сцена/)
    expect(engine.deserialize(engine.serialize(document)).scenes).toEqual(document.scenes)
  })

  it('refuses to place on a locked layer', () => {
    const engine = new Engine()
    const document = engine.createBlankDocument()
    const typeId = document.scenes.objectTypes[0]?.id
    if (!typeId) throw new Error('нет стартового типа')
    const locked = patchLayer(document, document.scenes.activeSceneId, document.scenes.activeLayerId, { locked: true })
    expect(() => placeInstance(locked, typeId, 0, 0)).toThrow(EngineError)
  })

  it('opens the demo on three instances', () => {
    const engine = new Engine()
    const scene = activeScene(engine.createDemoDocument())
    expect(scene.width).toBe(960)
    expect(scene.height).toBe(540)
    expect(scene.instances.map((instance) => instance.id)).toEqual(['inst_ground', 'inst_player', 'inst_title'])
  })

  it('fills a blank layout when an old file has no scenes', () => {
    const engine = new Engine()
    const raw = JSON.parse(engine.serialize(engine.createBlankDocument())) as { scenes?: unknown }
    delete raw.scenes
    const document = engine.deserialize(JSON.stringify(raw))
    expect(document.scenes.scenes).toHaveLength(1)
    expect(document.scenes.objectTypes.map((type) => type.kind)).toEqual(['core.shape', 'core.text'])
  })

  it('lists built-in scene objects and rolls back a failed kind', () => {
    const engine = new Engine()
    expect(engine.registry.listSceneObjects().map((kind) => kind.id)).toEqual(['core.sprite', 'core.text', 'core.shape'])
    expect(() =>
      engine.use(
        definePlugin({
          id: 'boom.scene',
          name: 'Сбой',
          version: '0.0.0',
          register(api) {
            api.registerSceneObject({
              id: 'boom.box',
              title: 'Ящик',
              description: '',
              defaultWidth: 10,
              defaultHeight: 10,
              defaultProps: {},
              fields: [],
            })
            throw new Error('stop')
          },
        }),
      ),
    ).toThrow('stop')
    expect(engine.registry.getSceneObject('boom.box')).toBeUndefined()
    expect(engine.listPlugins().some((plugin) => plugin.id === 'boom.scene')).toBe(false)
  })
})
