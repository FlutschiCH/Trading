import React, { useState, useEffect } from 'react';
import { Users, Copy, Plus, Trash2, CheckCircle2, PauseCircle, Play, Laptop, Server, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../api';
import { useAccountsStore } from '../services/accountsStore';
import { useComputersStore, HARDCODED_HOSTS } from '../services/computersStore';
import AccountSelector from './account_selector';
import DebugComponentBadge from './debug_component_badge';

interface SlaveAccount {
  account_id: string;
  broker: string;
  mode: 'direct' | 'multiplier' | 'divider';
  multiplier: number;
  status: 'active' | 'paused';
}

interface CopytraderConfig {
  id: string;
  name: string;
  status: 'active' | 'paused';
  target_computer: string;
  master_account: string;
  master_broker: string;
  slaves: SlaveAccount[];
}

export const Copytrader: React.FC = () => {
  const { accounts, refreshAccounts } = useAccountsStore();
  const { computers, refreshComputers } = useComputersStore();
  const [configs, setConfigs] = useState<CopytraderConfig[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Form State
  const [name, setName] = useState('');
  const [targetComputer, setTargetComputer] = useState('All');
  const [masterAccount, setMasterAccount] = useState('');
  const [masterBroker, setMasterBroker] = useState('metatrader');
  const [slaves, setSlaves] = useState<SlaveAccount[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchConfigs(), refreshAccounts(), refreshComputers()]);
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

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setTargetComputer('All');
    setMasterAccount('');
    setMasterBroker('metatrader');
    setSlaves([]);
  };

  const editConfig = (cfg: CopytraderConfig) => {
    setEditingId(cfg.id);
    setName(cfg.name);
    setTargetComputer(cfg.target_computer || 'All');
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
            <span>{refreshing ? 'Refreshing...' : 'Refresh Configs'}</span>
          </button>
        </div>
      </div>

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
                      width: '110px',
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
                  </select>

                  {(slave.mode === 'multiplier' || slave.mode === 'divider') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '80px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {slave.mode === 'divider' ? '÷' : 'x'}
                      </span>
                      <input
                        type="number"
                        step="0.1"
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
                    <span>Target: <strong style={{ color: '#cbd5e1' }}>{cfg.target_computer}</strong></span>
                    <span>Master: <strong style={{ color: '#60a5fa' }}>{cfg.master_account}</strong></span>
                    <span>Slaves: <strong style={{ color: '#34d399' }}>{cfg.slaves?.length || 0}</strong></span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
    </div>
  );
};
export default Copytrader;
