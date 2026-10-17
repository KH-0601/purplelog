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
/** "24:00" (and "7:30") → "00:00" / "07:30"; invalid strings are dropped. Sorted, unique. */
export function normaliseTimes(list: string[]): string[] {
  const out = new Set<string>()
  for (const raw of list) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
    if (!m) continue
    const h = Number(m[1]) % 24, mi = Number(m[2])
    if (mi > 59) continue
    out.add(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`)
  }
  return [...out].sort()
}
export const parseTimesInput = (v: string) => normaliseTimes(v.split(/[,、\s]+/))
/** The date of the slot occurrence nearest to `atLocalIso` (yesterday / today / tomorrow). */
export function nearestSlotDate(slot: string, atLocalIso: string): string {
  const at = new Date(atLocalIso.slice(0, 16)).getTime()
  const day = atLocalIso.slice(0, 10)
  const cands = [-1, 0, 1].map((off) => {
    const d = new Date(day + 'T00:00')
    d.setDate(d.getDate() + off)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { ds, diff: Math.abs(new Date(`${ds}T${slot}`).getTime() - at) }
  })
  return cands.sort((a, b) => a.diff - b.diff)[0].ds
}
/** Which day's slot a stored dose log covers (older logs fall back to the time's date). */
export const logSlotDate = (l: { slotDate?: string; time: string }) => l.slotDate ?? l.time.slice(0, 10)
/** Does this log cover `slot` on `date`? (legacy logs without a slot: same date, within 3 h) */
export const coversSlot = (l: { slotDate?: string; time: string; slot?: string }, date: string, slot: string) =>
  l.slot ? l.slot === slot && logSlotDate(l) === date : l.time.startsWith(date) && Math.abs(Number(l.time.slice(11, 13)) - Number(slot.slice(0, 2))) <= 3

export const defaultSchedule = (timesPerDay: number) => (timesPerDay >= 3 ? ['07:00', '15:00', '23:00'] : timesPerDay === 2 ? ['08:00', '20:00'] : ['08:00'])

export const currentDose = (m: Medication) => [...m.doses].sort((a, b) => a.date.localeCompare(b.date)).pop()
/** Active unless stopped: a medication stopped on `endDate` is out of the schedule from that day on. */
/** Appears in Home's daily doses and in reminders: maintenance always; rescue/trial only when marked as daily. */
export const isScheduledMed = (m: Medication) => m.kind === 'maintenance' || m.scheduled === true
export const isActiveMed = (m: Medication, today: string) => !m.endDate || m.endDate > today

export const CODES: Record<string, string> = { phenobarbital: 'PB', potassium_bromide: 'KBr', zonisamide: 'ZNS', levetiracetam: 'LEV', imepitoin: 'IMP', gabapentin: 'GBP', supplement_trial_M010: 'SUP', diazepam: 'DZP', midazolam: 'MDZ' }
