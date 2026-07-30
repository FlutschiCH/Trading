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
