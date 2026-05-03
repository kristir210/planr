import { supabase } from './supabase.js'

const DAY_NAMES  = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── INIT HABITS ───────────────────────────────────────────
export async function initHabits() {
  const main  = document.getElementById('main-content')
  const today = new Date().toISOString().split('T')[0]

  main.innerHTML = `
    <div class="habits-view">
      <div class="habits-header">
        <h2 class="habits-title">Habits</h2>
        <button class="habits-add-btn" onclick="openHabitModal()">+ New habit</button>
      </div>
      <div class="habits-body" id="habits-body">
        <div class="habits-loading">Loading...</div>
      </div>
    </div>
  `

  loadHabits(today)
}

// ── LOAD HABITS ───────────────────────────────────────────
async function loadHabits(today) {
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()

  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .order('position')

  const { data: completions } = await supabase
    .from('habit_completions')
    .select('habit_id')
    .eq('completed_date', today)

  const completedIds = new Set((completions || []).map(c => c.habit_id))

  const body = document.getElementById('habits-body')
  if (!body) return

  if (!habits || habits.length === 0) {
    body.innerHTML = `
      <div class="habits-empty">
        <p>No habits yet.</p>
        <p>Click <strong>+ New habit</strong> to get started.</p>
      </div>
    `
    return
  }

  const todayHabits = habits.filter(h => isScheduledToday(h.frequency, today, dayOfWeek))
  const otherHabits = habits.filter(h => !isScheduledToday(h.frequency, today, dayOfWeek))

  let html = ''

  if (todayHabits.length > 0) {
    html += `<div class="habits-section-title">Today</div>`
    html += todayHabits.map(h => renderHabitRow(h, completedIds.has(h.id), true)).join('')
  }

  if (otherHabits.length > 0) {
    html += `<div class="habits-section-title" style="margin-top:20px;">Other habits</div>`
    html += otherHabits.map(h => renderHabitRow(h, false, false)).join('')
  }

  body.innerHTML = html
}

// ── FREQUENCY LOGIC ───────────────────────────────────────
function isScheduledToday(frequency, today, dayOfWeek) {
  if (!frequency) return false

  // Weekly: daily / weekdays / weekends / specific days
  if (frequency === 'daily') return true
  if (frequency === 'weekdays') return !['sat', 'sun'].includes(dayOfWeek)
  if (frequency === 'weekends') return ['sat', 'sun'].includes(dayOfWeek)

  // Every X days: "interval:14:2024-01-01" (interval, start date)
  if (frequency.startsWith('interval:')) {
    const parts = frequency.split(':')
    const days  = parseInt(parts[1])
    const start = parts[2] ? new Date(parts[2]) : new Date()
    const now   = new Date(today)
    const diff  = Math.round((now - start) / (1000 * 60 * 60 * 24))
    return diff >= 0 && diff % days === 0
  }

  // Monthly on specific day: "monthly:15" (15th of every month)
  if (frequency.startsWith('monthly:')) {
    const dayOfMonth = parseInt(frequency.split(':')[1])
    return new Date(today).getDate() === dayOfMonth
  }

  // Yearly on specific date: "yearly:03-15" (15th March every year)
  if (frequency.startsWith('yearly:')) {
    const mmdd = frequency.split(':')[1] // "03-15"
    const [month, day] = mmdd.split('-').map(Number)
    const d = new Date(today)
    return d.getMonth() + 1 === month && d.getDate() === day
  }

  // Legacy: comma-separated days
  return frequency.split(',').includes(dayOfWeek)
}

function getFreqLabel(frequency) {
  if (!frequency) return ''
  if (frequency === 'daily') return 'Every day'
  if (frequency === 'weekdays') return 'Weekdays'
  if (frequency === 'weekends') return 'Weekends'

  if (frequency.startsWith('interval:')) {
    const parts = frequency.split(':')
    const days = parseInt(parts[1])
    if (days === 1) return 'Every day'
    if (days === 7) return 'Every week'
    if (days === 14) return 'Every 2 weeks'
    if (days === 30) return 'Every month'
    return `Every ${days} days`
  }

  if (frequency.startsWith('monthly:')) {
    const day = parseInt(frequency.split(':')[1])
    return `Monthly on the ${ordinal(day)}`
  }

  if (frequency.startsWith('yearly:')) {
    const [month, day] = frequency.split(':')[1].split('-').map(Number)
    const monthName = new Date(2000, month - 1).toLocaleString('en-US', { month: 'long' })
    return `Yearly on ${monthName} ${ordinal(day)}`
  }

  const days = frequency.split(',')
  if (days.length === 7) return 'Every day'
  return days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')
}

