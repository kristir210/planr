import { supabase } from './supabase.js'

const EDGE_FUNCTION_URL = 'https://dwsbqpuzqunkqratdixj.supabase.co/functions/v1/ics-proxy'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3c2JxcHV6cXVua3FyYXRkaXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDYxODYsImV4cCI6MjA5Mjg4MjE4Nn0.DGakTMxOo-z627ux2onb6V4UjkuDueObgHS5Ap6Xcsw'

export function initSettings() {
  const btn = document.getElementById('settings-btn')
  if (btn) btn.addEventListener('click', openSettings)
}

async function openSettings() {
  document.getElementById('settings-panel')?.remove()

  const [workspacesRes, foldersRes, subsRes] = await Promise.all([
    supabase.from('workspaces').select('id, name, colour').order('position'),
    supabase.from('folders').select('id, name, workspace_id, type').eq('type', 'events').order('name'),
    supabase.from('calendar_subscriptions').select('*').order('created_at', { ascending: false })
  ])

  const workspaces = workspacesRes.data || []
  const folders    = foldersRes.data || []
  const subs       = subsRes.data || []

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

      <!-- OUTLOOK SUBSCRIPTIONS -->
      <div class="settings-section">
        <div class="settings-section-title">Outlook calendar</div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Add calendar subscription</div>
            <div class="settings-row-desc">Paste your Outlook ICS URL to sync your calendar</div>
          </div>
          <button class="settings-btn" onclick="showAddSubscriptionForm()">Add</button>
        </div>

        <div id="add-sub-form" style="display:none;" class="settings-import-form">
          <div class="edit-field">
            <label class="edit-label">Calendar name</label>
            <input class="popup-input" id="sub-name" placeholder="e.g. Work calendar" />
          </div>
          <div class="edit-field">
            <label class="edit-label">ICS URL</label>
            <input class="popup-input" id="sub-url" placeholder="https://outlook.office365.com/owa/calendar/..." />
          </div>
          <div class="edit-row">
            <div class="edit-field">
              <label class="edit-label">Workspace</label>
              <select class="popup-input" id="sub-workspace" onchange="subUpdateFolders(this.value)">
                <option value="">Select workspace...</option>
                ${workspaces.map(ws => `<option value="${ws.id}">${ws.name}</option>`).join('')}
              </select>
            </div>
            <div class="edit-field">
              <label class="edit-label">Events folder</label>
              <select class="popup-input" id="sub-folder">
                <option value="">Select folder...</option>
              </select>
            </div>
          </div>
          <div class="settings-import-actions">
            <button class="popup-btn" onclick="hideAddSubscriptionForm()">Cancel</button>
            <button class="popup-btn popup-btn--primary" onclick="saveSubscription()">Save & sync</button>
          </div>
        </div>

        <!-- Existing subscriptions -->
        <div id="subs-list">
          ${subs.length === 0
            ? '<div class="settings-empty">No calendar subscriptions yet</div>'
            : subs.map(sub => renderSubRow(sub)).join('')
          }
        </div>
      </div>

      <!-- SECURITY -->
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

function renderSubRow(sub) {
  const lastSynced = sub.last_synced_at
    ? new Date(sub.last_synced_at).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never synced'

  return `
    <div class="settings-import-row" id="sub-row-${sub.id}">
      <div class="settings-row-label">
        <div class="settings-row-name">${sub.name}</div>
        <div class="settings-row-desc">
          ${sub.event_count} event${sub.event_count !== 1 ? 's' : ''} · Last synced: ${lastSynced}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="settings-btn" onclick="syncSubscription('${sub.id}', '${sub.name}')">Sync</button>
        <button class="settings-btn settings-btn--danger" onclick="deleteSubscription('${sub.id}', '${sub.name}')">Delete</button>
      </div>
    </div>
  `
}

window.closeSettings = function() {
  const panel = document.getElementById('settings-panel')
  if (!panel) return
  const drawer = panel.querySelector('.settings-drawer')
  drawer.classList.remove('open')
  setTimeout(() => panel.remove(), 250)
}

// ── ADD SUBSCRIPTION FORM ─────────────────────────────────
window.showAddSubscriptionForm = function() {
  document.getElementById('add-sub-form').style.display = 'flex'
  document.getElementById('add-sub-form').style.flexDirection = 'column'
  document.getElementById('add-sub-form').style.gap = '10px'
}

window.hideAddSubscriptionForm = function() {
  document.getElementById('add-sub-form').style.display = 'none'
  document.getElementById('sub-name').value = ''
  document.getElementById('sub-url').value = ''
}

window.subUpdateFolders = function(workspaceId) {
  const panel   = document.getElementById('settings-panel')
  const folders = (panel?._folders || []).filter(f => f.workspace_id === workspaceId)
  document.getElementById('sub-folder').innerHTML =
    '<option value="">Select folder...</option>' +
    folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
}

window.saveSubscription = async function() {
  const name        = document.getElementById('sub-name').value.trim()
  const url         = document.getElementById('sub-url').value.trim()
  const workspaceId = document.getElementById('sub-workspace').value || null
  const folderId    = document.getElementById('sub-folder').value || null

  if (!name)     { alert('Please enter a name.'); return }
  if (!url)      { alert('Please enter the ICS URL.'); return }
  if (!folderId) { alert('Please select an events folder.'); return }

  // Save subscription first
  const { data: sub, error } = await supabase
    .from('calendar_subscriptions')
    .insert({ name, ics_url: url, folder_id: folderId, workspace_id: workspaceId })
    .select()
    .single()

  if (error) { alert('Error saving subscription: ' + error.message); return }

  hideAddSubscriptionForm()

  // Add row to UI immediately
  const list = document.getElementById('subs-list')
  const empty = list.querySelector('.settings-empty')
  if (empty) empty.remove()
  list.insertAdjacentHTML('beforeend', renderSubRow(sub))

  // Trigger first sync
  await syncSubscription(sub.id, sub.name)
}

// ── SYNC SUBSCRIPTION ─────────────────────────────────────
window.syncSubscription = async function(subId, subName) {
  const btn = document.querySelector(`#sub-row-${subId} .settings-btn:not(.settings-btn--danger)`)
  if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true }

  try {
    // Fetch the subscription details
    const { data: sub } = await supabase
      .from('calendar_subscriptions')
      .select('*')
      .eq('id', subId)
      .single()

    if (!sub) throw new Error('Subscription not found')

    // Fetch ICS via edge function proxy
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`
      },
      body: JSON.stringify({ url: sub.ics_url })
    })

    const result = await response.json()
    if (result.error) throw new Error(result.error)

    // Parse the ICS
    const events = parseIcs(result.ics)

    // Delete existing events from this subscription
    await supabase.from('events').delete().eq('subscription_id', subId)

    // Insert new events in batches
    if (events.length > 0) {
      const rows = events.map(e => ({
        title:           e.title,
        start_time:      e.startISO,
        end_time:        e.endISO || e.startISO,
        all_day:         e.allDay,
        location:        e.location || null,
        folder_id:       sub.folder_id,
        workspace_id:    sub.workspace_id,
        subscription_id: subId
      }))

      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from('events').insert(rows.slice(i, i + 50))
        if (error) throw new Error(error.message)
      }
    }

    // Update subscription record
    await supabase
      .from('calendar_subscriptions')
      .update({ last_synced_at: new Date().toISOString(), event_count: events.length })
      .eq('id', subId)

    // Update UI
    const descEl = document.querySelector(`#sub-row-${subId} .settings-row-desc`)
    if (descEl) {
      const now = new Date().toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      descEl.textContent = `${events.length} event${events.length !== 1 ? 's' : ''} · Last synced: ${now}`
    }

    if (btn) { btn.textContent = 'Sync'; btn.disabled = false }
    alert(`✓ Synced ${events.length} events from "${subName}"`)

  } catch (err) {
    if (btn) { btn.textContent = 'Sync'; btn.disabled = false }
    alert('Sync failed: ' + err.message)
  }
}

