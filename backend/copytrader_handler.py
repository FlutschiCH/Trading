import json
import time
import socket
import threading
from sql_handler import SQLHandler
from metatrader_handler import MetaTraderHandler
from ctrader_handler import CTraderHandler
from account_handler import AccountHandler
from logger_handler import logPrint

class CopytraderHandler:
    _db_initialized = False
    _sync_thread = None
    _is_running = False
    _lock = threading.Lock()

    @staticmethod
    def init_db():
        if CopytraderHandler._db_initialized:
            return
        
        create_config_mysql = """
        CREATE TABLE IF NOT EXISTS copytrader_configs (
            id VARCHAR(100) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            status VARCHAR(50) DEFAULT 'active',
            target_computer VARCHAR(100) DEFAULT 'All',
            master_account VARCHAR(100) NOT NULL,
            master_broker VARCHAR(50) NOT NULL,
            slaves_json LONGTEXT NOT NULL,
            updated_at VARCHAR(50) NOT NULL
        )
        """
        create_mapping_mysql = """
        CREATE TABLE IF NOT EXISTS copytrader_mappings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            config_id VARCHAR(100) NOT NULL,
            master_ticket VARCHAR(100) NOT NULL,
            slave_account VARCHAR(100) NOT NULL,
            slave_ticket VARCHAR(100) NOT NULL,
            symbol VARCHAR(50) NOT NULL,
            action VARCHAR(20) NOT NULL,
            lots FLOAT NOT NULL,
            status VARCHAR(20) DEFAULT 'open',
            created_at VARCHAR(50) NOT NULL,
            UNIQUE KEY unique_master_slave_ticket (config_id, master_ticket, slave_account)
        )
        """

        create_config_sqlite = """
        CREATE TABLE IF NOT EXISTS copytrader_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            target_computer TEXT DEFAULT 'All',
            master_account TEXT NOT NULL,
            master_broker TEXT NOT NULL,
            slaves_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
        create_mapping_sqlite = """
        CREATE TABLE IF NOT EXISTS copytrader_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id TEXT NOT NULL,
            master_ticket TEXT NOT NULL,
            slave_account TEXT NOT NULL,
            slave_ticket TEXT NOT NULL,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            lots REAL NOT NULL,
            status TEXT DEFAULT 'open',
            created_at TEXT NOT NULL,
            UNIQUE(config_id, master_ticket, slave_account)
        )
        """
        
        try:
            SQLHandler.execute_query(create_config_mysql)
            SQLHandler.execute_query(create_mapping_mysql)
        except Exception:
            try:
                SQLHandler.execute_query(create_config_sqlite)
                SQLHandler.execute_query(create_mapping_sqlite)
            except Exception as e:
                logPrint(f"[Copytrader DB Init Error]: {e}")

        CopytraderHandler._db_initialized = True

    @staticmethod
    def get_all_configs():
        CopytraderHandler.init_db()
        query = "SELECT id, name, status, target_computer, master_account, master_broker, slaves_json, updated_at FROM copytrader_configs"
        rows = SQLHandler.execute_query(query) or []
        configs = []
        for r in rows:
            if isinstance(r, dict):
                slaves_raw = r.get("slaves_json", "[]")
                try:
                    slaves = json.loads(slaves_raw) if isinstance(slaves_raw, str) else slaves_raw
                except:
                    slaves = []
                configs.append({
                    "id": r.get("id"),
                    "name": r.get("name"),
                    "status": r.get("status"),
                    "target_computer": r.get("target_computer"),
                    "master_account": r.get("master_account"),
                    "master_broker": r.get("master_broker"),
                    "slaves": slaves,
                    "updated_at": r.get("updated_at")
                })
            elif isinstance(r, (list, tuple)) and len(r) >= 8:
                try:
                    slaves = json.loads(r[6]) if isinstance(r[6], str) else r[6]
                except:
                    slaves = []
                configs.append({
                    "id": str(r[0]),
                    "name": str(r[1]),
                    "status": str(r[2]),
                    "target_computer": str(r[3]),
                    "master_account": str(r[4]),
                    "master_broker": str(r[5]),
                    "slaves": slaves,
                    "updated_at": str(r[7])
                })
        return configs

    @staticmethod
    def save_config(config: dict) -> bool:
        CopytraderHandler.init_db()
        cfg_id = config.get("id") or f"copytrader_{int(time.time()*1000)}"
        name = config.get("name", "Copytrader Setup")
        status = config.get("status", "active")
        target_computer = config.get("target_computer", "All")
        master_account = config.get("master_account", "")
        master_broker = config.get("master_broker", "metatrader")
        slaves = config.get("slaves", [])
        slaves_json = json.dumps(slaves)
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S")

        query = """
        INSERT INTO copytrader_configs (id, name, status, target_computer, master_account, master_broker, slaves_json, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            status = VALUES(status),
            target_computer = VALUES(target_computer),
            master_account = VALUES(master_account),
            master_broker = VALUES(master_broker),
            slaves_json = VALUES(slaves_json),
            updated_at = VALUES(updated_at)
        """
        params = (cfg_id, name, status, target_computer, master_account, master_broker, slaves_json, updated_at)
        res = SQLHandler.execute_query(query, params)
        if res is None:
            query_sqlite = """
            INSERT OR REPLACE INTO copytrader_configs (id, name, status, target_computer, master_account, master_broker, slaves_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """
            SQLHandler.execute_query(query_sqlite, params)
        return True

    @staticmethod
    def delete_config(config_id: str) -> bool:
        CopytraderHandler.init_db()
        query = "DELETE FROM copytrader_configs WHERE id = %s"
        res = SQLHandler.execute_query(query, (config_id,))
        if res is None:
            SQLHandler.execute_query("DELETE FROM copytrader_configs WHERE id = ?", (config_id,))
        return True

    @staticmethod
    def start():
        if CopytraderHandler._is_running:
            return
        CopytraderHandler._is_running = True
        CopytraderHandler._sync_thread = threading.Thread(target=CopytraderHandler._sync_loop, daemon=True)
        CopytraderHandler._sync_thread.start()

        # Log & notify engine startup status
        try:
            current_host = socket.gethostname()
            configs = CopytraderHandler.get_all_configs()
            active_configs = []
            total_slaves = 0

            for cfg in configs:
                if cfg.get("status") != "active":
                    continue
                target_comp = cfg.get("target_computer", "All")
                if target_comp != "All" and target_comp.lower() != current_host.lower():
                    continue
                active_configs.append(cfg)
                slaves = cfg.get("slaves", [])
                active_slaves = [s for s in slaves if s.get("status") != "paused"]
                total_slaves += len(active_slaves)

            config_count = len(active_configs)
            summary_msg = (
                f"\n[Copytrader Engine] 🚀 Starting Copytrader Engine:\n"
                f"   • Active Configurations Found: {config_count}\n"
                f"   • Total Active Slaves Connected: {total_slaves}\n"
                f"   • Host Machine: {current_host}\n"
            )
            print(summary_msg, flush=True)
            logPrint(f"[Copytrader Engine] Background monitor started ({config_count} active configs, {total_slaves} active slaves).")
        except Exception as e:
            logPrint(f"[Copytrader Engine] Error building start message: {e}")

    @staticmethod
    def _get_account_positions(account_id: str, broker: str):
        if broker == "ctrader":
            return CTraderHandler.get_open_positions() or []
        else:
            return MetaTraderHandler.get_open_positions(account_id=account_id) or []

    @staticmethod
    def _execute_order(broker: str, account_id: str, symbol: str, action: str, lots: float, sl: float = 0.0, tp: float = 0.0, comment: str = ""):
        if broker == "ctrader":
            return CTraderHandler.execute_trade(action=action, symbol=symbol, volume=lots, sl=sl, tp=tp, comment=comment)
        else:
            return MetaTraderHandler.execute_trade(action=action, symbol=symbol, volume=lots, sl=sl, tp=tp, comment=comment, account_id=account_id)

    @staticmethod
    def _close_position(broker: str, account_id: str, ticket: str, symbol: str, lots: float):
        if broker == "ctrader":
            return CTraderHandler.close_position(position_id=ticket)
        else:
            return MetaTraderHandler.close_position(ticket=ticket, symbol=symbol, volume=lots, account_id=account_id)

    @staticmethod
    def _get_open_mappings(config_id: str):
        query = "SELECT master_ticket, slave_account, slave_ticket, status FROM copytrader_mappings WHERE config_id = %s AND status = 'open'"
        rows = SQLHandler.execute_query(query, (config_id,)) or []
        mappings = {}
        for r in rows:
            if isinstance(r, dict):
                m_ticket = str(r.get("master_ticket"))
                s_acc = str(r.get("slave_account"))
                s_ticket = str(r.get("slave_ticket"))
            elif isinstance(r, (list, tuple)) and len(r) >= 3:
                m_ticket = str(r[0])
                s_acc = str(r[1])
                s_ticket = str(r[2])
            else:
                continue
            mappings[(m_ticket, s_acc)] = s_ticket
        return mappings

    @staticmethod
    def _record_mapping(config_id: str, master_ticket: str, slave_account: str, slave_ticket: str, symbol: str, action: str, lots: float):
        created_at = time.strftime("%Y-%m-%d %H:%M:%S")
        query = """
        INSERT INTO copytrader_mappings (config_id, master_ticket, slave_account, slave_ticket, symbol, action, lots, status, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'open', %s)
        ON DUPLICATE KEY UPDATE slave_ticket = VALUES(slave_ticket), status = 'open'
        """
        params = (config_id, str(master_ticket), str(slave_account), str(slave_ticket), symbol, action, float(lots), created_at)
        res = SQLHandler.execute_query(query, params)
        if res is None:
            query_sq = """
            INSERT OR REPLACE INTO copytrader_mappings (config_id, master_ticket, slave_account, slave_ticket, symbol, action, lots, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
            """
            SQLHandler.execute_query(query_sq, params)

    @staticmethod
    def _mark_mapping_closed(config_id: str, master_ticket: str, slave_account: str):
        query = "UPDATE copytrader_mappings SET status = 'closed' WHERE config_id = %s AND master_ticket = %s AND slave_account = %s"
        res = SQLHandler.execute_query(query, (config_id, str(master_ticket), str(slave_account)))
        if res is None:
            SQLHandler.execute_query("UPDATE copytrader_mappings SET status = 'closed' WHERE config_id = ? AND master_ticket = ? AND slave_account = ?", (config_id, str(master_ticket), str(slave_account)))

    @staticmethod
    def _sync_loop():
        current_host = socket.gethostname()
        while CopytraderHandler._is_running:
            try:
                configs = CopytraderHandler.get_all_configs()
                for cfg in configs:
                    if cfg.get("status") != "active":
                        continue
                    
                    target_comp = cfg.get("target_computer", "All")
                    if target_comp != "All" and target_comp.lower() != current_host.lower():
                        continue

                    master_acc = cfg.get("master_account")
                    master_broker = cfg.get("master_broker", "metatrader")
                    slaves = cfg.get("slaves", [])
                    config_id = cfg.get("id")

                    if not master_acc or not slaves:
                        continue

                    with CopytraderHandler._lock:
                        master_positions = CopytraderHandler._get_account_positions(master_acc, master_broker)
                        existing_mappings = CopytraderHandler._get_open_mappings(config_id)

                        master_open_tickets = set()
                        for pos in master_positions:
                            m_ticket = str(pos.get("ticket") or pos.get("id") or pos.get("position_id", ""))
                            if not m_ticket:
                                continue
                            master_open_tickets.add(m_ticket)

                            symbol = pos.get("symbol", "BTCUSD")
                            pos_type = str(pos.get("type", "")).lower()
                            action = "BUY" if ("buy" in pos_type or pos_type == "0") else "SELL"
                            master_lots = float(pos.get("volume") or pos.get("lots") or pos.get("size") or 0.01)
                            sl = float(pos.get("sl") or 0.0)
                            tp = float(pos.get("tp") or 0.0)

                            for slave in slaves:
                                if slave.get("status") == "paused":
                                    continue
                                slave_acc = str(slave.get("account_id"))
                                slave_broker = slave.get("broker", "metatrader")
                                mode = slave.get("mode", "direct") # direct or multiplier
                                multiplier = float(slave.get("multiplier", 1.0))

                                if mode == "multiplier":
                                    slave_lots = round(master_lots * multiplier, 2)
                                else:
                                    slave_lots = master_lots
                                slave_lots = max(0.01, slave_lots)

                                # Check if trade is already copied
                                key = (m_ticket, slave_acc)
                                if key not in existing_mappings:
                                    comment = f"CP_{m_ticket}"
                                    logPrint(f"[Copytrader] Opening trade on slave {slave_acc}: {action} {slave_lots} {symbol} (Comment: {comment})")
                                    res = CopytraderHandler._execute_order(
                                        broker=slave_broker,
                                        account_id=slave_acc,
                                        symbol=symbol,
                                        action=action,
                                        lots=slave_lots,
                                        sl=sl,
                                        tp=tp,
                                        comment=comment
                                    )
                                    if res and res.get("status") == "success":
                                        slave_ticket = str(res.get("ticket") or res.get("position_id") or f"slv_{int(time.time())}")
                                        CopytraderHandler._record_mapping(config_id, m_ticket, slave_acc, slave_ticket, symbol, action, slave_lots)
                                        existing_mappings[key] = slave_ticket

                        # Handle position closures: If master ticket closed, close corresponding slave position
                        for (m_ticket, s_acc), s_ticket in list(existing_mappings.items()):
                            if m_ticket not in master_open_tickets:
                                slave_config = next((s for s in slaves if str(s.get("account_id")) == s_acc), None)
                                slave_broker = slave_config.get("broker", "metatrader") if slave_config else "metatrader"
                                logPrint(f"[Copytrader] Master ticket {m_ticket} closed. Closing slave position {s_ticket} on account {s_acc}")
                                CopytraderHandler._close_position(slave_broker, s_acc, s_ticket, symbol="", lots=0.0)
                                CopytraderHandler._mark_mapping_closed(config_id, m_ticket, s_acc)
            except Exception as e:
                logPrint(f"[Copytrader Sync Exception]: {e}")
            
            time.sleep(1.0)
