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
                    query_cfg = "SELECT id, name, status, target_computer, master_account, master_broker, slaves_json, updated_at FROM copytrader_configs"
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
                                "target_computer": r.get("target_computer"),
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
                "master_account": master_account,
                "master_broker": master_broker,
                "slaves": slaves,
                "updated_at": updated_at
            }

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

    @staticmethod
    def start():
        if CopytraderHandler._is_running:
            return
        CopytraderHandler._is_running = True
        CopytraderHandler._sync_thread = threading.Thread(target=CopytraderHandler._sync_loop, daemon=True)
        CopytraderHandler._sync_thread.start()

        # Log & notify engine startup status
        try:
            current_host = socket.gethostname().strip().lower()
            configs = CopytraderHandler.get_all_configs()
            active_configs = []
            total_slaves = 0

            for cfg in configs:
                if cfg.get("status") != "active":
                    continue
                target_comp = str(cfg.get("target_computer", "All")).strip().lower()
                if target_comp != "all" and target_comp != current_host:
                    continue
                active_configs.append(cfg)
                slaves = cfg.get("slaves", [])
                active_slaves = [s for s in slaves if s.get("status") != "paused"]
                total_slaves += len(active_slaves)

            # Ensure active master & slave accounts are initialized and connected
            for cfg in active_configs:
                master_acc = cfg.get("master_account")
                master_brk = cfg.get("master_broker", "metatrader")
                if master_acc:
                    CopytraderHandler._ensure_account_connected(master_acc, master_brk)

                for slave in cfg.get("slaves", []):
                    if slave.get("status") != "paused":
                        s_acc = slave.get("account_id")
                        s_brk = slave.get("broker", "metatrader")
                        if s_acc:
                            CopytraderHandler._ensure_account_connected(s_acc, s_brk)

            config_count = len(active_configs)
            from colorama import Fore, Style
            lines = [
                f"\n{Fore.CYAN}[Copytrader Engine]{Style.RESET_ALL} 🚀 Starting Copytrader Engine:",
                f"   • Active Configurations Found: {Style.BRIGHT}{config_count}{Style.RESET_ALL}",
                f"   • Total Active Slaves Connected: {Style.BRIGHT}{total_slaves}{Style.RESET_ALL}",
                f"   • Host Machine: {Style.BRIGHT}{current_host}{Style.RESET_ALL}"
            ]
            for idx, cfg in enumerate(active_configs, start=1):
                cfg_name = cfg.get("name", f"Config #{idx}")
                m_acc = cfg.get("master_account", "Unknown")
                m_brk = str(cfg.get("master_broker", "metatrader")).upper()
                target_comp = cfg.get("target_computer", "All")
                slaves = [s for s in cfg.get("slaves", []) if s.get("status") != "paused"]
                
                lines.append(f"   [{idx}] {Fore.YELLOW}{cfg_name}{Style.RESET_ALL} (Target Host: {target_comp})")
                lines.append(f"       Master: {Fore.GREEN}{m_acc}{Style.RESET_ALL} [{m_brk}]")
                if not slaves:
                    lines.append(f"       Slaves: {Fore.RED}None active{Style.RESET_ALL}")
                for s in slaves:
                    s_acc = s.get("account_id", "Unknown")
                    s_brk = str(s.get("broker", "metatrader")).upper()
                    mode = s.get("mode", "direct")
                    mult = s.get("multiplier", 1.0)
                    sizing_str = f"{mode} (x{mult})" if mode in ("multiplier", "divider") else mode
                    lines.append(f"       └── ➜ Slave: {Fore.CYAN}{s_acc}{Style.RESET_ALL} [{s_brk}] | Sizing: {sizing_str}")

            summary_msg = "\n".join(lines) + "\n" 
            print(summary_msg, flush=True)
            logPrint(f"[Copytrader Engine] Background monitor started ({config_count} active configs, {total_slaves} active slaves).")
        except Exception as e:
            from colorama import Fore, Style
            logPrint(f"{Fore.RED}[Copytrader Engine]{Style.RESET_ALL} Error building start message: {e}")

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
        return BrokerHandler.create_order(broker_name=broker, account_id=account_id, symbol=symbol, side=action, volume=lots, stop_loss=sl, take_profit=tp, comment=comment)

    @staticmethod
    def _close_position(broker: str, account_id: str, ticket: str, symbol: str = "", lots: float = 0.0):
        from broker_handler import BrokerHandler
        pos_id = int(ticket) if (isinstance(ticket, str) and ticket.isdigit()) else ticket
        return BrokerHandler.close_position(broker_name=broker, account_id=account_id, position_id=pos_id, symbol=symbol, side="", volume=lots)

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
    def _sync_loop():
        current_host = socket.gethostname().strip().lower()
        while CopytraderHandler._is_running:
            try:
                configs = CopytraderHandler.get_all_configs()
                for cfg in configs:
                    if cfg.get("status") != "active":
                        continue
                    
                    target_comp = str(cfg.get("target_computer", "All")).strip().lower()
                    if target_comp != "all" and target_comp != current_host:
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

                        # Print detailed per-second debug info
                        active_slaves_list = [str(s.get("account_id")) for s in slaves if s.get("status") != "paused"]
                        slave_info_str = []
                        for s_acc in active_slaves_list:
                            s_cfg = next((s for s in slaves if str(s.get("account_id")) == s_acc), {})
                            s_brk = s_cfg.get("broker", "metatrader")
                            s_poss = CopytraderHandler._get_account_positions(s_acc, s_brk)
                            slave_info_str.append(f"{s_acc}: {len(s_poss)} trades")

                        # print(
                        #     f"[Copytrader Loop Debug] Config '{cfg.get('name')}' ({config_id}) | "
                        #     f"Master '{master_acc}' ({master_broker}): {len(master_positions)} open trades | "
                        #     f"Slaves [{', '.join(slave_info_str)}] | Open Mappings: {len(existing_mappings)}",
                        #     flush=True
                        #  )

                        master_open_tickets = set()
                        for pos in master_positions:
                            m_ticket = str(pos.get("position_id") or pos.get("ticket") or pos.get("id") or "")
                            if not m_ticket:
                                continue
                            master_open_tickets.add(m_ticket)

                            symbol = pos.get("symbol", "EURUSD")
                            pos_side = str(pos.get("trade_side") or pos.get("type") or "").upper()
                            action = "BUY" if ("BUY" in pos_side or pos_side == "0") else "SELL"
                            master_lots = float(pos.get("volume") or pos.get("lots") or pos.get("size") or 0.01)
                            sl = float(pos.get("stop_loss") or pos.get("sl") or 0.0)
                            tp = float(pos.get("take_profit") or pos.get("tp") or 0.0)

                            for slave in slaves:
                                if slave.get("status") == "paused":
                                    continue
                                slave_acc = str(slave.get("account_id"))
                                slave_broker = slave.get("broker", "metatrader")
                                mode = slave.get("mode", "direct") # direct or multiplier
                                multiplier = float(slave.get("multiplier", 1.0))

                                if mode == "multiplier":
                                    slave_lots = round(master_lots * multiplier, 2)
                                elif mode == "divider":
                                    div_val = multiplier if multiplier > 0 else 1.0
                                    slave_lots = round(master_lots / div_val, 2)
                                else:
                                    slave_lots = master_lots
                                slave_lots = max(0.01, slave_lots)

                                key = (m_ticket, slave_acc)
                                if key not in existing_mappings:
                                    # Fetch slave positions and check if any open trade already has comment matching master ticket or CP_<m_ticket>
                                    slave_positions = CopytraderHandler._get_account_positions(slave_acc, slave_broker)
                                    existing_slave_pos = next(
                                        (sp for sp in slave_positions if str(sp.get("comment", "")).strip() in (m_ticket, f"CP_{m_ticket}")),
                                        None
                                    )

                                    if existing_slave_pos:
                                        slave_ticket = str(existing_slave_pos.get("position_id") or existing_slave_pos.get("ticket"))
                                        CopytraderHandler._record_mapping(config_id, m_ticket, slave_acc, slave_ticket, symbol, action, slave_lots)
                                        existing_mappings[key] = slave_ticket
                                    else:
                                        # Trade not yet on slave -> Open trade with comment set to master ticket ID
                                        comment = m_ticket
                                        logPrint(f"[Copytrader] Opening trade on slave {slave_acc}: {action} {slave_lots} {symbol} (SL: {sl}, TP: {tp}, Comment: {comment})")
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
                                else:
                                    # Trade already copied -> Check and sync SL / TP changes if modified on master
                                    slave_ticket = existing_mappings[key]
                                    if slave_broker == "metatrader" and (sl > 0 or tp > 0):
                                        try:
                                            slave_positions = CopytraderHandler._get_account_positions(slave_acc, slave_broker)
                                            slave_pos = next((sp for sp in slave_positions if str(sp.get("position_id") or sp.get("ticket")) == str(slave_ticket)), None)
                                            if slave_pos:
                                                curr_sl = float(slave_pos.get("stop_loss") or slave_pos.get("sl") or 0.0)
                                                curr_tp = float(slave_pos.get("take_profit") or slave_pos.get("tp") or 0.0)
                                                if abs(curr_sl - sl) > 1e-5 or abs(curr_tp - tp) > 1e-5:
                                                    logPrint(f"[Copytrader] Updating SL/TP on slave {slave_acc} (Ticket: {slave_ticket}): SL {curr_sl}->{sl}, TP {curr_tp}->{tp}")
                                                    MetaTraderHandler.adjustSLTP(
                                                        position_id=int(slave_ticket),
                                                        stop_loss=sl,
                                                        take_profit=tp,
                                                        symbol=symbol,
                                                        account_id=slave_acc
                                                    )
                                        except Exception as mod_err:
                                            logPrint(f"[Copytrader SL/TP Sync Error]: {mod_err}")

                        # Handle position closures: If master ticket closed, close corresponding slave position
                        for (m_ticket, s_acc), s_ticket in list(existing_mappings.items()):
                            if m_ticket not in master_open_tickets:
                                slave_config = next((s for s in slaves if str(s.get("account_id")) == s_acc), None)
                                slave_broker = slave_config.get("broker", "metatrader") if slave_config else "metatrader"
                                logPrint(f"[Copytrader] Master ticket {m_ticket} closed. Closing slave position {s_ticket} on account {s_acc}")
                                res_close = CopytraderHandler._close_position(slave_broker, s_acc, s_ticket, symbol="", lots=0.0)
                                CopytraderHandler._mark_mapping_closed(config_id, m_ticket, s_acc)

                        # Clean up orphaned slave positions whose master ticket was closed while engine was offline
                        for slave in slaves:
                            if slave.get("status") == "paused":
                                continue
                            s_acc = str(slave.get("account_id"))
                            s_brk = slave.get("broker", "metatrader")
                            s_poss = CopytraderHandler._get_account_positions(s_acc, s_brk)
                            for sp in s_poss:
                                comment_str = str(sp.get("comment", "")).strip()
                                sp_ticket = str(sp.get("position_id") or sp.get("ticket"))
                                # If comment is a master ticket number/CP_<num> not currently open on master, close orphaned slave trade
                                clean_m_ticket = comment_str.replace("CP_", "").strip()
                                if clean_m_ticket.isdigit() and clean_m_ticket not in master_open_tickets:
                                    CopytraderHandler._close_position(s_brk, s_acc, sp_ticket, symbol="", lots=0.0)
            except Exception as e:
                logPrint(f"[Copytrader Sync Exception]: {e}")
            
            time.sleep(1.0)
