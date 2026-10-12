import { useState } from 'react'
import type { PropertyOption, PropertyWidget, Value } from '../core'
import { booleanValue, numberValue, stringValue } from '../core'

interface ValueFieldProps {
  value: Value
  dataType: string
  options?: PropertyOption[]
  widget?: PropertyWidget
  variableNames?: string[]
  label?: string
  onChange: (value: Value, mode: 'preview' | 'commit') => void
  onEditEnd?: () => void
}

export function ValueField({
  value,
  dataType,
  options,
  widget,
  variableNames = [],
  label,
  onChange,
  onEditEnd,
}: ValueFieldProps) {
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()

  if (widget === 'variable') {
    const current = typeof value.data === 'string' ? value.data : ''
    return (
      <select
        className="interactive"
        aria-label={label}
        value={current}
        onPointerDown={stop}
        onChange={(event) => onChange(stringValue(event.target.value), 'commit')}
      >
        <option value="">Не выбрана</option>
        {variableNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {current && !variableNames.includes(current) ? <option value={current}>{current}</option> : null}
      </select>
    )
  }

  if (options && options.length > 0) {
    const current = typeof value.data === 'string' ? value.data : ''
    return (
      <select
        className="interactive"
        aria-label={label}
        value={current}
        onPointerDown={stop}
        onChange={(event) => onChange(stringValue(event.target.value), 'commit')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (dataType === 'boolean') {
    return (
      <input
        className="interactive"
        aria-label={label}
        type="checkbox"
        checked={value.data === true}
        onPointerDown={stop}
        onChange={(event) => onChange(booleanValue(event.target.checked), 'commit')}
      />
    )
  }

  if (dataType === 'number') {
    return <NumberField label={label} value={value} stop={stop} onChange={onChange} onEditEnd={onEditEnd} />
  }

  const text = typeof value.data === 'string' ? value.data : value.data == null ? '' : String(value.data)
  if (widget === 'text') {
    return (
      <textarea
        className="interactive"
        aria-label={label}
        rows={3}
        value={text}
        onPointerDown={stop}
        onChange={(event) => onChange(stringValue(event.target.value), 'preview')}
        onBlur={() => onEditEnd?.()}
      />
    )
  }

  return (
    <input
      className="interactive"
      aria-label={label}
      type="text"
      value={text}
      onPointerDown={stop}
      onChange={(event) => onChange(stringValue(event.target.value), 'preview')}
      onBlur={() => onEditEnd?.()}
    />
  )
}

function NumberField({
  label,
  value,
  stop,
  onChange,
  onEditEnd,
}: {
  label?: string
  value: Value
  stop: (event: { stopPropagation: () => void }) => void
  onChange: (value: Value, mode: 'preview' | 'commit') => void
  onEditEnd?: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const current = typeof value.data === 'number' && Number.isFinite(value.data) ? String(value.data) : '0'
  return (
    <input
      className="interactive"
      aria-label={label}
      type="number"
      step="any"
      value={draft ?? current}
      onPointerDown={stop}
      onWheel={stop}
      onFocus={() => setDraft(current)}
      onChange={(event) => {
        const raw = event.target.value
        setDraft(raw)
        if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') return
        const next = Number(raw)
        if (Number.isFinite(next)) onChange(numberValue(next), 'preview')
      }}
      onBlur={() => {
        setDraft(null)
        onEditEnd?.()
      }}
    />
  )
}
