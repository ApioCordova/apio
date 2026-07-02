'use client'

import Image from 'next/image'

/**
 * First-visit welcome screen — shown once, right after signup
 * (profiles.onboarded = false).
 *
 * Props:
 *   open    boolean
 *   onPick  (kind: 'student' | 'teacher' | 'self') => void
 *   onSkip  () => void
 */
const OPTIONS = [
  {
    kind: 'student',
    icon: '🎓',
    title: "I'm a student",
    desc: "My teacher gave me a class code. Join your class to see lessons and assignments the moment they go out.",
    cta: 'Join with a class code →',
    color: '#ef4444',
    soft: '#fca5a5',
    tint: '#fee2e2',
  },
  {
    kind: 'teacher',
    icon: '🧑‍🏫',
    title: "I'm a teacher",
    desc: "Create a class, share one join code with your students, and assign lessons while tracking everyone's progress.",
    cta: 'Create a class →',
    color: '#f59e0b',
    soft: '#fcd34d',
    tint: '#fef3c7',
  },
  {
    kind: 'self',
    icon: '🚀',
    title: "I'm self-studying",
    desc: "Studying on your own schedule. Pick from Apio's AP, DSAT, and STAAR courses and go at your own pace.",
    cta: 'Browse the courses →',
    color: '#3b82f6',
    soft: '#93c5fd',
    tint: '#dbeafe',
  },
]

export default function Onboarding({ open, onPick, onSkip }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[170] overflow-y-auto" style={{ background: '#b4f1e7' }}>
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
        <div className="flex items-center gap-2 mb-6">
          <Image src="/apio-logo.png" alt="Apio" width={40} height={40} className="rounded-lg" />
          <span className="text-2xl font-black tracking-tight">Apio</span>
        </div>

        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// welcome</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-center mb-2">How will you use Apio?</h1>
        <p className="text-sm text-gray-700 text-center mb-8 max-w-md">
          Pick the one that fits you best — you can always add classes or courses later from your dashboard.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {OPTIONS.map((o) => (
            <button
              key={o.kind}
              onClick={() => onPick(o.kind)}
              className="apio-onboard-card text-left bg-white border-[3px] border-gray-900 rounded-2xl p-6 shadow-[5px_5px_0_#1a1d29] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[7px_7px_0_#1a1d29] transition-all"
              style={{ '--glow': o.color, '--glow-soft': o.soft }}
            >
              <div className="w-14 h-14 border-2 border-gray-900 rounded-xl flex items-center justify-center text-3xl mb-4" style={{ background: o.tint }}>
                {o.icon}
              </div>
              <p className="text-xl font-black tracking-tight mb-1">{o.title}</p>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">{o.desc}</p>
              <span className="text-sm font-black uppercase tracking-wide" style={{ color: o.color }}>{o.cta}</span>
            </button>
          ))}
        </div>

        <button onClick={onSkip} className="mt-8 text-sm font-bold text-gray-600 underline underline-offset-4 hover:text-gray-900">
          Skip for now — I&apos;ll decide later
        </button>
      </div>
    </div>
  )
}