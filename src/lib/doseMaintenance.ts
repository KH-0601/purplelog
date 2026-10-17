import { db } from '../db'
import { nearestSlotDate, normaliseTimes } from '../screens/shared'

let done = false
/** Once per launch: give legacy scheduled dose records a slot date, then drop duplicates
 *  (same dog, medication, slot and slot date — e.g. from repeated taps before sync caught up). */
export async function tidyDoseLogs() {
  if (done) return
  done = true
  // medication schedule times: "24:00" → "00:00", duplicates removed
  for (const m of await db.medications.toArray()) {
    if (m.scheduleTimes?.length) {
      const n = normaliseTimes(m.scheduleTimes)
      if (n.join() !== m.scheduleTimes.join()) await db.medications.update(m.id, { scheduleTimes: n })
    }
  }
  const logs = await db.doseLogs.toArray()
  for (const l of logs) {
    // a "24:00" slot is the next day's "00:00"
    if (l.slot && /^24:\d{2}$/.test(l.slot)) {
      const base = l.slotDate ?? l.time.slice(0, 10)
      const d = new Date(base + 'T00:00'); d.setDate(d.getDate() + 1)
      l.slot = '00:' + l.slot.slice(3); l.slotDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      await db.doseLogs.update(l.id, { slot: l.slot, slotDate: l.slotDate })
    }
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
