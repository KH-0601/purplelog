/**
 * Dose reminders. Computes which planned / routine doses are overdue and raises an in-app alert
 * (banner + sound + vibration + system notification when the browser allows it) every N minutes
 * until the dose is marked as given. Works while the app is open; a closed app needs push (later).
 */
import type { DoseLog, DosePlan, Medication } from '../db'
import { currentDose, defaultSchedule, isActiveMed } from '../screens/shared'

export interface DueItem {
  key: string
  kind: 'routine' | 'plan'
  medicationId: string
  generic: string
  due: string // local ISO
  slot?: string
  planId?: string
  mgPerDose?: number
  overdueMin: number
}

export function computeDue(meds: Medication[], plans: DosePlan[], logs: DoseLog[], now: Date): DueItem[] {
  const today = toLocalISO(now).slice(0, 10)
  const out: DueItem[] = []
  for (const m of meds) {
    if (m.kind !== 'maintenance' || !isActiveMed(m, today)) continue
    const d = currentDose(m)
    const slots = m.scheduleTimes?.length ? m.scheduleTimes : defaultSchedule(d?.timesPerDay ?? 2)
    for (const slot of slots) {
      const due = `${today}T${slot}`
      const given = logs.some((l) => l.medicationId === m.id && l.time.startsWith(today) && (l.slot === slot || (!l.slot && Math.abs(Number(l.time.slice(11, 13)) - Number(slot.slice(0, 2))) <= 3)))
      if (given) continue
      const overdueMin = (now.getTime() - new Date(due).getTime()) / 60000
      if (overdueMin > 0) out.push({ key: `r:${m.id}:${due}`, kind: 'routine', medicationId: m.id, generic: m.generic, due, slot, mgPerDose: d?.mgPerDose, overdueMin })
    }
  }
  for (const p of plans) {
    if (p.doneLogId || p.cancelled) continue
    const overdueMin = (now.getTime() - new Date(p.time).getTime()) / 60000
    if (overdueMin > 0) out.push({ key: `p:${p.id}`, kind: 'plan', medicationId: p.medicationId, generic: p.generic, due: p.time, planId: p.id, mgPerDose: p.mgPerDose, overdueMin })
  }
  return out.sort((a, b) => a.due.localeCompare(b.due))
}

export function toLocalISO(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const LS = 'purplelog.alerted'
function loadAlerted(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LS) || '{}')
  } catch {
    return {}
  }
}
function saveAlerted(a: Record<string, number>) {
  try {
    const cutoff = Date.now() - 3 * 86400000
    for (const k of Object.keys(a)) if (a[k] < cutoff) delete a[k]
    localStorage.setItem(LS, JSON.stringify(a))
  } catch {
    /* ignore */
  }
}
/** Items whose last alert is older than `intervalMin` (or never alerted). Marks them as alerted now. */
export function pickToAlert(items: DueItem[], intervalMin: number): DueItem[] {
  const a = loadAlerted()
  const now = Date.now()
  const picked = items.filter((it) => !a[it.key] || now - a[it.key] >= intervalMin * 60000)
  for (const it of picked) a[it.key] = now
  if (picked.length) saveAlerted(a)
  return picked
}
export function snooze(items: DueItem[]) {
  const a = loadAlerted()
  const now = Date.now()
  for (const it of items) a[it.key] = now
  saveAlerted(a)
}

let audioCtx: AudioContext | null = null
export function beep(times = 3) {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const ctx = audioCtx
    const t0 = ctx.currentTime
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, t0 + i * 0.45)
      g.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.45 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.45 + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(t0 + i * 0.45)
      o.stop(t0 + i * 0.45 + 0.4)
    }
  } catch {
    /* no audio */
  }
}
export function vibrate() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300])
  } catch {
    /* ignore */
  }
}
export async function requestNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}
export function systemNotify(title: string, body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: 'purplelog-dose', renotify: true } as NotificationOptions)
  } catch {
    /* ignore */
  }
}
