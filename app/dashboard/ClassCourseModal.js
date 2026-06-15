'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * "Add a class course" flow.
 *  choose -> student (join by code) | teacher (create a class)
 *
 * Props:
 *   open       boolean
 *   onClose    () => void
 *   onSuccess  () => void   // fired after a successful join/create so the dashboard can refresh
 *   catalog    course[]     // published courses, for the teacher's course picker
 */
export default function ClassCourseModal({ open, onClose, onSuccess, catalog = [] }) {
  const [step, setStep] = useState('choose')   // 'choose' | 'student' | 'teacher'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // student
  const [code, setCode] = useState('')
  const [joined, setJoined] = useState(null)   // { name }

  // teacher
  const [name, setName] = useState('')
  const [courseId, setCourseId] = useState('')
  const [capacity, setCapacity] = useState('')
  const [created, setCreated] = useState(null) // { code }
  const [copied, setCopied] = useState(false)

  if (!open) return null

  function reset() {
    setStep('choose'); setBusy(false); setError('')
    setCode(''); setJoined(null)
    setName(''); setCourseId(''); setCapacity(''); setCreated(null); setCopied(false)
  }
  function close() { reset(); onClose?.() }
  function back() { setError(''); setStep('choose') }

  async function handleJoin() {
    setError('')
    if (!code.trim()) { setError('Enter the class code your teacher gave you.'); return }
    setBusy(true)
    const { data, error: e } = await supabase.rpc('join_class_by_code', { p_code: code.trim() })
    setBusy(false)
    if (e) { setError('Something went wrong. Please try again.'); return }
    switch (data?.status) {
      case 'ok':      setJoined({ name: data.class_name }); onSuccess?.(); break
      case 'invalid': setError("That code didn't match any class. Double-check it and try again."); break
      case 'full':    setError('That class is already full.'); break
      case 'already': setError(`You're already in ${data.class_name || 'that class'}.`); break
      case 'own':     setError("That's your own class — you're the teacher of it."); break
      case 'ended':   setError('That class has ended and is no longer accepting students.'); break
      default:        setError(data?.message || 'Could not join. Please try again.')
    }
  }

  async function handleCreate() {
    setError('')
    if (!name.trim()) { setError('Please enter a class name.'); return }
    if (!courseId)    { setError('Please pick a course.'); return }
    setBusy(true)
    const cap = capacity === '' ? null : parseInt(capacity, 10)
    const { data, error: e } = await supabase.rpc('create_class', {
      p_name: name.trim(), p_course_id: courseId, p_capacity: cap,
    })
    setBusy(false)
    if (e) { setError('Something went wrong. Please try again.'); return }
    if (data?.status === 'ok') { setCreated({ code: data.code }); onSuccess?.() }
    else setError(data?.message || 'Could not create the class.')
  }

  function copyCode() {
    if (!created?.code) return
    navigator.clipboard?.writeText(created.code)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const eyebrow =
    step === 'student' ? '// join a class' :
    step === 'teacher' ? '// create a class' :
    '// class course'
  const title =
    joined ? "You're in!" :
    created ? 'Class created' :
    step === 'student' ? 'Join your class' :
    step === 'teacher' ? 'Create a class' :
    'Add a class course'

  const inputCls =
    'w-full border-2 border-gray-900 rounded-xl px-4 py-2.5 font-medium outline-none focus:shadow-[3px_3px_0_#00b395] transition-shadow'
  const primaryBtn =
    'px-6 py-2.5 text-white border-[2.5px] border-gray-900 rounded-xl font-black uppercase tracking-wide text-sm shadow-[4px_4px_0_#1a1d29] disabled:opacity-50'

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center p-4 md:p-8 overflow-y-auto"
      style={{ background: 'rgba(26,29,41,0.55)' }}
      onClick={close}
    >
      <div
        className="w-full max-w-lg bg-white border-[3px] border-gray-900 rounded-2xl shadow-[8px_8px_0_#1a1d29] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b-[3px] border-gray-900">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#00b395' }}>{eyebrow}</p>
            <h2 className="text-2xl font-black tracking-tight">{title}</h2>
          </div>
          <button onClick={close} className="w-9 h-9 border-2 border-gray-900 rounded-full bg-white flex items-center justify-center font-bold shadow-[2px_2px_0_#1a1d29]" aria-label="Close">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="border-2 border-red-500 bg-red-50 rounded-xl px-4 py-2.5 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {/* ---------- CHOOSE ---------- */}
          {step === 'choose' && !joined && !created && (
            <>
              <p className="text-gray-700 text-sm">Are you joining a class, or setting one up for your students?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => { setError(''); setStep('student') }}
                  className="text-left border-[3px] border-gray-900 rounded-2xl p-5 bg-white hover:translate-x-[-2px] hover:translate-y-[-2px] shadow-[4px_4px_0_#1a1d29] hover:shadow-[6px_6px_0_#1a1d29] transition-all"
                >
                  <div className="w-12 h-12 border-2 border-gray-900 rounded-xl flex items-center justify-center text-2xl mb-3" style={{ background: '#bbf7d0' }}>🎓</div>
                  <p className="text-lg font-black tracking-tight">I&apos;m a student</p>
                  <p className="text-sm text-gray-600">Join with a class code.</p>
                </button>
                <button
                  onClick={() => { setError(''); setStep('teacher') }}
                  className="text-left border-[3px] border-gray-900 rounded-2xl p-5 bg-white hover:translate-x-[-2px] hover:translate-y-[-2px] shadow-[4px_4px_0_#1a1d29] hover:shadow-[6px_6px_0_#1a1d29] transition-all"
                >
                  <div className="w-12 h-12 border-2 border-gray-900 rounded-xl flex items-center justify-center text-2xl mb-3" style={{ background: '#fde68a' }}>🧑‍🏫</div>
                  <p className="text-lg font-black tracking-tight">I&apos;m a teacher</p>
                  <p className="text-sm text-gray-600">Create a class and get a code.</p>
                </button>
              </div>
            </>
          )}

          {/* ---------- STUDENT: join ---------- */}
          {step === 'student' && !joined && (
            <>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Class code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
                  placeholder="e.g. K7M2QP"
                  autoFocus
                  maxLength={12}
                  className={`${inputCls} mt-1 font-mono tracking-[0.3em] text-lg uppercase`}
                />
              </label>
              <div className="flex items-center justify-between gap-3 pt-1">
                <button onClick={back} className="px-4 py-2 border-2 border-gray-900 rounded-xl font-bold text-sm bg-white shadow-[2px_2px_0_#1a1d29]">← Back</button>
                <button onClick={handleJoin} disabled={busy} className={primaryBtn} style={{ background: '#00b395' }}>
                  {busy ? 'Joining…' : 'Join class'}
                </button>
              </div>
            </>
          )}

          {/* ---------- STUDENT: joined ---------- */}
          {joined && (
            <div className="text-center py-2">
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-lg font-black tracking-tight mb-1">Welcome to {joined.name}.</p>
              <p className="text-sm text-gray-600 mb-5">It&apos;s on your dashboard now.</p>
              <button onClick={close} className={primaryBtn} style={{ background: '#00b395' }}>Done</button>
            </div>
          )}

          {/* ---------- TEACHER: create ---------- */}
          {step === 'teacher' && !created && (
            <>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Class name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Period 3 — AP Gov"
                  autoFocus
                  maxLength={60}
                  className={`${inputCls} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Course</span>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={`${inputCls} mt-1`}>
                  <option value="">Pick a course…</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Class size <span className="normal-case tracking-normal">(optional, max 50)</span></span>
                <input
                  type="number" min="1" max="50"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Up to 50 students"
                  className={`${inputCls} mt-1`}
                />
              </label>
              <div className="flex items-center justify-between gap-3 pt-1">
                <button onClick={back} className="px-4 py-2 border-2 border-gray-900 rounded-xl font-bold text-sm bg-white shadow-[2px_2px_0_#1a1d29]">← Back</button>
                <button onClick={handleCreate} disabled={busy} className={primaryBtn} style={{ background: '#00b395' }}>
                  {busy ? 'Creating…' : 'Create class'}
                </button>
              </div>
            </>
          )}

          {/* ---------- TEACHER: created ---------- */}
          {created && (
            <div className="text-center py-2">
              <p className="text-sm text-gray-600 mb-2">Share this code with your students.</p>
              <div className="inline-flex items-center gap-3 border-[3px] border-gray-900 rounded-2xl px-6 py-4 shadow-[4px_4px_0_#1a1d29] mb-4" style={{ background: '#b4f1e7' }}>
                <span className="font-mono text-3xl font-black tracking-[0.3em]">{created.code}</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button onClick={copyCode} className="px-4 py-2 border-2 border-gray-900 rounded-xl font-bold text-sm bg-white shadow-[2px_2px_0_#1a1d29]">
                  {copied ? 'Copied ✓' : 'Copy code'}
                </button>
                <button onClick={close} className={primaryBtn} style={{ background: '#00b395' }}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}