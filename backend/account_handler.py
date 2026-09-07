import time
import threading
from sql_handler import SQLHandler

class AccountHandler:
    _db_initialized = False
    _accounts_cache = None  # {account_id: account_dict}
    _lock = threading.RLock()

    @staticmethod
    def init_db():
        if AccountHandler._db_initialized:
            return
        
        # MySQL table schema
        create_mysql = """
        CREATE TABLE IF NOT EXISTS accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            broker_type VARCHAR(50) NOT NULL,
            account_id VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255),
            server VARCHAR(150),
            terminal_path VARCHAR(255),
            plugin_path VARCHAR(255),
            is_active TINYINT(1) DEFAULT 0,
            updated_at VARCHAR(50) NOT NULL
        )
        """
        
        # SQLite table schema
        create_sqlite = """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            broker_type TEXT NOT NULL,
            account_id TEXT NOT NULL UNIQUE,
            password TEXT,
            server TEXT,
            terminal_path TEXT,
            plugin_path TEXT,
            is_active INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL
        )
        """
        
        try:
            SQLHandler.execute_query(create_mysql)
        except Exception:
            try:
                SQLHandler.execute_query(create_sqlite)
            except Exception as e:
                print(f"Error initializing accounts table: {e}", flush=True)

        # Alter table migrations if columns don't exist yet
        for col_name, col_type in [("terminal_path", "VARCHAR(255)"), ("plugin_path", "VARCHAR(255)")]:
            try:
                SQLHandler.execute_query(f"ALTER TABLE accounts ADD COLUMN {col_name} {col_type}")
            except Exception:
                pass
        
        AccountHandler._db_initialized = True

    @staticmethod
    def _provision_account_folders(account_id):
        import os
        import shutil
        
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(backend_dir)
        mt5_dir = os.path.join(project_root, "mt5")
        
        default_terminal = os.path.join(mt5_dir, "mt5_base")
        default_plugin = os.path.join(mt5_dir, "mt5_plugin_base")
        
        target_terminal = os.path.join(mt5_dir, f"mt5_{account_id}")
        target_plugin = os.path.join(mt5_dir, f"mt5_plugin_{account_id}")
        
        if os.path.exists(default_terminal) and not os.path.exists(target_terminal):
            try:
                shutil.copytree(default_terminal, target_terminal)
            except Exception as e:
                print(f"Error provisioning terminal folder for {account_id}: {e}", flush=True)

        if not os.path.exists(default_plugin) or not any(f.endswith('.pyd') for f in os.listdir(default_plugin) if os.path.isfile(os.path.join(default_plugin, f))):
            try:
                import MetaTrader5
                mt5_pkg_dir = os.path.dirname(MetaTrader5.__file__)
                if os.path.exists(mt5_pkg_dir):
                    os.makedirs(default_plugin, exist_ok=True)
                    for item in os.listdir(mt5_pkg_dir):
                        s = os.path.join(mt5_pkg_dir, item)
                        d = os.path.join(default_plugin, item)
                        if os.path.isfile(s) and not os.path.exists(d):
                            shutil.copy2(s, d)
            except Exception as e:
                print(f"Error initializing mt5_plugin_base template: {e}", flush=True)

        if os.path.exists(default_plugin) and not os.path.exists(target_plugin):
            try:
                shutil.copytree(default_plugin, target_plugin)
            except Exception as e:
                print(f"Error provisioning plugin folder for {account_id}: {e}", flush=True)
                
        terminal_exe = os.path.join(target_terminal, "terminal64.exe")
        return terminal_exe if os.path.exists(terminal_exe) else target_terminal, target_plugin

    @classmethod
    def _ensure_cache_loaded(cls, force: bool = False):
        with cls._lock:
            if cls._accounts_cache is None or force:
                cls.init_db()
                try:
                    rows = SQLHandler.execute_query("SELECT * FROM accounts ORDER BY name ASC")
                    cls._accounts_cache = {str(r['account_id']): dict(r) for r in rows} if isinstance(rows, list) else {}
                except Exception as e:
                    print(f"Error loading accounts cache from DB: {e}", flush=True)
                    if cls._accounts_cache is None:
                        cls._accounts_cache = {}

    @classmethod
    def get_accounts(cls) -> list:
        cls._ensure_cache_loaded()
        with cls._lock:
            return sorted(list(cls._accounts_cache.values()), key=lambda x: str(x.get('name', '')).lower())

    @classmethod
    def get_account_by_id(cls, account_id: str) -> dict:
        cls._ensure_cache_loaded()
        with cls._lock:
            return cls._accounts_cache.get(str(account_id))

    @classmethod
    def add_account(cls, name, broker_type, account_id, password=None, server=None, terminal_path=None, plugin_path=None):
        cls.init_db()
        now = str(int(time.time()))
        
        if broker_type == 'metatrader':
            prov_term, prov_plug = cls._provision_account_folders(account_id)
            if not terminal_path:
                terminal_path = prov_term
            if not plugin_path:
                plugin_path = prov_plug
        
        query = """
        INSERT INTO accounts (name, broker_type, account_id, password, server, terminal_path, plugin_path, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            broker_type = VALUES(broker_type),
            password = VALUES(password),
            server = VALUES(server),
            terminal_path = VALUES(terminal_path),
            plugin_path = VALUES(plugin_path),
            updated_at = VALUES(updated_at)
        """
        SQLHandler.execute_query(query, (name, broker_type, account_id, password, server, terminal_path, plugin_path, now))
        
        cls._ensure_cache_loaded()
        with cls._lock:
            cls._accounts_cache[str(account_id)] = {
                "name": name,
                "broker_type": broker_type,
                "account_id": account_id,
                "password": password,
                "server": server,
                "terminal_path": terminal_path,
                "plugin_path": plugin_path,
                "is_active": 0,
                "updated_at": now
            }
            if len(cls._accounts_cache) == 1 or not any(acc.get('is_active') for acc in cls._accounts_cache.values()):
                cls.set_active_account(account_id)

    @classmethod
    def delete_account(cls, account_id):
        cls.init_db()
        active_acc = cls.get_active_account()
        SQLHandler.execute_query("DELETE FROM accounts WHERE account_id = %s", (account_id,))
        
        cls._ensure_cache_loaded()
        with cls._lock:
            cls._accounts_cache.pop(str(account_id), None)
            if active_acc and str(active_acc.get('account_id')) == str(account_id):
                remaining = list(cls._accounts_cache.values())
                if remaining:
                    cls.set_active_account(remaining[0]['account_id'])

    @classmethod
    def set_active_account(cls, account_id):
        cls.init_db()
        SQLHandler.execute_query("UPDATE accounts SET is_active = 0")
        SQLHandler.execute_query("UPDATE accounts SET is_active = 1 WHERE account_id = %s", (account_id,))
        
        cls._ensure_cache_loaded()
        with cls._lock:
            for acc in cls._accounts_cache.values():
                acc['is_active'] = 1 if str(acc.get('account_id')) == str(account_id) else 0

    @classmethod
    def get_active_account(cls, broker_type=None):
        cls._ensure_cache_loaded()
        with cls._lock:
            accounts = list(cls._accounts_cache.values())
            if broker_type:
                for acc in accounts:
                    if acc.get('is_active') and str(acc.get('broker_type', '')).lower() == broker_type.lower():
                        return acc
                for acc in sorted(accounts, key=lambda x: str(x.get('name', '')).lower()):
                    if str(acc.get('broker_type', '')).lower() == broker_type.lower():
                        return acc

            for acc in accounts:
                if acc.get('is_active'):
                    return acc
            if accounts:
                return sorted(accounts, key=lambda x: str(x.get('name', '')).lower())[0]
            return None
