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

  // Clear main content if it was showing something from this workspace
  document.getElementById('main-content').innerHTML =
    '<div class="main-placeholder">Select a view or workspace to get started</div>'
}