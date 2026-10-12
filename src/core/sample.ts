import { addNode, connectNodes, createDocument, createNode, setNodeProperty } from './document'
import type { Registry } from './registry'
import { createDemoSceneProject } from './scene'
import type { GraphDocument } from './types'
import { numberValue, stringValue } from './values'

/** A small program: print a greeting, then print 2 + 40. */
export function createDemoDocument(registry: Registry): GraphDocument {
  let document = createDocument('Пример')
  document = { ...document, id: 'doc_demo' }

  const place = (typeId: string, id: string, x: number, y: number) => {
    document = addNode(document, createNode(registry, typeId, x, y, id))
  }

  place('core.event.start', 'start', 80, 200)
  place('core.flow.sequence', 'sequence', 360, 188)
  place('core.data.string', 'greeting', 360, 28)
  place('core.debug.print', 'print_greeting', 680, 28)
  place('core.data.number', 'two', 80, 390)
  place('core.data.number', 'forty', 80, 510)
  place('core.math.add', 'sum', 360, 430)
  place('core.debug.print', 'print_sum', 680, 400)

  document = setNodeProperty(document, 'greeting', 'value', stringValue('Привет из NStudio'))
  document = setNodeProperty(document, 'two', 'value', numberValue(2))
  document = setNodeProperty(document, 'forty', 'value', numberValue(40))

  const link = (fromNode: string, fromPort: string, toNode: string, toPort: string) => {
    const result = connectNodes(document, registry, fromNode, fromPort, toNode, toPort)
    if (!result.ok) throw new Error(result.diagnostic?.message ?? 'Не удалось собрать пример')
    document = result.document
  }

  link('start', 'then', 'sequence', 'exec')
  link('sequence', 'a', 'print_greeting', 'exec')
  link('greeting', 'value', 'print_greeting', 'value')
  link('sequence', 'b', 'print_sum', 'exec')
  link('two', 'value', 'sum', 'a')
  link('forty', 'value', 'sum', 'b')
  link('sum', 'result', 'print_sum', 'value')
  const scenes = createDemoSceneProject()
  document = {
    ...document,
    scenes: {
      ...scenes,
      scenes: scenes.scenes.map((scene) =>
        scene.id === scenes.activeSceneId ? { ...scene, nodes: document.nodes, edges: document.edges } : scene,
      ),
    },
  }

  return document
}

export function createBlankDocument(registry: Registry): GraphDocument {
  const start = createNode(registry, 'core.event.start', 140, 180)
  return addNode(createDocument('Без названия'), start)
}
