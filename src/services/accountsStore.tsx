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

interface AccountsContextType {
  accounts: AccountItem[];
  loadingAccounts: boolean;
  refreshAccounts: () => Promise<void>;
}

const AccountsContext = createContext<AccountsContextType | undefined>(undefined);

export const AccountsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);

  const refreshAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.accounts) ? data.accounts : []);
        if (data.status === 'success') {
          setAccounts(list);
        }
      }
    } catch (e) {
      console.error('[AccountsStore] Failed to fetch accounts:', e);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  return (
    <AccountsContext.Provider
      value={{
        accounts,
        loadingAccounts,
        refreshAccounts,
      }}
    >
      {children}
    </AccountsContext.Provider>
  );
};

export const useAccountsStore = () => {
  const context = useContext(AccountsContext);
  if (!context) {
    throw new Error('useAccountsStore must be used within an AccountsProvider');
  }
  return context;
};
