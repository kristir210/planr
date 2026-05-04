import { supabase } from './supabase.js'

let currentDate = new Date()
let currentView = 'month'
let allWorkspaces = []

const HOUR_HEIGHT = 60

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
  const pad = n => String(n).padStart(2, '0')
  const startStr = `${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`
  const endStr   = `${end.getFullYear()}-${pad(end.getMonth()+1)}-${pad(end.getDate())}`
  const startISO = startStr + 'T00:00:00'
  const endISO   = endStr   + 'T23:59:59'

  const [tasksRes, eventsRes, holidaysRes, workspacesRes, habitsRes, completionsRes] = await Promise.all([
    supabase.from('tasks').select('*, folders(workspace_id, workspaces(colour, name))')
      .not('due_date', 'is', null).gte('due_date', startStr).lte('due_date', endStr).eq('done', false),
    supabase.from('events').select('*, folders(id, name, workspaces(id, colour, name)), workspaces(id, colour, name)')
      .lte('start_time', endISO).gte('end_time', startISO),
    supabase.from('public_holidays').select('*').gte('date', startStr).lte('date', endStr),
    supabase.from('workspaces').select('id, name, colour').order('position'),
    supabase.from('habits').select('*').order('position'),
    supabase.from('habit_completions').select('habit_id, completed_date')
      .gte('completed_date', startStr).lte('completed_date', endStr)
  ])

  allWorkspaces = workspacesRes.data || []
  renderLegend(allWorkspaces)

  const habits      = habitsRes.data || []
  const completions = completionsRes.data || []
  const completedSet = new Set(completions.map(c => `${c.habit_id}|${c.completed_date}`))
  const events      = eventsRes.data || []

  if (currentView === 'month') {
    renderMonthView(tasksRes.data || [], events, holidaysRes.data || [], habits, completedSet)
  } else if (currentView === 'week') {
    renderWeekView(tasksRes.data || [], events, holidaysRes.data || [], habits, completedSet)
  } else {
    renderDayView(tasksRes.data || [], events, holidaysRes.data || [], habits, completedSet)
  }
}

function getEventColour(e) {
  return e.folders?.workspaces?.colour || e.workspaces?.colour || '#a85888'
}

function getLocalTime(datetimeStr) {
  if (!datetimeStr) return null
  const timePart = datetimeStr.split('T')[1]
  if (!timePart) return null
  return timePart.substring(0, 5)
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
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

// ── SORT: chronological, no-time items first by type ─────
function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time)
    if (a.time && !b.time) return 1
    if (!a.time && b.time) return -1
    const order = { holiday: 0, habit: 1, event: 2, task: 3 }
    return (order[a.type] ?? 4) - (order[b.type] ?? 4)
  })
}

function isHabitScheduled(freq, dow, d) {
  if (freq === 'daily') return true
  if (freq === 'weekdays') return !['sat', 'sun'].includes(dow)
  if (freq === 'weekends') return ['sat', 'sun'].includes(dow)
  if (freq.startsWith('interval:')) {
    const parts = freq.split(':')
    const days = parseInt(parts[1])
    const start = parts[2] ? new Date(parts[2]) : new Date()
    const diff = Math.round((d - start) / (1000 * 60 * 60 * 24))
    return diff >= 0 && diff % days === 0
  }
  if (freq.startsWith('monthly:')) return d.getDate() === parseInt(freq.split(':')[1])
  if (freq.startsWith('yearly:')) {
    const [month, day] = freq.split(':')[1].split('-').map(Number)
    return d.getMonth() + 1 === month && d.getDate() === day
  }
  return freq.split(',').includes(dow)
}

function buildDayMap(tasks, singleDayEvents, holidays, habits, completedSet) {
  const pad = n => String(n).padStart(2, '0')
  const map = {}
  const add = (dateStr, item) => {
    if (!map[dateStr]) map[dateStr] = []
    map[dateStr].push(item)
  }

  holidays.forEach(h => {
    add(h.date, { type: 'holiday', title: h.name, colour: '#4a4538' })
  })

  const { start, end } = getDateRange()
  const dayOfWeekMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  habits.forEach(h => {
    const d = new Date(start)
    while (d <= end) {
      const dow     = dayOfWeekMap[d.getDay()]
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
      if (isHabitScheduled(h.frequency, dow, d)) {
        const done = completedSet.has(`${h.id}|${dateStr}`)
        const time = h.reminder_time ? h.reminder_time.substring(0, 5) : null
        add(dateStr, { type: 'habit', id: h.id, title: h.name, colour: '#7a6e58', done, time })
      }
      d.setDate(d.getDate() + 1)
    }
  })

  singleDayEvents.forEach(e => {
    const dateStr = e.start_time.split('T')[0]
    const time    = e.all_day ? null : getLocalTime(e.start_time)
    add(dateStr, { type: 'event', id: e.id, title: e.title, colour: getEventColour(e), time })
  })

  tasks.forEach(t => {
    if (!t.due_date) return
    const overdue = new Date(t.due_date) < new Date(new Date().toDateString())
    const colour  = overdue ? '#b05050' : (t.folders?.workspaces?.colour || '#c9a96e')
    const time    = t.reminder_time ? t.reminder_time.substring(11, 16) : null
    add(t.due_date, { type: 'task', id: t.id, title: t.title, colour, overdue, time })
  })

  Object.keys(map).forEach(k => { map[k] = sortItems(map[k]) })
  return map
}

