import socket
from sql_handler import SQLHandler

class ComputerHandler:
    _db_initialized = False

    @staticmethod
    def init_db():
        if ComputerHandler._db_initialized:
            return
        
        create_mysql = """
        CREATE TABLE IF NOT EXISTS computers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            hostname VARCHAR(150),
            status VARCHAR(50) DEFAULT 'active',
            last_seen VARCHAR(50)
        )
        """
        create_sqlite = """
        CREATE TABLE IF NOT EXISTS computers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            hostname TEXT,
            status TEXT DEFAULT 'active',
            last_seen TEXT
        )
        """
        try:
            SQLHandler.execute_query(create_mysql)
        except Exception:
            try:
                SQLHandler.execute_query(create_sqlite)
            except Exception as e:
                print(f"Error initializing computers table: {e}", flush=True)
        
        ComputerHandler._db_initialized = True

    @staticmethod
    def get_computers():
        ComputerHandler.init_db()
        try:
            rows = SQLHandler.execute_query("SELECT * FROM computers")
            if rows:
                return rows
        except Exception as e:
            print(f"Error fetching computers: {e}", flush=True)

        hostname = socket.gethostname()
        return [{"id": "1", "name": hostname, "hostname": hostname, "status": "active"}]
