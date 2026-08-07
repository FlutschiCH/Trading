import React, { useState, useEffect } from 'react';

interface Position {
  ticket?: number;
  position_id?: string | number;
  symbol: string;
  type: string;
  volume: number;
  open_price: number;
  current_price?: number;
  sl?: number;
  tp?: number;
  profit?: number;
  magic?: number;
}

interface AccountInfo {
  balance?: number;
  equity?: number;
  margin?: number;
  free_margin?: number;
  margin_level?: number;
}

interface LandscapeMobileOverviewProps {
  onClose: () => void;
  positions?: Position[];
  accountInfo?: AccountInfo;
  currentSymbol?: string;
  currentPrice?: number;
  onClosePosition?: (pos: Position) => void;
}

export default function LandscapeMobileOverview({
  onClose,
  positions = [],
  accountInfo,
  currentSymbol = 'EURUSD',
  currentPrice = 0,
  onClosePosition
}: LandscapeMobileOverviewProps) {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('landscape_theme') !== 'light';
  });

  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  // Theme storage toggle
  const toggleTheme = () => {
    const nextTheme = !isDarkMode;
    setIsDarkMode(nextTheme);
    localStorage.setItem('landscape_theme', nextTheme ? 'dark' : 'light');
  };

  const [motionDetected, setMotionDetected] = useState<boolean>(false);

  // Screen Wake Lock API & Motion Detection
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
        }
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
        setWakeLockActive(false);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    // Device Motion Detection Listener
    let motionTimeout: any = null;
    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (acc) {
        const totalAcc = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
        // Detect significant tilt or physical movement (> 12 m/s²)
        if (totalAcc > 12) {
          setMotionDetected(true);
          clearTimeout(motionTimeout);
          motionTimeout = setTimeout(() => setMotionDetected(false), 1500);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      window.addEventListener('devicemotion', handleDeviceMotion);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
        window.removeEventListener('devicemotion', handleDeviceMotion);
      }
      clearTimeout(motionTimeout);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  // Theme Colors
  const theme = isDarkMode
    ? {
        bg: '#090d16',
        cardBg: '#111827',
        cardBorder: '#1f2937',
        textPrimary: '#f9fafb',
        textSecondary: '#9ca3af',
        accentBg: '#1e293b',
        headerBg: '#0f172a',
        badgeBg: '#1f2937'
      }
    : {
        bg: '#f3f4f6',
        cardBg: '#ffffff',
        cardBorder: '#e5e7eb',
        textPrimary: '#111827',
        textSecondary: '#4b5563',
        accentBg: '#e5e7eb',
        headerBg: '#ffffff',
        badgeBg: '#e5e7eb'
      };

  const totalFloatingPnl = positions.reduce((acc, pos) => acc + (pos.profit || 0), 0);
  const balance = accountInfo?.balance || 0;
  const equity = accountInfo?.equity || balance + totalFloatingPnl;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: theme.bg,
        color: theme.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Top Navigation & Status Bar */}
      <header
        style={{
          height: '42px',
          backgroundColor: theme.headerBg,
          borderBottom: `1px solid ${theme.cardBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        {/* Left: Account Summary Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📱 Landscape Overview</span>
            {wakeLockActive && (
              <span
                style={{
                  fontSize: '10px',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontWeight: '600'
                }}
                title="Screen Always On Active"
              >
                ON 💡
              </span>
            )}
            {motionDetected && (
              <span
                style={{
                  fontSize: '10px',
                  backgroundColor: '#eab308',
                  color: '#000000',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontWeight: '700',
                  animation: 'pulse 1s infinite'
                }}
                title="Motion/Tilt Detected"
              >
                ⚡ MOTION
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>
            Bal: <strong style={{ color: theme.textPrimary }}>${balance.toFixed(2)}</strong>
          </div>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>
            Eq: <strong style={{ color: theme.textPrimary }}>${equity.toFixed(2)}</strong>
          </div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 'bold',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: totalFloatingPnl >= 0 ? '#16a34a22' : '#dc262622',
              color: totalFloatingPnl >= 0 ? '#22c55e' : '#ef4444',
              border: `1px solid ${totalFloatingPnl >= 0 ? '#22c55e44' : '#ef444444'}`
            }}
          >
            P/L: {totalFloatingPnl >= 0 ? '+' : ''}${totalFloatingPnl.toFixed(2)}
          </div>
        </div>

        {/* Right: Controls (Theme Toggle + Exit) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={toggleTheme}
            style={{
              backgroundColor: theme.accentBg,
              border: `1px solid ${theme.cardBorder}`,
              color: theme.textPrimary,
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {isDarkMode ? '☀️ Light' : '🌙 Dark'}
          </button>

          <button
            onClick={onClose}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            ✕ Exit
          </button>
        </div>
      </header>

      {/* Main Split Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '8px', gap: '8px' }}>
        {/* Left Side: Live Price & Ticker Card (35% Width) */}
        <div
          style={{
            flex: '0 0 35%',
            backgroundColor: theme.cardBg,
            borderRadius: '8px',
            border: `1px solid ${theme.cardBorder}`,
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: theme.textSecondary, textTransform: 'uppercase' }}>
                Active Market
              </span>
              <span style={{ fontSize: '10px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }}></span> LIVE
              </span>
            </div>

            <div style={{ fontSize: '24px', fontWeight: '900', color: theme.textPrimary, marginTop: '4px' }}>
              {currentSymbol}
            </div>

            <div
              style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#3b82f6',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.5px',
                margin: '8px 0'
              }}
            >
              {currentPrice > 0 ? currentPrice.toFixed(5) : '---.--'}
            </div>
          </div>

          {/* Quick Metrics */}
          <div
            style={{
              backgroundColor: theme.accentBg,
              borderRadius: '6px',
              padding: '8px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              fontSize: '11px'
            }}
          >
            <div>
              <div style={{ color: theme.textSecondary, fontSize: '10px' }}>Positions</div>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{positions.length}</div>
            </div>
            <div>
              <div style={{ color: theme.textSecondary, fontSize: '10px' }}>Margin Level</div>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                {accountInfo?.margin_level ? `${accountInfo.margin_level.toFixed(0)}%` : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Active Positions High-Density List (65% Width) */}
        <div
          style={{
            flex: 1,
            backgroundColor: theme.cardBg,
            borderRadius: '8px',
            border: `1px solid ${theme.cardBorder}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${theme.cardBorder}`,
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              backgroundColor: theme.headerBg
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: theme.textPrimary }}>
              Open Positions ({positions.length})
            </span>
          </div>

          {/* List Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
            {positions.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.textSecondary,
                  fontSize: '13px'
                }}
              >
                No active positions open.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {positions.map((pos, idx) => {
                  const side = (pos.type || '').toUpperCase();
                  const isBuy = side === 'BUY' || side === '0';
                  const pnl = pos.profit || 0;

                  return (
                    <div
                      key={pos.ticket || pos.position_id || idx}
                      style={{
                        backgroundColor: theme.accentBg,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: '6px',
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                      }}
                    >
                      {/* Side Badge & Symbol */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            backgroundColor: isBuy ? '#16a34a' : '#dc2626',
                            color: '#ffffff'
                          }}
                        >
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{pos.symbol}</div>
                          <div style={{ fontSize: '10px', color: theme.textSecondary }}>Vol: {pos.volume}</div>
                        </div>
                      </div>

                      {/* Prices */}
                      <div style={{ fontSize: '11px', textAlign: 'center' }}>
                        <div style={{ color: theme.textSecondary, fontSize: '10px' }}>Entry &rarr; Current</div>
                        <div style={{ fontWeight: '600' }}>
                          {(typeof pos.open_price === 'number' ? pos.open_price : Number(pos.open_price) || 0).toFixed(5)} &rarr; {((pos.current_price || currentPrice || 0) as number).toFixed(5)}
                        </div>
                      </div>

                      {/* Profit & Action */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            textAlign: 'right',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            color: pnl >= 0 ? '#22c55e' : '#ef4444'
                          }}
                        >
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                        </div>

                        {onClosePosition && (
                          <button
                            onClick={() => onClosePosition(pos)}
                            style={{
                              backgroundColor: '#dc262622',
                              color: '#ef4444',
                              border: '1px solid #ef444455',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
