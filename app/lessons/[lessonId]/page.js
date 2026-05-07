'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LessonPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = params.lessonId

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [course, setCourse] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)

  const [qIndex, setQIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [hearts, setHearts] = useState(5)
  const [completed, setCompleted] = useState(false)

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
      setHearts(profileData?.hearts ?? 5)

      const { data: lessonData, error: lessonError } = await supabase
        .from('lessons')
        .select(`
          *,
          unit:units (
            *,
            course:courses (*)
          )
        `)
        .eq('id', lessonId)
        .single()

      if (lessonError || !lessonData) {
        setLoading(false)
        return
      }
      setLesson(lessonData)
      setCourse(lessonData.unit?.course)

      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('sort_order')
      setQuestions(qData || [])

      setLoading(false)
    }
    loadData()
  }, [lessonId, router])

  function onCheck() {
    if (selected === null) return
    setChecked(true)
    const q = questions[qIndex]
    if (selected === q.answer) {
      setCorrectCount((c) => c + 1)
    } else {
      setHearts((h) => Math.max(0, h - 1))
    }
  }

  async function onContinue() {
    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1)
      setSelected(null)
      setChecked(false)
    } else {
      const finalCorrect = correctCount + (selected === questions[qIndex].answer ? 1 : 0)
      const score = finalCorrect / questions.length
      const xpEarned = finalCorrect * 10

      const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
      await supabase.from('progress').upsert(
        {
          user_id: user.id,
          lesson_id: lessonId,
          score,
          completed_at: new Date().toISOString(),
          due_at: dueAt,
        },
        { onConflict: 'user_id,lesson_id' }
      )

      await supabase
        .from('profiles')
        .update({
          xp: (profile?.xp ?? 0) + xpEarned,
          streak: (profile?.streak ?? 0) + 1,
          hearts: hearts,
        })
        .eq('id', user.id)

      setCompleted(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}>
        <p className="text-gray-600 font-mono text-sm">Loading lesson...</p>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
        <h1 className="text-3xl font-black tracking-tight mb-3">Lesson not found</h1>
        <Link href="/dashboard" className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]" style={{ background: '#00b395' }}>
          ← Back to dashboard
        </Link>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
        <h1 className="text-3xl font-black tracking-tight mb-3">No questions yet</h1>
        <p className="text-gray-600 mb-6">This lesson does not have any questions yet. Come back later!</p>
        <Link
          href={course ? `/courses/${course.id}` : '/dashboard'}
          className="px-6 py-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold shadow-[4px_4px_0_#1a1d29]"
          style={{ background: '#00b395' }}
        >
          ← Back to lesson tree
        </Link>
      </div>
    )
  }

  // ============ COMPLETION SCREEN ============
  if (completed) {
    const accuracy = Math.round((correctCount / questions.length) * 100)
    const xpEarned = correctCount * 10

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#f6fbf8' }}>
        <div className="w-28 h-28 border-[4px] border-gray-900 rounded-full flex items-center justify-center text-5xl mb-5 shadow-[0_6px_0_#1a1d29]" style={{ background: '#b4f1e7' }}>
          {accuracy === 100 ? '🏆' : accuracy >= 70 ? '⭐' : '💪'}
        </div>
        <h1 className="text-4xl font-black tracking-tight mb-2 leading-none">
          Quest complete:
        </h1>
        <p className="text-2xl italic font-normal mb-6" style={{ color: '#00b395' }}>{lesson.title}</p>

        <div className="flex gap-3 mb-7 flex-wrap justify-center">
          <div className="bg-white border-[3px] border-gray-900 rounded-xl px-5 py-3 shadow-[3px_3px_0_#1a1d29]">
            <p className="text-xs font-mono tracking-widest uppercase text-gray-600 mb-0.5">XP earned</p>
            <p className="text-2xl font-black" style={{ color: '#00b395' }}>+{xpEarned}</p>
          </div>
          <div className="bg-white border-[3px] border-gray-900 rounded-xl px-5 py-3 shadow-[3px_3px_0_#1a1d29]">
            <p className="text-xs font-mono tracking-widest uppercase text-gray-600 mb-0.5">Accuracy</p>
            <p className="text-2xl font-black text-teal-600">{accuracy}%</p>
          </div>
          <div className="bg-white border-[3px] border-gray-900 rounded-xl px-5 py-3 shadow-[3px_3px_0_#1a1d29]">
            <p className="text-xs font-mono tracking-widest uppercase text-gray-600 mb-0.5">Streak</p>
            <p className="text-2xl font-black" style={{ color: '#00b395' }}>🔥 +1</p>
          </div>
        </div>

        <Link
          href={course ? `/courses/${course.id}` : '/dashboard'}
          className="px-6 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#1a1d29] transition-all"
          style={{ background: '#00b395' }}
        >
          Back to lesson tree
        </Link>
      </div>
    )
  }

  // ============ QUIZ SCREEN ============
  const q = questions[qIndex]
  const isCorrect = selected === q.answer
  const progress = ((qIndex + (checked ? 1 : 0)) / questions.length) * 100

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#f6fbf8' }}>
      {/* Top bar — compact */}
      <div className="border-b-[2px] border-gray-900 px-4 py-2 flex items-center gap-4 flex-shrink-0" style={{ background: '#b4f1e7' }}>
        <Link
          href={course ? `/courses/${course.id}` : '/dashboard'}
          className="w-8 h-8 border-2 border-gray-900 rounded-full bg-white flex items-center justify-center text-sm font-bold shadow-[2px_2px_0_#1a1d29]"
          aria-label="Close"
        >
          ✕
        </Link>

        <div className="flex-1 h-3 bg-white border-2 border-gray-900 rounded-full overflow-hidden relative">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progress}%`, background: '#00b395' }}
          />
        </div>

        <div className="flex gap-1 items-center font-black text-pink-700 text-sm">
          <span>♥</span>
          <span>{hearts}</span>
        </div>
      </div>

      {/* Question body — scrollable if needed but compact */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl w-full mx-auto px-5 py-5">
          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>
            // {lesson.title} — Question {qIndex + 1} of {questions.length}
          </p>

          <div className="bg-white border-l-4 px-4 py-3 mb-4 rounded-r-xl text-gray-800 leading-relaxed text-sm" style={{ borderColor: '#00b395' }}>
            {q.stem}
          </div>

          <div className="flex flex-col gap-2 mb-4">
            {q.choices.map((c, i) => {
              let cls = 'bg-white border-[2px] border-gray-900 rounded-xl px-4 py-3 shadow-[3px_3px_0_#1a1d29] text-left flex items-center gap-3 text-sm font-medium transition-all'
              if (checked) {
                if (i === q.answer) cls = 'bg-green-200 border-[2px] border-green-700 rounded-xl px-4 py-3 shadow-[3px_3px_0_#1a1d29] text-left flex items-center gap-3 text-sm font-medium'
                else if (i === selected) cls = 'bg-red-200 border-[2px] border-red-700 rounded-xl px-4 py-3 shadow-[3px_3px_0_#1a1d29] text-left flex items-center gap-3 text-sm font-medium'
                else cls += ' opacity-40'
              } else if (i === selected) {
                cls = 'bg-emerald-100 border-[2px] border-gray-900 rounded-xl px-4 py-3 shadow-[3px_3px_0_#1a1d29] text-left flex items-center gap-3 text-sm font-medium'
              } else {
                cls += ' hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] cursor-pointer'
              }
              return (
                <button
                  key={i}
                  className={cls}
                  onClick={() => !checked && setSelected(i)}
                  disabled={checked}
                >
                  <span className="w-7 h-7 border-2 border-gray-900 rounded-lg bg-white flex items-center justify-center font-black text-xs flex-shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{c}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom bar — always visible */}
      {!checked ? (
        <div className="border-t-[3px] border-gray-900 px-5 py-3 flex justify-end flex-shrink-0" style={{ background: '#b4f1e7' }}>
          <button
            disabled={selected === null}
            onClick={onCheck}
            className="px-7 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#1a1d29] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[4px_4px_0_#1a1d29] text-sm"
            style={{ background: '#00b395' }}
          >
            Check answer
          </button>
        </div>
      ) : (
        <div className={`border-t-[3px] border-gray-900 px-5 py-3 flex items-center justify-between gap-4 flex-wrap flex-shrink-0 ${isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
          <div className="flex-1 min-w-48">
            <h3 className={`text-lg font-black mb-0.5 ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
              {isCorrect ? 'Excellent.' : 'Not quite.'}
            </h3>
            <p className="text-xs text-gray-700 leading-relaxed">{q.explanation}</p>
          </div>
          <button
            onClick={onContinue}
            className={`px-7 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#1a1d29] transition-all text-sm flex-shrink-0 ${isCorrect ? 'bg-green-600' : 'bg-gray-900'}`}
          >
            {qIndex + 1 < questions.length ? 'Continue' : 'Finish'}
          </button>
        </div>
      )}
    </div>
  )
}