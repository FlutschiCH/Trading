import React, { useState } from 'react';
import { Send, Zap, Bell, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../api';
import { AccountSelector } from './account_selector';
import { useAccountsStore } from '../services/accountsStore';

interface LastTradeExecutionProps {
  symbol: string;
  timeframe: string;
  backtestResults: any;
  defaultSize?: string;
  defaultSL?: string;
  defaultRR?: string;
}

export const LastTradeExecution: React.FC<LastTradeExecutionProps> = ({
  symbol,
  timeframe,
  backtestResults,
  defaultSize = '0.01',
  defaultSL = '0.0015',
  defaultRR = '2.0',
}) => {
  const { accounts } = useAccountsStore();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [executionMode, setExecutionMode] = useState<'both' | 'discord' | 'live'>('both');
  const [customVolume, setCustomVolume] = useState<string>(defaultSize);
  const [customComment, setCustomComment] = useState<string>('Backtest Signal Trigger');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Derive the last/most recent trade from backtest results
  const rawTrades = backtestResults?.trades || [];
  const lastTrade = rawTrades.length > 0 ? rawTrades[rawTrades.length - 1] : null;

  const handleExecute = async () => {
    if (!lastTrade) {
      setStatusMessage({ type: 'error', text: 'No backtest trade found to execute.' });
      return;
    }

    const tradeSide = (lastTrade.type || lastTrade.side || 'BUY').toUpperCase();
    const entryPrice = parseFloat(lastTrade.entryPrice || lastTrade.price || '0');
    const stopLoss = lastTrade.stopLoss ? parseFloat(lastTrade.stopLoss) : (lastTrade.sl ? parseFloat(lastTrade.sl) : undefined);
    const takeProfit = lastTrade.takeProfit ? parseFloat(lastTrade.takeProfit) : (lastTrade.tp ? parseFloat(lastTrade.tp) : undefined);
    const vol = parseFloat(customVolume) || parseFloat(defaultSize) || 0.01;

    setLoading(true);
    setStatusMessage(null);

    const results: string[] = [];
    let hasError = false;

    // 1. Send Discord Notification if requested
    if (executionMode === 'discord' || executionMode === 'both') {
      try {
        const discordPayload = {
          message: `🚨 **Manual Signal Trigger**\n` +
            `• **Symbol:** \`${symbol.toUpperCase()}\` (${timeframe})\n` +
            `• **Action:** \`${tradeSide}\`\n` +
            `• **Entry Price:** \`${entryPrice ? entryPrice.toFixed(5) : 'Market'}\`\n` +
            `• **Stop Loss:** \`${stopLoss ? stopLoss.toFixed(5) : 'None'}\`\n` +
            `• **Take Profit:** \`${takeProfit ? takeProfit.toFixed(5) : 'None'}\`\n` +
            `• **Volume:** \`${vol}\`\n` +
            `• **Note:** ${customComment || 'Triggered from Backtest Last Trade Execution'}`
        };

        const res = await fetch(`${API_BASE_URL}/notification/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discordPayload)
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          results.push('Discord alert dispatched');
        } else {
          hasError = true;
          results.push(`Discord error: ${data.message || res.statusText}`);
        }
      } catch (err: any) {
        hasError = true;
        results.push(`Discord request failed: ${err.message}`);
      }
    }

    // 2. Send Live Order if requested
    if (executionMode === 'live' || executionMode === 'both') {
      try {
        const selectedAccount = accounts.find((a) => String(a.account_id) === String(selectedAccountId));
        const brokerName = selectedAccount?.broker_type || 'ctrader';

        const orderPayload: any = {
          symbol: symbol.toUpperCase(),
          order_type: tradeSide.toLowerCase(),
          volume: vol,
          broker: brokerName,
          account_id: selectedAccountId || undefined,
          price: entryPrice > 0 ? entryPrice : undefined,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          magic: 999111,
          comment: customComment
        };

        const res = await fetch(`${API_BASE_URL}/trade/order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload)
        });
        const data = await res.json();
        if (res.ok && (data.status === 'success' || data.success || !data.error)) {
          results.push(`Live trade executed (${brokerName.toUpperCase()} ${tradeSide})`);
        } else {
          hasError = true;
          results.push(`Live order failed: ${data.message || data.error || 'Check broker connection'}`);
        }
      } catch (err: any) {
        hasError = true;
        results.push(`Live order request failed: ${err.message}`);
      }
    }

    setLoading(false);
    setStatusMessage({
      type: hasError ? 'error' : 'success',
      text: results.join(' | ')
    });
  };

  if (!lastTrade) {
    return (
      <div style={{
        padding: '12px',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        color: '#94a3b8',
        fontSize: '11px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <AlertCircle size={14} color="#64748b" />
        <span>Run a backtest first to preview and trigger the last identified trade signal.</span>
      </div>
    );
  }

  const tradeSide = (lastTrade.type || lastTrade.side || 'BUY').toUpperCase();
  const isBuy = tradeSide === 'BUY';
  const entryPrice = parseFloat(lastTrade.entryPrice || lastTrade.price || '0');
  const stopLoss = lastTrade.stopLoss || lastTrade.sl;
  const takeProfit = lastTrade.takeProfit || lastTrade.tp;

  return (
    <div style={{
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid rgba(56, 189, 248, 0.25)',
      borderRadius: '8px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} color="#38bdf8" />
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Trigger Last Trade Execution
          </span>
        </div>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '4px',
          backgroundColor: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: isBuy ? '#34d399' : '#f87171',
          border: `1px solid ${isBuy ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
        }}>
          LAST: {tradeSide} @ {entryPrice > 0 ? entryPrice.toFixed(5) : 'N/A'}
        </span>
      </div>

      {/* Trade Parameters Summary Card */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: '6px',
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
        padding: '8px 10px',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        fontSize: '10px'
      }}>
        <div>
          <span style={{ color: '#64748b', display: 'block' }}>Symbol</span>
          <span style={{ color: '#f8fafc', fontWeight: 600 }}>{symbol.toUpperCase()} ({timeframe})</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block' }}>Entry Price</span>
          <span style={{ color: '#f8fafc', fontWeight: 600 }}>{entryPrice > 0 ? entryPrice.toFixed(5) : 'Market'}</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block' }}>Stop Loss</span>
          <span style={{ color: stopLoss ? '#f87171' : '#64748b', fontWeight: 600 }}>{stopLoss ? Number(stopLoss).toFixed(5) : 'None'}</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block' }}>Take Profit</span>
          <span style={{ color: takeProfit ? '#34d399' : '#64748b', fontWeight: 600 }}>{takeProfit ? Number(takeProfit).toFixed(5) : 'None'}</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block' }}>Signal Time</span>
          <span style={{ color: '#cbd5e1' }}>{lastTrade.time || (lastTrade.entryTimestamp ? new Date(lastTrade.entryTimestamp * 1000).toLocaleTimeString() : 'Recent')}</span>
        </div>
      </div>

      {/* Mode Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>EXECUTION TARGET</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setExecutionMode('both')}
            style={{
              padding: '6px 8px',
              fontSize: '10px',
              fontWeight: 600,
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              border: executionMode === 'both' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: executionMode === 'both' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.4)',
              color: executionMode === 'both' ? '#38bdf8' : '#94a3b8',
              transition: 'all 0.15s'
            }}
          >
            <Zap size={12} />
            Both (Discord + Live)
          </button>
          <button
            type="button"
            onClick={() => setExecutionMode('discord')}
            style={{
              padding: '6px 8px',
              fontSize: '10px',
              fontWeight: 600,
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              border: executionMode === 'discord' ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: executionMode === 'discord' ? 'rgba(129, 140, 248, 0.2)' : 'rgba(30, 41, 59, 0.4)',
              color: executionMode === 'discord' ? '#818cf8' : '#94a3b8',
              transition: 'all 0.15s'
            }}
          >
            <Bell size={12} />
            Discord Only
          </button>
          <button
            type="button"
            onClick={() => setExecutionMode('live')}
            style={{
              padding: '6px 8px',
              fontSize: '10px',
              fontWeight: 600,
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              border: executionMode === 'live' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: executionMode === 'live' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.4)',
              color: executionMode === 'live' ? '#34d399' : '#94a3b8',
              transition: 'all 0.15s'
            }}
          >
            <Send size={12} />
            Live Trade Only
          </button>
        </div>
      </div>

      {/* Target Account & Parameters */}
      {(executionMode === 'live' || executionMode === 'both') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>BROKER / ACCOUNT</label>
            <AccountSelector
              value={selectedAccountId}
              onChange={(id) => setSelectedAccountId(id)}
              placeholder="Default Broker Account"
              style={{ backgroundColor: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>VOLUME (LOTS / QTY)</label>
            <input
              type="number"
              value={customVolume}
              onChange={(e) => setCustomVolume(e.target.value)}
              step="0.01"
              min="0.01"
              style={{
                width: '100%',
                backgroundColor: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>
        </div>
      )}

      {/* Action Button & Status Output */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
        <button
          type="button"
          onClick={handleExecute}
          disabled={loading}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 14px',
            backgroundColor: isBuy ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)',
            border: `1px solid ${isBuy ? '#10b981' : '#ef4444'}`,
            borderRadius: '6px',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'all 0.15s'
          }}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Executing Signal...</span>
            </>
          ) : (
            <>
              <Send size={14} />
              <span>
                Trigger {tradeSide} {executionMode === 'both' ? '(Discord + Live)' : (executionMode === 'discord' ? '(Discord Alert)' : '(Live Order)')}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Feedback Toast / Alert */}
      {statusMessage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          backgroundColor: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
          color: statusMessage.type === 'success' ? '#34d399' : '#f87171'
        }}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
};

export default LastTradeExecution;
