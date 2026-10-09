import type { Event, WeatherDaily } from '../db'

/** Display stages for community aggregation (design spec ⑦). */
export const COMMUNITY_STAGES = [
  { min: 0, key: 'collecting' },
  { min: 150, key: 'weekly_reference' },
  { min: 400, key: 'weekly' },
  { min: 800, key: 'daily' },
] as const
export function communityStage(activeDogs: number) {
  let s: (typeof COMMUNITY_STAGES)[number]['key'] = 'collecting'
  for (const st of COMMUNITY_STAGES) if (activeDogs >= st.min) s = st.key
  return s
}

/** Analysable = 20 or more seizure days and 90 or more days of records (statistical, not clinical). */
export const ANALYSABLE_MIN_SEIZURE_DAYS = 20
export const ANALYSABLE_MIN_RECORD_DAYS = 90

export function seizureDays(events: Event[]) {
  return Array.from(new Set(events.filter((e) => e.kind === 'seizure').map((e) => e.start.slice(0, 10)))).sort()
}

export function recordSpanDays(events: Event[]) {
  if (!events.length) return 0
  const ds = events.map((e) => e.start.slice(0, 10)).sort()
  return Math.round((new Date(ds[ds.length - 1]).getTime() - new Date(ds[0]).getTime()) / 86400000) + 1
}

export interface DogAnalysis {
  seizureDays: number
  recordDays: number
  analysable: boolean
  seizureD24: number[]
  nonSeizureD24: number[]
  meanSeizure?: number
  meanNon?: number
  diff?: number
  ci?: [number, number]
}

function mean(a: number[]) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : undefined
}
function sd(a: number[]) {
  const m = mean(a)
  if (m == null || a.length < 2) return undefined
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1))
}

/** Compare pressure change (previous 24 h) on seizure days vs all other recorded days. Observation only. */
export function analyseDog(events: Event[], daily: WeatherDaily[]): DogAnalysis {
  const sdays = new Set(seizureDays(events))
  const seizureD24: number[] = []
  const nonSeizureD24: number[] = []
  for (const d of daily) {
    if (d.d24 == null) continue
    ;(sdays.has(d.date) ? seizureD24 : nonSeizureD24).push(d.d24)
  }
  const ms = mean(seizureD24)
  const mn = mean(nonSeizureD24)
  let diff: number | undefined
  let ci: [number, number] | undefined
  if (ms != null && mn != null) {
    diff = ms - mn
    const s1 = sd(seizureD24)
    const s2 = sd(nonSeizureD24)
    if (s1 != null && s2 != null) {
      const se = Math.sqrt(s1 ** 2 / seizureD24.length + s2 ** 2 / nonSeizureD24.length)
      ci = [diff - 1.96 * se, diff + 1.96 * se]
    }
  }
  const sdCount = sdays.size
  const rec = recordSpanDays(events)
  return {
    seizureDays: sdCount,
    recordDays: rec,
    analysable: sdCount >= ANALYSABLE_MIN_SEIZURE_DAYS && rec >= ANALYSABLE_MIN_RECORD_DAYS,
    seizureD24,
    nonSeizureD24,
    meanSeizure: ms,
    meanNon: mn,
    diff,
    ci,
  }
}

export function median(a: number[]) {
  if (!a.length) return undefined
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
