from sql_handler import SQLHandler

class SymbolMappingHandler:
    @staticmethod
    def init_db():
        """
        Initializes the schema for symbol mappings in the DB.
        """
        create_mysql = """
        CREATE TABLE IF NOT EXISTS symbol_mappings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            main_symbol VARCHAR(50) NOT NULL,
            account_id VARCHAR(100) NOT NULL,
            broker_symbol VARCHAR(50) NOT NULL,
            UNIQUE KEY uq_main_account (main_symbol, account_id)
        )
        """
        create_sqlite = """
        CREATE TABLE IF NOT EXISTS symbol_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            main_symbol TEXT NOT NULL,
            account_id TEXT NOT NULL,
            broker_symbol TEXT NOT NULL,
            UNIQUE(main_symbol, account_id)
        )
        """
        try:
            SQLHandler.execute_query(create_mysql)
            # Migration check: if table was created previously with broker_key, rename it to account_id
            try:
                SQLHandler.execute_query("ALTER TABLE symbol_mappings CHANGE COLUMN broker_key account_id VARCHAR(100) NOT NULL")
            except Exception:
                pass
        except Exception as e:
            try:
                SQLHandler.execute_query(create_sqlite)
            except Exception as e2:
                print(f"Error initializing symbol_mappings SQLite table: {e2}", flush=True)

    @staticmethod
    def get_all_mappings() -> list:
        SymbolMappingHandler.init_db()
        try:
            return SQLHandler.execute_query("SELECT id, main_symbol, account_id, broker_symbol FROM symbol_mappings")
        except Exception as e:
            print(f"Error fetching symbol mappings: {e}", flush=True)
            return []

    @staticmethod
    def add_mapping(main_symbol: str, account_id: str, broker_symbol: str) -> bool:
        SymbolMappingHandler.init_db()
        query = """
        INSERT INTO symbol_mappings (main_symbol, account_id, broker_symbol)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE broker_symbol = VALUES(broker_symbol)
        """
        try:
            SQLHandler.execute_query(query, (main_symbol.upper().strip(), str(account_id).strip(), broker_symbol.strip()))
            return True
        except Exception as e:
            print(f"Error saving symbol mapping: {e}", flush=True)
            return False

    @staticmethod
    def delete_mapping(mapping_id: int) -> bool:
        SymbolMappingHandler.init_db()
        try:
            SQLHandler.execute_query("DELETE FROM symbol_mappings WHERE id = %s", (mapping_id,))
            return True
        except Exception as e:
            print(f"Error deleting symbol mapping: {e}", flush=True)
            return False

    @staticmethod
    def map_to_broker(main_symbol: str, account_id: str) -> str:
        SymbolMappingHandler.init_db()
        query = "SELECT broker_symbol FROM symbol_mappings WHERE main_symbol = %s AND account_id = %s"
        try:
            res = SQLHandler.execute_query(query, (main_symbol.upper().strip(), str(account_id).strip()))
            if res:
                return res[0]['broker_symbol']
        except Exception as e:
            print(f"Error mapping symbol to broker: {e}", flush=True)
        return main_symbol

    @staticmethod
    def map_to_main(broker_symbol: str, account_id: str) -> str:
        SymbolMappingHandler.init_db()
        query = "SELECT main_symbol FROM symbol_mappings WHERE broker_symbol = %s AND account_id = %s"
        try:
            res = SQLHandler.execute_query(query, (broker_symbol.strip(), str(account_id).strip()))
            if res:
                return res[0]['main_symbol']
        except Exception as e:
            print(f"Error mapping symbol to main: {e}", flush=True)
        return None

