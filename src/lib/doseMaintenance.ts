import { db } from '../db'
import { nearestSlotDate, normaliseTimes } from '../screens/shared'

let done = false
/** Once per launch: give legacy scheduled dose records a slot date, then drop duplicates
 *  (same dog, medication, slot and slot date — e.g. from repeated taps before sync caught up). */
export async function tidyDoseLogs() {
  if (done) return
  done = true
  // medication schedule times: zero-padded, duplicates removed ("24:00" stays: end of day)
  for (const m of await db.medications.toArray()) {
    if (m.scheduleTimes?.length) {
      const n = normaliseTimes(m.scheduleTimes)
      if (n.join() !== m.scheduleTimes.join()) await db.medications.update(m.id, { scheduleTimes: n })
    }
  }
  const logs = await db.doseLogs.toArray()
  for (const l of logs) {
    if (l.slot && l.slot !== 'prn' && !l.slotDate) {
      l.slotDate = nearestSlotDate(l.slot, l.time)
      await db.doseLogs.update(l.id, { slotDate: l.slotDate })
    }
  }
  const seen = new Map<string, string>()
  for (const l of [...logs].filter((x) => x.slot && x.slot !== 'prn').sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id))) {
    const key = `${l.dogId}|${l.medicationId}|${l.slot}|${l.slotDate}`
    if (seen.has(key)) await db.doseLogs.delete(l.id)
    else seen.set(key, l.id)
  }
}
