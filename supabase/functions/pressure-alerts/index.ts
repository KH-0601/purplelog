// Supabase Edge Function: every 15 minutes, look at the pressure forecast for each dog's grid cell and
// send one push notification shortly before a "warning" 6-hour block (a sharp pressure drop) begins.
// Thresholds and lead time are per dog (Dog.pressureAlert), with app defaults below. Runs via Supabase Cron.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:koz2030@gmail.com'
const CRON_SECRET = Deno.env.get('CRON_SECRET')
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// app guide values (same as the app's src/lib/pressure.ts): hPa fall within a 6-hour block (03-09, 09-15, 15-21, 21-03)
const DEFAULT_WARN = 3.5
const DEFAULT_LEAD_H = 2
const BLOCK_H = 6

type Dog = { id: string; name: string; tz?: string; gridLat?: number; gridLon?: number; pressureAlert?: { enabled?: boolean; warn6?: number; leadHours?: number } }

const grid = (x: number) => Math.round(x * 4) / 4
const localMs = (iso: string) => new Date(iso.slice(0, 16) + ':00Z').getTime()
function localIso(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('unauthorized', { status: 401 })
  const { data: docs, error } = await sb.from('docs').select('body').eq('tbl', 'dogs').eq('deleted', false)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  const dogs = (docs ?? []).map((d: { body: Dog }) => d.body).filter((d) => d.gridLat != null && d.gridLon != null && d.pressureAlert?.enabled !== false)

  // one forecast per grid cell
  const byCell = new Map<string, Dog[]>()
  for (const d of dogs) {
    const k = `${grid(d.gridLat!)},${grid(d.gridLon!)},${d.tz || 'Asia/Tokyo'}`
    byCell.set(k, [...(byCell.get(k) ?? []), d])
  }

  const messages: { key: string; title: string; body: string }[] = []
  for (const [cell, cellDogs] of byCell) {
    const [lat, lon, tz] = cell.split(',')
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=pressure_msl&forecast_days=2&timezone=${encodeURIComponent(tz)}`)
    if (!r.ok) continue
    const j = await r.json()
    const time: string[] = j.hourly.time
    const p: (number | null)[] = j.hourly.pressure_msl
    const nowLocal = localIso(new Date(), tz)
    for (const dog of cellDogs) {
      const warn = dog.pressureAlert?.warn6 ?? DEFAULT_WARN
      const lead = dog.pressureAlert?.leadHours ?? DEFAULT_LEAD_H
      // first warning block (6-hour block starting at 03, 09, 15, 21 local) that starts within the lead time
      for (let i = 0; i + BLOCK_H < time.length; i++) {
        if (Number(time[i].slice(11, 13)) % BLOCK_H !== 3) continue
        const a = p[i], b = p[i + BLOCK_H]
        if (a == null || b == null) continue
        const drop = +(b - a).toFixed(1)
        if (-drop < warn) continue
        const minsAhead = (localMs(time[i]) - localMs(nowLocal)) / 60000
        if (minsAhead < 0 || minsAhead > lead * 60) continue
        const h1 = Number(time[i].slice(11, 13)), h2 = Number(time[i + BLOCK_H].slice(11, 13)) || 24
        messages.push({
          key: `pw:${dog.id}:${time[i]}`,
          title: '気圧が急に下がる見込みです',
          body: `${dog.name}: ${h1}時〜${h2}時に気圧が ${drop} hPa 下がる予報（警戒）`,
        })
        break
      }
    }
  }
  if (!messages.length) return new Response(JSON.stringify({ dogs: dogs.length, due: 0 }))

  // send each warning only once
  const { data: states } = await sb.from('reminder_state').select('key').in('key', messages.map((m) => m.key))
  const sent = new Set((states ?? []).map((s: { key: string }) => s.key))
  const fresh = messages.filter((m) => !sent.has(m.key))
  if (!fresh.length) return new Response(JSON.stringify({ dogs: dogs.length, due: messages.length, sent: 0 }))

  const { data: subs } = await sb.from('push_subscriptions').select('id,subscription')
  const payload = JSON.stringify({ title: fresh[0].title, body: fresh.map((m) => m.body).join('\n'), tag: 'purplelog-pressure', url: './#/pressure' })
  let ok = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.subscription, payload, { TTL: 3600, urgency: 'high', topic: 'purplelog-pressure' })
      ok++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id)
    }
  }
  await sb.from('reminder_state').upsert(fresh.map((m) => ({ key: m.key, last_sent: new Date().toISOString() })))
  return new Response(JSON.stringify({ dogs: dogs.length, due: messages.length, sent: fresh.length, devices: ok }))
})
