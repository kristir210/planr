import { supabase } from './supabase.js'

export function initSearch() {
  const btn = document.getElementById('search-btn')
  const overlay = document.getElementById('search-overlay')
  const input = document.getElementById('search-input')
  const results = document.getElementById('search-results')

  if (!btn || !overlay) return

  btn.addEventListener('click', () => {
    overlay.classList.add('open')
    input.focus()
    input.value = ''
    results.innerHTML = '<div class="search-empty">Type to search your notes...</div>'
  })

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeSearch()
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearch()
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      overlay.classList.add('open')
      input.focus()
    }
  })

  let searchTimeout = null
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout)
    const query = input.value.trim()
    if (!query) {
      results.innerHTML = '<div class="search-empty">Type to search your notes...</div>'
      return
    }
    results.innerHTML = '<div class="search-empty">Searching...</div>'
    searchTimeout = setTimeout(() => performSearch(query, results), 300)
  })
}

async function performSearch(query, results) {
  const { data: notes } = await supabase
    .from('notes')
    .select('id, title, body, folder_id, folders(name)')
    .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
    .limit(20)

  if (!notes || notes.length === 0) {
    results.innerHTML = '<div class="search-empty">No notes found</div>'
    return
  }

  results.innerHTML = notes.map(note => {
    const bodyText = (note.body || '').replace(/<[^>]*>/g, '')
    const idx = bodyText.toLowerCase().indexOf(query.toLowerCase())
    let preview = ''
    if (idx !== -1) {
      const start = Math.max(0, idx - 30)
      const end = Math.min(bodyText.length, idx + query.length + 60)
      preview = (start > 0 ? '...' : '') + bodyText.slice(start, end) + (end < bodyText.length ? '...' : '')
    } else {
      preview = bodyText.slice(0, 80) + (bodyText.length > 80 ? '...' : '')
    }
    const folderName = note.folders?.name || ''
    return `
      <div class="search-result" onclick="openSearchResult('${note.id}', '${note.folder_id}')">
        <div class="search-result-title">${highlight(note.title || 'Untitled', query)}</div>
        ${folderName ? `<div class="search-result-folder">📁 ${folderName}</div>` : ''}
        ${preview ? `<div class="search-result-preview">${highlight(preview, query)}</div>` : ''}
      </div>
    `
  }).join('')
}

function highlight(text, query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:var(--amber-dim);color:var(--amber);border-radius:2px;padding:0 1px;">$1</mark>')
}

window.openSearchResult = async function(noteId, folderId) {
  closeSearch()
  const { data: note } = await supabase.from('notes').select('*').eq('id', noteId).single()
  if (!note) return

  window.currentNoteId = noteId
  window.currentFolderId = folderId

  const main = document.getElementById('main-content')
  main.innerHTML = `
    <div class="notes-editor-standalone">
      <div class="notes-editor-inner">
        <input class="notes-title-input" id="note-title-input"
               value="${note.title || ''}"
               placeholder="Untitled"
               oninput="scheduleNoteSave()" />
        <div class="notes-toolbar">
          <button onclick="fmt('bold')" title="Bold"><b>B</b></button>
          <button onclick="fmt('italic')" title="Italic"><i>I</i></button>
          <button onclick="fmt('underline')" title="Underline"><u>U</u></button>
          <div class="notes-toolbar-divider"></div>
          <button onclick="fmt('insertUnorderedList')" title="Bullet list">≡</button>
          <button onclick="fmt('insertOrderedList')" title="Numbered list">1.</button>
          <div class="notes-toolbar-divider"></div>
          <button onclick="fmtBlock('h2')" title="Heading">H</button>
          <button onclick="fmtBlock('p')" title="Paragraph">¶</button>
        </div>
        <div class="notes-body" id="note-body" contenteditable="true" oninput="scheduleNoteSave()">${note.body || ''}</div>
        <div class="notes-save-indicator" id="save-indicator"></div>
      </div>
    </div>
  `
  document.getElementById('note-body')?.focus()
}

function closeSearch() {
  document.getElementById('search-overlay')?.classList.remove('open')
}