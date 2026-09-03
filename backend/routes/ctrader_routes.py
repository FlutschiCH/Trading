from flask import Blueprint, request, jsonify
from broker_handler import BrokerHandler

ctrader_routes = Blueprint('ctrader_routes', __name__)

@ctrader_routes.route('/ctrader/symbols', methods=['GET', 'POST'])
def get_symbols():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or request.args.get('account_id')
    return jsonify(BrokerHandler.get_symbols(broker_name='ctrader', account_id=acc_id))

@ctrader_routes.route('/ctrader/timeframes', methods=['GET', 'POST'])
def get_timeframes():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or request.args.get('account_id')
    return jsonify(BrokerHandler.get_timeframes(broker_name='ctrader', account_id=acc_id))

@ctrader_routes.route('/ctrader/account', methods=['GET', 'POST'])
@ctrader_routes.route('/localctrader/account', methods=['GET', 'POST'])
def account():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or request.args.get('account_id')
    return jsonify(BrokerHandler.get_account(broker_name='ctrader', account_id=acc_id))

@ctrader_routes.route('/ctrader/positions', methods=['GET', 'POST'])
@ctrader_routes.route('/localctrader/positions', methods=['GET', 'POST'])
def positions():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or request.args.get('account_id')
    return jsonify(BrokerHandler.get_positions(broker_name='ctrader', account_id=acc_id))

@ctrader_routes.route('/ctrader/history', methods=['GET', 'POST'])
@ctrader_routes.route('/localctrader/history', methods=['GET', 'POST'])
def history():
    payload = request.get_json(silent=True) or {}
    acc_id = payload.get('account_id') or request.args.get('account_id')
    return jsonify(BrokerHandler.get_history(broker_name='ctrader', account_id=acc_id))

@ctrader_routes.route('/ctrader/order', methods=['POST'])
@ctrader_routes.route('/localctrader/order', methods=['POST'])
def order():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON format"}), 400

    symbol = payload.get('symbol', 'BTCUSDT')
    side = payload.get('order_type', 'buy')
    volume = float(payload.get('volume', 0.1))
    price = payload.get('price')
    acc_id = payload.get('account_id')
    if price is not None:
        price = float(price)

    result = BrokerHandler.create_order(broker_name='ctrader', account_id=acc_id, symbol=symbol, side=side, volume=volume, price=price)
    return jsonify(result)

