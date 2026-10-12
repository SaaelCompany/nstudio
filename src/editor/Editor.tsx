import { useEffect, useRef, useState } from 'react'
import { activeScene, formatValue } from '../core'
import type { GraphDocument } from '../core'
import { Canvas } from './Canvas'
import { Inspector } from './Inspector'
import { ModulesDialog } from './ModulesDialog'
import { NodeTypeList } from './NodeTypeList'
import type { Point } from './geometry'
import { SceneCanvas } from './SceneCanvas'
import { SceneInspector } from './SceneInspector'
import { SceneDock } from './SceneSidebar'
import { useEditor } from './useEditor'

export function Editor() {
  const editor = useEditor()
  const { state, engine } = editor
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(state.document.name)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [modulesOpen, setModulesOpen] = useState(false)
  const sheetLabel = `События · ${activeScene(state.document).name}`
  useEffect(() => setName(state.document.name), [state.document.name])

  const addAtCenter = (typeId: string) => {
    const canvas = window.document.querySelector<HTMLElement>('[data-testid="canvas"]')
    const width = canvas?.clientWidth ?? 800
    const height = canvas?.clientHeight ?? 600
    const x = (width / 2 - state.viewport.x) / state.viewport.zoom - 110
    const y = (height / 2 - state.viewport.y) / state.viewport.zoom - 24
    editor.addNodeAt(typeId, x, y)
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>NStudio</strong>
            <small>Макеты и ноды</small>
          </div>
        </div>
        <input
          className="name-input interactive"
          aria-label="Название проекта"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (name.trim() && name !== state.document.name) editor.renameDocument(name.trim())
            else setName(state.document.name)
          }}
        />
        <div className="toolbar-actions">
          <button type="button" onClick={editor.undo} disabled={state.past.length === 0} title="Отменить (Ctrl+Z)">
            Отменить
          </button>
          <button type="button" onClick={editor.redo} disabled={state.future.length === 0} title="Повторить (Ctrl+Shift+Z)">
            Повторить
          </button>
          <button type="button" onClick={editor.newDocument}>
            Новый
          </button>
          <button type="button" onClick={editor.loadDemo}>
            Пример
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Открыть
          </button>
          <button type="button" onClick={editor.save} title="Сохранить (Ctrl+S)">
            Сохранить
          </button>
          <button type="button" data-testid="modules-button" onClick={() => setModulesOpen(true)}>
            Модули
          </button>
          <input
            ref={fileRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void file.text().then((raw) => editor.openText(raw))
            }}
          />
          {editor.events.length > 1 ? (
            <select aria-label="Событие запуска" value={state.runEvent} onChange={(event) => editor.setRunEvent(event.target.value)}>
              {editor.events.map((event) => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="run" data-testid="run-button" onClick={editor.run} title="Запуск (Ctrl+Enter)">
            Запуск
          </button>
        </div>
      </header>
      <div className={`workspace${state.mode === 'scene' ? ' scene-mode' : ''}`}>
        {state.mode === 'scene' ? (
          <SceneInspector editor={editor} />
        ) : (
          <aside className="palette">
            <div className="panel-label">Ноды</div>
            <NodeTypeList types={engine.registry.listNodeTypes()} categories={engine.registry.listCategories()} onPick={addAtCenter} />
          </aside>
        )}
        <div className="center-column">
          <div className="sheet-tabs" role="tablist" aria-label="Листы">
            <button type="button" role="tab" data-testid="mode-scene" aria-selected={state.mode === 'scene'} onClick={() => editor.setMode('scene')}>
              Макет
            </button>
            <button type="button" role="tab" data-testid="mode-nodes" aria-selected={state.mode === 'nodes'} onClick={() => editor.setMode('nodes')}>
              {sheetLabel}
            </button>
          </div>
          {state.mode === 'scene' ? (
            <SceneCanvas
              document={state.document}
              viewport={state.sceneViewport}
              selectedIds={state.selectedInstanceIds}
              gridEnabled={state.gridEnabled}
              snapEnabled={state.snapEnabled}
              gridSize={state.gridSize}
              registry={engine.registry}
              onViewport={editor.setSceneViewport}
              onHover={setPointer}
              onSelect={editor.selectInstances}
              onPreviewDocument={editor.previewDocument}
              onCommitDrag={editor.commitDrag}
              onPlaceType={editor.placeType}
              onPlaceKind={editor.createFromKind}
              onNotice={editor.notify}
            />
          ) : (
            <Canvas
              engine={engine}
              document={state.document}
              viewport={state.viewport}
              selectedNodeIds={state.selectedNodeIds}
              selectedEdgeIds={state.selectedEdgeIds}
              onViewport={editor.setViewport}
              onSelect={editor.select}
              onPreviewDocument={editor.previewDocument}
              onCommitDrag={editor.commitDrag}
              onConnect={editor.connect}
              onDisconnect={editor.disconnect}
              onAddNode={editor.addNodeAt}
              onDeleteSelection={editor.deleteSelection}
              onChangeProperty={editor.changeProperty}
              onChangeInput={editor.changeInput}
              onEditEnd={editor.endEdit}
              sheetLabel={sheetLabel}
            />
          )}
        <section className="console" data-testid="console">
          <header>
            <h2>Консоль</h2>
            <span className="muted">{state.ran ? `Событие «${state.runEvent}»` : 'Ещё не запускалось'}</span>
          </header>
          <div className="console-body">
            {state.diagnostics.map((diagnostic, index) => (
              <button
                key={`${diagnostic.code}-${diagnostic.nodeId ?? index}`}
                type="button"
                className={`console-line diagnostic ${diagnostic.level}`}
                onClick={() => diagnostic.nodeId && editor.select([diagnostic.nodeId], [])}
              >
                {diagnostic.message}
              </button>
            ))}
            {state.logs.map((entry, index) => (
              <div key={`${entry.message}-${index}`} className={`console-line ${entry.level}`} data-testid="console-line">
                {entry.message}
              </div>
            ))}
            {state.ran && state.logs.length === 0 && state.diagnostics.length === 0 ? (
              <div className="muted">Запуск прошёл, печать ничего не вывела.</div>
            ) : null}
            {state.ran && state.variables.length > 0 ? (
              <div className="console-vars">
                {state.variables.map((variable) => (
                  <span key={variable.name}>
                    {variable.name} = {formatValue(variable.value)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
        </div>
        {state.mode === 'scene' ? <SceneDock editor={editor} /> : <Inspector editor={editor} />}
      </div>
      {modulesOpen ? <ModulesDialog editor={editor} onClose={() => setModulesOpen(false)} /> : null}
      <footer className="status">
        <span>{state.mode === 'scene' ? sceneStatus(state.document, state.sceneViewport.zoom, pointer) : nodeStatus(state)}</span>
        <span className={state.notice ? 'notice' : 'muted'}>{state.notice ?? 'Готово'}</span>
      </footer>
    </div>
  )
}

function sceneStatus(document: GraphDocument, zoom: number, pointer: Point | null): string {
  const scene = activeScene(document)
  const layer = scene.layers.find((item) => item.id === document.scenes.activeLayerId)
  const mouse = pointer ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}` : '—'
  return `Мышь (${mouse}) · ${layer?.name ?? 'Слой'} · ${Math.round(zoom * 100)}%`
}

function nodeStatus(state: { document: GraphDocument; viewport: { zoom: number } }): string {
  const scene = activeScene(state.document)
  return `${scene.name} · ${state.document.nodes.length} нод · ${state.document.edges.length} связей · ${Math.round(state.viewport.zoom * 100)}%`
}
