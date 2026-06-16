'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

// ---------- helpers ----------
const toneOf = (c) => {
  const t = c?.tone
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t
  if (t === 'gov') return '#6b7280'
  if (t === 'calc') return '#ef4444'
  return '#00b395'
}
const DIFF = {
  easy: { label: 'EASY', color: '#22c55e' },
  medium: { label: 'MEDIUM', color: '#eab308' },
  difficult: { label: 'DIFFICULT', color: '#f97316' },
  very_difficult: { label: 'VERY HARD', color: '#ef4444' },
}
const DIFF_OPTIONS = [
  { value: null, label: 'Not set', color: '#9ca3af' },
  { value: 'easy', label: 'Easy', color: '#22c55e' },
  { value: 'medium', label: 'Medium', color: '#eab308' },
  { value: 'difficult', label: 'Difficult', color: '#f97316' },
  { value: 'very_difficult', label: 'Very Difficult', color: '#ef4444' },
]
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function formatDue(iso) {
  if (!iso) return 'No due date'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Module-scope presentational components (defined OUTSIDE the page so they
// keep a stable identity across renders — never define these inline).
function PoolBadge({ pool }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900"
      style={{ background: pool === 'practice' ? '#fbbf24' : '#00b395', color: pool === 'practice' ? '#1a1d29' : '#fff' }}>
      {pool === 'practice' ? 'PRACTICE' : 'LESSON'}
    </span>
  )
}
function DiffBadge({ d }) {
  if (!d || !DIFF[d]) return null
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900 text-white" style={{ background: DIFF[d].color }}>{DIFF[d].label}</span>
}

export default function CustomAssignmentsPage() {
  const router = useRouter()
  const { classId } = useParams()

  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [me, setMe] = useState(null)
  const [klass, setKlass] = useState(null)
  const [course, setCourse] = useState(null)
  const [toast, setToast] = useState(null)

  const [view, setView] = useState('list')          // 'list' | 'build'
  const [customList, setCustomList] = useState([])

  // build state
  const [editId, setEditId] = useState(null)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [retry, setRetry] = useState(false)
  const [setItems, setSetItems] = useState([])
  const [bank, setBank] = useState([])
  const [bankLoaded, setBankLoaded] = useState(false)
  const [unitFilter, setUnitFilter] = useState('all')
  const [poolFilter, setPoolFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editingIdx, setEditingIdx] = useState(null)
  const [saving, setSaving] = useState(false)

  const tone = toneOf(course)

  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2200) }

  const lessonIndex = useMemo(() => {
    const idx = {}
    ;(course?.units || []).forEach((u) =>
      (u.lessons || []).forEach((l, i) => {
        idx[l.id] = { unitId: u.id, unitNumber: u.number, unitName: u.name, lessonTitle: l.title, label: `${u.number}.${i + 1}` }
      })
    )
    return idx
  }, [course])

  // initial load: auth + course + existing custom assignments
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setMe(user)

      const { data: classData } = await supabase.from('classes').select('*').eq('id', classId).single()
      if (!classData || classData.teacher_id !== user.id) { setDenied(true); setLoading(false); return }
      setKlass(classData)

      const { data: courseData } = await supabase
        .from('courses').select(`*, units (*, lessons (*))`).eq('id', classData.course_id).single()
      if (courseData) {
        courseData.units = (courseData.units || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((u) => ({ ...u, lessons: (u.lessons || []).filter((l) => l.status === 'published').sort((a, b) => a.sort_order - b.sort_order) }))
        setCourse(courseData)
      }

      await loadList()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  async function loadList() {
    const { data } = await supabase
      .from('class_assignments').select('*').eq('class_id', classId).eq('type', 'custom').order('sort_order')
    const ids = (data || []).map((a) => a.id)
    const counts = {}
    if (ids.length) {
      const { data: qs } = await supabase.from('questions').select('custom_assignment_id').in('custom_assignment_id', ids)
      ;(qs || []).forEach((q) => { counts[q.custom_assignment_id] = (counts[q.custom_assignment_id] || 0) + 1 })
    }
    setCustomList((data || []).map((a) => ({ ...a, _count: counts[a.id] || 0 })))
  }

  async function loadBank() {
    setBankLoaded(false)
    const lessonIds = Object.keys(lessonIndex)
    if (!lessonIds.length) { setBank([]); setBankLoaded(true); return }
    const { data } = await supabase
      .from('questions').select('*')
      .in('lesson_id', lessonIds)
      .in('pool', ['lesson', 'practice'])
      .eq('status', 'published')
      .order('sort_order')
    setBank(data || [])
    setBankLoaded(true)
  }

  function startNew() {
    setEditId(null); setTitle(''); setDue(''); setRetry(false); setSetItems([])
    setUnitFilter('all'); setPoolFilter('all'); setSearch(''); setEditingIdx(null)
    setView('build'); loadBank()
  }

  async function startEdit(a) {
    setEditId(a.id); setTitle(a.title || ''); setDue(a.due_date ? toLocalInput(a.due_date) : ''); setRetry(!!a.allow_retry)
    setUnitFilter('all'); setPoolFilter('all'); setSearch(''); setEditingIdx(null)
    const { data } = await supabase.from('questions').select('*').eq('custom_assignment_id', a.id).order('sort_order')
    setSetItems((data || []).map((q) => ({
      _key: `e-${q.id}`,
      stem: q.stem,
      choices: Array.isArray(q.choices) ? [...q.choices] : ['Option A', 'Option B'],
      answer: q.answer ?? 0,
      explanation: q.explanation || '',
      choice_explanations: Array.isArray(q.choice_explanations) ? [...q.choice_explanations] : [],
      difficulty: q.difficulty || null,
      source_question_id: q.source_question_id || null,
      _authored: !q.source_question_id,
    })))
    setView('build'); loadBank()
  }

  async function deleteCustom(a) {
    if (!confirm(`Delete "${a.title || 'this custom assignment'}" and its ${a._count} question(s)? This cannot be undone.`)) return
    const { error } = await supabase.from('class_assignments').delete().eq('id', a.id)
    if (error) { flash('Delete failed: ' + error.message); return }
    flash('Deleted'); await loadList()
  }

  function addFromBank(q) {
    if (setItems.some((i) => i.source_question_id === q.id)) { flash('Already added'); return }
    setSetItems((prev) => [...prev, {
      _key: `b-${q.id}-${Date.now()}`,
      stem: q.stem,
      choices: Array.isArray(q.choices) ? [...q.choices] : ['Option A', 'Option B'],
      answer: q.answer ?? 0,
      explanation: q.explanation || '',
      choice_explanations: Array.isArray(q.choice_explanations) ? [...q.choice_explanations] : [],
      difficulty: q.difficulty || null,
      source_question_id: q.id,
      _authored: false,
    }])
  }
  function addAuthored() {
    const item = {
      _key: `a-${Date.now()}`,
      stem: 'New question',
      choices: ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: 0,
      explanation: '',
      difficulty: null,
      source_question_id: null,
      _authored: true,
    }
    setSetItems((prev) => {
      const next = [...prev, item]
      setEditingIdx(next.length - 1)
      return next
    })
  }
  function move(idx, dir) {
    const j = dir === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= setItems.length) return
    setSetItems((prev) => { const n = [...prev];[n[idx], n[j]] = [n[j], n[idx]]; return n })
    if (editingIdx === idx) setEditingIdx(j)
    else if (editingIdx === j) setEditingIdx(idx)
  }
  function removeItem(idx) {
    setSetItems((prev) => prev.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
    else if (editingIdx != null && idx < editingIdx) setEditingIdx(editingIdx - 1)
  }
  function patchItem(idx, patch) {
    setSetItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  async function save() {
    const clean = title.trim() || `Custom assignment ${customList.length + 1}`
    if (setItems.length === 0) { flash('Add at least one question'); return }
    for (const it of setItems) {
      if (!it.stem.trim()) { flash('Every question needs a prompt'); return }
      if (!it.choices || it.choices.length < 2) { flash('Each question needs 2+ choices'); return }
    }
    setSaving(true)

    let assignmentId = editId
    if (editId) {
      const { error: upErr } = await supabase.from('class_assignments')
        .update({ title: clean, due_date: fromLocalInput(due), allow_retry: retry }).eq('id', editId)
      if (upErr) { setSaving(false); flash('Save failed: ' + upErr.message); return }
      await supabase.from('questions').delete().eq('custom_assignment_id', editId)
    } else {
      const { data: maxRow } = await supabase.from('class_assignments')
        .select('sort_order').eq('class_id', classId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
      const nextSort = (maxRow?.sort_order || 0) + 1
      const { data: parent, error: insErr } = await supabase.from('class_assignments').insert({
        class_id: classId, type: 'custom', lesson_id: null,
        title: clean, due_date: fromLocalInput(due), sort_order: nextSort,
        practice_set: null, allow_retry: retry,
      }).select().single()
      if (insErr) { setSaving(false); flash('Save failed: ' + insErr.message); return }
      assignmentId = parent.id
    }

    const rows = setItems.map((it, i) => ({
      custom_assignment_id: assignmentId,
      pool: 'custom',
      lesson_id: null,
      level_id: null,
      status: 'published',
      created_by: me?.id || null,
      source_question_id: it.source_question_id || null,
      stem: it.stem,
      choices: it.choices,
      answer: it.answer,
      explanation: it.explanation,
      choice_explanations: it.choice_explanations || [],
      difficulty: it.difficulty || null,
      sort_order: i + 1,
    }))
    const { error: qErr } = await supabase.from('questions').insert(rows)
    setSaving(false)
    if (qErr) { flash('Saved set, but questions failed: ' + qErr.message); return }

    flash(editId ? 'Updated' : 'Created')
    await loadList(); setView('list')
  }

  // derived
  const addedSources = useMemo(() => new Set(setItems.map((i) => i.source_question_id).filter(Boolean)), [setItems])
  const bankFiltered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return bank.filter((q) => {
      const meta = lessonIndex[q.lesson_id]
      if (unitFilter !== 'all' && meta?.unitId !== unitFilter) return false
      if (poolFilter !== 'all' && q.pool !== poolFilter) return false
      if (s && !`${q.stem}`.toLowerCase().includes(s)) return false
      return true
    })
  }, [bank, unitFilter, poolFilter, search, lessonIndex])

  function originLabel(it) {
    if (it._authored) return '✎ Authored'
    const src = bank.find((b) => b.id === it.source_question_id)
    if (src) { const m = lessonIndex[src.lesson_id]; return m ? `${m.label} ${m.lessonTitle}` : 'Imported' }
    return 'Imported'
  }

  const TopBar = (
    <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-2" style={{ background: '#b4f1e7' }}>
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
        <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
      </Link>
      <Link href={`/classes/${classId}`} className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">← Back to class</Link>
    </div>
  )

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}><p className="text-gray-600 font-mono text-sm">Loading…</p></div>
  }
  if (denied) {
    return (
      <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
        {TopBar}
        <div className="flex flex-col items-center justify-center p-8 text-center mt-20">
          <h1 className="text-3xl font-black tracking-tight mb-3">Teachers only</h1>
          <p className="text-gray-600 mb-6 max-w-md">Only the teacher who created this class can build custom assignments.</p>
          <Link href={`/classes/${classId}`} className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to class</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-gray-900 text-white rounded-full font-bold text-sm shadow-[4px_4px_0_#00b395]">{toast}</div>}
      {TopBar}

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* ===================== LIST VIEW ===================== */}
        {view === 'list' ? (
          <>
            <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#8b5cf6' }}>// {klass?.name} · custom assignments</p>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Custom assignments</h1>
              <button onClick={startNew} className="px-5 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide text-sm shadow-[4px_4px_0_#1a1d29]" style={{ background: '#8b5cf6' }}>+ New custom assignment</button>
            </div>

            {customList.length === 0 ? (
              <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-10 text-center">
                <p className="text-gray-600 font-bold">No custom assignments yet.</p>
                <p className="text-sm text-gray-500 mt-1">Pick questions from across the course and write your own.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {customList.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 flex-wrap border-[3px] border-gray-900 rounded-2xl p-4 bg-white shadow-[4px_4px_0_#1a1d29]">
                    <span className="w-12 h-12 shrink-0 border-2 border-gray-900 rounded-xl flex items-center justify-center text-xl" style={{ background: '#ede9fe' }}>🛠</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black tracking-tight truncate">{a.title || 'Custom assignment'}</p>
                      <p className="text-xs font-mono text-gray-500">{a._count} question{a._count === 1 ? '' : 's'} · Due {formatDue(a.due_date)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => startEdit(a)} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white shadow-[2px_2px_0_#1a1d29]">Edit</button>
                      <button onClick={() => deleteCustom(a)} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold text-red-600 bg-white shadow-[2px_2px_0_#1a1d29]">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* ===================== BUILD VIEW ===================== */
          <>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setView('list')} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-sm font-bold bg-white shadow-[2px_2px_0_#1a1d29]">← Back</button>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">{editId ? 'Edit custom assignment' : 'New custom assignment'}</h1>
            </div>

            {/* meta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Unit 1 + 2 review" className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Due date <span className="normal-case tracking-normal">(optional — locks for students)</span></span>
                <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1" />
              </label>
              <button type="button" onClick={() => setRetry((v) => !v)} className="md:col-span-2 flex items-center gap-3 w-full text-left px-4 py-3 border-2 border-gray-900 rounded-xl bg-white shadow-[3px_3px_0_#1a1d29]">
                <span className="w-11 h-6 rounded-full border-2 border-gray-900 flex-shrink-0 relative" style={{ background: retry ? '#00b395' : '#e5e7eb' }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white border border-gray-900 transition-all" style={{ left: retry ? '22px' : '2px' }} />
                </span>
                <span className="text-sm font-bold">{retry ? 'Students can retry after finishing' : 'No retries — one attempt only'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* LEFT — bank */}
              <div className="border-[2.5px] border-gray-900 rounded-2xl p-4 bg-white">
                <p className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-3">// question bank</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="border-2 border-gray-900 rounded-lg px-1 py-1.5 text-sm font-bold bg-white">
                    <option value="all">All units</option>
                    {(course?.units || []).map((u) => <option key={u.id} value={u.id}>Unit {u.number}: {u.name}</option>)}
                  </select>
                  {['all', 'lesson', 'practice'].map((p) => (
                    <button key={p} onClick={() => setPoolFilter(p)} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
                      style={poolFilter === p ? { background: '#1a1d29', color: '#fff' } : { background: '#fff' }}>
                      {p === 'all' ? 'All' : p === 'lesson' ? 'Lesson' : 'Practice'}
                    </button>
                  ))}
                </div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search question text…" className="w-full border-2 border-gray-900 rounded-lg px-3 py-2 text-sm mb-3" />

                <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                  {!bankLoaded ? (
                    <p className="text-gray-500 font-mono text-sm py-8 text-center">Loading questions…</p>
                  ) : bank.length === 0 ? (
                    <p className="text-gray-500 text-sm py-8 text-center">This course has no published lesson or practice questions yet.</p>
                  ) : bankFiltered.length === 0 ? (
                    <p className="text-gray-500 text-sm py-8 text-center">No questions match your filters.</p>
                  ) : bankFiltered.map((q) => {
                    const meta = lessonIndex[q.lesson_id]
                    const added = addedSources.has(q.id)
                    return (
                      <div key={q.id} className="border-2 border-gray-900 rounded-xl p-3 bg-white">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          <PoolBadge pool={q.pool} />
                          <DiffBadge d={q.difficulty} />
                          {meta && <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900 bg-white">{meta.label} · {meta.unitName}</span>}
                        </div>
                        <p className="text-sm font-medium mb-2">{q.stem}</p>
                        <button onClick={() => addFromBank(q)} disabled={added}
                          className="px-3 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29] disabled:opacity-40"
                          style={added ? { background: '#e5e7eb' } : { background: '#00b395', color: '#fff' }}>
                          {added ? '✓ Added' : '+ Add'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* RIGHT — working set */}
              <div className="border-[2.5px] border-gray-900 rounded-2xl p-4 bg-white">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-xs font-mono tracking-widest uppercase text-gray-500">// this assignment ({setItems.length})</p>
                  <button onClick={addAuthored} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#8b5cf6', color: '#fff' }}>+ Write new</button>
                </div>

                <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                  {setItems.length === 0 ? (
                    <p className="text-gray-500 text-sm py-8 text-center">Add questions from the bank, or write your own.</p>
                  ) : setItems.map((it, idx) => (
                    <div key={it._key} className="border-2 border-gray-900 rounded-xl bg-white">
                      <div className="flex items-start gap-2 p-3">
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => move(idx, 'up')} disabled={idx === 0} className="w-7 h-7 border-2 border-gray-900 rounded-md text-xs font-bold disabled:opacity-30">↑</button>
                          <button onClick={() => move(idx, 'down')} disabled={idx === setItems.length - 1} className="w-7 h-7 border-2 border-gray-900 rounded-md text-xs font-bold disabled:opacity-30">↓</button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="w-6 h-6 shrink-0 border-2 border-gray-900 rounded-md flex items-center justify-center text-[11px] font-black">{idx + 1}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900"
                              style={it._authored ? { background: '#8b5cf6', color: '#fff' } : { background: '#fff' }}>{originLabel(it)}</span>
                            <DiffBadge d={it.difficulty} />
                          </div>
                          <p className="text-sm font-medium">{it.stem}</p>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => setEditingIdx(editingIdx === idx ? null : idx)} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold" style={{ background: '#00b395', color: '#fff' }}>{editingIdx === idx ? 'Done' : 'Edit'}</button>
                          <button onClick={() => removeItem(idx)} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold text-red-600">Remove</button>
                        </div>
                      </div>

                      {editingIdx === idx && (
                        <div className="border-t-2 border-gray-200 p-3 space-y-3 bg-gray-50 rounded-b-xl">
                          <label className="block">
                            <span className="text-[11px] font-mono tracking-widest uppercase text-gray-500">Question</span>
                            <textarea value={it.stem} onChange={(e) => patchItem(idx, { stem: e.target.value })} rows={2} className="w-full border-2 border-gray-900 rounded-lg px-3 py-2 text-sm mt-1" />
                          </label>
                          <div>
                            <span className="text-[11px] font-mono tracking-widest uppercase text-gray-500">Choices <span className="normal-case tracking-normal">(tap the letter to mark the correct one)</span></span>
                            <div className="space-y-1.5 mt-1">
                              {it.choices.map((c, ci) => (
                                <div key={ci} className="flex items-center gap-2">
                                  <button type="button" onClick={() => patchItem(idx, { answer: ci })} className="w-8 h-8 shrink-0 border-2 border-gray-900 rounded-md text-sm font-black"
                                    style={it.answer === ci ? { background: '#00b395', color: '#fff' } : { background: '#fff' }}>{String.fromCharCode(65 + ci)}</button>
                                  <input value={c} onChange={(e) => { const cs = [...it.choices]; cs[ci] = e.target.value; patchItem(idx, { choices: cs }) }} className="flex-1 border-2 border-gray-900 rounded-md px-2 py-1.5 text-sm" />
                                  <button type="button" disabled={it.choices.length <= 2} onClick={() => {
                                    const cs = it.choices.filter((_, k) => k !== ci)
                                    let ans = it.answer; if (ans === ci) ans = 0; else if (ans > ci) ans--
                                    patchItem(idx, { choices: cs, answer: ans })
                                  }} className="px-2 py-1 text-red-600 disabled:opacity-30">🗑</button>
                                </div>
                              ))}
                              {it.choices.length < 8 && (
                                <button type="button" onClick={() => patchItem(idx, { choices: [...it.choices, `Option ${String.fromCharCode(65 + it.choices.length)}`] })} className="px-3 py-1.5 bg-white border-2 border-dashed border-gray-400 rounded-lg text-xs font-bold">+ Add choice</button>
                              )}
                            </div>
                          </div>
                          <label className="block">
                            <span className="text-[11px] font-mono tracking-widest uppercase text-gray-500">Explanation</span>
                            <textarea value={it.explanation} onChange={(e) => patchItem(idx, { explanation: e.target.value })} rows={2} className="w-full border-2 border-gray-900 rounded-lg px-3 py-2 text-sm mt-1" />
                          </label>
                          <div>
                            <span className="text-[11px] font-mono tracking-widest uppercase text-gray-500">Difficulty</span>
                            <div className="flex gap-1.5 flex-wrap mt-1">
                              {DIFF_OPTIONS.map((opt) => (
                                <button key={opt.label} type="button" onClick={() => patchItem(idx, { difficulty: opt.value })}
                                  className="px-3 py-1.5 border-2 rounded-lg text-xs font-bold"
                                  style={it.difficulty === opt.value ? { borderColor: '#1a1d29', background: opt.color, color: '#fff' } : { borderColor: '#d1d5db', background: '#fff' }}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* footer actions */}
            <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
              <p className="text-xs font-mono text-gray-500">{setItems.length} question{setItems.length === 1 ? '' : 's'} · copies, never touches admin content</p>
              <div className="flex gap-2">
                <button onClick={() => setView('list')} className="px-4 py-2.5 border-2 border-gray-900 rounded-xl font-bold text-sm bg-white shadow-[3px_3px_0_#1a1d29]">Cancel</button>
                <button onClick={save} disabled={saving} className="px-6 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide text-sm shadow-[4px_4px_0_#1a1d29] disabled:opacity-50" style={{ background: '#8b5cf6' }}>
                  {saving ? 'Saving…' : editId ? 'Save changes' : 'Create assignment'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}