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

window.openFolder = async function(folderId, type) {
  if (type === 'tasks') {
    loadTaskView(folderId)
  } else {
    loadNotesView(folderId)
  }
}

async function loadTaskView(folderId) {
  const { data: folder } = await supabase
    .from('folders')
    .select('*, workspaces(name, colour)')
    .eq('id', folderId)
    .single()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('folder_id', folderId)
    .eq('done', false)
    .order('position')

  window.currentFolderId = folderId
  window.currentFolderColour = folder.workspaces.colour

  const main = document.getElementById('main-content')
  main.innerHTML = `
    <div class="task-view">
      <div class="task-view-header">
        <div class="task-view-title">
          <span class="task-view-dot" style="background:${folder.workspaces.colour}"></span>
          <h2>${folder.name}</h2>
        </div>
        <span class="task-view-ws">${folder.workspaces.name}</span>
      </div>
      <div class="task-toolbar">
        <span class="task-col-main">Task</span>
        <span class="task-col">Priority</span>
        <span class="task-col">Tag</span>
        <span class="task-col">Deadline</span>
      </div>
      <div class="task-list" id="task-list">
        ${tasks.map(t => renderTask(t, folder.workspaces.colour)).join('')}
      </div>
      <div class="task-add-row" onclick="addTaskInline('${folderId}')">
        <span>+</span> Add task
      </div>
      <div class="task-completed-btn" onclick="loadCompletedTasks('${folderId}')">
        Show completed tasks
      </div>
    </div>
  `
}

function renderTask(task, colour) {
  const overdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString())
  return `
    <div class="task-row" data-id="${task.id}">
      <div class="task-check ${task.done ? 'done' : ''}"
           style="border-color:${colour}80"
           onclick="toggleTask('${task.id}', ${task.done}, '${colour}')">
        ${task.done ? '✓' : ''}
      </div>
      <div class="task-title ${task.done ? 'done' : ''}"
           onclick="openTaskEdit('${task.id}')">${task.title}</div>
      <div class="task-col">
        <span class="priority-badge priority-${task.priority || 'none'}">${task.priority || '—'}</span>
      </div>
      <div class="task-col task-tag">${task.tag || '—'}</div>
      <div class="task-col task-deadline ${overdue ? 'overdue' : ''}">
        ${formatDate(task.due_date)}
      </div>
    </div>
  `
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
}

window.toggleTask = async function(taskId, currentDone, colour) {
  const newDone = !currentDone
  await supabase
    .from('tasks')
    .update({ done: newDone, completed_at: newDone ? new Date().toISOString() : null })
    .eq('id', taskId)

  const row = document.querySelector(`.task-row[data-id="${taskId}"]`)
  if (!row) return

  if (newDone) {
    // Fade out and remove the row since we only show incomplete tasks
    row.style.transition = 'opacity 0.3s'
    row.style.opacity = '0'
    setTimeout(() => row.remove(), 300)
  }
}

window.addTaskInline = function(folderId) {
  // Remove any existing input row
  document.getElementById('task-input-row')?.remove()

  const list = document.getElementById('task-list')
  const inputRow = document.createElement('div')
  inputRow.id = 'task-input-row'
  inputRow.className = 'task-row task-row--input'
  inputRow.innerHTML = `
    <div class="task-check" style="border-color:${window.currentFolderColour}80"></div>
    <input class="task-input" id="task-title-input" placeholder="Task name..." autofocus />
    <div class="task-col">
      <select class="task-select" id="task-priority-input">
        <option value="none">—</option>
        <option value="high">High</option>
        <option value="mid">Mid</option>
        <option value="low">Low</option>
      </select>
    </div>
    <div class="task-col">
      <input class="task-input task-input--small" id="task-tag-input" placeholder="Tag..." />
    </div>
    <div class="task-col">
      <input class="task-input task-input--small" id="task-date-input" type="date" />
    </div>
  `
  list.appendChild(inputRow)

  const input = document.getElementById('task-title-input')
  input.focus()

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') await saveNewTask(folderId)
    if (e.key === 'Escape') inputRow.remove()
  })
}

async function saveNewTask(folderId) {
  const title = document.getElementById('task-title-input').value.trim()
  if (!title) return

  const priority = document.getElementById('task-priority-input').value
  const tag = document.getElementById('task-tag-input').value.trim()
  const due_date = document.getElementById('task-date-input').value || null

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({ folder_id: folderId, workspace_id: null, title, priority, tag, due_date, position: 0 })
    .select()
    .single()

  if (error) { console.error(error); return }

  document.getElementById('task-input-row')?.remove()

  const list = document.getElementById('task-list')
  list.insertAdjacentHTML('beforeend', renderTask(task, window.currentFolderColour))
}

window.loadCompletedTasks = async function(folderId) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('folder_id', folderId)
    .eq('done', true)
    .order('completed_at', { ascending: false })

  const btn = document.querySelector('.task-completed-btn')
  const list = document.getElementById('task-list')

  const existing = document.getElementById('completed-section')
  if (existing) {
    existing.remove()
    btn.textContent = 'Show completed tasks'
    return
  }

  const section = document.createElement('div')
  section.id = 'completed-section'
  section.innerHTML = `
    <div class="task-completed-header">Completed (${tasks.length})</div>
    ${tasks.map(t => `
      <div class="task-row task-row--done" data-id="${t.id}">
        <div class="task-check done" style="border-color:${window.currentFolderColour}80">✓</div>
        <div class="task-title done">${t.title}</div>
        <div class="task-col"><span class="priority-badge priority-${t.priority || 'none'}">${t.priority || '—'}</span></div>
        <div class="task-col task-tag">${t.tag || '—'}</div>
        <div class="task-col task-deadline">${formatDate(t.due_date)}</div>
      </div>
    `).join('')}
  `
  list.after(section)
  btn.textContent = 'Hide completed tasks'
}

window.openTaskEdit = function(taskId) {
  console.log('Edit task:', taskId)
  // Task edit modal comes next
}

function loadNotesView(folderId) {
  const main = document.getElementById('main-content')
  main.innerHTML = '<div class="main-placeholder">Notes view coming soon</div>'
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