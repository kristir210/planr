import { supabase } from './supabase.js'

// ── TASK VIEW ─────────────────────────────────────────────
export async function loadTaskView(folderId) {
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
        <span class="task-col">Status</span>
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

  const statusLabels = {
    not_started: '○ Not started',
    in_progress: '⟳ In progress',
    done: '✓ Done'
  }
  const statusHtml = task.type === 'project'
    ? `<span class="status-badge status-${task.status || 'not_started'}">${statusLabels[task.status || 'not_started']}</span>`
    : `<span class="status-none">—</span>`

  return `
    <div class="task-row" data-id="${task.id}">
      <div class="task-check ${task.done ? 'done' : ''}"
           style="border-color:${colour}80"
           onclick="toggleTask('${task.id}', ${task.done})">
        ${task.done ? '✓' : ''}
      </div>
      <div class="task-title ${task.done ? 'done' : ''}"
           onclick="openTaskEdit('${task.id}')">${task.title}</div>
      <div class="task-col">${statusHtml}</div>
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

// ── COMPLETE TASK ─────────────────────────────────────────
window.toggleTask = async function(taskId, currentDone) {
  const newDone = !currentDone
  await supabase
    .from('tasks')
    .update({ done: newDone, completed_at: newDone ? new Date().toISOString() : null })
    .eq('id', taskId)

  const row = document.querySelector(`.task-row[data-id="${taskId}"]`)
  if (!row) return

  if (newDone) {
    row.style.transition = 'opacity 0.3s'
    row.style.opacity = '0'
    setTimeout(() => row.remove(), 300)
  }
}

// ── ADD TASK INLINE ───────────────────────────────────────
window.addTaskInline = function(folderId) {
  document.getElementById('task-input-row')?.remove()

  const list = document.getElementById('task-list')
  const inputRow = document.createElement('div')
  inputRow.id = 'task-input-row'
  inputRow.className = 'task-row task-row--input'
  inputRow.innerHTML = `
    <div class="task-check" style="border-color:${window.currentFolderColour}80"></div>
    <input class="task-input" id="task-title-input" placeholder="Task name..." />
    <div class="task-col"></div>
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

  const due_date = document.getElementById('task-date-input').value || null

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({ folder_id: folderId, workspace_id: null, title, due_date, position: 0 })
    .select()
    .single()

  if (error) { console.error(error); return }

  document.getElementById('task-input-row')?.remove()

  const list = document.getElementById('task-list')
  list.insertAdjacentHTML('beforeend', renderTask(task, window.currentFolderColour))
}

// ── SHOW COMPLETED ────────────────────────────────────────
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
        <div class="task-col"><span class="status-none">—</span></div>
        <div class="task-col task-deadline">${formatDate(t.due_date)}</div>
      </div>
    `).join('')}
  `
  list.after(section)
  btn.textContent = 'Hide completed tasks'
}

// ── EDIT TASK MODAL ───────────────────────────────────────
window.openTaskEdit = async function(taskId) {
  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  document.getElementById('task-edit-modal')?.remove()

  const isProject = task.type === 'project'

  const modal = document.createElement('div')
  modal.id = 'task-edit-modal'
  modal.className = 'popup'
  modal.innerHTML = `
    <div class="popup-box popup-box--wide">
      <div class="popup-header">
        <div class="popup-title">Edit task</div>
        <button class="popup-close" onclick="closeTaskEdit()">✕</button>
      </div>
      <div class="edit-field">
        <label class="edit-label">Title</label>
        <input class="popup-input" id="edit-title" value="${task.title}" />
      </div>
      <div class="edit-field">
        <label class="edit-label">Type</label>
        <div class="edit-type-row">
          <button class="edit-type-btn ${!isProject ? 'active' : ''}"
                  onclick="setTaskType('simple')">Simple</button>
          <button class="edit-type-btn ${isProject ? 'active' : ''}"
                  onclick="setTaskType('project')">Project</button>
        </div>
      </div>
      <div class="edit-field" id="edit-status-field" style="display:${isProject ? 'flex' : 'none'}">
        <label class="edit-label">Status</label>
        <div class="edit-status-row">
          <button class="edit-status-btn ${task.status === 'not_started' || !task.status ? 'active' : ''}"
                  onclick="setTaskStatus('not_started')">○ Not started</button>
          <button class="edit-status-btn ${task.status === 'in_progress' ? 'active' : ''}"
                  onclick="setTaskStatus('in_progress')">⟳ In progress</button>
          <button class="edit-status-btn ${task.status === 'done' ? 'active' : ''}"
                  onclick="setTaskStatus('done')">✓ Done</button>
        </div>
      </div>
      <div class="edit-row">
        <div class="edit-field">
          <label class="edit-label">Deadline</label>
          <input class="popup-input" id="edit-deadline" type="date" value="${task.due_date || ''}" />
        </div>
        <div class="edit-field">
          <label class="edit-label">Reminder time</label>
          <input class="popup-input" id="edit-reminder" type="time" value="${task.reminder_time ? task.reminder_time.substring(11,16) : ''}" />
        </div>
      </div>
      <div class="popup-actions">
        <button class="popup-btn popup-btn--danger" onclick="deleteTask('${task.id}')">Delete</button>
        <div style="display:flex;gap:8px;">
          <button class="popup-btn" onclick="closeTaskEdit()">Cancel</button>
          <button class="popup-btn popup-btn--primary" onclick="saveTaskEdit('${task.id}')">Save</button>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) closeTaskEdit() })
  document.getElementById('edit-title').focus()
}

window.setTaskType = function(type) {
  document.querySelectorAll('.edit-type-btn').forEach(b => b.classList.remove('active'))
  document.querySelector(`.edit-type-btn[onclick="setTaskType('${type}')"]`).classList.add('active')
  document.getElementById('edit-status-field').style.display = type === 'project' ? 'flex' : 'none'
}

window.setTaskStatus = function(status) {
  document.querySelectorAll('.edit-status-btn').forEach(b => b.classList.remove('active'))
  document.querySelector(`.edit-status-btn[onclick="setTaskStatus('${status}')"]`).classList.add('active')
}

window.closeTaskEdit = function() {
  document.getElementById('task-edit-modal')?.remove()
}

window.saveTaskEdit = async function(taskId) {
  const title    = document.getElementById('edit-title').value.trim()
  const due_date = document.getElementById('edit-deadline').value || null
  const timeVal  = document.getElementById('edit-reminder').value

  const typeBtn  = document.querySelector('.edit-type-btn.active')
  const type     = typeBtn?.textContent.trim().toLowerCase() === 'project' ? 'project' : 'simple'

  const statusBtn = document.querySelector('.edit-status-btn.active')
  const status    = statusBtn
    ? statusBtn.getAttribute('onclick').match(/'([^']+)'/)[1]
    : 'not_started'

  const reminder_time = timeVal
    ? `${due_date || new Date().toISOString().split('T')[0]}T${timeVal}:00`
    : null

  if (!title) return

  await supabase
    .from('tasks')
    .update({ title, due_date, reminder_time, type, status })
    .eq('id', taskId)

  closeTaskEdit()
  loadTaskView(window.currentFolderId)
}

window.deleteTask = async function(taskId) {
  if (!confirm('Delete this task?')) return
  await supabase.from('tasks').delete().eq('id', taskId)
  closeTaskEdit()
  loadTaskView(window.currentFolderId)
}