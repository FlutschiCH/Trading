# /backend/routes/system_routes.py
from flask import Blueprint, jsonify, request
from system_handler import SystemHandler

system_routes = Blueprint('system_routes', __name__)

@system_routes.route('/system/restart', methods=['POST'])
def restart_server():
    res = SystemHandler.restart_server()
    return jsonify(res)
