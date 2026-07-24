from flask import Blueprint, request, jsonify
from yfinance_handler import YFinanceHandler

yfinance_routes = Blueprint('yfinance', __name__)

@yfinance_routes.route('/yfinance/candles', methods=['POST'])
def get_yfinance_candles():
    import os
    import json
    results_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backtest_results.json')
    if os.path.exists(results_path):
        try:
            with open(results_path, 'r') as f:
                bt_data = json.load(f)
            candles = bt_data.get("candles", [])
            if candles:
                return jsonify({"status": "success", "data": candles})
        except Exception as e:
            print(f"Error reading backtest_results.json in yfinance candles fallback: {e}", flush=True)
            
    return jsonify({"status": "success", "data": []})

@yfinance_routes.route('/yfinance/symbols', methods=['GET'])
def get_yfinance_symbols():
    data = YFinanceHandler.get_symbols()
    return jsonify({"status": "success", "data": data})

@yfinance_routes.route('/yfinance/timeframes', methods=['GET'])
def get_yfinance_timeframes():
    data = YFinanceHandler.get_timeframes()
    return jsonify({"status": "success", "data": data})
