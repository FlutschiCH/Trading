import os
import sys
import subprocess
import time
import threading
import json
import traceback

# Change working directory to the directory of this script to ensure relative paths work
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir:
    os.chdir(script_dir)

def log_crash_to_json(event_type: str, details: dict):
    try:
        log_file = os.path.join(script_dir, "autoupdate_crash_log.json")
        entries = []
        if os.path.exists(log_file):
            try:
                with open(log_file, "r", encoding="utf-8") as f:
                    entries = json.load(f)
                    if not isinstance(entries, list):
                        entries = []
            except Exception:
                entries = []
        
        entry = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "event": event_type,
            "details": details
        }
        entries.append(entry)
        # Keep last 50 crash entries
        entries = entries[-50:]
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
        print(f"[Crash Logger] Crash details saved to {log_file}", flush=True)
    except Exception as err:
        print(f"[Crash Logger Error] Failed to write JSON crash log: {err}", flush=True)

def handle_uncaught_exception(exc_type, exc_value, exc_tb):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_tb)
        return
    err_msg = "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
    print(f"\n❌ [CRITICAL CRASH DETECTED IN AUTOUPDATE]\n{err_msg}", flush=True)
    log_crash_to_json("updater_crash", {
        "error": str(exc_value),
        "traceback": err_msg
    })
    print("\n[CRASH] Press Enter or wait 60 seconds to exit terminal...", flush=True)
    try:
        input()
    except Exception:
        time.sleep(60)

sys.excepthook = handle_uncaught_exception

def resolve_python_interpreter():
    if os.path.exists(r"C:\Program Files\Python311\python.exe"):
        return r"C:\Program Files\Python311\python.exe"
    elif os.path.exists("backend/.venv/Scripts/python.exe"):
        return os.path.abspath("backend/.venv/Scripts/python.exe")
    elif os.path.exists("backend/venv/Scripts/python.exe"):
        return os.path.abspath("backend/venv/Scripts/python.exe")
    elif os.path.exists("backend/.venv/bin/python"):
        return os.path.abspath("backend/.venv/bin/python")
    return sys.executable

def check_and_install_dependencies(python_exe):
    req_path = os.path.join("backend", "requirements.txt")
    if os.path.exists(req_path):
        print("Installing/updating dependencies from requirements.txt...", flush=True)
        try:
            subprocess.run([python_exe, "-m", "pip", "install", "-r", "requirements.txt"], cwd="backend", check=True)
        except Exception as e:
            print(f"Failed to install dependencies: {e}", flush=True)

# Run dependency installation FIRST before importing framework modules
python_interpreter = resolve_python_interpreter()
# check_and_install_dependencies(python_interpreter)

from flask import Flask, jsonify, request
from flask_cors import CORS
from gevent.pywsgi import WSGIServer

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

restart_requested = False

@control_app.route('/api/restart', methods=['POST'])
def handle_restart():
    global current_backend_process, restart_requested
    restart_requested = True
    with process_lock:
        if current_backend_process and current_backend_process.poll() is None:
            print("[Updater Server] Terminating backend process via restart API to trigger Git update in BAT...", flush=True)
            current_backend_process.terminate()
            try:
                current_backend_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                current_backend_process.kill()
    return jsonify({"status": "restarting", "message": "Backend restart & Git pull triggered"}), 200

@control_app.route('/api/health', methods=['GET'])
def handle_health():
    is_running = current_backend_process is not None and current_backend_process.poll() is None
    return jsonify({"status": "ok", "backend_running": is_running}), 200

def start_control_server():
    port = int(os.environ.get("UPDATER_PORT", 8081))
    print(f"[Updater Server] Starting control server on port {port}...", flush=True)
    server = WSGIServer(('0.0.0.0', port), control_app)
    server.serve_forever()

def main():
    global current_backend_process, restart_requested
    
    # Start updater control server thread on port 8081
    updater_thread = threading.Thread(target=start_control_server, daemon=True)
    updater_thread.start()

    python_exe = resolve_python_interpreter()
    print(f"Using Python interpreter: {python_exe}", flush=True)

    while True:
        restart_requested = False
        print("Starting backend server (backend/app.py)...", flush=True)
        try:
            env = os.environ.copy()
            env["FLASK_ENV"] = "production"
            env["PYTHONUNBUFFERED"] = "1"
            env["PYTHONIOENCODING"] = "utf-8"
            with process_lock:
                current_backend_process = subprocess.Popen(
                    [python_exe, "app.py"],
                    cwd="backend",
                    env=env
                )
            
            current_backend_process.wait()
            exit_code = current_backend_process.returncode
            print(f"Backend exited with code {exit_code}.", flush=True)

            if exit_code == 99:
                print("Exit code 99 received. Stopping autoupdater.", flush=True)
                sys.exit(99)

            if restart_requested or exit_code == 0:
                print("Restart requested via API/exit 0. Exiting autoupdate.py to trigger Git pull in BAT...", flush=True)
                sys.exit(0)

            if exit_code != 0:
                log_crash_to_json("backend_crash", {
                    "exit_code": exit_code,
                    "python_interpreter": python_exe
                })

            print("Restarting backend in 3 seconds...", flush=True)
            time.sleep(3)
        except KeyboardInterrupt:
            print("Autoupdater terminated by user.", flush=True)
            sys.exit(0)
        except Exception as e:
            err_msg = traceback.format_exc()
            print(f"Error running backend: {e}\n{err_msg}", flush=True)
            log_crash_to_json("updater_loop_error", {
                "error": str(e),
                "traceback": err_msg
            })
            time.sleep(5)

if __name__ == '__main__':
    main()
