import React from 'react';
import HowToPage from './components/how_to_page.tsx';
import Dashboard, { formatPrice, calculateDateBounds, getWeekStart, getPrecisionForSymbol } from './components/dashboard.tsx';

export { formatPrice, calculateDateBounds, getWeekStart, getPrecisionForSymbol };

export default function App() {
  if (window.location.pathname === '/how-to') {
    return <HowToPage />;
  }

  if (window.location.pathname === '/auth' || window.location.pathname === '/') {
    window.history.pushState({}, '', '/dashboard');
  }

  return <Dashboard />;
}
