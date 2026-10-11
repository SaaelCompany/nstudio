import { definePlugin } from './plugin'
import type { NodeTypeDefinition } from './types'
import { asNumber, booleanValue, formatValue, isTruthy, numberValue, stringValue, valuesEqual } from './values'

const numberPort = (id: string, label: string) => ({ id, label, kind: 'data' as const, dataType: 'number' })
const booleanPort = (id: string, label: string) => ({ id, label, kind: 'data' as const, dataType: 'boolean' })
const stringPort = (id: string, label: string) => ({ id, label, kind: 'data' as const, dataType: 'string' })
const anyPort = (id: string, label: string) => ({ id, label, kind: 'data' as const, dataType: 'any' })
const execIn = { id: 'exec', label: 'Выполнить', kind: 'exec' as const }
const execOut = (id: string, label: string) => ({ id, label, kind: 'exec' as const })

function literal(id: string, title: string, description: string, dataType: 'number' | 'string' | 'boolean', sample: ReturnType<typeof numberValue>): NodeTypeDefinition {
  return {
    id,
    title,
    category: 'data',
    description,
    role: 'pure',
    inputs: [],
    outputs: [{ id: 'value', label: 'Значение', kind: 'data', dataType }],
    properties: [{ id: 'value', label: 'Значение', dataType, defaultValue: sample }],
    compute(ctx) {
      ctx.setOutput('value', ctx.getProperty('value'))
    },
  }
}

function binaryMath(id: string, title: string, description: string, op: (left: number, right: number) => number): NodeTypeDefinition {
  return {
    id,
    title,
    category: 'math',
    description,
    role: 'pure',
    inputs: [numberPort('a', 'A'), numberPort('b', 'B')],
    outputs: [numberPort('result', 'Результат')],
    properties: [],
    compute(ctx) {
      ctx.setOutput('result', numberValue(op(asNumber(ctx.getInput('a')), asNumber(ctx.getInput('b')))))
    },
  }
}

function binaryLogic(id: string, title: string, description: string, op: (left: boolean, right: boolean) => boolean): NodeTypeDefinition {
  return {
    id,
    title,
    category: 'logic',
    description,
    role: 'pure',
    inputs: [booleanPort('a', 'A'), booleanPort('b', 'B')],
    outputs: [booleanPort('result', 'Результат')],
    properties: [],
    compute(ctx) {
      ctx.setOutput('result', booleanValue(op(isTruthy(ctx.getInput('a')), isTruthy(ctx.getInput('b')))))
    },
  }
}

const compareOptions = [
  { value: 'eq', label: 'Равно' },
  { value: 'neq', label: 'Не равно' },
  { value: 'gt', label: 'Больше' },
  { value: 'gte', label: 'Больше или равно' },
  { value: 'lt', label: 'Меньше' },
  { value: 'lte', label: 'Меньше или равно' },
]

