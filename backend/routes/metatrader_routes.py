from flask import Blueprint, request, jsonify
from metatrader_handler import MetaTraderHandler
from live_strategy_handler import LiveStrategyHandler

metavar_login = 2002061314
metavar_pass = "Godzilla_12"
metavar_server = "JustMarkets-Demo"

metatrader_routes = Blueprint('metatrader', __name__)

@metatrader_routes.route('/metatrader/candles', methods=['POST'])
def get_metatrader_candles():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'EURUSD')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    limit = max(int(payload.get('limit', 1000)), 50000)
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')
    login = payload.get('login', metavar_login)
    password = payload.get('password', metavar_pass)
    server = payload.get('server', metavar_server)

    candles = MetaTraderHandler.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        login=login,
        password=password,
        server=server
    )
    if not candles:
        return jsonify({"status": "error", "message": "Failed to fetch candles from MT5."}), 400
    return jsonify({"status": "success", "data": candles})

@metatrader_routes.route('/metatrader/account', methods=['POST'])
def get_metatrader_account():
    payload = request.get_json(silent=True) or {}
    login = payload.get('login', metavar_login)
    password = payload.get('password', metavar_pass)
    server = payload.get('server', metavar_server)

    data = MetaTraderHandler.get_account_info(login=login, password=password, server=server)
    if not data:
        return jsonify({"status": "error", "message": "Failed to load MT5 account info."}), 400
    return jsonify({"status": "success", "data": data})

@metatrader_routes.route('/metatrader/positions', methods=['POST'])
def get_metatrader_positions():
    payload = request.get_json(silent=True) or {}
    login = payload.get('login', metavar_login)
    password = payload.get('password', metavar_pass)
    server = payload.get('server', metavar_server)

    data = MetaTraderHandler.get_positions(login=login, password=password, server=server)
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

    login = payload.get('login', metavar_login)
    password = payload.get('password', metavar_pass)
    server = payload.get('server', metavar_server)

    res = MetaTraderHandler.create_order(
        symbol=symbol,
        side=side,
        volume=volume,
        price=price,
        login=login,
        password=password,
        server=server
    )
    if res.get('status') == 'error':
        return jsonify(res), 400
    return jsonify(res), 200

@metatrader_routes.route('/metatrader/symbols', methods=['GET'])
def get_metatrader_symbols():
    data = MetaTraderHandler.get_symbols(login=metavar_login, password=metavar_pass, server=metavar_server)
    return jsonify({"status": "success", "data": data})

@metatrader_routes.route('/metatrader/timeframes', methods=['GET'])
def get_metatrader_timeframes():
    data = MetaTraderHandler.get_timeframes()
    return jsonify({"status": "success", "data": data})
