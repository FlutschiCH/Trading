import React, { useState, useEffect } from 'react';
import { Zap, Target, AlertCircle, RefreshCw, Sliders, Play, CheckCircle2, Activity, Gauge } from 'lucide-react';
import { API_BASE_URL } from '../api';
import DebugComponentBadge from './debug_component_badge';
import DeployModal from './deploy_modal';
import type { Candle } from '../types/trading';

interface ScalperCardProps {
  currentSymbol?: string;
  currentTimeframe?: string;
  candles?: Candle[];
}

export const ScalperCard: React.FC<ScalperCardProps> = ({
  currentSymbol = 'EURUSD',
  currentTimeframe = 'M1',
  candles = []
}) => {
  const [spreadPips, setSpreadPips] = useState<number>(0.8);
  const [accountBalance, setAccountBalance] = useState<number>(1000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [atrMultiplier, setAtrMultiplier] = useState<number>(2.5);
  const [volMultiplier, setVolMultiplier] = useState<number>(3.0);
  const [minWickRatio, setMinWickRatio] = useState<number>(40);
  const [maxSpreadPips, setMaxSpreadPips] = useState<number>(1.2);

  const [loading, setLoading] = useState<boolean>(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [scalperState, setScalperState] = useState<any>({});

  // Deploy Modal state
  const [showDeployModal, setShowDeployModal] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);

  const [backtestLoading, setBacktestLoading] = useState<boolean>(false);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [showTriggeredModal, setShowTriggeredModal] = useState<boolean>(false);
  const [selectedSpikeCandle, setSelectedSpikeCandle] = useState<any>(null);

  const handleEvaluate = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const payload = {
        symbol: currentSymbol,
        candles: candles.slice(-50),
        state: scalperState,
        spread_pips: spreadPips,
        balance: accountBalance,
        risk_percent: riskPercent,
        atr_multiplier: atrMultiplier,
        vol_multiplier: volMultiplier,
        min_wick_ratio: minWickRatio / 100.0,
        max_spread_pips: maxSpreadPips
      };

      const res = await fetch(`${API_BASE_URL}/api/scalper/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.status === 'success') {
        setEvalResult(data.result);
        if (data.result.state) {
          setScalperState(data.result.state);
        }
      } else {
        setErrorMsg(data.message || 'Evaluation failed');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error evaluating scalper');
    } finally {
      setLoading(false);
    }
  };

  const handleRunBacktest = async () => {
    setBacktestLoading(true);
    setErrorMsg('');
    try {
      const payload = {
        symbol: currentSymbol,
        candles: candles,
        balance: accountBalance,
        risk_percent: riskPercent,
        atr_multiplier: atrMultiplier,
        vol_multiplier: volMultiplier,
        min_wick_ratio: minWickRatio / 100.0,
        max_spread_pips: maxSpreadPips,
        hard_stop_minutes: 8
      };

      const res = await fetch(`${API_BASE_URL}/api/scalper/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.status === 'success') {
        setBacktestResult(data);
        setSuccessMsg(`Backtest finished: ${data.summary?.total_trades || 0} trades executed, ${data.triggered_candles?.length || 0} spikes recorded.`);
      } else {
        setErrorMsg(data.message || 'Backtest failed');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error running scalper backtest');
    } finally {
      setBacktestLoading(false);
    }
  };

  useEffect(() => {
    if (candles.length > 25) {
      handleEvaluate();
    }
  }, [candles.length, currentSymbol]);

  const handleDeployConfirm = async (
    targetComputer: string,
    targets: Array<{ broker: string; account_id: string }>,
    name: string
  ) => {
    setIsDeploying(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const stratPayload = {
        name: name || `M1 Scalper [${currentSymbol}]`,
        symbol: currentSymbol,
        timeframe: currentTimeframe || 'M1',
        status: 'active',
        strategy_type: 'scalper',
        slVal: 2.0,
        slType: 'pips',
        rr: 2.0,
        size: 1.0,
        useRiskSizing: true,
        riskPct: riskPercent,
        useBreakEven: true,
        beTriggerR: 1.0,
        allowOppositeClose: true,
        lookbackWindow: 50,
        target_computer: targetComputer || 'All',
        targets: targets,
        atr_multiplier: atrMultiplier,
        vol_multiplier: volMultiplier,
        min_wick_ratio: minWickRatio / 100.0,
        max_spread_pips: maxSpreadPips
      };

      const res = await fetch(`${API_BASE_URL}/api/live-strategy/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stratPayload)
      });

      const data = await res.json();
      if (data.status === 'success' || data.success) {
        setSuccessMsg(`🚀 Scalper deployed successfully to machine '${targetComputer}'!`);
        setShowDeployModal(false);
      } else {
        setErrorMsg(data.message || 'Failed to deploy strategy');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Error communicating with server for deployment');
    } finally {
      setIsDeploying(false);
    }
  };

  const stateStatus = scalperState?.status || 'IDLE';
  const diag = evalResult?.diagnostics;

  return (
    <div style={{
      backgroundColor: 'var(--app-card-bg, #111827)',
      border: '1px solid var(--app-card-border, #1f2937)',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      position: 'relative',
      fontFamily: 'inherit'
    }}>
      <DebugComponentBadge name="ScalperCard" />

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--app-card-border, #1f2937)',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: 'rgba(234, 179, 8, 0.15)',
            color: '#eab308'
          }}>
            <Zap size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--app-text, #f3f4f6)' }}>
              M1/M5 Liquidity Void & Reversal Scalper
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--app-text-muted, #9ca3af)' }}>
              Spike Exhaustion Detector & Confirmation Engine ({currentSymbol} • {currentTimeframe})
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            backgroundColor: stateStatus === 'ARMED'
              ? 'rgba(234, 179, 8, 0.2)'
              : stateStatus === 'TRIGGERED'
              ? 'rgba(34, 197, 94, 0.2)'
              : 'rgba(107, 114, 128, 0.2)',
            color: stateStatus === 'ARMED'
              ? '#eab308'
              : stateStatus === 'TRIGGERED'
              ? '#22c55e'
              : '#9ca3af',
            border: `1px solid ${
              stateStatus === 'ARMED' ? '#eab308' : stateStatus === 'TRIGGERED' ? '#22c55e' : '#4b5563'
            }`
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: stateStatus === 'ARMED' ? '#eab308' : stateStatus === 'TRIGGERED' ? '#22c55e' : '#9ca3af'
            }} />
            {stateStatus}
          </span>

          <button
            onClick={handleEvaluate}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Evaluating...' : 'Scan'}
          </button>

          <button
            onClick={handleRunBacktest}
            disabled={backtestLoading || candles.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#8b5cf6',
              color: '#ffffff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: (backtestLoading || candles.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (backtestLoading || candles.length === 0) ? 0.7 : 1
            }}
          >
            <Activity size={13} className={backtestLoading ? 'animate-spin' : ''} />
            {backtestLoading ? 'Backtesting...' : 'Run Scalper Backtest'}
          </button>

          <button
            onClick={() => setShowDeployModal(true)}
            disabled={isDeploying}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#10b981',
              color: '#ffffff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isDeploying ? 'not-allowed' : 'pointer',
              opacity: isDeploying ? 0.7 : 1
            }}
          >
            <Play size={13} fill="#ffffff" />
            Deploy to Machine
          </button>
        </div>
      </div>

      {/* Grid: Parameters & Realtime Evaluation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        
        {/* Detection Settings Panel */}
        <div style={{
          backgroundColor: 'var(--app-bg-secondary, #0b0f19)',
          border: '1px solid var(--app-card-border, #1f2937)',
          borderRadius: '8px',
          padding: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: 'var(--app-text, #f3f4f6)', fontSize: '13px', fontWeight: 600 }}>
            <Sliders size={15} color="#60a5fa" />
            <span>Detection & Risk Configuration</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--app-text-muted, #9ca3af)', marginBottom: '4px' }}>
                ATR Mult (≥ 2.5x)
              </label>
              <input
                type="number"
                step="0.1"
                value={atrMultiplier}
                onChange={(e) => setAtrMultiplier(parseFloat(e.target.value) || 2.5)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--app-input-bg, #111827)',
                  border: '1px solid var(--app-input-border, #374151)',
                  color: 'var(--app-text, #ffffff)',
                  fontSize: '12px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--app-text-muted, #9ca3af)', marginBottom: '4px' }}>
                Volume SMA Mult (≥ 3.0x)
              </label>
              <input
                type="number"
                step="0.5"
                value={volMultiplier}
                onChange={(e) => setVolMultiplier(parseFloat(e.target.value) || 3.0)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--app-input-bg, #111827)',
                  border: '1px solid var(--app-input-border, #374151)',
                  color: 'var(--app-text, #ffffff)',
                  fontSize: '12px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--app-text-muted, #9ca3af)', marginBottom: '4px' }}>
                Rejection Wick Min (%)
              </label>
              <input
                type="number"
                value={minWickRatio}
                onChange={(e) => setMinWickRatio(parseFloat(e.target.value) || 40)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--app-input-bg, #111827)',
                  border: '1px solid var(--app-input-border, #374151)',
                  color: 'var(--app-text, #ffffff)',
                  fontSize: '12px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--app-text-muted, #9ca3af)', marginBottom: '4px' }}>
                Spread Filter (Max Pips)
              </label>
              <input
                type="number"
                step="0.1"
                value={maxSpreadPips}
                onChange={(e) => setMaxSpreadPips(parseFloat(e.target.value) || 1.2)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--app-input-bg, #111827)',
                  border: '1px solid var(--app-input-border, #374151)',
                  color: 'var(--app-text, #ffffff)',
                  fontSize: '12px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--app-text-muted, #9ca3af)', marginBottom: '4px' }}>
                Account Balance ($)
              </label>
              <input
                type="number"
                value={accountBalance}
                onChange={(e) => setAccountBalance(parseFloat(e.target.value) || 1000)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--app-input-bg, #111827)',
                  border: '1px solid var(--app-input-border, #374151)',
                  color: 'var(--app-text, #ffffff)',
                  fontSize: '12px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--app-text-muted, #9ca3af)', marginBottom: '4px' }}>
                Risk Per Trade (%)
              </label>
              <input
                type="number"
                step="0.25"
                value={riskPercent}
                onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 1.0)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--app-input-bg, #111827)',
                  border: '1px solid var(--app-input-border, #374151)',
                  color: 'var(--app-text, #ffffff)',
                  fontSize: '12px'
                }}
              />
            </div>
          </div>
        </div>

        {/* Live Signal & Trigger Status */}
        <div style={{
          backgroundColor: 'var(--app-bg-secondary, #0b0f19)',
          border: '1px solid var(--app-card-border, #1f2937)',
          borderRadius: '8px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--app-text, #f3f4f6)', fontSize: '13px', fontWeight: 600 }}>
                <Target size={15} color="#22c55e" />
                <span>Execution Status</span>
              </div>
              {evalResult?.action && evalResult.action !== 'HOLD' && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: evalResult.action === 'BUY' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: evalResult.action === 'BUY' ? '#22c55e' : '#ef4444'
                }}>
                  {evalResult.action} SIGNAL
                </span>
              )}
            </div>

            {evalResult?.trade_params ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>LOT SIZE</span>
                  <strong style={{ color: '#60a5fa', fontSize: '14px' }}>{evalResult.trade_params.lot_size} Lots</strong>
                </div>
                <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>STOP LOSS</span>
                  <strong style={{ color: '#ef4444', fontSize: '14px' }}>{evalResult.trade_params.sl_price} ({evalResult.trade_params.sl_pips} pips)</strong>
                </div>
                <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>50% IMPULSE TP</span>
                  <strong style={{ color: '#eab308', fontSize: '14px' }}>{evalResult.trade_params.retracement_50?.toFixed(5)}</strong>
                </div>
                <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>MAX TIME HOLD</span>
                  <strong style={{ color: '#a855f7', fontSize: '14px' }}>8 min (Hard Stop)</strong>
                </div>
              </div>
            ) : (
              <div style={{
                padding: '24px 12px',
                textAlign: 'center',
                color: 'var(--app-text-muted, #9ca3af)',
                fontSize: '12px'
              }}>
                {evalResult?.reason ? (
                  <span style={{ color: '#f59e0b' }}>⚠️ {evalResult.reason}</span>
                ) : (
                  <span>Awaiting extreme M1 candle exhaustion spike on {currentSymbol}...</span>
                )}
              </div>
            )}
          </div>

          {/* Quick Rules Banner */}
          <div style={{
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--app-card-border, #1f2937)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--app-text-muted, #9ca3af)'
          }}>
            <span>🛡️ BE: +3 pips</span>
            <span>🎯 50% TP: Half Retracement</span>
            <span>⏱️ Hard Exit: 8 min</span>
          </div>
        </div>
      </div>

      {/* Real-time Diagnostics Telemetry */}
      {diag && (
        <div style={{
          backgroundColor: 'var(--app-bg-secondary, #0b0f19)',
          border: '1px solid var(--app-card-border, #1f2937)',
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: 'var(--app-text, #f3f4f6)', fontSize: '13px', fontWeight: 600 }}>
            <Activity size={15} color="#38bdf8" />
            <span>Latest M1 Candle Telemetry ({diag.symbol} • Close: {diag.candle_close})</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '11px' }}>
            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.4)', borderRadius: '6px' }}>
              <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>RANGE / ATR</span>
              <strong style={{ color: diag.range_atr_ratio >= diag.target_atr_ratio ? '#22c55e' : '#f59e0b', fontSize: '13px' }}>
                {diag.range_atr_ratio}x
              </strong>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block' }}>Target ≥ {diag.target_atr_ratio}x ({diag.range_pips}p / {diag.atr_14_pips}p)</span>
            </div>

            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.4)', borderRadius: '6px' }}>
              <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>VOLUME / SMA</span>
              <strong style={{ color: diag.vol_ratio >= diag.target_vol_ratio ? '#22c55e' : '#f59e0b', fontSize: '13px' }}>
                {diag.vol_ratio}x
              </strong>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block' }}>Target ≥ {diag.target_vol_ratio}x ({diag.candle_volume} / {diag.volume_sma_20})</span>
            </div>

            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.4)', borderRadius: '6px' }}>
              <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>UPPER WICK</span>
              <strong style={{ color: diag.upper_wick_pct >= diag.target_wick_pct ? '#22c55e' : '#9ca3af', fontSize: '13px' }}>
                {diag.upper_wick_pct}%
              </strong>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block' }}>Target ≥ {diag.target_wick_pct}% (Bearish)</span>
            </div>

            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.4)', borderRadius: '6px' }}>
              <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>LOWER WICK</span>
              <strong style={{ color: diag.lower_wick_pct >= diag.target_wick_pct ? '#22c55e' : '#9ca3af', fontSize: '13px' }}>
                {diag.lower_wick_pct}%
              </strong>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block' }}>Target ≥ {diag.target_wick_pct}% (Bullish)</span>
            </div>

            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.4)', borderRadius: '6px' }}>
              <span style={{ color: 'var(--app-text-muted, #9ca3af)', display: 'block', fontSize: '10px' }}>SPREAD</span>
              <strong style={{ color: diag.spread_pips <= maxSpreadPips ? '#22c55e' : '#ef4444', fontSize: '13px' }}>
                {diag.spread_pips} pips
              </strong>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block' }}>Max allowed: {maxSpreadPips}p</span>
            </div>
          </div>
        </div>
      )}

      {/* Backtest Results & Triggered Spikes Display */}
      {backtestResult && (
        <div style={{
          backgroundColor: 'var(--app-bg-secondary, #0b0f19)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={16} color="#a78bfa" />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f3f4f6' }}>
                Scalper Backtest Summary ({currentSymbol})
              </h4>
            </div>
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: (backtestResult.summary?.net_profit >= 0) ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: (backtestResult.summary?.net_profit >= 0) ? '#22c55e' : '#ef4444'
            }}>
              Net: ${backtestResult.summary?.net_profit ?? 0} ({backtestResult.summary?.pnl_pct ?? 0}%)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
              <span style={{ color: '#9ca3af', fontSize: '10px', display: 'block' }}>TOTAL TRADES</span>
              <strong style={{ color: '#ffffff', fontSize: '13px' }}>{backtestResult.summary?.total_trades || 0}</strong>
            </div>
            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
              <span style={{ color: '#9ca3af', fontSize: '10px', display: 'block' }}>WIN RATE</span>
              <strong style={{ color: '#22c55e', fontSize: '13px' }}>{backtestResult.summary?.win_rate || 0}%</strong>
            </div>
            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
              <span style={{ color: '#9ca3af', fontSize: '10px', display: 'block' }}>WINS / LOSSES</span>
              <strong style={{ color: '#f3f4f6', fontSize: '13px' }}>{backtestResult.summary?.wins || 0}W / {backtestResult.summary?.losses || 0}L</strong>
            </div>
            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
              <span style={{ color: '#9ca3af', fontSize: '10px', display: 'block' }}>SPIKES DETECTED</span>
              <strong style={{ color: '#eab308', fontSize: '13px' }}>{backtestResult.summary?.triggered_spikes_count || 0}</strong>
            </div>
            <div style={{ padding: '8px', backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
              <span style={{ color: '#9ca3af', fontSize: '10px', display: 'block' }}>FINAL BALANCE</span>
              <strong style={{ color: '#60a5fa', fontSize: '13px' }}>${backtestResult.summary?.final_balance || accountBalance}</strong>
            </div>
          </div>

          {/* Triggered Spike Candles Table */}
          {backtestResult.triggered_candles && backtestResult.triggered_candles.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🎯 Detected Trigger Spike Candles ({backtestResult.triggered_candles.length} Saved)</span>
              </div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #1f2937', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#111827', color: '#9ca3af', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '6px 8px' }}>Time</th>
                      <th style={{ padding: '6px 8px' }}>Type</th>
                      <th style={{ padding: '6px 8px' }}>High</th>
                      <th style={{ padding: '6px 8px' }}>Low</th>
                      <th style={{ padding: '6px 8px' }}>Close</th>
                      <th style={{ padding: '6px 8px' }}>50% Retrace Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtestResult.triggered_candles.map((tc: any, idx: number) => {
                      const dt = new Date((tc.time || tc.timestamp || 0) * 1000);
                      const timeStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #1f2937', backgroundColor: idx % 2 === 0 ? 'rgba(17, 24, 39, 0.4)' : 'transparent' }}>
                          <td style={{ padding: '6px 8px', color: '#f3f4f6' }}>{timeStr}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: tc.spike_direction === 'BUY' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                              color: tc.spike_direction === 'BUY' ? '#22c55e' : '#ef4444'
                            }}>
                              {tc.spike_direction || 'SPIKE'}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', color: '#9ca3af' }}>{tc.high}</td>
                          <td style={{ padding: '6px 8px', color: '#9ca3af' }}>{tc.low}</td>
                          <td style={{ padding: '6px 8px', color: '#f3f4f6' }}>{tc.close}</td>
                          <td style={{ padding: '6px 8px', color: '#eab308', fontWeight: 600 }}>{tc.retracement_50?.toFixed(5) || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{
          marginTop: '12px',
          padding: '10px 12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: '#ef4444',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div style={{
          marginTop: '12px',
          padding: '10px 12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          color: '#10b981',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={15} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Machine + Account Deploy Modal */}
      {showDeployModal && (
        <DeployModal
          symbol={currentSymbol}
          timeframe={currentTimeframe || 'M1'}
          slVal="2.0"
          slType="pips"
          rr="2.0"
          size="1.0"
          useRiskSizing={true}
          riskPct={riskPercent.toString()}
          initialName={`M1 Scalper [${currentSymbol}]`}
          onClose={() => setShowDeployModal(false)}
          onConfirm={(targetComputer, targets, name) => {
            handleDeployConfirm(targetComputer, targets, name);
          }}
        />
      )}
    </div>
  );
};

export default ScalperCard;