export const corePlugin = definePlugin({
  id: 'core',
  name: 'Ядро',
  version: '0.1.0',
  description: 'События, поток выполнения, данные, математика, логика, переменные и печать.',
  register(api) {
    api.registerCategory({ id: 'events', label: 'События', color: '#e25b45' })
    api.registerCategory({ id: 'flow', label: 'Поток', color: '#e09a3e' })
    api.registerCategory({ id: 'data', label: 'Данные', color: '#3cba8b' })
    api.registerCategory({ id: 'math', label: 'Математика', color: '#e0b03a' })
    api.registerCategory({ id: 'logic', label: 'Логика', color: '#6b93f0' })
    api.registerCategory({ id: 'variables', label: 'Переменные', color: '#b388e8' })
    api.registerCategory({ id: 'debug', label: 'Отладка', color: '#8e99a8' })

    api.registerDataType({
      id: 'number',
      label: 'Число',
      color: '#e0b03a',
      defaultValue: () => numberValue(0),
    })
    api.registerDataType({
      id: 'string',
      label: 'Строка',
      color: '#3cba8b',
      defaultValue: () => stringValue(''),
    })
    api.registerDataType({
      id: 'boolean',
      label: 'Логическое',
      color: '#6b93f0',
      defaultValue: () => booleanValue(false),
    })
    api.registerDataType({
      id: 'any',
      label: 'Любой',
      color: '#a8b0bc',
      defaultValue: () => ({ type: 'any', data: null }),
    })

    api.registerNodeType({
      id: 'core.event.start',
      title: 'Старт',
      category: 'events',
      description: 'Точка входа. Срабатывает один раз при запуске.',
      role: 'event',
      event: 'start',
      inputs: [],
      outputs: [execOut('then', 'Далее')],
      properties: [],
    })

    api.registerNodeType({
      id: 'core.flow.sequence',
      title: 'Последовательность',
      category: 'flow',
      description: 'Сначала выполняет «Затем 1», после него — «Затем 2».',
      role: 'exec',
      inputs: [execIn],
      outputs: [execOut('a', 'Затем 1'), execOut('b', 'Затем 2')],
      properties: [],
      execute(ctx) {
        ctx.trigger('a')
        ctx.trigger('b')
      },
    })

    api.registerNodeType({
      id: 'core.flow.branch',
      title: 'Ветвление',
      category: 'flow',
      description: 'Идёт по выходу «Да», если условие истинно, иначе по «Нет».',
      role: 'exec',
      inputs: [execIn, booleanPort('condition', 'Условие')],
      outputs: [execOut('true', 'Да'), execOut('false', 'Нет')],
      properties: [],
      execute(ctx) {
        ctx.trigger(isTruthy(ctx.getInput('condition')) ? 'true' : 'false')
      },
    })

    api.registerNodeType({
      id: 'core.flow.repeat',
      title: 'Повтор',
      category: 'flow',
      description: 'Выполняет «Цикл» указанное число раз, затем «Готово». Индекс начинается с нуля.',
      role: 'exec',
      inputs: [execIn, numberPort('count', 'Сколько')],
      outputs: [execOut('loop', 'Цикл'), execOut('done', 'Готово'), numberPort('index', 'Индекс')],
      properties: [],
      execute(ctx) {
        const count = Math.floor(asNumber(ctx.getInput('count')))
        if (Number.isFinite(count) && count > 0) {
          for (let index = 0; index < count; index += 1) {
            ctx.setOutput('index', numberValue(index))
            if (!ctx.trigger('loop')) return
          }
        }
        ctx.trigger('done')
      },
    })

    api.registerNodeType(literal('core.data.number', 'Число', 'Постоянное число.', 'number', numberValue(0)))
    api.registerNodeType(literal('core.data.string', 'Строка', 'Постоянный текст.', 'string', stringValue('')))
    api.registerNodeType(literal('core.data.boolean', 'Логическое', 'Постоянное логическое значение.', 'boolean', booleanValue(false)))

    api.registerNodeType({
      id: 'core.string.concat',
      title: 'Склеить текст',
      category: 'data',
      description: 'Соединяет две строки в одну.',
      role: 'pure',
      inputs: [stringPort('a', 'A'), stringPort('b', 'B')],
      outputs: [stringPort('result', 'Результат')],
      properties: [],
      compute(ctx) {
        const left = ctx.getInput('a').data
        const right = ctx.getInput('b').data
        ctx.setOutput('result', stringValue(`${typeof left === 'string' ? left : ''}${typeof right === 'string' ? right : ''}`))
      },
    })

    api.registerNodeType(binaryMath('core.math.add', 'Сложение', 'A + B', (left, right) => left + right))
    api.registerNodeType(binaryMath('core.math.subtract', 'Вычитание', 'A − B', (left, right) => left - right))
    api.registerNodeType(binaryMath('core.math.multiply', 'Умножение', 'A × B', (left, right) => left * right))
    api.registerNodeType(binaryMath('core.math.divide', 'Деление', 'A ÷ B', (left, right) => left / right))
    api.registerNodeType(binaryMath('core.math.modulo', 'Остаток', 'Остаток от деления A на B', (left, right) => left % right))

    api.registerNodeType({
      id: 'core.math.compare',
      title: 'Сравнение',
      category: 'math',
      description: 'Сравнивает два значения. Порядок «больше» и «меньше» считается по числам, равенство — по значению.',
      role: 'pure',
      inputs: [anyPort('a', 'A'), anyPort('b', 'B')],
      outputs: [booleanPort('result', 'Результат')],
      properties: [
        {
          id: 'op',
          label: 'Оператор',
          dataType: 'string',
          defaultValue: stringValue('eq'),
          options: compareOptions,
        },
      ],
      compute(ctx) {
        const op = String(ctx.getProperty('op').data)
        const left = ctx.getInput('a')
        const right = ctx.getInput('b')
        let result = false
        if (op === 'eq') result = valuesEqual(left, right)
        else if (op === 'neq') result = !valuesEqual(left, right)
        else if (op === 'gt') result = asNumber(left) > asNumber(right)
        else if (op === 'gte') result = asNumber(left) >= asNumber(right)
        else if (op === 'lt') result = asNumber(left) < asNumber(right)
        else if (op === 'lte') result = asNumber(left) <= asNumber(right)
        ctx.setOutput('result', booleanValue(result))
      },
    })

    api.registerNodeType(binaryLogic('core.logic.and', 'И', 'Истинно, когда истинны оба входа.', (left, right) => left && right))
    api.registerNodeType(binaryLogic('core.logic.or', 'Или', 'Истинно, когда истинен хотя бы один вход.', (left, right) => left || right))
    api.registerNodeType({
      id: 'core.logic.not',
      title: 'Не',
      category: 'logic',
      description: 'Инвертирует логическое значение.',
      role: 'pure',
      inputs: [booleanPort('value', 'Значение')],
      outputs: [booleanPort('result', 'Результат')],
      properties: [],
      compute(ctx) {
        ctx.setOutput('result', booleanValue(!isTruthy(ctx.getInput('value'))))
      },
    })

    api.registerNodeType({
      id: 'core.var.get',
      title: 'Прочитать',
      category: 'variables',
      description: 'Читает текущее значение переменной.',
      role: 'pure',
      inputs: [],
      outputs: [anyPort('value', 'Значение')],
      properties: [
        {
          id: 'name',
          label: 'Переменная',
          dataType: 'string',
          defaultValue: stringValue(''),
          widget: 'variable',
        },
      ],
      compute(ctx) {
        ctx.setOutput('value', ctx.getVariable(String(ctx.getProperty('name').data ?? '')))
      },
    })

    api.registerNodeType({
      id: 'core.var.set',
      title: 'Записать',
      category: 'variables',
      description: 'Записывает значение в переменную и передаёт управление дальше.',
      role: 'exec',
      inputs: [execIn, anyPort('value', 'Значение')],
      outputs: [execOut('then', 'Далее')],
      properties: [
        {
          id: 'name',
          label: 'Переменная',
          dataType: 'string',
          defaultValue: stringValue(''),
          widget: 'variable',
        },
      ],
      execute(ctx) {
        ctx.setVariable(String(ctx.getProperty('name').data ?? ''), ctx.getInput('value'))
        ctx.trigger('then')
      },
    })

    api.registerNodeType({
      id: 'core.debug.print',
      title: 'Печать',
      category: 'debug',
      description: 'Пишет значение в консоль запуска и передаёт управление дальше.',
      role: 'exec',
      inputs: [execIn, anyPort('value', 'Значение')],
      outputs: [execOut('then', 'Далее')],
      properties: [],
      execute(ctx) {
        ctx.log(formatValue(ctx.getInput('value')))
        ctx.trigger('then')
      },
    })
  },
})