function renderCalItem(item) {
  const clickHandler = item.type === 'event'
    ? `onclick="event.stopPropagation(); openEventEditModal('${item.id}')"`
    : item.type === 'task'
    ? `onclick="event.stopPropagation(); openTaskEdit('${item.id}')"`
    : ''
  const timeLabel = item.time ? `<span class="cal-item-time">${item.time}</span>` : ''
  return `
    <div class="cal-item cal-item--${item.type} ${item.overdue ? 'cal-item--overdue' : ''} ${item.done ? 'cal-item--done' : ''}"
         style="border-left-color:${item.colour}; color:${item.colour}; ${item.id ? 'cursor:pointer;' : ''}"
         ${clickHandler}>
      ${timeLabel}${item.title}
    </div>
  `
}

// ── MONTH VIEW ────────────────────────────────────────────
function renderMonthView(tasks, events, holidays, habits, completedSet) {
  const body        = document.getElementById('calendar-body')
  const year        = currentDate.getFullYear()
  const month       = currentDate.getMonth()
  const firstDay    = new Date(year, month, 1)
  const startPad    = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const pad         = n => String(n).padStart(2, '0')
  const today       = `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`

  document.getElementById('cal-title').textContent =
    currentDate.toLocaleDateString('no-NO', { month: 'long', year: 'numeric' })

  const gridDates = []
  for (let i = 0; i < Math.ceil((startPad + daysInMonth) / 7) * 7; i++) {
    const d = new Date(year, month, 1 - startPad + i)
    gridDates.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`)
  }

  const multiDayEvents  = events.filter(e => {
    const s = e.start_time.split('T')[0], en = e.end_time ? e.end_time.split('T')[0] : s
    return en > s
  })
  const singleDayEvents = events.filter(e => {
    const s = e.start_time.split('T')[0], en = e.end_time ? e.end_time.split('T')[0] : s
    return en <= s
  })

  const dayMap = buildDayMap(tasks, singleDayEvents, holidays, habits, completedSet)

  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  }

  const MAX_ITEMS = 2
  let html = `
    <div class="cal-month-wrapper">
      <div class="cal-month-grid" id="cal-month-grid">
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
  const totalDayCells = Math.ceil((startPad + daysInMonth) / 7) * 7

  for (let i = 0; i < totalDayCells; i++) {
    if (i % 7 === 0) {
      const cellDate = new Date(year, month, 1 - startPad + i)
      html += `<div class="cal-week-num">${getWeekNumber(cellDate)}</div>`
    }
    if (i < startPad || dayCount > daysInMonth) {
      html += `<div class="cal-cell cal-cell--empty"></div>`
    } else {
      const dateStr   = `${year}-${pad(month+1)}-${pad(dayCount)}`
      const isToday   = dateStr === today
      const items     = dayMap[dateStr] || []
      const isHoliday = items.some(i => i.type === 'holiday')
      html += `
        <div class="cal-cell ${isToday ? 'cal-cell--today' : ''} ${isHoliday ? 'cal-cell--holiday' : ''}"
             data-date="${dateStr}" onclick="openCalAddPopup('${dateStr}')">
          <div class="cal-cell-num">${dayCount}</div>
          <div class="cal-cell-items">
            ${items.slice(0, MAX_ITEMS).map(item => renderCalItem(item)).join('')}
            ${items.length > MAX_ITEMS ? `<div class="cal-more">+${items.length - MAX_ITEMS} more</div>` : ''}
          </div>
        </div>
      `
      dayCount++
    }
  }

  html += '</div></div>'
  body.innerHTML = html
  setTimeout(() => renderMultiDayBars(multiDayEvents, gridDates), 0)
}

function renderMultiDayBars(events, gridDates) {
  const grid = document.getElementById('cal-month-grid')
  if (!grid || !events.length) return

  grid.style.position = 'relative'
  const rowSlots = {}

  events.forEach(e => {
    const colour  = getEventColour(e)
    const evStart = e.start_time.split('T')[0]
    const evEnd   = e.end_time ? e.end_time.split('T')[0] : evStart

    let startIdx = gridDates.indexOf(evStart)
    let endIdx   = gridDates.indexOf(evEnd)
    if (startIdx === -1) startIdx = 0
    if (endIdx === -1) endIdx = gridDates.length - 1
    if (startIdx > endIdx) return

    let idx = startIdx
    while (idx <= endIdx) {
      const rowStart = idx
      const rowEnd   = Math.min(endIdx, Math.floor(idx / 7) * 7 + 6)
      const row      = Math.floor(idx / 7)

      if (!rowSlots[row]) rowSlots[row] = []
      let slot = 0
      while (rowSlots[row][slot]) slot++
      for (let s = rowStart; s <= rowEnd; s++) {
        if (!rowSlots[Math.floor(s/7)]) rowSlots[Math.floor(s/7)] = []
        rowSlots[Math.floor(s/7)][slot] = true
      }

      const dayCells  = grid.querySelectorAll('.cal-cell')
      const startCell = dayCells[rowStart + Math.floor(rowStart / 7)]
      const endCell   = dayCells[rowEnd + Math.floor(rowEnd / 7)]
      if (!startCell || !endCell) { idx = rowEnd + 1; continue }

      const gridRect  = grid.getBoundingClientRect()
      const startRect = startCell.getBoundingClientRect()
      const endRect   = endCell.getBoundingClientRect()

      const bar = document.createElement('div')
      bar.className = 'cal-multiday-bar'
      bar.style.cssText = `
        left: ${startRect.left - gridRect.left}px;
        top: ${startRect.top - gridRect.top + startRect.height - 22 - slot * 18}px;
        width: ${endRect.right - startRect.left}px;
        background: ${colour}25; border-left: 3px solid ${colour}; color: ${colour};
        cursor: pointer; pointer-events: all;
      `
      bar.textContent = e.title
      bar.addEventListener('click', ev => { ev.stopPropagation(); openEventEditModal(e.id) })
      grid.appendChild(bar)
      idx = rowEnd + 1
    }
  })
}

// ── WEEK VIEW ─────────────────────────────────────────────
function renderWeekView(tasks, events, holidays, habits, completedSet) {
  const body     = document.getElementById('calendar-body')
  const { start } = getDateRange()
  const pad      = n => String(n).padStart(2, '0')
  const today    = `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }

  const singleDayEvents = events.filter(e => {
    const s = e.start_time.split('T')[0], en = e.end_time ? e.end_time.split('T')[0] : s
    return en <= s
  })
  const multiDayEvents = events.filter(e => {
    const s = e.start_time.split('T')[0], en = e.end_time ? e.end_time.split('T')[0] : s
    return en > s
  })

  const dayMap = buildDayMap(tasks, singleDayEvents, holidays, habits, completedSet)

  multiDayEvents.forEach(e => {
    const evStart = e.start_time.split('T')[0]
    const evEnd   = e.end_time ? e.end_time.split('T')[0] : evStart
    const colour  = getEventColour(e)
    const time    = e.all_day ? null : getLocalTime(e.start_time)

    days.forEach(d => {
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
      if (dateStr >= evStart && dateStr <= evEnd) {
        if (!dayMap[dateStr]) dayMap[dateStr] = []
        const isStart = dateStr === evStart
        dayMap[dateStr].push({
          type: 'event', id: e.id,
          title: isStart ? e.title : `↪ ${e.title}`,
          colour, time: isStart ? time : null
        })
      }
    })
  })

  Object.keys(dayMap).forEach(k => { dayMap[k] = sortItems(dayMap[k]) })

  document.getElementById('cal-title').textContent =
    `${days[0].toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })} — ${days[6].toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' })}`

  let html = '<div class="cal-week-scroll"><div class="cal-week-grid">'
  let todayIndex = -1

  days.forEach((day, i) => {
    const dateStr = `${day.getFullYear()}-${pad(day.getMonth()+1)}-${pad(day.getDate())}`
    const isToday = dateStr === today
    if (isToday) todayIndex = i
    const items = dayMap[dateStr] || []

    html += `
      <div class="cal-week-col ${isToday ? 'cal-week-col--today' : ''}"
           id="cal-week-col-${i}"
           onclick="openCalAddPopup('${dateStr}')">
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

  html += '</div></div>'
  body.innerHTML = html

  if (todayIndex >= 0) {
    setTimeout(() => {
      const scrollContainer = body.querySelector('.cal-week-scroll')
      const todayCol = document.getElementById('cal-week-col-' + todayIndex)
      if (scrollContainer && todayCol) {
        const colLeft = todayCol.offsetLeft
        const colWidth = todayCol.offsetWidth
        const containerWidth = scrollContainer.offsetWidth
        scrollContainer.scrollLeft = colLeft - (containerWidth / 2) + (colWidth / 2)
      }
    }, 50)
  }
}

// ── DAY VIEW ──────────────────────────────────────────────
function renderDayView(tasks, events, holidays, habits, completedSet) {
  const body    = document.getElementById('calendar-body')
  const pad     = n => String(n).padStart(2, '0')
  const dateStr = `${currentDate.getFullYear()}-${pad(currentDate.getMonth()+1)}-${pad(currentDate.getDate())}`

  document.getElementById('cal-title').textContent =
    currentDate.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const bannerItems = []
  const timedItems  = []

  holidays.forEach(h => {
    if (h.date === dateStr) bannerItems.push({ type: 'holiday', title: h.name, colour: '#4a4538' })
  })

  const dayOfWeekMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  habits.forEach(h => {
    const dow = dayOfWeekMap[currentDate.getDay()]
    if (!isHabitScheduled(h.frequency, dow, currentDate)) return
    const done   = completedSet.has(`${h.id}|${dateStr}`)
    const colour = '#7a6e58'
    if (h.reminder_time) {
      const startMin = timeToMinutes(h.reminder_time.substring(0, 5))
      timedItems.push({ type: 'habit', id: h.id, title: h.name, colour, startMin, endMin: startMin + 30, done })
    } else {
      bannerItems.push({ type: 'habit', id: h.id, title: h.name, colour, done })
    }
  })

  events.forEach(e => {
    const evStart = e.start_time.split('T')[0]
    const evEnd   = e.end_time ? e.end_time.split('T')[0] : evStart
    if (dateStr < evStart || dateStr > evEnd) return
    const colour    = getEventColour(e)
    const startTime = getLocalTime(e.start_time)
    const endTime   = e.end_time ? getLocalTime(e.end_time) : null

    if (e.all_day) {
      bannerItems.push({ type: 'event', id: e.id, title: e.title, colour })
    } else if (evEnd > evStart) {
      const startMin = dateStr === evStart ? timeToMinutes(startTime || '00:00') : 0
      const endMin   = dateStr === evEnd   ? timeToMinutes(getLocalTime(e.end_time) || '23:59') : 24 * 60
      timedItems.push({ type: 'event', id: e.id, title: e.title, colour, startMin, endMin })
    } else if (startTime && startTime !== '00:00') {
      const startMin = timeToMinutes(startTime)
      const endMin   = endTime ? timeToMinutes(endTime) : startMin + 60
      timedItems.push({ type: 'event', id: e.id, title: e.title, colour, startMin, endMin })
    } else {
      bannerItems.push({ type: 'event', id: e.id, title: e.title, colour })
    }
  })

  tasks.forEach(t => {
    if (t.due_date !== dateStr) return
    const overdue = new Date(t.due_date) < new Date(new Date().toDateString())
    const colour  = overdue ? '#b05050' : (t.folders?.workspaces?.colour || '#c9a96e')
    const time    = t.reminder_time ? getLocalTime(t.reminder_time) : null
    if (time) {
      const startMin = timeToMinutes(time)
      timedItems.push({ type: 'task', id: t.id, title: t.title, colour, startMin, endMin: startMin + 30 })
    } else {
      bannerItems.push({ type: 'task', id: t.id, title: t.title, colour, overdue })
    }
  })

  const now     = new Date()
  const isToday = dateStr === `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
  const nowMin  = now.getHours() * 60 + now.getMinutes()
  const totalHeight = 24 * HOUR_HEIGHT

  let html = '<div class="cal-day-timeline">'

  if (bannerItems.length > 0) {
    html += `
      <div class="cal-day-allday">
        <div class="cal-day-allday-label">All day</div>
        <div class="cal-day-allday-items">
          ${sortItems(bannerItems).map(item => `
            <div class="cal-day-banner-item ${item.done ? 'cal-item--done' : ''}"
                 style="background:${item.colour}18; border-left:3px solid ${item.colour}; color:${item.colour}; ${item.id ? 'cursor:pointer;' : ''}"
                 ${item.type === 'event' ? `onclick="openEventEditModal('${item.id}')"` : ''}
                 ${item.type === 'task'  ? `onclick="openTaskEdit('${item.id}')"` : ''}>
              ${item.title}
            </div>
          `).join('')}
        </div>
      </div>
    `
  }

  html += `<div class="cal-day-add-btn" onclick="openCalAddPopup('${dateStr}')">+ Add task or event</div>`
  html += `<div class="cal-day-hours" style="position:relative; height:${totalHeight}px;">`

  for (let h = 0; h < 24; h++) {
    const top     = h * HOUR_HEIGHT
    const timeStr = `${pad(h)}:00`
    html += `
      <div class="cal-hour-row-block" style="top:${top}px; height:${HOUR_HEIGHT}px;"
           onclick="openCalAddPopup('${dateStr}', '${timeStr}')">
        <div class="cal-hour-label">${timeStr}</div>
        <div class="cal-hour-line"></div>
      </div>
    `
  }

  if (isToday) {
    const nowTop = (nowMin / 60) * HOUR_HEIGHT
    html += `<div class="cal-now-indicator" style="top:${nowTop}px;"></div>`
  }

  const columns = layoutColumns(timedItems)
  const numCols = Math.max(columns.length, 1)

  timedItems.forEach(item => {
    const col    = item._col ?? 0
    const top    = (item.startMin / 60) * HOUR_HEIGHT
    const height = Math.max(((item.endMin - item.startMin) / 60) * HOUR_HEIGHT, 24)
    const width  = `calc((100% - 52px) / ${numCols})`
    const left   = `calc(52px + (100% - 52px) / ${numCols} * ${col})`
    const clickHandler = item.type === 'event'
      ? `onclick="event.stopPropagation(); openEventEditModal('${item.id}')"`
      : item.type === 'task'
      ? `onclick="event.stopPropagation(); openTaskEdit('${item.id}')"`
      : ''

    html += `
      <div class="cal-day-block ${item.done ? 'cal-item--done' : ''}"
           style="top:${top}px; height:${height}px; left:${left}; width:${width};
                  background:${item.colour}22; border-left:3px solid ${item.colour}; color:${item.colour};"
           ${clickHandler}>
        <div class="cal-day-block-title">${item.title}</div>
        <div class="cal-day-block-time">${minutesToTime(item.startMin)} – ${minutesToTime(item.endMin)}</div>
      </div>
    `
  })

  html += '</div></div>'
  body.innerHTML = html

  const scrollTo = isToday ? nowMin : (timedItems.length ? Math.min(...timedItems.map(i => i.startMin)) : 480)
  const hoursEl  = body.querySelector('.cal-day-hours')
  if (hoursEl) {
    setTimeout(() => { body.scrollTop = Math.max(0, (scrollTo / 60) * HOUR_HEIGHT - 80) }, 50)
  }
}

function layoutColumns(items) {
  const sorted  = [...items].sort((a, b) => a.startMin - b.startMin)
  const columns = []
  sorted.forEach(item => {
    let placed = false
    for (let c = 0; c < columns.length; c++) {
      const lastInCol = columns[c][columns[c].length - 1]
      if (lastInCol.endMin <= item.startMin) {
        columns[c].push(item)
        item._col = c
        placed = true
        break
      }
    }
    if (!placed) {
      item._col = columns.length
      columns.push([item])
    }
  })
  return columns
}

// ── EVENT EDIT MODAL ──────────────────────────────────────
window.openEventEditModal = async function(eventId) {
  const { data: e } = await supabase
    .from('events').select('*, folders(id, name, workspaces(id))').eq('id', eventId).single()
  if (!e) return

  document.getElementById('cal-event-edit-modal')?.remove()

  const { data: allFolders } = await supabase
    .from('folders').select('id, name, workspace_id').eq('type', 'events').order('name')

  const wsOptions = allWorkspaces.map(ws =>
    `<option value="${ws.id}" ${(e.folders?.workspaces?.id || e.workspace_id) === ws.id ? 'selected' : ''}>${ws.name}</option>`
  ).join('')

  const currentWsId   = e.folders?.workspaces?.id || e.workspace_id || ''
  const folderOptions = (allFolders || [])
    .filter(f => f.workspace_id === currentWsId)
    .map(f => `<option value="${f.id}" ${e.folder_id === f.id ? 'selected' : ''}>${f.name}</option>`)
    .join('')

  const startDate = e.start_time ? e.start_time.split('T')[0] : ''
  const startTime = e.start_time && !e.all_day ? e.start_time.substring(11, 16) : ''
  const endDate   = e.end_time ? e.end_time.split('T')[0] : ''
  const endTime   = e.end_time && !e.all_day ? e.end_time.substring(11, 16) : ''

  const modal = document.createElement('div')
  modal.id = 'cal-event-edit-modal'
  modal.className = 'popup'
  modal._allFolders = allFolders || []
  modal.innerHTML = `
    <div class="popup-box popup-box--wide">
      <div class="popup-header">
        <div class="popup-title">Edit event</div>
        <button class="popup-close" onclick="closeEventEditModal()">✕</button>
      </div>
      <div class="edit-field">
        <label class="edit-label">Title</label>
        <input class="popup-input" id="ee-title" value="${e.title}" />
      </div>
      <div class="edit-row">
        <div class="edit-field">
          <label class="edit-label">Start date</label>
          <input class="popup-input" id="ee-start-date" type="date" value="${startDate}" />
        </div>
        <div class="edit-field">
          <label class="edit-label">Start time</label>
          <input class="popup-input" id="ee-start-time" type="time" value="${startTime}" />
        </div>
      </div>
      <div class="edit-row">
        <div class="edit-field">
          <label class="edit-label">End date</label>
          <input class="popup-input" id="ee-end-date" type="date" value="${endDate}" />
        </div>
        <div class="edit-field">
          <label class="edit-label">End time</label>
          <input class="popup-input" id="ee-end-time" type="time" value="${endTime}" />
        </div>
      </div>
      <div class="edit-field">
        <label class="edit-label">Location</label>
        <input class="popup-input" id="ee-location" value="${e.location || ''}" placeholder="Optional..." />
      </div>
      <div class="edit-row">
        <div class="edit-field">
          <label class="edit-label">Workspace</label>
          <select class="popup-input" id="ee-workspace" onchange="eeUpdateFolders(this.value)">
            <option value="">No workspace</option>
            ${wsOptions}
          </select>
        </div>
        <div class="edit-field">
          <label class="edit-label">Event folder (optional)</label>
          <select class="popup-input" id="ee-folder">
            <option value="">No folder</option>
            ${folderOptions}
          </select>
        </div>
      </div>
      <div class="popup-actions">
        <button class="popup-btn popup-btn--danger" onclick="deleteCalEvent('${e.id}')">Delete</button>
        <div style="display:flex;gap:8px;">
          <button class="popup-btn" onclick="closeEventEditModal()">Cancel</button>
          <button class="popup-btn popup-btn--primary" onclick="saveEventEdit('${e.id}')">Save</button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  modal.addEventListener('click', ev => { if (ev.target === modal) closeEventEditModal() })
  document.getElementById('ee-title').focus()
}

window.eeUpdateFolders = function(workspaceId) {
  const modal   = document.getElementById('cal-event-edit-modal')
  const folders = (modal?._allFolders || []).filter(f => f.workspace_id === workspaceId)
  document.getElementById('ee-folder').innerHTML =
    '<option value="">No folder</option>' +
    folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
}

window.closeEventEditModal = function() {
  document.getElementById('cal-event-edit-modal')?.remove()
}

window.saveEventEdit = async function(eventId) {
  const title       = document.getElementById('ee-title').value.trim()
  const startDate   = document.getElementById('ee-start-date').value
  const startTime   = document.getElementById('ee-start-time').value
  const endDate     = document.getElementById('ee-end-date').value
  const endTime     = document.getElementById('ee-end-time').value
  const location    = document.getElementById('ee-location').value.trim()
  const workspaceId = document.getElementById('ee-workspace').value || null
  const folderId    = document.getElementById('ee-folder').value || null
  if (!title || !startDate) return

  await supabase.from('events').update({
    title,
    start_time: startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`,
    end_time:   endDate ? (endTime ? `${endDate}T${endTime}:00` : `${endDate}T23:59:00`) : null,
    all_day: !startTime, location, workspace_id: workspaceId, folder_id: folderId
  }).eq('id', eventId)

  closeEventEditModal()
  loadCalendarData()
}

