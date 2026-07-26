import React, { useEffect, useState } from 'react';
import { Server, RefreshCw, ArrowLeft, Activity, ShieldAlert, Cpu } from 'lucide-react';

interface HostStatus {
  name: string;
  url: string;
  type: 'local' | 'laptop' | 'railway';
  online: boolean;
  loading: boolean;
  computerName?: string;
  os?: string;
  latency?: number;
  error?: string;
}

interface ComputerManagerProps {
  setView: (view: 'dashboard' | 'mappings' | 'trades' | 'computers') => void;
}

export default function ComputerManager({ setView }: ComputerManagerProps) {
  const [hosts, setHosts] = useState<HostStatus[]>([
    {
      name: 'Local Dev Machine',
      url: 'http://localhost:8751',
      type: 'local',
      online: false,
      loading: true,
    },
    {
      name: 'Laptop Server (Remote)',
      url: 'http://89.217.138.51:8751',
      type: 'laptop',
      online: false,
      loading: true,
    },
    {
      name: 'Railway Cloud Container',
      url: 'https://trading-production-cb87.up.railway.app',
      type: 'railway',
      online: false,
      loading: true,
    },
  ]);

  const checkHostStatus = async (hostIndex: number) => {
    const host = hosts[hostIndex];
    setHosts(prev => prev.map((h, i) => i === hostIndex ? { ...h, loading: true } : h));
    
    const startTime = performance.now();
    try {
      // Add a cache-buster to prevent browser caching
      const response = await fetch(`${host.url}/api/system/status?_cb=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
      });
      
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      if (response.ok) {
        const data = await response.json();
        setHosts(prev => prev.map((h, i) => i === hostIndex ? {
          ...h,
          online: true,
          loading: false,
          computerName: data.computer_name || 'Unknown',
          os: data.os || 'Unknown',
          latency,
          error: undefined
        } : h));
      } else if (response.status === 404) {
        // Server is online but running older version of the codebase
        setHosts(prev => prev.map((h, i) => i === hostIndex ? {
          ...h,
          online: true,
          loading: false,
          computerName: 'Outdated Version',
          os: 'Needs Update',
          latency,
          error: 'Older version detected (status endpoint 404). Please run Update.'
        } : h));
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err: any) {
      setHosts(prev => prev.map((h, i) => i === hostIndex ? {
        ...h,
        online: false,
        loading: false,
        computerName: undefined,
        os: undefined,
        latency: undefined,
        error: err.message || 'Connection failed'
      } : h));
    }
  };

  const checkAllHosts = () => {
    hosts.forEach((_, idx) => checkHostStatus(idx));
  };

  useEffect(() => {
    checkAllHosts();
    const interval = setInterval(checkAllHosts, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async (host: HostStatus) => {
    if (!window.confirm(`Are you sure you want to FORCE UPDATE & RESTART the backend server on: ${host.name}?`)) {
      return;
    }
    
    try {
      const response = await fetch(`${host.url}/api/system/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
      });
      const data = await response.json();
      alert(`Restart command sent to ${host.name}.\nResponse: ${data.message || JSON.stringify(data)}`);
      
      // Mark as loading and check status after a few seconds
      setTimeout(() => checkAllHosts(), 5000);
    } catch (err: any) {
      alert(`Failed to send restart command to ${host.name}: ${err.message}`);
    }
  };

  return (
    <div style={{
      padding: '24px',
      color: '#f8fafc',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '80vh',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        borderBottom: '1px solid #1e293b',
        paddingBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setView('dashboard')}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={24} style={{ color: '#3b82f6' }} /> Computer & Server Manager
          </h1>
        </div>

        <button
          onClick={checkAllHosts}
          style={{
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 'bold',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          <RefreshCw size={16} /> Refresh Status
        </button>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '24px',
      }}>
        {hosts.map((host, idx) => {
          const isLaptop = host.type === 'laptop';
          const isRailway = host.type === 'railway';
          
          return (
            <div
              key={host.name}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(12px)',
                border: `1.5px solid ${host.online ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '20px',
                position: 'relative',
                boxShadow: host.online 
                  ? '0 10px 30px rgba(16, 185, 129, 0.05)'
                  : '0 10px 30px rgba(239, 68, 68, 0.05)',
                transition: 'all 0.3s ease',
              }}
            >
              {/* Top Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    backgroundColor: isLaptop ? 'rgba(245, 158, 11, 0.15)' : isRailway ? 'rgba(147, 51, 234, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                    color: isLaptop ? '#f59e0b' : isRailway ? '#a855f7' : '#3b82f6',
                  }}>
                    {host.type}
                  </span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {host.loading && (
                      <RefreshCw size={14} className="animate-spin" style={{ color: '#94a3b8' }} />
                    )}
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: host.online ? '#10b981' : '#ef4444',
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: host.online ? '#10b981' : '#ef4444',
                        boxShadow: host.online ? '0 0 10px #10b981' : '0 0 10px #ef4444',
                      }}></span>
                      {host.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>

                <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#f1f5f9' }}>
                  {host.name}
                </h3>
                <code style={{
                  display: 'block',
                  fontSize: '12px',
                  color: '#94a3b8',
                  backgroundColor: 'rgba(30, 41, 59, 0.4)',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  marginBottom: '20px'
                }}>
                  {host.url}
                </code>

                {/* Details Section */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  fontSize: '13px',
                  backgroundColor: 'rgba(30, 41, 59, 0.2)',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Computer Name:</span>
                    <span style={{ color: '#cbd5e1', fontWeight: '500' }}>{host.computerName || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>OS Platform:</span>
                    <span style={{ color: '#cbd5e1', fontWeight: '500', textTransform: 'capitalize' }}>{host.os || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Latency:</span>
                    <span style={{
                      color: !host.latency ? '#cbd5e1' : host.latency < 50 ? '#10b981' : host.latency < 150 ? '#f59e0b' : '#ef4444',
                      fontWeight: 'bold'
                    }}>
                      {host.latency ? `${host.latency} ms` : 'N/A'}
                    </span>
                  </div>
                  {host.error && (
                    <div style={{
                      marginTop: '8px',
                      color: '#ef4444',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <ShieldAlert size={12} /> {host.error}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  onClick={() => checkHostStatus(idx)}
                  disabled={host.loading}
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
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={(e) => {
                    if (!host.loading) e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.8)';
                  }}
                  onMouseOut={(e) => {
                    if (!host.loading) e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.6)';
                  }}
                >
                  Ping Status
                </button>
                
                <button
                  onClick={() => handleRestart(host)}
                  disabled={!host.online || host.loading}
                  style={{
                    flex: 2,
                    backgroundColor: host.online ? '#ef4444' : '#334155',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px',
                    color: host.online ? '#ffffff' : '#94a3b8',
                    cursor: host.online ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={(e) => {
                    if (host.online && !host.loading) e.currentTarget.style.backgroundColor = '#dc2626';
                  }}
                  onMouseOut={(e) => {
                    if (host.online && !host.loading) e.currentTarget.style.backgroundColor = '#ef4444';
                  }}
                >
                  <RefreshCw size={14} /> Update & Restart
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
