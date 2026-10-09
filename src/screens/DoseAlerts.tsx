import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db, uid, type DoseLog, type Dog } from '../db'
import { useDoseLogs, useDosePlans, useMeds, useSettings } from '../lib/useData'
import { currentUserId } from '../lib/cloud'
import { beep, computeDue, pickToAlert, snooze, systemNotify, toLocalISO, vibrate, type DueItem } from '../lib/alerts'

/** Mounted once in App: checks every minute, shows a banner for overdue doses, re-alerts every N minutes. */
export default function DoseAlerts({ dog }: { dog: Dog | undefined }) {
  const { t } = useTranslation()
  const s = useSettings()
  const meds = useMeds(dog?.id)
  const plans = useDosePlans(dog?.id)
  const logs = useDoseLogs(dog?.id)
  const [shown, setShown] = useState<DueItem[]>([])
  const latest = useRef({ meds, plans, logs })
  latest.current = { meds, plans, logs }
  const enabled = s.alertsEnabled !== false
  const interval = s.alertIntervalMin ?? 30

  useEffect(() => {
    if (!enabled || !dog) return
    const tick = () => {
      const { meds, plans, logs } = latest.current
      const due = computeDue(meds, plans, logs, new Date())
      const fresh = pickToAlert(due, interval)
      if (fresh.length) {
        setShown(due)
        if (s.alertSound !== false) beep()
        vibrate()
        systemNotify(t('alert.title'), fresh.map((d) => `${t('meds.generics.' + d.generic, d.generic)} ${d.due.slice(11, 16)}`).join(', '))
      } else if (due.length === 0) setShown([])
    }
    tick()
    const id = setInterval(tick, 60000)
    const onVis = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interval, dog?.id, s.alertSound])

  if (!dog || !shown.length) return null

  async function give(it: DueItem) {
    const log: DoseLog = { id: uid(), dogId: dog!.id, medicationId: it.medicationId, generic: it.generic, time: toLocalISO(new Date()), slot: it.kind === 'routine' ? it.slot : 'prn', kind: it.kind === 'routine' ? 'scheduled' : 'prn', mgPerDose: it.mgPerDose, by: currentUserId() ?? undefined }
    await db.doseLogs.add(log)
    if (it.planId) await db.dosePlans.update(it.planId, { doneLogId: log.id })
    setShown((x) => x.filter((y) => y.key !== it.key))
  }
  function later() {
    snooze(shown)
    setShown([])
  }

  return (
    <div className="alert-overlay" role="alertdialog">
      <div className="alert-box">
        <h3>{t('alert.title')}</h3>
        <div className="note" style={{ marginBottom: 8 }}>{t('alert.body', { min: interval })}</div>
        {shown.map((it) => (
          <div className="row" key={it.key}>
            <span className="grow">
              <b>{t('meds.generics.' + it.generic, it.generic)}</b>
              {it.mgPerDose ? ` ${it.mgPerDose} mg` : ''} · {it.due.slice(5, 10).replace('-', '/')} {it.due.slice(11, 16)}
              <div className="note">{it.kind === 'plan' ? t('add.prn') : t('add.scheduled')} · {t('alert.overdue', { min: Math.round(it.overdueMin) })}</div>
            </span>
            <button className="btn sm" onClick={() => give(it)}>{t('dose.give')}</button>
          </div>
        ))}
        <button className="btn sec" style={{ width: '100%', marginTop: 10 }} onClick={later}>{t('alert.later', { min: interval })}</button>
      </div>
    </div>
  )
}
