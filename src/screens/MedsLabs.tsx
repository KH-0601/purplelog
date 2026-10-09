import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db, uid, type Lab, type Medication } from '../db'
import { latestWeight, useDog, useLabs, useMeds, useRefs } from '../lib/useData'
import { classifyTiming, ruleFor, type TimingClass } from '../lib/monitoring'
import { findRange, normalize } from '../lib/normalize'
import { fmtDate, nowLocalISO, today } from '../lib/format'
import { ANALYTES, DRUG_ANALYTES, GENERICS, defaultSchedule } from './shared'
import LabPhotoImport from './LabPhotoImport'
import { normaliseUnit, uploadImage, type Extracted } from '../lib/labImport'
import { useCloud } from '../lib/cloud'

/** Small thumbnail of a lab report; opens the full image. */
function LabThumb({ lab }: { lab: Lab }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (lab.imageBlob) {
      const u = URL.createObjectURL(lab.imageBlob)
      setUrl(u)
      return () => URL.revokeObjectURL(u)
    }
    setUrl(lab.imageAssetId ? `/_blob/${lab.imageAssetId}` : null)
  }, [lab.imageBlob, lab.imageAssetId])
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" title="report">
      <img src={url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--rule)' }} />
    </a>
  )
}

const analyteGeneric: Record<string, string> = { PB: 'phenobarbital', KBr: 'potassium_bromide', ZNS: 'zonisamide', LEV: 'levetiracetam' }

