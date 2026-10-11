import { useRef } from 'react'
import {
  activeScene,
  addLayer,
  addScene,
  moveLayer,
  patchLayer,
  removeLayer,
  removeScene,
  renameScene,
  setActiveLayer,
  setActiveScene,
} from '../core'
import type { SceneObjectKind } from '../core'
import { screenToWorld } from './geometry'
import { readImageFile } from './images'
import type { useEditor } from './useEditor'

type EditorController = ReturnType<typeof useEditor>

export function SceneSidebar({ editor }: { editor: EditorController }) {
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
    <aside className="palette scene-side-wrap">
      <div className="panel-label">Макет</div>
      <div className="scene-side">
        <section className="scene-block">
          <h3>
            Сцены
            <button type="button" onClick={() => editor.editDocument((document) => addScene(document), 'commit')}>
              Добавить
            </button>
          </h3>
          {state.document.scenes.scenes.map((item) => {
            const active = item.id === scene.id
            return (
              <div key={item.id} className={`scene-row${active ? ' active' : ''}`}>
                {active ? (
                  <SceneName value={item.name} onCommit={(name) => editor.editDocument((document) => renameScene(document, item.id, name), 'commit')} />
                ) : (
                  <button
                    type="button"
                    className="grow"
                    onClick={() => {
                      editor.selectInstances([])
                      editor.editDocument((document) => setActiveScene(document, item.id), 'commit')
                    }}
                  >
                    {item.name}
                  </button>
                )}
                {state.document.scenes.scenes.length > 1 ? (
                  <button
                    type="button"
                    className="danger"
                    aria-label={`Удалить сцену ${item.name}`}
                    onClick={() => {
                      editor.selectInstances([])
                      editor.editDocument((document) => removeScene(document, item.id), 'commit')
                    }}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            )
          })}
        </section>

        <section className="scene-block">
          <h3>Объекты</h3>
          {state.document.scenes.objectTypes.map((type) => {
            const kind = engine.registry.getSceneObject(type.kind)
            return (
              <button
                key={type.id}
                type="button"
                className="type-row"
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
        </section>

        <section className="scene-block">
          <h3>
            Слои
            <button type="button" onClick={() => editor.editDocument((document) => addLayer(document, scene.id), 'commit')}>
              Добавить
            </button>
          </h3>
          {[...scene.layers].reverse().map((layer) => (
            <div key={layer.id} className={`layer-row${layer.id === state.document.scenes.activeLayerId ? ' active' : ''}`}>
              <button type="button" className="grow" onClick={() => editor.editDocument((document) => setActiveLayer(document, layer.id), 'commit')}>
                {layer.name}
              </button>
              <div className="layer-actions">
                <button
                  type="button"
                  aria-label={layer.visible ? 'Скрыть слой' : 'Показать слой'}
                  aria-pressed={layer.visible}
                  onClick={() => editor.editDocument((document) => patchLayer(document, scene.id, layer.id, { visible: !layer.visible }), 'commit')}
                >
                  {layer.visible ? 'Виден' : 'Скрыт'}
                </button>
                <button
                  type="button"
                  aria-label={layer.locked ? 'Разблокировать слой' : 'Заблокировать слой'}
                  aria-pressed={layer.locked}
                  onClick={() => editor.editDocument((document) => patchLayer(document, scene.id, layer.id, { locked: !layer.locked }), 'commit')}
                >
                  {layer.locked ? 'Закрыт' : 'Открыт'}
                </button>
                <button type="button" aria-label="Выше" onClick={() => editor.editDocument((document) => moveLayer(document, scene.id, layer.id, 1), 'commit')}>
                  Выше
                </button>
                <button type="button" aria-label="Ниже" onClick={() => editor.editDocument((document) => moveLayer(document, scene.id, layer.id, -1), 'commit')}>
                  Ниже
                </button>
                {scene.layers.length > 1 ? (
                  <button
                    type="button"
                    className="danger"
                    aria-label={`Удалить слой ${layer.name}`}
                    onClick={() => editor.editDocument((document) => removeLayer(document, scene.id, layer.id), 'commit')}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      </div>
    </aside>
  )
}

function SceneName({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  return (
    <input
      className="interactive grow"
      aria-label="Название сцены"
      defaultValue={value}
      key={value}
      onBlur={(event) => {
        const next = event.target.value.trim()
        if (next && next !== value) onCommit(next)
      }}
    />
  )
}
