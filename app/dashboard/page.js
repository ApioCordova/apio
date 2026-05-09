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
  const isAdmin = profile?.role === 'admin' || profile?.role === 'editor'

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-6 py-3 flex items-center justify-between" style={{ background: '#b4f1e7' }}>
        <div className="flex items-center gap-3">
          <Image src="/apio-logo.png" alt="Apio" width={36} height={36} className="rounded-lg" />
          <span className="text-2xl font-black tracking-tight">Apio</span>
        </div>

        <div className="flex items-center gap-3">
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

          {isAdmin && (
            <Link
              href="/admin"
              className="px-3 py-1.5 bg-gray-900 text-white rounded-full text-xs font-bold tracking-widest uppercase shadow-[2px_2px_0_#1a1d29] hover:opacity-80 transition-colors"
            >
              Admin
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          >
            Log out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto p-8">
        <div className="mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>
            // Welcome back
          </p>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none mb-3">
            Hey, <span className="italic font-normal" style={{ color: '#00b395' }}>{displayName}</span>.
          </h1>
          <p className="text-gray-700 max-w-xl">
            Pick a course to continue your AP quest. Bite-sized lessons, real exam-style questions, progress that follows you.
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

            // Gray tones for history (gov), red tones for calc
            const bgClass =
              course.tone === 'gov'
                ? 'bg-gradient-to-br from-gray-100 to-gray-200'
                : course.tone === 'calc'
                ? 'bg-gradient-to-br from-red-100 to-rose-200'
                : 'bg-gray-100'

            const iconBgClass =
              course.tone === 'gov'
                ? 'bg-gray-700 text-white'
                : course.tone === 'calc'
                ? 'bg-red-500 text-white'
                : 'bg-gray-200'

            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className={`${bgClass} border-[3px] border-gray-900 rounded-2xl p-6 shadow-[6px_6px_0_#1a1d29] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0_#1a1d29] transition-all block`}
              >
                <div className={`${iconBgClass} w-16 h-16 border-[2.5px] border-gray-900 rounded-xl flex items-center justify-center text-2xl font-black mb-4 shadow-[2px_2px_0_#1a1d29]`}>
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
            <p className="text-xs text-gray-500 mt-1">Calculus BC, U.S. Government, Human Geography, Business, and Cybersecurity coming soon</p>
          </div>
        </div>

        <div className="mt-12 p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-xs font-mono text-gray-500">
          <span style={{ color: '#00b395' }}>// connected to supabase</span>
          <br />
          logged in as <strong>{user?.email}</strong> · role: <strong>{profile?.role || 'student'}</strong> · {courses.length} courses loaded
        </div>
        <p className="text-xs text-gray-400 font-mono mt-4">v1.00</p>
      </div>
    </div>
  )
}