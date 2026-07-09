from flask import Blueprint, request, jsonify
from metatrader_handler import MetaTraderHandler

metatrader_blueprint = Blueprint('metatrader', __name__)
handler = MetaTraderHandler()

@metatrader_blueprint.route('/connect', methods=['POST'])
def connect():
    data = request.get_json() or {}
    login = data.get('login')
    password = data.get('password')
    server = data.get('server')
    
    result = handler.connect(login, password, server)
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@metatrader_blueprint.route('/account', methods=['POST'])
def get_account():
    # Keep request POST for payload safety
    result = handler.get_account_info()
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@metatrader_blueprint.route('/order', methods=['POST'])
def place_order():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    order_type = data.get('order_type')
    volume = data.get('volume')
    price = data.get('price')
    sl = data.get('sl')
    tp = data.get('tp')
    
    if not symbol or not order_type or not volume:
        return jsonify({"status": "error", "message": "Missing required fields (symbol, order_type, volume)"}), 400
        
    result = handler.place_order(symbol, order_type, volume, price, sl, tp)
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400

@metatrader_blueprint.route('/positions', methods=['POST'])
def get_positions():
    result = handler.get_positions()
    if result["status"] == "success":
        return jsonify(result), 200
    return jsonify(result), 400
