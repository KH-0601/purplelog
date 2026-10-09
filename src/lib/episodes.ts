import type { Event } from '../db'

export interface Episode {
  id: string
  start: string
  end: string
  seizures: number
  eventIds: string[]
  statusEpilepticus: boolean
  hours: number
}

const H = 3600 * 1000

/** International definition: cluster = 2 or more seizures within 24 h; SE = >5 min or repeated without recovery. */
export function buildEpisodes(events: Event[]): Episode[] {
  const seizures = events
    .filter((e) => e.kind === 'seizure')
    .sort((a, b) => a.start.localeCompare(b.start))
  const eps: Episode[] = []
  for (const e of seizures) {
    const t = new Date(e.start).getTime()
    const last = eps[eps.length - 1]
    const count = e.count ?? 1
    const se = (e.durationSec ?? 0) > 300 || e.consciousness === 'lost' && count > 1 && (e.durationSec ?? 0) > 300
    if (last && t - new Date(last.end).getTime() <= 24 * H) {
      last.end = e.end ?? e.start
      last.seizures += count
      last.eventIds.push(e.id)
      last.statusEpilepticus ||= se
      last.hours = (new Date(last.end).getTime() - new Date(last.start).getTime()) / H
    } else {
      eps.push({
        id: 'ep-' + e.id,
        start: e.start,
        end: e.end ?? e.start,
        seizures: count,
        eventIds: [e.id],
        statusEpilepticus: se,
        hours: 0,
      })
    }
  }
  return eps
}

export function isCluster(ep: Episode) {
  return ep.seizures >= 2
}
