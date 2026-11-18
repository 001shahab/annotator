import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/util.js'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  KeyboardIcon,
  MoreIcon,
} from './Icons.jsx'

function Menu({ button, children, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu" ref={rootRef}>
      {button({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div className={cx('menu-list', `is-${align}`)} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

const SAVE_TEXT = {
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Not saved. Retrying…',
}

export default function TopBar({
  hasImages,
  index,
  total,
  current,
  saveState,
  onPrevious,
  onNext,
  onExport,
  onNewSession,
  onShowKeys,
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <i />
        </span>
        <span className="brand-name">Annotator</span>
      </div>

      <div className="topbar-center">
        {hasImages && current && (
          <>
            <button
              type="button"
              className="bar-btn is-icon"
              data-tip="Previous image"
              data-key="A"
              disabled={index <= 0}
              onClick={onPrevious}
            >
              <ChevronLeftIcon />
            </button>
            <div className="doc">
              <span className="doc-name" title={current.name}>
                {current.name}
                {current.page ? ` · page ${current.page}` : ''}
              </span>
              <span className="doc-count">
                {index + 1} of {total}
              </span>
            </div>
            <button
              type="button"
              className="bar-btn is-icon"
              data-tip="Next image"
              data-key="D"
              disabled={index >= total - 1}
              onClick={onNext}
            >
              <ChevronRightIcon />
            </button>
          </>
        )}
      </div>

      <div className="topbar-actions">
        {hasImages && (
          <span className={cx('save', `is-${saveState}`)} role="status">
            <i />
            {SAVE_TEXT[saveState]}
          </span>
        )}
        <button type="button" className="bar-btn is-icon" data-tip="Keyboard shortcuts" data-key="?" onClick={onShowKeys}>
          <KeyboardIcon />
        </button>
        {hasImages && (
          <>
            <Menu
              button={({ toggle, open }) => (
                <button type="button" className="bar-btn is-primary" aria-expanded={open} onClick={toggle}>
                  <DownloadIcon size={16} />
                  Export
                  <ChevronDownIcon size={14} />
                </button>
              )}
            >
              <button type="button" role="menuitem" onClick={() => onExport('json')}>
                <strong>COCO JSON</strong>
                <span>Annotations only</span>
              </button>
              <button type="button" role="menuitem" onClick={() => onExport('zip')}>
                <strong>COCO dataset (.zip)</strong>
                <span>Annotations and all images</span>
              </button>
            </Menu>
            <Menu
              button={({ toggle, open }) => (
                <button
                  type="button"
                  className="bar-btn is-icon"
                  aria-label="More"
                  aria-expanded={open}
                  onClick={toggle}
                >
                  <MoreIcon />
                </button>
              )}
            >
              <button type="button" role="menuitem" className="is-danger" onClick={onNewSession}>
                <strong>New session…</strong>
                <span>Clear images and boxes</span>
              </button>
            </Menu>
          </>
        )}
      </div>
      <div className="strip" aria-hidden="true" />
    </header>
  )
}
