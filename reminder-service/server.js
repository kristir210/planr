import express from 'express'
import webpush from 'web-push'

const app = express()

webpush.setVapidDetails(
  'mailto:kristervestland@hotmail.no',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

app.get('/', (_req, res) => res.send('planr-reminders running'))

app.get('/send-reminders', async (_req, res) => {
  try {
    const nowUTC = new Date()
    const nowNorway = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }))
    const pad = n => String(n).padStart(2, '0')

    const norwayWindowStart = `${pad(nowNorway.getHours())}:${pad(nowNorway.getMinutes())}`
    const norwayWindowEnd = new Date(nowNorway.getTime() + 60000)
    const norwayWindowEndTime = `${pad(norwayWindowEnd.getHours())}:${pad(norwayWindowEnd.getMinutes())}`

    const utcWindowStart = `${pad(nowUTC.getUTCHours())}:${pad(nowUTC.getUTCMinutes())}`
    const utcWindowEnd = new Date(nowUTC.getTime() + 60000)
    const utcWindowEndTime = `${pad(utcWindowEnd.getUTCHours())}:${pad(utcWindowEnd.getMinutes())}`

    const utcToday = `${nowUTC.getUTCFullYear()}-${pad(nowUTC.getUTCMonth() + 1)}-${pad(nowUTC.getUTCDate())}`

    const headers = {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }

    const subsRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, { headers })
    const subs = await subsRes.json()
    if (!subs?.length) return res.send('No subscriptions')

    const habitsRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/habits?select=*&reminder_time=not.is.null&order=position`, { headers })
    const habits = await habitsRes.json()

    const tasksRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/tasks?select=id,title,reminder_time&done=eq.false&notify=eq.true&reminder_time=gte.${utcToday}T00:00:00&reminder_time=lte.${utcToday}T23:59:59`, { headers })
    const tasks = await tasksRes.json()

    const dayOfWeekMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const dayOfWeek = dayOfWeekMap[nowNorway.getDay()]
    const notifications = []

    for (const habit of (habits || [])) {
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

      if (!scheduledToday) continue
      const reminderTime = habit.reminder_time.substring(0, 5)
      if (reminderTime >= norwayWindowStart && reminderTime < norwayWindowEndTime) {
        notifications.push({ title: '🔁 Habit reminder', body: habit.name, tag: `habit-${habit.id}` })
      }
    }

    for (const task of (tasks || [])) {
      if (!task.reminder_time) continue
      const reminderTime = task.reminder_time.substring(11, 16)
      if (reminderTime >= utcWindowStart && reminderTime < utcWindowEndTime) {
        notifications.push({ title: '📋 Task reminder', body: task.title, tag: `task-${task.id}` })
      }
    }

    if (!notifications.length) {
      return res.send(`No notifications due. UTC: ${utcWindowStart}-${utcWindowEndTime}. Norway: ${norwayWindowStart}-${norwayWindowEndTime}`)
    }

    const errors = []
    for (const sub of subs) {
      for (const notif of notifications) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(notif)
          )
        } catch (err) {
          errors.push(`${sub.endpoint.substring(0, 30)}: ${err.message}`)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
              method: 'DELETE', headers
            })
          }
        }
      }
    }

    res.send(`Done. Notifications: ${notifications.length}. Errors: ${errors.join(' | ')}`)

  } catch (err) {
    res.status(500).send('Error: ' + err.message)
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`planr-reminders running on port ${PORT}`))