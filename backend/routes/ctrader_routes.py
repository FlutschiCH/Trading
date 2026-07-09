from flask import Blueprint, request, jsonify
from ctrader_handler import CTraderHandler

ctrader_routes = Blueprint('ctrader_routes', __name__)

@ctrader_routes.route('/ctrader/account', methods=['GET', 'POST'])
@ctrader_routes.route('/localctrader/account', methods=['GET', 'POST'])
def account():
    return jsonify(CTraderHandler.get_account())

@ctrader_routes.route('/ctrader/positions', methods=['GET', 'POST'])
@ctrader_routes.route('/localctrader/positions', methods=['GET', 'POST'])
def positions():
    return jsonify(CTraderHandler.get_positions())

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
    if price is not None:
        price = float(price)

    result = CTraderHandler.create_order(symbol, side, volume, price)
    return jsonify(result)