function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

function renderHabitRow(habit, isDone, isToday) {
  const today = new Date().toISOString().split('T')[0]
  const freqLabel = getFreqLabel(habit.frequency)

  return `
    <div class="habit-row ${isDone ? 'habit-row--done' : ''}" id="hr-${habit.id}">
      <div class="habit-check ${isDone ? 'done' : ''} ${!isToday ? 'disabled' : ''}"
           onclick="${isToday ? `toggleHabit('${habit.id}', '${today}')` : ''}">
        ${isDone ? '✓' : ''}
      </div>
      <div class="habit-info">
        <div class="habit-name ${isDone ? 'done' : ''}">${habit.name}</div>
        <div class="habit-meta">
          <span class="habit-freq">${freqLabel}</span>
          ${habit.streak > 0 ? `<span class="habit-streak">🔥 ${habit.streak} streak</span>` : ''}
          ${habit.reminder_time ? `<span class="habit-reminder">⏰ ${habit.reminder_time.substring(0,5)}</span>` : ''}
        </div>
      </div>
      <button class="habit-edit-btn" onclick="openHabitModal('${habit.id}')">⋯</button>
    </div>
  `
}

// ── TOGGLE HABIT ──────────────────────────────────────────
window.toggleHabit = async function(habitId, today) {
  const row     = document.getElementById('hr-' + habitId)
  const checkEl = row?.querySelector('.habit-check')
  const nameEl  = row?.querySelector('.habit-name')
  const isDone  = checkEl?.classList.contains('done')

  if (isDone) {
    await supabase.from('habit_completions').delete()
      .eq('habit_id', habitId).eq('completed_date', today)
    checkEl.classList.remove('done')
    checkEl.textContent = ''
    nameEl?.classList.remove('done')
    row?.classList.remove('habit-row--done')
  } else {
    await supabase.from('habit_completions').insert({ habit_id: habitId, completed_date: today })

    const { data: recent } = await supabase.from('habit_completions')
      .select('completed_date').eq('habit_id', habitId)
      .order('completed_date', { ascending: false }).limit(400)

    const streak = calculateStreak(recent || [])
    await supabase.from('habits').update({ streak }).eq('id', habitId)

    checkEl.classList.add('done')
    checkEl.textContent = '✓'
    nameEl?.classList.add('done')
    row?.classList.add('habit-row--done')

    const streakEl = row?.querySelector('.habit-streak')
    if (streakEl) {
      streakEl.textContent = `🔥 ${streak} streak`
    } else {
      const metaEl = row?.querySelector('.habit-meta')
      if (metaEl) {
        const span = document.createElement('span')
        span.className = 'habit-streak'
        span.textContent = `🔥 ${streak} streak`
        metaEl.appendChild(span)
      }
    }
  }
}

function calculateStreak(completions) {
  if (!completions.length) return 0
  let streak = 0
  let checkDate = new Date()
  checkDate.setHours(0, 0, 0, 0)
  const dateSet = new Set(completions.map(c => c.completed_date))

  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0]
    if (dateSet.has(dateStr)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else break
  }
  return streak
}

