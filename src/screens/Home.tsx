import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { db, uid, type DoseLog, type DosePlan, type Medication } from '../db'
import { latestWeight, useDog, useDoseLogs, useDosePlans, useEvents, useLabs, useMeds, useMonthly } from '../lib/useData'
import { currentUserId } from '../lib/cloud'
import { monthlyRows, ymOf } from '../lib/monthly'
import { addDays, daysBetween, fmtDur, fmtMD, nowLocalISO, today } from '../lib/format'
import { nextCheck, ruleFor } from '../lib/monitoring'
import { CODES, EventTag, currentDose, defaultSchedule, eventLabel, isActiveMed } from './shared'

const GENERIC_TO_ANALYTE: Record<string, string> = { phenobarbital: 'PB', potassium_bromide: 'KBr', zonisamide: 'ZNS', levetiracetam: 'LEV' }

export default function Home() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const dog = useDog()
  const events = useEvents(dog?.id)
  const monthly = useMonthly(dog?.id)
  const meds = useMeds(dog?.id)
  const labs = useLabs(dog?.id)
  const doseLogs = useDoseLogs(dog?.id)
  const plans = useDosePlans(dog?.id)
  if (!dog) return null

  const now = today()
  const ym = ymOf(now)
  const rows = monthlyRows(monthly, events)
  const cur = rows.find((r) => r.ym === ym)?.seizures ?? 0
  const prevYm = ymOf(addDays(ym + '-01', -1))
  const prev = rows.find((r) => r.ym === prevYm)?.seizures ?? 0
  const delta = prev ? Math.round(((cur - prev) / prev) * 100) : null

  const seizures = events.filter((e) => e.kind === 'seizure')
  const lastSeizure = seizures.length ? seizures[seizures.length - 1] : undefined
  let sinceLast: number | undefined
  let monthlyOnly = false
  if (lastSeizure) sinceLast = daysBetween(lastSeizure.start.slice(0, 10), now)
  else {
    const m = [...monthly].reverse().find((r) => r.seizures > 0)
    if (m) {
      monthlyOnly = true
      sinceLast = daysBetween(m.ym + '-28', now)
    }
  }

  // ---- today's doses
  const kg = latestWeight(dog.weights)
  const activeMeds = meds.filter((m) => m.kind === 'maintenance' && isActiveMed(m, now))
  const todayLogs = doseLogs.filter((l) => l.time.startsWith(now))
  async function giveDose(m: Medication, slot: string) {
    const d = currentDose(m)
    const log: DoseLog = { id: uid(), dogId: dog!.id, medicationId: m.id, generic: m.generic, time: nowLocalISO(), slot, kind: 'scheduled', mgPerDose: d?.mgPerDose, by: currentUserId() ?? undefined }
    await db.doseLogs.add(log)
  }
  const nowIso = nowLocalISO()
  const openPlans = plans.filter((p) => !p.doneLogId && !p.cancelled)
  const duePlans = openPlans.filter((p) => p.time.slice(0, 10) <= now)
  const upcoming = openPlans.filter((p) => p.time.slice(0, 10) > now).slice(0, 5)
  async function givePlan(p: DosePlan) {
    const log: DoseLog = { id: uid(), dogId: dog!.id, medicationId: p.medicationId, generic: p.generic, time: nowLocalISO(), slot: 'prn', kind: 'prn', mgPerDose: p.mgPerDose, note: p.note, by: currentUserId() ?? undefined }
    await db.doseLogs.add(log)
    await db.dosePlans.update(p.id, { doneLogId: log.id })
  }
  async function cancelPlan(p: DosePlan) {
    if (confirm(t('plan.cancel') + '?')) await db.dosePlans.update(p.id, { cancelled: true })
  }
  async function undoDose(log: DoseLog) {
    if (confirm(t('dose.undoConfirm'))) await db.doseLogs.delete(log.id)
  }

  // next suggested check per maintenance drug (guidance only)
  const checks = meds
    .filter((m) => m.kind === 'maintenance' && ruleFor(m.generic))
    .map((m) => {
      const anchor = currentDose(m)?.date ?? m.startDate
      const analyte = GENERIC_TO_ANALYTE[m.generic]
      const prevChecks = labs.filter((l) => l.results.some((r) => r.analyte === analyte)).map((l) => l.datetime.slice(0, 10))
      return { generic: m.generic, next: nextCheck(m.generic, anchor, prevChecks), anchor }
    })
    .filter((c) => c.next)

  // last 30 days mini bars
  const days = Array.from({ length: 30 }, (_, i) => addDays(now, i - 29))
  const perDay = days.map((d) => ({
    d,
    s: events.filter((e) => e.kind === 'seizure' && e.start.startsWith(d)).reduce((a, e) => a + (e.count ?? 1), 0),
    u: events.filter((e) => e.kind === 'unusual' && e.start.startsWith(d)).length,
  }))
  const maxDay = Math.max(1, ...perDay.map((p) => p.s + p.u))
  const recent = [...events].reverse().slice(0, 5)

  return (
    <>
      <div className="card">
        <div className="kpi">
          <div>
            <div className="n">
              {cur}
              <small>{t('home.times')}</small>
            </div>
            <div className="l">{t('home.thisMonth')}</div>
            {delta != null && <div className={'delta' + (delta > 0 ? ' up' : '')}>{t('home.vsPrev')} {delta > 0 ? '+' : ''}{delta}%</div>}
          </div>
          <div>
            <div className="n">
              {sinceLast ?? '—'}
              <small>{t('home.days')}</small>
            </div>
            <div className="l">
              {t('home.sinceLast')}
              {monthlyOnly && <span className="note"> {t('home.monthlyOnly')}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h4>{t('dose.today')}</h4>
        {activeMeds.length === 0 && (
          <div className="note">
            {t('dose.noMeds')}{' '}
            <a href="#/meds">{t('nav.meds')} →</a>
          </div>
        )}
        {activeMeds.map((m) => {
          const d = currentDose(m)
          const slots = m.scheduleTimes?.length ? m.scheduleTimes : defaultSchedule(d?.timesPerDay ?? 2)
          const mgkg = d?.mgPerDose && kg ? ` (${(d.mgPerDose / kg).toFixed(2)} mg/kg)` : ''
          return (
            <div key={m.id} className="dose-row">
              <div className="dose-name">
                <b>{t('meds.generics.' + m.generic, m.generic)}</b>
                <span className="note">{d?.mgPerDose ? ` ${d.mgPerDose} mg${mgkg}` : ''}</span>
              </div>
              <div className="dose-slots">
                {slots.map((slot) => {
                  const log = todayLogs.find((l) => l.medicationId === m.id && l.slot === slot) ?? todayLogs.find((l) => l.medicationId === m.id && !l.slot && Math.abs(Number(l.time.slice(11, 13)) - Number(slot.slice(0, 2))) <= 3)
                  return log ? (
                    <button key={slot} className="dose-btn done" onClick={() => undoDose(log)} title={t('dose.undo')}>
                      ✓ {slot} <small>{log.time.slice(11, 16)}</small>
                    </button>
                  ) : (
                    <button key={slot} className="dose-btn" onClick={() => giveDose(m, slot)}>
                      {slot} {t('dose.give')}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {duePlans.length > 0 && (
          <div className="dose-row">
            <div className="dose-name"><b>{t('plan.title')}</b> <span className="tag w">{t('add.prn')}</span></div>
            {duePlans.map((p) => (
              <div className="plan-row" key={p.id}>
                <span className="d">{p.time.slice(5, 10).replace('-', '/')} {p.time.slice(11, 16)}</span>
                <span className="grow">{t('meds.generics.' + p.generic, p.generic)}{p.mgPerDose ? ` ${p.mgPerDose} mg` : ''}{p.note ? <span className="note"> {p.note}</span> : ''}{p.time < nowIso && <span className="tag w" style={{ marginLeft: 6 }}>{t('alert.overdue', { min: Math.round((new Date(nowIso).getTime() - new Date(p.time).getTime()) / 60000) })}</span>}</span>
                <button className="dose-btn" onClick={() => givePlan(p)}>{t('dose.give')}</button>
                <button className="tag g" onClick={() => cancelPlan(p)}>×</button>
              </div>
            ))}
          </div>
        )}
        {activeMeds.length > 0 && <div className="note">{t('dose.hint')}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn sec sm" onClick={() => nav('/add?tab=dose')}>＋ {t('add.addDose')}</button>
          <button className="btn sec sm" onClick={() => nav('/add?tab=seizure')}>＋ {t('add.addSeizure')}</button>
          <button className="btn sec sm" onClick={() => nav('/add?tab=plan')}>＋ {t('plan.add')}</button>
        </div>
        {upcoming.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <h4>{t('plan.upcoming')}</h4>
            {upcoming.map((p) => (
              <div className="plan-row" key={p.id}>
                <span className="d">{p.time.slice(5, 10).replace('-', '/')} {p.time.slice(11, 16)}</span>
                <span className="grow">{t('meds.generics.' + p.generic, p.generic)}{p.mgPerDose ? ` ${p.mgPerDose} mg` : ''}{p.note ? <span className="note"> {p.note}</span> : ''}</span>
                <button className="tag g" onClick={() => cancelPlan(p)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h4>{t('home.last30')}</h4>
        <div className="mini">
          {perDay.map((p) => (
            <i key={p.d} className={p.s ? '' : p.u ? 'u' : ''} style={{ height: `${((p.s + p.u) / maxDay) * 100}%`, opacity: p.s + p.u ? 1 : 0 }} title={`${fmtMD(p.d)} ${p.s}/${p.u}`} />
          ))}
        </div>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--seiz)' }} />
            {t('chart.seizures')}
          </span>
          <span>
            <i style={{ background: 'var(--unusual)' }} />
            {t('chart.unusual')}
          </span>
        </div>
      </div>
      <div className="card">
        <h4>{t('home.nextCheck')}</h4>
        {checks.length === 0 && <div className="note">—</div>}
        {checks.map((c) => (
          <div className="field" key={c.generic}>
            <span>{t('meds.generics.' + c.generic, c.generic)}</span>
            <span className={'tag ' + (c.next!.date <= now ? 'm' : 'g')}>{fmtMD(c.next!.date)}</span>
          </div>
        ))}
        <div className="note">{t('home.guidance')}</div>
      </div>
      <div className="card">
        <h4>{t('home.recent')}</h4>
        {recent.length === 0 && <div className="note">{t('home.noSeizure')}</div>}
        {recent.map((e) => (
          <div className="row" key={e.id} onClick={() => nav(`/event/${e.id}`)} style={{ cursor: 'pointer' }}>
            <span className="d">{fmtMD(e.start)}</span>
            <span className="grow">{eventLabel(e, t, i18n.language)}{e.kind === 'seizure' && e.durationSec != null ? ` ${fmtDur(e.durationSec)}` : ''}</span>
            <EventTag e={e} />
          </div>
        ))}
      </div>
      <div className="note" style={{ textAlign: 'center' }}>{Object.keys(CODES).length ? '' : ''}</div>
    </>
  )
}
