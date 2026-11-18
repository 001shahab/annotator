import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import {
  area,
  clamp,
  clampPoint,
  contains,
  handleAnchor,
  hitHandle,
  moveRect,
  rectFromPoints,
  resizeRect,
} from '../lib/geometry.js'
import { cx, isTyping, textOn } from '../lib/util.js'
import { FitIcon, MinusIcon, PlusIcon } from './Icons.jsx'
import LabelPicker from './LabelPicker.jsx'

const MIN_SCALE = 0.02
const MAX_SCALE = 40
const DRAG_THRESHOLD = 3 // screen pixels before a press becomes a drag
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_CURSOR = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}
const NEUTRAL = '#c4a02c'

function Box({ rect, view, color, name, selected, hovered, dashed, showSize }) {
  const left = view.tx + rect.x * view.s
  const top = view.ty + rect.y * view.s
  return (
    <div
      className={cx('box', selected && 'is-selected', hovered && 'is-hovered', dashed && 'is-dashed')}
      style={{
        left,
        top,
        width: rect.w * view.s,
        height: rect.h * view.s,
        '--c': color,
        '--t': textOn(color),
      }}
    >
      {name && <span className={cx('box-tag', top < 22 && 'is-inside')}>{name}</span>}
      {showSize && (
        <span className="box-size">
          {Math.round(rect.w)} × {Math.round(rect.h)}
        </span>
      )}
      {selected && HANDLES.map((handle) => <i key={handle} className={`handle handle-${handle}`} />)}
    </div>
  )
}

/**
 * The canvas. One gesture model, no modes to think about:
 *
 *   drag on the image            draw a box
 *   click a box                  select it (click again to reach the one beneath)
 *   drag a selected box / edge   move / resize it
 *   scroll                       pan            pinch or Cmd/Ctrl + scroll   zoom
 *   hold Space and drag          pan
 *
 * Mounted with key={image.id}, so every image starts fresh and fitted.
 */
