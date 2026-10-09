import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { latestWeight, useDog, useDoseLogs, useEvents, useLabs, useMeds, useMonthly, useRefs } from '../lib/useData'
import { defaultSchedule, isActiveMed } from './shared'
import { buildEpisodes } from '../lib/episodes'
import { monthlyRows } from '../lib/monthly'
import { addDays, daysBetween, fmtDate, fmtDur, today } from '../lib/format'
import { median, seizureDays } from '../lib/stats'
import { classifyTiming } from '../lib/monitoring'
import { findRange } from '../lib/normalize'
import LongTermChart, { type Period } from './LongTermChart'
import { DRUG_ANALYTES } from './shared'

const analyteGeneric: Record<string, string> = { PB: 'phenobarbital', KBr: 'potassium_bromide', ZNS: 'zonisamide', LEV: 'levetiracetam' }

export default function VetReport() {
  const { t, i18n } = useTranslation()
  const dog = useDog()
  const events = useEvents(dog?.id)
  const monthly = useMonthly(dog?.id)
  const meds = useMeds(dog?.id)
  const labs = useLabs(dog?.id)
  const refs = useRefs()
  const doseLogs = useDoseLogs(dog?.id)
  const [period, setPeriod] = useState<Period>('y1')
  if (!dog) return null
  const now = today()
  const from = period === 'all' ? undefined : addDays(now, period === 'y1' ? -365 : period === 'm6' ? -183 : period === 'm3' ? -91 : -30)
  const evs = events.filter((e) => !from || e.start >= from)
  const rows = monthlyRows(monthly, events, from?.slice(0, 7), now.slice(0, 7))
  const totalSeizures = rows.reduce((a, r) => a + r.seizures, 0)
  const episodes = rows.reduce((a, r) => a + r.episodes.length, 0)
  const sDays = seizureDays(evs)
  const monthlyOnlyMonths = rows.filter((r) => r.source === 'summary' && r.seizures > 0).length
  const longest = Math.max(0, ...evs.filter((e) => e.kind === 'seizure').map((e) => e.durationSec ?? 0))
  const intervals = sDays.slice(1).map((d, i) => daysBetween(sDays[i], d))
  const medInt = intervals.length ? median(intervals) : median(monthly.filter((m) => (!from || m.ym >= from.slice(0, 7)) && m.daysSincePrev != null).map((m) => m.daysSincePrev as number))
  const last90 = events.filter((e) => e.kind === 'seizure' && e.start >= addDays(now, -90)).reduce((a, e) => a + (e.count ?? 1), 0)
  const prev90 = events.filter((e) => e.kind === 'seizure' && e.start >= addDays(now, -180) && e.start < addDays(now, -90)).reduce((a, e) => a + (e.count ?? 1), 0)
  const change = prev90 ? Math.round(((last90 - prev90) / prev90) * 100) : null
  const eps = buildEpisodes(evs)
  const kg = latestWeight(dog.weights)
  const latestLab = (a: string) => [...labs].reverse().find((l) => l.results.some((r) => r.analyte === a))
  const analytes = ['PB', 'KBr', 'ZNS', 'LEV', 'T4', 'FT4', 'TSH', 'ALT', 'ALP']
  const currentDose = (m: (typeof meds)[number]) => [...m.doses].sort((a, b) => a.date.localeCompare(b.date)).pop()
  // adherence: doses recorded vs planned slots, over the last 30 days
  const adhFrom = addDays(now, -29)
  const planned = meds.filter((m) => m.kind === 'maintenance' && isActiveMed(m, now)).reduce((a, m) => a + (m.scheduleTimes?.length ?? defaultSchedule(currentDose(m)?.timesPerDay ?? 2).length) * 30, 0)
  const given = doseLogs.filter((l) => l.time >= adhFrom && l.kind !== 'prn' && l.slot !== 'prn').length
  const prnLogs = doseLogs.filter((l) => (l.kind === 'prn' || l.slot === 'prn') && (!from || l.time >= from))

  return (
    <>
      <div className="period noprint">
        {(['m3', 'm6', 'y1', 'all'] as Period[]).map((p) => (
          <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
            {t('chart.period.' + p)}
          </button>
        ))}
        <button onClick={() => window.print()}>{t('btn.print')}</button>
      </div>
      <div className="card rep">
        <h3>
          {dog.name}　{kg ? `${kg} kg` : ''}　{dog.breed ?? ''} {dog.sex && dog.sex !== 'unknown' ? t('settings.sexes.' + dog.sex) : ''}
        </h3>
        <div className="meta">
          {dog.diagnosis ? t('report.dx.' + dog.diagnosis, dog.diagnosis) : ''}
          {dog.diagnosisDate ? `（${fmtDate(dog.diagnosisDate, i18n.language)}）` : ''}　{t('report.period')} {from ? fmtDate(from, i18n.language) : rows[0]?.ym ?? ''} 〜 {fmtDate(now, i18n.language)}
        </div>
      </div>
      <div className="card">
        <h4>{t('chart.seizures')}</h4>
        <table className="tbl">
          <tbody>
            <tr><td>{t('report.seizures')}</td><td className="n">{totalSeizures}</td></tr>
            <tr><td>{t('report.seizureDays')}</td><td className="n">{sDays.length}{monthlyOnlyMonths ? ` + ${monthlyOnlyMonths}${t('home.monthlyOnly')}` : ''}</td></tr>
            <tr><td>{t('report.episodes')}</td><td className="n">{episodes}{eps.some((e) => e.statusEpilepticus) ? ' (SE)' : ''}</td></tr>
            <tr><td>{t('report.longest')}</td><td className="n">{longest ? fmtDur(longest) : t('report.unknown')}</td></tr>
            <tr><td>{t('report.medianInterval')}</td><td className="n">{medInt != null ? `${medInt} ${t('report.days')}` : '—'}</td></tr>
            <tr><td>{t('report.change90')}</td><td className="n">{change != null ? `${change > 0 ? '+' : ''}${change}%` : `${last90} / ${prev90}`}</td></tr>
            <tr><td>{t('report.prnCount')}</td><td className="n">{prnLogs.length}{prnLogs.length > 0 && <div className="note">{Array.from(new Set(prnLogs.map((l) => t('meds.generics.' + l.generic, l.generic)))).join('・')}</div>}</td></tr>
            {planned > 0 && <tr><td>{t('meds.adherence')} (30d)</td><td className="n">{given} / {planned} ({Math.round((given / planned) * 100)}%)</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h4>{t('report.meds')}</h4>
        <table className="tbl">
          <tbody>
            {meds.map((m) => {
              const d = currentDose(m)
              const mgkg = d?.mgPerDose && kg ? `${((d.mgPerDose * d.timesPerDay) / kg).toFixed(2)} mg/kg/日` : ''
              return (
                <tr key={m.id}>
                  <td>{t('meds.generics.' + m.generic, m.generic)} <span className="note">{t('meds.kinds.' + m.kind)}</span></td>
                  <td className="n">{d?.mgPerDose ? `${d.mgPerDose} mg × ${d.timesPerDay}　${mgkg}` : d ? `× ${d.timesPerDay}` : t('meds.doseUnknown')}</td>
                </tr>
              )
            })}
            {meds.flatMap((m) => m.doses.filter((d) => !from || d.date >= from).map((d) => (
              <tr key={m.id + d.date}><td className="note">{fmtDate(d.date, i18n.language)} {t('timeline.doseChange')}</td><td className="n note">{t('meds.generics.' + m.generic, m.generic)} {d.mgPerDose ?? '?'} mg × {d.timesPerDay}</td></tr>
            )))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h4>{t('report.labs')}</h4>
        <table className="tbl">
          <tbody>
            {analytes.map((a) => {
              const l = latestLab(a)
              if (!l) return null
              const r = l.results.find((x) => x.analyte === a)!
              const range = findRange(refs, a, l.labName)
              const tc = DRUG_ANALYTES.includes(a) ? classifyTiming(analyteGeneric[a], l.hoursSinceDose, currentDose(meds.find((m) => m.generic === analyteGeneric[a]) ?? ({ doses: [] } as never))?.timesPerDay) : undefined
              return (
                <tr key={a}>
                  <td>{a} <span className="note">{fmtDate(l.datetime, i18n.language)}{tc && (tc === 'trough' || tc === 'post_dose') ? `・${t('meds.' + tc)}` : ''}</span></td>
                  <td className="n">{r.valueText ?? r.value} {r.unit}{range ? ` (${range.low}–${range.high})` : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="note">{t('report.troughFooter')}。{t('report.weatherFooter')}</div>
      </div>
      <LongTermChart events={events} monthly={monthly} meds={meds} labs={labs} refs={refs} period={period} compact />
    </>
  )
}
