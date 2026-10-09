import { db, type Dog, type Event, type Lab, type Medication, type MonthlySummary, type ReferenceRange } from '../db'
import { suppressSync } from '../lib/cloud'
import toby from './toby.json'

/** Loads Toby's sample data on a fresh device. Never pushed to the shared database by itself
 *  (hooks are suppressed); the owner's one-time migration decides what goes there. */
export async function seedIfEmpty(force = false) {
  const s = await db.settings.get('app')
  if (s?.seeded && !force) return
  await suppressSync(() =>
    db.transaction('rw', [db.dogs, db.events, db.monthly, db.medications, db.labs, db.refRanges, db.settings], async () => {
      if (force) {
        await Promise.all([db.events.where('dogId').equals('toby').delete(), db.monthly.where('dogId').equals('toby').delete(), db.medications.where('dogId').equals('toby').delete(), db.labs.where('dogId').equals('toby').delete(), db.refRanges.clear()])
      }
      const dog = toby.dog as unknown as Dog
      await db.dogs.put(dog)
      await db.monthly.bulkPut((toby.monthly as unknown as Omit<MonthlySummary, 'dogId'>[]).map((m) => ({ ...m, dogId: 'toby' })))
      await db.events.bulkPut(toby.events as unknown as Event[])
      await db.labs.bulkPut(toby.labs as unknown as Lab[])
      await db.refRanges.bulkPut((toby.refs as unknown as Omit<ReferenceRange, 'id'>[]).map((r, i) => ({ ...r, id: `ref-${r.analyte.toLowerCase()}-${i}` })))
      await db.medications.bulkPut((toby.meds as unknown as Medication[]).map((m) => ({ ...m, scheduleTimes: m.generic === 'potassium_bromide' ? ['08:00'] : ['08:00', '20:00'] })))
      await db.settings.put({ id: 'app', lang: 'ja', role: 'owner', consentAggregate: false, consentResearch: false, currentDogId: 'toby', ...(s ?? {}), seeded: true })
    }),
  )
}
