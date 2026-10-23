import { useTranslation } from 'react-i18next'
import { useDrugs } from '../lib/useData'
import type { TFunction } from 'i18next'
import type { Event, Medication } from '../db'

export function EventTag({ e }: { e: Event }) {
  const cls = e.kind === 'seizure' ? (e.pattern === 'B' ? 's b' : e.pattern === 'C' ? 's c' : 's') : e.kind === 'unusual' ? 'u' : 'g'
  const label = e.kind === 'seizure' ? '発作' + (e.pattern ?? '') : e.kind === 'unusual' ? 'いつもと違う' : 'その他'
  return <span className={'tag ' + cls}>{label}</span>
}
/** "発作A（全身の痙攣）" style label; falls back to the plain word when no pattern is set. */
export type Pattern = 'A' | 'B' | 'C'
export const PATTERN_COLORS: Record<Pattern, string> = { A: '#4A2F9E', B: '#7B63C7', C: '#B3A3E3' }
/** Patterns this dog uses (A always; B/C when enabled in Settings). */
export const dogPatterns = (dog?: { patternCount?: number }): Pattern[] => (['A', 'B', 'C'] as Pattern[]).slice(0, Math.min(3, Math.max(1, dog?.patternCount ?? 1)))
export function seizureName(e: { pattern?: Pattern }, t: TFunction, dog?: { seizurePatterns?: { A?: string; B?: string; C?: string } }) {
  if (!e.pattern) return t('event.seizure')
  const desc = dog?.seizurePatterns?.[e.pattern]
  return `${t('event.seizure')}${e.pattern}${desc ? `（${desc}）` : ''}`
}

export function eventLabel(e: Event, t: TFunction, _lang?: string, dog?: { seizurePatterns?: { A?: string; B?: string; C?: string } }) {
  if (e.kind === 'seizure') {
    const n = e.count && e.count > 1 ? ` ×${e.count}` : ''
    return `${seizureName(e, t, dog)}${n}${e.estimated ? ` (${t('event.estimated')})` : ''}`
  }
  if (e.kind === 'unusual') {
    const items = (e.unusualItems ?? []).map((i) => t('event.items.' + i, i)).join('・')
    return items || e.note || t('event.unusual')
  }
  return e.note || t('event.other')
}

export const ANALYTES = [
  { code: 'PB', unit: 'µg/mL', generic: 'phenobarbital' },
  { code: 'ZNS', unit: 'µg/mL', generic: 'zonisamide' },
  { code: 'LEV', unit: 'µg/mL', generic: 'levetiracetam' },
  { code: 'KBr', unit: 'mg/mL', generic: 'potassium_bromide' },
  { code: 'T4', unit: 'µg/dL' },
  { code: 'FT4', unit: 'ng/dL' },
  { code: 'TSH', unit: 'ng/mL' },
  { code: 'ALT', unit: 'U/L' },
  { code: 'ALP', unit: 'U/L' },
] as const

export const DRUG_ANALYTES = ['PB', 'KBr', 'ZNS', 'LEV']
export const MONITOR_ANALYTES = ['T4', 'FT4', 'TSH', 'ALT', 'ALP']

/** Drugs selectable for new records (2026-10-09: the four the owners plan to use). */
export const GENERICS = ['phenobarbital', 'zonisamide', 'levetiracetam', 'gabapentin'] as const

/** Built-in drugs plus the household's own list (Settings), as select options. */
export function useDrugOptions(): { value: string; label: string }[] {
  const { t } = useTranslation()
  const custom = useDrugs()
  const builtIn = GENERICS.map((g) => ({ value: g as string, label: t('meds.generics.' + g) }))
  const extra = custom.filter((d) => !(GENERICS as readonly string[]).includes(d.name)).map((d) => ({ value: d.name, label: d.name }))
  return [...builtIn, ...extra]
}

export const UNUSUAL_ITEMS = ['mania', 'pica', 'elimination', 'ataxia', 'weakness', 'lethargy', 'appetite_down', 'appetite_up', 'weight', 'skin', 'pacing', 'vomiting', 'hyperactive', 'eye_twitch', 'urination', 'other']

export const SEIZURE_TYPES = ['generalized_tonic_clonic', 'focal', 'focal_behavioral', 'focal_to_generalized', 'unknown']

export const SEX_OPTIONS = ['male', 'male_neutered', 'female', 'female_spayed', 'unknown'] as const

