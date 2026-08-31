from flask import Blueprint, request, jsonify
from broker_handler import BrokerHandler

broker_routes = Blueprint('broker', __name__)

@broker_routes.route('/broker/candles', methods=['POST'])
def get_broker_candles():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'EURUSD')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    limit = int(payload.get('limit', 1000))
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')
    broker = payload.get('broker')

    handler = BrokerHandler.get_handler(broker)
    candles = handler.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        **payload
    )
    if not candles:
        return jsonify({"status": "error", "message": f"Failed to fetch candles from broker {broker}."}), 400
    return jsonify({"status": "success", "data": candles})
