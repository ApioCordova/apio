'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import RichEditor from './RichEditor'

export default function AdminContentPage() {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [selectedLessonId, setSelectedLessonId] = useState(null)
  const [items, setItems] = useState([]) // unified: questions + readings, sorted
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [selectedLessonId, setSelectedLessonId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [contentView, setContentView] = useState('lesson')
  const [currentUser, setCurrentUser] = useState(null)
  const [currentRole, setCurrentRole] = useState(null)

  const canPublishDirectly = currentRole === 'admin' || currentRole === 'editor'
  const isReviewer = currentRole === 'reviewer'
  const isQuestionMaker = currentRole === 'question_maker'

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUser(user)
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, email')
          .eq('id', user.id)
          .single()
        setCurrentRole(profile?.role)
      }
      await loadCourses()
    }
    init()
  }, [])
  useEffect(() => {
    if (selectedLessonId) loadItems(selectedLessonId)
    else setItems([])
  }, [selectedLessonId])

  async function loadCourses() {
    setLoading(true)
    const { data } = await supabase
      .from('courses')
      .select(`*, units (*, lessons (*))`)
      .order('sort_order')
    const sorted = (data || []).map((c) => ({
      ...c,
      units: (c.units || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((u) => ({
          ...u,
          lessons: (u.lessons || []).sort((a, b) => a.sort_order - b.sort_order),
        })),
    }))
    setCourses(sorted)
    if (!selectedCourseId && sorted[0]) setSelectedCourseId(sorted[0].id)
    setLoading(false)
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

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  // ============ STATUS UPDATES ============
  async function setStatus(table, id, status) {
    // Enforce role-based publishing rules
    if (status === 'published') {
      if (isQuestionMaker || isReviewer) {
        showToast('You do not have permission to publish directly. Use "Send for approval" instead.')
        return
      }
    }
    await supabase.from(table).update({ status }).eq('id', id)
    showToast(status === 'published' ? '✓ Published' : 'Set to ' + status.replace('_', ' '))
    if (table === 'questions' || table === 'readings') await loadItems(selectedLessonId)
    else await loadCourses()
  }

  async function sendForApproval(table, id) {
    await supabase.from(table).update({ status: 'pending_review' }).eq('id', id)
    showToast('📤 Sent for approval')
    if (table === 'questions' || table === 'readings') await loadItems(selectedLessonId)
    else await loadCourses()
  }

  async function approveContent(table, id) {
    if (isQuestionMaker || isReviewer && false) {
      // reviewers cannot approve their own; we check this in the UI based on created_by
    }
    await supabase.from(table).update({ status: 'published' }).eq('id', id)
    showToast('✓ Approved & published')
    if (table === 'questions' || table === 'readings') await loadItems(selectedLessonId)
    else await loadCourses()
  }

  async function denyContent(table, id) {
    if (!confirm('Deny this content and send back to draft?')) return
    await supabase.from(table).update({ status: 'draft' }).eq('id', id)
    showToast('Sent back to draft')
    if (table === 'questions' || table === 'readings') await loadItems(selectedLessonId)
    else await loadCourses()
  }

  // ============ COURSE ============
  async function updateCourseField(courseId, field, value) {
    await supabase.from('courses').update({ [field]: value }).eq('id', courseId)
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, [field]: value } : c)))
  }

  async function addCourse() {
    const id = `course-${Date.now()}`
    const { error } = await supabase.from('courses').insert({
      id, title: 'New AP Course', short_title: 'New',
      description: 'Click to edit description.', icon: '★', tone: 'default',
      sort_order: courses.length + 1, status: 'draft',
    })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft course created')
    await loadCourses()
    setSelectedCourseId(id)
  }

  async function deleteCourse(courseId, courseTitle) {
    if (!confirm(`Delete "${courseTitle}" and ALL its units, lessons, questions, readings, and student progress?\n\nThis cannot be undone.`)) return
    const confirmText = prompt(`Type the course title to confirm:\n\n${courseTitle}`)
    if (confirmText !== courseTitle) { showToast('Title did not match — course NOT deleted'); return }
    const { error } = await supabase.from('courses').delete().eq('id', courseId)
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Course deleted')
    setSelectedLessonId(null); setSelectedCourseId(null)
    await loadCourses()
  }

  // ============ UNIT ============
  async function addUnit(courseId) {
    const course = courses.find((c) => c.id === courseId)
    const number = (course?.units.length || 0) + 1
    const id = `unit-${Date.now()}`
    const { error } = await supabase.from('units').insert({
      id, course_id: courseId, name: `New Unit ${number}`,
      number, sort_order: number, status: 'draft',
    })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft unit created')
    await loadCourses()
  }

  async function updateUnitField(unitId, field, value) {
    await supabase.from('units').update({ [field]: value }).eq('id', unitId)
    setCourses((cs) => cs.map((c) => ({
      ...c,
      units: c.units.map((u) => (u.id === unitId ? { ...u, [field]: value } : u)),
    })))
  }

  async function deleteUnit(unitId, unitName, lessonCount) {
    if (!confirm(`Delete unit "${unitName}" and all ${lessonCount} of its lessons + content + student progress?\n\nThis cannot be undone.`)) return
    const { error } = await supabase.from('units').delete().eq('id', unitId)
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Unit deleted')
    setSelectedLessonId(null)
    await loadCourses()
  }

  // ============ LESSON ============
  async function updateLessonField(lessonId, field, value) {
    await supabase.from('lessons').update({ [field]: value }).eq('id', lessonId)
    setCourses((cs) => cs.map((c) => ({
      ...c,
      units: c.units.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) => (l.id === lessonId ? { ...l, [field]: value } : l)),
      })),
    })))
  }

  async function addLesson(unitId) {
    const id = `lesson-${Date.now()}`
    const unit = courses.flatMap((c) => c.units).find((u) => u.id === unitId)
    const sortOrder = (unit?.lessons.length || 0) + 1
    const { error } = await supabase.from('lessons').insert({
      id, unit_id: unitId, title: 'New Lesson',
      description: 'Click to edit description.', icon: '★',
      sort_order: sortOrder, status: 'draft',
    })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft lesson created')
    await loadCourses()
    setSelectedLessonId(id)
  }

  async function deleteLesson(lessonId, lessonTitle) {
    if (!confirm(`Delete lesson "${lessonTitle}" and all its content + student progress?\n\nThis cannot be undone.`)) return
    const { error } = await supabase.from('lessons').delete().eq('id', lessonId)
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Lesson deleted')
    setSelectedLessonId(null)
    await loadCourses()
  }

  // ============ ITEMS (Questions + Readings) ============
  async function addQuestion(pool = 'lesson') {
    if (!selectedLessonId) return
    const sortOrder = items.length + 1
    const { error } = await supabase.from('questions').insert({
      lesson_id: selectedLessonId,
      stem: 'Enter your question here.',
      choices: ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: 0, explanation: 'Why this answer is correct.',
      sort_order: sortOrder, status: 'draft', pool: pool,
      created_by: currentUser?.id,
    })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast(`Draft ${pool} question added`)
    await loadItems(selectedLessonId)
  }

  async function addReading() {
    if (!selectedLessonId) return
    const sortOrder = items.length + 1
    const { error } = await supabase.from('readings').insert({
      lesson_id: selectedLessonId,
      title: 'New reading',
      content: '<p>Enter your content here.</p>',
      sort_order: sortOrder, status: 'draft',
      created_by: currentUser?.id,
    })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft reading added')
    await loadItems(selectedLessonId)
  }

  async function updateQuestion(questionId, draft) {
    const { error } = await supabase.from('questions').update({
      stem: draft.stem, choices: draft.choices,
      answer: draft.answer, explanation: draft.explanation,
    }).eq('id', questionId)
    if (error) { showToast('Save failed: ' + error.message); return false }
    showToast('Question saved')
    await loadItems(selectedLessonId)
    return true
  }
  // THIS IS C STUFF
  async function toggleQuestionPool(questionId, currentPool) {
    const newPool = currentPool === 'lesson' ? 'practice' : 'lesson'
    await supabase.from('questions').update({ pool: newPool }).eq('id', questionId)
    showToast(`Moved to ${newPool} pool`)
    await loadItems(selectedLessonId)
  }
  async function updateReading(readingId, draft) {
    const { error } = await supabase.from('readings').update({
      title: draft.title, content: draft.content,
    }).eq('id', readingId)
    if (error) { showToast('Save failed: ' + error.message); return false }
    showToast('Reading saved')
    await loadItems(selectedLessonId)
    return true
  }

  async function deleteItem(item) {
    const label = item._kind === 'question' ? 'question' : 'reading'
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return
    const table = item._kind === 'question' ? 'questions' : 'readings'
    await supabase.from(table).delete().eq('id', item.id)
    showToast(`${label[0].toUpperCase() + label.slice(1)} deleted`)
    await loadItems(selectedLessonId)
  }

  async function moveItem(item, direction) {
    const idx = items.findIndex(i => i.id === item.id && i._kind === item._kind)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return
    const other = items[swapIdx]

    // Swap sort_order values
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

  const selectedCourse = courses.find((c) => c.id === selectedCourseId)
  const selectedLesson = selectedCourse?.units
    .flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u })))
    .find((l) => l.id === selectedLessonId)

  // First filter by content view (lesson sequence vs practice pool vs all)
  let viewFilteredItems = items
  if (contentView === 'lesson') {
    // Lesson sequence: readings + lesson-pool questions
    viewFilteredItems = items.filter(i => i._kind === 'reading' || (i._kind === 'question' && i.pool === 'lesson'))
  } else if (contentView === 'practice') {
    // Practice pool: practice-pool questions only
    viewFilteredItems = items.filter(i => i._kind === 'question' && i.pool === 'practice')
  }

  // Then filter by status
  const filteredItems = statusFilter === 'all'
    ? viewFilteredItems
    : viewFilteredItems.filter((i) => i.status === statusFilter)

  const lessonQuestionCount = items.filter(i => i._kind === 'question' && i.pool === 'lesson').length
  const practiceQuestionCount = items.filter(i => i._kind === 'question' && i.pool === 'practice').length
  const readingCount = items.filter(i => i._kind === 'reading').length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 -m-2">
      {/* Sidebar */}
      <aside className="border-2 border-gray-900 rounded-xl p-3 max-h-[80vh] overflow-y-auto" style={{ background: '#f6fbf8' }}>
        <p className="text-xs font-mono tracking-widest text-gray-600 uppercase px-2 mb-2">Courses</p>
        {courses.map((course) => (
          <div key={course.id} className="mb-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedCourseId(course.id)}
                className={`flex-1 text-left px-2 py-2 rounded-lg font-bold text-sm flex items-center gap-2 ${
                  selectedCourseId === course.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'
                }`}
              >
                <span>{course.icon}</span>
                <span className="flex-1 truncate">{course.short_title}</span>
                <StatusDot status={course.status} />
              </button>
              {selectedCourseId === course.id && (
                <button onClick={() => deleteCourse(course.id, course.title)} className="px-2 py-1 text-xs rounded text-red-600 hover:bg-red-100" title="Delete course">🗑</button>
              )}
            </div>

            {selectedCourseId === course.id && (
              <>
                {course.units.map((unit) => (
                  <div key={unit.id} className="ml-2 mt-1 mb-2">
                    <div className="flex items-center gap-1 group px-2 py-1">
                      <p className="text-xs font-mono uppercase text-gray-500 truncate flex-1 flex items-center gap-1">
                        Unit {unit.number}: {unit.name}
                        <StatusDot status={unit.status} small />
                      </p>
                      <button onClick={() => deleteUnit(unit.id, unit.name, unit.lessons.length)} className="px-1.5 py-0.5 text-xs text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded" title="Delete unit">🗑</button>
                    </div>
                    {unit.lessons.map((lesson) => (
                      <div key={lesson.id} className="flex items-center gap-1 group ml-2">
                        <button
                          onClick={() => setSelectedLessonId(lesson.id)}
                          className={`flex-1 text-left px-3 py-1.5 rounded-md text-xs flex items-center justify-between gap-2 ${
                            selectedLessonId === lesson.id ? 'text-white font-bold' : 'hover:bg-gray-100'
                          }`}
                          style={selectedLessonId === lesson.id ? { background: '#00b395' } : {}}
                        >
                          <span className="truncate flex items-center gap-1.5">
                            <StatusDot status={lesson.status} small />
                            {lesson.title}
                          </span>
                        </button>
                        <button onClick={() => deleteLesson(lesson.id, lesson.title)} className="px-1.5 py-0.5 text-xs text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded" title="Delete lesson">🗑</button>
                      </div>
                    ))}
                    <button onClick={() => addLesson(unit.id)} className="w-full text-left px-3 py-1.5 ml-2 rounded-md text-xs text-gray-600 hover:bg-gray-100 italic">+ Add lesson</button>
                  </div>
                ))}
                <button onClick={() => addUnit(course.id)} className="w-full text-left px-3 py-1.5 ml-2 mt-1 rounded-md text-xs text-gray-600 hover:bg-gray-100 italic font-bold">+ Add unit</button>
              </>
            )}
          </div>
        ))}
        <button onClick={addCourse} className="w-full mt-3 px-3 py-2 border-2 border-dashed border-gray-400 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 hover:border-solid">+ Add course</button>
      </aside>

      {/* Editor panel */}
      <div>
        {!selectedLesson ? (
          <div>
            <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// content management</p>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h1 className="text-3xl font-black tracking-tight">
                {selectedCourse ? `Editing ${selectedCourse.title}` : 'Pick a lesson to edit.'}
              </h1>
              {selectedCourse && (
                <StatusControls
                  status={selectedCourse.status}
                  onChange={(s) => setStatus('courses', selectedCourse.id, s)}
                  onSendForApproval={() => sendForApproval('courses', selectedCourse.id)}
                  onApprove={() => approveContent('courses', selectedCourse.id)}
                  onDeny={() => denyContent('courses', selectedCourse.id)}
                  role={currentRole}
                  isOwnContent={false}
                  contentTable="courses"
                />
              )}
            </div>
            <p className="text-gray-700 max-w-xl mb-6">
              {selectedCourse
                ? 'Edit course details below, manage units, or pick a lesson in the sidebar to manage content.'
                : 'Choose a course in the sidebar, then click any lesson to edit its readings and questions.'}
            </p>

            {selectedCourse && (
              <>
                <div className="p-5 bg-white border-2 border-gray-900 rounded-xl mb-5">
                  <p className="text-xs font-mono tracking-widest text-gray-600 uppercase mb-3">// course details</p>
                  <CourseEditor course={selectedCourse} onUpdate={updateCourseField} />
                </div>

                <div className="p-5 bg-white border-2 border-gray-900 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-xs font-mono tracking-widest text-gray-600 uppercase">// units in this course ({selectedCourse.units.length})</p>
                    <button onClick={() => addUnit(selectedCourse.id)} className="px-3 py-1.5 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395' }}>+ Add unit</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {selectedCourse.units.map((unit) => (
                      <UnitRow
                        key={unit.id} unit={unit}
                        onUpdate={updateUnitField}
                        onStatusChange={(s) => setStatus('units', unit.id, s)}
                        onSendForApproval={() => sendForApproval('units', unit.id)}
                        onApprove={() => approveContent('units', unit.id)}
                        onDeny={() => denyContent('units', unit.id)}
                        onDelete={() => deleteUnit(unit.id, unit.name, unit.lessons.length)}
                        role={currentRole}
                      />
                    ))}
                    {selectedCourse.units.length === 0 && (
                      <p className="text-sm text-gray-500 italic text-center py-4">No units yet. Click "+ Add unit" to start.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
              <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>
                // {selectedCourse.short_title} ▸ Unit {selectedLesson.unit.number}
              </p>
              <div className="flex gap-2 items-center flex-wrap">
                <StatusControls
                  status={selectedLesson.status}
                  onChange={(s) => setStatus('lessons', selectedLesson.id, s)}
                  onSendForApproval={() => sendForApproval('lessons', selectedLesson.id)}
                  onApprove={() => approveContent('lessons', selectedLesson.id)}
                  onDeny={() => denyContent('lessons', selectedLesson.id)}
                  role={currentRole}
                  isOwnContent={false}
                />
                <button onClick={() => deleteLesson(selectedLesson.id, selectedLesson.title)} className="px-3 py-1 bg-red-500 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]">Delete lesson</button>
              </div>
            </div>
            <h1 className="text-3xl font-black tracking-tight mb-5 leading-tight">{selectedLesson.title}</h1>

            <LessonMetaEditor lesson={selectedLesson} onUpdate={updateLessonField} />

            <div className="mt-7 mb-4">
              {/* Tab switcher */}
              <div className="flex gap-1 mb-4 border-b-2 border-gray-300">
                <button
                  onClick={() => setContentView('lesson')}
                  className={`px-4 py-2 font-bold text-sm border-2 border-b-0 rounded-t-lg transition-all ${
                    contentView === 'lesson'
                      ? 'border-gray-900 text-white -mb-0.5'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                  style={contentView === 'lesson' ? { background: '#00b395' } : {}}
                >
                  📘 Lesson sequence
                  <span className={`ml-2 text-xs font-mono ${contentView === 'lesson' ? 'opacity-90' : 'text-gray-400'}`}>
                    ({readingCount + lessonQuestionCount})
                  </span>
                </button>
                <button
                  onClick={() => setContentView('practice')}
                  className={`px-4 py-2 font-bold text-sm border-2 border-b-0 rounded-t-lg transition-all ${
                    contentView === 'practice'
                      ? 'border-gray-900 -mb-0.5'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                  style={contentView === 'practice' ? { background: '#fbbf24' } : {}}
                >
                  🎯 Practice pool
                  <span className={`ml-2 text-xs font-mono ${contentView === 'practice' ? 'opacity-80' : 'text-gray-400'}`}>
                    ({practiceQuestionCount})
                  </span>
                </button>
                <button
                  onClick={() => setContentView('all')}
                  className={`px-4 py-2 font-bold text-sm border-2 border-b-0 rounded-t-lg transition-all ${
                    contentView === 'all'
                      ? 'bg-gray-900 text-white border-gray-900 -mb-0.5'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  📋 All content
                </button>
              </div>

              {/* Section header + actions */}
              <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
                <div>
                  {contentView === 'lesson' && (
                    <>
                      <h2 className="text-xl font-black tracking-tight">Lesson sequence</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        💡 What students see in "Start lesson". Readings and questions in order. {readingCount} reading{readingCount === 1 ? '' : 's'} · {lessonQuestionCount} question{lessonQuestionCount === 1 ? '' : 's'}.
                      </p>
                    </>
                  )}
                  {contentView === 'practice' && (
                    <>
                      <h2 className="text-xl font-black tracking-tight">Practice pool</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        💡 What students drill in "Practice problems". Random order, spaced repetition. {practiceQuestionCount} question{practiceQuestionCount === 1 ? '' : 's'}.
                      </p>
                    </>
                  )}
                  {contentView === 'all' && (
                    <>
                      <h2 className="text-xl font-black tracking-tight">All content</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Everything in this lesson. {readingCount} reading{readingCount === 1 ? '' : 's'} · {lessonQuestionCount} lesson Q · {practiceQuestionCount} practice Q.
                      </p>
                    </>
                  )}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white">
                    <option value="all">All statuses</option>
                    <option value="draft">Drafts only</option>
                    <option value="published">Published only</option>
                  </select>

                  {/* Show only relevant Add buttons per view */}
                  {(contentView === 'lesson' || contentView === 'all') && (
                    <>
                      <button onClick={addReading} className="px-4 py-2 bg-white border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all">
                        + Add reading
                      </button>
                      <button onClick={() => addQuestion('lesson')} className="px-4 py-2 text-white border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all" style={{ background: '#00b395' }}>
                        + Lesson question
                      </button>
                    </>
                  )}
                  {(contentView === 'practice' || contentView === 'all') && (
                    <button onClick={() => addQuestion('practice')} className="px-4 py-2 border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all" style={{ background: '#fbbf24' }}>
                      + Practice question
                    </button>
                  )}
                </div>
              </div>

              {contentView === 'lesson' && (
                <p className="text-xs text-gray-500 mb-3">
                  💡 Use the ↑↓ buttons to reorder items in the lesson sequence.
                </p>
              )}
              {contentView === 'practice' && (
                <p className="text-xs text-gray-500 mb-3">
                  💡 Practice questions appear in random order to students — no need to reorder them here.
                </p>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center p-10 border-2 border-dashed border-gray-400 rounded-xl">
                <p className="text-gray-700 mb-3">
                  {statusFilter !== 'all'
                    ? `No ${statusFilter} ${contentView === 'practice' ? 'practice questions' : 'items'}.`
                    : contentView === 'lesson'
                    ? 'No lesson content yet. Add a reading or a lesson question!'
                    : contentView === 'practice'
                    ? 'No practice questions yet. Click "+ Practice question" to add some.'
                    : 'No content yet.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredItems.map((item, i) => (
                  <ItemCard
                    key={`${item._kind}-${item.id}`}
                    index={i}
                    item={item}
                    isFirst={i === 0}
                    isLast={i === filteredItems.length - 1}
                    onSaveQuestion={(draft) => updateQuestion(item.id, draft)}
                    onSaveReading={(draft) => updateReading(item.id, draft)}
                    onDelete={() => deleteItem(item)}
                    onStatusChange={(s) => setStatus(item._kind === 'question' ? 'questions' : 'readings', item.id, s)}
                    onSendForApproval={() => sendForApproval(item._kind === 'question' ? 'questions' : 'readings', item.id)}
                    onApprove={() => approveContent(item._kind === 'question' ? 'questions' : 'readings', item.id)}
                    onDeny={() => denyContent(item._kind === 'question' ? 'questions' : 'readings', item.id)}
                    onMoveUp={() => moveItem(item, 'up')}
                    onMoveDown={() => moveItem(item, 'down')}
                    onTogglePool={() => toggleQuestionPool(item.id, item.pool)}
                    role={currentRole}
                    currentUserId={currentUser?.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl border-2 border-gray-900 shadow-[4px_4px_0_#00b395] font-bold z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

// ============ STATUS DOT ============
function StatusDot({ status, small }) {
  const color = status === 'published' ? '#00b395' : status === 'archived' ? '#374151' : '#fde047'
  const size = small ? 6 : 8
  return <span className="inline-block rounded-full flex-shrink-0" style={{ width: size, height: size, background: color }} title={status} />
}

// ============ STATUS CONTROLS ============
function StatusControls({ status, onChange, onSendForApproval, onApprove, onDeny, role, isOwnContent, contentTable }) {
  const activeStyles = {
    published: { background: '#00b395', color: 'white' },
    archived: { background: '#374151', color: 'white' },
    draft: { background: '#fde047', color: '#1a1d29' },
    pending_review: { background: '#3b82f6', color: 'white' },
  }
  const paleStyles = {
    published: { background: '#d1f5ed', color: '#0a6b5c' },
    archived: { background: '#d1d5db', color: '#374151' },
    draft: { background: '#fef9c3', color: '#854d0e' },
    pending_review: { background: '#dbeafe', color: '#1e40af' },
  }

  const currentStyle = activeStyles[status] || activeStyles.draft
  const isAdmin = role === 'admin' || role === 'editor'
  const canPublish = isAdmin
  // Reviewers can approve question_makers' content but not their own
  const canApprove = (isAdmin || (role === 'reviewer' && !isOwnContent)) && status === 'pending_review'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border-2 border-gray-900 shadow-[2px_2px_0_#1a1d29]"
        style={currentStyle}
      >
        Current status: {status.replace('_', ' ')}
      </span>

      {/* Approval actions (for reviewers/admins on pending content) */}
      {canApprove && (
        <>
          <button
            onClick={onApprove}
            className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
            style={{ background: '#00b395', color: 'white' }}
          >
            ✓ Approve & publish
          </button>
          <button
            onClick={onDeny}
            className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
            style={{ background: '#fee2e2', color: '#7f1d1d' }}
          >
            ✗ Send back to draft
          </button>
        </>
      )}

      {/* Direct publish (admins only) */}
      {canPublish && status !== 'published' && (
        <button
          onClick={() => onChange('published')}
          className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          style={paleStyles.published}
        >
          Publish
        </button>
      )}

      {/* Send for approval (non-admins) */}
      {!canPublish && status === 'draft' && onSendForApproval && (
        <button
          onClick={onSendForApproval}
          className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
          style={{ background: '#dbeafe', color: '#1e40af' }}
        >
          📤 Send for approval
        </button>
      )}

      {status !== 'draft' && status !== 'pending_review' && (
        <button
          onClick={() => onChange('draft')}
          className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          style={paleStyles.draft}
        >
          Move to draft
        </button>
      )}

      {/* Pending → withdraw (only for the creator if not admin) */}
      {!canPublish && status === 'pending_review' && isOwnContent && (
        <button
          onClick={() => onChange('draft')}
          className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
          style={paleStyles.draft}
        >
          Withdraw to draft
        </button>
      )}

      {canPublish && status !== 'archived' && (
        <button
          onClick={() => onChange('archived')}
          className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          style={paleStyles.archived}
        >
          Archive
        </button>
      )}
    </div>
  )
}
// ============ COURSE EDITOR ============
function CourseEditor({ course, onUpdate }) {
  const [draft, setDraft] = useState(course)
  useEffect(() => setDraft(course), [course.id])
  function commit(field) { if (draft[field] !== course[field]) onUpdate(course.id, field, draft[field]) }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label="Title"><input value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => commit('title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Short title"><input value={draft.short_title || ''} onChange={(e) => setDraft({ ...draft, short_title: e.target.value })} onBlur={() => commit('short_title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Description" full><textarea value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={() => commit('description')} rows={2} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Icon"><input value={draft.icon || ''} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} onBlur={() => commit('icon')} maxLength={3} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Tone (color theme)">
        <select value={draft.tone || 'default'} onChange={(e) => { setDraft({ ...draft, tone: e.target.value }); onUpdate(course.id, 'tone', e.target.value) }} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white font-medium">
          <option value="default">Default (mint)</option>
          <option value="gov">Gray tones</option>
          <option value="calc">Red tones</option>
        </select>
      </Field>
    </div>
  )
}

// ============ UNIT ROW ============
function UnitRow({ unit, onUpdate, onStatusChange, onDelete, role, onSendForApproval, onApprove, onDeny }) {
  const [draft, setDraft] = useState(unit)
  useEffect(() => setDraft(unit), [unit.id])
  function commit(field) { if (draft[field] !== unit[field]) onUpdate(unit.id, field, draft[field]) }

  return (
    <div className="flex flex-col gap-2 bg-white border-2 border-gray-900 rounded-lg p-3">
      <div className="flex gap-2 items-center">
        <input type="number" value={draft.number} onChange={(e) => setDraft({ ...draft, number: parseInt(e.target.value) || 1 })} onBlur={() => commit('number')} className="w-14 p-1.5 border border-gray-300 rounded text-center font-bold text-sm" min="1" />
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={() => commit('name')} className="flex-1 p-1.5 border border-gray-300 rounded text-sm" placeholder="Unit name" />
        <span className="text-xs font-mono text-gray-500 px-2">{unit.lessons.length} lesson{unit.lessons.length === 1 ? '' : 's'}</span>
        <button onClick={onDelete} className="px-2 py-1 text-red-600 hover:bg-red-100 rounded text-sm" title="Delete unit">🗑</button>
      </div>
      <div className="flex justify-end"><StatusControls
                  status={selectedCourse.status}
                  onChange={(s) => setStatus('courses', selectedCourse.id, s)}
                  onSendForApproval={() => sendForApproval('courses', selectedCourse.id)}
                  onApprove={() => approveContent('courses', selectedCourse.id)}
                  onDeny={() => denyContent('courses', selectedCourse.id)}
                  role={currentRole}
                  isOwnContent={false}
                  contentTable="courses"
                /></div>
    </div>
  )
}

// ============ LESSON META ============
function LessonMetaEditor({ lesson, onUpdate }) {
  const [draft, setDraft] = useState(lesson)
  useEffect(() => setDraft(lesson), [lesson.id])
  function commit(field) { if (draft[field] !== lesson[field]) onUpdate(lesson.id, field, draft[field]) }

  return (
    <div className="bg-white border-2 border-gray-900 rounded-xl p-4 grid grid-cols-1 md:grid-cols-[1fr_80px] gap-3">
      <Field label="Lesson title"><input value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => commit('title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
      <Field label="Icon"><input value={draft.icon || ''} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} onBlur={() => commit('icon')} maxLength={3} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white text-center" /></Field>
      <Field label="Description" full><input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={() => commit('description')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>
    </div>
  )
}

// ============ ITEM CARD (handles both questions and readings) ============
function ItemCard({ index, item, isFirst, isLast, onSaveQuestion, onSaveReading, onDelete, onStatusChange, onSendForApproval, onApprove, onDeny, onMoveUp, onMoveDown, onTogglePool, role, currentUserId }) {
  if (item._kind === 'question') {
    return (
      <QuestionCardInner
        index={index} question={item}
        isFirst={isFirst} isLast={isLast}
        onSave={onSaveQuestion} onDelete={onDelete}
        onStatusChange={onStatusChange}
        onSendForApproval={onSendForApproval}
        onApprove={onApprove}
        onDeny={onDeny}
        onMoveUp={onMoveUp} onMoveDown={onMoveDown}
        onTogglePool={onTogglePool}
        role={role}
        currentUserId={currentUserId}
      />
    )
  }
  return (
    <ReadingCardInner
      index={index} reading={item}
      isFirst={isFirst} isLast={isLast}
      onSave={onSaveReading} onDelete={onDelete}
      onStatusChange={onStatusChange}
      onSendForApproval={onSendForApproval}
      onApprove={onApprove}
      onDeny={onDeny}
      onMoveUp={onMoveUp} onMoveDown={onMoveDown}
      role={role}
      currentUserId={currentUserId}
    />
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

// ============ QUESTION CARD ============
function QuestionCardInner({ index, question, isFirst, isLast, onSave, onDelete, onStatusChange, onSendForApproval, onApprove, onDeny, onMoveUp, onMoveDown, onTogglePool, role, currentUserId }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(question)

  function startEdit() { setDraft(question); setEditing(true) }
  async function save() { const ok = await onSave(draft); if (ok) setEditing(false) }
  function cancel() { setDraft(question); setEditing(false) }

  if (editing) {
    return (
      <div className="bg-white border-[3px] rounded-xl p-5 shadow-[4px_4px_0_#1a1d29]" style={{ borderColor: '#00b395' }}>
        <div className="flex justify-between items-center mb-4">
          <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>📝 Editing question (item {index + 1})</p>
          <div className="flex gap-2">
            <button onClick={cancel} className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 bg-green-600 text-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">✓ Save</button>
          </div>
        </div>

        <Field label="Question"><textarea value={draft.stem} onChange={(e) => setDraft({ ...draft, stem: e.target.value })} rows={3} className="w-full p-2 border-2 border-gray-900 rounded-lg" style={{ background: '#f6fbf8' }} /></Field>

        <p className="text-xs font-mono uppercase tracking-widest text-gray-600 mt-3 mb-2 font-bold">Choices — click the dot to mark the correct one</p>
        {draft.choices.map((choice, i) => (
          <div key={i} className="flex gap-2 items-center mb-2">
            <input
              type="radio"
              name={`correct-${question.id}`}
              checked={draft.answer === i}
              onChange={() => setDraft({ ...draft, answer: i })}
              className="w-5 h-5 cursor-pointer"
              style={{ accentColor: '#00b395' }}
            />
            <span
              className="w-7 h-7 border-2 border-gray-900 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0"
              style={draft.answer === i ? { background: '#00b395', color: 'white' } : { background: '#f6fbf8' }}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <input
              type="text"
              value={choice}
              onChange={(e) => {
                const c = [...draft.choices]
                c[i] = e.target.value
                setDraft({ ...draft, choices: c })
              }}
              className="flex-1 p-2 border-2 border-gray-900 rounded-lg bg-white"
            />
            <button
              type="button"
              onClick={() => {
                if (draft.choices.length <= 2) {
                  alert('A question needs at least 2 choices.')
                  return
                }
                const newChoices = draft.choices.filter((_, idx) => idx !== i)
                let newAnswer = draft.answer
                if (draft.answer === i) newAnswer = 0 // reset to first choice if we deleted the answer
                else if (draft.answer > i) newAnswer = draft.answer - 1 // shift down
                setDraft({ ...draft, choices: newChoices, answer: newAnswer })
              }}
              className="px-2 py-1 text-red-600 hover:bg-red-100 rounded text-sm border border-transparent hover:border-red-300"
              title="Delete this choice"
              disabled={draft.choices.length <= 2}
            >
              🗑
            </button>
          </div>
        ))}

        {draft.choices.length < 8 && (
          <button
            type="button"
            onClick={() => {
              setDraft({ ...draft, choices: [...draft.choices, `Option ${String.fromCharCode(65 + draft.choices.length)}`] })
            }}
            className="mt-1 px-3 py-1.5 bg-white border-2 border-dashed border-gray-400 rounded-lg text-xs font-bold text-gray-700 hover:border-gray-900 hover:bg-gray-50 transition-all"
          >
            + Add choice
          </button>
        )}

        <div className="mt-3"><Field label="Explanation"><textarea value={draft.explanation || ''} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} rows={2} className="w-full p-2 border-2 border-gray-900 rounded-lg" style={{ background: '#f6fbf8' }} /></Field></div>
      </div>
    )
  }

  return (
    <div className="bg-white border-2 border-gray-900 rounded-xl p-4 shadow-[3px_3px_0_#1a1d29] flex gap-3">
      <ReorderControls isFirst={isFirst} isLast={isLast} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
      <div className="flex-1">
        <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
          <p className="text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-2" style={{ color: '#00b395' }}>
            📝 Question — item {index + 1}
            <StatusDot status={question.status} />
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900 ${
                question.pool === 'practice' ? 'text-gray-900' : 'text-white'
              }`}
              style={{ background: question.pool === 'practice' ? '#fbbf24' : '#00b395' }}
            >
              {question.pool === 'practice' ? 'PRACTICE' : 'LESSON'}
            </span>
          </p>
          <div className="flex gap-1.5 flex-wrap items-center">
            <button
              onClick={onTogglePool}
              className="px-3 py-1 bg-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
              title={`Move to ${question.pool === 'practice' ? 'lesson' : 'practice'} pool`}
            >
              ↔ {question.pool === 'practice' ? 'To lesson' : 'To practice'}
            </button>
           <StatusControls
              status={question.status}
              onChange={onStatusChange}
              onSendForApproval={onSendForApproval}
              onApprove={onApprove}
              onDeny={onDeny}
              role={role}
              isOwnContent={question.created_by === currentUserId}
            />
            <button onClick={startEdit} className="px-3 py-1 bg-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]">Edit</button>
            <button onClick={onDelete} className="px-3 py-1 bg-red-500 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]">Delete</button>
          </div>
        </div>
        <p className="font-bold text-sm mb-3 leading-snug">{question.stem}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
          {question.choices.map((c, i) => (
            <div key={i} className={`px-2 py-1.5 rounded flex items-center gap-1.5 ${i === question.answer ? 'bg-green-100 text-green-900 font-bold' : 'bg-gray-50 text-gray-700'}`}>
              <span className="font-black flex-shrink-0">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1">{c}</span>
              {i === question.answer && <span className="ml-auto">✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ READING CARD ============
function ReadingCardInner({ index, reading, isFirst, isLast, onSave, onDelete, onStatusChange, onSendForApproval, onApprove, onDeny, onMoveUp, onMoveDown, role, currentUserId }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(reading)

  function startEdit() { setDraft(reading); setEditing(true) }
  async function save() { const ok = await onSave(draft); if (ok) setEditing(false) }
  function cancel() { setDraft(reading); setEditing(false) }

  if (editing) {
    return (
      <div className="bg-white border-[3px] border-blue-500 rounded-xl p-5 shadow-[4px_4px_0_#1a1d29]">
        <div className="flex justify-between items-center mb-4">
          <p className="text-xs font-mono tracking-widest uppercase text-blue-700">📖 Editing reading (item {index + 1})</p>
          <div className="flex gap-2">
            <button onClick={cancel} className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 bg-green-600 text-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">✓ Save</button>
          </div>
        </div>

        <Field label="Reading title"><input value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" /></Field>

        <div className="mt-3">
          <p className="block text-xs font-mono tracking-widest uppercase text-gray-700 font-bold mb-2">Content</p>
          <RichEditor
            value={draft.content || ''}
            onChange={(html) => setDraft({ ...draft, content: html })}
          />
          <p className="text-xs text-gray-500 mt-2">
            💡 For images, paste a URL to a hosted image (e.g., from Wikipedia, Imgur, or your own image host). For videos, paste a regular YouTube URL.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-blue-50 border-2 border-gray-900 rounded-xl p-4 shadow-[3px_3px_0_#1a1d29] flex gap-3">
      <ReorderControls isFirst={isFirst} isLast={isLast} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
      <div className="flex-1">
        <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
          <p className="text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-2 text-blue-700">
            📖 Reading — item {index + 1}
            <StatusDot status={reading.status} />
          </p>
          <div className="flex justify-end">
        <StatusControls
              status={reading.status}
              onChange={onStatusChange}
              onSendForApproval={onSendForApproval}
              onApprove={onApprove}
              onDeny={onDeny}
              role={role}
              isOwnContent={reading.created_by === currentUserId}
            />
      </div>
        </div>
        <h4 className="font-black text-base mb-2">{reading.title}</h4>
        <div className="text-xs text-gray-700 max-h-24 overflow-hidden relative">
          <div dangerouslySetInnerHTML={{ __html: reading.content || '<em>(empty)</em>' }} />
          {reading.content && reading.content.length > 200 && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-blue-50 to-transparent" />
          )}
        </div>
      </div>
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