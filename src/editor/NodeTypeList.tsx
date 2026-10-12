import { useRef, useState } from 'react'
import type { CategoryDefinition, NodeTypeDefinition } from '../core'

interface NodeTypeListProps {
  types: NodeTypeDefinition[]
  categories: CategoryDefinition[]
  autoFocus?: boolean
  onPick: (typeId: string) => void
}

export function NodeTypeList({ types, categories, autoFocus = false, onPick }: NodeTypeListProps) {
  const [query, setQuery] = useState('')
  const dragged = useRef(false)
  const needle = query.trim().toLowerCase()
  const filtered = types.filter((nodeType) => {
    if (!needle) return true
    return `${nodeType.title} ${nodeType.description} ${nodeType.id}`.toLowerCase().includes(needle)
  })
  const groups = categories
    .map((category) => ({
      category,
      nodes: filtered.filter((nodeType) => nodeType.category === category.id),
    }))
    .filter((group) => group.nodes.length > 0)

  return (
    <div className="picker">
      <input
        className="interactive search"
        autoFocus={autoFocus}
        placeholder="Поиск нод"
        aria-label="Поиск нод"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <div className="picker-groups">
        {groups.map((group) => (
          <section key={group.category.id} className="picker-group">
            <h3 style={{ color: group.category.color }}>{group.category.label}</h3>
            {group.nodes.map((nodeType) => (
              <button
                key={nodeType.id}
                type="button"
                className="picker-item"
                draggable
                onDragStart={(event) => {
                  dragged.current = true
                  event.dataTransfer.setData('application/x-nstudio-node', nodeType.id)
                  event.dataTransfer.setData('text/plain', nodeType.id)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onDragEnd={() => {
                  window.setTimeout(() => {
                    dragged.current = false
                  }, 0)
                }}
                onClick={() => {
                  if (dragged.current) return
                  onPick(nodeType.id)
                }}
              >
                <span className="swatch" style={{ background: group.category.color }} />
                <span>
                  <strong>{nodeType.title}</strong>
                  <small>{nodeType.description}</small>
                </span>
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 ? <p className="muted">Ничего не найдено</p> : null}
      </div>
    </div>
  )
}
