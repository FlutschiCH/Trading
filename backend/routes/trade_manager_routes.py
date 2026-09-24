from flask import Blueprint, request, jsonify
from trade_manager_handler import TradeManager

trade_manager_routes = Blueprint('trade_manager_routes', __name__)

@trade_manager_routes.route('/trade_manager/positions', methods=['POST'])
def get_positions():
    payload = request.get_json(silent=True) or {}
    broker = payload.get('broker')
    account_id = payload.get('account_id')
    symbol = payload.get('symbol')
    
    try:
        data = TradeManager.get_positions(broker_name=broker, account_id=account_id, symbol=symbol)
        if isinstance(data, dict) and "status" in data:
            return jsonify(data)
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@trade_manager_routes.route('/trade_manager/history', methods=['POST'])
def get_history():
    payload = request.get_json(silent=True) or {}
    broker = payload.get('broker')
    account_id = payload.get('account_id')
    symbol = payload.get('symbol')
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')
    
    try:
        data = TradeManager.get_history(
            broker_name=broker,
            account_id=account_id,
            symbol=symbol,
            date_from=date_from,
            date_to=date_to
        )
        if isinstance(data, dict) and "status" in data:
            return jsonify(data)
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@trade_manager_routes.route('/trade_manager/overview', methods=['POST'])
def get_overview():
    payload = request.get_json(silent=True) or {}
    broker = payload.get('broker')
    account_id = payload.get('account_id')
    symbol = payload.get('symbol')
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')
    
    try:
        data = TradeManager.get_trade_overview(
            broker_name=broker,
            account_id=account_id,
            symbol=symbol,
            date_from=date_from,
            date_to=date_to
        )
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@trade_manager_routes.route('/trade_manager/order', methods=['POST'])
def execute_order():
    payload = request.get_json(silent=True) or {}
    try:
        res = TradeManager.execute_order(
            broker_name=payload.get('broker'),
            account_id=payload.get('account_id'),
            symbol=payload.get('symbol', ''),
            order_type=payload.get('order_type') or payload.get('side', 'buy'),
            volume=float(payload.get('volume', 0.01)),
            stop_loss=payload.get('stop_loss'),
            take_profit=payload.get('take_profit')
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@trade_manager_routes.route('/trade_manager/close', methods=['POST'])
def close_position():
    payload = request.get_json(silent=True) or {}
    try:
        res = TradeManager.close_position(
            broker_name=payload.get('broker'),
            account_id=payload.get('account_id'),
            position_id=payload.get('position_id'),
            symbol=payload.get('symbol'),
            volume=payload.get('volume')
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@trade_manager_routes.route('/trade_manager/modify', methods=['POST'])
def modify_position():
    payload = request.get_json(silent=True) or {}
    try:
        res = TradeManager.modify_position(
            broker_name=payload.get('broker'),
            account_id=payload.get('account_id'),
            position_id=payload.get('position_id'),
            stop_loss=payload.get('stop_loss'),
            take_profit=payload.get('take_profit')
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
