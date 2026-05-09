'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminContentPage() {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [selectedLessonId, setSelectedLessonId] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'draft' | 'published'

  useEffect(() => {
    loadCourses()
  }, [])

  useEffect(() => {
    if (selectedLessonId) loadQuestions(selectedLessonId)
    else setQuestions([])
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

  async function loadQuestions(lessonId) {
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order')
    setQuestions(data || [])
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  // ============ STATUS UPDATES ============
  async function setCourseStatus(courseId, status) {
    await supabase.from('courses').update({ status }).eq('id', courseId)
    showToast(status === 'published' ? '✓ Course published' : 'Course set to ' + status)
    await loadCourses()
  }

  async function setUnitStatus(unitId, status) {
    await supabase.from('units').update({ status }).eq('id', unitId)
    showToast(status === 'published' ? '✓ Unit published' : 'Unit set to ' + status)
    await loadCourses()
  }

  async function setLessonStatus(lessonId, status) {
    await supabase.from('lessons').update({ status }).eq('id', lessonId)
    showToast(status === 'published' ? '✓ Lesson published' : 'Lesson set to ' + status)
    await loadCourses()
  }

  async function setQuestionStatus(questionId, status) {
    await supabase.from('questions').update({ status }).eq('id', questionId)
    showToast(status === 'published' ? '✓ Question published' : 'Question set to ' + status)
    await loadQuestions(selectedLessonId)
  }

  // ============ COURSE ============
  async function updateCourseField(courseId, field, value) {
    await supabase.from('courses').update({ [field]: value }).eq('id', courseId)
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, [field]: value } : c)))
  }

  async function addCourse() {
    const id = `course-${Date.now()}`
    const { error } = await supabase.from('courses').insert({
      id,
      title: 'New AP Course',
      short_title: 'New',
      description: 'Click to edit description.',
      icon: '★',
      tone: 'default',
      sort_order: courses.length + 1,
      status: 'draft',
    })
    if (error) {
      showToast('Failed: ' + error.message)
      return
    }
    showToast('Draft course created')
    await loadCourses()
    setSelectedCourseId(id)
  }

  async function deleteCourse(courseId, courseTitle) {
    const ok = confirm(`Delete "${courseTitle}" and ALL its units, lessons, questions, and student progress?\n\nThis cannot be undone.`)
    if (!ok) return
    const confirmText = prompt(`Type the course title to confirm:\n\n${courseTitle}`)
    if (confirmText !== courseTitle) {
      showToast('Title did not match — course NOT deleted')
      return
    }
    const { error } = await supabase.from('courses').delete().eq('id', courseId)
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Course deleted')
    setSelectedLessonId(null)
    setSelectedCourseId(null)
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
    const ok = confirm(`Delete unit "${unitName}" and all ${lessonCount} of its lessons + questions + student progress?\n\nThis cannot be undone.`)
    if (!ok) return
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
    const ok = confirm(`Delete lesson "${lessonTitle}" and all its questions + student progress?\n\nThis cannot be undone.`)
    if (!ok) return
    const { error } = await supabase.from('lessons').delete().eq('id', lessonId)
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Lesson deleted')
    setSelectedLessonId(null)
    await loadCourses()
  }

  // ============ QUESTIONS ============
  async function addQuestion() {
    if (!selectedLessonId) return
    const sortOrder = questions.length + 1
    const { error } = await supabase.from('questions').insert({
      lesson_id: selectedLessonId,
      stem: 'Enter your question here.',
      choices: ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: 0, explanation: 'Why this answer is correct.',
      sort_order: sortOrder, status: 'draft',
    })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft question added — scroll down to edit')
    await loadQuestions(selectedLessonId)
  }

  async function updateQuestion(questionId, draft) {
    const { error } = await supabase.from('questions').update({
      stem: draft.stem, choices: draft.choices,
      answer: draft.answer, explanation: draft.explanation,
    }).eq('id', questionId)
    if (error) { showToast('Save failed: ' + error.message); return false }
    showToast('Question saved')
    await loadQuestions(selectedLessonId)
    return true
  }

  async function deleteQuestion(questionId) {
    if (!confirm('Delete this question? This cannot be undone.')) return
    await supabase.from('questions').delete().eq('id', questionId)
    showToast('Question deleted')
    await loadQuestions(selectedLessonId)
  }

  // ============ RENDER ============
  if (loading) {
    return <p className="text-gray-600 font-mono text-sm">Loading content...</p>
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId)
  const selectedLesson = selectedCourse?.units
    .flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u })))
    .find((l) => l.id === selectedLessonId)

  // Filter questions by status
  const filteredQuestions = statusFilter === 'all'
    ? questions
    : questions.filter((q) => q.status === statusFilter)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 -m-2">
      {/* Sidebar */}
      <aside className="bg-white border-2 border-gray-900 rounded-xl p-3 max-h-[80vh] overflow-y-auto" style={{ background: '#f6fbf8' }}>
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
                <button
                  onClick={() => deleteCourse(course.id, course.title)}
                  className="px-2 py-1 text-xs rounded text-red-600 hover:bg-red-100"
                  title="Delete course"
                >
                  🗑
                </button>
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
                      <button
                        onClick={() => deleteUnit(unit.id, unit.name, unit.lessons.length)}
                        className="px-1.5 py-0.5 text-xs text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded"
                        title="Delete unit"
                      >
                        🗑
                      </button>
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
                        <button
                          onClick={() => deleteLesson(lesson.id, lesson.title)}
                          className="px-1.5 py-0.5 text-xs text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded"
                          title="Delete lesson"
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addLesson(unit.id)}
                      className="w-full text-left px-3 py-1.5 ml-2 rounded-md text-xs text-gray-600 hover:bg-gray-100 italic"
                    >
                      + Add lesson
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addUnit(course.id)}
                  className="w-full text-left px-3 py-1.5 ml-2 mt-1 rounded-md text-xs text-gray-600 hover:bg-gray-100 italic font-bold"
                >
                  + Add unit
                </button>
              </>
            )}
          </div>
        ))}
        <button
          onClick={addCourse}
          className="w-full mt-3 px-3 py-2 border-2 border-dashed border-gray-400 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 hover:border-solid"
        >
          + Add course
        </button>
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
                  onChange={(s) => setCourseStatus(selectedCourse.id, s)}
                />
              )}
            </div>
            <p className="text-gray-700 max-w-xl mb-6">
              {selectedCourse
                ? 'Edit course details below, manage units, or pick a lesson in the sidebar to manage questions.'
                : 'Choose a course in the sidebar, then click any lesson to edit its questions.'}
            </p>

            {selectedCourse && (
              <>
                <div className="p-5 bg-white border-2 border-gray-900 rounded-xl mb-5">
                  <p className="text-xs font-mono tracking-widest text-gray-600 uppercase mb-3">// course details</p>
                  <CourseEditor course={selectedCourse} onUpdate={updateCourseField} />
                </div>

                <div className="p-5 bg-white border-2 border-gray-900 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-xs font-mono tracking-widest text-gray-600 uppercase">
                      // units in this course ({selectedCourse.units.length})
                    </p>
                    <button
                      onClick={() => addUnit(selectedCourse.id)}
                      className="px-3 py-1.5 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
                      style={{ background: '#00b395' }}
                    >
                      + Add unit
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {selectedCourse.units.map((unit) => (
                      <UnitRow
                        key={unit.id}
                        unit={unit}
                        onUpdate={updateUnitField}
                        onStatusChange={(s) => setUnitStatus(unit.id, s)}
                        onDelete={() => deleteUnit(unit.id, unit.name, unit.lessons.length)}
                      />
                    ))}
                    {selectedCourse.units.length === 0 && (
                      <p className="text-sm text-gray-500 italic text-center py-4">
                        No units yet. Click "+ Add unit" to start.
                      </p>
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
              <div className="flex gap-2 items-center">
                <StatusControls
                  status={selectedLesson.status}
                  onChange={(s) => setLessonStatus(selectedLesson.id, s)}
                />
                <button
                  onClick={() => deleteLesson(selectedLesson.id, selectedLesson.title)}
                  className="px-3 py-1 bg-red-500 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
                >
                  Delete lesson
                </button>
              </div>
            </div>
            <h1 className="text-3xl font-black tracking-tight mb-5 leading-tight">{selectedLesson.title}</h1>

            <LessonMetaEditor lesson={selectedLesson} onUpdate={updateLessonField} />

            <div className="flex justify-between items-center mt-7 mb-3 flex-wrap gap-3">
              <h2 className="text-xl font-black tracking-tight">
                Questions{' '}
                <span className="text-sm font-mono text-gray-500 ml-1">({filteredQuestions.length} of {questions.length})</span>
              </h2>
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2 py-1 border-2 border-gray-900 rounded-lg text-xs font-bold bg-white"
                >
                  <option value="all">All</option>
                  <option value="draft">Drafts only</option>
                  <option value="published">Published only</option>
                </select>
                <button
                  onClick={addQuestion}
                  className="px-4 py-2 text-white border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all"
                  style={{ background: '#00b395' }}
                >
                  + Add question
                </button>
              </div>
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="text-center p-10 border-2 border-dashed border-gray-400 rounded-xl">
                <p className="text-gray-700 mb-3">
                  {statusFilter === 'all' ? 'No questions yet. Add the first one!' : `No ${statusFilter} questions.`}
                </p>
                {statusFilter === 'all' && (
                  <button
                    onClick={addQuestion}
                    className="px-5 py-2.5 text-white border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29]"
                    style={{ background: '#00b395' }}
                  >
                    + Add first question
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredQuestions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    index={questions.indexOf(q)}
                    question={q}
                    onSave={(draft) => updateQuestion(q.id, draft)}
                    onDelete={() => deleteQuestion(q.id)}
                    onStatusChange={(s) => setQuestionStatus(q.id, s)}
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
  const color = status === 'published' ? '#00b395' : status === 'archived' ? '#9ca3af' : '#eab308'
  const size = small ? 6 : 8
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: color }}
      title={status}
    />
  )
}

// ============ STATUS CONTROLS ============
function StatusControls({ status, onChange }) {
  // Pill colors based on current status
  const pillStyle =
    status === 'published'
      ? { background: '#00b395', color: 'white' }
      : status === 'archived'
      ? { background: '#374151', color: 'white' } // dark gray
      : { background: '#fde047', color: '#1a1d29' } // yellow for draft

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Current status pill */}
      <span
        className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border-2 border-gray-900 shadow-[2px_2px_0_#1a1d29]"
        style={pillStyle}
      >
        Current status: {status}
      </span>

      {/* Action buttons — show only the ones that change to a different state */}
      {status !== 'published' && (
        <button
          onClick={() => onChange('published')}
          className="px-3 py-1 text-white border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          style={{ background: '#00b395' }}
        >
          Publish
        </button>
      )}
      {status !== 'draft' && (
        <button
          onClick={() => onChange('draft')}
          className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          style={{ background: '#fde047', color: '#1a1d29' }}
        >
          Move to draft
        </button>
      )}
      {status !== 'archived' && (
        <button
          onClick={() => onChange('archived')}
          className="px-3 py-1 text-white border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          style={{ background: '#374151' }}
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
      <Field label="Title">
        <input value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => commit('title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" />
      </Field>
      <Field label="Short title">
        <input value={draft.short_title || ''} onChange={(e) => setDraft({ ...draft, short_title: e.target.value })} onBlur={() => commit('short_title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" />
      </Field>
      <Field label="Description" full>
        <textarea value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={() => commit('description')} rows={2} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" />
      </Field>
      <Field label="Icon">
        <input value={draft.icon || ''} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} onBlur={() => commit('icon')} maxLength={3} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" />
      </Field>
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
function UnitRow({ unit, onUpdate, onStatusChange, onDelete }) {
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
      <div className="flex justify-end">
        <StatusControls status={unit.status} onChange={onStatusChange} />
      </div>
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
      <Field label="Lesson title">
        <input value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => commit('title')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" />
      </Field>
      <Field label="Icon">
        <input value={draft.icon || ''} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} onBlur={() => commit('icon')} maxLength={3} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white text-center" />
      </Field>
      <Field label="Description" full>
        <input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={() => commit('description')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" />
      </Field>
    </div>
  )
}

// ============ QUESTION CARD ============
function QuestionCard({ index, question, onSave, onDelete, onStatusChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(question)

  function startEdit() { setDraft(question); setEditing(true) }
  async function save() { const ok = await onSave(draft); if (ok) setEditing(false) }
  function cancel() { setDraft(question); setEditing(false) }

  if (editing) {
    return (
      <div className="bg-white border-[3px] border-gray-900 rounded-xl p-5 shadow-[4px_4px_0_#1a1d29]">
        <div className="flex justify-between items-center mb-4">
          <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>Editing question {index + 1}</p>
          <div className="flex gap-2">
            <button onClick={cancel} className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 bg-green-600 text-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">✓ Save</button>
          </div>
        </div>

        <Field label="Question">
          <textarea value={draft.stem} onChange={(e) => setDraft({ ...draft, stem: e.target.value })} rows={3} className="w-full p-2 border-2 border-gray-900 rounded-lg" style={{ background: '#f6fbf8' }} />
        </Field>

        <p className="text-xs font-mono uppercase tracking-widest text-gray-600 mt-3 mb-2 font-bold">
          Choices — click the dot to mark the correct one
        </p>
        {draft.choices.map((choice, i) => (
          <div key={i} className="flex gap-2 items-center mb-2">
            <input type="radio" name={`correct-${question.id}`} checked={draft.answer === i} onChange={() => setDraft({ ...draft, answer: i })} className="w-5 h-5 cursor-pointer" style={{ accentColor: '#00b395' }} />
            <span className={`w-7 h-7 border-2 border-gray-900 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0 ${draft.answer === i ? '' : ''}`} style={draft.answer === i ? { background: '#00b395', color: 'white' } : { background: '#f6fbf8' }}>
              {String.fromCharCode(65 + i)}
            </span>
            <input type="text" value={choice} onChange={(e) => { const c = [...draft.choices]; c[i] = e.target.value; setDraft({ ...draft, choices: c }) }} className="flex-1 p-2 border-2 border-gray-900 rounded-lg bg-white" />
          </div>
        ))}

        <div className="mt-3">
          <Field label="Explanation (shown after they answer)">
            <textarea value={draft.explanation || ''} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} rows={2} className="w-full p-2 border-2 border-gray-900 rounded-lg" style={{ background: '#f6fbf8' }} />
          </Field>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border-2 border-gray-900 rounded-xl p-4 shadow-[3px_3px_0_#1a1d29]">
      <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
        <p className="text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-2" style={{ color: '#00b395' }}>
          Question {index + 1}
          <StatusDot status={question.status} />
        </p>
        <div className="flex gap-1.5 flex-wrap">
          <StatusControls status={question.status} onChange={onStatusChange} />
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