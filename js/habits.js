import { supabase } from './supabase.js'

export async function initHabits() {
  const main = document.getElementById('main-content')
  main.innerHTML = `
    <div class="habits-view" id="habits-view">
      <div class="habits-header">
        <div>
          <div class="habits-title">Daily</div>
          <div class="habits-date" id="habits-date"></div>
        </div>
        <button class="habits-manage-btn" onclick="showManageHabits()">Manage habits</button>
      </div>
      <div class="habits-body" id="habits-body">
        <div class="habits-loading">Loading...</div>
      </div>
    </div>
  `

  const now = new Date()
  document.getElementById('habits-date').textContent = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  await loadDailyView()
}

async function loadDailyView() {
  const pad = n => String(n).padStart(2, '0')
  const now = new Date()
  const norwayNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }))
  const todayNorway = `${norwayNow.getFullYear()}-${pad(norwayNow.getMonth()+1)}-${pad(norwayNow.getDate())}`
  const dayOfWeekMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dow = dayOfWeekMap[norwayNow.getDay()]

  const [habitsRes, completionsRes, tasksRes, workspacesRes] = await Promise.all([
    supabase.from('habits').select('*').order('position'),
    supabase.from('habit_completions').select('habit_id').eq('completed_date', todayNorway),
    supabase.from('tasks').select('*, workspaces(id, name, colour)').eq('due_date', todayNorway).eq('done', false).order('reminder_time'),
    supabase.from('workspaces').select('id, name, colour').order('position')
  ])

  const habits = habitsRes.data || []
  const completedIds = new Set((completionsRes.data || []).map(c => c.habit_id))
  const allTasks = tasksRes.data || []
  const workspaces = workspacesRes.data || []

  // Filter habits scheduled for today
  const todayHabits = habits.filter(h => isScheduledToday(h.frequency, dow, norwayNow))

  const body = document.getElementById('habits-body')
  if (!body) return

  // ── Habits section ────────────────────────────────────────
  let html = `<div class="daily-section-label">Habits</div>`

  if (todayHabits.length === 0) {
    html += `<div class="daily-empty">No habits scheduled for today</div>`
  } else {
    todayHabits.forEach(habit => {
      const done = completedIds.has(habit.id)
      const time = habit.reminder_time ? habit.reminder_time.substring(0, 5) : ''
      html += `
        <div class="daily-item ${done ? 'daily-item--done' : ''}" onclick="toggleHabitToday('${habit.id}', ${done}, '${todayNorway}', this)">
          <div class="daily-check daily-check--circle ${done ? 'daily-check--checked' : ''}">
            ${done ? '✓' : ''}
          </div>
          <span class="daily-item-title">${habit.name}</span>
          ${time ? `<span class="daily-item-time">${time}</span>` : ''}
        </div>
      `
    })
  }

  // ── Tasks section ─────────────────────────────────────────
  html += `<div class="daily-section-label daily-section-label--tasks">Due today</div>`

  if (allTasks.length === 0) {
    html += `<div class="daily-empty">No tasks due today</div>`
  } else {
    // Group by workspace
    const grouped = {}
    allTasks.forEach(t => {
      const wsId = t.workspaces?.id || 'none'
      if (!grouped[wsId]) grouped[wsId] = { name: t.workspaces?.name || 'No workspace', colour: t.workspaces?.colour || '#7a6e58', tasks: [] }
      grouped[wsId].tasks.push(t)
    })

    Object.values(grouped).forEach(group => {
      html += `
        <div class="daily-ws-label" style="border-left-color:${group.colour};color:${group.colour}">
          ${group.name}
        </div>
      `
      group.tasks.forEach(task => {
        const overdue = new Date(task.due_date) < new Date(new Date().toDateString())
        const colour = overdue ? '#b05050' : group.colour
        const time = task.reminder_time
          ? new Date(task.reminder_time).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit', hour12: false })
          : ''
        html += `
          <div class="daily-item" onclick="toggleTaskToday('${task.id}', this)">
            <div class="daily-check daily-check--square" style="border-color:${colour}">
            </div>
            <span class="daily-item-title" style="color:${overdue ? colour : ''}">${task.title}</span>
            ${time ? `<span class="daily-item-time" style="color:${overdue ? colour : ''}">${time}</span>` : ''}
            ${overdue ? `<span class="daily-overdue-badge">⚠</span>` : ''}
          </div>
        `
      })
    })
  }

  body.innerHTML = html
}

