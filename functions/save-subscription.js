export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const { endpoint, keys } = await request.json()

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return new Response('Invalid subscription', { status: 400 })
    }

    const headers = {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
    }

    // Delete existing subscription with same endpoint first
    await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
      headers
    })

    // Insert fresh
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
    })

    if (!res.ok) {
      const err = await res.text()
      return new Response('Supabase error: ' + err, { status: 500 })
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 })
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}