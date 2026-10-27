import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Dog, Event } from '../db'
import { useDog, useEvents } from '../lib/useData'
import { BLOCK_H, LEVEL_STYLE, fetchPressureForecast, pressureSettings, toBlocks, weatherIcon, type Block, type Level, type PressureForecast } from '../lib/pressure'
import { toGrid } from '../lib/weather'
import { nowLocalISO } from '../lib/format'

type Lv = Exclude<Level, 'none'>
const LEVELS: Lv[] = ['slight', 'caution', 'warn', 'rise']

/** Local ISO (YYYY-MM-DDTHH:MM) h hours from now. */
const isoIn = (h: number) => { const d = new Date(Date.now() + h * 3600000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }

/** Hourly forecast of the dog's grid cell. */
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

/** Small static chart for the Home card. */
function PressureChart({ data, blocks, from, to, seizures, height }: { data: PressureForecast; blocks: Block[]; from: string; to: string; seizures: Event[]; height: number }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<echarts.EChartsOption>(() => {
    const pts = data.time.map((tm, i) => [tm, data.pressure[i]] as [string, number | null]).filter(([tm, p]) => tm >= from && tm <= to && p != null)
    const vals = pts.map((p) => p[1] as number)
    const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1)
    const areas = blocks.filter((b) => b.level !== 'none' && b.end > from && b.start < to).map((b) => {
      const st = LEVEL_STYLE[b.level as Lv]
      return [{ xAxis: b.start, itemStyle: { color: st.stripe }, label: { show: true, position: 'insideTop' as const, formatter: st.icon, fontSize: 13, color: st.ink } }, { xAxis: b.end }]
    })
    const sz = seizures.filter((e) => e.start.slice(0, 16) >= from && e.start.slice(0, 16) <= to).map((e) => {
      const i = data.time.findIndex((tm) => tm >= e.start.slice(0, 13) + ':00')
      return [e.start.slice(0, 16), i >= 0 ? data.pressure[i] : null]
    })
    return {
      animation: false,
      grid: { left: 40, right: 10, top: 22, bottom: 26 },
      xAxis: { type: 'time', min: from, max: to, axisLabel: { fontSize: 10, hideOverlap: true, formatter: (v: number) => { const d = new Date(v); return d.getHours() === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getHours()}時` } }, splitLine: { show: true, lineStyle: { color: '#F0EDF5' } } },
      yAxis: { type: 'value', min, max, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { color: '#EFEDF4', type: 'dashed' } } },
      series: [
        { type: 'line', data: pts, showSymbol: false, smooth: 0.2, lineStyle: { width: 2.5, color: '#3B7DD8' }, markArea: { silent: true, data: areas as never }, markLine: { silent: true, symbol: 'none', label: { formatter: t('pressure.now'), fontSize: 10 }, lineStyle: { color: '#6B4FBB', type: 'solid', width: 1.5 }, data: [{ xAxis: nowLocalISO() }] } },
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
const signed = (v: number) => (v > 0 ? '+' : '') + v.toFixed(1)
const dateOf = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))

/** Next warning / caution block from now on. */
function upcoming(blocks: Block[]) {
  const now = nowLocalISO()
  const fut = blocks.filter((b) => b.end > now)
  return { warn: fut.find((b) => b.level === 'warn'), caution: fut.find((b) => b.level === 'caution') }
}

/** Compact card for Home: next 48 h. Tap → full page. */
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
  const blocks = data ? toBlocks(data, s) : []
  const now = nowLocalISO()
  const fromIso = isoIn(-6), toIso = isoIn(48)
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
            {up.warn ? <span className="pr-badge warn">💣 {md(up.warn.start) !== md(now) ? md(up.warn.start) + ' ' : ''}{hh(up.warn.start)}〜{hh(up.warn.end)} {t('pressure.warn')}（{up.warn.change} hPa）</span>
              : up.caution ? <span className="pr-badge caution">⇊ {md(up.caution.start) !== md(now) ? md(up.caution.start) + ' ' : ''}{hh(up.caution.start)}〜{hh(up.caution.end)} {t('pressure.caution')}（{up.caution.change} hPa）</span>
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

const PX = 14 // px per hour
const RULER = 30, WX = 46
const TOP = RULER + WX + 4 // top of the plot

/**
 * Horizontally scrolling strip (past 24 h → end of forecast): ruler, weather row, graded 6-hour blocks,
 * pressure line and seizures. The fixed centre line selects the hour shown in the header.
 */
function PressureStrip({ data, blocks, seizures, height }: { data: PressureForecast; blocks: Block[]; seizures: Event[]; height: number }) {
  const { t, i18n } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const wd = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }), [i18n.language])

  const g = useMemo(() => {
    const startIso = isoIn(-24).slice(0, 13) + ':00'
    const i0 = Math.max(0, data.time.findIndex((tm) => tm >= startIso))
    let i1 = data.time.length - 1
    while (i1 > i0 && data.pressure[i1] == null) i1--
    const vals = data.pressure.slice(i0, i1 + 1).filter((v): v is number => v != null)
    const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1)
    const step = hi - lo > 12 ? 5 : 2
    const bottom = height - 6
    const x = (i: number) => (i - i0) * PX
    const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (bottom - TOP)
    const idxOf = (iso: string) => { const k = data.time.indexOf(iso.slice(0, 13) + ':00'); return k < 0 ? -1 : k + Number(iso.slice(14, 16)) / 60 }
    const lines: number[] = []
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) lines.push(v)
    const path = data.pressure.slice(i0, i1 + 1).map((v, k) => (v == null ? '' : `${x(i0 + k).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')
    return { i0, i1, W: x(i1), bottom, x, y, idxOf, lines, path }
  }, [data, height])

  const nowIdx = g.idxOf(nowLocalISO())
  const [sel, setSel] = useState(nowIdx)
  useLayoutEffect(() => {
    const el = box.current
    if (el) el.scrollLeft = g.x(nowIdx) - el.clientWidth / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g])
  const onScroll = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const el = box.current
      if (!el) return
      setSel(Math.min(g.i1, Math.max(g.i0, g.i0 + (el.scrollLeft + el.clientWidth / 2) / PX)))
    })
  }

  // values at the centre line
  const j = Math.min(g.i1, Math.max(g.i0, Math.round(sel)))
  const a = data.pressure[Math.floor(sel)], b = data.pressure[Math.ceil(sel)]
  const pSel = a != null && b != null ? a + (b - a) * (sel - Math.floor(sel)) : data.pressure[j]
  const tm = data.time[j]
  const blk = blocks.find((k) => k.start <= tm && tm < k.end)
  const blkInk = blk && blk.level !== 'none' ? LEVEL_STYLE[blk.level].ink : blk && blk.change < 0 ? '#C0392B' : '#3B7DD8'

  const hours: number[] = []
  for (let i = g.i0; i <= g.i1; i++) hours.push(i)
  const seen = blocks.filter((k) => k.end > data.time[g.i0] && k.start < data.time[g.i1])
  const sz = seizures.map((e) => ({ e, i: g.idxOf(e.start) })).filter(({ i }) => i >= g.i0 && i <= g.i1)

  return (
    <>
      <div className="pr-now">
        <div className="pr-date"><span>{tm.slice(0, 4)}</span><b>{md(tm)}<small>({wd.format(dateOf(tm))})</small></b></div>
        <div className="pr-hour">{Number(tm.slice(11, 13))}<small>時</small></div>
        <div className="pr-vals">
          <div><i style={{ background: '#E8743B' }} />{t('pressure.temp')}<b>{data.temp[j] != null ? Math.round(data.temp[j]!) : '–'}</b>℃</div>
          <div><i style={{ background: '#3B7DD8' }} />{t('pressure.pres')}<b>{pSel != null ? pSel.toFixed(1) : '–'}</b>hPa</div>
          {blk && <div className="pr-chg"><span>{hh(blk.start)}〜{hh(blk.end)}</span><b style={{ color: blkInk }}>{signed(blk.change)}</b>{blk.level !== 'none' && <em style={{ color: blkInk }}>{LEVEL_STYLE[blk.level].icon}{t('pressure.' + blk.level)}</em>}</div>}
        </div>
      </div>
      <div className="pr-strip" style={{ height }}>
        <div className="pr-scroll" ref={box} onScroll={onScroll}>
          <svg width={g.W} height={height} style={{ display: 'block' }}>
            <defs>
              {LEVELS.map((l) => (
                <pattern key={l} id={'pr-' + l} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                  <rect width="12" height="12" fill={LEVEL_STYLE[l].bg} />
                  <rect width="5" height="12" fill={LEVEL_STYLE[l].stripe} />
                </pattern>
              ))}
            </defs>
            {/* past shading */}
            <rect x={0} y={RULER} width={Math.max(0, g.x(nowIdx))} height={height - RULER} fill="rgba(0,0,0,0.035)" />
            {/* graded blocks */}
            {seen.map((k) => {
              if (k.level === 'none') return null
              const x0 = g.x(g.idxOf(k.start)), w = BLOCK_H * PX
              const st = LEVEL_STYLE[k.level]
              return (
                <g key={k.start}>
                  <rect x={x0 + 1} y={TOP} width={w - 2} height={g.bottom - TOP} fill={`url(#pr-${k.level})`} />
                  <text x={x0 + w / 2} y={TOP + 30} textAnchor="middle" fontSize="24" fill={st.ink}>{st.icon}</text>
                  <text x={x0 + w / 2} y={TOP + 50} textAnchor="middle" fontSize="12" fontWeight="700" fill={st.ink}>{t('pressure.' + k.level)}</text>
                </g>
              )
            })}
            {/* block boundaries */}
            {hours.filter((i) => Number(data.time[i].slice(11, 13)) % BLOCK_H === 3).map((i) => <line key={'b' + i} x1={g.x(i)} x2={g.x(i)} y1={RULER} y2={height} stroke="#E4E1EC" />)}
            {/* grid */}
            {g.lines.map((v) => <line key={'l' + v} x1={0} x2={g.W} y1={g.y(v)} y2={g.y(v)} stroke="#8DB3E8" strokeDasharray="6 5" strokeWidth={1} />)}
            {/* ruler + weather row */}
            <line x1={0} x2={g.W} y1={RULER} y2={RULER} stroke="#C9C4D6" />
            {hours.map((i) => {
              const h = Number(data.time[i].slice(11, 13)), big = h % 3 === 0
              return (
                <g key={'r' + i}>
                  <line x1={g.x(i)} x2={g.x(i)} y1={RULER - (big ? 7 : 3)} y2={RULER} stroke="#9C96AE" />
                  {big && <text x={g.x(i)} y={RULER - 9} textAnchor="middle" fontSize="11" fill="#4A4458" fontWeight={h % 12 === 0 ? 700 : 400}>{h % 12 === 0 ? `${h}時` : h}</text>}
                  {h === 0 && <text x={g.x(i) + 3} y={11} fontSize="11" fontWeight="700" fill="#4A4458">{md(data.time[i])}({wd.format(dateOf(data.time[i]))})</text>}
                  {big && <text x={g.x(i)} y={RULER + 15} textAnchor="middle" fontSize="11" fill="#E8743B">{data.temp[i] != null ? Math.round(data.temp[i]!) + '℃' : ''}</text>}
                  {big && <text x={g.x(i)} y={RULER + 38} textAnchor="middle" fontSize="17">{weatherIcon(data.code[i], h)}</text>}
                </g>
              )
            })}
            {/* now */}
            <line x1={g.x(nowIdx)} x2={g.x(nowIdx)} y1={RULER} y2={height} stroke="#6B4FBB" strokeDasharray="3 3" />
            {/* pressure + seizures */}
            <polyline points={g.path} fill="none" stroke="#3B7DD8" strokeWidth="3" strokeLinejoin="round" />
            {sz.map(({ e, i }) => { const p = data.pressure[Math.round(i)]; return p == null ? null : <circle key={e.id} cx={g.x(i)} cy={g.y(p)} r="5.5" fill="#5B3FA8" stroke="#fff" strokeWidth="1.5" /> })}
          </svg>
        </div>
        {/* fixed overlays: y labels, centre line and dot */}
        {g.lines.map((v) => <span key={'y' + v} className="pr-ylab" style={{ top: g.y(v) - 8 }}>{v}</span>)}
        <div className="pr-center" style={{ top: RULER }} />
        <div className="pr-pointer" />
        {pSel != null && <div className="pr-dot" style={{ top: g.y(pSel) - 7 }} />}
      </div>
    </>
  )
}

/** Full page: scroll the strip under the centre line to read any hour. */
export default function PressurePage() {
  const { t } = useTranslation()
  const dog = useDog()
  const events = useEvents(dog?.id)
  const { data, err } = useForecast(dog)
  const s = pressureSettings(dog)
  if (!dog) return null
  if (dog.gridLat == null) return <div className="card"><div className="note">{t('pressure.noGrid')}</div></div>
  const blocks = data ? toBlocks(data, s) : []
  return (
    <div className="card">
      <h4>{t('pressure.title')}（{dog.regionName || t('pressure.area')}）</h4>
      {err && <div className="note">{t('pressure.error')}</div>}
      {!data && !err && <div className="note">{t('pressure.loading')}</div>}
      {data && (
        <>
          <PressureStrip data={data} blocks={blocks} seizures={events.filter((e) => e.kind === 'seizure')} height={430} />
          <div className="note" style={{ textAlign: 'center' }}>{t('pressure.scrollHint')}</div>
          <div className="legend">
            {LEVELS.map((l) => <span key={l}><i style={{ background: LEVEL_STYLE[l].stripe }} />{LEVEL_STYLE[l].icon}{t('pressure.' + l)}</span>)}
            <span><i style={{ background: '#5B3FA8', borderRadius: '50%' }} />{t('pressure.seizureDot')}</span>
          </div>
        </>
      )}
      <div className="note" style={{ marginTop: 6 }}>{t('pressure.rule', { s: s.slight, c: s.caution, w: s.warn, r: s.rise })}</div>
      <div className="note">{s.enabled ? t('pressure.alertOn', { h: s.leadHours }) : t('pressure.alertOff')}</div>
      <div className="note">{t('pressure.farNote')}</div>
    </div>
  )
}
