import pandas as pd
import json
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
        daily_trades_count: dict = None
    ) -> tuple:
        """
        Pure signal detection logic shared between Backtesting and Live Trading.
        Updates state dictionary in-place and returns (should_buy, should_sell, state).
        """
        if daily_trades_count is None:
            daily_trades_count = {}

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
        if wyckoff_sig == "Spring detected":
            pending_buy = True
            spring_high = float(c.get('high', 0))
            pending_buy_age = 0
            pending_sell = False

        if wyckoff_sig == "Upthrust detected":
            pending_sell = True
            upthrust_low = float(c.get('low', 0))
            pending_sell_age = 0
            pending_buy = False

        should_buy = False
        should_sell = False

        # Evaluate pending buy trigger
        if pending_buy:
            duration_ok = True
            if entry_stability_rule in ('duration', 'both'):
                duration_ok = (accum_consec_bars >= 3)

            confirmation_ok = True
            if entry_stability_rule in ('confirmation', 'both'):
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

        # Daily retry limit
        try:
            from datetime import datetime
            date_str = datetime.utcfromtimestamp(candle_time).strftime('%Y-%m-%d')
        except Exception:
            date_str = 'unknown'

        if daily_retry_limit > 0 and daily_trades_count.get(date_str, 0) >= daily_retry_limit:
            should_buy = False
            should_sell = False

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
    def analyze_market_data(bars_list: list, lookback: int = 20, progress_callback=None) -> dict:
        """
        Takes raw candlestick data, runs Wyckoff structure analysis,
        and returns the annotated dataset.
        """
        if not bars_list:
            return {"status": "success", "data": [], "fvgs": []}
            
        from wyckoff_handler import WyckoffHandler
        wyckoff_candles = WyckoffHandler.analyze_wyckoff_structure(bars_list, lookback=lookback, progress_callback=progress_callback)
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
        global_close_time: str = '',
        progress_callback = None,
        entry_stability_rule: str = 'default',
        broker: str = 'metatrader',
        session_config: dict = None
    ) -> dict:
        """
        Runs the full Wyckoff structure analysis backtest in Python.
        """
        print(f"\n[Backtest] Starting Wyckoff Structure Analysis backtest for {symbol} on {len(candles)} candles...", flush=True)
        
        # 1. Run Market Data Analysis (0% to 50% progress)
        wrapped_cb = None
        if progress_callback:
            wrapped_cb = lambda p: progress_callback(int(p / 2))
            
        analysis = StrategyHandler.analyze_market_data(candles, lookback=lookback_window, progress_callback=wrapped_cb)
        annotated_data = list(analysis.get('data', []))
        
        # 2. Run Trade Simulation (50% to 100% progress)
        from backtest_helpers import run_trade_simulation
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
            progress_callback=progress_callback,
            entry_stability_rule=entry_stability_rule,
            session_config=session_config
        )
        
        from candle_sanitizer import sanitize_and_fill_candles
        annotated_data = sanitize_and_fill_candles(annotated_data)
        
        if progress_callback:
            try:
                progress_callback(100)
            except Exception:
                pass

        try:
            import os
            results_to_save = {
                "explainer": "Wyckoff Structure Analysis backtest.",
                "settings": {
                    "symbol": symbol,
                    "lookback_window": lookback_window,
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
                    "candleCount": len(annotated_data)
                },
                "trades": sim_result["completed_trades_raw"],
                "candles": annotated_data
            }
            results_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backtest_results.json')
            with open(results_path, 'w') as f:
                json.dump(results_to_save, f, indent=4)
            # Save specific backtest results for broker + symbol
            specific_filename = f"backtest_results_{broker.lower()}_{symbol.upper()}.json"
            specific_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), specific_filename)
            with open(specific_path, 'w') as f:
                json.dump(results_to_save, f, indent=4)
        except Exception as e:
            print(f"Failed to save backtest results to JSON: {e}", flush=True)

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
        lookback_window: int,
        rr_start: float,
        rr_end: float,
        rr_step: float,
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
        be_step: float = None
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

        # Generate Break-Even values
        if use_break_even and be_range_mode and be_start is not None and be_end is not None and be_step:
            be_values = []
            curr = be_start
            while curr <= be_end + 0.0001:
                be_values.append(round(curr, 2))
                curr += be_step
        else:
            be_values = [be_trigger_r] if use_break_even else [None]

        symbols_list = symbols if (symbols and len(symbols) > 0) else [symbol]
        timeframes_list = timeframes if (timeframes and len(timeframes) > 0) else [timeframe]

        # Build combination matrix
        matrix = []
        for s in symbols_list:
            for tf in timeframes_list:
                for sl in sl_values:
                    for rr in rr_values:
                        for be in be_values:
                            matrix.append({
                                "symbol": s,
                                "timeframe": tf,
                                "sl": sl,
                                "rr": rr,
                                "be": be
                            })

        import time
        overall_start_time = time.time()
        print(f"\n[Optimization] Starting grid matrix optimization with {len(matrix)} combinations...", flush=True)

        analysis_cache = {}
        results = []
        total_runs = len(matrix)

        for idx, combo in enumerate(matrix):
            if check_cancelled and check_cancelled():
                print(f"[Optimization] Optimization cancelled by user at run {idx}/{total_runs}.", flush=True)
                break

            run_start_time = time.time()
            pct = int((idx / total_runs) * 100)
            if progress_callback:
                progress_callback(pct)

            s = combo["symbol"]
            tf = combo["timeframe"]
            sl = combo["sl"]
            rr = combo["rr"]
            be = combo["be"]
            be_str = f"{be}R" if be is not None else "Off"

            print(f"[Optimization] [{idx+1}/{total_runs}] ({pct}%) Testing {s} ({tf}) | SL: {sl}{sl_type} | RR: 1:{rr} | BE: {be_str}...", flush=True)

            cache_key = (s, tf)
            if cache_key not in analysis_cache:
                from broker_handler import BrokerHandler
                handler = BrokerHandler.get_handler(candle_source)
                try:
                    candles = handler.fetch_candles(
                        symbol=s,
                        timeframe=tf,
                        limit=limit,
                        date_from=date_from,
                        date_to=date_to
                    )
                    if len(candles) > 1 and not date_to:
                        candles = candles[:-1]
                except Exception as e:
                    print(f"[Optimization] Failed to fetch candles for {s} {tf}: {e}", flush=True)
                    continue

                if not candles:
                    print(f"[Optimization] No candle data available for {s} {tf}.", flush=True)
                    continue

                analysis = StrategyHandler.analyze_market_data(candles, lookback=lookback_window)
                analysis_cache[cache_key] = list(analysis.get('data', []))

            annotated_data = analysis_cache[cache_key]
            if not annotated_data:
                print(f"[Optimization] No market data analyzed for {s} {tf}.", flush=True)
                continue

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
                entry_stability_rule=entry_stability_rule
            )

            run_duration = time.time() - run_start_time
            pnl = sim_result["netPnl"]
            win_rate = sim_result["winRate"]
            trades_cnt = sim_result["totalTrades"]
            pf = sim_result["profitFactor"]
            pnl_str = f"+${pnl:.2f}" if pnl >= 0 else f"-${abs(pnl):.2f}"
            print(f"[Optimization] [{idx+1}/{total_runs}] -> Result ({run_duration:.2f}s): Net PnL: {pnl_str} | Win Rate: {win_rate:.1f}% | Trades: {trades_cnt} | PF: {pf:.2f}", flush=True)

            # Save detailed combo results
            results_to_save = {
                "settings": {
                    "symbol": s,
                    "timeframe": tf,
                    "sl_val": sl,
                    "sl_type": sl_type,
                    "rr": rr,
                    "be_trigger_r": be,
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
                "trades": sim_result["completed_trades_raw"],
                "candles": annotated_data
            }

            be_file_str = str(be) if be is not None else "off"
            specific_filename = f"backtest_results_{candle_source.lower()}_{s.lower()}_{tf}_sl{sl}_rr{rr}_be{be_file_str}.json"
            specific_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), specific_filename)
            try:
                with open(specific_path, 'w') as f:
                    json.dump(results_to_save, f, indent=4)
            except Exception as e:
                print(f"Failed to save detailed backtest results to {specific_filename}: {e}", flush=True)

            results.append({
                "symbol": s,
                "timeframe": tf,
                "sl": sl,
                "slType": sl_type,
                "rr": rr,
                "be": be,
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