// ── HABIT MODAL ───────────────────────────────────────────
window.openHabitModal = async function(habitId = null) {
  let habit = null
  if (habitId) {
    const { data } = await supabase.from('habits').select('*').eq('id', habitId).single()
    habit = data
  }

  document.getElementById('habit-modal')?.remove()

  // Determine current schedule type
  const freq = habit?.frequency || 'daily'
  let scheduleType = 'weekly'
  if (freq.startsWith('interval:')) scheduleType = 'interval'
  else if (freq.startsWith('monthly:')) scheduleType = 'monthly'
  else if (freq.startsWith('yearly:')) scheduleType = 'yearly'

  const selectedDays = scheduleType === 'weekly'
    ? (freq === 'daily' ? DAY_NAMES : freq === 'weekdays'
        ? ['mon','tue','wed','thu','fri'] : freq === 'weekends'
        ? ['sat','sun'] : freq.split(','))
    : DAY_NAMES

  const intervalDays = freq.startsWith('interval:') ? freq.split(':')[1] : '14'
  const monthlyDay   = freq.startsWith('monthly:')  ? freq.split(':')[1] : '1'
  const yearlyMmdd   = freq.startsWith('yearly:')   ? freq.split(':')[1] : '01-01'
  const [yearlyMonth, yearlyDay] = yearlyMmdd.split('-')

  const modal = document.createElement('div')
  modal.id = 'habit-modal'
  modal.className = 'popup'
  modal.innerHTML = `
    <div class="popup-box popup-box--wide">
      <div class="popup-header">
        <div class="popup-title">${habit ? 'Edit habit' : 'New habit'}</div>
        <button class="popup-close" onclick="closeHabitModal()">✕</button>
      </div>

      <div class="edit-field">
        <label class="edit-label">Name</label>
        <input class="popup-input" id="habit-name-input"
               placeholder="e.g. Morning run" value="${habit?.name || ''}" />
      </div>

      <div class="edit-field">
        <label class="edit-label">Schedule type</label>
        <div class="edit-type-row" id="schedule-type-row">
          <button class="edit-type-btn ${scheduleType === 'weekly'   ? 'active' : ''}" data-type="weekly"   onclick="switchScheduleType('weekly')">Weekly</button>
          <button class="edit-type-btn ${scheduleType === 'interval' ? 'active' : ''}" data-type="interval" onclick="switchScheduleType('interval')">Every X days</button>
          <button class="edit-type-btn ${scheduleType === 'monthly'  ? 'active' : ''}" data-type="monthly"  onclick="switchScheduleType('monthly')">Monthly</button>
          <button class="edit-type-btn ${scheduleType === 'yearly'   ? 'active' : ''}" data-type="yearly"   onclick="switchScheduleType('yearly')">Yearly</button>
        </div>
      </div>

      <!-- Weekly picker -->
      <div id="schedule-weekly" class="edit-field" style="display:${scheduleType === 'weekly' ? 'flex' : 'none'};flex-direction:column;gap:8px;">
        <div class="habit-day-picker">
          ${DAY_NAMES.map((d, i) => `
            <button class="habit-day-btn ${selectedDays.includes(d) ? 'active' : ''}"
                    data-day="${d}" onclick="toggleHabitDay(this)">
              ${DAY_LABELS[i]}
            </button>
          `).join('')}
        </div>
        <div class="habit-presets">
          <button class="habit-preset-btn" onclick="setHabitPreset('daily')">Every day</button>
          <button class="habit-preset-btn" onclick="setHabitPreset('weekdays')">Weekdays</button>
          <button class="habit-preset-btn" onclick="setHabitPreset('weekends')">Weekends</button>
        </div>
      </div>

      <!-- Interval picker -->
      <div id="schedule-interval" class="edit-field" style="display:${scheduleType === 'interval' ? 'flex' : 'none'};flex-direction:column;gap:8px;">
        <label class="edit-label">Repeat every</label>
        <div style="display:flex;align-items:center;gap:10px;">
          <input class="popup-input" id="interval-days-input" type="number" min="1" max="365"
                 value="${intervalDays}" style="width:80px;" />
          <span style="font-size:13px;color:var(--text-dim);">days</span>
        </div>
        <div class="habit-presets">
          <button class="habit-preset-btn" onclick="document.getElementById('interval-days-input').value=7">Weekly</button>
          <button class="habit-preset-btn" onclick="document.getElementById('interval-days-input').value=14">Biweekly</button>
          <button class="habit-preset-btn" onclick="document.getElementById('interval-days-input').value=30">Monthly</button>
          <button class="habit-preset-btn" onclick="document.getElementById('interval-days-input').value=90">Quarterly</button>
          <button class="habit-preset-btn" onclick="document.getElementById('interval-days-input').value=365">Yearly</button>
        </div>
      </div>

      <!-- Monthly picker -->
      <div id="schedule-monthly" class="edit-field" style="display:${scheduleType === 'monthly' ? 'flex' : 'none'};flex-direction:column;gap:8px;">
        <label class="edit-label">Day of month</label>
        <div style="display:flex;align-items:center;gap:10px;">
          <input class="popup-input" id="monthly-day-input" type="number" min="1" max="31"
                 value="${monthlyDay}" style="width:80px;" />
          <span style="font-size:13px;color:var(--text-dim);">of every month</span>
        </div>
      </div>

      <!-- Yearly picker -->
      <div id="schedule-yearly" class="edit-field" style="display:${scheduleType === 'yearly' ? 'flex' : 'none'};flex-direction:column;gap:8px;">
        <label class="edit-label">Date each year</label>
        <div style="display:flex;align-items:center;gap:10px;">
          <select class="popup-input" id="yearly-month-input" style="width:130px;">
            ${['January','February','March','April','May','June','July','August','September','October','November','December']
              .map((m, i) => `<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0') === yearlyMonth ? 'selected' : ''}>${m}</option>`)
              .join('')}
          </select>
          <input class="popup-input" id="yearly-day-input" type="number" min="1" max="31"
                 value="${parseInt(yearlyDay)}" style="width:70px;" />
        </div>
      </div>

      <div class="edit-field">
        <label class="edit-label">Reminder time (optional)</label>
        <input class="popup-input" id="habit-reminder-input" type="time"
               value="${habit?.reminder_time ? habit.reminder_time.substring(0,5) : ''}" />
      </div>

      <div class="popup-actions">
        ${habit ? `<button class="popup-btn popup-btn--danger" onclick="deleteHabit('${habit.id}')">Delete</button>` : '<div></div>'}
        <div style="display:flex;gap:8px;">
          <button class="popup-btn" onclick="closeHabitModal()">Cancel</button>
          <button class="popup-btn popup-btn--primary" onclick="saveHabit('${habitId || ''}')">Save</button>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) closeHabitModal() })
  document.getElementById('habit-name-input').focus()
}

