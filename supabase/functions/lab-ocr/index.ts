// Supabase Edge Function: read a lab report image with Claude and return structured JSON.
// Requires secret ANTHROPIC_API_KEY. Only signed-in household members may call it.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!API_KEY) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 503, headers: cors })
  // The gateway checks the Authorization header (publishable key); the signed-in user's token comes in x-user-token.
  const userJwt = req.headers.get('x-user-token') ?? (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${userJwt}` } } })
  const { data: me } = await sb.auth.getUser()
  if (!me?.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })
  const { data: member } = await sb.from('members').select('user_id').eq('user_id', me.user.id).maybeSingle()
  if (!member) return new Response(JSON.stringify({ error: 'not a member' }), { status: 403, headers: cors })

  const { image, mime, prompt } = (await req.json()) as { image: string; mime: string; prompt: string }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: image } }, { type: 'text', text: prompt }] }],
    }),
  })
  if (!r.ok) return new Response(JSON.stringify({ error: 'anthropic ' + r.status, detail: await r.text() }), { status: 502, headers: cors })
  const j = await r.json()
  const text: string = (j.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')
  const m = text.match(/\{[\s\S]*\}/)
  try {
    return new Response(JSON.stringify(JSON.parse(m ? m[0] : text)), { headers: { ...cors, 'content-type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json', text }), { status: 422, headers: cors })
  }
})