/** Reminders repeat only within this many minutes after the slot time; later the dose simply shows as unrecorded. */
export const REMIND_WINDOW_MIN = 360
/** "7:30" → "07:30"; "24:00" is kept: it means the end of the day (a 23:50 dose belongs to that day, not the next). */
export function normaliseTimes(list: string[]): string[] {
  const out = new Set<string>()
  for (const raw of list) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
    if (!m) continue
    const h = Number(m[1]), mi = Number(m[2])
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) continue
    out.add(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`)
  }
  return [...out].sort()
}
/** Epoch ms of `slot` on local date `date` ("24:00" = midnight at the end of that day). */
export function slotMs(date: string, slot: string): number {
  const [h, mi] = slot.split(':').map(Number)
  return new Date(date + 'T00:00').getTime() + (h * 60 + mi) * 60000
}
/** Local YYYY-MM-DD shifted by n days. */
export function shiftDate(date: string, n: number): string {
  const d = new Date(date + 'T00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** The slot-day whose occurrence of `slot` is the most recent one that can be overdue today: for "24:xx" that is yesterday. */
export const dueDateFor = (slot: string, today: string) => (slot.startsWith('24:') ? shiftDate(today, -1) : today)
export const parseTimesInput = (v: string) => normaliseTimes(v.split(/[,、\s]+/))
/** The date of the slot occurrence nearest to `atLocalIso` (yesterday / today / tomorrow). */
export function nearestSlotDate(slot: string, atLocalIso: string): string {
  const at = new Date(atLocalIso.slice(0, 16)).getTime()
  const day = atLocalIso.slice(0, 10)
  const cands = [-1, 0, 1].map((off) => {
    const ds = shiftDate(day, off)
    return { ds, diff: Math.abs(slotMs(ds, slot) - at) }
  })
  return cands.sort((a, b) => a.diff - b.diff)[0].ds
}
/** Date of the slot occurrence a Home button stands for: today's, unless today's is still more than 6 h away
 *  and yesterday's occurrence is still open (e.g. 05:59 for last night's 23:30, 00:04 for last night's 24:00). Never tomorrow. */
export function targetSlotDate(slot: string, nowIso: string, isHandled: (date: string) => boolean, startDate?: string): string {
  const day = nowIso.slice(0, 10)
  const yest = shiftDate(day, -1)
  const nowMs = new Date(nowIso.slice(0, 16)).getTime()
  const aheadMin = (slotMs(day, slot) - nowMs) / 60000
  const sinceYestMin = (nowMs - slotMs(yest, slot)) / 60000
  // yesterday's slot is offered only for 12 h after its time (late-night doses recorded the next morning)
  if (aheadMin > 360 && sinceYestMin <= 720 && !isHandled(yest) && (!startDate || startDate <= yest)) return yest
  return day
}
/** Which day's slot a stored dose log covers (older logs fall back to the time's date). */
export const logSlotDate = (l: { slotDate?: string; time: string }) => l.slotDate ?? l.time.slice(0, 10)
/** Does this log cover `slot` on `date`? (legacy logs without a slot: same date, within 3 h) */
export const coversSlot = (l: { slotDate?: string; time: string; slot?: string }, date: string, slot: string) =>
  l.slot ? l.slot === slot && logSlotDate(l) === date : l.time.startsWith(date) && Math.abs(Number(l.time.slice(11, 13)) - Number(slot.slice(0, 2))) <= 3

export const defaultSchedule = (timesPerDay: number) => (timesPerDay >= 3 ? ['07:00', '15:00', '23:00'] : timesPerDay === 2 ? ['08:00', '20:00'] : ['08:00'])

export const currentDose = (m: Medication) => [...m.doses].sort((a, b) => a.date.localeCompare(b.date)).pop()
/** Slots this medication is given at. */
export const medSlots = (m: Medication) => (m.scheduleTimes?.length ? m.scheduleTimes : defaultSchedule(currentDose(m)?.timesPerDay ?? 2))
/** Amount for one slot: per-slot value if set, else the current uniform dose. */
export const slotDose = (m: Medication, slot: string): number | undefined => m.slotDoses?.[slot] ?? currentDose(m)?.mgPerDose
/** True when every slot gets the same amount (so one ✓ / one number is enough). */
export const isUniformDose = (m: Medication) => !m.slotDoses || medSlots(m).every((s) => m.slotDoses![s] == null || m.slotDoses![s] === currentDose(m)?.mgPerDose)
/** Total mg per day across the slots (undefined if any amount is unknown). */
export function dailyMg(m: Medication): number | undefined {
  const slots = medSlots(m)
  const amounts = slots.map((s) => slotDose(m, s))
  if (amounts.some((a) => a == null)) return undefined
  return amounts.reduce((a, b) => a! + b!, 0)
}
/** Active unless stopped: a medication stopped on `endDate` is out of the schedule from that day on. */
/** Appears in Home's daily doses and in reminders: maintenance always; rescue/trial only when marked as daily. */
export const isScheduledMed = (m: Medication) => m.kind === 'maintenance' || m.scheduled === true
export const isActiveMed = (m: Medication, today: string) => !m.endDate || m.endDate > today

export const CODES: Record<string, string> = { phenobarbital: 'PB', potassium_bromide: 'KBr', zonisamide: 'ZNS', levetiracetam: 'LEV', imepitoin: 'IMP', gabapentin: 'GBP', supplement_trial_M010: 'SUP', diazepam: 'DZP', midazolam: 'MDZ' }
