import React, { useEffect, useState } from 'react';
import { Play, Pause, Trash2, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../api';

interface LiveStrategy {
  id: string;
  symbol: string;
  status: 'active' | 'paused';
  timeframe: string;
  slVal: number;
  slType: string;
  rr: number;
  size: number;
  useRiskSizing: boolean;
  riskPct: number;
  useBreakEven: boolean;
  beTriggerR: number;
  lookbackWindow: number;
  deployedAt: string;
  timezone: string;
  sessions: any[];
  useGlobalClose: boolean;
  globalCloseTime: string;
  entryStabilityRule: string;
  live_state?: {
    stage?: string;
    consec_bars?: number;
    pending_buy?: boolean;
    pending_sell?: boolean;
    spring_high?: number | null;
    upthrust_low?: number | null;
    pending_buy_age?: number;
    pending_sell_age?: number;
    status_message?: string;
    last_candle_time?: string | null;
    last_checked?: string;
  };
}

interface LiveOverviewPanelProps {
  isMobileLayout?: boolean;
}

export default function LiveOverviewPanel({ isMobileLayout = false }: LiveOverviewPanelProps) {
  const [strategies, setStrategies] = useState<LiveStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(15);

  const fetchStrategies = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/live/strategies`);
      const data = await res.json();
      if (data.status === 'success') {
        setStrategies(data.strategies || []);
      } else {
        setError(data.message || 'Failed to fetch strategies');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  // Simple 15-second interval refetch
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStrategies();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleToggleStatus = async (strategy: LiveStrategy) => {
    const nextStatus = strategy.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`${API_BASE_URL}/api/live/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...strategy, status: nextStatus })
      });
      const data = await res.json();
      if (data.status === 'success') {
        fetchStrategies();
      } else {
        alert(data.message || 'Failed to update status');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating strategy status');
    }
  };

  const handleDeleteStrategy = async (strategyId: string) => {
    if (!window.confirm('Are you sure you want to stop and delete this live strategy?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/live/strategy/${strategyId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.status === 'success') {
        fetchStrategies();
      } else {
        alert(data.message || 'Failed to delete strategy');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting strategy');
    }
  };

  if (loading && strategies.length === 0) {
    return <div style={{ color: '#64748b', fontSize: '12px', padding: '12px' }}>Loading live overview...</div>;
  }

  if (error && strategies.length === 0) {
    return <div style={{ color: '#ef4444', fontSize: '12px', padding: '12px' }}>Error: {error}</div>;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header section with Timer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #1f2937', paddingBottom: '8px' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>
          LIVE STRATEGIES ({strategies.length})
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '3px 8px', borderRadius: '12px' }}>
          <Clock size={12} />
          <span>Next check in {countdown}s</span>
        </div>
      </div>

      {/* Strategies List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
        {strategies.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100px', color: '#64748b', fontSize: '12px', border: '1px dashed #1f2937', borderRadius: '8px' }}>
            <span>No live strategies currently deployed.</span>
            <span style={{ fontSize: '10px', marginTop: '4px' }}>Deploy one using the Backtester panel settings!</span>
          </div>
        ) : (
          strategies.map((strategy) => {
            const state = strategy.live_state || {};
            const isPaused = strategy.status === 'paused';
            
            return (
              <div 
                key={strategy.id} 
                style={{ 
                  backgroundColor: '#0b0f19', 
                  border: '1px solid #1f2937', 
                  borderRadius: '8px', 
                  padding: '10px',
                  opacity: isPaused ? 0.6 : 1,
                  transition: 'opacity 0.2s'
                }}
              >
                {/* Symbol, Timeframe, Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc', marginRight: '6px' }}>
                      {strategy.symbol}
                    </span>
                    <span style={{ fontSize: '10px', backgroundColor: '#1e293b', color: '#94a3b8', padding: '2px 6px', borderRadius: '4px' }}>
                      {strategy.timeframe}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleToggleStatus(strategy)}
                      title={isPaused ? 'Resume Strategy' : 'Pause Strategy'}
                      style={{
                        backgroundColor: isPaused ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: isPaused ? '#10b981' : '#f59e0b',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '10px'
                      }}
                    >
                      {isPaused ? <Play size={10} /> : <Pause size={10} />}
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={() => handleDeleteStrategy(strategy.id)}
                      title="Stop & Delete"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                {/* State Details */}
                {!isPaused ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                    {/* Stage & Consec Bars */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #111827', paddingBottom: '4px' }}>
                      <span style={{ color: '#94a3b8' }}>Wyckoff Stage</span>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: state.stage === 'ACCUMULATION' ? '#10b981' : (state.stage === 'DISTRIBUTION' ? '#ef4444' : '#f59e0b') 
                      }}>
                        {state.stage || 'TRANSITION'} 
                        {state.consec_bars ? ` (${state.consec_bars} bars)` : ''}
                      </span>
                    </div>

                    {/* Waiting/Pending status */}
                    <div style={{ backgroundColor: '#111827', padding: '6px 8px', borderRadius: '4px', borderLeft: '3px solid #3b82f6', marginTop: '2px' }}>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>CURRENT STATE</span>
                      <span style={{ color: '#f3f4f6', fontSize: '10.5px', lineHeight: '1.4' }}>
                        {state.status_message || 'Fetching initial live structure...'}
                      </span>
                    </div>

                    {/* Last Checked Info */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginTop: '4px' }}>
                      <span>Last Candle: {state.last_candle_time || 'N/A'}</span>
                      <span>Evaluated: {state.last_checked ? state.last_checked.split(' ')[1] : 'N/A'}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px', backgroundColor: '#111827', borderRadius: '6px', fontSize: '11px', color: '#94a3b8' }}>
                    <Pause size={12} />
                    <span>Strategy paused. Evaluation threads are skipped.</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
