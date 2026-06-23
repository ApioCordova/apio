'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminAnnouncementPage() {
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const [id, setId] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isActive, setIsActive] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    setRole(profile?.role)

    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      setId(data.id)
      setTitle(data.title || '')
      setBody(data.body || '')
      setIsActive(!!data.is_active)
    }
    setLoading(false)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200) }

  const isAdmin = role === 'admin' || role === 'editor'

  async function save() {
    setSaving(true)
    let error = null
    if (id) {
      const res = await supabase
        .from('announcements')
        .update({ title: title.trim(), body: body.trim(), is_active: isActive })
        .eq('id', id)
      error = res.error
    } else {
      const res = await supabase
        .from('announcements')
        .insert({ title: title.trim(), body: body.trim(), is_active: isActive })
        .select('id').single()
      error = res.error
      if (res.data) setId(res.data.id)
    }
    setSaving(false)
    if (error) { showToast('Save failed: ' + error.message); return }
    showToast('✓ Saved — students see it on next load')
  }

  if (loading) return <p className="text-gray-600 font-mono text-sm">Loading…</p>

  if (!isAdmin) {
    return (
      <div>
        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// announcement</p>
        <h1 className="text-3xl font-black tracking-tight mb-3">Announcement</h1>
        <p className="text-gray-700">Only admins can edit the dashboard announcement.</p>
      </div>
    )
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-gray-900 text-white rounded-full font-bold text-sm shadow-[4px_4px_0_#00b395]">
          {toast}
        </div>
      )}

      <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// dashboard announcement</p>
      <h1 className="text-3xl font-black tracking-tight mb-3">Announcement Pop-up</h1>
      <p className="text-gray-700 max-w-2xl mb-6">
        Shows in the bottom-right corner of the student dashboard. Students can dismiss it; it returns 12 hours later, or right away whenever you save a change here. Toggle it off to hide it from everyone.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-5 shadow-[4px_4px_0_#1a1d29]">
          <label className="block mb-4">
            <span className="text-xs font-mono tracking-widest uppercase text-gray-600">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder="New practice sets are live"
              className="mt-1 w-full p-2.5 border-2 border-gray-900 rounded-lg font-bold bg-white"
            />
          </label>

          <label className="block mb-4">
            <span className="text-xs font-mono tracking-widest uppercase text-gray-600">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={240}
              rows={4}
              placeholder="Check out the new AP Calc problem sets we just added."
              className="mt-1 w-full p-2.5 border-2 border-gray-900 rounded-lg bg-white resize-none"
            />
            <span className="text-[11px] font-mono text-gray-400">{body.length}/240</span>
          </label>

          <label className="flex items-center gap-3 mb-5 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-5 h-5 accent-[#00b395]" />
            <span className="font-bold text-sm">{isActive ? 'Showing to students' : 'Hidden'}</span>
          </label>

          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2.5 text-white border-2 border-gray-900 rounded-lg font-bold text-sm shadow-[3px_3px_0_#1a1d29] disabled:opacity-50"
            style={{ background: '#00b395' }}
          >
            {saving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>

        {/* Live preview */}
        <div>
          <p className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-2">Preview</p>
          <div className="relative border-2 border-dashed border-gray-300 rounded-2xl p-4 min-h-[180px] flex items-end justify-end" style={{ background: '#f6fbf8' }}>
            {(title || body) ? (
              <div className="relative w-[300px] max-w-full bg-white border-[3px] border-gray-900 rounded-2xl shadow-[6px_6px_0_#1a1d29] p-4">
                <div className="absolute -top-2.5 -right-2.5 w-7 h-7 flex items-center justify-center bg-gray-900 text-white border-2 border-gray-900 rounded-full text-sm font-black shadow-[2px_2px_0_#00b395]">✕</div>
                <p className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: '#00b395' }}>// announcement</p>
                {title && <h3 className="text-lg font-black tracking-tight leading-tight mb-1">{title}</h3>}
                {body && <p className="text-sm text-gray-700 leading-snug whitespace-pre-line">{body}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-400 m-auto">Fill in a title or message to preview.</p>
            )}
          </div>
          {!isActive && (
            <p className="text-xs text-gray-500 mt-2">Currently hidden — flip the toggle and save to show it.</p>
          )}
        </div>
      </div>
    </div>
  )
}