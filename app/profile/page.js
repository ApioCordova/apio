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

  // Password / sign-in state
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [hasPassword, setHasPassword] = useState(false) // is a password set? (from server)

  // Delete-account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)

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

      // Does this account have a password? Reliable server check — the `email`
      // identity isn't always added when a Google user sets one.
      const { data: hp } = await supabase.rpc('current_user_has_password')
      setHasPassword(!!hp)

      setLoading(false)
    }
    load()
  }, [router])

  function flash(type, text) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
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
      flash('error', 'Username must be 3–20 characters: letters, numbers, or underscores.')
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

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Works for both cases:
  //  - Email user changing their password
  //  - Google user creating a password (Supabase sets it on the SAME account,
  //    so they can afterward sign in with their email + this password)
  async function handleSavePassword() {
    if (newPassword.length < 8) { flash('error', 'Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { flash('error', 'Passwords do not match.'); return }

    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)

    if (error) { flash('error', 'Could not update password: ' + error.message); return }

    setNewPassword('')
    setConfirmPassword('')
    setShowPwForm(false)
    setHasPassword(true)
    flash('success', 'Password saved! You can now sign in with your email and this password.')
  }

  async function handleDeleteAccount() {
    setDeleting(true)

    // Remove the user's avatar files first. Supabase won't delete an auth user
    // who still owns Storage objects, and storage rows can't be deleted from SQL.
    try {
      const { data: files } = await supabase.storage.from('avatars').list(user.id)
      if (files?.length) {
        await supabase.storage
          .from('avatars')
          .remove(files.map((f) => `${user.id}/${f.name}`))
      }
    } catch {
      // Non-fatal — proceed to the account delete either way.
    }

    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      setDeleting(false)
      flash('error', 'Could not delete account: ' + error.message)
      return
    }
    // Account and login are gone — clear the local session and head home.
    await supabase.auth.signOut()
    router.push('/')
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
  // The primary admin account can never be deleted.
  const canDeleteAccount =
    (profile?.email || user?.email || '').toLowerCase() !== 'demiancordova@cordovaibe.com'

  // Which sign-in methods this account already has.
  const providers = user?.identities?.map((i) => i.provider) || []
  const usesGoogle = providers.includes('google')
  // "Create password" vs "Change password" is driven by whether a password
  // actually exists — the `email` identity isn't reliably added when a Google
  // user sets one, so identities alone can't tell us.
  const hasEmailLogin = hasPassword

  return (
    <div className="min-h-screen" style={{ background: '#f6fbf8' }}>
      {/* Toast — pinned to the bottom of the screen so it's always visible,
          no matter how far down the page you've scrolled. */}
      {message && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-full font-bold text-sm text-white border-[2.5px] border-gray-900 shadow-[4px_4px_0_#1a1d29] max-w-[90vw] text-center"
          style={{ background: message.type === 'error' ? '#ef4444' : '#00b395' }}
        >
          {message.type === 'error' ? '⚠ ' : '✓ '}{message.text}
        </div>
      )}

      {/* Top bar */}
      <div className="border-b-[3px] border-gray-900 px-4 md:px-6 py-3 flex items-center justify-between gap-2" style={{ background: '#b4f1e7' }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/apio-logo.png" alt="Apio" width={32} height={32} className="rounded-lg" />
          <span className="text-xl md:text-2xl font-black tracking-tight">Apio</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="px-2.5 py-1 bg-white border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          >
            ← Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="px-2.5 py-1 bg-white border-2 border-gray-900 rounded-full text-xs font-bold shadow-[2px_2px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_#1a1d29] transition-all"
          >
            Log out
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 md:p-8">
        <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// Your profile</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-6">Account</h1>

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
                  {uploading ? '…' : '✎'}
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
                <p className="font-bold">{profile?.full_name || '—'}</p>
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
                  <p className="text-xs text-gray-500 mt-1">3–20 characters · letters, numbers, underscores.</p>
                </div>
              ) : (
                <p className="font-bold">{profile?.username ? '@' + profile.username : '—'}</p>
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
                {saving ? 'Saving…' : 'Save changes'}
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

        {/* Password / sign-in */}
        <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-6 md:p-8 shadow-[6px_6px_0_#1a1d29] mt-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-xl font-black tracking-tight">
                {hasEmailLogin ? 'Password' : 'Create a password'}
              </h2>
              <p className="text-sm text-gray-600 mt-1 max-w-md">
                {hasEmailLogin
                  ? 'Change the password you use to sign in with your email.'
                  : 'You signed in with Google. Set a password to also sign in with your email and password.'}
              </p>
            </div>
            {usesGoogle && (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold border-2 border-gray-900 shrink-0" style={{ background: '#b4f1e7' }}>
                Google account
              </span>
            )}
          </div>

          {!showPwForm ? (
            <button
              onClick={() => setShowPwForm(true)}
              className="mt-4 px-4 py-2 text-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all"
              style={{ background: '#00b395' }}
            >
              {hasEmailLogin ? 'Change password' : 'Create password'}
            </button>
          ) : (
            <div className="mt-4 space-y-4">
              <Field label={hasEmailLogin ? 'New password' : 'Password'}>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full p-3 border-[2.5px] border-gray-900 rounded-xl font-medium focus:outline-none focus:bg-white"
                  style={{ background: '#f6fbf8' }}
                />
              </Field>
              <Field label="Confirm password">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full p-3 border-[2.5px] border-gray-900 rounded-xl font-medium focus:outline-none focus:bg-white"
                  style={{ background: '#f6fbf8' }}
                />
              </Field>
              <div className="flex gap-3">
                <button
                  onClick={handleSavePassword}
                  disabled={savingPassword}
                  className="px-5 py-2.5 text-white border-2 border-gray-900 rounded-xl font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all disabled:opacity-50"
                  style={{ background: '#00b395' }}
                >
                  {savingPassword ? 'Saving…' : 'Save password'}
                </button>
                <button
                  onClick={() => { setShowPwForm(false); setNewPassword(''); setConfirmPassword('') }}
                  disabled={savingPassword}
                  className="px-5 py-2.5 bg-white border-2 border-gray-900 rounded-xl font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              {!hasEmailLogin && (
                <p className="text-xs text-gray-500">
                  Next time, sign in with <span className="font-bold">{profile?.email || user?.email}</span> and this password.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Courses */}
        <h2 className="text-xl font-black tracking-tight mt-8 mb-3">Courses you&apos;re taking</h2>
        {courses.length === 0 ? (
          <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-6 shadow-[4px_4px_0_#1a1d29] text-gray-600">
            You haven&apos;t started any courses yet.{' '}
            <Link href="/dashboard" className="font-bold underline" style={{ color: '#00b395' }}>Browse courses →</Link>
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
                    {c.icon || '📘'}
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

        {/* Danger zone */}
        {canDeleteAccount && (
        <div className="bg-white border-[3px] border-red-600 rounded-2xl p-6 md:p-8 shadow-[6px_6px_0_#dc2626] mt-8">
          <h2 className="text-xl font-black tracking-tight text-red-700">Delete account</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-md">
            Permanently delete your account and all of your data. This can&apos;t be undone.
          </p>
          <button
            onClick={() => { setShowDeleteConfirm(true); setDeleteText('') }}
            className="mt-4 px-4 py-2 text-white border-2 border-gray-900 rounded-full text-sm font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all"
            style={{ background: '#dc2626' }}
          >
            Delete account
          </button>
        </div>
        )}
      </div>

      {/* Delete-account confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white border-[3px] border-gray-900 rounded-2xl p-6 md:p-7 shadow-[6px_6px_0_#1a1d29] max-w-md w-full">
            <h3 className="text-xl font-black tracking-tight text-red-700">Are you sure?</h3>
            <p className="text-sm text-gray-700 mt-3">
              All your progress will be lost <span className="font-black">forever</span>, including for the
              courses you&apos;re taking. Your instructor will no longer be able to see any of your
              completions. This cannot be undone.
            </p>
            <p className="text-xs font-mono tracking-widest uppercase text-gray-500 mt-5 mb-1">
              Type DELETE to confirm
            </p>
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="DELETE"
              className="w-full p-3 border-[2.5px] border-gray-900 rounded-xl font-medium focus:outline-none focus:bg-white"
              style={{ background: '#f6fbf8' }}
            />
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || deleteText.trim().toUpperCase() !== 'DELETE'}
                className="px-5 py-2.5 text-white border-2 border-gray-900 rounded-xl font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all disabled:opacity-50"
                style={{ background: '#dc2626' }}
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteText('') }}
                disabled={deleting}
                className="px-5 py-2.5 bg-white border-2 border-gray-900 rounded-xl font-bold shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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