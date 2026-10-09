/**
 * Supabase backend (used when the app runs outside claude.ai, e.g. the GitHub Pages PWA).
 * Shared data lives in one table `docs(tbl, id, dog_id, body, updated_at, deleted)`.
 * Local Dexie stays the source for the UI; cloud.ts mirrors both ways through this module.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

// Public (publishable) credentials — safe in the browser; Row Level Security guards the data.
const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://vnnjvuurkpncjemvkola.supabase.co'
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_YTDGeis5t4EuygqBSNNj1g_U_E3bDez'

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  client ??= createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}
export const supabaseConfigured = () => !!URL && !!KEY

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase().auth.getSession()
  return data.session
}

export type DocRow = { tbl: string; id: string; dog_id: string | null; body: Record<string, unknown>; updated_at: string; deleted: boolean }

export async function fetchAllDocs(): Promise<DocRow[]> {
  const out: DocRow[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase().from('docs').select('tbl,id,dog_id,body,updated_at,deleted').range(from, from + page - 1)
    if (error) throw error
    out.push(...((data ?? []) as DocRow[]))
    if (!data || data.length < page) break
  }
  return out
}

export async function upsertDoc(tbl: string, id: string, body: Record<string, unknown>) {
  const dog_id = typeof body.dogId === 'string' ? body.dogId : tbl === 'dogs' ? (body.id as string) : null
  const { error } = await supabase().from('docs').upsert({ tbl, id, dog_id, body, deleted: false }, { onConflict: 'tbl,id' })
  if (error) throw error
}
export async function deleteDoc(tbl: string, id: string) {
  const { error } = await supabase().from('docs').upsert({ tbl, id, body: {}, deleted: true }, { onConflict: 'tbl,id' })
  if (error) throw error
}

export function subscribeDocs(onRow: (row: DocRow) => void, onStatus?: (s: string) => void) {
  const ch = supabase()
    .channel('docs-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (payload) => {
      const row = (payload.new ?? payload.old) as DocRow
      if (row && row.tbl) onRow(row)
    })
    .subscribe((status) => onStatus?.(status))
  return () => {
    void supabase().removeChannel(ch)
  }
}

/** Registers the signed-in user as a household member (allowed emails only). */
export async function joinHousehold(): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase().rpc('join_household')
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

export async function uploadLabImage(blob: Blob, id: string): Promise<string | null> {
  const path = `${id}.jpg`
  const { error } = await supabase().storage.from('lab-images').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
  if (error) return null
  return `sb:${path}`
}
export async function labImageUrl(ref: string): Promise<string | null> {
  if (!ref.startsWith('sb:')) return null
  const { data } = await supabase().storage.from('lab-images').createSignedUrl(ref.slice(3), 3600)
  return data?.signedUrl ?? null
}
