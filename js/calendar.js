import { supabase } from './supabase.js'

let currentDate = new Date()
let currentView = 'month'

export function initCalendar() {
  renderCalendar()
}

async function renderCalendar() {
  const main = document.getElementById('main-content')

  main.innerHTML = `
    <div class="calendar-view">
      <div class="calendar-header">
        <div class="calendar-nav">
          <button class="cal-nav-btn" onclick="calPrev()">‹</button>
          <span class="cal-title" id="cal-title"></span>
          <button class="cal-nav-btn" onclick="calNext()">›</button>
          <button class="cal-nav-btn cal-today-btn" onclick="calToday()">Today</button>
        </div>
        <div class="cal-view-tabs">
          <button class="cal-view-btn ${currentView === 'month' ? 'active' : ''}" onclick="setCalView('month')">Month</button>
          <button class="cal-view-btn ${currentView === 'week' ? 'active' : ''}" onclick="setCalView('week')">Week</button>
          <button class="cal-view-btn ${currentView === 'day' ? 'active' : ''}" onclick="setCalView('day')">Day</button>
        </div>
      </div>
      <div class="calendar-legend" id="cal-legend"></div>
      <div class="calendar-body" id="calendar-body">
        <div class="cal-loading">Loading...</div>
      </div>
    </div>
  `

  await loadCalendarData()
}

async function loadCalendarData() {
  const { start, end } = getDateRange()
  const startStr = start.toISOString().split('T')[0]
  const endStr   = end.toISOString().split('T')[0]

  const [tasksRes, eventsRes, holidaysRes, workspacesRes, habitsRes, completionsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, folders(workspace_id, workspaces(colour, name))')
      .not('due_date', 'is', null)
      .gte('due_date', startStr)
      .lte('due_date', endStr)
      .eq('done', false),
    supabase
      .from('events')
      .select('*, workspaces(colour)')
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString()),
    supabase
      .from('public_holidays')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr),
    supabase
      .from('workspaces')
      .select('name, colour')
      .order('position'),
    supabase
      .from('habits')
      .select('*')
      .order('position'),
    // Fetch habit completions for the entire range
    supabase
      .from('habit_completions')
      .select('habit_id, completed_date')
      .gte('completed_date', startStr)
      .lte('completed_date', endStr)
  ])

  renderLegend(workspacesRes.data || [])

  const habits     = habitsRes.data || []
  const completions = completionsRes.data || []

  // Build a set of "habitId|date" for quick lookup
  const completedSet = new Set(completions.map(c => `${c.habit_id}|${c.completed_date}`))

  if (currentView === 'month') {
    renderMonthView(tasksRes.data || [], eventsRes.data || [], holidaysRes.data || [], habits, completedSet)
  } else if (currentView === 'week') {
    renderWeekView(tasksRes.data || [], eventsRes.data || [], holidaysRes.data || [], habits, completedSet)
  } else {
    renderDayView(tasksRes.data || [], eventsRes.data || [], holidaysRes.data || [], habits, completedSet)
  }
}

function getDateRange() {
  if (currentView === 'month') {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const end   = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
    return { start, end }
  } else if (currentView === 'week') {
    const day  = currentDate.getDay()
    const diff = (day === 0 ? -6 : 1 - day)
    const start = new Date(currentDate)
    start.setDate(currentDate.getDate() + diff)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start, end }
  } else {
    return { start: currentDate, end: currentDate }
  }
}

function renderLegend(workspaces) {
  const legend = document.getElementById('cal-legend')
  if (!legend) return

  legend.innerHTML = workspaces.map(ws => `
    <div class="cal-legend-item">
      <span class="cal-legend-dot" style="background:${ws.colour}"></span>
      <span>${ws.name}</span>
    </div>
  `).join('') + `
    <div class="cal-legend-item">
      <span class="cal-legend-dot" style="background:#7a6e58;"></span>
      <span>Habit</span>
    </div>
    <div class="cal-legend-item">
      <span class="cal-legend-dot cal-legend-dot--holiday"></span>
      <span>Holiday</span>
    </div>
  `
}