export default function MedsLabs() {
  const { t, i18n } = useTranslation()
  const dog = useDog()
  const meds = useMeds(dog?.id)
  const labs = useLabs(dog?.id)
  const refs = useRefs()
  const [editing, setEditing] = useState<string | null>(null)
  const [dose, setDose] = useState({ date: today(), mgPerDose: '', timesPerDay: '2', reason: '' })
  const [addingMed, setAddingMed] = useState(false)
  const [newMed, setNewMed] = useState({ generic: 'phenobarbital', kind: 'maintenance', startDate: today(), mgPerDose: '', timesPerDay: '2' })
  const [addingLab, setAddingLab] = useState(false)
  const [lab, setLab] = useState<{ datetime: string; lastDoseAt: string; labName: string; values: Record<string, string> }>({ datetime: nowLocalISO(), lastDoseAt: '', labName: '', values: {} })
  const [editRefs, setEditRefs] = useState(false)
  const [labImage, setLabImage] = useState<Blob | null>(null)
  const [extractedRanges, setExtractedRanges] = useState<{ analyte: string; low: number; high: number; unit: string }[]>([])
  const [labNote, setLabNote] = useState('')
  const [didExtract, setDidExtract] = useState(false)
  const cloud = useCloud()
  if (!dog) return null
  const kg = latestWeight(dog.weights)

  const currentDose = (m: Medication) => [...m.doses].sort((a, b) => a.date.localeCompare(b.date)).pop()
  const timesPerDayFor = (generic: string) => currentDose(meds.find((m) => m.generic === generic) ?? { doses: [] } as unknown as Medication)?.timesPerDay

  async function saveDose(m: Medication) {
    const d = { date: dose.date, mgPerDose: dose.mgPerDose ? Number(dose.mgPerDose) : undefined, timesPerDay: Number(dose.timesPerDay), weightKg: kg, reason: dose.reason || undefined }
    await db.medications.put({ ...m, doses: [...m.doses, d], scheduleTimes: m.scheduleTimes?.length === d.timesPerDay ? m.scheduleTimes : defaultSchedule(d.timesPerDay), updatedAt: today() })
    setEditing(null)
  }
  async function saveMed() {
    await db.medications.add({ id: uid(), dogId: dog!.id, generic: newMed.generic, kind: newMed.kind as Medication['kind'], startDate: newMed.startDate, doses: newMed.mgPerDose ? [{ date: newMed.startDate, mgPerDose: Number(newMed.mgPerDose), timesPerDay: Number(newMed.timesPerDay) || 2, weightKg: kg }] : [], scheduleTimes: defaultSchedule(Number(newMed.timesPerDay) || 2), updatedAt: today() })
    setAddingMed(false)
  }
  async function saveLab() {
    const results = ANALYTES.filter((a) => lab.values[a.code]).map((a) => ({ analyte: a.code, value: parseFloat(lab.values[a.code]) || 0, valueText: /^[\d.]+$/.test(lab.values[a.code]) ? null : lab.values[a.code], unit: a.unit }))
    const hours = lab.lastDoseAt ? +(((new Date(lab.datetime).getTime() - new Date(lab.lastDoseAt).getTime()) / 3600000).toFixed(1)) : undefined
    const imageAssetId = labImage ? (await uploadImage(labImage)) ?? undefined : undefined
    const l: Lab = { id: uid(), dogId: dog!.id, datetime: lab.datetime, labName: lab.labName, lastDoseAt: lab.lastDoseAt || undefined, hoursSinceDose: hours, results, note: labNote || undefined, imageAssetId, imageBlob: labImage ?? undefined, extracted: didExtract || undefined }
    await db.labs.add(l)
    setAddingLab(false)
    setLab({ datetime: nowLocalISO(), lastDoseAt: '', labName: '', values: {} })
    setLabImage(null)
    setExtractedRanges([])
    setLabNote('')
    setDidExtract(false)
  }
  function applyExtract(x: Extracted) {
    const values: Record<string, string> = { ...lab.values }
    const notes: string[] = []
    const ranges: { analyte: string; low: number; high: number; unit: string }[] = []
    for (const r of x.results) {
      if (r.analyte === 'OTHER' || !ANALYTES.some((a) => a.code === r.analyte)) {
        if (r.item) notes.push(`${r.item} ${r.value_text ?? r.value ?? ''} ${r.unit ?? ''}`.trim())
        continue
      }
      if (r.value != null) {
        const n = normaliseUnit(r.analyte, r.value, r.unit)
        values[r.analyte] = String(n.value)
        if (n.note) notes.push(`${r.analyte}: ${n.note}`)
      } else if (r.value_text) values[r.analyte] = r.value_text
      if (r.ref_low != null && r.ref_high != null) {
        const lo = normaliseUnit(r.analyte, r.ref_low, r.unit).value
        const hi = normaliseUnit(r.analyte, r.ref_high, r.unit).value
        ranges.push({ analyte: r.analyte, low: lo, high: hi, unit: ANALYTES.find((a) => a.code === r.analyte)!.unit })
      }
    }
    const datetime = x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? `${x.date}T${lab.datetime.slice(11, 16) || '09:00'}` : lab.datetime
    setLab({ ...lab, datetime, labName: x.lab_name ?? lab.labName, values })
    setExtractedRanges(ranges)
    setLabNote([x.patient_name ? `患畜名: ${x.patient_name}` : '', ...notes].filter(Boolean).join(' / '))
    setDidExtract(true)
  }
  async function saveExtractedRanges() {
    for (const r of extractedRanges) {
      const existing = refs.find((x) => x.analyte === r.analyte && x.labName === (lab.labName ?? ''))
      if (existing) await db.refRanges.update(existing.id, { low: r.low, high: r.high, unit: r.unit, note: 'from report' })
      else await db.refRanges.add({ id: uid(), labName: lab.labName ?? '', analyte: r.analyte, low: r.low, high: r.high, unit: r.unit, note: 'from report' })
    }
    setExtractedRanges([])
    alert(t('labimg.rangesSaved'))
  }

  const timingOf = (l: Lab, analyte: string): TimingClass => classifyTiming(analyteGeneric[analyte] ?? '', l.hoursSinceDose, timesPerDayFor(analyteGeneric[analyte] ?? ''))
  const prevTiming = (l: Lab, analyte: string) => {
    const prev = [...labs].filter((x) => x.datetime < l.datetime && x.results.some((r) => r.analyte === analyte)).pop()
    return prev ? timingOf(prev, analyte) : undefined
  }

  return (
    <>
      <div className="card">
        <h4>
          {t('meds.current')}（{t('meds.weight')} {kg ?? '—'} kg）
        </h4>
        {[...meds].sort((a, b) => (a.endDate ? 1 : 0) - (b.endDate ? 1 : 0)).map((m) => {
          const d = currentDose(m)
          const mgkg = d?.mgPerDose && kg ? ((d.mgPerDose * d.timesPerDay) / kg).toFixed(2) : null
          const rule = ruleFor(m.generic)
          return (
            <div key={m.id}>
              <div className="field">
                <span>
                  {t('meds.generics.' + m.generic, m.generic)} <span className="tag g">{t('meds.kinds.' + m.kind)}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  {d?.mgPerDose ? `${d.mgPerDose} mg × ${d.timesPerDay}` : d ? `× ${d.timesPerDay}/日` : <span className="note">{t('meds.doseUnknown')}</span>}
                  {mgkg && ` ＝ ${mgkg} ${t('meds.mgkg')}/日`}
                  <div>
                    <button className="btn sec sm" onClick={() => setEditing(editing === m.id ? null : m.id)}>
                      {t('meds.change')}
                    </button>
                  </div>
                </span>
              </div>
              {rule && <div className="note">{rule.note[i18n.language === 'en' ? 'en' : 'ja']}</div>}
              {m.kind === 'maintenance' && (
                <div className="field"><span className="k">{t('meds.schedule')}</span>
                  <input defaultValue={(m.scheduleTimes ?? defaultSchedule(d?.timesPerDay ?? 2)).join(', ')} onBlur={(e) => db.medications.update(m.id, { scheduleTimes: e.target.value.split(/[,、\s]+/).map((x) => x.trim()).filter((x) => /^\d{1,2}:\d{2}$/.test(x)).map((x) => x.padStart(5, '0')) })} />
                  {m.endDate ? <span className="tag g">{t('meds.stopped')} {m.endDate}</span> : <button className="btn sec sm" onClick={() => confirm(t('meds.stop') + '?') && db.medications.update(m.id, { endDate: today() })}>{t('meds.stop')}</button>}
                </div>
              )}
              {m.doses.length > 0 && (
                <div className="note">
                  {t('meds.history')}: {[...m.doses].sort((a, b) => a.date.localeCompare(b.date)).map((x) => `${fmtDate(x.date, i18n.language)} ${x.mgPerDose ?? '?'}mg×${x.timesPerDay}`).join(' → ')}
                </div>
              )}
              {editing === m.id && (
                <div className="wx" style={{ fontFamily: 'inherit', marginTop: 6 }}>
                  <div className="field"><span className="k">{t('meds.start')}</span><input type="date" value={dose.date} onChange={(e) => setDose({ ...dose, date: e.target.value })} /></div>
                  <div className="field"><span className="k">{t('meds.mgPerDose')}</span><input type="number" value={dose.mgPerDose} onChange={(e) => setDose({ ...dose, mgPerDose: e.target.value })} /></div>
                  <div className="field"><span className="k">{t('meds.perDay')}</span><input type="number" value={dose.timesPerDay} onChange={(e) => setDose({ ...dose, timesPerDay: e.target.value })} /></div>
                  <div className="field"><span className="k">{t('meds.reason')}</span><input value={dose.reason} onChange={(e) => setDose({ ...dose, reason: e.target.value })} /></div>
                  <button className="btn sm" onClick={() => saveDose(m)}>{t('btn.save')}</button>
                </div>
              )}
            </div>
          )
        })}
        {addingMed ? (
          <div className="wx" style={{ fontFamily: 'inherit', marginTop: 6 }}>
            <div className="field"><span className="k">{t('meds.analyte')}</span>
              <select value={newMed.generic} onChange={(e) => setNewMed({ ...newMed, generic: e.target.value })}>{GENERICS.map((g) => <option key={g} value={g}>{t('meds.generics.' + g)}</option>)}</select></div>
            <div className="field"><span className="k">{t('event.kind')}</span>
              <select value={newMed.kind} onChange={(e) => setNewMed({ ...newMed, kind: e.target.value })}>{['maintenance', 'rescue', 'trial'].map((k) => <option key={k} value={k}>{t('meds.kinds.' + k)}</option>)}</select></div>
            <div className="field"><span className="k">{t('meds.start')}</span><input type="date" value={newMed.startDate} onChange={(e) => setNewMed({ ...newMed, startDate: e.target.value })} /></div>
            <div className="field"><span className="k">{t('meds.mgPerDose')}</span><input type="number" step="any" value={newMed.mgPerDose} onChange={(e) => setNewMed({ ...newMed, mgPerDose: e.target.value })} /></div>
            <div className="field"><span className="k">{t('meds.perDay')}</span><input type="number" value={newMed.timesPerDay} onChange={(e) => setNewMed({ ...newMed, timesPerDay: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 6 }}><button className="btn sm" onClick={saveMed}>{t('btn.save')}</button><button className="btn sec sm" onClick={() => setAddingMed(false)}>{t('btn.cancel')}</button></div>
          </div>
        ) : (
          <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => setAddingMed(true)}>＋ {t('btn.add')}</button>
        )}
      </div>

      <div className="card">
        <h4>{t('meds.labs')}</h4>
        <div className="note" style={{ marginBottom: 6 }}>{t('meds.troughNote')}</div>
        {!addingLab && <button className="btn sec sm" onClick={() => setAddingLab(true)}>＋ {t('meds.addLab')}</button>}
        {addingLab && (
          <div className="wx" style={{ fontFamily: 'inherit' }}>
            <LabPhotoImport onImage={setLabImage} onExtract={applyExtract} />
            <div className="field"><span className="k">{t('labimg.labName')}</span><input value={lab.labName} onChange={(e) => setLab({ ...lab, labName: e.target.value })} /></div>
            <div className="field"><span className="k">{t('meds.date')}</span><input type="datetime-local" value={lab.datetime} onChange={(e) => setLab({ ...lab, datetime: e.target.value })} /></div>
            <div className="field"><span className="k">{t('meds.lastDose')}</span><input type="datetime-local" value={lab.lastDoseAt} onChange={(e) => setLab({ ...lab, lastDoseAt: e.target.value })} /></div>
            {ANALYTES.map((a) => (
              <div className="field" key={a.code}><span className="k">{a.code} ({a.unit})</span><input inputMode="decimal" value={lab.values[a.code] ?? ''} onChange={(e) => setLab({ ...lab, values: { ...lab.values, [a.code]: e.target.value } })} /></div>
            ))}
            <div className="field"><span className="k">{t('event.note')}</span><input value={labNote} onChange={(e) => setLabNote(e.target.value)} /></div>
            {extractedRanges.length > 0 && (
              <div className="note" style={{ margin: '6px 0' }}>
                {extractedRanges.map((r) => `${r.analyte} ${r.low}–${r.high} ${r.unit}`).join(' / ')}
                <div><button className="btn sec sm" onClick={saveExtractedRanges}>{t('labimg.saveRanges')}</button></div>
              </div>
            )}
            {labImage && cloud.status === 'local' && <div className="note">{t('labimg.deviceOnly')}</div>}
            <div style={{ display: 'flex', gap: 6 }}><button className="btn sm" onClick={saveLab}>{t('btn.save')}</button><button className="btn sec sm" onClick={() => { setAddingLab(false); setLabImage(null); setExtractedRanges([]); setDidExtract(false) }}>{t('btn.cancel')}</button></div>
          </div>
        )}
        {[...labs].reverse().map((l) => (
          <div key={l.id} style={{ borderTop: '1px solid #F0EDF5', padding: '6px 0' }}>
            <div className="field" style={{ borderTop: 0 }}>
              <span className="d" style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{fmtDate(l.datetime, i18n.language)}</span>
              <span className="note">{l.labName ? `${l.labName} ` : ''}{l.hoursSinceDose != null ? `${t('meds.lastDose')} ${l.hoursSinceDose}${t('meds.hoursSince')}` : ''}</span>
              {(l.imageAssetId || l.imageBlob) && <LabThumb lab={l} />}
            </div>
            {l.note && <div className="note">{l.note}</div>}
            {l.results.map((r) => {
              const range = findRange(refs, r.analyte, l.labName)
              const n = normalize(r.value, range)
              const isDrug = DRUG_ANALYTES.includes(r.analyte)
              const tc = isDrug ? timingOf(l, r.analyte) : undefined
              const pt = isDrug ? prevTiming(l, r.analyte) : undefined
              return (
                <div className="field" key={r.analyte} style={{ borderTop: 0, padding: '3px 0' }}>
                  <span className="k">{r.analyte}</span>
                  <span style={{ flex: 1 }}>
                    {r.valueText ?? r.value} {r.unit}
                    {range && <span className="note">　{t('meds.ref')} {range.low}–{range.high}{n != null ? ` (${n.toFixed(2)})` : ''}</span>}
                  </span>
                  {tc && (tc === 'trough' || tc === 'post_dose') && (
                    <span className={'tag ' + (tc === 'trough' ? 'm' : tc === 'post_dose' ? 'w' : 'g')}>
                      {t('meds.' + tc)}
                      {pt && pt !== 'unknown' ? (pt === tc ? `・${t('meds.sameAsPrev')}` : ' ⚠') : ''}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <div className="note">{t('meds.noWarn')}。{t('meds.normalized')}</div>
      </div>

      <div className="card">
        <h4 style={{ cursor: 'pointer' }} onClick={() => setEditRefs(!editRefs)}>
          {t('meds.ref')} {editRefs ? '▴' : '▾'}
        </h4>
        {refs.map((r) => (
          <div className="field" key={r.id}>
            <span className="k">{r.analyte}</span>
            {editRefs ? (
              <>
                <input type="number" step="any" value={r.low} onChange={(e) => db.refRanges.update(r.id, { low: Number(e.target.value) })} />
                <input type="number" step="any" value={r.high} onChange={(e) => db.refRanges.update(r.id, { high: Number(e.target.value) })} />
              </>
            ) : (
              <span>
                {r.low}–{r.high} {r.unit} {r.note && <span className="note">{r.note}</span>}
              </span>
            )}
          </div>
        ))}
        {editRefs && (
          <button className="btn sec sm" onClick={() => db.refRanges.add({ id: uid(), labName: '', analyte: 'ALT', low: 10, high: 100, unit: 'U/L' })}>
            ＋ {t('btn.add')}
          </button>
        )}
      </div>
    </>
  )
}
