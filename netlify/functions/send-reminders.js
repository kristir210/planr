import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

webpush.setVapidDetails(
  'mailto:kristervestland@hotmail.no',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

export default async function handler() {
  // Use Norwegian time (Europe/Oslo — UTC+2 in summer, UTC+1 in winter)
  const nowUTC = new Date()
  const norwayOffsetMs = nowUTC.toLocaleString('en-US', { timeZone: 'Europe/Oslo', hour12: false })
  const nowNorway = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }))
  
  const pad = n => String(n).padStart(2, '0')
  const todayStr = `${nowNorway.getFullYear()}-${pad(nowNorway.getMonth()+1)}-${pad(nowNorway.getDate())}`

  // 1 minute window
  const windowStartTime = `${pad(nowNorway.getHours())}:${pad(nowNorway.getMinutes())}`
  const windowEnd = new Date(nowNorway.getTime() + 1 * 60 * 1000)
  const windowEndTime = `${pad(windowEnd.getHours())}:${pad(windowEnd.getMinutes())}`

  // Load all push subscriptions
  const { data: subs } = await supabase.from('push_subscriptions').select('*')
  if (!subs || subs.length === 0) return

  const notifications = []

  // ── TASKS with reminder_time today ───────────────────────
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, reminder_time')
    .eq('done', false)
    .not('reminder_time', 'is', null)
    .gte('reminder_time', `${todayStr}T00:00:00`)
    .lte('reminder_time', `${todayStr}T23:59:59`)

  ;(tasks || []).forEach(task => {
    if (!task.reminder_time) return
    const reminderTime = task.reminder_time.substring(11, 16)
    if (reminderTime >= windowStartTime && reminderTime < windowEndTime) {
      notifications.push({
        title: '📋 Task reminder',
        body: task.title,
        tag: `task-${task.id}`
      })
    }
  })

  // ── HABITS with reminder_time in window ───────────────────
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, frequency, reminder_time')
    .not('reminder_time', 'is', null)

  const dayOfWeekMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dayOfWeek = dayOfWeekMap[nowNorway.getDay()]

  ;(habits || []).forEach(habit => {
    if (!habit.reminder_time) return

    const freq = habit.frequency
    let scheduledToday = false
    if (freq === 'daily') scheduledToday = true
    else if (freq === 'weekdays') scheduledToday = !['sat', 'sun'].includes(dayOfWeek)
    else if (freq === 'weekends') scheduledToday = ['sat', 'sun'].includes(dayOfWeek)
    else if (freq.startsWith('interval:')) {
      const parts = freq.split(':')
      const days = parseInt(parts[1])
      const start = parts[2] ? new Date(parts[2]) : new Date()
      const diff = Math.round((nowNorway - start) / (1000 * 60 * 60 * 24))
      scheduledToday = diff >= 0 && diff % days === 0
    } else if (freq.startsWith('monthly:')) {
      scheduledToday = nowNorway.getDate() === parseInt(freq.split(':')[1])
    } else if (freq.startsWith('yearly:')) {
      const [month, day] = freq.split(':')[1].split('-').map(Number)
      scheduledToday = nowNorway.getMonth() + 1 === month && nowNorway.getDate() === day
    } else {
      scheduledToday = freq.split(',').includes(dayOfWeek)
    }

    if (!scheduledToday) return

    const reminderTime = habit.reminder_time.substring(0, 5)
    if (reminderTime >= windowStartTime && reminderTime < windowEndTime) {
      notifications.push({
        title: '🔁 Habit reminder',
        body: habit.name,
        tag: `habit-${habit.id}`
      })
    }
  })

  if (notifications.length === 0) return

  await Promise.allSettled(
    subs.flatMap(sub =>
      notifications.map(async notif => {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }
        try {
          await webpush.sendNotification(pushSub, JSON.stringify(notif))
        } catch (err) {
          if (err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      })
    )
  )
}