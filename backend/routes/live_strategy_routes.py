import time
from flask import Blueprint, request, jsonify
from live_strategy_handler import LiveStrategyHandler

live_strategy_routes = Blueprint('live_strategy_routes', __name__)

@live_strategy_routes.route('/live/strategy', methods=['GET', 'POST'])
def live_strategy():
    """
    GET: Retrieve active live strategy parameters.
    POST: Deploy/update the active live strategy parameters.
    """
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        strategy_config = {
            "status": payload.get("status", "active"),  # 'active' or 'paused'
            "symbol": payload.get("symbol", "BTCUSD"),
            "timeframe": payload.get("timeframe", "15m"),
            "slVal": float(payload.get("slVal", 1.0)),
            "slType": payload.get("slType", "pct"),
            "rr": float(payload.get("rr", 2.0)),
            "size": float(payload.get("size", 1.0)),
            "useRiskSizing": bool(payload.get("useRiskSizing", False)),
            "riskPct": float(payload.get("riskPct", 1.0)),
            "useBreakEven": bool(payload.get("useBreakEven", False)),
            "beTriggerR": float(payload.get("beTriggerR", 1.0)),
            "lookbackWindow": int(payload.get("lookbackWindow", 20)),
            "deployedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "timezone": payload.get("timezone", "Local"),
            "sessions": payload.get("sessions", []),
            "useGlobalClose": bool(payload.get("useGlobalClose", False)),
            "globalCloseTime": payload.get("globalCloseTime", ""),
            "entryStabilityRule": payload.get("entryStabilityRule", "default")
        }
        
        success = LiveStrategyHandler.save_strategy(strategy_config)
        if success:
            return jsonify({
                "status": "success",
                "message": "Strategy deployed to SQL database successfully",
                "strategy": strategy_config
            })
        else:
            return jsonify({
                "status": "error",
                "message": "Failed to deploy strategy to database"
            }), 500
    else:
        strategy = LiveStrategyHandler.get_strategy()
        return jsonify({"status": "success", "strategy": strategy})
