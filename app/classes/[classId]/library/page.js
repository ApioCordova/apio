'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import RichEditor from '@/app/admin/RichEditor'

// ---------------------------------------------------------------------------
// Teacher "My Library"  ·  /classes/[classId]/library
//
//   Tab "Lessons"  -> private lessons students can learn from.
//                     lessons(owner_id=me, course_id=this, unit_id=null)
//                       -> levels -> readings + questions(pool='lesson')
//                     Deliver to students by assigning the lesson (existing flow).
//
//   Tab "Question pool" -> reusable items only the teacher can see.
//                     questions(pool='private', lesson_id=null, owner_id=me)
//                     readings(lesson_id=null, owner_id=me)
//                     Surface in the custom-assignment bank (Phase 3).
//
// Privacy is enforced by RLS (owner_id = auth.uid()); the UI just stamps it.
// ---------------------------------------------------------------------------

const DIFF_OPTIONS = [
  { value: null, label: 'Not set', color: '#9ca3af' },
  { value: 'easy', label: 'Easy', color: '#22c55e' },
  { value: 'medium', label: 'Medium', color: '#eab308' },
  { value: 'difficult', label: 'Difficult', color: '#f97316' },
  { value: 'very_difficult', label: 'Very Difficult', color: '#ef4444' },
]

const toneOf = (c) => {
  const t = c?.tone
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t
  if (t === 'gov') return '#6b7280'
  if (t === 'calc') return '#ef4444'
  return '#00b395'
}

// ---- module-scope presentational helpers (stable identity across renders) --

function StatusDot({ status }) {
  const color =
    status === 'published' ? '#00b395' :
    status === 'archived' ? '#374151' :
    status === 'pending_review' ? '#3b82f6' : '#fde047'
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
}

function PublishToggle({ status, onPublish, onUnpublish }) {
  return status === 'published' ? (
    <button onClick={onUnpublish} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold bg-white">
      Unpublish
    </button>
  ) : (
    <button onClick={onPublish} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold text-white" style={{ background: '#00b395' }}>
      Publish
    </button>
  )
}

function ReorderControls({ isFirst, isLast, onUp, onDown }) {
  return (
    <div className="flex flex-col gap-1">
      <button onClick={onUp} disabled={isFirst} className="w-6 h-6 border-2 border-gray-900 rounded-md text-xs font-bold bg-white disabled:opacity-30">↑</button>
      <button onClick={onDown} disabled={isLast} className="w-6 h-6 border-2 border-gray-900 rounded-md text-xs font-bold bg-white disabled:opacity-30">↓</button>
    </div>
  )
}

// ===========================================================================

