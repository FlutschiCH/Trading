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
