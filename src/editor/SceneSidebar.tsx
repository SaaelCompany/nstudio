import { useRef } from 'react'
import {
  activeScene,
  addLayer,
  addScene,
  moveLayer,
  patchLayer,
  removeLayer,
  removeScene,
  setActiveLayer,
} from '../core'
import type { SceneObjectKind } from '../core'
import { screenToWorld } from './geometry'
import { readImageFile } from './images'
import type { useEditor } from './useEditor'

type EditorController = ReturnType<typeof useEditor>

export function SceneDock({ editor }: { editor: EditorController }) {
  const { state, engine } = editor
  const scene = activeScene(state.document)
  const kinds = engine.registry.listSceneObjects()
  const spriteInput = useRef<HTMLInputElement>(null)
  const dragged = useRef(false)

  const center = () => {
    const stage = window.document.querySelector<HTMLElement>('[data-testid="scene-stage"]')
    const width = stage?.clientWidth ?? 800
    const height = stage?.clientHeight ?? 600
    return screenToWorld({ x: width / 2, y: height / 2 }, state.sceneViewport)
  }

  const rememberDrag = () => {
    dragged.current = true
  }

  const consumeDrag = () => {
    if (!dragged.current) return false
    dragged.current = false
    return true
  }

  const placeType = (typeId: string) => {
    if (consumeDrag()) return
    const point = center()
    editor.placeType(typeId, point.x, point.y)
  }

  const placeKind = (kind: SceneObjectKind) => {
    if (consumeDrag()) return
    if (kind.id === 'core.sprite') {
      spriteInput.current?.click()
      return
    }
    const point = center()
    editor.createFromKind(kind.id, point.x, point.y)
  }

  return (
    <aside className="scene-dock">
      <div className="project-panel">
        <div className="panel-label">Проект</div>
        <div className="tree">
          <div className="tree-label">
            Макеты
            <button
              type="button"
              onClick={() => {
                editor.select([], [])
                editor.selectInstances([])
                editor.editDocument((document) => addScene(document), 'commit')
              }}
            >
              +
            </button>
          </div>
          {state.document.scenes.scenes.map((item) => (
            <div key={item.id} className="tree-line">
              <button
                type="button"
                className={`tree-item${item.id === scene.id ? ' active' : ''}`}
                onClick={() => editor.openScene(item.id)}
              >
                {item.name}
              </button>
              {state.document.scenes.scenes.length > 1 ? (
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Удалить макет ${item.name}`}
                  onClick={() => {
                    editor.select([], [])
                    editor.selectInstances([])
                    editor.editDocument((document) => removeScene(document, item.id), 'commit')
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
          <div className="tree-label">Объекты</div>
          {state.document.scenes.objectTypes.map((type) => {
            const kind = engine.registry.getSceneObject(type.kind)
            return (
              <button
                key={type.id}
                type="button"
                className="tree-item"
                draggable
                onDragStart={(event) => {
                  rememberDrag()
                  event.dataTransfer.setData('application/x-nstudio-object', type.id)
                  event.dataTransfer.setData('text/plain', `object:${type.id}`)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onDragEnd={() => {
                  window.setTimeout(() => {
                    dragged.current = false
                  }, 0)
                }}
                onClick={() => placeType(type.id)}
              >
                <strong>{type.name}</strong>
                <small>{kind?.title ?? type.kind}</small>
              </button>
            )
          })}
          <div className="kind-list">
            {kinds.map((kind) => (
              <button
                key={kind.id}
                type="button"
                className="kind-button"
                draggable
                onDragStart={(event) => {
                  rememberDrag()
                  event.dataTransfer.setData('application/x-nstudio-kind', kind.id)
                  event.dataTransfer.setData('text/plain', `kind:${kind.id}`)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onDragEnd={() => {
                  window.setTimeout(() => {
                    dragged.current = false
                  }, 0)
                }}
                onClick={() => placeKind(kind)}
              >
                {kind.title}
              </button>
            ))}
          </div>
          <input
            ref={spriteInput}
            className="file-input"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              const point = center()
              void readImageFile(file).then(
                (src) => editor.createFromKind('core.sprite', point.x, point.y, { src }),
                (error: unknown) => editor.notify(error instanceof Error ? error.message : 'Не удалось прочитать изображение'),
              )
            }}
          />
        </div>
      </div>
      <section className="layers-panel" aria-label="Слои">
        <header>
          <span>Слои · {scene.name}</span>
          <button type="button" aria-label="Добавить слой" onClick={() => editor.editDocument((document) => addLayer(document, scene.id), 'commit')}>
            +
          </button>
        </header>
        <div className="layer-list">
          {[...scene.layers].reverse().map((layer, index) => (
            <div key={layer.id} className={`layer-line${layer.id === state.document.scenes.activeLayerId ? ' active' : ''}`}>
              <button
                type="button"
                className="icon-button"
                aria-label={layer.visible ? 'Скрыть слой' : 'Показать слой'}
                aria-pressed={layer.visible}
                onClick={() => editor.editDocument((document) => patchLayer(document, scene.id, layer.id, { visible: !layer.visible }), 'commit')}
              >
                <EyeIcon off={!layer.visible} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={layer.locked ? 'Разблокировать слой' : 'Заблокировать слой'}
                aria-pressed={layer.locked}
                onClick={() => editor.editDocument((document) => patchLayer(document, scene.id, layer.id, { locked: !layer.locked }), 'commit')}
              >
                <LockIcon closed={layer.locked} />
              </button>
              <button type="button" className="layer-name" onClick={() => editor.editDocument((document) => setActiveLayer(document, layer.id), 'commit')}>
                {layer.name}
              </button>
              <span className="layer-index">{scene.layers.length - 1 - index}</span>
              <button type="button" className="icon-button" aria-label="Выше" onClick={() => editor.editDocument((document) => moveLayer(document, scene.id, layer.id, 1), 'commit')}>
                ↑
              </button>
              <button type="button" className="icon-button" aria-label="Ниже" onClick={() => editor.editDocument((document) => moveLayer(document, scene.id, layer.id, -1), 'commit')}>
                ↓
              </button>
              {scene.layers.length > 1 ? (
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Удалить слой ${layer.name}`}
                  onClick={() => editor.editDocument((document) => removeLayer(document, scene.id, layer.id), 'commit')}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      {off ? <path d="M3 13 L13 3" stroke="currentColor" strokeWidth="1.4" /> : null}
    </svg>
  )
}

function LockIcon({ closed }: { closed?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d={closed ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0V7' : 'M5.5 7V5a2.5 2.5 0 0 1 4.2-1.8'} fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
