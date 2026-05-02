import { supabase } from './supabase.js'

export function initSettings() {
  const btn = document.getElementById('settings-btn')
  if (btn) btn.addEventListener('click', openSettings)
}

async function openSettings() {
  document.getElementById('settings-panel')?.remove()

  const [workspacesRes, foldersRes, importsRes] = await Promise.all([
    supabase.from('workspaces').select('id, name, colour').order('position'),
    supabase.from('folders').select('id, name, workspace_id, type').eq('type', 'events').order('name'),
    supabase.from('imports').select('*').order('imported_at', { ascending: false })
  ])

  const workspaces = workspacesRes.data || []
  const folders    = foldersRes.data || []
  const imports    = importsRes.data || []

  const panel = document.createElement('div')
  panel.id = 'settings-panel'
  panel.className = 'settings-panel'
  panel._folders = folders
  panel.innerHTML = `
    <div class="settings-overlay" onclick="closeSettings()"></div>
    <div class="settings-drawer">
      <div class="settings-header">
        <span class="settings-title">Settings</span>
        <button class="popup-close" onclick="closeSettings()">✕</button>
      </div>

      <!-- IMPORT SECTION -->
      <div class="settings-section">
        <div class="settings-section-title">Import</div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Import ICS file</div>
            <div class="settings-row-desc">Import a calendar (.ics) file into an events folder</div>
          </div>
          <button class="settings-btn" onclick="triggerIcsImport()">Import</button>
        </div>
        <input type="file" id="ics-file-input" accept=".ics" style="display:none" />

        <div class="settings-import-form" id="ics-import-form" style="display:none;">
          <div class="edit-field">
            <label class="edit-label">Workspace</label>
            <select class="popup-input" id="ics-workspace" onchange="icsUpdateFolders(this.value)">
              <option value="">Select workspace...</option>
              ${workspaces.map(ws => `<option value="${ws.id}">${ws.name}</option>`).join('')}
            </select>
          </div>
          <div class="edit-field">
            <label class="edit-label">Events folder</label>
            <select class="popup-input" id="ics-folder">
              <option value="">Select folder...</option>
            </select>
          </div>
          <div id="ics-preview" class="ics-preview" style="display:none;"></div>
          <div class="settings-import-actions">
            <button class="popup-btn" onclick="cancelIcsImport()">Cancel</button>
            <button class="popup-btn popup-btn--primary" id="ics-import-btn"
                    onclick="confirmIcsImport()" style="display:none;">Import events</button>
          </div>
        </div>
      </div>

      <!-- MANAGE IMPORTS SECTION -->
      <div class="settings-section" id="imports-section">
        <div class="settings-section-title">Imported calendars</div>
        ${imports.length === 0
          ? `<div class="settings-empty">No imports yet</div>`
          : imports.map(imp => `
            <div class="settings-import-row" id="imp-row-${imp.id}">
              <div class="settings-row-label">
                <div class="settings-row-name">${imp.name}</div>
                <div class="settings-row-desc">
                  ${imp.event_count} event${imp.event_count !== 1 ? 's' : ''} ·
                  ${new Date(imp.imported_at).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <button class="settings-btn settings-btn--danger" onclick="deleteImport('${imp.id}', '${imp.name}')">Delete</button>
            </div>
          `).join('')
        }
      </div>

      <!-- SECURITY SECTION -->
      <div class="settings-section">
        <div class="settings-section-title">Security</div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Change PIN</div>
            <div class="settings-row-desc">Update your 6-digit PIN</div>
          </div>
          <button class="settings-btn" onclick="openChangePinForm()">Change</button>
        </div>
        <div id="change-pin-form" style="display:none; margin-top:8px;">
          <div class="edit-row">
            <div class="edit-field">
              <label class="edit-label">New PIN</label>
              <input class="popup-input" id="new-pin-input" type="password" maxlength="6" placeholder="6 digits" />
            </div>
            <div class="edit-field">
              <label class="edit-label">Confirm PIN</label>
              <input class="popup-input" id="confirm-pin-input" type="password" maxlength="6" placeholder="6 digits" />
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="popup-btn" onclick="cancelPinChange()">Cancel</button>
            <button class="popup-btn popup-btn--primary" onclick="saveNewPin()">Save PIN</button>
          </div>
        </div>
      </div>

    </div>
  `

  document.body.appendChild(panel)
  requestAnimationFrame(() => panel.querySelector('.settings-drawer').classList.add('open'))
}

window.closeSettings = function() {
  const panel = document.getElementById('settings-panel')
  if (!panel) return
  const drawer = panel.querySelector('.settings-drawer')
  drawer.classList.remove('open')
  setTimeout(() => panel.remove(), 250)
}

// ── DELETE IMPORT ─────────────────────────────────────────
window.deleteImport = async function(importId, importName) {
  if (!confirm(`Delete all events from "${importName}"?`)) return

  // Deleting the import row cascades to set import_id = null on events
  // So we first delete the events, then the import row
  const { error: evErr } = await supabase
    .from('events')
    .delete()
    .eq('import_id', importId)

  if (evErr) { alert('Error deleting events: ' + evErr.message); return }

  const { error: impErr } = await supabase
    .from('imports')
    .delete()
    .eq('id', importId)

  if (impErr) { alert('Error deleting import: ' + impErr.message); return }

  // Remove row from UI
  document.getElementById('imp-row-' + importId)?.remove()

  // Show empty state if no imports left
  const section = document.getElementById('imports-section')
  if (section && !section.querySelector('.settings-import-row')) {
    const existing = section.querySelector('.settings-empty')
    if (!existing) {
      const empty = document.createElement('div')
      empty.className = 'settings-empty'
      empty.textContent = 'No imports yet'
      section.appendChild(empty)
    }
  }
}

// ── ICS IMPORT ────────────────────────────────────────────
let parsedIcsEvents = []
let currentFileName  = ''

window.triggerIcsImport = function() {
  const input = document.getElementById('ics-file-input')
  input.onchange = handleIcsFile
  input.click()
}

function handleIcsFile(e) {
  const file = e.target.files[0]
  if (!file) return
  currentFileName = file.name

  const reader = new FileReader()
  reader.onload = (ev) => {
    parsedIcsEvents = parseIcs(ev.target.result)
    showIcsForm(parsedIcsEvents.length)
  }
  reader.readAsText(file)
  e.target.value = ''
}

function showIcsForm(count) {
  const form      = document.getElementById('ics-import-form')
  const preview   = document.getElementById('ics-preview')
  const importBtn = document.getElementById('ics-import-btn')

  form.style.display = 'flex'
  preview.style.display = 'block'
  preview.innerHTML = `
    <div class="ics-preview-count">
      <strong>${currentFileName}</strong> — ${count} event${count !== 1 ? 's' : ''}
    </div>
    <div class="ics-preview-list">
      ${parsedIcsEvents.slice(0, 5).map(e => `
        <div class="ics-preview-item">
          <span class="ics-preview-title">${e.title}</span>
          <span class="ics-preview-date">${e.displayDate}${e.displayTime ? ' ' + e.displayTime : ''}</span>
        </div>
      `).join('')}
      ${parsedIcsEvents.length > 5 ? `<div class="ics-preview-more">...and ${parsedIcsEvents.length - 5} more</div>` : ''}
    </div>
  `
  importBtn.style.display = 'inline-flex'
}

window.icsUpdateFolders = function(workspaceId) {
  const panel   = document.getElementById('settings-panel')
  const folders = (panel?._folders || []).filter(f => f.workspace_id === workspaceId)
  const select  = document.getElementById('ics-folder')
  select.innerHTML = '<option value="">Select folder...</option>' +
    folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
}

window.cancelIcsImport = function() {
  document.getElementById('ics-import-form').style.display = 'none'
  document.getElementById('ics-preview').style.display = 'none'
  document.getElementById('ics-import-btn').style.display = 'none'
  parsedIcsEvents = []
  currentFileName = ''
}

window.confirmIcsImport = async function() {
  const folderId    = document.getElementById('ics-folder').value
  const workspaceId = document.getElementById('ics-workspace').value

  if (!folderId)               { alert('Please select an events folder.'); return }
  if (!parsedIcsEvents.length) { alert('No events to import.'); return }

  const btn = document.getElementById('ics-import-btn')
  btn.textContent = 'Importing...'
  btn.disabled = true

  // Create import record first
  const { data: importRecord, error: importErr } = await supabase
    .from('imports')
    .insert({ name: currentFileName, event_count: parsedIcsEvents.length })
    .select()
    .single()

  if (importErr) {
    alert('Error creating import record: ' + importErr.message)
    btn.textContent = 'Import events'
    btn.disabled = false
    return
  }

  const rows = parsedIcsEvents.map(e => ({
    title:        e.title,
    start_time:   e.startISO,
    end_time:     e.endISO || e.startISO,
    all_day:      e.allDay,
    location:     e.location || null,
    folder_id:    folderId,
    workspace_id: workspaceId,
    import_id:    importRecord.id
  }))

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase.from('events').insert(rows.slice(i, i + 50))
    if (error) {
      alert('Import error: ' + error.message)
      // Clean up the import record if events failed
      await supabase.from('imports').delete().eq('id', importRecord.id)
      btn.textContent = 'Import events'
      btn.disabled = false
      return
    }
  }

  btn.textContent = 'Import events'
  btn.disabled = false
  cancelIcsImport()
  closeSettings()
  alert(`✓ Imported ${rows.length} events from "${currentFileName}".`)
}

