/**
 * Shared data layer. When the page runs inside claude.ai with the `db` capability,
 * every local table in SHARED_TABLES is mirrored to the artifact's shared database:
 *   remote → local  : one onSnapshot per collection, applied to Dexie with hooks suppressed
 *   local  → remote : Dexie hooks (creating / updating / deleting) push the changed document
 * Without the capability the app keeps working on the device alone.
 */
import { useSyncExternalStore } from 'react'
import { db, SHARED_TABLES, type SharedTable } from '../db'

type DocSnap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
type Change = { type: string; doc: DocSnap }
type DB = {
  collection(path: string): {
    doc(id?: string): { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; get(): Promise<DocSnap> }
    get(): Promise<{ docs: DocSnap[]; empty: boolean }>
    onSnapshot(next: (snap: { docChanges(): Change[] }) => void, error?: (e: unknown) => void): () => void
  }
}
type Key = string | [string, string]
type User = {
  id(): Promise<string | null>
  isOwner(): Promise<boolean>
  can(name: string): Promise<boolean | null>
  profiles(ids: readonly string[] | string): Promise<Record<string, { id: string; name: string; avatarUrl: string; color: string }>>
}

export type CloudStatus = 'init' | 'local' | 'syncing' | 'ready' | 'readonly' | 'error'
interface CloudState {
  status: CloudStatus
  userId: string | null
  isOwner: boolean
  canWrite: boolean | null
  pending: number
  lastError?: string
}

let state: CloudState = { status: 'init', userId: null, isOwner: false, canWrite: null, pending: 0 }
const listeners = new Set<() => void>()
function setState(p: Partial<CloudState>) {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

let remote: DB | null = null
let userNs: User | null = null
/** True while a remote snapshot is being written into Dexie, so hooks don't echo it back. */
let applying = 0
export function suppressSync<T>(fn: () => Promise<T>): Promise<T> {
  applying++
  return fn().finally(() => {
    applying--
  })
}

const docIdOf = (table: SharedTable, key: unknown): string => {
  if (table === 'monthly' && Array.isArray(key)) return `${key[0]}__${key[1]}`
  return String(key)
}
const keyOf = (table: SharedTable, id: string): Key => {
  if (table === 'monthly') {
    const i = id.indexOf('__')
    return [id.slice(0, i), id.slice(i + 2)] as [string, string]
  }
  return id
}
/** Plain JSON copy: drops Blobs and undefined. */
function sanitize(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v instanceof Blob) continue
    out[k] = v
  }
  return out
}

const queue: (() => Promise<void>)[] = []
let draining = false
async function drain() {
  if (draining) return
  draining = true
  while (queue.length) {
    const job = queue.shift()!
    try {
      await job()
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'invalid_argument') setState({ status: 'readonly', canWrite: false, lastError: 'write refused' })
      else setState({ lastError: String((e as Error)?.message ?? e) })
    }
    setState({ pending: queue.length })
  }
  draining = false
}
function enqueue(job: () => Promise<void>) {
  queue.push(job)
  setState({ pending: queue.length })
  void drain()
}

function installHooks() {
  for (const t of SHARED_TABLES) {
    const table = db.table(t)
    table.hook('creating', function (primKey, obj, trans) {
      if (applying || !remote) return
      const key = primKey ?? (obj as { id?: string }).id
      trans.on('complete', () => enqueue(() => remote!.collection(t).doc(docIdOf(t, key)).set(sanitize(obj as Record<string, unknown>))))
    })
    table.hook('updating', function (mods, primKey, obj, trans) {
      if (applying || !remote) return
      const merged = { ...(obj as Record<string, unknown>), ...(mods as Record<string, unknown>) }
      trans.on('complete', () => enqueue(() => remote!.collection(t).doc(docIdOf(t, primKey)).set(sanitize(merged))))
    })
    table.hook('deleting', function (primKey, _obj, trans) {
      if (applying || !remote) return
      trans.on('complete', () => enqueue(() => remote!.collection(t).doc(docIdOf(t, primKey)).delete()))
    })
  }
}

async function applySnapshot(t: SharedTable, changes: Change[]) {
  if (!changes.length) return
  await suppressSync(async () => {
    const table = db.table(t)
    const puts: Record<string, unknown>[] = []
    const dels: Key[] = []
    for (const c of changes) {
      if (c.type === 'removed') dels.push(keyOf(t, c.doc.id))
      else {
        const d = c.doc.data()
        if (!d) continue
        if (t === 'events') {
          // keep a locally stored video when the remote copy (which never carries blobs) arrives
          const local = (await table.get(keyOf(t, c.doc.id))) as { videoBlob?: Blob } | undefined
          puts.push(local?.videoBlob ? { ...d, videoBlob: local.videoBlob } : d)
        } else puts.push(d)
      }
    }
    if (puts.length) await table.bulkPut(puts)
    if (dels.length) await table.bulkDelete(dels)
  })
}

/** One-time: the owner's device copies its local data into an empty shared database. */
async function migrateIfEmpty() {
  if (!remote || !state.isOwner) return
  const meta = await remote.collection('meta').doc('seeded').get()
  if (meta.exists) return
  for (const t of SHARED_TABLES) {
    const rows = (await db.table(t).toArray()) as Record<string, unknown>[]
    for (const r of rows) {
      const key = t === 'monthly' ? [r.dogId, r.ym] : (r as { id: string }).id
      await remote.collection(t).doc(docIdOf(t, key)).set(sanitize(r))
    }
  }
  await remote.collection('meta').doc('seeded').set({ at: new Date().toISOString(), by: state.userId })
}

let started = false
export async function initCloud() {
  if (started) return
  started = true
  installHooks()
  const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude
  if (!claude?.use) {
    setState({ status: 'local' })
    return
  }
  try {
    const [d, u] = await Promise.all([claude.use('db'), claude.use('user')])
    if (!d) {
      setState({ status: 'local' })
      return
    }
    remote = d as DB
    userNs = u as User | null
    const [userId, isOwner, canWrite] = userNs ? await Promise.all([userNs.id(), userNs.isOwner(), userNs.can('data.write')]) : [null, false, null]
    setState({ status: 'syncing', userId, isOwner, canWrite })
    await migrateIfEmpty()
    for (const t of SHARED_TABLES) {
      remote.collection(t).onSnapshot(
        (snap: { docChanges(): Change[] }) => {
          void applySnapshot(t, snap.docChanges()).then(() => setState({ status: state.status === 'readonly' ? 'readonly' : canWrite === false ? 'readonly' : 'ready' }))
        },
        (e: unknown) => setState({ status: 'error', lastError: String((e as { message?: string })?.message ?? e) }),
      )
    }
  } catch (e) {
    setState({ status: 'error', lastError: String((e as Error)?.message ?? e) })
  }
}

/** Current viewer id (shared mode) for attributing records. */
export const currentUserId = () => state.userId

const profileCache = new Map<string, { name: string; color: string }>()
export async function resolveNames(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const need = ids.filter((i) => i && !profileCache.has(i))
  if (userNs && need.length) {
    try {
      const ps = await userNs.profiles(need)
      for (const id of need) profileCache.set(id, { name: ps[id]?.name || '', color: ps[id]?.color || '' })
    } catch {
      /* ignore */
    }
  }
  for (const i of ids) out[i] = profileCache.get(i)?.name || ''
  return out
}
