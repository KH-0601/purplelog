import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db, type DoseLog } from '../db'
import { nowLocalISO } from '../lib/format'

const shiftMin = (iso: string, min: number) => {
  const d = new Date(new Date(iso).getTime() + min * 60000)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/**
 * Sheet for a recorded dose: correct the time it was actually given (the button is sometimes tapped late)
 * or remove the record. The slot it covers (slot / slotDate) stays the same; only `time` changes.
 */
export default function DoseEdit({ log, label, onUndo, onClose }: { log: DoseLog; label: string; onUndo: () => Promise<unknown> | unknown; onClose: () => void }) {
  const { t } = useTranslation()
  const orig = log.time.slice(0, 16)
  const [v, setV] = useState(orig)
  const max = nowLocalISO()
  const future = !!v && v > max
  async function save() {
    if (!v || future) return
    if (v !== orig) await db.doseLogs.update(log.id, { time: v })
    onClose()
  }
  return (
    <div className="alert-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="alert-box dose-edit" onClick={(e) => e.stopPropagation()}>
        <h3>{label}{log.slot && log.slot !== 'prn' ? <span className="note"> {log.slot}</span> : null}</h3>
        <div className="note">{t('dose.editNote', { time: orig.slice(11, 16) })}</div>
        <div className="field">
          <span className="k">{t('dose.givenAt')}</span>
          <input type="datetime-local" value={v} max={max} onChange={(e) => setV(e.target.value)} />
        </div>
        <div className="dose-edit-quick">
          {[-10, -30, -60].map((m) => (
            <button key={m} className="tag g" onClick={() => setV(shiftMin(v || orig, m))}>{t('dose.minus', { n: m === -60 ? t('dose.oneHour') : `${-m}${t('common.min')}` })}</button>
          ))}
          {v !== orig && <button className="tag g" onClick={() => setV(orig)}>{t('dose.resetTime')}</button>}
        </div>
        {future && <div className="note" style={{ color: 'var(--warn)' }}>{t('dose.futureTime')}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" style={{ flex: 1 }} disabled={!v || future} onClick={save}>{t('btn.save')}</button>
          <button className="btn sec" onClick={onClose}>{t('btn.cancel')}</button>
        </div>
        <button className="dose-edit-undo" onClick={async () => { await onUndo(); onClose() }}>{t('dose.removeRecord')}</button>
      </div>
    </div>
  )
}