// ── ICS PARSER ────────────────────────────────────────────
function parseIcs(text) {
  const lines  = unfoldLines(text)
  const events = []
  let current  = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
    } else if (line === 'END:VEVENT') {
      if (current && current.title) {
        const ev = formatEvent(current)
        if (ev) events.push(ev)
      }
      current = null
    } else if (current) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue

      const keyFull = line.substring(0, colonIdx)
      const key     = keyFull.split(';')[0].toUpperCase()
      const params  = keyFull.toUpperCase()
      const val     = line.substring(colonIdx + 1)
        .replace(/\\n/g, '\n').replace(/\\,/g, ',')
        .replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()

      if (key === 'SUMMARY')  current.title    = val
      if (key === 'DTSTART')  current.dtstart  = { raw: val, params }
      if (key === 'DTEND')    current.dtend    = { raw: val, params }
      if (key === 'LOCATION') current.location = val
      if (key === 'RRULE')    current.isRecurring = true
    }
  }

  return events
}

function unfoldLines(text) {
  return text
    .replace(/\r\n[ \t]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim() !== '')
}

function formatEvent(raw) {
  if (!raw.dtstart) return null
  const start = parseIcsDateTime(raw.dtstart.raw, raw.dtstart.params)
  const end   = raw.dtend ? parseIcsDateTime(raw.dtend.raw, raw.dtend.params) : start
  if (!start.iso) return null

  return {
    title:       raw.title || 'Untitled',
    startISO:    start.iso,
    endISO:      end.iso,
    displayDate: start.display,
    displayTime: start.allDay ? '' : start.time,
    allDay:      start.allDay,
    location:    raw.location || null
  }
}

