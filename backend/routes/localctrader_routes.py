from flask import Blueprint, request, jsonify
from localctrader_handler import LocalTraderHandler

localctrader_blueprint = Blueprint('localctrader', __name__)
handler = LocalTraderHandler()

@localctrader_blueprint.route('/connect', methods=['POST'])
def connect():
    data = request.get_json() or {}
    password = data.get('password')
    
    result = handler.connect(password)
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@localctrader_blueprint.route('/account', methods=['POST'])
def get_account():
    result = handler.get_account_info()
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@localctrader_blueprint.route('/order', methods=['POST'])
def place_order():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    order_type = data.get('order_type')
    volume = data.get('volume')
    price = data.get('price')
    
    if not symbol or not order_type or not volume:
        return jsonify({"status": "error", "message": "Missing fields"}), 400
        
    result = handler.place_order(symbol, order_type, volume, price)
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@localctrader_blueprint.route('/positions', methods=['POST'])
def get_positions():
    result = handler.get_positions()
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400
