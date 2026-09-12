import time
from datetime import datetime, timezone as pytimezone, time as dt_time

def get_candle_datetime(ts: float, tz_str: str) -> datetime:
    """
    Helper to convert timestamp to naive datetime in specified timezone.
    """
    if tz_str == 'UTC':
        return datetime.fromtimestamp(ts, tz=pytimezone.utc).replace(tzinfo=None)
    else:
        return datetime.fromtimestamp(ts)

def is_datetime_in_sessions(dt: datetime, sessions_list: list) -> tuple:
    """
    Helper to check if datetime falls within defined sessions.
    """
    active_sessions = [s for s in sessions_list if s.get("active", True)] if sessions_list else []
    if not active_sessions:
        return True, None
    wd = dt.weekday() + 1  # 1=Mon, ..., 7=Sun
    time_val = dt.time()
    for s in active_sessions:
        weekdays = s.get("weekdays", [])
        if wd not in weekdays:
            continue
        try:
            sh, sm = map(int, s.get("start", "00:00").split(":"))
            eh, em = map(int, s.get("end", "23:59").split(":"))
        except ValueError:
            continue
        
        start_time = dt_time(sh, sm)
        end_time = dt_time(eh, em)
        if start_time <= end_time:
            if start_time <= time_val <= end_time:
                return True, s
        else:
            if time_val >= start_time or time_val <= end_time:
                return True, s
    return False, None

def is_in_specific_session(dt: datetime, s: dict) -> bool:
    """
    Helper to check if datetime is in a specific session.
    """
    if not s or not s.get("active", True):
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
    
    start_time = dt_time(sh, sm)
    end_time = dt_time(eh, em)
    if start_time <= end_time:
        return start_time <= time_val <= end_time
    else:
        return time_val >= start_time or time_val <= end_time

