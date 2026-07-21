from flask import Blueprint, request, jsonify
from notification_handler import NotificationHandler

notification_routes = Blueprint('notification_routes', __name__)

@notification_routes.route('/notification/trigger', methods=['POST'])
def trigger_notification():
    payload = request.get_json(silent=True) or {}
    message = payload.get('message', 'Alert!')
    sound_type = payload.get('sound_type', 'alert')
    
    NotificationHandler.send_notification(message, sound_type)
    
    return jsonify({
        "status": "success",
        "message": f"Notification triggered: {message} with sound {sound_type}"
    })
