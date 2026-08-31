from flask import Blueprint, request, jsonify
from wyckoff_handler import WyckoffHandler

wyckoff_routes = Blueprint('wyckoff_routes', __name__)

@wyckoff_routes.route('/wyckoff/detect', methods=['POST'])
def detect_wyckoff():
    payload = request.get_json(silent=True) or {}
    candles = payload.get('candles', [])
    lookback = int(payload.get('lookback', 20))
    result = WyckoffHandler.analyze_wyckoff_structure(candles, lookback=lookback)
    return jsonify({"status": "success", "data": result})
