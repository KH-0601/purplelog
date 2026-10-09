import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { COMMUNITY_STAGES, communityStage } from '../lib/stats'
import { addDays, today } from '../lib/format'

export default function DevCommunity() {
  const { t } = useTranslation()
  const dogs = useLiveQuery(() => db.dogs.toArray(), []) ?? []
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const since = addDays(today(), -30)
  const weekAgo = addDays(today(), -7)
  const active = dogs.filter((d) => events.some((e) => e.dogId === d.id && e.start >= since))
  const weekDogs = new Set(events.filter((e) => e.kind === 'seizure' && e.start >= weekAgo).map((e) => e.dogId)).size
  const rate = active.length ? Math.round((weekDogs / active.length) * 1000) : null
  const region = dogs[0]?.gridLat != null ? `${dogs[0].gridLat}, ${dogs[0].gridLon}` : '—'
  const stage = communityStage(active.length)
  return (
    <>
      <div className="devbar">{t('dev.banner')}</div>
      <div className="period">
        <button className="on">{t('dev.community')}</button>
        <Link to="/dev/dog" style={{ flex: 1 }}><button style={{ width: '100%' }}>{t('dev.dog')}</button></Link>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>{t('settings.region')}</th><th>{t('dev.activeDogs')}</th><th>{t('dev.rate')}</th><th>{t('dev.stage')}</th></tr></thead>
          <tbody>
            <tr><td>{region}</td><td className="n">{active.length}</td><td className="n">{stage === 'collecting' ? '—' : rate}</td><td><span className="tag g">{t('dev.stages.' + stage)}</span></td></tr>
          </tbody>
        </table>
        <div className="note">{t('dev.rateNote')}</div>
        <div className="note">{t('dev.localOnly')}</div>
      </div>
      <div className="card">
        <h4>{t('dev.stage')}</h4>
        <table className="tbl">
          <tbody>
            {COMMUNITY_STAGES.map((s) => (
              <tr key={s.key}><td>≥ {s.min}</td><td>{t('dev.stages.' + s.key)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
