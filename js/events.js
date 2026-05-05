import { supabase } from './supabase.js'

export async function loadEventsView(folderId) {
  const { data: folder } = await supabase
    .from('folders')
    .select('*, workspaces(id, name, colour)')
    .eq('id', folderId)
    .single()

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('folder_id', folderId)
    .order('start_time')

  window.currentFolderId = folderId

  const colour = folder?.workspaces?.colour || '#a85888'
  const main   = document.getElementById('main-content')

  main.innerHTML = `
    <div class="task-view">
      <div class="task-view-header">
        <div class="task-view-title">
          <span class="task-view-dot" style="background:${colour}"></span>
          <h2>${folder?.name || 'Events'}</h2>
        </div>
        <span class="task-view-ws">${folder?.workspaces?.name || ''}</span>
      </div>
      <div class="task-toolbar">
        <span class="task-col-main">Event</span>
        <span class="task-col">Date</span>
        <span class="task-col">Time</span>
        <span class="task-col">Location</span>
      </div>
      <div class="task-list" id="events-list">
        ${(events || []).length === 0
          ? `<div class="events-empty">No events yet. Click <strong>+ Add event</strong> below or add from the calendar.</div>`
          : (events || []).map(e => renderEventRow(e, colour)).join('')
        }
      </div>
      <div class="task-add-row" id="events-add-row">
        <span>+</span> Add event
      </div>
    </div>
  `

  document.getElementById('events-add-row').addEventListener('click', () => {
    openCalAddPopupFromFolder(folderId, folder?.workspaces?.id)
  })
}

function formatDate(datetimeStr) {
  if (!datetimeStr) return '—'
  // Parse as local time by replacing the T separator handling
  const d = parseLocalDate(datetimeStr)
  return d.toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(datetimeStr, allDay) {
  if (!datetimeStr) return '—'
  // Check if the stored string has a time component that's not midnight
  const timePart = datetimeStr.split('T')[1] || ''
  const isActuallyAllDay = allDay || timePart === '' || timePart.startsWith('00:00:00')

  if (isActuallyAllDay) return 'All day'

  const d = parseLocalDate(datetimeStr)
  return d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
}

// Parse datetime string as local time (avoids UTC shift)
function parseLocalDate(datetimeStr) {
  if (!datetimeStr) return new Date()
  // If it ends with Z it's already UTC, parse normally
  if (datetimeStr.endsWith('Z') || datetimeStr.includes('+')) {
    return new Date(datetimeStr)
  }
  // Otherwise treat as local time
  const [datePart, timePart] = datetimeStr.split('T')
  if (!timePart) return new Date(datePart + 'T00:00:00')
  return new Date(datePart + 'T' + timePart)
}

function renderEventRow(e, colour) {
  const startDate = e.start_time ? e.start_time.split('T')[0] : ''
  const endDate   = e.end_time ? e.end_time.split('T')[0] : ''
  const dateLabel = endDate && endDate !== startDate
    ? `${formatDate(e.start_time)} – ${formatDate(e.end_time)}`
    : formatDate(e.start_time)

  return `
    <div class="task-row" data-id="${e.id}" onclick="openEventEditModal('${e.id}')">
      <div class="task-check" style="border-color:${colour}80; border-radius:3px; cursor:default;">
        <span style="font-size:9px; color:${colour}80;">📅</span>
      </div>
      <div class="task-title">${e.title}</div>
      <div class="task-col task-deadline">${dateLabel}</div>
      <div class="task-col">${formatTime(e.start_time, e.all_day)}</div>
      <div class="task-col" style="font-size:11px; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${e.location || '—'}
      </div>
    </div>
  `
}

async function openCalAddPopupFromFolder(folderId, workspaceId) {
  const today = new Date().toISOString().split('T')[0]
  await window.openCalAddPopup(today)
  if (window.switchCalTab) window.switchCalTab('event')

  setTimeout(() => {
    const wsSelect = document.getElementById('cal-event-workspace')
    if (wsSelect && workspaceId) {
      wsSelect.value = workspaceId
      if (window.calUpdateEventFolders) window.calUpdateEventFolders(workspaceId)
      setTimeout(() => {
        const fs = document.getElementById('cal-event-folder')
        if (fs) fs.value = folderId
      }, 100)
    }
  }, 150)
}