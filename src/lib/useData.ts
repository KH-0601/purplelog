import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Dog, type DoseLog, type DosePlan, type Drug, type Event, type Lab, type Medication, type MonthlySummary, type ReferenceRange, type Settings, type WeatherDaily } from '../db'
import { resolveNames } from './cloud'

export const defaultSettings: Settings = { id: 'app', lang: 'ja', role: 'owner', consentAggregate: false, consentResearch: false, currentDogId: 'toby' }

const EMPTY: never[] = []

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('app'), []) ?? defaultSettings
}
export function useDogs(): Dog[] {
  return useLiveQuery(() => db.dogs.toArray(), []) ?? EMPTY
}
export function useDog(): Dog | undefined {
  const s = useSettings()
  const dogs = useDogs()
  const picked = useLiveQuery(async () => (s.currentDogId ? await db.dogs.get(s.currentDogId) : undefined), [s.currentDogId])
  return picked ?? dogs[0]
}
export function useEvents(dogId?: string): Event[] {
  return useLiveQuery(async () => (dogId ? db.events.where('dogId').equals(dogId).sortBy('start') : ([] as Event[])), [dogId]) ?? EMPTY
}
export function useMonthly(dogId?: string): MonthlySummary[] {
  return useLiveQuery(async () => (dogId ? db.monthly.where('dogId').equals(dogId).sortBy('ym') : ([] as MonthlySummary[])), [dogId]) ?? EMPTY
}
export function useMeds(dogId?: string): Medication[] {
  return useLiveQuery(async () => (dogId ? db.medications.where('dogId').equals(dogId).toArray() : ([] as Medication[])), [dogId]) ?? EMPTY
}
export function useLabs(dogId?: string): Lab[] {
  return useLiveQuery(async () => (dogId ? db.labs.where('dogId').equals(dogId).sortBy('datetime') : ([] as Lab[])), [dogId]) ?? EMPTY
}
export function useDoseLogs(dogId?: string): DoseLog[] {
  return useLiveQuery(async () => (dogId ? db.doseLogs.where('dogId').equals(dogId).sortBy('time') : ([] as DoseLog[])), [dogId]) ?? EMPTY
}
export function useDosePlans(dogId?: string): DosePlan[] {
  return useLiveQuery(async () => (dogId ? db.dosePlans.where('dogId').equals(dogId).sortBy('time') : ([] as DosePlan[])), [dogId]) ?? EMPTY
}
export function useDrugs(): Drug[] {
  return useLiveQuery(() => db.drugs.orderBy('name').toArray(), []) ?? EMPTY
}
export function useRefs(): ReferenceRange[] {
  return useLiveQuery(() => db.refRanges.toArray(), []) ?? EMPTY
}
export function useWeatherDaily(gridId?: string): WeatherDaily[] {
  return useLiveQuery(async () => (gridId ? db.weatherDaily.where('gridId').equals(gridId).sortBy('date') : ([] as WeatherDaily[])), [gridId]) ?? EMPTY
}
export async function updateSettings(patch: Partial<Settings>) {
  const cur = (await db.settings.get('app')) ?? defaultSettings
  await db.settings.put({ ...cur, ...patch })
}
export function latestWeight(weights: { date: string; kg: number }[]) {
  return [...weights].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg
}
/** Display names for viewer ids ('' when unknown). */
export function useNames(ids: (string | undefined)[]): Record<string, string> {
  const key = Array.from(new Set(ids.filter((x): x is string => !!x))).sort().join(',')
  const [names, setNames] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!key) return
    let alive = true
    resolveNames(key.split(',')).then((n) => alive && setNames(n))
    return () => {
      alive = false
    }
  }, [key])
  return names
}
