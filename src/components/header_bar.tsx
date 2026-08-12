import React, { useState, useEffect } from 'react';
import { Activity, X, Menu, ChevronDown, Sun, Moon, RefreshCw, ShieldAlert, Terminal, Monitor } from 'lucide-react';
import { API_BASE_URL } from '../api';
import { TargetSwitcher } from './target_switcher';
import type { AccountInfo } from '../types/trading';
import { isPollingPaused, setPollingPausedState } from '../services/pollingStore';

const triggerPWAEventNotification = (title: string, body: string, soundType: string = 'alert') => {
  fetch(`${API_BASE_URL}/api/notification/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `${title}: ${body}`, sound_type: soundType })
  }).catch(err => console.error("Failed to trigger local backend sound:", err));

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      payload: { title, body }
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.svg' });
  }
};

interface Account {
  account_id: string;
  name: string;
  broker_type: string;
}

interface HeaderBarProps {
  isMobile: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  connectionMode: 'ws' | 'polling' | 'openapi' | 'fix';
  currentConnected: boolean;
  activeAccount: Account | null;
  accountInfo: AccountInfo | null;
  accounts: Account[];
  handleSwitchAccount: (accId: string) => void;
  setShowAccountModal: (show: boolean) => void;
  handleRestartServer: () => void;
  setView: (view: string) => void;
  styles: any;
  onToggleLandscape?: () => void;
}

export default function HeaderBar({
  isMobile,
  theme,
  toggleTheme,
  connectionMode,
  currentConnected,
  activeAccount,
  accountInfo,
  accounts,
  handleSwitchAccount,
  setShowAccountModal,
  handleRestartServer,
  setView,
  styles,
  onToggleLandscape,
}: HeaderBarProps) {
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [quickEdit, setQuickEdit] = useState<boolean>(false);
  const [pollingPaused, setPollingPaused] = useState<boolean>(() => isPollingPaused());

  useEffect(() => {
    const handlePauseChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.paused !== undefined) {
        setPollingPaused(Boolean(detail.paused));
      }
    };
    window.addEventListener('polling_pause_changed', handlePauseChange);
    return () => window.removeEventListener('polling_pause_changed', handlePauseChange);
  }, []);

  useEffect(() => {
    const laptopUrl = 'https://flugrok-production.up.railway.app';
    fetch(`${laptopUrl}/api/system/quickedit`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') setQuickEdit(!!data.enabled);
      })
      .catch(() => {});
  }, []);

  const toggleQuickEdit = async () => {
    const laptopUrl = 'https://flugrok-production.up.railway.app';
    const nextState = !quickEdit;
    setQuickEdit(nextState);
    try {
      await fetch(`${laptopUrl}/api/system/quickedit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
    } catch (e) {
      console.error("Failed to toggle QuickEdit:", e);
    }
  };







  return (
    <header style={{
      ...styles.header,
      ...(isMobile ? { padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' } : {})
    }}>
      {isMobile ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={24} style={{ color: '#3b82f6' }} />
            <span style={{ ...styles.logoText, fontSize: '16px' }}>WYCKOFF</span>
            <span 
              title={`cTrader ${connectionMode.toUpperCase()}: ${currentConnected ? 'ONLINE' : 'OFFLINE'}`}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: currentConnected ? '#10b981' : '#ef4444',
                boxShadow: `0 0 8px ${currentConnected ? '#10b981' : '#ef4444'}`,
                display: 'inline-block',
              }}
            />
          </div>
          
          {/* Middle Sideways Landscape Overview Button */}
          {onToggleLandscape && (
            <button
              onClick={onToggleLandscape}
              style={{
                backgroundColor: 'rgba(5, 150, 105, 0.2)',
                border: '1px solid #059669',
                color: '#10b981',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)'
              }}
              title="Open Landscape Overview Mode"
            >
              <span>📱 Sideways</span>
            </button>
          )}
          
          <button
            onClick={() => setShowMobileNav(!showMobileNav)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
            }}
          >
            {showMobileNav ? <X size={24} /> : <Menu size={24} />}
          </button>

          {showMobileNav && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#0b0f19',
              borderBottom: '1px solid var(--app-card-border)',
              padding: '16px',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: 'calc(100vh - 60px)',
              overflowY: 'auto',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            }}>
              {/* Account Section */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                border: '1px solid var(--app-card-border)',
                borderRadius: '8px',
                padding: '12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--app-text-muted)', fontWeight: 'bold' }}>Active Account:</span>
                  <button
                    onClick={() => {
                      setShowMobileNav(false);
                      setShowAccountModal(true);
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#3b82f6',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    ⚙️ Manage
                  </button>
                </div>
                {activeAccount ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontWeight: 'bold',
                        color: activeAccount.broker_type === 'ctrader' ? '#f59e0b' : '#3b82f6',
                        textTransform: 'uppercase',
                        fontSize: '9px',
                        backgroundColor: activeAccount.broker_type === 'ctrader' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}>
                        {activeAccount.broker_type === 'ctrader' ? 'cTrader' : 'MT5'}
                      </span>
                      <span style={{ color: 'var(--app-text)', fontWeight: 'bold' }}>{activeAccount.name}</span>
                    </div>
                    {accountInfo && (
                      <div style={{ color: '#10b981', fontWeight: 'bold' }}>
                        Balance: {accountInfo.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountInfo.currency || 'USD'}
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{ color: 'var(--app-text-muted)', fontSize: '12px' }}>No Active Account</span>
                )}
                <select
                  value={activeAccount?.account_id || ''}
                  onChange={(e) => {
                    handleSwitchAccount(e.target.value);
                    setShowMobileNav(false);
                  }}
                  style={{
                    backgroundColor: 'var(--app-panel-header-bg)',
                    border: '1px solid var(--app-card-border)',
                    color: 'var(--app-text)',
                    fontSize: '12px',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    outline: 'none',
                    marginTop: '4px',
                    width: '100%',
                  }}
                >
                  <option value="" disabled>Switch account...</option>
                  {accounts.map((acc) => (
                    <option key={acc.account_id} value={acc.account_id}>
                      {acc.name} ({acc.broker_type === 'ctrader' ? 'cTrader' : 'MT5'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--app-text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quick Actions</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    onClick={() => {
                      toggleTheme();
                      setShowMobileNav(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      backgroundColor: 'var(--app-panel-header-bg)',
                      border: '1px solid var(--app-card-border)',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      padding: '8px',
                      color: 'var(--app-text)',
                      outline: 'none',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  >
                    {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />} Theme
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileNav(false);
                      handleRestartServer();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      padding: '8px',
                      color: '#ef4444',
                      outline: 'none',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  >
                    <RefreshCw size={12} /> Update Backend
                  </button>
                  <button
                    onClick={() => {
                      window.open('https://flugrok-production.up.railway.app/api/live/strategies', '_blank');
                      window.open('http://89.217.138.51:8751/api/live/strategies', '_blank');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      padding: '8px',
                      color: '#3b82f6',
                      outline: 'none',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      gridColumn: 'span 2',
                      textDecoration: 'none',
                    }}
                    title="Open both Railway Proxy and Direct Laptop IP to authorize SSL certificates"
                  >
                    <ShieldAlert size={12} /> Authorize Laptop SSL
                  </button>
                </div>
              </div>

              {/* Resource Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--app-text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resources & Navigation</span>
                <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--app-panel-header-bg)', borderRadius: '8px', overflow: 'hidden' }}>
                  <a href="https://remotedesktop.google.com/access/session/9d5ab717-f397-2ced-883b-240576c1b217" target="_blank" rel="noopener noreferrer" className="menu-item" style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: '#10b981', fontWeight: 'bold', fontSize: '12px' }} onClick={() => setShowMobileNav(false)}>
                    🖥️ Google Remote Desktop
                  </a>
                  <a href="https://openapi.ctrader.com/apps" target="_blank" rel="noopener noreferrer" className="menu-item" style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }} onClick={() => setShowMobileNav(false)}>
                    cTrader Apps
                  </a>
                  <a href="https://gemini.google.com/app/71d33e33a84aa328" target="_blank" rel="noopener noreferrer" className="menu-item" style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }} onClick={() => setShowMobileNav(false)}>
                    Wyckoff Prompt
                  </a>
                  <a href="https://trader.ftmo.com/accounts-overview" target="_blank" rel="noopener noreferrer" className="menu-item" style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }} onClick={() => setShowMobileNav(false)}>
                    FTMO Overview
                  </a>
                  <a href="https://saphir.metanet.ch:8443/phpMyAdmin/index.php?db=aa_wyckoff_trading" target="_blank" rel="noopener noreferrer" className="menu-item" style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }} onClick={() => setShowMobileNav(false)}>
                    Database (phpMyAdmin)
                  </a>
                  <a href="https://railway.com/project/aa01f500-c3df-4d47-b60a-821237699d0d/service/05376c29-94f0-44f3-acc2-93d5d104019f/settings?environmentId=7a63d6ae-f3e6-452d-b527-6311f6f9b551" target="_blank" rel="noopener noreferrer" className="menu-item" style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }} onClick={() => setShowMobileNav(false)}>
                    Railway Settings
                  </a>
                  <a
                    href="#symbol-mappings"
                    className="menu-item"
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }}
                    onClick={(e) => {
                      e.preventDefault();
                      setView('mappings');
                      setShowMobileNav(false);
                    }}
                  >
                    🔗 Symbol Mappings
                  </a>
                  <a
                    href="#live-trades"
                    className="menu-item"
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }}
                    onClick={(e) => {
                      e.preventDefault();
                      setView('trades');
                      setShowMobileNav(false);
                    }}
                  >
                    📈 Live Trades & History
                  </a>
                  <a
                    href="#computers"
                    className="menu-item"
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }}
                    onClick={(e) => {
                      e.preventDefault();
                      setView('computers');
                      setShowMobileNav(false);
                    }}
                  >
                    💻 Computer Manager
                  </a>
                  <a
                    href="#notifications"
                    className="menu-item"
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }}
                    onClick={(e) => {
                      e.preventDefault();
                      setView('notifications');
                      setShowMobileNav(false);
                    }}
                  >
                    🔔 Notification Settings
                  </a>
                  <a
                    href="#alerts"
                    className="menu-item"
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--app-card-border)', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }}
                    onClick={(e) => {
                      e.preventDefault();
                      setView('alerts');
                      setShowMobileNav(false);
                    }}
                  >
                    🎯 Price Alerts
                  </a>
                  <button
                    onClick={() => {
                      setShowMobileNav(false);
                      triggerPWAEventNotification("Sound Check", "Local audio sound test completed successfully!", "trade_open");
                    }}
                    className="menu-item"
                    style={{
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      width: '100%',
                      cursor: 'pointer',
                      display: 'block',
                      fontFamily: 'inherit',
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--app-card-border)',
                      color: 'var(--app-text)',
                      fontSize: '12px'
                    }}
                  >
                    🔔 Test Local Sound
                  </button>
                  <a href="/how-to" className="menu-item" style={{ padding: '10px 16px', textDecoration: 'none', color: 'var(--app-text)', fontSize: '12px' }} onClick={() => setShowMobileNav(false)}>
                    📖 How It Works
                  </a>
                </div>
              </div>

              {/* Target API & cTrader test buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--app-card-border)', paddingTop: '12px' }}>
                <TargetSwitcher />
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '10px' }}>
          {/* Top Row: Logo, Update, Authorize SSL, Links, Target API */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={styles.logoSection}>
              <Activity size={28} style={{ color: '#3b82f6' }} />
              <span style={styles.logoText}>WYCKOFF</span>
              <span
                title={`cTrader ${connectionMode.toUpperCase()}: ${currentConnected ? 'ONLINE' : 'OFFLINE'}`}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: currentConnected ? '#10b981' : '#ef4444',
                  boxShadow: `0 0 8px ${currentConnected ? '#10b981' : '#ef4444'}`,
                  display: 'inline-block',
                  marginLeft: '4px',
                  flexShrink: 0,
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={toggleTheme}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--app-panel-header-bg)',
                  border: '1px solid var(--app-card-border)',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  padding: '6px',
                  color: 'var(--app-text)',
                  outline: 'none',
                  transition: 'all 0.2s',
                }}
                title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </button>

              <button
                onClick={() => {
                  const nextState = !pollingPaused;
                  setPollingPaused(nextState);
                  setPollingPausedState(nextState);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: pollingPaused ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                  border: `1px solid ${pollingPaused ? '#ef4444' : '#10b981'}`,
                  cursor: 'pointer',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: pollingPaused ? '#ef4444' : '#10b981',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxShadow: pollingPaused ? '0 0 8px rgba(239, 68, 68, 0.4)' : 'none'
                }}
                title={pollingPaused ? "Polling is PAUSED. Click to resume background trade/position/strategy polling." : "Polling is ACTIVE. Click to stop background polling while watching backtest in terminal."}
              >
                {pollingPaused ? '⏸️ Polling Paused' : '🟢 Live Polling'}
              </button>
              <button
                onClick={handleRestartServer}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#ef4444',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  outline: 'none',
                  transition: 'all 0.2s',
                }}
                title="Update code from git and restart laptop backend"
              >
                <RefreshCw size={12} />
                Update & Restart Laptop
              </button>

              <button
                onClick={toggleQuickEdit}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: quickEdit ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${quickEdit ? 'rgba(234, 179, 8, 0.4)' : 'var(--app-card-border)'}`,
                  cursor: 'pointer',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: quickEdit ? '#eab308' : 'var(--app-text-muted)',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  outline: 'none',
                  transition: 'all 0.2s',
                }}
                title="Toggle Windows Console QuickEdit mode on/off in realtime on laptop"
              >
                <Terminal size={12} />
                QuickEdit: {quickEdit ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={() => {
                  window.open('https://flugrok-production.up.railway.app/api/live/strategies', '_blank');
                  window.open('http://89.217.138.51:8751/api/live/strategies', '_blank');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#3b82f6',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  outline: 'none',
                  transition: 'all 0.2s',
                  textDecoration: 'none',
                }}
                title="Open both Railway Proxy and Direct Laptop IP to authorize SSL certificates"
              >
                <ShieldAlert size={12} />
                Authorize Laptop SSL
              </button>

              <a
                href="https://remotedesktop.google.com/access/session/9d5ab717-f397-2ced-883b-240576c1b217"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#10b981',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  outline: 'none',
                  transition: 'all 0.2s',
                  textDecoration: 'none',
                }}
                title="Open Google Remote Desktop session in a new window"
              >
                <Monitor size={12} />
                Remote Desktop
              </a>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: showMenu ? 'rgba(59, 130, 246, 0.15)' : 'var(--app-panel-header-bg)',
                    border: `1px solid ${showMenu ? '#3b82f6' : 'var(--app-card-border)'}`,
                    cursor: 'pointer',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    color: showMenu ? '#38bdf8' : 'var(--app-text)',
                    fontWeight: '600',
                    fontSize: '12px',
                    outline: 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: showMenu ? '0 0 12px rgba(59, 130, 246, 0.2)' : 'none',
                  }}
                >
                  <Menu size={14} style={{ color: '#38bdf8' }} />
                  <span>Links & Tools</span>
                  <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: showMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>
                {showMenu && (
                  <>
                    <div
                      onClick={() => setShowMenu(false)}
                      style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 999,
                        backgroundColor: 'transparent',
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 10px)',
                      right: 0,
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: '1px solid rgba(51, 65, 85, 0.8)',
                      borderRadius: '12px',
                      boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 25px rgba(56, 189, 248, 0.1)',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      width: '280px',
                      zIndex: 1000,
                      animation: 'fadeIn 0.15s ease-out',
                    }}>
                      {/* Section 1: Dashboard Navigation */}
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px', paddingLeft: '8px' }}>
                          Navigation Views
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setView('trades');
                              setShowMenu(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#f8fafc',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <span style={{ fontSize: '14px' }}>📈</span> Live Trades & History
                          </button>

                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setView('mappings');
                              setShowMenu(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#f8fafc',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <span style={{ fontSize: '14px' }}>🔗</span> Symbol Mappings
                          </button>

                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setView('computers');
                              setShowMenu(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#f8fafc',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <span style={{ fontSize: '14px' }}>💻</span> Computer Manager
                          </button>

                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setView('notifications');
                              setShowMenu(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#f8fafc',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <span style={{ fontSize: '14px' }}>🔔</span> Notification Settings
                          </button>
                        </div>
                      </div>

                      <div style={{ height: '1px', backgroundColor: 'rgba(51, 65, 85, 0.6)' }} />

                      {/* Section 2: External Tools & Management */}
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px', paddingLeft: '8px' }}>
                          External Consoles & Cloud
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <a
                            href="https://remotedesktop.google.com/access/session/9d5ab717-f397-2ced-883b-240576c1b217"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              color: '#10b981',
                              fontSize: '12px',
                              fontWeight: '600',
                              textDecoration: 'none',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => setShowMenu(false)}
                          >
                            <span style={{ fontSize: '14px' }}>🖥️</span> Remote Desktop
                          </a>

                          <a
                            href="https://openapi.ctrader.com/apps"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              color: '#cbd5e1',
                              fontSize: '12px',
                              textDecoration: 'none',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => setShowMenu(false)}
                          >
                            <span style={{ fontSize: '14px' }}>⚡</span> cTrader API Portal
                          </a>

                          <a
                            href="https://trader.ftmo.com/accounts-overview"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              color: '#cbd5e1',
                              fontSize: '12px',
                              textDecoration: 'none',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => setShowMenu(false)}
                          >
                            <span style={{ fontSize: '14px' }}>📊</span> FTMO Account Overview
                          </a>

                          <a
                            href="https://saphir.metanet.ch:8443/phpMyAdmin/index.php?db=aa_wyckoff_trading"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              color: '#cbd5e1',
                              fontSize: '12px',
                              textDecoration: 'none',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => setShowMenu(false)}
                          >
                            <span style={{ fontSize: '14px' }}>🗄️</span> phpMyAdmin DB
                          </a>

                          <a
                            href="https://railway.com/project/aa01f500-c3df-4d47-b60a-821237699d0d/service/05376c29-94f0-44f3-acc2-93d5d104019f/settings?environmentId=7a63d6ae-f3e6-452d-b527-6311f6f9b551"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              color: '#cbd5e1',
                              fontSize: '12px',
                              textDecoration: 'none',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => setShowMenu(false)}
                          >
                            <span style={{ fontSize: '14px' }}>🚂</span> Railway Cloud Dashboard
                          </a>
                        </div>
                      </div>

                      <div style={{ height: '1px', backgroundColor: 'rgba(51, 65, 85, 0.6)' }} />

                      {/* Section 3: Utilities & Guides */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            triggerPWAEventNotification("Sound Check", "Local audio sound test completed successfully!", "trade_open");
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <span style={{ fontSize: '14px' }}>🔊</span> Test Audio Sound
                        </button>

                        <a
                          href="/how-to"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            color: '#38bdf8',
                            fontSize: '12px',
                            fontWeight: '600',
                            textDecoration: 'none',
                            backgroundColor: 'rgba(56, 189, 248, 0.08)',
                            transition: 'background-color 0.15s',
                          }}
                          onClick={() => setShowMenu(false)}
                        >
                          <span style={{ fontSize: '14px' }}>📖</span> Strategy & Sizing Guide
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <TargetSwitcher compact />
            </div>
          </div>

          {/* Second Row: Centered Account Selector Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            width: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid var(--app-card-border)',
            borderRadius: '8px',
            padding: '6px 16px',
          }}>
            {activeAccount ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <span style={{
                  fontWeight: 'bold',
                  color: activeAccount.broker_type === 'ctrader' ? '#f59e0b' : '#3b82f6',
                  textTransform: 'uppercase',
                  fontSize: '10px',
                  backgroundColor: activeAccount.broker_type === 'ctrader' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  {activeAccount.broker_type === 'ctrader' ? 'cTrader' : 'MT5'}
                </span>
                <span style={{ color: 'var(--app-text)', fontWeight: 'bold' }}>{activeAccount.name}</span>
                <span style={{ color: 'var(--app-text-muted)', fontSize: '11px' }}>({activeAccount.account_id})</span>
                {accountInfo ? (
                  <span style={{
                    color: '#10b981',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                    {accountInfo.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountInfo.currency || 'USD'}
                  </span>
                ) : (
                  <span style={{ color: 'var(--app-text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                    (Loading balance...)
                  </span>
                )}
              </div>
            ) : (
              <span style={{ color: 'var(--app-text-muted)', fontSize: '12px' }}>No Active Account</span>
            )}

            <select
              value={activeAccount?.account_id || ''}
              onChange={(e) => handleSwitchAccount(e.target.value)}
              style={{
                backgroundColor: 'var(--app-panel-header-bg)',
                border: '1px solid var(--app-card-border)',
                color: 'var(--app-text)',
                fontSize: '12px',
                padding: '4px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="" disabled>Switch account...</option>
              {accounts.map((acc) => (
                <option key={acc.account_id} value={acc.account_id}>
                  {acc.name} ({acc.broker_type === 'ctrader' ? 'cTrader' : 'MT5'})
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowAccountModal(true)}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              ⚙️ Manage
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
