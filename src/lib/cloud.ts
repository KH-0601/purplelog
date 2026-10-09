/**
 * Shared data layer with two backends:
 *   - claude.ai artifact `db` capability (when the page runs inside claude.ai)
 *   - Supabase (the PWA / GitHub Pages build)
 * Either way: local Dexie is the source for the UI; Dexie hooks push changes out,
 * and incoming changes are applied with hooks suppressed so nothing echoes back.
 */
import { useSyncExternalStore } from 'react'
import { db, SHARED_TABLES, type SharedTable } from '../db'
import { currentSession, deleteDoc, fetchAllDocs, joinHousehold, subscribeDocs, supabase, supabaseConfigured, upsertDoc, type DocRow } from './supabase'
import { refreshPush } from './push'

type DocSnap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
type Change = { type: string; doc: DocSnap }
type ArtifactDB = {
  collection(path: string): {
    doc(id?: string): { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; get(): Promise<DocSnap> }
    get(): Promise<{ docs: DocSnap[]; empty: boolean }>
    onSnapshot(next: (snap: { docChanges(): Change[] }) => void, error?: (e: unknown) => void): () => void
  }
}
type User = {
  id(): Promise<string | null>
  isOwner(): Promise<boolean>
  can(name: string): Promise<boolean | null>
  profiles(ids: readonly string[] | string): Promise<Record<string, { id: string; name: string; avatarUrl: string; color: string }>>
}
type Key = string | [string, string]

export type Backend = 'none' | 'artifact' | 'supabase'
export type CloudStatus = 'init' | 'local' | 'login' | 'syncing' | 'ready' | 'readonly' | 'error'
interface CloudState {
  backend: Backend
  status: CloudStatus
  userId: string | null
  userEmail: string | null
  isOwner: boolean
  canWrite: boolean | null
  pending: number
  lastError?: string
}

let state: CloudState = { backend: 'none', status: 'init', userId: null, userEmail: null, isOwner: false, canWrite: null, pending: 0 }
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

let remote: ArtifactDB | null = null
let userNs: User | null = null
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
function sanitize(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v instanceof Blob) continue
    out[k] = v
  }
  return out
}

