import time
from sql_handler import SQLHandler

class FavouritesHandler:
    @staticmethod
    def init_db():
        """
        Initializes the schema for favourite candles in the DB.
        """
        # MySQL table schema
        create_mysql = """
        CREATE TABLE IF NOT EXISTS favourite_candles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            symbol VARCHAR(50) NOT NULL,
            timeframe VARCHAR(10) NOT NULL,
            candle_time BIGINT NOT NULL,
            open_val DOUBLE NOT NULL,
            high_val DOUBLE NOT NULL,
            low_val DOUBLE NOT NULL,
            close_val DOUBLE NOT NULL,
            volume_val DOUBLE NOT NULL,
            vsa_patterns TEXT,
            weis_wave_volume DOUBLE,
            notes TEXT,
            favourited_at VARCHAR(50) NOT NULL,
            UNIQUE KEY unique_candle (symbol, timeframe, candle_time)
        )
        """
        # SQLite table schema (translated dynamically or handled directly)
        create_sqlite = """
        CREATE TABLE IF NOT EXISTS favourite_candles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            candle_time INTEGER NOT NULL,
            open_val REAL NOT NULL,
            high_val REAL NOT NULL,
            low_val REAL NOT NULL,
            close_val REAL NOT NULL,
            volume_val REAL NOT NULL,
            vsa_patterns TEXT,
            weis_wave_volume REAL,
            notes TEXT,
            favourited_at TEXT NOT NULL,
            UNIQUE (symbol, timeframe, candle_time)
        )
        """
        try:
            # We execute mysql table create, the translator handles SQLite if falling back
            SQLHandler.execute_query(create_mysql)
        except Exception as e:
            # If dialect creation failed on SQLite, execute SQLite direct query
            try:
                SQLHandler.execute_query(create_sqlite)
            except Exception as e2:
                print(f"Error initializing favourite_candles SQLite table: {e2}", flush=True)

    @staticmethod
    def save_favourite(symbol: str, timeframe: str, candle_time: int, open_val: float, high_val: float, low_val: float, close_val: float, volume_val: float, vsa_patterns: str = None, weis_wave_volume: float = None, notes: str = "") -> dict:
        """
        Saves or updates a favourite candle in the SQL database.
        """
        FavouritesHandler.init_db()
        favourited_at = time.strftime('%Y-%m-%d %H:%M:%S')
        
        query = """
        INSERT INTO favourite_candles (
            symbol, timeframe, candle_time, open_val, high_val, low_val, close_val, volume_val, vsa_patterns, weis_wave_volume, notes, favourited_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        ) ON DUPLICATE KEY UPDATE
            open_val=VALUES(open_val),
            high_val=VALUES(high_val),
            low_val=VALUES(low_val),
            close_val=VALUES(close_val),
            volume_val=VALUES(volume_val),
            vsa_patterns=VALUES(vsa_patterns),
            weis_wave_volume=VALUES(weis_wave_volume),
            notes=VALUES(notes),
            favourited_at=VALUES(favourited_at)
        """
        params = (
            symbol, timeframe, int(candle_time), float(open_val), float(high_val),
            float(low_val), float(close_val), float(volume_val), vsa_patterns,
            weis_wave_volume, notes, favourited_at
        )
        try:
            SQLHandler.execute_query(query, params)
            return {"status": "success", "message": "Candle successfully favourited!"}
        except Exception as e:
            print(f"Error saving favourite candle: {e}", flush=True)
            return {"status": "error", "message": str(e)}

    @staticmethod
    def delete_favourite(fav_id: int) -> dict:
        query = "DELETE FROM favourite_candles WHERE id = %s"
        try:
            SQLHandler.execute_query(query, (int(fav_id),))
            return {"status": "success", "message": "Favourite candle deleted."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def list_favourites() -> list:
        FavouritesHandler.init_db()
        query = "SELECT * FROM favourite_candles ORDER BY favourited_at DESC"
        try:
            return SQLHandler.execute_query(query)
        except Exception as e:
            print(f"Error listing favourite candles: {e}", flush=True)
            return []

    @staticmethod
    def update_notes(fav_id: int, notes: str) -> dict:
        query = "UPDATE favourite_candles SET notes = %s WHERE id = %s"
        try:
            SQLHandler.execute_query(query, (notes, int(fav_id)))
            return {"status": "success", "message": "Notes updated successfully."}
        except Exception as e:
            return {"status": "error", "message": str(e)}
