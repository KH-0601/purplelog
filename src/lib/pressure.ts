/** Barometric pressure forecast for a dog's weather grid (Open-Meteo, no key needed). */
import type { Dog } from '../db'

/**
 * App-defined guide values (not a clinical standard): pressure change within one 6-hour block
 * (03-09, 09-15, 15-21, 21-03 local). Adjustable per dog in Settings.
 */
export const DEFAULT_SLIGHT_DROP = 1.5
export const DEFAULT_CAUTION_DROP = 2.5
export const DEFAULT_WARN_DROP = 3.5
export const DEFAULT_RISE = 2.0
export const DEFAULT_LEAD_HOURS = 2
export const BLOCK_H = 6

export interface PressureForecast {
  time: string[] // local "YYYY-MM-DDTHH:MM"
  pressure: (number | null)[]
  temp: (number | null)[]
  code: (number | null)[]
}
export type Level = 'none' | 'slight' | 'caution' | 'warn' | 'rise'
export interface Block {
  start: string // local ISO of the block start (03, 09, 15, 21)
  end: string
  change: number // hPa change over the block (negative = falling)
  level: Level
}

/** Fill / ink / icon per level (hatch drawn with stripe + bg). */
export const LEVEL_STYLE: Record<Exclude<Level, 'none'>, { stripe: string; bg: string; ink: string; icon: string }> = {
  slight: { stripe: 'rgba(120,190,90,0.38)', bg: 'rgba(120,190,90,0.10)', ink: '#3E7D2A', icon: '↘' },
  caution: { stripe: 'rgba(240,165,40,0.42)', bg: 'rgba(240,165,40,0.12)', ink: '#A0620A', icon: '⇊' },
  warn: { stripe: 'rgba(226,82,82,0.42)', bg: 'rgba(226,82,82,0.12)', ink: '#C0392B', icon: '💣' },
  rise: { stripe: 'rgba(90,110,230,0.34)', bg: 'rgba(90,110,230,0.10)', ink: '#3F4FC0', icon: '⇈' },
}

export const pressureSettings = (dog?: Dog) => {
  const a = dog?.pressureAlert ?? {}
  return {
    enabled: a.enabled !== false,
    slight: a.slight6 ?? DEFAULT_SLIGHT_DROP,
    caution: a.caution6 ?? DEFAULT_CAUTION_DROP,
    warn: a.warn6 ?? DEFAULT_WARN_DROP,
    rise: a.rise6 ?? DEFAULT_RISE,
    leadHours: a.leadHours ?? DEFAULT_LEAD_HOURS,
  }
}
export type PressureSettings = ReturnType<typeof pressureSettings>

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

export function grade(change: number, s: PressureSettings): Level {
  const drop = -change
  if (drop >= s.warn) return 'warn'
  if (drop >= s.caution) return 'caution'
  if (drop >= s.slight) return 'slight'
  if (change >= s.rise) return 'rise'
  return 'none'
}

/** Split into 6-hour blocks (03-09, 09-15, 15-21, 21-03) and grade each by its pressure change. */
export function toBlocks(f: PressureForecast, s: PressureSettings): Block[] {
  const out: Block[] = []
  for (let i = 0; i + BLOCK_H < f.time.length; i++) {
    if (Number(f.time[i].slice(11, 13)) % BLOCK_H !== 3) continue
    const a = f.pressure[i], b = f.pressure[i + BLOCK_H]
    if (a == null || b == null) continue
    const change = +(b - a).toFixed(1)
    out.push({ start: f.time[i], end: f.time[i + BLOCK_H], change, level: grade(change, s) })
  }
  return out
}

/** Weather symbol for an Open-Meteo WMO code (moon for a clear night when the hour is given). */
export function weatherIcon(code?: number | null, hour?: number): string {
  if (code == null) return ''
  if (code <= 1) return hour != null && (hour >= 18 || hour < 6) ? '🌙' : '☀️'
  if (code <= 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 95) return '⛈️'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄️'
  return '☂️'
}
