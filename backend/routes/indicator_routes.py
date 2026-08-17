from flask import Blueprint, request, jsonify
from indicator_handler import IndicatorHandler
from indicator_helper import IndicatorHelper
import pandas as pd
import numpy as np

indicator_routes = Blueprint('indicator_routes', __name__)

@indicator_routes.route('/indicators/list', methods=['GET'])
def list_indicators():
    """Returns dynamically discovered indicators and their parameter signatures."""
    indicators = IndicatorHelper.get_all_indicators()
    return jsonify({"status": "success", "data": indicators})

@indicator_routes.route('/indicators/catalog', methods=['GET'])
def get_indicator_catalog():
    """Returns available indicators, parameter definitions, and metadata."""
    catalog = IndicatorHandler.get_catalog()
    return jsonify({"status": "success", "data": catalog})

@indicator_routes.route('/indicators/calculate', methods=['POST'])
def calculate_indicators():
    """
    Computes specified indicators on provided OHLCV candle data.
    Payload structure:
    {
        "candles": [...],
        "indicators": [
            {"name": "atr", "params": {"period": 14, "smoothing": "rma"}},
            {"name": "rsi", "params": {"period": 14}}
        ]
    }
    """
    payload = request.get_json(silent=True) or {}
    candles = payload.get('candles', [])
    indicator_requests = payload.get('indicators', [])

    if not candles:
        return jsonify({"status": "error", "message": "No candles provided"}), 400

    df = pd.DataFrame(candles)
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns:
            df[col] = df[col].astype(float)

    results = {}

    for req in indicator_requests:
        name = req.get('name')
        params = req.get('params', {})
        if not name:
            continue

        try:
            res = IndicatorHandler.compute(df, name, **params)
            if isinstance(res, pd.Series):
                # Clean NaNs for JSON response
                cleaned = res.replace({np.nan: None}).tolist()
                results[name] = cleaned
            elif isinstance(res, pd.DataFrame):
                cleaned_df = res.replace({np.nan: None})
                results[name] = cleaned_df.to_dict(orient='list')
            elif isinstance(res, list):
                results[name] = res
            else:
                results[name] = res
        except Exception as e:
            results[name] = {"error": str(e)}

    return jsonify({"status": "success", "data": results})

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
