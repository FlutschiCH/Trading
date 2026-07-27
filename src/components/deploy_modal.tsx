import React, { useEffect, useState } from 'react';
import { X, Server, ShieldAlert, Check, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../api';

interface HostStatus {
  name: string;
  url: string;
  type: string;
  online: boolean;
  loading: boolean;
  computerName?: string;
  error?: string;
}

interface DeployModalProps {
  symbol: string;
  timeframe: string;
  slVal: string;
  slType: string;
  rr: string;
  size: string;
  useRiskSizing: boolean;
  riskPct: string;
  initialTargetComputer?: string;
  initialTargets?: Array<{ broker: string; account_id: string }>;
  initialName?: string;
  initialDateRangeOption?: string;
  initialCustomFrom?: string;
  initialCustomTo?: string;
  initialCandleLimit?: number;
  onClose: () => void;
  onConfirm: (
    targetComputer: string,
    targets: Array<{ broker: string; account_id: string }>,
    name: string,
    dateRangeOption: string,
    customFrom: string,
    customTo: string,
    candleLimit: number
  ) => void;
}

export default function DeployModal({
  symbol,
  timeframe,
  slVal,
  slType,
  rr,
  size,
  useRiskSizing,
  riskPct,
  initialTargetComputer = 'All',
  initialTargets = [],
  initialName = '',
  initialDateRangeOption = 'last_candles',
  initialCustomFrom = '',
  initialCustomTo = '',
  initialCandleLimit = 1000,
  onClose,
  onConfirm,
}: DeployModalProps) {
  const [hosts, setHosts] = useState<HostStatus[]>([
    { name: 'Local Dev Machine', url: 'http://localhost:8751', type: 'local', online: false, loading: true },
    { name: 'Laptop Server (Remote)', url: 'http://89.217.138.51:8751', type: 'laptop', online: false, loading: true },
    { name: 'Railway Cloud Container', url: 'https://trading-production-cb87.up.railway.app', type: 'railway', online: false, loading: true },
  ]);

  const [strategyName, setStrategyName] = useState<string>(initialName);

  const [selectedTarget, setSelectedTarget] = useState<string>(() => {
    if (initialTargetComputer !== 'All' && !['local', 'laptop', 'railway'].includes(initialTargetComputer.toLowerCase())) {
      return 'Custom';
    }
    return initialTargetComputer;
  });
  const [customTarget, setCustomTarget] = useState<string>(() => {
    if (initialTargetComputer !== 'All' && !['local', 'laptop', 'railway'].includes(initialTargetComputer.toLowerCase())) {
      return initialTargetComputer;
    }
    return '';
  });

  const [dateRangeOption, setDateRangeOption] = useState<string>(initialDateRangeOption);
  const [customFrom, setCustomFrom] = useState<string>(initialCustomFrom);
  const [customTo, setCustomTo] = useState<string>(initialCustomTo);
  const [candleLimit, setCandleLimit] = useState<number>(initialCandleLimit);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(() => {
    if (initialTargets && initialTargets.length > 0) {
      return initialTargets.map(t => t.account_id);
    }
    return [];
  });

  useEffect(() => {
    if (initialTargets && initialTargets.length > 0) {
      setSelectedAccounts(initialTargets.map(t => t.account_id));
    }
  }, [initialTargets]);

  useEffect(() => {
    // Attempt loading from localStorage cache first
    let cachedList: any[] = [];
    try {
      const saved = localStorage.getItem('wyckoff_accounts');
      if (saved) {
        cachedList = JSON.parse(saved);
        setAccounts(cachedList);
        
        // Auto select active account or first account if we don't have initialTargets
        if (!initialTargets || initialTargets.length === 0) {
          const active = cachedList.find((a: any) => a.is_active || a.active);
          if (active) {
            setSelectedAccounts([active.account_id]);
          } else if (cachedList.length > 0) {
            setSelectedAccounts([cachedList[0].account_id]);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse cached accounts:", e);
    }

    const fetchAccounts = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/accounts`);
        if (res.ok) {
          const data = await res.json();
          // The API returns either { data: [...] } or { accounts: [...] } or direct array
          const list = data.data || data.accounts || (Array.isArray(data) ? data : []);
          setAccounts(list);
          localStorage.setItem('wyckoff_accounts', JSON.stringify(list));
          // Auto select active account or first account if we don't have initialTargets
          if (!initialTargets || initialTargets.length === 0) {
            const active = list.find((a: any) => a.is_active || a.active);
            if (active) {
              setSelectedAccounts([active.account_id]);
            } else if (list.length > 0) {
              setSelectedAccounts([list[0].account_id]);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching accounts', err);
      }
    };
    fetchAccounts();
  }, []);

  const checkHostStatus = async (hostIndex: number) => {
    const host = hosts[hostIndex];
    setHosts(prev => prev.map((h, i) => i === hostIndex ? { ...h, loading: true } : h));
    try {
      const response = await fetch(`${host.url}/api/system/status?_cb=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
      });
      if (response.ok) {
        const data = await response.json();
        setHosts(prev => prev.map((h, i) => i === hostIndex ? {
          ...h,
          online: true,
          loading: false,
          computerName: data.computer_name || 'Unknown',
          error: undefined
        } : h));
      } else if (response.status === 404) {
        setHosts(prev => prev.map((h, i) => i === hostIndex ? {
          ...h,
          online: true,
          loading: false,
          computerName: 'Outdated Version',
          error: 'Outdated endpoint (404)'
        } : h));
      } else {
        throw new Error();
      }
    } catch {
      setHosts(prev => prev.map((h, i) => i === hostIndex ? {
        ...h,
        online: false,
        loading: false,
        computerName: undefined,
        error: 'Offline'
      } : h));
    }
  };

  const checkAllHosts = () => {
    hosts.forEach((_, idx) => checkHostStatus(idx));
  };

  useEffect(() => {
    checkAllHosts();
  }, []);

  const handleConfirmDeploy = () => {
    try {
      console.log('handleConfirmDeploy triggered', { selectedTarget, customTarget, selectedAccounts, strategyName });
      const finalTarget = selectedTarget === 'Custom' ? customTarget.trim() : selectedTarget;
      if (!finalTarget) {
        alert('Please specify a target computer.');
        return;
      }
      if (selectedAccounts.length === 0) {
        alert('Please select at least one execution account.');
        return;
      }

      // Map selected accounts to target objects { broker, account_id }
      const targets = selectedAccounts.map(id => {
        const acc = accounts.find(a => a.account_id === id);
        return {
          broker: acc?.broker_type || 'metatrader',
          account_id: id
        };
      });

      console.log('Calling onConfirm with:', { finalTarget, targets, name: strategyName.trim(), dateRangeOption, customFrom, customTo, candleLimit });
      onConfirm(finalTarget, targets, strategyName.trim(), dateRangeOption, customFrom, customTo, candleLimit);
    } catch (err) {
      console.error('Error inside handleConfirmDeploy:', err);
      alert('Error confirming deployment: ' + err);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 7, 12, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 99999,
    }}>
      <div style={{
        backgroundColor: '#0f172a',
        border: '1.5px solid #334155',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        borderRadius: '16px',
        width: '90%',
        maxWidth: '540px',
        padding: '24px',
        position: 'relative',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#f1f5f9' }}>
            🚀 Deploy Strategy to Live Execution
          </h2>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Verify settings and select the targeting server host.
          </span>
        </div>

        {/* Strategy Name Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Strategy Name
          </label>
          <input
            type="text"
            placeholder="E.g., Wyckoff EURUSD 15m Trend Follower..."
            value={strategyName}
            onChange={(e) => setStrategyName(e.target.value)}
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Strategy Summary Card */}
        <div style={{
          backgroundColor: 'rgba(30, 41, 59, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          fontSize: '12px'
        }}>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>SYMBOL</span>
            <span style={{ color: '#f1f5f9', fontWeight: 'bold' }}>{symbol}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>TIMEFRAME</span>
            <span style={{ color: '#f1f5f9', fontWeight: 'bold' }}>{timeframe}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>RISK / REWARD</span>
            <span style={{ color: '#f1f5f9', fontWeight: 'bold' }}>{rr} R</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>STOP LOSS</span>
            <span style={{ color: '#f1f5f9', fontWeight: 'bold' }}>{slVal} ({slType})</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>TRADE SIZE</span>
            <span style={{ color: '#f1f5f9', fontWeight: 'bold' }}>
              {useRiskSizing ? `${riskPct}% Risk` : `${size} Lot`}
            </span>
          </div>
        </div>

        {/* Accounts Multi-Select */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Select Execution Accounts / Brokers
          </label>
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '12px',
            maxHeight: '120px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {accounts.map(acc => {
              const isChecked = selectedAccounts.includes(acc.account_id);
              return (
                <label key={acc.account_id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAccounts(prev => [...prev, acc.account_id]);
                      } else {
                        setSelectedAccounts(prev => prev.filter(id => id !== acc.account_id));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>
                    <strong style={{ color: acc.broker_type === 'ctrader' ? '#10b981' : '#3b82f6' }}>
                      {acc.broker_type === 'ctrader' ? 'cTrader' : 'MT5'}
                    </strong>{' '}
                    - {acc.name} ({acc.account_id})
                  </span>
                </label>
              );
            })}
            {accounts.length === 0 && (
              <span style={{ fontSize: '12px', color: '#64748b' }}>No accounts registered.</span>
            )}
          </div>
        </div>

        {/* Server Status Checker */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Target Host Environments
            </span>
            <button
              onClick={checkAllHosts}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {hosts.map(host => (
              <div
                key={host.name}
                onClick={() => {
                  if (host.online || host.name.includes("Local")) {
                    setSelectedTarget(host.computerName || host.name);
                  }
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'rgba(15, 23, 42, 0.4)',
                  border: `1.5px solid ${selectedTarget === (host.computerName || host.name) ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)'}`,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Server size={14} style={{ color: host.online ? '#10b981' : '#ef4444' }} />
                  <div>
                    <span style={{ fontWeight: '500', display: 'block' }}>{host.name}</span>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>
                      {host.computerName ? `OS Name: ${host.computerName}` : host.url}
                    </span>
                  </div>
                </div>

                <span style={{
                  fontSize: '10px',
                  fontWeight: 'bold',
                  color: host.online ? '#10b981' : '#ef4444',
                  backgroundColor: host.online ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {host.online ? 'Online' : 'Offline'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Target Picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Assign Strategy Execution Target
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={['All', 'Custom'].includes(selectedTarget) ? selectedTarget : (hosts.some(h => h.computerName === selectedTarget) ? selectedTarget : 'Custom')}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'Custom') {
                  setSelectedTarget('Custom');
                } else {
                  setSelectedTarget(val);
                }
              }}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '12px',
                padding: '8px 12px',
                flex: 1,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="All">All Computers (Load Balanced / All Active)</option>
              {hosts.filter(h => h.computerName).map(h => (
                <option key={h.computerName} value={h.computerName}>
                  Only on: {h.computerName} ({h.name})
                </option>
              ))}
              <option value="Custom">Custom Computer Name...</option>
            </select>

            {selectedTarget === 'Custom' && (
              <input
                type="text"
                placeholder="Enter Hostname..."
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  padding: '8px 12px',
                  flex: 1,
                  outline: 'none'
                }}
              />
            )}
          </div>
        </div>

        {/* Backtest / History Setup (Warm-up Settings) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Backtest Date Range (Live Warm-up Setup)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>Date Range</span>
              <select
                value={dateRangeOption}
                onChange={(e) => setDateRangeOption(e.target.value)}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="last_candles">Last N Candles Only</option>
                <option value="this_week">This Week</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
                <option value="from_start_date">From Start Date</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>Candle Limit</span>
              <input
                type="number"
                value={candleLimit}
                onChange={(e) => setCandleLimit(parseInt(e.target.value) || 1000)}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  padding: '6px 10px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {(dateRangeOption === 'custom' || dateRangeOption === 'from_start_date') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#64748b' }}>From</span>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    padding: '6px 10px',
                    outline: 'none'
                  }}
                />
              </div>

              {dateRangeOption === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>To</span>
                  <input
                    type="datetime-local"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      padding: '6px 10px',
                      outline: 'none'
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              backgroundColor: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            Cancel
          </button>
          
          <button
            onClick={handleConfirmDeploy}
            style={{
              flex: 2,
              backgroundColor: '#ef4444',
              border: 'none',
              borderRadius: '8px',
              padding: '10px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
          >
            Confirm & Deploy Live
          </button>
        </div>
      </div>
    </div>
  );
}
