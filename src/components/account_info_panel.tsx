import React from 'react';
import { AccountInfo } from '../types/trading';
import { Wallet, DollarSign, Shield, PieChart } from 'lucide-react';

interface AccountInfoPanelProps {
  accountInfo: AccountInfo | null;
  activeAccountName?: string;
  isMobile?: boolean;
}

export const AccountInfoPanel: React.FC<AccountInfoPanelProps> = ({
  accountInfo,
  activeAccountName,
  isMobile = false,
}) => {
  if (!accountInfo) {
    return (
      <div style={{
        padding: '12px 16px',
        backgroundColor: 'var(--app-card-bg)',
        border: '1px solid var(--app-card-border)',
        borderRadius: '10px',
        color: 'var(--app-text-muted)',
        fontSize: '12px',
      }}>
        No account info connected.
      </div>
    );
  }

  const currencySymbol = accountInfo.currency || 'USD';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
      gap: '12px',
      width: '100%',
    }}>
      {/* Balance Card */}
      <div style={{
        backgroundColor: 'var(--app-card-bg)',
        border: '1px solid var(--app-card-border)',
        borderRadius: '10px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          color: '#3b82f6',
          padding: '8px',
          borderRadius: '8px',
        }}>
          <Wallet size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '11px', color: 'var(--app-text-muted)', fontWeight: '500' }}>
            Balance ({currencySymbol})
          </span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--app-text)' }}>
            {accountInfo.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </span>
        </div>
      </div>

      {/* Equity Card */}
      <div style={{
        backgroundColor: 'var(--app-card-bg)',
        border: '1px solid var(--app-card-border)',
        borderRadius: '10px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          padding: '8px',
          borderRadius: '8px',
        }}>
          <DollarSign size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '11px', color: 'var(--app-text-muted)', fontWeight: '500' }}>
            Equity
          </span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>
            {accountInfo.equity?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </span>
        </div>
      </div>

      {/* Margin Used */}
      <div style={{
        backgroundColor: 'var(--app-card-bg)',
        border: '1px solid var(--app-card-border)',
        borderRadius: '10px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          color: '#f59e0b',
          padding: '8px',
          borderRadius: '8px',
        }}>
          <Shield size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '11px', color: 'var(--app-text-muted)', fontWeight: '500' }}>
            Margin Used
          </span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--app-text)' }}>
            {accountInfo.margin?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </span>
        </div>
      </div>

      {/* Free Margin */}
      <div style={{
        backgroundColor: 'var(--app-card-bg)',
        border: '1px solid var(--app-card-border)',
        borderRadius: '10px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          color: '#8b5cf6',
          padding: '8px',
          borderRadius: '8px',
        }}>
          <PieChart size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '11px', color: 'var(--app-text-muted)', fontWeight: '500' }}>
            Free Margin
          </span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--app-text)' }}>
            {accountInfo.margin_free?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AccountInfoPanel;
