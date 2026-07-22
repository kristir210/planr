import { supabase } from './supabase.js'

let graphSimulation = null

export async function initGraphView() {
  const main = document.getElementById('main-content')
  main.innerHTML = `
    <div class="graph-view" id="graph-view">
      <div class="graph-header">
        <span class="graph-title">Note graph</span>
        <div class="graph-legend">
          <div class="graph-legend-item">
            <svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="#5a90c030" stroke="#5a90c0" stroke-width="1.5"/></svg>
            <span>Workspace</span>
          </div>
          <div class="graph-legend-item">
            <svg width="16" height="16"><rect x="1" y="1" width="14" height="14" rx="3" fill="#5a90c015" stroke="#5a90c060" stroke-width="1"/></svg>
            <span>Folder</span>
          </div>
          <div class="graph-legend-item">
            <svg width="16" height="16"><circle cx="8" cy="8" r="5" fill="#d4b48320" stroke="#d4b483" stroke-width="1"/></svg>
            <span>Note</span>
          </div>
        </div>
      </div>
      <div class="graph-body" id="graph-body">
        <div class="graph-loading">Loading graph...</div>
      </div>
      <div id="graph-node-popup" class="graph-node-popup" style="display:none;">
        <div id="graph-popup-title" class="graph-popup-title"></div>
        <div id="graph-popup-actions"></div>
      </div>
    </div>
  `

  await loadGraphData()
}

async function loadGraphData() {
  const [wsRes, foldersRes, notesRes] = await Promise.all([
    supabase.from('workspaces').select('id, name, colour').order('position'),
    supabase.from('folders').select('id, name, workspace_id, parent_id, type').eq('type', 'notes').order('position'),
    supabase.from('notes').select('id, title, folder_id').order('position')
  ])

  const workspaces = wsRes.data || []
  const folders = foldersRes.data || []
  const notes = notesRes.data || []

  const nodes = []
  const links = []

  workspaces.forEach(ws => {
    nodes.push({ id: 'ws-' + ws.id, label: ws.name, type: 'workspace', colour: ws.colour, rawId: ws.id })
  })

  folders.forEach(f => {
    const ws = workspaces.find(w => w.id === f.workspace_id)
    nodes.push({
      id: 'f-' + f.id,
      label: f.name,
      type: 'folder',
      colour: ws?.colour || '#7a6e58',
      rawId: f.id,
      workspaceId: f.workspace_id,
      wsColour: ws?.colour || '#7a6e58'
    })
    if (f.parent_id) {
      links.push({ source: 'f-' + f.parent_id, target: 'f-' + f.id })
    } else {
      links.push({ source: 'ws-' + f.workspace_id, target: 'f-' + f.id })
    }
  })

  notes.forEach(n => {
    nodes.push({ id: 'n-' + n.id, label: n.title || 'Untitled', type: 'note', rawId: n.id, folderId: n.folder_id })
    links.push({ source: 'f-' + n.folder_id, target: 'n-' + n.id })
  })

  renderGraph(nodes, links, workspaces)
}

function renderGraph(nodes, links, workspaces) {
  const body = document.getElementById('graph-body')
  if (!body) return

  body.innerHTML = ''

  const d3Script = document.createElement('script')
  d3Script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js'
  d3Script.onload = () => buildD3Graph(nodes, links, body)
  document.head.appendChild(d3Script)

  if (window.d3) {
    buildD3Graph(nodes, links, body)
    return
  }
}

