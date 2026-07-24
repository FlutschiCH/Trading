const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' || 
   window.location.hostname.startsWith('192.168.') ||
   window.location.hostname.startsWith('10.') ||
   window.location.hostname.startsWith('172.'));

const getBaseUrl = () => {
  if (!isLocal) return 'https://trading-production-cb87.up.railway.app';
  return localStorage.getItem('wyckoff_api_target') || `http://${window.location.hostname}:8751`;
};

export const API_BASE_URL = getBaseUrl();

