from flask import Blueprint, request, jsonify
from broker_handler import BrokerHandler

metatrader_routes = Blueprint('metatrader', __name__)

@metatrader_routes.route('/metatrader/candles', methods=['POST'])
def get_metatrader_candles():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'EURUSD')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    limit = max(int(payload.get('limit', 1000)), 50000)
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')
    acc_id = payload.get('account_id') or payload.get('login')

    candles = BrokerHandler.fetch_candles(
        broker_name='metatrader',
        account_id=acc_id,
        symbol=symbol,
        timeframe=timeframe,
        limit=limit,
        date_from=date_from,
        date_to=date_to
    )
    if not candles:
        return jsonify({"status": "error", "message": "Failed to fetch candles from MT5."}), 400
    return jsonify({"status": "success", "data": candles})

@metatrader_routes.route('/metatrader/account', methods=['POST'])
def get_metatrader_account():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or payload.get('login')

    data = BrokerHandler.get_account_info(broker_name='metatrader', account_id=acc_id)
    if not data:
        return jsonify({"status": "error", "message": "Failed to load MT5 account info."}), 400
    return jsonify({"status": "success", "data": data})

@metatrader_routes.route('/metatrader/positions', methods=['POST'])
def get_metatrader_positions():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or payload.get('login')

    data = BrokerHandler.get_positions(broker_name='metatrader', account_id=acc_id)
    return jsonify({"status": "success", "data": data})

@metatrader_routes.route('/metatrader/history', methods=['POST'])
def get_metatrader_history():
    payload = request.get_json(silent=True) or {}
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')
    acc_id = payload.get('account_id') or payload.get('login')

    data = BrokerHandler.get_history(broker_name='metatrader', date_from=date_from, date_to=date_to, account_id=acc_id)
    return jsonify({"status": "success", "data": data})

@metatrader_routes.route('/metatrader/order', methods=['POST'])
def create_metatrader_order():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'EURUSD')
    side = payload.get('order_type') or payload.get('side', 'buy')
    volume = float(payload.get('volume', 0.1))
    price = payload.get('price')
    if price is not None:
        price = float(price)

    acc_id = payload.get('account_id') or payload.get('login')

    res = BrokerHandler.create_order(
        broker_name='metatrader',
        account_id=acc_id,
        symbol=symbol,
        side=side,
        volume=volume,
        price=price
    )
    if res.get('status') == 'error':
        return jsonify(res), 400
    return jsonify(res), 200

@metatrader_routes.route('/metatrader/close', methods=['POST'])
def close_metatrader_position():
    payload = request.get_json(silent=True) or {}
    position_id = int(payload.get('position_id', 0))
    symbol = payload.get('symbol')
    side = payload.get('side', 'BUY')
    volume = float(payload.get('volume', 0.0))
    acc_id = payload.get('account_id') or payload.get('login')

    res = BrokerHandler.close_position(
        broker_name='metatrader',
        account_id=acc_id,
        position_id=position_id,
        symbol=symbol,
        side=side,
        volume=volume
    )
    if res.get('status') == 'error':
        return jsonify(res), 400
    return jsonify(res), 200

@metatrader_routes.route('/metatrader/symbols', methods=['GET', 'POST'])
def get_metatrader_symbols():
    try:
        payload = request.get_json(silent=True) or {}
        acc_id = payload.get('account_id') or payload.get('login') or request.args.get('account_id') or request.args.get('login')
        data = BrokerHandler.get_symbols(broker_name='metatrader', account_id=acc_id)
        return jsonify({"status": "success", "data": data or []})
    except Exception as e:
        print(f"[MetaTrader Route Error] /metatrader/symbols: {e}", flush=True)
        return jsonify({"status": "success", "data": []})

@metatrader_routes.route('/metatrader/timeframes', methods=['GET', 'POST'])
def get_metatrader_timeframes():
    try:
        payload = request.get_json(silent=True) or {}
        acc_id = payload.get('account_id') or payload.get('login') or request.args.get('account_id') or request.args.get('login')
        data = BrokerHandler.get_timeframes(broker_name='metatrader', account_id=acc_id)
        return jsonify({"status": "success", "data": data or []})
    except Exception as e:
        print(f"[MetaTrader Route Error] /metatrader/timeframes: {e}", flush=True)
        return jsonify({"status": "success", "data": []})
