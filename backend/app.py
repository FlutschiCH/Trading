from gevent import monkey
monkey.patch_all()

import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure the backend directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def disable_quick_edit():
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            h_input = kernel32.GetStdHandle(-10)
            mode = ctypes.c_ulong()
            if kernel32.GetConsoleMode(h_input, ctypes.byref(mode)):
                new_mode = (mode.value & ~0x0040) | 0x0080
                kernel32.SetConsoleMode(h_input, new_mode)
        except Exception:
            pass

disable_quick_edit()

# from terminal_handler import TerminalHandler
# TerminalHandler.init()

from colorama import init, Fore, Style
init(autoreset=True)

print(f"{Fore.CYAN}[INIT]{Style.RESET_ALL} Loading SQL Handler...")
from sql_handler import SQLHandler
import threading

def check_interrupted_backtests():
    try:
        import sys
        import subprocess
        unfinished = SQLHandler.get_unfinished_backtest_jobs()
        if unfinished:
            print(f"{Fore.YELLOW}[Reboot Recovery]{Style.RESET_ALL} Found {len(unfinished)} unfinished backtest jobs. Resuming background workers...", flush=True)
            python_executable = sys.executable
            worker_script = os.path.join(os.path.dirname(__file__), 'backtest_worker.py')

            for j in unfinished:
                job_id = j.get('job_id')
                if not job_id:
                    continue
                SQLHandler.update_backtest_job_progress(job_id, status='running', step_info='Resuming worker process post server restart...')
                cmd = [python_executable, worker_script, '--job_id', str(job_id), '--resume']
                subprocess.Popen(cmd, creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0)
                print(f"{Fore.CYAN}[Reboot Recovery]{Style.RESET_ALL} Automatically resumed backtest worker for job_id={job_id}", flush=True)
    except Exception as e:
        print(f"[Reboot Recovery] Error resuming unfinished jobs: {e}", flush=True)

def _warmup_db_pool():
    try:
        conn = SQLHandler.get_mysql_connection()
        conn.close()
    except Exception as e:
        print(f"[SQLHandler Warmup Error] {e}", flush=True)

threading.Thread(target=_warmup_db_pool, daemon=True).start()
threading.Thread(target=check_interrupted_backtests, daemon=True).start()


print(f"{Fore.CYAN}[INIT]{Style.RESET_ALL} Loading Flask & Routes...")
from flask import Flask
from flask_cors import CORS
from gevent.pywsgi import WSGIServer
from routes import api_blueprint  # Aggregated blueprint

print(f"{Fore.CYAN}[INIT]{Style.RESET_ALL} Loading & Starting Handlers...")
from live_strategy_handler import LiveStrategyHandler
from position_manager import PositionManager
from candle_collector_handler import CandleCollectorHandler
from alert_handler import AlertHandler
from copytrader_handler import CopytraderHandler

PositionManager.start()
print(f"  {Fore.GREEN}✓{Style.RESET_ALL} PositionManager started")
CandleCollectorHandler.start_background_collector()
print(f"  {Fore.GREEN}✓{Style.RESET_ALL} CandleCollectorHandler started")
AlertHandler.start_monitoring()
print(f"  {Fore.GREEN}✓{Style.RESET_ALL} AlertHandler started")
CopytraderHandler.start()
print(f"  {Fore.GREEN}✓{Style.RESET_ALL} CopytraderHandler started")


app = Flask(__name__)

CORS(app)

import time
from flask import g, request

@app.before_request
def start_timer():
    g.start_time = time.time()

@app.after_request
def log_request_timing(response):
    if hasattr(g, 'start_time'):
        elapsed = time.time() - g.start_time
        if elapsed > 0.1:
            logPrint(f"⏱️ [API SLOW] {request.method} {request.path} took {elapsed:.4f}s", category="Flask API", level="WARNING")
        else:
            logPrint(f"⚡ [API] {request.method} {request.path} took {elapsed:.4f}s", category="Flask API", level="DEBUG")
        response.headers['X-Response-Time'] = f"{elapsed:.4f}s"
    return response

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



from logger_handler import logPrint

class CustomWSGILogger:
    def write(self, msg):
        if msg:
            m = msg.strip()
            if m:
                logPrint(m, category="Flask API", level="INFO")

if __name__ == '__main__':
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
    port = int(os.environ.get("PORT", 8020))

    # Print host machine & IP banner
    import socket
    try:
        hostname = socket.gethostname()
        local_ip = "127.0.0.1"
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
        except Exception:
            pass
        finally:
            s.close()
        print(f"{Fore.MAGENTA}=================================================={Style.RESET_ALL}", flush=True)
        print(f"{Fore.GREEN}💻 Machine Host: {Style.BRIGHT}{hostname}{Style.RESET_ALL}", flush=True)
        print(f"{Fore.GREEN}🌐 Local IP:     {Style.BRIGHT}{local_ip}{Style.RESET_ALL}", flush=True)
        print(f"{Fore.GREEN}🔌 Server Port:   {Style.BRIGHT}{port}{Style.RESET_ALL}", flush=True)
        print(f"{Fore.GREEN}🐍 Python Ver:   {Style.BRIGHT}{sys.version.split()[0]} ({sys.executable}){Style.RESET_ALL}", flush=True)
        print(f"{Fore.MAGENTA}=================================================={Style.RESET_ALL}", flush=True)
    except Exception as e:
        print(f"Started! Port: {port}...", flush=True)

    http_server = WSGIServer(('0.0.0.0', port), app, log=CustomWSGILogger())
    
    # Play startup sound once local server is ready
    try:
        from notification_handler import NotificationHandler
        NotificationHandler.play_sound("startup")
    except Exception as e:
        print(f"Failed to play startup sound: {e}", flush=True)
        
    http_server.serve_forever()
