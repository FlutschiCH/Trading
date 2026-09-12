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


@scalper_routes.route('/risk_calc', methods=['POST'])
def calculate_risk():
    try:
        data = request.get_json() or {}
        symbol = data.get('symbol', 'EURUSD')
        direction = data.get('direction', 'BUY')
        entry_price = float(data.get('entry_price', 1.08000))
        spike_high = float(data.get('spike_high', entry_price))
        spike_low = float(data.get('spike_low', entry_price))
        balance = float(data.get('balance', 1000.0))
        spread = float(data.get('spread_pips', 0.8))
        risk_percent = float(data.get('risk_percent', 1.0))

        result = RiskManager.evaluate_risk(
            symbol=symbol,
            direction=direction,
            entry_price=entry_price,
            spike_high=spike_high,
            spike_low=spike_low,
            account_balance=balance,
            current_spread_pips=spread,
            risk_percent=risk_percent
        )
        return jsonify({"status": "success", "risk": result}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
