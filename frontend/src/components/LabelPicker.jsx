import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '../lib/util.js'
import { CheckIcon, PlusIcon } from './Icons.jsx'

/**
 * The little panel that asks "what is this?" right next to a box.
 * Type to filter, Enter to accept, or press 1-9 to pick straight away.
 * Typing a name that does not exist yet offers to create it.
 */
export default function LabelPicker({ labels, highlightId, style, onPick, onCreate, onClose }) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(() => Math.max(0, labels.findIndex((label) => label.id === highlightId)))
  const [creating, setCreating] = useState(false)

  const needle = query.trim().toLowerCase()
  const rows = useMemo(() => {
    const matching = needle
      ? labels
          .filter((label) => label.name.toLowerCase().includes(needle))
          .sort(
            (a, b) =>
              Number(b.name.toLowerCase().startsWith(needle)) - Number(a.name.toLowerCase().startsWith(needle)),
          )
      : labels
    const list = matching.map((label) => ({ kind: 'label', label }))
    if (needle && !labels.some((label) => label.name.toLowerCase() === needle)) {
      list.push({ kind: 'create', name: query.trim() })
    }
    return list
  }, [labels, needle, query])

  const active = Math.min(index, Math.max(0, rows.length - 1))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Clicking anywhere else puts the picker away (the label list on the right
  // is the exception: it can answer the question too).
  useEffect(() => {
    const onDown = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (event.target.closest?.('[data-answers-picker]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [onClose])

  useEffect(() => {
    rootRef.current?.querySelector('.picker-row.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active, rows.length])

  const choose = async (row) => {
    if (!row || creating) return
    if (row.kind === 'label') {
      onPick(row.label.id)
      return
    }
    setCreating(true)
    await onCreate(row.name)
    setCreating(false)
  }

  const onKeyDown = (event) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(rows[active])
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex(rows.length ? (active + 1) % rows.length : 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex(rows.length ? (active - 1 + rows.length) % rows.length : 0)
    } else if (!query && /^[1-9]$/.test(event.key) && labels[Number(event.key) - 1]) {
      event.preventDefault()
      onPick(labels[Number(event.key) - 1].id)
    }
  }

  return (
    <div className="picker" ref={rootRef} style={style} role="dialog" aria-label="Choose a label">
      <input
        ref={inputRef}
        className="picker-input"
        value={query}
        placeholder={labels.length ? 'Choose, or type a new label…' : 'Name the first label…'}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value)
          setIndex(0)
        }}
        onKeyDown={onKeyDown}
      />
      {rows.length > 0 && (
        <ul className="picker-list">
          {rows.map((row, position) =>
            row.kind === 'label' ? (
              <li
                key={row.label.id}
                className={cx('picker-row', position === active && 'is-active')}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setIndex(position)}
                onClick={() => choose(row)}
              >
                <span className="dot" style={{ background: row.label.color }} />
                <span className="picker-name">{row.label.name}</span>
                {row.label.id === highlightId && <CheckIcon size={14} />}
                {!needle && labels.indexOf(row.label) < 9 && <kbd>{labels.indexOf(row.label) + 1}</kbd>}
              </li>
            ) : (
              <li
                key="create"
                className={cx('picker-row is-create', position === active && 'is-active')}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setIndex(position)}
                onClick={() => choose(row)}
              >
                <PlusIcon size={14} />
                <span className="picker-name">
                  Create “{row.name}”
                </span>
                <kbd>↵</kbd>
              </li>
            ),
          )}
        </ul>
      )}
      {rows.length === 0 && <p className="picker-hint">Type a name and press Enter.</p>}
      {rows.length > 0 && !needle && (
        <p className="picker-foot">
          <kbd>↵</kbd> keep · or type a new label name
        </p>
      )}
    </div>
  )
}
