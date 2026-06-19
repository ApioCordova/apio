'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function PendingReviewPage() {
  const [pendingItems, setPendingItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [currentRole, setCurrentRole] = useState(null)

  useEffect(() => { loadPending() }, [])

  async function loadPending() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    setCurrentRole(profile?.role)

    // Load all pending_review questions and readings across all lessons
    const [{ data: questions }, { data: readings }] = await Promise.all([
      supabase
        .from('questions')
        .select('*, lesson:lessons(title, unit:units(name, number, course:courses(title, short_title)))')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false }),
      supabase
        .from('readings')
        .select('*, lesson:lessons(title, unit:units(name, number, course:courses(title, short_title)))')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false }),
    ])

    const combined = [
      ...(questions || []).map(q => ({ ...q, _kind: 'question' })),
      ...(readings || []).map(r => ({ ...r, _kind: 'reading' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    setPendingItems(combined)
    setLoading(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function approveItem(item) {
    // Reviewers can't approve their own content
    if (currentRole === 'reviewer' && item.created_by === currentUser?.id) {
      showToast('You cannot approve your own content. An admin must review it.')
      return
    }
    const table = item._kind === 'question' ? 'questions' : 'readings'
    const { error } = await supabase.from(table).update({ status: 'published' }).eq('id', item.id)
    if (error) { showToast(error.message || 'Could not approve'); return }
    showToast('✓ Approved & published')
    await loadPending()
  }

  async function denyItem(item) {
    if (currentRole === 'reviewer' && item.created_by === currentUser?.id) {
      showToast('You cannot review your own content.')
      return
    }
    const table = item._kind === 'question' ? 'questions' : 'readings'
    await supabase.from(table).update({ status: 'draft' }).eq('id', item.id)
    showToast('Sent back to draft')
    await loadPending()
  }

  if (loading) return <p className="text-gray-600 font-mono text-sm">Loading pending items...</p>

  const isAdmin = currentRole === 'admin' || currentRole === 'editor'
  const isReviewer = currentRole === 'reviewer'
  const canReview = isAdmin || isReviewer

  return (
    <div>
      <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: '#00b395' }}>// content review</p>
      <h1 className="text-3xl font-black tracking-tight mb-3">Pending Review</h1>
      <p className="text-gray-700 mb-6 max-w-2xl">
        {canReview
          ? 'Content submitted for approval. Review and approve or send back to draft.'
          : 'Content you submitted for approval. Wait for a reviewer or admin to approve it.'}
      </p>

      {pendingItems.length === 0 ? (
        <div className="text-center p-12 border-2 border-dashed border-gray-400 rounded-xl">
          <p className="text-3xl mb-3">✨</p>
          <p className="text-gray-700 font-bold">Nothing pending!</p>
          <p className="text-sm text-gray-500 mt-1">All content has been reviewed. Nice work.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-mono text-gray-600">{pendingItems.length} item{pendingItems.length === 1 ? '' : 's'} awaiting review</p>

          {pendingItems.map((item) => {
            const coursePath = item.lesson?.unit?.course?.short_title || '?'
            const unitName = item.lesson?.unit?.name || '?'
            const lessonTitle = item.lesson?.title || '?'
            const isOwnContent = item.created_by === currentUser?.id
            const canApproveThis = canReview && !isOwnContent

            return (
              <div key={`${item._kind}-${item.id}`} className="bg-white border-[3px] border-gray-900 rounded-xl p-5 shadow-[4px_4px_0_#1a1d29]">
                {/* Header */}
                <div className="flex justify-between items-start gap-3 mb-3 flex-wrap">
                  <div>
                    <p className="text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-2" style={{ color: item._kind === 'question' ? '#00b395' : '#3b82f6' }}>
                      {item._kind === 'question' ? '📝 Question' : '📖 Reading'}
                      {item.pool === 'practice' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border border-gray-900 text-gray-900" style={{ background: '#fbbf24' }}>
                          PRACTICE
                        </span>
                      )}
                      {isOwnContent && (
                        <span className="text-xs text-gray-500 font-normal">(yours)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      {coursePath} ▸ {unitName} ▸ {lessonTitle}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border-2 border-gray-900 shadow-[2px_2px_0_#1a1d29]" style={{ background: '#3b82f6', color: 'white' }}>
                      Pending review
                    </span>
                  </div>
                </div>

                {/* Content preview */}
                {item._kind === 'question' ? (
                  <div className="mb-4">
                    <div className="font-bold text-sm mb-3 leading-snug prose prose-sm max-w-none prose-img:rounded-lg prose-img:border-2 prose-img:border-gray-900" dangerouslySetInnerHTML={{ __html: item.stem || '' }} />
                    <div className="text-xs text-gray-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: item.explanation || '' }} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
                      {item.choices?.map((c, i) => (
                        <div key={i} className={`px-2 py-1.5 rounded flex items-center gap-1.5 ${i === item.answer ? 'bg-green-100 text-green-900 font-bold' : 'bg-gray-50 text-gray-700'}`}>
                          <span className="font-black flex-shrink-0">{String.fromCharCode(65 + i)}.</span>
                          <span className="flex-1">{c}</span>
                          {i === item.answer && <span className="ml-auto">✓</span>}
                        </div>
                      ))}
                    </div>
                    {item.explanation && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-1">Explanation</p>
                        <p className="text-xs text-gray-700">{item.explanation}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-4">
                    <h4 className="font-black text-base mb-2">{item.title}</h4>
                    <div className="text-xs text-gray-700 max-h-32 overflow-hidden relative prose prose-sm max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: item.content || '<em>(empty)</em>' }} />
                      {item.content && item.content.length > 300 && (
                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {canApproveThis ? (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => approveItem(item)}
                      className="px-4 py-2 text-white border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all"
                      style={{ background: '#00b395' }}
                    >
                      ✓ Approve & publish
                    </button>
                    <button
                      onClick={() => denyItem(item)}
                      className="px-4 py-2 bg-white border-2 border-gray-900 rounded-xl font-bold text-sm shadow-[3px_3px_0_#1a1d29] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_#1a1d29] transition-all text-red-700"
                    >
                      ✗ Send back to draft
                    </button>
                  </div>
                ) : isOwnContent ? (
                  <p className="text-xs text-gray-500 italic">
                    {isReviewer ? 'Your own content must be approved by an admin.' : 'Waiting for reviewer or admin approval.'}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 italic">Only reviewers and admins can approve content.</p>
                )}
              </div>
            )
          })}
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