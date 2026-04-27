import { supabase } from './supabase.js'

// ── PANEL TOGGLE ──────────────────────────────────────────
const panel = document.getElementById('right-panel')
const panelTab = document.getElementById('panel-tab')
const panelToggle = document.getElementById('panel-toggle')

function openPanel() {
  panel.classList.remove('hide')
  panelTab.classList.remove('show')
}

function closePanel() {
  panel.classList.add('hide')
  panelTab.classList.add('show')
}

panelToggle.addEventListener('click', () => {
  panel.classList.contains('hide') ? openPanel() : closePanel()
})

panelTab.addEventListener('click', openPanel)

// ── WORKSPACES ────────────────────────────────────────────
async function loadWorkspaces() {
  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('*')
    .order('position')

  const list = document.getElementById('workspace-list')

  if (error) {
    list.innerHTML = '<div class="sidebar-loading">Failed to load</div>'
    return
  }

  list.innerHTML = ''

  workspaces.forEach(ws => {
    const wsEl = document.createElement('div')
    wsEl.className = 'workspace-item'
    wsEl.dataset.id = ws.id
    wsEl.innerHTML = `
      <div class="workspace-header" onclick="toggleWorkspace('${ws.id}', '${ws.colour}')">
        <span class="workspace-chevron" id="wc-${ws.id}">›</span>
        <span class="workspace-dot" style="background:${ws.colour};"></span>
        <span class="workspace-name">${ws.name}</span>
      </div>
      <div class="workspace-body" id="wb-${ws.id}" style="display:none;"></div>
    `
    list.appendChild(wsEl)
  })
}

window.toggleWorkspace = function(id, colour) {
  const body = document.getElementById('wb-' + id)
  const chev = document.getElementById('wc-' + id)
  const isOpen = body.style.display !== 'none'

  body.style.display = isOpen ? 'none' : 'block'
  chev.classList.toggle('open', !isOpen)

  if (!isOpen && body.innerHTML.trim() === '') {
    loadFolders(id, colour)
  }
}

// ── FOLDERS ───────────────────────────────────────────────
async function loadFolders(workspaceId, colour) {
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
    const folderEl = document.createElement('div')
    folderEl.className = 'folder-item'
    folderEl.dataset.id = folder.id
    folderEl.dataset.type = folder.type

    if (folder.type === 'tasks') {
      folderEl.innerHTML = `
        <div class="folder-row folder-row--tasks" onclick="openFolder('${folder.id}', '${folder.type}')">
          <span class="folder-dot" style="background:${colour};"></span>
          <span class="folder-name">${folder.name}</span>
        </div>
      `
    } else {
      folderEl.innerHTML = `
        <div class="folder-row folder-row--notes">
          <span class="folder-chevron" id="fc-${folder.id}" onclick="toggleFolder('${folder.id}', '${workspaceId}', '${colour}')">›</span>
          <span class="folder-icon">📁</span>
          <span class="folder-name" onclick="openFolder('${folder.id}', '${folder.type}')">${folder.name}</span>
        </div>
        <div class="folder-body" id="fb-${folder.id}" style="display:none;"></div>
      `
    }

    body.appendChild(folderEl)
  })

  const addBtn = document.createElement('div')
  addBtn.className = 'sidebar-add-folder'
  addBtn.textContent = '+ Add folder'
  addBtn.onclick = () => addFolder(workspaceId, colour)
  body.appendChild(addBtn)
}

window.toggleFolder = async function(folderId, workspaceId, colour) {
  const body = document.getElementById('fb-' + folderId)
  const chev = document.getElementById('fc-' + folderId)
  const isOpen = body.style.display !== 'none'

  if (isOpen) {
    body.style.display = 'none'
    chev.classList.remove('open')
    return
  }

  body.style.display = 'block'
  chev.classList.add('open')

  if (body.innerHTML.trim() !== '') return

  const { data: subFolders } = await supabase
    .from('folders')
    .select('*')
    .eq('parent_id', folderId)
    .order('position')

  body.innerHTML = ''

  if (subFolders && subFolders.length > 0) {
    subFolders.forEach(sub => {
      const subEl = document.createElement('div')
      subEl.className = 'folder-item folder-item--sub'
      subEl.innerHTML = `
        <div class="folder-row folder-row--notes">
          <span class="folder-chevron" id="fc-${sub.id}" onclick="toggleFolder('${sub.id}', '${workspaceId}', '${colour}')">›</span>
          <span class="folder-icon">📁</span>
          <span class="folder-name" onclick="openFolder('${sub.id}', 'notes')">${sub.name}</span>
        </div>
        <div class="folder-body" id="fb-${sub.id}" style="display:none;"></div>
      `
      body.appendChild(subEl)
    })
  }

  const addNoteBtn = document.createElement('div')
  addNoteBtn.className = 'sidebar-add-folder sidebar-add-folder--sub'
  addNoteBtn.textContent = '+ Add note'
  body.appendChild(addNoteBtn)
}

window.openFolder = function(folderId, type) {
  console.log('Open folder:', folderId, type)
}

window.addFolder = function(workspaceId, colour) {
  console.log('Add folder to workspace:', workspaceId)
}

// ── INIT ──────────────────────────────────────────────────
loadWorkspaces()
// ── ADD FOLDER ────────────────────────────────────────────
let currentWorkspaceId = null
let currentWorkspaceColour = null

window.addFolder = function(workspaceId, colour) {
  currentWorkspaceId = workspaceId
  currentWorkspaceColour = colour
  showAddFolderPopup()
}

function showAddFolderPopup() {
  // Remove existing popup if any
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
          <span>☑</span>
          <span>Tasks</span>
        </button>
        <button class="popup-type-btn" data-type="notes" onclick="selectFolderType(this)">
          <span>📁</span>
          <span>Notes</span>
        </button>
      </div>
      <div class="popup-actions">
        <button class="popup-btn" onclick="closePopup()">Cancel</button>
        <button class="popup-btn popup-btn--primary" onclick="createFolder()">Create</button>
      </div>
    </div>
  `

  document.body.appendChild(popup)
  popup.addEventListener('click', e => {
    if (e.target === popup) closePopup()
  })
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
  const type = typeBtn?.dataset.type || 'tasks'

  const { error } = await supabase
    .from('folders')
    .insert({
      workspace_id: currentWorkspaceId,
      name,
      type,
      position: 0
    })

  if (error) {
    alert('Failed to create folder: ' + error.message)
    return
  }

  closePopup()

  // Reload folders for this workspace
  const body = document.getElementById('wb-' + currentWorkspaceId)
  body.innerHTML = ''
  loadFolders(currentWorkspaceId, currentWorkspaceColour)
}