window.switchScheduleType = function(type) {
  document.querySelectorAll('#schedule-type-row .edit-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type)
  })
  ;['weekly','interval','monthly','yearly'].forEach(t => {
    const el = document.getElementById('schedule-' + t)
    if (el) el.style.display = t === type ? 'flex' : 'none'
  })
}

window.toggleHabitDay = function(btn) {
  btn.classList.toggle('active')
}

window.setHabitPreset = function(preset) {
  const btns = document.querySelectorAll('.habit-day-btn')
  if (preset === 'daily') {
    btns.forEach(b => b.classList.add('active'))
  } else if (preset === 'weekdays') {
    btns.forEach(b => b.classList.toggle('active', !['sat','sun'].includes(b.dataset.day)))
  } else if (preset === 'weekends') {
    btns.forEach(b => b.classList.toggle('active', ['sat','sun'].includes(b.dataset.day)))
  }
}

window.closeHabitModal = function() {
  document.getElementById('habit-modal')?.remove()
}

window.saveHabit = async function(habitId) {
  const name = document.getElementById('habit-name-input').value.trim()
  if (!name) return

  const activeType = document.querySelector('#schedule-type-row .edit-type-btn.active')?.dataset.type || 'weekly'

  let frequency = 'daily'

  if (activeType === 'weekly') {
    const activeDays = [...document.querySelectorAll('.habit-day-btn.active')].map(b => b.dataset.day)
    frequency = activeDays.length === 7 ? 'daily' : activeDays.join(',')

  } else if (activeType === 'interval') {
    const days = parseInt(document.getElementById('interval-days-input').value) || 1
    const startDate = new Date().toISOString().split('T')[0]
    // Preserve existing start date if editing
    if (habitId) {
      const { data: existing } = await supabase.from('habits').select('frequency').eq('id', habitId).single()
      const existingStart = existing?.frequency?.startsWith('interval:') ? existing.frequency.split(':')[2] : null
      frequency = `interval:${days}:${existingStart || startDate}`
    } else {
      frequency = `interval:${days}:${startDate}`
    }

  } else if (activeType === 'monthly') {
    const day = parseInt(document.getElementById('monthly-day-input').value) || 1
    frequency = `monthly:${day}`

  } else if (activeType === 'yearly') {
    const month = document.getElementById('yearly-month-input').value
    const day   = String(parseInt(document.getElementById('yearly-day-input').value)).padStart(2, '0')
    frequency = `yearly:${month}-${day}`
  }

  const timeVal = document.getElementById('habit-reminder-input').value
  const payload = {
    name,
    frequency,
    reminder_time: timeVal || null,
    has_reminder: !!timeVal
  }

  if (habitId) {
    await supabase.from('habits').update(payload).eq('id', habitId)
  } else {
    await supabase.from('habits').insert({ ...payload, streak: 0, position: 0 })
  }

  closeHabitModal()
  initHabits()
}

window.deleteHabit = async function(habitId) {
  if (!confirm('Delete this habit?')) return
  await supabase.from('habits').delete().eq('id', habitId)
  closeHabitModal()
  initHabits()
}