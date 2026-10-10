import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, uid, type DoseLog, type DosePlan } from '../db'
import { useDog, useMeds } from '../lib/useData'
import { currentUserId } from '../lib/cloud'
import { nowLocalISO } from '../lib/format'
import { GENERICS, currentDose } from './shared'

type Tab = 'seizure' | 'dose' | 'plan'

/** Manual entry: a dose given (scheduled or as-needed) at a chosen date and time, or a planned PRN schedule. Past seizures open the detail screen directly (/event/new). */
export default function AddRecord() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const dog = useDog()
  const meds = useMeds(dog?.id)
  const [tab, setTab] = useState<Tab>(((params.get('tab') as Tab) === 'seizure' ? 'dose' : (params.get('tab') as Tab)) || 'dose')

  // ---- dose form
  const registered = meds.filter((m) => !m.endDate)
  const [medKey, setMedKey] = useState<string>(registered[0]?.id ?? `g:${GENERICS[0]}`)
  const [doseKind, setDoseKind] = useState<'scheduled' | 'prn'>('prn')
  const [doseAt, setDoseAt] = useState(nowLocalISO())
  const [mg, setMg] = useState('')
  const [otherName, setOtherName] = useState('')
  const [doseNote, setDoseNote] = useState('')
  // ---- plan form
  const [planAt, setPlanAt] = useState(nowLocalISO())
  const [planTimes, setPlanTimes] = useState('1')
  const [planEveryH, setPlanEveryH] = useState('8')

  if (!dog) return null

  async function saveDose() {
    let medicationId = medKey
    let generic = medKey
    if (medKey.startsWith('g:')) {
      generic = medKey.slice(2)
      medicationId = `prn:${generic}`
    } else if (medKey === 'other') {
      if (!otherName.trim()) return
      generic = otherName.trim()
      medicationId = `prn:${generic}`
    } else {
      const m = meds.find((x) => x.id === medKey)
      generic = m?.generic ?? medKey
    }
    const m = meds.find((x) => x.id === medicationId)
    const log: DoseLog = {
      id: uid(),
      dogId: dog!.id,
      medicationId,
      generic,
      time: doseAt,
      slot: doseKind === 'prn' ? 'prn' : undefined,
      kind: doseKind,
      mgPerDose: mg ? Number(mg) : m ? currentDose(m)?.mgPerDose : undefined,
      note: doseNote || undefined,
      by: currentUserId() ?? undefined,
    }
    await db.doseLogs.add(log)
    nav('/timeline', { replace: true })
  }

  async function savePlan() {
    let medicationId = medKey
    let generic = medKey
    if (medKey.startsWith('g:')) {
      generic = medKey.slice(2)
      medicationId = `prn:${generic}`
    } else if (medKey === 'other') {
      if (!otherName.trim()) return
      generic = otherName.trim()
      medicationId = `prn:${generic}`
    } else generic = meds.find((x) => x.id === medKey)?.generic ?? medKey
    const n = Math.max(1, Math.min(30, Number(planTimes) || 1))
    const every = Math.max(0.5, Number(planEveryH) || 8)
    const start = new Date(planAt)
    for (let i = 0; i < n; i++) {
      const t = new Date(start.getTime() + i * every * 3600000)
      const time = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      const p: DosePlan = { id: uid(), dogId: dog!.id, medicationId, generic, time, mgPerDose: mg ? Number(mg) : undefined, note: doseNote || undefined, by: currentUserId() ?? undefined }
      await db.dosePlans.add(p)
    }
    nav('/', { replace: true })
  }


  return (
    <>
      <div className="period">
        <button className={tab === 'dose' ? 'on' : ''} onClick={() => setTab('dose')}>{t('add.doseTab')}</button>
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>{t('plan.planTab')}</button>
      </div>


      {tab === 'plan' && (
        <>
          <div className="card">
            <div className="note" style={{ marginBottom: 6 }}>{t('plan.planNote')}</div>
            <div className="field">
              <span className="k">{t('add.drug')}</span>
              <select value={medKey} onChange={(e) => setMedKey(e.target.value)}>
                {registered.length > 0 && (
                  <optgroup label={t('add.registered')}>
                    {registered.map((m) => <option key={m.id} value={m.id}>{t('meds.generics.' + m.generic, m.generic)}</option>)}
                  </optgroup>
                )}
                <optgroup label={t('add.generics')}>
                  {GENERICS.map((g) => <option key={g} value={`g:${g}`}>{t('meds.generics.' + g)}</option>)}
                  <option value="other">{t('add.other')}</option>
                </optgroup>
              </select>
            </div>
            {medKey === 'other' && <div className="field"><span className="k">{t('add.otherName')}</span><input value={otherName} onChange={(e) => setOtherName(e.target.value)} /></div>}
            <div className="field"><span className="k">{t('plan.first')}</span><input type="datetime-local" value={planAt} onChange={(e) => setPlanAt(e.target.value)} /></div>
            <div className="field">
              <span className="k">{t('plan.repeat')}</span>
              <input type="number" min={1} max={30} value={planTimes} onChange={(e) => setPlanTimes(e.target.value)} /><span className="note">{t('plan.times')}</span>
              <input type="number" min={0.5} step={0.5} value={planEveryH} onChange={(e) => setPlanEveryH(e.target.value)} /><span className="note">{t('plan.every')}</span>
            </div>
            <div className="field"><span className="k">{t('meds.mgPerDose')}</span><input type="number" step="any" placeholder={t('add.mgOptional')} value={mg} onChange={(e) => setMg(e.target.value)} /></div>
            <div className="field"><span className="k">{t('event.note')}</span><input value={doseNote} onChange={(e) => setDoseNote(e.target.value)} /></div>
          </div>
          <div className="note">{t('alert.scope')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={savePlan} disabled={medKey === 'other' && !otherName.trim()}>{t('btn.save')}</button>
            <button className="btn sec" onClick={() => nav(-1)}>{t('btn.cancel')}</button>
          </div>
        </>
      )}

      {tab === 'dose' && (
        <>
          <div className="card">
            <div className="field">
              <span className="k">{t('add.doseKind')}</span>
              <div className="chips">
                <button className={'chip-btn ' + (doseKind === 'prn' ? 'on' : '')} onClick={() => setDoseKind('prn')}>{t('add.prn')}</button>
                <button className={'chip-btn ' + (doseKind === 'scheduled' ? 'on' : '')} onClick={() => setDoseKind('scheduled')}>{t('add.scheduled')}</button>
              </div>
            </div>
            <div className="field">
              <span className="k">{t('add.drug')}</span>
              <select value={medKey} onChange={(e) => setMedKey(e.target.value)}>
                {registered.length > 0 && (
                  <optgroup label={t('add.registered')}>
                    {registered.map((m) => <option key={m.id} value={m.id}>{t('meds.generics.' + m.generic, m.generic)}{currentDose(m)?.mgPerDose ? ` ${currentDose(m)!.mgPerDose} mg` : ''}</option>)}
                  </optgroup>
                )}
                <optgroup label={t('add.generics')}>
                  {GENERICS.map((g) => <option key={g} value={`g:${g}`}>{t('meds.generics.' + g)}</option>)}
                  <option value="other">{t('add.other')}</option>
                </optgroup>
              </select>
            </div>
            {medKey === 'other' && <div className="field"><span className="k">{t('add.otherName')}</span><input value={otherName} onChange={(e) => setOtherName(e.target.value)} /></div>}
            <div className="field"><span className="k">{t('add.datetime')}</span><input type="datetime-local" value={doseAt} max={nowLocalISO()} onChange={(e) => setDoseAt(e.target.value)} /></div>
            <div className="field"><span className="k">{t('meds.mgPerDose')}</span><input type="number" step="any" placeholder={t('add.mgOptional')} value={mg} onChange={(e) => setMg(e.target.value)} /></div>
            <div className="field"><span className="k">{t('event.note')}</span><input value={doseNote} onChange={(e) => setDoseNote(e.target.value)} /></div>
          </div>
          <div className="note">{t('add.doseNote')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={saveDose} disabled={medKey === 'other' && !otherName.trim()}>{t('btn.save')}</button>
            <button className="btn sec" onClick={() => nav(-1)}>{t('btn.cancel')}</button>
          </div>
        </>
      )}
    </>
  )
}
