// Service for managing allowed fetch categories for debugging purposes
export type FetchCategory = 'account_info' | 'positions' | 'history' | 'candles' | 'accounts_list' | 'live_strategies' | 'news';

export interface FetchConfig {
  account_info: boolean;
  positions: boolean;
  history: boolean;
  candles: boolean;
  accounts_list: boolean;
  live_strategies: boolean;
  news: boolean;
}

const DEFAULT_FETCH_CONFIG: FetchConfig = {
  account_info: true,
  positions: true,
  history: true,
  candles: true,
  accounts_list: true,
  live_strategies: true,
  news: true,
};

const STORAGE_KEY = 'wyckoff_fetch_config';

export const getFetchConfig = (): FetchConfig => {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_FETCH_CONFIG, ...JSON.parse(stored) };
      }
    }
  } catch {}
  return { ...DEFAULT_FETCH_CONFIG };
};

export const isFetchAllowed = (category: FetchCategory): boolean => {
  const config = getFetchConfig();
  return config[category] ?? true;
};

export const setFetchAllowed = (category: FetchCategory, allowed: boolean) => {
  try {
    const current = getFetchConfig();
    const updated = { ...current, [category]: allowed };
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('fetch_config_changed', { detail: updated }));
    }
  } catch {}
};

export const setAllFetchAllowed = (allowed: boolean) => {
  try {
    const updated: FetchConfig = {
      account_info: allowed,
      positions: allowed,
      history: allowed,
      candles: allowed,
      accounts_list: allowed,
      live_strategies: allowed,
      news: allowed,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('fetch_config_changed', { detail: updated }));
    }
  } catch {}
};
