import { supabase } from './supabase.js'
import { loadTaskView } from './tasks.js'
import { loadNotesView } from './notes.js'
import { loadEventsView } from './events.js'

export async function loadFolders(workspaceId, colour) {
  const { data: folders, error } = await supabase
    .from('folders')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('parent_id', null)
    .order('position')

  const body = document.getElementById('wb-' + workspaceId)

  if (error) {
    body.innerHTML = '<div class="sidebar-loading">Failed to load</div>'
    return
  }

  body.innerHTML = ''

  if (folders.length === 0) {
    const addBtn = document.createElement('div')
    addBtn.className = 'sidebar-add-folder'
    addBtn.textContent = '+ Add folder'
    addBtn.onclick = () => addFolder(workspaceId, colour)
    body.appendChild(addBtn)
    return
  }

  folders.forEach(folder => {
    body.appendChild(buildFolderEl(folder, workspaceId, colour, 0))
  })

  const addBtn = document.createElement('div')
  addBtn.className = 'sidebar-add-folder'
  addBtn.textContent = '+ Add folder'
  addBtn.onclick = () => addFolder(workspaceId, colour)
  body.appendChild(addBtn)
}

function buildFolderEl(folder, workspaceId, colour, depth) {
  const folderEl = document.createElement('div')
  folderEl.className = 'folder-item' + (depth > 0 ? ' folder-item--sub' : '')
  folderEl.dataset.id = folder.id
  folderEl.dataset.type = folder.type
  folderEl.style.paddingLeft = depth > 0 ? `${depth * 10}px` : '0'

  if (folder.type === 'tasks') {
    folderEl.innerHTML = `
      <div class="folder-row folder-row--tasks"
           onclick="openFolder('${folder.id}', 'tasks')"
           oncontextmenu="showFolderMenu(event, '${folder.id}', '${workspaceId}', '${colour}', 'tasks', null)">
        <span class="folder-icon" style="font-size:11px; margin-right:5px;">☑️</span>
        <span class="folder-name">${folder.name}</span>
      </div>
    `
  } else if (folder.type === 'events') {
    folderEl.innerHTML = `
      <div class="folder-row folder-row--tasks"
           onclick="openFolder('${folder.id}', 'events')"
           oncontextmenu="showFolderMenu(event, '${folder.id}', '${workspaceId}', '${colour}', 'events', null)">
        <span class="folder-icon" style="font-size:11px; margin-right:5px;">📅</span>
        <span class="folder-name">${folder.name}</span>
      </div>
    `
  } else {
    // Notes folder — expands to show subfolders + individual notes
    folderEl.innerHTML = `
      <div class="folder-row folder-row--notes"
           oncontextmenu="showFolderMenu(event, '${folder.id}', '${workspaceId}', '${colour}', 'notes', null)">
        <span class="folder-chevron" id="fc-${folder.id}">›</span>
        <span class="folder-icon">📁</span>
        <span class="folder-name">${folder.name}</span>
      </div>
      <div class="folder-body" id="fb-${folder.id}" style="display:none;"></div>
    `
    // Clicking anywhere on the row toggles the folder
    folderEl.querySelector('.folder-row').addEventListener('click', () => {
      toggleFolder(folder.id, workspaceId, colour, depth)
    })
  }

  return folderEl
}

// ── TOGGLE FOLDER (notes) ─────────────────────────────────
window.toggleFolder = async function(folderId, workspaceId, colour, depth = 0) {
  const body = document.getElementById('fb-' + folderId)
  const chev = document.getElementById('fc-' + folderId)
  if (!body) return

  const isOpen = body.style.display !== 'none'
  if (isOpen) {
    body.style.display = 'none'
    chev?.classList.remove('open')
    return
  }

  body.style.display = 'block'
  chev?.classList.add('open')

  if (body.innerHTML.trim() !== '') return

  await refreshFolderBody(folderId, workspaceId, colour, depth, body)
}

