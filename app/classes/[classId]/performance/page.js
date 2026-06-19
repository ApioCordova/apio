'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

const TEAL = '#00b395'

function formatDue(d) {
  if (!d) return 'No due date'
  const dt = new Date(d)
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function accuracyColor(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 80) return '#22c55e'
  if (pct >= 60) return '#eab308'
  if (pct >= 40) return '#f97316'
  return '#ef4444'
}

const LETTERS = 'ABCDEFGH'

function PerformanceInner() {
  const router = useRouter()
  const { classId } = useParams()
  const searchParams = useSearchParams()
  const preselect = searchParams.get('assignment')

  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(true)
  const [klass, setKlass] = useState(null)
  const [overview, setOverview] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [expandedStudent, setExpandedStudent] = useState(null)

  // Load class + overview
  useEffect(() => {
    let active = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: c } = await supabase.from('classes').select('*').eq('id', classId).single()
      if (!c) { if (active) { setLoading(false) } ; return }
      if (c.teacher_id !== user.id) { if (active) { setAuthorized(false); setLoading(false) } ; return }
      if (active) setKlass(c)

      const { data, error } = await supabase.rpc('teacher_class_overview', { p_class: classId })
      if (active) {
        const list = error ? [] : (data || [])
        setOverview(list)
        const initial = (preselect && list.find(a => a.id === preselect)?.id) || list[0]?.id || null
        setSelectedId(initial)
        setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [classId, router, preselect])

  // Load detail when selection changes
  useEffect(() => {
    let active = true
    if (!selectedId) { setDetail(null); return }
    setExpandedStudent(null)
    async function loadDetail() {
      setDetailLoading(true)
      const { data, error } = await supabase.rpc('teacher_assignment_detail', { p_assignment: selectedId })
      if (active) { setDetail(error ? null : data); setDetailLoading(false) }
    }
    loadDetail()
    return () => { active = false }
  }, [selectedId])

  const btn = 'px-4 py-2.5 border-[2.5px] border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29] bg-white hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all'

  const TopBar = (
    <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-2" style={{ background: '#b4f1e7' }}>
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
        <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
      </Link>
      <Link href={`/classes/${classId}`} className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">← Back to class</Link>
    </div>
  )

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}><p className="text-gray-600 font-mono text-sm">Loading performance…</p></div>
  }

  if (!authorized || !klass) {
    return (
      <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
        {TopBar}
        <div className="flex flex-col items-center justify-center p-8 text-center mt-20">
          <h1 className="text-3xl font-black tracking-tight mb-3">{authorized ? 'Class not found' : 'Teachers only'}</h1>
          <p className="text-gray-600 mb-6 max-w-md">{authorized ? 'This class does not exist or was removed.' : 'Only the teacher who created this class can view student performance.'}</p>
          <Link href={`/classes/${classId}`} className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: TEAL }}>← Back to class</Link>
        </div>
      </div>
    )
  }

  const selected = overview.find(a => a.id === selectedId)

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {TopBar}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: TEAL }}>// {klass.name}</p>
        <h1 className="text-4xl font-black tracking-tight mb-6">Student performance</h1>

        {overview.length === 0 ? (
          <div className="border-[3px] border-dashed border-gray-400 rounded-2xl p-10 text-center">
            <p className="text-gray-600 font-bold">No assignments yet.</p>
            <p className="text-sm text-gray-500 mt-1">Assign a lesson or problem set, and stats will show up here once students start answering.</p>
          </div>
        ) : (
          <>
            {/* ── OVERVIEW ─────────────────────────────────────────── */}
            <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: TEAL }}>// all assignments</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
              {overview.map((a) => {
                const isSel = a.id === selectedId
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`text-left border-[3px] border-gray-900 rounded-2xl p-5 transition-all ${isSel ? 'shadow-[6px_6px_0_#1a1d29]' : 'shadow-[3px_3px_0_#1a1d29] hover:shadow-[5px_5px_0_#1a1d29]'}`}
                    style={{ background: isSel ? '#b4f1e7' : '#fff' }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="font-black tracking-tight truncate">{a.title}</p>
                        <p className="text-xs font-mono text-gray-500 mt-0.5">{formatDue(a.due_date)}</p>
                      </div>
                      <span className="shrink-0 px-2.5 py-1 rounded-full border-2 border-gray-900 text-[10px] font-black uppercase tracking-widest text-white" style={{ background: a.type === 'problem_set' ? '#8b5cf6' : a.type === 'custom' ? '#f59e0b' : TEAL }}>
                        {a.type === 'problem_set' ? 'Problem set' : a.type === 'custom' ? 'Custom' : 'Lesson'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="border-2 border-gray-900 rounded-xl px-3 py-2 bg-white">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Completed</p>
                        <p className="text-2xl font-black leading-none mt-1">{a.completion_pct}%</p>
                      </div>
                      <div className="border-2 border-gray-900 rounded-xl px-3 py-2 bg-white">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Avg accuracy</p>
                        <p className="text-2xl font-black leading-none mt-1" style={{ color: accuracyColor(a.avg_accuracy) }}>{a.avg_accuracy}%</p>
                      </div>
                    </div>

                    <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-1.5">Most missed</p>
                    {(!a.most_missed || a.most_missed.length === 0) ? (
                      <p className="text-xs text-gray-400 italic">No answers yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {a.most_missed.map((m, i) => (
                          <div key={m.question_id} className="flex items-center gap-2">
                            <span className="shrink-0 w-5 h-5 rounded-full border border-gray-900 text-[10px] font-black flex items-center justify-center bg-white">{i + 1}</span>
                            <span className="text-xs text-gray-800 truncate flex-1">{m.stem}</span>
                            <span className="shrink-0 text-[11px] font-black" style={{ color: accuracyColor(m.correct_pct) }}>{m.correct_pct}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* ── DETAIL ──────────────────────────────────────────── */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <p className="text-xs font-mono tracking-widest uppercase" style={{ color: TEAL }}>// breakdown</p>
              <select
                value={selectedId || ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="border-[2.5px] border-gray-900 rounded-xl px-4 py-2 font-bold bg-white shadow-[3px_3px_0_#1a1d29]"
              >
                {overview.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
              {selected?.due_date && <span className="text-xs font-mono text-gray-500">Due {formatDue(selected.due_date)}</span>}
            </div>

            {detailLoading ? (
              <p className="text-gray-500 font-mono text-sm py-10 text-center">Loading breakdown…</p>
            ) : !detail ? (
              <p className="text-gray-500 font-mono text-sm py-10 text-center">No data for this assignment yet.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LEFT — questions + distribution */}
                <div>
                  <p className="text-xs font-mono tracking-widest uppercase mb-3 text-gray-500">Questions ({detail.questions.length})</p>
                  {detail.questions.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">This assignment has no published questions.</p>
                  ) : (
                    <div className="space-y-4">
                      {detail.questions.map((q, qi) => {
                        const total = q.total_attempts || 0
                        const distMap = {}
                        ;(q.distribution || []).forEach(d => { distMap[d.choice] = d.count })
                        const answered = (q.distribution || []).reduce((s, d) => s + d.count, 0)
                        return (
                          <div key={q.id} className="border-[3px] border-gray-900 rounded-2xl p-4 bg-white shadow-[4px_4px_0_#1a1d29]">
                            <div className="flex items-start gap-2 mb-3">
                              <span className="shrink-0 w-6 h-6 rounded-full border-2 border-gray-900 text-xs font-black flex items-center justify-center" style={{ background: '#b4f1e7' }}>{qi + 1}</span>
                              <p className="font-bold text-sm flex-1">{q.stem}</p>
                              <span className="shrink-0 text-[11px] font-black" style={{ color: accuracyColor(q.correct_pct) }}>{q.correct_pct == null ? '—' : `${q.correct_pct}% ✓`}</span>
                            </div>
                            <div className="space-y-2">
                              {(q.choices || []).map((choice, ci) => {
                                const cnt = distMap[ci] || 0
                                const pct = answered > 0 ? Math.round((cnt / answered) * 100) : 0
                                const isCorrect = ci === q.answer
                                return (
                                  <div key={ci} className="flex items-center gap-2">
                                    <span className="shrink-0 w-6 h-6 rounded-lg border-2 border-gray-900 text-[11px] font-black flex items-center justify-center" style={isCorrect ? { background: TEAL, color: '#fff' } : { background: '#fff' }}>{LETTERS[ci]}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2 mb-0.5">
                                        <span className="text-xs text-gray-800 truncate">{choice}</span>
                                        <span className="text-[11px] font-bold text-gray-600 shrink-0">{pct}% · {cnt}</span>
                                      </div>
                                      <div className="h-2.5 bg-gray-100 border border-gray-300 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isCorrect ? TEAL : '#cbd5e1' }} />
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            <p className="text-[10px] font-mono text-gray-400 mt-2.5">{total} response{total === 1 ? '' : 's'}{answered < total ? ` · ${total - answered} before choice-tracking` : ''}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* RIGHT — students */}
                <div>
                  <p className="text-xs font-mono tracking-widest uppercase mb-3 text-gray-500">Students ({detail.students.length})</p>
                  <div className="border-[3px] border-gray-900 rounded-2xl bg-white shadow-[4px_4px_0_#1a1d29] overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b-2 border-gray-200 bg-gray-50 text-[10px] font-mono uppercase tracking-widest text-gray-500">
                      <span className="col-span-6">Name</span>
                      <span className="col-span-3 text-right">Accuracy</span>
                      <span className="col-span-3 text-right">Status</span>
                    </div>
                    {detail.students.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500 text-center">No students enrolled yet.</p>
                    ) : detail.students.map((s) => {
                      const isOpen = expandedStudent === s.student_id
                      const answerMap = {}
                      ;(s.answers || []).forEach((ans) => { answerMap[ans.question_id] = ans })
                      return (
                        <div key={s.student_id} className="border-b border-gray-100 last:border-0">
                          <button
                            type="button"
                            onClick={() => setExpandedStudent(isOpen ? null : s.student_id)}
                            className="w-full grid grid-cols-12 gap-2 items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                          >
                            <div className="col-span-6 min-w-0 flex items-center gap-2">
                              <span className="shrink-0 text-gray-400 text-xs">{isOpen ? '▾' : '▸'}</span>
                              <div className="min-w-0">
                                <p className="font-bold text-sm truncate">{s.name}</p>
                                <p className="text-[10px] font-mono text-gray-400">{s.attempted}/{s.total} answered</p>
                              </div>
                            </div>
                            <div className="col-span-3 text-right">
                              <span className="font-black text-sm" style={{ color: accuracyColor(s.accuracy) }}>{s.accuracy == null ? '—' : `${s.accuracy}%`}</span>
                            </div>
                            <div className="col-span-3 flex justify-end">
                              {s.status === 'late' && <span className="px-2 py-0.5 rounded-full border-2 border-gray-900 text-[10px] font-black uppercase tracking-wide text-white" style={{ background: '#ef4444' }}>Late</span>}
                              {s.status === 'on_time' && <span className="px-2 py-0.5 rounded-full border-2 border-gray-900 text-[10px] font-black uppercase tracking-wide" style={{ background: '#dcfce7' }}>On time</span>}
                              {s.status === 'not_submitted' && <span className="px-2 py-0.5 rounded-full border-2 border-gray-300 text-[10px] font-black uppercase tracking-wide text-gray-500 bg-gray-50">Missing</span>}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                              {detail.questions.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-2">No questions in this assignment.</p>
                              ) : (
                                <div className="space-y-2 mt-2">
                                  {detail.questions.map((q, qi) => {
                                    const ans = answerMap[q.id]
                                    const picked = ans && ans.selected_index != null ? ans.selected_index : null
                                    const correct = picked != null && picked === q.answer
                                    return (
                                      <div key={q.id} className="flex items-start gap-2 text-xs">
                                        <span className="shrink-0 w-5 h-5 rounded-full border border-gray-900 text-[10px] font-black flex items-center justify-center bg-white">{qi + 1}</span>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-gray-800 truncate">{q.stem}</p>
                                          {picked != null ? (
                                            <p className="font-mono text-[11px] mt-0.5" style={{ color: correct ? '#22c55e' : '#ef4444' }}>
                                              {correct ? '✓' : '✗'} chose {LETTERS[picked]} · {q.choices?.[picked] ?? '—'}
                                              {!correct && <span className="text-gray-500"> · correct {LETTERS[q.answer]}</span>}
                                            </p>
                                          ) : (
                                            <p className="font-mono text-[11px] mt-0.5 text-gray-400">— no answer recorded</p>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function PerformancePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}><p className="text-gray-600 font-mono text-sm">Loading…</p></div>}>
      <PerformanceInner />
    </Suspense>
  )
}