import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../api';

export interface ComputerItem {
  id?: string;
  name: string;
  hostname?: string;
  url?: string;
  ip?: string;
  status?: string;
  last_seen?: string;
}

export interface TargetOption {
  label: string;
  url: string;
  ip?: string;
  name?: string;
}

export const HARDCODED_HOSTS: TargetOption[] = [
  { label: 'Local Host (Debug)', name: 'Local Host', url: 'http://localhost:8020', ip: '127.0.0.1' },
  { label: 'Laptop (Live Proxy)', name: 'marc-laptop', url: 'https://flugrok-production.up.railway.app', ip: '89.217.138.51' },
];

interface ComputersContextType {
  computers: string[];
  rawComputers: ComputerItem[];
  loadingComputers: boolean;
  refreshComputers: () => Promise<void>;
}

const ComputersContext = createContext<ComputersContextType | undefined>(undefined);

export const ComputersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [computers, setComputers] = useState<string[]>(['All', ...HARDCODED_HOSTS.map(h => h.name!)]);
  const [rawComputers, setRawComputers] = useState<ComputerItem[]>([]);
  const [loadingComputers, setLoadingComputers] = useState<boolean>(true);

  const refreshComputers = useCallback(async () => {
    setLoadingComputers(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/computers`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.computers)) {
          setRawComputers(data.computers);
          const hardcodedNames = HARDCODED_HOSTS.map(h => h.name!);
          const fetchedNames = data.computers.map((c: any) => c.name || c.hostname || c);
          const list = ['All', ...hardcodedNames, ...fetchedNames];
          setComputers(Array.from(new Set(list)));
        }
      }
    } catch (e) {
      console.error('[ComputersStore] Failed to fetch computers:', e);
    } finally {
      setLoadingComputers(false);
    }
  }, []);

  useEffect(() => {
    refreshComputers();
    const handleTargetChange = () => refreshComputers();
    window.addEventListener('api_target_changed', handleTargetChange);
    return () => window.removeEventListener('api_target_changed', handleTargetChange);
  }, [refreshComputers]);

  return (
    <ComputersContext.Provider
      value={{
        computers,
        rawComputers,
        loadingComputers,
        refreshComputers,
      }}
    >
      {children}
    </ComputersContext.Provider>
  );
};

export const useComputersStore = () => {
  const context = useContext(ComputersContext);
  if (!context) {
    throw new Error('useComputersStore must be used within a ComputersProvider');
  }
  return context;
};
