import { supabase } from './supabase.js'

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
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

  // Split into today's habits and other habits
  const todayHabits  = habits.filter(h => isScheduledToday(h.frequency, dayOfWeek))
  const otherHabits  = habits.filter(h => !isScheduledToday(h.frequency, dayOfWeek))

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

function isScheduledToday(frequency, dayOfWeek) {
  if (frequency === 'daily') return true
  if (frequency === 'weekdays') return !['sat', 'sun'].includes(dayOfWeek)
  if (frequency === 'weekends') return ['sat', 'sun'].includes(dayOfWeek)
  return frequency.split(',').includes(dayOfWeek)
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
          ${habit.streak > 0 ? `<span class="habit-streak">🔥 ${habit.streak} day streak</span>` : ''}
          ${habit.reminder_time ? `<span class="habit-reminder">⏰ ${habit.reminder_time.substring(0,5)}</span>` : ''}
        </div>
      </div>
      <button class="habit-edit-btn" onclick="openHabitModal('${habit.id}')">⋯</button>
    </div>
  `
}

function getFreqLabel(frequency) {
  if (frequency === 'daily') return 'Every day'
  if (frequency === 'weekdays') return 'Weekdays'
  if (frequency === 'weekends') return 'Weekends'
  const days = frequency.split(',')
  if (days.length === 7) return 'Every day'
  return days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')
}

// ── TOGGLE HABIT ──────────────────────────────────────────
window.toggleHabit = async function(habitId, today) {
  const row      = document.getElementById('hr-' + habitId)
  const checkEl  = row?.querySelector('.habit-check')
  const nameEl   = row?.querySelector('.habit-name')
  const isDone   = checkEl?.classList.contains('done')

  if (isDone) {
    await supabase
      .from('habit_completions')
      .delete()
      .eq('habit_id', habitId)
      .eq('completed_date', today)

    checkEl.classList.remove('done')
    checkEl.textContent = ''
    nameEl?.classList.remove('done')
    row?.classList.remove('habit-row--done')
  } else {
    await supabase
      .from('habit_completions')
      .insert({ habit_id: habitId, completed_date: today })
      .select()

    // Update streak
    const { data: recent } = await supabase
      .from('habit_completions')
      .select('completed_date')
      .eq('habit_id', habitId)
      .order('completed_date', { ascending: false })
      .limit(30)

    const streak = calculateStreak(recent || [])

    await supabase
      .from('habits')
      .update({ streak })
      .eq('id', habitId)

    checkEl.classList.add('done')
    checkEl.textContent = '✓'
    nameEl?.classList.add('done')
    row?.classList.add('habit-row--done')

    // Update streak display
    const streakEl = row?.querySelector('.habit-streak')
    if (streakEl) {
      streakEl.textContent = `🔥 ${streak} day streak`
    } else {
      const metaEl = row?.querySelector('.habit-meta')
      if (metaEl) {
        const span = document.createElement('span')
        span.className = 'habit-streak'
        span.textContent = `🔥 ${streak} day streak`
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
    } else {
      break
    }
  }

  return streak
}

// ── ADD / EDIT HABIT MODAL ────────────────────────────────
window.openHabitModal = async function(habitId = null) {
  let habit = null

  if (habitId) {
    const { data } = await supabase
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .single()
    habit = data
  }

  document.getElementById('habit-modal')?.remove()

  const selectedDays = habit
    ? (habit.frequency === 'daily' ? DAY_NAMES : habit.frequency.split(','))
    : DAY_NAMES

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
        <input class="popup-input" id="habit-name-input" placeholder="e.g. Morning run" value="${habit?.name || ''}" />
      </div>

      <div class="edit-field">
        <label class="edit-label">Schedule</label>
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

window.toggleHabitDay = function(btn) {
  btn.classList.toggle('active')
}

window.setHabitPreset = function(preset) {
  const btns = document.querySelectorAll('.habit-day-btn')
  if (preset === 'daily') {
    btns.forEach(b => b.classList.add('active'))
  } else if (preset === 'weekdays') {
    btns.forEach(b => {
      const day = b.dataset.day
      b.classList.toggle('active', !['sat', 'sun'].includes(day))
    })
  } else if (preset === 'weekends') {
    btns.forEach(b => {
      const day = b.dataset.day
      b.classList.toggle('active', ['sat', 'sun'].includes(day))
    })
  }
}

window.closeHabitModal = function() {
  document.getElementById('habit-modal')?.remove()
}

window.saveHabit = async function(habitId) {
  const name = document.getElementById('habit-name-input').value.trim()
  if (!name) return

  const activeDays = [...document.querySelectorAll('.habit-day-btn.active')].map(b => b.dataset.day)
  const frequency  = activeDays.length === 7 ? 'daily' : activeDays.join(',')
  const timeVal    = document.getElementById('habit-reminder-input').value

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