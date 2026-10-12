import type { EnginePlugin } from '../core'
import { extrasPlugin } from '../example-modules'
import { notePlugin } from '../example-plugin'

export interface CatalogEntry {
  plugin: EnginePlugin
  blurb: string
}

/** Host catalog. Project files never carry executable code, so only these modules can be connected. */
export const moduleCatalog: CatalogEntry[] = [
  {
    plugin: notePlugin,
    blurb: 'Нода «Заметка» для подписей на листе событий.',
  },
  {
    plugin: extrasPlugin,
    blurb: 'Эффект «Свечение» и поведение «Отскок».',
  },
]
