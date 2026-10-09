import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

/** Email + password sign-in for the Supabase-backed (PWA) build. */
export default function Login({ onDone, message }: { onDone: () => void; message?: string }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setErr(null)
    setInfo(null)
    try {
      if (mode === 'up') {
        const { data, error } = await supabase().auth.signUp({ email, password: pw })
        if (error) throw error
        if (!data.session) {
          setInfo(t('login.checkEmail'))
          return
        }
      } else {
        const { error } = await supabase().auth.signInWithPassword({ email, password: pw })
        if (error) throw error
      }
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function reset() {
    if (!email) return
    setErr(null)
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })
    setInfo(error ? error.message : t('login.resetSent'))
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h3 style={{ margin: '0 0 6px' }}>{t('login.title')}</h3>
      <div className="note" style={{ marginBottom: 10 }}>{t('login.intro')}</div>
      {message && <div className="alert" style={{ marginBottom: 8 }}>{message}</div>}
      <div className="field"><span className="k">{t('login.email')}</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><span className="k">{t('login.password')}</span><input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn" style={{ flex: 1 }} disabled={busy || !email || pw.length < 6} onClick={go}>
          {mode === 'up' ? t('login.signUp') : t('login.signIn')}
        </button>
        <button className="btn sec" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>{mode === 'up' ? t('login.haveAccount') : t('login.newAccount')}</button>
      </div>
      {mode === 'in' && <button className="btn sec sm" style={{ marginTop: 8 }} onClick={reset}>{t('login.forgot')}</button>}
      {err && <div className="note" style={{ color: 'var(--warn)', marginTop: 8 }}>{err}</div>}
      {info && <div className="note" style={{ marginTop: 8 }}>{info}</div>}
    </div>
  )
}
