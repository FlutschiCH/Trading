# /backend/routes/system_routes.py
from flask import Blueprint, jsonify, request
from system_handler import SystemHandler

system_routes = Blueprint('system_routes', __name__)

@system_routes.route('/system/restart', methods=['POST'])
def restart_server():
    res = SystemHandler.restart_server()
    return jsonify(res)

@system_routes.route('/system/status', methods=['GET'])
def get_status():
    res = SystemHandler.get_status()
    return jsonify(res)

@system_routes.route('/system/quickedit', methods=['GET', 'POST'])
def quick_edit():
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        enabled = bool(payload.get('enabled', False))
        return jsonify(SystemHandler.set_quick_edit(enabled))
    else:
        return jsonify(SystemHandler.get_quick_edit())

@system_routes.route('/system/log-settings', methods=['GET'])
def get_log_settings():
    from sql_handler import SQLHandler
    settings = SQLHandler.get_log_settings()
    return jsonify({"status": "success", "settings": settings})

@system_routes.route('/system/log-settings', methods=['POST'])
def save_log_setting():
    payload = request.get_json(silent=True) or {}
    category = payload.get("category")
    enabled = payload.get("enabled", True)
    if not category:
        return jsonify({"status": "error", "message": "Category required"}), 400
    
    from logger_handler import LoggerHandler
    LoggerHandler.set_category_enabled(category, bool(enabled))
    return jsonify({"status": "success", "category": category, "enabled": enabled})

@system_routes.route('/system/logs', methods=['GET'])
def get_logs():
    import os, json
    log_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs.json")
    logs = []
    if os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                raw_logs = json.load(f)
                for entry in raw_logs:
                    if isinstance(entry, dict):
                        timestamp = entry.get("timestamp", "")
                        level = entry.get("level", "INFO")
                        cat = entry.get("category", "System")
                        msg = entry.get("message", "")
                        logs.append(f"[{timestamp}] [{level}] [{cat}] {msg}")
                    elif isinstance(entry, str):
                        logs.append(entry)
        except Exception as e:
            logs = [f"[ERROR] Failed to read logs.json: {e}"]
    return jsonify({"status": "success", "logs": logs})

