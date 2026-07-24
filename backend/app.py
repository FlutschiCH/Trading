import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure the backend directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from gevent.pywsgi import WSGIServer
from routes import api_blueprint  # Aggregated blueprint
from live_strategy_handler import LiveStrategyHandler

app = Flask(__name__)
CORS(app)

# Register consolidated routes
app.register_blueprint(api_blueprint, url_prefix='/api')

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
                    positions = MetaTraderHandler.get_positions()
                    matching_positions = [p for p in positions if symbol.upper() in p["symbol"].upper()]
                    if matching_positions:
                        print(f"Session Auto-Closer: Triggering close for symbol {symbol} due to: {close_reason}", flush=True)
                        from notification_handler import NotificationHandler
                        NotificationHandler.play_sound("alert")
                        for pos in matching_positions:
                            res = MetaTraderHandler.close_position(
                                position_id=pos["position_id"],
                                symbol=pos["symbol"],
                                side=pos["trade_side"],
                                volume=pos["volume"]
                            )
                            print(f"Auto-Close Position Result: {res}", flush=True)
        except Exception as ex:
            print(f"Error in background auto-closer loop: {ex}", flush=True)

        time.sleep(15) # check every 15 seconds

if __name__ == '__main__':
    import threading
    try:
        t = threading.Thread(target=run_auto_closer, daemon=True)
        t.start()
    except Exception as e:
        print(f"Failed to start auto-closer thread: {e}", flush=True)
    # Initialize and login to MetaTrader 5 (Windows only)
    try:
        import sys
        if sys.platform == 'win32':
            import MetaTrader5 as mt5
            mt5_login_str = os.environ.get("MT5_LOGIN")
            mt5_login = int(mt5_login_str) if mt5_login_str else None
            mt5_password = os.environ.get("MT5_PASSWORD")
            mt5_server = os.environ.get("MT5_SERVER")
            
            if mt5_login and mt5_password and mt5_server:
                print(f"Logging into MetaTrader 5 on startup: Account {mt5_login} on server {mt5_server}...", flush=True)
                if mt5.initialize(login=mt5_login, password=mt5_password, server=mt5_server):
                    print("Successfully initialized and logged into MetaTrader 5 on startup!", flush=True)
                else:
                    error_code, error_desc = mt5.last_error()
                    print(f"Failed to log into MetaTrader 5 on startup: error code {error_code}, desc: {error_desc}", flush=True)
            else:
                print("MetaTrader 5 startup skipped (missing credentials in .env).", flush=True)
        else:
            print("MetaTrader 5 startup skipped (non-Windows platform).", flush=True)
    except Exception as e:
        print(f"MT5 Startup Connection Error: {e}", flush=True)

    # Restore active strategies from DB on startup
    try:
        # LiveStrategyHandler.restore_active_strategies()
        pass
    except Exception as e:
        print(f"Startup Recovery Error: {e}", flush=True)

    # Initialize high-performance WSGI Server
    port = int(os.environ.get("PORT", 8751))
    print(f"Starting gevent WSGI Server on port {port}...", flush=True)
    http_server = WSGIServer(('0.0.0.0', port), app)
    
    # Play startup sound once local server is ready
    try:
        from notification_handler import NotificationHandler
        NotificationHandler.play_sound("startup")
    except Exception as e:
        print(f"Failed to play startup sound: {e}", flush=True)
        
    http_server.serve_forever()
