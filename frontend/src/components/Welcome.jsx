import { useState } from 'react'
import { CloseIcon, UploadIcon } from './Icons.jsx'

/** The first screen: one thing to do (add files), one optional thing (labels). */
export default function Welcome({ labels, pdf, onChooseFiles, onAddLabels, onRemoveLabel }) {
  const [draft, setDraft] = useState('')

  const submit = (event) => {
    event.preventDefault()
    // "car, person, bike" adds three labels at once.
    const names = draft
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    if (names.length === 0) return
    setDraft('')
    onAddLabels(names)
  }

  return (
    <main className="welcome">
      <div className="welcome-card">
        <div className="welcome-strip" aria-hidden="true" />
        <h1>Draw a box. Name it. Next.</h1>
        <p className="welcome-lead">
          Add your images{pdf ? ' or PDFs' : ''}, mark what matters, and export a clean COCO file.
        </p>

        <button type="button" className="dropzone" onClick={onChooseFiles}>
          <span className="dropzone-icon">
            <UploadIcon size={26} />
          </span>
          <span className="dropzone-title">Drop images{pdf ? ' or PDFs' : ''} anywhere</span>
          <span className="dropzone-sub">or click to choose files</span>
        </button>

        <div className="welcome-labels">
          <div className="welcome-labels-head">
            <h2>Labels</h2>
            <span>Optional. You can also name boxes as you draw them.</span>
          </div>
          <form className="chips" onSubmit={submit}>
            {labels.map((label) => (
              <span key={label.id} className="chip">
                <i className="dot" style={{ background: label.color }} />
                {label.name}
                <button type="button" aria-label={`Remove ${label.name}`} onClick={() => onRemoveLabel(label)}>
                  <CloseIcon size={11} />
                </button>
              </span>
            ))}
            <input
              value={draft}
              placeholder={labels.length ? 'Add another…' : 'car, person, traffic light…'}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setDraft(event.target.value)}
            />
          </form>
        </div>
      </div>
      <footer className="welcome-foot">© 2026 - Prof. Shahab Anbarjafari</footer>
    </main>
  )
}
