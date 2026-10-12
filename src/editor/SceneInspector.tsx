import { useState } from 'react'
import {
  activeScene,
  addBehavior,
  addInstanceEffect,
  patchBehavior,
  patchInstanceEffect,
  patchInstances,
  removeBehavior,
  removeInstanceEffect,
  renameScene,
  sendInstance,
  setSceneCanvas,
} from '../core'
import type { SceneField, SceneInstance, SceneModule, SceneValue } from '../core'
import { readImageFile } from './images'
import type { useEditor } from './useEditor'

type EditorController = ReturnType<typeof useEditor>

export function SceneInspector({ editor }: { editor: EditorController }) {
  const { state, engine } = editor
  const scene = activeScene(state.document)
  const selected = scene.instances.filter((instance) => state.selectedInstanceIds.includes(instance.id))
  const instance = selected.length === 1 ? selected[0] : undefined
  const objectType = instance ? state.document.scenes.objectTypes.find((item) => item.id === instance.typeId) : undefined
  const kind = objectType ? engine.registry.getSceneObject(objectType.kind) : undefined

  const patch = (produce: (instance: SceneInstance) => Parameters<typeof patchInstances>[3], mode: 'preview' | 'commit' = 'commit') => {
    if (!instance) return
    editor.editDocument((document) => patchInstances(document, scene.id, [instance.id], produce(instance)), mode)
  }

  return (
    <aside className="inspector scene-properties">
      <div className="panel-label">Свойства</div>
      <div className="inspector-body">
        {selected.length > 1 ? (
          <>
            <h2>Выбрано объектов: {selected.length}</h2>
            <button type="button" className="danger" onClick={editor.deleteSelection}>
              Удалить
            </button>
          </>
        ) : null}
        {instance ? (
          <>
            <h3 className="prop-section">Объект</h3>
            <p>{kind?.description ?? (objectType ? `Вид «${objectType.kind}» не подключён.` : 'Тип объекта удалён.')}</p>
            <label className="field">
              <span>Имя</span>
              <input
                className="interactive"
                aria-label="Имя объекта"
                value={instance.name}
                onChange={(event) => patch(() => ({ name: event.target.value }), 'preview')}
                onBlur={editor.endEdit}
              />
            </label>
            <div className="field-grid">
              <DraftNumber label="X" value={instance.x} onPreview={(value) => patch(() => ({ x: value }), 'preview')} onEditEnd={editor.endEdit} />
              <DraftNumber label="Y" value={instance.y} onPreview={(value) => patch(() => ({ y: value }), 'preview')} onEditEnd={editor.endEdit} />
              <DraftNumber label="Ширина" value={instance.width} onPreview={(value) => patch(() => ({ width: value }), 'preview')} onEditEnd={editor.endEdit} />
              <DraftNumber label="Высота" value={instance.height} onPreview={(value) => patch(() => ({ height: value }), 'preview')} onEditEnd={editor.endEdit} />
              <DraftNumber label="Угол" value={instance.angle} onPreview={(value) => patch(() => ({ angle: value }), 'preview')} onEditEnd={editor.endEdit} />
              <DraftNumber label="Непрозрачность" value={instance.opacity} onPreview={(value) => patch(() => ({ opacity: value }), 'preview')} onEditEnd={editor.endEdit} />
            </div>
            <label className="field">
              <span>Слой</span>
              <select
                aria-label="Слой объекта"
                value={instance.layerId}
                onChange={(event) => patch(() => ({ layerId: event.target.value }))}
              >
                {scene.layers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </select>
            </label>
            {kind?.id === 'core.sprite' ? <SpriteField instance={instance} editor={editor} sceneId={scene.id} /> : null}
            {kind?.fields.map((field) => (
              <FieldEditor
                key={field.id}
                label={field.label}
                kind={field.kind}
                options={field.options}
                value={instance.props[field.id]}
                onChange={(value, mode) => patch(() => ({ props: { [field.id]: value } }), mode)}
                onEditEnd={editor.endEdit}
              />
            ))}
            <ModuleSection
              title="Эффекты"
              empty="Эффектов нет. Виды подключаются в меню «Модули»."
              addLabel="Добавить эффект"
              items={instance.effects}
              options={engine.registry.listEffects().map((effect) => ({ id: effect.id, title: effect.title }))}
              define={(id) => engine.registry.getEffect(id)}
              onAdd={(id) => {
                const effect = engine.registry.getEffect(id)
                if (!effect) return
                editor.editDocument((document) => addInstanceEffect(document, scene.id, instance.id, effect), 'commit')
              }}
              onRemove={(id) => editor.editDocument((document) => removeInstanceEffect(document, scene.id, instance.id, id), 'commit')}
              onPatch={(id, props, mode) =>
                editor.editDocument((document) => patchInstanceEffect(document, scene.id, instance.id, id, props), mode)
              }
              onEditEnd={editor.endEdit}
            />
            {objectType ? (
              <ModuleSection
                title={`Поведения · тип «${objectType.name}»`}
                empty="Поведений нет. Они общие для всех экземпляров этого типа."
                addLabel="Добавить поведение"
                items={objectType.behaviors}
                options={engine.registry
                  .listBehaviors()
                  .filter((behavior) => !objectType.behaviors.some((item) => item.kind === behavior.id))
                  .map((behavior) => ({ id: behavior.id, title: behavior.title }))}
                define={(id) => engine.registry.getBehavior(id)}
                onAdd={(id) => {
                  const behavior = engine.registry.getBehavior(id)
                  if (!behavior) return
                  editor.editDocument((document) => addBehavior(document, objectType.id, behavior), 'commit')
                }}
                onRemove={(id) => editor.editDocument((document) => removeBehavior(document, objectType.id, id), 'commit')}
                onPatch={(id, props, mode) => editor.editDocument((document) => patchBehavior(document, objectType.id, id, props), mode)}
                onEditEnd={editor.endEdit}
              />
            ) : null}
            <div className="row-actions">
              <button type="button" onClick={() => editor.editDocument((document) => sendInstance(document, scene.id, instance.id, 1), 'commit')}>
                Выше
              </button>
              <button type="button" onClick={() => editor.editDocument((document) => sendInstance(document, scene.id, instance.id, -1), 'commit')}>
                Ниже
              </button>
              <button type="button" className="danger" onClick={editor.deleteSelection}>
                Удалить
              </button>
            </div>
          </>
        ) : null}
        {selected.length === 0 ? (
          <>
            <h3 className="prop-section">Макет</h3>
            <label className="field">
              <span>Имя</span>
              <input
                className="interactive"
                aria-label="Название макета"
                defaultValue={scene.name}
                key={scene.name}
                onBlur={(event) => {
                  const next = event.target.value.trim()
                  if (next && next !== scene.name) editor.editDocument((document) => renameScene(document, scene.id, next), 'commit')
                }}
              />
            </label>
            <div className="field-grid">
              <DraftNumber
                label="Ширина макета"
                value={scene.width}
                onPreview={(value) => editor.editDocument((document) => setSceneCanvas(document, scene.id, { width: value }), 'preview')}
                onEditEnd={editor.endEdit}
              />
              <DraftNumber
                label="Высота макета"
                value={scene.height}
                onPreview={(value) => editor.editDocument((document) => setSceneCanvas(document, scene.id, { height: value }), 'preview')}
                onEditEnd={editor.endEdit}
              />
            </div>
            <label className="field">
              <span>Фон</span>
              <input
                type="color"
                aria-label="Фон макета"
                value={hexColor(scene.background, '#172033')}
                onChange={(event) => editor.editDocument((document) => setSceneCanvas(document, scene.id, { background: event.target.value }), 'commit')}
              />
            </label>
          </>
        ) : null}
        <h3 className="prop-section">Редактор</h3>
        <label className="field">
          <span>Показать сетку</span>
          <input
            type="checkbox"
            data-testid="grid-toggle"
            aria-label="Показать сетку"
            checked={state.gridEnabled}
            onChange={(event) => editor.setGridEnabled(event.target.checked)}
          />
        </label>
        <label className="field">
          <span>Привязка</span>
          <input
            type="checkbox"
            aria-label="Привязка к сетке"
            checked={state.snapEnabled}
            onChange={(event) => editor.setSnapEnabled(event.target.checked)}
          />
        </label>
        <DraftNumber label="Шаг сетки" value={state.gridSize} onPreview={(value) => editor.setGridSize(value)} onEditEnd={() => undefined} />
      </div>
    </aside>
  )
}

function SpriteField({ instance, editor, sceneId }: { instance: SceneInstance; editor: EditorController; sceneId: string }) {
  const src = typeof instance.props.src === 'string' ? instance.props.src : ''
  return (
    <div className="field">
      <span>Изображение</span>
      <div className="row-actions">
        <label className="file-button">
          Выбрать
          <input
            className="file-input"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void readImageFile(file).then(
                (next) => editor.editDocument((document) => patchInstances(document, sceneId, [instance.id], { props: { src: next } }), 'commit'),
                (error: unknown) => editor.notify(error instanceof Error ? error.message : 'Не удалось прочитать изображение'),
              )
            }}
          />
        </label>
        <button
          type="button"
          disabled={!src}
          onClick={() => editor.editDocument((document) => patchInstances(document, sceneId, [instance.id], { props: { src: '' } }), 'commit')}
        >
          Очистить
        </button>
      </div>
    </div>
  )
}

