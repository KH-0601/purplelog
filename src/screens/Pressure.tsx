import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Dog, Event } from '../db'
import { useDog, useEvents } from '../lib/useData'
import { fetchPressureForecast, pressureSettings, toBlocks, weatherIcon, type Block, type PressureForecast } from '../lib/pressure'
import { toGrid } from '../lib/weather'
import { nowLocalISO } from '../lib/format'

const LEVEL_FILL = { caution: 'rgba(240,176,40,0.28)', warn: 'rgba(226,82,82,0.30)' } as const

/** Hourly forecast of the dog's grid cell, plus its graded 3-hour blocks. */
function useForecast(dog?: Dog) {
  const [data, setData] = useState<PressureForecast | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!dog || dog.gridLat == null || dog.gridLon == null) return
    const g = toGrid(dog.gridLat, dog.gridLon)
    let alive = true
    fetchPressureForecast(g.lat, g.lon, dog.tz || 'Asia/Tokyo').then((d) => alive && setData(d)).catch((e) => alive && setErr(String(e?.message ?? e)))
    return () => { alive = false }
  }, [dog?.id, dog?.gridLat, dog?.gridLon])
  return { data, err }
}

function PressureChart({ data, blocks, from, to, seizures, height }: { data: PressureForecast; blocks: Block[]; from: string; to: string; seizures: Event[]; height: number }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<echarts.EChartsOption>(() => {
    const pts = data.time.map((tm, i) => [tm, data.pressure[i]] as [string, number | null]).filter(([tm, p]) => tm >= from && tm <= to && p != null)
    const vals = pts.map((p) => p[1] as number)
    const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1)
    const areas = blocks.filter((b) => b.level !== 'none' && b.end > from && b.start < to).map((b) => [
      { xAxis: b.start, itemStyle: { color: LEVEL_FILL[b.level as 'caution' | 'warn'] }, label: { show: b.level === 'warn', position: 'insideTop' as const, formatter: '💣', fontSize: 13 } },
      { xAxis: b.end },
    ])
    const sz = seizures.filter((e) => e.start.slice(0, 16) >= from && e.start.slice(0, 16) <= to).map((e) => {
      const i = data.time.findIndex((tm) => tm >= e.start.slice(0, 13) + ':00')
      return [e.start.slice(0, 16), i >= 0 ? data.pressure[i] : null]
    })
    const now = nowLocalISO()
    return {
      animation: false,
      grid: { left: 40, right: 10, top: 22, bottom: 26 },
      xAxis: { type: 'time', min: from, max: to, axisLabel: { fontSize: 10, hideOverlap: true, formatter: (v: number) => { const d = new Date(v); return d.getHours() === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getHours()}時` } }, splitLine: { show: true, lineStyle: { color: '#F0EDF5' } } },
      yAxis: { type: 'value', min, max, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { color: '#EFEDF4', type: 'dashed' } } },
      series: [
        { type: 'line', data: pts, showSymbol: false, smooth: 0.2, lineStyle: { width: 2.5, color: '#3B7DD8' }, markArea: { silent: true, data: areas as never }, markLine: { silent: true, symbol: 'none', label: { formatter: t('pressure.now'), fontSize: 10 }, lineStyle: { color: '#6B4FBB', type: 'solid', width: 1.5 }, data: [{ xAxis: now }] } },
        { type: 'scatter', data: sz, symbolSize: 10, itemStyle: { color: '#5B3FA8', borderColor: '#fff', borderWidth: 1.5 }, z: 5 },
      ],
      tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '' : `${v} hPa`) },
    }
  }, [data, blocks, from, to, seizures, t])
  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current, undefined, { renderer: 'svg' })
    c.setOption(option, true)
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); c.dispose() }
  }, [option])
  return <div ref={ref} style={{ width: '100%', height }} />
}

const hh = (iso: string) => `${Number(iso.slice(11, 13))}時`
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

/** Next warning / caution block from now on. */
function upcoming(blocks: Block[]) {
  const now = nowLocalISO()
  const fut = blocks.filter((b) => b.end > now)
  return { warn: fut.find((b) => b.level === 'warn'), caution: fut.find((b) => b.level === 'caution') }
}

/** Compact card for Home: next 24 h. Tap → full page. */
export function PressureCard() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const dog = useDog()
  const events = useEvents(dog?.id)
  const { data, err } = useForecast(dog)
  const s = pressureSettings(dog)
  if (!dog) return null
  if (dog.gridLat == null) return (
    <div className="card"><h4>{t('pressure.title')}</h4><div className="note">{t('pressure.noGrid')}</div></div>
  )
  const blocks = data ? toBlocks(data, s.caution, s.warn) : []
  const now = nowLocalISO()
  const to = new Date(Date.now() + 24 * 3600000)
  const toIso = new Date(to.getTime() - to.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const from = new Date(Date.now() - 6 * 3600000)
  const fromIso = new Date(from.getTime() - from.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const up = upcoming(blocks.filter((b) => b.start < toIso))
  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={() => nav('/pressure')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>{t('pressure.title')}</h4>
        <span className="note">{t('pressure.more')} ›</span>
      </div>
      {err && <div className="note">{t('pressure.error')}</div>}
      {data && (
        <>
          <div className="pr-head">
            {up.warn ? <span className="pr-badge warn">💣 {md(up.warn.start) !== md(now) ? md(up.warn.start) + ' ' : ''}{hh(up.warn.start)}〜{hh(up.warn.end)} {t('pressure.warn')}（{up.warn.drop} hPa）</span>
              : up.caution ? <span className="pr-badge caution">{md(up.caution.start) !== md(now) ? md(up.caution.start) + ' ' : ''}{hh(up.caution.start)}〜{hh(up.caution.end)} {t('pressure.caution')}（{up.caution.drop} hPa）</span>
              : <span className="pr-badge ok">{t('pressure.calm')}</span>}
          </div>
          <PressureChart data={data} blocks={blocks} from={fromIso} to={toIso} seizures={events.filter((e) => e.kind === 'seizure')} height={170} />
        </>
      )}
      {!data && !err && <div className="note">{t('pressure.loading')}</div>}
      {s.enabled && <div className="note">{t('pressure.alertOn', { h: s.leadHours })}</div>}
    </div>
  )
}

/** Full page: past 24 h + next 48 h, with 3-hour tiles. */
export default function PressurePage() {
  const { t } = useTranslation()
  const dog = useDog()
  const events = useEvents(dog?.id)
  const { data, err } = useForecast(dog)
  const s = pressureSettings(dog)
  if (!dog) return null
  if (dog.gridLat == null) return <div className="card"><div className="note">{t('pressure.noGrid')}</div></div>
  const blocks = data ? toBlocks(data, s.caution, s.warn) : []
  const now = nowLocalISO()
  const shift = (h: number) => { const d = new Date(Date.now() + h * 3600000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
  const fromIso = shift(-24), toIso = shift(48)
  const tiles = blocks.filter((b) => b.end > shift(-3) && b.start < toIso)
  return (
    <>
      <div className="card">
        <h4>{t('pressure.title')}（{dog.regionName || t('pressure.area')}）</h4>
        {err && <div className="note">{t('pressure.error')}</div>}
        {!data && !err && <div className="note">{t('pressure.loading')}</div>}
        {data && (
          <>
            <div className="pr-tiles">
              {tiles.map((b) => (
                <div key={b.start} className={'pr-tile ' + b.level + (b.start <= now && now < b.end ? ' cur' : '')}>
                  <div className="pr-t">{b.start.slice(11, 13) === '00' ? md(b.start) : hh(b.start)}</div>
                  <div className="pr-i">{weatherIcon(b.code)}</div>
                  <div className="pr-c">{b.temp != null ? Math.round(b.temp) + '℃' : ''}</div>
                  <div className="pr-d">{b.drop > 0 ? '+' : ''}{b.drop}</div>
                  <div className="pr-l">{b.level === 'warn' ? '💣' : b.level === 'caution' ? t('pressure.caution') : ''}</div>
                </div>
              ))}
            </div>
            <PressureChart data={data} blocks={blocks} from={fromIso} to={toIso} seizures={events.filter((e) => e.kind === 'seizure')} height={300} />
            <div className="legend">
              <span><i style={{ background: '#3B7DD8' }} />{t('pressure.line')}</span>
              <span><i style={{ background: LEVEL_FILL.caution }} />{t('pressure.caution')}</span>
              <span><i style={{ background: LEVEL_FILL.warn }} />{t('pressure.warn')}</span>
              <span><i style={{ background: '#5B3FA8', borderRadius: '50%' }} />{t('pressure.seizureDot')}</span>
            </div>
          </>
        )}
        <div className="note" style={{ marginTop: 6 }}>{t('pressure.rule', { c: s.caution, w: s.warn })}</div>
        <div className="note">{s.enabled ? t('pressure.alertOn', { h: s.leadHours }) : t('pressure.alertOff')}</div>
      </div>
    </>
  )
}