function buildD3Graph(nodes, links, body) {
  if (!window.d3) { setTimeout(() => buildD3Graph(nodes, links, body), 100); return }

  const d3 = window.d3
  const w = body.offsetWidth || 800
  const h = body.offsetHeight || 600

  const svg = d3.select(body).append('svg')
    .attr('width', '100%').attr('height', '100%')

  const g = svg.append('g')

  svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', e => g.attr('transform', e.transform)))

  if (graphSimulation) graphSimulation.stop()

  graphSimulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id)
      .distance(d => d.source.type === 'workspace' ? 120 : 65)
      .strength(0.8))
    .force('charge', d3.forceManyBody().strength(-220))
    .force('center', d3.forceCenter(w / 2, h / 2))
    .force('collision', d3.forceCollide(35))

  const link = g.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', '#353024').attr('stroke-width', 1)

  const node = g.append('g').selectAll('g').data(nodes).join('g')
    .attr('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) graphSimulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => { if (!e.active) graphSimulation.alphaTarget(0); d.fx = null; d.fy = null }))

  node.each(function(d) {
    const el = d3.select(this)
    if (d.type === 'workspace') {
      el.append('circle').attr('r', 18)
        .attr('fill', d.colour + '30').attr('stroke', d.colour).attr('stroke-width', 1.5)
    } else if (d.type === 'folder') {
      el.append('rect').attr('x', -11).attr('y', -11).attr('width', 22).attr('height', 22).attr('rx', 3)
        .attr('fill', d.wsColour + '18').attr('stroke', d.wsColour + '70').attr('stroke-width', 1)
    } else {
      el.append('circle').attr('r', 7)
        .attr('fill', '#d4b48320').attr('stroke', '#d4b483').attr('stroke-width', 1)
    }
  })

  node.on('mouseover', function(e, d) {
    d3.select(this).select('circle,rect')
      .attr('fill', d.type === 'workspace' ? d.colour + '50' : d.type === 'folder' ? d.wsColour + '35' : '#d4b48345')
  }).on('mouseout', function(e, d) {
    d3.select(this).select('circle,rect')
      .attr('fill', d.type === 'workspace' ? d.colour + '30' : d.type === 'folder' ? d.wsColour + '18' : '#d4b48320')
  }).on('click', function(e, d) {
    e.stopPropagation()
    handleNodeClick(e, d)
  })

  node.append('text')
    .text(d => d.label.length > 16 ? d.label.slice(0, 15) + '…' : d.label)
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.type === 'workspace' ? 33 : d.type === 'folder' ? 27 : 21)
    .attr('font-size', d => d.type === 'workspace' ? 11 : 10)
    .attr('fill', d => d.type === 'workspace' ? d.colour : d.type === 'folder' ? '#8a7d68' : '#b5a68c')
    .attr('font-family', 'system-ui, sans-serif')
    .attr('pointer-events', 'none')

  graphSimulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
    node.attr('transform', d => `translate(${d.x},${d.y})`)
  })

  svg.on('click', () => {
    document.getElementById('graph-node-popup').style.display = 'none'
  })
}

function handleNodeClick(e, d) {
  const popup = document.getElementById('graph-node-popup')
  const title = document.getElementById('graph-popup-title')
  const actions = document.getElementById('graph-popup-actions')

  if (d.type === 'note') {
    popup.style.display = 'none'
    openNoteFromGraph(d.rawId, d.folderId)
    return
  }

  if (d.type === 'workspace') {
    popup.style.display = 'none'
    return
  }

  if (d.type === 'folder') {
    title.textContent = d.label
    actions.innerHTML = `
      <div class="graph-popup-action" onclick="addNoteFromGraph('${d.rawId}', '${d.workspaceId}', '${d.wsColour}')">+ Add note</div>
      <div class="graph-popup-action" onclick="openFolderFromGraph('${d.rawId}', '${d.wsColour}')">Open folder</div>
    `
    const graphBody = document.getElementById('graph-body')
    const rect = graphBody.getBoundingClientRect()
    popup.style.left = (e.clientX - rect.left + 10) + 'px'
    popup.style.top = (e.clientY - rect.top - 10) + 'px'
    popup.style.display = 'block'
  }
}

async function openNoteFromGraph(noteId, folderId) {
  const { data: note } = await supabase.from('notes').select('*').eq('id', noteId).single()
  if (!note) return

  window.currentNoteId = noteId
  window.currentFolderId = folderId

  const main = document.getElementById('main-content')
  main.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg-top);">
      <button onclick="initGraphView()" style="font-size:11px;font-family:inherit;padding:4px 10px;border-radius:4px;border:1px solid var(--border);background:none;color:var(--text-dim);cursor:pointer;">← Graph</button>
      <span style="font-size:12px;color:var(--text-dim);">${note.title || 'Untitled'}</span>
    </div>
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

window.addNoteFromGraph = async function(folderId, workspaceId, colour) {
  document.getElementById('graph-node-popup').style.display = 'none'
  const { data: note, error } = await supabase
    .from('notes')
    .insert({ folder_id: folderId, title: 'Untitled', body: '', position: 0 })
    .select().single()
  if (error) return
  await openNoteFromGraph(note.id, folderId)
  await initGraphView()
  setTimeout(() => openNoteFromGraph(note.id, folderId), 100)
}

window.openFolderFromGraph = async function(folderId, colour) {
  document.getElementById('graph-node-popup').style.display = 'none'
  const { loadNotesView } = await import('./notes.js')
  loadNotesView(folderId)
}

window.initGraphView = initGraphView