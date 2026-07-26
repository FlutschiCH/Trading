from flask import Blueprint, request, jsonify
from broker_handler import BrokerHandler

trading_routes = Blueprint('trading_routes', __name__)

def _get_handler(payload):
    broker_name = payload.get('broker', 'ctrader')
    return BrokerHandler.get_handler(broker_name)

@trading_routes.route('/trade/account', methods=['POST'])
def account():
    payload = request.get_json(force=True) or {}
    handler = _get_handler(payload)
    return jsonify(handler.get_account())

@trading_routes.route('/trade/positions', methods=['POST'])
def positions():
    payload = request.get_json(force=True) or {}
    handler = _get_handler(payload)
    return jsonify({"status": "success", "data": handler.get_positions()})

@trading_routes.route('/trade/order', methods=['POST'])
def order():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON format"}), 400

    symbol = payload.get('symbol', 'EURUSD')
    side = payload.get('order_type', 'buy')
    volume = float(payload.get('volume', 0.01))
    price = payload.get('price')
    if price is not None:
        price = float(price)

    handler = _get_handler(payload)
    result = handler.create_order(symbol, side, volume, price)
    return jsonify(result)

@trading_routes.route('/trade/close', methods=['POST'])
def close():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    position_id = payload.get('position_id')
    symbol = payload.get('symbol', 'EURUSD')
    side = payload.get('side', 'buy')
    volume = float(payload.get('volume', 0.01))

    handler = _get_handler(payload)
    result = handler.close_position(position_id, symbol, side, volume)
    return jsonify(result)

@trading_routes.route('/trade/candles', methods=['POST'])
def candles():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    broker_name = payload.get('broker', 'ctrader')
    symbol = payload.get('symbol', 'EURUSD')
    timeframe = payload.get('interval', '15m')
    limit = int(payload.get('limit', 1000))
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')

    if date_from is not None:
        date_from = int(date_from)
    if date_to is not None:
        date_to = int(date_to)

    from broker_handler import BrokerHandler
    handler = BrokerHandler.get_handler(broker_name)
    candles_data = handler.fetch_candles(symbol, timeframe, limit, date_from, date_to)

    lookback = payload.get('lookback')
    simulated_trades = []
    if lookback:
        try:
            from wyckoff_handler import WyckoffHandler
            candles_data = WyckoffHandler.analyze_wyckoff_structure(candles_data, lookback=int(lookback))
        except Exception as e:
            print(f"Error running Wyckoff analysis on trade candles: {e}", flush=True)

    return jsonify({
        "status": "success",
        "candles": candles_data,
        "trades": simulated_trades
    })

@trading_routes.route('/trade/history', methods=['POST'])
def history():
    payload = request.get_json(force=True) or {}
    handler = _get_handler(payload)
    return jsonify(handler.get_history())