window.deleteCalEvent = async function(eventId) {
  if (!confirm('Delete this event?')) return
  await supabase.from('events').delete().eq('id', eventId)
  closeEventEditModal()
  loadCalendarData()
}

// ── ADD TASK / EVENT POPUP ────────────────────────────────
window.openCalAddPopup = async function(dateStr, prefilledTime = '') {
  document.getElementById('cal-add-modal')?.remove()

  const { data: folders } = await supabase
    .from('folders').select('id, name, type, workspace_id').order('name')

  const wsOptions = allWorkspaces.map(ws => `<option value="${ws.id}">${ws.name}</option>`).join('')

  const modal = document.createElement('div')
  modal.id = 'cal-add-modal'
  modal.className = 'popup'
  modal._folders = folders || []
  modal.innerHTML = `
    <div class="popup-box popup-box--wide">
      <div class="popup-header">
        <div class="popup-title">Add to ${new Date(dateStr + 'T12:00:00').toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })}</div>
        <button class="popup-close" onclick="closeCalAddModal()">✕</button>
      </div>
      <div class="cal-add-tabs">
        <button class="cal-add-tab active" id="tab-task" onclick="switchCalTab('task')">Task</button>
        <button class="cal-add-tab" id="tab-event" onclick="switchCalTab('event')">Event</button>
      </div>
      <div id="cal-task-form" style="display:flex;flex-direction:column;gap:12px;">
        <div class="edit-field">
          <label class="edit-label">Title</label>
          <input class="popup-input" id="cal-task-title" placeholder="Task title..." />
        </div>
        <div class="edit-field">
          <label class="edit-label">Type</label>
          <div class="edit-type-row">
            <button class="edit-type-btn active" onclick="calSetTaskType('simple', this)">Simple</button>
            <button class="edit-type-btn" onclick="calSetTaskType('project', this)">Project</button>
          </div>
        </div>
        <div class="edit-field" id="cal-task-status-field" style="display:none;flex-direction:column;gap:5px;">
          <label class="edit-label">Status</label>
          <div class="edit-status-row">
            <button class="edit-status-btn active" onclick="calSetStatus('not_started', this)">○ Not started</button>
            <button class="edit-status-btn" onclick="calSetStatus('in_progress', this)">⟳ In progress</button>
            <button class="edit-status-btn" onclick="calSetStatus('done', this)">✓ Done</button>
          </div>
        </div>
        <div class="edit-row">
          <div class="edit-field">
            <label class="edit-label">Deadline</label>
            <input class="popup-input" id="cal-task-date" type="date" value="${dateStr}" />
          </div>
          <div class="edit-field">
            <label class="edit-label">Reminder time</label>
            <input class="popup-input" id="cal-task-reminder" type="time" value="${prefilledTime}" />
          </div>
        </div>
        <div class="edit-row">
          <div class="edit-field">
            <label class="edit-label">Workspace</label>
            <select class="popup-input" id="cal-task-workspace" onchange="calUpdateTaskFolders(this.value)">
              <option value="">Select workspace...</option>${wsOptions}
            </select>
          </div>
          <div class="edit-field">
            <label class="edit-label">Folder (optional)</label>
            <select class="popup-input" id="cal-task-folder"><option value="">No folder</option></select>
          </div>
        </div>
      </div>
      <div id="cal-event-form" style="display:none;flex-direction:column;gap:12px;">
        <div class="edit-field">
          <label class="edit-label">Title</label>
          <input class="popup-input" id="cal-event-title" placeholder="Event title..." />
        </div>
        <div class="edit-row">
          <div class="edit-field">
            <label class="edit-label">Start date</label>
            <input class="popup-input" id="cal-event-start-date" type="date" value="${dateStr}" />
          </div>
          <div class="edit-field">
            <label class="edit-label">Start time</label>
            <input class="popup-input" id="cal-event-start-time" type="time" value="${prefilledTime}" />
          </div>
        </div>
        <div class="edit-row">
          <div class="edit-field">
            <label class="edit-label">End date</label>
            <input class="popup-input" id="cal-event-end-date" type="date" value="${dateStr}" />
          </div>
          <div class="edit-field">
            <label class="edit-label">End time</label>
            <input class="popup-input" id="cal-event-end-time" type="time" />
          </div>
        </div>
        <div class="edit-field">
          <label class="edit-label">Location</label>
          <input class="popup-input" id="cal-event-location" placeholder="Optional location..." />
        </div>
        <div class="edit-row">
          <div class="edit-field">
            <label class="edit-label">Workspace</label>
            <select class="popup-input" id="cal-event-workspace" onchange="calUpdateEventFolders(this.value)">
              <option value="">Select workspace...</option>${wsOptions}
            </select>
          </div>
          <div class="edit-field">
            <label class="edit-label">Event folder (optional)</label>
            <select class="popup-input" id="cal-event-folder"><option value="">No folder</option></select>
          </div>
        </div>
      </div>
      <div class="popup-actions" style="margin-top:4px;">
        <div></div>
        <div style="display:flex;gap:8px;">
          <button class="popup-btn" onclick="closeCalAddModal()">Cancel</button>
          <button class="popup-btn popup-btn--primary" onclick="saveCalItem('${dateStr}')">Save</button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) closeCalAddModal() })
  document.getElementById('cal-task-title').focus()
}

window.switchCalTab = function(tab) {
  document.getElementById('tab-task').classList.toggle('active', tab === 'task')
  document.getElementById('tab-event').classList.toggle('active', tab === 'event')
  document.getElementById('cal-task-form').style.display  = tab === 'task'  ? 'flex' : 'none'
  document.getElementById('cal-event-form').style.display = tab === 'event' ? 'flex' : 'none'
}

window.calSetTaskType = function(type, btn) {
  document.querySelectorAll('#cal-task-form .edit-type-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  document.getElementById('cal-task-status-field').style.display = type === 'project' ? 'flex' : 'none'
}

window.calSetStatus = function(status, btn) {
  document.querySelectorAll('#cal-task-form .edit-status-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
}

window.calUpdateTaskFolders = function(workspaceId) {
  const modal   = document.getElementById('cal-add-modal')
  const folders = (modal?._folders || []).filter(f => f.workspace_id === workspaceId && f.type === 'tasks')
  document.getElementById('cal-task-folder').innerHTML =
    '<option value="">No folder</option>' + folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
}

window.calUpdateEventFolders = function(workspaceId) {
  const modal   = document.getElementById('cal-add-modal')
  const folders = (modal?._folders || []).filter(f => f.workspace_id === workspaceId && f.type === 'events')
  document.getElementById('cal-event-folder').innerHTML =
    '<option value="">No folder</option>' + folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
}

window.closeCalAddModal = function() {
  document.getElementById('cal-add-modal')?.remove()
}

window.saveCalItem = async function(dateStr) {
  const isTask = document.getElementById('tab-task').classList.contains('active')

  if (isTask) {
    const title       = document.getElementById('cal-task-title').value.trim()
    const due_date    = document.getElementById('cal-task-date').value || dateStr
    const reminderVal = document.getElementById('cal-task-reminder').value
    const workspaceId = document.getElementById('cal-task-workspace').value || null
    const folderId    = document.getElementById('cal-task-folder').value || null
    const typeBtn     = document.querySelector('#cal-task-form .edit-type-btn.active')
    const type        = typeBtn?.textContent.trim().toLowerCase() === 'project' ? 'project' : 'simple'
    const statusBtn   = document.querySelector('#cal-task-form .edit-status-btn.active')
    const status      = statusBtn ? statusBtn.getAttribute('onclick').match(/'([^']+)'/)[1] : 'not_started'
    if (!title) return
    await supabase.from('tasks').insert({
      title, due_date,
      reminder_time: reminderVal ? new Date(`${due_date}T${reminderVal}:00`).toISOString() : null,
      type, status, workspace_id: workspaceId, folder_id: folderId, position: 0
    })
  } else {
    const title       = document.getElementById('cal-event-title').value.trim()
    const startDate   = document.getElementById('cal-event-start-date').value
    const startTime   = document.getElementById('cal-event-start-time').value
    const endDate     = document.getElementById('cal-event-end-date').value
    const endTime     = document.getElementById('cal-event-end-time').value
    const location    = document.getElementById('cal-event-location').value.trim()
    const workspaceId = document.getElementById('cal-event-workspace').value || null
    const folderId    = document.getElementById('cal-event-folder').value || null
    if (!title || !startDate) return
    await supabase.from('events').insert({
      title,
      start_time: startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`,
      end_time:   endDate ? (endTime ? `${endDate}T${endTime}:00` : `${endDate}T23:59:00`) : null,
      all_day: !startTime, location, workspace_id: workspaceId, folder_id: folderId
    })
  }

  closeCalAddModal()
  loadCalendarData()
}

window.calPrev = function() {
  if (currentView === 'month') currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
  else if (currentView === 'week') currentDate.setDate(currentDate.getDate() - 7)
  else currentDate.setDate(currentDate.getDate() - 1)
  loadCalendarData()
}

window.calNext = function() {
  if (currentView === 'month') currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
  else if (currentView === 'week') currentDate.setDate(currentDate.getDate() + 7)
  else currentDate.setDate(currentDate.getDate() + 1)
  loadCalendarData()
}

window.calToday = function() { currentDate = new Date(); loadCalendarData() }
window.setCalView = function(view) { currentView = view; renderCalendar() }