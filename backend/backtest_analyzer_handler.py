import json
import math
from typing import Dict, Any, List, Optional
from sql_handler import SQLHandler

class BacktestAnalyzerHandler:
    @staticmethod
    def analyze_backtest(
        backtest_id: Optional[str] = None,
        backtest_payload: Optional[Dict[str, Any]] = None,
        max_trades_in_log: int = 150
    ) -> Dict[str, Any]:
        """
        Analyzes a single backtest run (from MySQL ID or directly provided payload dict).
        Calculates granular performance KPIs (metrics, drawdown, win/loss stats, hourly/session patterns,
        risk analysis) and builds an optimized LLM-ready AI JSON prompt.
        """
        payload = None
        if backtest_id:
            payload = SQLHandler.get_saved_backtest_by_id(str(backtest_id))
        elif backtest_payload:
            payload = backtest_payload

        if not payload:
            return {
                "status": "error",
                "message": f"Backtest not found or empty payload (ID: {backtest_id})"
            }

        settings = payload.get("settings", {})
        metrics = payload.get("metrics", {})
        trades = payload.get("trades", []) or payload.get("completed_trades_raw", [])

        # Fallback symbol and timeframe from top level or settings
        symbol = payload.get("symbol") or settings.get("symbol") or "UNKNOWN"
        timeframe = payload.get("timeframe") or settings.get("timeframe") or "UNKNOWN"
        broker = payload.get("broker") or settings.get("broker") or "metatrader"

        total_trades = len(trades)
        if total_trades == 0:
            summary = {
                "backtest_id": backtest_id or payload.get("id"),
                "symbol": symbol,
                "timeframe": timeframe,
                "broker": broker,
                "settings": settings,
                "total_trades": 0,
                "win_rate": 0.0,
                "net_pnl": 0.0,
                "profit_factor": 0.0,
                "total_wins": 0,
                "total_losses": 0,
                "max_drawdown": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0
            }
            return {
                "status": "success",
                "summary": summary,
                "trade_log": [],
                "prompt_for_ai": json.dumps({
                    "instruction": "Analyze the following backtest simulation results and trade log. Identify strategy flaws, timing, risk management bottlenecks, and provide actionable improvements.",
                    "metadata": {"backtest_id": backtest_id, "symbol": symbol, "timeframe": timeframe},
                    "settings": settings,
                    "metrics": summary,
                    "trade_log": []
                }, indent=2)
            }

        wins = []
        losses = []
        break_evens = []
        formatted_trades = []

        cum_pnl = 0.0
        peak = 0.0
        max_drawdown_dollar = 0.0
        consecutive_wins = 0
        consecutive_losses = 0
        max_consecutive_wins = 0
        max_consecutive_losses = 0

        long_trades = 0
        long_wins = 0
        long_pnl = 0.0
        short_trades = 0
        short_wins = 0
        short_pnl = 0.0

        hourly_pnl: Dict[str, Dict[str, Any]] = {}
        daily_pnl: Dict[str, Dict[str, Any]] = {}
        exit_reasons: Dict[str, int] = {}

        for idx, t in enumerate(trades):
            trade_id = t.get("id", idx + 1)
            pnl = float(t.get("pnl") if t.get("pnl") is not None else (t.get("profit") or t.get("net_pnl") or 0.0))
            fees = float(t.get("fees") or t.get("commission") or 0.0)
            net_trade_pnl = round(pnl - fees, 2)
            trade_type = str(t.get("type") or t.get("side") or t.get("trade_side") or "BUY").upper()
            entry_price = float(t.get("entryPrice") or t.get("price") or 0.0)
            exit_price = float(t.get("exitPrice") or 0.0)
            sl_price = float(t.get("slPrice") or t.get("originalSlPrice") or 0.0)
            tp_price = float(t.get("tpPrice") or 0.0)
            qty = float(t.get("qty") or t.get("volume") or 0.0)
            outcome = str(t.get("outcome") or ("WIN" if net_trade_pnl > 0 else ("LOSS" if net_trade_pnl < 0 else "BE"))).upper()
            exit_reason = str(t.get("exitReason") or t.get("reason") or "Standard")
            entry_ts = t.get("entryTimestamp") or t.get("timestamp") or 0
            exit_ts = t.get("exitTimestamp") or t.get("timestamp") or 0
            duration = t.get("duration")

            # Consecutive win/loss tracking
            if net_trade_pnl > 0:
                wins.append(t)
                consecutive_wins += 1
                consecutive_losses = 0
                if consecutive_wins > max_consecutive_wins:
                    max_consecutive_wins = consecutive_wins
            elif net_trade_pnl < 0:
                losses.append(t)
                consecutive_losses += 1
                consecutive_wins = 0
                if consecutive_losses > max_consecutive_losses:
                    max_consecutive_losses = consecutive_losses
            else:
                break_evens.append(t)
                consecutive_wins = 0
                consecutive_losses = 0

            # Directional metrics
            if "BUY" in trade_type or "LONG" in trade_type:
                long_trades += 1
                long_pnl += net_trade_pnl
                if net_trade_pnl > 0:
                    long_wins += 1
            else:
                short_trades += 1
                short_pnl += net_trade_pnl
                if net_trade_pnl > 0:
                    short_wins += 1

            # Equity curve & Max Drawdown
            cum_pnl += net_trade_pnl
            if cum_pnl > peak:
                peak = cum_pnl
            dd = peak - cum_pnl
            if dd > max_drawdown_dollar:
                max_drawdown_dollar = dd

            # Exit reason frequency
            exit_reasons[exit_reason] = exit_reasons.get(exit_reason, 0) + 1

            # Time distribution tracking
            if entry_ts:
                try:
                    from datetime import datetime
                    dt = datetime.utcfromtimestamp(entry_ts)
                    hr_str = f"{dt.hour:02d}:00"
                    if hr_str not in hourly_pnl:
                        hourly_pnl[hr_str] = {"trades": 0, "pnl": 0.0, "wins": 0}
                    hourly_pnl[hr_str]["trades"] += 1
                    hourly_pnl[hr_str]["pnl"] = round(hourly_pnl[hr_str]["pnl"] + net_trade_pnl, 2)
                    if net_trade_pnl > 0:
                        hourly_pnl[hr_str]["wins"] += 1

                    day_str = dt.strftime("%A")
                    if day_str not in daily_pnl:
                        daily_pnl[day_str] = {"trades": 0, "pnl": 0.0, "wins": 0}
                    daily_pnl[day_str]["trades"] += 1
                    daily_pnl[day_str]["pnl"] = round(daily_pnl[day_str]["pnl"] + net_trade_pnl, 2)
                    if net_trade_pnl > 0:
                        daily_pnl[day_str]["wins"] += 1
                except Exception:
                    pass

            formatted_trades.append({
                "id": trade_id,
                "type": trade_type,
                "entryPrice": entry_price,
                "exitPrice": exit_price,
                "slPrice": sl_price,
                "tpPrice": tp_price,
                "qty": qty,
                "netPnl": net_trade_pnl,
                "outcome": outcome,
                "exitReason": exit_reason,
                "durationCandles": duration,
                "entryTimestamp": entry_ts,
                "exitTimestamp": exit_ts,
                "triggerReason": t.get("triggerReason")
            })

        total_wins = len(wins)
        total_losses = len(losses)
        win_rate = round((total_wins / total_trades) * 100, 2) if total_trades > 0 else 0.0

        gross_profit = sum((float(t.get("pnl") or 0.0) for t in wins))
        gross_loss = abs(sum((float(t.get("pnl") or 0.0) for t in losses)))
        net_pnl = round(cum_pnl, 2)
        profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (round(gross_profit, 2) if gross_profit > 0 else 0.0)

        avg_win = round(gross_profit / total_wins, 2) if total_wins > 0 else 0.0
        avg_loss = round(gross_loss / total_losses, 2) if total_losses > 0 else 0.0
        win_loss_ratio = round(avg_win / avg_loss, 2) if avg_loss > 0 else 0.0

        long_wr = round((long_wins / long_trades) * 100, 1) if long_trades > 0 else 0.0
        short_wr = round((short_wins / short_trades) * 100, 1) if short_trades > 0 else 0.0

        summary = {
            "backtest_id": backtest_id or payload.get("id"),
            "symbol": symbol,
            "timeframe": timeframe,
            "broker": broker,
            "total_trades": total_trades,
            "total_wins": total_wins,
            "total_losses": total_losses,
            "total_break_evens": len(break_evens),
            "win_rate": win_rate,
            "net_pnl": net_pnl,
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
            "profit_factor": profit_factor,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "win_loss_payoff_ratio": win_loss_ratio,
            "max_drawdown_dollar": round(max_drawdown_dollar, 2),
            "max_consecutive_wins": max_consecutive_wins,
            "max_consecutive_losses": max_consecutive_losses,
            "long_performance": {
                "trades": long_trades,
                "wins": long_wins,
                "win_rate": long_wr,
                "pnl": round(long_pnl, 2)
            },
            "short_performance": {
                "trades": short_trades,
                "wins": short_wins,
                "win_rate": short_wr,
                "pnl": round(short_pnl, 2)
            },
            "exit_reasons_breakdown": exit_reasons,
            "hourly_distribution": hourly_pnl,
            "weekday_distribution": daily_pnl
        }

        # Truncate trade log for prompt if necessary to avoid exceeding AI context bounds
        prompt_trade_log = formatted_trades[:max_trades_in_log] if max_trades_in_log > 0 else formatted_trades

        prompt_data = {
            "instruction": "You are an elite quantitative hedge fund trader and algorithmic strategist. Analyze the following single backtest simulation run and its granular trade log. Provide an in-depth audit covering: (1) Strategy profitability & expectancy, (2) Risk management, drawdown & loss clustering risks, (3) Long vs Short directional bias asymmetries, (4) Time-of-day / session performance leaks, (5) Specific recommendations for SL/RR/BE optimization and parameter refinement.",
            "backtest_metadata": {
                "backtest_id": backtest_id or payload.get("id"),
                "symbol": symbol,
                "timeframe": timeframe,
                "broker": broker
            },
            "strategy_settings": settings,
            "performance_metrics": summary,
            "trade_log_sample": prompt_trade_log,
            "trade_log_total_count": total_trades,
            "is_truncated": len(formatted_trades) > len(prompt_trade_log)
        }

        prompt_str = json.dumps(prompt_data, indent=2)

        return {
            "status": "success",
            "summary": summary,
            "settings": settings,
            "trade_log": formatted_trades,
            "prompt_for_ai": prompt_str
        }
