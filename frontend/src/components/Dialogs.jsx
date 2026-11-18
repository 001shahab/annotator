import { useEffect, useRef, useState } from 'react'
import { cx, modKey } from '../lib/util.js'
import { CloseIcon } from './Icons.jsx'

function Modal({ label, wide, onClose, children }) {
  return (
    <div
      className="scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={cx('modal', wide && 'is-wide')} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

/** A question with a clear way out. `option` adds one checkbox. */
export function ConfirmDialog({ title, body, confirm, danger, option, onConfirm, onClose }) {
  const [checked, setChecked] = useState(option ? option.initial : false)
  const confirmRef = useRef(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    <Modal label={title} onClose={onClose}>
      <h2>{title}</h2>
      <p>{body}</p>
      {option && (
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          {option.label}
        </label>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          ref={confirmRef}
          className={cx('btn', danger ? 'is-danger' : 'is-primary')}
          onClick={() => {
            onClose()
            onConfirm(checked)
          }}
        >
          {confirm}
        </button>
      </div>
    </Modal>
  )
}

const SHORTCUTS = [
  {
    title: 'Draw and edit',
    rows: [
      ['Drag', 'Draw a box'],
      ['Click', 'Select a box (again: the one beneath)'],
      ['Drag box / edge', 'Move / resize'],
      ['← ↑ → ↓', 'Nudge 1 px (Shift: 10 px)'],
      ['Delete', 'Remove the selected box'],
      ['Tab', 'Select the next box'],
      ['Esc', 'Deselect or cancel'],
      [modKey('Z'), 'Undo'],
      [modKey('Z', true), 'Redo'],
    ],
  },
  {
    title: 'Labels',
    rows: [
      ['1 – 9', 'Choose the label to draw with'],
      ['Enter or L', 'Change the selected box’s label'],
      ['Double-click', 'Change a box’s label'],
      ['H', 'Hide or show all boxes'],
    ],
  },
  {
    title: 'Smart tools',
    rows: [
      ['M', 'Magic: click an object, or drag a rough box'],
      ['B', 'Back to the plain box tool'],
      ['S', 'Snap the selected box to its object'],
      ['F', 'Find similar objects'],
      ['G', 'Suggest boxes for this image'],
      ['Enter', 'Accept all suggestions'],
      ['P', 'Copy boxes from the previous image'],
    ],
  },
  {
    title: 'Move around',
    rows: [
      ['D or →', 'Next image'],
      ['A or ←', 'Previous image'],
      ['Scroll', 'Pan'],
      ['Pinch', `Zoom (or ${modKey('scroll')})`],
      ['Space + drag', 'Pan'],
      ['+  −  0', 'Zoom in, out, fit'],
    ],
  },
]

export function ShortcutsDialog({ onClose }) {
  return (
    <Modal label="Keyboard shortcuts" wide onClose={onClose}>
      <div className="modal-head">
        <h2>Keyboard shortcuts</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="keys">
        {SHORTCUTS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.rows.map(([keys, what]) => (
                <div key={keys + what}>
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="modal-foot">© 2026 - Prof. Shahab Anbarjafari</p>
    </Modal>
  )
}

export function Toasts({ toasts, onDismiss }) {
  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button type="button" key={toast.id} className={cx('toast', `is-${toast.kind}`)} onClick={() => onDismiss(toast.id)}>
          {toast.message}
        </button>
      ))}
    </div>
  )
}

export function UploadProgress({ upload }) {
  const share = Math.round((upload.done / upload.total) * 100)
  return (
    <div className="uploading" role="status">
      <div className="uploading-text">
        <strong>
          Adding {upload.done + 1} of {upload.total}
        </strong>
        <span title={upload.name}>{upload.name}</span>
      </div>
      <div className="progress">
        <i style={{ width: `${Math.max(6, share)}%` }} />
      </div>
    </div>
  )
}

export function DropOverlay({ pdf }) {
  return (
    <div className="drop-overlay">
      <div>
        <strong>Drop to add</strong>
        <span>Images{pdf ? ' and PDFs' : ''}</span>
      </div>
    </div>
  )
}
