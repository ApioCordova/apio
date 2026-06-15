'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function AdminLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      const allowedRoles = ['admin', 'editor', 'reviewer', 'question_maker']
      if (!profileData || !allowedRoles.includes(profileData.role)) {
        setAccessDenied(true)
        setLoading(false)
        return
      }

      setProfile(profileData)
      setLoading(false)
    }
    checkAccess()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}>
        <p className="text-gray-600 font-mono text-sm">Checking access...</p>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
        <div className="w-20 h-20 bg-red-200 border-[3px] border-gray-900 rounded-2xl flex items-center justify-center text-3xl mb-5 shadow-[4px_4px_0_#1a1d29]">
          🔒
        </div>
        <p className="text-xs font-mono tracking-widest text-red-700 uppercase mb-2">// access denied</p>
        <h1 className="text-3xl font-black tracking-tight mb-3">Admins only.</h1>
        <p className="text-gray-700 mb-6 max-w-md">
          This area is restricted to Apio editors and admins. If you think this is a mistake, contact your team admin.
        </p>
        <Link
          href="/dashboard"
          className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#1a1d29] transition-all"
          style={{ background: '#00b395' }}
        >
          ← Back to dashboard
        </Link>
      </div>
    )
  }

  const navItems = [
  { href: '/admin/sections', label: 'Sections', icon: '🗂' },   // ← add this line
  { href: '/admin', label: 'Content', icon: '📚' },
  { href: '/admin/review', label: 'Pending Review', icon: '📋' },
  { href: '/admin/contributors', label: 'Contributors', icon: '👥' },
  { href: '/admin/teacher-codes', label: 'Teacher Access', icon: '🎟' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
]

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-6 py-3 flex items-center justify-between sticky top-0 z-40" style={{ background: '#b4f1e7' }}>
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image src="/apio-logo.png" alt="Apio" width={36} height={36} className="rounded-lg" />
          <span className="text-2xl font-black tracking-tight">
            Apio <span className="text-xs font-mono tracking-widest ml-1 align-middle" style={{ color: '#00b395' }}>// ADMIN</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700 font-medium hidden md:inline">
            {profile.full_name || profile.email}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase border-2 border-gray-900 text-white" style={{
            background:
              profile.role === 'admin' ? '#00b395' :
              profile.role === 'reviewer' ? '#3b82f6' :
              profile.role === 'question_maker' ? '#8b5cf6' :
              '#eab308'
          }}>
            {profile.role.replace('_', ' ')}
          </span>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          >
            Exit admin
          </Link>
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
        <aside className="bg-white border-[3px] border-gray-900 rounded-2xl p-4 shadow-[6px_6px_0_#1a1d29] h-fit md:sticky md:top-24">
          <p className="text-xs font-mono tracking-widest text-gray-600 uppercase px-2 mb-2">Manage</p>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors ${
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        <main className="bg-white border-[3px] border-gray-900 rounded-2xl p-7 shadow-[6px_6px_0_#1a1d29] min-h-[600px]">
          {children}
        </main>
      </div>
    </div>
  )
}