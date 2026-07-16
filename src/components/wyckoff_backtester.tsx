import React from 'react';
import { formatPrice } from '../App';

interface WyckoffBacktesterProps {
  symbol: string;
  timeframe: string;
  liveStrategy: any;
  isDeploying: boolean;
  deployLiveStrategy: () => void;
  backtestBalance: string;
  setBacktestBalance: (val: string) => void;
  useRiskSizing: boolean;
  setUseRiskSizing: (val: boolean) => void;
  backtestRiskPct: string;
  setBacktestRiskPct: (val: string) => void;
  backtestSize: string;
  setBacktestSize: (val: string) => void;
  backtestSL: string;
  setBacktestSL: (val: string) => void;
  backtestSLType: 'pct' | 'price' | 'dollar';
  setBacktestSLType: (val: 'pct' | 'price' | 'dollar') => void;
  backtestRR: string;
  setBacktestRR: (val: string) => void;
  useBreakEven: boolean;
  setUseBreakEven: (val: boolean) => void;
  backtestBE: string;
  setBacktestBE: (val: string) => void;
  lookbackWindow: string;
  setLookbackWindow: (val: string) => void;
  backtestFees: string;
  setBacktestFees: (val: string) => void;
  backtestResults: any;
  backtestTab: 'trades' | 'weekly' | 'monthly' | 'favourites';
  setBacktestTab: (val: 'trades' | 'weekly' | 'monthly' | 'favourites') => void;
  tradeFilter: 'all' | 'wins' | 'losses';
  setTradeFilter: (val: 'all' | 'wins' | 'losses') => void;
  selectedTrade: any;
  setSelectedTrade: (trade: any) => void;
  setShowModal: (show: boolean) => void;
  dateRangeOption: string;
  setDateRangeOption: (val: string) => void;
  customFrom: string;
  setCustomFrom: (val: string) => void;
  customTo: string;
  setCustomTo: (val: string) => void;
  candleLimit: number;
  setCandleLimit: (val: number) => void;
  favouriteCandles?: any[];
  onDeleteFavourite?: (id: number) => void;
  onUpdateNotes?: (id: number, notes: string) => void;
  onLocateCandle?: (fav: any) => void;
  styles: any;
  enabledIndicators: { fvg: boolean };
  setEnabledIndicators: (val: any) => void;
  onRunBacktest: () => void;
  loadingBacktest: boolean;
  dailyRetryLimit: string;
  setDailyRetryLimit: (val: string) => void;
  allowOppositeClose: boolean;
  setAllowOppositeClose: (val: boolean) => void;
  onCancelBacktest: () => void;
  sessionsTimezone: 'UTC' | 'Local';
  setSessionsTimezone: (val: 'UTC' | 'Local') => void;
  tradingSessions: any[];
  setTradingSessions: (val: any[]) => void;
  useGlobalClose: boolean;
  setUseGlobalClose: (val: boolean) => void;
  globalCloseTime: string;
  setGlobalCloseTime: (val: string) => void;
}

