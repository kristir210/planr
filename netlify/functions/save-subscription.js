import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { endpoint, keys } = await req.json()

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return new Response('Invalid subscription', { status: 400 })
  }

  await supabase.from('push_subscriptions').upsert({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth
  }, { onConflict: 'endpoint' })

  return new Response('OK', { status: 200 })
}