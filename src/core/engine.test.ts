import { describe, expect, it } from 'vitest'
import {
  addNode,
  addVariable,
  booleanValue,
  connectNodes,
  createNode,
  definePlugin,
  Engine,
  EngineError,
  numberValue,
  setNodeInput,
  setNodeProperty,
  stringValue,
  updateVariable,
} from './index'
import type { GraphDocument, Value } from './index'

function graph(engine = new Engine()) {
  let document = engine.createDocument('Тест')
  const ids = new Map<string, string>()
  const api = {
    engine,
    get document() {
      return document
    },
    node(key: string, typeId: string, x = 0, y = 0) {
      const node = createNode(engine.registry, typeId, x, y)
      ids.set(key, node.id)
      document = addNode(document, node)
      return api
    },
    prop(key: string, propertyId: string, value: Value) {
      document = setNodeProperty(document, id(key), propertyId, value)
      return api
    },
    input(key: string, portId: string, value: Value) {
      document = setNodeInput(document, id(key), portId, value)
      return api
    },
    link(from: string, fromPort: string, to: string, toPort: string) {
      const result = connectNodes(document, engine.registry, id(from), fromPort, id(to), toPort)
      expect(result.ok, result.diagnostic?.message).toBe(true)
      document = result.document
      return api
    },
    tryLink(from: string, fromPort: string, to: string, toPort: string) {
      return connectNodes(document, engine.registry, id(from), fromPort, id(to), toPort)
    },
    variable(name: string, dataType: string, value: Value) {
      document = addVariable(document, engine.registry, { name, dataType })
      const variable = document.variables.find((item) => item.name === name)
      if (!variable) throw new Error(`Переменная ${name} не создана`)
      document = updateVariable(document, variable.id, { value }, engine.registry)
      return api
    },
  }
  return api

  function id(key: string) {
    const found = ids.get(key)
    if (!found) throw new Error(`Нет ноды ${key}`)
    return found
  }
}

describe('plugin registry', () => {
  it('loads the core and rejects a second copy', () => {
    const engine = new Engine()
    expect(engine.listPlugins().map((plugin) => plugin.id)).toEqual(['core'])
    expect(engine.registry.listNodeTypes().length).toBeGreaterThan(10)
    expect(() => engine.use(engine.listPlugins()[0] as never)).toThrow(EngineError)
  })

  it('rolls back a plugin that fails while registering', () => {
    const engine = new Engine()
    const before = engine.registry.listCategories().map((category) => category.id)
    expect(() =>
      engine.use(
        definePlugin({
          id: 'broken.plugin',
          name: 'Сломанный',
          version: '0.0.0',
          register(api) {
            api.registerCategory({ id: 'temp', label: 'Временная', color: '#111111' })
            throw new Error('boom')
          },
        }),
      ),
    ).toThrow('boom')
    expect(engine.registry.listCategories().map((category) => category.id)).toEqual(before)
    expect(engine.listPlugins().some((plugin) => plugin.id === 'broken.plugin')).toBe(false)
  })

  it('rejects a pure node that declares an exec port', () => {
    const engine = new Engine()
    expect(() =>
      engine.use(
        definePlugin({
          id: 'bad.nodes',
          name: 'Плохие',
          version: '0.0.0',
          register(api) {
            api.registerNodeType({
              id: 'bad.nodes.pure',
              title: 'Плохая',
              category: 'data',
              description: '',
              role: 'pure',
              inputs: [{ id: 'exec', label: 'Поток', kind: 'exec' }],
              outputs: [{ id: 'value', label: 'Значение', kind: 'data', dataType: 'number' }],
              properties: [],
              compute() {},
            })
          },
        }),
      ),
    ).toThrow(EngineError)
    expect(engine.registry.getNodeType('bad.nodes.pure')).toBeUndefined()
    expect(engine.listPlugins().some((plugin) => plugin.id === 'bad.nodes')).toBe(false)
  })
})

describe('connections', () => {
  it('refuses to connect a string into a number and allows any', () => {
    const builder = graph()
    builder.node('text', 'core.data.string').node('sum', 'core.math.add').node('print', 'core.debug.print')
    const mismatch = builder.tryLink('text', 'value', 'sum', 'a')
    expect(mismatch.ok).toBe(false)
    expect(mismatch.diagnostic?.code).toBe('type-mismatch')
    expect(mismatch.document.edges).toHaveLength(0)

    builder.link('text', 'value', 'print', 'value')
    expect(builder.document.edges).toHaveLength(1)
  })

  it('replaces the previous wire into the same input', () => {
    const builder = graph()
    builder.node('a', 'core.data.number').node('b', 'core.data.number').node('sum', 'core.math.add')
    builder.link('a', 'value', 'sum', 'a').link('b', 'value', 'sum', 'a')
    expect(builder.document.edges).toHaveLength(1)
    expect(builder.document.edges[0]?.sourceNodeId).toBe(builder.document.nodes[1]?.id)
  })

  it('lets one output feed several inputs', () => {
    const builder = graph()
    builder.node('n', 'core.data.number').node('add', 'core.math.add').node('mul', 'core.math.multiply')
    builder.link('n', 'value', 'add', 'a').link('n', 'value', 'mul', 'a')
    expect(builder.document.edges).toHaveLength(2)
  })
})

