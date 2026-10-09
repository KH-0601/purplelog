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

export const UNUSUAL_ITEMS = ['mania', 'pica', 'elimination', 'ataxia', 'weakness', 'lethargy', 'appetite_down', 'appetite_up', 'weight', 'skin', 'pacing', 'vomiting', 'hyperactive', 'eye_twitch', 'urination', 'other']

export const SEIZURE_TYPES = ['generalized_tonic_clonic', 'focal', 'focal_behavioral', 'focal_to_generalized', 'unknown']

export const SEX_OPTIONS = ['male', 'male_neutered', 'female', 'female_spayed', 'unknown'] as const

export const defaultSchedule = (timesPerDay: number) => (timesPerDay >= 3 ? ['07:00', '15:00', '23:00'] : timesPerDay === 2 ? ['08:00', '20:00'] : ['08:00'])

export const currentDose = (m: Medication) => [...m.doses].sort((a, b) => a.date.localeCompare(b.date)).pop()
export const isActiveMed = (m: Medication, today: string) => !m.endDate || m.endDate >= today

export const CODES: Record<string, string> = { phenobarbital: 'PB', potassium_bromide: 'KBr', zonisamide: 'ZNS', levetiracetam: 'LEV', imepitoin: 'IMP', gabapentin: 'GBP', supplement_trial_M010: 'SUP', diazepam: 'DZP', midazolam: 'MDZ' }