def get_pip_size(sym: str, price: float) -> float:
    """
    Helper to determine pip size dynamically based on asset conventions.
    """
    if not sym:
        return 0.0001
    sym_upper = sym.upper()
    if 'JPY' in sym_upper:
        return 0.01
    if 'XAU' in sym_upper or 'GOLD' in sym_upper or 'XAG' in sym_upper:
        return 0.1
    is_crypto_pair = any(c in sym_upper for c in ['BTC', 'ETH', 'SOL', 'LTC', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'UNI', 'PEPE', 'SHIB', 'USDT', 'USDC', 'BUSD'])
    if is_crypto_pair:
        if price > 1000:
            return 1.0
        elif price > 10:
            return 0.1
        return 0.001
    forex_currencies = ['EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'SEK', 'NOK', 'SGD', 'HKD', 'ZAR', 'MXN']
    if any(curr in sym_upper for curr in forex_currencies) or sym_upper.endswith('USD'):
        return 0.0001
    if price > 1000:
        return 1.0
    elif price > 100:
        return 0.1
    elif price > 1:
        return 0.01
    return 0.0001

def get_lot_size(sym: str) -> float:
    """
    Helper to determine lot size / contract size multiplier.
    """
    if not sym:
        return 1.0
    sym_upper = sym.upper()
    if 'XAU' in sym_upper or 'GOLD' in sym_upper or 'XAG' in sym_upper:
        return 100.0
    is_crypto_pair = any(c in sym_upper for c in ['BTC', 'ETH', 'SOL', 'LTC', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'UNI', 'PEPE', 'SHIB', 'USDT', 'USDC', 'BUSD'])
    if is_crypto_pair:
        return 1.0
    forex_currencies = ['EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'SEK', 'NOK', 'SGD', 'HKD', 'ZAR', 'MXN']
    if any(curr in sym_upper for curr in forex_currencies) or sym_upper.endswith('USD'):
        return 100000.0
    return 1.0

def run_trade_simulation(
    annotated_data: list,
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
    be_offset_mode: str = 'half_r',
    fees_percent: float = 0.0,
    daily_retry_limit: int = 0,
    allow_opposite_close: bool = True,
    check_cancelled = None,
    date_from: float = None,
    date_to: float = None,
    timezone: str = 'Local',
    sessions: list = None,
    use_global_close: bool = False,
    global_close_time: str = '',
    progress_callback = None,
    entry_stability_rule: str = 'default',
    session_config: dict = None,
    daily_first_signals_mode: str = 'disabled',
    daily_first_signals_count: int = 0,
    daily_first_signals_risk_mult: float = 0.5,
    candles_1m: list = None
) -> dict:
    """
    Simulates the Wyckoff strategy trade executions on the annotated candle list.
    If candles_1m is provided, active open positions are resolved bar-by-bar on 1m candles.
    """
    import pandas as pd
    from colorama import Fore, Style
    from trading_handler import TradingHandler
    
    active_trade = None
    completed_trades = []
    current_balance = initial_balance
    daily_trades_count = {}
    daily_signals_count = {}
    
    # State for entry stability rules
    pending_buy = False
    pending_sell = False
    spring_high = None
    upthrust_low = None
    pending_buy_age = 0
    pending_sell_age = 0
    accum_consec_bars = 0
    dist_consec_bars = 0
    
    # Determine decimal precision dynamically from the input candle data
    precision = 2
    for c in annotated_data[:20]:
        close_val_str = str(c.get('close', ''))
        if '.' in close_val_str:
            precision = max(precision, len(close_val_str.split('.')[1]))
            
    first_candle = annotated_data[0] if annotated_data else {}
    close_price = float(first_candle.get('close', 0))
    pip_size = get_pip_size(symbol, close_price)
    lot_size = get_lot_size(symbol)

    total_candles = len(annotated_data)
    last_percent = -1
    start_sim_time = time.time()
    first_c = annotated_data[0] if annotated_data else {}
    last_c = annotated_data[-1] if annotated_data else {}
    try:
        from datetime import datetime
        t_start_str = datetime.utcfromtimestamp(int(first_c.get('time', 0))).strftime('%Y-%m-%d %H:%M:%S UTC')
        t_end_str = datetime.utcfromtimestamp(int(last_c.get('time', 0))).strftime('%Y-%m-%d %H:%M:%S UTC')
    except Exception:
        t_start_str = str(first_c.get('time'))
        t_end_str = str(last_c.get('time'))

    print(f"\n{Fore.CYAN}[Trade Simulation]{Style.RESET_ALL} Starting simulation for {symbol} on {total_candles} candles | Range: {t_start_str} -> {t_end_str} | PipSize: {pip_size} | LotMultiplier: {lot_size} | Precision: {precision}", flush=True)

    # If candles_1m is available, prepare binary search index of timestamps for fast O(log N) lookup
    import bisect
    candles_1m_times = []
    has_1m = bool(candles_1m and len(candles_1m) > 0)
    if has_1m:
        candles_1m_times = [int(cm.get('time', 0)) for cm in candles_1m]
        print(f"{Fore.GREEN}[Trade Simulation MTF]{Style.RESET_ALL} 1m Intrabar resolution enabled ({len(candles_1m)} 1m candles available).", flush=True)

    def resolve_trade_on_1m(trade: dict) -> dict:
        """
        Follows the active trade candle-by-candle on 1m data starting from entry_timestamp.
        Returns dict with exit details: exit_time, exit_price, exit_reason, closed_1m.
        """
        entry_ts = int(trade['entry_timestamp'])
        start_idx = bisect.bisect_right(candles_1m_times, entry_ts)
        
        sl_price = trade['sl_price']
        original_sl = trade['original_sl']
        tp_price = trade['tp_price']
        entry_price = trade['entry_price']
        sl_distance = trade['sl_distance']
        is_buy = (trade['type'] == 'BUY')
        is_be = trade.get('is_break_even', False)
        
        if be_offset_mode == 'zero_be':
            be_offset = 0.0
        elif be_offset_mode == 'half_r':
            be_offset = 0.5 * be_trigger_r * sl_distance
        else:
            try:
                fixed_r = float(be_offset_mode)
                be_offset = fixed_r * sl_distance
            except (ValueError, TypeError):
                be_offset = 0.5 * be_trigger_r * sl_distance

        for m_idx in range(start_idx, len(candles_1m)):
            cm = candles_1m[m_idx]
            m_time = int(cm.get('time', 0))
            m_open = float(cm.get('open', 0))
            m_high = float(cm.get('high', 0))
            m_low = float(cm.get('low', 0))
            m_close = float(cm.get('close', 0))
            m_dt = get_candle_datetime(m_time, timezone)

            # Check Session Auto-Close on End
            if trade.get('session_close_on_end') and not is_in_specific_session(m_dt, trade.get('session_config')):
                gross = (m_close - entry_price) * (trade['qty'] * lot_size) if is_buy else (entry_price - m_close) * (trade['qty'] * lot_size)
                return {
                    'closed': True,
                    'exit_price': m_close,
                    'exit_time': m_time,
                    'exit_reason': 'Session ended (Auto-close)',
                    'is_break_even': is_be,
                    'sl_price': sl_price
                }

            # Check Global Daily Close
            if use_global_close and global_close_time and len(global_close_time) == 5:
                try:
                    gh, gm = map(int, global_close_time.split(":"))
                    from datetime import time as dttime
                    if m_dt.time() >= dttime(gh, gm):
                        return {
                            'closed': True,
                            'exit_price': m_close,
                            'exit_time': m_time,
                            'exit_reason': f'Global daily close reached ({global_close_time})',
                            'is_break_even': is_be,
                            'sl_price': sl_price
                        }
                except Exception:
                    pass

            # Check Break-Even trigger on 1m
            if use_break_even and not is_be:
                if is_buy and m_high >= entry_price + sl_distance * be_trigger_r:
                    sl_price = round(entry_price + be_offset, precision)
                    is_be = True
                elif not is_buy and m_low <= entry_price - sl_distance * be_trigger_r:
                    sl_price = round(entry_price - be_offset, precision)
                    is_be = True

            # Check Stop-Loss / Break-Even hit on 1m
            if is_buy:
                hit_sl = (m_low <= sl_price)
                hit_tp = (m_high >= tp_price)
                if hit_sl and hit_tp:
                    # Intrabar collision resolution on 1m: check open proximity
                    if abs(m_open - sl_price) < abs(m_open - tp_price):
                        return {'closed': True, 'exit_price': sl_price, 'exit_time': m_time, 'exit_reason': 'Hit Break Even' if is_be else 'Hit Stop Loss', 'is_break_even': is_be, 'sl_price': sl_price}
                    else:
                        return {'closed': True, 'exit_price': tp_price, 'exit_time': m_time, 'exit_reason': 'Hit Take Profit', 'is_break_even': is_be, 'sl_price': sl_price}
                elif hit_sl:
                    return {'closed': True, 'exit_price': sl_price, 'exit_time': m_time, 'exit_reason': 'Hit Break Even' if is_be else 'Hit Stop Loss', 'is_break_even': is_be, 'sl_price': sl_price}
                elif hit_tp:
                    return {'closed': True, 'exit_price': tp_price, 'exit_time': m_time, 'exit_reason': 'Hit Take Profit', 'is_break_even': is_be, 'sl_price': sl_price}
            else:
                hit_sl = (m_high >= sl_price)
                hit_tp = (m_low <= tp_price)
                if hit_sl and hit_tp:
                    if abs(m_open - sl_price) < abs(m_open - tp_price):
                        return {'closed': True, 'exit_price': sl_price, 'exit_time': m_time, 'exit_reason': 'Hit Break Even' if is_be else 'Hit Stop Loss', 'is_break_even': is_be, 'sl_price': sl_price}
                    else:
                        return {'closed': True, 'exit_price': tp_price, 'exit_time': m_time, 'exit_reason': 'Hit Take Profit', 'is_break_even': is_be, 'sl_price': sl_price}
                elif hit_sl:
                    return {'closed': True, 'exit_price': sl_price, 'exit_time': m_time, 'exit_reason': 'Hit Break Even' if is_be else 'Hit Stop Loss', 'is_break_even': is_be, 'sl_price': sl_price}
                elif hit_tp:
                    return {'closed': True, 'exit_price': tp_price, 'exit_time': m_time, 'exit_reason': 'Hit Take Profit', 'is_break_even': is_be, 'sl_price': sl_price}

        # Not closed yet in 1m stream
        return {'closed': False, 'is_break_even': is_be, 'sl_price': sl_price}

    for i, c in enumerate(annotated_data):
        if check_cancelled and check_cancelled():
            break

        if i % 500 == 0:
            try:
                import gevent
                gevent.sleep(0)
            except ImportError:
                pass

        # Progress logging (maps 50% to 100% of the backtest progress)
        if total_candles > 0:
            percent = int(((i + 1) / total_candles) * 100)
            if percent != last_percent and percent % 5 == 0:
                last_percent = percent
                bar_length = 20
                filled_length = int(bar_length * percent // 100)
                bar = '#' * filled_length + '-' * (bar_length - filled_length)
                elapsed_sim = max(0.001, time.time() - start_sim_time)
                rate_sim = (i + 1) / elapsed_sim
                rem_sim = max(0, int((total_candles - (i + 1)) / rate_sim)) if rate_sim > 0 else 0
                print(f"\r{Fore.CYAN}[Trade Simulation Progress]{Style.RESET_ALL} |{Fore.GREEN}{bar}{Style.RESET_ALL}| {percent}% ({i+1}/{total_candles}) [{elapsed_sim:.1f}s | ~{int(rate_sim)} c/s | Rem: {rem_sim}s]", end="" if percent < 100 and i < total_candles - 1 else "\n", flush=True)
                if progress_callback:
                    try:
                        progress_callback(50 + int(percent / 2))
                    except Exception:
                        pass

        from strategy_handler import StrategyHandler
        state_dict = {
            'accum_consec_bars': accum_consec_bars,
            'dist_consec_bars': dist_consec_bars,
            'pending_buy': pending_buy,
            'pending_sell': pending_sell,
            'spring_high': spring_high,
            'upthrust_low': upthrust_low,
            'pending_buy_age': pending_buy_age,
            'pending_sell_age': pending_sell_age
        }
        should_buy, should_sell, state_dict = StrategyHandler.evaluate_candle_signal(
            c=c,
            state=state_dict,
            entry_stability_rule=entry_stability_rule,
            timezone=timezone,
            sessions=sessions,
            date_from=date_from,
            date_to=date_to,
            daily_retry_limit=daily_retry_limit,
            daily_trades_count=daily_trades_count,
            daily_first_signals_mode=daily_first_signals_mode,
            daily_first_signals_count=daily_first_signals_count,
            daily_first_signals_risk_mult=daily_first_signals_risk_mult,
            daily_signals_count=daily_signals_count
        )
        accum_consec_bars = state_dict['accum_consec_bars']
        dist_consec_bars = state_dict['dist_consec_bars']
        pending_buy = state_dict['pending_buy']
        pending_sell = state_dict['pending_sell']
        spring_high = state_dict['spring_high']
        upthrust_low = state_dict['upthrust_low']
        pending_buy_age = state_dict['pending_buy_age']
        pending_sell_age = state_dict['pending_sell_age']

        candle_time = int(c.get('time', 0))
        dt_curr = get_candle_datetime(candle_time, timezone)
        try:
            from datetime import datetime
            date_str = datetime.utcfromtimestamp(candle_time).strftime('%Y-%m-%d')
        except Exception:
            date_str = 'unknown'

        low_val = float(c.get('low', 0))
        high_val = float(c.get('high', 0))
        close_val = float(c.get('close', 0))

        if active_trade:
            # If 1m resolution is active and the exit was already resolved at an earlier 1m candle
            if has_1m and active_trade.get('exit_resolved_1m'):
                if candle_time >= active_trade['exit_timestamp']:
                    # Complete the trade recording
                    completed_trades.append(active_trade['completed_record'])
                    current_balance += active_trade['completed_record']['pnl']
                    active_trade = None
            elif not has_1m:
                # Standard resolution on the chart's own timeframe
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
                    if be_offset_mode == 'zero_be':
                        be_offset = 0.0
                    elif be_offset_mode == 'half_r':
                        be_offset = 0.5 * be_trigger_r * sl_distance
                    else:
                        try:
                            fixed_r = float(be_offset_mode)
                            be_offset = fixed_r * sl_distance
                        except (ValueError, TypeError):
                            be_offset = 0.5 * be_trigger_r * sl_distance

                    if active_trade['type'] == 'BUY':
                        if high_val >= active_trade['entry_price'] + sl_distance * be_trigger_r:
                            active_trade['sl_price'] = round(active_trade['entry_price'] + be_offset, precision)
                            active_trade['is_break_even'] = True
                    else:
                        if low_val <= active_trade['entry_price'] - sl_distance * be_trigger_r:
                            active_trade['sl_price'] = round(active_trade['entry_price'] - be_offset, precision)
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
                    total_fees = 2 * (active_trade['qty'] * fees_percent)
                    pnl = gross_pnl - total_fees
                    outcome = 'WIN' if pnl >= 0 else 'LOSS'
                    
                    try:
                        time_str = str(pd.to_datetime(int(c.get('time', 0)), unit='s'))
                    except Exception:
                        time_str = 'Open'
                        
                    completed_trades.append({
                        'id': len(completed_trades) + 1,
                        'type': active_trade['type'],
                        'entryPrice': float(active_trade['entry_price']),
                        'exitPrice': float(exit_price),
                        'pnl': float(pnl),
                        'fees': float(total_fees),
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
                        'isReducedRisk': bool(active_trade.get('is_reduced_risk', False)),
                        'riskMultiplier': float(active_trade.get('risk_multiplier', 1.0)),
                        'triggerReason': active_trade.get('trigger_reason')
                    })
                    current_balance += pnl
                    active_trade = None

        if not active_trade:
            if should_buy or should_sell:
                daily_trades_count[date_str] = daily_trades_count.get(date_str, 0) + 1
                trade_type = 'BUY' if should_buy else 'SELL'
                c['backtest_signal'] = trade_type
                entry_price = close_val
                
                is_reduced = (c.get('signal_action') == 'reduced')
                effective_risk_mult = float(c.get('risk_multiplier', 1.0)) if is_reduced else 1.0
                effective_risk_pct = risk_pct * effective_risk_mult
                effective_size = size * effective_risk_mult if not use_risk_sizing else size

                trade_params = TradingHandler.calculate_trade_parameters(
                    symbol=symbol,
                    entry_price=entry_price,
                    direction=trade_type,
                    sl_type=sl_type,
                    sl_val=sl_val,
                    rr=rr,
                    size=effective_size,
                    use_risk_sizing=use_risk_sizing,
                    risk_pct=effective_risk_pct,
                    balance=current_balance,
                    lot_size=lot_size,
                    pip_size=pip_size,
                    precision=precision,
                    atr_val=float(c.get('atr', 0.0))
                )
                
                sl_price = trade_params["sl_price"]
                tp_price = trade_params["tp_price"]
                trade_qty = trade_params["qty"]
                sl_distance = trade_params["sl_distance"]
                
                vsa_trigger = str(c.get('wyckoff_signal', 'Spring/Upthrust'))
                sweep_level = c.get('support_level') if trade_type == 'BUY' else c.get('resistance_level')
                weis_trigger = 0.0
                
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
                    'is_reduced_risk': is_reduced,
                    'risk_multiplier': effective_risk_mult,
                    'signal_index_in_day': c.get('signal_index_in_day', 1),
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

                # If 1m data is available, immediately follow through on 1m candles
                if has_1m:
                    res_1m = resolve_trade_on_1m(active_trade)
                    if res_1m.get('closed'):
                        exit_price_1m = float(res_1m['exit_price'])
                        exit_time_1m = int(res_1m['exit_time'])
                        gross_pnl_1m = (exit_price_1m - entry_price) * (trade_qty * lot_size) if trade_type == 'BUY' else (entry_price - exit_price_1m) * (trade_qty * lot_size)
                        total_fees_1m = 2 * (trade_qty * fees_percent)
                        pnl_1m = gross_pnl_1m - total_fees_1m
                        outcome_1m = 'WIN' if pnl_1m >= 0 else 'LOSS'
                        
                        try:
                            time_str_1m = str(pd.to_datetime(exit_time_1m, unit='s'))
                        except Exception:
                            time_str_1m = 'Open'

                        record_1m = {
                            'id': len(completed_trades) + 1,
                            'type': trade_type,
                            'entryPrice': float(entry_price),
                            'exitPrice': float(exit_price_1m),
                            'pnl': float(pnl_1m),
                            'fees': float(total_fees_1m),
                            'outcome': outcome_1m,
                            'time': time_str_1m,
                            'timestamp': exit_time_1m,
                            'slPrice': float(res_1m.get('sl_price', sl_price)),
                            'originalSlPrice': float(sl_price),
                            'tpPrice': float(tp_price),
                            'entryTimestamp': int(c.get('time', 0)),
                            'exitTimestamp': exit_time_1m,
                            'exitReason': res_1m.get('exit_reason', '1m Resolution Exit'),
                            'duration': max(1, int((exit_time_1m - int(c.get('time', 0))) / 60)), # duration in minutes
                            'qty': float(trade_qty),
                            'isReducedRisk': bool(is_reduced),
                            'riskMultiplier': float(effective_risk_mult),
                            'triggerReason': active_trade.get('trigger_reason')
                        }

                        # If the exit happened before the next higher-TF candle, we close immediately;
                        # otherwise mark it to be held until that candle index is passed
                        active_trade['exit_resolved_1m'] = True
                        active_trade['exit_timestamp'] = exit_time_1m
                        active_trade['completed_record'] = record_1m

    if active_trade:
        final_candle = annotated_data[-1]
        close_val = float(final_candle.get('close', 0))
        gross_pnl = (close_val - active_trade['entry_price']) * (active_trade['qty'] * lot_size) if active_trade['type'] == 'BUY' else (active_trade['entry_price'] - close_val) * (active_trade['qty'] * lot_size)
        total_fees = 2 * (active_trade['qty'] * fees_percent)
        pnl_usd = gross_pnl - total_fees
        completed_trades.append({
            'id': len(completed_trades) + 1,
            'type': active_trade['type'],
            'entryPrice': float(active_trade['entry_price']),
            'exitPrice': float(close_val),
            'pnl': float(pnl_usd),
            'fees': float(total_fees),
            'outcome': 'WIN' if pnl_usd >= 0 else 'LOSS',
            'time': 'Open',
            'timestamp': int(final_candle.get('time', 0)),
            'slPrice': float(active_trade['sl_price']),
            'originalSlPrice': float(active_trade['original_sl']),
            'tpPrice': float(active_trade['tp_price']),
            'entryTimestamp': int(active_trade['entry_timestamp']),
            'exitTimestamp': int(final_candle.get('time', 0)),
            'exitReason': 'Position still open',
            'duration': int(len(annotated_data) - active_trade['entry_index']),
            'qty': float(active_trade['qty']),
            'triggerReason': active_trade.get('trigger_reason')
        })
        current_balance += pnl_usd

    # Ensure all trade price and numeric fields are non-null and non-NaN
    import math
    def safe_float(val, fallback=0.0) -> float:
        if val is None:
            return fallback
        try:
            f_val = float(val)
            if math.isnan(f_val) or math.isinf(f_val):
                return fallback
            return f_val
        except Exception:
            return fallback

    for t in completed_trades:
        entry = safe_float(t.get('entryPrice'), 0.0)
        t['entryPrice'] = entry
        t['exitPrice'] = safe_float(t.get('exitPrice'), entry)
        t['pnl'] = safe_float(t.get('pnl'), 0.0)
        t['fees'] = safe_float(t.get('fees'), 0.0)
        t['slPrice'] = safe_float(t.get('slPrice'), entry)
        t['originalSlPrice'] = safe_float(t.get('originalSlPrice'), t['slPrice'])
        t['tpPrice'] = safe_float(t.get('tpPrice'), entry)
        t['qty'] = safe_float(t.get('qty'), 1.0)

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

    first_ts = int(annotated_data[0].get('time', 0)) if annotated_data else 0
    last_ts = int(annotated_data[-1].get('time', 0)) if annotated_data else 0

    equity_curve = []
    if first_ts > 0:
        equity_curve.append({
            "time": first_ts,
            "value": float(initial_balance),
            "balance": float(initial_balance),
            "drawdown": 0.0,
            "drawdown_pct": 0.0,
            "pnl": 0.0
        })

    for t in completed_trades:
        trade_time_sec = int(t.get('exitTimestamp') or t.get('timestamp') or 0)
        if trade_time_sec <= 0:
            trade_time_sec = first_ts

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
        
        dd_amt = peak_bal - running_balance
        dd_pct = (dd_amt / peak_bal) * 100.0 if peak_bal > 0 else 0.0
        if dd_pct > max_drawdown:
            max_drawdown = dd_pct

        equity_curve.append({
            "time": trade_time_sec,
            "value": float(running_balance),
            "balance": float(running_balance),
            "drawdown": float(dd_amt),
            "drawdown_pct": float(dd_pct),
            "pnl": float(t['pnl']),
            "outcome": t.get('outcome', ''),
            "type": t.get('type', '')
        })

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

    reversed_trades = list(reversed(completed_trades))
    
    # Save backtest trades to JSON for analysis (config-specific filename)
    try:
        import os, json
        date_str = datetime.now().strftime("%Y-%m-%d")
        folder_path = os.path.join(os.path.dirname(__file__), "backtestTrades", date_str)
        os.makedirs(folder_path, exist_ok=True)
        
        be_str = f"be{be_trigger_r}" if use_break_even else "be_off"
        clean_sym = str(symbol).replace('/', '_').replace('.', '_').lower()
        from colorama import Fore, Style
        print(f"{Fore.GREEN}[Trade Simulation]{Style.RESET_ALL} Successfully processed {len(completed_trades)} backtest trades for {symbol} (Saved to MySQL DB)", flush=True)
    except Exception as bt_err:
        from colorama import Fore, Style
        print(f"{Fore.YELLOW}[Trade Simulation]{Style.RESET_ALL} Warning processing trades log: {bt_err}", flush=True)

    return {
        "trades": reversed_trades,
        "completed_trades_raw": completed_trades,
        "equityCurve": equity_curve,
        "winRate": float(win_rate),
        "netPnl": float(net_pnl),
        "profitFactor": float(profit_factor),
        "totalTrades": int(total_trades),
        "maxDrawdown": float(max_drawdown),
        "maxDailyLoss": float(max_daily_loss),
        "dailyLossBreached": bool(daily_loss_breached),
        "monthlyBreakdown": monthly_breakdown,
        "weeklyBreakdown": weekly_breakdown,
        "dateFrom": first_ts,
        "dateTo": last_ts
    }
