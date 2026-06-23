'use client'

import { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import renderMathInElement from 'katex/contrib/auto-render'
import MathField from './MathField'

// Delimiters used for math typed as plain text (answer choices, custom-builder
// textareas). We deliberately use \( \) and \[ \] — NOT $…$ — so that dollar
// amounts in word problems ("a shirt costs $5") never get mistaken for math.
const DELIMITERS = [
  { left: '\\(', right: '\\)', display: false },
  { left: '\\[', right: '\\]', display: true },
]

function typeset(el) {
  if (!el) return
  // 1) Render formulas authored in the rich editor (data-latex spans).
  el.querySelectorAll('[data-latex]').forEach((span) => {
    const tex = span.getAttribute('data-latex') || ''
    const display = span.getAttribute('data-display') === 'true'
    try {
      katex.render(tex, span, { throwOnError: false, displayMode: display })
    } catch {
      span.textContent = tex
    }
  })
  // 2) Render any \( … \) / \[ … \] delimiters in plain text.
  try {
    renderMathInElement(el, { delimiters: DELIMITERS, throwOnError: false, ignoredTags: ['script', 'style', 'textarea', 'pre'] })
  } catch {}
}

/**
 * MathHTML — drop-in replacement for `dangerouslySetInnerHTML` on any element
 * that shows authored rich-text content (question stems, explanations, readings).
 * Renders the HTML, then typesets the math inside it.
 */
export function MathHTML({ html = '', className = '', as: Tag = 'div', ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = html || ''
    typeset(el)
  }, [html])
  return <Tag ref={ref} className={className} {...rest} />
}

/**
 * MathText — for plain-text fields (answer choices). Sets text safely, then
 * renders any \( … \) math. Never interprets the string as HTML.
 */
export function MathText({ text = '', className = '', as: Tag = 'span', ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = text || ''
    typeset(el)
  }, [text])
  return <Tag ref={ref} className={className} {...rest} />
}

/**
 * ChoiceMathButton — a small "∑" button placed next to a plain-text answer-choice
 * input. Opens the MathLive keyboard and inserts \(…\) at the input's caret.
 *
 * Props:
 *   inputRef  — ref to the choice <input>
 *   value     — current choice string
 *   onChange  — (next: string) => void
 */
export function ChoiceMathButton({ inputRef, value = '', onChange }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const popRef = useRef(null)
  const caretRef = useRef(value.length)

  function openEditor() {
    const input = inputRef?.current
    caretRef.current = input ? (input.selectionStart ?? value.length) : value.length
    setDraft('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (popRef.current && popRef.current.contains(e.target)) return
      if (e.target.closest?.('.ML__keyboard, math-field')) return
      setOpen(false)
      try { window.mathVirtualKeyboard?.hide() } catch {}
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function insert() {
    const tex = draft.trim()
    if (tex) {
      const at = Math.min(caretRef.current, value.length)
      const next = value.slice(0, at) + `\\(${tex}\\)` + value.slice(at)
      onChange(next)
    }
    setOpen(false)
    try { window.mathVirtualKeyboard?.hide() } catch {}
  }

  return (
    <span style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={openEditor}
        title="Insert math"
        style={{
          width: 38, height: 38, border: '2px solid #1a1d29', borderRadius: 8,
          background: open ? '#b4f1e7' : '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer',
          boxShadow: '2px 2px 0 #1a1d29', lineHeight: 1,
        }}
      >
        ∑
      </button>

      {open && (
        <div
          ref={popRef}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
            width: 340, maxWidth: '90vw', background: '#fff', border: '3px solid #1a1d29',
            borderRadius: 14, boxShadow: '6px 6px 0 #1a1d29', padding: 12,
          }}
        >
          <p style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 8px' }}>
            Add math to this choice
          </p>
          <MathField value={draft} onChange={setDraft} onEnter={insert} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={insert}
              style={{ padding: '7px 14px', background: '#00b395', color: '#fff', border: '2px solid #1a1d29', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '3px 3px 0 #1a1d29' }}>
              Insert
            </button>
            <button type="button" onClick={() => { setOpen(false); try { window.mathVirtualKeyboard?.hide() } catch {} }}
              style={{ padding: '7px 14px', background: '#fff', color: '#1a1d29', border: '2px solid #1a1d29', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '3px 3px 0 #1a1d29' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  )
}