// ── TOGGLE HABIT ──────────────────────────────────────────
window.toggleHabitToday = async function(habitId, currentDone, todayDate, el) {
  if (currentDone) {
    await supabase.from('habit_completions').delete()
      .eq('habit_id', habitId).eq('completed_date', todayDate)
  } else {
    await supabase.from('habit_completions').insert({ habit_id: habitId, completed_date: todayDate })
  }

  const check = el.querySelector('.daily-check')
  const title = el.querySelector('.daily-item-title')
  const nowDone = !currentDone

  if (nowDone) {
    el.classList.add('daily-item--done')
    check.classList.add('daily-check--checked')
    check.textContent = '✓'
  } else {
    el.classList.remove('daily-item--done')
    check.classList.remove('daily-check--checked')
    check.textContent = ''
  }

  el.onclick = () => toggleHabitToday(habitId, nowDone, todayDate, el)
}

// ── TOGGLE TASK ───────────────────────────────────────────
window.toggleTaskToday = async function(taskId, el) {
  await supabase.from('tasks').update({ done: true, completed_at: new Date().toISOString() }).eq('id', taskId)

  el.style.transition = 'opacity 0.3s'
  el.style.opacity = '0'
  setTimeout(() => el.remove(), 300)
}

// ── HABIT FREQUENCY CHECK ─────────────────────────────────
function isScheduledToday(freq, dow, d) {
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

// ── MANAGE HABITS ─────────────────────────────────────────
window.showManageHabits = async function() {
  const { data: habits } = await supabase.from('habits').select('*').order('position')

  document.getElementById('manage-habits-modal')?.remove()

  const modal = document.createElement('div')
  modal.id = 'manage-habits-modal'
  modal.className = 'popup'
  modal.innerHTML = `
    <div class="popup-box popup-box--wide">
      <div class="popup-header">
        <div class="popup-title">Manage habits</div>
        <button class="popup-close" onclick="document.getElementById('manage-habits-modal')?.remove()">✕</button>
      </div>
      <div class="habits-list" id="habits-manage-list">
        ${(habits || []).map(h => `
          <div class="habit-manage-item" data-id="${h.id}">
            <div class="habit-manage-info">
              <div class="habit-manage-name">${h.name}</div>
              <div class="habit-manage-freq">${formatFreq(h.frequency)} ${h.reminder_time ? '· ' + h.reminder_time.substring(0,5) : ''}</div>
            </div>
            <div class="habit-manage-actions">
              <button onclick="editHabit('${h.id}')" class="habit-manage-btn">Edit</button>
              <button onclick="deleteHabit('${h.id}')" class="habit-manage-btn habit-manage-btn--danger">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="popup-btn popup-btn--primary" style="margin-top:12px;width:100%;" onclick="showAddHabit()">+ Add habit</button>
    </div>
  `
  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
}

function formatFreq(freq) {
  if (freq === 'daily') return 'Daily'
  if (freq === 'weekdays') return 'Weekdays'
  if (freq === 'weekends') return 'Weekends'
  if (freq.startsWith('interval:')) return `Every ${freq.split(':')[1]} days`
  if (freq.startsWith('monthly:')) return `Monthly on day ${freq.split(':')[1]}`
  if (freq.startsWith('yearly:')) return `Yearly on ${freq.split(':')[1]}`
  const dayMap = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
  return freq.split(',').map(d => dayMap[d] || d).join(', ')
}

window.deleteHabit = async function(habitId) {
  if (!confirm('Delete this habit?')) return
  await supabase.from('habits').delete().eq('id', habitId)
  showManageHabits()
}

window.showAddHabit = function() {
  document.getElementById('manage-habits-modal')?.remove()
  showHabitForm(null)
}

window.editHabit = async function(habitId) {
  const { data: habit } = await supabase.from('habits').select('*').eq('id', habitId).single()
  document.getElementById('manage-habits-modal')?.remove()
  showHabitForm(habit)
}

function showHabitForm(habit) {
  document.getElementById('habit-form-modal')?.remove()

  const isEdit = !!habit
  const freq = habit?.frequency || 'daily'
  const days = ['mon','tue','wed','thu','fri','sat','sun']
  const selectedDays = freq.includes(',') ? freq.split(',') : []

  const modal = document.createElement('div')
  modal.id = 'habit-form-modal'
  modal.className = 'popup'
  modal.innerHTML = `
    <div class="popup-box popup-box--wide">
      <div class="popup-header">
        <div class="popup-title">${isEdit ? 'Edit habit' : 'Add habit'}</div>
        <button class="popup-close" onclick="closeHabitForm()">✕</button>
      </div>
      <div class="edit-field">
        <label class="edit-label">Name</label>
        <input class="popup-input" id="habit-name" value="${habit?.name || ''}" placeholder="Habit name..." />
      </div>
      <div class="edit-field">
        <label class="edit-label">Frequency</label>
        <select class="popup-input" id="habit-freq-select" onchange="updateHabitFreqUI()">
          <option value="daily" ${freq==='daily'?'selected':''}>Daily</option>
          <option value="weekdays" ${freq==='weekdays'?'selected':''}>Weekdays</option>
          <option value="weekends" ${freq==='weekends'?'selected':''}>Weekends</option>
          <option value="custom" ${freq.includes(',')?'selected':''}>Custom days</option>
          <option value="interval" ${freq.startsWith('interval:')?'selected':''}>Every N days</option>
          <option value="monthly" ${freq.startsWith('monthly:')?'selected':''}>Monthly</option>
        </select>
      </div>
      <div id="habit-custom-days" style="display:${freq.includes(',') ? 'flex' : 'none'};gap:6px;flex-wrap:wrap;margin-top:4px;">
        ${days.map(d => `
          <button class="habit-day-btn ${selectedDays.includes(d) ? 'active' : ''}"
                  data-day="${d}" onclick="toggleDay(this)">${d}</button>
        `).join('')}
      </div>
      <div id="habit-interval-field" style="display:${freq.startsWith('interval:') ? 'block' : 'none'};margin-top:4px;">
        <input class="popup-input" id="habit-interval-n" type="number" min="1" value="${freq.startsWith('interval:') ? freq.split(':')[1] : 2}" placeholder="Every N days" />
      </div>
      <div id="habit-monthly-field" style="display:${freq.startsWith('monthly:') ? 'block' : 'none'};margin-top:4px;">
        <input class="popup-input" id="habit-monthly-day" type="number" min="1" max="31" value="${freq.startsWith('monthly:') ? freq.split(':')[1] : 1}" placeholder="Day of month" />
      </div>
      <div class="edit-field" style="margin-top:8px;">
        <label class="edit-label">Reminder time (optional)</label>
        <input class="popup-input" id="habit-reminder" type="time" value="${habit?.reminder_time ? habit.reminder_time.substring(0,5) : ''}" />
      </div>
      <div class="popup-actions">
        <button class="popup-btn" onclick="closeHabitForm()">Cancel</button>
        <button class="popup-btn popup-btn--primary" onclick="saveHabit('${habit?.id || ''}')">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) closeHabitForm() })
  document.getElementById('habit-name').focus()
}

