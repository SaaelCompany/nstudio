import { EngineError } from './errors'
import { createId } from './ids'
import type {
  GraphDocument,
  Scene,
  SceneInstance,
  SceneLayer,
  SceneObjectKind,
  SceneObjectType,
  SceneProject,
  SceneValue,
} from './types'

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

export interface SceneBox {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

const MIN_SIZE = 8

export function createBlankSceneProject(): SceneProject {
  const layer = layerOf('Слой 0')
  const scene = sceneOf('Макет', [layer])
  return {
    activeSceneId: scene.id,
    activeLayerId: layer.id,
    objectTypes: [
      objectType('Фигура', 'core.shape', { shape: 'rect', fill: '#e2a23a' }),
      objectType('Текст', 'core.text', { text: 'Текст', color: '#f4f0e8', size: 36, align: 'center' }),
    ],
    scenes: [scene],
  }
}

/** A small title screen so the layout editor opens on something you can see and move. */
export function createDemoSceneProject(): SceneProject {
  const layer = layerOf('Слой 0', 'layer_main')
  const ground = objectType('Земля', 'core.shape', { shape: 'rect', fill: '#3cba8b' }, 'type_ground')
  const player = objectType('Игрок', 'core.shape', { shape: 'ellipse', fill: '#e2a23a' }, 'type_player')
  const title = objectType('Заголовок', 'core.text', { text: 'NStudio', color: '#f4f0e8', size: 48, align: 'center' }, 'type_title')
  const scene: Scene = {
    id: 'scene_main',
    name: 'Макет',
    width: 960,
    height: 540,
    background: '#172033',
    layers: [layer],
    instances: [
      instanceOf(ground, layer.id, 0, 460, 960, 80, 'inst_ground'),
      instanceOf(player, layer.id, 128, 332, 80, 80, 'inst_player'),
      instanceOf(title, layer.id, 280, 72, 400, 80, 'inst_title'),
    ],
  }
  return {
    activeSceneId: scene.id,
    activeLayerId: layer.id,
    objectTypes: [ground, player, title],
    scenes: [scene],
  }
}

export function activeScene(document: GraphDocument): Scene {
  return requireScene(document, document.scenes.activeSceneId)
}

export function addScene(document: GraphDocument, name?: string): GraphDocument {
  const scene = sceneOf(uniqueName(document.scenes.scenes.map((item) => item.name), name?.trim() || 'Макет'))
  return {
    ...document,
    scenes: {
      ...document.scenes,
      activeSceneId: scene.id,
      activeLayerId: scene.layers[0]?.id ?? document.scenes.activeLayerId,
      scenes: [...document.scenes.scenes, scene],
    },
  }
}

export function renameScene(document: GraphDocument, sceneId: string, name: string): GraphDocument {
  const trimmed = name.trim()
  if (!trimmed) throw new EngineError('У сцены должно быть имя')
  return mapScene(document, sceneId, (scene) => ({ ...scene, name: trimmed }))
}

export function removeScene(document: GraphDocument, sceneId: string): GraphDocument {
  if (document.scenes.scenes.length <= 1) throw new EngineError('В проекте должна остаться хотя бы одна сцена')
  const scenes = document.scenes.scenes.filter((scene) => scene.id !== sceneId)
  const active = scenes.find((scene) => scene.id === document.scenes.activeSceneId) ?? scenes[0]
  if (!active) throw new EngineError('В проекте должна остаться хотя бы одна сцена')
  return {
    ...document,
    scenes: {
      ...document.scenes,
      scenes,
      activeSceneId: active.id,
      activeLayerId: active.layers.some((layer) => layer.id === document.scenes.activeLayerId)
        ? document.scenes.activeLayerId
        : (active.layers[0]?.id ?? document.scenes.activeLayerId),
    },
  }
}

export function setActiveScene(document: GraphDocument, sceneId: string): GraphDocument {
  const scene = requireScene(document, sceneId)
  const layer = scene.layers.find((item) => item.id === document.scenes.activeLayerId) ?? scene.layers[0]
  if (!layer) throw new EngineError('У сцены нет слоя')
  return { ...document, scenes: { ...document.scenes, activeSceneId: scene.id, activeLayerId: layer.id } }
}

export function setSceneCanvas(
  document: GraphDocument,
  sceneId: string,
  patch: Partial<Pick<Scene, 'width' | 'height' | 'background'>>,
): GraphDocument {
  return mapScene(document, sceneId, (scene) => ({
    ...scene,
    width: patch.width === undefined ? scene.width : clampSize(patch.width, 64, 8000),
    height: patch.height === undefined ? scene.height : clampSize(patch.height, 64, 8000),
    background: patch.background ?? scene.background,
  }))
}

export function addLayer(document: GraphDocument, sceneId: string): GraphDocument {
  const scene = requireScene(document, sceneId)
  const layer = layerOf(uniqueName(scene.layers.map((item) => item.name), 'Слой'))
  return mapScene(
    document,
    sceneId,
    (current) => ({ ...current, layers: [...current.layers, layer] }),
    layer.id,
  )
}

export function patchLayer(
  document: GraphDocument,
  sceneId: string,
  layerId: string,
  patch: Partial<Pick<SceneLayer, 'name' | 'visible' | 'locked'>>,
): GraphDocument {
  return mapScene(document, sceneId, (scene) => ({
    ...scene,
    layers: scene.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch, name: patch.name?.trim() || layer.name } : layer)),
  }))
}

