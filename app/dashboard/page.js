'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      // 1. Get the logged-in user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      // 2. Load the user's profile (XP, streak, hearts, role)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(profileData)

      // 3. Load all published courses with their unit/lesson counts
      const { data: coursesData } = await supabase
        .from('courses')
        .select(`
          *,
          units (
            id,
            lessons (id)
          )
        `)
        .eq('is_published', true)
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
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <p className="text-gray-600 font-mono text-sm">Loading your courses...</p>
      </div>
    )
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0]
  const isAdmin = profile?.role === 'admin' || profile?.role === 'editor'

  return (
    <div className="min-h-screen bg-amber-50">
      {/* Top bar */}
      <div className="bg-amber-100 border-b-[3px] border-gray-900 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 border-2 border-gray-900 rounded-lg flex items-center justify-center text-white font-black shadow-[3px_3px_0_#1a1d29] -rotate-6">
            A
          </div>
          <span className="text-2xl font-black tracking-tight">Apio</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats pills */}
          <div className="flex gap-2">
            <div className="px-3 py-1.5 bg-orange-100 border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29]">
              🔥 {profile?.streak ?? 0}
            </div>
            <div className="px-3 py-1.5 bg-yellow-100 border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29]">
              ⚡ {profile?.xp ?? 0}
            </div>
            <div className="px-3 py-1.5 bg-pink-100 border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29]">
              ♥ {profile?.hearts ?? 5}
            </div>
          </div>

          {isAdmin && (
            <Link
              href="/admin"
              className="px-3 py-1.5 bg-gray-900 text-white rounded-full text-xs font-bold tracking-widest uppercase shadow-[2px_2px_0_#1a1d29] hover:bg-orange-500 transition-colors"
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
          <p className="text-xs font-mono tracking-widest text-orange-600 uppercase mb-2">
            // Welcome back
          </p>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none mb-3">
            Hey, <span className="text-orange-500 italic font-normal">{displayName}</span>.
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

            const bgClass =
              course.tone === 'gov'
                ? 'bg-gradient-to-br from-purple-100 to-pink-100'
                : course.tone === 'calc'
                ? 'bg-gradient-to-br from-teal-100 to-emerald-100'
                : 'bg-amber-100'

            const iconBgClass =
              course.tone === 'gov'
                ? 'bg-purple-700 text-white'
                : course.tone === 'calc'
                ? 'bg-teal-400 text-gray-900'
                : 'bg-amber-200'

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

          {/* "More coming soon" placeholder */}
          <div className="bg-white border-[3px] border-dashed border-gray-400 rounded-2xl p-6 opacity-60 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-100 border-2 border-gray-400 rounded-xl flex items-center justify-center text-2xl font-black mb-3">
              +
            </div>
            <p className="font-bold text-gray-700">More AP courses</p>
            <p className="text-xs text-gray-500 mt-1">Bio · Lang · CSP coming soon</p>
          </div>
        </div>

        {/* Debug / verification info */}
        <div className="mt-12 p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-xs font-mono text-gray-500">
          <span className="text-orange-600">// connected to supabase</span>
          <br />
          logged in as <strong>{user?.email}</strong> · role: <strong>{profile?.role || 'student'}</strong> · {courses.length} courses loaded
        </div>
      </div>
    </div>
  )
}