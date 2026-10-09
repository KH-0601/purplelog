import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './i18n'
import './styles.css'
import App from './App'
import { seedIfEmpty } from './seed'
import { initCloud } from './lib/cloud'

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