window.updateHabitFreqUI = function() {
  const val = document.getElementById('habit-freq-select').value
  document.getElementById('habit-custom-days').style.display = val === 'custom' ? 'flex' : 'none'
  document.getElementById('habit-interval-field').style.display = val === 'interval' ? 'block' : 'none'
  document.getElementById('habit-monthly-field').style.display = val === 'monthly' ? 'block' : 'none'
}

window.toggleDay = function(btn) {
  btn.classList.toggle('active')
}

window.closeHabitForm = function() {
  document.getElementById('habit-form-modal')?.remove()
}

window.saveHabit = async function(habitId) {
  const name = document.getElementById('habit-name').value.trim()
  if (!name) return

  const freqSelect = document.getElementById('habit-freq-select').value
  let frequency = freqSelect

  if (freqSelect === 'custom') {
    const activeDays = [...document.querySelectorAll('.habit-day-btn.active')].map(b => b.dataset.day)
    if (!activeDays.length) return
    frequency = activeDays.join(',')
  } else if (freqSelect === 'interval') {
    const n = document.getElementById('habit-interval-n').value
    frequency = `interval:${n}`
  } else if (freqSelect === 'monthly') {
    const day = document.getElementById('habit-monthly-day').value
    frequency = `monthly:${day}`
  }

  const reminder_time = document.getElementById('habit-reminder').value || null

  if (habitId) {
    await supabase.from('habits').update({ name, frequency, reminder_time }).eq('id', habitId)
  } else {
    await supabase.from('habits').insert({ name, frequency, reminder_time, position: 0 })
  }

  closeHabitForm()
  initHabits()
}