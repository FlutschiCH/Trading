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
        if wyckoff_candles:
            print("DEBUG: FIRST CANDLE KEYS =", list(wyckoff_candles[0].keys()), flush=True)
            print("DEBUG: FIRST CANDLE SMA_20 =", wyckoff_candles[0].get('sma_20'), flush=True)
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
        progress_callback = None
    ) -> dict:
        """
        Runs the full Wyckoff structure analysis backtest in Python.
        """
        print(f"\n[Backtest] Starting Wyckoff Structure Analysis backtest for {symbol} on {len(candles)} candles...", flush=True)
        analysis = StrategyHandler.analyze_market_data(candles, lookback=lookback_window, progress_callback=progress_callback)
        annotated_data = list(analysis.get('data', []))
        
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
                    "date_to": date_to
                },
                "metrics": {
                    "winRate": 0.0,
                    "netPnl": 0.0,
                    "profitFactor": 0.0,
                    "totalTrades": 0,
                    "maxDrawdown": 0.0,
                    "maxDailyLoss": 0.0,
                    "dailyLossBreached": False,
                    "candleCount": len(annotated_data)
                },
                "trades": []
            }
            results_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backtest_results.json')
            with open(results_path, 'w') as f:
                json.dump(results_to_save, f, indent=4)
        except Exception as e:
            print(f"Failed to save backtest results to JSON: {e}", flush=True)

        return {
            "trades": [],
            "winRate": 0.0,
            "netPnl": 0.0,
            "profitFactor": 0.0,
            "totalTrades": 0,
            "maxDrawdown": 0.0,
            "maxDailyLoss": 0.0,
            "dailyLossBreached": False,
            "candles": annotated_data,
            "monthlyBreakdown": {},
            "weeklyBreakdown": {},
            "fvgs": []
        }
