import React, { useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, Shield, Server, Key, User, HardDrive, Layers, Globe, Edit2 } from 'lucide-react';
import { useAccountsStore, type AccountItem } from '../services/accountsStore';
import { API_BASE_URL } from '../api';

interface AccountManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountManagement: React.FC<AccountManagementProps> = ({ isOpen, onClose }) => {
  const { accounts, activeAccountId, refreshAccounts, switchAccount } = useAccountsStore();

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [brokerType, setBrokerType] = useState<'ctrader' | 'metatrader' | 'binance'>('ctrader');
  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [terminalPath, setTerminalPath] = useState('');
  const [pluginPath, setPluginPath] = useState('');

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setBrokerType('ctrader');
    setAccountId('');
    setPassword('');
    setServer('');
    setTerminalPath('');
    setPluginPath('');
    setEditingAccountId(null);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleEditAccount = (acc: AccountItem) => {
    setEditingAccountId(String(acc.account_id));
    setName(acc.name || '');
    const bType = (acc.broker_type || 'ctrader').toLowerCase();
    if (bType.includes('binance')) {
      setBrokerType('binance');
    } else if (bType.includes('metatrader') || bType.includes('mt5')) {
      setBrokerType('metatrader');
    } else {
      setBrokerType('ctrader');
    }
    setAccountId(String(acc.account_id || ''));
    setPassword(acc.password || '');
    setServer(acc.server || '');
    setTerminalPath(acc.terminal_path || '');
    setPluginPath(acc.plugin_path || '');
    setErrorMsg('');
    setSuccessMsg('');
    setActiveTab('create');
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !accountId) {
      setErrorMsg('Account name and Account ID are required.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          broker_type: brokerType,
          account_id: accountId,
          password: password || undefined,
          server: server || undefined,
          terminal_path: terminalPath || undefined,
          plugin_path: pluginPath || undefined,
        }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        setSuccessMsg(editingAccountId ? 'Account updated successfully!' : 'Account created successfully!');
        await refreshAccounts();
        resetForm();
        setActiveTab('list');
      } else {
        setErrorMsg(data.message || 'Failed to save account');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error while saving account');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (targetId: string, accName: string) => {
    if (!window.confirm(`Are you sure you want to delete account "${accName}" (${targetId})?`)) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: targetId }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        await refreshAccounts();
      } else {
        alert(`Error deleting account: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Failed to delete account: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectActive = async (targetId: string) => {
    setLoading(true);
    await switchAccount(targetId);
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '16px',
    }}>
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#1e293b',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={20} style={{ color: '#3b82f6' }} />
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px', fontWeight: 'bold' }}>
              Account Management
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0b0f19',
        }}>
          <button
            onClick={() => setActiveTab('list')}
            style={{
              flex: 1,
              padding: '12px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'list' ? '2px solid #3b82f6' : 'none',
              color: activeTab === 'list' ? '#3b82f6' : '#94a3b8',
              fontWeight: activeTab === 'list' ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Connected Accounts ({accounts.length})
          </button>
          <button
            onClick={() => {
              if (activeTab !== 'create' || editingAccountId) {
                resetForm();
              }
              setActiveTab('create');
            }}
            style={{
              flex: 1,
              padding: '12px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'create' ? '2px solid #3b82f6' : 'none',
              color: activeTab === 'create' ? '#3b82f6' : '#94a3b8',
              fontWeight: activeTab === 'create' ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {editingAccountId ? <Edit2 size={14} /> : <Plus size={14} />}
            {editingAccountId ? 'Edit Account' : 'Add New Account'}
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'list' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {accounts.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '32px 0', fontSize: '13px' }}>
                  No trading accounts registered yet.
                </div>
              ) : (
                accounts.map((acc: AccountItem) => {
                  const isActive = String(acc.account_id) === String(activeAccountId);
                  const brokerLower = (acc.broker_type || 'metatrader').toLowerCase();
                  const isBinance = brokerLower.includes('binance');
                  const isCTrader = brokerLower.includes('ctrader');

                  return (
                    <div
                      key={String(acc.account_id)}
                      style={{
                        backgroundColor: isActive ? 'rgba(59, 130, 246, 0.08)' : '#1e293b',
                        border: `1px solid ${isActive ? '#3b82f6' : '#334155'}`,
                        borderRadius: '8px',
                        padding: '14px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontWeight: 'bold',
                            fontSize: '10px',
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: isBinance ? 'rgba(243, 186, 47, 0.2)' : isCTrader ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                            color: isBinance ? '#f3ba2f' : isCTrader ? '#f59e0b' : '#3b82f6',
                          }}>
                            {isBinance ? 'Binance Futures' : isCTrader ? 'cTrader' : 'MetaTrader 5'}
                          </span>
                          <span style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '14px' }}>
                            {acc.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '12px' }}>
                          <span title={String(acc.account_id)}>
                            ID: <strong style={{ color: '#cbd5e1' }}>
                              {String(acc.account_id).length > 15
                                ? `${String(acc.account_id).substring(0, 15)}...`
                                : acc.account_id}
                            </strong>
                          </span>
                          {acc.server && <span>Server: <strong style={{ color: '#cbd5e1' }}>{acc.server}</strong></span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {!isActive ? (
                          <button
                            onClick={() => handleSelectActive(String(acc.account_id))}
                            disabled={loading}
                            style={{
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              border: '1px solid #3b82f6',
                              color: '#3b82f6',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            Set Active
                          </button>
                        ) : (
                          <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#10b981',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            padding: '6px 12px',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            borderRadius: '6px',
                          }}>
                            <CheckCircle2 size={14} /> Active
                          </span>
                        )}

                        <button
                          onClick={() => handleEditAccount(acc)}
                          disabled={loading}
                          style={{
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: '#3b82f6',
                            padding: '6px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Edit Account"
                        >
                          <Edit2 size={16} />
                        </button>

                        <button
                          onClick={() => handleDeleteAccount(String(acc.account_id), acc.name)}
                          disabled={loading}
                          style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            padding: '6px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Delete Account"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {errorMsg && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 12px', borderRadius: '6px', fontSize: '12px' }}>
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', padding: '10px 12px', borderRadius: '6px', fontSize: '12px' }}>
                  {successMsg}
                </div>
              )}

              {/* Broker Type Selection */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '6px', fontWeight: 'bold' }}>
                  Broker Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {(['ctrader', 'metatrader', 'binance'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBrokerType(type)}
                      style={{
                        padding: '8px',
                        backgroundColor: brokerType === type ? '#3b82f6' : '#1e293b',
                        color: brokerType === type ? '#ffffff' : '#94a3b8',
                        border: `1px solid ${brokerType === type ? '#3b82f6' : '#334155'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'capitalize',
                      }}
                    >
                      {type === 'ctrader' ? 'cTrader' : type === 'metatrader' ? 'MT5' : 'Binance Futures'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Name */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                  Account Alias / Name *
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }} />
                  <input
                    type="text"
                    placeholder="e.g. FTMO Challenge #1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#0b0f19',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '8px 12px 8px 34px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Account ID / API Key */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                  {brokerType === 'binance' ? 'API Key *' : 'Account ID / Login Number *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <Layers size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }} />
                  <input
                    type="text"
                    placeholder={brokerType === 'binance' ? 'Binance API Key (e.g. vmPU...)' : 'e.g. 50912344'}
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#0b0f19',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '8px 12px 8px 34px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Password / API Secret */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                  {brokerType === 'binance' ? 'API Secret Key *' : 'Password / Investor Pass'}
                </label>
                <div style={{ position: 'relative' }}>
                  <Key size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }} />
                  <input
                    type="password"
                    placeholder={brokerType === 'binance' ? 'Binance API Secret Key' : 'Optional Password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={brokerType === 'binance'}
                    style={{
                      width: '100%',
                      backgroundColor: '#0b0f19',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '8px 12px 8px 34px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Server Name (Not for Binance) */}
              {brokerType !== 'binance' && (
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                    Server / Host
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Server size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }} />
                    <input
                      type="text"
                      placeholder="e.g. FTMO-Demo"
                      value={server}
                      onChange={(e) => setServer(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0b0f19',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '8px 12px 8px 34px',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* MT5 Advanced Paths */}
              {brokerType === 'metatrader' && (
                <>
                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                      Terminal Executable Path (Optional)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <HardDrive size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }} />
                      <input
                        type="text"
                        placeholder="C:\Program Files\MetaTrader 5\terminal64.exe"
                        value={terminalPath}
                        onChange={(e) => setTerminalPath(e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: '#0b0f19',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '8px 12px 8px 34px',
                          color: '#f8fafc',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '13px',
                  marginTop: '8px',
                }}
              >
                {loading ? 'Saving...' : editingAccountId ? 'Update Account' : 'Save Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountManagement;
