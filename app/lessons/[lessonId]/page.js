'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LessonPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const lessonId = params.lessonId
  const isPracticeMode = searchParams.get('mode') === 'practice'

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [course, setCourse] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  // Practice-mode specific state
  const [practiceSetupNeeded, setPracticeSetupNeeded] = useState(false)
  const [practicePoolStats, setPracticePoolStats] = useState({ total: 0, mastered: 0 })
  const [allPracticeQuestions, setAllPracticeQuestions] = useState([])
  const [masteryByQuestion, setMasteryByQuestion] = useState({}) // { qid: box_level }

  // Quiz state
  const [itemIndex, setItemIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [hearts, setHearts] = useState(5)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(profileData)
      setHearts(profileData?.hearts ?? 5)
      const isAdminUser = profileData?.role === 'admin' || profileData?.role === 'editor'

      const { data: lessonData } = await supabase
        .from('lessons')
        .select(`*, unit:units (*, course:courses (*))`)
        .eq('id', lessonId).single()

      if (!lessonData) { setLoading(false); return }
      setLesson(lessonData)
      setCourse(lessonData.unit?.course)

      // Load questions and readings
      let qQuery = supabase.from('questions').select('*').eq('lesson_id', lessonId)
      let rQuery = supabase.from('readings').select('*').eq('lesson_id', lessonId)
      if (!isAdminUser) {
        qQuery = qQuery.eq('status', 'published')
        rQuery = rQuery.eq('status', 'published')
      }
      const [{ data: qData }, { data: rData }] = await Promise.all([qQuery, rQuery])

      if (isPracticeMode) {
        // Practice mode — only practice-pool questions
        const practiceQs = (qData || []).filter(q => q.pool === 'practice')
        setAllPracticeQuestions(practiceQs)

        // Load mastery levels for each practice question
        const ids = practiceQs.map(q => q.id)
        if (ids.length > 0) {
          const { data: masteryData } = await supabase
            .from('question_mastery')
            .select('question_id, box_level')
            .eq('user_id', user.id)
            .in('question_id', ids)
          const map = {}
          ;(masteryData || []).forEach(m => { map[m.question_id] = m.box_level })
          setMasteryByQuestion(map)

          const masteredCount = (masteryData || []).filter(m => m.box_level >= 5).length
          setPracticePoolStats({ total: practiceQs.length, mastered: masteredCount })
        } else {
          setPracticePoolStats({ total: 0, mastered: 0 })
        }

        setPracticeSetupNeeded(true)
        setLoading(false)
      } else {
        // Lesson mode — readings + lesson-pool questions in order
        const lessonQs = (qData || []).filter(q => q.pool === 'lesson')
        const combined = [
          ...lessonQs.map(q => ({ ...q, _kind: 'question' })),
          ...(rData || []).map(r => ({ ...r, _kind: 'reading' })),
        ].sort((a, b) => a.sort_order - b.sort_order)
        setItems(combined)
        setLoading(false)
      }
    }
    loadData()
  }, [lessonId, router, isPracticeMode])

  // ============ START PRACTICE SESSION ============
  function startPracticeSession(sessionSize) {
    // Pick questions weighted by box level (lower box = more likely)
    // box 1 weight = 5, box 2 = 4, box 3 = 3, box 4 = 2, box 5 = 1, no attempts = 5 (treat as box 1)
    const weighted = allPracticeQuestions.map(q => {
      const box = masteryByQuestion[q.id] || 1
      const weight = 6 - box // box 1 → 5, box 5 → 1
      return { q, weight }
    })

    // Filter out fully mastered (box 5) unless we have nothing else
    const notMastered = weighted.filter(w => (masteryByQuestion[w.q.id] || 1) < 5)
    const pool = notMastered.length > 0 ? notMastered : weighted

    // Weighted random shuffle
    const picked = []
    const available = [...pool]
    const target = sessionSize === 'all' ? available.length : Math.min(sessionSize, available.length)

    while (picked.length < target && available.length > 0) {
      const totalWeight = available.reduce((s, w) => s + w.weight, 0)
      let r = Math.random() * totalWeight
      let pickedIdx = 0
      for (let i = 0; i < available.length; i++) {
        r -= available[i].weight
        if (r <= 0) { pickedIdx = i; break }
      }
      picked.push(available[pickedIdx].q)
      available.splice(pickedIdx, 1)
    }

    setItems(picked.map(q => ({ ...q, _kind: 'question' })))
    setPracticeSetupNeeded(false)
    setItemIndex(0)
    setSelected(null)
    setChecked(false)
    setCorrectCount(0)
  }

  const item = items[itemIndex]

  async function logAttempt(questionId, wasCorrect) {
    await supabase.from('question_attempts').insert({
      user_id: user.id,
      question_id: questionId,
      was_correct: wasCorrect,
    })
  }

  async function onCheck() {
    if (selected === null) return
    setChecked(true)
    const wasCorrect = selected === item.answer
    if (wasCorrect) setCorrectCount((c) => c + 1)
    else if (!isPracticeMode) setHearts((h) => Math.max(0, h - 1))
    // Log attempt for spaced repetition (both lesson + practice modes)
    await logAttempt(item.id, wasCorrect)
  }

  async function onContinue() {
    if (itemIndex + 1 < items.length) {
      setItemIndex(itemIndex + 1)
      setSelected(null)
      setChecked(false)
    } else {
      const questions = items.filter(i => i._kind === 'question')
      const finalCorrect = correctCount + (item._kind === 'question' && selected === item.answer ? 1 : 0)
      const xpEarned = finalCorrect * 10

      if (!isPracticeMode) {
        const score = questions.length > 0 ? finalCorrect / questions.length : 1
        const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        await supabase.from('progress').upsert(
          { user_id: user.id, lesson_id: lessonId, score, completed_at: new Date().toISOString(), due_at: dueAt },
          { onConflict: 'user_id,lesson_id' }
        )
        await supabase.from('profiles').update({
          xp: (profile?.xp ?? 0) + xpEarned,
          streak: (profile?.streak ?? 0) + 1,
          hearts,
        }).eq('id', user.id)
      }
      setCompleted(true)
    }
  }

  function onReadingNext() {
    if (itemIndex + 1 < items.length) {
      setItemIndex(itemIndex + 1)
      setSelected(null)
      setChecked(false)
    } else {
      onContinue()
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}><p className="text-gray-600 font-mono text-sm">Loading lesson...</p></div>

  if (!lesson) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
      <h1 className="text-3xl font-black tracking-tight mb-3">Lesson not found</h1>
      <Link href="/dashboard" className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to dashboard</Link>
    </div>
  )

  // ============ PRACTICE SETUP SCREEN ============
  if (isPracticeMode && practiceSetupNeeded) {
    const { total, mastered } = practicePoolStats
    const remaining = total - mastered

    if (total === 0) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
          <h1 className="text-3xl font-black tracking-tight mb-3">No practice questions yet</h1>
          <p className="text-gray-600 mb-6 max-w-md">This lesson does not have any practice questions yet. Practice questions are separate from lesson questions.</p>
          <Link href={course ? `/courses/${course.id}` : '/dashboard'} className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to lesson tree</Link>
        </div>
      )
    }

    const percentMastered = Math.round((mastered / total) * 100)

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: '#f6fbf8' }}>
        <div className="max-w-md w-full">
          <Link href={course ? `/courses/${course.id}` : '/dashboard'} className="inline-flex items-center gap-1 px-3 py-1.5 mb-4 bg-white border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29]">
            ← Back
          </Link>

          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// practice problems</p>
          <h1 className="text-3xl font-black tracking-tight leading-tight mb-1">{lesson.title}</h1>
          <p className="text-sm text-gray-600 mb-6">Drill the practice question pool. Wrong answers come back more often, mastered questions appear less.</p>

          {/* Mastery progress */}
          <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-5 mb-6 shadow-[4px_4px_0_#1a1d29]">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-mono tracking-widest uppercase font-bold text-gray-700">Your mastery</p>
              <p className="text-xs font-mono font-bold" style={{ color: '#00b395' }}>{percentMastered}%</p>
            </div>
            <div className="h-3 bg-gray-100 border-2 border-gray-900 rounded-full overflow-hidden mb-2">
              <div className="h-full transition-all" style={{ width: `${percentMastered}%`, background: '#fbbf24' }} />
            </div>
            <p className="text-xs text-gray-600">
              <strong>{mastered}</strong> mastered · <strong>{remaining}</strong> still drilling · <strong>{total}</strong> total
            </p>
          </div>

          <p className="text-xs font-mono tracking-widest uppercase font-bold text-gray-700 mb-3">How many today?</p>
          <div className="grid grid-cols-2 gap-3">
            {[5, 10, 20].map(size => (
              <button
                key={size}
                onClick={() => startPracticeSession(size)}
                disabled={size > remaining && remaining < total}
                className="p-4 bg-white border-[2.5px] border-gray-900 rounded-xl font-black shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all text-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="text-3xl mb-0.5">{Math.min(size, remaining)}</p>
                <p className="text-xs uppercase tracking-widest text-gray-600">questions</p>
              </button>
            ))}
            <button
              onClick={() => startPracticeSession('all')}
              className="p-4 text-white border-[2.5px] border-gray-900 rounded-xl font-black shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all text-center"
              style={{ background: '#00b395' }}
            >
              <p className="text-3xl mb-0.5">All {remaining}</p>
              <p className="text-xs uppercase tracking-widest opacity-90">marathon</p>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (items.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
      <h1 className="text-3xl font-black tracking-tight mb-3">No content yet</h1>
      <p className="text-gray-600 mb-6">This lesson does not have content yet.</p>
      <Link href={course ? `/courses/${course.id}` : '/dashboard'} className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>← Back to lesson tree</Link>
    </div>
  )

  // Completion screen
  if (completed) {
    const questions = items.filter(i => i._kind === 'question')
    const accuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 100
    const xpEarned = correctCount * 10

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
        <div className="w-28 h-28 border-[4px] border-gray-900 rounded-full flex items-center justify-center text-5xl mb-5 shadow-[0_6px_0_#1a1d29]" style={{ background: '#b4f1e7' }}>
          {accuracy === 100 ? '🏆' : accuracy >= 70 ? '⭐' : '💪'}
        </div>
        <h1 className="text-4xl font-black tracking-tight mb-2 leading-none">
          {isPracticeMode ? 'Practice complete:' : 'Quest complete:'}
        </h1>
        <p className="text-2xl italic font-normal mb-2" style={{ color: '#00b395' }}>{lesson.title}</p>
        {isPracticeMode && <p className="text-xs text-gray-500 mb-6 font-mono uppercase tracking-widest">// practice mode — XP not earned, but mastery tracked</p>}

        <div className="flex gap-3 mb-7 flex-wrap justify-center">
          {!isPracticeMode && (
            <div className="bg-white border-[3px] border-gray-900 rounded-xl px-5 py-3 shadow-[3px_3px_0_#1a1d29]">
              <p className="text-xs font-mono tracking-widest uppercase text-gray-600 mb-0.5">XP earned</p>
              <p className="text-2xl font-black" style={{ color: '#00b395' }}>+{xpEarned}</p>
            </div>
          )}
          <div className="bg-white border-[3px] border-gray-900 rounded-xl px-5 py-3 shadow-[3px_3px_0_#1a1d29]">
            <p className="text-xs font-mono tracking-widest uppercase text-gray-600 mb-0.5">Accuracy</p>
            <p className="text-2xl font-black text-teal-600">{accuracy}%</p>
          </div>
          {!isPracticeMode && (
            <div className="bg-white border-[3px] border-gray-900 rounded-xl px-5 py-3 shadow-[3px_3px_0_#1a1d29]">
              <p className="text-xs font-mono tracking-widest uppercase text-gray-600 mb-0.5">Streak</p>
              <p className="text-2xl font-black" style={{ color: '#00b395' }}>🔥 +1</p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Link href={course ? `/courses/${course.id}` : '/dashboard'} className="px-6 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] text-sm" style={{ background: '#00b395' }}>
            Back to lesson tree
          </Link>
          {isPracticeMode && (
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] text-sm"
            >
              Practice again
            </button>
          )}
        </div>
      </div>
    )
  }

  // ============ MAIN VIEW ============
  const progress = ((itemIndex + (checked || item._kind === 'reading' ? 1 : 0)) / items.length) * 100
  const isCorrect = item._kind === 'question' && selected === item.answer

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#f6fbf8' }}>
      <div className="border-b-[2px] border-gray-900 px-4 py-2 flex items-center gap-4 flex-shrink-0" style={{ background: '#b4f1e7' }}>
        <Link href={course ? `/courses/${course.id}` : '/dashboard'} className="w-8 h-8 border-2 border-gray-900 rounded-full bg-white flex items-center justify-center text-sm font-bold shadow-[2px_2px_0_#1a1d29]" aria-label="Close">✕</Link>
        <div className="flex-1 h-3 bg-white border-2 border-gray-900 rounded-full overflow-hidden">
          <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background: '#00b395' }} />
        </div>
        {isPracticeMode ? (
          <span className="text-xs font-mono uppercase tracking-widest font-bold" style={{ color: '#00b395' }}>practice</span>
        ) : (
          <div className="flex gap-1 items-center font-black text-pink-700 text-sm">
            <span>♥</span><span>{hearts}</span>
          </div>
        )}
      </div>

      {item._kind === 'reading' ? (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl w-full mx-auto px-5 py-6">
              <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>
                // {lesson.title} — reading {itemIndex + 1} of {items.length}
              </p>
              <h1 className="text-3xl font-black tracking-tight leading-tight mb-5">{item.title}</h1>
              <article
                className="prose prose-base max-w-none prose-headings:font-black prose-headings:tracking-tight prose-img:rounded-xl prose-img:border-2 prose-img:border-gray-900"
                dangerouslySetInnerHTML={{ __html: item.content || '' }}
              />
            </div>
          </div>
          <div className="border-t-[3px] border-gray-900 px-5 py-3 flex justify-end flex-shrink-0" style={{ background: '#b4f1e7' }}>
            <button onClick={onReadingNext} className="px-7 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] text-sm" style={{ background: '#00b395' }}>
              {itemIndex + 1 < items.length ? 'Continue →' : 'Finish'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl w-full mx-auto px-5 py-5">
              <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>
                // {isPracticeMode ? 'Practice' : lesson.title} — Question {itemIndex + 1} of {items.length}
              </p>
              <div className="bg-white border-l-4 px-4 py-3 mb-4 rounded-r-xl text-gray-800 leading-relaxed text-sm" style={{ borderColor: '#00b395' }}>
                {item.stem}
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {item.choices.map((c, i) => {
                  let cls = 'bg-white border-[2px] border-gray-900 rounded-xl px-4 py-3 shadow-[3px_3px_0_#1a1d29] text-left flex items-center gap-3 text-sm font-medium transition-all'
                  if (checked) {
                    if (i === item.answer) cls = 'bg-green-200 border-[2px] border-green-700 rounded-xl px-4 py-3 shadow-[3px_3px_0_#1a1d29] text-left flex items-center gap-3 text-sm font-medium'
                    else if (i === selected) cls = 'bg-red-200 border-[2px] border-red-700 rounded-xl px-4 py-3 shadow-[3px_3px_0_#1a1d29] text-left flex items-center gap-3 text-sm font-medium'
                    else cls += ' opacity-40'
                  } else if (i === selected) {
                    cls = 'bg-emerald-100 border-[2px] border-gray-900 rounded-xl px-4 py-3 shadow-[3px_3px_0_#1a1d29] text-left flex items-center gap-3 text-sm font-medium'
                  } else {
                    cls += ' hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] cursor-pointer'
                  }
                  return (
                    <button key={i} className={cls} onClick={() => !checked && setSelected(i)} disabled={checked}>
                      <span className="w-7 h-7 border-2 border-gray-900 rounded-lg bg-white flex items-center justify-center font-black text-xs flex-shrink-0">{String.fromCharCode(65 + i)}</span>
                      <span>{c}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {!checked ? (
            <div className="border-t-[3px] border-gray-900 px-5 py-3 flex justify-end flex-shrink-0" style={{ background: '#b4f1e7' }}>
              <button disabled={selected === null} onClick={onCheck} className="px-7 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] disabled:opacity-40 disabled:cursor-not-allowed text-sm" style={{ background: '#00b395' }}>
                Check answer
              </button>
            </div>
          ) : (
            <div className={`border-t-[3px] border-gray-900 px-5 py-3 flex items-center justify-between gap-4 flex-wrap flex-shrink-0 ${isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
              <div className="flex-1 min-w-48">
                <h3 className={`text-lg font-black mb-0.5 ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                  {isCorrect ? 'Excellent.' : 'Not quite.'}
                </h3>
                <p className="text-xs text-gray-700 leading-relaxed">{item.explanation}</p>
              </div>
              <button onClick={onContinue} className={`px-7 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] text-sm flex-shrink-0 ${isCorrect ? 'bg-green-600' : 'bg-gray-900'}`}>
                {itemIndex + 1 < items.length ? 'Continue' : 'Finish'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}