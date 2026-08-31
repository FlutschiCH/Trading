import React from 'react';
import { useAccountsStore, type AccountItem } from '../services/accountsStore';

export interface AccountSelectorProps {
  value: string;
  onChange: (accountId: string, account?: AccountItem) => void;
  placeholder?: string;
  filter?: (account: AccountItem) => boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  showBrokerTag?: boolean;
}

export const AccountSelector: React.FC<AccountSelectorProps> = ({
  value,
  onChange,
  placeholder = 'Select Account...',
  filter,
  disabled = false,
  className,
  style,
  showBrokerTag = true,
}) => {
  const { accounts, loadingAccounts } = useAccountsStore();

  const filteredAccounts = filter
    ? accounts.filter((a) => filter({ ...a, account_id: String(a.account_id) }))
    : accounts;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedAccount = accounts.find((a) => String(a.account_id) === String(selectedId));
    onChange(selectedId, selectedAccount);
  };

  const defaultStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#020617',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '6px 8px',
    color: '#f8fafc',
    fontSize: '12px',
    outline: 'none',
    ...style,
  };

  return (
    <select
      value={String(value || '')}
      onChange={handleChange}
      disabled={disabled || loadingAccounts}
      className={className}
      style={defaultStyle}
    >
      <option value="">{loadingAccounts ? 'Loading accounts...' : placeholder}</option>
      {filteredAccounts.map((acc) => {
        const accIdStr = String(acc.account_id || '');
        const shortId = accIdStr.length > 6 ? `...${accIdStr.slice(-6)}` : accIdStr;
        return (
          <option key={accIdStr} value={accIdStr}>
            {acc.name} ({shortId})
            {showBrokerTag && acc.broker_type ? ` - ${acc.broker_type.toUpperCase()}` : ''}
          </option>
        );
      })}
    </select>
  );
};

export default AccountSelector;
