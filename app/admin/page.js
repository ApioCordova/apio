'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import RichEditor from './RichEditor'

export default function AdminContentPage() {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [courseMenuOpen, setCourseMenuOpen] = useState(false)
  const [selectedLessonId, setSelectedLessonId] = useState(null)
  const [levels, setLevels] = useState([])
  const [selectedLevelId, setSelectedLevelId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [contentView, setContentView] = useState('lesson') // 'lesson' (= current level) | 'practice' | 'all'
  const [currentUser, setCurrentUser] = useState(null)
  const [currentRole, setCurrentRole] = useState(null)

  const [editingItem, setEditingItem] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [selectedItemIds, setSelectedItemIds] = useState(new Set())
  const [bulkSetName, setBulkSetName] = useState('')

  const canPublishDirectly = currentRole === 'admin' || currentRole === 'editor'
  const isReviewer = currentRole === 'reviewer'
  const isQuestionMaker = currentRole === 'question_maker'

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUser(user)
        const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single()
        setCurrentRole(profile?.role)
      }
      await loadCourses()
    }
    init()
  }, [])

  useEffect(() => {
    if (selectedLessonId) {
      loadLevels(selectedLessonId)
      loadItems(selectedLessonId)
    } else {
      setLevels([])
      setItems([])
      setSelectedLevelId(null)
    }
  }, [selectedLessonId])

  async function loadCourses() {
    setLoading(true)
    const { data } = await supabase.from('courses').select(`*, units (*, lessons (*))`).order('sort_order')
    const sorted = (data || []).map((c) => ({
      ...c,
      units: (c.units || []).sort((a, b) => a.sort_order - b.sort_order).map((u) => ({
        ...u, lessons: (u.lessons || []).sort((a, b) => a.sort_order - b.sort_order),
      })),
    }))
    setCourses(sorted)
    if (!selectedCourseId && sorted[0]) setSelectedCourseId(sorted[0].id)
    setLoading(false)
  }

  async function loadLevels(lessonId) {
    const { data } = await supabase.from('levels').select('*').eq('lesson_id', lessonId).order('number')
    setLevels(data || [])
    // Auto-select first level if none selected
    if (data && data.length > 0 && !selectedLevelId) {
      setSelectedLevelId(data[0].id)
    }
  }

  async function loadItems(lessonId) {
    const [{ data: qData }, { data: rData }] = await Promise.all([
      supabase.from('questions').select('*').eq('lesson_id', lessonId).order('sort_order'),
      supabase.from('readings').select('*').eq('lesson_id', lessonId).order('sort_order'),
    ])
    const combined = [
      ...(qData || []).map(q => ({ ...q, _kind: 'question' })),
      ...(rData || []).map(r => ({ ...r, _kind: 'reading' })),
    ].sort((a, b) => a.sort_order - b.sort_order)
    setItems(combined)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200) }

  // ============ MODAL HELPERS ============
  function openEditor(item) { setEditingItem(item); setEditDraft(JSON.parse(JSON.stringify(item))) }
  function closeEditor() { setEditingItem(null); setEditDraft(null) }
  function tryCloseEditor() {
    if (JSON.stringify(editingItem) !== JSON.stringify(editDraft)) {
      if (!confirm('You have unsaved changes. Discard them?')) return
    }
    closeEditor()
  }

  async function saveAndCloseQuestion() {
    const ce = (editDraft.choices || []).map((_, i) => (editDraft.choice_explanations || [])[i] || '')
    const { error } = await supabase.from('questions').update({
      stem: editDraft.stem, choices: editDraft.choices, choice_explanations: ce, answer: editDraft.answer, explanation: editDraft.explanation, difficulty: editDraft.difficulty || null, in_problem_set: !!editDraft.in_problem_set,
    }).eq('id', editDraft.id)
    if (error) { showToast('Save failed: ' + error.message); return }
    showToast('✓ Question saved'); closeEditor(); await loadItems(selectedLessonId)
  }

  async function saveAndCloseReading() {
    const { error } = await supabase.from('readings').update({
      title: editDraft.title, content: editDraft.content,
    }).eq('id', editDraft.id)
    if (error) { showToast('Save failed: ' + error.message); return }
    showToast('✓ Reading saved'); closeEditor(); await loadItems(selectedLessonId)
  }

  // ============ STATUS ============
  async function setStatus(table, id, status) {
    if (status === 'published' && (isQuestionMaker || isReviewer)) {
      showToast('Use "Send for approval" instead.'); return
    }
    await supabase.from(table).update({ status }).eq('id', id)
    showToast(status === 'published' ? '✓ Published' : 'Set to ' + status.replace('_', ' '))
    if (table === 'questions' || table === 'readings') await loadItems(selectedLessonId)
    else if (table === 'levels') await loadLevels(selectedLessonId)
    else await loadCourses()
  }

  async function sendForApproval(table, id) {
    await supabase.from(table).update({ status: 'pending_review' }).eq('id', id)
    showToast('📤 Sent for approval')
    if (table === 'questions' || table === 'readings') await loadItems(selectedLessonId)
    else if (table === 'levels') await loadLevels(selectedLessonId)
    else await loadCourses()
  }
  async function approveContent(table, id) {
    if (table === 'questions' || table === 'readings') {
      const item = items.find((i) => i.id === id)
      if (isReviewer && item && item.created_by === currentUser?.id) {
        showToast('You cannot approve your own content. An admin must review it.')
        return
      }
    }
    const { error } = await supabase.from(table).update({ status: 'published' }).eq('id', id)
    if (error) { showToast(error.message || 'Could not approve'); return }
    showToast('✓ Approved & published')
    if (table === 'questions' || table === 'readings') await loadItems(selectedLessonId)
    else if (table === 'levels') await loadLevels(selectedLessonId)
    else await loadCourses()
  }
  async function denyContent(table, id) {
    if (!confirm('Send back to draft?')) return
    await supabase.from(table).update({ status: 'draft' }).eq('id', id)
    showToast('Sent back to draft')
    if (table === 'questions' || table === 'readings') await loadItems(selectedLessonId)
    else if (table === 'levels') await loadLevels(selectedLessonId)
    else await loadCourses()
  }

  // ============ COURSE ============
  async function updateCourseField(courseId, field, value) {
    await supabase.from('courses').update({ [field]: value }).eq('id', courseId)
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, [field]: value } : c)))
  }
  async function persistCourseOrder(ordered) {
    setCourses(ordered) // optimistic — UI updates instantly
    await Promise.all(
      ordered.map((c, i) =>
        supabase.from('courses').update({ sort_order: i + 1 }).eq('id', c.id)
      )
    )
    await loadCourses()
  }
  function handleCourseDragStart(e, index) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleCourseDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== dragOverIndex) setDragOverIndex(index)
  }
  function handleCourseDrop(e, index) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) { setDragIndex(null); setDragOverIndex(null); return }
    const reordered = [...courses]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(index, 0, moved)
    setDragIndex(null)
    setDragOverIndex(null)
    persistCourseOrder(reordered)
  }
  function handleCourseDragEnd() {
    setDragIndex(null)
    setDragOverIndex(null)
  }
  async function addCourse() {
    const id = `course-${Date.now()}`
    const { error } = await supabase.from('courses').insert({ id, title: 'New AP Course', short_title: 'New', description: 'Click to edit.', icon: '★', tone: 'default', sort_order: courses.length + 1, status: 'draft', created_by: currentUser?.id })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft course created'); await loadCourses(); setSelectedCourseId(id)
  }
  async function deleteCourse(courseId, courseTitle) {
    if (!confirm(`Delete "${courseTitle}" and ALL content?\n\nThis cannot be undone.`)) return
    if (prompt(`Type the course title to confirm:\n\n${courseTitle}`) !== courseTitle) { showToast('Not deleted'); return }
    await supabase.from('courses').delete().eq('id', courseId)
    showToast('Course deleted'); setSelectedLessonId(null); setSelectedCourseId(null); await loadCourses()
  }
  async function moveCourse(course, direction) {
  const idx = courses.findIndex(c => c.id === course.id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= courses.length) return
  // Reorder locally, then re-stamp ALL courses 1..n so the order is always clean
  const reordered = [...courses]
  ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
  await Promise.all(
    reordered.map((c, i) =>
      supabase.from('courses').update({ sort_order: i + 1 }).eq('id', c.id)
    )
  )
  await loadCourses()
  }

  // ============ UNIT ============
  async function addUnit(courseId) {
    const course = courses.find(c => c.id === courseId)
    const number = (course?.units.length || 0) + 1
    const id = `unit-${Date.now()}`
    const { error } = await supabase.from('units').insert({ id, course_id: courseId, name: `New Unit ${number}`, number, sort_order: number, status: 'draft', created_by: currentUser?.id })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft unit created'); await loadCourses()
  }
  async function updateUnitField(unitId, field, value) {
    await supabase.from('units').update({ [field]: value }).eq('id', unitId)
    setCourses(cs => cs.map(c => ({ ...c, units: c.units.map(u => u.id === unitId ? { ...u, [field]: value } : u) })))
  }
  async function deleteUnit(unitId, unitName, lessonCount) {
    if (!confirm(`Delete unit "${unitName}" and all ${lessonCount} lessons?\n\nThis cannot be undone.`)) return
    await supabase.from('units').delete().eq('id', unitId)
    showToast('Unit deleted'); setSelectedLessonId(null); await loadCourses()
  }

  // ============ LESSON ============
  async function updateLessonField(lessonId, field, value) {
    await supabase.from('lessons').update({ [field]: value }).eq('id', lessonId)
    setCourses(cs => cs.map(c => ({ ...c, units: c.units.map(u => ({ ...u, lessons: u.lessons.map(l => l.id === lessonId ? { ...l, [field]: value } : l) })) })))
  }
  async function addLesson(unitId) {
    const id = `lesson-${Date.now()}`
    const unit = courses.flatMap(c => c.units).find(u => u.id === unitId)
    const sortOrder = (unit?.lessons.length || 0) + 1
    const { error } = await supabase.from('lessons').insert({ id, unit_id: unitId, title: 'New Lesson', description: 'Click to edit.', icon: '★', sort_order: sortOrder, status: 'draft', created_by: currentUser?.id })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft lesson created'); await loadCourses(); setSelectedLessonId(id)
  }
  async function deleteLesson(lessonId, lessonTitle) {
    if (!confirm(`Delete lesson "${lessonTitle}" and all content?\n\nThis cannot be undone.`)) return
    await supabase.from('lessons').delete().eq('id', lessonId)
    showToast('Lesson deleted'); setSelectedLessonId(null); await loadCourses()
  }

  // ============ LEVELS ============
  async function addLevel() {
    if (!selectedLessonId) return
    const nextNum = levels.length + 1
    const { data, error } = await supabase.from('levels').insert({
      lesson_id: selectedLessonId, number: nextNum, title: `Level ${nextNum}`, sort_order: nextNum, status: 'draft', created_by: currentUser?.id,
    }).select().single()
    if (error) { showToast('Failed: ' + error.message); return }
    // Update max_levels on the lesson
    await supabase.from('lessons').update({ max_levels: nextNum }).eq('id', selectedLessonId)
    showToast(`Level ${nextNum} created`); await loadLevels(selectedLessonId); setSelectedLevelId(data.id)
  }

  async function deleteLevel(levelId, levelNumber) {
    if (!confirm(`Delete Level ${levelNumber} and all its content?\n\nThis cannot be undone.`)) return
    await supabase.from('levels').delete().eq('id', levelId)
    const remaining = levels.filter(l => l.id !== levelId)
    await supabase.from('lessons').update({ max_levels: remaining.length }).eq('id', selectedLessonId)
    showToast('Level deleted')
    setSelectedLevelId(remaining[0]?.id || null)
    await loadLevels(selectedLessonId); await loadItems(selectedLessonId)
  }

  // ============ ITEMS ============
  async function addQuestion(pool = 'lesson') {
    if (!selectedLessonId) return
    const levelId = pool === 'lesson' ? selectedLevelId : null
    if (pool === 'lesson' && !levelId) { showToast('Select a level first'); return }
    const sortOrder = items.length + 1
    const { data, error } = await supabase.from('questions').insert({
      lesson_id: selectedLessonId, stem: '',
      choices: ['', '', '', ''],
      choice_explanations: ['', '', '', ''],
      answer: 0, explanation: '',
      sort_order: sortOrder, status: 'draft', pool, created_by: currentUser?.id,
      level_id: levelId, difficulty: null,
    }).select().single()
    if (error) { showToast('Failed: ' + error.message); return }
    showToast(`Draft ${pool} question created`); await loadItems(selectedLessonId)
    openEditor({ ...data, _kind: 'question' })
  }

  async function addReading() {
    if (!selectedLessonId || !selectedLevelId) { showToast('Select a level first'); return }
    const sortOrder = items.length + 1
    const { data, error } = await supabase.from('readings').insert({
      lesson_id: selectedLessonId, title: 'New reading', content: '',
      sort_order: sortOrder, status: 'draft', created_by: currentUser?.id,
      level_id: selectedLevelId,
    }).select().single()
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft reading created'); await loadItems(selectedLessonId)
    openEditor({ ...data, _kind: 'reading' })
  }

  function toggleSelection(id) {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applySetToSelected() {
    if (selectedItemIds.size === 0) { showToast('Select some questions first.'); return }
    if (!bulkSetName.trim()) { showToast('Enter a set name.'); return }
    
    const ids = Array.from(selectedItemIds)
    const { error } = await supabase.from('questions').update({ practice_set: bulkSetName.trim() }).in('id', ids)
    
    if (error) { showToast('Failed to apply set: ' + error.message); return }
    showToast(`✓ Set "${bulkSetName}" applied to ${ids.length} questions`)
    setSelectedItemIds(new Set())
    setBulkSetName('')
    await loadItems(selectedLessonId)
  }

  async function setQuestionPool(questionId, newPool) {
    if (newPool === 'lesson' && !selectedLevelId) { showToast('Select a level first to move into a lesson'); return }
    // only lesson questions live inside a level; practice & problem_set are level-less
    const update = { pool: newPool, level_id: newPool === 'lesson' ? selectedLevelId : null }
    const { error } = await supabase.from('questions').update(update).eq('id', questionId)
    if (error) { showToast('Failed: ' + error.message); return }
    const label = newPool === 'problem_set' ? 'problem set' : newPool
    showToast(`Moved to ${label} pool`); await loadItems(selectedLessonId)
  }

  async function deleteItem(item) {
    if (!confirm(`Delete this ${item._kind}? This cannot be undone.`)) return
    const table = item._kind === 'question' ? 'questions' : 'readings'
    await supabase.from(table).delete().eq('id', item.id)
    showToast('Deleted'); await loadItems(selectedLessonId)
  }

  async function moveItem(item, direction) {
    const idx = items.findIndex(i => i.id === item.id && i._kind === item._kind)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return
    const other = items[swapIdx]
    const aTable = item._kind === 'question' ? 'questions' : 'readings'
    const bTable = other._kind === 'question' ? 'questions' : 'readings'
    await Promise.all([
      supabase.from(aTable).update({ sort_order: other.sort_order }).eq('id', item.id),
      supabase.from(bTable).update({ sort_order: item.sort_order }).eq('id', other.id),
    ])
    await loadItems(selectedLessonId)
  }

  // ============ RENDER ============
  if (loading) return <p className="text-gray-600 font-mono text-sm">Loading content...</p>

  const selectedCourse = courses.find(c => c.id === selectedCourseId)
  const selectedLesson = selectedCourse?.units.flatMap(u => u.lessons.map(l => ({ ...l, unit: u }))).find(l => l.id === selectedLessonId)
  const selectedLevel = levels.find(l => l.id === selectedLevelId)

  // Filter items based on view
  let viewFilteredItems = items
  if (contentView === 'lesson' && selectedLevelId) {
    viewFilteredItems = items.filter(i => i.level_id === selectedLevelId && (i._kind === 'reading' || (i._kind === 'question' && i.pool === 'lesson')))
  } else if (contentView === 'practice') {
    viewFilteredItems = items.filter(i => i._kind === 'question' && i.pool === 'practice')
  }
  else if (contentView === 'problem_set') {
    viewFilteredItems = items.filter(i => i._kind === 'question' && i.pool === 'problem_set')
  }

  const filteredItems = statusFilter === 'all' ? viewFilteredItems : viewFilteredItems.filter(i => i.status === statusFilter)

  const currentLevelItems = selectedLevelId ? items.filter(i => i.level_id === selectedLevelId) : []
  const levelQuestionCount = currentLevelItems.filter(i => i._kind === 'question' && i.pool === 'lesson').length
  const levelReadingCount = currentLevelItems.filter(i => i._kind === 'reading').length
  const practiceQuestionCount = items.filter(i => i._kind === 'question' && i.pool === 'practice').length
  const problemSetQuestionCount = items.filter(i => i._kind === 'question' && i.pool === 'problem_set').length

  return (
    <>
      {/* ============ FULL-PAGE EDITING MODAL ============ */}
      {editDraft && (
        <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#f6fbf8' }}>
          <div className="border-b-[3px] border-gray-900 px-6 py-3 flex items-center justify-between flex-shrink-0" style={{ background: editDraft._kind === 'question' ? '#d1f5ed' : '#dbeafe' }}>
            <div className="flex items-center gap-3">
              <span className="text-lg">{editDraft._kind === 'question' ? '📝' : '📖'}</span>
              <h2 className="text-lg font-black tracking-tight">{editDraft._kind === 'question' ? 'Edit Question' : 'Edit Reading'}</h2>
              {editDraft._kind === 'question' && editDraft.pool && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900" style={{ background: editDraft.pool === 'practice' ? '#fbbf24' : '#00b395', color: editDraft.pool === 'practice' ? '#1a1d29' : 'white' }}>{editDraft.pool.toUpperCase()}</span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={tryCloseEditor} className="px-4 py-2 bg-white border-2 border-gray-900 rounded-lg font-bold text-sm shadow-[3px_3px_0_#1a1d29]">Cancel</button>
              <button onClick={editDraft._kind === 'question' ? saveAndCloseQuestion : saveAndCloseReading} className="px-5 py-2 text-white border-2 border-gray-900 rounded-lg font-bold text-sm shadow-[3px_3px_0_#1a1d29]" style={{ background: '#00b395' }}>✓ Save & close</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-8">
              {editDraft._kind === 'question' ? (
                <>
                  <Field label="Question stem">
                    <RichEditor placeholder="Enter your question here…" value={editDraft.stem || ''} onChange={(html) => setEditDraft({ ...editDraft, stem: html })} />
                  </Field>
                  <div className="mt-6">
                    <p className="text-xs font-mono uppercase tracking-widest text-gray-700 font-bold mb-3">Answer choices — click to mark correct</p>
                    {editDraft.choices.map((choice, i) => (
  <div key={i} className="mb-3">
    <div className="flex gap-3 items-center">
      <input type="radio" name="correct-modal" checked={editDraft.answer === i} onChange={() => setEditDraft({ ...editDraft, answer: i })} className="w-6 h-6 cursor-pointer flex-shrink-0" style={{ accentColor: '#00b395' }} />
      <span className="w-9 h-9 border-2 border-gray-900 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0" style={editDraft.answer === i ? { background: '#00b395', color: 'white' } : { background: 'white' }}>{String.fromCharCode(65 + i)}</span>
      <input type="text" placeholder={`Option ${String.fromCharCode(65 + i)}`} value={choice} onChange={(e) => { const c = [...editDraft.choices]; c[i] = e.target.value; setEditDraft({ ...editDraft, choices: c }) }} className="flex-1 p-3 border-2 border-gray-900 rounded-lg bg-white text-base" />
      <button type="button" onClick={() => { if (editDraft.choices.length <= 2) { alert('Minimum 2 choices.'); return }; const nc = editDraft.choices.filter((_, idx) => idx !== i); const nce = (editDraft.choice_explanations || []).filter((_, idx) => idx !== i); let na = editDraft.answer; if (na === i) na = 0; else if (na > i) na--; setEditDraft({ ...editDraft, choices: nc, choice_explanations: nce, answer: na }) }} className="px-3 py-2 text-red-600 hover:bg-red-100 rounded-lg" disabled={editDraft.choices.length <= 2}>🗑</button>
    </div>
    <div className="mt-2">
      <span className="text-[11px] font-mono tracking-widest uppercase text-gray-500">
        Why choice {String.fromCharCode(65 + i)} is {editDraft.answer === i ? 'correct' : 'wrong'} (optional)
      </span>
      <div className="mt-1">
        <RichEditor
          collapsible
          collapsedHeight={44}
          value={(editDraft.choice_explanations || [])[i] || ''}
          onChange={(html) => { const ce = editDraft.choices.map((_, idx) => (editDraft.choice_explanations || [])[idx] || ''); ce[i] = html; setEditDraft({ ...editDraft, choice_explanations: ce }) }}
        />
      </div>
    </div>
  </div>
))}
                    {editDraft.choices.length < 8 && (
                      <button type="button" onClick={() => setEditDraft({ ...editDraft, choices: [...editDraft.choices, ''], choice_explanations: [...(editDraft.choice_explanations || []), ''] })} className="mt-2 px-4 py-2 bg-white border-2 border-dashed border-gray-400 rounded-lg text-sm font-bold">+ Add choice</button>
                    )}
                  </div>
                  {editDraft.pool === 'practice' && (
                    <div className="mt-6">
                      <Field label="Prebuilt problem set">
                        <button
                          type="button"
                          onClick={() => setEditDraft({ ...editDraft, in_problem_set: !editDraft.in_problem_set })}
                          className="flex items-center gap-3 w-full text-left px-4 py-3 border-2 border-gray-900 rounded-xl bg-white shadow-[3px_3px_0_#1a1d29]"
                        >
                          <span className="w-11 h-6 rounded-full border-2 border-gray-900 flex-shrink-0 relative" style={{ background: editDraft.in_problem_set ? '#8b5cf6' : '#e5e7eb' }}>
                            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white border border-gray-900 transition-all" style={{ left: editDraft.in_problem_set ? '22px' : '2px' }} />
                          </span>
                          <span className="text-sm font-bold">
                            {editDraft.in_problem_set
                              ? 'Included in this lesson’s prebuilt problem set'
                              : 'Practice pool only — tap to add to the prebuilt problem set'}
                          </span>
                        </button>
                        <p className="text-[11px] text-gray-500 mt-1.5">
                          Flagged questions stay in the practice pool and also appear in the lesson’s prebuilt problem set that teachers can assign.
                        </p>
                      </Field>
                    </div>
                  )}
                  <div className="mt-6">
                    <Field label="Difficulty">
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { value: null, label: 'Not set', color: '#9ca3af' },
                          { value: 'easy', label: 'Easy', color: '#22c55e' },
                          { value: 'medium', label: 'Medium', color: '#eab308' },
                          { value: 'difficult', label: 'Difficult', color: '#f97316' },
                          { value: 'very_difficult', label: 'Very Difficult', color: '#ef4444' },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => setEditDraft({ ...editDraft, difficulty: opt.value })}
                            className={`px-4 py-2 border-2 rounded-xl text-sm font-bold transition-all ${
                              editDraft.difficulty === opt.value
                                ? 'border-gray-900 shadow-[3px_3px_0_#1a1d29] text-white'
                                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'
                            }`}
                            style={editDraft.difficulty === opt.value ? { background: opt.color } : {}}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Reading title">
                    <input value={editDraft.title || ''} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} className="w-full p-3 border-2 border-gray-900 rounded-lg bg-white text-lg font-bold" autoFocus />
                  </Field>
                  <div className="mt-6">
                    <p className="block text-xs font-mono tracking-widest uppercase text-gray-700 font-bold mb-2">Content</p>
                    <RichEditor placeholder="Write the reading content here…" value={editDraft.content || ''} onChange={(html) => setEditDraft({ ...editDraft, content: html })} />
                    <p className="text-xs text-gray-500 mt-2">💡 For images, paste a URL. For videos, paste a YouTube URL.</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border-t-[3px] border-gray-900 px-6 py-3 flex justify-between items-center flex-shrink-0 bg-white">
            <p className="text-xs text-gray-500 font-mono">Press Escape to cancel</p>
            <div className="flex gap-2">
              <button onClick={tryCloseEditor} className="px-4 py-2 bg-white border-2 border-gray-900 rounded-lg font-bold text-sm shadow-[2px_2px_0_#1a1d29]">Cancel</button>
              <button onClick={editDraft._kind === 'question' ? saveAndCloseQuestion : saveAndCloseReading} className="px-5 py-2 text-white border-2 border-gray-900 rounded-lg font-bold text-sm shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395' }}>✓ Save & close</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MAIN PAGE ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 -m-2">
        {/* Sidebar */}
        <aside className="border-2 border-gray-900 rounded-xl p-3 max-h-[80vh] overflow-y-auto" style={{ background: '#f6fbf8' }}>
          <p className="text-xs font-mono tracking-widest text-gray-600 uppercase px-2 mb-2">Courses</p>

          {/* Course selector pill */}
          <div className="relative mb-3">
            <button
              onClick={() => setCourseMenuOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-2 border-gray-900 rounded-xl font-bold text-sm bg-white shadow-[2px_2px_0_#1a1d29]"
            >
              {selectedCourse ? (
                <>
                  <span>{selectedCourse.icon}</span>
                  <span className="flex-1 truncate text-left">{selectedCourse.short_title}</span>
                  <StatusDot status={selectedCourse.status} />
                </>
              ) : (
                <span className="flex-1 text-left text-gray-500">Select a course…</span>
              )}
              <span className="text-gray-500">{courseMenuOpen ? '▲' : '▼'}</span>
            </button>

            {courseMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setCourseMenuOpen(false)} />
                <div className="absolute left-0 right-0 mt-1 z-40 bg-white border-2 border-gray-900 rounded-xl shadow-[4px_4px_0_#1a1d29] overflow-hidden max-h-72 overflow-y-auto">
                  {courses.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No courses yet.</p>}
                  {courses.map((course, ci) => (
                    <div key={course.id} className={`flex items-center gap-1 border-b border-gray-100 last:border-0 ${selectedCourseId === course.id ? 'bg-gray-900' : ''}`}>
                      <button
                        onClick={() => { setSelectedCourseId(course.id); setSelectedLessonId(null); setSelectedLevelId(null); setCourseMenuOpen(false) }}
                        className={`flex-1 text-left px-3 py-2 font-bold text-sm flex items-center gap-2 ${selectedCourseId === course.id ? 'text-white' : 'hover:bg-gray-100'}`}
                      >
                        <span>{course.icon}</span><span className="flex-1 truncate">{course.short_title}</span><StatusDot status={course.status} />
                      </button>
                      <div className="flex flex-col px-1">
                        <button onClick={() => moveCourse(course, 'up')} disabled={ci === 0} className={`text-[10px] leading-none px-1 disabled:opacity-30 ${selectedCourseId === course.id ? 'text-white' : 'text-gray-500'}`} title="Move up">▲</button>
                        <button onClick={() => moveCourse(course, 'down')} disabled={ci === courses.length - 1} className={`text-[10px] leading-none px-1 disabled:opacity-30 ${selectedCourseId === course.id ? 'text-white' : 'text-gray-500'}`} title="Move down">▼</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => { addCourse(); setCourseMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 border-t-2 border-gray-200">+ Add course</button>
                </div>
              </>
            )}
          </div>

          {/* Selected course unfolds */}
          {selectedCourse && (
            <div className="mb-3">
              <div className="flex items-center gap-1 mb-1">
                <p className="flex-1 text-xs font-mono uppercase tracking-widest text-gray-500 truncate px-1">{selectedCourse.title}</p>
                <button onClick={() => deleteCourse(selectedCourse.id, selectedCourse.title)} className="px-2 py-1 text-xs rounded text-red-600 hover:bg-red-100" title="Delete course">🗑</button>
              </div>
              {selectedCourse.units.map((unit) => (
                <div key={unit.id} className="ml-2 mt-1 mb-2">
                  <div className="flex items-center gap-1 group px-2 py-1">
                    <p className="text-xs font-mono uppercase text-gray-500 truncate flex-1 flex items-center gap-1">Unit {unit.number}: {unit.name}<StatusDot status={unit.status} small /></p>
                    <button onClick={() => deleteUnit(unit.id, unit.name, unit.lessons.length)} className="px-1.5 py-0.5 text-xs text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded">🗑</button>
                  </div>
                  {unit.lessons.map((lesson) => (
                    <div key={lesson.id} className="flex items-center gap-1 group ml-2">
                      <button onClick={() => { setSelectedLessonId(lesson.id); setSelectedLevelId(null); setContentView('lesson') }} className={`flex-1 text-left px-3 py-1.5 rounded-md text-xs flex items-center gap-2 ${selectedLessonId === lesson.id ? 'text-white font-bold' : 'hover:bg-gray-100'}`} style={selectedLessonId === lesson.id ? { background: '#00b395' } : {}}>
                        <StatusDot status={lesson.status} small /><span className="truncate">{lesson.title}</span>
                      </button>
                      <button onClick={() => deleteLesson(lesson.id, lesson.title)} className="px-1.5 py-0.5 text-xs text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded">🗑</button>
                    </div>
                  ))}
                  <button onClick={() => addLesson(unit.id)} className="w-full text-left px-3 py-1.5 ml-2 rounded-md text-xs text-gray-600 hover:bg-gray-100 italic">+ Add lesson</button>
                </div>
              ))}
              <button onClick={() => addUnit(selectedCourse.id)} className="w-full text-left px-3 py-1.5 ml-2 mt-1 rounded-md text-xs text-gray-600 hover:bg-gray-100 italic font-bold">+ Add unit</button>
            </div>
          )}
        </aside>
        {/* Editor panel */}
        <div>
          {!selectedLesson ? (
            /* ============ COURSE VIEW ============ */
            <div>
              <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// content management</p>
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h1 className="text-3xl font-black tracking-tight">{selectedCourse ? `Editing ${selectedCourse.title}` : 'Pick a lesson to edit.'}</h1>
                {selectedCourse && <StatusControls status={selectedCourse.status} onChange={(s) => setStatus('courses', selectedCourse.id, s)} onSendForApproval={() => sendForApproval('courses', selectedCourse.id)} onApprove={() => approveContent('courses', selectedCourse.id)} onDeny={() => denyContent('courses', selectedCourse.id)} role={currentRole} isOwnContent={selectedCourse.created_by === currentUser?.id} />}
              </div>
              <p className="text-gray-700 max-w-xl mb-6">{selectedCourse ? 'Edit course details below, or pick a lesson in the sidebar.' : 'Choose a course, then a lesson.'}</p>
              {selectedCourse && (<>
                <div className="p-5 bg-white border-2 border-gray-900 rounded-xl mb-5">
                  <p className="text-xs font-mono tracking-widest text-gray-600 uppercase mb-3">// course details</p>
                  <CourseEditor course={selectedCourse} onUpdate={updateCourseField} />
                </div>
                <div className="p-5 bg-white border-2 border-gray-900 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-xs font-mono tracking-widest text-gray-600 uppercase">// units ({selectedCourse.units.length})</p>
                    <button onClick={() => addUnit(selectedCourse.id)} className="px-3 py-1.5 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395' }}>+ Add unit</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {selectedCourse.units.map(unit => <UnitRow key={unit.id} unit={unit} onUpdate={updateUnitField} onStatusChange={(s) => setStatus('units', unit.id, s)} onSendForApproval={() => sendForApproval('units', unit.id)} onApprove={() => approveContent('units', unit.id)} onDeny={() => denyContent('units', unit.id)} onDelete={() => deleteUnit(unit.id, unit.name, unit.lessons.length)} role={currentRole} currentUserId={currentUser?.id} />)}
                    {selectedCourse.units.length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No units yet.</p>}
                  </div>
                </div>
              </>)}
            </div>
          ) : (
            /* ============ LESSON VIEW WITH LEVELS ============ */
            <div>
              <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
                <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>// {selectedCourse.short_title} ▸ Unit {selectedLesson.unit.number}</p>
                <div className="flex gap-2 items-center flex-wrap">
                  <StatusControls status={selectedLesson.status} onChange={(s) => setStatus('lessons', selectedLesson.id, s)} onSendForApproval={() => sendForApproval('lessons', selectedLesson.id)} onApprove={() => approveContent('lessons', selectedLesson.id)} onDeny={() => denyContent('lessons', selectedLesson.id)} role={currentRole} isOwnContent={selectedLesson.created_by === currentUser?.id} />
                  <button onClick={() => deleteLesson(selectedLesson.id, selectedLesson.title)} className="px-3 py-1 bg-red-500 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]">Delete lesson</button>
                </div>
              </div>
              <h1 className="text-3xl font-black tracking-tight mb-5">{selectedLesson.title}</h1>

              <LessonMetaEditor lesson={selectedLesson} onUpdate={updateLessonField} />

              {/* ============ LEVEL TABS + PRACTICE TAB ============ */}
              <div className="mt-7 mb-4">
                <div className="flex gap-1 mb-4 border-b-2 border-gray-300 flex-wrap">
                  {levels.map((level) => (
                    <button key={level.id}
                      onClick={() => { setSelectedLevelId(level.id); setContentView('lesson') }}
                      className={`px-3 py-2 font-bold text-sm border-2 border-b-0 rounded-t-lg transition-all flex items-center gap-1.5 ${
                        contentView === 'lesson' && selectedLevelId === level.id ? 'border-gray-900 text-white -mb-0.5' : 'border-transparent text-gray-500 hover:text-gray-900'
                      }`}
                      style={contentView === 'lesson' && selectedLevelId === level.id ? { background: '#00b395' } : {}}
                    >
                      <StatusDot status={level.status} small />
                      {level.title || `Level ${level.number}`}
                      <span className={`text-xs font-mono ${contentView === 'lesson' && selectedLevelId === level.id ? 'opacity-80' : 'text-gray-400'}`}>
                        ({items.filter(i => i.level_id === level.id).length})
                      </span>
                    </button>
                  ))}
                  <button onClick={addLevel} className="px-3 py-2 font-bold text-sm border-2 border-b-0 border-dashed border-gray-400 rounded-t-lg text-gray-500 hover:text-gray-900 hover:border-gray-600 transition-all">
                    + Level
                  </button>
                  <button
                    onClick={() => setContentView('practice')}
                    className={`px-3 py-2 font-bold text-sm border-2 border-b-0 rounded-t-lg transition-all ml-auto ${
                      contentView === 'practice' ? 'border-gray-900 -mb-0.5' : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                    style={contentView === 'practice' ? { background: '#fbbf24' } : {}}
                  >
                    🎯 Practice pool
                    <span className={`ml-1 text-xs font-mono ${contentView === 'practice' ? 'opacity-80' : 'text-gray-400'}`}>({practiceQuestionCount})</span>
                  </button>
                </div>

                {/* Level header / Practice header */}
                <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
                  <div>
                    {contentView === 'lesson' && selectedLevel && (
                      <>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-xl font-black tracking-tight">{selectedLevel.title || `Level ${selectedLevel.number}`}</h2>
                          <StatusControls status={selectedLevel.status} onChange={(s) => setStatus('levels', selectedLevel.id, s)} onSendForApproval={() => sendForApproval('levels', selectedLevel.id)} onApprove={() => approveContent('levels', selectedLevel.id)} onDeny={() => denyContent('levels', selectedLevel.id)} role={currentRole} isOwnContent={selectedLevel.created_by === currentUser?.id} />
                          {levels.length > 1 && <button onClick={() => deleteLevel(selectedLevel.id, selectedLevel.number)} className="px-2 py-1 text-red-600 hover:bg-red-100 rounded text-xs font-bold">🗑 Delete level</button>}
                        </div>
                        <p className="text-xs text-gray-500">{levelReadingCount} reading{levelReadingCount === 1 ? '' : 's'} · {levelQuestionCount} question{levelQuestionCount === 1 ? '' : 's'}</p>
                      </>
                    )}
                    {contentView === 'lesson' && !selectedLevel && levels.length === 0 && (
                      <div>
                        <h2 className="text-xl font-black tracking-tight mb-1">No levels yet</h2>
                        <p className="text-xs text-gray-500">Click "+ Level" above to create the first level for this lesson.</p>
                      </div>
                    )}
                    {contentView === 'practice' && (
                      <>
                        <h2 className="text-xl font-black tracking-tight">Practice pool</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Random order, spaced repetition. {practiceQuestionCount} question{practiceQuestionCount === 1 ? '' : 's'}.</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white">
                      <option value="all">All statuses</option>
                      <option value="draft">Drafts only</option>
                      <option value="pending_review">Pending review</option>
                      <option value="published">Published only</option>
                    </select>
                    {contentView === 'lesson' && selectedLevelId && (
                      <>
                        <button onClick={addReading} className="px-4 py-2 bg-white border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29]">+ Add reading</button>
                        <button onClick={() => addQuestion('lesson')} className="px-4 py-2 text-white border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29]" style={{ background: '#00b395' }}>+ Add question</button>
                      </>
                    )}
                    {contentView === 'practice' && (
                      <div className="flex gap-2 items-center flex-wrap">
                        {selectedItemIds.size > 0 && (
                          <div className="flex gap-2 items-center mr-4 p-1 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
                            <input value={bulkSetName} onChange={e => setBulkSetName(e.target.value)} placeholder="Set name (e.g. Set A)" className="px-2 py-1 text-sm border-2 border-gray-900 rounded-md" />
                            <button onClick={applySetToSelected} className="px-3 py-1 bg-gray-900 text-white text-xs font-bold rounded-md shadow-sm">Group into Set ({selectedItemIds.size})</button>
                          </div>
                        )}
                        <button onClick={() => addQuestion('practice')} className="px-4 py-2 border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29]" style={{ background: '#fbbf24' }}>+ Practice question</button>
                      </div>
                    )}
                  </div>
                </div>

                {contentView === 'lesson' && selectedLevelId && <p className="text-xs text-gray-500 mb-3">💡 Use ↑↓ to reorder. Students see these in order.</p>}
                {contentView === 'practice' && <p className="text-xs text-gray-500 mb-3">💡 Practice questions appear in random order to students.</p>}
              </div>

              {/* Content items */}
              {filteredItems.length === 0 ? (
                <div className="text-center p-10 border-2 border-dashed border-gray-400 rounded-xl">
                  <p className="text-gray-700 mb-3">
                    {contentView === 'lesson' && !selectedLevelId ? 'Create a level first, then add content to it.'
                      : contentView === 'practice' ? 'No practice questions yet.'
                      : statusFilter !== 'all' ? `No ${statusFilter.replace('_', ' ')} items.`
                      : 'No content yet. Add a reading or question!'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredItems.map((item, i) => (
                    <ItemCard key={`${item._kind}-${item.id}`} index={i} item={item} isFirst={i === 0} isLast={i === filteredItems.length - 1}
                      onEdit={() => openEditor(item)} onDelete={() => deleteItem(item)}
                      onStatusChange={(s) => setStatus(item._kind === 'question' ? 'questions' : 'readings', item.id, s)}
                      onSendForApproval={() => sendForApproval(item._kind === 'question' ? 'questions' : 'readings', item.id)}
                      onApprove={() => approveContent(item._kind === 'question' ? 'questions' : 'readings', item.id)}
                      onDeny={() => denyContent(item._kind === 'question' ? 'questions' : 'readings', item.id)}
                      onMoveUp={() => moveItem(item, 'up')} onMoveDown={() => moveItem(item, 'down')}
                      onSetPool={(p) => setQuestionPool(item.id, p)}
                      role={currentRole} currentUserId={currentUser?.id}
                      isSelected={selectedItemIds.has(item.id)}
                      onSelect={() => toggleSelection(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {toast && <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl border-2 border-gray-900 shadow-[4px_4px_0_#00b395] font-bold z-50">{toast}</div>}
      </div>
    </>
  )
}

// ============ HELPER COMPONENTS ============

function StatusDot({ status, small }) {
  const color = status === 'published' ? '#00b395' : status === 'archived' ? '#374151' : status === 'pending_review' ? '#3b82f6' : '#fde047'
  return <span className="inline-block rounded-full flex-shrink-0" style={{ width: small ? 6 : 8, height: small ? 6 : 8, background: color }} title={status} />
}

function StatusControls({ status, onChange, onSendForApproval, onApprove, onDeny, role, isOwnContent }) {
  const activeStyles = { published: { background: '#00b395', color: 'white' }, archived: { background: '#374151', color: 'white' }, draft: { background: '#fde047', color: '#1a1d29' }, pending_review: { background: '#3b82f6', color: 'white' } }
  const paleStyles = { published: { background: '#d1f5ed', color: '#0a6b5c' }, archived: { background: '#d1d5db', color: '#374151' }, draft: { background: '#fef9c3', color: '#854d0e' } }
  const isAdmin = role === 'admin' || role === 'editor'
  const canApprove = (isAdmin || (role === 'reviewer' && !isOwnContent)) && status === 'pending_review'
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border-2 border-gray-900 shadow-[2px_2px_0_#1a1d29]" style={activeStyles[status] || activeStyles.draft}>Current status: {status.replace('_', ' ')}</span>
      {canApprove && (<><button onClick={onApprove} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395', color: 'white' }}>✓ Approve</button><button onClick={onDeny} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#fee2e2', color: '#7f1d1d' }}>✗ Deny</button></>)}
      {isAdmin && status !== 'published' && <button onClick={() => onChange('published')} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={paleStyles.published}>Publish</button>}
      {!isAdmin && status === 'draft' && onSendForApproval && <button onClick={onSendForApproval} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#dbeafe', color: '#1e40af' }}>📤 Send for approval</button>}
      {status !== 'draft' && status !== 'pending_review' && <button onClick={() => onChange('draft')} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={paleStyles.draft}>Move to draft</button>}
      {!isAdmin && status === 'pending_review' && isOwnContent && <button onClick={() => onChange('draft')} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={paleStyles.draft}>Withdraw</button>}
      {isAdmin && status !== 'archived' && <button onClick={() => onChange('archived')} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={paleStyles.archived}>Archive</button>}
    </div>
  )
}

function CourseEditor({ course, onUpdate }) {
  const [draft, setDraft] = useState(course)
  useEffect(() => setDraft(course), [course.id])
  function commit(field) { if (draft[field] !== course[field]) onUpdate(course.id, field, draft[field]) }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label="Title"><input value={draft.title || ''} onChange={e => setDraft({ ...draft, title: e.target.value })} onBlur={() => commit('title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Short title"><input value={draft.short_title || ''} onChange={e => setDraft({ ...draft, short_title: e.target.value })} onBlur={() => commit('short_title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Description" full><textarea value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} onBlur={() => commit('description')} rows={2} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Icon"><input value={draft.icon || ''} onChange={e => setDraft({ ...draft, icon: e.target.value })} onBlur={() => commit('icon')} maxLength={3} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Color">
  <div className="flex items-center gap-2">
    <input
      type="color"
      value={/^#[0-9a-fA-F]{6}$/.test(draft.tone) ? draft.tone : '#6b7280'}
      onChange={e => { setDraft({ ...draft, tone: e.target.value }); onUpdate(course.id, 'tone', e.target.value) }}
      className="w-10 h-10 rounded-lg border-2 border-gray-900 cursor-pointer p-0.5 bg-white"
    />
    <input
      type="text"
      value={/^#[0-9a-fA-F]{6}$/.test(draft.tone) ? draft.tone : '#6b7280'}
      onChange={e => {
        const val = e.target.value
        setDraft({ ...draft, tone: val })
        if (/^#[0-9a-fA-F]{6}$/.test(val)) onUpdate(course.id, 'tone', val)
      }}
      onBlur={() => {
        if (!/^#[0-9a-fA-F]{6}$/.test(draft.tone)) {
          const fallback = '#6b7280'
          setDraft({ ...draft, tone: fallback })
          onUpdate(course.id, 'tone', fallback)
        }
      }}
      maxLength={7}
      placeholder="#6b7280"
      className="flex-1 p-2 border-2 border-gray-900 rounded-lg bg-white font-mono text-sm"
    />
    <div className="w-8 h-8 rounded-lg border-2 border-gray-900 flex-shrink-0" style={{ background: /^#[0-9a-fA-F]{6}$/.test(draft.tone) ? draft.tone : '#6b7280' }} />
  </div>
</Field>
<Field label="Lesson progression" full>
  <div className="flex flex-col sm:flex-row gap-2">
    <button
      type="button"
      onClick={() => { setDraft({ ...draft, linear_progression: true }); onUpdate(course.id, 'linear_progression', true) }}
      className={`flex-1 px-4 py-2 border-2 rounded-lg font-bold text-sm text-left transition-all ${
        draft.linear_progression !== false
          ? 'border-gray-900 text-white shadow-[3px_3px_0_#1a1d29]'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'
      }`}
      style={draft.linear_progression !== false ? { background: '#00b395' } : {}}
    >
      🔒 Sequential — finish a lesson to unlock the next
    </button>
    <button
      type="button"
      onClick={() => { setDraft({ ...draft, linear_progression: false }); onUpdate(course.id, 'linear_progression', false) }}
      className={`flex-1 px-4 py-2 border-2 rounded-lg font-bold text-sm text-left transition-all ${
        draft.linear_progression === false
          ? 'border-gray-900 text-white shadow-[3px_3px_0_#1a1d29]'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'
      }`}
      style={draft.linear_progression === false ? { background: '#00b395' } : {}}
    >
      🔓 Free — students pick any lesson, any order
    </button>
  </div>
</Field>
    </div>
  )
}
function UnitRow({ unit, onUpdate, onStatusChange, onDelete, role, onSendForApproval, onApprove, onDeny, currentUserId }) {
  const [draft, setDraft] = useState(unit)
  useEffect(() => setDraft(unit), [unit.id])
  function commit(field) { if (draft[field] !== unit[field]) onUpdate(unit.id, field, draft[field]) }
  return (
    <div className="flex flex-col gap-2 bg-white border-2 border-gray-900 rounded-lg p-3">
      <div className="flex gap-2 items-center">
        <input type="number" value={draft.number} onChange={e => setDraft({ ...draft, number: parseInt(e.target.value) || 1 })} onBlur={() => commit('number')} className="w-14 p-1.5 border border-gray-300 rounded text-center font-bold text-sm" min="1" />
        <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} onBlur={() => commit('name')} className="flex-1 p-1.5 border border-gray-300 rounded text-sm" />
        <span className="text-xs font-mono text-gray-500 px-2">{unit.lessons.length} lesson{unit.lessons.length === 1 ? '' : 's'}</span>
        <button onClick={onDelete} className="px-2 py-1 text-red-600 hover:bg-red-100 rounded text-sm">🗑</button>
      </div>
      <div className="flex justify-end"><StatusControls status={unit.status} onChange={onStatusChange} onSendForApproval={onSendForApproval} onApprove={onApprove} onDeny={onDeny} role={role} isOwnContent={unit.created_by === currentUserId} /></div>
    </div>
  )
}

function LessonMetaEditor({ lesson, onUpdate }) {
  const [draft, setDraft] = useState(lesson)
  useEffect(() => setDraft(lesson), [lesson.id])
  function commit(field) { if (draft[field] !== lesson[field]) onUpdate(lesson.id, field, draft[field]) }
  return (
    <div className="bg-white border-2 border-gray-900 rounded-xl p-4 grid grid-cols-1 md:grid-cols-[1fr_80px] gap-3">
      <Field label="Lesson title"><input value={draft.title || ''} onChange={e => setDraft({ ...draft, title: e.target.value })} onBlur={() => commit('title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Icon"><input value={draft.icon || ''} onChange={e => setDraft({ ...draft, icon: e.target.value })} onBlur={() => commit('icon')} maxLength={3} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white text-center" /></Field>
      <Field label="Description" full><input value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} onBlur={() => commit('description')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
    </div>
  )
}

function ItemCard({ index, item, isFirst, isLast, onEdit, onDelete, onStatusChange, onSendForApproval, onApprove, onDeny, onMoveUp, onMoveDown, onSetPool, role, currentUserId, isSelected, onSelect }) {
  if (item._kind === 'question') {
    return (
      <div className={`border-2 border-gray-900 rounded-xl p-4 shadow-[3px_3px_0_#1a1d29] flex gap-3 ${isSelected ? 'bg-yellow-50 border-yellow-500' : 'bg-white'}`}>
        <ReorderControls isFirst={isFirst} isLast={isLast} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
        <div className="flex-1">
          <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-2">
              {item.pool === 'practice' && (
                <input type="checkbox" checked={!!isSelected} onChange={onSelect} className="w-4 h-4 cursor-pointer accent-gray-900" />
              )}
              <p className="text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-2" style={{ color: '#00b395' }}>
                📝 Question — item {index + 1} <StatusDot status={item.status} />
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900" style={{ background: item.pool === 'practice' ? '#fbbf24' : item.pool === 'problem_set' ? '#8b5cf6' : '#00b395', color: item.pool === 'practice' ? '#1a1d29' : 'white' }}>{item.pool === 'practice' ? 'PRACTICE' : item.pool === 'problem_set' ? 'PROBLEM SET' : 'LESSON'}</span>
                {item.difficulty && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900 text-white" style={{ background: item.difficulty === 'easy' ? '#22c55e' : item.difficulty === 'medium' ? '#eab308' : item.difficulty === 'difficult' ? '#f97316' : '#ef4444' }}>
                    {item.difficulty === 'very_difficult' ? 'VERY HARD' : item.difficulty.toUpperCase()}
                  </span>
                )}
                {item.in_problem_set && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900 text-white" style={{ background: '#8b5cf6' }}>
                    ★ PROBLEM SET
                  </span>
                )}
                {item.practice_set && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900 text-gray-900 bg-white shadow-[1px_1px_0_#1a1d29]">
                    SET: {item.practice_set}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-1.5 flex-wrap items-center">
              {(item.pool === 'lesson' ? [] : item.pool === 'practice' ? ['problem_set'] : ['lesson', 'practice', 'problem_set'].filter(p => p !== item.pool)).map(p => (
                <button key={p} onClick={() => onSetPool(p)} className="px-3 py-1 bg-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]">↔ To {p === 'problem_set' ? 'problem set' : p}</button>
              ))}
              <StatusControls status={item.status} onChange={onStatusChange} onSendForApproval={onSendForApproval} onApprove={onApprove} onDeny={onDeny} role={role} isOwnContent={item.created_by === currentUserId} />
              <button onClick={onEdit} className="px-3 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395', color: 'white' }}>Edit</button>
              <button onClick={onDelete} className="px-3 py-1 bg-red-500 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]">Delete</button>
            </div>
          </div>
          <p className="font-bold text-sm mb-3">{item.stem}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
            {item.choices.map((c, i) => (
              <div key={i} className={`px-2 py-1.5 rounded flex items-center gap-1.5 ${i === item.answer ? 'bg-green-100 text-green-900 font-bold' : 'bg-gray-50 text-gray-700'}`}>
                <span className="font-black">{String.fromCharCode(65 + i)}.</span><span className="flex-1">{c}</span>{i === item.answer && <span>✓</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="bg-blue-50 border-2 border-gray-900 rounded-xl p-4 shadow-[3px_3px_0_#1a1d29] flex gap-3">
      <ReorderControls isFirst={isFirst} isLast={isLast} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
      <div className="flex-1">
        <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
          <p className="text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-2 text-blue-700">📖 Reading — item {index + 1} <StatusDot status={item.status} /></p>
          <div className="flex gap-1.5 flex-wrap items-center">
            <StatusControls status={item.status} onChange={onStatusChange} onSendForApproval={onSendForApproval} onApprove={onApprove} onDeny={onDeny} role={role} isOwnContent={item.created_by === currentUserId} />
            <button onClick={onEdit} className="px-3 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#3b82f6', color: 'white' }}>Edit</button>
            <button onClick={onDelete} className="px-3 py-1 bg-red-500 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]">Delete</button>
          </div>
        </div>
        <h4 className="font-black text-base mb-2">{item.title}</h4>
        <div className="text-xs text-gray-700 max-h-24 overflow-hidden relative">
          <div dangerouslySetInnerHTML={{ __html: item.content || '<em>(empty)</em>' }} />
          {item.content && item.content.length > 200 && <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-blue-50 to-transparent" />}
        </div>
      </div>
    </div>
  )
}

function ReorderControls({ isFirst, isLast, onMoveUp, onMoveDown }) {
  return (
    <div className="flex flex-col gap-0.5">
      <button onClick={onMoveUp} disabled={isFirst} className="px-2 py-0.5 bg-white border border-gray-900 rounded text-xs font-bold disabled:opacity-30">↑</button>
      <button onClick={onMoveDown} disabled={isLast} className="px-2 py-0.5 bg-white border border-gray-900 rounded text-xs font-bold disabled:opacity-30">↓</button>
    </div>
  )
}

function Field({ label, children, full }) {
  return (
    <label className={`block ${full ? 'md:col-span-2' : ''}`}>
      <span className="block text-xs font-mono tracking-widest uppercase text-gray-700 font-bold mb-1">{label}</span>
      {children}
    </label>
  )
}