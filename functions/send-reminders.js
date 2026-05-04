
export async function onRequest(context) {
  const { env } = context

  try {
    const nowUTC = new Date()
    const nowNorway = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }))
    const pad = n => String(n).padStart(2, '0')
    const todayStr = `${nowNorway.getFullYear()}-${pad(nowNorway.getMonth()+1)}-${pad(nowNorway.getDate())}`
    const windowStartTime = `${pad(nowNorway.getHours())}:${pad(nowNorway.getMinutes())}`
    const windowEnd = new Date(nowNorway.getTime() + 1 * 60 * 1000)
    const windowEndTime = `${pad(windowEnd.getHours())}:${pad(windowEnd.getMinutes())}`

    const headers = {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }

    // Load subscriptions
    const subsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, { headers })
    const subs = await subsRes.json()
    if (!subs?.length) return new Response('No subscriptions', { status: 200 })

    // Load habits
    const habitsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/habits?select=*&reminder_time=not.is.null&order=position`, { headers })
    const habits = await habitsRes.json()

    // Load tasks
    const tasksRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tasks?select=id,title,reminder_time&done=eq.false&reminder_time=gte.${todayStr}T00:00:00&reminder_time=lte.${todayStr}T23:59:59`, { headers })
    const tasks = await tasksRes.json()

    const dayOfWeekMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const dayOfWeek = dayOfWeekMap[nowNorway.getDay()]
    const notifications = []

    // Check habits
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
      if (reminderTime >= windowStartTime && reminderTime < windowEndTime) {
        notifications.push({ title: '🔁 Habit reminder', body: habit.name, tag: `habit-${habit.id}` })
      }
    }

    // Check tasks
    for (const task of (tasks || [])) {
      if (!task.reminder_time) continue
      const reminderTime = task.reminder_time.substring(11, 16)
      if (reminderTime >= windowStartTime && reminderTime < windowEndTime) {
        notifications.push({ title: '📋 Task reminder', body: task.title, tag: `task-${task.id}` })
      }
    }

    if (!notifications.length) return new Response('No notifications', { status: 200 })

    // Send push notifications
    for (const sub of subs) {
      for (const notif of notifications) {
        try {
          await sendWebPush(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(notif),
            env.VAPID_PUBLIC_KEY,
            env.VAPID_PRIVATE_KEY
          )
        } catch (err) {
          if (err.message?.includes('410')) {
            await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
              method: 'DELETE', headers
            })
          }
        }
      }
    }

    return new Response('Done', { status: 200 })
  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 })
  }
}

async function sendWebPush(subscription, payload, vapidPublicKey, vapidPrivateKey) {
  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`

  const now = Math.floor(Date.now() / 1000)
  const vapidClaims = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: 'mailto:kristervestland@hotmail.no'
  }

  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const body = btoa(JSON.stringify(vapidClaims)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')

  const privateKeyBytes = base64UrlToUint8Array(vapidPrivateKey)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const signingInput = `${header}.${body}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const token = `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(signature))}`
  const vapidAuth = `vapid t=${token}, k=${vapidPublicKey}`

  const encoder = new TextEncoder()
  const payloadBytes = encoder.encode(payload)

  const p256dhBytes = base64UrlToUint8Array(subscription.keys.p256dh)
  const authBytes = base64UrlToUint8Array(subscription.keys.auth)

  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
  const serverPublicKey = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  const clientPublicKey = await crypto.subtle.importKey('raw', p256dhBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, [])

  const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPublicKey }, serverKeyPair.privateKey, 256)

  const salt = crypto.getRandomValues(new Uint8Array(16))

  const prk = await hkdf(authBytes, new Uint8Array(sharedSecret), encoder.encode('Content-Encoding: auth\0'), 32)
  const contentKey = await hkdf(salt, prk, await buildInfo('aesgcm', p256dhBytes, new Uint8Array(serverPublicKey)), 16)
  const contentNonce = await hkdf(salt, prk, await buildInfo('nonce', p256dhBytes, new Uint8Array(serverPublicKey)), 12)

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: contentNonce }, aesKey, payloadBytes)

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': vapidAuth,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${uint8ArrayToBase64Url(salt)}`,
      'Crypto-Key': `dh=${uint8ArrayToBase64Url(new Uint8Array(serverPublicKey))};${vapidAuth.split(',')[0].replace('vapid ', '')}`,
      'TTL': '86400'
    },
    body: encrypted
  })

  if (!response.ok && response.status !== 201) {
    throw new Error(`Push failed: ${response.status}`)
  }
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)
  return new Uint8Array(bits)
}

async function buildInfo(type, clientPublicKey, serverPublicKey) {
  const encoder = new TextEncoder()
  const base = encoder.encode(`Content-Encoding: ${type}\0P-256\0`)
  const result = new Uint8Array(base.length + 2 + clientPublicKey.length + 2 + serverPublicKey.length)
  result.set(base)
  result.set([0, clientPublicKey.length], base.length)
  result.set(clientPublicKey, base.length + 2)
  result.set([0, serverPublicKey.length], base.length + 2 + clientPublicKey.length)
  result.set(serverPublicKey, base.length + 2 + clientPublicKey.length + 2)
  return result
}

function base64UrlToUint8Array(base64url) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function uint8ArrayToBase64Url(arr) {
  return btoa(String.fromCharCode(...arr)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}