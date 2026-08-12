import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../api';

export interface AccountItem {
  id: string;
  name: string;
  account_id: string;
  broker_type: string;
  broker?: string;
  status?: string;
  balance?: number;
  equity?: number;
}

export interface ComputerItem {
  id?: string;
  name: string;
  hostname?: string;
  status?: string;
  last_seen?: string;
}

interface AccountsComputersContextType {
  accounts: AccountItem[];
  computers: string[];
  rawComputers: ComputerItem[];
  loadingAccounts: boolean;
  loadingComputers: boolean;
  refreshAccounts: () => Promise<void>;
  refreshComputers: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const AccountsComputersContext = createContext<AccountsComputersContextType | undefined>(undefined);

export const AccountsComputersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [computers, setComputers] = useState<string[]>(['All']);
  const [rawComputers, setRawComputers] = useState<ComputerItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
  const [loadingComputers, setLoadingComputers] = useState<boolean>(true);

  const refreshAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.accounts)) {
          setAccounts(data.accounts);
        }
      }
    } catch (e) {
      console.error('[AccountsComputersStore] Failed to fetch accounts:', e);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

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
      console.error('[AccountsComputersStore] Failed to fetch computers:', e);
    } finally {
      setLoadingComputers(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshAccounts(), refreshComputers()]);
  }, [refreshAccounts, refreshComputers]);

  // Load immediately on initial page mount
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <AccountsComputersContext.Provider
      value={{
        accounts,
        computers,
        rawComputers,
        loadingAccounts,
        loadingComputers,
        refreshAccounts,
        refreshComputers,
        refreshAll,
      }}
    >
      {children}
    </AccountsComputersContext.Provider>
  );
};

export const useAccountsComputersStore = () => {
  const context = useContext(AccountsComputersContext);
  if (!context) {
    throw new Error('useAccountsComputersStore must be used within an AccountsComputersProvider');
  }
  return context;
};
