import { supabase } from './supabase.js'

let saveTimeout = null

// ── NOTES VIEW ────────────────────────────────────────────
export async function loadNotesView(folderId) {
  const { data: folder } = await supabase
    .from('folders')
    .select('*, workspaces(name, colour)')
    .eq('id', folderId)
    .single()

  const { data: notes } = await supabase
    .from('notes')
    .select('*')
    .eq('folder_id', folderId)
    .order('position')

  window.currentFolderId = folderId
  window.currentFolderColour = folder.workspaces.colour

  const main = document.getElementById('main-content')
  main.innerHTML = `
    <div class="notes-view">
      <div class="notes-list" id="notes-list">
        <div class="notes-list-header">
          <div class="notes-list-title">
            <span class="task-view-dot" style="background:${folder.workspaces.colour}"></span>
            <span>${folder.name}</span>
          </div>
          <button class="notes-new-btn" onclick="createNote('${folderId}')">+ New</button>
        </div>
        <div class="notes-list-items" id="notes-list-items">
          ${notes.length === 0
            ? '<div class="notes-empty">No notes yet</div>'
            : notes.map(n => renderNoteItem(n)).join('')
          }
        </div>
      </div>
      <div class="notes-editor" id="notes-editor">
        <div class="notes-editor-empty">Select a note or create a new one</div>
      </div>
    </div>
  `

  if (notes.length > 0) openNote(notes[0].id)
}

function renderNoteItem(note) {
  const preview = note.body
    ? note.body.replace(/<[^>]*>/g, '').substring(0, 60) + '...'
    : 'Empty note'
  const date = new Date(note.updated_at).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
  return `
    <div class="note-item" id="ni-${note.id}"
         onclick="openNote('${note.id}')"
         oncontextmenu="showNoteMenu(event, '${note.id}', '${note.folder_id}')">
      <div class="note-item-title">${note.title || 'Untitled'}</div>
      <div class="note-item-preview">${preview}</div>
      <div class="note-item-date">${date}</div>
    </div>
  `
}

// ── OPEN NOTE ─────────────────────────────────────────────
window.openNote = async function(noteId) {
  window.currentNoteId = noteId

  document.querySelectorAll('.note-item').forEach(el => el.classList.remove('active'))
  document.getElementById('ni-' + noteId)?.classList.add('active')

  const { data: note } = await supabase.from('notes').select('*').eq('id', noteId).single()

  const editor = document.getElementById('notes-editor')
  editor.innerHTML = `
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
      <div class="notes-body"
           id="note-body"
           contenteditable="true"
           oninput="scheduleNoteSave()">${note.body || ''}</div>
      <div class="notes-save-indicator" id="save-indicator"></div>
    </div>
  `

  document.getElementById('note-body').focus()
}

// ── FORMAT HELPERS ────────────────────────────────────────
window.fmt = function(command) {
  document.execCommand(command, false, null)
  document.getElementById('note-body')?.focus()
}

window.fmtBlock = function(tag) {
  document.execCommand('formatBlock', false, tag)
  document.getElementById('note-body')?.focus()
}

// ── AUTO SAVE ─────────────────────────────────────────────
window.scheduleNoteSave = function() {
  clearTimeout(saveTimeout)
  const indicator = document.getElementById('save-indicator')
  if (indicator) indicator.textContent = 'Saving...'

  saveTimeout = setTimeout(async () => {
    const noteId = window.currentNoteId
    if (!noteId) return

    const title = document.getElementById('note-title-input')?.value.trim() || 'Untitled'
    const bodyEl = document.getElementById('note-body')
    if (!bodyEl) return

    // Auto-detect URLs and convert to links
    autoLinkUrls(bodyEl)

    const body = bodyEl.innerHTML || ''

    await supabase
      .from('notes')
      .update({ title, body, updated_at: new Date().toISOString() })
      .eq('id', noteId)

    const sidebarItem = document.getElementById('sni-' + noteId)
    if (sidebarItem) sidebarItem.textContent = title

    const listItem = document.getElementById('ni-' + noteId)
    if (listItem) {
      const preview = body.replace(/<[^>]*>/g, '').substring(0, 60) + '...'
      listItem.querySelector('.note-item-title').textContent = title
      listItem.querySelector('.note-item-preview').textContent = preview
      listItem.querySelector('.note-item-date').textContent = new Date().toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
    }

    if (indicator) {
      indicator.textContent = 'Saved'
      setTimeout(() => { if (indicator) indicator.textContent = '' }, 2000)
    }
  }, 800)
}

// ── CREATE NOTE ───────────────────────────────────────────
export async function createNote(folderId) {
  const { data: note, error } = await supabase
    .from('notes')
    .insert({ folder_id: folderId, workspace_id: null, title: 'Untitled', body: '', position: 0 })
    .select()
    .single()

  if (error) { console.error(error); return }

  const list = document.getElementById('notes-list-items')
  const empty = list?.querySelector('.notes-empty')
  if (empty) empty.remove()
  list?.insertAdjacentHTML('afterbegin', renderNoteItem(note))

  openNote(note.id)
}

window.createNote = createNote

