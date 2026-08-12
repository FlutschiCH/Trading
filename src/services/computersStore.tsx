import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../api';

export interface ComputerItem {
  id?: string;
  name: string;
  hostname?: string;
  status?: string;
  last_seen?: string;
}

interface ComputersContextType {
  computers: string[];
  rawComputers: ComputerItem[];
  loadingComputers: boolean;
  refreshComputers: () => Promise<void>;
}

const ComputersContext = createContext<ComputersContextType | undefined>(undefined);

export const ComputersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [computers, setComputers] = useState<string[]>(['All']);
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
          const list = ['All', ...data.computers.map((c: any) => c.name || c.hostname || c)];
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
