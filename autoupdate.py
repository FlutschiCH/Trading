import os
import sys
import subprocess
import time
import threading

# Change working directory to the directory of this script to ensure relative paths work
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir:
    os.chdir(script_dir)

def resolve_python_interpreter():
    if os.path.exists("backend/.venv/Scripts/python.exe"):
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

# disable_quick_edit()

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
    os.execv(executable, args)

def run_force_git_update():
    print("Checking for updates from Git (Force Update)...", flush=True)
    try:
        # Remove stale .git/index.lock if left behind by interrupted git operations
        git_lock_file = os.path.join(".git", "index.lock")
        if os.path.exists(git_lock_file):
            try:
                os.remove(git_lock_file)
                print("[Git Cleanup] Removed stale .git/index.lock file.", flush=True)
            except Exception as e:
                print(f"[Git Warning] Failed to remove .git/index.lock: {e}", flush=True)

        subprocess.run(["git", "fetch", "--all"], capture_output=True, text=True)
        branch = "main"
        print(f"Target branch: {branch}", flush=True)

        subprocess.run(["git", "reset", "--hard"], capture_output=True, text=True)
        subprocess.run(["git", "checkout", "-B", branch, f"origin/{branch}"], capture_output=True, text=True)
        
        res = subprocess.run(["git", "reset", "--hard", f"origin/{branch}"], capture_output=True, text=True)
        if res.stdout:
            print("Git reset output:", res.stdout.strip(), flush=True)
        
        # Verify and pull Git LFS large files
        print("Checking Git LFS large files...", flush=True)
        lfs_res = subprocess.run(["git", "lfs", "pull"], capture_output=True, text=True)
        if lfs_res.returncode != 0:
            print(f"[Git Warning] Git LFS pull returned warning/error: {lfs_res.stderr or lfs_res.stdout}", flush=True)
        else:
            print("Git LFS large files checked successfully.", flush=True)

        commit_info = subprocess.run(["git", "log", "-1", "--format=%h - %s (%cr) <%an>"], capture_output=True, text=True)
        GREEN = "\033[92m"
        CYAN = "\033[96m"
        BOLD = "\033[1m"
        RESET = "\033[0m"
        commit_str = commit_info.stdout.strip() if commit_info.returncode == 0 else "Unknown"
        print(f"\n{BOLD}{GREEN}======================================================================={RESET}", flush=True)
        print(f"{BOLD}{CYAN}[Git Update Complete] Active Commit: {commit_str}{RESET}", flush=True)
        print(f"{BOLD}{GREEN}=======================================================================\n{RESET}", flush=True)
        return True
    except Exception as e:
        print(f"Git force update warning/error: {e}", flush=True)
        return False

def main():
    global current_backend_process
    
    # Start updater control server thread on port 8081
    updater_thread = threading.Thread(target=start_control_server, daemon=True)
    updater_thread.start()

    python_exe = resolve_python_interpreter()
    print(f"Using Python interpreter: {python_exe}", flush=True)

    while True:
        # Force git update every time backend is restarted
        run_force_git_update()
        # check_and_install_dependencies(python_exe)

        print("Starting backend server (backend/app.py)...", flush=True)
        try:
            env = os.environ.copy()
            env["FLASK_ENV"] = "production"
            env["PYTHONUNBUFFERED"] = "1"
            with process_lock:
                current_backend_process = subprocess.Popen([python_exe, "app.py"], cwd="backend", env=env)
            
            current_backend_process.wait()
            exit_code = current_backend_process.returncode
            print(f"Backend exited with code {exit_code}.", flush=True)
            
            if exit_code == 99:
                print("Exit code 99 received. Stopping autoupdater.", flush=True)
                break
            
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
