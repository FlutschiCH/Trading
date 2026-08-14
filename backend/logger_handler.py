# /backend/logger_handler.py
import sys
import time
import inspect
import json
import os
import threading
from datetime import datetime

class LoggerHandler:
    # Manual log visibility overrides (Set DB checks aside for manual control)
    ENABLED_CATEGORIES = [
        "LiveRunner",
        "LiveStrategy",
        "TradingHandler",
        "MetaTraderHandler",
        "CTraderHandler",
        "Flask API",
        "App",
        "System"
    ]
    DISABLED_CATEGORIES = [
        "SQLHandler",
    ]

    _settings_cache = {}
    _last_cache_time = 0
    _file_lock = threading.Lock()
    _log_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs.json")

    @classmethod
    def log(cls, msg: str, category: str = None, level: str = "INFO"):
        """
        Unified structured logging helper.
        Automatically infers caller module name if category is not provided.
        Checks ENABLED_CATEGORIES and DISABLED_CATEGORIES lists at class level.
        Appends log entry to logs.json.
        """
        if category is None:
            # Infer calling module/class automatically
            frame = inspect.currentframe().f_back
            category = frame.f_globals.get('__name__', 'System')
            if category == '__main__':
                category = 'App'
            elif '.' in category:
                category = category.split('.')[-1]

        # 1. Check explicit manual disable list
        if category in cls.DISABLED_CATEGORIES:
            return

        # 2. Check explicit manual enable list (if populated, only allow listed categories)
        if cls.ENABLED_CATEGORIES and category not in cls.ENABLED_CATEGORIES:
            return

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        formatted = f"[{timestamp}] [{level.upper()}] [{category}] {msg}"
        
        # Color coding for terminal output
        GREEN = "\033[92m"
        RED = "\033[91m"
        YELLOW = "\033[93m"
        CYAN = "\033[96m"
        BLUE = "\033[94m"
        BOLD = "\033[1m"
        RESET = "\033[0m"

        lower_msg = str(msg).lower()
        if "fail" in lower_msg or "error" in lower_msg or "exception" in lower_msg or level.upper() in ("ERROR", "FAIL"):
            color = RED
        elif "connected" in lower_msg or "success" in lower_msg or level.upper() in ("SUCCESS", "OK"):
            color = GREEN
        elif "warn" in lower_msg or level.upper() == "WARN":
            color = YELLOW
        else:
            color = CYAN

        formatted_console = f"{BOLD}{BLUE}[{timestamp}]{RESET} {color}[{level.upper()}]{RESET} {color}[{category}]{RESET} {color}{msg}{RESET}"
        print(formatted_console, flush=True)

        # Append log entry to logs.json
        entry = {
            "timestamp": timestamp,
            "level": level.upper(),
            "category": category,
            "message": str(msg)
        }
        
        try:
            with cls._file_lock:
                logs = []
                if os.path.exists(cls._log_file_path):
                    try:
                        with open(cls._log_file_path, "r", encoding="utf-8") as f:
                            logs = json.load(f)
                    except Exception:
                        logs = []
                logs.append(entry)
                # Keep last 2000 log entries to avoid unbounded file growth
                if len(logs) > 2000:
                    logs = logs[-2000:]
                with open(cls._log_file_path, "w", encoding="utf-8") as f:
                    json.dump(logs, f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass

    @classmethod
    def set_category_enabled(cls, category: str, enabled: bool):
        """Updates log setting in DB and clears memory cache immediately."""
        try:
            from sql_handler import SQLHandler
            SQLHandler.save_log_setting(category, enabled)
            cls._settings_cache[category] = enabled
            cls._last_cache_time = time.time()
        except Exception as e:
            print(f"[LoggerHandler] Error setting category status: {e}", flush=True)

# Helper shorthand alias function logPrint()
def logPrint(msg: str, category: str = None, level: str = "INFO"):
    LoggerHandler.log(msg, category=category, level=level)