export default function WyckoffBacktester({
  symbol,
  timeframe,
  liveStrategy,
  isDeploying,
  deployLiveStrategy,
  backtestBalance,
  setBacktestBalance,
  useRiskSizing,
  setUseRiskSizing,
  backtestRiskPct,
  setBacktestRiskPct,
  backtestSize,
  setBacktestSize,
  backtestSL,
  setBacktestSL,
  backtestSLType,
  setBacktestSLType,
  backtestRR,
  setBacktestRR,
  useBreakEven,
  setUseBreakEven,
  backtestBE,
  setBacktestBE,
  lookbackWindow,
  setLookbackWindow,
  backtestFees,
  setBacktestFees,
  backtestResults,
  backtestTab,
  setBacktestTab,
  tradeFilter,
  setTradeFilter,
  selectedTrade,
  setSelectedTrade,
  setShowModal,
  dateRangeOption,
  setDateRangeOption,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  candleLimit,
  setCandleLimit,
  favouriteCandles = [],
  onDeleteFavourite,
  onUpdateNotes,
  onLocateCandle,
  styles,
  enabledIndicators,
  setEnabledIndicators,
  onRunBacktest,
  loadingBacktest,
  dailyRetryLimit,
  setDailyRetryLimit,
  allowOppositeClose,
  setAllowOppositeClose,
  onCancelBacktest,
  sessionsTimezone,
  setSessionsTimezone,
  tradingSessions,
  setTradingSessions,
  useGlobalClose,
  setUseGlobalClose,
  globalCloseTime,
  setGlobalCloseTime
}: WyckoffBacktesterProps) {
  const [copied, setCopied] = React.useState(false);

  // Session builder states
  const [newStart, setNewStart] = React.useState('09:00');
  const [newEnd, setNewEnd] = React.useState('17:00');
  const [newCloseOnEnd, setNewCloseOnEnd] = React.useState(true);
  const [newWeekdays, setNewWeekdays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [newColor, setNewColor] = React.useState('#3b82f6'); // Default color
  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(null);

  const handleAddSession = () => {
    if (!newStart || !newEnd) return;
    
    if (editingSessionId) {
      setTradingSessions(tradingSessions.map(s => s.id === editingSessionId ? {
        ...s,
        start: newStart,
        end: newEnd,
        closeOnEnd: newCloseOnEnd,
        weekdays: [...newWeekdays],
        color: newColor
      } : s));
      setEditingSessionId(null);
    } else {
      const newSession = {
        id: Math.random().toString(36).substr(2, 9),
        start: newStart,
        end: newEnd,
        closeOnEnd: newCloseOnEnd,
        weekdays: [...newWeekdays],
        color: newColor
      };
      setTradingSessions([...tradingSessions, newSession]);
    }
    
    // Reset form to defaults
    setNewStart('09:00');
    setNewEnd('17:00');
    setNewCloseOnEnd(true);
    setNewWeekdays([1, 2, 3, 4, 5]);
    setNewColor('#3b82f6');
  };

  const handleEditSession = (session: any) => {
    setEditingSessionId(session.id);
    setNewStart(session.start);
    setNewEnd(session.end);
    setNewCloseOnEnd(session.closeOnEnd);
    setNewWeekdays([...session.weekdays]);
    setNewColor(session.color || '#3b82f6');
  };

  const handleCancelEdit = () => {
    setEditingSessionId(null);
    setNewStart('09:00');
    setNewEnd('17:00');
    setNewCloseOnEnd(true);
    setNewWeekdays([1, 2, 3, 4, 5]);
    setNewColor('#3b82f6');
  };

  const handleDeleteSession = (id: string) => {
    if (editingSessionId === id) {
      handleCancelEdit();
    }
    setTradingSessions(tradingSessions.filter(s => s.id !== id));
  };

  const toggleWeekday = (day: number) => {
    if (newWeekdays.includes(day)) {
      setNewWeekdays(newWeekdays.filter(d => d !== day));
    } else {
      setNewWeekdays([...newWeekdays, day].sort());
    }
  };

  const handleCopy = async () => {
    try {
      const backendUrl = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
        ? 'http://localhost:8751/api/backtest/results'
        : `${window.location.origin}/api/backtest/results`;
        
      const res = await fetch(backendUrl);
      const json = await res.json();
      if (json.status === 'success') {
        await navigator.clipboard.writeText(JSON.stringify(json.data, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error(json.message || 'Error fetching');
      }
    } catch (err) {
      try {
        const cleanResults = {
          explainer: "VSA and sweep strategy backtest data.",
          settings: {
            symbol: symbol,
            timeframe: timeframe
          },
          metrics: {
            winRate: backtestResults?.winRate,
            netPnl: backtestResults?.netPnl,
            profitFactor: backtestResults?.profitFactor,
            totalTrades: backtestResults?.totalTrades,
            maxDrawdown: backtestResults?.maxDrawdown,
            maxDailyLoss: backtestResults?.maxDailyLoss,
            dailyLossBreached: backtestResults?.dailyLossBreached,
          },
          trades: backtestResults?.trades?.slice(0, 100)
        };
        await navigator.clipboard.writeText(JSON.stringify(cleanResults, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e: any) {
        console.error(e);
      }
    }
  };

  return (
    <div className="no-drag" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        fontSize: '12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-4px' }}>
          <button 
            onClick={onRunBacktest}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '11px',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            🔄 Run Backtest
          </button>
        </div>
        {/* Row 1: Account setup (Starting Balance & Fees) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Starting Balance ($)</label>
            <input 
              type="number" 
              value={backtestBalance} 
              onChange={(e) => setBacktestBalance(e.target.value)}
              style={styles.input}
              min="100"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Fees per side (%)</label>
            <input 
              type="number" 
              value={backtestFees} 
              onChange={(e) => setBacktestFees(e.target.value)}
              style={styles.input}
              step="0.01"
              min="0.0"
            />
          </div>
        </div>

        {/* Row 2: Position Size settings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
          <div style={{ ...styles.formGroup, justifyContent: 'center', height: '100%' }}>
            <label style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
              <input 
                type="checkbox" 
                checked={useRiskSizing}
                onChange={(e) => setUseRiskSizing(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Auto Size by Risk
            </label>
          </div>

          {useRiskSizing ? (
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Risk %</label>
              <input 
                type="number" 
                value={backtestRiskPct} 
                onChange={(e) => setBacktestRiskPct(e.target.value)}
                style={styles.input}
                step="0.1"
                min="0.1"
                max="10.0"
              />
            </div>
          ) : (
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Qty (Size)</label>
              <input 
                type="number" 
                value={backtestSize} 
                onChange={(e) => setBacktestSize(e.target.value)}
                style={styles.input}
                step="0.1"
                min="0.1"
              />
            </div>
          )}
        </div>

        {/* Row 3: Stop Loss & Profit Target (RR Ratio) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '12px' }}>
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Stop Loss</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input 
                type="number" 
                value={backtestSL} 
                onChange={(e) => setBacktestSL(e.target.value)}
                style={{ ...styles.input, flexGrow: 1, minWidth: 0 }}
                step={backtestSLType === 'pct' ? '0.1' : '1'}
                min="0.01"
              />
              <select
                value={backtestSLType}
                onChange={(e) => {
                  const newType = e.target.value as 'pct' | 'price' | 'dollar';
                  setUseRiskSizing(true); // Preserve risk sizing target
                  setBacktestSLType(newType);
                  const isForex = ['EUR', 'GBP', 'JPY', 'USD', 'CAD', 'AUD', 'CHF'].some(curr => symbol.toUpperCase().includes(curr)) && !['BTC', 'ETH', 'SOL', 'LTC', 'XRP'].some(crypto => symbol.toUpperCase().includes(crypto));
                  setBacktestSL(newType === 'pct' ? '1.0' : (newType === 'dollar' ? '100' : (isForex ? '20' : '200')));
                }}
                style={{
                  ...styles.input,
                  width: '65px',
                  backgroundColor: '#1f2937',
                  cursor: 'pointer',
                  padding: '0 4px',
                }}
              >
                <option value="pct">%</option>
                <option value="price">Pips</option>
                <option value="dollar">$</option>
              </select>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>RR Ratio</label>
            <input 
              type="number" 
              value={backtestRR} 
              onChange={(e) => setBacktestRR(e.target.value)}
              style={styles.input}
              step="0.1"
              min="0.5"
            />
          </div>
        </div>

        {/* Row 4: Break Even controls & Lookback Window */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
          <div style={{ ...styles.formGroup, height: '100%', justifyContent: 'center' }}>
            <label style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
              <input 
                type="checkbox" 
                checked={useBreakEven}
                onChange={(e) => setUseBreakEven(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Enable BE
            </label>
          </div>

          {useBreakEven ? (
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>BE Trigger (R)</label>
              <input 
                type="number" 
                value={backtestBE} 
                onChange={(e) => setBacktestBE(e.target.value)}
                style={styles.input}
                step="0.1"
                min="0.1"
              />
            </div>
          ) : (
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Sweep Lookback</label>
              <input 
                type="number" 
                value={lookbackWindow} 
                onChange={(e) => setLookbackWindow(e.target.value)}
                style={styles.input}
                min="5"
                max="200"
              />
            </div>
          )}
        </div>

        {/* Row 4b: Allow Opposite Close setting */}
        <div style={styles.formGroup}>
          <label style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
            <input 
              type="checkbox" 
              checked={allowOppositeClose}
              onChange={(e) => setAllowOppositeClose(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Allow Opposite Signal to Close Trade
          </label>
        </div>

        {/* Row 5: Sweep Lookback & Daily Retry */}
        <div style={{ display: 'grid', gridTemplateColumns: useBreakEven ? '1fr 1fr' : '1fr', gap: '12px' }}>
          {useBreakEven && (
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Sweep Lookback (Bars)</label>
              <input 
                type="number" 
                value={lookbackWindow} 
                onChange={(e) => setLookbackWindow(e.target.value)}
                style={styles.input}
                min="5"
                max="200"
              />
            </div>
          )}
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Daily Retry Limit</label>
            <input 
              type="number" 
              value={dailyRetryLimit} 
              onChange={(e) => {
                const val = Math.max(0, parseInt(e.target.value) || 0);
                setDailyRetryLimit(val.toString());
              }}
              style={styles.input}
              min="0"
              step="1"
            />
          </div>
        </div>

        {/* Trading Sessions & Safeguards */}
        <div style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '12px',
          marginTop: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Trading Sessions & Safeguards
          </span>

          {/* Timezone Selector */}
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Global Timezone</label>
            <select
              value={sessionsTimezone}
              onChange={(e) => setSessionsTimezone(e.target.value as 'UTC' | 'Local')}
              style={styles.input}
            >
              <option value="Local">Local Time</option>
              <option value="UTC">UTC (GMT)</option>
            </select>
          </div>

          {/* Global close time */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useGlobalClose}
                onChange={(e) => setUseGlobalClose(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Close Everything daily at:
            </label>
            {useGlobalClose && (
              <input
                type="text"
                placeholder="e.g. 21:50"
                value={globalCloseTime}
                onChange={(e) => setGlobalCloseTime(e.target.value)}
                style={styles.input}
              />
            )}
          </div>

          {/* Sessions List */}
          {tradingSessions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 'bold' }}>Active Sessions:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                {tradingSessions.map((s, idx) => {
                  const daysStr = s.weekdays.map((d: number) => ['M', 'T', 'W', 'T', 'F', 'S', 'S'][d - 1]).join(',');
                  const sessionColor = s.color || '#3b82f6';
                  return (
                    <div key={s.id || idx} style={{
                      backgroundColor: 'rgba(31, 41, 55, 0.5)',
                      border: '1px solid #1e293b',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      borderLeft: `4px solid ${sessionColor}`
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{s.start} - {s.end} ({daysStr})</span>
                        </div>
                        <span style={{ color: '#9ca3af', fontSize: '9px' }}>
                          {s.closeOnEnd ? 'Close on End' : 'Let run'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => handleEditSession(s)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#3b82f6',
                            cursor: 'pointer',
                            fontSize: '11px',
                            padding: '2px 4px'
                          }}
                          title="Edit Session"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteSession(s.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            padding: '2px 4px'
                          }}
                          title="Delete Session"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Session Form */}
          <div style={{
            backgroundColor: 'rgba(31, 41, 55, 0.3)',
            border: '1px dotted #374151',
            borderRadius: '6px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <span style={{ color: '#9ca3af', fontSize: '10px', fontWeight: 'bold' }}>{editingSessionId ? 'Edit Trading Session' : 'Add Trading Session'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '9px' }}>Start Time</label>
                <input
                  type="time"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  style={{ ...styles.input, padding: '4px 6px', fontSize: '11px', colorScheme: 'dark' }}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '9px' }}>End Time</label>
                <input
                  type="time"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  style={{ ...styles.input, padding: '4px 6px', fontSize: '11px', colorScheme: 'dark' }}
                />
              </div>
            </div>

            {/* Weekdays Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ color: '#9ca3af', fontSize: '9px' }}>Weekdays</label>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const isSelected = newWeekdays.includes(day);
                  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
                  return (
                    <button
                      key={day}
                      onClick={() => toggleWeekday(day)}
                      style={{
                        flex: '1 0 auto',
                        padding: '4px 0',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        borderRadius: '3px',
                        border: '1px solid ' + (isSelected ? '#3b82f6' : '#374151'),
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: isSelected ? '#3b82f6' : '#9ca3af',
                        cursor: 'pointer',
                        minWidth: '22px'
                      }}
                    >
                      {labels[day - 1]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color picker and close on end row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <label style={{ color: '#cbd5e1', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newCloseOnEnd}
                  onChange={(e) => setNewCloseOnEnd(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Close on End
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ color: '#9ca3af', fontSize: '9px' }}>Color</label>
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    width: '24px',
                    height: '24px',
                    padding: 0
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleAddSession}
                style={{
                  flex: 1,
                  backgroundColor: editingSessionId ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                  color: editingSessionId ? '#10b981' : '#3b82f6',
                  border: '1px solid ' + (editingSessionId ? '#10b981' : '#3b82f6'),
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {editingSessionId ? '✏️ Update Session' : '+ Add Session Window'}
              </button>
              {editingSessionId && (
                <button
                  onClick={handleCancelEdit}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Indicator Features List */}
        <div style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '12px',
          marginTop: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Indicator Features
          </span>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={enabledIndicators?.fvg}
                onChange={(e) => setEnabledIndicators({ ...enabledIndicators, fvg: e.target.checked })}
                style={{ cursor: 'pointer' }}
              />
              Fair Value Gap (FVG)
            </label>
          </div>
        </div>

        {/* Date Range Selection & Filtering */}
        <div style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '12px',
          marginTop: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: '#cbd5e1' }}>Date Range Settings</span>
            {dateRangeOption !== 'last_candles' && (
              <button 
                onClick={() => {
                  setDateRangeOption('last_candles');
                  setCustomFrom('');
                  setCustomTo('');
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  textDecoration: 'underline'
                }}
              >
                Clear Range
              </button>
            )}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Filter Option</label>
              <select 
                value={dateRangeOption}
                onChange={(e) => setDateRangeOption(e.target.value)}
                style={styles.input}
              >
                <option value="last_candles">Last Candles (Limit)</option>
                <option value="this_week">This Week (Sun 20:00)</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            
            {dateRangeOption === 'last_candles' && (
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>Candle Limit</label>
                <select 
                  value={candleLimit}
                  onChange={(e) => setCandleLimit(parseInt(e.target.value))}
                  style={styles.input}
                >
                  <option value="1000">1000</option>
                  <option value="2000">2000</option>
                  <option value="5000">5000</option>
                  <option value="10000">10000</option>
                </select>
              </div>
            )}
          </div>

          {dateRangeOption === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>From Date</label>
                <input 
                  type="datetime-local" 
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>To Date</label>
                <input 
                  type="datetime-local" 
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>
          )}
        </div>
      </div>



      {(backtestResults || favouriteCandles.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', flex: 1, overflowY: 'auto' }}>
          {backtestResults && (
            <>
              <div style={styles.walletContainer}>
                <div style={styles.walletRow}>
                  <span style={{ color: '#9ca3af' }}>Total Trades:</span>
                  <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{backtestResults.totalTrades}</span>
                </div>
                <div style={styles.walletRow}>
                  <span style={{ color: '#9ca3af' }}>Win Rate:</span>
                  <span style={{ color: backtestResults.winRate >= 50 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {backtestResults.winRate.toFixed(1)}%
                  </span>
                </div>
                <div style={styles.walletRow}>
                  <span style={{ color: '#9ca3af' }}>Net Profit:</span>
                  <span style={{ color: backtestResults.netPnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    ${backtestResults.netPnl.toFixed(2)}
                  </span>
                </div>
                <div style={styles.walletRow}>
                  <span style={{ color: '#9ca3af' }}>Profit Factor:</span>
                  <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{backtestResults.profitFactor.toFixed(2)}</span>
                </div>
                <div style={styles.walletRow}>
                  <span style={{ color: '#9ca3af' }}>Max Drawdown:</span>
                  <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{(backtestResults.maxDrawdown ?? 0).toFixed(2)}%</span>
                </div>
                <div style={styles.walletRow}>
                  <span style={{ color: '#9ca3af' }}>Max Daily Loss:</span>
                  <span style={{ color: (backtestResults.maxDailyLoss ?? 0) >= 5.0 ? '#ef4444' : '#ffffff', fontWeight: 'bold' }}>
                    {(backtestResults.maxDailyLoss ?? 0).toFixed(2)}%
                  </span>
                </div>
              </div>

              {backtestResults.dailyLossBreached && (
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  padding: '8px',
                  color: '#ef4444',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  marginTop: '4px'
                }}>
                  ⚠️ FTMO 5% Daily Loss Rule Breached!
                </div>
              )}

              {/* AI Assistant Helpers */}
              <div style={{
                backgroundColor: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '10px',
                marginTop: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#cbd5e1', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.5px' }}>ASK AI ASSISTANT</span>
                  {copied && <span style={{ color: '#10b981', fontSize: '10px', fontWeight: 'bold' }}>✓ Copied!</span>}
                </div>
                
                <button
                  onClick={handleCopy}
                  style={{
                    backgroundColor: copied ? '#065f46' : '#2563eb',
                    border: 'none',
                    color: '#ffffff',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  {copied ? '✓ JSON Copied!' : '📋 Copy backtest_results.json'}
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  <a
                    href="https://gemini.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#60a5fa',
                      padding: '6px 4px',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                  >
                    ✨ Gemini
                  </a>
                  <a
                    href="https://chatgpt.com/"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#10b981',
                      padding: '6px 4px',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                  >
                    💬 ChatGPT
                  </a>
                  <a
                    href="https://grok.com/"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f59e0b',
                      padding: '6px 4px',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                  >
                    🚀 Grok
                  </a>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '4px', marginTop: '8px' }}>
            {backtestResults && (
              <>
                <button 
                  onClick={() => setBacktestTab('trades')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: backtestTab === 'trades' ? '#3b82f6' : '#9ca3af',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    cursor: 'pointer',
                    borderBottom: backtestTab === 'trades' ? '2px solid #3b82f6' : 'none',
                    paddingBottom: '2px'
                  }}
                >
                  Trades ({backtestResults.trades.length})
                </button>
                <button 
                  onClick={() => setBacktestTab('weekly')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: backtestTab === 'weekly' ? '#3b82f6' : '#9ca3af',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    cursor: 'pointer',
                    borderBottom: backtestTab === 'weekly' ? '2px solid #3b82f6' : 'none',
                    paddingBottom: '2px'
                  }}
                >
                  Weekly
                </button>
                <button 
                  onClick={() => setBacktestTab('monthly')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: backtestTab === 'monthly' ? '#3b82f6' : '#9ca3af',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    cursor: 'pointer',
                    borderBottom: backtestTab === 'monthly' ? '2px solid #3b82f6' : 'none',
                    paddingBottom: '2px'
                  }}
                >
                  Monthly
                </button>
              </>
            )}
            <button 
              onClick={() => setBacktestTab('favourites')}
              style={{
                background: 'none',
                border: 'none',
                color: backtestTab === 'favourites' ? '#eab308' : '#9ca3af',
                fontWeight: 'bold',
                fontSize: '11px',
                cursor: 'pointer',
                borderBottom: backtestTab === 'favourites' ? '2px solid #eab308' : 'none',
                paddingBottom: '2px'
              }}
            >
              ⭐ Favourites ({favouriteCandles.length})
            </button>
          </div>

          {backtestTab === 'trades' && backtestResults && (
            <div style={{ display: 'flex', gap: '8px', padding: '6px 0', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>Filter:</span>
              <button 
                onClick={() => setTradeFilter('all')}
                style={{
                  background: tradeFilter === 'all' ? '#1f2937' : 'none',
                  border: '1px solid #1f2937',
                  color: tradeFilter === 'all' ? '#ffffff' : '#9ca3af',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                All
              </button>
              <button 
                onClick={() => setTradeFilter('wins')}
                style={{
                  background: tradeFilter === 'wins' ? 'rgba(16, 185, 129, 0.2)' : 'none',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#10b981',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Wins
              </button>
              <button 
                onClick={() => setTradeFilter('losses')}
                style={{
                  background: tradeFilter === 'losses' ? 'rgba(239, 68, 68, 0.2)' : 'none',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Losses
              </button>
            </div>
          )}

          <div style={{ ...styles.positionsList, maxHeight: '350px', overflowY: 'auto' }}>
            {backtestTab === 'trades' && backtestResults && backtestResults.trades.map((trade: any) => (
              <div 
                key={trade.id} 
                onClick={() => {
                  setSelectedTrade(trade);
                  setShowModal(true);
                }}
                style={{
                  ...styles.positionRow,
                  cursor: 'pointer',
                  border: selectedTrade?.id === trade.id 
                    ? '1.5px solid #3b82f6' 
                    : (trade.pnl >= 0 ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1.5px solid rgba(239, 68, 68, 0.4)'),
                  transform: selectedTrade?.id === trade.id ? 'scale(1.02)' : 'scale(1)',
                  opacity: tradeFilter === 'all' 
                    ? 1 
                    : (tradeFilter === 'wins' ? (trade.pnl >= 0 ? 1 : 0.3) : (trade.pnl < 0 ? 1 : 0.3)),
                  transition: 'all 0.15s'
                }}
              >
                <div style={styles.posDetails}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: `1.5px solid ${trade.type === 'BUY' ? '#10b981' : '#ef4444'}`,
                      backgroundColor: trade.type === 'BUY' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      color: trade.type === 'BUY' ? '#10b981' : '#ef4444',
                      display: 'inline-block',
                      lineHeight: '1',
                    }}>
                      {trade.type}
                    </span>
                    <span style={{ color: '#ffffff', fontWeight: 'bold' }}>
                      @{formatPrice(trade.entryPrice, symbol)}
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>
                    Exit: {formatPrice(trade.exitPrice, symbol)} | Fees: ${trade.fees ? trade.fees.toFixed(2) : '0.00'} | {trade.time}
                  </span>
                </div>
                <span style={styles.posPnl(trade.pnl >= 0)}>
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </span>
              </div>
            ))}

            {backtestTab === 'weekly' && backtestResults && backtestResults.weeklyBreakdown && Object.keys(backtestResults.weeklyBreakdown).sort().reverse().map((week) => {
              const pnl = backtestResults.weeklyBreakdown![week];
              return (
                <div key={week} style={styles.positionRow}>
                  <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{week}</span>
                  <span style={styles.posPnl(pnl >= 0)}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                  </span>
                </div>
              );
            })}

            {backtestTab === 'monthly' && backtestResults && backtestResults.monthlyBreakdown && Object.keys(backtestResults.monthlyBreakdown).sort().reverse().map((month) => {
              const pnl = backtestResults.monthlyBreakdown![month];
              return (
                <div key={month} style={styles.positionRow}>
                  <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{month}</span>
                  <span style={styles.posPnl(pnl >= 0)}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                  </span>
                </div>
              );
            })}

            {backtestTab === 'favourites' && favouriteCandles.map((fav: any) => {
              const formattedTime = new Date(fav.candle_time * 1000).toLocaleString('de-CH', { timeZone: 'UTC' });
              return (
                <div 
                  key={fav.id}
                  style={{
                    ...styles.positionRow,
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '10px',
                    border: '1px solid #334155',
                    padding: '12px',
                    backgroundColor: '#0f172a'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(234, 179, 8, 0.12)',
                        border: '1px solid #eab308',
                        color: '#eab308'
                      }}>
                        {fav.symbol}
                      </span>
                      <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 'bold' }}>
                        {formattedTime}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {onLocateCandle && (
                        <button
                          onClick={() => onLocateCandle(fav)}
                          style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: '#3b82f6',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          📍 Chart
                        </button>
                      )}
                      {onDeleteFavourite && (
                        <button
                          onClick={() => onDeleteFavourite(fav.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>OHLC: <span style={{ color: '#f8fafc', fontFamily: 'monospace' }}>O:{fav.open_val.toFixed(2)} H:{fav.high_val.toFixed(2)} L:{fav.low_val.toFixed(2)} C:{fav.close_val.toFixed(2)}</span></div>
                    {fav.vsa_patterns && <div>VSA: <span style={{ color: '#fbbf24' }}>{fav.vsa_patterns}</span></div>}
                    {fav.weis_wave_volume !== null && fav.weis_wave_volume !== undefined && (
                      <div>Weis Vol: <span style={{ color: '#10b981' }}>{fav.weis_wave_volume.toFixed(1)}</span></div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid #1e293b', paddingTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="text"
                      defaultValue={fav.notes || ''}
                      placeholder="Add notes..."
                      onBlur={(e) => {
                        if (onUpdateNotes && e.target.value !== (fav.notes || '')) {
                          onUpdateNotes(fav.id, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && onUpdateNotes) {
                          onUpdateNotes(fav.id, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: '#f8fafc',
                        fontSize: '11px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {loadingBacktest && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          borderRadius: '8px',
          pointerEvents: 'all'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid rgba(255, 255, 255, 0.1)',
            borderTop: '3px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '8px'
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 500 }}>Running Backtest...</span>
          <button 
            onClick={onCancelBacktest}
            style={{
              marginTop: '12px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '11px',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
          >
            🛑 Stop Backtest
          </button>
        </div>
      )}
    </div>
  );
}
