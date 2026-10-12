import { definePlugin, stringValue } from './core'

/**
 * Reference plugin.
 * Plugins are TypeScript modules. The project file never contains executable code;
 * a plugin registers types, and the core is the only thing that runs a graph.
 */
export const notePlugin = definePlugin({
  id: 'example.notes',
  name: 'Заметки',
  version: '0.1.0',
  description: 'Пример плагина: комментарий на графе, который исполнитель пропускает.',
  register(api) {
    api.registerCategory({
      id: 'examples',
      label: 'Примеры',
      color: '#7f8c99',
    })
    api.registerNodeType({
      id: 'example.note',
      title: 'Заметка',
      category: 'examples',
      description: 'Текст на графе. На выполнение программы не влияет.',
      role: 'inert',
      inputs: [],
      outputs: [],
      properties: [
        {
          id: 'text',
          label: 'Текст',
          dataType: 'string',
          defaultValue: stringValue('Заметка'),
          widget: 'text',
        },
      ],
    })
  },
})
