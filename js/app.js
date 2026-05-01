import { initPanel } from './panel.js'
import { loadWorkspaces } from './workspaces.js'
import { initCalendar } from './calendar.js'

initPanel()
loadWorkspaces()

// ── SIDEBAR VIEW NAVIGATION ───────────────────────────────
document.querySelectorAll('.sidebar-row[data-view]').forEach(row => {
  row.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    row.classList.add('active')

    const view = row.dataset.view
    if (view === 'calendar') {
      initCalendar()
    } else if (view === 'habits') {
      document.getElementById('main-content').innerHTML =
        '<div class="main-placeholder">Habits view coming soon</div>'
    }
  })
})

// Wire up topbar Month/Week/Day buttons
document.querySelectorAll('.topbar-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (window.setCalView) window.setCalView(btn.dataset.view)
  })
})