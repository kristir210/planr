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
  folderEl.dataset.id   = folder.id
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
    folderEl.innerHTML = `
      <div class="folder-row folder-row--notes"
           oncontextmenu="showFolderMenu(event, '${folder.id}', '${workspaceId}', '${colour}', 'notes', null)">
        <span class="folder-chevron" id="fc-${folder.id}" onclick="toggleFolder('${folder.id}', '${workspaceId}', '${colour}', ${depth})">›</span>
        <span class="folder-icon">📁</span>
        <span class="folder-name" onclick="openFolder('${folder.id}', 'notes')">${folder.name}</span>
      </div>
      <div class="folder-body" id="fb-${folder.id}" style="display:none;"></div>
    `
  }

  return folderEl
}

// ── TOGGLE NOTES FOLDER ───────────────────────────────────
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

  const { data: subFolders } = await supabase
    .from('folders')
    .select('*')
    .eq('parent_id', folderId)
    .order('position')

  body.innerHTML = ''

  const nextDepth = depth + 1

  if (subFolders && subFolders.length > 0) {
    subFolders.forEach(sub => {
      const subEl = document.createElement('div')
      subEl.className = 'folder-item folder-item--sub'
      subEl.dataset.id = sub.id
      subEl.style.paddingLeft = `${nextDepth * 10}px`
      subEl.innerHTML = `
        <div class="folder-row folder-row--notes"
             oncontextmenu="showFolderMenu(event, '${sub.id}', '${workspaceId}', '${colour}', 'notes', '${folderId}')">
          <span class="folder-chevron" id="fc-${sub.id}"
                onclick="toggleFolder('${sub.id}', '${workspaceId}', '${colour}', ${nextDepth})">›</span>
          <span class="folder-icon">📁</span>
          <span class="folder-name" onclick="openFolder('${sub.id}', 'notes')">${sub.name}</span>
        </div>
        <div class="folder-body" id="fb-${sub.id}" style="display:none;"></div>
      `
      body.appendChild(subEl)
    })
  }
}

// ── OPEN FOLDER ───────────────────────────────────────────
window.openFolder = function(folderId, type) {
  if (type === 'tasks') loadTaskView(folderId)
  else if (type === 'events') loadEventsView(folderId)
  else loadNotesView(folderId)
}

// ── CONTEXT MENU ──────────────────────────────────────────
function closeContextMenu() {
  document.getElementById('context-menu')?.remove()
}

// folderType: 'tasks' | 'notes' | 'events'
// parentId: set if this is a sub-folder, null if top-level notes folder
window.showFolderMenu = function(e, folderId, workspaceId, colour, folderType, parentId) {
  e.preventDefault()
  e.stopPropagation()
  closeContextMenu()

  const isNotes = folderType === 'notes'

  const menu = document.createElement('div')
  menu.id = 'context-menu'
  menu.className = 'context-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top  = e.clientY + 'px'

  // Notes folders get extra options
  const notesExtras = isNotes ? `
    <div class="context-menu-item" onclick="ctxAddNote('${folderId}')">+ Add note</div>
    <div class="context-menu-item" onclick="ctxAddFolder('${folderId}', '${workspaceId}', '${colour}')">+ Add folder</div>
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

window.ctxAddNote = function(folderId) {
  closeContextMenu()
  openFolder(folderId, 'notes')
  setTimeout(() => window.createNote(folderId), 100)
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

  if (error) { alert('Failed to create folder: ' + error.message); return }

  closeSubFolderPopup()

  // Make sure the parent is expanded and re-render its contents
  const body = document.getElementById('fb-' + parentId)
  const chev = document.getElementById('fc-' + parentId)
  if (body) {
    body.style.display = 'block'
    chev?.classList.add('open')
    body.innerHTML = ''
    // Find depth from padding
    const depth = parseInt(body.closest('.folder-item')?.style.paddingLeft || '0') / 10
    await refreshFolderBody(parentId, workspaceId, colour, depth, body)
  }
}

window.renameFolder = async function(folderId, workspaceId, colour) {
  closeContextMenu()

  const { data: folder } = await supabase
    .from('folders')
    .select('name')
    .eq('id', folderId)
    .single()

  const newName = prompt('Rename folder:', folder.name)
  if (!newName || newName.trim() === folder.name) return

  await supabase
    .from('folders')
    .update({ name: newName.trim() })
    .eq('id', folderId)

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

// ── ADD TOP-LEVEL FOLDER POPUP ────────────────────────────
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
          <span>☑️</span>
          <span>Tasks</span>
        </button>
        <button class="popup-type-btn" data-type="notes" onclick="selectFolderType(this)">
          <span>📁</span>
          <span>Notes</span>
        </button>
        <button class="popup-type-btn" data-type="events" onclick="selectFolderType(this)">
          <span>📅</span>
          <span>Events</span>
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

  const typeBtn = document.querySelector('.popup-type-btn.active')
  const type    = typeBtn?.dataset.type || 'tasks'

  const { error } = await supabase
    .from('folders')
    .insert({ workspace_id: currentWorkspaceId, name, type, position: 0 })

  if (error) { alert('Failed to create folder: ' + error.message); return }

  closePopup()

  const body = document.getElementById('wb-' + currentWorkspaceId)
  body.innerHTML = ''
  loadFolders(currentWorkspaceId, currentWorkspaceColour)
}