export function removeLayer(document: GraphDocument, sceneId: string, layerId: string): GraphDocument {
  const scene = requireScene(document, sceneId)
  if (scene.layers.length <= 1) throw new EngineError('У сцены должен остаться хотя бы один слой')
  const fallback = scene.layers.find((layer) => layer.id !== layerId)
  if (!fallback) throw new EngineError('У сцены должен остаться хотя бы один слой')
  return mapScene(document, sceneId, (current) => ({
    ...current,
    layers: current.layers.filter((layer) => layer.id !== layerId),
    instances: current.instances.map((instance) =>
      instance.layerId === layerId ? { ...instance, layerId: fallback.id } : instance,
    ),
  }), document.scenes.activeLayerId === layerId ? fallback.id : undefined)
}

export function moveLayer(document: GraphDocument, sceneId: string, layerId: string, direction: -1 | 1): GraphDocument {
  return mapScene(document, sceneId, (scene) => {
    const index = scene.layers.findIndex((layer) => layer.id === layerId)
    const next = index + direction
    if (index < 0 || next < 0 || next >= scene.layers.length) return scene
    const layers = scene.layers.slice()
    const current = layers[index]
    const swap = layers[next]
    if (!current || !swap) return scene
    layers[index] = swap
    layers[next] = current
    return { ...scene, layers }
  })
}

export function setActiveLayer(document: GraphDocument, layerId: string): GraphDocument {
  const scene = activeScene(document)
  if (!scene.layers.some((layer) => layer.id === layerId)) throw new EngineError('Слой не найден на текущей сцене')
  return { ...document, scenes: { ...document.scenes, activeLayerId: layerId } }
}

export function addObjectType(
  document: GraphDocument,
  kind: SceneObjectKind,
  name?: string,
  defaults?: Record<string, SceneValue>,
): { document: GraphDocument; typeId: string } {
  const type = objectType(uniqueName(document.scenes.objectTypes.map((item) => item.name), name?.trim() || kind.title), kind.id, {
    ...kind.defaultProps,
    ...defaults,
  })
  return {
    typeId: type.id,
    document: { ...document, scenes: { ...document.scenes, objectTypes: [...document.scenes.objectTypes, type] } },
  }
}

export function placeInstance(
  document: GraphDocument,
  typeId: string,
  x: number,
  y: number,
  options?: { sceneId?: string; width?: number; height?: number },
): { document: GraphDocument; instanceId: string } {
  const scene = requireScene(document, options?.sceneId ?? document.scenes.activeSceneId)
  const type = requireType(document, typeId)
  const layer = scene.layers.find((item) => item.id === document.scenes.activeLayerId) ?? scene.layers[scene.layers.length - 1]
  if (!layer) throw new EngineError('У сцены нет слоя')
  if (layer.locked) throw new EngineError('Активный слой заблокирован')
  const fallback = defaultSize(type)
  const width = options?.width && options.width > 0 ? options.width : fallback.width
  const height = options?.height && options.height > 0 ? options.height : fallback.height
  const created = instanceOf(type, layer.id, x - width / 2, y - height / 2, width, height)
  return {
    instanceId: created.id,
    document: mapScene(document, scene.id, (current) => ({ ...current, instances: [...current.instances, created] })),
  }
}

