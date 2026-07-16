import pandas as pd
import json
from indicator_handler import IndicatorHandler
from trading_handler import TradingHandler

class StrategyHandler:
    @staticmethod
    def analyze_market_data(bars_list: list, lookback: int = 20) -> dict:
        """
        Takes raw candlestick data, runs Wyckoff VSA and Weis Wave Volume analysis,
        and returns the annotated dataset.
        """
        if not bars_list:
            return {"status": "success", "data": [], "fvgs": []}
            
        from wyckoff_handler import WyckoffHandler
        wyckoff_candles = WyckoffHandler.analyze_wyckoff_structure(bars_list, lookback=lookback)
        
        df = pd.DataFrame(wyckoff_candles)
        # Required columns: time, open, high, low, close, volume
        # Check and cast
        for col in ['open', 'high', 'low', 'close', 'volume']:
            if col in df.columns:
                df[col] = df[col].astype(float)
        
        # Calculate VSA patterns using IndicatorHandler
        patterns = IndicatorHandler.compute_vsa(df, lookback=lookback)
        df['vsa_patterns'] = patterns
        
        # Calculate Weis Wave Volume using IndicatorHandler
        df = IndicatorHandler.compute_weis_wave(df)
        
        # Compute FVGs using IndicatorHandler
        fvgs = IndicatorHandler.compute_fvgs(df)
        
        # Convert df back to dict
        result_data = df.to_dict(orient='records')
        return {"status": "success", "data": result_data, "fvgs": fvgs}

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
        fees_percent: float = 0.0,
        daily_retry_limit: int = 0,
        allow_opposite_close: bool = True,
        check_cancelled = None,
        date_from: float = None,
        date_to: float = None,
        timezone: str = 'Local',
        sessions: list = None,
        use_global_close: bool = False,
        global_close_time: str = ''
    ) -> dict:
        """
        Runs the full Wyckoff VSA & Weis Wave backtest simulation in Python.
        """
        # Helper to convert timestamp to naive datetime in specified timezone
        def get_candle_datetime(ts, tz_str):
            from datetime import datetime, timezone as pytimezone
            if tz_str == 'UTC':
                return datetime.fromtimestamp(ts, tz=pytimezone.utc).replace(tzinfo=None)
            else:
                return datetime.fromtimestamp(ts)

        # Helper to check if datetime falls within defined sessions
        def is_datetime_in_sessions(dt, sessions_list):
            if not sessions_list:
                return True, None
            wd = dt.weekday() + 1 # 1=Mon, ..., 7=Sun
            time_val = dt.time()
            for s in sessions_list:
                weekdays = s.get("weekdays", [])
                if wd not in weekdays:
                    continue
                try:
                    sh, sm = map(int, s.get("start", "00:00").split(":"))
                    eh, em = map(int, s.get("end", "23:59").split(":"))
                except ValueError:
                    continue
                
                from datetime import time
                start_time = time(sh, sm)
                end_time = time(eh, em)
                if start_time <= end_time:
                    if start_time <= time_val <= end_time:
                        return True, s
                else:
                    if time_val >= start_time or time_val <= end_time:
                        return True, s
            return False, None

        # Helper to check if datetime is in a specific session
        def is_in_specific_session(dt, s):
            if not s:
                return True
            wd = dt.weekday() + 1
            time_val = dt.time()
            weekdays = s.get("weekdays", [])
            if wd not in weekdays:
                return False
            try:
                sh, sm = map(int, s.get("start", "00:00").split(":"))
                eh, em = map(int, s.get("end", "23:59").split(":"))
            except ValueError:
                return False
            
            from datetime import time
            start_time = time(sh, sm)
            end_time = time(eh, em)
            if start_time <= end_time:
                return start_time <= time_val <= end_time
            else:
                return time_val >= start_time or time_val <= end_time

        # First compute indicators using existing handler
        analysis = StrategyHandler.analyze_market_data(candles, lookback=lookback_window)
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
        daily_trades_count = {}
        
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
            if check_cancelled and check_cancelled():
                break
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

            # Convert candle time to naive datetime in configured timezone
            candle_time = int(c.get('time', 0))
            dt_curr = get_candle_datetime(candle_time, timezone)

            # Check if current candle time is in session
            in_session, session_config = is_datetime_in_sessions(dt_curr, sessions)
            if not in_session:
                should_buy = False
                should_sell = False

            # Restrict new entry triggers to selected date range boundaries
            if date_from is not None and candle_time < int(date_from):
                should_buy = False
                should_sell = False
            if date_to is not None and candle_time > int(date_to):
                should_buy = False
                should_sell = False

            # Apply daily retry limit
            try:
                from datetime import datetime
                date_str = datetime.utcfromtimestamp(candle_time).strftime('%Y-%m-%d')
            except Exception:
                date_str = 'unknown'
            
            if daily_retry_limit > 0 and daily_trades_count.get(date_str, 0) >= daily_retry_limit:
                should_buy = False
                should_sell = False

            if active_trade:
                closed = False
                exit_price = close_val
                pnl = 0.0
                outcome = 'LOSS'
                exit_reason = ''
                
                # Check if session ended and we need to close
                if active_trade.get('session_close_on_end') and not is_in_specific_session(dt_curr, active_trade.get('session_config')):
                    exit_price = close_val
                    gross_pnl = (exit_price - active_trade['entry_price']) * (active_trade['qty'] * lot_size) if active_trade['type'] == 'BUY' else (active_trade['entry_price'] - exit_price) * (active_trade['qty'] * lot_size)
                    closed = True
                    exit_reason = 'Session ended (Auto-close)'
                
                # Check if global daily close time reached
                if not closed and use_global_close and global_close_time and len(global_close_time) == 5:
                    should_gc = False
                    try:
                        gh, gm = map(int, global_close_time.split(":"))
                        from datetime import time as dttime
                        g_time = dttime(gh, gm)
                        if i > 0:
                            dt_prev = get_candle_datetime(int(annotated_data[i-1].get('time', 0)), timezone)
                            if dt_curr.time() >= g_time:
                                if dt_prev.date() < dt_curr.date() or dt_prev.time() < g_time:
                                    should_gc = True
                        else:
                            if dt_curr.time() >= g_time:
                                should_gc = True
                    except Exception:
                        pass
                    
                    if should_gc:
                        exit_price = close_val
                        gross_pnl = (exit_price - active_trade['entry_price']) * (active_trade['qty'] * lot_size) if active_trade['type'] == 'BUY' else (active_trade['entry_price'] - exit_price) * (active_trade['qty'] * lot_size)
                        closed = True
                        exit_reason = f'Global daily close reached ({global_close_time})'
                
                # Check Break Even
                if not closed and use_break_even and not active_trade.get('is_break_even', False):
                    sl_distance = active_trade['sl_distance']
                    if active_trade['type'] == 'BUY':
                        if high_val >= active_trade['entry_price'] + sl_distance * be_trigger_r:
                            active_trade['sl_price'] = round(active_trade['entry_price'] + 0.5 * sl_distance, precision)
                            active_trade['is_break_even'] = True
                    else:
                        if low_val <= active_trade['entry_price'] - sl_distance * be_trigger_r:
                            active_trade['sl_price'] = round(active_trade['entry_price'] - 0.5 * sl_distance, precision)
                            active_trade['is_break_even'] = True

                # Check opposite sweep signals
                opposite_signal = False
                if not closed and allow_opposite_close:
                    opposite_signal = (active_trade['type'] == 'BUY' and should_sell) or (active_trade['type'] == 'SELL' and should_buy)
                
                if not closed and opposite_signal:
                    exit_price = close_val
                    gross_pnl = (exit_price - active_trade['entry_price']) * (active_trade['qty'] * lot_size) if active_trade['type'] == 'BUY' else (active_trade['entry_price'] - exit_price) * (active_trade['qty'] * lot_size)
                    closed = True
                    exit_reason = 'Closed by opposite sweep signal'
                elif not closed and active_trade['type'] == 'BUY':
                    if low_val <= active_trade['sl_price']:
                        exit_price = active_trade['sl_price']
                        gross_pnl = (exit_price - active_trade['entry_price']) * (active_trade['qty'] * lot_size)
                        closed = True
                        exit_reason = 'Hit Break Even' if active_trade.get('is_break_even', False) else 'Hit Stop Loss'
                    elif high_val >= active_trade['tp_price']:
                        exit_price = active_trade['tp_price']
                        gross_pnl = (exit_price - active_trade['entry_price']) * (active_trade['qty'] * lot_size)
                        closed = True
                        exit_reason = 'Hit Take Profit'
                elif not closed:
                    if high_val >= active_trade['sl_price']:
                        exit_price = active_trade['sl_price']
                        gross_pnl = (active_trade['entry_price'] - exit_price) * (active_trade['qty'] * lot_size)
                        closed = True
                        exit_reason = 'Hit Break Even' if active_trade.get('is_break_even', False) else 'Hit Stop Loss'
                    elif low_val <= active_trade['tp_price']:
                        exit_price = active_trade['tp_price']
                        gross_pnl = (active_trade['entry_price'] - exit_price) * (active_trade['qty'] * lot_size)
                        closed = True
                        exit_reason = 'Hit Take Profit'

                if closed:
                    # Fee is calculated as USD per lot per trade side (total = entry + exit sides = 2 * qty * fee_rate)
                    total_fees = 2 * (active_trade['qty'] * fees_percent)
                    pnl = gross_pnl - total_fees
                    outcome = 'WIN' if pnl >= 0 else 'LOSS'
                    
                    try:
                        time_str = str(pd.to_datetime(int(c.get('time', 0)), unit='s'))
                    except Exception:
                        time_str = 'Open'
                        
                    pnl_usd = pnl
                    fees_usd = total_fees
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
                        'originalSlPrice': float(active_trade['original_sl']),
                        'tpPrice': float(active_trade['tp_price']),
                        'entryTimestamp': int(active_trade['entry_timestamp']),
                        'exitTimestamp': int(c.get('time', 0)),
                        'exitReason': exit_reason,
                        'duration': int(i - active_trade['entry_index'] + 1),
                        'qty': float(active_trade['qty']),
                        'triggerReason': active_trade.get('trigger_reason')
                    })
                    current_balance += pnl_usd
                    active_trade = None

            if not active_trade:
                if should_buy or should_sell:
                    daily_trades_count[date_str] = daily_trades_count.get(date_str, 0) + 1
                    trade_type = 'BUY' if should_buy else 'SELL'
                    c['backtest_signal'] = trade_type
                    entry_price = close_val
                    
                    # Calculate entry/sl/tp/qty trade parameters using TradingHandler
                    trade_params = TradingHandler.calculate_trade_parameters(
                        symbol=symbol,
                        entry_price=entry_price,
                        direction=trade_type,
                        sl_type=sl_type,
                        sl_val=sl_val,
                        rr=rr,
                        size=size,
                        use_risk_sizing=use_risk_sizing,
                        risk_pct=risk_pct,
                        balance=current_balance,
                        lot_size=lot_size,
                        pip_size=pip_size,
                        precision=precision
                    )
                    
                    sl_price = trade_params["sl_price"]
                    tp_price = trade_params["tp_price"]
                    trade_qty = trade_params["qty"]
                    sl_distance = trade_params["sl_distance"]
                    
                    # Record entry triggers for display
                    vsa_trigger = ", ".join(vsa_pat) if vsa_pat else "None"
                    sweep_level = sweep_low if trade_type == 'BUY' else sweep_high
                    weis_trigger = float(c.get('weis_wave_volume', 0.0))
                    
                    active_trade = {
                        'type': trade_type,
                        'entry_price': entry_price,
                        'sl_price': sl_price,
                        'original_sl': sl_price,
                        'tp_price': tp_price,
                        'qty': trade_qty,
                        'entry_index': i,
                        'entry_timestamp': int(c.get('time', 0)),
                        'is_break_even': False,
                        'sl_distance': sl_distance,
                        'session_config': session_config,
                        'session_close_on_end': bool(session_config.get('closeOnEnd', False)) if session_config else False,
                        'trigger_reason': {
                            'vsa_patterns': vsa_trigger,
                            'sweep_level': float(sweep_level) if sweep_level is not None else None,
                            'weis_wave_volume': weis_trigger,
                            'entry_candle': {
                                'open': float(c.get('open', 0)),
                                'high': float(c.get('high', 0)),
                                'low': float(c.get('low', 0)),
                                'close': float(c.get('close', 0)),
                            }
                        }
                    }

        if active_trade:
            final_candle = annotated_data[-1]
            close_val = float(final_candle.get('close', 0))
            gross_pnl = (close_val - active_trade['entry_price']) * (active_trade['qty'] * lot_size) if active_trade['type'] == 'BUY' else (active_trade['entry_price'] - close_val) * (active_trade['qty'] * lot_size)
            # Fee is calculated as USD per lot per trade side (total = entry + exit sides = 2 * qty * fee_rate)
            total_fees = 2 * (active_trade['qty'] * fees_percent)
            pnl_usd = gross_pnl - total_fees
            fees_usd = total_fees
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
                'qty': float(active_trade['qty']),
                'triggerReason': active_trade.get('trigger_reason')
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

        # Save results to a compact JSON file for AI reference
        try:
            import os
            results_to_save = {
                "explainer": (
                    "This trading strategy uses Wyckoff Volume Spread Analysis (VSA) and Liquidity Sweeps. "
                    "Entry Conditions: "
                    "A BUY trade is entered if a bullish VSA pattern (Shakeout/Spring, Stopping Volume, or No Supply) "
                    "occurs, and the candle's low sweeps below the previous 'lookback_window' rolling low (support) "
                    "but closes back above it. "
                    "A SELL trade is entered if a bearish VSA pattern (Upthrust or No Demand) occurs, and the "
                    "candle's high sweeps above the previous 'lookback_window' rolling high (resistance) but closes back below it. "
                    "Exit Conditions: "
                    "Trades are closed by hitting the Stop Loss (configured as a %, in pips, or as a direct dollar risk amount), "
                    "hitting the Take Profit (calculated using the Risk-Reward ratio 'rr' multiplier times the stop loss distance), "
                    "getting stopped out at Break Even (if enabled and the trigger RR ratio is reached), "
                    "or by an opposite sweep signal."
                ),
                "settings": {
                    "symbol": symbol,
                    "sl_val": sl_val,
                    "sl_type": sl_type,
                    "rr": rr,
                    "size": size,
                    "initial_balance": initial_balance,
                    "use_risk_sizing": use_risk_sizing,
                    "risk_pct": risk_pct,
                    "use_break_even": use_break_even,
                    "be_trigger_r": be_trigger_r,
                    "lookback_window": lookback_window,
                    "fees_percent": fees_percent,
                    "date_from": date_from,
                    "date_to": date_to
                },
                "metrics": {
                    "winRate": float(win_rate),
                    "netPnl": float(net_pnl),
                    "profitFactor": float(profit_factor),
                    "totalTrades": int(total_trades),
                    "maxDrawdown": float(max_drawdown),
                    "maxDailyLoss": float(max_daily_loss),
                    "dailyLossBreached": bool(daily_loss_breached),
                    "candleCount": len(annotated_data)
                },
                "trades": completed_trades
            }
            results_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backtest_results.json')
            with open(results_path, 'w') as f:
                json.dump(results_to_save, f, indent=4)
        except Exception as e:
            print(f"Failed to save backtest results to JSON: {e}", flush=True)

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
            "weeklyBreakdown": weekly_breakdown,
            "fvgs": analysis.get('fvgs', [])
        }
