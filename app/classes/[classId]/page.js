'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

const toneOf = (c) => {
  const t = c?.tone
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t
  if (t === 'gov') return '#6b7280'
  if (t === 'calc') return '#ef4444'
  return '#00b395'
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)
function formatDue(iso) {
  if (!iso) return 'No due date'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const isPast = (iso) => !!iso && new Date(iso).getTime() < Date.now()

export default function ClassWorkspacePage() {
  const router = useRouter()
  const { classId } = useParams()

  const [loading, setLoading] = useState(true)
  const [klass, setKlass] = useState(null)
  const [course, setCourse] = useState(null)          // course with units+lessons (published)
  const [lessonMeta, setLessonMeta] = useState({})    // lessonId -> { title, icon, label, unitName }
  const [assignments, setAssignments] = useState([])
  const [roster, setRoster] = useState([])
  const [rosterOpen, setRosterOpen] = useState(false)
  const [view, setView] = useState('current')         // 'current' | 'past'
  const [toast, setToast] = useState(null)

  // assign modal
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignType, setAssignType] = useState('lesson')
  const [assignLessonId, setAssignLessonId] = useState('')
  const [assignDue, setAssignDue] = useState('')
  const [assignTitle, setAssignTitle] = useState('')
  const [saving, setSaving] = useState(false)

  // inline due-date editing
  const [editingDueId, setEditingDueId] = useState(null)
  const [editingDueVal, setEditingDueVal] = useState('')

  const rosterRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: classData } = await supabase
        .from('classes').select('*').eq('id', classId).single()

      // Only the teacher gets the workspace. Students go to the course view.
      if (!classData) { setLoading(false); return }
      if (classData.teacher_id !== user.id) {
        router.replace(classData.course_id ? `/courses/${classData.course_id}` : '/dashboard')
        return
      }
      setKlass(classData)

      const { data: courseData } = await supabase
        .from('courses')
        .select(`*, units (*, lessons (*))`)
        .eq('id', classData.course_id).single()

      if (courseData) {
        courseData.units = (courseData.units || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((u) => ({ ...u, lessons: (u.lessons || []).filter((l) => l.status === 'published').sort((a, b) => a.sort_order - b.sort_order) }))
        setCourse(courseData)
        const meta = {}
        courseData.units.forEach((u) => {
          u.lessons.forEach((l, i) => {
            meta[l.id] = { title: l.title, icon: l.icon, unitName: u.name, label: `${u.number}.${i + 1}` }
          })
        })
        setLessonMeta(meta)
      }

      await Promise.all([reloadAssignments(), reloadRoster()])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, router])

  useEffect(() => {
    function onClick(e) { if (rosterRef.current && !rosterRef.current.contains(e.target)) setRosterOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function reloadAssignments() {
    const { data } = await supabase
      .from('class_assignments').select('*').eq('class_id', classId).order('sort_order')
    setAssignments(data || [])
  }
  async function reloadRoster() {
    const { data } = await supabase.rpc('get_class_roster', { p_class: classId })
    setRoster(data || [])
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200) }

  function openAssign(type) {
    setAssignType(type); setAssignLessonId(''); setAssignDue(''); setAssignTitle(''); setAssignOpen(true)
  }

  async function createAssignment() {
    if (!assignLessonId) { showToast('Pick a lesson first'); return }
    setSaving(true)
    const problemSetCount = assignments.filter((a) => a.type === 'problem_set').length
    const fallbackTitle = assignType === 'problem_set'
      ? `Problem set ${problemSetCount + 1}`
      : (lessonMeta[assignLessonId]?.title || 'Lesson')
    const { error } = await supabase.from('class_assignments').insert({
      class_id: classId,
      type: assignType,
      lesson_id: assignLessonId,
      title: assignTitle.trim() || fallbackTitle,
      due_date: fromLocalInput(assignDue),
      sort_order: assignments.length + 1,
    })
    setSaving(false)
    if (error) { showToast('Could not assign: ' + error.message); return }
    setAssignOpen(false)
    await reloadAssignments()
    showToast('Assigned')
  }

  async function saveDue(id) {
    const iso = fromLocalInput(editingDueVal)
    await supabase.from('class_assignments').update({ due_date: iso }).eq('id', id)
    setEditingDueId(null); setEditingDueVal('')
    await reloadAssignments()
    showToast('Due date updated')
  }

  async function removeAssignment(id, label) {
    if (!confirm(`Remove "${label}" from this class?`)) return
    await supabase.from('class_assignments').delete().eq('id', id)
    await reloadAssignments()
    showToast('Removed')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}><p className="text-gray-600 font-mono text-sm">Loading class...</p></div>
  }
  if (!klass) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
        <h1 className="text-3xl font-black tracking-tight mb-3">Class not found</h1>
        <Link href="/dashboard" className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to dashboard</Link>
      </div>
    )
  }

  const tone = toneOf(course)
  const inView = (a) => (view === 'past' ? isPast(a.due_date) : !isPast(a.due_date))
  const lessons = assignments.filter((a) => a.type === 'lesson' && inView(a))
  const problemSets = assignments.filter((a) => a.type === 'problem_set' && inView(a))

  const btn = 'flex items-center gap-2 px-4 py-2.5 border-[2.5px] border-gray-900 rounded-xl font-bold text-sm bg-white shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all'

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-gray-900 text-white rounded-full font-bold text-sm shadow-[4px_4px_0_#00b395]">{toast}</div>
      )}

      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-2" style={{ background: '#b4f1e7' }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
          <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
        </Link>
        <Link href="/dashboard" className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">← Dashboard</Link>
      </div>

      <div className="max-w-5xl mx-auto p-6 md:p-8">
        {/* Header + students pill */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// class workspace</p>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-none mb-1">{klass.name}</h1>
            <p className="text-gray-700 text-sm">{course?.title}{klass.code ? <> · code <span className="font-mono font-bold">{klass.code}</span></> : null}</p>
          </div>

          <div ref={rosterRef} className="relative">
            <button onClick={() => setRosterOpen((v) => !v)} className="flex items-center gap-2 px-4 py-2 border-[2.5px] border-gray-900 rounded-full font-bold text-sm bg-white shadow-[3px_3px_0_#1a1d29]">
              👥 {roster.length} {roster.length === 1 ? 'student' : 'students'}
            </button>
            {rosterOpen && (
              <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto bg-white border-[2.5px] border-gray-900 rounded-xl shadow-[4px_4px_0_#1a1d29] z-50">
                <p className="px-4 py-2 text-xs font-mono tracking-widest uppercase text-gray-500 border-b-2 border-gray-200">Students</p>
                {roster.length === 0 && <p className="px-4 py-4 text-sm text-gray-500">No one has joined yet. Share code <span className="font-mono font-bold">{klass.code}</span>.</p>}
                {roster.map((s) => (
                  <div key={s.student_id} className="px-4 py-2.5 border-b border-gray-100 last:border-0">
                    <p className="font-bold text-sm">{s.full_name || s.username || '—'}</p>
                    <p className="text-xs font-mono text-gray-500">{s.email}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button onClick={() => openAssign('lesson')} className={btn} style={{ background: '#00b395', color: '#fff' }}>➕ Assign new</button>
          <button onClick={() => showToast('Student performance is coming soon.')} className={btn}>📊 Student performance</button>
          <button onClick={() => setView(view === 'past' ? 'current' : 'past')} className={btn} style={view === 'past' ? { background: '#1a1d29', color: '#fff' } : {}}>
            🗂 {view === 'past' ? 'Back to current' : 'Past assignments'}
          </button>
        </div>

        {/* ===== Lessons assigned ===== */}
        <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#00b395' }}>// {view === 'past' ? 'past lessons' : 'lessons assigned'}</p>
        {lessons.length === 0 ? (
          <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-8 text-center mb-10">
            <p className="text-gray-600 font-bold">{view === 'past' ? 'No past lessons.' : 'No lessons currently assigned.'}</p>
            {view !== 'past' && <p className="text-sm text-gray-500 mt-1">Use “Assign new” to give your class a lesson.</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-10">
            {lessons.map((a) => {
              const m = lessonMeta[a.lesson_id]
              return (
                <div key={a.id} className="flex items-center gap-3 flex-wrap border-[3px] border-gray-900 rounded-2xl p-4 bg-white shadow-[4px_4px_0_#1a1d29]">
                  <span className="w-12 h-12 shrink-0 border-2 border-gray-900 rounded-xl flex items-center justify-center font-black text-sm" style={{ background: `${tone}22` }}>{m?.label || '–'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black tracking-tight truncate">{a.title || m?.title || 'Lesson'}</p>
                    <p className="text-xs font-mono text-gray-500">
                      {editingDueId === a.id ? null : (isPast(a.due_date) ? `Due ${formatDue(a.due_date)} · closed` : `Due ${formatDue(a.due_date)}`)}
                    </p>
                  </div>
                  {editingDueId === a.id ? (
                    <div className="flex items-center gap-2">
                      <input type="datetime-local" value={editingDueVal} onChange={(e) => setEditingDueVal(e.target.value)} className="border-2 border-gray-900 rounded-lg px-2 py-1 text-sm" />
                      <button onClick={() => saveDue(a.id)} className="px-3 py-1.5 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395' }}>Save</button>
                      <button onClick={() => { setEditingDueId(null); setEditingDueVal('') }} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditingDueId(a.id); setEditingDueVal(toLocalInput(a.due_date)) }} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white shadow-[2px_2px_0_#1a1d29]">Change due date</button>
                      <button onClick={() => showToast('Per-assignment stats are coming soon.')} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white shadow-[2px_2px_0_#1a1d29]">See stats</button>
                      <button onClick={() => removeAssignment(a.id, a.title || m?.title || 'lesson')} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold text-red-600 bg-white shadow-[2px_2px_0_#1a1d29]">Delete</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ===== Problem sets assigned ===== */}
        <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#00b395' }}>// {view === 'past' ? 'past assignments' : 'assignments assigned'}</p>
        {problemSets.length === 0 ? (
          <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-8 text-center mb-6">
            <p className="text-gray-600 font-bold">{view === 'past' ? 'No past assignments.' : 'No assignments assigned yet.'}</p>
            {view !== 'past' && <p className="text-sm text-gray-500 mt-1">Assign a problem set from the “Assign new” menu.</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {problemSets.map((a, i) => {
              const m = lessonMeta[a.lesson_id]
              return (
                <div key={a.id} className="border-[3px] border-gray-900 rounded-2xl p-5 bg-white shadow-[4px_4px_0_#1a1d29]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 shrink-0 border-[2.5px] border-gray-900 rounded-full flex items-center justify-center font-black text-lg" style={{ background: tone, color: '#fff' }}>{i + 1}</div>
                    <div className="min-w-0">
                      <p className="font-black tracking-tight truncate">{a.title || `Problem set ${i + 1}`}</p>
                      <p className="text-xs font-mono text-gray-500 truncate">from {m?.title || 'lesson'}</p>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-gray-500 mb-3 border-t border-dashed border-gray-300 pt-2">
                    {isPast(a.due_date) ? `Due ${formatDue(a.due_date)} · closed` : `Due ${formatDue(a.due_date)}`}
                  </p>
                  {editingDueId === a.id ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="datetime-local" value={editingDueVal} onChange={(e) => setEditingDueVal(e.target.value)} className="border-2 border-gray-900 rounded-lg px-2 py-1 text-sm" />
                      <button onClick={() => saveDue(a.id)} className="px-3 py-1.5 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395' }}>Save</button>
                      <button onClick={() => { setEditingDueId(null); setEditingDueVal('') }} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => { setEditingDueId(a.id); setEditingDueVal(toLocalInput(a.due_date)) }} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white shadow-[2px_2px_0_#1a1d29]">Change date</button>
                      <button onClick={() => showToast('Per-assignment stats are coming soon.')} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white shadow-[2px_2px_0_#1a1d29]">See stats</button>
                      <button onClick={() => removeAssignment(a.id, a.title || `Problem set ${i + 1}`)} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold text-red-600 bg-white shadow-[2px_2px_0_#1a1d29]">Delete</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== Assign modal ===== */}
      {assignOpen && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center p-4 md:p-8 overflow-y-auto" style={{ background: 'rgba(26,29,41,0.55)' }} onClick={() => setAssignOpen(false)}>
          <div className="w-full max-w-lg bg-white border-[3px] border-gray-900 rounded-2xl shadow-[8px_8px_0_#1a1d29] my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b-[3px] border-gray-900">
              <div>
                <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>// assign to {klass.name}</p>
                <h2 className="text-2xl font-black tracking-tight">Assign new</h2>
              </div>
              <button onClick={() => setAssignOpen(false)} className="w-9 h-9 border-2 border-gray-900 rounded-full bg-white flex items-center justify-center font-bold shadow-[2px_2px_0_#1a1d29]" aria-label="Close">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Type toggle */}
              <div className="grid grid-cols-2 gap-3">
                {['lesson', 'problem_set'].map((t) => (
                  <button key={t} onClick={() => setAssignType(t)} className={`px-4 py-3 border-[2.5px] border-gray-900 rounded-xl font-black text-sm shadow-[3px_3px_0_#1a1d29] ${assignType === t ? 'text-white' : 'bg-white'}`} style={assignType === t ? { background: '#00b395' } : {}}>
                    {t === 'lesson' ? '📘 Lesson' : '✏️ Problem set'}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Lesson</span>
                <select value={assignLessonId} onChange={(e) => setAssignLessonId(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1">
                  <option value="">Pick a lesson…</option>
                  {(course?.units || []).map((u) => (
                    <optgroup key={u.id} label={`Unit ${u.number}: ${u.name}`}>
                      {u.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </optgroup>
                  ))}
                </select>
                {(course?.units || []).every((u) => u.lessons.length === 0) && (
                  <span className="text-xs text-gray-500">This course has no published lessons yet.</span>
                )}
              </label>

              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Title <span className="normal-case tracking-normal">(optional)</span></span>
                <input value={assignTitle} onChange={(e) => setAssignTitle(e.target.value)} placeholder={assignType === 'problem_set' ? 'e.g. Problem set 1' : 'Defaults to the lesson title'} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1" />
              </label>

              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Due date <span className="normal-case tracking-normal">(optional — locks for students)</span></span>
                <input type="datetime-local" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1" />
              </label>

              <div className="flex justify-end">
                <button onClick={createAssignment} disabled={saving} className="px-6 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide text-sm shadow-[4px_4px_0_#1a1d29] disabled:opacity-50" style={{ background: '#00b395' }}>
                  {saving ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}