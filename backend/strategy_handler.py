import pandas as pd
import json
from indicator_handler import IndicatorHandler
from trading_handler import TradingHandler

class StrategyHandler:
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
        entry_stability_rule: str = 'default'
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
