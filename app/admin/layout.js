'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
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

      if (!profileData || (profileData.role !== 'admin' && profileData.role !== 'editor')) {
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
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <p className="text-gray-600 font-mono text-sm">Checking access...</p>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-8 text-center">
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
          className="px-6 py-3 bg-orange-500 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#1a1d29] transition-all"
        >
          ← Back to dashboard
        </Link>
      </div>
    )
  }

  const navItems = [
    { href: '/admin', label: 'Content', icon: '📚' },
    { href: '/admin/contributors', label: 'Contributors', icon: '👥' },
    { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
  ]

  return (
    <div className="min-h-screen bg-amber-50">
      {/* Top bar */}
      <div className="bg-amber-100 border-b-[3px] border-gray-900 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 border-2 border-gray-900 rounded-lg flex items-center justify-center text-white font-black shadow-[3px_3px_0_#1a1d29] -rotate-6">
            A
          </div>
          <span className="text-2xl font-black tracking-tight">
            Apio <span className="text-xs font-mono tracking-widest text-orange-600 ml-1 align-middle">// ADMIN</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700 font-medium hidden md:inline">
            {profile.full_name || profile.email}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase border-2 border-gray-900 ${profile.role === 'admin' ? 'bg-orange-500 text-white' : 'bg-yellow-400 text-gray-900'}`}>
            {profile.role}
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
        {/* Sidebar */}
        <aside className="bg-amber-100 border-[3px] border-gray-900 rounded-2xl p-4 shadow-[6px_6px_0_#1a1d29] h-fit md:sticky md:top-24">
          <p className="text-xs font-mono tracking-widest text-gray-600 uppercase px-2 mb-2">Sections</p>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors ${
                    isActive
                      ? 'bg-gray-900 text-amber-50'
                      : 'hover:bg-amber-200'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Page content */}
        <main className="bg-amber-100 border-[3px] border-gray-900 rounded-2xl p-7 shadow-[6px_6px_0_#1a1d29] min-h-[600px]">
          {children}
        </main>
      </div>
    </div>
  )
}