function renderMonthView(tasks, events, holidays, habits, completedSet) {
  const body  = document.getElementById('calendar-body')
  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()

  document.getElementById('cal-title').textContent =
    currentDate.toLocaleDateString('no-NO', { month: 'long', year: 'numeric' })

  const dayMap      = buildDayMap(tasks, events, holidays, habits, completedSet)
  const firstDay    = new Date(year, month, 1)
  const startPad    = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today       = new Date().toISOString().split('T')[0]

  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  }

  let html = `
    <div class="cal-month-grid">
      <div class="cal-week-label"></div>
      <div class="cal-day-label">Mon</div>
      <div class="cal-day-label">Tue</div>
      <div class="cal-day-label">Wed</div>
      <div class="cal-day-label">Thu</div>
      <div class="cal-day-label">Fri</div>
      <div class="cal-day-label">Sat</div>
      <div class="cal-day-label">Sun</div>
  `

  let dayCount = 1
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7

  for (let i = 0; i < totalCells; i++) {
    if (i % 7 === 0) {
      const cellDate = new Date(year, month, dayCount - startPad + i)
      html += `<div class="cal-week-num">${getWeekNumber(cellDate)}</div>`
    }

    if (i < startPad || dayCount > daysInMonth) {
      html += `<div class="cal-cell cal-cell--empty"></div>`
    } else {
      const dateStr   = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCount).padStart(2, '0')}`
      const isToday   = dateStr === today
      const items     = dayMap[dateStr] || []
      const isHoliday = items.some(i => i.type === 'holiday')

      html += `
        <div class="cal-cell ${isToday ? 'cal-cell--today' : ''} ${isHoliday ? 'cal-cell--holiday' : ''}"
             data-date="${dateStr}">
          <div class="cal-cell-num">${dayCount}</div>
          <div class="cal-cell-items">
            ${items.slice(0, 3).map(item => renderCalItem(item)).join('')}
            ${items.length > 3 ? `<div class="cal-more">+${items.length - 3} more</div>` : ''}
          </div>
        </div>
      `
      dayCount++
    }
  }

  html += '</div>'
  body.innerHTML = html
}

function renderWeekView(tasks, events, holidays, habits, completedSet) {
  const body     = document.getElementById('calendar-body')
  const { start } = getDateRange()
  const today    = new Date().toISOString().split('T')[0]
  const dayMap   = buildDayMap(tasks, events, holidays, habits, completedSet)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }

  document.getElementById('cal-title').textContent =
    `${days[0].toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })} — ${days[6].toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' })}`

  let html = '<div class="cal-week-grid">'

  days.forEach((day, i) => {
    const dateStr = day.toISOString().split('T')[0]
    const isToday = dateStr === today
    const items   = dayMap[dateStr] || []

    html += `
      <div class="cal-week-col ${isToday ? 'cal-week-col--today' : ''}">
        <div class="cal-week-col-header">
          <span class="cal-week-day-name">${dayNames[i]}</span>
          <span class="cal-week-day-num ${isToday ? 'cal-week-day-num--today' : ''}">${day.getDate()}</span>
        </div>
        <div class="cal-week-col-items">
          ${items.map(item => renderCalItem(item)).join('')}
        </div>
      </div>
    `
  })

  html += '</div>'
  body.innerHTML = html
}

