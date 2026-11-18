import { useEffect, useRef } from 'react'
import { api } from '../api.js'
import { boxes, cx } from '../lib/util.js'
import { CloseIcon, PlusIcon } from './Icons.jsx'

export default function ImageRail({ images, currentId, annotated, onSelect, onAdd, onDelete }) {
  const listRef = useRef(null)

  useEffect(() => {
    listRef.current?.querySelector('.thumb.is-current')?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  const share = images.length ? Math.round((annotated / images.length) * 100) : 0

  return (
    <aside className="rail rail-left">
      <div className="rail-head">
        <h2 className="rail-title is-mustard">Images</h2>
        <span className="rail-count">{images.length}</span>
        <button type="button" className="chip-btn" onClick={onAdd}>
          <PlusIcon size={14} />
          Add
        </button>
      </div>

      <ul className="thumbs" ref={listRef}>
        {images.map((image) => {
          const count = image.annotations.length
          return (
            <li key={image.id} className={cx('thumb', image.id === currentId && 'is-current')}>
              <button type="button" className="thumb-main" onClick={() => onSelect(image.id)}>
                <span className="thumb-frame">
                  <img src={api.thumbUrl(image.id)} alt="" loading="lazy" draggable={false} />
                </span>
                <span className="thumb-text">
                  <span className="thumb-name" title={image.name}>
                    {image.name}
                  </span>
                  <span className="thumb-meta">
                    {image.page ? `Page ${image.page} of ${image.pages}` : `${image.width} × ${image.height}`}
                  </span>
                </span>
                <span className={cx('thumb-badge', count > 0 && 'is-done')} title={boxes(count)}>
                  {count}
                </span>
              </button>
              <button
                type="button"
                className="thumb-remove"
                aria-label={`Remove ${image.name}`}
                title="Remove image"
                onClick={() => onDelete(image)}
              >
                <CloseIcon size={12} />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="rail-foot">
        <div className="progress" role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${share}%` }} />
        </div>
        <span>
          {annotated} of {images.length} annotated
        </span>
      </div>
    </aside>
  )
}
