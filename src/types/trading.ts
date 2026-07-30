export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vsa_patterns?: string[];
  weis_wave_volume?: number;
  tr_high?: number;
  tr_low?: number;
  sweep_high?: number;
  sweep_low?: number;
  backtest_signal?: 'BUY' | 'SELL';
  sma_20?: number;
  wyckoff_stage?: string;
  support_level?: number;
  resistance_level?: number;
  wyckoff_signal?: string;
}

export interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  currency: string;
  account_type?: string;
  broker?: string;
}

export interface Position {
  position_id: number;
  symbol: string;
  trade_side: string;
  volume: number;
  entry_price: number;
  unrealized_profit: number;
}

export interface Trade {
  id?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  slPrice?: number;
  tpPrice?: number;
  pnl?: number;
  timestamp: number;
}
