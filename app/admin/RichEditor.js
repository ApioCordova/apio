'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { TableHeader } from '@tiptap/extension-table-header'
import { Placeholder } from '@tiptap/extensions'

export default function RichEditor({ value, onChange, collapsible = false, collapsedHeight = 44, minHeight = 300, placeholder = '' }) {
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef(null)
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'underline text-teal-700 hover:text-teal-900' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'rounded-xl border-2 border-gray-900 my-3 max-w-full h-auto' },
      }),
      Youtube.configure({
        controls: true,
        nocookie: true,
        HTMLAttributes: { class: 'rounded-xl border-2 border-gray-900 my-3' },
        width: 640,
        height: 360,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'border-collapse border-2 border-gray-900 my-3 w-full rounded-lg overflow-hidden' },
      }),
      TableRow.configure({
        HTMLAttributes: {},
      }),
      TableCell.configure({
        HTMLAttributes: { class: 'border border-gray-400 p-2 min-w-[60px]' },
      }),
      TableHeader.configure({
        HTMLAttributes: { class: 'border border-gray-900 p-2 bg-gray-100 font-bold min-w-[60px]' },
      }),
      TableHeader.configure({
        HTMLAttributes: { class: 'border border-gray-900 p-2 bg-gray-100 font-bold min-w-[60px]' },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start typing…',
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-base max-w-none p-4 focus:outline-none prose-headings:font-black prose-headings:tracking-tight prose-img:rounded-xl prose-img:border-2 prose-img:border-gray-900',
      },
    },
  })

  /// Sync external content changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Collapsed vs expanded min-height (set directly on the ProseMirror node)
  useEffect(() => {
    if (!editor) return
    editor.view.dom.style.minHeight = `${(!collapsible || focused) ? minHeight : collapsedHeight}px`
  }, [editor, focused, collapsible, minHeight, collapsedHeight])
  function addImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.addEventListener('change', handleImageUpload)
    input.click()
  }
  const [uploadingImage, setUploadingImage] = useState(false)
  if (!editor) return <p className="text-gray-500 text-sm p-4">Loading editor...</p>

  // ============ TOOLBAR HANDLERS ============
  function addLink() {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL (e.g., https://example.com)', previousUrl)

    if (url === null) return // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function addImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.addEventListener('change', (e) => {
      handleImageUpload(e)
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    if (!file.type.startsWith('image/')) { window.alert('Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { window.alert('Image is over 5 MB — please pick a smaller one.'); return }
    setUploadingImage(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('content-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (error) { window.alert('Upload failed: ' + error.message); return }
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      if (data?.publicUrl) editor.chain().focus().setImage({ src: data.publicUrl }).run()
    } finally {
      setUploadingImage(false)
    }
  }

  function addYoutube() {
    const url = window.prompt('YouTube URL (paste the regular watch URL)')
    if (!url) return
    editor.commands.setYoutubeVideo({ src: url, width: 640, height: 360 })
  }

  const isInTable = editor.isActive('table')
  const showToolbar = !collapsible || focused

  return (
    <div
      ref={wrapRef}
      onFocus={() => collapsible && setFocused(true)}
      onBlur={(e) => { if (collapsible && wrapRef.current && !wrapRef.current.contains(e.relatedTarget)) setFocused(false) }}
      className="border-2 border-gray-900 rounded-lg overflow-hidden bg-white"
    >
      {/* Toolbar */}
      {showToolbar && (
      <div className="border-b-2 border-gray-900 bg-gray-50 p-2 flex flex-wrap gap-1 items-center">
        <ToolbarGroup>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title="Underline (Ctrl+U)"
          >
            <span className="underline">U</span>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="Strikethrough"
          >
            <s>S</s>
          </ToolbarBtn>
        </ToolbarGroup>

        <Sep />

        <ToolbarGroup>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            H1
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            H2
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            H3
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={editor.isActive('paragraph')}
            title="Paragraph"
          >
            ¶
          </ToolbarBtn>
        </ToolbarGroup>

        <Sep />

        <ToolbarGroup>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet list"
          >
            • List
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered list"
          >
            1. List
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title="Quote"
          >
            &ldquo;
          </ToolbarBtn>
        </ToolbarGroup>

        <Sep />

        <ToolbarGroup>
          <ToolbarBtn
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
            title="Align left"
          >
            ⇤
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
            title="Align center"
          >
            ⇔
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
            title="Align right"
          >
            ⇥
          </ToolbarBtn>
        </ToolbarGroup>

        <Sep />

        <ToolbarGroup>
          <ToolbarBtn onClick={addLink} active={editor.isActive('link')} title="Insert link">
            🔗 Link
          </ToolbarBtn>
          <ToolbarBtn onClick={addImage} disabled={uploadingImage} title="Upload an image from your computer">
            🖼 {uploadingImage ? 'Uploading…' : 'Image'}
          </ToolbarBtn>
          <ToolbarBtn onClick={addYoutube} title="Insert YouTube video">
            ▶ Video
          </ToolbarBtn>
        </ToolbarGroup>

        <Sep />

        {/* Table controls */}
        <ToolbarGroup>
          <TableInsertBtn editor={editor} />
          {isInTable && (
            <>
              <ToolbarBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add column after">
                +Col
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="Add row after">
                +Row
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete column">
                −Col
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row">
                −Row
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeaderRow().run()} title="Toggle header row">
                H-Row
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table">
                🗑 Table
              </ToolbarBtn>
            </>
          )}
        </ToolbarGroup>

        <Sep />

        <ToolbarGroup>
          <ToolbarBtn
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo (Ctrl+Y)"
          >
            ↷
          </ToolbarBtn>
        </ToolbarGroup>
      </div>
      )}

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  )
}

// ============ TABLE INSERT BUTTON WITH SIZE PICKER ============
function TableInsertBtn({ editor }) {
  const [showPicker, setShowPicker] = useState(false)
  const [hoverRows, setHoverRows] = useState(0)
  const [hoverCols, setHoverCols] = useState(0)
  const [customMode, setCustomMode] = useState(false)
  const [customRows, setCustomRows] = useState('3')
  const [customCols, setCustomCols] = useState('3')
  const pickerRef = useRef(null)
  const MAX_GRID = 6

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
        setCustomMode(false)
      }
    }
    if (showPicker) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  function insertTable(rows, cols) {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    setShowPicker(false)
    setCustomMode(false)
  }

  function handleCustomInsert() {
    const r = parseInt(customRows, 10)
    const c = parseInt(customCols, 10)
    if (r > 0 && c > 0 && r <= 20 && c <= 20) {
      insertTable(r, c)
    } else {
      alert('Please enter row and column values between 1 and 20.')
    }
  }

  return (
    <div className="relative" ref={pickerRef}>
      <ToolbarBtn
        onClick={() => { setShowPicker(!showPicker); setCustomMode(false) }}
        active={showPicker}
        title="Insert table"
      >
        ⊞ Table
      </ToolbarBtn>

      {showPicker && (
        <div className="absolute top-full left-0 mt-1 bg-white border-2 border-gray-900 rounded-lg shadow-[4px_4px_0_#1a1d29] p-3 z-50 min-w-[200px]">
          {!customMode ? (
            <>
              <p className="text-xs font-mono font-bold text-gray-700 mb-2">
                {hoverRows > 0 ? `${hoverRows} × ${hoverCols}` : 'Select size'}
              </p>
              <div
                className="grid gap-[3px] mb-2"
                style={{ gridTemplateColumns: `repeat(${MAX_GRID}, 1fr)` }}
              >
                {Array.from({ length: MAX_GRID * MAX_GRID }, (_, i) => {
                  const r = Math.floor(i / MAX_GRID) + 1
                  const c = (i % MAX_GRID) + 1
                  const isHighlighted = r <= hoverRows && c <= hoverCols
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`w-5 h-5 border rounded-sm transition-colors ${
                        isHighlighted
                          ? 'border-gray-900'
                          : 'border-gray-300 hover:border-gray-500'
                      }`}
                      style={isHighlighted ? { background: '#00b395' } : { background: '#f9fafb' }}
                      onMouseEnter={() => { setHoverRows(r); setHoverCols(c) }}
                      onMouseLeave={() => { setHoverRows(0); setHoverCols(0) }}
                      onClick={() => insertTable(r, c)}
                    />
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className="w-full text-xs font-bold text-center py-1.5 border-2 border-dashed border-gray-400 rounded-lg hover:border-gray-600 hover:bg-gray-50 transition-colors"
              >
                Custom size...
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-mono font-bold text-gray-700 mb-2">Custom table size</p>
              <div className="flex gap-2 items-center mb-2">
                <label className="flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Rows</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={customRows}
                    onChange={(e) => setCustomRows(e.target.value)}
                    className="w-full p-1.5 border-2 border-gray-900 rounded-lg text-center font-bold text-sm"
                    autoFocus
                  />
                </label>
                <span className="font-black text-gray-500 mt-3">×</span>
                <label className="flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Cols</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={customCols}
                    onChange={(e) => setCustomCols(e.target.value)}
                    className="w-full p-1.5 border-2 border-gray-900 rounded-lg text-center font-bold text-sm"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCustomMode(false)}
                  className="flex-1 text-xs font-bold py-1.5 border-2 border-gray-900 rounded-lg bg-white"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleCustomInsert}
                  className="flex-1 text-xs font-bold py-1.5 border-2 border-gray-900 rounded-lg text-white"
                  style={{ background: '#00b395' }}
                >
                  Insert
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ============ HELPERS ============
function ToolbarGroup({ children }) {
  return <div className="flex gap-0.5">{children}</div>
}

function ToolbarBtn({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2.5 py-1 text-sm font-bold rounded border-2 transition-colors ${
        active
          ? 'border-gray-900 text-white'
          : 'border-transparent hover:border-gray-300 hover:bg-white'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
      style={active ? { background: '#00b395' } : {}}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px h-6 bg-gray-300 mx-1" />
}