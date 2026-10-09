import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { db, uid, type PlanAction } from '../db'
import { useDog } from '../lib/useData'
import { currentUserId } from '../lib/cloud'
import { nowLocalISO } from '../lib/format'

export default function Seizure() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const dog = useDog()
  const [startAt, setStartAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [rescueAt, setRescueAt] = useState<string | null>(null)
  const [videoOn, setVideoOn] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [actions, setActions] = useState<PlanAction[]>([])
  const recRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const wakeRef = useRef<WakeLockSentinel | null>(null)
  const videoEl = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (startAt == null) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startAt) / 1000)), 500)
    return () => clearInterval(id)
  }, [startAt])

  useEffect(() => () => stopMedia(), [])

  function stopMedia() {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    wakeRef.current?.release().catch(() => {})
  }

  async function start() {
    setStartAt(Date.now())
    try {
      wakeRef.current = await navigator.wakeLock?.request('screen')
    } catch {
      /* wake lock unavailable */
    }
    if (dog?.recordVideo && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
        streamRef.current = stream
        if (videoEl.current) videoEl.current.srcObject = stream
        const rec = new MediaRecorder(stream)
        chunks.current = []
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
        rec.start(1000)
        recRef.current = rec
        setVideoOn(true)
      } catch {
        setVideoOn(false)
      }
    }
  }

  async function end() {
    if (!dog || startAt == null) return
    const endAt = Date.now()
    const blob = await new Promise<Blob | undefined>((resolve) => {
      const rec = recRef.current
      if (!rec || rec.state === 'inactive') return resolve(undefined)
      rec.onstop = () => resolve(new Blob(chunks.current, { type: rec.mimeType || 'video/webm' }))
      rec.stop()
    })
    stopMedia()
    const toLocal = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19)
    const id = uid()
    await db.events.add({
      id,
      dogId: dog.id,
      kind: 'seizure',
      start: toLocal(startAt),
      end: toLocal(endAt),
      durationSec: Math.round((endAt - startAt) / 1000),
      tz: dog.tz,
      count: 1,
      rescueMed: rescueAt ? { generic: '', time: rescueAt } : undefined,
      planActions: actions.length ? actions : undefined,
      videoBlob: blob,
      by: currentUserId() ?? undefined,
    })
    nav(`/event/${id}`, { replace: true })
  }

  async function later() {
    if (!dog) return
    const id = uid()
    await db.events.add({ id, dogId: dog.id, kind: 'seizure', start: nowLocalISO(), tz: dog.tz, count: 1, timeUnknown: true, by: currentUserId() ?? undefined })
    nav(`/event/${id}`, { replace: true })
  }

  const plan = dog?.emergencyPlan
  const triggerMin = plan?.triggerMin ?? 5
  const overLimit = elapsed >= triggerMin * 60
  const steps = plan?.steps?.filter((s) => s.trim()) ?? []
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  function didStep() {
    setActions([...actions, { step: stepIdx + 1, text: steps[stepIdx], time: nowLocalISO() }])
    setStepIdx(stepIdx + 1)
  }

  if (startAt == null)
    return (
      <div className="big">
        <button className="circle" onClick={start}>
          {t('btn.seizureStart')}
          <small>{t('seizure.tapStart')}</small>
        </button>
        <div className="note" style={{ textAlign: 'center' }}>
          {t('seizure.videoOpt')}: {dog?.recordVideo ? t('seizure.on') : t('seizure.off')}
          {dog?.recordVideo && (
            <>
              <br />
              {t('seizure.cameraStart')}
            </>
          )}
        </div>
        <button className="btn sec" onClick={later}>
          {t('btn.later')}
        </button>
      </div>
    )

  return (
    <div className="big" style={{ justifyContent: 'flex-start', paddingTop: 10 }}>
      {videoOn && (
        <div className="rec">
          <i />
          {t('seizure.videoOn')}
        </div>
      )}
      <video ref={videoEl} autoPlay muted playsInline style={{ width: videoOn ? 140 : 0, borderRadius: 10 }} />
      <div className="timer">
        {mm}:{ss}
      </div>

      {overLimit && (
        <div className="card calm">
          <h3>{t('eplan.calm')}</h3>
          <div className="note" style={{ marginBottom: 8 }}>{t('eplan.over', { min: triggerMin })}</div>
          {steps.length === 0 ? (
            <div>{t('eplan.noPlan')}</div>
          ) : stepIdx < steps.length ? (
            <>
              <div className="stepno">{t('eplan.stepN', { n: stepIdx + 1 })} / {steps.length}</div>
              <div className="steptext">{steps[stepIdx]}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn" style={{ flex: 1 }} onClick={didStep}>
                  {t('eplan.did')}
                </button>
                <button className="btn sec" onClick={() => {}}>
                  {t('eplan.notYet')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="note">{t('eplan.allDone')}</div>
              <div className="steptext">{t('eplan.goHospital')}</div>
              {plan?.hospitalNote && <div className="note" style={{ marginTop: 6 }}>{plan.hospitalNote}</div>}
            </>
          )}
          {plan?.vetPhone && (
            <a className="btn sec" style={{ display: 'block', textAlign: 'center', marginTop: 10 }} href={`tel:${plan.vetPhone.replace(/[^\d+]/g, '')}`}>
              📞 {t('eplan.callVet')} {plan.vetName ? `(${plan.vetName})` : ''}
            </a>
          )}
        </div>
      )}

      <button className="circle stop" onClick={end} style={overLimit ? { width: 170, height: 170, fontSize: 18 } : undefined}>
        {t('seizure.ended')}
        <small>{t('seizure.tapEnd')}</small>
      </button>
      <button className={'btn ' + (rescueAt ? 'sec' : 'warn')} onClick={() => setRescueAt(nowLocalISO())}>
        {t('seizure.rescue')}
        {rescueAt ? ` ✓ ${rescueAt.slice(11, 16)}` : ''}
      </button>
      <div className="note" style={{ textAlign: 'center' }}>{t('seizure.screenNote')}</div>
    </div>
  )
}
