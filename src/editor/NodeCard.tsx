import type { PointerEvent as ReactPointerEvent } from 'react'
import type { GraphNode, NodeTypeDefinition, PropertyDefinition, Value } from '../core'
import { ValueField } from './ValueField'

interface NodeCardProps {
  node: GraphNode
  definition: NodeTypeDefinition | undefined
  color: string
  selected: boolean
  variableNames: string[]
  connectedInputs: ReadonlySet<string>
  portState: (portId: string) => 'idle' | 'source' | 'compatible' | 'incompatible'
  registerPort: (key: string, element: HTMLButtonElement | null) => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, nodeId: string) => void
  onPortPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, portId: string) => void
  onChangeProperty: (nodeId: string, propertyId: string, value: Value, mode: 'preview' | 'commit') => void
  onChangeInput: (nodeId: string, portId: string, value: Value, mode: 'preview' | 'commit') => void
  onEditEnd: () => void
  defaultFor: (dataType: string) => Value
  typeColor: (dataType?: string) => string
}

export function NodeCard({
  node,
  definition,
  color,
  selected,
  variableNames,
  connectedInputs,
  portState,
  registerPort,
  onPointerDown,
  onPortPointerDown,
  onChangeProperty,
  onChangeInput,
  onEditEnd,
  defaultFor,
  typeColor,
}: NodeCardProps) {
  if (!definition) {
    return (
      <article
        className={selected ? 'node node-unknown selected' : 'node node-unknown'}
        style={{ left: node.x, top: node.y }}
        data-node-id={node.id}
        data-testid={`node-${node.typeId}`}
        onPointerDown={(event) => onPointerDown(event, node.id)}
      >
        <header className="node-header">
          <strong>Неизвестная нода</strong>
        </header>
        <p className="node-missing">Подключите плагин для «{node.typeId}». Пока его нет, нода сохраняется в проекте.</p>
      </article>
    )
  }

  const rows = Math.max(definition.inputs.length, definition.outputs.length)

  return (
    <article
      className={selected ? 'node selected' : 'node'}
      style={{ left: node.x, top: node.y, borderTopColor: color }}
      data-node-id={node.id}
      data-testid={`node-${definition.id}`}
      onPointerDown={(event) => onPointerDown(event, node.id)}
    >
      <header className="node-header">
        <strong>{definition.title}</strong>
      </header>
      {definition.properties.length > 0 ? (
        <div className="node-properties">
          {definition.properties.map((property) => (
            <PropertyRow
              key={property.id}
              property={property}
              value={node.properties[property.id] ?? property.defaultValue}
              variableNames={variableNames}
              onChange={(value, mode) => onChangeProperty(node.id, property.id, value, mode)}
              onEditEnd={onEditEnd}
            />
          ))}
        </div>
      ) : null}
      {rows > 0 ? (
        <div className="ports">
          {Array.from({ length: rows }, (_, index) => {
            const input = definition.inputs[index]
            const output = definition.outputs[index]
            return (
              <div className="port-row" key={`${input?.id ?? 'in'}-${output?.id ?? 'out'}`}>
                <div className="port-side">
                  {input ? (
                    <>
                      <PortButton
                        nodeId={node.id}
                        portId={input.id}
                        label={input.label}
                        kind={input.kind}
                        direction="input"
                        color={input.kind === 'data' ? typeColor(input.dataType) : undefined}
                        state={portState(input.id)}
                        registerPort={registerPort}
                        onPointerDown={onPortPointerDown}
                      />
                      <span className="port-label">{input.label}</span>
                      {input.kind === 'data' && input.dataType && !connectedInputs.has(input.id) ? (
                        <ValueField
                          label={input.label}
                          dataType={input.dataType}
                          value={node.inputs[input.id] ?? defaultFor(input.dataType)}
                          variableNames={variableNames}
                          onChange={(value, mode) => onChangeInput(node.id, input.id, value, mode)}
                          onEditEnd={onEditEnd}
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="port-side output">
                  {output ? (
                    <>
                      <span className="port-label">{output.label}</span>
                      <PortButton
                        nodeId={node.id}
                        portId={output.id}
                        label={output.label}
                        kind={output.kind}
                        direction="output"
                        color={output.kind === 'data' ? typeColor(output.dataType) : undefined}
                        state={portState(output.id)}
                        registerPort={registerPort}
                        onPointerDown={onPortPointerDown}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </article>
  )
}

function PropertyRow({
  property,
  value,
  variableNames,
  onChange,
  onEditEnd,
}: {
  property: PropertyDefinition
  value: Value
  variableNames: string[]
  onChange: (value: Value, mode: 'preview' | 'commit') => void
  onEditEnd: () => void
}) {
  return (
    <label className="node-property">
      <span>{property.label}</span>
      <ValueField
        label={property.label}
        value={value}
        dataType={property.dataType}
        options={property.options}
        widget={property.widget}
        variableNames={variableNames}
        onChange={onChange}
        onEditEnd={onEditEnd}
      />
    </label>
  )
}

function PortButton({
  nodeId,
  portId,
  label,
  kind,
  direction,
  color,
  state,
  registerPort,
  onPointerDown,
}: {
  nodeId: string
  portId: string
  label: string
  kind: 'exec' | 'data'
  direction: 'input' | 'output'
  color?: string
  state: string
  registerPort: (key: string, element: HTMLButtonElement | null) => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, portId: string) => void
}) {
  return (
    <button
      type="button"
      className={`port port-${kind} port-${direction} ${state}`}
      style={color ? { background: color } : undefined}
      aria-label={label}
      data-node-id={nodeId}
      data-port-id={portId}
      data-direction={direction}
      data-kind={kind}
      ref={(element) => registerPort(`${nodeId}:${portId}`, element)}
      onPointerDown={(event) => onPointerDown(event, nodeId, portId)}
    />
  )
}