export function patchInstances(
  document: GraphDocument,
  sceneId: string,
  ids: readonly string[],
  patch: Partial<Pick<SceneInstance, 'name' | 'x' | 'y' | 'width' | 'height' | 'angle' | 'opacity' | 'layerId'>> & {
    props?: Record<string, SceneValue>
  },
): GraphDocument {
  const selected = new Set(ids)
  return mapScene(document, sceneId, (scene) => ({
    ...scene,
    instances: scene.instances.map((instance) => {
      if (!selected.has(instance.id)) return instance
      const props = patch.props ? { ...instance.props, ...patch.props } : instance.props
      return {
        ...instance,
        ...patch,
        props,
        width: patch.width === undefined ? instance.width : Math.max(MIN_SIZE, patch.width),
        height: patch.height === undefined ? instance.height : Math.max(MIN_SIZE, patch.height),
        opacity: patch.opacity === undefined ? instance.opacity : Math.min(1, Math.max(0, patch.opacity)),
        name: patch.name === undefined ? instance.name : patch.name.trim() || instance.name,
      }
    }),
  }))
}

export function updateInstances(
  document: GraphDocument,
  sceneId: string,
  updater: (instance: SceneInstance) => (Partial<SceneInstance> & { props?: Record<string, SceneValue> }) | null,
): GraphDocument {
  return mapScene(document, sceneId, (scene) => ({
    ...scene,
    instances: scene.instances.map((instance) => {
      const patch = updater(instance)
      if (!patch) return instance
      const props = patch.props ? { ...instance.props, ...patch.props } : instance.props
      return {
        ...instance,
        ...patch,
        props,
        width: patch.width === undefined ? instance.width : Math.max(MIN_SIZE, patch.width),
        height: patch.height === undefined ? instance.height : Math.max(MIN_SIZE, patch.height),
        opacity: patch.opacity === undefined ? instance.opacity : Math.min(1, Math.max(0, patch.opacity)),
        name: patch.name === undefined ? instance.name : patch.name.trim() || instance.name,
      }
    }),
  }))
}

export function removeInstances(document: GraphDocument, sceneId: string, ids: readonly string[]): GraphDocument {
  const selected = new Set(ids)
  return mapScene(document, sceneId, (scene) => ({
    ...scene,
    instances: scene.instances.filter((instance) => !selected.has(instance.id)),
  }))
}

export function duplicateInstances(
  document: GraphDocument,
  sceneId: string,
  ids: readonly string[],
  offset = 16,
): { document: GraphDocument; instanceIds: string[] } {
  const scene = requireScene(document, sceneId)
  const created: SceneInstance[] = []
  for (const instance of scene.instances) {
    if (!ids.includes(instance.id)) continue
    created.push({
      ...instance,
      id: createId('inst'),
      name: instance.name,
      x: instance.x + offset,
      y: instance.y + offset,
      props: { ...instance.props },
    })
  }
  return {
    instanceIds: created.map((instance) => instance.id),
    document: mapScene(document, sceneId, (current) => ({ ...current, instances: [...current.instances, ...created] })),
  }
}

export function sendInstance(document: GraphDocument, sceneId: string, instanceId: string, direction: -1 | 1): GraphDocument {
  return mapScene(document, sceneId, (scene) => {
    const index = scene.instances.findIndex((instance) => instance.id === instanceId)
    const instance = scene.instances[index]
    if (!instance) return scene
    const siblings = scene.instances
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter((entry) => entry.item.layerId === instance.layerId)
    const position = siblings.findIndex((entry) => entry.item.id === instanceId)
    const swap = siblings[position + direction]
    if (!swap) return scene
    const instances = scene.instances.slice()
    const current = instances[index]
    const other = instances[swap.itemIndex]
    if (!current || !other) return scene
    instances[index] = other
    instances[swap.itemIndex] = current
    return { ...scene, instances }
  })
}

export function resizeBox(box: SceneBox, handle: ResizeHandle, worldDx: number, worldDy: number, min = MIN_SIZE): SceneBox {
  const local = worldToLocal(worldDx, worldDy, box.angle)
  let left = 0
  let top = 0
  let right = box.width
  let bottom = box.height
  if (handle.includes('w')) left += local.x
  if (handle.includes('e')) right += local.x
  if (handle.includes('n')) top += local.y
  if (handle.includes('s')) bottom += local.y
  if (right - left < min) {
    if (handle.includes('w') && !handle.includes('e')) left = right - min
    else right = left + min
  }
  if (bottom - top < min) {
    if (handle.includes('n') && !handle.includes('s')) top = bottom - min
    else bottom = top + min
  }
  const shift = localToWorld(left, top, box.angle)
  return {
    x: box.x + shift.x,
    y: box.y + shift.y,
    width: right - left,
    height: bottom - top,
    angle: box.angle,
  }
}

