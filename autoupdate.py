import os
import sys
import subprocess
import time
import threading
from flask import Flask, jsonify, request
from flask_cors import CORS
from gevent.pywsgi import WSGIServer

# Change working directory to the directory of this script to ensure relative paths work
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir:
    os.chdir(script_dir)

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

current_backend_process = None
process_lock = threading.Lock()

# Secondary Control Flask Server
control_app = Flask(__name__)
CORS(control_app)

@control_app.route('/api/restart', methods=['POST'])
def handle_restart():
    global current_backend_process
    with process_lock:
        if current_backend_process and current_backend_process.poll() is None:
            print("[Updater Server] Terminating backend process via restart API...", flush=True)
            current_backend_process.terminate()
            try:
                current_backend_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                current_backend_process.kill()
    return jsonify({"status": "restarting", "message": "Backend restart triggered"}), 200

@control_app.route('/api/health', methods=['GET'])
def handle_health():
    is_running = current_backend_process is not None and current_backend_process.poll() is None
    return jsonify({"status": "ok", "backend_running": is_running}), 200

def start_control_server():
    port = int(os.environ.get("UPDATER_PORT", 8081))
    print(f"[Updater Server] Starting control server on port {port}...", flush=True)
    server = WSGIServer(('0.0.0.0', port), control_app)
    server.serve_forever()

def get_git_commit():
    try:
        res = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception as e:
        print(f"Failed to get git commit hash: {e}", flush=True)
        return ""

def restart_updater():
    print("Restarting autoupdater process...", flush=True)
    executable = sys.executable
    args = [sys.executable] + sys.argv
    if os.name == 'nt':
        quoted_args = []
        for arg in args:
            if ' ' in arg and not (arg.startswith('"') and arg.endswith('"')):
                quoted_args.append(f'"{arg}"')
            else:
                quoted_args.append(arg)
        os.execv(executable, quoted_args)
    else:
        os.execv(executable, args)

def run_force_git_update():
    print("Checking for updates from Git (Force Update)...", flush=True)
    try:
        subprocess.run(["git", "fetch", "--all"], check=True)
        branch_res = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, check=True)
        branch = branch_res.stdout.strip()
        print(f"Current branch detected: {branch}", flush=True)
        res = subprocess.run(["git", "reset", "--hard", f"origin/{branch}"], capture_output=True, text=True, check=True)
        print("Git reset output:", res.stdout, flush=True)
        commit_info = subprocess.run(["git", "log", "-1", "--oneline"], capture_output=True, text=True, check=True)
        print(f"Git Update Complete! Active Commit: {commit_info.stdout.strip()}", flush=True)
        return True
    except Exception as e:
        print(f"Git force update failed: {e}", flush=True)
        return False

def check_and_install_dependencies(python_exe):
    req_path = os.path.join("backend", "requirements.txt")
    if os.path.exists(req_path):
        print("Installing/updating dependencies from requirements.txt...", flush=True)
        try:
            pip_exe = os.path.join(os.path.dirname(python_exe), "pip")
            if os.name == 'nt' and not pip_exe.endswith(".exe"):
                pip_exe += ".exe"
            if not os.path.exists(pip_exe):
                pip_exe = "pip"
            subprocess.run([pip_exe, "install", "-r", "requirements.txt"], cwd="backend", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except Exception as e:
            print(f"Failed to install dependencies: {e}", flush=True)

def main():
    global current_backend_process
    
    # Start updater control server thread on port 8081
    updater_thread = threading.Thread(target=start_control_server, daemon=True)
    updater_thread.start()

    if os.path.exists("backend/.venv/Scripts/python.exe"):
        python_exe = os.path.abspath("backend/.venv/Scripts/python.exe")
    elif os.path.exists("backend/venv/Scripts/python.exe"):
        python_exe = os.path.abspath("backend/venv/Scripts/python.exe")
    elif os.path.exists("backend/.venv/bin/python"):
        python_exe = os.path.abspath("backend/.venv/bin/python")
    else:
        python_exe = sys.executable

    print(f"Using Python interpreter: {python_exe}", flush=True)

    commit_before = get_git_commit()
    run_force_git_update()
    commit_after = get_git_commit()
    
    check_and_install_dependencies(python_exe)
    
    if commit_before and commit_after and commit_before != commit_after:
        restart_updater()

    while True:
        print("Starting backend server (backend/app.py)...", flush=True)
        try:
            with process_lock:
                current_backend_process = subprocess.Popen([python_exe, "app.py"], cwd="backend")
            
            current_backend_process.wait()
            exit_code = current_backend_process.returncode
            print(f"Backend exited with code {exit_code}.", flush=True)
            
            if exit_code == 99:
                print("Exit code 99 received. Stopping autoupdater.", flush=True)
                break
            
            if exit_code == 12:
                print("Exit code 12 received. Performing force update and restarting autoupdater...", flush=True)
                run_force_git_update()
                check_and_install_dependencies(python_exe)
                restart_updater()
                
            print("Restarting backend in 3 seconds...", flush=True)
            time.sleep(3)
        except KeyboardInterrupt:
            print("Autoupdater terminated by user.", flush=True)
            break
        except Exception as e:
            print(f"Error running backend: {e}", flush=True)
            time.sleep(5)

if __name__ == '__main__':
    main()

