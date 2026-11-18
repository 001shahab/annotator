import { cx, modKey } from '../lib/util.js'
import {
  BoxIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  RedoIcon,
  SimilarIcon,
  SnapIcon,
  SparkIcon,
  UndoIcon,
  WandIcon,
} from './Icons.jsx'

// Buttons never take keyboard focus on click, so shortcuts keep working
// right after using the mouse.
const keepFocus = (event) => event.preventDefault()

function Tool({ tip, hotkey, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      className={cx('tool', active && 'is-active')}
      data-tip={tip}
      data-key={hotkey}
      aria-label={tip}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function Toolbar({
  tool,
  smart,
  hasSelection,
  hasPrevious,
  canUndo,
  canRedo,
  peeking,
  working,
  onTool,
  onSnap,
  onSimilar,
  onSuggest,
  onCopyPrevious,
  onUndo,
  onRedo,
  onPeek,
}) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Tools">
      <Tool tip="Box: drag to draw" hotkey="B" active={tool === 'draw'} onClick={() => onTool('draw')}>
        <BoxIcon />
      </Tool>
      {smart && (
        <Tool
          tip="Magic: click an object, or drag a rough box"
          hotkey="M"
          active={tool === 'magic'}
          onClick={() => onTool('magic')}
        >
          <WandIcon />
        </Tool>
      )}

      {smart && (
        <>
          <span className="toolbar-rule" />
          <Tool tip="Snap box to object" hotkey="S" disabled={!hasSelection || working} onClick={onSnap}>
            <SnapIcon />
          </Tool>
          <Tool tip="Find similar" hotkey="F" disabled={!hasSelection || working} onClick={onSimilar}>
            <SimilarIcon />
          </Tool>
          <Tool tip="Suggest boxes" hotkey="G" disabled={working} onClick={onSuggest}>
            <SparkIcon />
          </Tool>
        </>
      )}

      <span className="toolbar-rule" />
      <Tool tip="Copy boxes from previous image" hotkey="P" disabled={!hasPrevious} onClick={onCopyPrevious}>
        <CopyIcon />
      </Tool>
      <Tool tip="Undo" hotkey={modKey('Z')} disabled={!canUndo} onClick={onUndo}>
        <UndoIcon />
      </Tool>
      <Tool tip="Redo" hotkey={modKey('Z', true)} disabled={!canRedo} onClick={onRedo}>
        <RedoIcon />
      </Tool>

      <span className="toolbar-rule" />
      <Tool tip={peeking ? 'Show boxes' : 'Hide boxes'} hotkey="H" active={peeking} onClick={onPeek}>
        {peeking ? <EyeOffIcon /> : <EyeIcon />}
      </Tool>

      {working && <span className="toolbar-busy" aria-label="Working" />}
    </div>
  )
}