// ---- outgoing queue -------------------------------------------------------
const queue: (() => Promise<void>)[] = []
let draining = false
async function drain() {
  if (draining) return
  draining = true
  while (queue.length) {
    const job = queue.shift()!
    try {
      await job()
      if (state.lastError) setState({ lastError: undefined })
    } catch (e) {
      const code = (e as { code?: string })?.code
      const msg = String((e as Error)?.message ?? e)
      if (code === 'invalid_argument' || /row-level security|permission/i.test(msg)) setState({ status: 'readonly', canWrite: false, lastError: msg })
      else setState({ lastError: msg })
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

function pushSet(t: SharedTable, key: unknown, body: Record<string, unknown>) {
  const id = docIdOf(t, key)
  const data = sanitize(body)
  if (state.backend === 'artifact' && remote) enqueue(() => remote!.collection(t).doc(id).set(data))
  else if (state.backend === 'supabase') enqueue(() => upsertDoc(t, id, data))
}
function pushDelete(t: SharedTable, key: unknown) {
  const id = docIdOf(t, key)
  if (state.backend === 'artifact' && remote) enqueue(() => remote!.collection(t).doc(id).delete())
  else if (state.backend === 'supabase') enqueue(() => deleteDoc(t, id))
}

let hooksInstalled = false
function installHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  for (const t of SHARED_TABLES) {
    const table = db.table(t)
    table.hook('creating', function (primKey, obj, trans) {
      if (applying || state.backend === 'none') return
      const key = primKey ?? (obj as { id?: string }).id
      trans.on('complete', () => pushSet(t, key, obj as Record<string, unknown>))
    })
    table.hook('updating', function (mods, primKey, obj, trans) {
      if (applying || state.backend === 'none') return
      const merged = { ...(obj as Record<string, unknown>), ...(mods as Record<string, unknown>) }
      trans.on('complete', () => pushSet(t, primKey, merged))
    })
    table.hook('deleting', function (primKey, _obj, trans) {
      if (applying || state.backend === 'none') return
      trans.on('complete', () => pushDelete(t, primKey))
    })
  }
}

// ---- incoming -------------------------------------------------------------
async function applyRows(rows: { tbl: string; id: string; body?: Record<string, unknown>; deleted: boolean }[]) {
  if (!rows.length) return
  await suppressSync(async () => {
    for (const t of SHARED_TABLES) {
      const mine = rows.filter((r) => r.tbl === t)
      if (!mine.length) continue
      const table = db.table(t)
      const puts: Record<string, unknown>[] = []
      const dels: Key[] = []
      for (const r of mine) {
        if (r.deleted || !r.body) dels.push(keyOf(t, r.id))
        else if (t === 'events') {
          const local = (await table.get(keyOf(t, r.id))) as { videoBlob?: Blob } | undefined
          puts.push(local?.videoBlob ? { ...r.body, videoBlob: local.videoBlob } : r.body)
        } else puts.push(r.body)
      }
      if (puts.length) await table.bulkPut(puts)
      if (dels.length) await table.bulkDelete(dels)
    }
  })
}

// ---- artifact backend -----------------------------------------------------
async function migrateArtifactIfEmpty() {
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
async function startArtifact(claude: { use(n: string): Promise<unknown> }) {
  const [d, u] = await Promise.all([claude.use('db'), claude.use('user')])
  if (!d) return false
  remote = d as ArtifactDB
  userNs = u as User | null
  const [userId, isOwner, canWrite] = userNs ? await Promise.all([userNs.id(), userNs.isOwner(), userNs.can('data.write')]) : [null, false, null]
  setState({ backend: 'artifact', status: 'syncing', userId, isOwner, canWrite })
  await migrateArtifactIfEmpty()
  for (const t of SHARED_TABLES) {
    remote.collection(t).onSnapshot(
      (snap: { docChanges(): Change[] }) => {
        const rows = snap.docChanges().map((c) => ({ tbl: t, id: c.doc.id, body: c.doc.data(), deleted: c.type === 'removed' }))
        void applyRows(rows).then(() => setState({ status: state.status === 'readonly' ? 'readonly' : canWrite === false ? 'readonly' : 'ready' }))
      },
      (e: unknown) => setState({ status: 'error', lastError: String((e as { message?: string })?.message ?? e) }),
    )
  }
  return true
}

// ---- supabase backend -----------------------------------------------------
let unsubscribe: (() => void) | null = null
export async function startSupabase(): Promise<void> {
  const session = await currentSession()
  if (!session) {
    setState({ backend: 'supabase', status: 'login', userId: null, userEmail: null })
    return
  }
  setState({ backend: 'supabase', status: 'syncing', userId: session.user.id, userEmail: session.user.email ?? null })
  const joined = await joinHousehold()
  if (!joined.ok) {
    setState({ status: 'readonly', canWrite: false, lastError: joined.message })
    return
  }
  try {
    const rows = await fetchAllDocs()
    await applyRows(rows)
    unsubscribe?.()
    unsubscribe = subscribeDocs((row: DocRow) => void applyRows([row]))
    setState({ status: 'ready', canWrite: true, isOwner: true })
    void refreshPush(session.user.id)
  } catch (e) {
    setState({ status: 'error', lastError: String((e as Error)?.message ?? e) })
  }
}
export async function signOut() {
  unsubscribe?.()
  unsubscribe = null
  await supabase().auth.signOut()
  setState({ status: 'login', userId: null, userEmail: null })
}

// ---- entry ----------------------------------------------------------------
let started = false
export async function initCloud() {
  if (started) return
  started = true
  installHooks()
  const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude
  try {
    if (claude?.use && (await startArtifact(claude))) return
    if (supabaseConfigured()) {
      supabase().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (state.status === 'login') void startSupabase()
        }
        if (event === 'SIGNED_OUT') setState({ status: 'login', userId: null, userEmail: null })
      })
      await startSupabase()
      return
    }
    setState({ status: 'local' })
  } catch (e) {
    setState({ status: 'error', lastError: String((e as Error)?.message ?? e) })
  }
}

export const currentUserId = () => state.userId
export const currentBackend = () => state.backend

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
  if (state.backend === 'supabase' && need.length) {
    try {
      const { data } = await supabase().from('members').select('user_id,email').in('user_id', need)
      for (const m of data ?? []) profileCache.set(m.user_id, { name: (m.email as string)?.split('@')[0] ?? '', color: '' })
    } catch {
      /* ignore */
    }
  }
  for (const i of ids) out[i] = profileCache.get(i)?.name || ''
  return out
}
