import { initPanel } from './panel.js'
import { loadWorkspaces } from './workspaces.js'
import { initCalendar } from './calendar.js'
import { initHabits } from './habits.js'
import { initSettings } from './settings.js'

initPanel()
loadWorkspaces()
initSettings()

// ── DEFAULT VIEW: calendar week ───────────────────────────
document.querySelector('.sidebar-row[data-view="calendar"]')?.classList.add('active')
initCalendar()
setTimeout(() => { if (window.setCalView) window.setCalView('week') }, 0)

// ── SIDEBAR VIEW NAVIGATION ───────────────────────────────
document.querySelectorAll('.sidebar-row[data-view]').forEach(row => {
  row.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    row.classList.add('active')

    const view = row.dataset.view
    if (view === 'calendar') {
      initCalendar()
    } else if (view === 'habits') {
      initHabits()
    }
  })
})

// Wire up topbar Month/Week/Day buttons
document.querySelectorAll('.topbar-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (window.setCalView) window.setCalView(btn.dataset.view)
  })
})