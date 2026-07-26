import os
import sys
import subprocess
import time

def run_force_git_update():
    print("Checking for updates from Git (Force Update)...", flush=True)
    try:
        # Fetch all changes
        subprocess.run(["git", "fetch", "--all"], check=True)
        
        # Get the name of the current active branch
        branch_res = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, check=True)
        branch = branch_res.stdout.strip()
        print(f"Current branch detected: {branch}", flush=True)
        
        # Force reset to origin's branch to discard local modifications
        res = subprocess.run(["git", "reset", "--hard", f"origin/{branch}"], capture_output=True, text=True, check=True)
        print("Git reset output:", res.stdout, flush=True)
        return True
    except Exception as e:
        print(f"Git force update failed: {e}", flush=True)
        return False

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
            
            # Code 12 means update and restart request from frontend
            if exit_code == 12:
                print("Exit code 12 received. Performing force update and restarting autoupdater...", flush=True)
                run_force_git_update()
                check_and_install_dependencies(python_exe)
                
                # Restart the updater script itself to load any new updater changes
                os.execv(sys.executable, [sys.executable] + sys.argv)
                
            # Otherwise wait and restart on crash/normal exit
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
