import pandas as pd
import json
from vsa import analyze_vsa_patterns
from weis_wave import compute_weis_wave
from execution import execute_signal

class TradingHandler:
    @staticmethod
    def process_webhook_signal(signal_data: dict) -> dict:
        """
        Processes an incoming webhook signal, validates using Risk safeguards, and executes.
        """
        # Execute order using execution.py controller
        return execute_signal(signal_data)

    @staticmethod
    def analyze_market_data(bars_list: list, lookback: int = 20) -> dict:
        """
        Takes raw candlestick data, runs Wyckoff VSA and Weis Wave Volume analysis,
        and returns the annotated dataset.
        """
        if not bars_list:
            return {"status": "success", "data": []}
            
        df = pd.DataFrame(bars_list)
        # Required columns: time, open, high, low, close, volume
        # Check and cast
        for col in ['open', 'high', 'low', 'close', 'volume']:
            if col in df.columns:
                df[col] = df[col].astype(float)
        
        # Calculate VSA patterns
        patterns = analyze_vsa_patterns(df, lookback=lookback)
        df['vsa_patterns'] = patterns
        
        # Calculate Weis Wave Volume
        df = compute_weis_wave(df)
        
        # Convert df back to dict
        result_data = df.to_dict(orient='records')
        return {"status": "success", "data": result_data}

    @staticmethod
    def run_backtest(
        candles: list,
        symbol: str,
        sl_val: float,
        sl_type: str,
        rr: float,
        size: float,
        initial_balance: float,
        use_risk_sizing: bool,
        risk_pct: float,
        use_break_even: bool,
        be_trigger_r: float,
        lookback_window: int,
        fees_percent: float = 0.0
    ) -> dict:
        """
        Runs the full Wyckoff VSA & Weis Wave backtest simulation in Python.
        """
        # First compute indicators using existing handler
        analysis = TradingHandler.analyze_market_data(candles, lookback=lookback_window)
        annotated_data = list(analysis.get('data', []))
        
        if not annotated_data:
            return {
                "trades": [], "winRate": 0.0, "netPnl": 0.0, "profitFactor": 0.0,
                "totalTrades": 0, "maxDrawdown": 0.0, "maxDailyLoss": 0.0,
                "dailyLossBreached": False, "candles": [],
                "monthlyBreakdown": {}, "weeklyBreakdown": {}
            }

        active_trade = None
        completed_trades = []
        current_balance = initial_balance
        
        # Determine decimal precision dynamically from the input candle data
        precision = 2
        for c in annotated_data[:20]:
            close_val_str = str(c.get('close', ''))
            if '.' in close_val_str:
                precision = max(precision, len(close_val_str.split('.')[1]))
        
        # Helper to determine pip size dynamically based on asset conventions
        def get_pip_size(sym: str, price: float) -> float:
            sym_upper = sym.upper()
            if 'JPY' in sym_upper:
                return 0.01
            if 'XAU' in sym_upper or 'GOLD' in sym_upper or 'XAG' in sym_upper:
                return 0.1
            is_crypto_pair = any(c in sym_upper for c in ['BTC', 'ETH', 'SOL', 'LTC', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'UNI', 'PEPE', 'SHIB'])
            if is_crypto_pair:
                if price > 1000:
                    return 1.0
                elif price > 10:
                    return 0.1
                return 0.001
            forex_currencies = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'SEK', 'NOK', 'SGD', 'HKD', 'ZAR', 'MXN']
            if any(curr in sym_upper for curr in forex_currencies):
                return 0.0001
            if price > 1000:
                return 1.0
            elif price > 100:
                return 0.1
            elif price > 1:
                return 0.01
            return 0.0001

        # Helper to determine quote currency exchange rate divisor to convert to USD
        def get_quote_usd_rate(sym: str, price: float) -> float:
            sym_upper = sym.upper()
            if sym_upper.endswith('USD') or sym_upper.endswith('USDT') or sym_upper.endswith('BUSD'):
                return 1.0
            if sym_upper.startswith('USD'):
                return price
            if sym_upper.endswith('JPY'):
                return 150.0
            if sym_upper.endswith('CAD'):
                return 1.35
            if sym_upper.endswith('CHF'):
                return 0.90
            if sym_upper.endswith('GBP'):
                return 0.80
            return 1.0

        # Helper to determine lot size / contract size multiplier
        def get_lot_size(sym: str) -> float:
            sym_upper = sym.upper()
            if 'XAU' in sym_upper or 'GOLD' in sym_upper or 'XAG' in sym_upper:
                return 100.0
            is_crypto_pair = any(c in sym_upper for c in ['BTC', 'ETH', 'SOL', 'LTC', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'UNI', 'PEPE', 'SHIB'])
            if is_crypto_pair:
                return 1.0
            forex_currencies = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'SEK', 'NOK', 'SGD', 'HKD', 'ZAR', 'MXN']
            if any(curr in sym_upper for curr in forex_currencies):
                return 100000.0
            return 1.0

        first_candle = annotated_data[0]
        close_price = float(first_candle.get('close', 0))
        pip_size = get_pip_size(symbol, close_price)
        lot_size = get_lot_size(symbol)

        for i, c in enumerate(annotated_data):
            vsa_pat = c.get('vsa_patterns', '')
            if not vsa_pat:
                vsa_pat = []
            elif isinstance(vsa_pat, str):
                vsa_pat = [x.strip() for x in vsa_pat.split(',') if x.strip()]
                
            is_bullish_vsa = any(p in vsa_pat for p in ['Shakeout/Spring', 'Stopping Volume', 'No Supply'])
            is_bearish_vsa = any(p in vsa_pat for p in ['Upthrust', 'No Demand'])
            
            sweep_low = c.get('sweep_low')
            sweep_high = c.get('sweep_high')
            
            should_buy = False
            should_sell = False
            
            # Use float casts to prevent comparison errors
            low_val = float(c.get('low', 0))
            high_val = float(c.get('high', 0))
            close_val = float(c.get('close', 0))
            
            if sweep_low is not None:
                sweep_low = float(sweep_low)
                should_buy = bool(is_bullish_vsa and low_val < sweep_low and close_val > sweep_low)
            if sweep_high is not None:
                sweep_high = float(sweep_high)
                should_sell = bool(is_bearish_vsa and high_val > sweep_high and close_val < sweep_high)

            if active_trade:
                closed = False
                exit_price = close_val
                pnl = 0.0
                outcome = 'LOSS'
                exit_reason = ''
                
                # Check Break Even
                if use_break_even and not active_trade.get('is_break_even', False):
                    sl_distance = active_trade['sl_distance']
                    if active_trade['type'] == 'BUY':
                        if high_val >= active_trade['entry_price'] + sl_distance * be_trigger_r:
                            active_trade['sl_price'] = active_trade['entry_price']
                            active_trade['is_break_even'] = True
                    else:
                        if low_val <= active_trade['entry_price'] - sl_distance * be_trigger_r:
                            active_trade['sl_price'] = active_trade['entry_price']
                            active_trade['is_break_even'] = True

                # Check opposite sweep signals
                opposite_signal = (active_trade['type'] == 'BUY' and should_sell) or (active_trade['type'] == 'SELL' and should_buy)
                
                if opposite_signal:
                    exit_price = close_val
                    gross_pnl = (exit_price - active_trade['entry_price']) * (active_trade['qty'] * lot_size) if active_trade['type'] == 'BUY' else (active_trade['entry_price'] - exit_price) * (active_trade['qty'] * lot_size)
                    entry_fee = active_trade['entry_price'] * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                    exit_fee = exit_price * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                    total_fees = entry_fee + exit_fee
                    pnl = gross_pnl - total_fees
                    outcome = 'WIN' if pnl >= 0 else 'LOSS'
                    closed = True
                    exit_reason = 'Closed by opposite sweep signal'
                elif active_trade['type'] == 'BUY':
                    if low_val <= active_trade['sl_price']:
                        exit_price = active_trade['sl_price']
                        gross_pnl = (exit_price - active_trade['entry_price']) * (active_trade['qty'] * lot_size)
                        entry_fee = active_trade['entry_price'] * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                        exit_fee = exit_price * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                        total_fees = entry_fee + exit_fee
                        pnl = gross_pnl - total_fees
                        outcome = 'WIN' if pnl >= 0 else 'LOSS'
                        closed = True
                        exit_reason = 'Hit Break Even' if active_trade.get('is_break_even', False) else 'Hit Stop Loss'
                    elif high_val >= active_trade['tp_price']:
                        exit_price = active_trade['tp_price']
                        gross_pnl = (exit_price - active_trade['entry_price']) * (active_trade['qty'] * lot_size)
                        entry_fee = active_trade['entry_price'] * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                        exit_fee = exit_price * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                        total_fees = entry_fee + exit_fee
                        pnl = gross_pnl - total_fees
                        outcome = 'WIN' if pnl >= 0 else 'LOSS'
                        closed = True
                        exit_reason = 'Hit Take Profit'
                else:
                    if high_val >= active_trade['sl_price']:
                        exit_price = active_trade['sl_price']
                        gross_pnl = (active_trade['entry_price'] - exit_price) * (active_trade['qty'] * lot_size)
                        entry_fee = active_trade['entry_price'] * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                        exit_fee = exit_price * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                        total_fees = entry_fee + exit_fee
                        pnl = gross_pnl - total_fees
                        outcome = 'WIN' if pnl >= 0 else 'LOSS'
                        closed = True
                        exit_reason = 'Hit Break Even' if active_trade.get('is_break_even', False) else 'Hit Stop Loss'
                    elif low_val <= active_trade['tp_price']:
                        exit_price = active_trade['tp_price']
                        gross_pnl = (active_trade['entry_price'] - exit_price) * (active_trade['qty'] * lot_size)
                        entry_fee = active_trade['entry_price'] * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                        exit_fee = exit_price * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
                        total_fees = entry_fee + exit_fee
                        pnl = gross_pnl - total_fees
                        outcome = 'WIN' if pnl >= 0 else 'LOSS'
                        closed = True
                        exit_reason = 'Hit Take Profit'

                if closed:
                    # Resolve exit time string
                    try:
                        time_str = str(pd.to_datetime(int(c.get('time', 0)), unit='s'))
                    except Exception:
                        time_str = 'Open'
                        
                    pnl_usd = pnl / active_trade['quote_usd_rate']
                    fees_usd = total_fees / active_trade['quote_usd_rate']
                    completed_trades.append({
                        'id': len(completed_trades) + 1,
                        'type': active_trade['type'],
                        'entryPrice': float(active_trade['entry_price']),
                        'exitPrice': float(exit_price),
                        'pnl': float(pnl_usd),
                        'fees': float(fees_usd),
                        'outcome': outcome,
                        'time': time_str,
                        'timestamp': int(c.get('time', 0)),
                        'slPrice': float(active_trade['sl_price']),
                        'tpPrice': float(active_trade['tp_price']),
                        'entryTimestamp': int(active_trade['entry_timestamp']),
                        'exitTimestamp': int(c.get('time', 0)),
                        'exitReason': exit_reason,
                        'duration': int(i - active_trade['entry_index'] + 1),
                        'qty': float(active_trade['qty'])
                    })
                    current_balance += pnl_usd
                    active_trade = None

            if not active_trade:
                if should_buy or should_sell:
                    trade_type = 'BUY' if should_buy else 'SELL'
                    c['backtest_signal'] = trade_type
                    entry_price = close_val
                    
                    if sl_type == 'pct':
                        sl_distance = entry_price * (sl_val / 100.0)
                    else:
                        sl_distance = sl_val * pip_size
                        
                    sl_price = round(entry_price - sl_distance, precision) if trade_type == 'BUY' else round(entry_price + sl_distance, precision)
                    tp_price = round(entry_price + sl_distance * rr, precision) if trade_type == 'BUY' else round(entry_price - sl_distance * rr, precision)
                    
                    quote_usd_rate = get_quote_usd_rate(symbol, entry_price)
                    trade_qty = size
                    if use_risk_sizing:
                        risk_amount = current_balance * (risk_pct / 100.0)
                        trade_qty = (risk_amount * quote_usd_rate / (sl_distance * lot_size)) if (sl_distance > 0 and lot_size > 0) else size
                        
                    active_trade = {
                        'type': trade_type,
                        'entry_price': entry_price,
                        'sl_price': sl_price,
                        'tp_price': tp_price,
                        'qty': trade_qty,
                        'entry_index': i,
                        'entry_timestamp': int(c.get('time', 0)),
                        'is_break_even': False,
                        'sl_distance': sl_distance,
                        'quote_usd_rate': quote_usd_rate
                    }

        if active_trade:
            final_candle = annotated_data[-1]
            close_val = float(final_candle.get('close', 0))
            gross_pnl = (close_val - active_trade['entry_price']) * (active_trade['qty'] * lot_size) if active_trade['type'] == 'BUY' else (active_trade['entry_price'] - close_val) * (active_trade['qty'] * lot_size)
            entry_fee = active_trade['entry_price'] * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
            exit_fee = close_val * (active_trade['qty'] * lot_size) * (fees_percent / 100.0)
            total_fees = entry_fee + exit_fee
            pnl = gross_pnl - total_fees
            pnl_usd = pnl / active_trade['quote_usd_rate']
            fees_usd = total_fees / active_trade['quote_usd_rate']
            completed_trades.append({
                'id': len(completed_trades) + 1,
                'type': active_trade['type'],
                'entryPrice': float(active_trade['entry_price']),
                'exitPrice': float(close_val),
                'pnl': float(pnl_usd),
                'fees': float(fees_usd),
                'outcome': 'WIN' if pnl_usd >= 0 else 'LOSS',
                'time': 'Open',
                'timestamp': int(final_candle.get('time', 0)),
                'slPrice': float(active_trade['sl_price']),
                'tpPrice': float(active_trade['tp_price']),
                'entryTimestamp': int(active_trade['entry_timestamp']),
                'exitTimestamp': int(final_candle.get('time', 0)),
                'exitReason': 'Position still open',
                'duration': int(len(annotated_data) - active_trade['entry_index']),
                'qty': float(active_trade['qty'])
            })
            current_balance += pnl_usd

        total_trades = len(completed_trades)
        wins = len([t for t in completed_trades if t['outcome'] == 'WIN'])
        win_rate = (wins / total_trades) * 100.0 if total_trades > 0 else 0.0
        net_pnl = sum(t['pnl'] for t in completed_trades)

        gross_profits = sum(t['pnl'] for t in completed_trades if t['pnl'] > 0)
        gross_losses = abs(sum(t['pnl'] for t in completed_trades if t['pnl'] < 0))
        profit_factor = gross_profits / gross_losses if gross_losses > 0 else (99.9 if gross_profits > 0 else 0.0)

        running_balance = initial_balance
        peak_bal = running_balance
        max_drawdown = 0.0

        day_pnl_map = {}
        day_start_bal_map = {}

        for t in completed_trades:
            trade_time_sec = t['timestamp']
            try:
                date_str = str(pd.to_datetime(trade_time_sec, unit='s').date())
            except Exception:
                date_str = 'Unknown'
                
            if date_str not in day_start_bal_map:
                day_start_bal_map[date_str] = running_balance
                day_pnl_map[date_str] = 0.0
                
            running_balance += t['pnl']
            day_pnl_map[date_str] += t['pnl']
            
            if running_balance > peak_bal:
                peak_bal = running_balance
            dd = ((peak_bal - running_balance) / peak_bal) * 100.0 if peak_bal > 0 else 0.0
            if dd > max_drawdown:
                max_drawdown = dd

        max_daily_loss = 0.0
        daily_loss_breached = False

        for day, start_b in day_start_bal_map.items():
            day_loss = day_pnl_map[day]
            if day_loss < 0 and start_b > 0:
                loss_pct = (abs(day_loss) / start_b) * 100.0
                if loss_pct > max_daily_loss:
                    max_daily_loss = loss_pct
                if loss_pct >= 5.0:
                    daily_loss_breached = True

        monthly_breakdown = {}
        weekly_breakdown = {}

        for t in completed_trades:
            ts = t['timestamp']
            try:
                dt = pd.to_datetime(ts, unit='s')
                month_key = f"{dt.year}-{dt.month:02d}"
                monthly_breakdown[month_key] = monthly_breakdown.get(month_key, 0.0) + t['pnl']
                
                week_key = f"{dt.year}-W{dt.isocalendar()[1]:02d}"
                weekly_breakdown[week_key] = weekly_breakdown.get(week_key, 0.0) + t['pnl']
            except Exception:
                pass

        # Reverse list of trades to match React frontend sorting (newest first)
        reversed_trades = list(reversed(completed_trades))

        return {
            "trades": reversed_trades,
            "winRate": float(win_rate),
            "netPnl": float(net_pnl),
            "profitFactor": float(profit_factor),
            "totalTrades": int(total_trades),
            "maxDrawdown": float(max_drawdown),
            "maxDailyLoss": float(max_daily_loss),
            "dailyLossBreached": bool(daily_loss_breached),
            "candles": annotated_data,
            "monthlyBreakdown": monthly_breakdown,
            "weeklyBreakdown": weekly_breakdown
        }
