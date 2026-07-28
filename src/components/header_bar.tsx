import React, { useState } from 'react';
import { Activity, X, Menu, ChevronDown, Sun, Moon, RefreshCw, ShieldAlert } from 'lucide-react';
import { API_BASE_URL } from '../api';

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

interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  currency: string;
  account_type?: string;
  broker?: string;
}

interface HeaderBarProps {
  isMobile: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  connectionMode: string;
  currentConnected: boolean;
  activeAccount: Account | null;
  accountInfo: AccountInfo | null;
  accounts: Account[];
  handleSwitchAccount: (accId: string) => void;
  setShowAccountModal: (show: boolean) => void;
  handleRestartServer: () => void;
  setView: (view: string) => void;
  styles: any;
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
}: HeaderBarProps) {
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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
                  <a
                    href="https://89.217.138.51:8751/api/live/strategies"
                    target="_blank"
                    rel="noopener noreferrer"
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
                  >
                    <ShieldAlert size={12} /> Authorize Laptop SSL
                  </a>
                </div>
              </div>

              {/* Resource Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--app-text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resources & Navigation</span>
                <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--app-panel-header-bg)', borderRadius: '8px', overflow: 'hidden' }}>
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
              {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '89.217.138.51') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--app-card-border)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', padding: '6px 12px', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>Target API:</span>
                    <select
                      value={localStorage.getItem('wyckoff_api_target') || `http://${window.location.hostname}:8751`}
                      onChange={(e) => {
                        localStorage.setItem('wyckoff_api_target', e.target.value);
                        window.location.reload();
                      }}
                      style={{
                        backgroundColor: '#1e293b',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option style={{ backgroundColor: '#1e293b', color: '#ffffff' }} value={`http://${window.location.hostname}:8751`}>Local Host (8751)</option>
                      <option style={{ backgroundColor: '#1e293b', color: '#ffffff' }} value="https://89.217.138.51:8751">Laptop Server (89.217.138.51)</option>
                      <option style={{ backgroundColor: '#1e293b', color: '#ffffff' }} value="https://trading-production-cb87.up.railway.app">Railway Live Container</option>
                    </select>
                  </div>
                </div>
              )}
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

              <a
                href="https://89.217.138.51:8751/api/live/strategies"
                target="_blank"
                rel="noopener noreferrer"
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
                title="Open Laptop backend to authorize HTTPS Self-Signed Certificate"
              >
                <ShieldAlert size={12} />
                Authorize Laptop SSL
              </a>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: 'var(--app-panel-header-bg)',
                    border: '1px solid var(--app-card-border)',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    color: 'var(--app-text)',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    outline: 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  <Menu size={12} /> Links & Resources <ChevronDown size={12} />
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
                      top: 'calc(100% + 8px)',
                      right: 0,
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(59, 130, 246, 0.1)',
                      padding: '6px 0',
                      display: 'flex',
                      flexDirection: 'column',
                      minWidth: '220px',
                      zIndex: 1000,
                    }}>
                      <a href="https://openapi.ctrader.com/apps" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                        cTrader Apps
                      </a>
                      <a href="https://gemini.google.com/app/71d33e33a84aa328" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                        Wyckoff Prompt
                      </a>
                      <a href="https://trader.ftmo.com/accounts-overview" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                        FTMO Overview
                      </a>
                      <a href="https://saphir.metanet.ch:8443/phpMyAdmin/index.php?db=aa_wyckoff_trading" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                        Database (phpMyAdmin)
                      </a>
                      <a href="https://railway.com/project/aa01f500-c3df-4d47-b60a-821237699d0d/service/05376c29-94f0-44f3-acc2-93d5d104019f/settings?environmentId=7a63d6ae-f3e6-452d-b527-6311f6f9b551" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                        Railway Settings
                      </a>
                      <a
                        href="#symbol-mappings"
                        className="menu-item"
                        onClick={(e) => {
                          e.preventDefault();
                          setView('mappings');
                          setShowMenu(false);
                        }}
                      >
                        🔗 Symbol Mappings
                      </a>
                      <a
                        href="#live-trades"
                        className="menu-item"
                        onClick={(e) => {
                          e.preventDefault();
                          setView('trades');
                          setShowMenu(false);
                        }}
                      >
                        📈 Live Trades & History
                      </a>
                      <a
                        href="#computers"
                        className="menu-item"
                        onClick={(e) => {
                          e.preventDefault();
                          setView('computers');
                          setShowMenu(false);
                        }}
                      >
                        💻 Computer Manager
                      </a>
                      <button
                        onClick={() => {
                          setShowMenu(false);
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
                          padding: '8px 16px',
                          color: '#94a3b8'
                        }}
                      >
                        🔔 Test Local Sound
                      </button>
                      <a href="/how-to" className="menu-item" style={{ borderTop: '1px solid #1e293b', paddingTop: '8px', marginTop: '4px' }} onClick={() => setShowMenu(false)}>
                        📖 How It Works
                      </a>
                    </div>
                  </>
                )}
              </div>

              {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '89.217.138.51') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', padding: '4px 8px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>Target API:</span>
                  <select
                    value={localStorage.getItem('wyckoff_api_target') || `http://${window.location.hostname}:8751`}
                    onChange={(e) => {
                      localStorage.setItem('wyckoff_api_target', e.target.value);
                      window.location.reload();
                    }}
                    style={{
                      backgroundColor: '#1e293b',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option style={{ backgroundColor: '#1e293b', color: '#ffffff' }} value={`http://${window.location.hostname}:8751`}>Local Host (8751)</option>
                    <option style={{ backgroundColor: '#1e293b', color: '#ffffff' }} value="https://89.217.138.51:8751">Laptop Server (89.217.138.51)</option>
                    <option style={{ backgroundColor: '#1e293b', color: '#ffffff' }} value="https://trading-production-cb87.up.railway.app">Railway Live Container</option>
                  </select>
                </div>
              )}
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
