import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../api';

interface ConnectedBroker {
  account_id: string;
  broker_type: string;
  name: string;
  broker_key: string;
  symbols: string[];
}

interface SymbolMapping {
  id: number;
  main_symbol: string;
  broker_key: string;
  broker_symbol: string;
}

const MASTER_SYMBOLS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'USDCAD',
  'USDCHF',
  'NZDUSD',
  'XAUUSD',
  'BTCUSD',
  'ETHUSD',
  'US30',
  'GER40'
];

interface SymbolMappingCardProps {
  isReadOnly?: boolean;
}

export const SymbolMappingCard: React.FC<SymbolMappingCardProps> = ({ isReadOnly = false }) => {
  const [symbolMappings, setSymbolMappings] = useState<SymbolMapping[]>([]);
  const [newMainSymbol, setNewMainSymbol] = useState(MASTER_SYMBOLS[0]);
  const [customMainSymbol, setCustomMainSymbol] = useState('');
  const [newBrokerKey, setNewBrokerKey] = useState('');
  const [customBrokerKey, setCustomBrokerKey] = useState('');
  const [newBrokerSymbol, setNewBrokerSymbol] = useState('');
  const [mappingMessage, setMappingMessage] = useState('');

  const [connectedBrokers, setConnectedBrokers] = useState<ConnectedBroker[]>([]);
  const [loadingBrokers, setLoadingBrokers] = useState(false);
  const [brokerSymbolSearch, setBrokerSymbolSearch] = useState('');
  const [showBrokerSymbolDropdown, setShowBrokerSymbolDropdown] = useState(false);

  const fetchConnectedBrokers = async () => {
    setLoadingBrokers(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings/connected-brokers`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setConnectedBrokers(data.data);
        if (data.data.length > 0 && !newBrokerKey) {
          setNewBrokerKey(data.data[0].broker_key);
        }
      }
    } catch (e) {
      console.error('Failed to fetch connected brokers:', e);
    } finally {
      setLoadingBrokers(false);
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
    fetchConnectedBrokers();
    fetchSymbolMappings();
  }, []);

  const getAvailableBrokerSymbols = (): string[] => {
    const finalKey = newBrokerKey === 'custom' ? customBrokerKey : newBrokerKey;
    const found = connectedBrokers.find(b => b.broker_key === finalKey || b.account_id === finalKey);
    return found ? found.symbols : [];
  };

  const handleSelectBrokerSymbol = (sym: string) => {
    setNewBrokerSymbol(sym);
    setBrokerSymbolSearch(sym);
    setShowBrokerSymbolDropdown(false);
  };

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      alert("Action disabled in read-only mode.");
      return;
    }
    const finalMainSymbol = newMainSymbol === 'custom' ? customMainSymbol : newMainSymbol;
    const finalBrokerKey = newBrokerKey === 'custom' ? customBrokerKey : newBrokerKey;
    if (!finalMainSymbol || !finalBrokerKey || !newBrokerSymbol) {
      setMappingMessage('All fields are required');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_symbol: finalMainSymbol.toUpperCase().trim(),
          broker_key: finalBrokerKey.trim(),
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
    if (isReadOnly) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', width: '100%' }}>
      {/* Form Section */}
      <form onSubmit={handleAddMapping} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Master Symbol</label>
            <select
              value={newMainSymbol}
              onChange={e => setNewMainSymbol(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '11px',
                outline: 'none'
              }}
            >
              {MASTER_SYMBOLS.map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Target Broker</label>
            <select
              value={newBrokerKey}
              onChange={e => setNewBrokerKey(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '11px',
                outline: 'none'
              }}
            >
              {connectedBrokers.map(b => (
                <option key={b.account_id} value={b.broker_key}>
                  {b.name} ({b.account_id})
                </option>
              ))}
              <option value="custom">Custom Key</option>
            </select>
          </div>
        </div>

        {newMainSymbol === 'custom' && (
          <div>
            <input
              type="text"
              placeholder="Custom Master Symbol"
              value={customMainSymbol}
              onChange={e => setCustomMainSymbol(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '11px',
                outline: 'none'
              }}
            />
          </div>
        )}

        {newBrokerKey === 'custom' && (
          <div>
            <input
              type="text"
              placeholder="Custom Broker Key"
              value={customBrokerKey}
              onChange={e => setCustomBrokerKey(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '11px',
                outline: 'none'
              }}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Mapped Broker Symbol</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder={loadingBrokers ? "Loading symbols..." : "Select/search broker symbol"}
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
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '11px',
                outline: 'none'
              }}
            />
            {showBrokerSymbolDropdown && (
              <>
                <div
                  onClick={() => setShowBrokerSymbolDropdown(false)}
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  zIndex: 1000,
                  boxShadow: '0 8px 12px rgba(0, 0, 0, 0.4)'
                }}>
                  {getAvailableBrokerSymbols().filter(s => s.toLowerCase().includes(brokerSymbolSearch.toLowerCase())).length > 0 ? (
                    getAvailableBrokerSymbols()
                      .filter(s => s.toLowerCase().includes(brokerSymbolSearch.toLowerCase()))
                      .map(sym => (
                        <div
                          key={sym}
                          onClick={() => handleSelectBrokerSymbol(sym)}
                          style={{
                            padding: '6px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: '#d1d5db',
                            backgroundColor: newBrokerSymbol === sym ? '#2563eb' : 'transparent'
                          }}
                        >
                          {sym}
                        </div>
                      ))
                  ) : (
                    <div style={{ padding: '6px 8px', fontSize: '11px', color: '#6b7280' }}>
                      {loadingBrokers ? "Fetching..." : "No symbols found"}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {mappingMessage && (
          <div style={{
            fontSize: '10px',
            color: mappingMessage.includes('successfully') ? '#10b981' : '#ef4444',
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
            borderRadius: '4px',
            padding: '6px 12px',
            fontSize: '11px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Save Mapping
        </button>
      </form>

      {/* Mappings Table Section */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
          Active Mappings ({symbolMappings.length})
        </span>
        {symbolMappings.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '11px', textAlign: 'center', padding: '12px' }}>
            No active mappings
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#94a3b8' }}>
                <th style={{ padding: '4px' }}>Master</th>
                <th style={{ padding: '4px' }}>Broker Key</th>
                <th style={{ padding: '4px' }}>Broker Sym</th>
                <th style={{ padding: '4px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {symbolMappings.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>
                  <td style={{ padding: '4px', fontWeight: 'bold' }}>{m.main_symbol}</td>
                  <td style={{ padding: '4px', fontFamily: 'monospace', color: '#94a3b8', fontSize: '10px' }}>{m.broker_key}</td>
                  <td style={{ padding: '4px', color: '#f59e0b', fontFamily: 'monospace' }}>{m.broker_symbol}</td>
                  <td style={{ padding: '4px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDeleteMapping(m.id)}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '10px',
                        cursor: 'pointer'
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
  );
};

export default SymbolMappingCard;
