from flask import Blueprint, request, jsonify
from candle_collector_handler import CandleCollectorHandler

candle_collector_routes = Blueprint('candle_collector_routes', __name__)

@candle_collector_routes.route('/candle-collector/symbols', methods=['GET'])
def get_symbols():
    stats = CandleCollectorHandler.get_stats()
    return jsonify(stats), 200

@candle_collector_routes.route('/candle-collector/symbols', methods=['POST'])
def add_symbol():
    data = request.get_json() or {}
    symbol = data.get('symbol', '')
    res = CandleCollectorHandler.add_symbol(symbol)
    status_code = 200 if res.get('status') == 'success' else 400
    return jsonify(res), status_code

@candle_collector_routes.route('/candle-collector/symbols/<symbol>', methods=['DELETE'])
def remove_symbol(symbol):
    res = CandleCollectorHandler.remove_symbol(symbol)
    status_code = 200 if res.get('status') == 'success' else 400
    return jsonify(res), status_code

@candle_collector_routes.route('/candle-collector/symbols/<symbol>/toggle', methods=['POST'])
def toggle_symbol(symbol):
    data = request.get_json() or {}
    active = data.get('active', True)
    res = CandleCollectorHandler.toggle_symbol(symbol, active)
    status_code = 200 if res.get('status') == 'success' else 400
    return jsonify(res), status_code

@candle_collector_routes.route('/candle-collector/sync', methods=['POST'])
def manual_sync():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    if symbol:
        res = CandleCollectorHandler.sync_candles_for_symbol(symbol, limit=50)
    else:
        CandleCollectorHandler.sync_all_active(limit=50)
        res = {"status": "success", "message": "Manual sync triggered for all active symbols."}
    return jsonify(res), 200