// ── DAY VIEW — 24 HOUR TIMELINE ───────────────────────────
function renderDayView(tasks, events, holidays, habits, completedSet) {
  const body    = document.getElementById('calendar-body')
  const dateStr = currentDate.toISOString().split('T')[0]
  const allItems = (buildDayMap(tasks, events, holidays, habits, completedSet))[dateStr] || []

  document.getElementById('cal-title').textContent =
    currentDate.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // All-day items (habits, holidays, tasks without time)
  const allDayItems = allItems.filter(i => !i.time)
  // Timed items (events with a specific time)
  const timedItems  = allItems.filter(i => i.time)

  // Build 24 hour slots
  const hours = Array.from({ length: 24 }, (_, i) => i)

  let html = '<div class="cal-day-timeline">'

  // All-day section
  if (allDayItems.length > 0) {
    html += `
      <div class="cal-day-allday">
        <div class="cal-day-allday-label">All day</div>
        <div class="cal-day-allday-items">
          ${allDayItems.map(item => `
            <div class="cal-day-allday-item ${item.done ? 'cal-item--done' : ''}"
                 style="border-left-color:${item.colour}; color:${item.colour}">
              ${item.title}
            </div>
          `).join('')}
        </div>
      </div>
    `
  }

  // Hour rows
  html += '<div class="cal-day-hours">'

  hours.forEach(h => {
    const timeStr  = `${String(h).padStart(2, '0')}:00`
    const nextTime = `${String(h + 1).padStart(2, '0')}:00`
    const slotItems = timedItems.filter(i => i.time >= timeStr && i.time < nextTime)
    const isNow = new Date().getHours() === h && dateStr === new Date().toISOString().split('T')[0]

    html += `
      <div class="cal-hour-row ${isNow ? 'cal-hour-row--now' : ''}">
        <div class="cal-hour-label">${timeStr}</div>
        <div class="cal-hour-content">
          ${isNow ? '<div class="cal-now-line"></div>' : ''}
          ${slotItems.map(item => `
            <div class="cal-timed-item" style="border-left-color:${item.colour}; color:${item.colour}">
              <span class="cal-timed-time">${item.time}</span>
              ${item.title}
            </div>
          `).join('')}
        </div>
      </div>
    `
  })

  html += '</div></div>'
  body.innerHTML = html

  // Scroll to current hour
  const nowRow = body.querySelector('.cal-hour-row--now')
  if (nowRow) {
    setTimeout(() => nowRow.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }
}

// ── BUILD DAY MAP ─────────────────────────────────────────
function buildDayMap(tasks, events, holidays, habits, completedSet) {
  const map = {}

  const add = (dateStr, item) => {
    if (!map[dateStr]) map[dateStr] = []
    map[dateStr].push(item)
  }

  tasks.forEach(t => {
    if (!t.due_date) return
    const overdue = new Date(t.due_date) < new Date(new Date().toDateString())
    const colour  = overdue
      ? '#b05050'
      : (t.folders?.workspaces?.colour || t.workspaces?.colour || '#c9a96e')
    add(t.due_date, { type: 'task', title: t.title, colour, overdue })
  })

  events.forEach(e => {
    const dateStr = e.start_time.split('T')[0]
    add(dateStr, {
      type:   'event',
      title:  e.title,
      colour: e.workspaces?.colour || '#a85888',
      time:   new Date(e.start_time).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
    })
  })

  holidays.forEach(h => {
    add(h.date, { type: 'holiday', title: h.name, colour: '#4a4538' })
  })

  const { start, end } = getDateRange()
  const dayOfWeekMap   = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  habits.forEach(h => {
    const d = new Date(start)
    while (d <= end) {
      const dow     = dayOfWeekMap[d.getDay()]
      const dateStr = d.toISOString().split('T')[0]
      let scheduled = false

      if (h.frequency === 'daily') {
        scheduled = true
      } else if (h.frequency === 'weekdays') {
        scheduled = !['sat', 'sun'].includes(dow)
      } else if (h.frequency === 'weekends') {
        scheduled = ['sat', 'sun'].includes(dow)
      } else {
        scheduled = h.frequency.split(',').includes(dow)
      }

      if (scheduled) {
        const done = completedSet.has(`${h.id}|${dateStr}`)
        add(dateStr, {
          type:   'habit',
          title:  h.name,
          colour: '#7a6e58',
          done
        })
      }

      d.setDate(d.getDate() + 1)
    }
  })

  return map
}

function renderCalItem(item) {
  return `
    <div class="cal-item cal-item--${item.type} ${item.overdue ? 'cal-item--overdue' : ''} ${item.done ? 'cal-item--done' : ''}"
         style="border-left-color:${item.colour}; color:${item.colour}">
      ${item.title}
    </div>
  `
}

window.calPrev = function() {
  if (currentView === 'month') {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
  } else if (currentView === 'week') {
    currentDate.setDate(currentDate.getDate() - 7)
  } else {
    currentDate.setDate(currentDate.getDate() - 1)
  }
  loadCalendarData()
}

window.calNext = function() {
  if (currentView === 'month') {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
  } else if (currentView === 'week') {
    currentDate.setDate(currentDate.getDate() + 7)
  } else {
    currentDate.setDate(currentDate.getDate() + 1)
  }
  loadCalendarData()
}

window.calToday = function() {
  currentDate = new Date()
  loadCalendarData()
}

window.setCalView = function(view) {
  currentView = view
  renderCalendar()
}