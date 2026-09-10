import threading
from sql_handler import SQLHandler

class SymbolMappingHandler:
    _mappings_cache = None  # { (main_symbol.upper(), str(account_id)): broker_symbol }
    _reverse_cache = None   # { (broker_symbol.upper(), str(account_id)): main_symbol }
    _all_rows_cache = None  # list of all mapping dicts
    _lock = threading.RLock()

    @classmethod
    def _ensure_cache_loaded(cls, force: bool = False):
        with cls._lock:
            if cls._mappings_cache is None or force:
                cls.init_db()
                try:
                    rows = SQLHandler.execute_query("SELECT id, main_symbol, account_id, broker_symbol FROM symbol_mappings")
                    map_c = {}
                    rev_c = {}
                    if isinstance(rows, list):
                        for r in rows:
                            m_sym = str(r.get('main_symbol', '')).upper().strip()
                            acc_id = str(r.get('account_id', '')).strip()
                            b_sym = str(r.get('broker_symbol', '')).strip()
                            map_c[(m_sym, acc_id)] = b_sym
                            rev_c[(b_sym.upper(), acc_id)] = m_sym
                        cls._all_rows_cache = [dict(r) for r in rows]
                    else:
                        cls._all_rows_cache = []
                    cls._mappings_cache = map_c
                    cls._reverse_cache = rev_c
                except Exception as e:
                    print(f"Error loading symbol mappings cache from DB: {e}", flush=True)
                    if cls._mappings_cache is None:
                        cls._mappings_cache = {}
                        cls._reverse_cache = {}
                        cls._all_rows_cache = []

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

    @classmethod
    def get_all_mappings(cls) -> list:
        cls._ensure_cache_loaded()
        with cls._lock:
            return list(cls._all_rows_cache) if cls._all_rows_cache is not None else []

    @classmethod
    def add_mapping(cls, main_symbol: str, account_id: str, broker_symbol: str) -> bool:
        cls.init_db()
        m_sym = main_symbol.upper().strip()
        acc_id = str(account_id).strip()
        b_sym = broker_symbol.strip()
        query = """
        INSERT INTO symbol_mappings (main_symbol, account_id, broker_symbol)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE broker_symbol = VALUES(broker_symbol)
        """
        try:
            SQLHandler.execute_query(query, (m_sym, acc_id, b_sym))
            cls._ensure_cache_loaded(force=True)
            return True
        except Exception as e:
            print(f"Error saving symbol mapping: {e}", flush=True)
            return False

    @classmethod
    def delete_mapping(cls, mapping_id: int) -> bool:
        cls.init_db()
        try:
            SQLHandler.execute_query("DELETE FROM symbol_mappings WHERE id = %s", (mapping_id,))
            cls._ensure_cache_loaded(force=True)
            return True
        except Exception as e:
            print(f"Error deleting symbol mapping: {e}", flush=True)
            return False

    @classmethod
    def has_mapping(cls, main_symbol: str, account_id: str) -> bool:
        if not main_symbol or not account_id:
            return False
        cls._ensure_cache_loaded()
        sym_upper = main_symbol.upper().strip()
        acc_str = str(account_id).strip()
        with cls._lock:
            if (sym_upper, acc_str) in cls._mappings_cache:
                return True
            if (sym_upper, acc_str) in cls._reverse_cache:
                return True
            # Check if sym_upper is a broker symbol in any account that maps to a main symbol configured for this account
            if cls._reverse_cache:
                for (b_sym, _), m_sym in cls._reverse_cache.items():
                    if b_sym == sym_upper and (m_sym, acc_str) in cls._mappings_cache:
                        return True
            return False

    _unmapped_log_tracker = {}

    @classmethod
    def map_to_broker(cls, main_symbol: str, account_id: str) -> str:
        if not main_symbol:
            return None
        if not account_id or str(account_id).strip().lower() in ('none', 'null', 'undefined', ''):
            return main_symbol

        cls._ensure_cache_loaded()
        sym_upper = main_symbol.upper().strip()
        acc_str = str(account_id).strip()
        key = (sym_upper, acc_str)
        with cls._lock:
            # 1. Direct forward mapping: (main_symbol, account_id) -> broker_symbol
            if key in cls._mappings_cache:
                return cls._mappings_cache[key]

            # 2. Already the target broker symbol for this account: (broker_symbol, account_id) -> main_symbol
            if key in cls._reverse_cache:
                return main_symbol

            # 3. Backtrack: main_symbol might be a broker_symbol from another account.
            # Resolve to root master symbol first, then map to this target account's broker_symbol.
            if cls._reverse_cache:
                for (b_sym, _), m_sym in cls._reverse_cache.items():
                    if b_sym == sym_upper:
                        target_key = (m_sym, acc_str)
                        if target_key in cls._mappings_cache:
                            return cls._mappings_cache[target_key]

        # Log unmapped symbol notice (throttled to once every 30s per symbol/account pair)
        import time
        now = time.time()
        last_logged = cls._unmapped_log_tracker.get(key, 0)
        if now - last_logged > 30:
            cls._unmapped_log_tracker[key] = now
            print(f"[SymbolMapping] ⚠️ [UNMAPPED SYMBOL] Account '{account_id}' has NO symbol mapping for '{main_symbol}'. Call will be skipped.", flush=True)

        return None

    @classmethod
    def map_to_main(cls, broker_symbol: str, account_id: str) -> str:
        if not broker_symbol:
            return broker_symbol
        if not account_id or str(account_id).strip().lower() in ('none', 'null', 'undefined', ''):
            return broker_symbol

        cls._ensure_cache_loaded()
        sym_upper = broker_symbol.upper().strip()
        acc_str = str(account_id).strip()
        key = (sym_upper, acc_str)
        with cls._lock:
            if key in cls._reverse_cache:
                return cls._reverse_cache[key]

            # If it's already a main_symbol in mappings for this or any account, return as is
            if key in cls._mappings_cache:
                return cls._mappings_cache[key]
            if cls._mappings_cache:
                for (m_sym, _), _ in cls._mappings_cache.items():
                    if m_sym == sym_upper:
                        return broker_symbol

            # Backtrack check: check if it matches broker_symbol from any other account
            if cls._reverse_cache:
                for (b_sym, _), m_sym in cls._reverse_cache.items():
                    if b_sym == sym_upper:
                        return m_sym
        return broker_symbol

    _broker_symbols_cache = {}
    _cache_timestamp = 0
    _is_refreshing = False
    _CACHE_TTL_SECONDS = 300  # Cache for 5 minutes

    @classmethod
    def get_connected_brokers_cached(cls, force: bool = False) -> list:
        import time
        import threading
        now = time.time()

        # If cache is valid and not force-requested, return immediately
        if not force and cls._broker_symbols_cache and (now - cls._cache_timestamp < cls._CACHE_TTL_SECONDS):
            return list(cls._broker_symbols_cache.values())

        def _refresh_symbols():
            if cls._is_refreshing:
                return
            cls._is_refreshing = True
            try:
                from account_handler import AccountHandler
                from broker_handler import BrokerHandler

                accounts = AccountHandler.get_accounts() or []
                updated_cache = {}

                for acc in accounts:
                    acc_id = str(acc.get("account_id"))
                    b_type = acc.get("broker_type", "metatrader")
                    b_name = acc.get("name", f"Account #{acc_id}")

                    symbols = []
                    try:
                        raw_syms = BrokerHandler.get_symbols(broker_name=b_type, account_id=acc_id)
                        if isinstance(raw_syms, list):
                            symbols = raw_syms
                        elif isinstance(raw_syms, dict):
                            if 'symbols' in raw_syms and isinstance(raw_syms['symbols'], list):
                                symbols = raw_syms['symbols']
                            elif 'data' in raw_syms and isinstance(raw_syms['data'], list):
                                symbols = raw_syms['data']
                    except Exception as e:
                        print(f"Error refreshing symbols from broker for account {acc_id} ({b_type}): {e}", flush=True)

                    updated_cache[acc_id] = {
                        "account_id": acc_id,
                        "broker_type": b_type,
                        "name": b_name,
                        "symbols": symbols
                    }

                cls._broker_symbols_cache = updated_cache
                cls._cache_timestamp = time.time()
            finally:
                cls._is_refreshing = False

        if not cls._broker_symbols_cache or force:
            # First load or forced refresh: do synchronously or return existing while triggering background thread
            if cls._broker_symbols_cache:
                threading.Thread(target=_refresh_symbols, daemon=True).start()
                return list(cls._broker_symbols_cache.values())
            else:
                _refresh_symbols()
                return list(cls._broker_symbols_cache.values())
        else:
            # Return current in-memory cache and asynchronously refresh in background
            threading.Thread(target=_refresh_symbols, daemon=True).start()
            return list(cls._broker_symbols_cache.values())


