import { useEffect, useRef, useState } from 'react'
import { formatValue } from '../core'
import { Canvas } from './Canvas'
import { Inspector } from './Inspector'
import { NodeTypeList } from './NodeTypeList'
import { useEditor } from './useEditor'

export function Editor() {
  const editor = useEditor()
  const { state, engine } = editor
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(state.document.name)
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
            <small>Ядро на нодах</small>
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
      <div className="workspace">
        <aside className="palette">
          <div className="panel-label">Ноды</div>
          <NodeTypeList types={engine.registry.listNodeTypes()} categories={engine.registry.listCategories()} onPick={addAtCenter} />
        </aside>
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
        />
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
        <Inspector editor={editor} />
      </div>
      <footer className="status">
        <span>
          {state.document.nodes.length} нод · {state.document.edges.length} связей · {Math.round(state.viewport.zoom * 100)}%
        </span>
        <span className={state.notice ? 'notice' : 'muted'}>{state.notice ?? 'Готово'}</span>
      </footer>
    </div>
  )
}