// ── DELETE SUBSCRIPTION ───────────────────────────────────
window.deleteSubscription = async function(subId, subName) {
  if (!confirm(`Delete "${subName}" and all its events?`)) return

  await supabase.from('events').delete().eq('subscription_id', subId)
  await supabase.from('calendar_subscriptions').delete().eq('id', subId)

  document.getElementById('sub-row-' + subId)?.remove()

  const list = document.getElementById('subs-list')
  if (list && !list.querySelector('.settings-import-row')) {
    list.innerHTML = '<div class="settings-empty">No calendar subscriptions yet</div>'
  }
}

// ── ICS PARSER ────────────────────────────────────────────
function parseIcs(text) {
  const lines  = unfoldLines(text)
  const events = []
  let current  = null
  let tzOffset = 120 // Default to UTC+2 (Norway summer time)

  // Try to extract timezone offset from VTIMEZONE
  for (const line of lines) {
    if (line.startsWith('TZOFFSETFROM:') || line.startsWith('TZOFFSETTO:')) {
      const val = line.split(':')[1]?.trim()
      if (val) {
        const sign = val.startsWith('-') ? -1 : 1
        const h    = parseInt(val.substring(1, 3))
        const m    = parseInt(val.substring(3, 5))
        tzOffset   = sign * (h * 60 + m)
      }
    }
  }

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
    } else if (line === 'END:VEVENT') {
      if (current && current.title) {
        const ev = formatEvent(current, tzOffset)
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

function formatEvent(raw, tzOffset) {
  if (!raw.dtstart) return null
  const start = parseIcsDateTime(raw.dtstart.raw, raw.dtstart.params, tzOffset)
  const end   = raw.dtend ? parseIcsDateTime(raw.dtend.raw, raw.dtend.params, tzOffset) : start
  if (!start.iso) return null

  return {
    title:    raw.title || 'Untitled',
    startISO: start.iso,
    endISO:   end.iso,
    allDay:   start.allDay,
    location: raw.location || null
  }
}

function parseIcsDateTime(raw, params, tzOffset) {
  raw = raw.trim()

  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(raw) || params.includes('VALUE=DATE')) {
    const y = raw.substring(0,4), m = raw.substring(4,6), d = raw.substring(6,8)
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true }
  }

  // UTC: YYYYMMDDTHHMMSSZ — convert to local
  if (/^\d{8}T\d{6}Z$/.test(raw)) {
    const utc = new Date(
      `${raw.substring(0,4)}-${raw.substring(4,6)}-${raw.substring(6,8)}` +
      `T${raw.substring(9,11)}:${raw.substring(11,13)}:${raw.substring(13,15)}Z`
    )
    return { iso: toLocalISOString(utc), allDay: false }
  }

  // Timezone-named: YYYYMMDDTHHMMSS (with TZID param) — apply tzOffset
  if (/^\d{8}T\d{6}$/.test(raw)) {
    const y = raw.substring(0,4), mo = raw.substring(4,6), d = raw.substring(6,8)
    const h = raw.substring(9,11), mi = raw.substring(11,13), s = raw.substring(13,15)

    if (params.includes('TZID=')) {
      // It's a local time in the named timezone — convert to UTC then to local
      const localMs  = Date.UTC(+y, +mo-1, +d, +h, +mi, +s) - tzOffset * 60000
      const utcDate  = new Date(localMs)
      return { iso: toLocalISOString(utcDate), allDay: false }
    }

    // Floating local time
    return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}`, allDay: false }
  }

  return { iso: null, allDay: false }
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
window.openSettings = openSettings