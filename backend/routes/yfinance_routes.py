from flask import Blueprint, request, jsonify
from yfinance_handler import YFinanceHandler

yfinance_routes = Blueprint('yfinance', __name__)

@yfinance_routes.route('/yfinance/candles', methods=['POST'])
def get_yfinance_candles():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'EURUSD')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')
    limit = max(int(payload.get('limit', 1000)), 10000)

    candles = YFinanceHandler.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
        limit=limit,
        date_from=date_from,
        date_to=date_to
    )
    if not candles:
        return jsonify({"status": "error", "message": "Failed to fetch candles from Yahoo Finance."}), 400
    return jsonify({"status": "success", "data": candles})

@yfinance_routes.route('/yfinance/symbols', methods=['GET'])
def get_yfinance_symbols():
    data = YFinanceHandler.get_symbols()
    return jsonify({"status": "success", "data": data})

@yfinance_routes.route('/yfinance/timeframes', methods=['GET'])
def get_yfinance_timeframes():
    data = YFinanceHandler.get_timeframes()
    return jsonify({"status": "success", "data": data})
