export function initPanel() {
  const panel = document.getElementById('right-panel')
  const panelTab = document.getElementById('panel-tab')
  const panelToggle = document.getElementById('panel-toggle')

  function openPanel() {
    panel.classList.remove('hide')
    panelTab.classList.remove('show')
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