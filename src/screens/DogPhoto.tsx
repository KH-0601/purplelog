import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db, type Dog } from '../db'
import { shrinkImage } from '../lib/photo'

/** Round dog photo; tap to pick/replace. `size` in px. */
export default function DogPhoto({ dog, color, size = 72, editable = true }: { dog: Dog; color?: string; size?: number; editable?: boolean }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function pick(f: File | undefined) {
    if (!f) return
    setBusy(true)
    try {
      const photo = await shrinkImage(f)
      await db.dogs.update(dog.id, { photo, updatedAt: new Date().toISOString().slice(0, 10) })
    } catch (e) {
      alert(t('common.error') + ': ' + (e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <button type="button" className="dogphoto" style={{ width: size, height: size, borderColor: color ?? 'var(--rule)' }} onClick={() => editable && input.current?.click()} disabled={!editable || busy} aria-label={dog.photo ? t('settings.photoChange') : t('settings.photoAdd')} title={dog.photo ? t('settings.photoChange') : t('settings.photoAdd')}>
      {dog.photo ? <img src={dog.photo} alt={dog.name} /> : <span className="ph" style={{ fontSize: size * 0.42, color: color ?? 'var(--muted)' }}>{busy ? '…' : dog.name.slice(0, 1)}</span>}
      {editable && !dog.photo && <span className="cam">📷</span>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </button>
  )
}
