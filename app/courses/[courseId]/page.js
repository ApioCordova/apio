'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function CoursePage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.courseId

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [course, setCourse] = useState(null)
  const [units, setUnits] = useState([])
  const [completedLessonIds, setCompletedLessonIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [popupLessonId, setPopupLessonId] = useState(null)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(profileData)

      // First check if user is admin (admins see all content including drafts)
const { data: profileCheck } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single()
const isAdminUser = profileCheck?.role === 'admin' || profileCheck?.role === 'editor'

let courseQuery = supabase
  .from('courses')
  .select(`*, units (*, lessons (*))`)
  .eq('id', courseId)
  .single()

const { data: courseData, error: courseError } = await courseQuery

// If not admin, filter out non-published units and lessons client-side
// (RLS already hides drafts from students at the DB level, but this is belt-and-suspenders)
if (courseData && !isAdminUser) {
  courseData.units = (courseData.units || []).filter(u => u.status === 'published')
  courseData.units.forEach(u => {
    u.lessons = (u.lessons || []).filter(l => l.status === 'published')
  })
}

      if (courseError || !courseData) {
        setLoading(false)
        return
      }

      const sortedUnits = (courseData.units || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((u) => ({
          ...u,
          lessons: (u.lessons || []).sort((a, b) => a.sort_order - b.sort_order),
        }))

      setCourse(courseData)
      setUnits(sortedUnits)

      const { data: progressData } = await supabase
        .from('progress')
        .select('lesson_id')
        .eq('user_id', user.id)
      setCompletedLessonIds(new Set((progressData || []).map((p) => p.lesson_id)))

      setLoading(false)
    }
    loadData()
  }, [courseId, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}>
        <p className="text-gray-600 font-mono text-sm">Loading course...</p>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: '#f6fbf8' }}>
        <h1 className="text-3xl font-black tracking-tight mb-3">Course not found</h1>
        <p className="text-gray-600 mb-6">This course doesn't exist or isn't published yet.</p>
        <Link href="/dashboard" className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>
          ← Back to courses
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-6 py-3 flex items-center justify-between sticky top-0 z-40" style={{ background: '#b4f1e7' }}>
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image src="/apio-logo.png" alt="Apio" width={36} height={36} className="rounded-lg" />
          <span className="text-2xl font-black tracking-tight">Apio</span>
        </Link>

        <div className="flex gap-2">
          <div className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29]">
            🔥 {profile?.streak ?? 0}
          </div>
          <div className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29]">
            ⚡ {profile?.xp ?? 0}
          </div>
          <div className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29]">
            ♥ {profile?.hearts ?? 5}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-3xl mx-auto p-6 pb-20">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 px-4 py-2 mb-6 bg-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
        >
          ← All courses
        </Link>

        <div className="mb-2">
          <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>
            // {course.short_title}
          </p>
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-8">
          {course.title}
        </h1>

        {units.map((unit) => {
          const total = unit.lessons.length
          const done = unit.lessons.filter((l) => completedLessonIds.has(l.id)).length
          const pct = total ? (done / total) * 100 : 0
          const circumference = 2 * Math.PI * 26
          const dashOffset = circumference - (pct / 100) * circumference

          const currentLessonId = unit.lessons.find((l) => !completedLessonIds.has(l.id))?.id

          return (
            <div key={unit.id} className="mb-12">
              {/* Unit banner */}
              <div className="bg-gray-900 text-white rounded-2xl p-6 mb-8 flex justify-between items-center flex-wrap gap-4 shadow-[6px_6px_0_#1a1d29]">
                <div>
                  <p className="text-xs font-mono tracking-widest mb-1" style={{ color: '#00b395' }}>
                    UNIT {unit.number} — {course.short_title.toUpperCase()}
                  </p>
                  <h2 className="text-2xl font-black tracking-tight leading-tight">{unit.name}</h2>
                </div>
                <div className="relative w-16 h-16">
                  <svg width="64" height="64" className="-rotate-90">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="#00b395"
                      strokeWidth="6"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-black text-sm" style={{ color: '#00b395' }}>
                    {Math.round(pct)}%
                  </div>
                </div>
              </div>

              {/* Lesson nodes (zigzag) */}
              <div className="relative">
                {unit.lessons.map((lesson, idx) => {
                  const isCompleted = completedLessonIds.has(lesson.id)
                  const isCurrent = lesson.id === currentLessonId
                  const prevLesson = unit.lessons[idx - 1]
                  const isLocked =
                    !isCompleted &&
                    !isCurrent &&
                    prevLesson &&
                    !completedLessonIds.has(prevLesson.id)

                  const offsets = [0, 80, 120, 80, -40]
                  const offset = offsets[idx % 5]

                  let nodeBg = 'bg-white text-gray-900'
                  let nodeStyle = {}
                  if (isCompleted) {
                    nodeBg = 'text-white'
                    nodeStyle = { background: '#00b395' }
                  } else if (isCurrent) {
                    nodeBg = 'text-white animate-pulse'
                    nodeStyle = { background: '#00b395' }
                  } else if (isLocked) {
                    nodeBg = 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }

                  return (
                    <div
                      key={lesson.id}
                      className="flex justify-center mb-12 relative"
                      style={{ transform: `translateX(${offset}px)` }}
                    >
                      <div className="relative">
                        <button
                          onClick={() => {
                            if (isLocked) return
                            setPopupLessonId(popupLessonId === lesson.id ? null : lesson.id)
                          }}
                          disabled={isLocked}
                          className={`${nodeBg} w-22 h-22 rounded-full border-[4px] border-gray-900 shadow-[0_6px_0_#1a1d29] hover:translate-y-[-2px] hover:shadow-[0_8px_0_#1a1d29] transition-all flex items-center justify-center text-3xl disabled:hover:translate-y-0 disabled:hover:shadow-[0_6px_0_#1a1d29]`}
                          style={{ width: '92px', height: '92px', ...nodeStyle }}
                        >
                          {isCompleted ? '✓' : isLocked ? '🔒' : lesson.icon}
                        </button>

                        <p className="absolute left-1/2 -translate-x-1/2 -bottom-7 text-xs font-bold uppercase tracking-wide text-gray-700 whitespace-nowrap">
                          {lesson.title}
                        </p>

                        {popupLessonId === lesson.id && !isLocked && (
                          <div className="absolute top-0 left-[110%] z-30 w-60 bg-gray-900 text-white p-4 rounded-xl shadow-[4px_4px_0_#1a1d29]">
                            <h4 className="font-black text-base mb-1">{lesson.title}</h4>
                            <p className="text-xs text-gray-300 mb-3">{lesson.description}</p>
                            <Link
                              href={`/lessons/${lesson.id}`}
                              className="block text-center w-full px-3 py-2 text-white rounded-full font-bold text-sm border-2 border-white hover:opacity-80 transition-colors"
                              style={{ background: '#00b395' }}
                            >
                              {isCompleted ? 'Practice again' : 'Start lesson'} →
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}