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
  const [sections, setSections] = useState([])
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

      // Top-level sections students see on the home screen.
      // We pull each section's courses just to show a count badge.
      const { data: sectionsData } = await supabase
        .from('sections')
        .select('*, courses:courses(id, status)')
        .eq('status', 'published')
        .order('sort_order')
      setSections(sectionsData || [])

      setLoading(false)
    }
    loadData()
  }, [router])

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

        {/* Section grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {sections.map((section) => {
            const courseCount = (section.courses || []).filter((c) => c.status === 'published').length

            // Resolve tone: hex color, fall back to teal
            const toneColor = /^#[0-9a-fA-F]{6}$/.test(section.tone) ? section.tone : '#00b395'
            const cardBgStyle = { background: `${toneColor}18` } // ~10% tint
            const iconStyle = { background: toneColor, color: '#fff' }

            return (
              <Link
                key={section.id}
                href={`/sections/${section.id}`}
                className="border-[3px] border-gray-900 rounded-2xl p-6 shadow-[6px_6px_0_#1a1d29] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0_#1a1d29] transition-all block"
                style={cardBgStyle}
              >
                <div className="w-16 h-16 border-[2.5px] border-gray-900 rounded-xl flex items-center justify-center text-2xl font-black mb-4 shadow-[2px_2px_0_#1a1d29]" style={iconStyle}>
                  {section.icon}
                </div>
                <h2 className="text-2xl font-black tracking-tight leading-tight mb-1">
                  {section.name}
                </h2>
                <p className="text-sm text-gray-700 mb-4">
                  {section.description}
                </p>
                <div className="flex gap-3 text-xs font-mono uppercase tracking-widest text-gray-700">
                  <span>◆ {courseCount} course{courseCount === 1 ? '' : 's'}</span>
                </div>
              </Link>
            )
          })}

          {sections.length === 0 && (
            <div className="bg-white border-[3px] border-dashed border-gray-400 rounded-2xl p-6 opacity-60 flex flex-col items-center justify-center text-center md:col-span-2">
              <div className="w-16 h-16 bg-gray-100 border-2 border-gray-400 rounded-xl flex items-center justify-center text-2xl font-black mb-3">
                +
              </div>
              <p className="font-bold text-gray-700">No sections yet</p>
              <p className="text-xs text-gray-500 mt-1">An admin can add sections from the admin panel.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}