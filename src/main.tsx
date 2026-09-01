import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { CandleProvider } from './services/candleStore'
import { AccountsProvider } from './services/accountsStore'
import { ComputersProvider } from './services/computersStore'
import { PositionsProvider } from './services/positionsStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountsProvider>
      <ComputersProvider>
        <PositionsProvider>
          <CandleProvider>
            <App />
          </CandleProvider>
        </PositionsProvider>
      </ComputersProvider>
    </AccountsProvider>
  </StrictMode>,
)

import { registerWebPushSubscription } from './services/pushService'

// Register PWA service worker and auto-register web push subscription
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Service Worker registered successfully:', reg.scope);
        registerWebPushSubscription();
      })
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}


