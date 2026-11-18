import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

/** A ref that always holds the latest value, for use inside event handlers. */
export function useLatest(value) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

/**
 * Autosave. Changes are queued per image and written a moment later, so the
 * annotator never has to think about saving. Failed writes are retried.
 *
 * state: 'saved' | 'saving' | 'error'
 */
export function useSaver() {
  const [state, setState] = useState('saved')
  const pending = useRef(new Map())
  const timer = useRef(null)
  const running = useRef(null)
  const flushRef = useRef(null)

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
    if (running.current) return running.current

    const run = async () => {
      let ok = true
      while (pending.current.size > 0) {
        const [imageId, annotations] = pending.current.entries().next().value
        pending.current.delete(imageId)
        try {
          await api.saveAnnotations(imageId, annotations)
        } catch (error) {
          if (error.status === 404) continue // the image was removed meanwhile
          // Keep the change unless a newer one for this image is already queued.
          if (!pending.current.has(imageId)) pending.current.set(imageId, annotations)
          ok = false
          break
        }
      }
      running.current = null
      if (ok) {
        setState('saved')
      } else {
        setState('error')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => flushRef.current(), 2500)
      }
      return ok
    }

    setState('saving')
    running.current = run()
    return running.current
  }, [])
  flushRef.current = flush

  const queue = useCallback(
    (imageId, annotations) => {
      pending.current.set(imageId, annotations)
      setState((current) => (current === 'error' ? current : 'saving'))
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 350)
    },
    [flush],
  )

  const forget = useCallback((imageId) => {
    pending.current.delete(imageId)
  }, [])

  const clear = useCallback(() => {
    pending.current.clear()
    clearTimeout(timer.current)
    timer.current = null
    setState('saved')
  }, [])

  // Last chance when the tab is closing: send what is still queued.
  useEffect(() => {
    const onHide = () => {
      for (const [imageId, annotations] of pending.current) {
        api.saveAnnotations(imageId, annotations, true).catch(() => {})
      }
      pending.current.clear()
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [])

  return { state, queue, flush, forget, clear }
}

/** Short messages that appear, say one thing, and leave. */
export function useToasts() {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback(
    (message, kind = 'info') => {
      const id = nextId.current++
      setToasts((list) => [...list.filter((t) => t.message !== message).slice(-2), { id, message, kind }])
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3200)
    },
    [dismiss],
  )

  return { toasts, toast, dismiss }
}
