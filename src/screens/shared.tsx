import { useTranslation } from 'react-i18next'
import { useDrugs } from '../lib/useData'
import type { TFunction } from 'i18next'
import type { Event, Medication } from '../db'

export function EventTag({ e }: { e: Event }) {
  const cls = e.kind === 'seizure' ? 's' : e.kind === 'unusual' ? 'u' : 'g'
  const label = e.kind === 'seizure' ? '発作' : e.kind === 'unusual' ? 'いつもと違う' : 'その他'
  return <span className={'tag ' + cls}>{label}</span>
}

export function eventLabel(e: Event, t: TFunction, _lang?: string) {
  if (e.kind === 'seizure') {
    const n = e.count && e.count > 1 ? ` ×${e.count}` : ''
    return `${t('event.seizure')}${n}${e.estimated ? ` (${t('event.estimated')})` : ''}`
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
export const isActiveMed = (m: Medication, today: string) => !m.endDate || m.endDate > today

export const CODES: Record<string, string> = { phenobarbital: 'PB', potassium_bromide: 'KBr', zonisamide: 'ZNS', levetiracetam: 'LEV', imepitoin: 'IMP', gabapentin: 'GBP', supplement_trial_M010: 'SUP', diazepam: 'DZP', midazolam: 'MDZ' }