export default function Stage({
  image,
  annotations,
  labels,
  labelMap,
  hidden,
  selectedId,
  hoverId,
  tool,
  suggestions,
  activeColor,
  pendingRect,
  working,
  picker,
  pickerHighlightId,
  controls,
  onSelect,
  onCreate,
  onEdit,
  onMagic,
  onAcceptSuggestion,
  onRequestLabel,
  onPickLabel,
  onCreateLabel,
  onClosePicker,
  children,
}) {
  const stageRef = useRef(null)
  const surfaceRef = useRef(null)
  const guideX = useRef(null)
  const guideY = useRef(null)
  const readout = useRef(null)
  const drag = useRef(null)
  const fitted = useRef(true)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 })
  const [draft, setDraft] = useState(null)
  const [cursor, setCursor] = useState('crosshair')
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [pointerInside, setPointerInside] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const viewRef = useRef(view)
  viewRef.current = view

  const visible = useMemo(
    () => annotations.filter((box) => !hidden.has(box.label_id)),
    [annotations, hidden],
  )
  const selected = useMemo(
    () => visible.find((box) => box.id === selectedId) || null,
    [visible, selectedId],
  )

  // ------------------------------------------------------------------ view

  const fitView = useCallback(
    (width, height) => {
      const top = 28
      const availableW = Math.max(40, width - 64)
      const availableH = Math.max(40, height - top - 104) // leave room for the toolbar
      const s = clamp(Math.min(availableW / image.width, availableH / image.height), MIN_SCALE, 8)
      return {
        s,
        tx: (width - image.width * s) / 2,
        ty: top + (availableH - image.height * s) / 2,
      }
    },
    [image.width, image.height],
  )

  useLayoutEffect(() => {
    const element = stageRef.current
    const measure = () => {
      const box = element.getBoundingClientRect()
      setSize((old) => (old.w === box.width && old.h === box.height ? old : { w: box.width, h: box.height }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (size.w && size.h && fitted.current) setView(fitView(size.w, size.h))
  }, [size.w, size.h, fitView])

  const zoomAt = useCallback((factor, px, py) => {
    fitted.current = false
    setView((old) => {
      const s = clamp(old.s * factor, MIN_SCALE, MAX_SCALE)
      const k = s / old.s
      return { s, tx: px - (px - old.tx) * k, ty: py - (py - old.ty) * k }
    })
  }, [])

  useImperativeHandle(
    controls,
    () => ({
      fit: () => {
        fitted.current = true
        setView(fitView(size.w, size.h))
      },
      zoomBy: (factor) => zoomAt(factor, size.w / 2, size.h / 2),
    }),
    [fitView, zoomAt, size.w, size.h],
  )

  // Scroll pans, pinch (or Cmd/Ctrl + scroll) zooms around the pointer.
  useEffect(() => {
    const element = surfaceRef.current
    const local = (event) => {
      const box = element.getBoundingClientRect()
      return [event.clientX - box.left, event.clientY - box.top]
    }
    const onWheel = (event) => {
      event.preventDefault()
      const [px, py] = local(event)
      if (event.ctrlKey || event.metaKey) {
        zoomAt(Math.exp(-clamp(event.deltaY, -25, 25) * 0.012), px, py)
        return
      }
      let dx = event.deltaX
      let dy = event.deltaY
      if (event.shiftKey && dx === 0) [dx, dy] = [dy, 0]
      if (event.deltaMode === 1) [dx, dy] = [dx * 16, dy * 16]
      fitted.current = false
      setView((old) => ({ s: old.s, tx: old.tx - dx, ty: old.ty - dy }))
    }
    // Safari reports trackpad pinches as gesture events instead of wheel events.
    let lastScale = 1
    const onGestureStart = (event) => {
      event.preventDefault()
      lastScale = 1
    }
    const onGestureChange = (event) => {
      event.preventDefault()
      const [px, py] = local(event)
      zoomAt(event.scale / lastScale, px, py)
      lastScale = event.scale
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('gesturestart', onGestureStart)
    element.addEventListener('gesturechange', onGestureChange)
    return () => {
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('gesturestart', onGestureStart)
      element.removeEventListener('gesturechange', onGestureChange)
    }
  }, [zoomAt])

  // Hold Space to pan.
  useEffect(() => {
    const onDown = (event) => {
      if (event.code !== 'Space' || isTyping(event.target)) return
      event.preventDefault()
      setSpaceHeld(true)
    }
    const onUp = (event) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const onBlur = () => setSpaceHeld(false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // --------------------------------------------------------------- pointer

  const locate = (event) => {
    const box = surfaceRef.current.getBoundingClientRect()
    const px = event.clientX - box.left
    const py = event.clientY - box.top
    const v = viewRef.current
    return { px, py, v, point: { x: (px - v.tx) / v.s, y: (py - v.ty) / v.s } }
  }

  const toScreen = (rect, v) => ({ l: v.tx + rect.x * v.s, t: v.ty + rect.y * v.s, w: rect.w * v.s, h: rect.h * v.s })

  const smallestUnder = (boxes, point) => {
    let best = -1
    boxes.forEach((box, index) => {
      if (contains(box, point) && (best < 0 || area(box) < area(boxes[best]))) best = index
    })
    return best
  }

  const moveGuides = (px, py, point) => {
    if (guideX.current) guideX.current.style.transform = `translateX(${Math.round(px)}px)`
    if (guideY.current) guideY.current.style.transform = `translateY(${Math.round(py)}px)`
    if (readout.current) {
      const within = point.x >= 0 && point.y >= 0 && point.x <= image.width && point.y <= image.height
      readout.current.textContent = within ? `${Math.round(point.x)}, ${Math.round(point.y)}` : ''
    }
  }

  const idleCursor = (px, py, v, point) => {
    if (spaceHeld) return 'grab'
    if (selected) {
      const handle = hitHandle(toScreen(selected, v), px, py)
      if (handle) return HANDLE_CURSOR[handle]
      if (contains(selected, point)) return 'move'
    }
    if (smallestUnder(suggestions, point) >= 0) return 'pointer'
    return 'crosshair'
  }

  const onPointerDown = (event) => {
    const { px, py, v, point } = locate(event)
    const panning = event.button === 1 || (event.button === 0 && spaceHeld)
    if (!panning && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)

    if (panning) {
      event.preventDefault()
      drag.current = { type: 'pan', px, py, tx: v.tx, ty: v.ty }
      setCursor('grabbing')
      return
    }
    if (selected) {
      const handle = hitHandle(toScreen(selected, v), px, py)
      if (handle) {
        // Remember where on the handle the press landed so the edge does not jump.
        const anchor = handleAnchor(selected, handle)
        drag.current = {
          type: 'resize',
          handle,
          original: selected,
          px,
          py,
          offset: {
            x: anchor.x === null ? 0 : anchor.x - point.x,
            y: anchor.y === null ? 0 : anchor.y - point.y,
          },
          moved: false,
          rect: null,
        }
        return
      }
      if (contains(selected, point)) {
        drag.current = { type: 'move', original: selected, start: point, px, py, moved: false, rect: null }
        return
      }
    }
    drag.current = { type: 'draw', start: clampPoint(point, image), px, py, moved: false, rect: null }
  }

  const onPointerMove = (event) => {
    const { px, py, v, point } = locate(event)
    moveGuides(px, py, point)
    const action = drag.current
    if (!action) {
      setCursor(idleCursor(px, py, v, point))
      return
    }
    if (action.type === 'pan') {
      fitted.current = false
      setView({ s: v.s, tx: action.tx + (px - action.px), ty: action.ty + (py - action.py) })
      return
    }
    if (!action.moved && Math.hypot(px - action.px, py - action.py) < DRAG_THRESHOLD) return
    action.moved = true

    if (action.type === 'draw') {
      action.rect = rectFromPoints(action.start, clampPoint(point, image))
      setDraft({ kind: 'draw', rect: action.rect })
    } else if (action.type === 'move') {
      action.rect = moveRect(action.original, point.x - action.start.x, point.y - action.start.y, image)
      setDraft({ kind: 'edit', id: action.original.id, rect: action.rect })
    } else {
      const target = { x: point.x + action.offset.x, y: point.y + action.offset.y }
      action.rect = resizeRect(action.original, action.handle, target, image)
      setDraft({ kind: 'edit', id: action.original.id, rect: action.rect })
    }
  }

  const click = (point) => {
    const suggestion = smallestUnder(suggestions, point)
    if (suggestion >= 0) {
      onAcceptSuggestion(suggestion)
      return
    }
    if (tool === 'magic') {
      if (contains({ x: 0, y: 0, w: image.width, h: image.height }, point)) onMagic(point)
      return
    }
    const under = visible.filter((box) => contains(box, point)).sort((a, b) => area(a) - area(b))
    if (under.length === 0) {
      onSelect(null)
      return
    }
    // Clicking the selected box again reaches the next one underneath.
    const position = under.findIndex((box) => box.id === selectedId)
    onSelect(under[(position + 1) % under.length].id)
  }

  const onPointerUp = (event) => {
    const action = drag.current
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!action) return
    const { px, py, v, point } = locate(event)
    setCursor(idleCursor(px, py, v, point))
    if (action.type === 'pan') return
    setDraft(null)

    if (!action.moved || !action.rect) {
      click(point)
      return
    }
    if (action.type === 'draw') {
      const bigEnough = action.rect.w * v.s >= 5 && action.rect.h * v.s >= 5 && action.rect.w >= 1 && action.rect.h >= 1
      if (bigEnough) onCreate(action.rect, { smart: tool === 'magic' })
    } else {
      onEdit(action.original.id, action.rect)
    }
  }

  const onPointerCancel = () => {
    drag.current = null
    setDraft(null)
  }

  const onDoubleClick = (event) => {
    if (tool === 'magic') return
    const { point } = locate(event)
    const index = smallestUnder(visible, point)
    if (index >= 0) onRequestLabel(visible[index].id)
  }

  // ---------------------------------------------------------------- render

  const ready = size.w > 0
  const paper = {
    left: view.tx,
    top: view.ty,
    width: image.width * view.s,
    height: image.height * view.s,
  }

  let pickerStyle = null
  if (picker) {
    const anchor = toScreen(picker.rect, view)
    const below = anchor.t + anchor.h + 8
    pickerStyle = {
      left: clamp(anchor.l, 8, Math.max(8, size.w - 252)),
      top: below + 260 > size.h ? clamp(anchor.t - 268, 8, Math.max(8, size.h - 268)) : below,
    }
  }

  return (
    <div className={cx('stage', working && 'is-working')} ref={stageRef}>
      <div
        ref={surfaceRef}
        className="stage-surface"
        style={{ cursor: spaceHeld && cursor !== 'grabbing' ? 'grab' : cursor, visibility: ready ? 'visible' : 'hidden' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={() => setPointerInside(true)}
        onPointerLeave={() => setPointerInside(false)}
        onDoubleClick={onDoubleClick}
      >
        <div className={cx('paper', loaded && 'is-loaded')} style={paper} />
        <img
          className={cx('stage-image', view.s >= 4 && 'is-pixelated')}
          src={api.imageUrl(image.id)}
          alt=""
          draggable={false}
          width={image.width}
          height={image.height}
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
        />

        {visible.map((box) => {
          const label = labelMap.get(box.label_id)
          const editing = draft && draft.kind === 'edit' && draft.id === box.id
          return (
            <Box
              key={box.id}
              rect={editing ? draft.rect : box}
              view={view}
              color={label ? label.color : NEUTRAL}
              name={label ? label.name : '?'}
              selected={box.id === selectedId}
              hovered={box.id === hoverId}
              showSize={editing}
            />
          )
        })}

        {suggestions.map((suggestion, index) => {
          const label = labelMap.get(suggestion.label_id)
          return (
            <Box
              key={`suggestion-${index}-${suggestion.x}-${suggestion.y}`}
              rect={suggestion}
              view={view}
              color={label ? label.color : activeColor || NEUTRAL}
              name="+"
              dashed
            />
          )
        })}

        {pendingRect && <Box rect={pendingRect} view={view} color={NEUTRAL} dashed />}
        {draft && draft.kind === 'draw' && (
          <Box rect={draft.rect} view={view} color={activeColor || NEUTRAL} showSize />
        )}

        <div className={cx('guides', pointerInside && !spaceHeld && !(draft && draft.kind === 'edit') && 'is-on')}>
          <i className="guide guide-x" ref={guideX} />
          <i className="guide guide-y" ref={guideY} />
        </div>
      </div>

      <span className="readout" ref={readout} />

      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" data-tip="Zoom out" data-key="−" onClick={() => zoomAt(1 / 1.25, size.w / 2, size.h / 2)}>
          <MinusIcon size={16} />
        </button>
        <span className="zoom-value">{Math.round(view.s * 100)}%</span>
        <button type="button" data-tip="Zoom in" data-key="+" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}>
          <PlusIcon size={16} />
        </button>
        <button
          type="button"
          data-tip="Fit to window"
          data-key="0"
          onClick={() => {
            fitted.current = true
            setView(fitView(size.w, size.h))
          }}
        >
          <FitIcon size={16} />
        </button>
      </div>

      {picker && (
        <LabelPicker
          key={picker.key}
          labels={labels}
          highlightId={pickerHighlightId}
          style={pickerStyle}
          onPick={onPickLabel}
          onCreate={onCreateLabel}
          onClose={onClosePicker}
        />
      )}

      {children}
    </div>
  )
}
