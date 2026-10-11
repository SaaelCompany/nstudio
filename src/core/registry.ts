import { EngineError } from './errors'
import { CATEGORY_ID, EVENT_NAME, NODE_TYPE_ID, PLUGIN_ID, PORT_ID } from './ids'
import type {
  CategoryDefinition,
  DataTypeDefinition,
  EnginePlugin,
  NodeTypeDefinition,
  PluginApi,
  PluginInfo,
  PortDefinition,
  PropertyDefinition,
} from './types'

interface Snapshot {
  categories: Map<string, CategoryDefinition>
  dataTypes: Map<string, DataTypeDefinition>
  nodeTypes: Map<string, NodeTypeDefinition>
  owners: Map<string, string>
}

/**
 * Plugin registry. Definitions are append-only for a successful plugin;
 * a plugin that throws while registering is rolled back entirely.
 */
export class Registry {
  private categories = new Map<string, CategoryDefinition>()
  private dataTypes = new Map<string, DataTypeDefinition>()
  private nodeTypes = new Map<string, NodeTypeDefinition>()
  private owners = new Map<string, string>()
  private plugins: PluginInfo[] = []
  private currentPlugin: string | null = null
  private snapshot: Snapshot | null = null

  readonly api: PluginApi = {
    registerCategory: (category) => this.registerCategory(category),
    registerDataType: (dataType) => this.registerDataType(dataType),
    registerNodeType: (nodeType) => this.registerNodeType(nodeType),
  }

  beginPlugin(plugin: EnginePlugin): void {
    if (!PLUGIN_ID.test(plugin.id)) {
      throw new EngineError(`Идентификатор плагина «${plugin.id}» должен быть вроде core или example.notes`)
    }
    if (this.plugins.some((item) => item.id === plugin.id) || this.currentPlugin === plugin.id) {
      throw new EngineError(`Плагин «${plugin.id}» уже подключён`)
    }
    if (this.currentPlugin) {
      throw new EngineError('Нельзя подключать плагин, пока другой ещё регистрируется')
    }
    this.currentPlugin = plugin.id
    this.snapshot = {
      categories: new Map(this.categories),
      dataTypes: new Map(this.dataTypes),
      nodeTypes: new Map(this.nodeTypes),
      owners: new Map(this.owners),
    }
  }

  commitPlugin(plugin: EnginePlugin): void {
    this.plugins.push({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
    })
    this.currentPlugin = null
    this.snapshot = null
  }

  rollbackPlugin(): void {
    if (this.snapshot) {
      this.categories = this.snapshot.categories
      this.dataTypes = this.snapshot.dataTypes
      this.nodeTypes = this.snapshot.nodeTypes
      this.owners = this.snapshot.owners
    }
    this.currentPlugin = null
    this.snapshot = null
  }

  registerCategory(category: CategoryDefinition): void {
    this.assertPlugin()
    if (!CATEGORY_ID.test(category.id)) {
      throw new EngineError(`Идентификатор категории «${category.id}» содержит недопустимые символы`)
    }
    if (this.categories.has(category.id)) {
      throw new EngineError(`Категория «${category.id}» уже зарегистрирована`)
    }
    if (!category.label.trim()) throw new EngineError('У категории пустое название')
    this.categories.set(category.id, { ...category })
  }

  registerDataType(dataType: DataTypeDefinition): void {
    this.assertPlugin()
    if (!CATEGORY_ID.test(dataType.id)) {
      throw new EngineError(`Идентификатор типа «${dataType.id}» содержит недопустимые символы`)
    }
    if (this.dataTypes.has(dataType.id)) {
      throw new EngineError(`Тип данных «${dataType.id}» уже зарегистрирован`)
    }
    const sample = dataType.defaultValue()
    if (sample.type !== dataType.id && dataType.id !== 'any') {
      throw new EngineError(`Значение по умолчанию типа «${dataType.id}» имеет тип «${sample.type}»`)
    }
    this.dataTypes.set(dataType.id, {
      ...dataType,
      accepts: dataType.accepts ? [...dataType.accepts] : undefined,
    })
  }

  registerNodeType(nodeType: NodeTypeDefinition): void {
    this.assertPlugin()
    if (!NODE_TYPE_ID.test(nodeType.id)) {
      throw new EngineError(`Идентификатор ноды «${nodeType.id}» должен быть вроде core.math.add`)
    }
    if (this.nodeTypes.has(nodeType.id)) {
      throw new EngineError(`Тип ноды «${nodeType.id}» уже зарегистрирован`)
    }
    if (!this.categories.has(nodeType.category)) {
      throw new EngineError(`Нода «${nodeType.id}» ссылается на неизвестную категорию «${nodeType.category}»`)
    }
    this.assertRole(nodeType)
    const inputs = nodeType.inputs.map((port) => this.copyPort(nodeType.id, port))
    const outputs = nodeType.outputs.map((port) => this.copyPort(nodeType.id, port))
    const seen = new Set<string>()
    for (const port of [...inputs, ...outputs]) {
      if (seen.has(port.id)) {
        throw new EngineError(`У ноды «${nodeType.id}» повторяется порт «${port.id}»`)
      }
      seen.add(port.id)
    }
    const properties = nodeType.properties.map((property) => this.copyProperty(nodeType.id, property))
    this.nodeTypes.set(nodeType.id, {
      ...nodeType,
      inputs,
      outputs,
      properties,
    })
    this.owners.set(nodeType.id, this.currentPlugin!)
  }

