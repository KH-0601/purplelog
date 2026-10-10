import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './i18n'
import './styles.css'
import App from './App'
import { seedIfEmpty } from './seed'
import { initCloud } from './lib/cloud'
import { registerSW } from 'virtual:pwa-register'

// Service worker: check for a new version on every launch, whenever the app comes back to the
// foreground, and every 5 minutes; when one is found it takes over and the page reloads.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => void reg.update().catch(() => undefined)
    setInterval(check, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
  onNeedRefresh() {
    void updateSW(true)
  },
})

seedIfEmpty()
  .catch((e) => console.error('seed failed', e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>,
    )
    // Shared database (claude.ai only). Resolves later; the UI lights up when it does.
    void initCloud()
  })
