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
  const [progressMap, setProgressMap] = useState({}) // { lessonId: { levels_completed, current_level } }
  const [levelCounts, setLevelCounts] = useState({}) // { lessonId: numberOfLevels }
  const [loading, setLoading] = useState(true)
  const [popupLessonId, setPopupLessonId] = useState(null)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(profileData)

      const { data: profileCheck } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      const isAdminUser = profileCheck?.role === 'admin' || profileCheck?.role === 'editor'

      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select(`*, units (*, lessons (*))`)
        .eq('id', courseId).single()

      if (courseData && !isAdminUser) {
        courseData.units = (courseData.units || []).filter(u => u.status === 'published')
        courseData.units.forEach(u => {
          u.lessons = (u.lessons || []).filter(l => l.status === 'published')
        })
      }

      if (courseError || !courseData) { setLoading(false); return }

      const sortedUnits = (courseData.units || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(u => ({ ...u, lessons: (u.lessons || []).sort((a, b) => a.sort_order - b.sort_order) }))

      setCourse(courseData)
      setUnits(sortedUnits)

      // Load progress with level info
      const { data: progressData } = await supabase
        .from('progress')
        .select('lesson_id, levels_completed, current_level, completed_at')
        .eq('user_id', user.id)
      const pMap = {}
      ;(progressData || []).forEach(p => { pMap[p.lesson_id] = p })
      setProgressMap(pMap)

      // Load level counts for all lessons in this course
      const allLessonIds = sortedUnits.flatMap(u => u.lessons.map(l => l.id))
      if (allLessonIds.length > 0) {
        const { data: levelsData } = await supabase
          .from('levels')
          .select('lesson_id, id')
          .in('lesson_id', allLessonIds)
          .eq('status', 'published')
        const counts = {}
        ;(levelsData || []).forEach(l => {
          counts[l.lesson_id] = (counts[l.lesson_id] || 0) + 1
        })
        setLevelCounts(counts)
      }

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
        <Link href="/dashboard" className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to courses</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-40" style={{ background: '#b4f1e7' }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
          <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
        </Link>
      </div>

      <div className="max-w-3xl mx-auto p-6 pb-20">
        <Link href="/dashboard" className="inline-flex items-center gap-1 px-4 py-2 mb-6 bg-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all">
          ← All courses
        </Link>

        <div className="mb-2">
          <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>// {course.short_title}</p>
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-8">{course.title}</h1>

        {units.map((unit) => {
          // Calculate unit progress based on levels
          const totalLevels = unit.lessons.reduce((sum, l) => sum + (levelCounts[l.id] || 1), 0)
          const completedLevels = unit.lessons.reduce((sum, l) => sum + (progressMap[l.id]?.levels_completed || 0), 0)
          const unitPct = totalLevels > 0 ? (completedLevels / totalLevels) * 100 : 0
          const unitCircumference = 2 * Math.PI * 26
          const unitDashOffset = unitCircumference - (unitPct / 100) * unitCircumference

          // Find the first lesson that isn't fully completed
          const currentLessonId = unit.lessons.find(l => {
            const maxLevels = levelCounts[l.id] || 1
            const completed = progressMap[l.id]?.levels_completed || 0
            return completed < maxLevels
          })?.id

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
                    <circle cx="32" cy="32" r="26" fill="none" stroke="#00b395" strokeWidth="6"
                      strokeDasharray={unitCircumference} strokeDashoffset={unitDashOffset} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-black text-sm" style={{ color: '#00b395' }}>
                    {Math.round(unitPct)}%
                  </div>
                </div>
              </div>

              {/* Lesson nodes */}
              <div className="relative">
                {unit.lessons.map((lesson, idx) => {
                  const maxLevels = levelCounts[lesson.id] || 1
                  const levelsCompleted = progressMap[lesson.id]?.levels_completed || 0
                  const isFullyCompleted = levelsCompleted >= maxLevels
                  const hasStarted = levelsCompleted > 0
                  const isCurrent = lesson.id === currentLessonId
                  const prevLesson = unit.lessons[idx - 1]
                  const prevMaxLevels = prevLesson ? (levelCounts[prevLesson.id] || 1) : 0
                  const prevCompleted = prevLesson ? (progressMap[prevLesson.id]?.levels_completed || 0) : maxLevels
                  const requiresSequential = course?.linear_progression !== false
                  const isLocked = requiresSequential && !isFullyCompleted && !isCurrent && !hasStarted && prevLesson && prevCompleted < prevMaxLevels
                  const offsets = [0, 40, 60, 40, -20]
                  const offset = offsets[idx % 5]

                  // Node colors
                  let nodeBg = 'bg-white text-gray-900'
                  let nodeStyle = {}
                  if (isFullyCompleted) {
                    nodeBg = 'text-gray-900'
                    nodeStyle = { background: '#fbbf24' }
                  } else if (isCurrent || hasStarted) {
                    nodeBg = 'text-white'
                    nodeStyle = { background: '#00b395' }
                  } else if (isLocked) {
                    nodeBg = 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }

                  // Ring segments
                  const ringRadius = 54
                  const ringCircumference = 2 * Math.PI * ringRadius
                  const segmentGap = maxLevels > 1 ? 6 : 0
                  const totalGap = segmentGap * maxLevels
                  const segmentLength = (ringCircumference - totalGap) / maxLevels

                  return (
                    <div
                      key={lesson.id}
                      className={`flex justify-center mb-14 relative ${popupLessonId === lesson.id ? 'z-40' : ''}`}
                      style={{ transform: `translateX(${offset}px)` }}
                    >
                      <div className="relative">
                        {/* Ring segments SVG */}
                        
                        {maxLevels > 0 && (
                          <svg
                            width="120" height="120"
                            className="absolute inset-0 -translate-x-3.5 -translate-y-2.75"
                            style={{
                              pointerEvents: 'none',
                            }}
                          >
                            {Array.from({ length: maxLevels }).map((_, segIdx) => {
                              const segOffset = segIdx * (segmentLength + segmentGap)
                              const isFilled = segIdx < levelsCompleted
                              return (
                                <circle
                                  key={segIdx}
                                  cx="60" cy="60" r={ringRadius}
                                  fill="none"
                                  stroke={isFilled ? '#fbbf24' : 'rgba(0,0,0,0.1)'}
                                  strokeWidth="5"
                                  strokeDasharray={`${segmentLength} ${ringCircumference - segmentLength}`}
                                  strokeDashoffset={-segOffset}
                                  strokeLinecap="round"
                                />
                              )
                            })}
                          </svg>
                        )}

                        <button
                          onClick={() => {
                            if (isLocked) return
                            setPopupLessonId(popupLessonId === lesson.id ? null : lesson.id)
                          }}
                          disabled={isLocked}
                          className={`${nodeBg} rounded-full border-[4px] border-gray-900 shadow-[0_6px_0_#1a1d29] hover:translate-y-[-2px] hover:shadow-[0_8px_0_#1a1d29] transition-all flex items-center justify-center text-3xl disabled:hover:translate-y-0 disabled:hover:shadow-[0_6px_0_#1a1d29] relative z-10`}
                          style={{ width: '92px', height: '92px', ...nodeStyle }}
                        >
                          {isFullyCompleted ? '✓' : isLocked ? '🔒' : lesson.icon}
                        </button>

                        {/* Lesson title + level indicator */}
                        <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 text-center">
                          <p className="text-xs font-bold uppercase tracking-wide text-gray-700 whitespace-nowrap">
                            {lesson.title}
                          </p>
                        </div>

                        {/* Popup */}
                        {popupLessonId === lesson.id && !isLocked && (
                          <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 md:top-0 md:mt-0 md:left-[110%] md:translate-x-0 z-50 w-64 bg-gray-900 text-white p-4 rounded-xl shadow-[4px_4px_0_#1a1d29]">
                            <h4 className="font-black text-base mb-1">{lesson.title}</h4>
                            <p className="text-xs text-gray-300 mb-1">{lesson.description}</p>
                            {maxLevels > 1 && (
                              <p className="text-xs mb-3" style={{ color: '#fbbf24' }}>
                                {isFullyCompleted
                                  ? '⭐ All levels mastered!'
                                  : `Level ${levelsCompleted + 1} of ${maxLevels}`}
                              </p>
                            )}
                            <div className="flex flex-col gap-2">
                              <Link
                                href={`/lessons/${lesson.id}`}
                                className="block text-center w-full px-3 py-2 text-white rounded-full font-bold text-sm border-2 border-white hover:opacity-80 transition-colors"
                                style={{ background: '#00b395' }}
                              >
                                {isFullyCompleted ? 'Review lesson' : hasStarted ? `Continue Level ${levelsCompleted + 1}` : 'Start lesson'} →
                              </Link>
                              <Link
                                href={`/lessons/${lesson.id}?mode=practice`}
                                className="block text-center w-full px-3 py-2 bg-transparent text-white rounded-full font-bold text-sm border-2 border-white hover:bg-white hover:text-gray-900 transition-colors"
                              >
                                Practice problems
                              </Link>
                            </div>
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