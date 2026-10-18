import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { useTranslation } from 'react-i18next'
import type { Dog, Event, Lab, Medication, MonthlySummary, ReferenceRange } from '../db'
import { monthlyRows } from '../lib/monthly'
import { findRange, normalize } from '../lib/normalize'
import { addDays, today } from '../lib/format'
import { DRUG_ANALYTES, MONITOR_ANALYTES, PATTERN_COLORS, dogPatterns, type Pattern } from './shared'

export type Period = 'm1' | 'm3' | 'm6' | 'y1' | 'all'

function useChart(option: echarts.EChartsOption) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current, undefined, { renderer: 'svg' })
    c.setOption(option, true)
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      c.dispose()
    }
  }, [option])
  return ref
}

const CODES: Record<string, string> = { phenobarbital: 'PB', potassium_bromide: 'KBr', zonisamide: 'ZNS', levetiracetam: 'LEV', imepitoin: 'IMP', gabapentin: 'GBP', supplement_trial_M010: 'SUP' }
const COLORS: Record<string, string> = { PB: '#D64545', KBr: '#E0B31E', ZNS: '#7B5EA7', LEV: '#4D9E8A', T4: '#3B7DD8', FT4: '#7BAAE8', TSH: '#9AB8E8', ALT: '#9A8F6A', ALP: '#C4B48A' }