async function refreshFolderBody(folderId, workspaceId, colour, depth, body) {
  if (!body) body = document.getElementById('fb-' + folderId)
  if (!body) return

  body.innerHTML = '<div class="sidebar-loading">Loading...</div>'

  const nextDepth = depth + 1
  const indent = nextDepth * 12

  // Load subfolders and notes in parallel
  const [{ data: subFolders }, { data: notes }] = await Promise.all([
    supabase.from('folders').select('*').eq('parent_id', folderId).order('position'),
    supabase.from('notes').select('id, title').eq('folder_id', folderId).order('position')
  ])

  body.innerHTML = ''

  // Render subfolders first
  if (subFolders?.length > 0) {
    subFolders.forEach(sub => {
      const subEl = document.createElement('div')
      subEl.className = 'folder-item folder-item--sub'
      subEl.dataset.id = sub.id
      subEl.style.paddingLeft = `${indent}px`
      subEl.innerHTML = `
        <div class="folder-row folder-row--notes"
             oncontextmenu="showFolderMenu(event, '${sub.id}', '${workspaceId}', '${colour}', 'notes', '${folderId}')">
          <span class="folder-chevron" id="fc-${sub.id}">›</span>
          <span class="folder-icon">📁</span>
          <span class="folder-name">${sub.name}</span>
        </div>
        <div class="folder-body" id="fb-${sub.id}" style="display:none;"></div>
      `
      subEl.querySelector('.folder-row').addEventListener('click', () => {
        toggleFolder(sub.id, workspaceId, colour, nextDepth)
      })
      body.appendChild(subEl)
    })
  }

  // Render individual notes
  if (notes?.length > 0) {
    notes.forEach(note => {
      const noteEl = document.createElement('div')
      noteEl.className = 'sidebar-note-item'
      noteEl.id = 'sni-' + note.id
      noteEl.style.paddingLeft = `${indent + 4}px`
      noteEl.textContent = note.title || 'Untitled'
      noteEl.onclick = () => {
        document.querySelectorAll('.sidebar-note-item').forEach(n => n.classList.remove('active'))
        noteEl.classList.add('active')
        openNoteInEditor(note.id, folderId, colour)
      }
      noteEl.oncontextmenu = (e) => showNoteMenu(e, note.id, folderId)
      body.appendChild(noteEl)
    })
  }

  // Add note button at bottom
  const addNoteBtn = document.createElement('div')
  addNoteBtn.className = 'sidebar-add-folder'
  addNoteBtn.style.paddingLeft = `${indent}px`
  addNoteBtn.textContent = '+ Add note'
  addNoteBtn.onclick = () => createNoteInFolder(folderId, workspaceId, colour, depth, body)
  body.appendChild(addNoteBtn)
}