  getCategory(id: string): CategoryDefinition | undefined {
    return this.categories.get(id)
  }

  getDataType(id: string): DataTypeDefinition | undefined {
    return this.dataTypes.get(id)
  }

  getNodeType(id: string): NodeTypeDefinition | undefined {
    return this.nodeTypes.get(id)
  }

  getNodeOwner(typeId: string): string | undefined {
    return this.owners.get(typeId)
  }

  requireDataType(id: string): DataTypeDefinition {
    const found = this.dataTypes.get(id)
    if (!found) throw new EngineError(`Неизвестный тип данных «${id}»`)
    return found
  }

  listCategories(): CategoryDefinition[] {
    return [...this.categories.values()]
  }

  listDataTypes(): DataTypeDefinition[] {
    return [...this.dataTypes.values()]
  }

  listNodeTypes(): NodeTypeDefinition[] {
    const order = this.listCategories().map((category) => category.id)
    return [...this.nodeTypes.values()].sort((left, right) => {
      const byCategory = order.indexOf(left.category) - order.indexOf(right.category)
      if (byCategory !== 0) return byCategory
      return left.title.localeCompare(right.title, 'ru')
    })
  }

  listPlugins(): PluginInfo[] {
    return this.plugins.map((plugin) => ({ ...plugin }))
  }

  private assertPlugin(): void {
    if (!this.currentPlugin) {
      throw new EngineError('Регистрация доступна только из метода register плагина')
    }
  }

  private assertRole(nodeType: NodeTypeDefinition): void {
    const execInputs = nodeType.inputs.filter((port) => port.kind === 'exec')
    const execOutputs = nodeType.outputs.filter((port) => port.kind === 'exec')
    if (nodeType.role === 'event') {
      if (!nodeType.event || !EVENT_NAME.test(nodeType.event)) {
        throw new EngineError(`Событийная нода «${nodeType.id}» должна назвать событие, например start`)
      }
      if (execInputs.length > 0) {
        throw new EngineError(`Событийная нода «${nodeType.id}» не принимает вход потока`)
      }
      if (!nodeType.execute && execOutputs.length === 0) {
        throw new EngineError(`Событийная нода «${nodeType.id}» должна иметь выход потока или execute`)
      }
    } else if (nodeType.event) {
      throw new EngineError(`Событие можно задать только у ноды с ролью event («${nodeType.id}»)`)
    }

    if (nodeType.role === 'exec') {
      if (execInputs.length === 0) {
        throw new EngineError(`Исполняемая нода «${nodeType.id}» должна иметь вход потока`)
      }
      if (!nodeType.execute) {
        throw new EngineError(`Исполняемая нода «${nodeType.id}» должна реализовать execute`)
      }
    }

    if (nodeType.role === 'pure') {
      if (execInputs.length > 0 || execOutputs.length > 0) {
        throw new EngineError(`Чистая нода «${nodeType.id}» не может иметь порты потока`)
      }
      if (!nodeType.compute) {
        throw new EngineError(`Чистая нода «${nodeType.id}» должна реализовать compute`)
      }
      if (!nodeType.outputs.some((port) => port.kind === 'data')) {
        throw new EngineError(`Чистая нода «${nodeType.id}» должна иметь выход данных`)
      }
    }

    if (nodeType.role === 'inert') {
      if (nodeType.inputs.length > 0 || nodeType.outputs.length > 0 || nodeType.compute || nodeType.execute) {
        throw new EngineError(`Инертная нода «${nodeType.id}» хранит только свойства`)
      }
    }
  }

  private copyPort(nodeId: string, port: PortDefinition): PortDefinition {
    if (!PORT_ID.test(port.id)) {
      throw new EngineError(`Порт «${port.id}» ноды «${nodeId}» имеет недопустимый идентификатор`)
    }
    if (!port.label.trim()) throw new EngineError(`У порта «${port.id}» ноды «${nodeId}» пустая подпись`)
    if (port.kind === 'data') {
      if (!port.dataType || !this.dataTypes.has(port.dataType)) {
        throw new EngineError(`Порт «${port.id}» ноды «${nodeId}» ссылается на неизвестный тип данных`)
      }
      return { id: port.id, label: port.label, kind: port.kind, dataType: port.dataType }
    }
    if (port.dataType) {
      throw new EngineError(`Порт потока «${port.id}» ноды «${nodeId}» не должен иметь тип данных`)
    }
    return { id: port.id, label: port.label, kind: 'exec' }
  }

  private copyProperty(nodeId: string, property: PropertyDefinition): PropertyDefinition {
    if (!PORT_ID.test(property.id)) {
      throw new EngineError(`Свойство «${property.id}» ноды «${nodeId}» имеет недопустимый идентификатор`)
    }
    if (!this.dataTypes.has(property.dataType)) {
      throw new EngineError(`Свойство «${property.id}» ноды «${nodeId}» ссылается на неизвестный тип`)
    }
    if (property.defaultValue.type !== property.dataType && property.dataType !== 'any') {
      throw new EngineError(`Значение свойства «${property.id}» ноды «${nodeId}» не совпадает с его типом`)
    }
    if (property.options && !property.options.some((option) => option.value === property.defaultValue.data)) {
      throw new EngineError(`Значение свойства «${property.id}» ноды «${nodeId}» отсутствует среди вариантов`)
    }
    return {
      ...property,
      options: property.options?.map((option) => ({ ...option })),
      defaultValue: { type: property.defaultValue.type, data: structuredClone(property.defaultValue.data) },
    }
  }
}
