from flask import Blueprint, request, jsonify
from metatrader_handler import MetaTraderHandler

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

    candles = MetaTraderHandler.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        account_id=acc_id
    )
    if not candles:
        return jsonify({"status": "error", "message": "Failed to fetch candles from MT5."}), 400
    return jsonify({"status": "success", "data": candles})

@metatrader_routes.route('/metatrader/account', methods=['POST'])
def get_metatrader_account():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or payload.get('login')

    data = MetaTraderHandler.get_account_info(account_id=acc_id)
    if not data:
        return jsonify({"status": "error", "message": "Failed to load MT5 account info."}), 400
    return jsonify({"status": "success", "data": data})

@metatrader_routes.route('/metatrader/positions', methods=['POST'])
def get_metatrader_positions():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or payload.get('login')

    data = MetaTraderHandler.get_positions(account_id=acc_id)
    return jsonify({"status": "success", "data": data})

@metatrader_routes.route('/metatrader/history', methods=['POST'])
def get_metatrader_history():
    payload = request.get_json(silent=True) or {}
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')
    acc_id = payload.get('account_id') or payload.get('login')

    data = MetaTraderHandler.get_history(date_from=date_from, date_to=date_to, account_id=acc_id)
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

    res = MetaTraderHandler.create_order(
        symbol=symbol,
        side=side,
        volume=volume,
        price=price,
        account_id=acc_id
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

    res = MetaTraderHandler.close_position(
        position_id=position_id,
        symbol=symbol,
        side=side,
        volume=volume,
        account_id=acc_id
    )
    if res.get('status') == 'error':
        return jsonify(res), 400
    return jsonify(res), 200

@metatrader_routes.route('/metatrader/symbols', methods=['GET'])
def get_metatrader_symbols():
    acc_id = request.args.get('account_id') or request.args.get('login')
    data = MetaTraderHandler.get_symbols(account_id=acc_id)
    return jsonify({"status": "success", "data": data})

@metatrader_routes.route('/metatrader/timeframes', methods=['GET'])
def get_metatrader_timeframes():
    data = MetaTraderHandler.get_timeframes()
    return jsonify({"status": "success", "data": data})
