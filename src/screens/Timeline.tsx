import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { db, type Event } from '../db'
import { useDog, useDoseLogs, useEvents, useLabs, useMeds, useMonthly, useNames } from '../lib/useData'
import { buildEpisodes } from '../lib/episodes'
import { daysBetween, fmtDate, fmtDur } from '../lib/format'
import { EventTag, eventLabel } from './shared'

type Item = { date: string; kind: 'cluster' | 'seizure' | 'unusual' | 'other' | 'dose' | 'doseLog' | 'prnLog' | 'lab' | 'weight'; label: string; sub?: string; id?: string; by?: string; logId?: string; members?: string[] }

export default function Timeline() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const dog = useDog()
  const events = useEvents(dog?.id)
  const meds = useMeds(dog?.id)
  const labs = useLabs(dog?.id)
  const monthly = useMonthly(dog?.id)
  const doseLogs = useDoseLogs(dog?.id)
  const [open, setOpen] = useState<string | null>(null)
  const [showMonthly, setShowMonthly] = useState(false)
  // filter state survives opening a record and coming back (per device)
  const FILTER_KEY = 'purplelog.timeline.filters'
  const saved = (() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') as { doses?: boolean; prn?: boolean } } catch { return {} } })()
  const [showDoses, setShowDosesState] = useState(saved.doses ?? true)
  const [showPrn, setShowPrnState] = useState(saved.prn ?? true)
  const persist = (doses: boolean, prn: boolean) => { try { localStorage.setItem(FILTER_KEY, JSON.stringify({ doses, prn })) } catch { /* ignore */ } }
  const setShowDoses = (v: boolean) => { setShowDosesState(v); persist(v, showPrn) }
  const setShowPrn = (v: boolean) => { setShowPrnState(v); persist(showDoses, v) }
  const [openCluster, setOpenCluster] = useState<string | null>(null)
  const names = useNames([...events.map((e) => e.by), ...doseLogs.map((l) => l.by)])
  if (!dog) return null

  const items: Item[] = []
  const eps = buildEpisodes(events)
  for (const ep of eps) {
    if (ep.seizures >= 2) {
      items.push({ date: ep.start, kind: 'cluster', label: `${t('timeline.cluster')} ${ep.seizures}${t('timeline.seizures')}${ep.hours > 0 ? ` / ${Math.round(ep.hours)}${t('timeline.hours')}` : ''}`, id: ep.eventIds[0], members: ep.eventIds })
    } else {
      const e = events.find((x) => x.id === ep.eventIds[0])!
      items.push({ date: e.start, kind: 'seizure', label: `${eventLabel(e, t, undefined, dog)} ${fmtDur(e.durationSec, e.durationText)}`, sub: e.note, id: e.id, by: e.by })
    }
  }
  for (const e of events.filter((x) => x.kind !== 'seizure')) items.push({ date: e.start, kind: e.kind, label: eventLabel(e, t), sub: e.note, id: e.id, by: e.by })
  for (const m of meds) for (const d of m.doses) items.push({ date: d.date, kind: 'dose', label: `${t('meds.generics.' + m.generic, m.generic)} ${d.mgPerDose ? d.mgPerDose + ' mg' : ''} ×${d.timesPerDay}${d.reason ? ' ' + d.reason : ''}` })
  for (const l of doseLogs) {
    const prn = l.kind === 'prn' || l.slot === 'prn'
    if (!prn && !showDoses) continue
    if (prn && !showPrn) continue
    items.push({ date: l.time, kind: prn ? 'prnLog' : 'doseLog', label: `${t('meds.generics.' + l.generic, l.generic)}${!prn && l.slot ? ` ${l.slot}` : ''} ${l.kind === 'skipped' ? t('dose.skipped') : l.mgPerDose ? l.mgPerDose + ' mg' : ''}`, sub: l.note, by: l.by, logId: l.id })
  }
  for (const l of labs) items.push({ date: l.datetime, kind: 'lab', label: l.results.map((r) => `${r.analyte} ${r.valueText ?? r.value}`).join(' / '), id: l.id })
  for (const w of dog.weights) items.push({ date: w.date, kind: 'weight', label: `${w.kg} kg` })
  items.sort((a, b) => b.date.localeCompare(a.date))

  const tag = (k: Item['kind']) => ({ cluster: ['s', '群発'], seizure: ['s', '発作'], unusual: ['u', 'いつもと違う'], other: ['g', 'その他'], dose: ['m', t('timeline.doseChange')], doseLog: ['m', t('timeline.doseLog')], prnLog: ['w', t('timeline.prnLog')], lab: ['lab', t('timeline.lab')], weight: ['g', t('timeline.weight')] })[k]
  const thisYear = String(new Date().getFullYear())
  const dateLabel = (d: string) => (d.slice(0, 4) === thisYear ? fmtDate(d, i18n.language).slice(5) : fmtDate(d, i18n.language).slice(2)) + (d.length > 10 && d.slice(11, 16) !== '00:00' ? ` ${d.slice(11, 16)}` : '')

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => nav('/event/new?kind=seizure')}>＋ {t('add.addSeizure')}</button>
        <button className="btn sec sm" onClick={() => nav('/add?tab=dose')}>＋ {t('add.addDose')}</button>
      </div>
      <div className="period">
        <button className={showDoses ? 'on' : ''} onClick={() => setShowDoses(!showDoses)}>{t('timeline.showDoses')}</button>
        <button className={showPrn ? 'on' : ''} onClick={() => setShowPrn(!showPrn)}>{t('timeline.showPrn')}</button>
      </div>
      <div className="card">
        {items.map((it, i) => {
          const [cls, lbl] = tag(it.kind)
          const isLab = it.kind === 'lab'
          const near = isLab ? events.filter((e) => e.kind === 'unusual' && Math.abs(daysBetween(e.start.slice(0, 10), it.date.slice(0, 10))) <= 30) : []
          const who = it.by && names[it.by] ? names[it.by] : ''
          return (
            <div key={i}>
              <div className="row" style={{ cursor: it.id || isLab ? 'pointer' : 'default' }} onClick={() => (isLab ? setOpen(open === it.id ? null : it.id!) : it.members ? setOpenCluster(openCluster === it.id ? null : it.id!) : it.id ? nav(`/event/${it.id}`) : undefined)}>
                <span className="d">{dateLabel(it.date)}</span>
                <span className="grow">
                  {it.label}
                  {who && <span className="note"> · {who}</span>}
                  {it.sub && <div className="note">{it.sub}</div>}
                </span>
                <span className={'tag ' + cls}>{lbl}{it.members ? (openCluster === it.id ? ' ▴' : ' ▾') : ''}</span>
                {it.logId && (
                  <button className="tag g" onClick={(ev) => { ev.stopPropagation(); if (confirm(t('dose.undoConfirm'))) db.doseLogs.delete(it.logId!) }}>×</button>
                )}
              </div>
              {it.members && openCluster === it.id && (
                <div className="wx" style={{ fontFamily: 'inherit', marginBottom: 6 }}>
                  <div className="note">{t('timeline.clusterMembers')}</div>
                  {it.members.map((id) => events.find((e) => e.id === id)).filter((e): e is Event => !!e).map((e) => (
                    <div className="row" key={e.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/event/${e.id}`)}>
                      <span className="d">{dateLabel(e.start)}</span>
                      <span className="grow">{eventLabel(e, t, undefined, dog)} {fmtDur(e.durationSec, e.durationText)}{e.note && <div className="note">{e.note}</div>}</span>
                      <EventTag e={e} />
                    </div>
                  ))}
                </div>
              )}
              {isLab && open === it.id && (
                <div className="wx" style={{ fontFamily: 'inherit', marginBottom: 6 }}>
                  <div className="note">{t('timeline.unusualNear')}</div>
                  {near.length ? near.map((e) => <div key={e.id}>{fmtDate(e.start, i18n.language)} {eventLabel(e, t, undefined, dog)}</div>) : t('timeline.none')}
                </div>
              )}
            </div>
          )
        })}
        {items.length === 0 && <div className="note">{t('home.noSeizure')}</div>}
      </div>
      {monthly.length > 0 && (
        <div className="card">
          <h4 onClick={() => setShowMonthly(!showMonthly)} style={{ cursor: 'pointer' }}>
            {t('timeline.monthly')} {showMonthly ? '▴' : '▾'}
          </h4>
          {showMonthly &&
            [...monthly].reverse().filter((m) => m.seizures || m.unusual).map((m) => (
              <div className="row" key={m.ym}>
                <span className="d">{m.ym}</span>
                <span className="grow">
                  {t('chart.seizures')} {m.seizures}
                  {m.episodes ? ` / ${t('timeline.cluster')} ${m.episodes} (${m.episodeCounts}; ${m.episodeHours}h)` : ''}
                  {m.note && <div className="note">{m.note}</div>}
                </span>
                {m.daysSincePrev != null && <span className="tag g">+{m.daysSincePrev}d</span>}
              </div>
            ))}
        </div>
      )}
    </>
  )
}
