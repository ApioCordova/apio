'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MAIN_ADMIN_EMAIL = 'demiancordova@cordovaibe.com'

const ROLE_HIERARCHY = ['student', 'question_maker', 'reviewer', 'admin']

const ROLE_INFO = {
  student: { label: 'Student', color: '#9ca3af', desc: 'Default role. Can take lessons and practice.' },
  question_maker: { label: 'Question Maker', color: '#8b5cf6', desc: 'Can write questions/readings, but submissions need approval.' },
  reviewer: { label: 'Reviewer', color: '#3b82f6', desc: 'Can write content + approve question makers. Own content needs admin approval.' },
  admin: { label: 'Admin', color: '#00b395', desc: 'Full access — publish directly, manage roles (with main admin approval).' },
  editor: { label: 'Editor (legacy)', color: '#eab308', desc: 'Legacy role. Same powers as admin.' },
}

export default function ContributorsPage() {
  const [currentUser, setCurrentUser] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  // Add new contributor form state
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('question_maker')
  const [searchEmail, setSearchEmail] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)

    const [{ data: profilesData }, { data: requestsData }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('role_change_requests').select('*').order('created_at', { ascending: false }),
    ])
    setProfiles(profilesData || [])
    setRequests(requestsData || [])
    setLoading(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const isMainAdmin = currentUser?.email === MAIN_ADMIN_EMAIL
  const myProfile = profiles.find(p => p.id === currentUser?.id)
  const myRole = myProfile?.role
  const isAdmin = myRole === 'admin' || myRole === 'editor'

  async function requestRoleChange(targetProfile, requestedRole) {
    if (targetProfile.email === MAIN_ADMIN_EMAIL) {
      showToast('Cannot change the main admin role.')
      return
    }

    if (isMainAdmin) {
      // Main admin: change directly without going through approval queue
      const { error } = await supabase
        .from('profiles')
        .update({ role: requestedRole })
        .eq('id', targetProfile.id)
      if (error) { showToast('Failed: ' + error.message); return }
      showToast(`✓ ${targetProfile.email} is now ${requestedRole.replace('_', ' ')}`)
      await loadAll()
      return
    }

    // Other admins: create a role change request for main admin
    const { error } = await supabase.from('role_change_requests').insert({
      requested_by: currentUser.id,
      target_user_id: targetProfile.id,
      target_email: targetProfile.email,
      current_role: targetProfile.role,
      requested_role: requestedRole,
      status: 'pending',
    })
    if (error) { showToast('Failed: ' + error.message); return }
    showToast(`📤 Role change requested. Main admin will review.`)
    await loadAll()
  }

  async function approveRequest(req) {
    if (!isMainAdmin) return showToast('Only main admin can approve.')
    // Apply the role change
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ role: req.requested_role })
      .eq('id', req.target_user_id)
    if (updateErr) { showToast('Failed: ' + updateErr.message); return }
    // Mark request as approved
    await supabase
      .from('role_change_requests')
      .update({ status: 'approved', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
      .eq('id', req.id)
    showToast('✓ Approved')
    await loadAll()
  }

  async function denyRequest(req) {
    if (!isMainAdmin) return showToast('Only main admin can deny.')
    const reason = prompt('Reason for denial (optional):')
    await supabase
      .from('role_change_requests')
      .update({
        status: 'denied',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        reason: reason || null,
      })
      .eq('id', req.id)
    showToast('Request denied')
    await loadAll()
  }

  async function inviteByEmail() {
    if (!newEmail.trim()) return
    if (newEmail === MAIN_ADMIN_EMAIL) return showToast('That is the main admin.')

    const target = profiles.find(p => p.email?.toLowerCase() === newEmail.toLowerCase().trim())
    if (!target) {
      showToast('No user found with that email. They need to sign up first.')
      return
    }

    await requestRoleChange(target, newRole)
    setNewEmail('')
  }

  if (loading) return <p className="text-gray-600 font-mono text-sm">Loading contributors...</p>

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const filteredProfiles = searchEmail
    ? profiles.filter(p => p.email?.toLowerCase().includes(searchEmail.toLowerCase()) || p.full_name?.toLowerCase().includes(searchEmail.toLowerCase()))
    : profiles

  return (
    <div>
      <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// team management</p>
      <h1 className="text-3xl font-black tracking-tight mb-3">Contributors</h1>
      <p className="text-gray-700 mb-6 max-w-2xl">
        Manage who can contribute to Apio's content. {isMainAdmin && '(Main admin: changes apply instantly.)'}
        {!isMainAdmin && isAdmin && '(Your changes will be sent to the main admin for approval.)'}
      </p>

      {/* Pending requests (main admin only) */}
      {isMainAdmin && pendingRequests.length > 0 && (
        <div className="mb-8 p-5 bg-yellow-50 border-[3px] border-yellow-700 rounded-xl shadow-[4px_4px_0_#1a1d29]">
          <h2 className="text-xl font-black tracking-tight mb-3">
            🔔 {pendingRequests.length} pending role request{pendingRequests.length === 1 ? '' : 's'}
          </h2>
          <div className="flex flex-col gap-2">
            {pendingRequests.map(req => {
              const requester = profiles.find(p => p.id === req.requested_by)
              return (
                <div key={req.id} className="bg-white p-3 rounded-lg border-2 border-gray-900 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-48">
                    <p className="font-bold text-sm">{req.target_email}</p>
                    <p className="text-xs text-gray-600">
                      <span className="font-mono">{req.current_role.replace('_', ' ')}</span> →{' '}
                      <span className="font-mono font-bold" style={{ color: ROLE_INFO[req.requested_role]?.color }}>
                        {req.requested_role.replace('_', ' ')}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Requested by: {requester?.email || 'unknown'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => approveRequest(req)} className="px-3 py-1.5 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]" style={{ background: '#00b395' }}>
                      ✓ Approve
                    </button>
                    <button onClick={() => denyRequest(req)} className="px-3 py-1.5 bg-red-500 text-white border-2 border-gray-900 rounded-lg text-xs font-bold shadow-[2px_2px_0_#1a1d29]">
                      ✗ Deny
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick role assignment */}
      <div className="mb-8 p-5 bg-white border-[3px] border-gray-900 rounded-xl shadow-[4px_4px_0_#1a1d29]">
        <h2 className="text-lg font-black tracking-tight mb-3">Assign role by email</h2>
        <p className="text-xs text-gray-600 mb-3">
          The user must have already signed up to Apio. {isMainAdmin ? 'Changes apply instantly.' : 'Your request will be sent to the main admin for approval.'}
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 min-w-48 p-2 border-2 border-gray-900 rounded-lg"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="p-2 border-2 border-gray-900 rounded-lg font-bold"
          >
            <option value="question_maker">Question Maker</option>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
            <option value="student">Student (revoke access)</option>
          </select>
          <button
            onClick={inviteByEmail}
            className="px-5 py-2 text-white border-2 border-gray-900 rounded-lg font-bold shadow-[3px_3px_0_#1a1d29]"
            style={{ background: '#00b395' }}
          >
            {isMainAdmin ? 'Apply' : 'Request'}
          </button>
        </div>
      </div>

      {/* Roles legend */}
      <div className="mb-6 p-4 bg-gray-50 border-2 border-gray-300 rounded-xl">
        <p className="text-xs font-mono tracking-widest uppercase font-bold text-gray-700 mb-2">Role hierarchy</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {ROLE_HIERARCHY.map(role => (
            <div key={role} className="flex gap-2">
              <span
                className="px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest border border-gray-900 text-white whitespace-nowrap"
                style={{ background: ROLE_INFO[role].color }}
              >
                {ROLE_INFO[role].label}
              </span>
              <span className="text-gray-700 flex-1">{ROLE_INFO[role].desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* All users table */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-black tracking-tight">All users ({profiles.length})</h2>
        <input
          value={searchEmail}
          onChange={(e) => setSearchEmail(e.target.value)}
          placeholder="Search by email or name..."
          className="px-3 py-1.5 border-2 border-gray-900 rounded-lg text-sm w-64"
        />
      </div>

      <div className="bg-white border-[3px] border-gray-900 rounded-xl shadow-[4px_4px_0_#1a1d29] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b-2 border-gray-900">
            <tr>
              <th className="text-left p-3 font-black tracking-tight">User</th>
              <th className="text-left p-3 font-black tracking-tight">Email</th>
              <th className="text-left p-3 font-black tracking-tight">Current role</th>
              <th className="text-left p-3 font-black tracking-tight">Change to</th>
            </tr>
          </thead>
          <tbody>
            {filteredProfiles.map(p => {
              const isMainAdminUser = p.email === MAIN_ADMIN_EMAIL
              const roleInfo = ROLE_INFO[p.role] || ROLE_INFO.student
              return (
                <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-3">
                    <p className="font-bold">{p.full_name || '—'}</p>
                    {isMainAdminUser && <p className="text-xs text-orange-700 font-mono">⭐ MAIN ADMIN</p>}
                  </td>
                  <td className="p-3 font-mono text-xs">{p.email}</td>
                  <td className="p-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest border border-gray-900 text-white"
                      style={{ background: roleInfo.color }}
                    >
                      {roleInfo.label}
                    </span>
                  </td>
                  <td className="p-3">
                    {isMainAdminUser ? (
                      <span className="text-xs text-gray-400 italic">cannot modify</span>
                    ) : (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return
                          if (confirm(`${isMainAdmin ? 'Change' : 'Request to change'} ${p.email} to ${e.target.value.replace('_', ' ')}?`)) {
                            requestRoleChange(p, e.target.value)
                          }
                          e.target.value = ''
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-xs"
                      >
                        <option value="">Change role...</option>
                        <option value="student">Student</option>
                        <option value="question_maker">Question Maker</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </td>
                </tr>
              )
            })}
            {filteredProfiles.length === 0 && (
              <tr><td colSpan="4" className="p-6 text-center text-gray-500 italic">No users match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Request history (main admin only) */}
      {isMainAdmin && requests.filter(r => r.status !== 'pending').length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-black tracking-tight mb-2">Request history</h2>
          <div className="bg-white border-2 border-gray-300 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="text-left p-2">When</th>
                  <th className="text-left p-2">Target</th>
                  <th className="text-left p-2">Change</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.filter(r => r.status !== 'pending').slice(0, 20).map(req => (
                  <tr key={req.id} className="border-b border-gray-200">
                    <td className="p-2 text-gray-600">{new Date(req.created_at).toLocaleDateString()}</td>
                    <td className="p-2 font-mono">{req.target_email}</td>
                    <td className="p-2">{req.current_role} → {req.requested_role}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${req.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {req.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl border-2 border-gray-900 shadow-[4px_4px_0_#00b395] font-bold z-50">
          {toast}
        </div>
      )}
    </div>
  )
}