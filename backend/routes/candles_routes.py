from flask import Blueprint, request, jsonify
from candles_handler import CandlesHandler

candles_blueprint = Blueprint('candles', __name__)
handler = CandlesHandler()

@candles_blueprint.route('/historical', methods=['POST'])
def get_candles():
    data = request.get_json() or {}
    symbol = data.get('symbol', 'BTCUSDT')
    interval = data.get('interval', '15m')
    limit = data.get('limit', 100)
    
    try:
        candles = handler.get_historical_candles(symbol, interval, limit)
        return jsonify({
            "status": "success",
            "symbol": symbol,
            "interval": interval,
            "data": candles
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
