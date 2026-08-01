import React, { useLayoutEffect } from 'react';
import HowToPage from './components/how_to_page.tsx';
import Dashboard, { formatPrice, calculateDateBounds, getWeekStart, getPrecisionForSymbol } from './components/dashboard.tsx';

export { formatPrice, calculateDateBounds, getWeekStart, getPrecisionForSymbol };

export default function App() {
  if (typeof window !== 'undefined' && (window.location.pathname === '/auth' || window.location.pathname === '/')) {
    window.history.replaceState({}, '', '/dashboard');
  }

  return <Dashboard />;
}

