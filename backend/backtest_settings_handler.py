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
    def init_profiles_db():
        """
        Initializes the schema for named backtest settings profiles.
        """
        create_mysql = """
        CREATE TABLE IF NOT EXISTS backtest_settings_profiles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            symbol VARCHAR(50) NOT NULL,
            timeframe VARCHAR(10) NOT NULL,
            settings_json TEXT NOT NULL,
            is_favorite TINYINT(1) DEFAULT 0,
            updated_at VARCHAR(50) NOT NULL,
            UNIQUE KEY unique_name_symbol_tf (name, symbol, timeframe)
        )
        """
        create_sqlite = """
        CREATE TABLE IF NOT EXISTS backtest_settings_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            settings_json TEXT NOT NULL,
            is_favorite INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL,
            UNIQUE (name, symbol, timeframe)
        )
        """
        try:
            SQLHandler.execute_query(create_mysql)
        except Exception as e:
            try:
                SQLHandler.execute_query(create_sqlite)
            except Exception as e2:
                print(f"Error initializing backtest_settings_profiles SQLite table: {e2}", flush=True)

        # Ensure column exists if table was created previously
        try:
            SQLHandler.execute_query("ALTER TABLE backtest_settings_profiles ADD COLUMN is_favorite INTEGER DEFAULT 0")
        except Exception:
            pass


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

    @staticmethod
    def save_profile(name: str, symbol: str, timeframe: str, settings: dict) -> dict:
        """
        Saves or updates a named settings profile for a specific symbol and timeframe.
        """
        BacktestSettingsHandler.init_profiles_db()
        updated_at = time.strftime('%Y-%m-%d %H:%M:%S')
        settings_str = json.dumps(settings)

        query = """
        INSERT INTO backtest_settings_profiles (
            name, symbol, timeframe, settings_json, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s
        ) ON DUPLICATE KEY UPDATE
            settings_json = VALUES(settings_json),
            updated_at = VALUES(updated_at)
        """
        params = (name, symbol, timeframe, settings_str, updated_at)
        try:
            SQLHandler.execute_query(query, params)
            return {"status": "success", "message": f"Profile '{name}' successfully saved!"}
        except Exception as e:
            print(f"Error saving backtest profile: {e}", flush=True)
            return {"status": "error", "message": str(e)}

    @staticmethod
    def load_profile(profile_id: int) -> dict:
        """
        Loads a specific settings profile by ID.
        """
        BacktestSettingsHandler.init_profiles_db()
        query = "SELECT name, symbol, timeframe, settings_json FROM backtest_settings_profiles WHERE id = %s"
        try:
            rows = SQLHandler.execute_query(query, (profile_id,))
            if rows:
                row = rows[0]
                return {
                    "status": "success",
                    "id": profile_id,
                    "name": row.get("name"),
                    "symbol": row.get("symbol"),
                    "timeframe": row.get("timeframe"),
                    "settings": json.loads(row.get("settings_json"))
                }
            return {"status": "error", "message": "Profile not found."}
        except Exception as e:
            print(f"Error loading backtest profile {profile_id}: {e}", flush=True)
            return {"status": "error", "message": str(e)}

    @staticmethod
    def list_profiles(symbol: str = None, timeframe: str = None) -> dict:
        """
        Lists saved settings profiles/templates. If symbol and timeframe are provided,
        lists for that symbol/timeframe as well as all templates across all symbols/timeframes.
        Sorted by favorite status first, then updated_at DESC.
        """
        BacktestSettingsHandler.init_profiles_db()
        try:
            if symbol and timeframe and symbol != 'all' and timeframe != 'all':
                query = "SELECT id, name, symbol, timeframe, is_favorite, updated_at FROM backtest_settings_profiles WHERE symbol = %s AND timeframe = %s ORDER BY is_favorite DESC, updated_at DESC"
                rows = SQLHandler.execute_query(query, (symbol, timeframe))
                # Also fetch all templates so the user can use templates saved under other symbols/timeframes
                all_query = "SELECT id, name, symbol, timeframe, is_favorite, updated_at FROM backtest_settings_profiles ORDER BY is_favorite DESC, updated_at DESC"
                all_rows = SQLHandler.execute_query(all_query)
                return {"status": "success", "profiles": rows, "all_profiles": all_rows}
            else:
                query = "SELECT id, name, symbol, timeframe, is_favorite, updated_at FROM backtest_settings_profiles ORDER BY is_favorite DESC, updated_at DESC"
                rows = SQLHandler.execute_query(query)
                return {"status": "success", "profiles": rows, "all_profiles": rows}
        except Exception as e:
            print(f"Error listing backtest profiles: {e}", flush=True)
            return {"status": "error", "message": str(e)}

    @staticmethod
    def toggle_favorite_profile(profile_id: int, is_favorite: bool) -> dict:
        """
        Toggles or sets the favorite status of a settings profile template.
        """
        BacktestSettingsHandler.init_profiles_db()
        fav_val = 1 if is_favorite else 0
        query = "UPDATE backtest_settings_profiles SET is_favorite = %s WHERE id = %s"
        try:
            SQLHandler.execute_query(query, (fav_val, profile_id))
            return {"status": "success", "message": "Favorite status updated!"}
        except Exception as e:
            print(f"Error toggling favorite for profile {profile_id}: {e}", flush=True)
            return {"status": "error", "message": str(e)}

    @staticmethod
    def delete_profile(profile_id: int) -> dict:
        """
        Deletes a settings profile by ID.
        """
        BacktestSettingsHandler.init_profiles_db()
        query = "DELETE FROM backtest_settings_profiles WHERE id = %s"
        try:
            SQLHandler.execute_query(query, (profile_id,))
            return {"status": "success", "message": "Profile successfully deleted!"}
        except Exception as e:
            print(f"Error deleting backtest profile {profile_id}: {e}", flush=True)
            return {"status": "error", "message": str(e)}