export function angleFromPointer(box: SceneBox, pointerX: number, pointerY: number): number {
  const radians = Math.atan2(pointerY - (box.y + box.height / 2), pointerX - (box.x + box.width / 2))
  const degrees = (radians * 180) / Math.PI + 90
  return (degrees + 360) % 360
}

export function instanceBounds(instance: SceneBox): { left: number; top: number; right: number; bottom: number } {
  const centerX = instance.x + instance.width / 2
  const centerY = instance.y + instance.height / 2
  const radians = (instance.angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const corners = [
    [-instance.width / 2, -instance.height / 2],
    [instance.width / 2, -instance.height / 2],
    [instance.width / 2, instance.height / 2],
    [-instance.width / 2, instance.height / 2],
  ]
  const points = corners.map(([x, y]) => ({ x: centerX + x * cos - y * sin, y: centerY + x * sin + y * cos }))
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  }
}

export function boundsIntersect(
  left: number,
  top: number,
  right: number,
  bottom: number,
  other: { left: number; top: number; right: number; bottom: number },
): boolean {
  return left < other.right && right > other.left && top < other.bottom && bottom > other.top
}

export function snapValue(value: number, grid: number): number {
  if (grid <= 1) return value
  return Math.round(value / grid) * grid
}

function worldToLocal(x: number, y: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: x * cos + y * sin, y: -x * sin + y * cos }
}

