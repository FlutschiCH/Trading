from gevent import monkey
monkey.patch_all()

import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure the backend directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from terminal_handler import TerminalHandler
TerminalHandler.init()

from sql_handler import SQLHandler
import threading
threading.Thread(target=SQLHandler.init_pool, daemon=True).start()

from flask import Flask
from flask_cors import CORS
from gevent.pywsgi import WSGIServer
from routes import api_blueprint  # Aggregated blueprint
from live_strategy_handler import LiveStrategyHandler

app = Flask(__name__)
CORS(app)

# Register consolidated routes
app.register_blueprint(api_blueprint, url_prefix='/api')

@app.route('/')
@app.route('/health')
def root_health():
    import socket
    try:
        computer_name = socket.gethostname()
    except:
        computer_name = "Unknown"
    return {
        "status": "online",
        "computer_name": computer_name,
        "message": "Trading Backend is running"
    }, 200

def run_auto_closer():
    import time
    from datetime import datetime, timezone as pytimezone
    from live_strategy_handler import LiveStrategyHandler
    from metatrader_handler import MetaTraderHandler

    print("Background Session Auto-Closer thread started.", flush=True)
    time.sleep(10) # wait on startup

    while True:
        try:
            strategy = LiveStrategyHandler.get_strategy()
            if strategy and strategy.get("status") == "active":
                symbol = strategy.get("symbol")
                timezone_str = strategy.get("timezone", "Local")
                sessions = [s for s in strategy.get("sessions", []) if s.get("active", True)]
                use_global_close = strategy.get("useGlobalClose", False)
                global_close_time = strategy.get("globalCloseTime", "")

                ts = time.time()
                if timezone_str == 'UTC':
                    dt_now = datetime.fromtimestamp(ts, tz=pytimezone.utc).replace(tzinfo=None)
                else:
                    dt_now = datetime.fromtimestamp(ts)

                time_val = dt_now.time()
                should_close = False
                close_reason = ""

                # A. Check session ends
                for s in sessions:
                    if s.get("closeOnEnd"):
                        try:
                            eh, em = map(int, s.get("end", "23:59").split(":"))
                            # Trigger close if we are in the exact minute of the end time
                            if dt_now.hour == eh and dt_now.minute == em:
                                should_close = True
                                close_reason = f"Session end reached ({eh:02d}:{em:02d})"
                                break
                        except ValueError:
                            continue

                # B. Check global close time
                if not should_close and use_global_close and global_close_time and len(global_close_time) == 5:
                    try:
                        gh, gm = map(int, global_close_time.split(":"))
                        if dt_now.hour == gh and dt_now.minute == gm:
                            should_close = True
                            close_reason = f"Global daily close reached ({global_close_time})"
                    except ValueError:
                        pass

                if should_close:
                    # Fetch positions and close matching symbol
                    broker_name = strategy.get("broker", "metatrader")
                    from broker_handler import BrokerHandler
                    handler = BrokerHandler.get_handler(broker_name)
                    
                    positions = handler.get_positions()
                    matching_positions = [p for p in positions if symbol.upper() in p["symbol"].upper()]
                    if matching_positions:
                        print(f"Session Auto-Closer: Triggering close for symbol {symbol} due to: {close_reason}", flush=True)
                        from notification_handler import NotificationHandler
                        NotificationHandler.play_sound("alert")
                        for pos in matching_positions:
                            res = handler.close_position(
                                position_id=pos["position_id"],
                                symbol=pos["symbol"],
                                side=pos["trade_side"],
                                volume=pos["volume"]
                            )
                            print(f"Auto-Close Position Result: {res}", flush=True)
        except Exception as ex:
            print(f"Error in background auto-closer loop: {ex}", flush=True)

        time.sleep(15) # check every 15 seconds

class CustomWSGILogger:
    def __init__(self):
        self.candle_request_count = 0

    def write(self, msg):
        is_200 = " 200 " in msg
        if is_200:
            if "OPTIONS " in msg:
                return
            if "/api/trade/candles" in msg:
                self.candle_request_count += 1
                if self.candle_request_count % 20 != 0:
                    return
                print(f"[API Log] /api/trade/candles request processed (Show 1/20 | Total: {self.candle_request_count})", flush=True)
                return
        m = msg.strip()
        if m:
            print(m, flush=True)

if __name__ == '__main__':
    import threading
    try:
        t = threading.Thread(target=run_auto_closer, daemon=True)
        t.start()
    except Exception as e:
        print(f"Failed to start auto-closer thread: {e}", flush=True)

    try:
        from live_runner_handler import LiveRunner
        LiveRunner.start()
    except Exception as e:
        print(f"Failed to start live runner: {e}", flush=True)
    # MetaTrader 5 auto-login sequence skipped for cTrader headless focus
    print("MetaTrader 5 startup skipped on this deployment configuration.", flush=True)

    # Restore active strategies from DB on startup
    try:
        # LiveStrategyHandler.restore_active_strategies()
        pass
    except Exception as e:
        print(f"Startup Recovery Error: {e}", flush=True)

    # Initialize high-performance WSGI Server
    port = int(os.environ.get("PORT", 8751))
    print(f"Started! Port: {port}...", flush=True)
    
    from ssl_config import get_ssl_config
    ssl_args = get_ssl_config()
    
    http_server = WSGIServer(('0.0.0.0', port), app, log=CustomWSGILogger(), **ssl_args)
    
    # Play startup sound once local server is ready
    try:
        from notification_handler import NotificationHandler
        NotificationHandler.play_sound("startup")
        
        from discord_handler import notify_discord_startup
        notify_discord_startup(port)
    except Exception as e:
        print(f"Failed to play startup sound or notify discord: {e}", flush=True)
        
    http_server.serve_forever()
