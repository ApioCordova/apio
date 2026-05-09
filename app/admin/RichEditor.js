'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { useEffect } from 'react'

export default function RichEditor({ value, onChange }) {
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
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-base max-w-none p-4 min-h-[300px] focus:outline-none prose-headings:font-black prose-headings:tracking-tight prose-img:rounded-xl prose-img:border-2 prose-img:border-gray-900',
      },
    },
  })

  // Sync external content changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

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
    const url = window.prompt('Image URL (paste a link to a hosted image)')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  function addYoutube() {
    const url = window.prompt('YouTube URL (paste the regular watch URL)')
    if (!url) return
    editor.commands.setYoutubeVideo({ src: url, width: 640, height: 360 })
  }

  return (
    <div className="border-2 border-gray-900 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
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
            "
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
          <ToolbarBtn onClick={addImage} title="Insert image">
            🖼 Image
          </ToolbarBtn>
          <ToolbarBtn onClick={addYoutube} title="Insert YouTube video">
            ▶ Video
          </ToolbarBtn>
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

      {/* Editor */}
      <EditorContent editor={editor} />
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