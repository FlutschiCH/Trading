const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' || 
   window.location.hostname === '89.217.138.51' ||
   window.location.hostname.startsWith('192.168.') ||
   window.location.hostname.startsWith('10.') ||
   window.location.hostname.startsWith('172.'));

const getBaseUrl = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return localStorage.getItem('wyckoff_api_target') || `http://${window.location.hostname}:8751`;
  }
  // Default for deployed environment (e.g. trading.flutschi.ch)
  // NOTE: If trading.flutschi.ch is loaded over HTTPS, calling HTTP (http://89.217.138.51:8751) 
  // directly will trigger Mixed Content security blocks. The user should use a secure tunnel (e.g., Cloudflare Tunnel / ngrok)
  // or a reverse proxy to expose the laptop backend via HTTPS, or use the Railway container.
  return 'http://89.217.138.51:8751';
};

export const API_BASE_URL = getBaseUrl();

