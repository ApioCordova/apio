'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import MyClasses from './MyClasses'
import ClassCourseModal from './ClassCourseModal'
import Onboarding from './Onboarding'
import Announcement from './Announcement'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [sections, setSections] = useState([])      // published sections (picker grouping)
  const [catalog, setCatalog] = useState([])        // published courses (cards + picker)
  const [addedIds, setAddedIds] = useState(new Set()) // course ids the user added
  const [loading, setLoading] = useState(true)

  // UI state
  const [menuOpen, setMenuOpen] = useState(false)   // header "+" mini-bar
  const [pickerOpen, setPickerOpen] = useState(false) // self-study modal
  const [classModalOpen, setClassModalOpen] = useState(false) // class-course modal
  const [classModalStep, setClassModalStep] = useState('choose') // 'choose' | 'student' | 'teacher'
  const [showOnboarding, setShowOnboarding] = useState(false)  // first-visit welcome screen
  const [classRefresh, setClassRefresh] = useState(0) // bump to reload "Your classes"
  const [toast, setToast] = useState(null)

  const menuRef = useRef(null)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(profileData)
      if (profileData && profileData.onboarded === false) setShowOnboarding(true)

      const [{ data: sectionsData }, { data: coursesData }, { data: addedRows }] = await Promise.all([
        supabase.from('sections').select('*').eq('status', 'published').order('sort_order'),
        supabase.from('courses').select('*').eq('status', 'published').order('sort_order'),
        supabase.from('user_courses').select('course_id, kind').eq('user_id', user.id),
      ])
      setSections(sectionsData || [])
      setCatalog(coursesData || [])
      setAddedIds(new Set((addedRows || []).map((r) => r.course_id)))

      setLoading(false)
    }
    loadData()
  }, [router])

  // Close the header mini-bar when clicking anywhere outside it
  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function toggleCourse(courseId) {
    const isAdded = addedIds.has(courseId)

    // optimistic update
    setAddedIds((prev) => {
      const next = new Set(prev)
      if (isAdded) next.delete(courseId); else next.add(courseId)
      return next
    })

    if (isAdded) {
      const { error } = await supabase
        .from('user_courses')
        .delete()
        .eq('user_id', user.id)
        .eq('course_id', courseId)
      if (error) {
        showToast('Could not remove course')
        setAddedIds((prev) => { const n = new Set(prev); n.add(courseId); return n })
      }
    } else {
      const { error } = await supabase
        .from('user_courses')
        .insert({ user_id: user.id, course_id: courseId, kind: 'self_study' })
      if (error) {
        showToast('Could not add course')
        setAddedIds((prev) => { const n = new Set(prev); n.delete(courseId); return n })
      }
    }
  }

  function openSelfStudy() { setMenuOpen(false); setPickerOpen(true) }
  function openClassCourse() { setMenuOpen(false); setClassModalStep('choose'); setClassModalOpen(true) }

  async function completeOnboarding(kind) {
    setShowOnboarding(false)
    // Mark it done so the welcome screen never shows again.
    if (user) supabase.from('profiles').update({ onboarded: true }).eq('id', user.id).then(() => {})
    setProfile((p) => (p ? { ...p, onboarded: true } : p))
    if (kind === 'student') { setClassModalStep('student'); setClassModalOpen(true) }
    else if (kind === 'teacher') { setClassModalStep('teacher'); setClassModalOpen(true) }
    else if (kind === 'self') { setPickerOpen(true) }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}>
        <p className="text-gray-600 font-mono text-sm">Loading...</p>
      </div>
    )
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0]
  const initials = (displayName || '?').trim().charAt(0).toUpperCase()
  const isAdmin = ['admin', 'editor', 'reviewer', 'question_maker'].includes(profile?.role)

  const toneOf = (c) => {
    if (/^#[0-9a-fA-F]{6}$/.test(c.tone)) return c.tone
    if (c.tone === 'gov') return '#6b7280'
    if (c.tone === 'calc') return '#ef4444'
    return '#00b395'
  }

  const myCourses = catalog.filter((c) => addedIds.has(c.id))
  const hasCourses = myCourses.length > 0

  // Group the catalog by section for the picker
  const grouped = sections
    .map((s) => ({ section: s, courses: catalog.filter((c) => c.section_id === s.id) }))
    .filter((g) => g.courses.length > 0)
  const ungrouped = catalog.filter(
    (c) => !c.section_id || !sections.some((s) => s.id === c.section_id)
  )

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-gray-900 text-white rounded-full font-bold text-sm shadow-[4px_4px_0_#00b395]">
          {toast}
        </div>
      )}

      <Announcement />

      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-2" style={{ background: '#b4f1e7' }}>
        <div className="flex items-center gap-2">
          <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
          <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick-add "+" pill — only once the student has at least one course */}
          {hasCourses && (
            <div
              ref={menuRef}
              className="relative"
              onMouseEnter={() => setMenuOpen(true)}
            >
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Add a course"
                className="w-8 h-8 flex items-center justify-center bg-white border-2 border-gray-900 rounded-full text-lg font-black leading-none shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
              >
                +
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border-[2.5px] border-gray-900 rounded-xl shadow-[4px_4px_0_#1a1d29] overflow-hidden z-50">
                  <button onClick={openClassCourse} className="w-full text-left px-4 py-3 text-sm font-bold hover:bg-gray-100 border-b-2 border-gray-200">
                    🏫 Add class course
                  </button>
                  <button onClick={openSelfStudy} className="w-full text-left px-4 py-3 text-sm font-bold hover:bg-gray-100">
                    📚 Add self-study course
                  </button>
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              className="px-2.5 py-1 bg-gray-900 text-white rounded-full text-xs font-bold tracking-widest uppercase shadow-[2px_2px_0_#1a1d29]"
            >
              Admin
            </Link>
          )}
          <Link href="/profile" title="Your profile" className="shrink-0">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="Profile" className="w-9 h-9 rounded-full object-cover border-2 border-gray-900" />
            ) : (
              <div className="w-9 h-9 rounded-full border-2 border-gray-900 flex items-center justify-center font-black text-sm text-white" style={{ background: '#00b395' }}>
                {initials}
              </div>
            )}
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto p-8">
        <div className="mb-8 md:mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>
            Welcome back!
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-none mb-3">
            Howdy, <span className="italic font-normal" style={{ color: '#00b395' }}>{displayName}</span>.
          </h1>
          <p className="text-gray-700 max-w-xl text-sm md:text-base">
            What would you like to study today?
          </p>
        </div>

        {/* My courses */}
        {hasCourses && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            {myCourses.map((course) => {
              const toneColor = toneOf(course)
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="border-[3px] border-gray-900 rounded-2xl p-6 shadow-[6px_6px_0_#1a1d29] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0_#1a1d29] transition-all block"
                  style={{ background: `${toneColor}18` }}
                >
                  <div className="w-16 h-16 border-[2.5px] border-gray-900 rounded-xl flex items-center justify-center text-2xl font-black mb-4 shadow-[2px_2px_0_#1a1d29]" style={{ background: toneColor, color: '#fff' }}>
                    {course.icon || '📘'}
                  </div>
                  <h2 className="text-2xl font-black tracking-tight leading-tight mb-1">{course.title}</h2>
                  {course.description && <p className="text-sm text-gray-700 mb-2">{course.description}</p>}
                  {course.short_title && <p className="text-xs font-mono text-gray-500">{course.short_title}</p>}
                </Link>
              )
            })}
          </div>
        )}

        {/* Your classes */}
        <MyClasses refreshSignal={classRefresh} />

        {/* The two add-course buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <button
            onClick={openClassCourse}
            className="text-left border-[3px] border-dashed border-gray-400 rounded-2xl p-6 bg-white hover:border-gray-900 hover:shadow-[4px_4px_0_#1a1d29] transition-all"
          >
            <div className="w-14 h-14 border-2 border-gray-900 rounded-xl flex items-center justify-center text-2xl mb-3" style={{ background: '#fde68a' }}>🏫</div>
            <p className="text-lg font-black tracking-tight">Add a class course</p>
            <p className="text-sm text-gray-600">Track a class you&apos;re taking at school.</p>
          </button>

          <button
            onClick={openSelfStudy}
            className="text-left border-[3px] border-dashed border-gray-400 rounded-2xl p-6 bg-white hover:border-gray-900 hover:shadow-[4px_4px_0_#1a1d29] transition-all"
          >
            <div className="w-14 h-14 border-2 border-gray-900 rounded-xl flex items-center justify-center text-2xl mb-3" style={{ background: '#bbf7d0' }}>📚</div>
            <p className="text-lg font-black tracking-tight">Add a self-study course</p>
            <p className="text-sm text-gray-600">Pick from the AP courses Apio offers.</p>
          </button>
        </div>
      </div>

      {/* First-visit welcome screen */}
      <Onboarding
        open={showOnboarding}
        onPick={completeOnboarding}
        onSkip={() => completeOnboarding(null)}
      />

      {/* Class course modal */}
      <ClassCourseModal
        open={classModalOpen}
        onClose={() => setClassModalOpen(false)}
        onSuccess={() => setClassRefresh((n) => n + 1)}
        catalog={catalog}
        initialStep={classModalStep}
      />

      {/* Self-study picker modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-start justify-center p-4 md:p-8 overflow-y-auto"
          style={{ background: 'rgba(26,29,41,0.55)' }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white border-[3px] border-gray-900 rounded-2xl shadow-[8px_8px_0_#1a1d29] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b-[3px] border-gray-900">
              <div>
                <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>// self-study</p>
                <h2 className="text-2xl font-black tracking-tight">Add courses</h2>
              </div>
              <button onClick={() => setPickerOpen(false)} className="w-9 h-9 border-2 border-gray-900 rounded-full bg-white flex items-center justify-center font-bold shadow-[2px_2px_0_#1a1d29]" aria-label="Close">✕</button>
            </div>

            <div className="p-6 space-y-6">
              {catalog.length === 0 && (
                <p className="text-gray-600 text-sm">No courses are available yet. Check back soon!</p>
              )}

              {grouped.map(({ section, courses }) => (
                <div key={section.id}>
                  <p className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-2">{section.name}</p>
                  <div className="space-y-2">
                    {courses.map((c) => (
                      <PickerRow key={c.id} course={c} added={addedIds.has(c.id)} onToggle={() => toggleCourse(c.id)} tone={toneOf(c)} />
                    ))}
                  </div>
                </div>
              ))}

              {ungrouped.length > 0 && (
                <div>
                  <p className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-2">Other</p>
                  <div className="space-y-2">
                    {ungrouped.map((c) => (
                      <PickerRow key={c.id} course={c} added={addedIds.has(c.id)} onToggle={() => toggleCourse(c.id)} tone={toneOf(c)} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t-[3px] border-gray-900 flex justify-end">
              <button onClick={() => setPickerOpen(false)} className="px-6 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide text-sm shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PickerRow({ course, added, onToggle, tone }) {
  return (
    <div className="flex items-center gap-3 border-2 border-gray-900 rounded-xl p-3 bg-white">
      <div className="w-10 h-10 rounded-lg border-2 border-gray-900 flex items-center justify-center text-lg shrink-0" style={{ background: `${tone}33` }}>
        {course.icon || '📘'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-black tracking-tight truncate">{course.title}</p>
        {course.short_title && <p className="text-xs font-mono text-gray-500 truncate">{course.short_title}</p>}
      </div>
      <button
        onClick={onToggle}
        className={`px-3 py-1.5 rounded-full border-2 border-gray-900 text-xs font-black uppercase tracking-wide shadow-[2px_2px_0_#1a1d29] transition-all ${added ? 'bg-white' : 'text-white'}`}
        style={!added ? { background: '#00b395' } : {}}
      >
        {added ? 'Added ✓' : '+ Add'}
      </button>
    </div>
  )
}