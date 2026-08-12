import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { CandleProvider } from './services/candleStore'
import { AccountsComputersProvider } from './services/accountsComputersStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountsComputersProvider>
      <CandleProvider>
        <App />
      </CandleProvider>
    </AccountsComputersProvider>
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

