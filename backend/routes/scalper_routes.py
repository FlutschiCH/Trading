from flask import Blueprint, request, jsonify
from scalper_handler import ScalperHandler, ExhaustionDetector, SignalEngine, RiskManager

scalper_routes = Blueprint('scalper_routes', __name__)

@scalper_routes.route('/evaluate', methods=['POST'])
def evaluate_scalper():
    try:
        data = request.get_json() or {}
        candles = data.get('candles', [])
        state = data.get('state', {})
        symbol = data.get('symbol', 'EURUSD')
        spread = float(data.get('spread_pips', 0.8))
        balance = float(data.get('balance', 1000.0))
        risk_percent = float(data.get('risk_percent', 1.0))
        atr_multiplier = float(data.get('atr_multiplier', 2.5))
        vol_multiplier = float(data.get('vol_multiplier', 3.0))
        min_wick_ratio = float(data.get('min_wick_ratio', 0.40))

        print(f"\n🔍 [Scalper Evaluation Request] Symbol: {symbol} | Candles: {len(candles)} | Spread: {spread}p | Balance: ${balance} | ATR Multiplier: {atr_multiplier}x | Vol Multiplier: {vol_multiplier}x | Wick: {min_wick_ratio*100}%", flush=True)

        result = ScalperHandler.evaluate_market(
            candles=candles,
            state=state,
            symbol=symbol,
            current_spread_pips=spread,
            account_balance=balance,
            risk_percent=risk_percent,
            atr_multiplier=atr_multiplier,
            vol_multiplier=vol_multiplier,
            min_wick_ratio=min_wick_ratio
        )
        print(f"📊 [Scalper Result] Action: {result.get('action')} | Status: {result.get('state', {}).get('status', 'IDLE')} | Reason: {result.get('reason', 'N/A')}\n", flush=True)
        return jsonify({"status": "success", "result": result}), 200
    except Exception as e:
        print(f"❌ [Scalper Error] Exception during evaluation: {e}", flush=True)
        return jsonify({"status": "error", "message": str(e)}), 500

@scalper_routes.route('/backtest', methods=['POST'])
def backtest_scalper():
    try:
        data = request.get_json() or {}
        symbol = data.get('symbol', 'EURUSD')
        candles = data.get('candles', [])
        balance = float(data.get('balance', 1000.0))
        risk_percent = float(data.get('risk_percent', 1.0))
        atr_multiplier = float(data.get('atr_multiplier', 2.5))
        vol_multiplier = float(data.get('vol_multiplier', 3.0))
        min_wick_ratio = float(data.get('min_wick_ratio', 0.40))
        max_spread_pips = float(data.get('max_spread_pips', 1.2))
        hard_stop_minutes = int(data.get('hard_stop_minutes', 8))

        print(f"\n⚡ [Scalper Backtest Request] Symbol: {symbol} | Candles: {len(candles)} | Balance: ${balance} | ATR Mult: {atr_multiplier}x | Vol Mult: {vol_multiplier}x | Wick: {min_wick_ratio*100}%", flush=True)

        res = ScalperHandler.run_scalper_backtest(
            candles=candles,
            symbol=symbol,
            initial_balance=balance,
            risk_percent=risk_percent,
            atr_multiplier=atr_multiplier,
            vol_multiplier=vol_multiplier,
            min_wick_ratio=min_wick_ratio,
            max_spread_pips=max_spread_pips,
            hard_stop_minutes=hard_stop_minutes
        )

        summary = res.get('summary', {})
        print(f"📊 [Scalper Backtest Result] Spikes Found: {summary.get('triggered_spikes_count', 0)} | Total Trades: {summary.get('total_trades', 0)} | Win Rate: {summary.get('win_rate', 0)}% | Net PnL: ${summary.get('net_profit', 0)} ({summary.get('pnl_pct', 0)}%)\n", flush=True)

        return jsonify(res), 200
    except Exception as e:
        print(f"❌ [Scalper Backtest Error] {e}", flush=True)
        return jsonify({"status": "error", "message": str(e)}), 500

