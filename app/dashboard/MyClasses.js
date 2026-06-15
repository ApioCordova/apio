'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const toneOf = (c) => {
  const t = c?.tone
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t
  if (t === 'gov') return '#6b7280'
  if (t === 'calc') return '#ef4444'
  return '#00b395'
}

/**
 * "Your classes" section on the dashboard.
 * Shows classes the user joined as a student and classes they created as a teacher.
 * Re-fetches whenever `refreshSignal` changes.
 */
export default function MyClasses({ refreshSignal = 0 }) {
  const [classes, setClasses] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (active) setLoaded(true); return }

      const [{ data: memberRows }, { data: taughtRows }] = await Promise.all([
        supabase.from('class_members')
          .select('class:classes ( id, name, code, capacity, course_id, teacher_id, end_date )')
          .eq('student_id', user.id),
        supabase.from('classes')
          .select('id, name, code, capacity, course_id, teacher_id, end_date')
          .eq('teacher_id', user.id),
      ])

      const joined = (memberRows || []).map((r) => r.class).filter(Boolean).map((c) => ({ ...c, role: 'student' }))
      const taught = (taughtRows || []).map((c) => ({ ...c, role: 'teacher' }))

      // merge unique by id (teacher view wins if somehow both)
      const byId = {}
      for (const c of [...joined, ...taught]) {
        if (!c?.id) continue
        if (!byId[c.id] || c.role === 'teacher') byId[c.id] = c
      }
      const list = Object.values(byId)

      // course details
      const courseIds = [...new Set(list.map((c) => c.course_id).filter(Boolean))]
      const courseMap = {}
      if (courseIds.length) {
        const { data: cs } = await supabase.from('courses')
          .select('id, title, short_title, icon, tone').in('id', courseIds)
        ;(cs || []).forEach((c) => { courseMap[c.id] = c })
      }

      // member counts for classes I teach
      const taughtIds = taught.map((c) => c.id)
      const countMap = {}
      if (taughtIds.length) {
        const { data: cm } = await supabase.from('class_members').select('class_id').in('class_id', taughtIds)
        ;(cm || []).forEach((r) => { countMap[r.class_id] = (countMap[r.class_id] || 0) + 1 })
      }

      // teacher names for classes I'm a student in (best effort — may be blocked by RLS)
      const teacherIds = [...new Set(list.filter((c) => c.role === 'student').map((c) => c.teacher_id).filter(Boolean))]
      const teacherMap = {}
      if (teacherIds.length) {
        const { data: ts } = await supabase.from('profiles').select('id, full_name, username').in('id', teacherIds)
        ;(ts || []).forEach((t) => { teacherMap[t.id] = t.full_name || t.username })
      }

      const enriched = list.map((c) => ({
        ...c,
        course: courseMap[c.course_id],
        count: countMap[c.id] || 0,
        teacherName: teacherMap[c.teacher_id],
      }))

      if (active) { setClasses(enriched); setLoaded(true) }
    }
    load()
    return () => { active = false }
  }, [refreshSignal])

  function copyCode(cls) {
    navigator.clipboard?.writeText(cls.code)
    setCopiedId(cls.id); setTimeout(() => setCopiedId(null), 1500)
  }

  if (!loaded || classes.length === 0) return null

  return (
    <div className="mb-8">
      <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// your classes</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {classes.map((cls) => {
          const tone = toneOf(cls.course)
          const courseTitle = cls.course?.title || 'Course'
          const href = `/classes/${cls.id}`
          const ended = !!cls.end_date && new Date(cls.end_date).getTime() < Date.now()
          return (
            <div
              key={cls.id}
              className="border-[3px] border-gray-900 rounded-2xl p-6 shadow-[6px_6px_0_#1a1d29]"
              style={{ background: `${tone}18` }}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="w-16 h-16 border-[2.5px] border-gray-900 rounded-xl flex items-center justify-center text-2xl font-black shadow-[2px_2px_0_#1a1d29]" style={{ background: tone, color: '#fff' }}>
                  {cls.course?.icon || '🏫'}
                </div>
                <div className="flex items-center gap-2">
                  {ended && (
                    <span className="px-2.5 py-1 rounded-full border-2 border-gray-900 text-[10px] font-black uppercase tracking-widest bg-gray-200">Ended</span>
                  )}
                  <span className={`px-2.5 py-1 rounded-full border-2 border-gray-900 text-[10px] font-black uppercase tracking-widest shadow-[2px_2px_0_#1a1d29] ${cls.role === 'teacher' ? 'text-white' : 'bg-white'}`} style={cls.role === 'teacher' ? { background: '#1a1d29' } : {}}>
                    {cls.role === 'teacher' ? 'Teacher' : 'Class'}
                  </span>
                </div>
              </div>

              <Link href={href} className="block group">
                <h2 className="text-2xl font-black tracking-tight leading-tight mb-1 group-hover:underline">{cls.name}</h2>
                <p className="text-sm text-gray-700">{courseTitle}</p>
                {cls.role === 'student' && cls.teacherName && (
                  <p className="text-xs font-mono text-gray-500 mt-1">with {cls.teacherName}</p>
                )}
              </Link>

              {cls.role === 'teacher' && (
                <div className="mt-4 pt-4 border-t-2 border-gray-900/15 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Code</span>
                    <span className="font-mono font-black tracking-[0.2em]">{cls.code}</span>
                    <button onClick={() => copyCode(cls)} className="px-2 py-0.5 border-2 border-gray-900 rounded-lg text-[11px] font-bold bg-white shadow-[2px_2px_0_#1a1d29]">
                      {copiedId === cls.id ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                  <span className="text-xs font-mono text-gray-600">
                    {cls.count}{cls.capacity ? ` / ${cls.capacity}` : ''} {cls.count === 1 ? 'student' : 'students'}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}