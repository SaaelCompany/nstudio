import { describe, expect, it } from 'vitest'
import { definePlugin } from './plugin'
import {
  Engine,
  EngineError,
  activeScene,
  addBehavior,
  addInstanceEffect,
  addNode,
  addScene,
  angleFromPointer,
  createNode,
  patchLayer,
  placeInstance,
  removeScene,
  resizeBox,
  setActiveScene,
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

  it('keeps a separate event sheet on each layout', () => {
    const engine = new Engine()
    let document = engine.createBlankDocument()
    const firstId = document.scenes.activeSceneId
    const firstNodes = document.nodes.map((node) => node.id)
    expect(firstNodes.length).toBeGreaterThan(0)
    expect(activeScene(document).nodes.map((node) => node.id)).toEqual(firstNodes)

    document = addScene(document, 'Второй')
    expect(document.scenes.activeSceneId).not.toBe(firstId)
    expect(document.nodes).toEqual([])
    const extra = createNode(engine.registry, 'core.event.start', 40, 40, 'node_second')
    document = addNode(document, extra)
    expect(activeScene(document).nodes.map((node) => node.id)).toEqual(['node_second'])

    document = setActiveScene(document, firstId)
    expect(document.nodes.map((node) => node.id)).toEqual(firstNodes)
    expect(activeScene(document).nodes.map((node) => node.id)).toEqual(firstNodes)
    const second = document.scenes.scenes.find((scene) => scene.id !== firstId)
    expect(second?.nodes.map((node) => node.id)).toEqual(['node_second'])
  })

  it('moves an old graph onto the active layout', () => {
    const engine = new Engine()
    const raw = JSON.parse(engine.serialize(engine.createDemoDocument())) as {
      nodes: unknown[]
      scenes: { scenes: Array<Record<string, unknown>> }
    }
    for (const scene of raw.scenes.scenes) {
      delete scene.nodes
      delete scene.edges
    }
    const document = engine.deserialize(JSON.stringify(raw))
    expect(document.nodes.length).toBe(raw.nodes.length)
    expect(activeScene(document).nodes).toEqual(document.nodes)
    expect(engine.run(document).logs.map((entry) => entry.message)).toEqual(['Привет из NStudio', '42'])
  })

  it('stores an effect on the instance and one behavior per type', () => {
    const engine = new Engine()
    let document = engine.createDemoDocument()
    const blur = engine.registry.getEffect('core.effect.blur')
    const solid = engine.registry.getBehavior('core.behavior.solid')
    if (!blur || !solid) throw new Error('нет модуля')
    expect(blur.filter?.({ radius: 8 })).toBe('blur(8px)')
    document = addInstanceEffect(document, document.scenes.activeSceneId, 'inst_player', blur)
    document = addBehavior(document, 'type_player', solid)
    expect(() => addBehavior(document, 'type_player', solid)).toThrow(/уже есть/)
    const copy = engine.deserialize(engine.serialize(document))
    const player = activeScene(copy).instances.find((item) => item.id === 'inst_player')
    expect(player?.effects[0]?.kind).toBe('core.effect.blur')
    expect(player?.effects[0]?.props).toEqual({ radius: 4 })
    expect(copy.scenes.objectTypes.find((type) => type.id === 'type_player')?.behaviors[0]?.kind).toBe('core.behavior.solid')
    expect(engine.run(copy).logs.map((entry) => entry.message)).toEqual(['Привет из NStudio', '42'])
  })

  it('rolls back a failed effect registration', () => {
    const engine = new Engine()
    expect(engine.registry.listEffects().map((effect) => effect.id)).toContain('core.effect.blur')
    expect(engine.registry.listBehaviors().map((behavior) => behavior.id)).toContain('core.behavior.solid')
    expect(() =>
      engine.use(
        definePlugin({
          id: 'boom.fx',
          name: 'Сбой',
          version: '0.0.0',
          register(api) {
            api.registerEffect({
              id: 'boom.effect.flash',
              title: 'Вспышка',
              description: '',
              fields: [],
              defaultProps: {},
            })
            throw new Error('stop')
          },
        }),
      ),
    ).toThrow('stop')
    expect(engine.registry.getEffect('boom.effect.flash')).toBeUndefined()
    expect(engine.listPlugins().some((plugin) => plugin.id === 'boom.fx')).toBe(false)
  })
})