function ModuleSection({
  title,
  empty,
  addLabel,
  items,
  options,
  define,
  onAdd,
  onRemove,
  onPatch,
  onEditEnd,
}: {
  title: string
  empty: string
  addLabel: string
  items: SceneModule[]
  options: { id: string; title: string }[]
  define: (kind: string) => { title: string; fields: SceneField[] } | undefined
  onAdd: (kind: string) => void
  onRemove: (id: string) => void
  onPatch: (id: string, props: Record<string, SceneValue>, mode: 'preview' | 'commit') => void
  onEditEnd: () => void
}) {
  return (
    <section className="module-block">
      <h3 className="prop-section">{title}</h3>
      {items.length === 0 ? <p className="muted">{empty}</p> : null}
      {items.map((item) => {
        const definition = define(item.kind)
        return (
          <div key={item.id} className="module-card">
            <div className="section-head">
              <strong>{definition?.title ?? item.kind}</strong>
              <button type="button" className="ghost" aria-label={`Убрать ${definition?.title ?? item.kind}`} onClick={() => onRemove(item.id)}>
                ×
              </button>
            </div>
            {definition?.fields.map((field) => (
              <FieldEditor
                key={field.id}
                label={field.label}
                kind={field.kind}
                options={field.options}
                value={item.props[field.id]}
                onChange={(value, mode) => onPatch(item.id, { [field.id]: value }, mode)}
                onEditEnd={onEditEnd}
              />
            ))}
            {!definition ? <p className="muted">Модуль «{item.kind}» не подключён. Данные сохранены.</p> : null}
          </div>
        )
      })}
      <label className="field">
        <span>{addLabel}</span>
        <select aria-label={addLabel} value="" onChange={(event) => event.target.value && onAdd(event.target.value)}>
          <option value="">Выбрать…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}

function FieldEditor({
  label,
  kind,
  options,
  value,
  onChange,
  onEditEnd,
}: {
  label: string
  kind: 'text' | 'number' | 'color' | 'select'
  options?: { value: string; label: string }[]
  value: SceneValue | undefined
  onChange: (value: SceneValue, mode: 'preview' | 'commit') => void
  onEditEnd: () => void
}) {
  if (kind === 'number') {
    return (
      <DraftNumber
        label={label}
        value={typeof value === 'number' ? value : 0}
        onPreview={(next) => onChange(next, 'preview')}
        onEditEnd={onEditEnd}
      />
    )
  }
  if (kind === 'color') {
    return (
      <label className="field">
        <span>{label}</span>
        <input type="color" aria-label={label} value={hexColor(typeof value === 'string' ? value : '', '#e2a23a')} onChange={(event) => onChange(event.target.value, 'commit')} />
      </label>
    )
  }
  if (kind === 'select') {
    return (
      <label className="field">
        <span>{label}</span>
        <select aria-label={label} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value, 'commit')}>
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        className="interactive"
        aria-label={label}
        rows={2}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value, 'preview')}
        onBlur={onEditEnd}
      />
    </label>
  )
}

function DraftNumber({
  label,
  value,
  onPreview,
  onEditEnd,
}: {
  label: string
  value: number
  onPreview: (value: number) => void
  onEditEnd: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const current = Number.isFinite(value) ? String(value) : '0'
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="interactive"
        aria-label={label}
        type="number"
        step="any"
        value={draft ?? current}
        onFocus={() => setDraft(current)}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') return
          const next = Number(raw)
          if (Number.isFinite(next)) onPreview(next)
        }}
        onBlur={() => {
          setDraft(null)
          onEditEnd()
        }}
      />
    </label>
  )
}

function hexColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}
