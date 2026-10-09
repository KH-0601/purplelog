import Dexie, { type Table } from 'dexie'

export type Species = 'dog' | 'cat'
/** Owner-entered steps agreed with their veterinarian. The app never supplies drug names or doses. */
export interface EmergencyPlan {
  triggerMin: number
  steps: string[]
  vetName?: string
  vetPhone?: string
  hospitalNote?: string
  updatedAt?: string
}
export interface PlanAction { step: number; text: string; time: string }
export interface Weight { date: string; kg: number }
export interface Dog {
  id: string
  name: string
  species: Species
  birthDate?: string
  sex?: string
  breed?: string
  /** display colour (hex) used for the switcher tabs and alerts */
  color?: string
  diagnosis?: string
  diagnosisDate?: string
  regionCode?: string
  regionName?: string
  gridLat?: number
  gridLon?: number
  recordVideo: boolean
  weights: Weight[]
  tz: string
  emergencyPlan?: EmergencyPlan
  updatedAt?: string
}

export type EventKind = 'seizure' | 'unusual' | 'other'
export interface WeatherSnapshot {
  time: string
  pressureMsl?: number
  pressureSurface?: number
  d6?: number
  d12?: number
  d24?: number
  d48?: number
  temp?: number
  humidity?: number
  precip?: number
  source: string
}
export interface Event {
  id: string
  dogId: string
  kind: EventKind
  start: string
  tz: string
  timeUnknown?: boolean
  end?: string
  durationSec?: number
  durationText?: string
  count?: number
  seizureType?: string
  consciousness?: 'lost' | 'kept' | 'unknown'
  recoveryMin?: number
  aura?: string
  triggers?: string[]
  unusualItems?: string[]
  rescueMed?: { generic: string; time: string }
  note?: string
  videoUrl?: string
  videoBlob?: Blob
  planActions?: PlanAction[]
  weather?: WeatherSnapshot
  source?: string
  estimated?: boolean
  /** Viewer id of the person who recorded it (shared mode). */
  by?: string
  updatedAt?: string
}

export interface MonthlySummary {
  dogId: string
  ym: string
  seizures: number
  episodes: number
  episodeCounts?: string
  episodeHours?: string
  daysSincePrev?: number | null
  unusual: number
  note?: string
  source: string
}

export interface DoseChange {
  date: string
  mgPerDose?: number
  timesPerDay: number
  weightKg?: number
  reason?: string
}
export interface Medication {
  id: string
  dogId: string
  generic: string
  kind: 'maintenance' | 'rescue' | 'trial'
  startDate: string
  endDate?: string
  doses: DoseChange[]
  /** Planned clock times, e.g. ["08:00","20:00"]. */
  scheduleTimes?: string[]
  misses?: string[]
  updatedAt?: string
}

/** One administration actually given. */
export interface DoseLog {
  id: string
  dogId: string
  medicationId: string
  generic: string
  time: string
  slot?: string
  /** scheduled (routine) or prn (as-needed / rescue). */
  kind?: 'scheduled' | 'prn'
  mgPerDose?: number
  note?: string
  by?: string
}

/** A planned (usually as-needed) dose: when it should be given. Done when linked to a DoseLog. */
export interface DosePlan {
  id: string
  dogId: string
  medicationId: string
  generic: string
  time: string
  mgPerDose?: number
  note?: string
  doneLogId?: string
  cancelled?: boolean
  by?: string
}

export interface LabResult { analyte: string; value: number; valueText?: string | null; unit: string }
export interface Lab {
  id: string
  dogId: string
  datetime: string
  labName?: string
  lastDoseAt?: string
  hoursSinceDose?: number
  note?: string
  results: LabResult[]
  by?: string
  /** Report image: shared asset id (when uploaded) and/or the bytes kept on this device. */
  imageAssetId?: string
  imageBlob?: Blob
  extracted?: boolean
}
export interface ReferenceRange {
  id: string
  labName: string
  analyte: string
  low: number
  high: number
  unit: string
  condition?: string
  note?: string
}

export interface WeatherDaily {
  key: string // gridId|date
  gridId: string
  date: string
  pmslMean?: number
  pmslMin?: number
  pmslMax?: number
  d24?: number
  temp?: number
  humidity?: number
  precip?: number
  source: string
}

export interface Settings {
  id: 'app'
  lang: 'ja' | 'en'
  role: 'owner' | 'developer'
  consentAggregate: boolean
  consentResearch: boolean
  currentDogId?: string
  seeded?: boolean
  alertsEnabled?: boolean
  alertIntervalMin?: number
  alertSound?: boolean
}

export class PurpleDB extends Dexie {
  dogs!: Table<Dog, string>
  events!: Table<Event, string>
  monthly!: Table<MonthlySummary, [string, string]>
  medications!: Table<Medication, string>
  labs!: Table<Lab, string>
  refRanges!: Table<ReferenceRange, string>
  doseLogs!: Table<DoseLog, string>
  dosePlans!: Table<DosePlan, string>
  weatherDaily!: Table<WeatherDaily, string>
  settings!: Table<Settings, string>
  constructor() {
    super('purplelog')
    this.version(1).stores({
      dogs: 'id',
      events: 'id, dogId, start, [dogId+start]',
      monthly: '[dogId+ym], dogId',
      medications: 'id, dogId',
      labs: 'id, dogId, datetime',
      refs: '++id, analyte',
      weatherDaily: 'key, gridId, date',
      settings: 'id',
    })
    // v2: reference ranges get string ids (needed for sharing); dose administration log added.
    this.version(2)
      .stores({
        refRanges: 'id, analyte',
        doseLogs: 'id, dogId, time, [dogId+time]',
      })
      .upgrade(async (tx) => {
        const old = await tx.table('refs').toArray()
        await tx.table('refRanges').bulkPut(old.map((r: Record<string, unknown>) => ({ ...r, id: 'ref-' + String(r.id) })))
      })
    this.version(3).stores({ refs: null })
    this.version(4).stores({ dosePlans: 'id, dogId, time, [dogId+time]' })
  }
}
export const db = new PurpleDB()

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

/** Tables mirrored to the shared database when sharing is available. */
export const SHARED_TABLES = ['dogs', 'events', 'medications', 'labs', 'refRanges', 'doseLogs', 'dosePlans', 'monthly'] as const
export type SharedTable = (typeof SHARED_TABLES)[number]
