import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, uid, type DoseLog, type DosePlan, type Event } from '../db'
import { useDog, useMeds } from '../lib/useData'
import { currentUserId } from '../lib/cloud'
import { nowLocalISO, today } from '../lib/format'
import { GENERICS, SEIZURE_TYPES, UNUSUAL_ITEMS, currentDose } from './shared'

type Tab = 'seizure' | 'dose' | 'plan'

/** Manual entry: a past seizure / not-normal day, or a dose given (scheduled or as-needed) at a chosen date and time. */
export default function AddRecord() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const dog = useDog()
  const meds = useMeds(dog?.id)
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'seizure')

  // ---- seizure form
  const [kind, setKind] = useState<'seizure' | 'unusual'>('seizure')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState(nowLocalISO().slice(11, 16))
  const [timeUnknown, setTimeUnknown] = useState(false)
  const [durMin, setDurMin] = useState('')
  const [durSec, setDurSec] = useState('')
  const [count, setCount] = useState('1')
  const [stype, setStype] = useState<string>('')
  const [cons, setCons] = useState<string>('')
  const [items, setItems] = useState<string[]>([])
  const [note, setNote] = useState('')

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

  async function saveSeizure() {
    const sec = kind === 'seizure' && (durMin || durSec) ? Number(durMin || 0) * 60 + Number(durSec || 0) : undefined
    const e: Event = {
      id: uid(),
      dogId: dog!.id,
      kind,
      start: `${date}T${timeUnknown ? '00:00' : time}`,
      tz: dog!.tz,
      timeUnknown,
      durationSec: sec,
      count: kind === 'seizure' ? Math.max(1, Number(count) || 1) : undefined,
      seizureType: kind === 'seizure' && stype ? stype : undefined,
      consciousness: kind === 'seizure' && cons ? (cons as Event['consciousness']) : undefined,
      unusualItems: kind === 'unusual' ? items : undefined,
      note: note || undefined,
      source: 'manual',
      by: currentUserId() ?? undefined,
      updatedAt: new Date().toISOString(),
    }
    await db.events.add(e)
    nav(`/event/${e.id}`, { replace: true })
  }

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

  const toggleItem = (v: string) => setItems(items.includes(v) ? items.filter((x) => x !== v) : [...items, v])

  return (
    <>
      <div className="period">
        <button className={tab === 'seizure' ? 'on' : ''} onClick={() => setTab('seizure')}>{t('add.seizureTab')}</button>
        <button className={tab === 'dose' ? 'on' : ''} onClick={() => setTab('dose')}>{t('add.doseTab')}</button>
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>{t('plan.planTab')}</button>
      </div>

      {tab === 'seizure' && (
        <>
          <div className="card">
            <div className="field">
              <span className="k">{t('event.kind')}</span>
              <div className="chips">
                <button className={'chip-btn ' + (kind === 'seizure' ? 'on' : '')} onClick={() => setKind('seizure')}>{t('event.seizure')}</button>
                <button className={'chip-btn u ' + (kind === 'unusual' ? 'on' : '')} onClick={() => setKind('unusual')}>{t('event.unusual')}</button>
              </div>
            </div>
            <div className="field"><span className="k">{t('add.date')}</span><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="field">
              <span className="k">{t('add.time')}</span>
              <input type="time" value={time} disabled={timeUnknown} onChange={(e) => setTime(e.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="checkbox" checked={timeUnknown} onChange={(e) => setTimeUnknown(e.target.checked)} />
                {t('event.timeUnknown')}
              </label>
            </div>
            {kind === 'seizure' && (
              <>
                <div className="field">
                  <span className="k">{t('event.duration')}</span>
                  <input type="number" min={0} placeholder={t('common.min')} value={durMin} onChange={(e) => setDurMin(e.target.value)} />
                  <span className="note">{t('common.min')}</span>
                  <input type="number" min={0} max={59} placeholder={t('common.sec')} value={durSec} onChange={(e) => setDurSec(e.target.value)} />
                  <span className="note">{t('common.sec')}</span>
                </div>
                <div className="field"><span className="k">{t('event.count')}</span><input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} /></div>
              </>
            )}
          </div>
          {kind === 'seizure' ? (
            <div className="card">
              <h4>{t('event.type')}</h4>
              <div className="chips">
                {SEIZURE_TYPES.map((s) => (
                  <button key={s} className={'chip-btn ' + (stype === s ? 'on' : '')} onClick={() => setStype(stype === s ? '' : s)}>{t('event.types.' + s)}</button>
                ))}
              </div>
              <div className="field" style={{ marginTop: 6 }}>
                <span className="k">{t('event.consciousness')}</span>
                <select value={cons} onChange={(e) => setCons(e.target.value)}>
                  <option value="">—</option>
                  {(['lost', 'kept', 'unknown'] as const).map((c) => <option key={c} value={c}>{t('event.cons.' + c)}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="card">
              <h4>{t('event.unusual')}</h4>
              <div className="chips">
                {UNUSUAL_ITEMS.map((u) => (
                  <button key={u} className={'chip-btn u ' + (items.includes(u) ? 'on' : '')} onClick={() => toggleItem(u)}>{t('event.items.' + u)}</button>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <h4>{t('event.note')}</h4>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="note">{t('add.seizureNote')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={saveSeizure}>{t('btn.save')}</button>
            <button className="btn sec" onClick={() => nav(-1)}>{t('btn.cancel')}</button>
          </div>
        </>
      )}

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
