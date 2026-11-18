export const cx = (...names) => names.filter(Boolean).join(' ')

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

export const boxes = (count) => plural(count, 'box', 'boxes')

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)

/** Shortcut text for the platform: "⌘Z" on a Mac, "Ctrl+Z" elsewhere. */
export const modKey = (key, shift = false) =>
  IS_MAC ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`

/** True when the keyboard event belongs to a text field, not to the canvas. */
export function isTyping(target) {
  if (!target || !target.tagName) return false
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true
  if (tag !== 'INPUT') return false
  const type = (target.type || 'text').toLowerCase()
  return !['checkbox', 'radio', 'button', 'color', 'file', 'range'].includes(type)
}

/** Black or white, whichever reads better on the given #RRGGBB colour. */
export function textOn(hex) {
  if (typeof hex !== 'string' || hex.length !== 7) return '#ffffff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'
}

// Small things worth remembering between visits (never critical).
export function remember(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, String(value))
  } catch {
    // storage may be unavailable; that is fine
  }
}

export function recall(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function download(url) {
  const link = document.createElement('a')
  link.href = url
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
}
