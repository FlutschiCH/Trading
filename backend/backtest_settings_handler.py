import time
import json
from sql_handler import SQLHandler

class BacktestSettingsHandler:
    @staticmethod
    def init_db():
        """
        Initializes the schema for backtest settings in the DB.
        """
        create_mysql = """
        CREATE TABLE IF NOT EXISTS backtest_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            symbol VARCHAR(50) NOT NULL,
            timeframe VARCHAR(10) NOT NULL,
            settings_json TEXT NOT NULL,
            updated_at VARCHAR(50) NOT NULL,
            UNIQUE KEY unique_symbol_tf (symbol, timeframe)
        )
        """
        create_sqlite = """
        CREATE TABLE IF NOT EXISTS backtest_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            settings_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (symbol, timeframe)
        )
        """
        try:
            SQLHandler.execute_query(create_mysql)
        except Exception as e:
            try:
                SQLHandler.execute_query(create_sqlite)
            except Exception as e2:
                print(f"Error initializing backtest_settings SQLite table: {e2}", flush=True)

    @staticmethod
    def save_settings(symbol: str, timeframe: str, settings: dict) -> dict:
        """
        Saves or updates backtest settings for a specific symbol and timeframe.
        """
        BacktestSettingsHandler.init_db()
        updated_at = time.strftime('%Y-%m-%d %H:%M:%S')
        settings_str = json.dumps(settings)

        query = """
        INSERT INTO backtest_settings (
            symbol, timeframe, settings_json, updated_at
        ) VALUES (
            %s, %s, %s, %s
        ) ON DUPLICATE KEY UPDATE
            settings_json = VALUES(settings_json),
            updated_at = VALUES(updated_at)
        """
        params = (symbol, timeframe, settings_str, updated_at)
        try:
            SQLHandler.execute_query(query, params)
            return {"status": "success", "message": "Backtest settings successfully saved!"}
        except Exception as e:
            print(f"Error saving backtest settings: {e}", flush=True)
            return {"status": "error", "message": str(e)}

    @staticmethod
    def load_settings(symbol: str, timeframe: str) -> dict:
        """
        Loads backtest settings for a specific symbol and timeframe.
        """
        BacktestSettingsHandler.init_db()
        query = "SELECT settings_json FROM backtest_settings WHERE symbol = %s AND timeframe = %s"
        try:
            rows = SQLHandler.execute_query(query, (symbol, timeframe))
            if rows:
                settings_data = rows[0].get("settings_json")
                if settings_data:
                    return {"status": "success", "settings": json.loads(settings_data)}
            
            # If not found, load latest available settings as default
            latest_query = "SELECT settings_json FROM backtest_settings ORDER BY updated_at DESC LIMIT 1"
            latest_rows = SQLHandler.execute_query(latest_query)
            if latest_rows:
                settings_data = latest_rows[0].get("settings_json")
                if settings_data:
                    return {"status": "success", "settings": json.loads(settings_data), "is_default": True}
            
            return {"status": "success", "settings": {}, "is_default": True}
        except Exception as e:
            print(f"Error loading backtest settings: {e}", flush=True)
            return {"status": "error", "message": str(e)}
