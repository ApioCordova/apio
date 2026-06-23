'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DISMISS_KEY = 'apio_announcement_dismissed'
const TWELVE_HOURS = 12 * 60 * 60 * 1000

function computeVisible(a) {
  if (!a || !a.is_active) return false
  if (!a.title && !a.body) return false
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return true
    const saved = JSON.parse(raw)
    if (saved.version !== a.updated_at) return true          // edited since dismissed
    if (Date.now() - saved.dismissedAt > TWELVE_HOURS) return true  // 12h elapsed
    return false
  } catch {
    return true
  }
}

export default function Announcement() {
  const [a, setA] = useState(null)
  const [visible, setVisible] = useState(false)
  const aRef = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabase
        .from('announcements')
        .select('id, title, body, is_active, updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!active) return
      aRef.current = data
      setA(data)
      setVisible(computeVisible(data))
    }
    load()

    // Re-check every minute so the 12h timer fires on long-open tabs
    const interval = setInterval(() => {
      setVisible((v) => (v ? v : computeVisible(aRef.current)))
    }, 60 * 1000)

    return () => { active = false; clearInterval(interval) }
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({
        version: a?.updated_at,
        dismissedAt: Date.now(),
      }))
    } catch {}
  }

  if (!visible || !a) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[300px] max-w-[calc(100vw-2rem)] bg-white border-[3px] border-gray-900 rounded-2xl shadow-[6px_6px_0_#1a1d29] p-4">
      <button
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute -top-2.5 -right-2.5 w-7 h-7 flex items-center justify-center bg-gray-900 text-white border-2 border-gray-900 rounded-full text-sm font-black shadow-[2px_2px_0_#00b395] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-transform"
      >
        ✕
      </button>
      <p className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: '#00b395' }}>// announcement</p>
      {a.title && <h3 className="text-lg font-black tracking-tight leading-tight mb-1">{a.title}</h3>}
      {a.body && <p className="text-sm text-gray-700 leading-snug whitespace-pre-line">{a.body}</p>}
    </div>
  )
}