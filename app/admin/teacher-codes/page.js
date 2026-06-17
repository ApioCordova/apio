'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)
function formatDate(iso) {
  if (!iso) return 'No expiry'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const isPast = (iso) => !!iso && new Date(iso).getTime() < Date.now()

export default function TeacherCodesPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [codes, setCodes] = useState([])
  const [toast, setToast] = useState(null)

  // create form
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState('10')
  const [expires, setExpires] = useState('')
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState(null)

  // inline expiry editing
  const [editId, setEditId] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const admin = profile?.role === 'admin' || profile?.role === 'editor'
      setIsAdmin(admin)
      if (admin) await loadCodes()
      setLoading(false)
    }
    init()
  }, [])

  async function loadCodes() {
    const { data } = await supabase.from('teacher_codes').select('*').order('created_at', { ascending: false })
    setCodes(data || [])
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2400) }

  async function createCode() {
    const n = parseInt(maxUses, 10)
    if (isNaN(n) || n < 1) { showToast('Set a use limit of at least 1.'); return }
    setCreating(true)
    const { data, error } = await supabase.rpc('create_teacher_code', {
      p_label: label.trim() || null,
      p_max_uses: n,
      p_expires_at: fromLocalInput(expires),
    })
    setCreating(false)
    if (error || data?.status !== 'ok') { showToast('Could not create code: ' + (error?.message || data?.message || 'unknown')); return }
    setJustCreated(data.code)
    setLabel(''); setMaxUses('10'); setExpires('')
    await loadCodes()
    showToast('Code created')
  }

  async function saveExpiry(id) {
    await supabase.from('teacher_codes').update({ expires_at: fromLocalInput(editVal) }).eq('id', id)
    setEditId(null); setEditVal('')
    await loadCodes()
    showToast('Expiry updated')
  }

  async function deleteCode(id, code) {
    if (!confirm(`Delete code ${code}? Teachers can no longer use it. Classes already created are unaffected.`)) return
    await supabase.from('teacher_codes').delete().eq('id', id)
    await loadCodes()
    showToast('Code deleted')
  }

  function copyCode(c) {
    navigator.clipboard?.writeText(c.code)
    setCopiedId(c.id); setTimeout(() => setCopiedId(null), 1500)
  }

  if (loading) return <p className="text-gray-600 font-mono text-sm">Loading teacher access...</p>

  if (!isAdmin) {
    return (
      <div>
        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// teacher access</p>
        <h1 className="text-3xl font-black tracking-tight mb-3">Teacher Access</h1>
        <p className="text-gray-700">Only admins can manage teacher access codes.</p>
      </div>
    )
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-gray-900 text-white rounded-full font-bold text-sm shadow-[4px_4px_0_#00b395]">{toast}</div>
      )}

      <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// teacher access</p>
      <h1 className="text-3xl font-black tracking-tight mb-3">Teacher Access</h1>
      <p className="text-gray-700 mb-6 max-w-2xl">
        Teachers must enter a valid access code to create a class. Each code works a set number of times and can have an expiry date.
      </p>

      {/* Create form */}
      <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-5 shadow-[4px_4px_0_#1a1d29] mb-8">
        <p className="text-xs font-mono tracking-widest text-gray-600 uppercase mb-3">// new code</p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_auto] gap-3 items-end">
          <label className="block">
            <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Label (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Lincoln High" className="w-full border-2 border-gray-900 rounded-xl px-3 py-2 font-medium mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Use limit</span>
            <input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-3 py-2 font-medium mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Expires (optional)</span>
            <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-3 py-2 font-medium mt-1" />
          </label>
          <button onClick={createCode} disabled={creating} className="px-5 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide text-sm shadow-[3px_3px_0_#1a1d29] disabled:opacity-50 h-fit" style={{ background: '#00b395' }}>
            {creating ? 'Creating…' : 'Create code'}
          </button>
        </div>
        {justCreated && (
          <div className="mt-4 flex items-center gap-3 flex-wrap border-2 border-gray-900 rounded-xl px-4 py-3" style={{ background: '#b4f1e7' }}>
            <span className="text-xs font-mono tracking-widest uppercase text-gray-700">New code</span>
            <span className="font-mono text-2xl font-black tracking-[0.2em]">{justCreated}</span>
            <button onClick={() => { navigator.clipboard?.writeText(justCreated); showToast('Copied') }} className="px-3 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white shadow-[2px_2px_0_#1a1d29]">Copy</button>
            <span className="text-xs text-gray-600">Share this with the teacher.</span>
          </div>
        )}
      </div>

      {/* List */}
      <p className="text-xs font-mono tracking-widest uppercase mb-3 text-gray-600">// codes ({codes.length})</p>
      {codes.length === 0 ? (
        <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-8 text-center">
          <p className="text-gray-600 font-bold">No codes yet.</p>
          <p className="text-sm text-gray-500 mt-1">Create one above to let a teacher start making classes.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {codes.map((c) => {
            const left = Math.max(0, c.max_uses - c.uses_count)
            const expired = isPast(c.expires_at)
            const usedUp = left === 0
            const status = expired ? { label: 'Expired', bg: '#fde2e2', fg: '#7f1d1d' } : usedUp ? { label: 'Used up', bg: '#f3f4f6', fg: '#374151' } : { label: 'Active', bg: '#d1f5ed', fg: '#065f46' }
            return (
              <div key={c.id} className="bg-white border-[3px] border-gray-900 rounded-2xl p-4 shadow-[4px_4px_0_#1a1d29] flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xl font-black tracking-[0.15em]">{c.code}</span>
                  <button onClick={() => copyCode(c)} className="px-2 py-0.5 border-2 border-gray-900 rounded-lg text-[11px] font-bold bg-white shadow-[2px_2px_0_#1a1d29]">{copiedId === c.id ? 'Copied ✓' : 'Copy'}</button>
                </div>
                {c.label && <span className="text-sm text-gray-600 font-medium">{c.label}</span>}

                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border-2 border-gray-900" style={{ background: status.bg, color: status.fg }}>{status.label}</span>

                <span className="text-sm font-mono text-gray-700">{left} of {c.max_uses} left</span>

                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {editId === c.id ? (
                    <>
                      <input type="datetime-local" value={editVal} onChange={(e) => setEditVal(e.target.value)} className="border-2 border-gray-900 rounded-lg px-2 py-1 text-sm" />
                      <button onClick={() => saveExpiry(c.id)} className="px-3 py-1.5 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395' }}>Save</button>
                      <button onClick={() => { setEditId(null); setEditVal('') }} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-mono text-gray-500">Expires {formatDate(c.expires_at)}</span>
                      <button onClick={() => { setEditId(c.id); setEditVal(toLocalInput(c.expires_at)) }} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white shadow-[2px_2px_0_#1a1d29]">Set expiry</button>
                      <button onClick={() => deleteCode(c.id, c.code)} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold text-red-600 bg-white shadow-[2px_2px_0_#1a1d29]">Delete</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}