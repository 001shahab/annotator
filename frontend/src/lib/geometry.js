// Box maths. Rectangles are { x, y, w, h } in image pixels.

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

export const round2 = (value) => Math.round(value * 100) / 100

export function clampPoint(point, image) {
  return { x: clamp(point.x, 0, image.width), y: clamp(point.y, 0, image.height) }
}

export function rectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

/** Keep a rectangle inside the image and tidy its numbers. */
export function fitRect(rect, image) {
  const x = clamp(rect.x, 0, image.width)
  const y = clamp(rect.y, 0, image.height)
  const w = clamp(rect.w, 0, image.width - x)
  const h = clamp(rect.h, 0, image.height - y)
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }
}

export function moveRect(rect, dx, dy, image) {
  return {
    x: clamp(rect.x + dx, 0, Math.max(0, image.width - rect.w)),
    y: clamp(rect.y + dy, 0, Math.max(0, image.height - rect.h)),
    w: rect.w,
    h: rect.h,
  }
}

/** Drag one handle ("nw", "n", "ne", "e", "se", "s", "sw", "w") to a point. */
export function resizeRect(rect, handle, point, image) {
  let x1 = rect.x
  let y1 = rect.y
  let x2 = rect.x + rect.w
  let y2 = rect.y + rect.h
  const px = clamp(point.x, 0, image.width)
  const py = clamp(point.y, 0, image.height)
  if (handle.includes('w')) x1 = px
  if (handle.includes('e')) x2 = px
  if (handle.includes('n')) y1 = py
  if (handle.includes('s')) y2 = py
  // Dragging past the opposite edge flips the box instead of collapsing it.
  const w = Math.max(1, Math.abs(x2 - x1))
  const h = Math.max(1, Math.abs(y2 - y1))
  return {
    x: Math.min(Math.min(x1, x2), image.width - w),
    y: Math.min(Math.min(y1, y2), image.height - h),
    w,
    h,
  }
}

/** The image-space point a handle sits on (null on the axis it does not move). */
export function handleAnchor(rect, handle) {
  return {
    x: handle.includes('w') ? rect.x : handle.includes('e') ? rect.x + rect.w : null,
    y: handle.includes('n') ? rect.y : handle.includes('s') ? rect.y + rect.h : null,
  }
}

export function contains(rect, point) {
  return (
    point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
  )
}

export const area = (rect) => rect.w * rect.h

/**
 * Which handle of a box (given in screen pixels as { l, t, w, h }) is under
 * the pointer? Corners win over edges; any point along an edge counts, so
 * there is no need to aim for a tiny dot.
 */
export function hitHandle(screen, px, py) {
  const CORNER = 9
  const EDGE = 5
  const left = screen.l
  const top = screen.t
  const right = screen.l + screen.w
  const bottom = screen.t + screen.h
  if (px < left - CORNER || px > right + CORNER || py < top - CORNER || py > bottom + CORNER) return null

  const toLeft = Math.abs(px - left)
  const toRight = Math.abs(px - right)
  const toTop = Math.abs(py - top)
  const toBottom = Math.abs(py - bottom)
  const horizontal = toLeft <= toRight ? 'w' : 'e'
  const vertical = toTop <= toBottom ? 'n' : 's'
  const dx = Math.min(toLeft, toRight)
  const dy = Math.min(toTop, toBottom)

  if (dx <= CORNER && dy <= CORNER) return vertical + horizontal
  if (dy <= EDGE) return vertical
  if (dx <= EDGE) return horizontal
  return null
}
