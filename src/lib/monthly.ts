import type { Event, MonthlySummary } from '../db'
import { buildEpisodes } from './episodes'

export interface MonthRow {
  ym: string
  seizures: number
  unusual: number
  episodes: { count: number; hours: number }[]
  source: 'summary' | 'events' | 'none'
}

export function ymOf(iso: string) {
  return iso.slice(0, 7)
}

export function monthsBetween(from: string, to: string) {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

function parseList(s?: string) {
  return (s ?? '')
    .split(',')
    .map((x) => parseFloat(x.trim()))
    .filter((x) => !isNaN(x))
}

/** Merge monthly summaries (months without dated events) with dated events. Summary wins for its months. */
export function monthlyRows(summary: MonthlySummary[], events: Event[], from?: string, to?: string): MonthRow[] {
  const byYm = new Map<string, MonthRow>()
  for (const s of summary) {
    const counts = parseList(s.episodeCounts)
    const hours = parseList(s.episodeHours)
    const episodes = counts.map((c, i) => ({ count: c, hours: hours[i] ?? 0 })).filter((e) => e.count >= 2)
    byYm.set(s.ym, { ym: s.ym, seizures: s.seizures, unusual: s.unusual, episodes, source: 'summary' })
  }
  const evMonths = new Map<string, Event[]>()
  for (const e of events) {
    const ym = ymOf(e.start)
    if (byYm.has(ym)) continue
    evMonths.set(ym, [...(evMonths.get(ym) ?? []), e])
  }
  for (const [ym, evs] of evMonths) {
    const eps = buildEpisodes(evs).filter((e) => e.seizures >= 2)
    byYm.set(ym, {
      ym,
      seizures: evs.filter((e) => e.kind === 'seizure').reduce((s, e) => s + (e.count ?? 1), 0),
      unusual: evs.filter((e) => e.kind === 'unusual').length,
      episodes: eps.map((e) => ({ count: e.seizures, hours: Math.max(e.hours, 0) })),
      source: 'events',
    })
  }
  const all = [...byYm.keys()].sort()
  if (!all.length) return []
  const f = from ?? all[0]
  const t = to ?? all[all.length - 1]
  return monthsBetween(f, t).map((ym) => byYm.get(ym) ?? { ym, seizures: 0, unusual: 0, episodes: [], source: 'none' })
}
