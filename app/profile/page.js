'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function ProfilePage() {
  const router = useRouter()
  const fileInputRef = useRef(null)

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('') // working copy while editing
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'error' | 'success', text }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(profileData)
      setFullName(profileData?.full_name || '')
      setUsername(profileData?.username || '')
      setAvatarUrl(profileData?.avatar_url || '')

      // "Courses you're taking" = any course the user has lesson progress in.
      const { data: progressRows } = await supabase
        .from('progress')
        .select('lesson:lessons ( unit:units ( course:courses ( id, title, short_title, tone, icon ) ) )')
        .eq('user_id', user.id)

      const seen = {}
      const list = []
      for (const row of progressRows || []) {
        const c = row?.lesson?.unit?.course
        if (c && !seen[c.id]) { seen[c.id] = true; list.push(c) }
      }
      setCourses(list)

      setLoading(false)
    }
    load()
  }, [router])

  function flash(type, text) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { flash('error', 'Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { flash('error', 'Image must be under 5 MB.'); return }

    setUploading(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (upErr) { setUploading(false); flash('error', 'Upload failed: ' + upErr.message); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(publicUrl)
    setUploading(false)
  }

  async function handleSave() {
    const cleanName = fullName.trim()
    const cleanUsername = username.trim().toLowerCase()

    if (!cleanName) { flash('error', 'Name cannot be empty.'); return }
    if (cleanUsername && !/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      flash('error', 'Username must be 3\u201320 characters: letters, numbers, or underscores.')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: cleanName,
        username: cleanUsername || null,
        avatar_url: avatarUrl || null,
      })
      .eq('id', user.id)
    setSaving(false)

    if (error) {
      if (error.code === '23505') { flash('error', 'That username is already taken.'); return }
      flash('error', 'Could not save: ' + error.message); return
    }

    setProfile((p) => ({ ...p, full_name: cleanName, username: cleanUsername || null, avatar_url: avatarUrl || null }))
    setEditing(false)
    flash('success', 'Profile updated!')
  }

  function cancelEdit() {
    setFullName(profile?.full_name || '')
    setUsername(profile?.username || '')
    setAvatarUrl(profile?.avatar_url || '')
    setEditing(false)
    setMessage(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f6fbf8' }}>
        <p className="text-gray-600 font-mono text-sm">Loading...</p>
      </div>
    )
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0]
  const initials = (displayName || '?').trim().charAt(0).toUpperCase()
  const shownAvatar = editing ? avatarUrl : profile?.avatar_url

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-2" style={{ background: '#b4f1e7' }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
          <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
        </Link>
        <Link
          href="/dashboard"
          className="px-2.5 py-1 bg-white border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
        >
          &larr; Dashboard
        </Link>
      </div>

      <div className="max-w-3xl mx-auto p-6 md:p-8">
        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// Your profile</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-6">Account</h1>

        {message && (
          <div className={`mb-5 p-3 rounded-xl text-sm border-2 ${
            message.type === 'error'
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-green-50 border-green-300 text-green-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Profile card */}
        <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-6 md:p-8 shadow-[6px_6px_0_#1a1d29]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-6">
            {/* Avatar */}
            <div className="relative w-24 h-24 shrink-0">
              {shownAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownAvatar} alt="Profile" className="w-24 h-24 rounded-full object-cover border-[3px] border-gray-900" />
              ) : (
                <div className="w-24 h-24 rounded-full border-[3px] border-gray-900 flex items-center justify-center text-3xl font-black text-white" style={{ background: '#00b395' }}>
                  {initials}
                </div>
              )}
              {editing && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-gray-900 text-white border-2 border-white flex items-center justify-center text-sm shadow disabled:opacity-50"
                  title="Change photo"
                >
                  {uploading ? '\u2026' : '\u270E'}
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" />
            </div>

            <div className="min-w-0">
              <h2 className="text-2xl font-black tracking-tight truncate">{displayName}</h2>
              {profile?.username && <p className="text-gray-600 font-mono text-sm">@{profile.username}</p>}
            </div>

            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="sm:ml-auto px-4 py-2 text-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all"
                style={{ background: '#00b395' }}
              >
                Edit profile
              </button>
            )}
          </div>

          {/* Fields */}
          <div className="space-y-4">
            <Field label="Name">
              {editing ? (
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-3 border-[2.5px] border-gray-900 rounded-xl font-medium focus:outline-none focus:bg-white"
                  style={{ background: '#f6fbf8' }}
                />
              ) : (
                <p className="font-bold">{profile?.full_name || '\u2014'}</p>
              )}
            </Field>

            <Field label="Username">
              {editing ? (
                <div>
                  <div className="flex items-center border-[2.5px] border-gray-900 rounded-xl overflow-hidden" style={{ background: '#f6fbf8' }}>
                    <span className="px-3 text-gray-500 font-mono select-none">@</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="your_handle"
                      className="flex-1 p-3 bg-transparent font-medium focus:outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">3\u201320 characters \u00b7 letters, numbers, underscores.</p>
                </div>
              ) : (
                <p className="font-bold">{profile?.username ? '@' + profile.username : '\u2014'}</p>
              )}
            </Field>

            <Field label="Email">
              <p className="font-bold text-gray-700">{profile?.email || user?.email}</p>
              <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
            </Field>
          </div>

          {editing && (
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving || uploading}
                className="px-5 py-2.5 text-white border-2 border-gray-900 rounded-xl font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all disabled:opacity-50"
                style={{ background: '#00b395' }}
              >
                {saving ? 'Saving\u2026' : 'Save changes'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="px-5 py-2.5 bg-white border-2 border-gray-900 rounded-xl font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Courses */}
        <h2 className="text-xl font-black tracking-tight mt-8 mb-3">Courses you're taking</h2>
        {courses.length === 0 ? (
          <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-6 shadow-[4px_4px_0_#1a1d29] text-gray-600">
            You haven\u2019t started any courses yet.{' '}
            <Link href="/dashboard" className="font-bold underline" style={{ color: '#00b395' }}>Browse courses \u2192</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courses.map((c) => {
              const color = /^#[0-9a-fA-F]{6}$/.test(c.tone)
                ? c.tone
                : (c.tone === 'gov' ? '#6b7280' : '#00b395')
              return (
                <Link
                  key={c.id}
                  href={`/courses/${c.id}`}
                  className="flex items-center gap-3 bg-white border-[3px] border-gray-900 rounded-2xl p-4 shadow-[4px_4px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#1a1d29] transition-all"
                >
                  <div className="w-11 h-11 rounded-xl border-2 border-gray-900 flex items-center justify-center text-xl shrink-0" style={{ background: color + '33' }}>
                    {c.icon || '\uD83D\uDCD8'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black tracking-tight truncate">{c.title}</p>
                    {c.short_title && <p className="text-xs font-mono text-gray-500 truncate">{c.short_title}</p>}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  )
}