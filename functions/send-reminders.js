export async function onRequest(context) {
  const { env } = context

  try {
    const nowUTC = new Date()
    const nowNorway = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }))
    const pad = n => String(n).padStart(2, '0')

    const norwayWindowStart = `${pad(nowNorway.getHours())}:${pad(nowNorway.getMinutes())}`
    const norwayWindowEnd = new Date(nowNorway.getTime() + 60000)
    const norwayWindowEndTime = `${pad(norwayWindowEnd.getHours())}:${pad(norwayWindowEnd.getMinutes())}`

    const utcWindowStart = `${pad(nowUTC.getUTCHours())}:${pad(nowUTC.getUTCMinutes())}`
    const utcWindowEnd = new Date(nowUTC.getTime() + 60000)
    const utcWindowEndTime = `${pad(utcWindowEnd.getUTCHours())}:${pad(utcWindowEnd.getUTCMinutes())}`

    const utcToday = `${nowUTC.getUTCFullYear()}-${pad(nowUTC.getUTCMonth()+1)}-${pad(nowUTC.getUTCDate())}`

    const headers = {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }

    const subsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, { headers })
    const subs = await subsRes.json()
    if (!subs?.length) return new Response('No subscriptions', { status: 200 })

    const habitsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/habits?select=*&reminder_time=not.is.null&order=position`, { headers })
    const habits = await habitsRes.json()

    const tasksRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tasks?select=id,title,reminder_time&done=eq.false&reminder_time=gte.${utcToday}T00:00:00&reminder_time=lte.${utcToday}T23:59:59`, { headers })
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

    if (!notifications.length) return new Response(`No notifications. UTC: ${utcWindowStart}-${utcWindowEndTime}. Norway: ${norwayWindowStart}-${norwayWindowEndTime}`, { status: 200 })

    const errors = []
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
          errors.push(`${sub.endpoint.substring(0, 30)}: ${err.message}`)
          if (err.message?.includes('410')) {
            await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
              method: 'DELETE', headers
            })
          }
        }
      }
    }

    return new Response(`Done. Notifications: ${notifications.length}. Errors: ${errors.join(' | ')}`, { status: 200 })

  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 })
  }
}

async function sendWebPush(subscription, payload, vapidPublicKey, vapidPrivateKey) {
  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const now = Math.floor(Date.now() / 1000)

  // Build VAPID JWT
  const vapidClaims = { aud: audience, exp: now + 43200, sub: 'mailto:kristervestland@hotmail.no' }
  const headerB64 = toBase64Url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claimsB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(vapidClaims)))
  const signingInput = `${headerB64}.${claimsB64}`

  // Import VAPID private key as PKCS8
  const rawPrivKey = fromBase64Url(vapidPrivateKey)
  const pkcs8 = buildPkcs8(rawPrivKey)
  const signingKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(signingInput))
  const jwt = `${signingInput}.${toBase64Url(new Uint8Array(sig))}`

  // Encrypt payload using aes128gcm (RFC 8291)
  const p256dh = fromBase64Url(subscription.keys.p256dh)
  const auth = fromBase64Url(subscription.keys.auth)
  const payloadBytes = new TextEncoder().encode(payload)

  // Generate server ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPubKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey))

  // Import client public key
  const clientPubKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, [])

  // Derive shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPubKey }, serverKeyPair.privateKey, 256)
  const sharedSecret = new Uint8Array(sharedSecretBits)

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF to derive IKM (RFC 8291)
  const prk = await hkdfExtract(auth, sharedSecret)
  const keyInfoParts = [
    new TextEncoder().encode('WebPush: info\0'),
    p256dh,
    serverPubKeyRaw
  ]
  const keyInfo = concat(keyInfoParts)
  const ikm = await hkdfExpand(prk, keyInfo, 32)

  // Derive content encryption key and nonce
  const prkContent = await hkdfExtract(salt, ikm)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0')
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0')
  const cek = await hkdfExpand(prkContent, cekInfo, 16)
  const nonce = await hkdfExpand(prkContent, nonceInfo, 12)

  // Encrypt with AES-128-GCM
  // Add padding: 1 byte delimiter (0x02) at end
  const paddedPayload = new Uint8Array(payloadBytes.length + 1)
  paddedPayload.set(payloadBytes)
  paddedPayload[payloadBytes.length] = 2

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPayload))

  // Build aes128gcm content-encoding header (RFC 8188)
  // salt (16) + rs (4) + idlen (1) + server public key (65) + ciphertext
  const rs = 4096
  const header = new Uint8Array(16 + 4 + 1 + serverPubKeyRaw.length)
  header.set(salt, 0)
  header[16] = (rs >> 24) & 0xff
  header[17] = (rs >> 16) & 0xff
  header[18] = (rs >> 8) & 0xff
  header[19] = rs & 0xff
  header[20] = serverPubKeyRaw.length
  header.set(serverPubKeyRaw, 21)

  const body = concat([header, ciphertext])

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Urgency': 'normal'
    },
    body
  })

  if (!response.ok && response.status !== 201) {
    const text = await response.text()
    throw new Error(`Push failed: ${response.status} ${text}`)
  }
}

function buildPkcs8(rawKey) {
  const header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20
  ])
  const result = new Uint8Array(header.length + rawKey.length)
  result.set(header)
  result.set(rawKey, header.length)
  return result
}

async function hkdfExtract(salt, ikm) {
  const saltKey = await crypto.subtle.importKey('raw', salt, 'HMAC', false, ['sign'])
  const prk = await crypto.subtle.sign('HMAC', saltKey, ikm)
  return new Uint8Array(prk)
}

async function hkdfExpand(prk, info, length) {
  const key = await crypto.subtle.importKey('raw', prk, 'HMAC', false, ['sign'])
  const infoWithCounter = concat([info, new Uint8Array([1])])
  const t = await crypto.subtle.sign('HMAC', key, infoWithCounter)
  return new Uint8Array(t).slice(0, length)
}

function concat(arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { result.set(a, offset); offset += a.length }
  return result
}

function fromBase64Url(str) {
  const padding = '='.repeat((4 - str.length % 4) % 4)
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function toBase64Url(arr) {
  return btoa(String.fromCharCode(...arr)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}