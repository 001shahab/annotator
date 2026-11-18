import { useRef, useState } from 'react'
import { cx } from '../lib/util.js'
import { CloseIcon, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, TrashIcon } from './Icons.jsx'

const stop = (event) => event.stopPropagation()

function LabelRow({ label, position, count, active, isHidden, onActivate, onToggle, onSolo, onRename, onRecolor, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(label.name)

  const finished = useRef(true)

  const startEditing = () => {
    finished.current = false
    setName(label.name)
    setEditing(true)
  }
  const finish = (commit) => {
    // Enter and the blur that follows it must not both commit.
    if (finished.current) return
    finished.current = true
    setEditing(false)
    const next = name.trim()
    if (commit && next && next !== label.name) onRename(label.id, next)
  }

  return (
    <li
      className={cx('label-row', active && 'is-active', isHidden && 'is-hidden')}
      onClick={() => onActivate(label.id)}
    >
      <label className="swatch" style={{ background: label.color }} title="Change colour" onClick={stop}>
        <input type="color" value={label.color} onChange={(event) => onRecolor(label.id, event.target.value)} />
      </label>

      {editing ? (
        <input
          className="label-edit"
          value={name}
          autoFocus
          spellCheck={false}
          onClick={stop}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') finish(true)
            if (event.key === 'Escape') finish(false)
          }}
        />
      ) : (
        <span className="label-name" title={label.name} onDoubleClick={startEditing}>
          {label.name}
        </span>
      )}

      <span className="label-count">{count}</span>
      {position < 9 && <kbd>{position + 1}</kbd>}

      <span className="row-actions" onClick={stop}>
        <button type="button" className="icon-btn on-hover" title="Rename" onClick={startEditing}>
          <PencilIcon size={14} />
        </button>
        <button type="button" className="icon-btn on-hover is-danger" title="Delete label" onClick={() => onDelete(label)}>
          <TrashIcon size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={isHidden ? 'Show (Alt-click: show only this)' : 'Hide (Alt-click: show only this)'}
          aria-pressed={!isHidden}
          onClick={(event) => (event.altKey ? onSolo(label.id) : onToggle(label.id))}
        >
          {isHidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
        </button>
      </span>
    </li>
  )
}

export default function LabelPanel({
  labels,
  labelMap,
  counts,
  activeLabelId,
  hidden,
  boxes,
  selectedId,
  onActivate,
  onToggle,
  onSolo,
  onShowAll,
  onHideAll,
  onCreate,
  onRename,
  onRecolor,
  onDelete,
  onSelectBox,
  onHoverBox,
  onDeleteBox,
}) {
  const [draft, setDraft] = useState('')

  const submit = (event) => {
    event.preventDefault()
    const name = draft.trim()
    if (!name) return
    setDraft('')
    onCreate(name)
  }

  const allHidden = labels.length > 0 && labels.every((label) => hidden.has(label.id))

  return (
    <aside className="rail rail-right">
      <section className="panel panel-labels" data-answers-picker>
        <div className="rail-head">
          <h2 className="rail-title is-red">Labels</h2>
          <span className="rail-count">{labels.length}</span>
          {labels.length > 0 && (
            <div className="segmented" role="group" aria-label="Label visibility">
              <button type="button" className={cx(hidden.size === 0 && 'is-on')} onClick={onShowAll}>
                Show all
              </button>
              <button type="button" className={cx(allHidden && 'is-on')} onClick={onHideAll}>
                Hide all
              </button>
            </div>
          )}
        </div>

        {labels.length === 0 ? (
          <p className="empty">
            No labels yet. Add one below, or just draw a box and name it on the spot.
          </p>
        ) : (
          <ul className="label-list">
            {labels.map((label, position) => (
              <LabelRow
                key={label.id}
                label={label}
                position={position}
                count={counts.get(label.id) || 0}
                active={label.id === activeLabelId}
                isHidden={hidden.has(label.id)}
                onActivate={onActivate}
                onToggle={onToggle}
                onSolo={onSolo}
                onRename={onRename}
                onRecolor={onRecolor}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}

        <form className="add-label" onSubmit={submit}>
          <PlusIcon size={15} />
          <input
            value={draft}
            placeholder="New label"
            spellCheck={false}
            autoComplete="off"
            maxLength={60}
            onChange={(event) => setDraft(event.target.value)}
          />
          {draft.trim() && <kbd>↵</kbd>}
        </form>
      </section>

      <section className="panel panel-boxes">
        <div className="rail-head">
          <h2 className="rail-title is-mustard">Boxes on this image</h2>
          <span className="rail-count">{boxes.length}</span>
        </div>
        {boxes.length === 0 ? (
          <p className="empty">Drag on the image to draw the first box.</p>
        ) : (
          <ul className="box-list" onMouseLeave={() => onHoverBox(null)}>
            {boxes.map((box) => {
              const label = labelMap.get(box.label_id)
              const isHidden = hidden.has(box.label_id)
              return (
                <li
                  key={box.id}
                  className={cx('box-row', box.id === selectedId && 'is-selected', isHidden && 'is-hidden')}
                  onMouseEnter={() => onHoverBox(box.id)}
                  onClick={() => onSelectBox(box.id)}
                >
                  <span className="dot" style={{ background: label ? label.color : '#aeaeb2' }} />
                  <span className="box-row-name">{label ? label.name : 'Unknown'}</span>
                  <span className="box-row-size">
                    {isHidden ? 'hidden' : `${Math.round(box.w)} × ${Math.round(box.h)}`}
                  </span>
                  <button
                    type="button"
                    className="icon-btn on-hover is-danger"
                    title="Delete box"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteBox(box.id)
                    }}
                  >
                    <CloseIcon size={13} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </aside>
  )
}
