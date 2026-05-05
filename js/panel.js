import { supabase } from './supabase.js'

export function initPanel() {
  const panel       = document.getElementById('right-panel')
  const panelTab    = document.getElementById('panel-tab')
  const panelToggle = document.getElementById('panel-toggle')

  function openPanel() {
    panel.classList.remove('hide')
    panelTab.classList.remove('show')
    loadPanelContent()
  }

  function closePanel() {
    panel.classList.add('hide')
    panelTab.classList.add('show')
  }

  panelToggle.addEventListener('click', () => {
    panel.classList.contains('hide') ? openPanel() : closePanel()
  })

  panelTab.addEventListener('click', openPanel)
}

async function loadPanelContent() {
  const panelContent = document.querySelector('.panel-content')
  if (!panelContent) return

  const today   = new Date().toISOString().split('T')[0]
  const dayName = new Date().toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'short' })

  panelContent.innerHTML = `
    <div class="panel-date">${dayName}</div>
    <div class="panel-section">
      <div class="panel-section-title">Events today</div>
      <div id="panel-events"><div class="panel-loading">Loading...</div></div>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Tasks due today</div>
      <div id="panel-tasks"><div class="panel-loading">Loading...</div></div>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Habits</div>
      <div id="panel-habits"><div class="panel-loading">Loading...</div></div>
    </div>
  `

  loadPanelEvents(today)
  loadPanelTasks(today)
  loadPanelHabits(today)
}

// ── TODAY'S EVENTS ────────────────────────────────────────
async function loadPanelEvents(today) {
  const todayStart = today + 'T00:00:00'
  const todayEnd   = today + 'T23:59:59'

  const { data: events } = await supabase
    .from('events')
    .select('*, folders(workspaces(name, colour)), workspaces(name, colour)')
    .or(`and(start_time.lte.${todayEnd},end_time.gte.${todayStart}),and(start_time.gte.${todayStart},start_time.lte.${todayEnd})`)
    .order('start_time')

  const el = document.getElementById('panel-events')
  if (!el) return

  if (!events || events.length === 0) {
    el.innerHTML = '<div class="panel-empty">No events today</div>'
    return
  }

  el.innerHTML = events.map(e => {
    const colour = e.folders?.workspaces?.colour || e.workspaces?.colour || '#a85888'
    const ws     = e.folders?.workspaces?.name   || e.workspaces?.name   || ''
    const time   = e.all_day
      ? 'All day'
      : new Date(e.start_time).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })

    return `
      <div class="panel-task-item" style="border-left-color:${colour}40; cursor:pointer;"
           onclick="openEventEditModal('${e.id}')">
        <div class="panel-task-body">
          <div class="panel-task-title">${e.title}</div>
          <div class="panel-task-ws">${time}${ws ? ' · ' + ws : ''}</div>
        </div>
      </div>
    `
  }).join('')
}

// ── TODAY'S TASKS ─────────────────────────────────────────
async function loadPanelTasks(today) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, folders(workspaces(name, colour))')
    .eq('due_date', today)
    .eq('done', false)
    .order('position')

  const el = document.getElementById('panel-tasks')
  if (!el) return

  if (!tasks || tasks.length === 0) {
    el.innerHTML = '<div class="panel-empty">No tasks due today</div>'
    return
  }

  el.innerHTML = tasks.map(t => {
    const colour = t.folders?.workspaces?.colour || '#c9a96e'
    const ws     = t.folders?.workspaces?.name || ''
    return `
      <div class="panel-task-item" style="border-left-color:${colour}40"
           onclick="openTaskEdit('${t.id}')">
        <div class="panel-task-check"
             style="border-color:${colour}60"
             onclick="event.stopPropagation(); panelToggleTask('${t.id}', this, '${colour}')">
        </div>
        <div class="panel-task-body">
          <div class="panel-task-title">${t.title}</div>
          ${ws ? `<div class="panel-task-ws">${ws}</div>` : ''}
        </div>
      </div>
    `
  }).join('')
}

window.panelToggleTask = async function(taskId, checkEl, colour) {
  checkEl.textContent = '✓'
  checkEl.style.background = colour + '30'
  checkEl.style.borderColor = colour

  await supabase
    .from('tasks')
    .update({ done: true, completed_at: new Date().toISOString() })
    .eq('id', taskId)

  const item = checkEl.closest('.panel-task-item')
  if (item) {
    item.style.transition = 'opacity 0.4s'
    item.style.opacity = '0'
    setTimeout(() => {
      item.remove()
      const el = document.getElementById('panel-tasks')
      if (el && el.children.length === 0) {
        el.innerHTML = '<div class="panel-empty">No tasks due today</div>'
      }
    }, 400)
  }
}

// ── TODAY'S HABITS ────────────────────────────────────────
async function loadPanelHabits(today) {
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()

  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .order('position')

  const el = document.getElementById('panel-habits')
  if (!el) return

  if (!habits || habits.length === 0) {
    el.innerHTML = '<div class="panel-empty">No habits yet</div>'
    return
  }

  const todayHabits = habits.filter(h => {
    if (h.frequency === 'daily') return true
    if (h.frequency === 'weekdays') return !['sat', 'sun'].includes(dayOfWeek)
    if (h.frequency === 'weekends') return ['sat', 'sun'].includes(dayOfWeek)
    return h.frequency.split(',').includes(dayOfWeek)
  })

  if (todayHabits.length === 0) {
    el.innerHTML = '<div class="panel-empty">No habits scheduled today</div>'
    return
  }

  const { data: completions } = await supabase
    .from('habit_completions')
    .select('habit_id')
    .eq('completed_date', today)

  const completedIds = new Set((completions || []).map(c => c.habit_id))

  el.innerHTML = todayHabits.map(h => {
    const done = completedIds.has(h.id)
    return `
      <div class="panel-habit-item ${done ? 'done' : ''}" id="ph-${h.id}">
        <div class="panel-habit-check ${done ? 'done' : ''}"
             onclick="panelToggleHabit('${h.id}', '${today}')">
          ${done ? '✓' : ''}
        </div>
        <div class="panel-habit-body">
          <div class="panel-habit-title ${done ? 'done' : ''}">${h.name}</div>
          ${h.streak > 0 ? `<div class="panel-habit-streak">🔥 ${h.streak}</div>` : ''}
        </div>
      </div>
    `
  }).join('')
}

window.panelToggleHabit = async function(habitId, today) {
  const item    = document.getElementById('ph-' + habitId)
  const checkEl = item?.querySelector('.panel-habit-check')
  const titleEl = item?.querySelector('.panel-habit-title')
  const isDone  = checkEl?.classList.contains('done')

  if (isDone) {
    await supabase
      .from('habit_completions')
      .delete()
      .eq('habit_id', habitId)
      .eq('completed_date', today)

    checkEl.classList.remove('done')
    checkEl.textContent = ''
    titleEl?.classList.remove('done')
    item?.classList.remove('done')
  } else {
    await supabase
      .from('habit_completions')
      .insert({ habit_id: habitId, completed_date: today })

    checkEl.classList.add('done')
    checkEl.textContent = '✓'
    titleEl?.classList.add('done')
    item?.classList.add('done')
  }

  if (document.querySelector('.habits-view')) {
    if (window.initHabits) window.initHabits()
  }
}