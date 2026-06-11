'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminSectionsPage() {
  const [role, setRole] = useState(null)
  const [sections, setSections] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    setRole(profile?.role)

    const [{ data: sectionsData }, { data: coursesData }] = await Promise.all([
      supabase.from('sections').select('*').order('sort_order'),
      supabase.from('courses').select('id, title, short_title, section_id, status').order('sort_order'),
    ])
    setSections(sectionsData || [])
    setCourses(coursesData || [])
    setLoading(false)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200) }

  const isAdmin = role === 'admin' || role === 'editor'

  // ============ CRUD ============
  async function addSection() {
    const id = `section-${Date.now()}`
    const { error } = await supabase.from('sections').insert({
      id, name: 'New Section', description: '', icon: '🗂', tone: '#00b395',
      sort_order: sections.length + 1, status: 'draft',
    })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast('Draft section created'); await loadAll()
  }

  async function updateField(id, field, value) {
    await supabase.from('sections').update({ [field]: value }).eq('id', id)
    setSections((s) => s.map((x) => (x.id === id ? { ...x, [field]: value } : x)))
  }

  async function setStatus(id, status) {
    await supabase.from('sections').update({ status }).eq('id', id)
    showToast(status === 'published' ? '✓ Published' : 'Set to ' + status)
    setSections((s) => s.map((x) => (x.id === id ? { ...x, status } : x)))
  }

  async function deleteSection(id, name) {
    if (!confirm(`Delete section "${name}"?\n\nCourses inside it are NOT deleted — they just become unassigned and drop off the home screen until you re-assign them.`)) return
    await supabase.from('sections').delete().eq('id', id)
    showToast('Section deleted'); await loadAll()
  }

  // Re-stamp ALL sort_order values 1..n so order stays clean (no swap dupes)
  async function moveSection(section, direction) {
    const idx = sections.findIndex((s) => s.id === section.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sections.length) return
    const reordered = [...sections]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    setSections(reordered) // optimistic
    await Promise.all(
      reordered.map((s, i) => supabase.from('sections').update({ sort_order: i + 1 }).eq('id', s.id))
    )
    await loadAll()
  }

  async function assignCourse(courseId, sectionId) {
    const value = sectionId === '' ? null : sectionId
    await supabase.from('courses').update({ section_id: value }).eq('id', courseId)
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, section_id: value } : c)))
    showToast('Course moved')
  }

  if (loading) return <p className="text-gray-600 font-mono text-sm">Loading sections...</p>

  if (!isAdmin) {
    return (
      <div>
        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// dashboard sections</p>
        <h1 className="text-3xl font-black tracking-tight mb-3">Sections</h1>
        <p className="text-gray-700">Only admins can manage dashboard sections.</p>
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

      <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// dashboard sections</p>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h1 className="text-3xl font-black tracking-tight">Dashboard Sections</h1>
        <button onClick={addSection} className="px-4 py-2 text-white border-2 border-gray-900 rounded-lg font-bold text-sm shadow-[3px_3px_0_#1a1d29]" style={{ background: '#00b395' }}>+ Add section</button>
      </div>
      <p className="text-gray-700 max-w-2xl mb-6">
        These are the top-level cards students see on the home screen. Each one opens to its own dashboard of courses. Reorder them, set a color, and publish when ready.
      </p>

      {/* Sections list */}
      <div className="flex flex-col gap-3 mb-12">
        {sections.length === 0 && (
          <div className="text-center p-10 border-2 border-dashed border-gray-400 rounded-xl">
            <p className="text-gray-700 font-bold">No sections yet</p>
            <p className="text-sm text-gray-500 mt-1">Add your first section to get started.</p>
          </div>
        )}

        {sections.map((section, i) => (
          <SectionRow
            key={section.id}
            section={section}
            isFirst={i === 0}
            isLast={i === sections.length - 1}
            courseCount={courses.filter((c) => c.section_id === section.id).length}
            onUpdate={updateField}
            onStatus={setStatus}
            onDelete={deleteSection}
            onMoveUp={() => moveSection(section, 'up')}
            onMoveDown={() => moveSection(section, 'down')}
          />
        ))}
      </div>

      {/* Course assignment */}
      <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// assign courses</p>
      <h2 className="text-2xl font-black tracking-tight mb-3">Which section is each course in?</h2>
      <p className="text-gray-700 max-w-2xl mb-4">
        Pick a section for every course. Unassigned courses won&apos;t appear on the home screen until you place them in a section.
      </p>
      <div className="border-2 border-gray-900 rounded-xl overflow-hidden">
        {courses.length === 0 && <p className="p-4 text-sm text-gray-600">No courses yet.</p>}
        {courses.map((course, i) => (
          <div key={course.id} className={`flex items-center justify-between gap-3 p-3 flex-wrap ${i % 2 ? 'bg-gray-50' : 'bg-white'}`}>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{course.title}</p>
              <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">{course.status}</p>
            </div>
            <select
              value={course.section_id || ''}
              onChange={(e) => assignCourse(course.id, e.target.value)}
              className="p-2 border-2 border-gray-900 rounded-lg font-bold text-sm bg-white"
            >
              <option value="">— Unassigned —</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ SECTION ROW ============
function SectionRow({ section, isFirst, isLast, courseCount, onUpdate, onStatus, onDelete, onMoveUp, onMoveDown }) {
  const [draft, setDraft] = useState(section)
  useEffect(() => setDraft(section), [section.id])
  function commit(field) { if (draft[field] !== section[field]) onUpdate(section.id, field, draft[field]) }

  const statusStyle = {
    draft: { background: '#f3f4f6', color: '#374151' },
    published: { background: '#d1f5ed', color: '#065f46' },
    archived: { background: '#fde2e2', color: '#7f1d1d' },
  }[section.status] || { background: '#f3f4f6', color: '#374151' }

  const toneColor = /^#[0-9a-fA-F]{6}$/.test(draft.tone) ? draft.tone : '#00b395'

  return (
    <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-4 shadow-[4px_4px_0_#1a1d29]">
      <div className="flex gap-3">
        {/* reorder */}
        <div className="flex flex-col gap-0.5 pt-1">
          <button onClick={onMoveUp} disabled={isFirst} className="px-2 py-0.5 bg-white border border-gray-900 rounded text-xs font-bold disabled:opacity-30">↑</button>
          <button onClick={onMoveDown} disabled={isLast} className="px-2 py-0.5 bg-white border border-gray-900 rounded text-xs font-bold disabled:opacity-30">↓</button>
        </div>

        {/* icon preview */}
        <div className="w-14 h-14 border-2 border-gray-900 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 shadow-[2px_2px_0_#1a1d29]" style={{ background: toneColor, color: '#fff' }}>
          {draft.icon}
        </div>

        {/* fields */}
        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[10px] font-mono tracking-widest uppercase text-gray-600 font-bold mb-1">Name</span>
            <input value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={() => commit('name')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white font-bold" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-mono tracking-widest uppercase text-gray-600 font-bold mb-1">Icon (emoji)</span>
            <input value={draft.icon || ''} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} onBlur={() => commit('icon')} maxLength={3} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white text-center" />
          </label>
          <label className="block md:col-span-2">
            <span className="block text-[10px] font-mono tracking-widest uppercase text-gray-600 font-bold mb-1">Description</span>
            <input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={() => commit('description')} className="w-full p-2 border-2 border-gray-900 rounded-lg bg-white" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-mono tracking-widest uppercase text-gray-600 font-bold mb-1">Color</span>
            <div className="flex items-center gap-2">
              <input type="color" value={toneColor} onChange={(e) => setDraft({ ...draft, tone: e.target.value })} onBlur={() => commit('tone')} className="w-10 h-10 border-2 border-gray-900 rounded-lg cursor-pointer p-0.5" />
              <input value={draft.tone || ''} onChange={(e) => setDraft({ ...draft, tone: e.target.value })} onBlur={() => commit('tone')} className="flex-1 p-2 border-2 border-gray-900 rounded-lg bg-white font-mono text-sm" />
            </div>
          </label>
          <div className="flex items-end">
            <span className="text-xs font-mono text-gray-600">◆ {courseCount} course{courseCount === 1 ? '' : 's'} assigned</span>
          </div>
        </div>
      </div>

      {/* status + actions */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t-2 border-gray-100 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase border-2 border-gray-900" style={statusStyle}>{section.status}</span>
        <div className="flex gap-1.5 flex-wrap">
          {section.status !== 'published' && <button onClick={() => onStatus(section.id, 'published')} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#d1f5ed', color: '#065f46' }}>Publish</button>}
          {section.status !== 'draft' && <button onClick={() => onStatus(section.id, 'draft')} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#f3f4f6', color: '#374151' }}>Move to draft</button>}
          {section.status !== 'archived' && <button onClick={() => onStatus(section.id, 'archived')} className="px-3 py-1 border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#fde2e2', color: '#7f1d1d' }}>Archive</button>}
          <button onClick={() => onDelete(section.id, section.name)} className="px-3 py-1 bg-red-500 text-white border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]">Delete</button>
        </div>
      </div>
    </div>
  )
}