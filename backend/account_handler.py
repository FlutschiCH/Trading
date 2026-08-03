import time
from sql_handler import SQLHandler

class AccountHandler:
    _db_initialized = False

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
        
        AccountHandler._db_initialized = True

    @staticmethod
    def _provision_account_folders(account_id):
        import os
        import shutil
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        mt5_dir = os.path.join(base_dir, "mt5")
        
        default_terminal = os.path.join(mt5_dir, "mt5_default")
        default_plugin = os.path.join(mt5_dir, "mt5_plugin_default")
        
        target_terminal = os.path.join(mt5_dir, f"mt5_{account_id}")
        target_plugin = os.path.join(mt5_dir, f"mt5_plugin_{account_id}")
        
        if os.path.exists(default_terminal) and not os.path.exists(target_terminal):
            try:
                shutil.copytree(default_terminal, target_terminal)
            except Exception as e:
                print(f"Error provisioning terminal folder for {account_id}: {e}", flush=True)

        if os.path.exists(default_plugin) and not os.path.exists(target_plugin):
            try:
                shutil.copytree(default_plugin, target_plugin)
            except Exception as e:
                print(f"Error provisioning plugin folder for {account_id}: {e}", flush=True)
                
        terminal_exe = os.path.join(target_terminal, "terminal64.exe")
        return terminal_exe if os.path.exists(terminal_exe) else target_terminal, target_plugin

    @staticmethod
    def get_accounts():
        AccountHandler.init_db()
        return SQLHandler.execute_query("SELECT * FROM accounts ORDER BY name ASC")

    @staticmethod
    def add_account(name, broker_type, account_id, password=None, server=None, terminal_path=None, plugin_path=None):
        AccountHandler.init_db()
        now = str(int(time.time()))
        
        if broker_type == 'metatrader':
            prov_term, prov_plug = AccountHandler._provision_account_folders(account_id)
            if not terminal_path:
                terminal_path = prov_term
            if not plugin_path:
                plugin_path = prov_plug
        
        # Upsert pattern using ON DUPLICATE KEY UPDATE (translated to sqlite automatically)
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
        
        # If this is the first account, make it active
        accounts = AccountHandler.get_accounts()
        if len(accounts) == 1 or not any(acc.get('is_active') for acc in accounts):
            AccountHandler.set_active_account(account_id)

    @staticmethod
    def delete_account(account_id):
        AccountHandler.init_db()
        # Check if the account to delete is active
        active_acc = AccountHandler.get_active_account()
        SQLHandler.execute_query("DELETE FROM accounts WHERE account_id = %s", (account_id,))
        
        # If the deleted account was active, make another one active
        if active_acc and str(active_acc.get('account_id')) == str(account_id):
            remaining = AccountHandler.get_accounts()
            if remaining:
                AccountHandler.set_active_account(remaining[0]['account_id'])

    @staticmethod
    def set_active_account(account_id):
        AccountHandler.init_db()
        # Deactivate all
        SQLHandler.execute_query("UPDATE accounts SET is_active = 0")
        # Activate target
        SQLHandler.execute_query("UPDATE accounts SET is_active = 1 WHERE account_id = %s", (account_id,))

    @staticmethod
    def get_active_account():
        AccountHandler.init_db()
        rows = SQLHandler.execute_query("SELECT * FROM accounts WHERE is_active = 1 LIMIT 1")
        if rows:
            return rows[0]
        # Fallback to the first account if none is set active
        rows = SQLHandler.execute_query("SELECT * FROM accounts LIMIT 1")
        if rows:
            return rows[0]
        return None
