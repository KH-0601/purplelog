import { db } from '../db'
import { addDays } from './format'
import { fetchHourly, snapshotAt, toGrid } from './weather'

/** Attach a weather snapshot to an event automatically (no button needed).
 *  Does nothing when the dog has no weather grid or the event already has weather. */
export async function attachWeather(eventId: string): Promise<boolean> {
  const e = await db.events.get(eventId)
  if (!e || e.weather) return false
  const dog = await db.dogs.get(e.dogId)
  if (!dog || dog.gridLat == null || dog.gridLon == null) return false
  const g = toGrid(dog.gridLat, dog.gridLon)
  const d = e.start.slice(0, 10)
  const h = await fetchHourly(g.lat, g.lon, addDays(d, -3), d)
  const snap = snapshotAt(h, e.timeUnknown ? d + 'T12:00' : e.start, 'open-meteo')
  if (!snap) return false
  const cur = await db.events.get(eventId)
  if (!cur || cur.weather) return false
  await db.events.put({ ...cur, weather: snap })
  return true
}

/** Fire-and-forget variant used right after creating an event. */
export function attachWeatherSoon(eventId: string) {
  setTimeout(() => { void attachWeather(eventId).catch(() => undefined) }, 0)
}

let backfilled = false
/** Once per launch: attach weather to older records that still lack it (a few at a time, gently). */
export async function backfillWeather(limit = 25) {
  if (backfilled) return
  backfilled = true
  const all = await db.events.toArray()
  const todo = all.filter((e) => !e.weather).sort((a, b) => b.start.localeCompare(a.start)).slice(0, limit)
  for (const e of todo) {
    try {
      await attachWeather(e.id)
    } catch {
      /* offline or API error: try again next launch */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
}
