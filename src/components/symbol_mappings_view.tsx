import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../api';

interface SymbolMapping {
  id: number;
  main_symbol: string;
  broker_key: string;
  broker_symbol: string;
}

interface SymbolMappingsViewProps {
  isMobile: boolean;
  setView: (view: 'dashboard' | 'mappings' | 'trades') => void;
  isProdHost: boolean;
  isAuthenticated: boolean;
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
  const [newBrokerKey, setNewBrokerKey] = useState('metatrader:JustMarkets-Demo');
  const [customBrokerKey, setCustomBrokerKey] = useState('');
  const [newBrokerSymbol, setNewBrokerSymbol] = useState('');
  const [mappingMessage, setMappingMessage] = useState('');

  const [brokerSymbols, setBrokerSymbols] = useState<string[]>([]);
  const [loadingBrokerSymbols, setLoadingBrokerSymbols] = useState(false);
  const [brokerSymbolSearch, setBrokerSymbolSearch] = useState('');
  const [showBrokerSymbolDropdown, setShowBrokerSymbolDropdown] = useState(false);

  const fetchBrokerSymbols = async (key: string) => {
    setLoadingBrokerSymbols(true);
    try {
      let endpoint = '';
      if (key.startsWith('metatrader')) {
        endpoint = '/api/metatrader/symbols';
      } else if (key.startsWith('ctrader')) {
        endpoint = '/api/ctrader/symbols';
      } else if (key === 'yfinance') {
        endpoint = '/api/yfinance/symbols';
      }

      if (endpoint) {
        const res = await fetch(`${API_BASE_URL}${endpoint}`);
        const data = await res.json();
        if (data.status === 'success') {
          setBrokerSymbols(data.data || []);
        }
      }
    } catch (e) {
      console.error('Failed to load symbols for key:', key, e);
    } finally {
      setLoadingBrokerSymbols(false);
    }
  };

  useEffect(() => {
    const finalKey = newBrokerKey === 'custom' ? customBrokerKey : newBrokerKey;
    fetchBrokerSymbols(finalKey);
  }, [newBrokerKey, customBrokerKey]);

  const handleSelectBrokerSymbol = (sym: string) => {
    setNewBrokerSymbol(sym);
    setBrokerSymbolSearch(sym);
    setShowBrokerSymbolDropdown(false);
    
    // Auto-suggest Main Symbol: e.g. "EURUSD.ecn" -> "EURUSD"
    const suggestedMain = sym
      .split('.')[0]
      .split('_')[0]
      .split('-')[0]
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
      
    if (suggestedMain) {
      setNewMainSymbol(suggestedMain);
    }
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
    const finalBrokerKey = newBrokerKey === 'custom' ? customBrokerKey : newBrokerKey;
    if (!newMainSymbol || !finalBrokerKey || !newBrokerSymbol) {
      setMappingMessage('All fields are required');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_symbol: newMainSymbol.toUpperCase().trim(),
          broker_key: finalBrokerKey.trim(),
          broker_symbol: newBrokerSymbol.trim()
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setMappingMessage('Mapping saved successfully!');
        setNewMainSymbol('');
        setNewBrokerSymbol('');
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
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Main Symbol (Unified)</label>
              <input 
                type="text" 
                placeholder="e.g. EURUSD" 
                value={newMainSymbol} 
                onChange={e => setNewMainSymbol(e.target.value)}
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
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Broker Config Key</label>
              <select 
                value={newBrokerKey} 
                onChange={e => setNewBrokerKey(e.target.value)}
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
                <option value="metatrader:JustMarkets-Demo">MetaTrader (JustMarkets-Demo)</option>
                <option value="metatrader:FTMO-Demo">MetaTrader (FTMO-Demo)</option>
                <option value="ctrader:live.ftmo.17151091">cTrader (live.ftmo.17151091)</option>
                <option value="yfinance">Yahoo Finance</option>
                <option value="custom">Custom/Other Server Key</option>
              </select>
            </div>
            {newBrokerKey === 'custom' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Custom Key</label>
                <input 
                  type="text" 
                  placeholder="metatrader:Server-Name or ctrader:SenderCompID" 
                  value={customBrokerKey} 
                  onChange={e => setCustomBrokerKey(e.target.value)}
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
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Broker Symbol</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  placeholder={loadingBrokerSymbols ? "Loading broker symbols..." : "Search/select symbol (e.g. EURUSD.ecn)"}
                  value={showBrokerSymbolDropdown ? brokerSymbolSearch : newBrokerSymbol} 
                  onFocus={() => {
                    setBrokerSymbolSearch('');
                    setShowBrokerSymbolDropdown(true);
                  }}
                  onChange={e => {
                    setBrokerSymbolSearch(e.target.value);
                    setNewBrokerSymbol(e.target.value);
                  }}
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
                {showBrokerSymbolDropdown && (
                  <>
                    <div 
                      onClick={() => setShowBrokerSymbolDropdown(false)}
                      style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 999
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                      minWidth: '150px'
                    }}>
                      {brokerSymbols.filter(s => s.toLowerCase().includes(brokerSymbolSearch.toLowerCase())).length > 0 ? (
                        brokerSymbols
                          .filter(s => s.toLowerCase().includes(brokerSymbolSearch.toLowerCase()))
                          .map(sym => (
                            <div 
                              key={sym}
                              onClick={() => handleSelectBrokerSymbol(sym)}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: '#d1d5db',
                                backgroundColor: newBrokerSymbol === sym ? '#2563eb' : 'transparent',
                                transition: 'background-color 0.15s'
                              }}
                              onMouseEnter={(e) => {
                                if (newBrokerSymbol !== sym) e.currentTarget.style.backgroundColor = '#1e293b';
                              }}
                              onMouseLeave={(e) => {
                                if (newBrokerSymbol !== sym) e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              {sym}
                            </div>
                          ))
                      ) : (
                        <div style={{ padding: '8px 12px', fontSize: '12px', color: '#6b7280' }}>
                          {loadingBrokerSymbols ? "Fetching symbols..." : "No matching symbols found"}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
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
                  <th style={{ padding: '8px' }}>Broker Config Key</th>
                  <th style={{ padding: '8px' }}>Mapped Broker Symbol</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {symbolMappings.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{m.main_symbol}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', color: '#94a3b8' }}>{m.broker_key}</td>
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
