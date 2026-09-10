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
                
                cfg_symbols = cfg.get("symbols", "All")
                lines.append(f"   [{idx}] {Fore.YELLOW}{cfg_name}{Style.RESET_ALL} (Host: {target_comp} | Symbols: {cfg_symbols})")
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
        return BrokerHandler.create_order(broker_name=broker, account_id=account_id, symbol=symbol, side=action, volume=lots, stop_loss=sl, take_profit=tp, comment=comment)

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
    def _calculate_lots(master_lots: float, mode: str, multiplier: float) -> float:
        if mode == "multiplier":
            lots = round(master_lots * multiplier, 2)
        elif mode == "divider":
            div_val = multiplier if multiplier > 0 else 1.0
            lots = round(master_lots / div_val, 2)
        else:
            lots = master_lots
        return max(0.01, lots)

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
                    cfg_symbols = cfg.get("symbols", "All")

                    if not master_acc or not slaves:
                        continue

                    with CopytraderHandler._lock:
                        # 1. Fetch live master positions and filter by config symbols
                        raw_master_positions = CopytraderHandler._get_account_positions(master_acc, master_broker) or []
                        master_positions = []
                        for m_pos in raw_master_positions:
                            sym = m_pos.get("symbol", "")
                            if CopytraderHandler._is_symbol_allowed(sym, cfg_symbols):
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
                            slave_positions = CopytraderHandler._get_account_positions(slave_acc, slave_broker) or []
                            unmatched_slaves = list(slave_positions)

                            # Filter master positions for this specific slave's symbol rules
                            slave_target_master_positions = [
                                p for p in master_positions if CopytraderHandler._is_symbol_allowed(p.get("symbol", ""), slave_symbols)
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
                                    
                                    if s_side == m_side and CopytraderHandler._are_symbols_matching(m_sym, s_sym, slave_acc):
                                        match_idx = idx_s
                                        break

                                if match_idx >= 0:
                                    # Position already open on slave -> Retain and sync SL / TP if changed
                                    matched_s_pos = unmatched_slaves.pop(match_idx)
                                    if sl > 0 or tp > 0:
                                        s_ticket = str(matched_s_pos.get("position_id") or matched_s_pos.get("ticket") or matched_s_pos.get("id") or "")
                                        curr_sl = float(matched_s_pos.get("stop_loss") or matched_s_pos.get("sl") or 0.0)
                                        curr_tp = float(matched_s_pos.get("take_profit") or matched_s_pos.get("tp") or 0.0)
                                        if abs(curr_sl - sl) > 1e-5 or abs(curr_tp - tp) > 1e-5:
                                            CopytraderHandler._modify_position(slave_broker, slave_acc, s_ticket, m_sym, sl, tp)
                                else:
                                    # Position missing on slave -> OPEN IT!
                                    slave_lots = CopytraderHandler._calculate_lots(m_lots, mode, multiplier)
                                    print(f"🚀 [Copytrader Sync] Master has {m_side} {m_lots} {m_sym} -> Not on slave {slave_acc} ({slave_broker}) -> Opening {m_side} {slave_lots} {m_sym}", flush=True)
                                    logPrint(f"[Copytrader] 🚀 Opening trade on slave {slave_acc} ({slave_broker}): {m_side} {slave_lots} {m_sym}")
                                    
                                    res = CopytraderHandler._execute_order(
                                        broker=slave_broker,
                                        account_id=slave_acc,
                                        symbol=m_sym,
                                        action=m_side,
                                        lots=slave_lots,
                                        sl=sl,
                                        tp=tp,
                                        comment=""
                                    )
                                    if isinstance(res, dict) and "error" in res:
                                        logPrint(f"[Copytrader Error] ❌ Failed to open {m_sym} on {slave_acc}: {res.get('error')}")

                            # B) For any position on slave that NO LONGER EXISTS on master -> CLOSE / DELETE IT!
                            for s_pos in unmatched_slaves:
                                s_sym = str(s_pos.get("symbol", ""))
                                if not CopytraderHandler._is_symbol_allowed(s_sym, slave_symbols) or not CopytraderHandler._is_symbol_allowed(s_sym, cfg_symbols):
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

                                print(f"🛑 [Copytrader Sync] Master has no open {s_side} {s_sym} -> Closing slave position #{s_ticket} on {slave_acc} ({slave_broker})", flush=True)
                                logPrint(f"[Copytrader] 🛑 Master position closed. Closing slave position #{s_ticket} ({s_side} {s_vol} {s_sym}) on {slave_acc}")
                                CopytraderHandler._close_position(slave_broker, slave_acc, s_ticket, symbol=s_sym, lots=s_vol)
            except Exception as e:
                logPrint(f"[Copytrader Sync Exception]: {e}")
            
            time.sleep(1.0)
