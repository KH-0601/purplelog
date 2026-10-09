/** Web Push subscription for dose reminders (Supabase backend). iPhone: requires the app added to the Home Screen (iOS 16.4+). */
import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY = 'BFlzugZV54NHh0AxFBwAVj5x6L9q9TkM6-Nwliap3UR3-7fkzDfxXH0bvZIxGE0k0lScQDqNKTXgMFveaAclHms'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
/** iOS Safari only allows push for an installed (Home Screen) app. */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

async function hashEndpoint(endpoint: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(buf)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type PushState = 'unsupported' | 'need_install' | 'denied' | 'subscribed' | 'not_subscribed'

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (/iPhone|iPad/.test(navigator.userAgent) && !isStandalone()) return 'need_install'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready.catch(() => null)
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'subscribed' : 'not_subscribed'
}

/** Ask permission (must be called from a tap), subscribe, and store the subscription for this user. */
export async function subscribePush(userId: string): Promise<PushState> {
  const st = await pushState()
  if (st === 'unsupported' || st === 'need_install' || st === 'denied') return st
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  const id = await hashEndpoint(sub.endpoint)
  const { error } = await supabase().from('push_subscriptions').upsert({ id, user_id: userId, subscription: sub.toJSON() })
  if (error) throw error
  return 'subscribed'
}

/** Keep the stored subscription fresh on each start (no prompt). */
export async function refreshPush(userId: string) {
  try {
    if ((await pushState()) !== 'subscribed') return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const id = await hashEndpoint(sub.endpoint)
    await supabase().from('push_subscriptions').upsert({ id, user_id: userId, subscription: sub.toJSON() })
  } catch {
    /* ignore */
  }
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready.catch(() => null)
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const id = await hashEndpoint(sub.endpoint)
  await supabase().from('push_subscriptions').delete().eq('id', id)
  await sub.unsubscribe()
}
