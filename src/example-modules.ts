import { definePlugin } from './core'
import type { SceneValue } from './core'

/**
 * Optional modules. They stay unloaded until the host connects them,
 * so the modules menu has something to add besides the core.
 */
export const extrasPlugin = definePlugin({
  id: 'example.modules',
  name: 'Дополнительные модули',
  version: '0.1.0',
  description: 'Эффект «Свечение» и поведение «Отскок».',
  register(api) {
    api.registerEffect({
      id: 'example.effect.glow',
      title: 'Свечение',
      description: 'Мягкая цветная тень вокруг объекта на макете.',
      fields: [
        { id: 'color', label: 'Цвет', kind: 'color' },
        { id: 'radius', label: 'Радиус', kind: 'number' },
      ],
      defaultProps: { color: '#7eb6ff', radius: 16 },
      filter: (props) => `drop-shadow(0 0 ${unit(props.radius, 16, 0, 80)}px ${cssColor(props.color, '#7eb6ff')})`,
    })
    api.registerBehavior({
      id: 'example.behavior.bounce',
      title: 'Отскок',
      description: 'Хранит силу отскока. Физику выполняет подключённый модуль, ядро само столкновения не считает.',
      fields: [{ id: 'force', label: 'Сила', kind: 'number' }],
      defaultProps: { force: 1 },
    })
  },
})

function unit(value: SceneValue, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, number))
}

function cssColor(value: SceneValue, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback
}
