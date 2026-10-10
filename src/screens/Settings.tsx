import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db, uid, type Dog, type EmergencyPlan } from '../db'
import { updateSettings, useDog, useDogs, useSettings } from '../lib/useData'
import { signOut, useCloud } from '../lib/cloud'
import { toGrid } from '../lib/weather'
import { today } from '../lib/format'
import { SEX_OPTIONS } from './shared'
import { requestNotifyPermission } from '../lib/alerts'
import { pushState, subscribePush, unsubscribePush, type PushState } from '../lib/push'
import { DOG_PALETTE, dogColorMap } from '../lib/dogColor'
import { invokeFunction } from '../lib/supabase'
import DogPhoto from './DogPhoto'

export default function Settings() {
  const { t } = useTranslation()
  const s = useSettings()
  const dog = useDog()
  const dogs = useDogs()
  const cloud = useCloud()
  const [kg, setKg] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [adding, setAdding] = useState(false)
  const [newDog, setNewDog] = useState({ name: '', birthDate: '', sex: 'unknown', breed: '', kg: '' })
  const [draft, setDraft] = useState<Partial<Dog> | null>(null)
  const [planDraft, setPlanDraft] = useState<EmergencyPlan | null>(null)
  const [notifyState, setNotifyState] = useState<NotificationPermission | 'unsupported'>(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const [push, setPush] = useState<PushState | null>(null)
  const [pushErr, setPushErr] = useState<string | null>(null)
  useEffect(() => {
    if (cloud.backend === 'supabase') pushState().then(setPush)
  }, [cloud.backend, cloud.status])

  // Profile fields: edit locally, save 400 ms after the last keystroke.
  useEffect(() => {
    if (!draft || !dog) return
    const id = setTimeout(() => db.dogs.update(dog.id, { ...draft, updatedAt: today() }), 400)
    return () => clearTimeout(id)
  }, [draft, dog])
  useEffect(() => {
    if (!planDraft || !dog) return
    const id = setTimeout(() => db.dogs.update(dog.id, { emergencyPlan: planDraft }), 400)
    return () => clearTimeout(id)
  }, [planDraft, dog])
  useEffect(() => {
    setDraft(null)
    setPlanDraft(null)
  }, [dog?.id])

  const view = { ...(dog ?? ({} as Dog)), ...(draft ?? {}) }
  const plan = planDraft ?? dog?.emergencyPlan ?? { triggerMin: 5, steps: [] }
  const patchDog = (p: Partial<Dog>) => setDraft({ ...(draft ?? {}), ...p })
  const colorOf = dog ? dogColorMap(dogs)[dog.id] : DOG_PALETTE[0]
  const savePlan = (p: Partial<EmergencyPlan>) => setPlanDraft({ ...plan, ...p, updatedAt: today() })

  async function addDog() {
    if (!newDog.name.trim()) return
    const id = uid()
    await db.dogs.add({
      id,
      name: newDog.name.trim(),
      species: 'dog',
      birthDate: newDog.birthDate || undefined,
      sex: newDog.sex,
      breed: newDog.breed || undefined,
      recordVideo: true,
      weights: newDog.kg ? [{ date: today(), kg: Number(newDog.kg) }] : [],
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      emergencyPlan: { triggerMin: 5, steps: [] },
      updatedAt: today(),
    })
    await updateSettings({ currentDogId: id })
    setAdding(false)
    setNewDog({ name: '', birthDate: '', sex: 'unknown', breed: '', kg: '' })
  }
  async function removeDog(d: Dog) {
    if (!confirm(t('settings.deleteDogConfirm', { name: d.name }))) return
    await db.transaction('rw', [db.dogs, db.events, db.medications, db.labs, db.doseLogs, db.monthly], async () => {
      await db.events.where('dogId').equals(d.id).delete()
      await db.medications.where('dogId').equals(d.id).delete()
      await db.labs.where('dogId').equals(d.id).delete()
      await db.doseLogs.where('dogId').equals(d.id).delete()
      await db.monthly.where('dogId').equals(d.id).delete()
      await db.dogs.delete(d.id)
    })
    const rest = dogs.filter((x) => x.id !== d.id)
    await updateSettings({ currentDogId: rest[0]?.id })
  }
  function useGps() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setGrid(p.coords.latitude, p.coords.longitude),
      (err) => alert(err.message),
    )
  }
  async function setGrid(la: number, lo: number) {
    if (!dog) return
    const g = toGrid(la, lo)
    await db.dogs.update(dog.id, { gridLat: g.lat, gridLon: g.lon })
  }
  async function exportJson() {
    const data = {
      dogs: await db.dogs.toArray(),
      events: (await db.events.toArray()).map(({ videoBlob: _v, ...e }) => e),
      monthly: await db.monthly.toArray(),
      medications: await db.medications.toArray(),
      doseLogs: await db.doseLogs.toArray(),
      labs: await db.labs.toArray(),
      refRanges: await db.refRanges.toArray(),
      weatherDaily: await db.weatherDaily.toArray(),
    }
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `purplelog_${today()}.json`
    a.click()
  }
  async function deleteAll() {
    if (!confirm(t('settings.deleteConfirm'))) return
    await db.delete()
    location.reload()
  }

  const statusLabel = t('cloud.status.' + cloud.status)

  return (
    <>
      <div className="card">
        <h4>{t('cloud.title')}</h4>
        <div className="row">
          <span className="grow">{statusLabel}</span>
          <span className={'tag ' + (cloud.status === 'ready' ? 'm' : cloud.status === 'readonly' || cloud.status === 'error' ? 'w' : 'g')}>{cloud.status === 'ready' ? '●' : cloud.status === 'syncing' ? '…' : '○'}</span>
        </div>
        {cloud.pending > 0 && <div className="note">{t('cloud.pending', { n: cloud.pending })}</div>}
        {cloud.lastError && <div className="note">{cloud.lastError}</div>}
        {cloud.backend === 'supabase' && cloud.userEmail && (
          <div className="row"><span className="grow note">{t('login.signedInAs')}: {cloud.userEmail}</span><button className="btn sec sm" onClick={() => void signOut()}>{t('login.signOut')}</button></div>
        )}
        <div className="note">{cloud.status === 'local' ? t('cloud.localNote') : t('cloud.sharedNote')}</div>
      </div>

      <div className="card">
        <h4>{t('settings.dogs')}</h4>
        {dogs.map((d) => (
          <div className="row" key={d.id}>
            <span className="grow" onClick={() => updateSettings({ currentDogId: d.id })} style={{ cursor: 'pointer' }}>
              {d.name}
              {d.weights.length ? `（${[...d.weights].sort((a, b) => a.date.localeCompare(b.date)).pop()!.kg} kg）` : ''}
            </span>
            {d.id === dog?.id ? <span className="tag">✓</span> : <button className="btn sec sm" onClick={() => updateSettings({ currentDogId: d.id })}>{t('settings.select')}</button>}
          </div>
        ))}
        {adding ? (
          <div className="wx" style={{ fontFamily: 'inherit', marginTop: 6 }}>
            <div className="field"><span className="k">{t('settings.name')}</span><input value={newDog.name} onChange={(e) => setNewDog({ ...newDog, name: e.target.value })} /></div>
            <div className="field"><span className="k">{t('settings.birthDate')}</span><input type="date" value={newDog.birthDate} onChange={(e) => setNewDog({ ...newDog, birthDate: e.target.value })} /></div>
            <div className="field"><span className="k">{t('settings.sex')}</span>
              <select value={newDog.sex} onChange={(e) => setNewDog({ ...newDog, sex: e.target.value })}>{SEX_OPTIONS.map((x) => <option key={x} value={x}>{t('settings.sexes.' + x)}</option>)}</select></div>
            <div className="field"><span className="k">{t('settings.breed')}</span><input value={newDog.breed} onChange={(e) => setNewDog({ ...newDog, breed: e.target.value })} /></div>
            <div className="field"><span className="k">{t('settings.weightKg')}</span><input type="number" step="0.1" value={newDog.kg} onChange={(e) => setNewDog({ ...newDog, kg: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 6 }}><button className="btn sm" onClick={addDog}>{t('btn.save')}</button><button className="btn sec sm" onClick={() => setAdding(false)}>{t('btn.cancel')}</button></div>
          </div>
        ) : (
          <button className="btn sec sm" onClick={() => setAdding(true)}>＋ {t('settings.addDog')}</button>
        )}
      </div>

      {dog && (
        <div className="card">
          <h4>{t('settings.profile')}: {dog.name}</h4>
          <div className="field"><span className="k">{t('settings.name')}</span><input value={view.name ?? ''} onChange={(e) => patchDog({ name: e.target.value })} /></div>
          <div className="field"><span className="k">{t('settings.birthDate')}</span><input type="date" value={view.birthDate ?? ''} onChange={(e) => patchDog({ birthDate: e.target.value || undefined })} /></div>
          <div className="field"><span className="k">{t('settings.sex')}</span>
            <select value={view.sex ?? 'unknown'} onChange={(e) => patchDog({ sex: e.target.value })}>{SEX_OPTIONS.map((x) => <option key={x} value={x}>{t('settings.sexes.' + x)}</option>)}</select></div>
          <div className="field"><span className="k">{t('settings.breed')}</span><input value={view.breed ?? ''} onChange={(e) => patchDog({ breed: e.target.value })} /></div>
          <div className="field"><span className="k">{t('settings.photo')}</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <DogPhoto dog={dog} color={colorOf} size={64} />
              {dog.photo && <button className="btn sec sm" onClick={() => db.dogs.update(dog.id, { photo: undefined })}>{t('settings.photoRemove')}</button>}
            </div>
          </div>
          <div className="field"><span className="k">{t('settings.color')}</span>
            <div className="swatches">
              {DOG_PALETTE.map((c) => <button key={c} className={'swatch' + (colorOf === c ? ' on' : '')} style={{ background: c }} aria-label={c} onClick={() => db.dogs.update(dog.id, { color: c })} />)}
              <label className="swatch custom" style={{ background: colorOf }} title={t('settings.colorCustom')}>
                <input type="color" value={colorOf} onChange={(e) => db.dogs.update(dog.id, { color: e.target.value })} />
              </label>
            </div>
          </div>
          <div className="field"><span className="k">{t('settings.diagnosis')}</span><input value={view.diagnosis ?? ''} placeholder={t('report.dx.idiopathic_epilepsy')} onChange={(e) => patchDog({ diagnosis: e.target.value })} /></div>
          <div className="field"><span className="k">{t('settings.diagnosisDate')}</span><input type="date" value={view.diagnosisDate ?? ''} onChange={(e) => patchDog({ diagnosisDate: e.target.value || undefined })} /></div>
          <div className="field"><span className="k">{t('settings.weightKg')}</span><input type="number" step="0.1" value={kg} placeholder={String([...dog.weights].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg ?? '')} onChange={(e) => setKg(e.target.value)} />
            <button className="btn sec sm" onClick={() => kg && db.dogs.update(dog.id, { weights: [...dog.weights, { date: today(), kg: Number(kg) }] }).then(() => setKg(''))}>{t('settings.addWeight')}</button></div>
          {dog.weights.length > 0 && <div className="note">{t('settings.weightHistory')}: {[...dog.weights].sort((a, b) => a.date.localeCompare(b.date)).map((w) => `${w.date.slice(5)} ${w.kg}kg`).join(' → ')}</div>}
          {dogs.length > 1 && <button className="btn danger sm" style={{ marginTop: 8 }} onClick={() => removeDog(dog)}>{t('settings.deleteDog')}</button>}
        </div>
      )}

      <div className="card">
        <h4>{t('settings.display')}</h4>
        <div className="field"><span className="k">{t('settings.language')}</span>
          <select value={s.lang} onChange={(e) => updateSettings({ lang: e.target.value as 'ja' | 'en' })}><option value="ja">日本語</option><option value="en">English</option></select></div>
      </div>
      {dog && (
        <>
          <div className="card">
            <h4>{t('settings.region')}</h4>
            <div className="field"><span className="k">{t('settings.grid')}</span><span>{dog.gridLat != null ? `${dog.gridLat}, ${dog.gridLon}` : t('settings.notSet')}</span></div>
            <div className="field"><input placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} /><input placeholder="lon" value={lon} onChange={(e) => setLon(e.target.value)} />
              <button className="btn sec sm" onClick={() => lat && lon && setGrid(Number(lat), Number(lon))}>{t('btn.save')}</button></div>
            <button className="btn sec sm" onClick={useGps}>{t('settings.useGps')}</button>
            <div className="note">{t('settings.gridNote')}</div>
          </div>
          <div className="card">
            <h4>{t('settings.recording')}</h4>
            <div className="row"><span className="grow">{t('settings.recordVideo')}</span><button className={'toggle ' + (dog.recordVideo ? 'on' : '')} onClick={() => db.dogs.update(dog.id, { recordVideo: !dog.recordVideo })} /></div>
            <div className="note">{t('settings.recordNote')}</div>
          </div>
          <div className="card">
            <h4>{t('eplan.title')}</h4>
            <div className="note" style={{ marginBottom: 6 }}>{t('eplan.intro')}</div>
            <div className="field"><span className="k">{t('eplan.triggerMin')}</span><input type="number" min={1} value={plan.triggerMin} onChange={(e) => savePlan({ triggerMin: Number(e.target.value) || 5 })} /></div>
            {plan.steps.map((st, i) => (
              <div className="field" key={i}>
                <span className="k">{t('eplan.stepN', { n: i + 1 })}</span>
                <textarea value={st} placeholder={t('eplan.placeholder')} onChange={(e) => savePlan({ steps: plan.steps.map((x, j) => (j === i ? e.target.value : x)) })} style={{ minHeight: 44 }} />
                <button className="btn sec sm" onClick={() => savePlan({ steps: plan.steps.filter((_, j) => j !== i) })}>{t('eplan.remove')}</button>
              </div>
            ))}
            <button className="btn sec sm" onClick={() => savePlan({ steps: [...plan.steps, ''] })}>＋ {t('eplan.addStep')}</button>
            <div className="field"><span className="k">{t('eplan.vetName')}</span><input value={plan.vetName ?? ''} onChange={(e) => savePlan({ vetName: e.target.value })} /></div>
            <div className="field"><span className="k">{t('eplan.vetPhone')}</span><input type="tel" value={plan.vetPhone ?? ''} onChange={(e) => savePlan({ vetPhone: e.target.value })} /></div>
            <div className="field"><span className="k">{t('eplan.hospitalNote')}</span><input value={plan.hospitalNote ?? ''} onChange={(e) => savePlan({ hospitalNote: e.target.value })} /></div>
            <div className="note">{t('eplan.disclaimer')}</div>
          </div>
        </>
      )}
      <div className="card">
        <h4>{t('alert.settings')}</h4>
        <div className="row"><span className="grow">{t('alert.enabled')}</span><button className={'toggle ' + (s.alertsEnabled !== false ? 'on' : '')} onClick={() => updateSettings({ alertsEnabled: s.alertsEnabled === false })} /></div>
        <div className="field"><span className="k">{t('alert.interval')}</span><input type="number" min={5} step={5} value={s.alertIntervalMin ?? 30} onChange={(e) => updateSettings({ alertIntervalMin: Math.max(5, Number(e.target.value) || 30) })} /></div>
        <div className="row"><span className="grow">{t('alert.sound')}</span><button className={'toggle ' + (s.alertSound !== false ? 'on' : '')} onClick={() => updateSettings({ alertSound: s.alertSound === false })} /></div>
        <div className="row"><span className="grow">{notifyState === 'granted' ? t('alert.notifyGranted') : notifyState === 'denied' ? t('alert.notifyDenied') : notifyState === 'unsupported' ? t('alert.notifyUnsupported') : t('alert.notify')}</span>
          {notifyState === 'default' && <button className="btn sec sm" onClick={async () => setNotifyState(await requestNotifyPermission())}>{t('alert.notify')}</button>}</div>
        <div className="note">{t('alert.scope')}</div>
        {cloud.backend === 'supabase' && push && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--rule)' }}>
            <h4>{t('alert.push')}</h4>
            <div className="note" style={{ marginBottom: 6 }}>{t('alert.pushState.' + push)}</div>
            {pushErr && <div className="note" style={{ color: 'var(--warn)', marginBottom: 6 }}>{pushErr}</div>}
            {push === 'not_subscribed' && cloud.userId && <button className="btn sm" onClick={async () => { setPushErr(null); try { setPush(await subscribePush(cloud.userId!)) } catch (e) { setPushErr(t('alert.pushError') + ' ' + String((e as Error)?.message ?? e)) } }}>{t('alert.pushOn')}</button>}
            {push === 'subscribed' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={async () => {
                  setPushErr(null)
                  const { data, error } = await invokeFunction<{ devices: number; sent: number; errors: string[] }>('dose-reminders', { test: true })
                  if (error) setPushErr(t('alert.pushError') + ' ' + error.message)
                  else if (!data || data.devices === 0) setPushErr(t('alert.pushTestNone'))
                  else setPushErr(t('alert.pushTestSent', { sent: data.sent, devices: data.devices }) + (data.errors.length ? ' [' + data.errors.join(', ') + ']' : ''))
                }}>{t('alert.pushTest')}</button>
                <button className="btn sec sm" onClick={async () => { await unsubscribePush(); setPush(await pushState()) }}>{t('alert.pushOff')}</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="card">
        <h4>{t('settings.consent')}</h4>
        <div className="row"><span className="grow">{t('settings.consentAgg')}</span><button className={'toggle ' + (s.consentAggregate ? 'on' : '')} onClick={() => updateSettings({ consentAggregate: !s.consentAggregate })} /></div>
        <div className="row"><span className="grow">{t('settings.consentRes')}</span><button className={'toggle ' + (s.consentResearch ? 'on' : '')} onClick={() => updateSettings({ consentResearch: !s.consentResearch })} /></div>
      </div>
      <div className="card">
        <h4>{t('settings.role')}</h4>
        <div className="row"><span className="grow">{t('dev.banner')}</span><button className={'toggle ' + (s.role === 'developer' ? 'on' : '')} onClick={() => updateSettings({ role: s.role === 'developer' ? 'owner' : 'developer' })} /></div>
        <div className="note">{t('settings.roleNote')}</div>
      </div>
      <div className="card">
        <h4>{t('settings.data')}</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn sec" onClick={exportJson}>{t('settings.export')}</button>
          <button className="btn danger" onClick={deleteAll}>{t('settings.deleteAll')}</button>
        </div>
      </div>
      <div className="note" style={{ textAlign: 'center', padding: '6px 0 12px' }}>{t('settings.version')} {__BUILD__}</div>
    </>
  )
}
