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
        broker: str = 'metatrader'
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
            entry_stability_rule=entry_stability_rule
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
        candles: list,
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
        entry_stability_rule: str = 'default'
    ) -> dict:
        """
        Runs Wyckoff Structure Analysis once, then runs multiple trade simulations across the parameter range.
        """
        print(f"\n[Optimization] Starting parameter range optimization for {symbol} on {len(candles)} candles...", flush=True)
        
        # 1. Run Market Data Analysis (once, takes 0% to 40% progress)
        wrapped_cb = None
        if progress_callback:
            wrapped_cb = lambda p: progress_callback(int(p * 0.4))
            
        analysis = StrategyHandler.analyze_market_data(candles, lookback=lookback_window, progress_callback=wrapped_cb)
        annotated_data = list(analysis.get('data', []))
        
        # Calculate RR range values
        rr_values = []
        current_rr = rr_start
        while current_rr <= rr_end + 0.0001:
            rr_values.append(round(current_rr, 2))
            current_rr += rr_step
            
        if not rr_values:
            rr_values = [2.0]
            
        results = []
        from backtest_helpers import run_trade_simulation
        
        for idx, temp_rr in enumerate(rr_values):
            if check_cancelled and check_cancelled():
                break
                
            if progress_callback:
                # Map 40% to 100% across the loops
                loop_pct = 40 + int(((idx) / len(rr_values)) * 60)
                progress_callback(loop_pct)
                
            sim_result = run_trade_simulation(
                annotated_data=annotated_data,
                symbol=symbol,
                sl_val=sl_val,
                sl_type=sl_type,
                rr=temp_rr,
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
                progress_callback=None, # Run fast without inner progress reporting
                entry_stability_rule=entry_stability_rule
            )
            
            results.append({
                "rr": temp_rr,
                "winRate": sim_result["winRate"],
                "netPnl": sim_result["netPnl"],
                "profitFactor": sim_result["profitFactor"],
                "totalTrades": sim_result["totalTrades"],
                "maxDrawdown": sim_result["maxDrawdown"],
                "maxDailyLoss": sim_result["maxDailyLoss"],
                "dailyLossBreached": sim_result["dailyLossBreached"]
            })
            
        if progress_callback:
            progress_callback(100)
            
        return {
            "status": "success",
            "results": results
        }