// ── OPEN NOTE IN EDITOR ───────────────────────────────────
async function openNoteInEditor(noteId, folderId, colour) {
  const { data: note } = await supabase.from('notes').select('*').eq('id', noteId).single()
  const { data: folder } = await supabase.from('folders').select('name').eq('id', folderId).single()

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
        <div class="notes-body"
             id="note-body"
             contenteditable="true"
             oninput="scheduleNoteSave()">${note.body || ''}</div>
        <div class="notes-save-indicator" id="save-indicator"></div>
      </div>
    </div>
  `

  document.getElementById('note-body').focus()
}

// ── CREATE NOTE IN FOLDER ─────────────────────────────────
async function createNoteInFolder(folderId, workspaceId, colour, depth, body) {
  const { data: note, error } = await supabase
    .from('notes')
    .insert({ folder_id: folderId, title: 'Untitled', body: '', position: 0 })
    .select()
    .single()

  if (error) { console.error(error); return }

  // Refresh folder body to show new note
  body.innerHTML = ''
  await refreshFolderBody(folderId, workspaceId, colour, depth, body)

  // Open the new note
  openNoteInEditor(note.id, folderId, colour)

  // Highlight it in sidebar
  setTimeout(() => {
    const el = document.getElementById('sni-' + note.id)
    if (el) {
      document.querySelectorAll('.sidebar-note-item').forEach(n => n.classList.remove('active'))
      el.classList.add('active')
    }
  }, 50)
}

// ── OPEN FOLDER (tasks/events) ────────────────────────────
window.openFolder = function(folderId, type) {
  if (type === 'tasks') loadTaskView(folderId)
  else if (type === 'events') loadEventsView(folderId)
  else toggleFolder(folderId)
}

// ── NOTE CONTEXT MENU ─────────────────────────────────────
window.showNoteMenu = function(e, noteId, folderId) {
  e.preventDefault()
  e.stopPropagation()
  document.getElementById('context-menu')?.remove()

  const menu = document.createElement('div')
  menu.id = 'context-menu'
  menu.className = 'context-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'
  menu.innerHTML = `
    <div class="context-menu-item" onclick="renameNote('${noteId}')">Rename</div>
    <div class="context-menu-item context-menu-item--danger" onclick="deleteNote('${noteId}', '${folderId}')">Delete</div>
  `
  document.body.appendChild(menu)
  setTimeout(() => {
    document.addEventListener('click', () => document.getElementById('context-menu')?.remove(), { once: true })
  }, 0)
}

// ── CONTEXT MENU (folders) ────────────────────────────────
function closeContextMenu() {
  document.getElementById('context-menu')?.remove()
}

window.showFolderMenu = function(e, folderId, workspaceId, colour, folderType, parentId) {
  e.preventDefault()
  e.stopPropagation()
  closeContextMenu()

  const isNotes = folderType === 'notes'
  const menu = document.createElement('div')
  menu.id = 'context-menu'
  menu.className = 'context-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'

  const notesExtras = isNotes ? `
    <div class="context-menu-item" onclick="ctxAddFolder('${folderId}', '${workspaceId}', '${colour}')">+ Add folder</div>
    <div class="context-menu-item" onclick="openMoveFolderModal('${folderId}', '${workspaceId}', '${colour}')">Move to...</div>
    <div class="context-menu-divider"></div>
  ` : ''

  menu.innerHTML = `
    ${notesExtras}
    <div class="context-menu-item" onclick="renameFolder('${folderId}', '${workspaceId}', '${colour}')">Rename</div>
    <div class="context-menu-item context-menu-item--danger" onclick="deleteFolder('${folderId}', '${workspaceId}', '${colour}')">Delete</div>
  `

  document.body.appendChild(menu)
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true })
  }, 0)
}

window.ctxAddFolder = function(folderId, workspaceId, colour) {
  closeContextMenu()
  openSubFolderPopup(folderId, workspaceId, colour)
}

function openSubFolderPopup(parentId, workspaceId, colour) {
  document.getElementById('add-subfolder-popup')?.remove()

  const popup = document.createElement('div')
  popup.id = 'add-subfolder-popup'
  popup.className = 'popup'
  popup.innerHTML = `
    <div class="popup-box">
      <div class="popup-title">New folder</div>
      <input class="popup-input" id="subfolder-name-input" placeholder="Folder name..." />
      <div class="popup-actions">
        <button class="popup-btn" onclick="closeSubFolderPopup()">Cancel</button>
        <button class="popup-btn popup-btn--primary"
                onclick="createSubFolder('${parentId}', '${workspaceId}', '${colour}')">Create</button>
      </div>
    </div>
  `
  document.body.appendChild(popup)
  popup.addEventListener('click', e => { if (e.target === popup) closeSubFolderPopup() })
  setTimeout(() => document.getElementById('subfolder-name-input').focus(), 50)
}

window.closeSubFolderPopup = function() {
  document.getElementById('add-subfolder-popup')?.remove()
}

window.createSubFolder = async function(parentId, workspaceId, colour) {
  const name = document.getElementById('subfolder-name-input').value.trim()
  if (!name) return

  const { error } = await supabase
    .from('folders')
    .insert({ workspace_id: workspaceId, parent_id: parentId, name, type: 'notes', position: 0 })

  if (error) { alert('Failed: ' + error.message); return }

  closeSubFolderPopup()

  const body = document.getElementById('fb-' + parentId)
  const chev = document.getElementById('fc-' + parentId)
  if (body) {
    body.style.display = 'block'
    chev?.classList.add('open')
    body.innerHTML = ''
    const depth = parseInt(body.closest('.folder-item')?.style.paddingLeft || '0') / 12
    await refreshFolderBody(parentId, workspaceId, colour, depth, body)
  }
}

window.renameFolder = async function(folderId, workspaceId, colour) {
  closeContextMenu()
  const { data: folder } = await supabase.from('folders').select('name').eq('id', folderId).single()
  const newName = prompt('Rename folder:', folder.name)
  if (!newName || newName.trim() === folder.name) return
  await supabase.from('folders').update({ name: newName.trim() }).eq('id', folderId)
  const body = document.getElementById('wb-' + workspaceId)
  body.innerHTML = ''
  loadFolders(workspaceId, colour)
}

window.deleteFolder = async function(folderId, workspaceId, colour) {
  closeContextMenu()
  if (!confirm('Delete this folder and everything inside it?')) return
  await supabase.from('folders').delete().eq('id', folderId)
  const body = document.getElementById('wb-' + workspaceId)
  body.innerHTML = ''
  loadFolders(workspaceId, colour)
  if (window.currentFolderId === folderId) {
    document.getElementById('main-content').innerHTML =
      '<div class="main-placeholder">Select a view or workspace to get started</div>'
  }
}

window.openMoveFolderModal = async function(folderId, workspaceId, colour) {
  closeContextMenu()
  document.getElementById('move-folder-modal')?.remove()

  // Load all notes folders in this workspace except the folder itself
  const { data: folders } = await supabase
    .from('folders')
    .select('id, name, parent_id')
    .eq('workspace_id', workspaceId)
    .eq('type', 'notes')
    .neq('id', folderId)
    .order('name')

  // Also offer "top level" as a destination
  const options = folders || []

  const modal = document.createElement('div')
  modal.id = 'move-folder-modal'
  modal.className = 'popup'
  modal.innerHTML = `
    <div class="popup-box">
      <div class="popup-header">
        <div class="popup-title">Move to...</div>
        <button class="popup-close" onclick="document.getElementById('move-folder-modal')?.remove()">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;margin-top:8px;">
        <div class="move-folder-option" onclick="moveFolderTo('${folderId}', null, '${workspaceId}', '${colour}')">
          <span style="opacity:.5">📂</span> Top level
        </div>
        ${options.map(f => `
          <div class="move-folder-option" onclick="moveFolderTo('${folderId}', '${f.id}', '${workspaceId}', '${colour}')">
            📁 ${f.name}
          </div>
        `).join('')}
      </div>
    </div>
  `

  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
}

window.moveFolderTo = async function(folderId, newParentId, workspaceId, colour) {
  document.getElementById('move-folder-modal')?.remove()

  await supabase
    .from('folders')
    .update({ parent_id: newParentId || null })
    .eq('id', folderId)

  // Reload the whole workspace sidebar to reflect the move
  const body = document.getElementById('wb-' + workspaceId)
  if (body) {
    body.innerHTML = ''
    await loadFolders(workspaceId, colour)
    // Re-expand the workspace
    const wsBody = document.getElementById('wb-' + workspaceId)
    if (wsBody) wsBody.style.display = 'block'
  }
}
window.renameNote = async function(noteId) {
  document.getElementById('context-menu')?.remove()
  const { data: note } = await supabase.from('notes').select('title').eq('id', noteId).single()
  const newName = prompt('Rename note:', note.title)
  if (!newName || newName.trim() === note.title) return
  await supabase.from('notes').update({ title: newName.trim() }).eq('id', noteId)
  const el = document.getElementById('sni-' + noteId)
  if (el) el.textContent = newName.trim()
  const titleInput = document.getElementById('note-title-input')
  if (titleInput && window.currentNoteId === noteId) titleInput.value = newName.trim()
}

window.deleteNote = async function(noteId, folderId) {
  document.getElementById('context-menu')?.remove()
  if (!confirm('Delete this note?')) return
  await supabase.from('notes').delete().eq('id', noteId)
  document.getElementById('sni-' + noteId)?.remove()
  if (window.currentNoteId === noteId) {
    window.currentNoteId = null
    document.getElementById('main-content').innerHTML =
      '<div class="main-placeholder">Select a note</div>'
  }
}

// ── ADD TOP-LEVEL FOLDER ──────────────────────────────────
let currentWorkspaceId = null
let currentWorkspaceColour = null

export function addFolder(workspaceId, colour) {
  currentWorkspaceId = workspaceId
  currentWorkspaceColour = colour

  document.getElementById('add-folder-popup')?.remove()

  const popup = document.createElement('div')
  popup.id = 'add-folder-popup'
  popup.className = 'popup'
  popup.innerHTML = `
    <div class="popup-box">
      <div class="popup-title">New folder</div>
      <input class="popup-input" id="folder-name-input" placeholder="Folder name..." />
      <div class="popup-label">Type</div>
      <div class="popup-types">
        <button class="popup-type-btn active" data-type="tasks" onclick="selectFolderType(this)">
          <span>☑️</span><span>Tasks</span>
        </button>
        <button class="popup-type-btn" data-type="notes" onclick="selectFolderType(this)">
          <span>📁</span><span>Notes</span>
        </button>
        <button class="popup-type-btn" data-type="events" onclick="selectFolderType(this)">
          <span>📅</span><span>Events</span>
        </button>
      </div>
      <div class="popup-actions">
        <button class="popup-btn" onclick="closePopup()">Cancel</button>
        <button class="popup-btn popup-btn--primary" onclick="createFolder()">Create</button>
      </div>
    </div>
  `
  document.body.appendChild(popup)
  popup.addEventListener('click', e => { if (e.target === popup) closePopup() })
  setTimeout(() => document.getElementById('folder-name-input').focus(), 50)
}

window.selectFolderType = function(btn) {
  document.querySelectorAll('.popup-type-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
}

window.closePopup = function() {
  document.getElementById('add-folder-popup')?.remove()
}

window.createFolder = async function() {
  const name = document.getElementById('folder-name-input').value.trim()
  if (!name) return
  const type = document.querySelector('.popup-type-btn.active')?.dataset.type || 'tasks'
  const { error } = await supabase
    .from('folders')
    .insert({ workspace_id: currentWorkspaceId, name, type, position: 0 })
  if (error) { alert('Failed: ' + error.message); return }
  closePopup()
  const body = document.getElementById('wb-' + currentWorkspaceId)
  body.innerHTML = ''
  loadFolders(currentWorkspaceId, currentWorkspaceColour)
}