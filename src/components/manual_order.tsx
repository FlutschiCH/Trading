import React from 'react';

interface Position {
  position_id: string;
  symbol: string;
  trade_side: 'BUY' | 'SELL';
  volume: number;
  entry_price: number;
  unrealized_profit: number;
}

interface AccountInfo {
  balance: number;
  equity: number;
  margin_free: number;
  currency: string;
}

interface ManualOrderProps {
  tradeType: 'buy' | 'sell';
  setTradeType: (val: 'buy' | 'sell') => void;
  orderType: 'market' | 'limit';
  setOrderType: (val: 'market' | 'limit') => void;
  price: string;
  setPrice: (val: string) => void;
  amount: string;
  setAmount: (val: string) => void;
  handleExecuteTrade: (e: React.FormEvent) => void;
  accountInfo: AccountInfo | null;
  openPositions: Position[];
  symbol: string;
  styles: any;
}

export default function ManualOrder({
  tradeType,
  setTradeType,
  orderType,
  setOrderType,
  price,
  setPrice,
  amount,
  setAmount,
  handleExecuteTrade,
  accountInfo,
  openPositions,
  symbol,
  styles
}: ManualOrderProps) {
  return (
    <div className="no-drag" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={styles.tradeTypeTabs}>
        <button 
          onClick={() => setTradeType('buy')}
          style={styles.tradeTypeBtn(tradeType === 'buy', true)}
        >
          BUY
        </button>
        <button 
          onClick={() => setTradeType('sell')}
          style={styles.tradeTypeBtn(tradeType === 'sell', false)}
        >
          SELL
        </button>
      </div>

      {accountInfo && (
        <div style={{ ...styles.walletContainer, marginTop: '12px' }}>
          <div style={styles.walletRow}>
            <span style={{ color: '#9ca3af' }}>Balance:</span>
            <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{accountInfo.balance} {accountInfo.currency}</span>
          </div>
          <div style={styles.walletRow}>
            <span style={{ color: '#9ca3af' }}>Free Margin:</span>
            <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{accountInfo.margin_free} {accountInfo.currency}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleExecuteTrade} style={{ ...styles.tradeForm, marginTop: '12px' }}>
        <div style={styles.orderTypeTabs}>
          <button
            type="button"
            onClick={() => setOrderType('market')}
            style={styles.orderTypeBtn(orderType === 'market')}
          >
            MARKET
          </button>
          <button
            type="button"
            onClick={() => setOrderType('limit')}
            style={styles.orderTypeBtn(orderType === 'limit')}
          >
            LIMIT
          </button>
        </div>

        {orderType === 'limit' && (
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af' }}>Limit Price (USDT)</label>
            <input 
              type="number" 
              value={price} 
              onChange={(e) => setPrice(e.target.value)}
              style={styles.input}
              step="0.01"
              required
            />
          </div>
        )}

        <div style={styles.formGroup}>
          <label style={{ color: '#9ca3af' }}>Quantity ({symbol.replace('BINANCE:', '')})</label>
          <input 
            type="number" 
            value={amount} 
            onChange={(e) => setAmount(e.target.value)}
            style={styles.input}
            step="0.01"
            min="0.01"
            required
          />
        </div>

        <button 
          type="submit" 
          style={styles.submitBtn(tradeType === 'buy')}
        >
          Submit Order
        </button>
      </form>

      {/* Position Display */}
      {openPositions.length > 0 && (
        <div style={{ marginTop: '16px', flex: 1, overflowY: 'auto' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af' }}>
            Positions ({openPositions.length})
          </span>
          <div style={styles.positionsList}>
            {openPositions.map((pos) => (
              <div key={pos.position_id} style={styles.positionRow}>
                <div style={styles.posDetails}>
                  <span style={styles.posSide(pos.trade_side === 'BUY')}>{pos.trade_side} {pos.volume}</span>
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>{pos.symbol}</span>
                </div>
                <span style={styles.posPnl(pos.unrealized_profit >= 0)}>
                  ${pos.unrealized_profit.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
