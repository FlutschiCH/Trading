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
    limit = int(payload.get('limit', 1000))

    # Sync regular fetch with backtest parameters if they are not explicitly specified
    if date_from is None and date_to is None:
        import os
        import json
        try:
            results_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backtest_results.json')
            if os.path.exists(results_path):
                with open(results_path, 'r') as f:
                    bt_data = json.load(f)
                settings = bt_data.get("settings", {})
                if settings.get("symbol") == symbol:
                    date_from = settings.get("date_from")
                    date_to = settings.get("date_to")
                    if "limit" in settings:
                        limit = int(settings["limit"])
        except Exception:
            pass

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
