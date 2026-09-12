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
        "Scalper",
        "ScalperHandler",
        "LiquidityWorker",
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

    @classmethod
    def log(cls, msg: str, category: str = None, level: str = "INFO"):
        """
        Unified structured logging helper.
        Automatically infers caller module name if category is not provided.
        Checks ENABLED_CATEGORIES and DISABLED_CATEGORIES lists at class level.
        Prints to stdout for in-memory terminal streaming.
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
        
        # Standard print to stdout so TerminalHandler streams it to SSE LogPanel in memory
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

