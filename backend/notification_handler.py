import sys
import threading
import os
import json
import base64
from sql_handler import SQLHandler

# Try importing pywebpush
try:
    from pywebpush import webpush, WebPushException
    PYWEBPUSH_AVAILABLE = True
except ImportError:
    PYWEBPUSH_AVAILABLE = False
    from logger_handler import logPrint
    logPrint("Warning: pywebpush is not installed.", category="NotificationHandler", level="WARNING")


class NotificationHandler:
    _db_initialized = False
    _db_lock = threading.Lock()

    @classmethod
    def init_db(cls):
        """Initializes tables and ensures VAPID keys exist."""
        with cls._db_lock:
            if cls._db_initialized:
                return
            
            # Create settings table
            SQLHandler.execute_query(
                "CREATE TABLE IF NOT EXISTS notification_settings ("
                "  key_name VARCHAR(50) PRIMARY KEY,"
                "  val_value TEXT"
                ")"
            )
            
            # Create push subscriptions table
            SQLHandler.execute_query(
                "CREATE TABLE IF NOT EXISTS push_subscriptions ("
                "  endpoint VARCHAR(512) PRIMARY KEY,"
                "  p256dh TEXT NOT NULL,"
                "  auth TEXT NOT NULL,"
                "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                ")"
            )
            
            # Ensure VAPID keys are generated
            cls.ensure_vapid_keys()
            cls._db_initialized = True

    @classmethod
    def ensure_vapid_keys(cls):
        """Generates a VAPID keypair using cryptography if not already present."""
        res_pub = SQLHandler.execute_query("SELECT val_value FROM notification_settings WHERE key_name = 'vapid_public_key'")
        res_priv = SQLHandler.execute_query("SELECT val_value FROM notification_settings WHERE key_name = 'vapid_private_key'")
        
        if not res_pub or not res_priv:
            try:
                from cryptography.hazmat.primitives.asymmetric import ec
                
                # Generate SECP256R1 keypair
                private_key = ec.generate_private_key(ec.SECP256R1())
                private_bytes = private_key.private_numbers().private_value.to_bytes(32, byteorder='big')
                vapid_private_key = base64.urlsafe_b64encode(private_bytes).decode('utf-8').rstrip('=')
                
                public_key = private_key.public_key()
                public_numbers = public_key.public_numbers()
                public_bytes = b'\x04' + public_numbers.x.to_bytes(32, byteorder='big') + public_numbers.y.to_bytes(32, byteorder='big')
                vapid_public_key = base64.urlsafe_b64encode(public_bytes).decode('utf-8').rstrip('=')
                
                # Save keys
                SQLHandler.execute_query(
                    "INSERT INTO notification_settings (key_name, val_value) VALUES ('vapid_public_key', %s) "
                    "ON DUPLICATE KEY UPDATE val_value = %s",
                    (vapid_public_key, vapid_public_key)
                )
                SQLHandler.execute_query(
                    "INSERT INTO notification_settings (key_name, val_value) VALUES ('vapid_private_key', %s) "
                    "ON DUPLICATE KEY UPDATE val_value = %s",
                    (vapid_private_key, vapid_private_key)
                )
                print("[NOTIFICATION] Generated new VAPID keypair.", flush=True)
            except Exception as e:
                print(f"[NOTIFICATION] Error generating VAPID keys: {e}", flush=True)

    @classmethod
    def get_setting(cls, key_name: str, default: str = None) -> str:
        cls.init_db()
        res = SQLHandler.execute_query("SELECT val_value FROM notification_settings WHERE key_name = %s", (key_name,))
        if res:
            return res[0].get('val_value')
        return default

    @classmethod
    def save_setting(cls, key_name: str, val_value: str):
        cls.init_db()
        SQLHandler.execute_query(
            "INSERT INTO notification_settings (key_name, val_value) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE val_value = %s",
            (key_name, val_value, val_value)
        )

    @staticmethod
    def play_sound(sound_type: str):
        if sys.platform != 'win32':
            return
        
        media_dir = "C:\\Windows\\Media"
        sound_map = {
            "startup": os.path.join(media_dir, "chimes.wav"),
            "trade_open": os.path.join(media_dir, "tada.wav"),
            "trade_close": os.path.join(media_dir, "notify.wav"),
            "break_even": os.path.join(media_dir, "flourish.wav"),
            "error": os.path.join(media_dir, "chord.wav"),
            "rejected": os.path.join(media_dir, "chord.wav"),
            "alert": os.path.join(media_dir, "ding.wav"),
        }
        
        sound_path = sound_map.get(sound_type, os.path.join(media_dir, "ding.wav"))
        
        if os.path.exists(sound_path):
            def _play():
                try:
                    import winsound
                    winsound.PlaySound(os.path.abspath(sound_path), winsound.SND_FILENAME | winsound.SND_ASYNC)
                except Exception:
                    try:
                        import winsound
                        winsound.MessageBeep()
                    except Exception:
                        pass
            
            threading.Thread(target=_play, daemon=True).start()
        else:
            try:
                import winsound
                winsound.MessageBeep()
            except Exception:
                pass

    @classmethod
    def send_notification(cls, message: str, sound_type: str = None):
        """Sends notification locally (sound), to Discord, and via PWA Web Push."""
        print(f"[NOTIFICATION] {message}", flush=True)
        if sound_type:
            cls.play_sound(sound_type)
        
        # Check settings configuration
        discord_enabled = cls.get_setting("discord_enabled", "true") == "true"
        push_enabled = cls.get_setting("push_enabled", "true") == "true"

        if discord_enabled:
            cls.send_discord_message(message)
            
        if push_enabled:
            cls.send_web_push("Trading Alert", message)

    @classmethod
    def send_discord_message(cls, message: str):
        # Read Discord webhook URL from DB settings, fall back to default if not configured
        db_webhook = cls.get_setting("discord_webhook_url")
        if db_webhook:
            webhook_url = db_webhook
        else:
            from discord_handler import DISCORD_WEBHOOK_URL
            webhook_url = DISCORD_WEBHOOK_URL
        
        if not webhook_url:
            return

        def _send():
            import urllib.request
            payload = {"content": message}
            try:
                req = urllib.request.Request(
                    webhook_url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'},
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=5) as response:
                    pass
            except Exception as e:
                print(f"Failed to send discord message: {e}", flush=True)

        threading.Thread(target=_send, daemon=True).start()

    @classmethod
    def add_push_subscription(cls, subscription_info: dict):
        cls.init_db()
        endpoint = subscription_info.get("endpoint")
        keys = subscription_info.get("keys", {})
        p256dh = keys.get("p256dh")
        auth = keys.get("auth")
        
        if not endpoint or not p256dh or not auth:
            raise ValueError("Invalid subscription info")

        SQLHandler.execute_query(
            "INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE p256dh = %s, auth = %s",
            (endpoint, p256dh, auth, p256dh, auth)
        )

    @classmethod
    def remove_push_subscription(cls, endpoint: str):
        cls.init_db()
        SQLHandler.execute_query("DELETE FROM push_subscriptions WHERE endpoint = %s", (endpoint,))

    @classmethod
    def send_web_push(cls, title: str, body: str, url: str = None):
        """Sends PWA Web Push notification to all subscribed devices."""
        cls.init_db()
        if not PYWEBPUSH_AVAILABLE:
            print("[NOTIFICATION] web-push library not available. Skipping push.", flush=True)
            return

        # Fetch keys
        vapid_private_key = cls.get_setting("vapid_private_key")
        vapid_public_key = cls.get_setting("vapid_public_key")
        
        if not vapid_private_key or not vapid_public_key:
            print("[NOTIFICATION] VAPID keys missing. Cannot send web push.", flush=True)
            return

        # Fetch all active subscriptions
        subs = SQLHandler.execute_query("SELECT endpoint, p256dh, auth FROM push_subscriptions")
        if not subs:
            return

        def _push_all():
            payload = {
                "title": title,
                "body": body,
                "icon": "/favicon.svg",
                "badge": "/favicon.svg",
                "url": url or ""
            }
            
            for sub in subs:
                sub_info = {
                    "endpoint": sub["endpoint"],
                    "keys": {
                        "p256dh": sub["p256dh"],
                        "auth": sub["auth"]
                    }
                }
                try:
                    webpush(
                        subscription_info=sub_info,
                        data=json.dumps(payload),
                        vapid_private_key=vapid_private_key,
                        vapid_claims={"sub": "mailto:admin@wyckoffdesk.local"},
                        timeout=5
                    )
                except WebPushException as ex:
                    # If subscription is expired/gone (410 Gone / 404 Not Found), clean it up from DB
                    if ex.response is not None and ex.response.status_code in [404, 410]:
                        print(f"[NOTIFICATION] Removing expired subscription: {sub['endpoint']}", flush=True)
                        cls.remove_push_subscription(sub["endpoint"])
                    else:
                        print(f"[NOTIFICATION] Failed to send push to {sub['endpoint']}: {ex}", flush=True)
                except Exception as e:
                    print(f"[NOTIFICATION] Web Push unexpected error: {e}", flush=True)

        threading.Thread(target=_push_all, daemon=True).start()
