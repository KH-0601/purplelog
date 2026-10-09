import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { db, type WeatherDaily } from '../db'
import { useDog, useEvents, useWeatherDaily } from '../lib/useData'
import { analyseDog, ANALYSABLE_MIN_RECORD_DAYS, ANALYSABLE_MIN_SEIZURE_DAYS } from '../lib/stats'
import { dailyFromHourly, fetchHourly, toGrid } from '../lib/weather'
import { addDays, today } from '../lib/format'

export default function DevDog() {
  const { t } = useTranslation()
  const dog = useDog()
  const events = useEvents(dog?.id)
  const grid = dog?.gridLat != null && dog?.gridLon != null ? toGrid(dog.gridLat, dog.gridLon) : undefined
  const daily = useWeatherDaily(grid?.id)
  const [busy, setBusy] = useState(false)
  const [forecastD24, setForecastD24] = useState<number | null>(null)
  if (!dog) return null
  const a = analyseDog(events, daily)

  async function importDaily() {
    if (!grid || !events.length) return
    setBusy(true)
    try {
      const first = events[0].start.slice(0, 10)
      const end = today()
      let start = first
      while (start <= end) {
        const chunkEnd = addDays(start, 120) < end ? addDays(start, 120) : end
        const h = await fetchHourly(grid.lat, grid.lon, addDays(start, -1), chunkEnd)
        const rows: WeatherDaily[] = []
        for (let d = start; d <= chunkEnd; d = addDays(d, 1)) {
          const v = dailyFromHourly(h, d)
          if (v) rows.push({ key: `${grid.id}|${d}`, gridId: grid.id, date: d, ...v, source: 'open-meteo' })
        }
        await db.weatherDaily.bulkPut(rows)
        start = addDays(chunkEnd, 1)
      }
      const f = await fetchHourly(grid.lat, grid.lon, addDays(end, -1), addDays(end, 1))
      const nowIdx = f.time.findIndex((x) => x >= new Date().toISOString().slice(0, 13))
      const p0 = nowIdx >= 0 ? f.pressure_msl[nowIdx] : null
      const p24 = nowIdx >= 0 ? f.pressure_msl[nowIdx + 24] : null
      setForecastD24(p0 != null && p24 != null ? +(p24 - p0).toFixed(1) : null)
    } catch (err) {
      alert(t('common.error') + ': ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const hit = a.analysable && a.meanSeizure != null && forecastD24 != null && forecastD24 <= a.meanSeizure
  const scale = (v?: number) => `${Math.min(100, Math.abs(v ?? 0) * 10)}%`

  return (
    <>
      <div className="devbar">{t('dev.banner')}</div>
      <div className="period">
        <Link to="/dev/community" style={{ flex: 1 }}><button style={{ width: '100%' }}>{t('dev.community')}</button></Link>
        <button className="on">{t('dev.dog')}</button>
      </div>
      <div className="card">
        <h4>{t('dev.analysable')}</h4>
        <div className="field"><span className="k">{t('dev.seizureDays')}</span><span>{a.seizureDays} {a.seizureDays >= ANALYSABLE_MIN_SEIZURE_DAYS ? '✓' : `(≥${ANALYSABLE_MIN_SEIZURE_DAYS})`}</span></div>
        <div className="field"><span className="k">{t('dev.recordDays')}</span><span>{a.recordDays} {a.recordDays >= ANALYSABLE_MIN_RECORD_DAYS ? '✓' : `(≥${ANALYSABLE_MIN_RECORD_DAYS})`}</span></div>
        <div className="field"><span className="k">{t('dev.stage')}</span><span className={'tag ' + (a.analysable ? 'm' : 'g')}>{a.analysable ? t('dev.ok') : t('dev.notYet')}</span></div>
        <div className="note">{t('home.monthlyOnly')}: 2021–2025</div>
      </div>
      <div className="card">
        <h4>{t('dev.d24')}</h4>
        {!grid && <div className="note">{t('dev.noGrid')}</div>}
        {grid && (
          <>
            <div className="field"><span className="k">{t('dev.dailyCount')}</span><span>{daily.length}</span>
              <button className="btn sec sm" disabled={busy} onClick={importDaily}>{t('dev.fetchDaily')}</button></div>
            <div className="bars">
              <div className="b"><span>{t('dev.seizureDay')} {a.seizureD24.length}</span><i style={{ width: scale(a.meanSeizure) }} /><span>{a.meanSeizure?.toFixed(1) ?? '—'} hPa</span></div>
              <div className="b n"><span>{t('dev.nonSeizureDay')} {a.nonSeizureD24.length}</span><i style={{ width: scale(a.meanNon) }} /><span>{a.meanNon?.toFixed(1) ?? '—'} hPa</span></div>
            </div>
            <div className="note">
              {a.diff != null ? `${t('dev.diff')} ${a.diff.toFixed(1)} hPa` : ''}{a.ci ? `（${t('dev.ci')} ${a.ci[0].toFixed(1)} 〜 ${a.ci[1].toFixed(1)}）` : ''}。{t('dev.obs')}
            </div>
          </>
        )}
      </div>
      <div className="card">
        <h4>{t('dev.judgement')}</h4>
        <div className="field"><span className="k">{t('dev.forecast')}</span><span>{forecastD24 != null ? `${forecastD24 > 0 ? '+' : ''}${forecastD24} hPa` : '—'}</span></div>
        <div className="field"><span className="k">{t('dev.stage')}</span><span className={'tag ' + (hit ? 'u' : 'g')}>{hit ? t('dev.hit') : t('dev.nohit')}</span></div>
        <div className="field"><span className="k">{t('dev.unpublished')}</span><span className="tag g">{t('dev.unpublished')}</span></div>
        <div className="wx" style={{ fontFamily: 'inherit', marginTop: 6 }}>
          {t('dev.text')}:<br />「{t('dev.suggestion')}」<br />
          <span className="note">{t('dev.disclaimer')}</span>
        </div>
      </div>
    </>
  )
}
