'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function handleEmailAuth(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
        },
      })
      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        setMessage({
          type: 'success',
          text: 'Account created! Check your email to confirm, then come back to sign in.',
        })
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        router.push('/dashboard')
      }
    }

    setLoading(false)
  }

  async function handleGoogleAuth() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })
    if (error) {
      setMessage({ type: 'error', text: error.message })
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#f6fbf8' }}>
      <Link href="/" className="mb-8 flex items-center gap-3">
        <Image src="/apio-logo.png" alt="Apio" width={40} height={40} className="rounded-lg" />
        <span className="text-2xl font-black tracking-tight">Apio</span>
      </Link>

      <div className="w-full max-w-md bg-white border-[3px] border-gray-900 rounded-2xl p-5 md:p-8 shadow-[4px_4px_0_#1a1d29] md:shadow-[8px_8px_0_#1a1d29] mx-4 md:mx-0">
        <h1 className="text-3xl font-black tracking-tight mb-2">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-gray-600 text-sm mb-6">
          {mode === 'signup'
            ? 'Start your AP quest today.'
            : 'Sign in to continue your progress.'}
        </p>

        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full p-3 mb-3 bg-white border-[2.5px] border-gray-900 rounded-xl font-bold flex items-center justify-center gap-3 shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#1a1d29] transition-all disabled:opacity-50"
        >
          <svg viewBox="0 0 18 18" width="18" height="18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>

        <div className="text-center my-4 text-xs font-mono tracking-widest text-gray-500 uppercase">
          or
        </div>

        <form onSubmit={handleEmailAuth}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full p-3 mb-3 border-[2.5px] border-gray-900 rounded-xl font-medium focus:outline-none focus:bg-white"
              style={{ background: '#f6fbf8' }}
            />
          )}
          <input
            type="email"
            placeholder="you@school.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full p-3 mb-3 border-[2.5px] border-gray-900 rounded-xl font-medium focus:outline-none focus:bg-white"
            style={{ background: '#f6fbf8' }}
          />
          <input
            type="password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full p-3 mb-4 border-[2.5px] border-gray-900 rounded-xl font-medium focus:outline-none focus:bg-white"
            style={{ background: '#f6fbf8' }}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full p-3 text-white border-[2.5px] border-gray-900 rounded-xl font-bold uppercase tracking-wide shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#1a1d29] transition-all disabled:opacity-50"
            style={{ background: '#00b395' }}
          >
            {loading ? 'Loading...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {message && (
          <div
            className={`mt-4 p-3 rounded-xl text-sm border-2 ${
              message.type === 'error'
                ? 'bg-red-50 border-red-300 text-red-800'
                : 'bg-green-50 border-green-300 text-green-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setMessage(null)
          }}
          className="w-full mt-6 text-sm text-gray-600 hover:text-gray-900 underline"
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}