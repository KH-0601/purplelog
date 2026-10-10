// Supabase Edge Function: every few minutes, find doses that are overdue and not recorded,
// and send a Web Push to every member device. Repeats every REMIND_MIN minutes per item until a
// dose log appears. Runs with the service role (bypasses RLS) — schedule it with Supabase Cron.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:koz2030@gmail.com'
const REMIND_MIN = Number(Deno.env.get('REMIND_MIN') ?? '30')
const CRON_SECRET = Deno.env.get('CRON_SECRET')

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
const sb = createClient(SUPABASE_URL, SERVICE_KEY)
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token' }

type Doc = { tbl: string; id: string; body: Record<string, unknown>; deleted: boolean }
type Med = { id: string; dogId: string; generic: string; kind: string; endDate?: string; doses: { date: string; timesPerDay: number; mgPerDose?: number }[]; scheduleTimes?: string[] }
type Plan = { id: string; dogId: string; generic: string; time: string; doneLogId?: string; cancelled?: boolean; mgPerDose?: number }
type Log = { medicationId: string; time: string; slot?: string }
type Dog = { id: string; name: string; tz?: string }

const NAMES: Record<string, string> = { phenobarbital: 'フェノバルビタール', potassium_bromide: '臭化カリウム', zonisamide: 'ゾニサミド', levetiracetam: 'レベチラセタム', gabapentin: 'ガバペンチン' }
const defaultSchedule = (n: number) => (n >= 3 ? ['07:00', '15:00', '23:00'] : n === 2 ? ['08:00', '20:00'] : ['08:00'])

/** Local wall-clock "YYYY-MM-DDTHH:MM" for a tz, from a Date. */
function localIso(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`
}
/** Minutes between two local wall-clock strings (same tz). */
const minutesBetween = (a: string, b: string) => (new Date(b + ':00Z').getTime() - new Date(a + ':00Z').getTime()) / 60000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // Test mode: a signed-in member asks for an immediate test push to their own devices.
  const userJwt = req.headers.get('x-user-token')
  if (userJwt) {
    const me = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${userJwt}` } } })
    const { data: u } = await me.auth.getUser()
    if (!u?.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })
    const { data: subs } = await sb.from('push_subscriptions').select('id,subscription').eq('user_id', u.user.id)
    const payload = JSON.stringify({ title: 'テスト通知', body: 'この端末にプッシュ通知が届いています。投薬の予定時刻を過ぎると同じ形で届きます。', tag: 'purplelog-test', url: './' })
    let ok = 0
    const errors: string[] = []
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(s.subscription, payload)
        ok++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        errors.push(String(code ?? (e as Error).message))
        if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
    return new Response(JSON.stringify({ devices: subs?.length ?? 0, sent: ok, errors }), { headers: { ...cors, 'content-type': 'application/json' } })
  }
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('unauthorized', { status: 401 })
  const { data: docs, error } = await sb.from('docs').select('tbl,id,body,deleted').in('tbl', ['dogs', 'medications', 'dosePlans', 'doseLogs']).eq('deleted', false)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  const by = (t: string) => (docs as Doc[]).filter((d) => d.tbl === t).map((d) => d.body)
  const dogs = by('dogs') as Dog[]
  const meds = by('medications') as Med[]
  const plans = by('dosePlans') as Plan[]
  const logs = by('doseLogs') as Log[]
  const now = new Date()

  const due: { key: string; dogId: string; text: string; minutes: number }[] = []
  for (const dog of dogs) {
    const tz = dog.tz || 'Asia/Tokyo'
    const nowLocal = localIso(now, tz)
    const today = nowLocal.slice(0, 10)
    for (const m of meds.filter((x) => x.dogId === dog.id && x.kind === 'maintenance' && (!x.endDate || x.endDate >= today))) {
      const last = [...(m.doses ?? [])].sort((a, b) => a.date.localeCompare(b.date)).pop()
      const slots = m.scheduleTimes?.length ? m.scheduleTimes : defaultSchedule(last?.timesPerDay ?? 2)
      for (const slot of slots) {
        const dueAt = `${today}T${slot}`
        const mins = minutesBetween(dueAt, nowLocal)
        if (mins <= 0) continue
        const given = logs.some((l) => l.medicationId === m.id && l.time.startsWith(today) && (l.slot === slot || (!l.slot && Math.abs(Number(l.time.slice(11, 13)) - Number(slot.slice(0, 2))) <= 3)))
        if (!given) due.push({ key: `r:${m.id}:${dueAt}`, dogId: dog.id, text: `${dog.name}: ${NAMES[m.generic] ?? m.generic} ${slot}`, minutes: mins })
      }
    }
    for (const p of plans.filter((x) => x.dogId === dog.id && !x.doneLogId && !x.cancelled)) {
      const mins = minutesBetween(p.time.slice(0, 16), nowLocal)
      if (mins > 0) due.push({ key: `p:${p.id}`, dogId: dog.id, text: `${dog.name}: ${NAMES[p.generic] ?? p.generic}（頓服）${p.time.slice(5, 16).replace('T', ' ')}`, minutes: mins })
    }
  }
  if (!due.length) return new Response(JSON.stringify({ due: 0 }))

  // throttle per item
  const { data: states } = await sb.from('reminder_state').select('key,last_sent').in('key', due.map((d) => d.key))
  const lastSent = new Map((states ?? []).map((s: { key: string; last_sent: string }) => [s.key, new Date(s.last_sent).getTime()]))
  const toSend = due.filter((d) => !lastSent.has(d.key) || now.getTime() - lastSent.get(d.key)! >= REMIND_MIN * 60000)
  if (!toSend.length) return new Response(JSON.stringify({ due: due.length, sent: 0 }))

  const { data: subs } = await sb.from('push_subscriptions').select('id,subscription')
  const payload = JSON.stringify({ title: '投薬の時間です', body: toSend.map((d) => `${d.text}（${Math.round(d.minutes)}分経過）`).join('\n'), tag: 'purplelog-dose', url: './' })
  let ok = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.subscription, payload)
      ok++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id)
    }
  }
  await sb.from('reminder_state').upsert(toSend.map((d) => ({ key: d.key, last_sent: now.toISOString() })))
  return new Response(JSON.stringify({ due: due.length, sent: toSend.length, devices: ok }))
})
