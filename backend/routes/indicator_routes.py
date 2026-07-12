from flask import Blueprint, request, jsonify
from indicator_handler import IndicatorHandler
import pandas as pd

indicator_routes = Blueprint('indicator_routes', __name__)

@indicator_routes.route('/indicators/fvg', methods=['POST'])
def get_fvg():
    payload = request.get_json(silent=True) or {}
    candles = payload.get('candles', [])
    if not candles:
        return jsonify({"status": "error", "message": "No candles provided"}), 400
    
    df = pd.DataFrame(candles)
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns:
            df[col] = df[col].astype(float)
            
    fvgs = IndicatorHandler.compute_fvgs(df)
    return jsonify({"status": "success", "data": fvgs})
