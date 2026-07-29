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

@notification_routes.route('/notification/vapid-public-key', methods=['GET'])
def get_vapid_public_key():
    # Make sure DB is initialized
    NotificationHandler.init_db()
    public_key = NotificationHandler.get_setting("vapid_public_key")
    if not public_key:
        return jsonify({"status": "error", "message": "VAPID key not available"}), 500
    return jsonify({"status": "success", "public_key": public_key})

@notification_routes.route('/notification/subscribe', methods=['POST'])
def subscribe():
    payload = request.get_json(silent=True) or {}
    try:
        NotificationHandler.add_push_subscription(payload)
        return jsonify({"status": "success", "message": "Subscribed successfully"})
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Unexpected error: {str(e)}"}), 500

@notification_routes.route('/notification/unsubscribe', methods=['POST'])
def unsubscribe():
    payload = request.get_json(silent=True) or {}
    endpoint = payload.get("endpoint")
    if not endpoint:
        return jsonify({"status": "error", "message": "Endpoint required"}), 400
    try:
        NotificationHandler.remove_push_subscription(endpoint)
        return jsonify({"status": "success", "message": "Unsubscribed successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@notification_routes.route('/notification/settings', methods=['GET'])
def get_settings():
    NotificationHandler.init_db()
    discord_webhook_url = NotificationHandler.get_setting("discord_webhook_url", "")
    discord_enabled = NotificationHandler.get_setting("discord_enabled", "true") == "true"
    push_enabled = NotificationHandler.get_setting("push_enabled", "true") == "true"
    
    return jsonify({
        "status": "success",
        "settings": {
            "discord_webhook_url": discord_webhook_url,
            "discord_enabled": discord_enabled,
            "push_enabled": push_enabled
        }
    })

@notification_routes.route('/notification/settings', methods=['POST'])
def update_settings():
    payload = request.get_json(silent=True) or {}
    
    if "discord_webhook_url" in payload:
        NotificationHandler.save_setting("discord_webhook_url", payload["discord_webhook_url"])
    if "discord_enabled" in payload:
        val = "true" if payload["discord_enabled"] else "false"
        NotificationHandler.save_setting("discord_enabled", val)
    if "push_enabled" in payload:
        val = "true" if payload["push_enabled"] else "false"
        NotificationHandler.save_setting("push_enabled", val)
        
    return jsonify({"status": "success", "message": "Settings updated successfully"})

@notification_routes.route('/notification/test-push', methods=['POST'])
def test_push():
    NotificationHandler.send_web_push(
        title="Test Notification 🔔",
        body="This is a test notification from your Wyckoff Desk Trading PWA!"
    )
    return jsonify({"status": "success", "message": "Test push notification dispatched"})

@notification_routes.route('/notification/test-discord', methods=['POST'])
def test_discord():
    NotificationHandler.send_discord_message("🔔 **Test Webhook Message:** Discord notification integration is working correctly!")
    return jsonify({"status": "success", "message": "Test Discord notification dispatched"})
