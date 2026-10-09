import { db } from '../db'

/** First-run initialisation. Real data lives in the shared database; nothing is seeded on a fresh device. */
export async function seedIfEmpty(_force = false) {
  const s = await db.settings.get('app')
  if (s?.seeded) return
  await db.settings.put({ id: 'app', lang: 'ja', role: 'owner', consentAggregate: false, consentResearch: false, ...(s ?? {}), seeded: true })
}