export default function LibraryPage() {
  const router = useRouter()
  const { classId } = useParams()

  const [me, setMe] = useState(null)
  const [klass, setKlass] = useState(null)
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [toast, setToast] = useState(null)
  const [tab, setTab] = useState('lessons') // 'lessons' | 'pool'

  // lessons tab
  const [lessons, setLessons] = useState([])
  const [selLessonId, setSelLessonId] = useState(null)
  const [levels, setLevels] = useState([])
  const [selLevelId, setSelLevelId] = useState(null)
  const [items, setItems] = useState([]) // questions + readings for selected lesson

  // pool tab
  const [poolItems, setPoolItems] = useState([])

  // editor modal
  const [editing, setEditing] = useState(null) // { _kind, ... }
  const [draft, setDraft] = useState(null)

  const [busy, setBusy] = useState(false)       // save / assign in-flight

  const cid = klass?.course_id

  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2200) }

  // ---- initial load -------------------------------------------------------
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setMe(user)

      const { data: classData } = await supabase
        .from('classes').select('*, course:courses(*)').eq('id', classId).single()
      if (!classData || classData.teacher_id !== user.id) { setDenied(true); setLoading(false); return }
      setKlass(classData)
      setCourse(classData.course)

      await Promise.all([
        loadLessons(user.id, classData.course_id),
        loadPool(user.id, classData.course_id),
      ])
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  async function loadLessons(uid = me?.id, courseId = cid) {
    if (!uid || !courseId) return
    const { data } = await supabase
      .from('lessons').select('*')
      .eq('owner_id', uid).eq('course_id', courseId)
      .order('sort_order')
    setLessons(data || [])
  }

  async function loadPool(uid = me?.id, courseId = cid) {
    if (!uid || !courseId) return
    const [{ data: qs }, { data: rs }] = await Promise.all([
      supabase.from('questions').select('*').eq('owner_id', uid).eq('course_id', courseId).is('lesson_id', null).order('sort_order'),
      supabase.from('readings').select('*').eq('owner_id', uid).eq('course_id', courseId).is('lesson_id', null).order('sort_order'),
    ])
    const combined = [
      ...(qs || []).map((q) => ({ ...q, _kind: 'question' })),
      ...(rs || []).map((r) => ({ ...r, _kind: 'reading' })),
    ].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    setPoolItems(combined)
  }

  async function loadLevels(lessonId) {
    const { data } = await supabase.from('levels').select('*').eq('lesson_id', lessonId).order('number')
    setLevels(data || [])
    setSelLevelId((prev) => prev && (data || []).some((l) => l.id === prev) ? prev : (data?.[0]?.id || null))
  }

  async function loadItems(lessonId) {
    const [{ data: qs }, { data: rs }] = await Promise.all([
      supabase.from('questions').select('*').eq('lesson_id', lessonId).order('sort_order'),
      supabase.from('readings').select('*').eq('lesson_id', lessonId).order('sort_order'),
    ])
    const combined = [
      ...(qs || []).map((q) => ({ ...q, _kind: 'question' })),
      ...(rs || []).map((r) => ({ ...r, _kind: 'reading' })),
    ].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    setItems(combined)
  }

  useEffect(() => {
    if (selLessonId) { loadLevels(selLessonId); loadItems(selLessonId) }
    else { setLevels([]); setItems([]); setSelLevelId(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selLessonId])

  // ---- lessons ------------------------------------------------------------
  async function addLesson() {
    const id = `plesson-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
    const sort_order = lessons.length + 1
    const { error } = await supabase.from('lessons').insert({
      id, unit_id: null, course_id: cid, owner_id: me.id,
      title: 'New private lesson', description: 'Click to edit.', icon: '★',
      sort_order, status: 'draft', max_levels: 0,
    })
    if (error) { flash('Failed: ' + error.message); return }
    await loadLessons(); setSelLessonId(id); flash('Lesson created')
  }

  async function updateLessonField(id, field, value) {
    await supabase.from('lessons').update({ [field]: value }).eq('id', id)
    setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  async function deleteLesson(l) {
    if (!confirm(`Delete "${l.title}" and all its levels & content? This cannot be undone.`)) return
    await supabase.from('lessons').delete().eq('id', l.id)
    if (selLessonId === l.id) setSelLessonId(null)
    await loadLessons(); flash('Lesson deleted')
  }

  // ---- levels -------------------------------------------------------------
  async function addLevel() {
    if (!selLessonId) return
    const num = levels.length + 1
    const { data, error } = await supabase.from('levels').insert({
      lesson_id: selLessonId, number: num, title: `Level ${num}`, sort_order: num, status: 'draft',
    }).select().single()
    if (error) { flash('Failed: ' + error.message); return }
    await supabase.from('lessons').update({ max_levels: num }).eq('id', selLessonId)
    await loadLevels(selLessonId); setSelLevelId(data.id); flash(`Level ${num} created`)
  }

  async function deleteLevel(lvl) {
    if (!confirm(`Delete Level ${lvl.number} and its content?`)) return
    await supabase.from('levels').delete().eq('id', lvl.id)
    const remaining = levels.filter((l) => l.id !== lvl.id)
    await supabase.from('lessons').update({ max_levels: remaining.length }).eq('id', selLessonId)
    if (selLevelId === lvl.id) setSelLevelId(remaining[0]?.id || null)
    await loadLevels(selLessonId); await loadItems(selLessonId); flash('Level deleted')
  }

  // ---- items (questions / readings) --------------------------------------
  async function addQuestion({ pool, lessonId = null, levelId = null }) {
    const sort_order = (pool === 'private' ? poolItems : items).length + 1
    const { data, error } = await supabase.from('questions').insert({
      lesson_id: lessonId, level_id: levelId, pool,
      owner_id: me.id, course_id: cid,
      stem: 'Enter your question here.',
      choices: ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: 0, explanation: 'Why this answer is correct.',
      difficulty: null, sort_order,
      status: pool === 'private' ? 'published' : 'draft',
    }).select().single()
    if (error) { flash('Failed: ' + error.message); return }
    if (pool === 'private') await loadPool(); else await loadItems(lessonId)
    openEditor({ ...data, _kind: 'question' })
  }

  async function addReading({ lessonId = null, levelId = null, isPool = false }) {
    const sort_order = (isPool ? poolItems : items).length + 1
    const { data, error } = await supabase.from('readings').insert({
      lesson_id: lessonId, level_id: levelId,
      owner_id: me.id, course_id: cid,
      title: 'New reading', content: '<p>Enter your content here.</p>',
      sort_order, status: isPool ? 'published' : 'draft',
    }).select().single()
    if (error) { flash('Failed: ' + error.message); return }
    if (isPool) await loadPool(); else await loadItems(lessonId)
    openEditor({ ...data, _kind: 'reading' })
  }

  async function setItemStatus(item, status, isPool = false) {
    const table = item._kind === 'question' ? 'questions' : 'readings'
    await supabase.from(table).update({ status }).eq('id', item.id)
    if (isPool) await loadPool(); else await loadItems(selLessonId)
  }

  async function setLevelStatus(lvl, status) {
    await supabase.from('levels').update({ status }).eq('id', lvl.id)
    await loadLevels(selLessonId)
  }

  async function deleteItem(item, isPool = false) {
    if (!confirm(`Delete this ${item._kind}?`)) return
    const table = item._kind === 'question' ? 'questions' : 'readings'
    await supabase.from(table).delete().eq('id', item.id)
    if (isPool) await loadPool(); else await loadItems(selLessonId)
    flash('Deleted')
  }

  // re-stamp sort_order sequentially within a group to avoid gaps
  async function reorder(list, idx, dir, isPool = false) {
    const j = dir === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= list.length) return
    const reordered = [...list]
    ;[reordered[idx], reordered[j]] = [reordered[j], reordered[idx]]
    await Promise.all(reordered.map((it, i) => {
      const table = it._kind === 'question' ? 'questions' : 'readings'
      return supabase.from(table).update({ sort_order: i + 1 }).eq('id', it.id)
    }))
    if (isPool) await loadPool(); else await loadItems(selLessonId)
  }

  // ---- editor modal -------------------------------------------------------
  function openEditor(item) { setEditing(item); setDraft(JSON.parse(JSON.stringify(item))) }
  function closeEditor() { setEditing(null); setDraft(null) }
  function tryClose() {
    if (JSON.stringify(editing) !== JSON.stringify(draft) && !confirm('Discard unsaved changes?')) return
    closeEditor()
  }
  async function saveEditor() {
    const isPool = !draft.lesson_id
    if (draft._kind === 'question') {
      const { error } = await supabase.from('questions').update({
        stem: draft.stem, choices: draft.choices, answer: draft.answer,
        explanation: draft.explanation, difficulty: draft.difficulty || null,
      }).eq('id', draft.id)
      if (error) { flash('Save failed: ' + error.message); return }
    } else {
      const { error } = await supabase.from('readings').update({
        title: draft.title, content: draft.content,
      }).eq('id', draft.id)
      if (error) { flash('Save failed: ' + error.message); return }
    }
    flash('Saved'); closeEditor()
    if (isPool) await loadPool(); else await loadItems(selLessonId)
  }

  // ---- publish + assign (whole-lesson, cascades to all children) ----------
  // One Save/Assign action publishes the lesson AND every level, question and
  // reading under it, so students actually see the content once it's assigned.
  async function publishAll(lessonId = selLessonId) {
    if (!lessonId || !me?.id) return false
    const results = await Promise.all([
      supabase.from('lessons').update({ status: 'published' }).eq('id', lessonId).eq('owner_id', me.id),
      supabase.from('levels').update({ status: 'published' }).eq('lesson_id', lessonId),
      supabase.from('questions').update({ status: 'published' }).eq('lesson_id', lessonId).eq('owner_id', me.id),
      supabase.from('readings').update({ status: 'published' }).eq('lesson_id', lessonId).eq('owner_id', me.id),
    ])
    const err = results.find((r) => r.error)?.error
    if (err) { flash('Publish failed: ' + err.message); return false }
    return true
  }

  async function saveAssignment() {
    if (!selLessonId) return
    setBusy(true)
    const ok = await publishAll()
    if (ok) {
      await loadLessons()
      await loadLevels(selLessonId)
      await loadItems(selLessonId)
      flash('Saved & published — questions are now visible to students')
    }
    setBusy(false)
  }

  async function assignToClass() {
    if (!selLessonId) return
    if (!confirm(`Assign "${selLesson?.title || 'this assignment'}" to this class? It will be published and pushed to students.`)) return
    setBusy(true)
    const ok = await publishAll()
    if (!ok) { setBusy(false); return }
    const { data: maxRow } = await supabase
      .from('class_assignments').select('sort_order')
      .eq('class_id', classId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const nextSort = (maxRow?.sort_order || 0) + 1
    const { error } = await supabase.from('class_assignments').insert({
      class_id: classId, type: 'lesson', lesson_id: selLessonId,
      title: selLesson?.title || 'Custom assignment', due_date: null,
      sort_order: nextSort, practice_set: null, allow_retry: false,
    })
    setBusy(false)
    if (error) { flash('Assign failed: ' + error.message); return }
    await loadLessons()
    flash('Assigned to this class')
  }

  // ---- derived ------------------------------------------------------------
  const selLesson = useMemo(() => lessons.find((l) => l.id === selLessonId) || null, [lessons, selLessonId])
  const selLevel = useMemo(() => levels.find((l) => l.id === selLevelId) || null, [levels, selLevelId])
  const levelItems = useMemo(
    () => items.filter((it) => it.level_id === selLevelId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [items, selLevelId]
  )

  // ---- shells -------------------------------------------------------------
  const tone = toneOf(course)
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
          <p className="text-gray-600 mb-6 max-w-md">Only the teacher who created this class can manage its library.</p>
          <Link href={`/classes/${classId}`} className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to class</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-gray-900 text-white rounded-full font-bold text-sm shadow-[4px_4px_0_#00b395]">{toast}</div>}
      {TopBar}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: tone }}>// my library · {course?.title}</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-1">My Library</h1>
        <p className="text-gray-700 text-sm mb-6">Private to you. Build your own lessons and a reusable question pool for <span className="font-bold">{course?.title}</span>.</p>

        {/* tabs */}
        <div className="flex gap-2 mb-6">
          {[['lessons', '📘 Lessons'], ['pool', '🗂 Question pool']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className="px-4 py-2 border-2 border-gray-900 rounded-xl text-sm font-bold shadow-[2px_2px_0_#1a1d29]"
              style={tab === k ? { background: '#1a1d29', color: '#fff' } : { background: '#fff' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ================= LESSONS TAB ================= */}
        {tab === 'lessons' && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            {/* lessons sidebar */}
            <div className="border-[2.5px] border-gray-900 rounded-2xl p-4 bg-white h-fit">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-mono tracking-widest uppercase text-gray-500">// my lessons</p>
                <button onClick={addLesson} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold text-white shadow-[2px_2px_0_#1a1d29]" style={{ background: tone }}>+ New</button>
              </div>
              {lessons.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No private lessons yet.</p>
              ) : (
                <div className="space-y-2">
                  {lessons.map((l) => (
                    <button key={l.id} onClick={() => setSelLessonId(l.id)}
                      className="w-full text-left px-3 py-2 border-2 border-gray-900 rounded-xl flex items-center gap-2"
                      style={selLessonId === l.id ? { background: `${tone}22` } : { background: '#fff' }}>
                      <span className="text-lg">{l.icon || '★'}</span>
                      <span className="flex-1 min-w-0 truncate font-bold text-sm">{l.title}</span>
                      <StatusDot status={l.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* lesson detail */}
            <div className="space-y-4">
              {!selLesson ? (
                <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-10 text-center">
                  <p className="text-gray-600 font-bold">Pick a lesson, or create a new one.</p>
                  <p className="text-sm text-gray-500 mt-1">Each lesson holds levels of readings and questions your students learn from once you assign it.</p>
                </div>
              ) : (
                <>
                  {/* lesson meta */}
                  <div className="border-[2.5px] border-gray-900 rounded-2xl p-4 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_90px] gap-3">
                      <label className="block">
                        <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Lesson title</span>
                        <input defaultValue={selLesson.title} onBlur={(e) => updateLessonField(selLesson.id, 'title', e.target.value)}
                          className="w-full border-2 border-gray-900 rounded-lg px-3 py-2 font-bold mt-1" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Icon</span>
                        <input defaultValue={selLesson.icon} maxLength={3} onBlur={(e) => updateLessonField(selLesson.id, 'icon', e.target.value)}
                          className="w-full border-2 border-gray-900 rounded-lg px-3 py-2 text-center mt-1" />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Description</span>
                        <input defaultValue={selLesson.description} onBlur={(e) => updateLessonField(selLesson.id, 'description', e.target.value)}
                          className="w-full border-2 border-gray-900 rounded-lg px-3 py-2 mt-1" />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
                      <span className="text-xs text-gray-500 flex items-center gap-2"><StatusDot status={selLesson.status} /> {selLesson.status}</span>
                      <div className="flex gap-2">
                        <PublishToggle status={selLesson.status}
                          onPublish={() => updateLessonField(selLesson.id, 'status', 'published')}
                          onUnpublish={() => updateLessonField(selLesson.id, 'status', 'draft')} />
                        <button onClick={() => deleteLesson(selLesson)} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold text-red-600 bg-white">Delete lesson</button>
                      </div><div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
                      <span className="text-xs text-gray-500 flex items-center gap-2">
                        <StatusDot status={selLesson.status} />
                        {selLesson.status === 'published' ? 'Published — visible to assigned students' : 'Draft — not visible to students yet'}
                      </span>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={saveAssignment} disabled={busy}
                          className="px-4 py-2 border-2 border-gray-900 rounded-lg text-xs font-black uppercase tracking-wide bg-white shadow-[2px_2px_0_#1a1d29] disabled:opacity-50">
                          {busy ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={assignToClass} disabled={busy}
                          className="px-4 py-2 border-2 border-gray-900 rounded-lg text-xs font-black uppercase tracking-wide text-white shadow-[2px_2px_0_#1a1d29] disabled:opacity-50"
                          style={{ background: tone }}>
                          {busy ? '…' : 'Assign'}
                        </button>
                        <button onClick={() => deleteLesson(selLesson)} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold text-red-600 bg-white">Delete lesson</button>
                      </div>
                    </div>
                    </div>
                  </div>

                  {/* levels */}
                  <div className="border-[2.5px] border-gray-900 rounded-2xl p-4 bg-white">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <p className="text-xs font-mono tracking-widest uppercase text-gray-500">// levels</p>
                      <button onClick={addLevel} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29] bg-white">+ Level</button>
                    </div>
                    {levels.length === 0 ? (
                      <p className="text-sm text-gray-500">No levels yet. Add one to start adding content.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {levels.map((lvl) => (
                          <button key={lvl.id} onClick={() => setSelLevelId(lvl.id)}
                            className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold flex items-center gap-2"
                            style={selLevelId === lvl.id ? { background: '#1a1d29', color: '#fff' } : { background: '#fff' }}>
                            {lvl.title || `Level ${lvl.number}`} <StatusDot status={lvl.status} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* level content */}
                  {selLevel && (
                    <div className="border-[2.5px] border-gray-900 rounded-2xl p-4 bg-white">
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black tracking-tight">{selLevel.title || `Level ${selLevel.number}`}</h3>
                          <StatusDot status={selLevel.status} />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => addReading({ lessonId: selLessonId, levelId: selLevelId })} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29] bg-white">+ Reading</button>
                          <button onClick={() => addQuestion({ pool: 'lesson', lessonId: selLessonId, levelId: selLevelId })} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold text-white shadow-[2px_2px_0_#1a1d29]" style={{ background: tone }}>+ Question</button>
                          {levels.length > 1 && <button onClick={() => deleteLevel(selLevel)} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold text-red-600 bg-white">Delete level</button>}
                        </div>
                      </div>

                      {levelItems.length === 0 ? (
                        <p className="text-sm text-gray-500 py-4 text-center border-2 border-dashed border-gray-300 rounded-xl">No content in this level yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {levelItems.map((it, i) => (
                            <div key={`${it._kind}-${it.id}`} className="border-2 border-gray-900 rounded-xl p-3 bg-white flex gap-3">
                              <ReorderControls isFirst={i === 0} isLast={i === levelItems.length - 1}
                                onUp={() => reorder(levelItems, i, 'up')} onDown={() => reorder(levelItems, i, 'down')} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-[10px] font-mono uppercase tracking-widest font-bold" style={{ color: tone }}>
                                    {it._kind === 'question' ? '📝 Question' : '📖 Reading'}
                                  </span>
                                  <StatusDot status={it.status} />
                                </div>
                                <p className="text-sm font-medium truncate">{it._kind === 'question' ? it.stem : it.title}</p>
                              </div>
                              <div className="flex flex-col gap-1 shrink-0">
                                <button onClick={() => openEditor(it)} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold bg-white">Edit</button>
                                <button onClick={() => deleteItem(it)} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold text-red-600 bg-white">Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ================= POOL TAB ================= */}
        {tab === 'pool' && (
          <div className="border-[2.5px] border-gray-900 rounded-2xl p-4 bg-white">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <p className="text-xs font-mono tracking-widest uppercase text-gray-500">// reusable pool · only you can see these</p>
                <p className="text-sm text-gray-600 mt-0.5">Drop these into custom assignments later. Not shown to students until you do.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => addReading({ isPool: true })} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29] bg-white">+ Reading</button>
                <button onClick={() => addQuestion({ pool: 'private' })} className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-xs font-bold text-white shadow-[2px_2px_0_#1a1d29]" style={{ background: '#8b5cf6' }}>+ Question</button>
              </div>
            </div>

            {poolItems.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center border-2 border-dashed border-gray-300 rounded-xl">Your pool is empty. Add a question or reading to start your personal bank.</p>
            ) : (
              <div className="space-y-2">
                {poolItems.map((it, i) => (
                  <div key={`${it._kind}-${it.id}`} className="border-2 border-gray-900 rounded-xl p-3 bg-white flex gap-3">
                    <ReorderControls isFirst={i === 0} isLast={i === poolItems.length - 1}
                      onUp={() => reorder(poolItems, i, 'up', true)} onDown={() => reorder(poolItems, i, 'down', true)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900 text-white" style={{ background: '#8b5cf6' }}>MINE</span>
                        <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-gray-600">{it._kind === 'question' ? 'Question' : 'Reading'}</span>
                      </div>
                      <p className="text-sm font-medium truncate">{it._kind === 'question' ? it.stem : it.title}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => openEditor(it)} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold bg-white">Edit</button>
                      <button onClick={() => deleteItem(it, true)} className="px-2.5 py-1 border-2 border-gray-900 rounded-lg text-[11px] font-bold text-red-600 bg-white">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= EDITOR MODAL ================= */}
      {editing && draft && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center p-3 md:p-6 overflow-y-auto" style={{ background: 'rgba(26,29,41,0.6)' }} onClick={tryClose}>
          <div className="w-full max-w-3xl bg-white border-[3px] border-gray-900 rounded-2xl shadow-[8px_8px_0_#1a1d29] my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b-[3px] border-gray-900">
              <h2 className="text-lg font-black tracking-tight">Edit {draft._kind}</h2>
              <button onClick={tryClose} className="w-8 h-8 border-2 border-gray-900 rounded-full bg-white font-bold shadow-[2px_2px_0_#1a1d29]">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {draft._kind === 'question' ? (
                <>
                  <div>
                    <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Question</span>
                    <div className="mt-1"><RichEditor value={draft.stem || ''} onChange={(html) => setDraft({ ...draft, stem: html })} /></div>
                  </div>

                  <div>
                    <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Choices (pick the correct one)</span>
                    <div className="space-y-2 mt-1">
                      {draft.choices.map((c, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input type="radio" checked={draft.answer === idx} onChange={() => setDraft({ ...draft, answer: idx })} className="w-4 h-4 accent-gray-900" />
                          <input value={c} onChange={(e) => setDraft({ ...draft, choices: draft.choices.map((x, i) => (i === idx ? e.target.value : x)) })}
                            className="flex-1 border-2 border-gray-900 rounded-lg px-3 py-1.5" />
                          {draft.choices.length > 2 && (
                            <button onClick={() => setDraft({ ...draft, choices: draft.choices.filter((_, i) => i !== idx), answer: draft.answer >= idx && draft.answer > 0 ? draft.answer - 1 : draft.answer })}
                              className="px-2 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold text-red-600">✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                    {draft.choices.length < 6 && (
                      <button onClick={() => setDraft({ ...draft, choices: [...draft.choices, `Option ${String.fromCharCode(65 + draft.choices.length)}`] })}
                        className="mt-2 px-3 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white">+ Add choice</button>
                    )}
                  </div>

                  <label className="block">
                    <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Difficulty</span>
                    <select value={draft.difficulty ?? ''} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value || null })}
                      className="w-full border-2 border-gray-900 rounded-lg px-3 py-2 mt-1 font-bold bg-white">
                      {DIFF_OPTIONS.map((d) => <option key={d.label} value={d.value ?? ''}>{d.label}</option>)}
                    </select>
                  </label>

                  <div>
                    <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Explanation</span>
                    <div className="mt-1"><RichEditor value={draft.explanation} onChange={(html) => setDraft({ ...draft, explanation: html })} /></div>
                  </div>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Reading title</span>
                    <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full border-2 border-gray-900 rounded-lg px-3 py-2 mt-1 font-bold" />
                  </label>
                  <div>
                    <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Content</span>
                    <div className="mt-1"><RichEditor value={draft.content} onChange={(html) => setDraft({ ...draft, content: html })} /></div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t-[3px] border-gray-900">
              <button onClick={tryClose} className="px-4 py-2 border-2 border-gray-900 rounded-xl font-bold text-sm bg-white">Cancel</button>
              <button onClick={saveEditor} className="px-5 py-2 border-2 border-gray-900 rounded-xl font-bold text-sm text-white shadow-[3px_3px_0_#1a1d29]" style={{ background: '#00b395' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}