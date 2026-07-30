# /backend/logger_handler.py
import sys
import time
import inspect
import json
from datetime import datetime

class LoggerHandler:
    _settings_cache = {}
    _last_cache_time = 0

    @classmethod
    def log(cls, msg: str, category: str = None, level: str = "INFO"):
        """
        Unified structured logging helper with DB settings check.
        Automatically infers caller module name if category is not provided.
        Checks system_log_settings in MySQL to determine if category is enabled.
        """
        if category is None:
            # Infer calling module/class automatically
            frame = inspect.currentframe().f_back
            category = frame.f_globals.get('__name__', 'System')
            if category == '__main__':
                category = 'App'
            elif '.' in category:
                category = category.split('.')[-1]

        # Refresh cache from DB every 2 seconds for high performance
        now = time.time()
        if now - cls._last_cache_time > 2.0:
            try:
                from sql_handler import SQLHandler
                cls._settings_cache = SQLHandler.get_log_settings()
                cls._last_cache_time = now
            except Exception:
                pass

        # If category is explicitly set to disabled (0) in DB, suppress the print
        if cls._settings_cache and cls._settings_cache.get(category) is False:
            return

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        formatted = f"[{timestamp}] [{level.upper()}] [{category}] {msg}"
        
        # Standard print to stdout so TerminalHandler streams it to SSE LogPanel
        print(formatted, flush=True)

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
