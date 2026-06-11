'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

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

      const { data: coursesData } = await supabase
  .from('courses')
  .select(`
    *,
    units!inner (
      id,
      status,
      lessons!inner (id, status)
    )
  `)
  .eq('status', 'published')
  .eq('units.status', 'published')
  .eq('units.lessons.status', 'published')
  .order('sort_order')
      setCourses(coursesData || [])

      setLoading(false)
    }
    loadData()
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}>
        <p className="text-gray-600 font-mono text-sm">Loading your courses...</p>
      </div>
    )
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0]
  const isAdmin = ['admin', 'editor', 'reviewer', 'question_maker'].includes(profile?.role)

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-2" style={{ background: '#b4f1e7' }}>
        <div className="flex items-center gap-2">
          <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
          <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/admin"
              className="px-2.5 py-1 bg-gray-900 text-white rounded-full text-xs font-bold tracking-widest uppercase shadow-[2px_2px_0_#1a1d29]"
            >
              Admin
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="px-2.5 py-1 bg-white border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]"
          >
            Log out
          </button>
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

        {/* Course grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {courses.map((course) => {
            const unitCount = course.units?.length || 0
            const lessonCount = course.units?.reduce(
              (sum, u) => sum + (u.lessons?.length || 0),
              0
            ) || 0

            // Resolve tone: support legacy keyword tokens and new hex colors
            const toneColor = (() => {
              if (/^#[0-9a-fA-F]{6}$/.test(course.tone)) return course.tone
              if (course.tone === 'gov') return '#6b7280'
              if (course.tone === 'calc') return '#ef4444'
              return '#6b7280'
            })()
            // Lighten the tone color for card background using opacity
            const cardBgStyle = { background: `${toneColor}18` } // ~10% opacity tint
            const iconStyle = { background: toneColor, color: '#fff' }

            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="border-[3px] border-gray-900 rounded-2xl p-6 shadow-[6px_6px_0_#1a1d29] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0_#1a1d29] transition-all block"
                style={cardBgStyle}
              >
                <div className="w-16 h-16 border-[2.5px] border-gray-900 rounded-xl flex items-center justify-center text-2xl font-black mb-4 shadow-[2px_2px_0_#1a1d29]" style={iconStyle}>
                  {course.icon}
                </div>
                <h2 className="text-2xl font-black tracking-tight leading-tight mb-1">
                  {course.title}
                </h2>
                <p className="text-sm text-gray-700 mb-4">
                  {course.description}
                </p>
                <div className="flex gap-3 text-xs font-mono uppercase tracking-widest text-gray-700">
                  <span>◆ {unitCount} units</span>
                  <span>◆ {lessonCount} lessons</span>
                </div>
              </Link>
            )
          })}

          <div className="bg-white border-[3px] border-dashed border-gray-400 rounded-2xl p-6 opacity-60 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-100 border-2 border-gray-400 rounded-xl flex items-center justify-center text-2xl font-black mb-3">
              +
            </div>
            <p className="font-bold text-gray-700">More AP courses</p>
            <p className="text-xs text-gray-500 mt-1">Calculus BC, U.S. Government, and Human Geography coming soon</p>
          </div>
        </div>

        <div className="mt-12 p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-xs font-mono text-gray-500">
          <span style={{ color: '#00b395' }}>Last update: 1.02. Fixed question pooling, added difficulty to questions, and added more flexibility to readings.</span>
          <br />
          logged in as <strong>{user?.email}</strong> · role: <strong>{profile?.role || 'student'}</strong> · support: demiancordova@cordovaibe.com
        </div>
        <p className="text-xs text-gray-400 font-mono mt-4">v1.03</p>
      </div>
    </div>
  )
}