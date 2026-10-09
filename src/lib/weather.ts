import type { WeatherSnapshot } from '../db'

/** 0.25° grid cell (about 25 km). Coordinates are never stored beyond the cell. */
export function toGrid(lat: number, lon: number) {
  const g = (x: number) => Math.round(x * 4) / 4
  return { lat: g(lat), lon: g(lon), id: `${g(lat).toFixed(2)}_${g(lon).toFixed(2)}` }
}

export interface Hourly {
  time: string[]
  pressure_msl: (number | null)[]
  surface_pressure: (number | null)[]
  temperature_2m: (number | null)[]
  relative_humidity_2m: (number | null)[]
  precipitation: (number | null)[]
}

const HOURLY = 'pressure_msl,surface_pressure,temperature_2m,relative_humidity_2m,precipitation'

/** Fetch hourly data covering [startDate, endDate]. Uses the archive for older ranges, the forecast API for recent ones. */
export async function fetchHourly(lat: number, lon: number, startDate: string, endDate: string, tz = 'auto'): Promise<Hourly> {
  const today = new Date()
  const ageDays = (today.getTime() - new Date(endDate).getTime()) / 86400000
  let url: string
  if (ageDays > 6) {
    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${HOURLY}&timezone=${tz}`
  } else {
    const pastDays = Math.min(92, Math.max(2, Math.ceil((today.getTime() - new Date(startDate).getTime()) / 86400000) + 1))
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${HOURLY}&past_days=${pastDays}&forecast_days=2&timezone=${tz}`
  }
  const r = await fetch(url)
  if (!r.ok) throw new Error('weather ' + r.status)
  const j = await r.json()
  return j.hourly as Hourly
}

function nearestIndex(times: string[], iso: string) {
  const t = new Date(iso).getTime()
  let best = -1
  let bd = Infinity
  times.forEach((s, i) => {
    const d = Math.abs(new Date(s).getTime() - t)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}

export function snapshotAt(h: Hourly, iso: string, source: string): WeatherSnapshot | undefined {
  const i = nearestIndex(h.time, iso)
  if (i < 0) return undefined
  const p = (k: number) => (k >= 0 ? h.pressure_msl[k] ?? undefined : undefined)
  const now = p(i)
  const d = (hours: number) => {
    const v = p(i - hours)
    return now != null && v != null ? +(now - v).toFixed(1) : undefined
  }
  return {
    time: h.time[i],
    pressureMsl: now,
    pressureSurface: h.surface_pressure[i] ?? undefined,
    d6: d(6),
    d12: d(12),
    d24: d(24),
    d48: d(48),
    temp: h.temperature_2m[i] ?? undefined,
    humidity: h.relative_humidity_2m[i] ?? undefined,
    precip: h.precipitation[i] ?? undefined,
    source,
  }
}

export function dailyFromHourly(h: Hourly, date: string) {
  const idx = h.time.map((t, i) => (t.startsWith(date) ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return undefined
  const vals = idx.map((i) => h.pressure_msl[i]).filter((v): v is number => v != null)
  if (!vals.length) return undefined
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const prevIdx = h.time.map((t, i) => (t.startsWith(prevDate(date)) ? i : -1)).filter((i) => i >= 0)
  const pv = prevIdx.map((i) => h.pressure_msl[i]).filter((v): v is number => v != null)
  const pmean = pv.length ? pv.reduce((a, b) => a + b, 0) / pv.length : undefined
  const temp = idx.map((i) => h.temperature_2m[i]).filter((v): v is number => v != null)
  const hum = idx.map((i) => h.relative_humidity_2m[i]).filter((v): v is number => v != null)
  const pr = idx.map((i) => h.precipitation[i]).filter((v): v is number => v != null)
  return {
    pmslMean: +mean.toFixed(1),
    pmslMin: Math.min(...vals),
    pmslMax: Math.max(...vals),
    d24: pmean != null ? +(mean - pmean).toFixed(1) : undefined,
    temp: temp.length ? +(temp.reduce((a, b) => a + b, 0) / temp.length).toFixed(1) : undefined,
    humidity: hum.length ? Math.round(hum.reduce((a, b) => a + b, 0) / hum.length) : undefined,
    precip: pr.length ? +pr.reduce((a, b) => a + b, 0).toFixed(1) : undefined,
  }
}

export function prevDate(date: string) {
  const d = new Date(date + 'T00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
