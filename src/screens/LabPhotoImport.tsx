import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { canReadImages, extractFromImage, shrinkImage, type Extracted } from '../lib/labImport'

/** Photo / screenshot of a lab report: attach it, and (when Claude can read images here) extract the values. */
export default function LabPhotoImport({ onImage, onExtract }: { onImage: (b: Blob | null) => void; onExtract: (x: Extracted) => void }) {
  const { t } = useTranslation()
  const [canRead, setCanRead] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const ctl = useRef<AbortController | null>(null)

  useEffect(() => {
    canReadImages().then(setCanRead)
  }, [])
  // A screenshot pasted from the clipboard (Ctrl+V / Cmd+V) is taken as the report image.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (f) {
        e.preventDefault()
        void pick(f)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  async function pick(f: File | undefined) {
    if (!f) return
    const small = await shrinkImage(f)
    setBlob(small)
    onImage(small)
    setMsg(null)
  }
  async function read() {
    if (!blob) return
    setBusy(true)
    setMsg(t('labimg.reading'))
    ctl.current = new AbortController()
    try {
      const x = await extractFromImage(blob, ctl.current.signal)
      onExtract(x)
      const n = x.results.filter((r) => r.analyte !== 'OTHER').length
      setMsg(t('labimg.done', { n, other: x.results.length - n }) + (x.notes ? ` ${x.notes}` : ''))
    } catch (e) {
      const code = (e as { code?: string })?.code
      setMsg(code === 'cancelled' ? null : code === 'not_granted' ? t('labimg.notGranted') : code === 'not_configured' ? t('labimg.notConfigured') : t('labimg.failed') + (code ? ` (${code})` : ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ background: 'var(--accent-soft)' }}>
      <h4>{t('labimg.title')}</h4>
      <div className="note" style={{ marginBottom: 6 }}>{canRead ? t('labimg.intro') : t('labimg.introNoRead')} {t('labimg.paste')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="btn sec sm" style={{ cursor: 'pointer' }}>
          📷 {t('labimg.pick')}
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <label className="btn sec sm" style={{ cursor: 'pointer' }}>
          🖼 {t('labimg.pickFile')}
          <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {blob && canRead && (
          <button className="btn sm" disabled={busy} onClick={read}>
            {busy ? t('labimg.reading') : t('labimg.read')}
          </button>
        )}
        {busy && (
          <button className="btn sec sm" onClick={() => ctl.current?.abort()}>
            {t('btn.cancel')}
          </button>
        )}
        {blob && (
          <button className="btn sec sm" onClick={() => { setBlob(null); setUrl(null); onImage(null); setMsg(null) }}>
            {t('eplan.remove')}
          </button>
        )}
      </div>
      {url && <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, marginTop: 8, display: 'block' }} />}
      {msg && <div className="note" style={{ marginTop: 6 }}>{msg}</div>}
    </div>
  )
}
