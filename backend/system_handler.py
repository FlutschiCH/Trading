# /backend/system_handler.py
import os
import sys
import threading
import time

class SystemHandler:
    @staticmethod
    def restart_server():
        print("Restart requested from frontend. Exiting process in 1 second...", flush=True)
        def exit_func():
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