// ── NOTE CONTEXT MENU ─────────────────────────────────────
window.showNoteMenu = function(e, noteId, folderId) {
  e.preventDefault()
  e.stopPropagation()
  document.getElementById('context-menu')?.remove()

  const menu = document.createElement('div')
  menu.id = 'context-menu'
  menu.className = 'context-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top  = e.clientY + 'px'
  menu.innerHTML = `
    <div class="context-menu-item" onclick="renameNote('${noteId}')">Rename</div>
    <div class="context-menu-item" onclick="openMoveNoteModal('${noteId}', '${folderId}')">Move to...</div>
    <div class="context-menu-item context-menu-item--danger" onclick="deleteNote('${noteId}', '${folderId}')">Delete</div>
  `
  document.body.appendChild(menu)
  setTimeout(() => {
    document.addEventListener('click', () => document.getElementById('context-menu')?.remove(), { once: true })
  }, 0)
}

window.renameNote = async function(noteId) {
  document.getElementById('context-menu')?.remove()
  const { data: note } = await supabase.from('notes').select('title').eq('id', noteId).single()
  const newName = prompt('Rename note:', note.title)
  if (!newName || newName.trim() === note.title) return
  await supabase.from('notes').update({ title: newName.trim() }).eq('id', noteId)
  const item = document.getElementById('ni-' + noteId)
  if (item) item.querySelector('.note-item-title').textContent = newName.trim()
  const sidebarItem = document.getElementById('sni-' + noteId)
  if (sidebarItem) sidebarItem.textContent = newName.trim()
  const titleInput = document.getElementById('note-title-input')
  if (titleInput && window.currentNoteId === noteId) titleInput.value = newName.trim()
}

window.deleteNote = async function(noteId, folderId) {
  document.getElementById('context-menu')?.remove()
  if (!confirm('Delete this note?')) return
  await supabase.from('notes').delete().eq('id', noteId)
  document.getElementById('ni-' + noteId)?.remove()
  document.getElementById('sni-' + noteId)?.remove()

  if (window.currentNoteId === noteId) {
    window.currentNoteId = null
    const editor = document.getElementById('notes-editor')
    if (editor) editor.innerHTML = '<div class="notes-editor-empty">Select a note or create a new one</div>'
    const main = document.getElementById('main-content')
    if (main && !editor) main.innerHTML = '<div class="main-placeholder">Select a note</div>'
  }

  const list = document.getElementById('notes-list-items')
  if (list && list.children.length === 0) {
    list.innerHTML = '<div class="notes-empty">No notes yet</div>'
  }
}
function autoLinkUrls(el) {
  // Walk text nodes and convert URLs to <a> tags
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const nodesToReplace = []

  while (walker.nextNode()) {
    const node = walker.currentNode
    // Skip if already inside a link
    if (node.parentElement.closest('a')) continue
    if (/https?:\/\/[^\s<>"]+/i.test(node.textContent)) {
      nodesToReplace.push(node)
    }
  }

  nodesToReplace.forEach(node => {
    const span = document.createElement('span')
    span.innerHTML = node.textContent.replace(
      /https?:\/\/[^\s<>"]+/gi,
      url => `<a href="${url}" target="_blank" style="color:var(--amber);text-decoration:underline;">${url}</a>`
    )
    node.parentNode.replaceChild(span, node)
  })
}
window.openMoveNoteModal = async function(noteId, currentFolderId) {
  document.getElementById('context-menu')?.remove()
  document.getElementById('move-note-modal')?.remove()

  const { data: folders } = await supabase
    .from('folders')
    .select('id, name, workspace_id, workspaces(name)')
    .eq('type', 'notes')
    .neq('id', currentFolderId)
    .order('name')

  const modal = document.createElement('div')
  modal.id = 'move-note-modal'
  modal.className = 'popup'
  modal.innerHTML = `
    <div class="popup-box">
      <div class="popup-header">
        <div class="popup-title">Move to...</div>
        <button class="popup-close" onclick="document.getElementById('move-note-modal')?.remove()">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;margin-top:8px;">
        ${(folders || []).map(f => `
          <div class="move-folder-option" onclick="moveNoteTo('${noteId}', '${f.id}', '${currentFolderId}')">
            📁 ${f.workspaces?.name ? f.workspaces.name + ' / ' : ''}${f.name}
          </div>
        `).join('')}
      </div>
    </div>
  `
  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
}

window.moveNoteTo = async function(noteId, newFolderId, oldFolderId) {
  document.getElementById('move-note-modal')?.remove()

  await supabase.from('notes').update({ folder_id: newFolderId }).eq('id', noteId)

  document.getElementById('sni-' + noteId)?.remove()
  document.getElementById('ni-' + noteId)?.remove()

  if (window.currentNoteId === noteId) {
    window.currentNoteId = null
    const main = document.getElementById('main-content')
    if (main) main.innerHTML = '<div class="main-placeholder">Note moved — select it from its new folder</div>'
  }

  const oldFolderBody = document.getElementById('fb-' + oldFolderId)
  if (oldFolderBody && oldFolderBody.style.display !== 'none') {
    oldFolderBody.innerHTML = ''
    oldFolderBody.style.display = 'none'
    document.getElementById('fc-' + oldFolderId)?.classList.remove('open')
  }
}
window.handleNoteClick = function(e) {
  const target = e.target.closest('a')
  if (target && target.href) {
    e.preventDefault()
    window.open(target.href, '_blank')
  }
}