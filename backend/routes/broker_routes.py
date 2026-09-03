from flask import Blueprint, request, jsonify
from broker_handler import BrokerHandler
import time
from datetime import datetime

broker_routes = Blueprint('broker_routes', __name__)

@broker_routes.route('/broker/account', methods=['POST'])
def account():
    payload = request.get_json(force=True) or {}
    broker_name = payload.pop('broker', None)
    account_id = payload.pop('account_id', None)

    data = BrokerHandler.get_account_info(broker_name=broker_name, account_id=account_id, **payload)
    if isinstance(data, dict) and 'error' in data:
        return jsonify({"status": "error", "message": data['error']}), 400
    return jsonify({"status": "success", "data": data})

@broker_routes.route('/broker/positions', methods=['POST'])
def positions():
    payload = request.get_json(force=True) or {}
    broker_name = payload.pop('broker', None)
    account_id = payload.pop('account_id', None)
    data = BrokerHandler.get_positions(broker_name=broker_name, account_id=account_id, **payload)
    return jsonify({"status": "success", "data": data})

@broker_routes.route('/broker/candles', methods=['POST'])
def candles():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    broker_name = payload.get('broker', 'ctrader')
    symbol = payload.get('symbol', 'EURUSD')
    timeframe = payload.get('interval') or payload.get('timeframe', '15m')
    limit = int(payload.get('limit', 1000))
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')

    if date_from is not None:
        date_from = int(date_from)
    if date_to is not None:
        date_to = int(date_to)

    try:
        account_id = payload.get('account_id')
        p = payload.copy() if isinstance(payload, dict) else {}
        for k in ('symbol', 'interval', 'timeframe', 'limit', 'date_from', 'date_to', 'broker', 'account_id'):
            p.pop(k, None)
        candles_data = BrokerHandler.fetch_candles(
            broker_name=broker_name,
            account_id=account_id,
            symbol=symbol,
            timeframe=timeframe,
            limit=limit,
            date_from=date_from,
            date_to=date_to,
            **p
        )
    except (ValueError, RuntimeError) as e:
        return jsonify({"status": "error", "message": str(e)}), 400

    return jsonify({
        "status": "success",
        "candles": candles_data,
        "trades": []
    })
