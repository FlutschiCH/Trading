# /backend/system_handler.py
import os
import sys
import threading
import time

class SystemHandler:
    @staticmethod
    def restart_server():
        print("Restart requested from frontend. Stopping live workers and exiting process in 1 second...", flush=True)
        def exit_func():
            # 1. Stop all live workers registered in supervisor
            try:
                from live_runner_handler import LiveRunner
                LiveRunner.stop()
            except Exception as e:
                print(f"[SystemHandler] LiveRunner stop warning: {e}", flush=True)

            # 2. Terminate any orphan live_worker processes using lock files or process scan
            try:
                import psutil
                current_pid = os.getpid()
                for p in psutil.process_iter(['pid', 'name', 'cmdline']):
                    try:
                        if p.info['pid'] == current_pid:
                            continue
                        cmdline = p.info.get('cmdline') or []
                        cmd_str = " ".join(cmdline)
                        if "live_worker.py" in cmd_str and "backtest_worker.py" not in cmd_str:
                            print(f"[SystemHandler] Killing live_worker process (PID {p.info['pid']})...", flush=True)
                            p.kill()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
            except Exception:
                # If psutil is not available or errors out, clean up via worker lock files
                try:
                    lock_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".worker_locks")
                    if os.path.exists(lock_dir):
                        for f in os.listdir(lock_dir):
                            if f.startswith("live_worker_") and f.endswith(".lock"):
                                fpath = os.path.join(lock_dir, f)
                                try:
                                    with open(fpath, "r") as lf:
                                        pid_str = lf.read().strip()
                                        if pid_str and pid_str.isdigit():
                                            target_pid = int(pid_str)
                                            if target_pid != os.getpid():
                                                if sys.platform == "win32":
                                                    os.system(f"taskkill /F /PID {target_pid} >nul 2>&1")
                                                else:
                                                    os.kill(target_pid, 9)
                                except Exception:
                                    pass
                except Exception:
                    pass

            time.sleep(1)
            # Exit with code 12, which our autoupdater will recognize to restart and update
            os._exit(12)
        
        # Run in a separate thread so the response can be returned to the client first
        threading.Thread(target=exit_func, daemon=True).start()
        return {"status": "success", "message": "Server is restarting"}

    @staticmethod
    def get_status():
        import socket
        try:
            comp_name = socket.gethostname()
        except:
            comp_name = "Unknown"
        return {
            "status": "online",
            "computer_name": comp_name,
            "os": sys.platform
        }

    @staticmethod
    def get_quick_edit():
        if sys.platform == "win32":
            try:
                import ctypes
                kernel32 = ctypes.windll.kernel32
                h_input = kernel32.GetStdHandle(-10)
                mode = ctypes.c_ulong()
                if kernel32.GetConsoleMode(h_input, ctypes.byref(mode)):
                    is_on = bool(mode.value & 0x0040)
                    return {"status": "success", "enabled": is_on}
            except Exception as e:
                return {"status": "error", "message": str(e)}
        return {"status": "success", "enabled": False}

    @staticmethod
    def set_quick_edit(enabled: bool):
        if sys.platform == "win32":
            try:
                import ctypes
                kernel32 = ctypes.windll.kernel32
                h_input = kernel32.GetStdHandle(-10)
                mode = ctypes.c_ulong()
                if kernel32.GetConsoleMode(h_input, ctypes.byref(mode)):
                    if enabled:
                        new_mode = (mode.value | 0x0040) | 0x0080
                    else:
                        new_mode = (mode.value & ~0x0040) | 0x0080
                    kernel32.SetConsoleMode(h_input, new_mode)
                    print(f"[SystemHandler] Console QuickEdit mode set to {enabled}", flush=True)
                    return {"status": "success", "enabled": enabled}
            except Exception as e:
                return {"status": "error", "message": str(e)}
        return {"status": "success", "enabled": enabled}
