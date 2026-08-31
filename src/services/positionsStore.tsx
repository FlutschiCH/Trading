import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../api';
import type { Position } from '../types/trading';
import { isPollingPaused } from './pollingStore';

interface PositionsContextType {
  positions: Position[];
  loadingPositions: boolean;
  refreshPositions: (overrideBroker?: string, overrideAccId?: string) => Promise<void>;
}

const PositionsContext = createContext<PositionsContextType | undefined>(undefined);

export const PositionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingPositions, setLoadingPositions] = useState<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);

  const getActiveAccountInfo = useCallback(() => {
    const savedId = localStorage.getItem('wyckoff_active_account_id');
    let accId: string | null = (savedId && !['none', 'null', 'undefined'].includes(savedId.trim().toLowerCase())) ? savedId : null;
    let broker: string | undefined = undefined;

    try {
      const saved = localStorage.getItem('wyckoff_active_account');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!accId) {
          const candidate = parsed?.account_id || parsed?.id;
          if (candidate && !['none', 'null', 'undefined'].includes(String(candidate).trim().toLowerCase())) {
            accId = String(candidate);
          }
        }
        broker = parsed?.broker_type || parsed?.broker;
      }
    } catch { }
    return { accId, broker };
  }, []);

  const refreshPositions = useCallback(async (overrideBroker?: string, overrideAccId?: string) => {
    if (isPollingPaused() || isFetchingRef.current) return;

    const { accId: activeAccId, broker: activeBroker } = getActiveAccountInfo();
    const accId = overrideAccId || activeAccId;
    if (!accId) return;

    const broker = overrideBroker || activeBroker;

    console.log(`[PositionsStore] Fetching positions -> Account: ${accId} | Broker: ${broker}`);

    isFetchingRef.current = true;
    setLoadingPositions(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/trade/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker, account_id: accId })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.data)) {
          setPositions(data.data);
        }
      }
    } catch (e) {
      console.error('[PositionsStore] Failed to fetch positions:', e);
    } finally {
      isFetchingRef.current = false;
      setLoadingPositions(false);
    }
  }, [getActiveAccountInfo]);

  // Single centralized 5-second polling loop
  useEffect(() => {
    refreshPositions();

    const interval = setInterval(() => {
      refreshPositions();
    }, 5000);

    const handleTargetChange = () => refreshPositions();
    window.addEventListener('api_target_changed', handleTargetChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('api_target_changed', handleTargetChange);
    };
  }, [refreshPositions]);

  return (
    <PositionsContext.Provider
      value={{
        positions,
        loadingPositions,
        refreshPositions,
      }}
    >
      {children}
    </PositionsContext.Provider>
  );
};

export const usePositionsStore = () => {
  const context = useContext(PositionsContext);
  if (!context) {
    throw new Error('usePositionsStore must be used within a PositionsProvider');
  }
  return context;
};
