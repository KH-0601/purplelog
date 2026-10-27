/** Barometric pressure forecast for a dog's weather grid (Open-Meteo, no key needed). */
import type { Dog } from '../db'

/** App-defined guide values (not a clinical standard): pressure DROP within one 3-hour block. Adjustable per dog in Settings. */
export const DEFAULT_CAUTION_DROP = 1.0
export const DEFAULT_WARN_DROP = 2.0
export const DEFAULT_LEAD_HOURS = 2

export interface PressureForecast {
  time: string[] // local "YYYY-MM-DDTHH:MM"
  pressure: (number | null)[]
  temp: (number | null)[]
  code: (number | null)[]
}
export type Level = 'none' | 'caution' | 'warn'
export interface Block {
  start: string // local ISO of the block start (hours 0,3,6,…)
  end: string
  drop: number // hPa change over the block (negative = falling)
  level: Level
  temp?: number
  code?: number
}

export const pressureSettings = (dog?: Dog) => ({
  enabled: dog?.pressureAlert?.enabled !== false,
  caution: dog?.pressureAlert?.caution ?? DEFAULT_CAUTION_DROP,
  warn: dog?.pressureAlert?.warn ?? DEFAULT_WARN_DROP,
  leadHours: dog?.pressureAlert?.leadHours ?? DEFAULT_LEAD_HOURS,
})

const cache = new Map<string, { at: number; data: PressureForecast }>()
export async function fetchPressureForecast(lat: number, lon: number, tz = 'Asia/Tokyo'): Promise<PressureForecast> {
  const key = `${lat},${lon}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 20 * 60000) return hit.data
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=pressure_msl,temperature_2m,weather_code&past_days=1&forecast_days=8&timezone=${encodeURIComponent(tz)}`
  const r = await fetch(url)
  if (!r.ok) throw new Error('pressure ' + r.status)
  const j = await r.json()
  const data: PressureForecast = { time: j.hourly.time, pressure: j.hourly.pressure_msl, temp: j.hourly.temperature_2m, code: j.hourly.weather_code }
  cache.set(key, { at: Date.now(), data })
  return data
}

/** Split into 3-hour blocks (00-03, 03-06, …) and grade each by how much the pressure falls inside it. */
export function toBlocks(f: PressureForecast, caution: number, warn: number): Block[] {
  const out: Block[] = []
  for (let i = 0; i + 3 < f.time.length; i++) {
    const h = Number(f.time[i].slice(11, 13))
    if (h % 3 !== 0) continue
    const a = f.pressure[i], b = f.pressure[i + 3]
    if (a == null || b == null) continue
    const drop = +(b - a).toFixed(1)
    const level: Level = -drop >= warn ? 'warn' : -drop >= caution ? 'caution' : 'none'
    out.push({ start: f.time[i], end: f.time[i + 3], drop, level, temp: f.temp[i + 1] ?? undefined, code: f.code[i + 1] ?? undefined })
  }
  return out
}

/** Weather symbol for an Open-Meteo WMO code. */
export function weatherIcon(code?: number): string {
  if (code == null) return ''
  if (code <= 1) return '☀️'
  if (code <= 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 95) return '⛈️'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄️'
  return '☂️'
}
