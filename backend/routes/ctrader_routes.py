from flask import Blueprint, request, jsonify
from ctrader_handler import CTraderHandler

ctrader_blueprint = Blueprint('ctrader', __name__)
handler = CTraderHandler()

@ctrader_blueprint.route('/connect', methods=['POST'])
def connect():
    data = request.get_json() or {}
    token = data.get('access_token')
    account = data.get('account_id')
    
    result = handler.connect(token, account)
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@ctrader_blueprint.route('/account', methods=['POST'])
def get_account():
    result = handler.get_account_info()
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@ctrader_blueprint.route('/order', methods=['POST'])
def place_order():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    order_type = data.get('order_type')
    volume = data.get('volume')
    price = data.get('price')
    
    if not symbol or not order_type or not volume:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
    result = handler.place_order(symbol, order_type, volume, price)
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@ctrader_blueprint.route('/positions', methods=['POST'])
def get_positions():
    result = handler.get_positions()
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400
