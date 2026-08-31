import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../api';

export interface AccountItem {
  id: string;
  name: string;
  account_id: string;
  broker_type: string;
  broker?: string;
  server?: string;
  status?: string;
  balance?: number;
  equity?: number;
  password?: string;
  terminal_path?: string;
  plugin_path?: string;
}

interface AccountsContextType {
  accounts: AccountItem[];
  activeAccount: AccountItem | null;
  activeAccountId: string | null;
  loadingAccounts: boolean;
  refreshAccounts: () => Promise<void>;
  switchAccount: (accountId: string) => Promise<boolean>;
}

const AccountsContext = createContext<AccountsContextType | undefined>(undefined);

export const AccountsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [activeAccount, setActiveAccount] = useState<AccountItem | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(() => {
    return localStorage.getItem('broker_account') || localStorage.getItem('wyckoff_active_account_id') || null;
  });
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);

  const syncActiveAccountState = useCallback((acc: AccountItem | null) => {
    setActiveAccount(acc);
    if (acc && acc.account_id) {
      setActiveAccountId(acc.account_id);
      localStorage.setItem('broker_account', acc.account_id);
      localStorage.setItem('wyckoff_active_account_id', acc.account_id);
      localStorage.setItem('wyckoff_active_account', JSON.stringify(acc));
    } else {
      setActiveAccountId(null);
      localStorage.removeItem('broker_account');
      localStorage.removeItem('wyckoff_active_account_id');
      localStorage.removeItem('wyckoff_active_account');
    }
  }, []);

  const fetchActiveAccount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts/active`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          syncActiveAccountState(data.data);
          return data.data;
        }
      }
    } catch (e) {
      console.error('[AccountsStore] Failed to fetch active account:', e);
    }
    return null;
  }, [syncActiveAccountState]);

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
      await fetchActiveAccount();
    } catch (e) {
      console.error('[AccountsStore] Failed to fetch accounts:', e);
    } finally {
      setLoadingAccounts(false);
    }
  }, [fetchActiveAccount]);

  const switchAccount = useCallback(async (accountId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId })
      });
      const data = await res.json();
      if (data.status === 'success') {
        const active = await fetchActiveAccount();
        if (!active) {
          const fallbackAcc = accounts.find(a => String(a.account_id) === String(accountId)) || null;
          syncActiveAccountState(fallbackAcc);
        }
        window.dispatchEvent(new CustomEvent('api_target_changed'));
        return true;
      }
    } catch (e) {
      console.error('[AccountsStore] Failed to switch account:', e);
    }
    return false;
  }, [accounts, fetchActiveAccount, syncActiveAccountState]);

  useEffect(() => {
    refreshAccounts();
    const handleTargetChange = () => refreshAccounts();
    window.addEventListener('api_target_changed', handleTargetChange);
    return () => window.removeEventListener('api_target_changed', handleTargetChange);
  }, [refreshAccounts]);

  return (
    <AccountsContext.Provider
      value={{
        accounts,
        activeAccount,
        activeAccountId,
        loadingAccounts,
        refreshAccounts,
        switchAccount,
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
