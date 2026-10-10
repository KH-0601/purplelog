import { useEffect } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db, uid } from './db'
import { updateSettings, useDog, useDogs, useSettings } from './lib/useData'
import { dogColorMap } from './lib/dogColor'
import { currentUserId, useCloud } from './lib/cloud'
import { attachWeatherSoon, backfillWeather } from './lib/autoWeather'
import { nowLocalISO } from './lib/format'
import Home from './screens/Home'
import Seizure from './screens/Seizure'
import EventDetail from './screens/EventDetail'
import Timeline from './screens/Timeline'
import MedsLabs from './screens/MedsLabs'
import LongTerm from './screens/LongTerm'
import VetReport from './screens/VetReport'
import Settings from './screens/Settings'
import DevCommunity from './screens/DevCommunity'
import DevDog from './screens/DevDog'
import AddRecord from './screens/AddRecord'
import DoseAlerts from './screens/DoseAlerts'
import Login from './screens/Login'
import { startSupabase } from './lib/cloud'

/** Dog switcher: one large button per dog, always visible under the title. */
function DogBar({ current, onAdd }: { current?: string; onAdd: () => void }) {
  const { t } = useTranslation()
  const dogs = useDogs()
  const colors = dogColorMap(dogs)
  if (dogs.length === 0) return null
  const pick = (id: string) => void updateSettings({ currentDogId: id })
  if (dogs.length > 4) {
    return (
      <div className="dogbar noprint">
        <select className="dogsel" value={current ?? ''} onChange={(e) => pick(e.target.value)} aria-label={t('settings.dogs')}>
          {dogs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
    )
  }
  return (
    <div className="dogbar noprint" role="tablist" aria-label={t('settings.dogs')}>
      {dogs.map((d) => (
        <button key={d.id} role="tab" aria-selected={d.id === current} className={'dogtab' + (d.id === current ? ' on' : '')} style={d.id === current ? { background: colors[d.id], borderColor: colors[d.id] } : { color: colors[d.id], borderColor: colors[d.id] }} onClick={() => pick(d.id)}>
          {d.name}
        </button>
      ))}
      {dogs.length < 4 && <button className="dogadd" onClick={onAdd} aria-label={t('settings.addDog')} title={t('settings.addDog')}>＋</button>}
    </div>
  )
}

export default function App() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const dog = useDog()
  const cloud = useCloud()
  const loc = useLocation()
  const nav = useNavigate()

  useEffect(() => {
    if (settings.lang && i18n.language !== settings.lang) i18n.changeLanguage(settings.lang)
    document.documentElement.lang = settings.lang
  }, [settings.lang, i18n])

  const titles: Record<string, string> = {
    '/': t('nav.home'),
    '/timeline': t('timeline.title'),
    '/chart': t('chart.title'),
    '/meds': t('meds.title'),
    '/report': t('report.title'),
    '/settings': t('settings.title'),
    '/seizure': t('seizure.title'),
    '/add': t('add.title'),
    '/dev/community': t('dev.community'),
    '/dev/dog': t('dev.dog'),
  }
  const title = titles[loc.pathname] ?? (loc.pathname.startsWith('/event') ? t('event.title') : t('app'))
  const onSeizure = loc.pathname === '/seizure'

  async function unusual() {
    if (!dog) return
    const id = uid()
    await db.events.add({ id, dogId: dog.id, kind: 'unusual', start: nowLocalISO(), tz: dog.tz, unusualItems: [], by: currentUserId() ?? undefined })
    attachWeatherSoon(id)
    nav(`/event/${id}`)
  }

  useEffect(() => {
    if (cloud.status === 'ready' || cloud.status === 'local') { const t = setTimeout(() => void backfillWeather(), 3000); return () => clearTimeout(t) }
  }, [cloud.status])

  const cloudDot = cloud.status === 'ready' ? '●' : cloud.status === 'syncing' || cloud.status === 'init' ? '…' : cloud.status === 'readonly' || cloud.status === 'error' ? '!' : '○'
  const cloudCls = cloud.status === 'ready' ? 'm' : cloud.status === 'readonly' || cloud.status === 'error' ? 'w' : 'g'

  return (
    <div className="app">
      <header className="topbar">
        <h1>{title}</h1>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={'tag ' + cloudCls} title={t('cloud.status.' + cloud.status)} onClick={() => nav('/settings')} style={{ cursor: 'pointer' }}>
            {cloudDot} {t('cloud.short.' + cloud.status)}
          </span>
        </div>
      </header>
      <DogBar current={dog?.id} onAdd={() => nav('/settings')} />
      <main className="main">
        {cloud.backend === 'supabase' && cloud.status === 'login' && <Login onDone={() => void startSupabase()} />}
        {cloud.backend === 'supabase' && cloud.status === 'readonly' && cloud.lastError && <div className="alert">{t('login.notAllowed')}</div>}
        {!dog && cloud.status !== 'login' && (
          <div className="card">
            <div className="note">{t('settings.noDog')}</div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => nav('/settings')}>＋ {t('settings.addDog')}</button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/seizure" element={<Seizure />} />
          <Route path="/add" element={<AddRecord />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/meds" element={<MedsLabs />} />
          <Route path="/chart" element={<LongTerm />} />
          <Route path="/report" element={<VetReport />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/dev/community" element={<DevCommunity />} />
          <Route path="/dev/dog" element={<DevDog />} />
        </Routes>
      </main>
      {!onSeizure && dog && (
        <div className="actions noprint">
          <button className="btn" onClick={() => nav('/seizure')}>
            {t('btn.seizureStart')}
          </button>
          <button className="btn warn" onClick={unusual}>
            {t('btn.unusual')}
          </button>
        </div>
      )}
      <DoseAlerts />
      <nav className="tabs noprint">
        <NavLink to="/" end>
          <i>⌂</i>
          {t('nav.home')}
        </NavLink>
        <NavLink to="/timeline">
          <i>≡</i>
          {t('nav.timeline')}
        </NavLink>
        <NavLink to="/chart">
          <i>▤</i>
          {t('nav.chart')}
        </NavLink>
        <NavLink to="/meds">
          <i>⚗</i>
          {t('nav.meds')}
        </NavLink>
        <NavLink to="/report">
          <i>▣</i>
          {t('nav.report')}
        </NavLink>
        <NavLink to="/settings">
          <i>⚙</i>
          {t('nav.settings')}
        </NavLink>
        {settings.role === 'developer' && (
          <NavLink to="/dev/community">
            <i>◈</i>
            {t('nav.dev')}
          </NavLink>
        )}
      </nav>
    </div>
  )
}
