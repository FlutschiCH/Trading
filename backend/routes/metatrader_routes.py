from flask import Blueprint, request, jsonify
from metatrader_handler import MetaTraderHandler
from live_strategy_handler import LiveStrategyHandler

metavar_login = 2002061314
metavar_pass = "Godzilla_12"
metavar_server = "JustMarkets-Demo"

metatrader_routes = Blueprint('metatrader', __name__)

@metatrader_routes.route('/metatrader/candles', methods=['POST'])
def get_metatrader_candles():
    import os
    import json
    results_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backtest_results.json')
    if os.path.exists(results_path):
        try:
            with open(results_path, 'r') as f:
                bt_data = json.load(f)
            candles = bt_data.get("candles", [])
            if candles:
                return jsonify({"status": "success", "data": candles})
        except Exception as e:
            print(f"Error reading backtest_results.json in metatrader candles fallback: {e}", flush=True)
            
    return jsonify({"status": "success", "data": []})

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
