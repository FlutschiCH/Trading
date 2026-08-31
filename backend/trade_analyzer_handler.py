import time
import math
from typing import Dict, Any, List
from broker_handler import BrokerHandler

class TradeAnalyzerHandler:
    @staticmethod
    def analyze_trades(account_id: int = None, date_from: int = None, date_to: int = None, broker: str = "metatrader", **kwargs) -> Dict[str, Any]:
        """
        Fetches deals/trades from target broker, calculates performance metrics,
        and constructs an LLM-ready analysis JSON prompt.
        """
        handler = BrokerHandler.get_handler(broker)
        deals = handler.get_history(date_from=date_from, date_to=date_to, account_id=account_id, **kwargs)
        
        if not deals:
            return {
                "status": "success",
                "summary": {
                    "total_trades": 0,
                    "win_rate": 0,
                    "net_pnl": 0.0,
                    "profit_factor": 0.0,
                    "total_wins": 0,
                    "total_losses": 0,
                    "max_drawdown": 0.0
                },
                "prompt_for_ai": "No historical trades found for the selected time window."
            }

        total_trades = len(deals)
        wins = [d for d in deals if d.get('profit', 0) > 0]
        losses = [d for d in deals if d.get('profit', 0) < 0]
        
        total_wins = len(wins)
        total_losses = len(losses)
        win_rate = round((total_wins / total_trades) * 100, 2) if total_trades > 0 else 0.0

        gross_profit = sum(d['profit'] for d in wins)
        gross_loss = abs(sum(d['profit'] for d in losses))
        net_pnl = round(sum(d.get('profit', 0) + d.get('commission', 0) + d.get('swap', 0) for d in deals), 2)
        profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (round(gross_profit, 2) if gross_profit > 0 else 0.0)

        # Calculate equity curve & max drawdown
        cum_pnl = 0.0
        peak = 0.0
        max_drawdown = 0.0
        
        symbol_stats: Dict[str, Dict[str, Any]] = {}
        
        for d in deals:
            pnl = d.get('profit', 0) + d.get('commission', 0) + d.get('swap', 0)
            cum_pnl += pnl
            if cum_pnl > peak:
                peak = cum_pnl
            dd = peak - cum_pnl
            if dd > max_drawdown:
                max_drawdown = dd

            sym = d.get('symbol', 'UNKNOWN')
            if sym not in symbol_stats:
                symbol_stats[sym] = {"trades": 0, "pnl": 0.0, "wins": 0, "losses": 0}
            symbol_stats[sym]["trades"] += 1
            symbol_stats[sym]["pnl"] = round(symbol_stats[sym]["pnl"] + pnl, 2)
            if pnl > 0:
                symbol_stats[sym]["wins"] += 1
            elif pnl < 0:
                symbol_stats[sym]["losses"] += 1

        for sym in symbol_stats:
            st = symbol_stats[sym]
            st["win_rate"] = round((st["wins"] / st["trades"]) * 100, 1) if st["trades"] > 0 else 0.0

        formatted_trades = []
        for d in deals:
            formatted_trades.append({
                "ticket": d.get("ticket"),
                "symbol": d.get("symbol"),
                "side": d.get("trade_side"),
                "volume": d.get("volume"),
                "price": d.get("price"),
                "profit": d.get("profit"),
                "commission": d.get("commission", 0),
                "swap": d.get("swap", 0),
                "timestamp": d.get("timestamp")
            })

        summary = {
            "total_trades": total_trades,
            "total_wins": total_wins,
            "total_losses": total_losses,
            "win_rate": win_rate,
            "net_pnl": net_pnl,
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
            "profit_factor": profit_factor,
            "max_drawdown": round(max_drawdown, 2),
            "symbols_breakdown": symbol_stats
        }

        # Build prompt string for easy AI submission
        prompt_data = {
            "instruction": "Analyze the following MetaTrader trading performance and trade logs. Highlight strengths, risk management flaws, overtrading patterns, symbol-specific performance issues, and actionable optimization advice.",
            "metrics": summary,
            "trade_log": formatted_trades
        }

        import json
        prompt_str = json.dumps(prompt_data, indent=2)

        return {
            "status": "success",
            "summary": summary,
            "trade_log": formatted_trades,
            "prompt_for_ai": prompt_str
        }
