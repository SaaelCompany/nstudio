import { useEffect, useState } from 'react'
import { formatValue } from '../core'
import type { GraphDocument, GraphVariable, Value } from '../core'
import type { useEditor } from './useEditor'
import { ValueField } from './ValueField'

type EditorController = ReturnType<typeof useEditor>

export function Inspector({ editor }: { editor: EditorController }) {
  const [tab, setTab] = useState<'selection' | 'project'>('selection')
  const { engine, state } = editor
  const registry = engine.registry
  const selectedNodes = state.document.nodes.filter((node) => state.selectedNodeIds.includes(node.id))
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const definition = selectedNode ? registry.getNodeType(selectedNode.typeId) : undefined

  return (
    <aside className="inspector">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'selection'} onClick={() => setTab('selection')}>
          Выбор
        </button>
        <button type="button" role="tab" aria-selected={tab === 'project'} onClick={() => setTab('project')}>
          Проект
        </button>
      </div>
      {tab === 'selection' ? (
        <div className="inspector-body">
          {selectedNodes.length > 1 ? (
            <p className="muted">Выбрано нод: {selectedNodes.length}</p>
          ) : null}
          {selectedNode && definition ? (
            <>
              <h2>{definition.title}</h2>
              <p>{definition.description}</p>
              <dl className="meta">
                <div>
                  <dt>Тип</dt>
                  <dd>{definition.id}</dd>
                </div>
                <div>
                  <dt>Плагин</dt>
                  <dd>{registry.getNodeOwner(definition.id) ?? '—'}</dd>
                </div>
              </dl>
              {definition.properties.map((property) => (
                <label key={property.id} className="field">
                  <span>{property.label}</span>
                  <ValueField
                    label={property.label}
                    value={selectedNode.properties[property.id] ?? property.defaultValue}
                    dataType={property.dataType}
                    options={property.options}
                    widget={property.widget}
                    variableNames={state.document.variables.map((variable) => variable.name)}
                    onChange={(value, mode) => editor.changeProperty(selectedNode.id, property.id, value, mode)}
                    onEditEnd={editor.endEdit}
                  />
                </label>
              ))}
            </>
          ) : null}
          {selectedNode && !definition ? (
            <>
              <h2>Неизвестная нода</h2>
              <p>Тип «{selectedNode.typeId}» не зарегистрирован. Подключите плагин — положение и данные ноды уже сохранены.</p>
            </>
          ) : null}
          {!selectedNode && selectedNodes.length === 0 ? (
            <div className="help">
              <h2>Как собрать программу</h2>
              <ol>
                <li>Возьмите ноду из палитры или меню по правой кнопке.</li>
                <li>Тяните провод от выхода к входу. Поток — треугольники, данные — кружки.</li>
                <li>Alt+щелчок по порту снимает провод. Delete удаляет выбор.</li>
                <li>Запуск выполняет событие «Старт» и пишет результат в консоль.</li>
              </ol>
            </div>
          ) : null}
          {state.selectedEdgeIds.length > 0 ? <p className="muted">Выбраны связи: {state.selectedEdgeIds.length}. Delete удаляет их.</p> : null}
          {(selectedNodes.length > 0 || state.selectedEdgeIds.length > 0) && (
            <button type="button" className="danger" onClick={editor.deleteSelection}>
              Удалить
            </button>
          )}
        </div>
      ) : (
        <ProjectPanel editor={editor} document={state.document} />
      )}
    </aside>
  )
}

function ProjectPanel({ editor, document }: { editor: EditorController; document: GraphDocument }) {
  const types = editor.engine.registry.listDataTypes()
  return (
    <div className="inspector-body">
      <section>
        <div className="section-head">
          <h2>Переменные</h2>
          <button type="button" onClick={() => editor.addVariable('number')}>
            Добавить
          </button>
        </div>
        {document.variables.length === 0 ? <p className="muted">Пока нет. Ноды «Прочитать» и «Записать» работают с этим списком.</p> : null}
        {document.variables.map((variable) => (
          <VariableRow key={variable.id} variable={variable} types={types.map((type) => ({ id: type.id, label: type.label }))} editor={editor} />
        ))}
      </section>
      <section>
        <h2>Плагины</h2>
        <ul className="plugin-list">
          {editor.engine.listPlugins().map((plugin) => (
            <li key={plugin.id}>
              <strong>{plugin.name}</strong>
              <span>
                {plugin.id} · {plugin.version}
              </span>
              {plugin.description ? <small>{plugin.description}</small> : null}
            </li>
          ))}
        </ul>
        <button type="button" disabled={editor.exampleLoaded} onClick={editor.loadExamplePlugin}>
          {editor.exampleLoaded ? 'Пример подключён' : 'Подключить пример плагина'}
        </button>
        <p className="muted">Плагины, эффекты и поведения подключаются кнопкой «Модули». Файл проекта код не исполняет.</p>
      </section>
    </div>
  )
}

function VariableRow({
  variable,
  types,
  editor,
}: {
  variable: GraphVariable
  types: { id: string; label: string }[]
  editor: EditorController
}) {
  const [name, setName] = useState(variable.name)
  useEffect(() => setName(variable.name), [variable.name])
  return (
    <div className="variable-row">
      <input
        className="interactive"
        aria-label="Имя переменной"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name !== variable.name) editor.updateVariable(variable.id, { name })
        }}
      />
      <select
        className="interactive"
        aria-label="Тип переменной"
        value={variable.dataType}
        onChange={(event) => editor.updateVariable(variable.id, { dataType: event.target.value })}
      >
        {types.map((type) => (
          <option key={type.id} value={type.id}>
            {type.label}
          </option>
        ))}
      </select>
      <ValueField
        label="Значение переменной"
        value={variable.value}
        dataType={variable.dataType}
        onChange={(value: Value) => editor.updateVariable(variable.id, { value })}
      />
      <button type="button" className="ghost" onClick={() => editor.removeVariable(variable.id)} aria-label={`Удалить ${variable.name}`}>
        ×
      </button>
      <span className="muted tiny">сейчас {formatValue(variable.value)}</span>
    </div>
  )
}
