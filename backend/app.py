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

if __name__ == '__main__':
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
        LiveStrategyHandler.restore_active_strategies()
    except Exception as e:
        print(f"Startup Recovery Error: {e}", flush=True)

    # Initialize high-performance WSGI Server
    port = int(os.environ.get("PORT", 8751))
    print(f"Starting gevent WSGI Server on port {port}...", flush=True)
    http_server = WSGIServer(('0.0.0.0', port), app)
    http_server.serve_forever()