describe('runtime', () => {
  it('runs the demo program', () => {
    const engine = new Engine()
    const result = engine.run(engine.createDemoDocument())
    expect(result.ok).toBe(true)
    expect(result.logs.map((entry) => entry.message)).toEqual(['Привет из NStudio', '42'])
  })

  it('follows the true branch and skips the false one', () => {
    const builder = graph()
    builder
      .node('start', 'core.event.start')
      .node('flag', 'core.data.boolean')
      .prop('flag', 'value', booleanValue(true))
      .node('branch', 'core.flow.branch')
      .node('yes', 'core.data.string')
      .prop('yes', 'value', stringValue('да'))
      .node('no', 'core.data.string')
      .prop('no', 'value', stringValue('нет'))
      .node('printYes', 'core.debug.print')
      .node('printNo', 'core.debug.print')
      .link('start', 'then', 'branch', 'exec')
      .link('flag', 'value', 'branch', 'condition')
      .link('branch', 'true', 'printYes', 'exec')
      .link('branch', 'false', 'printNo', 'exec')
      .link('yes', 'value', 'printYes', 'value')
      .link('no', 'value', 'printNo', 'value')

    const result = builder.engine.run(builder.document)
    expect(result.ok).toBe(true)
    expect(result.logs.map((entry) => entry.message)).toEqual(['да'])
  })

  it('repeats a body and exposes the index', () => {
    const builder = graph()
    builder
      .node('start', 'core.event.start')
      .node('repeat', 'core.flow.repeat')
      .input('repeat', 'count', numberValue(3))
      .node('print', 'core.debug.print')
      .link('start', 'then', 'repeat', 'exec')
      .link('repeat', 'loop', 'print', 'exec')
      .link('repeat', 'index', 'print', 'value')

    const result = builder.engine.run(builder.document)
    expect(result.logs.map((entry) => entry.message)).toEqual(['0', '1', '2'])
  })

  it('writes and then reads a variable', () => {
    const builder = graph()
    builder
      .variable('счёт', 'number', numberValue(0))
      .node('start', 'core.event.start')
      .node('amount', 'core.data.number')
      .prop('amount', 'value', numberValue(7))
      .node('set', 'core.var.set')
      .prop('set', 'name', stringValue('счёт'))
      .node('get', 'core.var.get')
      .prop('get', 'name', stringValue('счёт'))
      .node('print', 'core.debug.print')
      .link('start', 'then', 'set', 'exec')
      .link('amount', 'value', 'set', 'value')
      .link('set', 'then', 'print', 'exec')
      .link('get', 'value', 'print', 'value')

    const result = builder.engine.run(builder.document)
    expect(result.ok).toBe(true)
    expect(result.logs.map((entry) => entry.message)).toEqual(['7'])
    expect(result.variables.find((variable) => variable.name === 'счёт')?.value).toEqual(numberValue(7))
  })

  it('does not overwrite a variable with a value of the wrong type', () => {
    const builder = graph()
    builder
      .variable('счёт', 'number', numberValue(1))
      .node('start', 'core.event.start')
      .node('text', 'core.data.string')
      .prop('text', 'value', stringValue('нет'))
      .node('set', 'core.var.set')
      .prop('set', 'name', stringValue('счёт'))
      .link('start', 'then', 'set', 'exec')
      .link('text', 'value', 'set', 'value')

    const result = builder.engine.run(builder.document)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'variable-type')).toBe(true)
    expect(result.variables.find((variable) => variable.name === 'счёт')?.value).toEqual(numberValue(1))
  })

  it('evaluates math, text and logic', () => {
    const builder = graph()
    builder
      .node('start', 'core.event.start')
      .node('sequence', 'core.flow.sequence')
      .node('left', 'core.data.number')
      .prop('left', 'value', numberValue(7))
      .node('right', 'core.data.number')
      .prop('right', 'value', numberValue(3))
      .node('mod', 'core.math.modulo')
      .node('compare', 'core.math.compare')
      .prop('compare', 'op', stringValue('gt'))
      .node('printMod', 'core.debug.print')
      .node('printCmp', 'core.debug.print')
      .node('hello', 'core.data.string')
      .prop('hello', 'value', stringValue('N'))
      .node('world', 'core.data.string')
      .prop('world', 'value', stringValue('Studio'))
      .node('concat', 'core.string.concat')
      .node('printText', 'core.debug.print')
      .link('start', 'then', 'sequence', 'exec')
      .link('sequence', 'a', 'printMod', 'exec')
      .link('left', 'value', 'mod', 'a')
      .link('right', 'value', 'mod', 'b')
      .link('mod', 'result', 'printMod', 'value')
      .link('printMod', 'then', 'printCmp', 'exec')
      .link('left', 'value', 'compare', 'a')
      .link('right', 'value', 'compare', 'b')
      .link('compare', 'result', 'printCmp', 'value')
      .link('sequence', 'b', 'printText', 'exec')
      .link('hello', 'value', 'concat', 'a')
      .link('world', 'value', 'concat', 'b')
      .link('concat', 'result', 'printText', 'value')

    const result = builder.engine.run(builder.document)
    expect(result.logs.map((entry) => entry.message)).toEqual(['1', 'true', 'NStudio'])
  })

  it('stops an exec cycle without hanging', () => {
    const builder = graph()
    builder
      .node('start', 'core.event.start')
      .node('first', 'core.debug.print')
      .node('second', 'core.debug.print')
      .link('start', 'then', 'first', 'exec')
      .link('first', 'then', 'second', 'exec')
      .link('second', 'then', 'first', 'exec')

    const result = builder.engine.run(builder.document, { maxSteps: 12 })
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'exec-limit')).toBe(true)
  })

  it('stops a data cycle inside the runtime', () => {
    const builder = graph()
    builder
      .node('start', 'core.event.start')
      .node('a', 'core.math.add')
      .node('b', 'core.math.add')
      .node('print', 'core.debug.print')
      .link('start', 'then', 'print', 'exec')
      .link('a', 'result', 'print', 'value')
      .link('a', 'result', 'b', 'a')
      .link('b', 'result', 'a', 'a')

    expect(builder.engine.validate(builder.document).some((diagnostic) => diagnostic.code === 'data-cycle')).toBe(true)
    const blocked = builder.engine.run(builder.document)
    expect(blocked.ok).toBe(false)
    expect(blocked.logs).toEqual([])

    const forced = builder.engine.run(builder.document, { skipValidation: true, maxSteps: 20 })
    expect(forced.diagnostics.some((diagnostic) => diagnostic.code === 'data-cycle')).toBe(true)
  })

  it('warns when the chosen event has no nodes', () => {
    const engine = new Engine()
    const result = engine.run(engine.createDocument())
    expect(result.ok).toBe(true)
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'no-entry')).toBe(true)
  })

  it('runs a plugin event and reads the host payload', () => {
    const engine = new Engine()
    engine.use(
      definePlugin({
        id: 'test.tick',
        name: 'Тик',
        version: '0.0.0',
        register(api) {
          api.registerNodeType({
            id: 'test.tick.on',
            title: 'Тик',
            category: 'events',
            description: 'Срабатывает на событие tick.',
            role: 'event',
            event: 'tick',
            inputs: [],
            outputs: [{ id: 'then', label: 'Далее', kind: 'exec' }],
            properties: [],
            execute(ctx) {
              ctx.log(String(ctx.payload.dt ?? ''))
              ctx.trigger('then')
            },
          })
        },
      }),
    )

    const builder = graph(engine)
    builder
      .node('tick', 'test.tick.on')
      .node('print', 'core.debug.print')
      .node('text', 'core.data.string')
      .prop('text', 'value', stringValue('кадр'))
      .link('tick', 'then', 'print', 'exec')
      .link('text', 'value', 'print', 'value')

    const started = engine.run(builder.document, { event: 'start' })
    expect(started.logs).toEqual([])
    expect(started.diagnostics.some((diagnostic) => diagnostic.code === 'no-entry')).toBe(true)

    const ticked = engine.run(builder.document, { event: 'tick', payload: { dt: 0.5 } })
    expect(ticked.ok).toBe(true)
    expect(ticked.logs.map((entry) => entry.message)).toEqual(['0.5', 'кадр'])
  })
})

