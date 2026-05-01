import { supabase } from './supabase.js'
import { loadFolders, addFolder } from './folders.js'

export async function loadWorkspaces() {
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
      <div class="workspace-header"
           onclick="toggleWorkspace('${ws.id}', '${ws.colour}')"
           oncontextmenu="showWorkspaceMenu(event, '${ws.id}', '${ws.colour}')">
        <span class="workspace-chevron" id="wc-${ws.id}">›</span>
        <span class="workspace-dot" style="background:${ws.colour};"></span>
        <span class="workspace-name">${ws.name}</span>
      </div>
      <div class="workspace-body" id="wb-${ws.id}" style="display:none;"></div>
    `
    list.appendChild(wsEl)
  })

  // Wire up new workspace button
  const newWsBtn = document.querySelector('.sidebar-new-workspace')
  if (newWsBtn) {
    newWsBtn.onclick = openNewWorkspaceModal
  }
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

// ── NEW WORKSPACE ─────────────────────────────────────────
const COLOURS = ['#5a90c0', '#c9a96e', '#5aac78', '#a85888', '#c07050', '#7a90c0', '#90c07a']

function openNewWorkspaceModal() {
  document.getElementById('new-workspace-modal')?.remove()

  const modal = document.createElement('div')
  modal.id = 'new-workspace-modal'
  modal.className = 'popup'
  modal.innerHTML = `
    <div class="popup-box">
      <div class="popup-title">New workspace</div>
      <input class="popup-input" id="ws-name-input" placeholder="Workspace name..." />
      <div class="popup-label">Colour</div>
      <div class="ws-colour-picker">
        ${COLOURS.map((c, i) => `
          <div class="ws-colour-swatch ${i === 0 ? 'active' : ''}"
               style="background:${c}"
               data-colour="${c}"
               onclick="selectWsColour(this)"></div>
        `).join('')}
      </div>
      <div class="popup-actions">
        <button class="popup-btn" onclick="closeNewWorkspaceModal()">Cancel</button>
        <button class="popup-btn popup-btn--primary" onclick="createWorkspace()">Create</button>
      </div>
    </div>
  `

  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) closeNewWorkspaceModal() })
  setTimeout(() => document.getElementById('ws-name-input').focus(), 50)
}

window.selectWsColour = function(el) {
  document.querySelectorAll('.ws-colour-swatch').forEach(s => s.classList.remove('active'))
  el.classList.add('active')
}

window.closeNewWorkspaceModal = function() {
  document.getElementById('new-workspace-modal')?.remove()
}

window.createWorkspace = async function() {
  const name = document.getElementById('ws-name-input').value.trim()
  if (!name) return

  const activeSwatch = document.querySelector('.ws-colour-swatch.active')
  const colour = activeSwatch?.dataset.colour || '#c9a96e'

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)

  const position = workspaces?.[0]?.position + 1 || 0

  await supabase
    .from('workspaces')
    .insert({ name, colour, position })

  closeNewWorkspaceModal()
  loadWorkspaces()
}

// ── WORKSPACE CONTEXT MENU ────────────────────────────────
function closeContextMenu() {
  document.getElementById('context-menu')?.remove()
}

window.showWorkspaceMenu = function(e, workspaceId, colour) {
  e.preventDefault()
  e.stopPropagation()
  closeContextMenu()

  const menu = document.createElement('div')
  menu.id = 'context-menu'
  menu.className = 'context-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top  = e.clientY + 'px'
  menu.innerHTML = `
    <div class="context-menu-item" onclick="renameWorkspace('${workspaceId}')">Rename</div>
    <div class="context-menu-item context-menu-item--danger" onclick="deleteWorkspace('${workspaceId}')">Delete</div>
  `

  document.body.appendChild(menu)
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true })
  }, 0)
}

window.renameWorkspace = async function(workspaceId) {
  closeContextMenu()

  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .single()

  const newName = prompt('Rename workspace:', ws.name)
  if (!newName || newName.trim() === ws.name) return

  await supabase
    .from('workspaces')
    .update({ name: newName.trim() })
    .eq('id', workspaceId)

  loadWorkspaces()
}

window.deleteWorkspace = async function(workspaceId) {
  closeContextMenu()

  if (!confirm('Delete this workspace and everything inside it?')) return

  await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)

  loadWorkspaces()

  document.getElementById('main-content').innerHTML =
    '<div class="main-placeholder">Select a view or workspace to get started</div>'
}