import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloud } from '../lib/cloud'
import { pushState, subscribePush, type PushState } from '../lib/push'

const KEY = 'purplelog.pushNudgeHidden'

/** Shown at the top of Home until this device receives push reminders (Supabase backend only). */
export default function PushNudge() {
  const { t } = useTranslation()
  const cloud = useCloud()
  const [st, setSt] = useState<PushState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  useEffect(() => {
    if (cloud.backend === 'supabase' && cloud.status === 'ready') pushState().then(setSt)
  }, [cloud.backend, cloud.status])
  if (hidden || cloud.backend !== 'supabase' || cloud.status !== 'ready' || !st || st === 'subscribed' || st === 'unsupported') return null

  async function enable() {
    setErr(null)
    try {
      const r = await subscribePush(cloud.userId!)
      setSt(r)
      if (r === 'denied') setErr(t('alert.pushState.denied'))
    } catch (e) {
      setErr(t('alert.pushError') + ' ' + String((e as Error)?.message ?? e))
    }
  }
  function later() {
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
    setHidden(true)
  }

  return (
    <div className="card nudge">
      <h4>{t('alert.nudgeTitle')}</h4>
      <div style={{ fontSize: 13.5, marginBottom: 8 }}>{st === 'need_install' ? t('alert.pushState.need_install') : st === 'denied' ? t('alert.pushState.denied') : t('alert.nudgeBody')}</div>
      {err && <div className="note" style={{ color: 'var(--warn)', marginBottom: 6 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {st === 'not_subscribed' && <button className="btn sm" onClick={enable}>{t('alert.pushOn')}</button>}
        <button className="btn sec sm" onClick={later}>{t('alert.nudgeLater')}</button>
      </div>
    </div>
  )
}
