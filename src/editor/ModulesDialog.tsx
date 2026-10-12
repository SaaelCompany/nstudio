import { useEffect, useState } from 'react'
import type { useEditor } from './useEditor'
import { moduleCatalog } from './catalog'

type EditorController = ReturnType<typeof useEditor>
type ModuleTab = 'plugins' | 'effects' | 'behaviors'

export function ModulesDialog({ editor, onClose }: { editor: EditorController; onClose: () => void }) {
  const [tab, setTab] = useState<ModuleTab>('plugins')
  const registry = editor.engine.registry
  const loaded = new Set(editor.engine.listPlugins().map((plugin) => plugin.id))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Модули"
        data-testid="modules-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-head">
          <h2>Модули</h2>
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="muted">
          Ядро само по себе пустое: эффекты, поведения и плагины подключаются модулями. Файл проекта код не исполняет.
        </p>
        <div className="tabs" role="tablist" aria-label="Виды модулей">
          <button type="button" role="tab" data-testid="modules-tab-plugins" aria-selected={tab === 'plugins'} onClick={() => setTab('plugins')}>
            Плагины
          </button>
          <button type="button" role="tab" data-testid="modules-tab-effects" aria-selected={tab === 'effects'} onClick={() => setTab('effects')}>
            Эффекты
          </button>
          <button type="button" role="tab" data-testid="modules-tab-behaviors" aria-selected={tab === 'behaviors'} onClick={() => setTab('behaviors')}>
            Поведения
          </button>
        </div>
        {tab === 'plugins' ? (
          <div className="module-list">
            {editor.engine.listPlugins().map((plugin) => (
              <article key={plugin.id} className="module-card">
                <div>
                  <strong>{plugin.name}</strong>
                  <span className="muted tiny">
                    {plugin.id} · {plugin.version}
                  </span>
                  {plugin.description ? <small>{plugin.description}</small> : null}
                </div>
                <span className="muted">Подключён</span>
              </article>
            ))}
            {moduleCatalog
              .filter((entry) => !loaded.has(entry.plugin.id))
              .map((entry) => (
                <article key={entry.plugin.id} className="module-card">
                  <div>
                    <strong>{entry.plugin.name}</strong>
                    <span className="muted tiny">{entry.plugin.id}</span>
                    <small>{entry.blurb}</small>
                  </div>
                  <button type="button" data-testid={`connect-${entry.plugin.id}`} onClick={() => editor.connectPlugin(entry.plugin)}>
                    Подключить
                  </button>
                </article>
              ))}
          </div>
        ) : null}
        {tab === 'effects' ? (
          <div className="module-list">
            <p className="muted">Эффект вешается на экземпляр. На макете выделите объект и добавьте его в свойствах. Один вид можно добавить несколько раз.</p>
            {registry.listEffects().map((effect) => (
              <article key={effect.id} className="module-card">
                <div>
                  <strong>{effect.title}</strong>
                  <span className="muted tiny">{effect.id}</span>
                  <small>{effect.description}</small>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {tab === 'behaviors' ? (
          <div className="module-list">
            <p className="muted">
              Поведение вешается на тип объекта и общее для всех его экземпляров. Один вид — один раз. Ядро только хранит параметры, движение и столкновения выполняет подключённый модуль.
            </p>
            {registry.listBehaviors().map((behavior) => (
              <article key={behavior.id} className="module-card">
                <div>
                  <strong>{behavior.title}</strong>
                  <span className="muted tiny">{behavior.id}</span>
                  <small>{behavior.description}</small>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
