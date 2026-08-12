import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../api';
import { SymbolTimeframeSelector } from './symbol_timeframe_selector';

interface ConnectedBroker {
  account_id: string;
  broker_type: string;
  name: string;
  symbols: string[];
}

interface SymbolMapping {
  id: number;
  main_symbol: string;
  account_id: string;
  broker_symbol: string;
}

export const SymbolMappingCard: React.FC<SymbolMappingCardProps> = ({ isReadOnly = false }) => {
  const [symbolMappings, setSymbolMappings] = useState<SymbolMapping[]>([]);
  const [newMainSymbol, setNewMainSymbol] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
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
    const found = connectedBrokers.find(b => b.account_id === newAccountId);
    return found ? found.symbols : [];
  };

  const defaultMasters = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'GER40', 'US30', 'US100', 'NAS100', 'SPX500'];
  const existingMasterSymbols = Array.from(new Set([...defaultMasters, ...symbolMappings.map(m => m.main_symbol.toUpperCase().trim()).filter(Boolean)])).sort();

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      alert("Action disabled in read-only mode.");
      return;
    }
    const finalMainSymbol = newMainSymbol.toUpperCase().trim();
    if (!finalMainSymbol || !newAccountId || !newBrokerSymbol) {
      setMappingMessage('All fields are required (select an active broker and symbol)');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_symbol: finalMainSymbol,
          account_id: newAccountId.trim(),
          broker_symbol: newBrokerSymbol.trim()
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setMappingMessage('Mapping saved successfully!');
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

  const filteredMappings = newMainSymbol.trim()
    ? symbolMappings.filter(m => m.main_symbol.toUpperCase() === newMainSymbol.toUpperCase().trim())
    : symbolMappings;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', width: '100%' }}>
      {/* Header Refresh Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '6px 10px', borderRadius: '4px', border: '1px solid #1e293b' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8' }}>Symbol Mapping Config</span>
        <button
          type="button"
          onClick={() => {
            fetchConnectedBrokers();
            fetchSymbolMappings();
          }}
          disabled={loadingBrokers}
          style={{
            backgroundColor: '#1e293b',
            color: '#3b82f6',
            border: '1px solid #334155',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          🔄 {loadingBrokers ? 'Refreshing...' : 'Refresh Brokers & Symbols'}
        </button>
      </div>

      {/* Form Section */}
      <form onSubmit={handleAddMapping} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'end' }}>
          <div>
            <SymbolTimeframeSelector 
              showTimeframe={false}
              symbolLabel="Master Symbol (Select or Create)"
              placeholder="e.g. EURUSD, GER40..."
              symbol={newMainSymbol}
              onSymbolChange={sym => setNewMainSymbol(sym)}
              availableSymbols={existingMasterSymbols}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>Active Broker Account</label>
            <select
              value={newAccountId}
              onChange={e => {
                setNewAccountId(e.target.value);
                setNewBrokerSymbol('');
              }}
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              <option value="">-- Select Active Account --</option>
              {connectedBrokers.map(b => (
                <option key={b.account_id} value={b.account_id}>
                  {b.name} ({b.account_id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <SymbolTimeframeSelector 
            showTimeframe={false}
            symbolLabel="Broker Symbol (Select from Broker)"
            placeholder={loadingBrokers ? "Loading broker symbols..." : "Search broker symbol (e.g. 100, EURUSD)"}
            symbol={newBrokerSymbol}
            onSymbolChange={sym => setNewBrokerSymbol(sym)}
            availableSymbols={getAvailableBrokerSymbols()}
            disabled={loadingBrokers || !newAccountId}
          />
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
          add symbol to map
        </button>
      </form>

      {/* Mappings Table Section */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
          {newMainSymbol.trim() ? `Mappings for Master '${newMainSymbol.toUpperCase().trim()}' (${filteredMappings.length})` : `All Active Mappings (${filteredMappings.length})`}
        </span>
        {filteredMappings.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '11px', textAlign: 'center', padding: '12px' }}>
            {newMainSymbol.trim() ? `No mappings configured for master symbol '${newMainSymbol.toUpperCase().trim()}'` : 'No active mappings'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#94a3b8' }}>
                <th style={{ padding: '4px' }}>Master</th>
                <th style={{ padding: '4px' }}>Account Data</th>
                <th style={{ padding: '4px' }}>Broker Symbol</th>
                <th style={{ padding: '4px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredMappings.map(m => {
                const matchedBroker = connectedBrokers.find(b => b.account_id === m.account_id);
                const accLabel = matchedBroker ? `${matchedBroker.name} (#${matchedBroker.account_id})` : `#${m.account_id}`;
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>
                    <td style={{ padding: '4px', fontWeight: 'bold', color: '#3b82f6' }}>{m.main_symbol}</td>
                    <td style={{ padding: '4px', fontFamily: 'monospace', color: '#94a3b8', fontSize: '10px' }}>{accLabel}</td>
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default SymbolMappingCard;
