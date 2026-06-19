'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { computeLatePenalty } from '@/lib/latePenalty'

const isPast = (iso) => !!iso && new Date(iso).getTime() < Date.now()

/**
 * Player for teacher-built "custom" assignments.
 * The route param IS the class_assignments id, so the run is inherently
 * tagged to that assignment — no extra ?assignment= param needed.
 * Mirrors the problem-set flow: single flat session, writes a submission
 * on finish. ?review=1 (or an existing submission with no retries, a passed
 * due date, an ended class, or a teacher preview) makes it read-only.
 */
export default function CustomSetPage() {
  const router = useRouter()
  const { assignmentId } = useParams()
  const searchParams = useSearchParams()
  const reviewParam = searchParams.get('review') === '1'

  const [user, setUser] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [readOnly, setReadOnly] = useState(false)

  const [itemIndex, setItemIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [savedAccuracy, setSavedAccuracy] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data: a } = await supabase
        .from('class_assignments').select('*').eq('id', assignmentId).maybeSingle()
      if (!a || a.type !== 'custom') { setNotFound(true); setLoading(false); return }
      setAssignment(a)

      const { data: klass } = await supabase
        .from('classes').select('id, end_date, teacher_id').eq('id', a.class_id).maybeSingle()

      const { data: qs } = await supabase
        .from('questions').select('*')
        .eq('custom_assignment_id', assignmentId)
        .eq('status', 'published')
        .order('sort_order')
      setItems(qs || [])

      const { data: sub } = await supabase
        .from('assignment_submissions')
        .select('accuracy, adjusted_accuracy, completed_at')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .maybeSingle()
      if (sub) setSavedAccuracy(sub.adjusted_accuracy ?? sub.accuracy)

      const isTeacher = klass?.teacher_id === user.id
      const lockedOut = isPast(klass?.end_date) || (isPast(a.due_date) && a.lock_after_due !== false)
      const alreadyDone = !!sub && !a.allow_retry
      setReadOnly(reviewParam || isTeacher || lockedOut || alreadyDone)

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, reviewParam])

  // Review mode: reveal the correct answer on each question, read-only.
  useEffect(() => {
    if (!readOnly || items.length === 0) return
    const it = items[itemIndex]
    if (it) { setSelected(it.answer); setChecked(true) }
  }, [readOnly, itemIndex, items])

  const item = items[itemIndex]
  const isCorrect = item && selected === item.answer

  async function logAttempt(qid, was, sel) {
    await supabase.from('question_attempts').insert({ user_id: user.id, question_id: qid, was_correct: was, selected_index: sel })
  }

  async function onCheck() {
    if (selected === null || readOnly || checked) return
    setChecked(true)
    const was = selected === item.answer
    if (was) setCorrectCount((c) => c + 1)
    await logAttempt(item.id, was, selected)
  }

  async function onContinue() {
    if (itemIndex + 1 < items.length) {
      setItemIndex((i) => i + 1); setSelected(null); setChecked(false)
      return
    }
    if (readOnly) { router.push(`/classes/${assignment.class_id}`); return }

    const finalCorrect = correctCount + (selected === item.answer ? 1 : 0)
    const acc = items.length > 0 ? Math.round((finalCorrect / items.length) * 100) : 100
    const { adjusted: adjustedAcc } = computeLatePenalty(acc, assignment)
    await supabase.from('assignment_submissions').upsert({
      assignment_id: assignmentId,
      student_id: user.id,
      accuracy: acc,
      adjusted_accuracy: adjustedAcc,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'assignment_id,student_id', ignoreDuplicates: !assignment.allow_retry })
    setSavedAccuracy(adjustedAcc)
    setCompleted(true)
  }

  // ---------- states ----------
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}>
      <p className="text-gray-600 font-mono text-sm">Loading assignment…</p>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
      <h1 className="text-3xl font-black tracking-tight mb-3">Assignment not found</h1>
      <Link href="/dashboard" className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to dashboard</Link>
    </div>
  )

  if (items.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
      <h1 className="text-3xl font-black tracking-tight mb-3">Nothing here yet</h1>
      <p className="text-gray-600 mb-6 max-w-md">This assignment doesn&apos;t have any questions.</p>
      <Link href={`/classes/${assignment.class_id}`} className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to class</Link>
    </div>
  )

  if (completed) {
    const acc = savedAccuracy ?? 0
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
        <div className="w-28 h-28 border-[4px] border-gray-900 rounded-full flex items-center justify-center text-5xl mb-5 shadow-[0_6px_0_#1a1d29]" style={{ background: acc === 100 ? '#fbbf24' : '#b4f1e7' }}>
          {acc === 100 ? '⭐' : acc >= 70 ? '✓' : '💪'}
        </div>
        <h1 className="text-4xl font-black tracking-tight mb-2 leading-none">Assignment complete!</h1>
        <p className="text-2xl italic mb-3" style={{ color: '#00b395' }}>{assignment.title}</p>
        <p className="text-lg font-bold mb-6">You scored <span style={{ color: '#00b395' }}>{acc}%</span></p>
        <Link href={`/classes/${assignment.class_id}`} className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to class</Link>
      </div>
    )
  }

  // ---------- quiz ----------
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f6fbf8' }}>
      <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-3" style={{ background: '#b4f1e7' }}>
        <Link href={`/classes/${assignment.class_id}`} className="flex items-center gap-2">
          <Image src="/apio-logo.png" alt="Apio" width={28} height={28} className="rounded-lg" />
          <span className="text-lg font-black tracking-tight">Apio</span>
        </Link>
        <div className="flex items-center gap-3">
          {readOnly && <span className="px-2.5 py-1 rounded-full border-2 border-gray-900 text-[10px] font-black uppercase tracking-widest bg-white">Review</span>}
          <span className="text-xs font-mono font-bold">{itemIndex + 1} / {items.length}</span>
          <Link href={`/classes/${assignment.class_id}`} className="px-3 py-1.5 bg-white border-2 border-gray-900 rounded-lg text-sm font-bold shadow-[2px_2px_0_#1a1d29]">Exit</Link>
        </div>
      </div>

      <div className="h-2 bg-white border-b-2 border-gray-900">
        <div className="h-full transition-all" style={{ width: `${((itemIndex + (checked ? 1 : 0)) / items.length) * 100}%`, background: '#00b395' }} />
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 max-w-2xl w-full mx-auto p-5 md:p-8">
          <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#00b395' }}>// {assignment.title}</p>
          <div className="text-2xl font-black tracking-tight mb-6 leading-snug prose prose-xl max-w-none prose-headings:font-black prose-img:rounded-xl prose-img:border-2 prose-img:border-gray-900" dangerouslySetInnerHTML={{ __html: item.stem || '' }} />
          {item.explanation && <div className="text-xs text-gray-700 leading-relaxed prose prose-sm max-w-none prose-img:rounded-lg prose-img:border-2 prose-img:border-gray-900" dangerouslySetInnerHTML={{ __html: item.explanation }} />}
          <div className="flex flex-col gap-3">
            {item.choices.map((c, i) => {
              const isAns = i === item.answer
              const isSel = selected === i
              let style = {}
              if (checked) {
                if (isAns) style = { background: '#dcfce7', borderColor: '#16a34a' }
                else if (isSel) style = { background: '#fee2e2', borderColor: '#dc2626' }
              } else if (isSel) {
                style = { background: '#b4f1e7' }
              }
              return (
                <button
                  key={i}
                  disabled={checked || readOnly}
                  onClick={() => setSelected(i)}
                  className="flex items-center gap-3 text-left px-4 py-3 border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[3px_3px_0_#1a1d29] bg-white disabled:cursor-default"
                  style={style}
                >
                  <span className="w-8 h-8 shrink-0 border-2 border-gray-900 rounded-lg flex items-center justify-center text-sm font-black bg-white">{String.fromCharCode(65 + i)}</span>
                  <span className="flex-1">{c}</span>
                  {checked && isAns && <span className="text-green-700 font-black">✓</span>}
                  {checked && isSel && !isAns && <span className="text-red-700 font-black">✕</span>}
                </button>
              )
            })}
          </div>
        </div>

        {!checked ? (
          <div className="border-t-[3px] border-gray-900 px-5 py-3 flex justify-end flex-shrink-0" style={{ background: '#b4f1e7' }}>
            <button disabled={selected === null} onClick={onCheck} className="px-7 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] disabled:opacity-40 disabled:cursor-not-allowed text-sm" style={{ background: '#00b395' }}>
              Check answer
            </button>
          </div>
        ) : (
          <div className={`border-t-[3px] border-gray-900 px-4 py-3 flex items-center justify-between gap-3 flex-wrap flex-shrink-0 ${readOnly ? 'bg-gray-100' : isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
            <div className="flex-1 min-w-0">
              <h3 className={`text-lg font-black mb-0.5 ${readOnly ? 'text-gray-900' : isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                {readOnly ? 'Correct answer' : isCorrect ? 'Excellent.' : 'Not quite.'}
              </h3>
              {(((item.choice_explanations || [])[selected]) || item.explanation) && (
                <div
                  className="text-xs text-gray-700 leading-relaxed prose prose-sm max-w-none prose-img:rounded-lg prose-img:border-2 prose-img:border-gray-900"
                  dangerouslySetInnerHTML={{ __html: ((item.choice_explanations || [])[selected]) || item.explanation || '' }}
                />
              )}
            </div>
            <button onClick={onContinue} className={`px-7 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] text-sm flex-shrink-0 ${!readOnly && isCorrect ? 'bg-green-600' : 'bg-gray-900'}`}>
              {itemIndex + 1 < items.length ? 'Continue' : 'Finish'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}