import React, { useEffect, useState } from 'react';
import { X, Server, ShieldAlert, Check, RefreshCw } from 'lucide-react';

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
  onClose: () => void;
  onConfirm: (targetComputer: string) => void;
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
  onClose,
  onConfirm,
}: DeployModalProps) {
  const [hosts, setHosts] = useState<HostStatus[]>([
    { name: 'Local Dev Machine', url: 'http://localhost:8751', type: 'local', online: false, loading: true },
    { name: 'Laptop Server (Remote)', url: 'http://89.217.138.51:8751', type: 'laptop', online: false, loading: true },
    { name: 'Railway Cloud Container', url: 'https://trading-production-cb87.up.railway.app', type: 'railway', online: false, loading: true },
  ]);

  const [selectedTarget, setSelectedTarget] = useState<string>('All');
  const [customTarget, setCustomTarget] = useState<string>('');

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
    const finalTarget = selectedTarget === 'Custom' ? customTarget.trim() : selectedTarget;
    if (!finalTarget) {
      alert('Please specify a target computer.');
      return;
    }
    onConfirm(finalTarget);
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
              value={hosts.some(h => h.computerName === selectedTarget) ? selectedTarget : (selectedTarget === 'All' ? 'All' : 'Custom')}
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
              {hosts.filter(h => h.online && h.computerName).map(h => (
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
