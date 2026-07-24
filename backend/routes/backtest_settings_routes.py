from flask import Blueprint, request, jsonify
from backtest_settings_handler import BacktestSettingsHandler

backtest_settings_routes = Blueprint('backtest_settings_routes', __name__)

@backtest_settings_routes.route('/backtest-settings/save', methods=['POST'])
def save_settings():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol')
    timeframe = payload.get('timeframe')
    settings = payload.get('settings')

    if not symbol or not timeframe or settings is None:
        return jsonify({"status": "error", "message": "Missing required fields (symbol, timeframe, settings)."}), 400

    res = BacktestSettingsHandler.save_settings(symbol, timeframe, settings)
    return jsonify(res)

@backtest_settings_routes.route('/backtest-settings/load', methods=['POST'])
def load_settings():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol')
    timeframe = payload.get('timeframe')

    if not symbol or not timeframe:
        return jsonify({"status": "error", "message": "Missing required fields (symbol, timeframe)."}), 400

    res = BacktestSettingsHandler.load_settings(symbol, timeframe)
    return jsonify(res)
