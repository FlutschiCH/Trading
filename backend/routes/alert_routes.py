from flask import Blueprint, request, jsonify
from alert_handler import AlertHandler

alert_bp = Blueprint('alert', __name__)

@alert_bp.route('', methods=['GET'])
def get_alerts():
    symbol = request.args.get('symbol')
    status = request.args.get('status')
    alerts = AlertHandler.get_alerts(symbol=symbol, status=status)
    return jsonify(alerts), 200

@alert_bp.route('', methods=['POST'])
def create_alert():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    target_price = data.get('target_price')
    alert_condition = data.get('alert_condition', 'CROSSES')
    note = data.get('note', '')

    if not symbol or target_price is None:
        return jsonify({'error': 'symbol and target_price are required'}), 400

    try:
        target_price = float(target_price)
    except ValueError:
        return jsonify({'error': 'target_price must be a number'}), 400

    new_alert = AlertHandler.create_alert(
        symbol=symbol,
        target_price=target_price,
        alert_condition=alert_condition,
        note=note
    )
    return jsonify(new_alert), 201

@alert_bp.route('/<int:alert_id>', methods=['PUT'])
def update_alert(alert_id):
    data = request.get_json() or {}
    target_price = data.get('target_price')
    alert_condition = data.get('alert_condition')
    status = data.get('status')
    note = data.get('note')

    if target_price is not None:
        try:
            target_price = float(target_price)
        except ValueError:
            return jsonify({'error': 'target_price must be a number'}), 400

    success = AlertHandler.update_alert(
        alert_id=alert_id,
        target_price=target_price,
        alert_condition=alert_condition,
        status=status,
        note=note
    )
    if success:
        return jsonify({'message': 'Alert updated successfully'}), 200
    return jsonify({'error': 'Alert not updated or no fields provided'}), 400

@alert_bp.route('/<int:alert_id>', methods=['DELETE'])
def delete_alert(alert_id):
    success = AlertHandler.delete_alert(alert_id)
    if success:
        return jsonify({'message': 'Alert deleted successfully'}), 200
    return jsonify({'error': 'Alert delete failed'}), 400