export default function LongTermChart({ events, monthly, meds, labs, refs, period, compact, dog }: { events: Event[]; monthly: MonthlySummary[]; meds: Medication[]; labs: Lab[]; refs: ReferenceRange[]; period: Period; compact?: boolean; dog?: Dog }) {
  const patterns = dogPatterns(dog)
  const split = patterns.length > 1
  const { t } = useTranslation()
  const now = today()
  const daily = period === 'm1' || period === 'm3'
  const fromDate = period === 'm1' ? addDays(now, -30) : period === 'm3' ? addDays(now, -91) : period === 'm6' ? addDays(now, -183) : period === 'y1' ? addDays(now, -365) : undefined

  // ---- panel 1: seizures / unusual / episodes
  let cats: string[]
  let seiz: number[]
  let unus: number[]
  let eps: { x: string; y: number; count: number; hours: number }[] = []
  // per-pattern seizure counts per category (A/B/C + unclassified) when the dog uses several patterns
  const countBy = (pred: (e: Event) => boolean, p?: Pattern | 'none') => events.filter((e) => e.kind === 'seizure' && pred(e) && (p === undefined || (p === 'none' ? !e.pattern : e.pattern === p))).reduce((a, e) => a + (e.count ?? 1), 0)
  let byPattern: Record<string, number[]> = {}
  if (daily) {
    cats = []
    for (let d = fromDate!; d <= now; d = addDays(d, 1)) cats.push(d)
    seiz = cats.map((d) => countBy((e) => e.start.startsWith(d)))
    unus = cats.map((d) => events.filter((e) => e.kind === 'unusual' && e.start.startsWith(d)).length)
    if (split) for (const p of [...patterns, 'none' as const]) byPattern[p] = cats.map((d) => countBy((e) => e.start.startsWith(d), p))
  } else {
    const rows = monthlyRows(monthly, events, fromDate?.slice(0, 7), now.slice(0, 7))
    cats = rows.map((r) => r.ym)
    seiz = rows.map((r) => r.seizures)
    unus = rows.map((r) => r.unusual)
    eps = rows.flatMap((r) => r.episodes.map((e, i) => ({ x: r.ym, y: r.seizures + i * 2.2, count: e.count, hours: e.hours })))
    if (split) {
      for (const p of patterns) byPattern[p] = rows.map((r) => countBy((e) => e.start.startsWith(r.ym), p))
      // whatever the month total does not attribute to A/B/C (older spreadsheet months, records without a pattern)
      byPattern['none'] = rows.map((r, i) => Math.max(0, r.seizures - patterns.reduce((a, p) => a + byPattern[p][i], 0)))
    }
  }
  const seizureSeries: echarts.SeriesOption[] = split
    ? [...patterns.map((p) => ({ name: t('seizure.pattern' + p), type: 'bar' as const, stack: 'seiz', data: byPattern[p], itemStyle: { color: PATTERN_COLORS[p] }, barMaxWidth: 14, barCategoryGap: '25%', z: 2 })),
       { name: t('chart.seizures'), type: 'bar' as const, stack: 'seiz', data: byPattern['none'], itemStyle: { color: '#C9C0E6' }, barMaxWidth: 14, z: 2 }]
    : [{ name: t('chart.seizures'), type: 'bar' as const, data: seiz, itemStyle: { color: '#5B3FA8' }, barMaxWidth: 14, barCategoryGap: '25%', z: 2 }]
  // Monthly axis: January shows the year ("26/1"), other months just "3月". Which months get a label depends on
  // how many fit: ≤8 all, ≤18 odd months (so January is always visible), ≤36 quarterly, otherwise Jan/Jul.
  const axisLabel = (v: string) => (daily ? v.slice(5).replace('-', '/') : v.endsWith('-01') || cats.length <= 8 ? v.slice(2, 4) + '/' + String(Number(v.slice(5))) : String(Number(v.slice(5))) + '月')
  const showLabel = (index: number, value: string) => {
    if (daily) return index % 7 === 0
    const m = Number(value.slice(5))
    if (cats.length <= 8) return true
    if (cats.length <= 18) return m % 2 === 1
    if (cats.length <= 36) return m === 1 || m === 4 || m === 7 || m === 10
    return m === 1 || m === 7
  }
  const opt1: echarts.EChartsOption = {
    animation: false,
    grid: { left: 28, right: 10, top: 8, bottom: 24, containLabel: false },
    xAxis: { type: 'category', data: cats, axisLabel: { fontSize: 10, formatter: axisLabel, interval: showLabel, hideOverlap: true, margin: 8 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 9 }, splitLine: { lineStyle: { color: '#EFEDF4' } } },
    series: [
      ...seizureSeries,
      { name: t('chart.unusual'), type: 'bar', data: unus, itemStyle: { color: '#D9A441' }, barMaxWidth: 8, barGap: '-30%', z: 1 },
      {
        name: t('chart.episodes'),
        type: 'scatter',
        data: eps.map((e) => ({ value: [e.x, e.y], count: e.count, hours: e.hours })),
        symbolSize: (_v: unknown, p: unknown) => 10 + Math.min(24, Math.sqrt(((p as { data: { hours?: number } }).data.hours ?? 0)) * 3),
        itemStyle: { color: '#8E77D6', opacity: 0.85 },
        label: { show: true, formatter: (p: unknown) => { const h = (p as { data: { hours?: number } }).data.hours ?? 0; return h >= 12 ? String(Math.round(h)) : '' }, fontSize: 8, color: '#fff' },
        z: 3,
      },
    ],
    tooltip: { trigger: 'axis' },
  }

  // ---- panel 2 & 3: normalized labs
  const from = fromDate ?? '1900-01-01'
  const series = (analytes: string[]) =>
    analytes
      .map((a) => {
        const pts = labs
          .filter((l) => l.datetime >= from)
          .map((l) => {
            const r = l.results.find((x) => x.analyte === a)
            const n = r ? normalize(r.value, findRange(refs, a, l.labName)) : undefined
            return n == null ? null : [l.datetime.slice(0, 10), +n.toFixed(2)]
          })
          .filter((p): p is (string | number)[] => !!p)
        return pts.length ? ({ name: a, type: 'line', data: pts, showSymbol: true, symbolSize: 5, lineStyle: { width: 1.6, color: COLORS[a] }, itemStyle: { color: COLORS[a] }, connectNulls: true } as echarts.SeriesOption) : null
      })
      .filter((s): s is echarts.SeriesOption => !!s)
  const doseLines = meds.flatMap((m) => m.doses.filter((d) => d.date >= from).map((d) => ({ xAxis: d.date, label: { formatter: `${CODES[m.generic] ?? m.generic.slice(0, 3).toUpperCase()}${d.mgPerDose ? ' ' + d.mgPerDose + 'mg' : ''}`, fontSize: 8, position: 'insideEndTop' as const } })))
  const timeOpt = (s: echarts.SeriesOption[], withDose: boolean): echarts.EChartsOption => ({
    animation: false,
    grid: { left: 28, right: 8, top: 10, bottom: 22 },
    xAxis: { type: 'time', min: fromDate ? fromDate : undefined, max: now, axisLabel: { fontSize: 10, hideOverlap: true } },
    yAxis: { type: 'value', axisLabel: { fontSize: 9 }, splitLine: { show: false } },
    series: [
      ...s,
      {
        type: 'line',
        data: [],
        markArea: { silent: true, itemStyle: { color: '#EDEBF2' }, data: [[{ yAxis: 0 }, { yAxis: 1 }]] },
        markLine: withDose ? { silent: true, symbol: 'none', lineStyle: { color: '#221A33', type: 'dashed', width: 1 }, data: doseLines } : undefined,
      },
    ],
    tooltip: { trigger: 'axis' },
  })
  const r1 = useChart(opt1)
  const r2 = useChart(timeOpt(series(DRUG_ANALYTES), true))
  const r3 = useChart(timeOpt(series(MONITOR_ANALYTES), false))
  const h = compact ? { height: 150 } : undefined

  return (
    <>
      <div className="card">
        <h4>{daily ? t('chart.seizures') + ' / ' + t('chart.unusual') : t('chart.seizures') + '・' + t('chart.unusual') + '・' + t('chart.episodes')}</h4>
        <div ref={r1} className="chart" style={h} />
        <div className="legend">
          {split ? (<>{patterns.map((p) => <span key={p}><i style={{ background: PATTERN_COLORS[p] }} />{t('seizure.pattern' + p)}{dog?.seizurePatterns?.[p] ? `（${dog.seizurePatterns[p]}）` : ''}</span>)}<span><i style={{ background: '#C9C0E6' }} />{t('chart.seizures')}（{t('chart.unclassified')}）</span></>) : <span><i style={{ background: '#5B3FA8' }} />{t('chart.seizures')}</span>}
          <span><i style={{ background: '#D9A441' }} />{t('chart.unusual')}</span>
          {!daily && <span><i style={{ background: '#8E77D6', borderRadius: '50%' }} />{t('chart.episodes')}</span>}
        </div>
        {!daily && <div className="note">{t('chart.monthlySource')}</div>}
      </div>
      <div className="card">
        <h4>{t('chart.bloodLevels')}</h4>
        <div ref={r2} className="chart" style={h} />
        <div className="legend">
          {DRUG_ANALYTES.map((a) => <span key={a}><i style={{ background: COLORS[a] }} />{a}</span>)}
          <span><i style={{ background: '#EDEBF2' }} />{t('chart.band')}</span>
          <span>┆ {t('chart.doseLine')}</span>
        </div>
      </div>
      <div className="card">
        <h4>{t('chart.monitoring')}</h4>
        <div ref={r3} className="chart" style={h} />
        <div className="legend">{MONITOR_ANALYTES.map((a) => <span key={a}><i style={{ background: COLORS[a] }} />{a}</span>)}</div>
      </div>
    </>
  )
}