describe('documents', () => {
  it('round-trips a document and keeps plugin extensions', () => {
    const engine = new Engine()
    const document = engine.createDemoDocument()
    document.extensions['example.notes'] = { zoom: 1 }
    const node = document.nodes[0]
    if (!node) throw new Error('demo is empty')
    node.extensions.marker = { pinned: true }

    const copy = engine.deserialize(engine.serialize(document))
    expect(copy).toEqual(document)
  })

  it('rejects an unsupported document version', () => {
    const engine = new Engine()
    expect(() => engine.deserialize('{"version":99}')).toThrow(EngineError)
    expect(() => engine.deserialize('not json')).toThrow(EngineError)
  })

  it('keeps an unknown node so a missing plugin can be connected later', () => {
    const engine = new Engine()
    const document = engine.createDocument('Черновик')
    const stored: GraphDocument = {
      ...document,
      nodes: [
        {
          id: 'node_orphan',
          typeId: 'sprites.draw',
          x: 10,
          y: 20,
          properties: {},
          inputs: {},
          extensions: {},
        },
      ],
    }
    const copy = engine.deserialize(engine.serialize(stored))
    expect(copy.nodes[0]?.typeId).toBe('sprites.draw')
    expect(engine.validate(copy).some((diagnostic) => diagnostic.code === 'unknown-node-type')).toBe(true)
    expect(engine.run(copy).ok).toBe(false)
  })
})
