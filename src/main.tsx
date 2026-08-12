import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { CandleProvider } from './services/candleStore'
import { AccountsProvider } from './services/accountsStore'
import { ComputersProvider } from './services/computersStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountsProvider>
      <ComputersProvider>
        <CandleProvider>
          <App />
        </CandleProvider>
      </ComputersProvider>
    </AccountsProvider>
  </StrictMode>,
)

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

