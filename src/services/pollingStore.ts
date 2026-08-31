// Global Polling Control Service
export const isPollingPaused = (): boolean => {
  try {
    if (typeof window !== 'undefined') {
      if ((window as any).IS_POLLING_PAUSED !== undefined) {
        return Boolean((window as any).IS_POLLING_PAUSED);
      }
      return localStorage.getItem('wyckoff_polling_paused') === 'true';
    }
  } catch { }
  return false;
};

export const setPollingPausedState = (paused: boolean) => {
  try {
    if (typeof window !== 'undefined') {
      (window as any).IS_POLLING_PAUSED = paused;
      localStorage.setItem('wyckoff_polling_paused', String(paused));
      window.dispatchEvent(new CustomEvent('polling_pause_changed', { detail: { paused } }));
    }
  } catch { }
};
