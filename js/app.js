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
  if (window.innerWidth > 1024) return

  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'))
  if (btn) btn.classList.add('active')

  if (view === 'calendar') {
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    document.querySelector('.sidebar-row[data-view="calendar"]')?.classList.add('active')
    initCalendar()
    setTimeout(() => { if (window.setCalView) window.setCalView('week') }, 0)

  } else if (view === 'habits') {
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    document.querySelector('.sidebar-row[data-view="habits"]')?.classList.add('active')
    initHabits()

  } else if (view === 'today') {
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    document.querySelector('.sidebar-row[data-view="calendar"]')?.classList.add('active')
    initCalendar()
    setTimeout(() => { if (window.setCalView) window.setCalView('day') }, 0)

  } else if (view === 'workspaces') {
    showMobileWorkspaces()

  } else if (view === 'settings') {
    document.querySelectorAll('.sidebar-row[data-view]').forEach(r => r.classList.remove('active'))
    openSettings()
  }
}

// ── MOBILE WORKSPACES SIDEBAR ─────────────────────────────
function showMobileWorkspaces () {
  if (document.getElementById('mobile-sidebar-backdrop')) return

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
    const isNote = e.target.closest('.sidebar-note-item')
    const folderRow = e.target.closest('.folder-row')

    if (isNote) {
      setTimeout(close, 100)
      return
    }

    if (folderRow) {
      const isNotesFolder = folderRow.classList.contains('folder-row--notes')
      if (!isNotesFolder) {
        setTimeout(close, 100)
      }
    }
  }

  backdrop.addEventListener('click', close)
  sidebar.addEventListener('click', handleSidebarClick)
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────
const VAPID_PUBLIC_KEY = 'BJ9zUi4S9Xh_sBhkMdHipI84Lpavm-zG_mu7x54cB_WFRvpsZZttuPZJL-WOBHrs09n8bGp3IBz0oie4XuN_3xQ'

async function registerPushNotifications () {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const registration = await navigator.serviceWorker.ready
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
    const existing = await registration.pushManager.getSubscription()
    if (existing) { await saveSubscription(existing); return }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
    await saveSubscription(subscription)
  } catch (err) { console.warn('Push failed:', err) }
}

async function saveSubscription(subscription) {
  const sub = subscription.toJSON()
  const res = await fetch('/save-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys })
  })
  console.log('save-subscription response:', res.status, await res.text())
}

function urlBase64ToUint8Array (base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

setTimeout(registerPushNotifications, 3000)

// ── DRAG TO REORDER ───────────────────────────────────
function makeDraggable(container, selector) {
  let dragSrc = null

  container.addEventListener('dragstart', e => {
    const el = e.target.closest(selector)
    if (!el) return
    dragSrc = el
    el.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
  })

  container.addEventListener('dragend', e => {
    const el = e.target.closest(selector)
    if (!el) return
    el.classList.remove('dragging')
    container.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'))
    dragSrc = null
  })

  container.addEventListener('dragover', e => {
    e.preventDefault()
    const el = e.target.closest(selector)
    if (!el || el === dragSrc) return
    container.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'))
    el.classList.add('drag-over')
  })

  container.addEventListener('drop', e => {
    e.preventDefault()
    const el = e.target.closest(selector)
    if (!el || el === dragSrc || !dragSrc) return
    el.classList.remove('drag-over')
    const parent = el.parentNode
    const siblings = [...parent.children]
    const srcIdx = siblings.indexOf(dragSrc)
    const tgtIdx = siblings.indexOf(el)
    if (srcIdx < tgtIdx) {
      parent.insertBefore(dragSrc, el.nextSibling)
    } else {
      parent.insertBefore(dragSrc, el)
    }
  })
}

// Wire up drag on sidebar elements
setTimeout(() => {
  // Workspaces
  const wsList = document.getElementById('workspace-list')
  if (wsList) {
    wsList.querySelectorAll('.workspace-item').forEach(el => el.setAttribute('draggable', 'true'))
    makeDraggable(wsList, '.workspace-item')
  }

  // Folders — observe for dynamic additions
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.folder-item').forEach(el => el.setAttribute('draggable', 'true'))
    document.querySelectorAll('.workspace-body').forEach(body => {
      if (!body.dataset.dragInit) {
        body.dataset.dragInit = '1'
        makeDraggable(body, '.folder-item')
      }
    })
  })
  observer.observe(document.querySelector('.sidebar') || document.body, { childList: true, subtree: true })
}, 500)

// Tasks
window.initTaskDrag = function(listEl) {
  if (!listEl) return
  listEl.querySelectorAll('.task-row').forEach(el => el.setAttribute('draggable', 'true'))
  makeDraggable(listEl, '.task-row')
}