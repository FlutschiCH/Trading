import React, { useState, useEffect, useMemo } from 'react';
import { Users, Copy, Plus, Trash2, CheckCircle2, PauseCircle, Play, Laptop, Server, RefreshCw, History, ArrowUpDown, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { API_BASE_URL } from '../api';
import { useAccountsStore } from '../services/accountsStore';
import { useComputersStore, HARDCODED_HOSTS } from '../services/computersStore';
import AccountSelector from './account_selector';
import DebugComponentBadge from './debug_component_badge';

interface SlaveAccount {
  account_id: string;
  broker: string;
  mode: 'direct' | 'multiplier' | 'divider' | 'percent' | 'fixed_amount';
  multiplier: number;
  status: 'active' | 'paused';
}

interface CopytraderConfig {
  id: string;
  name: string;
  status: 'active' | 'paused';
  target_computer: string;
  symbols?: string;
  master_account: string;
  master_broker: string;
  slaves: SlaveAccount[];
}

interface CopytraderMapping {
  id: number;
  config_id: string;
  master_ticket: string;
  slave_account: string;
  slave_ticket: string;
  symbol: string;
  action: string;
  lots: number;
  status: string;
  created_at: string;
}

export const Copytrader: React.FC = () => {
  const { accounts, refreshAccounts } = useAccountsStore();
  const { computers, refreshComputers } = useComputersStore();
  const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');
  const [configs, setConfigs] = useState<CopytraderConfig[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // History State
  const [historyList, setHistoryList] = useState<CopytraderMapping[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [filterAccount, setFilterAccount] = useState<string>('ALL');
  const [filterConfigId, setFilterConfigId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'created_at' | 'slave_account' | 'config_id' | 'symbol' | 'lots'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const HISTORY_PAGE_SIZE = 15;

  // Form State
  const [name, setName] = useState('');
  const [targetComputer, setTargetComputer] = useState('All');
  const [symbols, setSymbols] = useState('All');
  const [masterAccount, setMasterAccount] = useState('');
  const [masterBroker, setMasterBroker] = useState('metatrader');
  const [slaves, setSlaves] = useState<SlaveAccount[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchConfigs();
    fetchHistory();
  }, []);

  const fetchAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchConfigs(), fetchHistory(), refreshAccounts(), refreshComputers()]);
    setRefreshing(false);
  };

  const fetchConfigs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/configs`);
      const data = await res.json();
      if (data.status === 'success') {
        setConfigs(data.configs || []);
      }
    } catch (e) {
      console.error('Failed to fetch copytrader configs', e);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1000 })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setHistoryList(data.history || []);
      }
    } catch (e) {
      console.error('Failed to fetch copytrader history', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Distinct account IDs for dropdown filter
  const distinctSlaveAccounts = useMemo(() => {
    const set = new Set<string>();
    historyList.forEach(h => {
      if (h.slave_account) set.add(String(h.slave_account));
    });
    return Array.from(set).sort();
  }, [historyList]);

  // Distinct config IDs for dropdown filter
  const distinctConfigIds = useMemo(() => {
    const set = new Set<string>();
    historyList.forEach(h => {
      if (h.config_id) set.add(String(h.config_id));
    });
    return Array.from(set).sort();
  }, [historyList]);

  // Filtered and Sorted History
  const filteredAndSortedHistory = useMemo(() => {
    let result = historyList.filter(item => {
      if (filterAccount !== 'ALL' && String(item.slave_account) !== filterAccount) return false;
      if (filterConfigId !== 'ALL' && String(item.config_id) !== filterConfigId) return false;
      if (filterStatus !== 'ALL' && String(item.status).toLowerCase() !== filterStatus.toLowerCase()) return false;
      return true;
    });

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'lots') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [historyList, filterAccount, filterConfigId, filterStatus, sortField, sortOrder]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredAndSortedHistory.length / HISTORY_PAGE_SIZE));

  useEffect(() => {
    setHistoryPage(1);
  }, [filterAccount, filterConfigId, filterStatus, sortField, sortOrder]);

  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return filteredAndSortedHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredAndSortedHistory, historyPage]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'created_at' ? 'desc' : 'asc');
    }
  };


  const handleAddSlave = () => {
    setSlaves([
      ...slaves,
      { account_id: '', broker: 'metatrader', mode: 'direct', multiplier: 1.0, status: 'active' }
    ]);
  };

  const handleRemoveSlave = (index: number) => {
    setSlaves(slaves.filter((_, i) => i !== index));
  };

  const handleSlaveChange = (index: number, field: keyof SlaveAccount, value: any) => {
    const updated = [...slaves];
    updated[index] = { ...updated[index], [field]: value };
    setSlaves(updated);
  };

  const handleSaveConfig = async () => {
    if (!masterAccount) {
      alert('Please select a Master Account.');
      return;
    }
    setLoading(true);

    const payload = {
      id: editingId || `cfg_${Date.now()}`,
      name: name || `Copytrader (${masterAccount})`,
      status: 'active',
      target_computer: targetComputer,
      symbols: symbols.trim() || 'All',
      master_account: masterAccount,
      master_broker: masterBroker,
      slaves: slaves
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.status === 'success') {
        resetForm();
        fetchConfigs();
      } else {
        alert(data.message || 'Failed to save config');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save Copytrader configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Copytrader rule?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/config/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        fetchConfigs();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleConfigStatus = async (id: string, currentStatus: string, persist: boolean = false) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/config/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, persist })
      });
      const data = await res.json();
      if (data.status === 'success') {
        fetchConfigs();
      } else {
        alert(data.message || 'Failed to update status');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to update Copytrader status');
    }
  };

  const handleToggleSlaveStatus = async (configId: string, slaveAccountId: string, currentStatus: string, persist: boolean = false) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/config/${configId}/slave/${slaveAccountId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, persist })
      });
      const data = await res.json();
      if (data.status === 'success') {
        fetchConfigs();
      } else {
        alert(data.message || 'Failed to update slave status');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to update Slave status');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setTargetComputer('All');
    setSymbols('All');
    setMasterAccount('');
    setMasterBroker('metatrader');
    setSlaves([]);
  };

  const editConfig = (cfg: CopytraderConfig) => {
    setEditingId(cfg.id);
    setName(cfg.name);
    setTargetComputer(cfg.target_computer || 'All');
    setSymbols(cfg.symbols || 'All');
    setMasterAccount(cfg.master_account);
    setMasterBroker(cfg.master_broker || 'metatrader');
    setSlaves(cfg.slaves || []);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', width: '100%' }}>
      {/* Top Header Refresh Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: '#0f172a',
        padding: '6px 10px',
        borderRadius: '4px',
        border: '1px solid #1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Copy style={{ width: '14px', height: '14px', color: '#3b82f6' }} />
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8' }}>Copytrader Master / Slave Engine</span>
          <DebugComponentBadge name="Copytrader" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Tab buttons */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: '#020617', padding: '2px', borderRadius: '4px', border: '1px solid #1e293b' }}>
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              style={{
                backgroundColor: activeTab === 'rules' ? '#1e293b' : 'transparent',
                color: activeTab === 'rules' ? '#f8fafc' : '#64748b',
                border: 'none',
                borderRadius: '3px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Users size={12} />
              Setups & Rules ({configs.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                fetchHistory();
              }}
              style={{
                backgroundColor: activeTab === 'history' ? '#1e293b' : 'transparent',
                color: activeTab === 'history' ? '#38bdf8' : '#64748b',
                border: 'none',
                borderRadius: '3px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <History size={12} />
              Copied History ({historyList.length})
            </button>
          </div>

          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: '#1e1b4b',
            color: '#818cf8',
            border: '1px solid #312e81',
            fontFamily: 'monospace'
          }}>
            1s Sync Loop Active
          </span>
          <button
            type="button"
            onClick={fetchAll}
            disabled={refreshing}
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
            <RefreshCw style={{ width: '12px', height: '12px', animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh All'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Rules & Configuration */}
      {activeTab === 'rules' && (
        <>
          {/* Editor / Configuration Form Panel */}
          <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '6px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {editingId ? 'Edit Copytrader Rule' : 'Create Copytrader Setup'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>Setup Name</label>
            <input
              type="text"
              placeholder="e.g. Master FTMO -> Slaves"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#020617',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>Target Computer Host</label>
            <select
              value={targetComputer}
              onChange={(e) => setTargetComputer(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#020617',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              {computers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>Master Account</label>
            <AccountSelector
              value={masterAccount}
              onChange={(accId, acc) => {
                setMasterAccount(accId);
                if (acc) setMasterBroker(acc.broker_type);
              }}
              placeholder="Select Master Account..."
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>Symbols to Copy</label>
              <button
                type="button"
                onClick={() => setSymbols('All')}
                style={{ fontSize: '9px', color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Reset (All)
              </button>
            </div>
            <input
              type="text"
              placeholder="All (or e.g. BTCUSD, ETHUSD)"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#020617',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 8px',
                color: '#f8fafc',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Quick Symbol Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', padding: '0 2px' }}>
          <span style={{ fontSize: '10px', color: '#64748b' }}>Quick Symbol Presets:</span>
          {['All', 'BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'NAS100'].map((preset) => {
            const isAllActive = (symbols === 'All' || !symbols.trim()) && preset === 'All';
            const isPresetActive = preset !== 'All' && symbols.toUpperCase().includes(preset);
            const active = isAllActive || isPresetActive;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  if (preset === 'All') {
                    setSymbols('All');
                  } else if (symbols === 'All' || !symbols.trim()) {
                    setSymbols(preset);
                  } else {
                    const currentList = symbols.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                    if (currentList.includes(preset)) {
                      const filtered = currentList.filter(s => s !== preset);
                      setSymbols(filtered.length ? filtered.join(', ') : 'All');
                    } else {
                      setSymbols([...currentList, preset].join(', '));
                    }
                  }
                }}
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: active ? '#1e3a8a' : '#020617',
                  color: active ? '#93c5fd' : '#94a3b8',
                  border: `1px solid ${active ? '#3b82f6' : '#334155'}`,
                  cursor: 'pointer',
                  fontWeight: active ? 'bold' : 'normal'
                }}
              >
                {preset}
              </button>
            );
          })}
        </div>

        {/* Slaves Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Slave Accounts ({slaves.length})
            </span>
            <button
              type="button"
              onClick={handleAddSlave}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
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
              <Plus style={{ width: '12px', height: '12px' }} /> Add Slave Account
            </button>
          </div>

          {slaves.length === 0 ? (
            <p style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
              No slave accounts added yet. Click 'Add Slave Account' to assign copy destinations.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {slaves.map((slave, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#020617',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b'
                }}>
                  <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
                    <AccountSelector
                      value={slave.account_id}
                      onChange={(accId, acc) => {
                        const updated = [...slaves];
                        updated[idx] = {
                          ...updated[idx],
                          account_id: accId,
                          broker: acc ? acc.broker_type : updated[idx].broker,
                        };
                        setSlaves(updated);
                      }}
                      placeholder="Select Slave Account..."
                      filter={(a) => String(a.account_id) !== String(masterAccount)}
                      showBrokerTag={false}
                      style={{ width: '100%', backgroundColor: '#0f172a', padding: '4px 6px', fontSize: '11px' }}
                    />
                  </div>

                  <select
                    value={slave.mode}
                    onChange={(e) => handleSlaveChange(idx, 'mode', e.target.value as any)}
                    style={{
                      flex: '0 0 auto',
                      width: '135px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      color: '#f8fafc',
                      fontSize: '11px',
                      outline: 'none'
                    }}
                  >
                    <option value="direct">Direct (1:1)</option>
                    <option value="multiplier">Multiplier (×)</option>
                    <option value="divider">Divider (÷)</option>
                    <option value="percent">Risk (% SL)</option>
                    <option value="fixed_amount">Fixed $ Loss</option>
                  </select>

                  {(slave.mode === 'multiplier' || slave.mode === 'divider' || slave.mode === 'percent' || slave.mode === 'fixed_amount') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '85px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {slave.mode === 'divider' ? '÷' : slave.mode === 'percent' ? '%' : slave.mode === 'fixed_amount' ? '$' : 'x'}
                      </span>
                      <input
                        type="number"
                        step={slave.mode === 'percent' ? '0.25' : slave.mode === 'fixed_amount' ? '5' : '0.1'}
                        min="0.01"
                        value={slave.multiplier}
                        onChange={(e) => handleSlaveChange(idx, 'multiplier', parseFloat(e.target.value) || 1.0)}
                        style={{
                          width: '100%',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '4px 6px',
                          color: '#f8fafc',
                          fontSize: '11px',
                          outline: 'none'
                        }}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveSlave(idx)}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#f87171',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      marginLeft: 'auto'
                    }}
                    title="Remove Slave"
                  >
                    <Trash2 style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' }}>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              style={{
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Cancel Edit
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={loading}
            style={{
              backgroundColor: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {editingId ? 'Update Setup' : 'Save Copytrader Setup'}
          </button>
        </div>
      </div>

      {/* Deployed Rules Table / List Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Deployed Copytrader Rules ({configs.length})
        </span>

        {configs.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            backgroundColor: '#0f172a',
            border: '1px dashed #334155',
            borderRadius: '6px',
            color: '#64748b',
            fontSize: '11px'
          }}>
            No Copytrader setups configured. Create a setup above to start copying trades.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {configs.map((cfg) => (
              <div key={cfg.id} style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '10px 12px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc' }}>{cfg.name}</span>
                    <span style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      backgroundColor: cfg.status === 'active' ? '#064e3b' : '#78350f',
                      color: cfg.status === 'active' ? '#34d399' : '#fbbf24',
                      border: `1px solid ${cfg.status === 'active' ? '#047857' : '#b45309'}`
                    }}>
                      {cfg.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Target: <strong style={{ color: '#cbd5e1' }}>{cfg.target_computer || 'All'}</strong></span>
                    <span>Symbols: <strong style={{ color: '#fbbf24' }}>{cfg.symbols || 'All'}</strong></span>
                    <span>Master: <strong style={{ color: '#60a5fa' }}>{cfg.master_account}</strong></span>
                    <span>Slaves: <strong style={{ color: '#34d399' }}>{cfg.slaves?.length || 0}</strong></span>
                  </div>

                  {/* Individual Slaves list and in-memory reactivate controls */}
                  {cfg.slaves && cfg.slaves.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      {cfg.slaves.map((slave, sIdx) => {
                        const isSlavePaused = slave.status === 'paused';
                        return (
                          <div
                            key={`${slave.account_id}_${sIdx}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: '#020617',
                              border: `1px solid ${isSlavePaused ? '#78350f' : '#1e293b'}`,
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '10px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: isSlavePaused ? '#f87171' : '#38bdf8', fontWeight: 'bold' }}>
                                ➜ {slave.account_id} ({slave.broker.toUpperCase()})
                              </span>
                              <span style={{ color: '#64748b' }}>
                                [{slave.mode}{slave.mode === 'multiplier' || slave.mode === 'divider' ? ` x${slave.multiplier}` : ''}]
                              </span>
                              <span
                                style={{
                                  fontSize: '8px',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  fontWeight: 'bold',
                                  backgroundColor: isSlavePaused ? '#451a03' : '#064e3b',
                                  color: isSlavePaused ? '#fbbf24' : '#34d399',
                                  border: `1px solid ${isSlavePaused ? '#b45309' : '#047857'}`
                                }}
                              >
                                {isSlavePaused ? 'PAUSED' : 'ACTIVE'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleSlaveStatus(cfg.id, slave.account_id, slave.status, false)}
                              style={{
                                backgroundColor: isSlavePaused ? '#064e3b' : '#1e293b',
                                color: isSlavePaused ? '#34d399' : '#94a3b8',
                                border: `1px solid ${isSlavePaused ? '#047857' : '#334155'}`,
                                borderRadius: '3px',
                                padding: '1px 6px',
                                fontSize: '9px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title={isSlavePaused ? "Reactivate slave account in memory" : "Pause slave account in memory"}
                            >
                              {isSlavePaused ? <Play size={10} /> : <PauseCircle size={10} />}
                              <span>{isSlavePaused ? 'Reactivate' : 'Pause'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleConfigStatus(cfg.id, cfg.status, false)}
                    style={{
                      backgroundColor: cfg.status === 'active' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      color: cfg.status === 'active' ? '#facc15' : '#34d399',
                      border: `1px solid ${cfg.status === 'active' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title={cfg.status === 'active' ? "Pause in memory" : "Reactivate in memory"}
                  >
                    {cfg.status === 'active' ? <PauseCircle size={13} /> : <Play size={13} />}
                    <span>{cfg.status === 'active' ? 'Pause' : 'Reactivate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => editConfig(cfg)}
                    style={{
                      backgroundColor: '#1e293b',
                      color: '#cbd5e1',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(cfg.id)}
                    style={{
                      backgroundColor: '#450a0a',
                      color: '#f87171',
                      border: '1px solid #7f1d1d',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}

      {/* TAB 2: Copied History */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Filter and Sorting Toolbar */}
          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Filter size={13} style={{ color: '#38bdf8' }} />

              {/* Sort/Filter by Slave Account */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Slave Acc:</span>
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px'
                  }}
                >
                  <option value="ALL">All Slave Accounts</option>
                  {distinctSlaveAccounts.map(acc => (
                    <option key={acc} value={acc}>Account #{acc}</option>
                  ))}
                </select>
              </div>

              {/* Sort/Filter by Copytrader Config */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Copytrader:</span>
                <select
                  value={filterConfigId}
                  onChange={(e) => setFilterConfigId(e.target.value)}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px'
                  }}
                >
                  <option value="ALL">All Setups / Configs</option>
                  {distinctConfigIds.map(cid => {
                    const cfg = configs.find(c => c.id === cid);
                    const label = cfg ? `${cfg.name} (${cid})` : cid;
                    return (
                      <option key={cid} value={cid}>{label}</option>
                    );
                  })}
                </select>
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px'
                  }}
                >
                  <option value="ALL">All (Open & Closed)</option>
                  <option value="open">Open Positions</option>
                  <option value="closed">Closed Trades</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Showing {filteredAndSortedHistory.length} copied deal(s)
              </span>
              <button
                type="button"
                onClick={fetchHistory}
                disabled={loadingHistory}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
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
                <RefreshCw size={11} style={{ animation: loadingHistory ? 'spin 1s linear infinite' : 'none' }} />
                <span>Reload</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            {filteredAndSortedHistory.length === 0 ? (
              <div style={{
                padding: '30px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '11px'
              }}>
                {loadingHistory ? 'Loading copied trade history from SQL...' : 'No copied trade records found matching your filters.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#020617', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                      <th
                        onClick={() => toggleSort('created_at')}
                        style={{ padding: '8px 10px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Copied At {sortField === 'created_at' && <ArrowUpDown size={11} style={{ color: '#38bdf8' }} />}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort('config_id')}
                        style={{ padding: '8px 10px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Copytrader Setup {sortField === 'config_id' && <ArrowUpDown size={11} style={{ color: '#38bdf8' }} />}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort('slave_account')}
                        style={{ padding: '8px 10px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Slave Account {sortField === 'slave_account' && <ArrowUpDown size={11} style={{ color: '#38bdf8' }} />}
                        </div>
                      </th>
                      <th style={{ padding: '8px 10px' }}>Master Ticket</th>
                      <th style={{ padding: '8px 10px' }}>Slave Ticket</th>
                      <th
                        onClick={() => toggleSort('symbol')}
                        style={{ padding: '8px 10px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Symbol {sortField === 'symbol' && <ArrowUpDown size={11} style={{ color: '#38bdf8' }} />}
                        </div>
                      </th>
                      <th style={{ padding: '8px 10px' }}>Action</th>
                      <th
                        onClick={() => toggleSort('lots')}
                        style={{ padding: '8px 10px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Lots {sortField === 'lots' && <ArrowUpDown size={11} style={{ color: '#38bdf8' }} />}
                        </div>
                      </th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistory.map((item) => {
                      const cfg = configs.find(c => c.id === item.config_id);
                      const isBuy = (item.action || '').toUpperCase() === 'BUY';
                      const isOpen = (item.status || '').toLowerCase() === 'open';

                      return (
                        <tr
                          key={item.id || `${item.config_id}_${item.master_ticket}_${item.slave_account}`}
                          style={{
                            borderBottom: '1px solid #1e293b',
                            backgroundColor: 'transparent'
                          }}
                        >
                          <td style={{ padding: '8px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {item.created_at || '-'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#f8fafc' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 'bold' }}>{cfg?.name || item.config_id}</span>
                              {cfg?.name && <span style={{ fontSize: '9px', color: '#64748b' }}>{item.config_id}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#38bdf8', fontWeight: 'bold' }}>
                            #{item.slave_account}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#eab308', fontFamily: 'monospace' }}>
                            {item.master_ticket}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#a855f7', fontFamily: 'monospace' }}>
                            {item.slave_ticket}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#f8fafc' }}>
                            {item.symbol}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 'bold',
                              backgroundColor: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: isBuy ? '#10b981' : '#ef4444'
                            }}>
                              {item.action}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#f8fafc', fontWeight: 'bold' }}>
                            {item.lots}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 'bold',
                              backgroundColor: isOpen ? '#064e3b' : '#1e293b',
                              color: isOpen ? '#34d399' : '#94a3b8',
                              textTransform: 'uppercase'
                            }}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalHistoryPages > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderTop: '1px solid #1e293b',
                backgroundColor: '#020617'
              }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                  Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}-{Math.min(historyPage * HISTORY_PAGE_SIZE, filteredAndSortedHistory.length)} of {filteredAndSortedHistory.length}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: historyPage <= 1 ? '#475569' : '#f8fafc',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      cursor: historyPage <= 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    <ChevronLeft size={11} /> Prev
                  </button>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#f8fafc', padding: '0 4px' }}>
                    {historyPage} / {totalHistoryPages}
                  </span>
                  <button
                    disabled={historyPage >= totalHistoryPages}
                    onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: historyPage >= totalHistoryPages ? '#475569' : '#f8fafc',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      cursor: historyPage >= totalHistoryPages ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    Next <ChevronRight size={11} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default Copytrader;
