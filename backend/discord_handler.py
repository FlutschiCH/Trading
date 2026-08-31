import urllib.request
import json
import socket
import threading
import os

DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1530828685806932060/es7ROX2lzOcUM2_CjFGZiHbT448ubzxub0zsSJ8dvlfTHr61n2zuuncDvZ8Se3uTwcfu"

def send_discord_message(message: str):
    """
    Sends a message to Discord in a background thread to prevent blocking.
    """
    def _send():
        payload = {"content": message}
        try:
            req = urllib.request.Request(
                DISCORD_WEBHOOK_URL,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                pass
        except Exception as e:
            print(f"Failed to send discord message: {e}", flush=True)

    threading.Thread(target=_send, daemon=True).start()

def notify_discord_startup(port: int):
    """
    Retrieves server IP and configuration, then sends a startup notification to Discord.
    """
    def _run():
        public_ip = "Unknown"
        try:
            req = urllib.request.Request("https://api.ipify.org", headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as response:
                public_ip = response.read().decode('utf-8').strip()
        except Exception as e:
            print(f"Failed to fetch public IP: {e}", flush=True)
            
        local_ip = "Unknown"
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 1))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception as e:
            print(f"Failed to fetch local IP: {e}", flush=True)
            
        computer_name = "Unknown"
        try:
            computer_name = socket.gethostname()
        except Exception as e:
            print(f"Failed to fetch computer name: {e}", flush=True)
            
        msg = f"🚀 **Trading App Started!**\n💻 **Computer Name:** `{computer_name}`\n🌐 **Public IP:** `{public_ip}`\n🏠 **Local IP:** `{local_ip}`\n🔌 **Port:** `{port}`"
        send_discord_message(msg)

    threading.Thread(target=_run, daemon=True).start()
