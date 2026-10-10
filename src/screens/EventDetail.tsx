import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Event } from '../db'
import { currentUserId } from '../lib/cloud'
import { attachWeatherSoon } from '../lib/autoWeather'
import { useDog } from '../lib/useData'
import { fetchHourly, snapshotAt, toGrid } from '../lib/weather'
import { attachWeather } from '../lib/autoWeather'
import { addDays, nowLocalISO } from '../lib/format'
import { EventTag, GENERICS, SEIZURE_TYPES, UNUSUAL_ITEMS } from './shared'

export default function EventDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const dog = useDog()
  const isNew = id === 'new'
  const stored = useLiveQuery(() => (id && !isNew ? db.events.get(id) : undefined), [id, isNew])
  const [e, setE] = useState<Event | undefined>()
  // "/event/new?kind=seizure": a fresh draft, written to the database only when saved (one save, no second screen)
  useEffect(() => {
    if (isNew && dog && !e) {
      const kind = (params.get('kind') as Event['kind']) || 'seizure'
      setE({ id: uid(), dogId: dog.id, kind, start: nowLocalISO(), tz: dog.tz, count: kind === 'seizure' ? 1 : undefined, unusualItems: kind === 'unusual' ? [] : undefined, source: 'manual', by: currentUserId() ?? undefined })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, dog?.id])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (stored && !e) setE(stored)
  }, [stored, e])
  // weather attached in the background (auto fetch) → merge into the draft so saving keeps it
  useEffect(() => {
    if (stored?.weather && e && !e.weather) setE({ ...e, weather: stored.weather })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.weather])
  // fetch weather automatically when the record has none yet (no button needed)
  const autoTried = useRef<string | null>(null)
  useEffect(() => {
    if (!e || isNew || e.weather || dog?.gridLat == null || autoTried.current === e.id) return
    autoTried.current = e.id
    setBusy(true)
    attachWeather(e.id)
      .then(async () => {
        const cur = await db.events.get(e.id)
        if (cur?.weather) setE((x) => (x && !x.weather ? { ...x, weather: cur.weather } : x))
      })
      .catch(() => undefined)
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.id, e?.weather, dog?.gridLat])
  const videoUrl = useMemo(() => (e?.videoBlob ? URL.createObjectURL(e.videoBlob) : e?.videoUrl), [e?.videoBlob, e?.videoUrl])
  if (!e || !dog) return null

  const set = (patch: Partial<Event>) => setE({ ...e, ...patch })
  async function save() {
    if (!e) return
    if (isNew) {
      await db.events.add({ ...e, updatedAt: new Date().toISOString() })
      attachWeatherSoon(e.id)
      nav('/timeline', { replace: true })
      return
    }
    await db.events.put({ ...e, updatedAt: new Date().toISOString() })
    nav(-1)
  }
  async function remove() {
    if (!e || !confirm('OK?')) return
    await db.events.delete(e.id)
    nav('/timeline', { replace: true })
  }
  async function fetchWx() {
    if (!e || dog?.gridLat == null || dog?.gridLon == null) return
    setBusy(true)
    try {
      const g = toGrid(dog.gridLat, dog.gridLon)
      const d = e.start.slice(0, 10)
      const h = await fetchHourly(g.lat, g.lon, addDays(d, -3), d)
      const snap = snapshotAt(h, e.timeUnknown ? d + 'T12:00' : e.start, 'open-meteo')
      if (snap) {
        const ne = { ...e, weather: snap }
        setE(ne)
        await db.events.put(ne)
      }
    } catch (err) {
      alert(t('common.error') + ': ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const toggle = (arr: string[] | undefined, v: string) => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v])

  return (
    <>
      <div className="card">
        <div className="field">
          <span className="k">{t('event.kind')}</span>
          <div className="chips">
            {(['seizure', 'unusual', 'other'] as const).map((k) => (
              <button key={k} className={'chip-btn ' + (e.kind === k ? 'on' : '')} onClick={() => set({ kind: k })}>
                {t('event.' + k)}
              </button>
            ))}
          </div>
          <EventTag e={e} />
        </div>
        <div className="field">
          <span className="k">{t('event.start')}</span>
          <input type="datetime-local" value={e.start.slice(0, 16)} onChange={(ev) => set({ start: ev.target.value })} />
        </div>
        <div className="field">
          <span className="k"></span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
            <input type="checkbox" checked={!!e.timeUnknown} onChange={(ev) => set({ timeUnknown: ev.target.checked })} /> {t('event.timeUnknown')}
          </label>
        </div>
        {e.kind === 'seizure' && (
          <>
            <div className="field">
              <span className="k">{t('event.duration')}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                <input type="number" inputMode="numeric" min={0} style={{ width: 70 }} value={e.durationSec == null ? '' : Math.floor(e.durationSec / 60)} placeholder="0" onChange={(ev) => set({ durationSec: ev.target.value === '' && (e.durationSec ?? 0) % 60 === 0 ? undefined : Number(ev.target.value || 0) * 60 + ((e.durationSec ?? 0) % 60) })} />
                <span className="note">{t('common.min')}</span>
                <input type="number" inputMode="numeric" min={0} max={59} style={{ width: 70 }} value={e.durationSec == null ? '' : e.durationSec % 60} placeholder="0" onChange={(ev) => set({ durationSec: ev.target.value === '' && Math.floor((e.durationSec ?? 0) / 60) === 0 ? undefined : Math.floor((e.durationSec ?? 0) / 60) * 60 + Number(ev.target.value || 0) })} />
                <span className="note">{t('common.sec')}</span>
                {e.durationText && !e.durationSec && <span className="note">{e.durationText}</span>}
              </div>
            </div>
            <div className="field">
              <span className="k">{t('event.count')}</span>
              <input type="number" min={1} value={e.count ?? 1} onChange={(ev) => set({ count: Number(ev.target.value) })} />
            </div>
          </>
        )}
      </div>

      {e.kind === 'seizure' && (
        <>
          <div className="card">
            <h4>{t('event.type')}</h4>
            <div className="chips">
              {SEIZURE_TYPES.map((s) => (
                <button key={s} className={'chip-btn ' + (e.seizureType === s ? 'on' : '')} onClick={() => set({ seizureType: s })}>
                  {t('event.types.' + s)}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="field">
              <span className="k">{t('event.consciousness')}</span>
              <select value={e.consciousness ?? ''} onChange={(ev) => set({ consciousness: (ev.target.value || undefined) as Event['consciousness'] })}>
                <option value="">—</option>
                {(['lost', 'kept', 'unknown'] as const).map((c) => (
                  <option key={c} value={c}>
                    {t('event.cons.' + c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="k">{t('event.recovery')}</span>
              <input type="number" min={0} value={e.recoveryMin ?? ''} onChange={(ev) => set({ recoveryMin: ev.target.value === '' ? undefined : Number(ev.target.value) })} />
            </div>
            <div className="field">
              <span className="k">{t('event.rescue')}</span>
              <select value={e.rescueMed?.generic ?? ''} onChange={(ev) => set({ rescueMed: ev.target.value ? { generic: ev.target.value, time: e.rescueMed?.time ?? e.start } : undefined })}>
                <option value="">—</option>
                {GENERICS.map((g) => (
                  <option key={g} value={g}>
                    {t('meds.generics.' + g)}
                  </option>
                ))}
              </select>
              {e.rescueMed && <input type="datetime-local" value={e.rescueMed.time.slice(0, 16)} onChange={(ev) => set({ rescueMed: { ...e.rescueMed!, time: ev.target.value } })} />}
            </div>
            <div className="note"><a href={`#/add?tab=dose`}>＋ {t('add.addDose')}</a></div>
            <div className="field">
              <span className="k">{t('event.aura')}</span>
              <input value={e.aura ?? ''} onChange={(ev) => set({ aura: ev.target.value })} />
            </div>
          </div>
        </>
      )}

      {e.kind === 'unusual' && (
        <div className="card">
          <h4>{t('event.unusual')}</h4>
          <div className="chips">
            {UNUSUAL_ITEMS.map((u) => (
              <button key={u} className={'chip-btn u ' + (e.unusualItems?.includes(u) ? 'on' : '')} onClick={() => set({ unusualItems: toggle(e.unusualItems, u) })}>
                {t('event.items.' + u)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isNew && <div className="card">
        <h4>{t('event.weather')}</h4>
        {e.weather ? (
          <div className="wx">
            {e.weather.pressureMsl ?? '—'} hPa　24h {e.weather.d24 != null ? (e.weather.d24 > 0 ? '+' : '') + e.weather.d24 : '—'} hPa
            <br />
            {e.weather.temp ?? '—'}℃　{e.weather.humidity ?? '—'}%　{e.weather.precip ?? '—'} mm
            <div className="note">6h {e.weather.d6 ?? '—'} / 12h {e.weather.d12 ?? '—'} / 48h {e.weather.d48 ?? '—'} · {e.weather.source}</div>
          </div>
        ) : dog.gridLat != null ? (
          <button className="btn sec sm" onClick={fetchWx} disabled={busy}>
            {busy ? t('event.fetchingWeather') : t('event.fetchWeather')}
          </button>
        ) : (
          <div className="note">{t('event.noGrid')}</div>
        )}
      </div>}

      {e.planActions && e.planActions.length > 0 && (
        <div className="card">
          <h4>{t('eplan.actionsTaken')}</h4>
          {e.planActions.map((a) => (
            <div className="row" key={a.step}><span className="d">{a.time.slice(11, 16)}</span><span className="grow">{t('eplan.stepN', { n: a.step })}: {a.text}</span></div>
          ))}
        </div>
      )}
      {videoUrl && (
        <div className="card">
          <h4>{t('event.video')}</h4>
          <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 10 }} />
        </div>
      )}

      <div className="card">
        <h4>{t('event.note')}</h4>
        <textarea value={e.note ?? ''} onChange={(ev) => set({ note: ev.target.value })} />
        {e.source && <div className="note">{e.source}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={save} style={{ flex: 1 }}>
          {t('btn.save')}
        </button>
        {isNew ? (
          <button className="btn sec" onClick={() => nav(-1)}>{t('btn.cancel')}</button>
        ) : (
          <button className="btn danger" onClick={remove}>
            {t('btn.delete')}
          </button>
        )}
      </div>
    </>
  )
}
