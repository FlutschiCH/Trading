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
    Supports multi-timeframe calculations per indicator.
    Payload structure:
    {
        "candles": [...],
        "indicators": [
            {"id": "sma_1", "name": "sma", "timeframe": "4h", "params": {"period": 50}},
            {"id": "rsi_1", "name": "rsi", "timeframe": "chart", "params": {"period": 14}}
        ],
        "symbol": "BTCUSD",
        "timeframe": "15m",
        "broker": "metatrader",
        "account_id": "12345"
    }
    """
    payload = request.get_json(silent=True) or {}
    candles = payload.get('candles', [])
    indicator_requests = payload.get('indicators', [])
    chart_symbol = payload.get('symbol')
    chart_timeframe = str(payload.get('timeframe') or '15m').lower().strip()
    broker = payload.get('broker')
    account_id = payload.get('account_id')

    if not candles:
        return jsonify({"status": "error", "message": "No candles provided"}), 400

    df = pd.DataFrame(candles)
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns:
            df[col] = df[col].astype(float)

    times = df['time'].astype(int).tolist() if 'time' in df.columns else []
    if times:
        df['time'] = times
        df = df.sort_values('time').reset_index(drop=True)

    results = {}
    tf_df_cache = {}

    def get_timeframe_df(target_tf: str):
        target_tf_clean = str(target_tf).strip().lower()
        if target_tf_clean in tf_df_cache:
            return tf_df_cache[target_tf_clean]

        # 1. Try broker fetch if available
        if chart_symbol and broker and account_id and target_tf_clean not in ('chart', chart_timeframe):
            try:
                from broker_handler import BrokerHandler
                date_from = int(times[0]) if times else None
                date_to = int(times[-1]) if times else None
                limit = max(1000, len(df))
                broker_candles = BrokerHandler.fetch_candles(
                    broker_name=broker,
                    account_id=account_id,
                    symbol=chart_symbol,
                    timeframe=target_tf_clean,
                    limit=limit,
                    date_from=date_from,
                    date_to=date_to
                )
                if broker_candles and len(broker_candles) >= 5:
                    b_df = pd.DataFrame(broker_candles)
                    for c in ['open', 'high', 'low', 'close', 'volume']:
                        if c in b_df.columns:
                            b_df[c] = b_df[c].astype(float)
                    if 'time' in b_df.columns:
                        b_df['time'] = b_df['time'].astype(int)
                        b_df = b_df.sort_values('time').reset_index(drop=True)
                        tf_df_cache[target_tf_clean] = b_df
                        return b_df
            except Exception as e:
                pass

        # 2. Resample base df if target timeframe is different
        if target_tf_clean not in ('chart', chart_timeframe):
            try:
                resampled = IndicatorHandler.resample_candles(df, target_tf_clean)
                if not resampled.empty and len(resampled) >= 2:
                    tf_df_cache[target_tf_clean] = resampled
                    return resampled
            except Exception:
                pass

        # Default fallback to base df
        return df

    for idx, req in enumerate(indicator_requests):
        name = req.get('name')
        if not name:
            continue
        req_id = str(req.get('id') or f"{name}_{idx}")
        params = dict(req.get('params', {}))
        ind_tf = str(req.get('timeframe') or params.pop('timeframe', 'chart')).strip().lower()

        try:
            is_different_tf = ind_tf not in ('chart', chart_timeframe)
            calc_df = get_timeframe_df(ind_tf) if is_different_tf else df

            res = IndicatorHandler.compute(calc_df, name, **params)

            # If calculated on a different timeframe, align back to base chart times
            if is_different_tf and times and not calc_df.empty and 'time' in calc_df.columns:
                calc_times = calc_df['time'].astype(int).tolist()
                res = IndicatorHandler.align_to_base(times, calc_times, res)

            if isinstance(res, pd.Series):
                cleaned = res.replace({np.nan: None}).tolist()
                points = []
                if times:
                    for t, v in zip(times, cleaned):
                        if v is not None and not np.isnan(float(v)):
                            points.append({"time": int(t), "value": float(v)})
                results[req_id] = {
                    "type": "series",
                    "values": cleaned,
                    "points": points
                }
            elif isinstance(res, pd.DataFrame):
                cleaned_df = res.replace({np.nan: None})
                cols = {}
                for col in cleaned_df.columns:
                    col_vals = cleaned_df[col].tolist()
                    pts = []
                    if times:
                        for t, v in zip(times, col_vals):
                            if v is not None and not np.isnan(float(v)):
                                pts.append({"time": int(t), "value": float(v)})
                    cols[col] = {
                        "values": col_vals,
                        "points": pts
                    }
                results[req_id] = {
                    "type": "dataframe",
                    "columns": cols
                }
            elif isinstance(res, list):
                results[req_id] = {
                    "type": "list",
                    "data": res
                }
            else:
                results[req_id] = {
                    "type": "value",
                    "data": res
                }
        except Exception as e:
            results[req_id] = {"error": str(e)}

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
