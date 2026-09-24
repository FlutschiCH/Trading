import os
import sys
import json
import time
import socket
import threading
from sql_handler import SQLHandler
from account_handler import AccountHandler
from logger_handler import logPrint

class CopytraderHandler:
    _db_initialized = False
    _sync_thread = None
    _is_running = False
    _lock = threading.RLock()
    _configs_cache = None  # {config_id: config_dict}
    _mappings_cache = None  # { (config_id, master_ticket, slave_account): { ... } }

    @classmethod
    def _ensure_cache_loaded(cls, force: bool = False):
        with cls._lock:
            if cls._configs_cache is None or cls._mappings_cache is None or force:
                cls.init_db()
                # Load configs
                try:
                    query_cfg = "SELECT * FROM copytrader_configs"
                    rows_cfg = SQLHandler.execute_query(query_cfg) or []
                    new_configs = {}
                    for r in rows_cfg:
                        if isinstance(r, dict):
                            slaves_raw = r.get("slaves_json", "[]")
                            try:
                                slaves = json.loads(slaves_raw) if isinstance(slaves_raw, str) else slaves_raw
                            except Exception:
                                slaves = []
                            new_configs[r.get("id")] = {
                                "id": r.get("id"),
                                "name": r.get("name"),
                                "status": r.get("status"),
                                "target_computer": r.get("target_computer") or "All",
                                "symbols": r.get("symbols") or "All",
                                "master_account": r.get("master_account"),
                                "master_broker": r.get("master_broker"),
                                "slaves": slaves,
                                "updated_at": r.get("updated_at")
                            }
                    cls._configs_cache = new_configs
                except Exception as e:
                    print(f"[Copytrader] Error loading configs cache: {e}", flush=True)
                    if cls._configs_cache is None:
                        cls._configs_cache = {}

                # Load open mappings
                try:
                    query_map = "SELECT config_id, master_ticket, slave_account, slave_ticket, symbol, action, lots, status, created_at FROM copytrader_mappings WHERE status = 'open'"
                    rows_map = SQLHandler.execute_query(query_map) or []
                    new_mappings = {}
                    for r in rows_map:
                        if isinstance(r, dict):
                            c_id = str(r.get("config_id"))
                            m_ticket = str(r.get("master_ticket"))
                            s_acc = str(r.get("slave_account"))
                            new_mappings[(c_id, m_ticket, s_acc)] = {
                                "config_id": c_id,
                                "master_ticket": m_ticket,
                                "slave_account": s_acc,
                                "slave_ticket": str(r.get("slave_ticket")),
                                "symbol": r.get("symbol", ""),
                                "action": r.get("action", ""),
                                "lots": float(r.get("lots", 0.01)),
                                "status": "open",
                                "created_at": r.get("created_at")
                            }
                    cls._mappings_cache = new_mappings
                except Exception as e:
                    print(f"[Copytrader] Error loading mappings cache: {e}", flush=True)
                    if cls._mappings_cache is None:
                        cls._mappings_cache = {}

    @classmethod
    def init_db(cls):
        with cls._lock:
            if cls._db_initialized:
                return
            
            create_config_mysql = """
            CREATE TABLE IF NOT EXISTS copytrader_configs (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                target_computer VARCHAR(100) DEFAULT 'All',
                symbols VARCHAR(255) DEFAULT 'All',
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
                symbols TEXT DEFAULT 'All',
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
                try:
                    SQLHandler.execute_query("ALTER TABLE copytrader_configs ADD COLUMN symbols VARCHAR(255) DEFAULT 'All'")
                except Exception:
                    pass
            except Exception:
                try:
                    SQLHandler.execute_query(create_config_sqlite)
                    SQLHandler.execute_query(create_mapping_sqlite)
                    try:
                        SQLHandler.execute_query("ALTER TABLE copytrader_configs ADD COLUMN symbols TEXT DEFAULT 'All'")
                    except Exception:
                        pass
                except Exception as e:
                    logPrint(f"[Copytrader DB Init Error]: {e}")

            cls._db_initialized = True

    @classmethod
    def get_all_configs(cls):
        cls._ensure_cache_loaded()
        with cls._lock:
            return [dict(c) for c in cls._configs_cache.values()]

    @classmethod
    def save_config(cls, config: dict) -> bool:
        cls.init_db()
        cfg_id = config.get("id") or f"copytrader_{int(time.time()*1000)}"
        name = config.get("name", "Copytrader Setup")
        status = config.get("status", "active")
        target_computer = config.get("target_computer", "All")
        raw_symbols = config.get("symbols", "All")
        if isinstance(raw_symbols, list):
            symbols = ", ".join(str(s).strip() for s in raw_symbols if str(s).strip()) or "All"
        else:
            symbols = str(raw_symbols).strip() or "All"

        master_account = config.get("master_account", "")
        master_broker = config.get("master_broker", "metatrader")
        slaves = config.get("slaves", [])
        slaves_json = json.dumps(slaves)
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S")

        # Update in-memory cache instantly
        cls._ensure_cache_loaded()
        with cls._lock:
            cls._configs_cache[cfg_id] = {
                "id": cfg_id,
                "name": name,
                "status": status,
                "target_computer": target_computer,
                "symbols": symbols,
                "master_account": master_account,
                "master_broker": master_broker,
                "slaves": slaves,
                "updated_at": updated_at
            }

        query = """
        INSERT INTO copytrader_configs (id, name, status, target_computer, symbols, master_account, master_broker, slaves_json, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            status = VALUES(status),
            target_computer = VALUES(target_computer),
            symbols = VALUES(symbols),
            master_account = VALUES(master_account),
            master_broker = VALUES(master_broker),
            slaves_json = VALUES(slaves_json),
            updated_at = VALUES(updated_at)
        """
        params = (cfg_id, name, status, target_computer, symbols, master_account, master_broker, slaves_json, updated_at)
        res = SQLHandler.execute_query(query, params)
        if res is None:
            query_sqlite = """
            INSERT OR REPLACE INTO copytrader_configs (id, name, status, target_computer, symbols, master_account, master_broker, slaves_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            SQLHandler.execute_query(query_sqlite, params)
        return True

    @classmethod
    def delete_config(cls, config_id: str) -> bool:
        cls.init_db()
        cls._ensure_cache_loaded()
        with cls._lock:
            cls._configs_cache.pop(config_id, None)
            # Remove associated mappings from memory
            to_remove = [k for k in cls._mappings_cache.keys() if k[0] == config_id]
            for k in to_remove:
                cls._mappings_cache.pop(k, None)

        query = "DELETE FROM copytrader_configs WHERE id = %s"
        res = SQLHandler.execute_query(query, (config_id,))
        if res is None:
            SQLHandler.execute_query("DELETE FROM copytrader_configs WHERE id = ?", (config_id,))
        return True

    @classmethod
    def set_config_status(cls, config_id: str, status: str = "active", persist: bool = False) -> bool:
        """
        Reactivates or pauses a configuration in memory (and optionally persists to DB).
        """
        cls._ensure_cache_loaded()
        with cls._lock:
            if cls._configs_cache and config_id in cls._configs_cache:
                cls._configs_cache[config_id]["status"] = status
                # Also ensure all slaves inside this config are set to active if reactivating
                if status == "active":
                    for s in cls._configs_cache[config_id].get("slaves", []):
                        s["status"] = "active"

                if persist:
                    cfg = cls._configs_cache[config_id]
                    cls.save_config(cfg)
                logPrint(f"[Copytrader] Configuration {config_id} set to '{status}' (persist={persist}).")
                return True
        return False

    @classmethod
    def set_slave_status(cls, config_id: str, slave_account_id: str, status: str = "active", persist: bool = False) -> bool:
        """
        Reactivates or pauses a specific slave account within a configuration.
        """
        cls._ensure_cache_loaded()
        with cls._lock:
            if cls._configs_cache and config_id in cls._configs_cache:
                cfg = cls._configs_cache[config_id]
                # If reactivating slave and config is paused, reactivate config too
                if status == "active" and cfg.get("status") == "paused":
                    cfg["status"] = "active"

                found = False
                for s in cfg.get("slaves", []):
                    if str(s.get("account_id")) == str(slave_account_id):
                        s["status"] = status
                        found = True

                if found:
                    if persist:
                        cls.save_config(cfg)
                    logPrint(f"[Copytrader] Slave {slave_account_id} in config {config_id} set to '{status}' (persist={persist}).")
                    return True
        return False

    @classmethod
    def spawn_worker(cls, quickedit: bool = False):
        """
        Spawns the standalone Copytrader Worker in its own console window.
        """
        import subprocess
        python_exe = sys.executable
        worker_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "copytrader_worker.py")
        cmd = [python_exe, worker_script]
        if quickedit:
            cmd.append("--quickedit")
        else:
            try:
                from system_handler import SystemHandler
                if SystemHandler.get_quick_edit().get('enabled'):
                    cmd.append("--quickedit")
            except Exception:
                pass

        try:
            if sys.platform == "win32":
                CREATE_NEW_CONSOLE = 0x00000010
                proc = subprocess.Popen(
                    cmd,
                    creationflags=CREATE_NEW_CONSOLE,
                    cwd=os.path.dirname(os.path.abspath(__file__))
                )
            else:
                proc = subprocess.Popen(
                    cmd,
                    cwd=os.path.dirname(os.path.abspath(__file__))
                )
            print(f"[Copytrader Engine] Spawned standalone Copytrader Worker (PID: {proc.pid})", flush=True)
            return proc
        except Exception as ex:
            print(f"[Copytrader Engine] Failed to spawn Copytrader Worker: {ex}", flush=True)
            return None

    @classmethod
    def start(cls, as_worker_process: bool = True):
        if as_worker_process:
            return cls.spawn_worker()

        if cls._is_running:
            return
        cls._is_running = True
        cls._sync_thread = threading.Thread(target=cls._sync_loop, daemon=True)
        cls._sync_thread.start()

    @staticmethod
    def _is_symbol_allowed(symbol: str, allowed_symbols) -> bool:
        """
        Checks if a trade symbol matches the allowed symbols filter.
        Default 'All', '*', or empty allows all symbols.
        Supports comma-separated strings or lists.
        """
        if not symbol:
            return False
        if allowed_symbols is None:
            return True
        
        if isinstance(allowed_symbols, str):
            clean_str = allowed_symbols.strip()
            if not clean_str or clean_str.lower() in ("all", "*", "any"):
                return True
            import re
            sym_list = [s.strip().upper() for s in re.split(r'[,;\s/|]+', clean_str) if s.strip()]
        elif isinstance(allowed_symbols, (list, tuple, set)):
            sym_list = [str(s).strip().upper() for s in allowed_symbols if str(s).strip()]
            if not sym_list or any(s in ("ALL", "*", "ANY") for s in sym_list):
                return True
        else:
            return True

        sym_upper = symbol.upper().strip()
        if sym_upper in sym_list:
            return True

        import re
        norm_sym = re.sub(r'[^A-Z0-9]', '', sym_upper)
        for allowed in sym_list:
            norm_allowed = re.sub(r'[^A-Z0-9]', '', allowed)
            if norm_sym == norm_allowed or norm_sym.startswith(norm_allowed) or norm_allowed.startswith(norm_sym):
                return True

        return False

    @staticmethod
    def _ensure_account_connected(account_id: str, broker: str):
        if broker == "ctrader":
            try:
                bal = CTraderHandler.get_balance()
                if not bal:
                    print(f"[Copytrader] Initializing cTrader account {account_id}...", flush=True)
            except Exception as e:
                print(f"[Copytrader] Failed balance check for cTrader account {account_id}: {e}", flush=True)
        else:
            try:
                from broker_handler import BrokerHandler
                BrokerHandler.get_instance(broker, account_id)
            except Exception as e:
                print(f"[Copytrader] Failed connection check for {broker} account {account_id}: {e}", flush=True)

    @staticmethod
    def _get_account_positions(account_id: str, broker: str):
        from broker_handler import BrokerHandler
        return BrokerHandler.get_positions(broker_name=broker, account_id=account_id) or []

    @staticmethod
    def _execute_order(broker: str, account_id: str, symbol: str, action: str, lots: float, sl: float = 0.0, tp: float = 0.0, comment: str = ""):
        from broker_handler import BrokerHandler
        return BrokerHandler.create_order(broker_name=broker, account_id=account_id, symbol=symbol, side=action, volume=lots, stop_loss=sl, take_profit=tp, comment=comment, allow_no_sl=True)

    @staticmethod
    def _close_position(broker: str, account_id: str, ticket: str, symbol: str = "", lots: float = 0.0):
        from broker_handler import BrokerHandler
        pos_id = int(ticket) if (isinstance(ticket, str) and ticket.isdigit()) else ticket
        return BrokerHandler.close_position(broker_name=broker, account_id=account_id, position_id=pos_id, symbol=symbol, side="", volume=lots)

    @staticmethod
    def _modify_position(broker: str, account_id: str, ticket: str, symbol: str = "", sl: float = 0.0, tp: float = 0.0):
        from broker_handler import BrokerHandler
        pos_id = int(ticket) if (isinstance(ticket, str) and ticket.isdigit()) else ticket
        return BrokerHandler.modify_position(broker_name=broker, account_id=account_id, position_id=pos_id, symbol=symbol, stop_loss=sl, take_profit=tp)

    @classmethod
    def _get_open_mappings(cls, config_id: str):
        cls._ensure_cache_loaded()
        with cls._lock:
            return { (k[1], k[2]): v["slave_ticket"] for k, v in cls._mappings_cache.items() if k[0] == config_id and v.get("status") == "open" }

    @classmethod
    def _record_mapping(cls, config_id: str, master_ticket: str, slave_account: str, slave_ticket: str, symbol: str, action: str, lots: float):
        created_at = time.strftime("%Y-%m-%d %H:%M:%S")
        key = (str(config_id), str(master_ticket), str(slave_account))
        
        # Update in-memory cache immediately
        cls._ensure_cache_loaded()
        with cls._lock:
            cls._mappings_cache[key] = {
                "config_id": str(config_id),
                "master_ticket": str(master_ticket),
                "slave_account": str(slave_account),
                "slave_ticket": str(slave_ticket),
                "symbol": symbol,
                "action": action,
                "lots": float(lots),
                "status": "open",
                "created_at": created_at
            }

        # Write through to DB
        query = """
        INSERT INTO copytrader_mappings (config_id, master_ticket, slave_account, slave_ticket, symbol, action, lots, status, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'open', %s)
        ON DUPLICATE KEY UPDATE slave_ticket = VALUES(slave_ticket), status = 'open'
        """
        params = (config_id, str(master_ticket), str(slave_account), str(slave_ticket), symbol, action, float(lots), created_at)
        try:
            res = SQLHandler.execute_query(query, params)
            if res is None:
                query_sq = """
                INSERT OR REPLACE INTO copytrader_mappings (config_id, master_ticket, slave_account, slave_ticket, symbol, action, lots, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
                """
                SQLHandler.execute_query(query_sq, params)
        except Exception as e:
            print(f"[Copytrader] Error recording mapping to DB: {e}", flush=True)

    @classmethod
    def _mark_mapping_closed(cls, config_id: str, master_ticket: str, slave_account: str):
        key = (str(config_id), str(master_ticket), str(slave_account))
        cls._ensure_cache_loaded()
        with cls._lock:
            if key in cls._mappings_cache:
                cls._mappings_cache.pop(key, None)

        query = "UPDATE copytrader_mappings SET status = 'closed' WHERE config_id = %s AND master_ticket = %s AND slave_account = %s"
        try:
            res = SQLHandler.execute_query(query, (config_id, str(master_ticket), str(slave_account)))
            if res is None:
                SQLHandler.execute_query("UPDATE copytrader_mappings SET status = 'closed' WHERE config_id = ? AND master_ticket = ? AND slave_account = ?", (config_id, str(master_ticket), str(slave_account)))
        except Exception as e:
            print(f"[Copytrader] Error marking mapping closed in DB: {e}", flush=True)

    @staticmethod
    def _are_symbols_matching(master_symbol: str, slave_symbol: str, slave_account_id: str = None) -> bool:
        if not master_symbol or not slave_symbol:
            return False
        m_upper = master_symbol.strip().upper()
        s_upper = slave_symbol.strip().upper()
        if m_upper == s_upper:
            return True

        try:
            from symbol_mapping_handler import SymbolMappingHandler
            mapped = SymbolMappingHandler.map_to_broker(m_upper, slave_account_id)
            if mapped and mapped.upper().strip() == s_upper:
                return True
        except Exception:
            pass

        import re
        norm_m = re.sub(r'[^A-Z0-9]', '', m_upper)
        norm_s = re.sub(r'[^A-Z0-9]', '', s_upper)
        if norm_m == norm_s:
            return True
        if norm_m.startswith(norm_s) or norm_s.startswith(norm_m):
            return True
        base_m = norm_m.replace('USDT', '').replace('USD', '')
        base_s = norm_s.replace('USDT', '').replace('USD', '')
        if base_m and base_s and base_m == base_s:
            return True

        return False

    @staticmethod
    def _calculate_lots(
        master_lots: float,
        mode: str,
        multiplier: float,
        entry_price: float = 0.0,
        sl: float = 0.0,
        direction: str = 'BUY',
        slave_account: str = None,
        slave_broker: str = 'metatrader',
        symbol: str = ''
    ) -> float:
        mode_lower = str(mode or 'direct').strip().lower()
        if mode_lower in ('fixed_amount', 'amount', '$', 'fixed_dollar', 'dollar'):
            dollar_risk = multiplier if multiplier > 0 else 50.0
            if entry_price > 0 and sl > 0 and abs(entry_price - sl) > 1e-6:
                try:
                    from backtest_helpers import get_lot_size
                    from symbol_mapping_handler import SymbolMappingHandler
                    from trading_handler import TradingHandler

                    mapped_symbol = SymbolMappingHandler.map_to_broker(symbol, slave_account) if slave_account else symbol
                    lot_size = get_lot_size(mapped_symbol or symbol)
                    sl_dist = abs(entry_price - sl)

                    return TradingHandler.calculate_lot_size(
                        balance=10000.0,
                        risk_amount=dollar_risk,
                        sl_distance=sl_dist,
                        lot_size=lot_size
                    )
                except Exception as calc_err:
                    print(f"[Copytrader] Fixed $ amount sizing error ({calc_err}), falling back to direct lots: {master_lots}", flush=True)
            return max(0.01, master_lots)
        elif mode_lower in ('percent', 'risk_pct', 'pct', '%'):
            pct_val = multiplier if multiplier > 0 else 1.0
            if entry_price > 0 and sl > 0 and abs(entry_price - sl) > 1e-6:
                try:
                    from broker_handler import BrokerHandler
                    from backtest_helpers import get_lot_size
                    from symbol_mapping_handler import SymbolMappingHandler
                    from trading_handler import TradingHandler

                    mapped_symbol = SymbolMappingHandler.map_to_broker(symbol, slave_account) if slave_account else symbol
                    lot_size = get_lot_size(mapped_symbol or symbol)
                    sl_dist = abs(entry_price - sl)

                    # Retrieve live slave account balance
                    acct_info = BrokerHandler.get_account_info(broker_name=slave_broker, account_id=slave_account)
                    balance = 10000.0
                    if acct_info:
                        if "data" in acct_info and isinstance(acct_info["data"], dict):
                            balance = float(acct_info["data"].get("balance") or balance)
                        elif isinstance(acct_info, dict):
                            balance = float(acct_info.get("balance") or balance)

                    calculated_lots = TradingHandler.calculate_lot_size(
                        balance=balance,
                        risk_pct=pct_val,
                        sl_distance=sl_dist,
                        lot_size=lot_size
                    )
                    risk_amount = balance * (pct_val / 100.0)
                    print(
                        f"[Copytrader Sizing: % Risk] Slave: {slave_broker.upper()} ({slave_account}) | "
                        f"Balance: ${balance:.2f} | Risk: {pct_val}% (${risk_amount:.2f}) | "
                        f"Entry: {entry_price} | SL: {sl} (Distance: {sl_dist:.2f}) | "
                        f"Contract/Lot Size: {lot_size} | Sized Lots: {calculated_lots}",
                        flush=True
                    )
                    return calculated_lots
                except Exception as calc_err:
                    print(f"[Copytrader] Risk percentage sizing error ({calc_err}), falling back to direct lots: {master_lots}", flush=True)
            # Fallback if SL is not provided on master order: scale master lots by percentage / 100
            lots = round(master_lots * (pct_val / 100.0), 2)
            final_lots = max(0.01, lots)
            print(f"[Copytrader Sizing: % Direct Scale (No SL)] Master Lots: {master_lots} x ({pct_val}%) => {final_lots}", flush=True)
            return final_lots
        elif mode_lower == "multiplier":
            lots = max(0.01, round(master_lots * multiplier, 2))
            print(f"[Copytrader Sizing: Multiplier] Master Lots: {master_lots} x {multiplier} => {lots}", flush=True)
            return lots
        elif mode_lower == "divider":
            div_val = multiplier if multiplier > 0 else 1.0
            lots = max(0.01, round(master_lots / div_val, 2))
            print(f"[Copytrader Sizing: Divider] Master Lots: {master_lots} / {div_val} => {lots}", flush=True)
            return lots
        else:
            lots = max(0.01, master_lots)
            print(f"[Copytrader Sizing: Direct] Master Lots: {master_lots} => {lots}", flush=True)
            return lots

    @classmethod
    def sync_once(cls):
        current_host = socket.gethostname().strip().lower()
        try:
            configs = cls.get_all_configs()
            for cfg in configs:
                if cfg.get("status") != "active":
                    continue
                
                cfg_id = cfg.get("id")
                cfg_name = cfg.get("name") or "Unnamed Config"
                target_comp = str(cfg.get("target_computer", "All")).strip().lower()
                if target_comp != "all" and target_comp != current_host:
                    continue

                master_acc = cfg.get("master_account")
                master_broker = cfg.get("master_broker", "metatrader")
                slaves = cfg.get("slaves", [])
                cfg_symbols = cfg.get("symbols", "All")

                if not master_acc or not slaves:
                    continue

                with cls._lock:
                    # 1. Fetch live master positions and filter by config symbols
                    raw_master_positions = cls._get_account_positions(master_acc, master_broker) or []
                    master_positions = []
                    for m_pos in raw_master_positions:
                        sym = m_pos.get("symbol", "")
                        if cls._is_symbol_allowed(sym, cfg_symbols):
                            master_positions.append(m_pos)

                    # 2. Synchronize directly with each active slave account
                    for slave in slaves:
                        if slave.get("status") == "paused":
                            continue

                        slave_acc = str(slave.get("account_id"))
                        slave_broker = slave.get("broker", "metatrader")
                        slave_symbols = slave.get("symbols", "All")
                        mode = slave.get("mode", "direct")
                        multiplier = float(slave.get("multiplier", 1.0))

                        # Fetch current live positions on slave
                        slave_positions = cls._get_account_positions(slave_acc, slave_broker) or []
                        unmatched_slaves = list(slave_positions)

                        # Filter master positions for this specific slave's symbol rules
                        slave_target_master_positions = [
                            p for p in master_positions if cls._is_symbol_allowed(p.get("symbol", ""), slave_symbols)
                        ]

                        # A) For each master open position, ensure it exists on slave
                        for m_pos in slave_target_master_positions:
                            m_sym = m_pos.get("symbol", "")
                            # Master trade side is explicitly "trade_side" (SELL or BUY)
                            m_side = str(m_pos.get("trade_side") or m_pos.get("side") or "").strip().upper()
                            if m_side not in ("BUY", "SELL"):
                                m_side = "BUY" if str(m_pos.get("type")) == "0" else "SELL"

                            m_lots = float(m_pos.get("volume") or m_pos.get("lots") or m_pos.get("size") or 0.01)
                            sl = float(m_pos.get("stop_loss") or m_pos.get("sl") or 0.0)
                            tp = float(m_pos.get("take_profit") or m_pos.get("tp") or 0.0)

                            # Look for matching open position on slave
                            match_idx = -1
                            for idx_s, s_pos in enumerate(unmatched_slaves):
                                s_sym = str(s_pos.get("symbol", ""))
                                s_side = str(s_pos.get("trade_side") or s_pos.get("side") or "").strip().upper()
                                if s_side not in ("BUY", "SELL"):
                                    amt = float(s_pos.get("positionAmt") or 0)
                                    if amt != 0:
                                        s_side = "BUY" if amt > 0 else "SELL"
                                    else:
                                        s_side = "BUY" if str(s_pos.get("type")) == "0" else "SELL"
                                
                                if s_side == m_side and cls._are_symbols_matching(m_sym, s_sym, slave_acc):
                                    match_idx = idx_s
                                    break

                            if match_idx >= 0:
                                # Position already open on slave -> Retain and sync SL / TP if changed
                                matched_s_pos = unmatched_slaves.pop(match_idx)
                                if sl > 0 or tp > 0:
                                    s_ticket = str(matched_s_pos.get("position_id") or matched_s_pos.get("ticket") or matched_s_pos.get("id") or "")
                                    curr_sl = float(matched_s_pos.get("stop_loss") or matched_s_pos.get("sl") or 0.0)
                                    curr_tp = float(matched_s_pos.get("take_profit") or matched_s_pos.get("tp") or 0.0)

                                    # Normalize target SL and TP to match broker precision formatting
                                    formatted_target_sl = sl
                                    formatted_target_tp = tp
                                    if "binance" in str(slave_broker).lower():
                                        from binance_handler import BinanceFuturesHandler
                                        mapped_b_sym = BinanceFuturesHandler.validate_and_format_symbol(m_sym)
                                        if mapped_b_sym:
                                            if sl > 0:
                                                formatted_target_sl = BinanceFuturesHandler._format_price(mapped_b_sym, sl)
                                            if tp > 0:
                                                formatted_target_tp = BinanceFuturesHandler._format_price(mapped_b_sym, tp)

                                    needs_sl_mod = sl > 0 and abs(curr_sl - formatted_target_sl) > 1e-4
                                    needs_tp_mod = tp > 0 and abs(curr_tp - formatted_target_tp) > 1e-4

                                    if needs_sl_mod or needs_tp_mod:
                                        cls._modify_position(slave_broker, slave_acc, s_ticket, m_sym, formatted_target_sl, formatted_target_tp)
                            else:
                                # Position missing on slave -> OPEN IT!
                                m_open_price = float(m_pos.get("entry_price") or m_pos.get("open_price") or m_pos.get("price") or 0.0)
                                slave_lots = cls._calculate_lots(
                                    master_lots=m_lots,
                                    mode=mode,
                                    multiplier=multiplier,
                                    entry_price=m_open_price,
                                    sl=sl,
                                    direction=m_side,
                                    slave_account=slave_acc,
                                    slave_broker=slave_broker,
                                    symbol=m_sym
                                )
                                print(f"[Copytrader Sync] Master has {m_side} {m_lots} {m_sym} -> Not on slave {slave_acc} ({slave_broker}) -> Opening {m_side} {slave_lots} {m_sym} (Mode: {mode})", flush=True)
                                logPrint(f"[Copytrader] Opening trade on slave {slave_acc} ({slave_broker}): {m_side} {slave_lots} {m_sym} (Mode: {mode})")
                                
                                res = cls._execute_order(
                                    broker=slave_broker,
                                    account_id=slave_acc,
                                    symbol=m_sym,
                                    action=m_side,
                                    lots=slave_lots,
                                    sl=sl,
                                    tp=tp,
                                    comment=""
                                )
                                print(f"   -> Order Execution Result on {slave_acc}: {res}", flush=True)
                                if isinstance(res, dict) and ("error" in res or res.get("code") == -2019):
                                    err_text = str(res.get("error") or res.get("msg") or res.get("message") or "")
                                    logPrint(f"[Copytrader Error] Failed to open {m_sym} on {slave_acc}: {err_text}")
                                    
                                    # Check for insufficient margin
                                    if "margin is insufficient" in err_text.lower() or res.get("code") == -2019:
                                        # Calculate required margin details
                                        margin_calc_str = ""
                                        try:
                                            from broker_handler import BrokerHandler
                                            acct_data = BrokerHandler.get_account_info(broker_name=slave_broker, account_id=slave_acc)
                                            avail_bal = None
                                            if acct_data:
                                                if isinstance(acct_data.get("data"), dict):
                                                    avail_bal = float(acct_data["data"].get("availableBalance") or acct_data["data"].get("balance") or 0.0)
                                                else:
                                                    avail_bal = float(acct_data.get("availableBalance") or acct_data.get("balance") or 0.0)

                                            ref_price = m_open_price if m_open_price > 0 else 0.0
                                            notional = slave_lots * ref_price if ref_price > 0 else 0.0
                                            
                                            margin_calc_str = (
                                                f"[Margin Details] Slave: {slave_broker.upper()} | "
                                                f"Attempted Qty: {slave_lots} {m_sym} @ ~{ref_price:.2f} (Notional Value: ${notional:.2f}) | "
                                                f"Available Margin/Balance: ${avail_bal:.2f} | "
                                                f"Req Margin: ~${notional:.2f} (1x) / ~${(notional/20.0):.2f} (20x) / ~${(notional/50.0):.2f} (50x)"
                                            )
                                            print(margin_calc_str, flush=True)
                                        except Exception as m_calc_err:
                                            margin_calc_str = f"[Margin Details] Error calculating required margin: {m_calc_err}"
                                            print(margin_calc_str, flush=True)

                                        print(f"[Copytrader Alert] Insufficient margin detected on slave {slave_acc} ({slave_broker}). Pausing setup '{cfg_name}' (ID: {cfg_id}) in memory", flush=True)
                                        logPrint(f"[Copytrader] Insufficient margin on slave {slave_acc}. Pausing copytrader configuration '{cfg_name}' in memory.")
                                        
                                        # Pause slave and config in-memory only (DB remains unchanged so next app restart or manual resume restores it)
                                        slave["status"] = "paused"
                                        with cls._lock:
                                            if cls._configs_cache and cfg_id in cls._configs_cache:
                                                cls._configs_cache[cfg_id]["status"] = "paused"

                                        # Send Discord Notification
                                        try:
                                            from discord_handler import send_discord_message
                                            discord_msg = (
                                                f"⚠️ **Copytrader Paused: Insufficient Margin**\n"
                                                f"🎛️ **Configuration:** `{cfg_name}` (ID: `{cfg_id}`)\n"
                                                f"🏦 **Slave Account:** `{slave_acc}` ({slave_broker.upper()})\n"
                                                f"📊 **Attempted Order:** `{m_side} {slave_lots} {m_sym}`\n"
                                                f"💰 **Margin Info:** `{margin_calc_str}`\n"
                                                f"❌ **Error:** `{err_text or 'Margin is insufficient'}`\n"
                                                f"⏸️ **Action:** Copytrader configuration has been **PAUSED** to prevent spam. Please add funds and restart/resume copytrader."
                                            )
                                            send_discord_message(discord_msg)
                                        except Exception as d_err:
                                            print(f"[Copytrader Alert Error] Failed to send Discord alert: {d_err}", flush=True)
                                        break

                        # B) For any position on slave that NO LONGER EXISTS on master -> CLOSE / DELETE IT!
                        for s_pos in unmatched_slaves:
                            s_sym = str(s_pos.get("symbol", ""))
                            if not cls._is_symbol_allowed(s_sym, slave_symbols) or not cls._is_symbol_allowed(s_sym, cfg_symbols):
                                continue

                            amt = float(s_pos.get("positionAmt") or s_pos.get("volume") or s_pos.get("lots") or 0)
                            s_side = str(s_pos.get("trade_side") or s_pos.get("side") or "").strip().upper()
                            if s_side not in ("BUY", "SELL"):
                                if amt != 0:
                                    s_side = "BUY" if amt > 0 else "SELL"
                                else:
                                    s_side = "BUY" if str(s_pos.get("type")) == "0" else "SELL"
                            s_ticket = str(s_pos.get("position_id") or s_pos.get("ticket") or s_pos.get("id") or "")
                            s_vol = float(s_pos.get("volume") or abs(amt) or s_pos.get("size") or 0.0)

                            print(f"[Copytrader Sync] Master has no open {s_side} {s_sym} -> Closing slave position #{s_ticket} on {slave_acc} ({slave_broker})", flush=True)
                            logPrint(f"[Copytrader] Master position closed. Closing slave position #{s_ticket} ({s_side} {s_vol} {s_sym}) on {slave_acc}")
                            cls._close_position(slave_broker, slave_acc, s_ticket, symbol=s_sym, lots=s_vol)
        except Exception as e:
            logPrint(f"[Copytrader Sync Exception]: {e}")

    @staticmethod
    def _sync_loop():
        while CopytraderHandler._is_running:
            CopytraderHandler.sync_once()
            time.sleep(1.0)


if __name__ == "__main__":
    import tkinter as tk
    from tkinter import ttk, messagebox, scrolledtext

    CopytraderHandler.init_db()

    root = tk.Tk()
    root.title("Copytrader Manual Sync & Diagnostic Panel")
    win_w, win_h = 850, 650
    screen_w = root.winfo_screenwidth()
    screen_h = root.winfo_screenheight()
    pos_x = max(0, (screen_w - win_w) // 2)
    pos_y = max(0, (screen_h - win_h) // 2)
    root.geometry(f"{win_w}x{win_h}+{pos_x}+{pos_y}")
    root.configure(bg="#1e1e2e")

    style = ttk.Style()
    style.theme_use("clam")
    style.configure(".", background="#1e1e2e", foreground="#cdd6f4", font=("Segoe UI", 10))
    style.configure("TLabel", background="#1e1e2e", foreground="#cdd6f4")
    style.configure("TButton", font=("Segoe UI", 10, "bold"), padding=6)
    style.configure("TCombobox", fieldbackground="#313244", background="#45475a", foreground="#ffffff")
    style.map("TButton", background=[("active", "#45475a")])

    configs_list = CopytraderHandler.get_all_configs()
    cfg_map = {f"{c.get('name', 'Setup')} (ID: {c.get('id')})": c for c in configs_list}

    header = tk.Label(root, text="Copytrader Strategy Sync Controller", font=("Segoe UI", 14, "bold"), fg="#89b4fa", bg="#1e1e2e")
    header.pack(pady=10)

    # Strategy Selector Frame
    sel_frame = tk.Frame(root, bg="#1e1e2e")
    sel_frame.pack(fill="x", padx=15, pady=5)

    tk.Label(sel_frame, text="Select Strategy:", font=("Segoe UI", 10, "bold"), fg="#cdd6f4", bg="#1e1e2e").pack(side="left", padx=5)
    cfg_var = tk.StringVar()
    cfg_dropdown = ttk.Combobox(sel_frame, textvariable=cfg_var, values=list(cfg_map.keys()), state="readonly", width=45)
    if cfg_map:
        cfg_dropdown.current(0)
    cfg_dropdown.pack(side="left", padx=5)

    # Output text area
    log_area = scrolledtext.ScrolledText(root, wrap="word", bg="#181825", fg="#a6adc8", font=("Consolas", 10), height=18)
    log_area.pack(fill="both", expand=True, padx=15, pady=10)

    def log_gui(msg: str):
        log_area.insert("end", msg + "\n")
        log_area.see("end")

    def get_current_cfg():
        selected = cfg_var.get()
        return cfg_map.get(selected)

    def refresh_status():
        log_area.delete("1.0", "end")
        cfg = get_current_cfg()
        if not cfg:
            log_gui("[INFO] No configuration selected.")
            return

        m_acc = cfg.get("master_account", "")
        m_broker = str(cfg.get("master_broker", "metatrader")).lower()
        log_gui(f"=== STRATEGY: {cfg.get('name')} (Status: {cfg.get('status')}) ===")
        log_gui(f"Master: {m_broker.upper()} Account: '{m_acc}'")

        m_positions = CopytraderHandler._get_account_positions(m_acc, m_broker) or []
        log_gui(f"Master Open Positions ({len(m_positions)}):")
        for p in m_positions:
            log_gui(f"  -> Symbol: {p.get('symbol')} | Side: {p.get('side') or p.get('trade_side')} | Lots: {p.get('volume') or p.get('positionAmt')} | Entry: {p.get('entry_price') or p.get('open_price') or p.get('price')} | SL: {p.get('stop_loss') or p.get('sl')} | TP: {p.get('take_profit') or p.get('tp')}")

        slaves = cfg.get("slaves", [])
        log_gui(f"\nConfigured Slaves ({len(slaves)}):")
        for s in slaves:
            s_acc = str(s.get("account_id"))
            s_brk = str(s.get("broker", "metatrader")).lower()
            s_mode = s.get("mode", "direct")
            s_mult = s.get("multiplier", 1.0)
            log_gui(f"  • Slave: {s_brk.upper()} Account '{s_acc}' [Mode: {s_mode}, Mult: {s_mult}]")
            s_pos = CopytraderHandler._get_account_positions(s_acc, s_brk) or []
            log_gui(f"    Positions ({len(s_pos)}):")
            for sp in s_pos:
                log_gui(f"      - {sp.get('symbol')} | Side: {sp.get('side') or sp.get('trade_side')} | Lots: {sp.get('volume') or sp.get('positionAmt')} | SL: {sp.get('stop_loss') or sp.get('sl')} | TP: {sp.get('take_profit') or sp.get('tp')}")

    def execute_custom_sync(sync_order=True, sync_sl=True, sync_tp=True):
        cfg = get_current_cfg()
        if not cfg:
            messagebox.showwarning("Warning", "Select a strategy first")
            return

        log_gui("\n" + "=" * 50)
        log_gui(f"[START] Syncing (Order={sync_order}, SL={sync_sl}, TP={sync_tp})...")
        log_gui("=" * 50)

        m_acc = cfg.get("master_account")
        m_broker = cfg.get("master_broker", "metatrader")
        slaves = cfg.get("slaves", [])
        cfg_symbols = cfg.get("symbols", "All")

        master_positions = [
            p for p in (CopytraderHandler._get_account_positions(m_acc, m_broker) or [])
            if CopytraderHandler._is_symbol_allowed(p.get("symbol", ""), cfg_symbols)
        ]

        for slave in slaves:
            s_acc = str(slave.get("account_id"))
            s_brk = slave.get("broker", "metatrader")
            s_syms = slave.get("symbols", "All")
            mode = slave.get("mode", "direct")
            multiplier = float(slave.get("multiplier", 1.0))

            slave_positions = CopytraderHandler._get_account_positions(s_acc, s_brk) or []
            unmatched = list(slave_positions)

            target_m_pos = [p for p in master_positions if CopytraderHandler._is_symbol_allowed(p.get("symbol", ""), s_syms)]

            for m_pos in target_m_pos:
                m_sym = m_pos.get("symbol", "")
                m_side = str(m_pos.get("trade_side") or m_pos.get("side") or "").strip().upper()
                if m_side not in ("BUY", "SELL"):
                    m_side = "BUY" if str(m_pos.get("type")) == "0" else "SELL"

                m_lots = float(m_pos.get("volume") or m_pos.get("lots") or m_pos.get("size") or 0.01)
                sl = float(m_pos.get("stop_loss") or m_pos.get("sl") or 0.0) if sync_sl else 0.0
                tp = float(m_pos.get("take_profit") or m_pos.get("tp") or 0.0) if sync_tp else 0.0
                m_open = float(m_pos.get("entry_price") or m_pos.get("open_price") or m_pos.get("price") or 0.0)

                match_idx = -1
                for idx_s, sp in enumerate(unmatched):
                    s_sym = str(sp.get("symbol", ""))
                    s_side = str(sp.get("trade_side") or sp.get("side") or "").strip().upper()
                    if s_side == m_side and CopytraderHandler._are_symbols_matching(m_sym, s_sym, s_acc):
                        match_idx = idx_s
                        break

                if match_idx >= 0:
                    matched = unmatched.pop(match_idx)
                    s_ticket = str(matched.get("position_id") or matched.get("ticket") or "")
                    curr_sl = float(matched.get("stop_loss") or matched.get("sl") or 0.0)
                    curr_tp = float(matched.get("take_profit") or matched.get("tp") or 0.0)

                    target_sl = sl if sync_sl else curr_sl
                    target_tp = tp if sync_tp else curr_tp

                    if (sync_sl and abs(curr_sl - sl) > 1e-5) or (sync_tp and abs(curr_tp - tp) > 1e-5):
                        log_gui(f"[MODIFY] Updating Position {s_ticket} on {s_acc} -> SL: {target_sl}, TP: {target_tp}")
                        res = CopytraderHandler._modify_position(s_brk, s_acc, s_ticket, m_sym, target_sl, target_tp)
                        log_gui(f"  -> Result: {res}")
                    else:
                        log_gui(f"[SYNC OK] Position {s_ticket} already matches requested parameters.")
                elif sync_order:
                    s_lots = CopytraderHandler._calculate_lots(
                        master_lots=m_lots,
                        mode=mode,
                        multiplier=multiplier,
                        entry_price=m_open,
                        sl=sl,
                        direction=m_side,
                        slave_account=s_acc,
                        slave_broker=s_brk,
                        symbol=m_sym
                    )
                    log_gui(f"[OPEN] Opening {m_side} {s_lots} {m_sym} on {s_acc} ({s_brk}) (SL={sl}, TP={tp})")
                    res = CopytraderHandler._execute_order(
                        broker=s_brk,
                        account_id=s_acc,
                        symbol=m_sym,
                        action=m_side,
                        lots=s_lots,
                        sl=sl,
                        tp=tp
                    )
                    log_gui(f"  -> Result: {res}")

        log_gui("\n[DONE] Action complete.")

    # Action Buttons Frame
    btn_frame = tk.Frame(root, bg="#1e1e2e")
    btn_frame.pack(fill="x", padx=15, pady=8)

    tk.Button(btn_frame, text="🔍 Refresh Status", bg="#89b4fa", fg="#11111b", font=("Segoe UI", 9, "bold"), command=refresh_status, padx=8, pady=4).pack(side="left", padx=4)
    tk.Button(btn_frame, text="🚀 Open Order Only", bg="#a6e3a1", fg="#11111b", font=("Segoe UI", 9, "bold"), command=lambda: execute_custom_sync(sync_order=True, sync_sl=False, sync_tp=False), padx=8, pady=4).pack(side="left", padx=4)
    tk.Button(btn_frame, text="🛑 Sync SL Only", bg="#f38ba8", fg="#11111b", font=("Segoe UI", 9, "bold"), command=lambda: execute_custom_sync(sync_order=False, sync_sl=True, sync_tp=False), padx=8, pady=4).pack(side="left", padx=4)
    tk.Button(btn_frame, text="🎯 Sync TP Only", bg="#fab387", fg="#11111b", font=("Segoe UI", 9, "bold"), command=lambda: execute_custom_sync(sync_order=False, sync_sl=False, sync_tp=True), padx=8, pady=4).pack(side="left", padx=4)
    tk.Button(btn_frame, text="⚡ Full Sync", bg="#cba6f7", fg="#11111b", font=("Segoe UI", 9, "bold"), command=lambda: execute_custom_sync(sync_order=True, sync_sl=True, sync_tp=True), padx=8, pady=4).pack(side="left", padx=4)

    cfg_dropdown.bind("<<ComboboxSelected>>", lambda e: refresh_status())
    refresh_status()
    root.mainloop()
