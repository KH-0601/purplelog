import { db } from '../db'
import { nearestSlotDate, normaliseTimes, shiftDate } from '../screens/shared'

let done = false
/** Once per launch: give legacy scheduled dose records a slot date, then drop duplicates
 *  (same dog, medication, slot and slot date — e.g. from repeated taps before sync caught up). */
export async function tidyDoseLogs() {
  if (done) return
  done = true
  // medication schedule times: zero-padded, duplicates removed ("24:00" stays: end of day)
  const endOfDayMeds = new Set<string>()
  for (const m of await db.medications.toArray()) {
    if (m.scheduleTimes?.length) {
      let n = normaliseTimes(m.scheduleTimes)
      // an older version turned "24:00" into "00:00"; the per-slot amounts still say "24:00" → restore the end-of-day slot
      const eod = m.endOfDay || (m.slotDoses && '24:00' in m.slotDoses)
      if (eod && n.includes('00:00') && !n.includes('24:00')) n = normaliseTimes(n.map((x) => (x === '00:00' ? '24:00' : x)))
      const patch: Partial<typeof m> = {}
      if (n.join() !== m.scheduleTimes.join()) patch.scheduleTimes = n
      if (n.includes('24:00') && !m.endOfDay) patch.endOfDay = true
      if (Object.keys(patch).length) await db.medications.update(m.id, patch)
      if (n.includes('24:00')) endOfDayMeds.add(m.id)
    }
  }
  const logs = await db.doseLogs.toArray()
  for (const l of logs) {
    // records of an end-of-day medication that were stored as "00:00" belong to the previous day's "24:00"
    if (l.slot === '00:00' && endOfDayMeds.has(l.medicationId)) {
      l.slot = '24:00'
      l.slotDate = shiftDate(l.slotDate ?? l.time.slice(0, 10), -1)
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
