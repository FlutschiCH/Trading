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

@backtest_settings_routes.route('/backtest-settings/profiles', methods=['POST'])
def list_profiles():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol')
    timeframe = payload.get('timeframe')

    if not symbol or not timeframe:
        return jsonify({"status": "error", "message": "Missing symbol and timeframe."}), 400

    res = BacktestSettingsHandler.list_profiles(symbol, timeframe)
    return jsonify(res)

@backtest_settings_routes.route('/backtest-settings/profiles/save', methods=['POST'])
def save_profile():
    payload = request.get_json(silent=True) or {}
    name = payload.get('name')
    symbol = payload.get('symbol')
    timeframe = payload.get('timeframe')
    settings = payload.get('settings')

    if not name or not symbol or not timeframe or settings is None:
        return jsonify({"status": "error", "message": "Missing required fields."}), 400

    res = BacktestSettingsHandler.save_profile(name, symbol, timeframe, settings)
    return jsonify(res)

@backtest_settings_routes.route('/backtest-settings/profiles/load', methods=['POST'])
def load_profile():
    payload = request.get_json(silent=True) or {}
    profile_id = payload.get('id')

    if profile_id is None:
        return jsonify({"status": "error", "message": "Missing profile ID."}), 400

    res = BacktestSettingsHandler.load_profile(int(profile_id))
    return jsonify(res)

@backtest_settings_routes.route('/backtest-settings/profiles/delete', methods=['POST'])
def delete_profile():
    payload = request.get_json(silent=True) or {}
    profile_id = payload.get('id')

    if profile_id is None:
        return jsonify({"status": "error", "message": "Missing profile ID."}), 400

    res = BacktestSettingsHandler.delete_profile(int(profile_id))
    return jsonify(res)
