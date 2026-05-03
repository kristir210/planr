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

// ── MOBILE BOTTOM NAV ─────────────────────────────────────
window.mobileNav = function (view, btn) {
  // Only run on mobile
  if (window.innerWidth > 1024) return

  // Update active state on bottom nav buttons
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'))
  if (btn) btn.classList.add('active')

  if (view === 'calendar') {
    // Activate calendar in the sidebar too, then show it
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    document.querySelector('.sidebar-row[data-view="calendar"]')?.classList.add('active')
    initCalendar()
    setTimeout(() => { if (window.setCalView) window.setCalView('week') }, 0)

  } else if (view === 'habits') {
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    document.querySelector('.sidebar-row[data-view="habits"]')?.classList.add('active')
    initHabits()

  } else if (view === 'today') {
    // Switch calendar to day view showing today
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    document.querySelector('.sidebar-row[data-view="calendar"]')?.classList.add('active')
    initCalendar()
    setTimeout(() => { if (window.setCalView) window.setCalView('day') }, 0)

  } else if (view === 'workspaces') {
    // Show workspaces panel as a mobile overlay
    showMobileWorkspaces()

  } else if (view === 'settings') {
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    initSettings()
    showMobileSettings()
  }
}

// ── MOBILE WORKSPACES OVERLAY ─────────────────────────────
function showMobileWorkspaces () {
  const sidebar = document.querySelector('.sidebar')
  
  sidebar.style.cssText = `
    display: flex !important;
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 240px;
    z-index: 999;
    box-shadow: 4px 0 20px #00000080;
  `

  const backdrop = document.createElement('div')
  backdrop.id = 'mobile-sidebar-backdrop'
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 998;
  `
  document.body.appendChild(backdrop)

  const close = () => {
    sidebar.style.cssText = 'display: none !important;'
    backdrop.remove()
    sidebar.removeEventListener('click', handleSidebarClick)
  }

  const handleSidebarClick = (e) => {
    const folderRow = e.target.closest('.folder-row')
    if (folderRow) {
      // Let the original onclick fire first, then close
      setTimeout(close, 50)
    }
  }

  backdrop.addEventListener('click', close)
  sidebar.addEventListener('click', handleSidebarClick)
}

// ── MOBILE SETTINGS OVERLAY ───────────────────────────────
function showMobileSettings () {
  document.querySelector('.mobile-overlay')?.remove()

  const overlay = document.createElement('div')
  overlay.className = 'mobile-overlay'
  overlay.innerHTML = `
    <div class="mobile-overlay-panel">
      <div class="mobile-overlay-header">
        <span>Settings</span>
        <button class="mobile-overlay-close" onclick="this.closest('.mobile-overlay').remove()">✕</button>
      </div>
      <div class="mobile-overlay-body" id="mobile-settings-body">
        Loading…
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const sidebarSettings = document.querySelector('.settings-section, #settings-panel, .sidebar-settings')
  const body = overlay.querySelector('#mobile-settings-body')
  if (sidebarSettings) {
    body.innerHTML = sidebarSettings.innerHTML
  } else {
    body.innerHTML = '<p style="padding:1rem;opacity:.6">Settings coming soon.</p>'
  }

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove()
  })
}