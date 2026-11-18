// Annotator
// (c) 2026 - Prof. Shahab Anbarjafari

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { ConfirmDialog, DropOverlay, ShortcutsDialog, Toasts, UploadProgress } from './components/Dialogs.jsx'
import ImageRail from './components/ImageRail.jsx'
import LabelPanel from './components/LabelPanel.jsx'
import Stage from './components/Stage.jsx'
import Toolbar from './components/Toolbar.jsx'
import TopBar from './components/TopBar.jsx'
import Welcome from './components/Welcome.jsx'
import { useLatest, useSaver, useToasts } from './hooks.js'
import { fitRect, moveRect } from './lib/geometry.js'
import { boxes as countBoxes, download, isTyping, plural, recall, remember, uid } from './lib/util.js'

const ACCEPTED_FILES = 'image/*,application/pdf,.pdf'
const REMEMBER_IMAGE = 'annotator.image'
const REMEMBER_LABEL = 'annotator.label'
const HISTORY_LIMIT = 200

export default function App() {
  // What the server knows.
  const [phase, setPhase] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [labels, setLabels] = useState([])
  const [images, setImages] = useState([])
  const [caps, setCaps] = useState({ smart: false, pdf: false })

  // What the annotator is doing right now.
  const [currentId, setCurrentId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [hoverId, setHoverId] = useState(null)
  const [activeLabelId, setActiveLabelId] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())
  const [tool, setTool] = useState('draw')
  const [suggestions, setSuggestions] = useState([])
  const [picker, setPicker] = useState(null) // { key, mode: 'new', rect } | { key, mode: 'edit', boxId }
  const [snapping, setSnapping] = useState(null) // rough box waiting for the snap result
  const [working, setWorking] = useState(false)
  const [upload, setUpload] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [showKeys, setShowKeys] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [flash, setFlash] = useState(null)
  const [, setHistoryTick] = useState(0)

  const { toasts, toast, dismiss } = useToasts()
  const saver = useSaver()
  const { queue: queueSave, flush: flushSaves, forget: forgetSaves, clear: clearSaves } = saver

  // `imagesRef` is the source of truth between renders, so several edits in
  // one tick always build on each other.
  const imagesRef = useRef(images)
  const history = useRef(new Map())
  const peekRestore = useRef(null)
  const colorTimers = useRef(new Map())
  const fileInput = useRef(null)
  const stageControls = useRef(null)
  const dragDepth = useRef(0)

  const labelsRef = useLatest(labels)
  const capsRef = useLatest(caps)
  const currentIdRef = useLatest(currentId)
  const selectedIdRef = useLatest(selectedId)
  const activeLabelIdRef = useLatest(activeLabelId)
  const hiddenRef = useLatest(hidden)
  const suggestionsRef = useLatest(suggestions)
  const pickerRef = useLatest(picker)

  // ------------------------------------------------------------- derived

  const current = useMemo(() => images.find((image) => image.id === currentId) || null, [images, currentId])
  const currentIndex = current ? images.indexOf(current) : -1
  const labelMap = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels])
  const counts = useMemo(() => {
    const totals = new Map()
    for (const image of images) {
      for (const box of image.annotations) totals.set(box.label_id, (totals.get(box.label_id) || 0) + 1)
    }
    return totals
  }, [images])
  const annotated = useMemo(() => images.filter((image) => image.annotations.length > 0).length, [images])
  const activeLabel = labelMap.get(activeLabelId) || null
  // A box whose label is hidden cannot be selected.
  const selected = useMemo(() => {
    const box = current?.annotations.find((item) => item.id === selectedId)
    return box && !hidden.has(box.label_id) ? box : null
  }, [current, selectedId, hidden])
  const selectedRef = useLatest(selected)
  const peeking = labels.length > 0 && labels.every((label) => hidden.has(label.id))
  const stacks = current ? history.current.get(current.id) : null

  // --------------------------------------------------------------- basics

  const applyImages = useCallback((update) => {
    const next = update(imagesRef.current)
    imagesRef.current = next
    setImages(next)
  }, [])

  const currentImage = useCallback(
    () => imagesRef.current.find((image) => image.id === currentIdRef.current) || null,
    [currentIdRef],
  )

  const validLabel = useCallback(
    (labelId) => labelId !== null && labelId !== undefined && labelsRef.current.some((label) => label.id === labelId),
    [labelsRef],
  )

  const goTo = useCallback(
    (imageId) => {
      if (imageId === currentIdRef.current) return
      currentIdRef.current = imageId
      setCurrentId(imageId)
      setSelectedId(null)
      setHoverId(null)
      setSuggestions([])
      setPicker(null)
      setSnapping(null)
    },
    [currentIdRef],
  )

  const step = useCallback(
    (delta) => {
      const list = imagesRef.current
      const index = list.findIndex((image) => image.id === currentIdRef.current)
      const target = list[index + delta]
      if (index >= 0 && target) goTo(target.id)
    },
    [currentIdRef, goTo],
  )

  const load = useCallback(async () => {
    try {
      const state = await api.state()
      imagesRef.current = state.images
      setImages(state.images)
      setLabels(state.labels)
      setCaps(state.capabilities)
      const lastImage = Number(recall(REMEMBER_IMAGE))
      const lastLabel = Number(recall(REMEMBER_LABEL))
      const startImage = state.images.find((image) => image.id === lastImage) || state.images[0] || null
      const startLabel = state.labels.find((label) => label.id === lastLabel) || state.labels[0] || null
      setCurrentId(startImage ? startImage.id : null)
      setActiveLabelId(startLabel ? startLabel.id : null)
      setPhase('ready')
    } catch (error) {
      setLoadError(error.message)
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (phase === 'ready') remember(REMEMBER_IMAGE, currentId)
  }, [phase, currentId])

  useEffect(() => {
    if (phase === 'ready') remember(REMEMBER_LABEL, activeLabelId)
  }, [phase, activeLabelId])

  // -------------------------------------------------------- edits + undo

  const stacksFor = (imageId) => {
    let entry = history.current.get(imageId)
    if (!entry) {
      entry = { undo: [], redo: [] }
      history.current.set(imageId, entry)
    }
    return entry
  }

  const commit = useCallback(
    (imageId, next, record = true) => {
      const image = imagesRef.current.find((item) => item.id === imageId)
      if (!image) return
      if (record) {
        const entry = stacksFor(imageId)
        entry.undo.push(image.annotations)
        if (entry.undo.length > HISTORY_LIMIT) entry.undo.shift()
        entry.redo = []
        setHistoryTick((tick) => tick + 1)
      }
      applyImages((list) => list.map((item) => (item.id === imageId ? { ...item, annotations: next } : item)))
      queueSave(imageId, next)
    },
    [applyImages, queueSave],
  )

  const travel = useCallback(
    (from, to) => {
      const image = currentImage()
      if (!image) return
      const entry = stacksFor(image.id)
      if (entry[from].length === 0) return
      entry[to].push(image.annotations)
      const restored = entry[from].pop()
      commit(image.id, restored, false)
      setHistoryTick((tick) => tick + 1)
      setSelectedId((id) => (restored.some((box) => box.id === id) ? id : null))
      setPicker(null)
    },
    [commit, currentImage],
  )
  const undo = useCallback(() => travel('undo', 'redo'), [travel])
  const redo = useCallback(() => travel('redo', 'undo'), [travel])

  const reveal = useCallback((labelIds) => {
    setHidden((old) => {
      if (!labelIds.some((id) => old.has(id))) return old
      const next = new Set(old)
      labelIds.forEach((id) => next.delete(id))
      return next
    })
  }, [])

  /** Add boxes ({ x, y, w, h, label_id }) to the current image in one undo step. */
  const addBoxes = useCallback(
    (rects, { select = true } = {}) => {
      const image = currentImage()
      if (!image) return
      const created = rects
        .map((rect) => ({ id: uid(), label_id: rect.label_id, ...fitRect(rect, image) }))
        .filter((box) => box.w >= 1 && box.h >= 1)
      if (created.length === 0) return
      commit(image.id, [...image.annotations, ...created])
      reveal(created.map((box) => box.label_id))
      if (select && created.length === 1) setSelectedId(created[0].id)
    },
    [commit, currentImage, reveal],
  )

  const editBox = useCallback(
    (boxId, rect) => {
      const image = currentImage()
      if (!image) return
      const fitted = fitRect(rect, image)
      if (fitted.w < 1 || fitted.h < 1) return
      commit(
        image.id,
        image.annotations.map((box) => (box.id === boxId ? { ...box, ...fitted } : box)),
      )
    },
    [commit, currentImage],
  )

  const deleteBox = useCallback(
    (boxId) => {
      const image = currentImage()
      if (!image || !image.annotations.some((box) => box.id === boxId)) return
      commit(
        image.id,
        image.annotations.filter((box) => box.id !== boxId),
      )
      setSelectedId((id) => (id === boxId ? null : id))
      setHoverId(null)
    },
    [commit, currentImage],
  )

  const relabelBox = useCallback(
    (boxId, labelId) => {
      const image = currentImage()
      const box = image?.annotations.find((item) => item.id === boxId)
      if (!box) return
      if (box.label_id !== labelId) {
        commit(
          image.id,
          image.annotations.map((item) => (item.id === boxId ? { ...item, label_id: labelId } : item)),
        )
      }
      reveal([labelId])
    },
    [commit, currentImage, reveal],
  )

  // --------------------------------------------------------------- labels

  const showFlash = useCallback((label) => {
    setFlash({ key: Date.now(), name: label.name, color: label.color })
  }, [])

  const createLabel = useCallback(
    async (name) => {
      try {
        const { label } = await api.createLabel(name)
        setLabels((list) => (list.some((item) => item.id === label.id) ? list : [...list, label]))
        labelsRef.current = labelsRef.current.some((item) => item.id === label.id)
          ? labelsRef.current
          : [...labelsRef.current, label]
        return label
      } catch (error) {
        toast(error.message, 'error')
        return null
      }
    },
    [labelsRef, toast],
  )

  const openPicker = useCallback((next) => setPicker({ key: uid(), ...next }), [])
  const closePicker = useCallback(() => setPicker(null), [])

  /** The picker got its answer: finish whatever was waiting for a label. */
  const resolvePicker = useCallback(
    (labelId) => {
      const waiting = pickerRef.current
      if (!waiting) return
      pickerRef.current = null
      setPicker(null)
      setActiveLabelId(labelId)
      if (waiting.mode === 'new') addBoxes([{ ...waiting.rect, label_id: labelId }])
      else relabelBox(waiting.boxId, labelId)
    },
    [addBoxes, pickerRef, relabelBox],
  )

  const createLabelForPicker = useCallback(
    async (name) => {
      const label = await createLabel(name)
      if (label) resolvePicker(label.id)
    },
    [createLabel, resolvePicker],
  )

  /** Choose the label to draw with. If the picker is open, this answers it. */
  const activateLabel = useCallback(
    (labelId) => {
      if (pickerRef.current) {
        resolvePicker(labelId)
        return
      }
      setActiveLabelId(labelId)
      reveal([labelId])
    },
    [pickerRef, resolvePicker, reveal],
  )

  const createAndActivateLabel = useCallback(
    async (name) => {
      const label = await createLabel(name)
      if (!label) return
      if (pickerRef.current) resolvePicker(label.id)
      else setActiveLabelId(label.id)
    },
    [createLabel, pickerRef, resolvePicker],
  )

  /** Labels typed on the welcome screen, created in the order they were typed. */
  const addStarterLabels = useCallback(
    async (names) => {
      for (const name of names) {
        const label = await createLabel(name)
        if (label) setActiveLabelId((id) => (id === null ? label.id : id))
      }
    },
    [createLabel],
  )

  const renameLabel = useCallback(
    async (labelId, name) => {
      try {
        const { label } = await api.updateLabel(labelId, { name })
        setLabels((list) => list.map((item) => (item.id === labelId ? label : item)))
      } catch (error) {
        toast(error.message, 'error')
      }
    },
    [toast],
  )

  const recolorLabel = useCallback(
    (labelId, color) => {
      setLabels((list) => list.map((item) => (item.id === labelId ? { ...item, color } : item)))
      // Colour pickers fire continuously while dragging; save once it settles.
      clearTimeout(colorTimers.current.get(labelId))
      colorTimers.current.set(
        labelId,
        setTimeout(() => {
          api.updateLabel(labelId, { color }).catch((error) => toast(error.message, 'error'))
        }, 300),
      )
    },
    [toast],
  )

  const removeLabel = useCallback(
    async (label) => {
      try {
        await api.deleteLabel(label.id)
      } catch (error) {
        if (error.status !== 404) {
          toast(error.message, 'error')
          return
        }
      }
      const remaining = labelsRef.current.filter((item) => item.id !== label.id)
      labelsRef.current = remaining
      setLabels(remaining)
      applyImages((list) =>
        list.map((image) =>
          image.annotations.some((box) => box.label_id === label.id)
            ? { ...image, annotations: image.annotations.filter((box) => box.label_id !== label.id) }
            : image,
        ),
      )
      // Undo must never bring back boxes of a label that no longer exists.
      history.current.clear()
      setHistoryTick((tick) => tick + 1)
      setSuggestions((list) => list.filter((item) => item.label_id !== label.id))
      setActiveLabelId((id) => (id === label.id ? (remaining[0] ? remaining[0].id : null) : id))
      setHidden((old) => {
        if (!old.has(label.id)) return old
        const next = new Set(old)
        next.delete(label.id)
        return next
      })
      setPicker(null)
    },
    [applyImages, labelsRef, toast],
  )

  const requestRemoveLabel = useCallback(
    (label) => {
      const used = imagesRef.current.reduce(
        (sum, image) => sum + image.annotations.filter((box) => box.label_id === label.id).length,
        0,
      )
      if (used === 0) {
        removeLabel(label)
        return
      }
      setDialog({
        title: `Delete “${label.name}”?`,
        body: `${countBoxes(used)} with this label will be removed from your images. This cannot be undone.`,
        confirm: 'Delete label',
        danger: true,
        onConfirm: () => removeLabel(label),
      })
    },
    [removeLabel],
  )

  // ----------------------------------------------------------- visibility

  const toggleLabel = useCallback((labelId) => {
    peekRestore.current = null
    setHidden((old) => {
      const next = new Set(old)
      if (next.has(labelId)) next.delete(labelId)
      else next.add(labelId)
      return next
    })
  }, [])

  const soloLabel = useCallback(
    (labelId) => {
      peekRestore.current = null
      setHidden(new Set(labelsRef.current.filter((label) => label.id !== labelId).map((label) => label.id)))
    },
    [labelsRef],
  )

  const showAll = useCallback(() => {
    peekRestore.current = null
    setHidden(new Set())
  }, [])

  const hideAll = useCallback(() => {
    peekRestore.current = null
    setHidden(new Set(labelsRef.current.map((label) => label.id)))
  }, [labelsRef])

  /** H: look at the bare image, then bring back exactly what was visible. */
  const togglePeek = useCallback(() => {
    const everything = labelsRef.current.map((label) => label.id)
    if (everything.length === 0) return
    const before = hiddenRef.current
    if (everything.every((id) => before.has(id))) {
      setHidden(new Set(peekRestore.current || []))
      peekRestore.current = null
    } else {
      peekRestore.current = before
      setHidden(new Set(everything))
    }
  }, [hiddenRef, labelsRef])

  // ------------------------------------------------------------- drawing

  const requestLabel = useCallback(
    (boxId) => {
      setSelectedId(boxId)
      openPicker({ mode: 'edit', boxId })
    },
    [openPicker],
  )

  /** A new rectangle arrived (drawn, clicked or suggested): give it a label. */
  const createFromRect = useCallback(
    async (rect, { smart = false } = {}) => {
      const imageId = currentIdRef.current
      let box = rect
      if (smart && capsRef.current.smart) {
        setSnapping(rect)
        setWorking(true)
        try {
          const result = await api.snap(imageId, rect)
          if (result.box) box = result.box
        } catch {
          // Snapping is a bonus; the hand-drawn box is still a good box.
        } finally {
          setWorking(false)
          setSnapping(null)
        }
        if (currentIdRef.current !== imageId) return
      }
      const labelId = activeLabelIdRef.current
      if (validLabel(labelId)) addBoxes([{ ...box, label_id: labelId }])
      else openPicker({ mode: 'new', rect: box })
    },
    [activeLabelIdRef, addBoxes, capsRef, currentIdRef, openPicker, validLabel],
  )

  const nudge = useCallback(
    (dx, dy) => {
      const image = currentImage()
      const box = selectedRef.current
      if (!image || !box) return
      editBox(box.id, moveRect(box, dx, dy, image))
    },
    [currentImage, editBox, selectedRef],
  )

  const cycleSelection = useCallback(
    (direction) => {
      const image = currentImage()
      if (!image) return
      const visible = image.annotations.filter((box) => !hiddenRef.current.has(box.label_id))
      if (visible.length === 0) return
      const index = visible.findIndex((box) => box.id === selectedIdRef.current)
      const next = index < 0 ? (direction > 0 ? 0 : visible.length - 1) : (index + direction + visible.length) % visible.length
      setSelectedId(visible[next].id)
    },
    [currentImage, hiddenRef, selectedIdRef],
  )

  const copyPrevious = useCallback(() => {
    const list = imagesRef.current
    const index = list.findIndex((image) => image.id === currentIdRef.current)
    const previous = list[index - 1]
    if (index < 0 || !previous) return
    if (previous.annotations.length === 0) {
      toast('The previous image has no boxes to copy.')
      return
    }
    addBoxes(previous.annotations, { select: false })
    toast(`Copied ${countBoxes(previous.annotations.length)} from the previous image.`)
  }, [addBoxes, currentIdRef, toast])

  // ---------------------------------------------------------- smart tools

  const runSmart = useCallback(
    async (task) => {
      if (!capsRef.current.smart) {
        toast('Smart tools need OpenCV: pip install opencv-python-headless numpy', 'error')
        return null
      }
      setWorking(true)
      try {
        return await task()
      } catch (error) {
        toast(error.message, 'error')
        return null
      } finally {
        setWorking(false)
      }
    },
    [capsRef, toast],
  )

  const snapSelected = useCallback(async () => {
    const image = currentImage()
    const box = selectedRef.current
    if (!image || !box) {
      toast('Select a box first, then snap it.')
      return
    }
    const result = await runSmart(() => api.snap(image.id, box))
    if (!result || currentIdRef.current !== image.id) return
    if (!result.box) {
      toast('Nothing tighter found. The box stays as it is.')
      return
    }
    editBox(box.id, result.box)
  }, [currentIdRef, currentImage, editBox, runSmart, selectedRef, toast])

  const magicAt = useCallback(
    async (point) => {
      const image = currentImage()
      if (!image) return
      const result = await runSmart(() => api.click(image.id, point.x, point.y))
      if (!result || currentIdRef.current !== image.id) return
      if (!result.box) {
        toast('Nothing stood out there. Try dragging a rough box instead.')
        return
      }
      createFromRect(result.box)
    },
    [createFromRect, currentIdRef, currentImage, runSmart, toast],
  )

  const findSimilar = useCallback(async () => {
    const image = currentImage()
    const box = selectedRef.current
    if (!image || !box) {
      toast('Select a box first, then find others like it.')
      return
    }
    const result = await runSmart(() => api.similar(image.id, box, image.annotations))
    if (!result || currentIdRef.current !== image.id) return
    if (result.boxes.length === 0) {
      toast('No look-alikes found on this image.')
      return
    }
    setSuggestions(result.boxes.map((found) => ({ ...found, label_id: box.label_id })))
  }, [currentIdRef, currentImage, runSmart, selectedRef, toast])

  const suggestBoxes = useCallback(async () => {
    const image = currentImage()
    if (!image) return
    const result = await runSmart(() => api.propose(image.id, image.annotations))
    if (!result || currentIdRef.current !== image.id) return
    if (result.boxes.length === 0) {
      toast('No suggestions for this image.')
      return
    }
    setSelectedId(null)
    setSuggestions(result.boxes.map((found) => ({ ...found, label_id: null })))
  }, [currentIdRef, currentImage, runSmart, toast])

  const acceptSuggestion = useCallback(
    (index) => {
      const suggestion = suggestionsRef.current[index]
      if (!suggestion) return
      const remaining = suggestionsRef.current.filter((_, position) => position !== index)
      suggestionsRef.current = remaining
      setSuggestions(remaining)
      const labelId = suggestion.label_id ?? activeLabelIdRef.current
      if (validLabel(labelId)) addBoxes([{ ...suggestion, label_id: labelId }], { select: false })
      else openPicker({ mode: 'new', rect: suggestion })
    },
    [activeLabelIdRef, addBoxes, openPicker, suggestionsRef, validLabel],
  )

  const acceptAllSuggestions = useCallback(() => {
    const list = suggestionsRef.current
    if (list.length === 0) return
    const fallback = validLabel(activeLabelIdRef.current) ? activeLabelIdRef.current : null
    if (fallback === null && list.some((item) => !validLabel(item.label_id))) {
      toast('Choose or create a label first, then accept the suggestions.')
      return
    }
    addBoxes(
      list.map((item) => ({ ...item, label_id: validLabel(item.label_id) ? item.label_id : fallback })),
      { select: false },
    )
    suggestionsRef.current = []
    setSuggestions([])
  }, [activeLabelIdRef, addBoxes, suggestionsRef, toast, validLabel])

  const chooseTool = useCallback(
    (next) => {
      if (next === 'magic' && !capsRef.current.smart) {
        toast('Smart tools need OpenCV: pip install opencv-python-headless numpy', 'error')
        return
      }
      setTool(next)
    },
    [capsRef, toast],
  )

  // ---------------------------------------------------------------- files

  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || [])
      if (files.length === 0) return
      let added = 0
      const problems = []
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        setUpload({ done: index, total: files.length, name: file.name })
        try {
          const result = await api.upload(file)
          problems.push(...result.errors)
          if (result.images.length > 0) {
            added += result.images.length
            applyImages((list) => [...list, ...result.images])
            if (currentIdRef.current === null) goTo(result.images[0].id)
          }
        } catch (error) {
          problems.push({ file: file.name, error: error.message })
        }
      }
      setUpload(null)
      if (added > 0) toast(`Added ${plural(added, 'image')}.`)
      problems.slice(0, 3).forEach((problem) => toast(`${problem.file}: ${problem.error}`, 'error'))
      if (problems.length > 3) toast(`${problems.length - 3} more files could not be added.`, 'error')
    },
    [applyImages, currentIdRef, goTo, toast],
  )

  const chooseFiles = useCallback(() => fileInput.current?.click(), [])

  const removeImage = useCallback(
    async (image) => {
      forgetSaves(image.id)
      try {
        await api.deleteImage(image.id)
      } catch (error) {
        if (error.status !== 404) {
          toast(error.message, 'error')
          return
        }
      }
      forgetSaves(image.id)
      const list = imagesRef.current
      const index = list.findIndex((item) => item.id === image.id)
      const remaining = list.filter((item) => item.id !== image.id)
      applyImages(() => remaining)
      history.current.delete(image.id)
      if (currentIdRef.current === image.id) {
        const neighbour = remaining[Math.min(index, remaining.length - 1)]
        goTo(neighbour ? neighbour.id : null)
      }
    },
    [applyImages, currentIdRef, forgetSaves, goTo, toast],
  )

  const requestRemoveImage = useCallback(
    (image) => {
      if (image.annotations.length === 0) {
        removeImage(image)
        return
      }
      setDialog({
        title: 'Remove this image?',
        body: `“${image.name}” and its ${countBoxes(image.annotations.length)} will be removed from the session.`,
        confirm: 'Remove image',
        danger: true,
        onConfirm: () => removeImage(image),
      })
    },
    [removeImage],
  )

  const startNewSession = useCallback(
    async (keepLabels) => {
      try {
        clearSaves()
        await api.reset(keepLabels)
      } catch (error) {
        toast(error.message, 'error')
        return
      }
      history.current.clear()
      peekRestore.current = null
      currentIdRef.current = null
      setSelectedId(null)
      setSuggestions([])
      setPicker(null)
      setHidden(new Set())
      setTool('draw')
      await load()
    },
    [clearSaves, currentIdRef, load, toast],
  )

  const requestNewSession = useCallback(() => {
    setDialog({
      title: 'Start a new session?',
      body: 'All images and boxes will be removed. Export first if you still need them.',
      confirm: 'Start new session',
      danger: true,
      option: { label: 'Keep my labels', initial: true },
      onConfirm: (keepLabels) => startNewSession(keepLabels),
    })
  }, [startNewSession])

  const exportAs = useCallback(
    async (kind) => {
      const saved = await flushSaves()
      if (!saved) {
        toast('Your latest changes are not saved yet, so the export was not started.', 'error')
        return
      }
      download(kind === 'zip' ? api.exportZipUrl : api.exportJsonUrl)
    },
    [flushSaves, toast],
  )

  // ------------------------------------------------------- drag and drop

  useEffect(() => {
    const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
    const onEnter = (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setDropping(true)
    }
    const onOver = (event) => {
      if (hasFiles(event)) event.preventDefault()
    }
    const onLeave = (event) => {
      if (!hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDropping(false)
    }
    const onDrop = (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDropping(false)
      addFiles(event.dataTransfer.files)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

  // -------------------------------------------------------------- keyboard

  const onKey = useLatest((event) => {
    if (dialog || showKeys) {
      if (event.key === 'Escape') {
        setDialog(null)
        setShowKeys(false)
      }
      return
    }
    if (isTyping(event.target)) return

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (event.metaKey || event.ctrlKey) {
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
      return
    }
    if (event.altKey) return
    if (key === '?') {
      setShowKeys(true)
      return
    }
    if (!current) return

    // Enter and Space belong to a focused button, not to the canvas.
    const onButton = event.target.tagName === 'BUTTON' || event.target.tagName === 'A'

    switch (key) {
      case 'Escape':
        if (picker) setPicker(null)
        else if (suggestions.length > 0) setSuggestions([])
        else if (selected) setSelectedId(null)
        else if (tool !== 'draw') setTool('draw')
        break
      case 'Enter':
        if (onButton) return
        if (suggestions.length > 0) acceptAllSuggestions()
        else if (selected) requestLabel(selected.id)
        break
      case 'l':
        if (selected) requestLabel(selected.id)
        break
      case 'Delete':
      case 'Backspace':
        if (selected) deleteBox(selected.id)
        break
      case 'Tab':
        cycleSelection(event.shiftKey ? -1 : 1)
        break
      case 'ArrowLeft':
        if (selected) nudge(event.shiftKey ? -10 : -1, 0)
        else step(-1)
        break
      case 'ArrowRight':
        if (selected) nudge(event.shiftKey ? 10 : 1, 0)
        else step(1)
        break
      case 'ArrowUp':
        if (!selected) return
        nudge(0, event.shiftKey ? -10 : -1)
        break
      case 'ArrowDown':
        if (!selected) return
        nudge(0, event.shiftKey ? 10 : 1)
        break
      case 'a':
        step(-1)
        break
      case 'd':
        step(1)
        break
      case 'b':
        setTool('draw')
        break
      case 'm':
        chooseTool('magic')
        break
      case 's':
        snapSelected()
        break
      case 'f':
        findSimilar()
        break
      case 'g':
        suggestBoxes()
        break
      case 'p':
        copyPrevious()
        break
      case 'h':
        togglePeek()
        break
      case '0':
        stageControls.current?.fit()
        break
      case '=':
      case '+':
        stageControls.current?.zoomBy(1.25)
        break
      case '-':
      case '_':
        stageControls.current?.zoomBy(1 / 1.25)
        break
      default: {
        if (!/^[1-9]$/.test(key)) return
        const label = labels[Number(key) - 1]
        if (!label) return
        activateLabel(label.id)
        showFlash(label)
      }
    }
    event.preventDefault()
  })

  useEffect(() => {
    const handler = (event) => onKey.current(event)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKey])

  // ---------------------------------------------------------------- render

  if (phase === 'loading') {
    return (
      <div className="splash">
        <span className="spinner" />
      </div>
    )
  }
  if (phase === 'error') {
    return (
      <div className="splash">
        <h1>Annotator could not start</h1>
        <p>{loadError}</p>
        <button
          type="button"
          className="btn is-primary"
          onClick={() => {
            setPhase('loading')
            load()
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  let stagePicker = null
  if (picker && current) {
    const rect = picker.mode === 'new' ? picker.rect : current.annotations.find((box) => box.id === picker.boxId)
    if (rect) stagePicker = { key: picker.key, rect }
  }
  const pickerBox = picker && picker.mode === 'edit' ? current?.annotations.find((box) => box.id === picker.boxId) : null
  const pendingRect = snapping || (picker && picker.mode === 'new' ? picker.rect : null)

  return (
    <div className="app">
      <TopBar
        hasImages={images.length > 0}
        index={currentIndex}
        total={images.length}
        current={current}
        saveState={saver.state}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
        onExport={exportAs}
        onNewSession={requestNewSession}
        onShowKeys={() => setShowKeys(true)}
      />

      {images.length === 0 ? (
        <Welcome
          labels={labels}
          pdf={caps.pdf}
          onChooseFiles={chooseFiles}
          onAddLabels={addStarterLabels}
          onRemoveLabel={requestRemoveLabel}
        />
      ) : (
        <div className="workspace">
          <ImageRail
            images={images}
            currentId={currentId}
            annotated={annotated}
            onSelect={goTo}
            onAdd={chooseFiles}
            onDelete={requestRemoveImage}
          />

          <main className="center">
            {current && (
              <Stage
                key={current.id}
                image={current}
                annotations={current.annotations}
                labels={labels}
                labelMap={labelMap}
                hidden={hidden}
                selectedId={selected ? selected.id : null}
                hoverId={hoverId}
                tool={tool}
                suggestions={suggestions}
                activeColor={activeLabel ? activeLabel.color : null}
                pendingRect={pendingRect}
                working={working}
                picker={stagePicker}
                pickerHighlightId={pickerBox ? pickerBox.label_id : activeLabelId}
                controls={stageControls}
                onSelect={setSelectedId}
                onCreate={createFromRect}
                onEdit={editBox}
                onMagic={magicAt}
                onAcceptSuggestion={acceptSuggestion}
                onRequestLabel={requestLabel}
                onPickLabel={resolvePicker}
                onCreateLabel={createLabelForPicker}
                onClosePicker={closePicker}
              >
                {suggestions.length > 0 && (
                  <div className="banner">
                    <span>
                      <strong>{plural(suggestions.length, 'suggestion')}</strong> · click one to keep it
                    </span>
                    <button type="button" className="banner-btn is-primary" onClick={acceptAllSuggestions}>
                      Keep all <kbd>↵</kbd>
                    </button>
                    <button type="button" className="banner-btn" onClick={() => setSuggestions([])}>
                      Dismiss <kbd>esc</kbd>
                    </button>
                  </div>
                )}

                {flash && (
                  <div className="flash" key={flash.key} onAnimationEnd={() => setFlash(null)}>
                    <i className="dot" style={{ background: flash.color }} />
                    {flash.name}
                  </div>
                )}

                <Toolbar
                  tool={tool}
                  smart={caps.smart}
                  hasSelection={Boolean(selected)}
                  hasPrevious={currentIndex > 0}
                  canUndo={Boolean(stacks && stacks.undo.length)}
                  canRedo={Boolean(stacks && stacks.redo.length)}
                  peeking={peeking}
                  working={working}
                  onTool={chooseTool}
                  onSnap={snapSelected}
                  onSimilar={findSimilar}
                  onSuggest={suggestBoxes}
                  onCopyPrevious={copyPrevious}
                  onUndo={undo}
                  onRedo={redo}
                  onPeek={togglePeek}
                />
              </Stage>
            )}
          </main>

          <LabelPanel
            labels={labels}
            labelMap={labelMap}
            counts={counts}
            activeLabelId={activeLabelId}
            hidden={hidden}
            boxes={current ? current.annotations : []}
            selectedId={selected ? selected.id : null}
            onActivate={activateLabel}
            onToggle={toggleLabel}
            onSolo={soloLabel}
            onShowAll={showAll}
            onHideAll={hideAll}
            onCreate={createAndActivateLabel}
            onRename={renameLabel}
            onRecolor={recolorLabel}
            onDelete={requestRemoveLabel}
            onSelectBox={setSelectedId}
            onHoverBox={setHoverId}
            onDeleteBox={deleteBox}
          />
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept={ACCEPTED_FILES}
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {dropping && <DropOverlay pdf={caps.pdf} />}
      {upload && <UploadProgress upload={upload} />}
      {dialog && <ConfirmDialog {...dialog} onClose={() => setDialog(null)} />}
      {showKeys && <ShortcutsDialog onClose={() => setShowKeys(false)} />}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
