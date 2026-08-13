import { supabase } from './supabase.js'

let saveTimeout = null
let isEditing = false

export async function loadNotesView(folderId) {
  const { data: folder } = await supabase
    .from('folders')
    .select('*, workspaces(id, name, colour)')
    .eq('id', folderId)
    .single()

  const { data: notes } = await supabase
    .from('notes')
    .select('id, title')
    .eq('folder_id', folderId)
    .order('position')

  window.currentFolderId = folderId

  const main = document.getElementById('main-content')
  main.innerHTML = `
    <div class="notes-view">
      <div class="notes-list" id="notes-list">
        <div class="notes-list-header">
          <div class="notes-list-title">
            <span class="notes-list-dot" style="background:${folder.workspaces.colour}"></span>
            <span>${folder.name}</span>
          </div>
          <button class="notes-add-btn" onclick="createNote('${folderId}')">+ New note</button>
        </div>
        <div class="notes-list-items" id="notes-list-items">
          ${(notes || []).map(n => `
            <div class="notes-list-item" data-id="${n.id}" onclick="openNote('${n.id}', '${folderId}')">
              ${n.title || 'Untitled'}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="notes-editor" id="notes-editor">
        <div class="notes-editor-placeholder">Select a note or create a new one</div>
      </div>
    </div>
  `
}

window.createNote = async function(folderId) {
  const { data: note } = await supabase
    .from('notes')
    .insert({ folder_id: folderId, title: 'Untitled', body: '', position: 0 })
    .select()
    .single()

  const list = document.getElementById('notes-list-items')
  if (list) {
    const item = document.createElement('div')
    item.className = 'notes-list-item active'
    item.dataset.id = note.id
    item.textContent = 'Untitled'
    item.onclick = () => openNote(note.id, folderId)
    list.appendChild(item)
  }

  openNote(note.id, folderId)

  const sidebarEl = document.getElementById('sni-' + note.id)
  if (!sidebarEl) {
    const fb = document.getElementById('fb-' + folderId)
    if (fb) {
      const noteEl = document.createElement('div')
      noteEl.className = 'sidebar-note-item'
      noteEl.id = 'sni-' + note.id
      noteEl.dataset.id = note.id
      noteEl.textContent = 'Untitled'
      noteEl.onclick = () => openNote(note.id, folderId)
      const addBtn = fb.querySelector('.sidebar-add-folder')
      if (addBtn) fb.insertBefore(noteEl, addBtn)
      else fb.appendChild(noteEl)
    }
  }
}

window.openNote = async function(noteId, folderId) {
  const { data: note } = await supabase
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .single()

  window.currentNoteId = noteId
  isEditing = false

  document.querySelectorAll('.notes-list-item').forEach(el => el.classList.remove('active'))
  document.querySelector(`.notes-list-item[data-id="${noteId}"]`)?.classList.add('active')

  const editorHTML = buildEditorHTML(note, false)

  const editor = document.getElementById('notes-editor')
  if (editor) {
    editor.innerHTML = editorHTML
  } else {
    const main = document.getElementById('main-content')
    main.innerHTML = `<div class="notes-editor-standalone">${editorHTML}</div>`
  }

  initNoteEditor(note)
}

function buildEditorHTML(note, editing) {
  return `
    <div class="notes-editor-inner">
      <div class="notes-editor-topbar">
        <input class="notes-title-input" id="note-title-input"
               value="${note.title || ''}"
               placeholder="Untitled"
               oninput="scheduleNoteSave()"
               ${editing ? '' : 'readonly'} />
        <span class="notes-edit-hint" id="notes-edit-hint" style="${editing ? 'display:none' : ''}">Double-click to edit</span>
      </div>
      <div class="notes-toolbar" id="notes-toolbar" style="${editing ? '' : 'display:none'}">
        <button onclick="fmt('bold')" title="Bold"><b>B</b></button>
        <button onclick="fmt('italic')" title="Italic"><i>I</i></button>
        <button onclick="fmt('underline')" title="Underline"><u>U</u></button>
        <div class="notes-toolbar-divider"></div>
        <button onclick="fmt('insertUnorderedList')" title="Bullet list">≡</button>
        <button onclick="fmt('insertOrderedList')" title="Numbered list">1.</button>
        <div class="notes-toolbar-divider"></div>
        <button onclick="fmtBlock('h2')" title="Heading">H</button>
        <button onclick="fmtBlock('p')" title="Paragraph">¶</button>
        <div class="notes-toolbar-divider"></div>
        <button onclick="exitEditMode()" style="margin-left:auto;font-size:11px;color:var(--text-dim);">Done</button>
      </div>
      <div class="notes-body"
           id="note-body"
           contenteditable="false"
           >${note.body || ''}</div>
      <div class="notes-save-indicator" id="save-indicator"></div>
    </div>
  `
}

function initNoteEditor(note) {
  const body = document.getElementById('note-body')
  const titleInput = document.getElementById('note-title-input')
  if (!body) return

  // Single click on link — open it
  body.addEventListener('click', e => {
    const link = e.target.closest('a')
    if (link && !isEditing) {
      e.preventDefault()
      window.open(link.href, '_blank', 'noopener,noreferrer')
    }
  })

  // Double click anywhere — enter edit mode
  body.addEventListener('dblclick', () => {
    enterEditMode(body, titleInput)
  })

  titleInput?.addEventListener('dblclick', () => {
    enterEditMode(body, titleInput)
  })

  // Auto-link pasted URLs
  body.addEventListener('paste', e => {
    if (!isEditing) return
    const text = e.clipboardData?.getData('text/plain') || ''
    const urlRegex = /https?:\/\/[^\s]+/g
    if (!urlRegex.test(text)) return

    e.preventDefault()
    const linked = text.replace(/https?:\/\/[^\s]+/g, url =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    )
    document.execCommand('insertHTML', false, linked)
    scheduleNoteSave()
  })
}

function enterEditMode(body, titleInput) {
  if (isEditing) return
  isEditing = true
  body.contentEditable = 'true'
  body.focus()
  if (titleInput) titleInput.removeAttribute('readonly')
  document.getElementById('notes-toolbar').style.display = ''
  document.getElementById('notes-edit-hint').style.display = 'none'
}

window.exitEditMode = function() {
  isEditing = false
  const body = document.getElementById('note-body')
  const titleInput = document.getElementById('note-title-input')
  if (body) body.contentEditable = 'false'
  if (titleInput) titleInput.setAttribute('readonly', true)
  document.getElementById('notes-toolbar').style.display = 'none'
  document.getElementById('notes-edit-hint').style.display = ''
  saveNote()
}

window.scheduleNoteSave = function() {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveNote, 800)
}

async function saveNote() {
  const noteId = window.currentNoteId
  if (!noteId) return

  const title = document.getElementById('note-title-input')?.value || ''
  const body  = document.getElementById('note-body')?.innerHTML || ''

  await supabase
    .from('notes')
    .update({ title, body })
    .eq('id', noteId)

  const indicator = document.getElementById('save-indicator')
  if (indicator) {
    indicator.textContent = 'Saved'
    setTimeout(() => { indicator.textContent = '' }, 1500)
  }

  const listItem = document.querySelector(`.notes-list-item[data-id="${noteId}"]`)
  if (listItem) listItem.textContent = title || 'Untitled'

  const sidebarItem = document.getElementById('sni-' + noteId)
  if (sidebarItem) sidebarItem.textContent = title || 'Untitled'
}

window.fmt = function(cmd) {
  document.execCommand(cmd, false, null)
  document.getElementById('note-body')?.focus()
  scheduleNoteSave()
}

window.fmtBlock = function(tag) {
  document.execCommand('formatBlock', false, tag)
  document.getElementById('note-body')?.focus()
  scheduleNoteSave()
}