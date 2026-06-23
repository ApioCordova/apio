'use client'

import { useEffect, useRef, createElement } from 'react'

/**
 * MathField — a thin React wrapper around MathLive's <math-field> web component.
 *
 * This is the input surface (the Desmos-style on-screen keyboard with π, Greek
 * letters, integrals, derivatives, Σ, √, fractions, exponents, and so on). It
 * emits LaTeX via onChange. MathLive is loaded lazily on the client only, so it
 * never runs during server rendering.
 *
 * Props:
 *   value     — current LaTeX string
 *   onChange  — (latex: string) => void
 *   onEnter   — optional, called when the user presses Enter (to confirm)
 *   autoFocus — focus the field on mount (opens the keyboard)
 */
export default function MathField({ value = '', onChange, onEnter, autoFocus = true }) {
  const ref = useRef(null)
  const onChangeRef = useRef(onChange)
  const onEnterRef = useRef(onEnter)
  onChangeRef.current = onChange
  onEnterRef.current = onEnter

  // Register the <math-field> custom element once, on the client.
  useEffect(() => {
    let cancelled = false
    import('mathlive').then(() => {
      if (cancelled) return
      const mf = ref.current
      if (!mf) return
      // Set initial value once the element is defined.
      if (typeof mf.value !== 'undefined') mf.value = value
      if (autoFocus) {
        // Defer so the popover is laid out before the keyboard opens.
        requestAnimationFrame(() => {
          try { mf.focus() } catch {}
          try { window.mathVirtualKeyboard?.show() } catch {}
        })
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wire up events.
  useEffect(() => {
    const mf = ref.current
    if (!mf) return
    const handleInput = () => onChangeRef.current?.(mf.value)
    const handleFocus = () => { try { window.mathVirtualKeyboard?.show() } catch {} }
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onEnterRef.current?.(mf.value)
      }
    }
    mf.addEventListener('input', handleInput)
    mf.addEventListener('focusin', handleFocus)
    mf.addEventListener('keydown', handleKeyDown)
    return () => {
      mf.removeEventListener('input', handleInput)
      mf.removeEventListener('focusin', handleFocus)
      mf.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Keep the element in sync when the value prop changes from outside.
  useEffect(() => {
    const mf = ref.current
    if (mf && typeof mf.value !== 'undefined' && mf.value !== value) {
      mf.value = value
    }
  }, [value])

  // createElement avoids JSX warnings about the unknown <math-field> tag.
  return createElement('math-field', {
    ref,
    style: {
      display: 'block',
      width: '100%',
      fontSize: '1.4rem',
      padding: '10px 12px',
      border: '2px solid #1a1d29',
      borderRadius: '10px',
      background: '#fff',
    },
  })
}