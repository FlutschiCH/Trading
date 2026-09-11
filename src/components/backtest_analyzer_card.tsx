import React, { useState, useEffect } from 'react';
import { Copy, Check, Sparkles, RefreshCw, Layers, TrendingUp, TrendingDown, Award, AlertTriangle, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '../api';
import DebugComponentBadge from './debug_component_badge';

interface BacktestAnalyzerCardProps {
  currentBacktestResults?: any;
  currentSymbol?: string;
  currentTimeframe?: string;
}

export const BacktestAnalyzerCard: React.FC<BacktestAnalyzerCardProps> = ({
  currentBacktestResults,
  currentSymbol,
  currentTimeframe
}) => {
  const [savedRuns, setSavedRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('current');
  const [loading, setLoading] = useState<boolean>(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fetchSavedRuns = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/backtest/saved`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setSavedRuns(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch saved backtests for analyzer:', e);
    }
  };

  useEffect(() => {
    fetchSavedRuns();
  }, []);

  const runAnalysis = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      let bodyPayload: any = {};
      if (selectedRunId === 'current') {
        if (!currentBacktestResults) {
          setErrorMsg('No active backtest results in memory. Run a backtest or choose a saved run below.');
          setLoading(false);
          return;
        }
        bodyPayload = {
          payload: {
            symbol: currentSymbol || currentBacktestResults.settings?.symbol,
            timeframe: currentTimeframe || currentBacktestResults.settings?.timeframe,
            settings: currentBacktestResults.settings || {},
            metrics: currentBacktestResults.metrics || {},
            trades: currentBacktestResults.completed_trades_raw || currentBacktestResults.trades || []
          }
        };
      } else {
        bodyPayload = {
          backtest_id: selectedRunId
        };
      }

      const res = await fetch(`${API_BASE_URL}/api/backtest-analyzer/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (data.status === 'error') {
        setErrorMsg(data.message || 'Failed to analyze backtest');
      } else {
        setAnalysisData(data);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error analyzing backtest');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRunId === 'current') {
      if (currentBacktestResults) {
        runAnalysis();
      }
    } else {
      runAnalysis();
    }
  }, [selectedRunId, currentBacktestResults]);

  const handleCopyPrompt = () => {
    if (!analysisData || !analysisData.prompt_for_ai) return;
    navigator.clipboard.writeText(analysisData.prompt_for_ai);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const summary = analysisData?.summary;

  return (
    <div style={{
      backgroundColor: 'var(--app-card-bg, #111827)',
      border: '1px solid var(--app-card-border, #1f2937)',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    }}>
      {/* Card Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '14px',
        paddingBottom: '10px',
        borderBottom: '1px solid var(--app-card-border, #1f2937)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Sparkles style={{ width: '18px', height: '18px', color: '#a855f7' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--app-text, #f3f4f6)' }}>
            Backtest Analyzer (AI Prompt Generator)
          </span>
          <DebugComponentBadge name="BacktestAnalyzerCard" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers style={{ width: '14px', height: '14px', color: '#94a3b8' }} />
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              style={{
                backgroundColor: 'var(--app-input-bg, #0b0f19)',
                border: '1px solid var(--app-input-border, #1f2937)',
                borderRadius: '6px',
                color: 'var(--app-text, #ffffff)',
                padding: '4px 8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer',
                maxWidth: '220px'
              }}
            >
              <option value="current">Current In-Memory Backtest</option>
              {savedRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.symbol} ({r.timeframe}) - {r.trades_cnt}T | ${r.net_pnl} | {r.win_rate}% WR
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => { fetchSavedRuns(); runAnalysis(); }}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <RefreshCw style={{ width: '12px', height: '12px', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Analyze</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: '#f87171',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <AlertTriangle style={{ width: '14px', height: '14px' }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary KPI Badges */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))',
          gap: '8px',
          marginBottom: '14px'
        }}>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Target & TF</span>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>
              {summary.symbol} ({summary.timeframe})
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Total Trades</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>
              {summary.total_trades} ({summary.total_wins}W / {summary.total_losses}L)
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Win Rate</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: summary.win_rate >= 50 ? '#10b981' : '#f87171' }}>
              {summary.win_rate}%
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Net PnL</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: summary.net_pnl >= 0 ? '#10b981' : '#f87171' }}>
              {summary.net_pnl >= 0 ? `+$${summary.net_pnl}` : `-$${Math.abs(summary.net_pnl)}`}
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Profit Factor</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: summary.profit_factor >= 1.5 ? '#10b981' : '#f59e0b' }}>
              {summary.profit_factor}
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Long / Short WR</span>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#e2e8f0' }}>
              {summary.long_performance?.win_rate ?? 0}% / {summary.short_performance?.win_rate ?? 0}%
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Max Drawdown</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ef4444' }}>
              ${summary.max_drawdown_dollar ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* AI Assistant Quick Launcher Links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '12px' }}>
        <a
          href="https://gemini.google.com/"
          target="_blank"
          rel="noreferrer"
          style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            color: '#60a5fa',
            padding: '6px 8px',
            borderRadius: '6px',
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px'
          }}
        >
          <span>✨ Gemini</span>
          <ExternalLink style={{ width: '11px', height: '11px' }} />
        </a>
        <a
          href="https://chatgpt.com/"
          target="_blank"
          rel="noreferrer"
          style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            color: '#10b981',
            padding: '6px 8px',
            borderRadius: '6px',
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px'
          }}
        >
          <span>💬 ChatGPT</span>
          <ExternalLink style={{ width: '11px', height: '11px' }} />
        </a>
        <a
          href="https://grok.com/"
          target="_blank"
          rel="noreferrer"
          style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            color: '#f59e0b',
            padding: '6px 8px',
            borderRadius: '6px',
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px'
          }}
        >
          <span>🚀 Grok</span>
          <ExternalLink style={{ width: '11px', height: '11px' }} />
        </a>
        <a
          href="https://claude.ai/"
          target="_blank"
          rel="noreferrer"
          style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            color: '#d97706',
            padding: '6px 8px',
            borderRadius: '6px',
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px'
          }}
        >
          <span>🧠 Claude</span>
          <ExternalLink style={{ width: '11px', height: '11px' }} />
        </a>
      </div>

      {/* LLM JSON Textarea Output with 1-Click Copy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
            Formatted Backtest AI Prompt JSON
          </label>
          <button
            onClick={handleCopyPrompt}
            disabled={!analysisData}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: copied ? '#059669' : '#8b5cf6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: analysisData ? 'pointer' : 'not-allowed',
              opacity: analysisData ? 1 : 0.6,
              transition: 'background-color 0.2s ease'
            }}
          >
            {copied ? <Check style={{ width: '13px', height: '13px' }} /> : <Copy style={{ width: '13px', height: '13px' }} />}
            <span>{copied ? 'Copied Prompt!' : 'Copy Backtest Prompt for AI'}</span>
          </button>
        </div>

        <textarea
          readOnly
          value={analysisData?.prompt_for_ai || (loading ? 'Analyzing single backtest simulation run...' : 'No backtest analysis loaded.')}
          rows={11}
          style={{
            width: '100%',
            backgroundColor: '#090d16',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            color: '#c084fc',
            fontFamily: 'monospace',
            fontSize: '11px',
            padding: '12px',
            outline: 'none',
            resize: 'vertical'
          }}
        />
      </div>
    </div>
  );
};

export default BacktestAnalyzerCard;