function parseIcsDateTime(raw, params) {
  raw = raw.trim()

  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(raw) || params.includes('VALUE=DATE')) {
    const y = raw.substring(0, 4), m = raw.substring(4, 6), d = raw.substring(6, 8)
    return { iso: `${y}-${m}-${d}T00:00:00`, display: `${d}.${m}.${y}`, time: '', allDay: true }
  }

  // UTC: YYYYMMDDTHHMMSSZ
  if (/^\d{8}T\d{6}Z$/.test(raw)) {
    const utc = new Date(
      `${raw.substring(0,4)}-${raw.substring(4,6)}-${raw.substring(6,8)}` +
      `T${raw.substring(9,11)}:${raw.substring(11,13)}:${raw.substring(13,15)}Z`
    )
    return {
      iso:     toLocalISOString(utc),
      display: utc.toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' }),
      time:    utc.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' }),
      allDay:  false
    }
  }

  // Floating local: YYYYMMDDTHHMMSS
  if (/^\d{8}T\d{6}$/.test(raw)) {
    const y = raw.substring(0,4), mo = raw.substring(4,6), d = raw.substring(6,8)
    const h = raw.substring(9,11), mi = raw.substring(11,13), s = raw.substring(13,15)
    return {
      iso:     `${y}-${mo}-${d}T${h}:${mi}:${s}`,
      display: `${d}.${mo}.${y}`,
      time:    `${h}:${mi}`,
      allDay:  false
    }
  }

  return { iso: null, display: '—', time: '', allDay: false }
}

function toLocalISOString(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}` +
         `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// ── CHANGE PIN ────────────────────────────────────────────
window.openChangePinForm = function() {
  const form = document.getElementById('change-pin-form')
  form.style.display = form.style.display === 'none' ? 'block' : 'none'
}

window.cancelPinChange = function() {
  document.getElementById('change-pin-form').style.display = 'none'
  document.getElementById('new-pin-input').value = ''
  document.getElementById('confirm-pin-input').value = ''
}

window.saveNewPin = async function() {
  const newPin     = document.getElementById('new-pin-input').value.trim()
  const confirmPin = document.getElementById('confirm-pin-input').value.trim()

  if (!/^\d{6}$/.test(newPin)) { alert('PIN must be exactly 6 digits.'); return }
  if (newPin !== confirmPin)    { alert('PINs do not match.'); return }

  const { data: settings } = await supabase
    .from('settings').select('id').order('created_at').limit(1).single()

  if (!settings) { alert('Could not find settings row.'); return }

  await supabase.from('settings').update({ pin_hash: newPin }).eq('id', settings.id)

  cancelPinChange()
  alert('PIN updated successfully.')
}