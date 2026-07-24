import os
import sys
import subprocess
import time

def run_git_pull():
    print("Checking for updates from Git...", flush=True)
    try:
        res = subprocess.run(["git", "pull"], capture_output=True, text=True, check=True)
        print("Git pull output:", res.stdout, flush=True)
        return "requirements.txt" in res.stdout
    except Exception as e:
        print(f"Git pull failed: {e}", flush=True)
        return False

def check_and_install_dependencies(python_exe):
    req_path = os.path.join("backend", "requirements.txt")
    if os.path.exists(req_path):
        print("Installing/updating dependencies from requirements.txt...", flush=True)
        try:
            # Determine pip path (usually in the same folder as python)
            pip_exe = os.path.join(os.path.dirname(python_exe), "pip")
            if os.name == 'nt' and not pip_exe.endswith(".exe"):
                pip_exe += ".exe"
            if not os.path.exists(pip_exe):
                pip_exe = "pip"
            subprocess.run([pip_exe, "install", "-r", "requirements.txt"], cwd="backend", check=True)
        except Exception as e:
            print(f"Failed to install dependencies: {e}", flush=True)

def main():
    # Detect the correct Python path to use for running backend/app.py
    # Priority: backend/.venv/Scripts/python.exe -> backend/venv/Scripts/python.exe -> backend/.venv/bin/python -> sys.executable
    if os.path.exists("backend/.venv/Scripts/python.exe"):
        python_exe = os.path.abspath("backend/.venv/Scripts/python.exe")
    elif os.path.exists("backend/venv/Scripts/python.exe"):
        python_exe = os.path.abspath("backend/venv/Scripts/python.exe")
    elif os.path.exists("backend/.venv/bin/python"):
        python_exe = os.path.abspath("backend/.venv/bin/python")
    else:
        python_exe = sys.executable

    print(f"Using Python interpreter: {python_exe}", flush=True)

    # Initial check on startup
    check_and_install_dependencies(python_exe)

    while True:
        # Pull from git
        reqs_updated = run_git_pull()
        if reqs_updated:
            print("requirements.txt was updated. Re-running pip install...", flush=True)
            check_and_install_dependencies(python_exe)

        print("Starting backend server (backend/app.py)...", flush=True)
        try:
            # Run backend/app.py with cwd=backend so relative imports work correctly
            process = subprocess.Popen([python_exe, "app.py"], cwd="backend")
            process.wait()
            
            exit_code = process.returncode
            print(f"Backend exited with code {exit_code}.", flush=True)
            
            # Code 99 could mean manual stop request
            if exit_code == 99:
                print("Exit code 99 received. Stopping autoupdater.", flush=True)
                break
                
            # Otherwise wait and restart (auto-updater updates on next loop iteration via run_git_pull)
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
