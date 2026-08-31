import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../api';
import { SymbolTimeframeSelector } from './symbol_timeframe_selector';

interface SymbolMapping {
  id: number;
  main_symbol: string;
  account_id: string;
  broker_symbol: string;
}

interface SymbolMappingsViewProps {
  isMobile: boolean;
  setView: (view: 'dashboard' | 'mappings' | 'trades') => void;
  isProdHost: boolean;
  isAuthenticated: boolean;
}

interface ConnectedBroker {
  account_id: string;
  broker_type: string;
  name: string;
  symbols: string[];
}

export default function SymbolMappingsView({
  isMobile,
  setView,
  isProdHost,
  isAuthenticated,
}: SymbolMappingsViewProps) {
  // Symbol Mapping states
  const [symbolMappings, setSymbolMappings] = useState<SymbolMapping[]>([]);
  const [newMainSymbol, setNewMainSymbol] = useState('');
  const [customMainSymbol, setCustomMainSymbol] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [customAccountId, setCustomAccountId] = useState('');
  const [newBrokerSymbol, setNewBrokerSymbol] = useState('');
  const [mappingMessage, setMappingMessage] = useState('');

  const [connectedBrokers, setConnectedBrokers] = useState<ConnectedBroker[]>([]);
  const [loadingBrokers, setLoadingBrokers] = useState(false);

  const fetchConnectedBrokers = async () => {
    setLoadingBrokers(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings/connected-brokers`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setConnectedBrokers(data.data);
        if (data.data.length > 0 && !newAccountId) {
          setNewAccountId(data.data[0].account_id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch connected brokers:', e);
    } finally {
      setLoadingBrokers(false);
    }
  };

  useEffect(() => {
    fetchConnectedBrokers();
  }, []);

  const getAllMasterSymbols = (): string[] => {
    const defaultMasters = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'GER40', 'US30', 'US100', 'NAS100', 'SPX500'];
    const set = new Set<string>(defaultMasters);
    symbolMappings.forEach(m => {
      if (m.main_symbol) {
        set.add(m.main_symbol.toUpperCase().trim());
      }
    });
    return Array.from(set).sort();
  };

  const getAvailableBrokerSymbols = (): string[] => {
    const finalKey = newAccountId === 'custom' ? customAccountId : newAccountId;
    const found = connectedBrokers.find(b => b.account_id === finalKey);
    if (found && found.symbols && found.symbols.length > 0) {
      return found.symbols;
    }
    const set = new Set<string>();
    connectedBrokers.forEach(b => {
      if (Array.isArray(b.symbols)) {
        b.symbols.forEach(s => set.add(s));
      }
    });
    return Array.from(set);
  };

  const fetchSymbolMappings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings`);
      const data = await res.json();
      if (data.status === 'success') {
        setSymbolMappings(data.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch symbol mappings:", e);
    }
  };

  useEffect(() => {
    fetchSymbolMappings();
  }, []);

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    const finalMainSymbol = newMainSymbol === 'custom' ? customMainSymbol : newMainSymbol;
    const finalAccountId = newAccountId === 'custom' ? customAccountId : newAccountId;
    if (!finalMainSymbol || !finalAccountId || !newBrokerSymbol) {
      setMappingMessage('All fields are required');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_symbol: finalMainSymbol.toUpperCase().trim(),
          account_id: finalAccountId.trim(),
          broker_symbol: newBrokerSymbol.trim()
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setMappingMessage('Mapping saved successfully!');
        setNewBrokerSymbol('');
        setCustomMainSymbol('');
        fetchSymbolMappings();
      } else {
        setMappingMessage(data.message || 'Failed to save mapping');
      }
    } catch (err) {
      setMappingMessage('Network error');
    }
  };

  const handleDeleteMapping = async (id: number) => {
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.status === 'success') {
        fetchSymbolMappings();
      }
    } catch (err) {
      console.error("Failed to delete mapping:", err);
    }
  };

  return (
    <div style={{
      padding: '24px',
      maxWidth: '1200px',
      margin: '0 auto',
      width: '100%',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* Back button & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#3b82f6' }}>🔗</span> Symbol Mappings Configuration
        </h2>
        <button 
          onClick={() => setView('dashboard')}
          style={{
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '12px',
            transition: 'all 0.2s'
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: '24px', alignItems: 'start' }}>
        {/* Left side: Add Mapping Form */}
        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#f8fafc', fontWeight: 'bold' }}>Add / Update Mapping</h3>
          <form onSubmit={handleAddMapping} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <SymbolTimeframeSelector 
                showTimeframe={false}
                symbolSource="master"
                symbolLabel="Main Symbol (Master)"
                placeholder="Search/select master symbol (e.g. EURUSD)"
                symbol={newMainSymbol}
                onSymbolChange={sym => setNewMainSymbol(sym)}
                availableSymbols={getAllMasterSymbols()}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Broker / Account Target</label>
              <select 
                value={newAccountId} 
                onChange={e => setNewAccountId(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none'
                }}
              >
                {connectedBrokers.map(b => (
                  <option key={b.account_id} value={b.account_id}>
                    {b.name} ({b.broker_type} - {b.account_id})
                  </option>
                ))}
                <option value="custom">Custom Account ID</option>
              </select>
            </div>

            {newAccountId === 'custom' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Custom Account ID</label>
                <input 
                  type="text" 
                  placeholder="e.g. 2002061314 or 48025530" 
                  value={customAccountId} 
                  onChange={e => setCustomAccountId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>
            )}

            <div>
              <SymbolTimeframeSelector 
                showTimeframe={false}
                symbolSource="fetched"
                accountId={newAccountId === 'custom' ? customAccountId : newAccountId}
                symbolLabel="Broker Symbol"
                placeholder={loadingBrokers ? "Loading broker symbols..." : "Search/select broker symbol (e.g. EURUSD.ecn)"}
                symbol={newBrokerSymbol}
                onSymbolChange={sym => setNewBrokerSymbol(sym)}
                availableSymbols={getAvailableBrokerSymbols()}
                disabled={loadingBrokers || !newAccountId}
              />
            </div>
            {mappingMessage && (
              <div style={{
                fontSize: '11px',
                color: mappingMessage.includes('successfully') ? '#10b981' : '#ef4444',
                backgroundColor: mappingMessage.includes('successfully') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${mappingMessage.includes('successfully') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                padding: '8px 12px',
                borderRadius: '6px',
                textAlign: 'center'
              }}>
                {mappingMessage}
              </div>
            )}
            <button 
              type="submit"
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
              }}
            >
              Save Mapping
            </button>
          </form>
        </div>

        {/* Right side: Existing Mappings List */}
        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '20px',
          overflowX: 'auto'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#f8fafc', fontWeight: 'bold' }}>Active Mappings</h3>
          {symbolMappings.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '24px' }}>
              No symbol mappings configured. Mappings fallback to standard symbols.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#94a3b8' }}>
                  <th style={{ padding: '8px' }}>Main Symbol</th>
                  <th style={{ padding: '8px' }}>Account ID</th>
                  <th style={{ padding: '8px' }}>Mapped Broker Symbol</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {symbolMappings.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{m.main_symbol}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', color: '#94a3b8' }}>{m.account_id}</td>
                    <td style={{ padding: '8px', color: '#f59e0b', fontFamily: 'monospace' }}>{m.broker_symbol}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <button 
                        onClick={() => handleDeleteMapping(m.id)}
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
