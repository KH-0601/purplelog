import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type DoseLog } from '../db'
import { useDogs, useSettings } from '../lib/useData'
import { currentUserId } from '../lib/cloud'
import { dogColorMap } from '../lib/dogColor'
import { beep, computeDue, pickToAlert, snooze, systemNotify, toLocalISO, vibrate, type DueItem } from '../lib/alerts'

const NONE: never[] = []

/** Mounted once in App: checks every minute for ALL dogs (not only the one on screen),
 *  shows a banner grouped by dog with the dog's colour, re-alerts every N minutes. */
export default function DoseAlerts() {
  const { t } = useTranslation()
  const s = useSettings()
  const dogs = useDogs()
  const meds = useLiveQuery(() => db.medications.toArray(), []) ?? NONE
  const plans = useLiveQuery(() => db.dosePlans.toArray(), []) ?? NONE
  const today = toLocalISO(new Date()).slice(0, 10)
  const logs = useLiveQuery(() => db.doseLogs.where('time').aboveOrEqual(today).toArray(), [today]) ?? NONE
  const [shown, setShown] = useState<DueItem[]>([])
  const latest = useRef({ dogs, meds, plans, logs })
  latest.current = { dogs, meds, plans, logs }
  const enabled = s.alertsEnabled !== false
  const interval = s.alertIntervalMin ?? 30
  const colors = dogColorMap(dogs)

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const { dogs, meds, plans, logs } = latest.current
      const now = new Date()
      const due: DueItem[] = []
      for (const d of dogs) {
        for (const it of computeDue(meds.filter((m) => m.dogId === d.id), plans.filter((p) => p.dogId === d.id), logs.filter((l) => l.dogId === d.id), now)) due.push({ ...it, dogId: d.id, dogName: d.name })
      }
      const fresh = pickToAlert(due, interval)
      if (fresh.length) {
        setShown(due)
        if (s.alertSound !== false) beep()
        vibrate()
        systemNotify(t('alert.title'), fresh.map((d) => `${d.dogName}: ${t('meds.generics.' + d.generic, d.generic)} ${d.due.slice(11, 16)}`).join(' / '))
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
  }, [enabled, interval, s.alertSound])

  if (!shown.length) return null

  async function give(it: DueItem) {
    const log: DoseLog = { id: uid(), dogId: it.dogId!, medicationId: it.medicationId, generic: it.generic, time: toLocalISO(new Date()), slot: it.kind === 'routine' ? it.slot : 'prn', kind: it.kind === 'routine' ? 'scheduled' : 'prn', mgPerDose: it.mgPerDose, by: currentUserId() ?? undefined }
    await db.doseLogs.add(log)
    if (it.planId) await db.dosePlans.update(it.planId, { doneLogId: log.id })
    setShown((x) => x.filter((y) => y.key !== it.key))
  }
  function later() {
    snooze(shown)
    setShown([])
  }

  const byDog = dogs.filter((d) => shown.some((it) => it.dogId === d.id))

  return (
    <div className="alert-overlay" role="alertdialog">
      <div className="alert-box">
        <h3>{t('alert.title')}</h3>
        <div className="note" style={{ marginBottom: 8 }}>{t('alert.body', { min: interval })}</div>
        {byDog.map((d) => (
          <div className="alert-dog" key={d.id} style={{ borderColor: colors[d.id] }}>
            <div className="alert-dogname" style={{ background: colors[d.id] }}>{d.name}</div>
            {shown.filter((it) => it.dogId === d.id).map((it) => (
              <div className="row" key={it.key}>
                <span className="grow">
                  <b>{t('meds.generics.' + it.generic, it.generic)}</b>
                  {it.mgPerDose ? ` ${it.mgPerDose} mg` : ''} · {it.due.slice(5, 10).replace('-', '/')} {it.due.slice(11, 16)}
                  <div className="note">{it.kind === 'plan' ? t('add.prn') : t('add.scheduled')} · {t('alert.overdue', { min: Math.round(it.overdueMin) })}</div>
                </span>
                <button className="btn sm" style={{ background: colors[d.id] }} onClick={() => give(it)}>{t('dose.give')}</button>
              </div>
            ))}
          </div>
        ))}
        <button className="btn sec" style={{ width: '100%', marginTop: 10 }} onClick={later}>{t('alert.later', { min: interval })}</button>
      </div>
    </div>
  )
}
