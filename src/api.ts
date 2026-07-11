const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' || 
   window.location.hostname.startsWith('192.168.'));

export const API_BASE_URL = isLocal 
  ? 'http://localhost:8751' 
  : 'https://trading-production-cb87.up.railway.app';
