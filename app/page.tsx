'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: '#f6fbf8' }}>
      <div className="max-w-2xl text-center">
        <div className="inline-block mb-6">
          <Image
            src="/apio-logo.png"
            alt="Apio logo"
            width={80}
            height={80}
            className="rounded-2xl"
          />
        </div>

        <h1 className="text-6xl md:text-7xl font-black tracking-tight text-gray-900 mb-4">
          Welcome to <span className="italic font-normal" style={{ color: '#00b395' }}>Apio</span>
        </h1>

        <p className="text-lg text-gray-700 mb-10 max-w-lg mx-auto">
          Master AP courses one quest at a time. Bite-sized lessons, real exam-style questions, progress that follows you everywhere.
        </p>

        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/login"
            className="px-8 py-4 text-white border-[3px] border-gray-900 rounded-xl font-bold text-lg shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_#1a1d29] transition-all"
            style={{ background: '#00b395' }}
          >
            Get started →
          </Link>
        </div>

        <p className="text-xs text-gray-500 mt-12 font-mono uppercase tracking-widest">
          // AP U.S. History · AP Calculus AB · More coming soon
        </p>
      </div>
    </div>
  )
}