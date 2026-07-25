from flask import Blueprint, request, jsonify
from account_handler import AccountHandler

account_routes = Blueprint('account_routes', __name__)

@account_routes.route('/accounts', methods=['GET'])
def get_accounts():
    accounts = AccountHandler.get_accounts()
    return jsonify({"status": "success", "data": accounts})

@account_routes.route('/accounts', methods=['POST'])
def add_account():
    payload = request.get_json(silent=True) or {}
    name = payload.get('name')
    broker_type = payload.get('broker_type')
    account_id = payload.get('account_id')
    password = payload.get('password')
    server = payload.get('server')

    if not name or not broker_type or not account_id:
        return jsonify({"status": "error", "message": "Missing required fields (name, broker_type, account_id)"}), 400

    if broker_type not in ('ctrader', 'metatrader'):
        return jsonify({"status": "error", "message": "Invalid broker type"}), 400

    try:
        AccountHandler.add_account(
            name=name,
            broker_type=broker_type,
            account_id=account_id,
            password=password,
            server=server
        )
        return jsonify({"status": "success", "message": "Account saved successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@account_routes.route('/accounts/delete', methods=['POST'])
def delete_account():
    payload = request.get_json(silent=True) or {}
    account_id = payload.get('account_id')
    if not account_id:
        return jsonify({"status": "error", "message": "Missing account_id"}), 400

    try:
        AccountHandler.delete_account(account_id)
        return jsonify({"status": "success", "message": "Account deleted successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@account_routes.route('/accounts/active', methods=['POST'])
def set_active_account():
    payload = request.get_json(silent=True) or {}
    account_id = payload.get('account_id')
    if not account_id:
        return jsonify({"status": "error", "message": "Missing account_id"}), 400

    try:
        AccountHandler.set_active_account(account_id)
        return jsonify({"status": "success", "message": "Active account updated successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@account_routes.route('/accounts/active', methods=['GET'])
def get_active_account():
    try:
        active = AccountHandler.get_active_account()
        return jsonify({"status": "success", "data": active})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
