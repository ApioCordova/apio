'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import MathField from './MathField'

/**
 * InlineMath — a TipTap node that stores a LaTeX formula and renders it with
 * KaTeX, both live in the editor and (via the data-latex attribute) wherever the
 * saved HTML is later displayed by <MathHTML>.
 *
 * Serialized form:  <span data-type="inline-math" data-latex="…" data-display="false"></span>
 *
 * Editing happens in a small popover anchored to the formula, which hosts the
 * MathLive virtual keyboard. The toolbar button calls the insertInlineMath
 * command, which drops in an empty node that opens its editor immediately.
 */
export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') || '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex || '' }),
      },
      display: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-display') === 'true',
        renderHTML: (attrs) => ({ 'data-display': attrs.display ? 'true' : 'false' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'inline-math' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView)
  },

  addCommands() {
    return {
      insertInlineMath:
        (attrs = {}) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs: { latex: '', display: false, ...attrs } })
            .run(),
    }
  },
})

function renderKatex(latex, display) {
  try {
    return katex.renderToString(latex || '', {
      throwOnError: false,
      displayMode: !!display,
    })
  } catch {
    return latex || ''
  }
}

function MathNodeView({ node, updateAttributes, deleteNode, editor }) {
  const latex = node.attrs.latex || ''
  const display = !!node.attrs.display
  // Open the editor immediately for a freshly inserted (empty) formula.
  const [open, setOpen] = useState(latex === '')
  const [draft, setDraft] = useState(latex)
  const wrapRef = useRef(null)

  useEffect(() => { setDraft(latex) }, [latex])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        // The MathLive virtual keyboard renders in its own layer outside this
        // node — don't treat clicks on it as "outside".
        if (e.target.closest?.('.ML__keyboard, math-field')) return
        commit()
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft])

  function commit() {
    const next = draft.trim()
    if (next === '') {
      deleteNode()
      return
    }
    updateAttributes({ latex: next })
    setOpen(false)
    try { window.mathVirtualKeyboard?.hide() } catch {}
    editor?.commands.focus()
  }

  function cancel() {
    if (latex === '') { deleteNode(); return }
    setDraft(latex)
    setOpen(false)
    try { window.mathVirtualKeyboard?.hide() } catch {}
  }

  const editable = editor?.isEditable

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}
    >
      <span
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={() => editable && setOpen(true)}
        onKeyDown={(e) => {
          if (editable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true) }
        }}
        title={editable ? 'Click to edit formula' : undefined}
        style={{
          cursor: editable ? 'pointer' : 'default',
          padding: latex ? '1px 3px' : '1px 8px',
          borderRadius: 6,
          outline: open ? '2px solid #00b395' : 'none',
          background: open ? '#b4f1e7' : 'transparent',
        }}
        dangerouslySetInnerHTML={{
          __html: latex ? renderKatex(latex, display) : '<span style="color:#9ca3af">∑ math…</span>',
        }}
      />

      {open && (
        <span
          contentEditable={false}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            width: 360,
            maxWidth: '90vw',
            background: '#fff',
            border: '3px solid #1a1d29',
            borderRadius: 14,
            boxShadow: '6px 6px 0 #1a1d29',
            padding: 12,
            display: 'block',
          }}
        >
          <p style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 8px' }}>
            Insert math
          </p>
          <MathField value={draft} onChange={setDraft} onEnter={commit} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, margin: '10px 0 4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={display}
              onChange={(e) => updateAttributes({ display: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#00b395' }}
            />
            Display as its own centered block
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={commit}
              style={btnStyle('#00b395', '#fff')}
            >
              {latex ? 'Update' : 'Insert'}
            </button>
            <button type="button" onClick={cancel} style={btnStyle('#fff', '#1a1d29')}>
              Cancel
            </button>
            {latex && (
              <button
                type="button"
                onClick={() => { deleteNode(); try { window.mathVirtualKeyboard?.hide() } catch {} }}
                style={{ ...btnStyle('#fff', '#dc2626'), marginLeft: 'auto' }}
              >
                Remove
              </button>
            )}
          </div>
        </span>
      )}
    </NodeViewWrapper>
  )
}

function btnStyle(bg, color) {
  return {
    padding: '7px 14px',
    background: bg,
    color,
    border: '2px solid #1a1d29',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    cursor: 'pointer',
    boxShadow: '3px 3px 0 #1a1d29',
  }
}