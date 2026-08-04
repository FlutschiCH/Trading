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
    side = payload.get('order_type') or payload.get('side', 'buy')
    volume = float(payload.get('volume', 0.01))
    price = payload.get('price')
    if price is not None:
        price = float(price)

    stop_loss = payload.get('stop_loss')
    if stop_loss is not None:
        stop_loss = float(stop_loss)
    take_profit = payload.get('take_profit')
    if take_profit is not None:
        take_profit = float(take_profit)

    magic = payload.get('magic')
    if magic is not None:
        try:
            magic = int(magic)
        except (ValueError, TypeError):
            magic = 123456
    else:
        magic = 123456

    handler = _get_handler(payload)
    result = handler.create_order(
        symbol=symbol,
        side=side,
        volume=volume,
        price=price,
        stop_loss=stop_loss,
        take_profit=take_profit,
        magic=magic
    )
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

@trading_routes.route('/trade/modify_position', methods=['POST'])
def modify_position():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    position_id = payload.get('position_id')
    stop_loss = payload.get('stop_loss')
    take_profit = payload.get('take_profit')
    symbol = payload.get('symbol', 'EURUSD')

    if position_id is None:
        return jsonify({"status": "error", "message": "Missing position_id"}), 400

    handler = _get_handler(payload)
    result = handler.modify_position(position_id, stop_loss=stop_loss, take_profit=take_profit, symbol=symbol)
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
    try:
        p = payload.copy() if isinstance(payload, dict) else {}
        for k in ('symbol', 'interval', 'timeframe', 'limit', 'date_from', 'date_to'):
            p.pop(k, None)
        candles_data = handler.fetch_candles(symbol, timeframe, limit, date_from, date_to, **p)
    except (ValueError, RuntimeError) as e:
        return jsonify({"status": "error", "message": str(e)}), 400

    return jsonify({
        "status": "success",
        "candles": candles_data,
        "trades": []
    })

@trading_routes.route('/trade/history', methods=['POST'])
def history():
    payload = request.get_json(force=True) or {}
    handler = _get_handler(payload)
    return jsonify(handler.get_history())
