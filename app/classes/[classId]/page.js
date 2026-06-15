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

export default function ClassPage() {
  const router = useRouter()
  const { classId } = useParams()

  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState(null)              // 'teacher' | 'student'
  const [klass, setKlass] = useState(null)
  const [course, setCourse] = useState(null)
  const [lessonMeta, setLessonMeta] = useState({})    // lessonId -> { title, icon, label, unitName, maxLevels }
  const [assignments, setAssignments] = useState([])
  const [progressMap, setProgressMap] = useState({})  // student: lessonId -> { levels_completed, current_level }
  const [roster, setRoster] = useState([])            // teacher
  const [rosterOpen, setRosterOpen] = useState(false)
  const [view, setView] = useState('current')         // teacher toggle
  const [toast, setToast] = useState(null)

  // teacher: assign modal
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignType, setAssignType] = useState('lesson')
  const [assignLessonId, setAssignLessonId] = useState('')
  const [assignDue, setAssignDue] = useState('')
  const [assignTitle, setAssignTitle] = useState('')
  const [saving, setSaving] = useState(false)

  // teacher: settings modal
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sName, setSName] = useState('')
  const [sCap, setSCap] = useState('')
  const [sEnd, setSEnd] = useState('')

  // teacher: inline due editing
  const [editingDueId, setEditingDueId] = useState(null)
  const [editingDueVal, setEditingDueVal] = useState('')

  const rosterRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: classData } = await supabase.from('classes').select('*').eq('id', classId).single()
      if (!classData) { setLoading(false); return }

      let myRole = null
      if (classData.teacher_id === user.id) {
        myRole = 'teacher'
      } else {
        const { data: membership } = await supabase
          .from('class_members').select('id').eq('class_id', classId).eq('student_id', user.id).maybeSingle()
        if (membership) myRole = 'student'
      }
      if (!myRole) { router.replace('/dashboard'); return }

      setRole(myRole)
      setKlass(classData)

      const { data: courseData } = await supabase
        .from('courses').select(`*, units (*, lessons (*))`).eq('id', classData.course_id).single()
      if (courseData) {
        courseData.units = (courseData.units || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((u) => ({ ...u, lessons: (u.lessons || []).filter((l) => l.status === 'published').sort((a, b) => a.sort_order - b.sort_order) }))
        setCourse(courseData)
        const meta = {}
        courseData.units.forEach((u) => {
          u.lessons.forEach((l, i) => {
            meta[l.id] = { title: l.title, icon: l.icon, unitName: u.name, label: `${u.number}.${i + 1}`, maxLevels: l.max_levels || 0 }
          })
        })
        setLessonMeta(meta)
      }

      const { data: aData } = await supabase
        .from('class_assignments').select('*').eq('class_id', classId).order('sort_order')
      const list = aData || []
      setAssignments(list)

      if (myRole === 'teacher') {
        const { data: r } = await supabase.rpc('get_class_roster', { p_class: classId })
        setRoster(r || [])
      } else {
        const lessonIds = [...new Set(list.map((a) => a.lesson_id))]
        if (lessonIds.length) {
          const { data: prog } = await supabase
            .from('progress').select('lesson_id, levels_completed, current_level')
            .eq('user_id', user.id).in('lesson_id', lessonIds)
          const pm = {}
          ;(prog || []).forEach((p) => { pm[p.lesson_id] = p })
          setProgressMap(pm)
        }
      }

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

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200) }

  async function reloadAssignments() {
    const { data } = await supabase.from('class_assignments').select('*').eq('class_id', classId).order('sort_order')
    setAssignments(data || [])
  }
  async function reloadRoster() {
    const { data } = await supabase.rpc('get_class_roster', { p_class: classId })
    setRoster(data || [])
  }

  // ---- teacher actions ----
  function openAssign(type) { setAssignType(type); setAssignLessonId(''); setAssignDue(''); setAssignTitle(''); setAssignOpen(true) }

  async function createAssignment() {
    if (!assignLessonId) { showToast('Pick a lesson first'); return }
    setSaving(true)
    const psCount = assignments.filter((a) => a.type === 'problem_set').length
    const fallback = assignType === 'problem_set' ? `Problem set ${psCount + 1}` : (lessonMeta[assignLessonId]?.title || 'Lesson')
    const { error } = await supabase.from('class_assignments').insert({
      class_id: classId, type: assignType, lesson_id: assignLessonId,
      title: assignTitle.trim() || fallback, due_date: fromLocalInput(assignDue), sort_order: assignments.length + 1,
    })
    setSaving(false)
    if (error) { showToast('Could not assign: ' + error.message); return }
    setAssignOpen(false); await reloadAssignments(); showToast('Assigned')
  }

  async function saveDue(id) {
    await supabase.from('class_assignments').update({ due_date: fromLocalInput(editingDueVal) }).eq('id', id)
    setEditingDueId(null); setEditingDueVal(''); await reloadAssignments(); showToast('Due date updated')
  }

  async function removeAssignment(id, label) {
    if (!confirm(`Remove "${label}" from this class?`)) return
    await supabase.from('class_assignments').delete().eq('id', id)
    await reloadAssignments(); showToast('Removed')
  }

  async function removeStudent(studentId, label) {
    if (!confirm(`Remove ${label} from ${klass.name}? Their progress is kept, but they lose access to this class.`)) return
    await supabase.from('class_members').delete().eq('class_id', klass.id).eq('student_id', studentId)
    await reloadRoster(); showToast('Student removed')
  }

  function openSettings() {
    setSName(klass.name || ''); setSCap(klass.capacity ?? 50); setSEnd(toLocalInput(klass.end_date)); setSettingsOpen(true)
  }
  async function saveSettings() {
    let cap = sCap === '' ? 50 : parseInt(sCap, 10)
    if (isNaN(cap) || cap < 1) cap = 1
    if (cap > 50) cap = 50
    const name = sName.trim() || klass.name
    const end = fromLocalInput(sEnd)
    const { error } = await supabase.from('classes').update({ name, capacity: cap, end_date: end }).eq('id', klass.id)
    if (error) { showToast('Could not save: ' + error.message); return }
    setKlass({ ...klass, name, capacity: cap, end_date: end })
    setSettingsOpen(false); showToast('Saved')
  }
  async function deleteClass() {
    if (!confirm(`Delete "${klass.name}"? This removes the class, its assignments, and unenrolls all students. Student progress is kept.`)) return
    if (prompt(`Type the class name to confirm:\n\n${klass.name}`) !== klass.name) { showToast('Not deleted'); return }
    const { error } = await supabase.from('classes').delete().eq('id', klass.id)
    if (error) { showToast('Could not delete: ' + error.message); return }
    router.push('/dashboard')
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
  const ended = isPast(klass.end_date)

  // shared top bar
  const TopBar = (
    <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-2" style={{ background: '#b4f1e7' }}>
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
        <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
      </Link>
      <Link href="/dashboard" className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">← Dashboard</Link>
    </div>
  )

  // ====================================================================
  // STUDENT VIEW
  // ====================================================================
  if (role === 'student') {
    const locked = (a) => ended || isPast(a.due_date)
    const current = assignments.filter((a) => !locked(a))
    const past = assignments.filter((a) => locked(a))

    const StudentItem = ({ a, isLocked }) => {
      const m = lessonMeta[a.lesson_id]
      const title = a.title || m?.title || (a.type === 'problem_set' ? 'Problem set' : 'Lesson')
      const href = a.type === 'problem_set' ? `/lessons/${a.lesson_id}?mode=practice` : `/lessons/${a.lesson_id}`
      const prog = progressMap[a.lesson_id]
      const progText = prog ? `Level ${Math.min(prog.current_level || 1, m?.maxLevels || prog.current_level || 1)}${m?.maxLevels ? ` / ${m.maxLevels}` : ''}` : 'Not started'
      const inner = (
        <div className={`flex items-center gap-3 flex-wrap border-[3px] border-gray-900 rounded-2xl p-4 shadow-[4px_4px_0_#1a1d29] ${isLocked ? 'bg-gray-100 opacity-70' : 'bg-white hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_#1a1d29] transition-all'}`}>
          <span className="w-12 h-12 shrink-0 border-2 border-gray-900 rounded-xl flex items-center justify-center text-xl" style={{ background: `${tone}22` }}>{a.type === 'problem_set' ? '✏️' : (m?.icon || '📘')}</span>
          <div className="min-w-0 flex-1">
            <p className="font-black tracking-tight truncate">{title}</p>
            <p className="text-xs font-mono text-gray-500">{isLocked ? `Closed · was due ${formatDue(a.due_date)}` : `Due ${formatDue(a.due_date)} · ${progText}`}</p>
          </div>
          {isLocked ? <span className="text-xs font-mono font-bold text-gray-500">🔒 Closed</span> : <span className="text-sm font-black" style={{ color: '#00b395' }}>Start →</span>}
        </div>
      )
      return isLocked ? <div key={a.id}>{inner}</div> : <Link key={a.id} href={href}>{inner}</Link>
    }

    return (
      <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
        {TopBar}
        <div className="max-w-3xl mx-auto p-6 md:p-8">
          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// {course?.title || 'class'}</p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-none mb-2">{klass.name}</h1>
          {ended && (
            <div className="border-2 border-gray-900 bg-gray-100 rounded-xl px-4 py-2.5 text-sm font-bold mb-6 inline-block">
              This class ended on {formatDue(klass.end_date)}. Assignments are closed.
            </div>
          )}

          <p className="text-xs font-mono tracking-widest uppercase mb-3 mt-4" style={{ color: '#00b395' }}>// assignments</p>
          {current.length === 0 ? (
            <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-8 text-center mb-10">
              <p className="text-gray-600 font-bold">Nothing assigned right now.</p>
              <p className="text-sm text-gray-500 mt-1">Your teacher hasn&apos;t assigned anything that&apos;s currently open.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 mb-10">{current.map((a) => <StudentItem key={a.id} a={a} isLocked={false} />)}</div>
          )}

          <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#00b395' }}>// past assignments</p>
          {past.length === 0 ? (
            <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-8 text-center">
              <p className="text-gray-600 font-bold">No past assignments yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">{past.map((a) => <StudentItem key={a.id} a={a} isLocked={true} />)}</div>
          )}
        </div>
      </div>
    )
  }

  // ====================================================================
  // TEACHER VIEW
  // ====================================================================
  const inView = (a) => (view === 'past' ? (ended || isPast(a.due_date)) : !(ended || isPast(a.due_date)))
  const lessons = assignments.filter((a) => a.type === 'lesson' && inView(a))
  const problemSets = assignments.filter((a) => a.type === 'problem_set' && inView(a))
  const btn = 'flex items-center gap-2 px-4 py-2.5 border-[2.5px] border-gray-900 rounded-xl font-bold text-sm bg-white shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all'

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-gray-900 text-white rounded-full font-bold text-sm shadow-[4px_4px_0_#00b395]">{toast}</div>}
      {TopBar}

      <div className="max-w-5xl mx-auto p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// class workspace</p>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-none mb-1 flex items-center gap-3">
              {klass.name}
              {ended && <span className="px-2.5 py-1 rounded-full border-2 border-gray-900 text-[10px] font-black uppercase tracking-widest bg-gray-200">Ended</span>}
            </h1>
            <p className="text-gray-700 text-sm">{course?.title} · code <span className="font-mono font-bold">{klass.code}</span></p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={openSettings} className="px-4 py-2 border-[2.5px] border-gray-900 rounded-full font-bold text-sm bg-white shadow-[3px_3px_0_#1a1d29]">⚙️ Manage</button>
            <div ref={rosterRef} className="relative">
              <button onClick={() => setRosterOpen((v) => !v)} className="flex items-center gap-2 px-4 py-2 border-[2.5px] border-gray-900 rounded-full font-bold text-sm bg-white shadow-[3px_3px_0_#1a1d29]">
                👥 {roster.length} / {klass.capacity ?? 50}
              </button>
              {rosterOpen && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border-[2.5px] border-gray-900 rounded-xl shadow-[4px_4px_0_#1a1d29] z-50">
                  <p className="px-4 py-2 text-xs font-mono tracking-widest uppercase text-gray-500 border-b-2 border-gray-200">Students ({roster.length}/{klass.capacity ?? 50})</p>
                  {roster.length === 0 && <p className="px-4 py-4 text-sm text-gray-500">No one has joined yet. Share code <span className="font-mono font-bold">{klass.code}</span>.</p>}
                  {roster.map((s) => (
                    <div key={s.student_id} className="px-4 py-2.5 border-b border-gray-100 last:border-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{s.full_name || s.username || '—'}</p>
                        <p className="text-xs font-mono text-gray-500 truncate">{s.email}</p>
                      </div>
                      <button onClick={() => removeStudent(s.student_id, s.full_name || s.email)} className="shrink-0 px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold text-red-600 bg-white">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          <button onClick={() => openAssign('lesson')} className={btn} style={{ background: '#00b395', color: '#fff' }}>➕ Assign new</button>
          <button onClick={() => showToast('Student performance is coming soon.')} className={btn}>📊 Student performance</button>
          <button onClick={() => setView(view === 'past' ? 'current' : 'past')} className={btn} style={view === 'past' ? { background: '#1a1d29', color: '#fff' } : {}}>🗂 {view === 'past' ? 'Back to current' : 'Past assignments'}</button>
        </div>

        {/* Lessons assigned */}
        <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#00b395' }}>// {view === 'past' ? 'past lessons' : 'lessons assigned'}</p>
        {lessons.length === 0 ? (
          <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-8 text-center mb-10">
            <p className="text-gray-600 font-bold">{view === 'past' ? 'No past lessons.' : 'No lessons currently assigned.'}</p>
            {view !== 'past' && <p className="text-sm text-gray-500 mt-1">Use &ldquo;Assign new&rdquo; to give your class a lesson.</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-10">
            {lessons.map((a) => {
              const m = lessonMeta[a.lesson_id]
              const closed = ended || isPast(a.due_date)
              return (
                <div key={a.id} className="flex items-center gap-3 flex-wrap border-[3px] border-gray-900 rounded-2xl p-4 bg-white shadow-[4px_4px_0_#1a1d29]">
                  <span className="w-12 h-12 shrink-0 border-2 border-gray-900 rounded-xl flex items-center justify-center font-black text-sm" style={{ background: `${tone}22` }}>{m?.label || '–'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black tracking-tight truncate">{a.title || m?.title || 'Lesson'}</p>
                    {editingDueId !== a.id && <p className="text-xs font-mono text-gray-500">{closed ? `Due ${formatDue(a.due_date)} · closed` : `Due ${formatDue(a.due_date)}`}</p>}
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

        {/* Problem sets assigned */}
        <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#00b395' }}>// {view === 'past' ? 'past assignments' : 'assignments assigned'}</p>
        {problemSets.length === 0 ? (
          <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-8 text-center mb-6">
            <p className="text-gray-600 font-bold">{view === 'past' ? 'No past assignments.' : 'No assignments assigned yet.'}</p>
            {view !== 'past' && <p className="text-sm text-gray-500 mt-1">Assign a problem set from the &ldquo;Assign new&rdquo; menu.</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {problemSets.map((a, i) => {
              const m = lessonMeta[a.lesson_id]
              const closed = ended || isPast(a.due_date)
              return (
                <div key={a.id} className="border-[3px] border-gray-900 rounded-2xl p-5 bg-white shadow-[4px_4px_0_#1a1d29]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 shrink-0 border-[2.5px] border-gray-900 rounded-full flex items-center justify-center font-black text-lg" style={{ background: tone, color: '#fff' }}>{i + 1}</div>
                    <div className="min-w-0">
                      <p className="font-black tracking-tight truncate">{a.title || `Problem set ${i + 1}`}</p>
                      <p className="text-xs font-mono text-gray-500 truncate">from {m?.title || 'lesson'}</p>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-gray-500 mb-3 border-t border-dashed border-gray-300 pt-2">{closed ? `Due ${formatDue(a.due_date)} · closed` : `Due ${formatDue(a.due_date)}`}</p>
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

      {/* Assign modal */}
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
              <div className="grid grid-cols-2 gap-3 mb-2">
                <button 
                  onClick={() => setAssignType('lesson')} 
                  className={`px-4 py-3 border-[2.5px] border-gray-900 rounded-xl font-black text-sm shadow-[3px_3px_0_#1a1d29] flex flex-col items-center gap-1 transition-all ${assignType === 'lesson' ? 'text-white' : 'bg-white'}`} 
                  style={assignType === 'lesson' ? { background: '#00b395' } : {}}
                >
                  <span>📘 Lesson</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${assignType === 'lesson' ? 'text-teal-100' : 'text-gray-500'}`}>From Levels</span>
                </button>
                <button 
                  onClick={() => setAssignType('problem_set')} 
                  className={`px-4 py-3 border-[2.5px] border-gray-900 rounded-xl font-black text-sm shadow-[3px_3px_0_#1a1d29] flex flex-col items-center gap-1 transition-all ${assignType === 'problem_set' ? 'text-white' : 'bg-white'}`} 
                  style={assignType === 'problem_set' ? { background: '#00b395' } : {}}
                >
                  <span>🎯 Problem set</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${assignType === 'problem_set' ? 'text-teal-100' : 'text-gray-500'}`}>From Practice Pool</span>
                </button>
              </div>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Topic</span>
                <select value={assignLessonId} onChange={(e) => setAssignLessonId(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1 bg-white">
                  <option value="">Pick a topic…</option>
                  {(course?.units || []).map((u) => (
                    <optgroup key={u.id} label={`Unit ${u.number}: ${u.name}`}>
                      {u.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Title <span className="normal-case tracking-normal">(optional)</span></span>
                <input value={assignTitle} onChange={(e) => setAssignTitle(e.target.value)} placeholder={assignType === 'problem_set' ? 'e.g. Problem set 1' : 'Defaults to the topic title'} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1" />
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
                <button onClick={createAssignment} disabled={saving} className="px-6 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide text-sm shadow-[4px_4px_0_#1a1d29] disabled:opacity-50" style={{ background: '#00b395' }}>{saving ? 'Assigning…' : 'Assign'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center p-4 md:p-8 overflow-y-auto" style={{ background: 'rgba(26,29,41,0.55)' }} onClick={() => setSettingsOpen(false)}>
          <div className="w-full max-w-lg bg-white border-[3px] border-gray-900 rounded-2xl shadow-[8px_8px_0_#1a1d29] my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b-[3px] border-gray-900">
              <div>
                <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>// class settings</p>
                <h2 className="text-2xl font-black tracking-tight">Manage class</h2>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="w-9 h-9 border-2 border-gray-900 rounded-full bg-white flex items-center justify-center font-bold shadow-[2px_2px_0_#1a1d29]" aria-label="Close">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Class name</span>
                <input value={sName} onChange={(e) => setSName(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Class size <span className="normal-case tracking-normal">(max 50)</span></span>
                <input type="number" min="1" max="50" value={sCap} onChange={(e) => setSCap(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">End date <span className="normal-case tracking-normal">(optional — closes the class for students)</span></span>
                <input type="datetime-local" value={sEnd} onChange={(e) => setSEnd(e.target.value)} className="w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium mt-1" />
                {sEnd && <button onClick={() => setSEnd('')} className="text-xs font-bold text-gray-500 mt-1 underline">Clear end date</button>}
              </label>
              <div className="flex justify-end">
                <button onClick={saveSettings} className="px-6 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide text-sm shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>Save</button>
              </div>
              <div className="border-t-2 border-gray-200 pt-4">
                <p className="text-xs font-mono tracking-widest uppercase text-red-600 mb-2">// danger zone</p>
                <button onClick={deleteClass} className="w-full px-4 py-2.5 border-[2.5px] border-red-600 text-red-600 rounded-xl font-black uppercase tracking-wide text-sm shadow-[4px_4px_0_#ef4444] bg-white">Delete this class</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}