import { supabase } from './supabase.js'

let pin = ''

const dots = document.querySelectorAll('.pin-dot')
const error = document.getElementById('pin-error')
const keys = document.querySelectorAll('.pin-key[data-num]')
const deleteBtn = document.getElementById('pin-delete')

function updateDots() {
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < pin.length)
  })
}

function showError(msg) {
  error.textContent = msg
  setTimeout(() => { error.textContent = '' }, 2000)
}

async function checkPin() {
  const { data, error: err } = await supabase
    .from('settings')
    .select('pin_hash')
    .order('created_at')
    .limit(1)
    .single()

  if (err) {
    showError('Could not connect to database')
    return
  }

  if (pin === data.pin_hash) {
    sessionStorage.setItem('planr_auth', 'true')
    window.location.href = 'app.html'
  } else {
    showError('Incorrect PIN')
    pin = ''
    updateDots()
  }
}

keys.forEach(key => {
  key.addEventListener('click', () => {
    if (pin.length >= 6) return
    pin += key.dataset.num
    updateDots()
    if (pin.length === 6) checkPin()
  })
})

deleteBtn.addEventListener('click', () => {
  pin = pin.slice(0, -1)
  updateDots()
  error.textContent = ''
})

document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9' && pin.length < 6) {
    pin += e.key
    updateDots()
    if (pin.length === 6) checkPin()
  }
  if (e.key === 'Backspace') {
    pin = pin.slice(0, -1)
    updateDots()
  }
})