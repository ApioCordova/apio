'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <div className="inline-block mb-6">
          <div className="w-20 h-20 bg-orange-500 border-4 border-gray-900 rounded-2xl flex items-center justify-center text-white text-4xl font-black shadow-[6px_6px_0_#1a1d29] -rotate-6">
            A
          </div>
        </div>

        <h1 className="text-6xl md:text-7xl font-black tracking-tight text-gray-900 mb-4">
          Welcome to <span className="text-orange-500 italic font-normal">Apio</span>
        </h1>

        <p className="text-lg text-gray-700 mb-10 max-w-lg mx-auto">
          Master AP courses one quest at a time. Bite-sized lessons, real exam-style questions, progress that follows you everywhere.
        </p>

        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/login"
            className="px-8 py-4 bg-orange-500 text-white border-[3px] border-gray-900 rounded-xl font-bold text-lg shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_#1a1d29] transition-all"
          >
            Get started →
          </Link>
        </div>

        <p className="text-xs text-gray-500 mt-12 font-mono uppercase tracking-widest">
          // AP US Government · AP Calculus AB · More coming soon
        </p>
      </div>
    </div>
  )
}