import time
from flask import Blueprint, request, jsonify
from live_strategy_handler import LiveStrategyHandler

live_strategy_routes = Blueprint('live_strategy_routes', __name__)

@live_strategy_routes.route('/live/strategies', methods=['GET'])
def get_strategies():
    """
    Retrieve all deployed live strategies.
    """
    strategies = LiveStrategyHandler.get_all_strategies()
    return jsonify({"status": "success", "strategies": strategies})

@live_strategy_routes.route('/live/strategy', methods=['POST'])
def save_strategy():
    """
    Deploy or update an active live strategy.
    """
    payload = request.get_json(silent=True) or {}
    strategy_config = {
        "id": payload.get("id"),
        "name": payload.get("name", ""),
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
        "entryStabilityRule": payload.get("entryStabilityRule", "default"),
        "broker": payload.get("broker", "metatrader"),
        "target_computer": payload.get("target_computer", "All"),
        "targets": payload.get("targets", []),
        "dateRangeOption": payload.get("dateRangeOption") or "last_candles",
        "customFrom": payload.get("customFrom") or "",
        "customTo": payload.get("customTo") or "",
        "candleLimit": int(payload.get("candleLimit") or 1000)
    }
    
    success = LiveStrategyHandler.save_strategy(strategy_config)
    if success:
        return jsonify({
            "status": "success",
            "message": "Strategy saved successfully",
            "strategy": strategy_config
        })
    else:
        return jsonify({
            "status": "error",
            "message": "Failed to save strategy"
        }), 500

@live_strategy_routes.route('/live/strategy/<strategy_id>', methods=['DELETE'])
def delete_strategy(strategy_id):
    """
    Delete a live strategy.
    """
    success = LiveStrategyHandler.delete_strategy(strategy_id)
    if success:
        return jsonify({"status": "success", "message": f"Strategy {strategy_id} deleted successfully"})
    else:
        return jsonify({"status": "error", "message": "Failed to delete strategy"}), 500

# Keep the original route /live/strategy as a fallback/compatibility GET endpoint
@live_strategy_routes.route('/live/strategy', methods=['GET'])
def live_strategy_compat():
    strategy = LiveStrategyHandler.get_strategy()
    return jsonify({"status": "success", "strategy": strategy})

@live_strategy_routes.route('/live/strategy/cache/<strategy_id>', methods=['GET'])
def get_strategy_cache(strategy_id):
    """
    Retrieve cached annotated candles for a specific live strategy.
    """
    from live_runner_handler import LiveRunner
    import json
    cache = LiveRunner._candles_cache.get(strategy_id, [])
    
    # Fall back to database stored candles if the in-memory cache is empty (e.g. on dev machine)
    if not cache:
        try:
            strategy = LiveStrategyHandler.get_strategy(strategy_id)
            if strategy:
                print(f"[Cache Endpoint] Cache miss for strategy {strategy_id}. Forcing synchronous warm-up evaluation...", flush=True)
                LiveRunner._evaluate_strategy(strategy)
                cache = LiveRunner._candles_cache.get(strategy_id, [])
        except Exception as e:
            print(f"Error forcing synchronous warm-up: {e}", flush=True)
            
        # Fall back to database stored candles if evaluation still failed to populate cache
        if not cache:
            try:
                strategy = LiveStrategyHandler.get_strategy(strategy_id)
                if strategy and strategy.get("live_state"):
                    live_state = strategy["live_state"]
                    if isinstance(live_state, str):
                        try:
                            live_state = json.loads(live_state)
                        except Exception:
                            pass
                    if isinstance(live_state, dict) and "candles" in live_state:
                        cache = live_state["candles"]
            except Exception as e:
                print(f"Error loading candles from db fallback for strategy {strategy_id}: {e}", flush=True)

    limit = request.args.get('limit', type=int)
    if limit and cache:
        cache = cache[-limit:]

    return jsonify({"status": "success", "strategy_id": strategy_id, "candles": cache})
