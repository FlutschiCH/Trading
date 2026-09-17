import pandas as pd
import json
import time
from indicator_handler import IndicatorHandler
from trading_handler import TradingHandler

class StrategyHandler:
    @staticmethod
    def evaluate_candle_signal(
        c: dict,
        state: dict,
        entry_stability_rule: str = 'default',
        timezone: str = 'Local',
        sessions: list = None,
        date_from: float = None,
        date_to: float = None,
        daily_retry_limit: int = 0,
        daily_trades_count: dict = None,
        daily_first_signals_mode: str = 'disabled',
        daily_first_signals_count: int = 0,
        daily_first_signals_risk_mult: float = 0.5,
        daily_signals_count: dict = None
    ) -> tuple:
        """
        Pure signal detection logic shared between Backtesting and Live Trading.
        Updates state dictionary in-place and returns (should_buy, should_sell, state).
        """
        if daily_trades_count is None:
            daily_trades_count = {}
        if daily_signals_count is None:
            daily_signals_count = {}

        wyckoff_sig = c.get('wyckoff_signal')
        stage = c.get('wyckoff_stage', 'TRANSITION')

        accum_consec_bars = state.get('accum_consec_bars', 0)
        dist_consec_bars = state.get('dist_consec_bars', 0)
        pending_buy = state.get('pending_buy', False)
        pending_sell = state.get('pending_sell', False)
        spring_high = state.get('spring_high', None)
        upthrust_low = state.get('upthrust_low', None)
        pending_buy_age = state.get('pending_buy_age', 0)
        pending_sell_age = state.get('pending_sell_age', 0)

        # Update stage consecutive bars counter
        if stage == "ACCUMULATION":
            accum_consec_bars += 1
        else:
            accum_consec_bars = 0

        if stage == "DISTRIBUTION":
            dist_consec_bars += 1
        else:
            dist_consec_bars = 0

        # Increment age and enforce a max age for pending setups (15 candles)
        if pending_buy:
            pending_buy_age += 1
            if pending_buy_age > 15:
                pending_buy = False

        if pending_sell:
            pending_sell_age += 1
            if pending_sell_age > 15:
                pending_sell = False

        # Set up signal triggers
        is_new_spring = False
        is_new_upthrust = False

        if wyckoff_sig == "Spring detected":
            pending_buy = True
            spring_high = float(c.get('high', 0))
            pending_buy_age = 0
            pending_sell = False
            is_new_spring = True

        if wyckoff_sig == "Upthrust detected":
            pending_sell = True
            upthrust_low = float(c.get('low', 0))
            pending_sell_age = 0
            pending_buy = False
            is_new_upthrust = True

        should_buy = False
        should_sell = False

        # Evaluate pending buy trigger
        if pending_buy:
            duration_ok = True
            if entry_stability_rule in ('duration', 'both'):
                duration_ok = (accum_consec_bars >= 3)

            confirmation_ok = True
            if entry_stability_rule in ('confirmation', 'both'):
                # Confirmation rule requires a SUBSEQUENT candle closing above Spring High
                if is_new_spring:
                    confirmation_ok = False
                else:
                    confirmation_ok = (float(c.get('close', 0)) > spring_high)

            if duration_ok and confirmation_ok:
                if stage != "DISTRIBUTION":
                    should_buy = True
                    pending_buy = False

            if wyckoff_sig == "Upthrust detected" or stage == "DISTRIBUTION":
                pending_buy = False

        # Evaluate pending sell trigger
        if pending_sell:
            duration_ok = True
            if entry_stability_rule in ('duration', 'both'):
                duration_ok = (dist_consec_bars >= 3)

            confirmation_ok = True
            if entry_stability_rule in ('confirmation', 'both'):
                if is_new_upthrust:
                    confirmation_ok = False
                else:
                    confirmation_ok = (float(c.get('close', 0)) < upthrust_low)

            if duration_ok and confirmation_ok:
                if stage != "ACCUMULATION":
                    should_sell = True
                    pending_sell = False

            if wyckoff_sig == "Spring detected" or stage == "ACCUMULATION":
                pending_sell = False

        # Session filtering
        candle_time = int(c.get('time', 0))
        from backtest_helpers import get_candle_datetime, is_datetime_in_sessions
        dt_curr = get_candle_datetime(candle_time, timezone)

        in_session, _ = is_datetime_in_sessions(dt_curr, sessions)
        if not in_session:
            should_buy = False
            should_sell = False

        # Date range filtering
        if date_from is not None and candle_time < int(date_from):
            should_buy = False
            should_sell = False
        if date_to is not None and candle_time > int(date_to):
            should_buy = False
            should_sell = False

        # Daily retry limit (using candle date)
        try:
            date_str = dt_curr.strftime('%Y-%m-%d')
        except Exception:
            date_str = 'unknown'

        if daily_retry_limit > 0 and daily_trades_count.get(date_str, 0) >= daily_retry_limit:
            should_buy = False
            should_sell = False

        # Indicator confirmation layer check
        if c.get('indicator_buy_valid') is False:
            should_buy = False
        if c.get('indicator_sell_valid') is False:
            should_sell = False

        # HTF EMA Trend Filter (Longs require Close > HTF EMA; Shorts require Close < HTF EMA)
        if c.get('htf_ema_enabled'):
            htf_ema_val = c.get('htf_ema')
            if htf_ema_val is not None and not pd.isna(htf_ema_val):
                close_price = float(c.get('close', 0))
                if close_price <= float(htf_ema_val):
                    should_buy = False
                if close_price >= float(htf_ema_val):
                    should_sell = False

        # Daily Initial Signals (First X of Day: Skip or Reduced Risk based on candle-time midnight)
        if should_buy or should_sell:
            daily_signals_count[date_str] = daily_signals_count.get(date_str, 0) + 1
            curr_signal_idx = daily_signals_count[date_str]
            raw_sig_type = 'BUY' if should_buy else 'SELL'
            c['signal_index_in_day'] = curr_signal_idx

            if daily_first_signals_mode in ('skip', 'reduced_risk') and curr_signal_idx <= daily_first_signals_count:
                if daily_first_signals_mode == 'skip':
                    c['signal_action'] = 'skipped'
                    c['skipped_signal_type'] = raw_sig_type
                    should_buy = False
                    should_sell = False
                elif daily_first_signals_mode == 'reduced_risk':
                    c['signal_action'] = 'reduced'
                    c['risk_multiplier'] = float(daily_first_signals_risk_mult)
            else:
                c['signal_action'] = 'normal'
                c['risk_multiplier'] = 1.0

        state.update({
            'accum_consec_bars': accum_consec_bars,
            'dist_consec_bars': dist_consec_bars,
            'pending_buy': pending_buy,
            'pending_sell': pending_sell,
            'spring_high': spring_high,
            'upthrust_low': upthrust_low,
            'pending_buy_age': pending_buy_age,
            'pending_sell_age': pending_sell_age
        })

        return should_buy, should_sell, state

    @staticmethod
    def analyze_market_data(
        bars_list: list,
        lookback: int = 20,
        progress_callback=None,
        indicator_rules: list = None,
        htf_candles: list = None,
        htf_ema_enabled: bool = False,
        htf_ema_period: int = 200
    ) -> dict:
        """
        Takes raw candlestick data, runs Wyckoff structure analysis,
        evaluates indicator rules layer, calculates optional HTF EMA trend filter,
        and returns the annotated dataset.
        """
        if not bars_list:
            return {"status": "success", "data": [], "fvgs": []}
            
        from wyckoff_handler import WyckoffHandler
        wyckoff_candles = WyckoffHandler.analyze_wyckoff_structure(bars_list, lookback=lookback, progress_callback=progress_callback)

        if len(wyckoff_candles) > 0:
            try:
                df = pd.DataFrame(wyckoff_candles)
                atr_series = IndicatorHandler.atr(df, period=14, smoothing='rma')
                for idx, c in enumerate(wyckoff_candles):
                    c['atr'] = float(atr_series.iloc[idx]) if not pd.isna(atr_series.iloc[idx]) else 0.0

                if indicator_rules and len(indicator_rules) > 0:
                    buy_mask, sell_mask = IndicatorHandler.evaluate_indicator_rules(df, indicator_rules)
                    for idx, c in enumerate(wyckoff_candles):
                        c['indicator_buy_valid'] = bool(buy_mask.iloc[idx])
                        c['indicator_sell_valid'] = bool(sell_mask.iloc[idx])

                # Calculate and annotate progressive HTF EMA if enabled and htf_candles provided
                if htf_ema_enabled and htf_candles and len(htf_candles) > 0:
                    htf_df = pd.DataFrame(htf_candles)
                    htf_ema_series = IndicatorHandler.htf_ema(df, htf_df, period=int(htf_ema_period), column='close')
                    for idx, c in enumerate(wyckoff_candles):
                        ema_val = htf_ema_series.iloc[idx]
                        c['htf_ema_enabled'] = True
                        c['htf_ema'] = float(ema_val) if not pd.isna(ema_val) else None
                elif htf_ema_enabled:
                    for c in wyckoff_candles:
                        c['htf_ema_enabled'] = True
            except Exception as e:
                print(f"[StrategyHandler] Warning: indicator calculation failed: {e}", flush=True)

        return {"status": "success", "data": wyckoff_candles, "fvgs": []}

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
        be_offset_mode: str = 'half_r',
        lookback_window: int = 20,
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
        broker: str = 'metatrader',
        session_config: dict = None,
        timeframe: str = '5m',
        indicator_rules: list = None,
        daily_first_signals_mode: str = 'disabled',
        daily_first_signals_count: int = 0,
        daily_first_signals_risk_mult: float = 0.5,
        candles_1m: list = None,
        htf_candles: list = None,
        htf_ema_enabled: bool = False,
        htf_ema_period: int = 200,
        htf_ema_timeframe: str = '4h',
        min_save_pnl: float = None,
        find_best_session: bool = False,
        min_hourly_pnl: float = 0.0
    ) -> dict:
        """
        Runs the full Wyckoff structure analysis backtest in Python.
        """
        tf = timeframe
        from colorama import Fore, Style
        htf_str = f" | HTF EMA: {htf_ema_timeframe} {htf_ema_period} EMA" if htf_ema_enabled else ""
        print(f"\n{Fore.CYAN}[Backtest]{Style.RESET_ALL} Starting Wyckoff Structure Analysis backtest for {symbol} on {len(candles)} candles (1m Intrabar: {'Enabled' if candles_1m else 'Off'}{htf_str})...", flush=True)
        
        # Sanitize Break-Even vs RR (Break-Even cannot be >= RR)
        if use_break_even and be_trigger_r >= rr:
            print(f"{Fore.YELLOW}[Backtest]{Style.RESET_ALL} Warning: Break-Even trigger ({be_trigger_r}R) >= RR ({rr}R). Disabling Break-Even to prevent non-sensical simulation.", flush=True)
            use_break_even = False

        # 1. Run Market Data Analysis (0% to 50% progress)
        wrapped_cb = None
        if progress_callback:
            wrapped_cb = lambda p: progress_callback(int(p / 2))
            
        analysis = StrategyHandler.analyze_market_data(
            candles,
            lookback=lookback_window,
            progress_callback=wrapped_cb,
            indicator_rules=indicator_rules,
            htf_candles=htf_candles,
            htf_ema_enabled=htf_ema_enabled,
            htf_ema_period=htf_ema_period
        )
        annotated_data = list(analysis.get('data', []))
        
        # 2. Run Trade Simulation (50% to 100% progress)
        from backtest_helpers import run_trade_simulation
        sim_cb = (lambda p: progress_callback(50 + int(p / 4))) if (progress_callback and find_best_session) else progress_callback

        pass1_sessions = [] if find_best_session else sessions

        sim_result = run_trade_simulation(
            annotated_data=annotated_data,
            symbol=symbol,
            sl_val=sl_val,
            sl_type=sl_type,
            rr=rr,
            size=size,
            initial_balance=initial_balance,
            use_risk_sizing=use_risk_sizing,
            risk_pct=risk_pct,
            use_break_even=use_break_even,
            be_trigger_r=be_trigger_r,
            be_offset_mode=be_offset_mode,
            fees_percent=fees_percent,
            daily_retry_limit=daily_retry_limit,
            allow_opposite_close=allow_opposite_close,
            check_cancelled=check_cancelled,
            date_from=date_from,
            date_to=date_to,
            timezone=timezone,
            sessions=pass1_sessions,
            use_global_close=use_global_close,
            global_close_time=global_close_time,
            progress_callback=sim_cb,
            entry_stability_rule=entry_stability_rule,
            session_config=session_config,
            daily_first_signals_mode=daily_first_signals_mode,
            daily_first_signals_count=daily_first_signals_count,
            daily_first_signals_risk_mult=daily_first_signals_risk_mult,
            candles_1m=candles_1m
        )
        
        from candle_sanitizer import sanitize_and_fill_candles
        annotated_data = sanitize_and_fill_candles(annotated_data)

        from sql_handler import SQLHandler
        ts_now = int(time.time())
        baseline_summary = {
            "netPnl": sim_result["netPnl"],
            "winRate": sim_result["winRate"],
            "profitFactor": sim_result["profitFactor"],
            "totalTrades": sim_result["totalTrades"]
        }

        try:
            full_run_id = f"bt_{symbol.lower()}_{tf}_sl{sl_val}_rr{rr}_be{be_trigger_r}_full_{ts_now}" if find_best_session else f"bt_{symbol.lower()}_{tf}_sl{sl_val}_rr{rr}_be{be_trigger_r}_{ts_now}"
            full_results_to_save = {
                "explainer": "Wyckoff Structure Analysis backtest (Full / Baseline 24/7)" if find_best_session else "Wyckoff Structure Analysis backtest.",
                "settings": {
                    "symbol": symbol,
                    "timeframe": tf,
                    "broker": broker,
                    "sl_val": sl_val,
                    "sl_type": sl_type,
                    "rr": rr,
                    "size": size,
                    "initial_balance": initial_balance,
                    "use_risk_sizing": use_risk_sizing,
                    "risk_pct": risk_pct,
                    "use_break_even": use_break_even,
                    "be_trigger_r": be_trigger_r,
                    "be_offset_mode": be_offset_mode,
                    "lookback_window": lookback_window,
                    "fees_percent": fees_percent,
                    "daily_retry_limit": daily_retry_limit,
                    "allow_opposite_close": allow_opposite_close,
                    "date_from": date_from,
                    "date_to": date_to,
                    "timezone": timezone,
                    "sessions": pass1_sessions,
                    "use_global_close": use_global_close,
                    "global_close_time": global_close_time,
                    "entry_stability_rule": entry_stability_rule,
                    "indicator_rules": indicator_rules,
                    "htf_ema_enabled": htf_ema_enabled,
                    "htf_ema_period": htf_ema_period,
                    "htf_ema_timeframe": htf_ema_timeframe,
                    "limit": len(annotated_data)
                },
                "metrics": {
                    "winRate": sim_result["winRate"],
                    "netPnl": sim_result["netPnl"],
                    "profitFactor": sim_result["profitFactor"],
                    "totalTrades": sim_result["totalTrades"],
                    "maxDrawdown": sim_result["maxDrawdown"],
                    "maxDailyLoss": sim_result["maxDailyLoss"],
                    "dailyLossBreached": sim_result["dailyLossBreached"],
                    "candleCount": len(annotated_data)
                },
                "trades": sim_result["completed_trades_raw"]
            }

            SQLHandler.save_backtest_run(
                backtest_id=full_run_id,
                symbol=symbol,
                timeframe=tf,
                broker=broker,
                sl_val=sl_val,
                sl_type=sl_type,
                rr=rr,
                be_trigger_r=be_trigger_r,
                net_pnl=sim_result["netPnl"],
                win_rate=sim_result["winRate"],
                trades_cnt=sim_result["totalTrades"],
                profit_factor=sim_result["profitFactor"],
                max_drawdown=sim_result["maxDrawdown"],
                payload_dict=full_results_to_save,
                min_pnl=min_save_pnl
            )
            print(f"{Fore.GREEN}[SQLHandler]{Style.RESET_ALL} Successfully saved baseline backtest run '{full_run_id}' to MySQL DB.", flush=True)
        except Exception as sql_err:
            print(f"{Fore.RED}[SQLHandler]{Style.RESET_ALL} Failed saving baseline backtest run: {sql_err}", flush=True)

        discovered_sessions = []
        hourly_breakdown = {}

        # Pass 2: If Find Best Session is active, discover winning hours and re-run simulation
        if find_best_session:
            completed_trades = sim_result.get("completed_trades_raw", [])
            discovered_sessions, hourly_breakdown = StrategyHandler.filter_best_sessions_from_trades(
                trades=completed_trades,
                timezone_str=timezone,
                min_hourly_pnl=min_hourly_pnl
            )
            print(f"{Fore.CYAN}[FindBestSession]{Style.RESET_ALL} Discovered {len(discovered_sessions)} profitable 1-hour sessions (Min PnL > ${min_hourly_pnl:.2f}) from {len(completed_trades)} baseline trades.", flush=True)

            if discovered_sessions:
                pass2_cb = (lambda p: progress_callback(75 + int(p / 4))) if progress_callback else None
                sim_result = run_trade_simulation(
                    annotated_data=annotated_data,
                    symbol=symbol,
                    sl_val=sl_val,
                    sl_type=sl_type,
                    rr=rr,
                    size=size,
                    initial_balance=initial_balance,
                    use_risk_sizing=use_risk_sizing,
                    risk_pct=risk_pct,
                    use_break_even=use_break_even,
                    be_trigger_r=be_trigger_r,
                    be_offset_mode=be_offset_mode,
                    fees_percent=fees_percent,
                    daily_retry_limit=daily_retry_limit,
                    allow_opposite_close=allow_opposite_close,
                    check_cancelled=check_cancelled,
                    date_from=date_from,
                    date_to=date_to,
                    timezone=timezone,
                    sessions=discovered_sessions,
                    use_global_close=use_global_close,
                    global_close_time=global_close_time,
                    progress_callback=pass2_cb,
                    entry_stability_rule=entry_stability_rule,
                    session_config=session_config,
                    daily_first_signals_mode=daily_first_signals_mode,
                    daily_first_signals_count=daily_first_signals_count,
                    daily_first_signals_risk_mult=daily_first_signals_risk_mult,
                    candles_1m=candles_1m
                )

                # Persist Pass 2 (Session-Optimized) Run to MySQL DB
                try:
                    session_run_id = f"bt_{symbol.lower()}_{tf}_sl{sl_val}_rr{rr}_be{be_trigger_r}_session_{ts_now}"
                    session_results_to_save = {
                        "explainer": "Wyckoff Structure Analysis backtest (Session-Optimized)",
                        "settings": {
                            "symbol": symbol,
                            "timeframe": tf,
                            "broker": broker,
                            "sl_val": sl_val,
                            "sl_type": sl_type,
                            "rr": rr,
                            "size": size,
                            "initial_balance": initial_balance,
                            "use_risk_sizing": use_risk_sizing,
                            "risk_pct": risk_pct,
                            "use_break_even": use_break_even,
                            "be_trigger_r": be_trigger_r,
                            "be_offset_mode": be_offset_mode,
                            "lookback_window": lookback_window,
                            "fees_percent": fees_percent,
                            "daily_retry_limit": daily_retry_limit,
                            "allow_opposite_close": allow_opposite_close,
                            "date_from": date_from,
                            "date_to": date_to,
                            "timezone": timezone,
                            "sessions": discovered_sessions,
                            "use_global_close": use_global_close,
                            "global_close_time": global_close_time,
                            "entry_stability_rule": entry_stability_rule,
                            "indicator_rules": indicator_rules,
                            "htf_ema_enabled": htf_ema_enabled,
                            "htf_ema_period": htf_ema_period,
                            "htf_ema_timeframe": htf_ema_timeframe,
                            "limit": len(annotated_data)
                        },
                        "metrics": {
                            "winRate": sim_result["winRate"],
                            "netPnl": sim_result["netPnl"],
                            "profitFactor": sim_result["profitFactor"],
                            "totalTrades": sim_result["totalTrades"],
                            "maxDrawdown": sim_result["maxDrawdown"],
                            "maxDailyLoss": sim_result["maxDailyLoss"],
                            "dailyLossBreached": sim_result["dailyLossBreached"],
                            "candleCount": len(annotated_data)
                        },
                        "trades": sim_result["completed_trades_raw"]
                    }

                    SQLHandler.save_backtest_run(
                        backtest_id=session_run_id,
                        symbol=symbol,
                        timeframe=tf,
                        broker=broker,
                        sl_val=sl_val,
                        sl_type=sl_type,
                        rr=rr,
                        be_trigger_r=be_trigger_r,
                        net_pnl=sim_result["netPnl"],
                        win_rate=sim_result["winRate"],
                        trades_cnt=sim_result["totalTrades"],
                        profit_factor=sim_result["profitFactor"],
                        max_drawdown=sim_result["maxDrawdown"],
                        payload_dict=session_results_to_save,
                        min_pnl=min_save_pnl
                    )
                    print(f"{Fore.GREEN}[SQLHandler]{Style.RESET_ALL} Successfully saved session-optimized backtest run '{session_run_id}' to MySQL DB.", flush=True)
                except Exception as sql_err:
                    print(f"{Fore.RED}[SQLHandler]{Style.RESET_ALL} Failed saving session-optimized backtest run: {sql_err}", flush=True)

        if progress_callback:
            try:
                progress_callback(100)
            except Exception:
                pass

        return {
            "trades": sim_result["trades"],
            "winRate": sim_result["winRate"],
            "netPnl": sim_result["netPnl"],
            "profitFactor": sim_result["profitFactor"],
            "totalTrades": sim_result["totalTrades"],
            "maxDrawdown": sim_result["maxDrawdown"],
            "maxDailyLoss": sim_result["maxDailyLoss"],
            "dailyLossBreached": sim_result["dailyLossBreached"],
            "candles": annotated_data,
            "monthlyBreakdown": sim_result["monthlyBreakdown"],
            "weeklyBreakdown": sim_result["weeklyBreakdown"],
            "dateFrom": sim_result.get("dateFrom"),
            "dateTo": sim_result.get("dateTo"),
            "discovered_sessions": discovered_sessions,
            "hourly_breakdown": hourly_breakdown,
            "baseline_summary": baseline_summary if find_best_session else None,
            "fvgs": []
        }

    @staticmethod
    def run_optimization(
        symbol: str,
        sl_val: float,
        sl_type: str,
        size: float,
        initial_balance: float,
        use_risk_sizing: bool,
        risk_pct: float,
        use_break_even: bool,
        be_trigger_r: float,
        be_offset_mode: str = 'half_r',
        lookback_window: int = 20,
        rr_start: float = 1.0,
        rr_end: float = 5.0,
        rr_step: float = 0.5,
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
        candle_source: str = 'metatrader',
        account_id: str = None,
        limit: int = 1000,
        symbols: list = None,
        timeframes: list = None,
        sl_range_mode: bool = False,
        sl_start: float = None,
        sl_end: float = None,
        sl_step: float = None,
        be_range_mode: bool = False,
        be_start: float = None,
        be_end: float = None,
        be_step: float = None,
        be_offset_range_mode: bool = False,
        be_offset_start: float = None,
        be_offset_end: float = None,
        be_offset_step: float = None,
        daily_first_signals_mode: str = 'disabled',
        daily_first_signals_count: int = 0,
        daily_first_signals_risk_mult: float = 0.5,
        htf_ema_enabled: bool = False,
        htf_ema_period: int = 200,
        htf_ema_timeframe: str = '4h',
        htf_ema_range_mode: bool = False,
        min_save_pnl: float = None,
        find_best_session: bool = False,
        min_hourly_pnl: float = 0.0
    ) -> dict:
        """
        Runs Wyckoff parameter grid search optimization, fetching candles dynamically and executing simulations.
        """
        import os
        import json

        # Generate Stop Loss values
        if sl_range_mode and sl_start is not None and sl_end is not None and sl_step:
            sl_values = []
            curr = sl_start
            while curr <= sl_end + 0.0001:
                sl_values.append(round(curr, 2))
                curr += sl_step
        else:
            sl_values = [sl_val]

        # Generate Reward-to-Risk values
        rr_values = []
        curr = rr_start
        while curr <= rr_end + 0.0001:
            rr_values.append(round(curr, 2))
            curr += rr_step
        if not rr_values:
            rr_values = [2.0]

        # Generate Break-Even Trigger values
        if use_break_even and be_range_mode and be_start is not None and be_end is not None and be_step:
            be_values = []
            curr = be_start
            while curr <= be_end + 0.0001:
                be_values.append(round(curr, 2))
                curr += be_step
        else:
            be_values = [be_trigger_r] if use_break_even else [None]

        # Generate Break-Even Offset values
        if use_break_even and be_offset_range_mode and be_offset_start is not None and be_offset_end is not None and be_offset_step:
            be_offset_values = []
            curr = be_offset_start
            while curr <= be_offset_end + 0.0001:
                be_offset_values.append(str(round(curr, 2)))
                curr += be_offset_step
        else:
            be_offset_values = [be_offset_mode]

        # Generate HTF EMA binary range values (On / Off)
        if htf_ema_range_mode:
            htf_ema_modes = [False, True]
        else:
            htf_ema_modes = [htf_ema_enabled]

        symbols_list = symbols if (symbols and len(symbols) > 0) else [symbol]
        timeframes_list = timeframes if (timeframes and len(timeframes) > 0) else [timeframe]

        # Build combination matrix
        matrix = []
        skipped_invalid_combos = 0
        for s in symbols_list:
            for tf in timeframes_list:
                for sl in sl_values:
                    for rr in rr_values:
                        for be in be_values:
                            for be_off in be_offset_values:
                                for htf_on in htf_ema_modes:
                                    if use_break_even and be is not None and be >= rr:
                                        skipped_invalid_combos += 1
                                        continue
                                    matrix.append({
                                        "symbol": s,
                                        "timeframe": tf,
                                        "sl": sl,
                                        "rr": rr,
                                        "be": be,
                                        "be_offset": be_off,
                                        "htf_ema_enabled": htf_on,
                                        "htf_ema_period": htf_ema_period,
                                        "htf_ema_timeframe": htf_ema_timeframe
                                    })

        # Translate master symbols to broker symbols using SymbolMappingHandler
        from symbol_mapping_handler import SymbolMappingHandler
        translated_symbol_info = []
        for sym in symbols_list:
            mapped_broker_sym = SymbolMappingHandler.map_to_broker(sym, account_id) if account_id else sym
            if mapped_broker_sym and mapped_broker_sym != sym:
                translated_symbol_info.append(f"{sym} ➔ {mapped_broker_sym}")
            else:
                translated_symbol_info.append(mapped_broker_sym or sym)

        import time
        overall_start_time = time.time()
        print("\n==========================================================================", flush=True)
        print(f"[Optimization] STARTING GRID MATRIX OPTIMIZATION", flush=True)
        print(f"  • Account Target     : {account_id or 'Default'} ({candle_source})", flush=True)
        print(f"  • Translated Symbols : {', '.join(translated_symbol_info)}", flush=True)
        print(f"  • Timeframes         : {', '.join(timeframes_list)}", flush=True)
        print(f"  • SL Range           : {sl_values[0] if len(sl_values)==1 else f'{sl_values[0]} .. {sl_values[-1]}'} ({sl_type}, {len(sl_values)} steps)", flush=True)
        print(f"  • RR Range           : {rr_values[0] if len(rr_values)==1 else f'{rr_values[0]} .. {rr_values[-1]}'} ({len(rr_values)} steps)", flush=True)
        print(f"  • BE Range           : {be_values[0] if len(be_values)==1 else f'{be_values[0]} .. {be_values[-1]}'} ({len(be_values)} steps)" if use_break_even else "  • BE Range           : Off", flush=True)
        print(f"  • Total Matrix Runs  : {len(matrix)} combinations (Skipped {skipped_invalid_combos} invalid combos where BE >= RR)", flush=True)
        print("==========================================================================\n", flush=True)

        analysis_cache = {}
        candles_1m_cache = {}
        results = []
        total_runs = len(matrix)

        recent_durations = []

        for idx, combo in enumerate(matrix):
            try:
                import gevent
                gevent.sleep(0)
            except ImportError:
                pass

            if check_cancelled and check_cancelled():
                print(f"[Optimization] Optimization cancelled by user at run {idx}/{total_runs}.", flush=True)
                break


            run_start_time = time.time()
            elapsed_sec = run_start_time - overall_start_time
            if elapsed_sec >= 60:
                elapsed_str = f"{int(elapsed_sec // 60)}m {elapsed_sec % 60:.1f}s"
            else:
                elapsed_str = f"{elapsed_sec:.1f}s"

            pct = int((idx / total_runs) * 100)
            if progress_callback:
                try:
                    progress_callback(pct, idx + 1, total_runs)
                except TypeError:
                    progress_callback(pct)

            s = combo["symbol"]
            tf = combo["timeframe"]
            sl = combo["sl"]
            rr = combo["rr"]
            be = combo["be"]
            be_str = f"{be}R" if be is not None else "Off"

            eta_str = "Calculating..."
            if idx >= 3 and len(recent_durations) >= 3:
                avg_duration = sum(recent_durations[-4:]) / len(recent_durations[-4:])
                remaining_runs = total_runs - idx
                rem_sec = remaining_runs * avg_duration
                tot_sec = total_runs * avg_duration

                rem_m, rem_s = divmod(int(rem_sec), 60)
                rem_h, rem_m = divmod(rem_m, 60)
                rem_formatted = f"{rem_h}h {rem_m}m {rem_s}s" if rem_h > 0 else (f"{rem_m}m {rem_s}s" if rem_m > 0 else f"{rem_s}s")

                tot_m, tot_s = divmod(int(tot_sec), 60)
                tot_h, tot_m = divmod(tot_m, 60)
                tot_formatted = f"{tot_h}h {tot_m}m {tot_s}s" if tot_h > 0 else (f"{tot_m}m {tot_s}s" if tot_m > 0 else f"{tot_s}s")

                eta_str = f"Rem: {rem_formatted} | Est Total: {tot_formatted} (~{avg_duration:.1f}s/run)"

            # Remove spammy start print in favor of a single comprehensive completion line





            htf_on = combo.get("htf_ema_enabled", htf_ema_enabled)
            htf_tf = combo.get("htf_ema_timeframe", htf_ema_timeframe)
            htf_per = combo.get("htf_ema_period", htf_ema_period)

            cache_key = (s, tf, htf_on, htf_tf, htf_per)
            if cache_key not in analysis_cache:
                from broker_handler import BrokerHandler
                handler = BrokerHandler.get_handler(candle_source)
                try:
                    candles = handler.fetch_candles(
                        symbol=s,
                        timeframe=tf,
                        limit=limit,
                        date_from=date_from,
                        date_to=date_to,
                        account_id=account_id
                    )
                    if len(candles) > 1 and not date_to:
                        candles = candles[:-1]
                except Exception as e:
                    print(f"[Optimization] Failed to fetch candles for {s} {tf}: {e}", flush=True)
                    continue

                if not candles:
                    print(f"[Optimization] No candle data available for {s} {tf}.", flush=True)
                    continue

                # Fetch HTF candles if HTF EMA filter is active for this combo
                htf_candles_opt = None
                if htf_on:
                    try:
                        htf_candles_opt = handler.fetch_candles(
                            symbol=s,
                            timeframe=htf_tf,
                            limit=limit,
                            date_from=date_from,
                            date_to=date_to,
                            account_id=account_id
                        )
                        if len(htf_candles_opt) > 1 and not date_to:
                            htf_candles_opt = htf_candles_opt[:-1]
                    except Exception as e_htf:
                        print(f"[Optimization] Warning: Failed to fetch HTF candles for {s} {htf_tf}: {e_htf}", flush=True)
                        htf_candles_opt = None

                # Start Wyckoff Structure Analysis backtest
                analysis = StrategyHandler.analyze_market_data(
                    candles,
                    lookback=lookback_window,
                    progress_callback=lambda p: None,
                    htf_candles=htf_candles_opt,
                    htf_ema_enabled=htf_on,
                    htf_ema_period=htf_per
                )
                analysis_cache[cache_key] = list(analysis.get('data', []))

            annotated_data = analysis_cache[cache_key]
            if not annotated_data:
                print(f"[Optimization] No market data analyzed for {s} {tf}.", flush=True)
                continue

            # Fetch / cache 1m candles for intrabar resolution if timeframe is not 1m
            candles_1m_opt = None
            if tf.lower() not in ('1m', '1min'):
                if s not in candles_1m_cache:
                    from broker_handler import BrokerHandler
                    handler = BrokerHandler.get_handler(candle_source)
                    try:
                        c_1m = handler.fetch_candles(
                            symbol=s,
                            timeframe='1m',
                            limit=limit * 15,
                            date_from=date_from,
                            date_to=date_to,
                            account_id=account_id
                        )
                        if len(c_1m) > 1 and not date_to:
                            c_1m = c_1m[:-1]
                        candles_1m_cache[s] = c_1m
                    except Exception as e:
                        print(f"[Optimization] Warning: Failed to fetch 1m candles for {s}: {e}", flush=True)
                        candles_1m_cache[s] = []
                candles_1m_opt = candles_1m_cache.get(s)

            be_off = combo.get("be_offset", be_offset_mode)
            from backtest_helpers import run_trade_simulation
            sim_result = run_trade_simulation(
                annotated_data=annotated_data,
                symbol=s,
                sl_val=sl,
                sl_type=sl_type,
                rr=rr,
                size=size,
                initial_balance=initial_balance,
                use_risk_sizing=use_risk_sizing,
                risk_pct=risk_pct,
                use_break_even=(be is not None),
                be_trigger_r=be if be is not None else 1.0,
                be_offset_mode=be_off,
                fees_percent=fees_percent,
                daily_retry_limit=daily_retry_limit,
                allow_opposite_close=allow_opposite_close,
                check_cancelled=check_cancelled,
                date_from=date_from,
                date_to=date_to,
                timezone=timezone,
                sessions=sessions,
                use_global_close=use_global_close,
                global_close_time=global_close_time,
                progress_callback=None,
                entry_stability_rule=entry_stability_rule,
                daily_first_signals_mode=daily_first_signals_mode,
                daily_first_signals_count=daily_first_signals_count,
                daily_first_signals_risk_mult=daily_first_signals_risk_mult,
                candles_1m=candles_1m_opt,
                verbose=False
            )

            run_duration = time.time() - run_start_time
            pnl = sim_result["netPnl"]
            win_rate = sim_result["winRate"]
            trades_cnt = sim_result["totalTrades"]
            pf = sim_result["profitFactor"]
            pnl_str = f"+${pnl:.2f}" if pnl >= 0 else f"-${abs(pnl):.2f}"

            recent_durations.append(run_duration)
            if len(recent_durations) > 10:
                recent_durations.pop(0)

            # Only print log if Net PnL is greater than or equal to min_save_pnl (if min_save_pnl is configured)
            if min_save_pnl is None or pnl >= float(min_save_pnl):
                print(f"[Optimization] [{idx+1}/{total_runs}] ({pct}%) Testing {s} ({tf}) | SL:{sl}{sl_type} RR:1:{rr} BE:{be_str} -> {pnl_str} | WR: {win_rate:.1f}% | Trades: {trades_cnt} | PF: {pf:.2f} ({run_duration:.2f}s | {eta_str})", flush=True)


            # Save detailed combo results
            results_to_save = {
                "settings": {
                    "symbol": s,
                    "timeframe": tf,
                    "sl_val": sl,
                    "sl_type": sl_type,
                    "rr": rr,
                    "be_trigger_r": be,
                    "be_offset_mode": be_off,
                    "size": size,
                    "initial_balance": initial_balance,
                    "use_risk_sizing": use_risk_sizing,
                    "risk_pct": risk_pct,
                    "use_break_even": (be is not None),
                    "lookback_window": lookback_window,
                    "fees_percent": fees_percent,
                    "daily_retry_limit": daily_retry_limit,
                    "allow_opposite_close": allow_opposite_close,
                    "timezone": timezone,
                    "sessions": sessions,
                    "use_global_close": use_global_close,
                    "global_close_time": global_close_time,
                    "entry_stability_rule": entry_stability_rule,
                    "htf_ema_enabled": htf_on,
                    "htf_ema_period": htf_per,
                    "htf_ema_timeframe": htf_tf,
                    "date_from": date_from,
                    "date_to": date_to,
                    "limit": len(annotated_data)
                },
                "metrics": {
                    "winRate": sim_result["winRate"],
                    "netPnl": sim_result["netPnl"],
                    "profitFactor": sim_result["profitFactor"],
                    "totalTrades": sim_result["totalTrades"],
                    "maxDrawdown": sim_result["maxDrawdown"],
                    "maxDailyLoss": sim_result["maxDailyLoss"],
                    "dailyLossBreached": sim_result["dailyLossBreached"],
                    "candleCount": len(annotated_data),
                    "executionTimeSec": round(run_duration, 3)
                },
                "trades": sim_result["completed_trades_raw"]
            }

            try:
                # Auto-persist iteration run to MySQL database
                from sql_handler import SQLHandler
                be_str = str(be) if be is not None else "off"
                htf_tag = f"_htf{htf_per}" if htf_on else ""
                backtest_id_str = f"bt_{s.lower()}_{tf}_sl{sl}_rr{rr}_be{be_str}{htf_tag}_{int(time.time())}"
                SQLHandler.save_backtest_run(
                    backtest_id=backtest_id_str,
                    symbol=s,
                    timeframe=tf,
                    broker=candle_source,
                    sl_val=sl,
                    sl_type=sl_type,
                    rr=rr,
                    be_trigger_r=be if be is not None else 0.0,
                    net_pnl=sim_result["netPnl"],
                    win_rate=sim_result["winRate"],
                    trades_cnt=sim_result["totalTrades"],
                    profit_factor=sim_result["profitFactor"],
                    max_drawdown=sim_result["maxDrawdown"],
                    payload_dict=results_to_save,
                    min_pnl=min_save_pnl
                )
                # Saved to MySQL DB (logging suppressed for batch performance)
                pass
            except Exception as e:
                print(f"[SQLHandler] Failed auto-persisting backtest run to MySQL DB for {s} {tf}: {e}", flush=True)

            # Periodically release unreferenced memory
            if (idx + 1) % 25 == 0:
                import gc
                gc.collect()

            results.append({
                "symbol": s,
                "timeframe": tf,
                "sl": sl,
                "slType": sl_type,
                "rr": rr,
                "be": be,
                "beOffsetMode": be_off,
                "htfEmaEnabled": htf_on,
                "htfEmaPeriod": htf_per,
                "htfEmaTimeframe": htf_tf,
                "winRate": sim_result["winRate"],
                "netPnl": sim_result["netPnl"],
                "profitFactor": sim_result["profitFactor"],
                "totalTrades": sim_result["totalTrades"],
                "maxDrawdown": sim_result["maxDrawdown"],
                "maxDailyLoss": sim_result["maxDailyLoss"],
                "dailyLossBreached": sim_result["dailyLossBreached"],
                "executionTimeSec": round(run_duration, 3)
            })

        if progress_callback:
            progress_callback(100)

        total_duration = time.time() - overall_start_time
        if total_duration >= 60:
            duration_str = f"{int(total_duration // 60)}m {total_duration % 60:.2f}s"
        else:
            duration_str = f"{total_duration:.2f}s"

        best_combo = max(results, key=lambda x: x['netPnl']) if results else None
        if best_combo:
            print(f"[Optimization] Completed grid matrix optimization ({len(results)} runs) in {duration_str}. Best Net PnL: +${best_combo['netPnl']:.2f} ({best_combo['symbol']} {best_combo['timeframe']} SL:{best_combo['sl']} RR:{best_combo['rr']})", flush=True)
        else:
            print(f"[Optimization] Completed grid matrix optimization ({len(results)} runs) in {duration_str}.", flush=True)

        return {
            "status": "success",
            "results": results,
            "totalExecutionTimeSec": round(total_duration, 2)
        }

    @staticmethod
    def filter_best_sessions_from_trades(trades: list, timezone_str: str = 'Local', min_hourly_pnl: float = 0.0) -> tuple:
        """
        Groups trades by entry hour in specified timezone, filters hours with total PnL > min_hourly_pnl
        (and at least 1 trade), and generates 1-hour session objects for all 7 weekdays.
        Returns (discovered_sessions, hourly_stats).
        """
        from backtest_helpers import get_candle_datetime
        hourly_stats = {h: {"count": 0, "wins": 0, "pnl": 0.0} for h in range(24)}
        for tr in trades:
            ts = tr.get('entryTimestamp') or tr.get('entry_time') or tr.get('entry_timestamp')
            if not ts:
                continue
            dt = get_candle_datetime(float(ts), timezone_str)
            h = dt.hour
            pnl = float(tr.get('pnl', 0.0))
            hourly_stats[h]["count"] += 1
            hourly_stats[h]["pnl"] += pnl
            if tr.get('outcome') == 'WIN' or pnl >= 0:
                hourly_stats[h]["wins"] += 1

        discovered_sessions = []
        for h in range(24):
            stat = hourly_stats[h]
            if stat["count"] > 0 and stat["pnl"] > min_hourly_pnl:
                discovered_sessions.append({
                    "id": f"sess_h{h:02d}",
                    "name": f"Hour {h:02d}:00-{h:02d}:59",
                    "start": f"{h:02d}:00",
                    "end": f"{h:02d}:59",
                    "weekdays": [1, 2, 3, 4, 5, 6, 7],
                    "active": True
                })

        return discovered_sessions, hourly_stats
