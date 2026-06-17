'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin' || profile?.role === 'editor')
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <p className="text-gray-600 font-mono text-sm">Loading analytics...</p>

  if (!isAdmin) {
    return (
      <div>
        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// student insights</p>
        <h1 className="text-3xl font-black tracking-tight mb-3">Analytics</h1>
        <p className="text-gray-700">Only admins can view analytics.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-mono tracking-widest text-orange-600 uppercase mb-2">// student insights</p>
      <h1 className="text-4xl font-black tracking-tight mb-3">Analytics</h1>
      <p className="text-gray-700 mb-6 max-w-2xl">
        See how students are using Apio. Coming later — this needs more student data first.
      </p>
    </div>
  )
}