function localToWorld(x: number, y: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

function mapScene(
  document: GraphDocument,
  sceneId: string,
  mapper: (scene: Scene) => Scene,
  activeLayerId?: string,
): GraphDocument {
  if (!document.scenes.scenes.some((scene) => scene.id === sceneId)) throw new EngineError('Сцена не найдена')
  return {
    ...document,
    scenes: {
      ...document.scenes,
      activeLayerId: activeLayerId ?? document.scenes.activeLayerId,
      scenes: document.scenes.scenes.map((scene) => (scene.id === sceneId ? mapper(scene) : scene)),
    },
  }
}

function requireScene(document: GraphDocument, sceneId: string): Scene {
  const scene = document.scenes.scenes.find((item) => item.id === sceneId)
  if (!scene) throw new EngineError('Сцена не найдена')
  return scene
}

function requireType(document: GraphDocument, typeId: string): SceneObjectType {
  const type = document.scenes.objectTypes.find((item) => item.id === typeId)
  if (!type) throw new EngineError('Объект не найден')
  return type
}

function defaultSize(type: SceneObjectType): { width: number; height: number } {
  if (type.kind === 'core.text') return { width: 280, height: 72 }
  if (type.kind === 'core.sprite') return { width: 128, height: 128 }
  return { width: 160, height: 96 }
}

function sceneOf(name: string, layers?: SceneLayer[]): Scene {
  const layer = layers ?? [layerOf('Слой 0')]
  return {
    id: createId('scene'),
    name,
    width: 1280,
    height: 720,
    background: '#172033',
    layers: layer,
    instances: [],
  }
}

function layerOf(name: string, id = createId('layer')): SceneLayer {
  return { id, name, visible: true, locked: false }
}

function objectType(name: string, kind: string, defaults: Record<string, SceneValue>, id = createId('type')): SceneObjectType {
  return { id, name, kind, defaults: { ...defaults } }
}

function instanceOf(
  type: SceneObjectType,
  layerId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  id = createId('inst'),
): SceneInstance {
  return {
    id,
    typeId: type.id,
    layerId,
    name: type.name,
    x,
    y,
    width,
    height,
    angle: 0,
    opacity: 1,
    props: { ...type.defaults },
  }
}

function uniqueName(names: string[], base: string): string {
  if (!names.includes(base)) return base
  let index = 2
  while (names.includes(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

function clampSize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function parseSceneProject(raw: unknown): SceneProject {
  if (raw === undefined) return createBlankSceneProject()
  if (!isRecord(raw)) throw new EngineError('Поле scenes должно быть объектом')
  const scenes = expectArray(raw.scenes, 'scenes').map(parseScene)
  if (scenes.length === 0) return createBlankSceneProject()
  assertUnique(scenes.map((scene) => scene.id), 'сцен')
  const objectTypes = expectArray(raw.objectTypes, 'objectTypes').map(parseObjectType)
  assertUnique(objectTypes.map((type) => type.id), 'объектов')
  const active = scenes.find((scene) => scene.id === raw.activeSceneId) ?? scenes[0]
  if (!active) return createBlankSceneProject()
  const layer = active.layers.find((item) => item.id === raw.activeLayerId) ?? active.layers[0]
  if (!layer) throw new EngineError('У сцены нет слоя')
  return { activeSceneId: active.id, activeLayerId: layer.id, objectTypes, scenes }
}

function parseScene(raw: unknown): Scene {
  if (!isRecord(raw)) throw new EngineError('Сцена должна быть объектом')
  const layers = expectArray(raw.layers, 'layers').map(parseLayer)
  if (layers.length === 0) throw new EngineError('У сцены нет слоя')
  assertUnique(layers.map((layer) => layer.id), 'слоёв')
  const layerIds = new Set(layers.map((layer) => layer.id))
  const instances = expectArray(raw.instances, 'instances').map((item) => parseInstance(item, layerIds))
  assertUnique(instances.map((instance) => instance.id), 'экземпляров')
  return {
    id: expectString(raw.id, 'scene.id'),
    name: expectString(raw.name, 'scene.name'),
    width: expectFinite(raw.width, 'scene.width'),
    height: expectFinite(raw.height, 'scene.height'),
    background: expectString(raw.background, 'scene.background'),
    layers,
    instances,
  }
}

function parseLayer(raw: unknown): SceneLayer {
  if (!isRecord(raw)) throw new EngineError('Слой должен быть объектом')
  return {
    id: expectString(raw.id, 'layer.id'),
    name: expectString(raw.name, 'layer.name'),
    visible: raw.visible !== false,
    locked: raw.locked === true,
  }
}

function parseObjectType(raw: unknown): SceneObjectType {
  if (!isRecord(raw)) throw new EngineError('Тип объекта должен быть объектом')
  return {
    id: expectString(raw.id, 'objectType.id'),
    name: expectString(raw.name, 'objectType.name'),
    kind: expectString(raw.kind, 'objectType.kind'),
    defaults: parseProps(raw.defaults),
  }
}

function parseInstance(raw: unknown, layerIds: Set<string>): SceneInstance {
  if (!isRecord(raw)) throw new EngineError('Экземпляр должен быть объектом')
  const layerId = expectString(raw.layerId, 'instance.layerId')
  if (!layerIds.has(layerId)) throw new EngineError('Экземпляр ссылается на отсутствующий слой')
  return {
    id: expectString(raw.id, 'instance.id'),
    typeId: expectString(raw.typeId, 'instance.typeId'),
    layerId,
    name: expectString(raw.name, 'instance.name'),
    x: expectFinite(raw.x, 'instance.x'),
    y: expectFinite(raw.y, 'instance.y'),
    width: expectFinite(raw.width, 'instance.width'),
    height: expectFinite(raw.height, 'instance.height'),
    angle: typeof raw.angle === 'number' && Number.isFinite(raw.angle) ? raw.angle : 0,
    opacity: typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) ? Math.min(1, Math.max(0, raw.opacity)) : 1,
    props: parseProps(raw.props),
  }
}

function parseProps(raw: unknown): Record<string, SceneValue> {
  if (raw === undefined) return {}
  if (!isRecord(raw)) throw new EngineError('Свойства объекта должны быть объектом')
  const props: Record<string, SceneValue> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'boolean' || value === null) props[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) props[key] = value
    else throw new EngineError(`Свойство «${key}» содержит неподдерживаемое значение`)
  }
  return props
}

function expectArray(raw: unknown, label: string): unknown[] {
  if (!Array.isArray(raw)) throw new EngineError(`Поле ${label} должно быть массивом`)
  return raw
}

function expectString(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') throw new EngineError(`Поле ${label} должно быть непустой строкой`)
  return raw
}

function expectFinite(raw: unknown, label: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new EngineError(`Поле ${label} должно быть числом`)
  return raw
}

function assertUnique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new EngineError(`В документе повторяются идентификаторы ${label}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
