import os
import pandas as pd
import json
import time
import threading
from indicator_handler import IndicatorHandler
from trading_handler import TradingHandler
from sql_handler import SQLHandler
from broker_handler import BrokerHandler
from symbol_mapping_handler import SymbolMappingHandler

class StrategyHandler:
    _db_initialized = False
    _strategies_cache = None  # {strategy_id: strategy_dict}
    _lock = threading.RLock()

    @staticmethod
    def resolve_broker_and_symbol(strategy_or_params: dict) -> dict:
        """
        Resolves broker handler, account ID, and mapped broker-specific symbol in a unified way for both Live and Backtest.
        Returns a dict: {
            'symbol': raw_symbol,
            'broker_symbol': mapped_broker_symbol,
            'broker_name': broker_name,
            'handler': broker_handler_instance,
            'account_id': account_id,
            'is_valid': bool,
            'error_message': str
        }
        """
        strategy = StrategyHandler.get_strategy_settings(strategy_or_params, strict=False)
        symbol = strategy.get("symbol", "")
        broker_name = strategy.get("broker", "metatrader")
        handler = BrokerHandler.get_handler(broker_name)

        account_id = strategy.get("account_id")
        if not account_id and strategy.get("targets"):
            targets = strategy.get("targets")
            if isinstance(targets, list) and len(targets) > 0:
                account_id = targets[0].get("account_id")

        if not account_id and broker_name == 'metatrader':
            try:
                from account_handler import AccountHandler
                active_acc = AccountHandler.get_active_account(broker_name)
                if active_acc:
                    account_id = active_acc.get("account_id")
            except Exception:
                pass

        broker_symbol = SymbolMappingHandler.map_to_broker(symbol, account_id)

        is_valid = True
        error_msg = ""
        if broker_name == 'binance' and not SymbolMappingHandler.has_mapping(symbol, account_id) and not getattr(handler, 'validate_and_format_symbol', lambda s: None)(broker_symbol):
            is_valid = False
            error_msg = f"Symbol '{symbol}' has no mapping configured for Binance account '{account_id}'. Please configure symbol mapping in settings."

        return {
            "symbol": symbol,
            "broker_symbol": broker_symbol,
            "broker_name": broker_name,
            "handler": handler,
            "account_id": account_id,
            "is_valid": is_valid,
            "error_message": error_msg
        }

    @classmethod
    def init_db(cls):
        with cls._lock:
            if cls._db_initialized:
                return

            create_strategies_mysql = """
            CREATE TABLE IF NOT EXISTS live_strategies (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(255) DEFAULT '',
                symbol VARCHAR(64) NOT NULL,
                status VARCHAR(32) DEFAULT 'stopped',
                timeframe VARCHAR(32) DEFAULT '15m',
                slVal DOUBLE DEFAULT 1.0,
                slType VARCHAR(32) DEFAULT 'pct',
                rr DOUBLE DEFAULT 2.0,
                size DOUBLE DEFAULT 1.0,
                useRiskSizing TINYINT(1) DEFAULT 0,
                riskPct DOUBLE DEFAULT 1.0,
                useBreakEven TINYINT(1) DEFAULT 0,
                beTriggerR DOUBLE DEFAULT 1.0,
                allowOppositeClose TINYINT(1) DEFAULT 1,
                lookbackWindow INT DEFAULT 100,
                deployedAt VARCHAR(64) DEFAULT '',
                timezone VARCHAR(64) DEFAULT 'Local',
                sessions TEXT,
                useGlobalClose TINYINT(1) DEFAULT 0,
                globalCloseTime VARCHAR(32) DEFAULT '',
                useEntryCutoff TINYINT(1) DEFAULT 0,
                entryCutoffTime VARCHAR(32) DEFAULT '',
                entryStabilityRule VARCHAR(64) DEFAULT 'default',
                broker VARCHAR(64) DEFAULT 'metatrader',
                account_id VARCHAR(128) DEFAULT '',
                target_computer VARCHAR(128) DEFAULT 'All',
                dateRangeOption VARCHAR(64) DEFAULT 'last_candles',
                customFrom VARCHAR(64) DEFAULT '',
                customTo VARCHAR(64) DEFAULT '',
                candleLimit INT DEFAULT 1000,
                dailyFirstSignalsMode VARCHAR(64) DEFAULT 'disabled',
                dailyFirstSignalsCount INT DEFAULT 1,
                dailyFirstSignalsRiskMult DOUBLE DEFAULT 0.5,
                live_state LONGTEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
            create_targets_mysql = """
            CREATE TABLE IF NOT EXISTS live_strategy_targets (
                id VARCHAR(64) PRIMARY KEY,
                strategy_id VARCHAR(64) NOT NULL,
                broker VARCHAR(64) DEFAULT '',
                account_id VARCHAR(128) DEFAULT '',
                INDEX idx_strategy_id (strategy_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """

            create_strategies_sqlite = """
            CREATE TABLE IF NOT EXISTS live_strategies (
                id TEXT PRIMARY KEY,
                name TEXT DEFAULT '',
                symbol TEXT NOT NULL,
                status TEXT DEFAULT 'stopped',
                timeframe TEXT DEFAULT '15m',
                slVal REAL DEFAULT 1.0,
                slType TEXT DEFAULT 'pct',
                rr REAL DEFAULT 2.0,
                size REAL DEFAULT 1.0,
                useRiskSizing INTEGER DEFAULT 0,
                riskPct REAL DEFAULT 1.0,
                useBreakEven INTEGER DEFAULT 0,
                beTriggerR REAL DEFAULT 1.0,
                allowOppositeClose INTEGER DEFAULT 1,
                lookbackWindow INTEGER DEFAULT 100,
                deployedAt TEXT DEFAULT '',
                timezone TEXT DEFAULT 'Local',
                sessions TEXT,
                useGlobalClose INTEGER DEFAULT 0,
                globalCloseTime TEXT DEFAULT '',
                useEntryCutoff INTEGER DEFAULT 0,
                entryCutoffTime TEXT DEFAULT '',
                entryStabilityRule TEXT DEFAULT 'default',
                broker TEXT DEFAULT 'metatrader',
                account_id TEXT DEFAULT '',
                target_computer TEXT DEFAULT 'All',
                dateRangeOption TEXT DEFAULT 'last_candles',
                customFrom TEXT DEFAULT '',
                customTo TEXT DEFAULT '',
                candleLimit INTEGER DEFAULT 1000,
                dailyFirstSignalsMode TEXT DEFAULT 'disabled',
                dailyFirstSignalsCount INTEGER DEFAULT 1,
                dailyFirstSignalsRiskMult REAL DEFAULT 0.5,
                live_state TEXT
            )
            """
            create_targets_sqlite = """
            CREATE TABLE IF NOT EXISTS live_strategy_targets (
                id TEXT PRIMARY KEY,
                strategy_id TEXT NOT NULL,
                broker TEXT DEFAULT '',
                account_id TEXT DEFAULT ''
            )
            """

            try:
                SQLHandler.execute_query(create_strategies_mysql)
                SQLHandler.execute_query(create_targets_mysql)
            except Exception:
                try:
                    SQLHandler.execute_query(create_strategies_sqlite)
                    SQLHandler.execute_query(create_targets_sqlite)
                except Exception as e:
                    print(f"Error initializing strategies DB: {e}", flush=True)

            cls._db_initialized = True

    @classmethod
    def _ensure_cache_loaded(cls, force: bool = False):
        with cls._lock:
            if cls._strategies_cache is None or force:
                cls.init_db()
                try:
                    results = SQLHandler.execute_query("SELECT * FROM live_strategies ORDER BY deployedAt DESC")
                    targets_map = {}
                    try:
                        targets_rows = SQLHandler.execute_query("SELECT strategy_id, broker, account_id FROM live_strategy_targets")
                        if isinstance(targets_rows, list):
                            for r in targets_rows:
                                s_id = r.get("strategy_id")
                                if s_id:
                                    if s_id not in targets_map:
                                        targets_map[s_id] = []
                                    targets_map[s_id].append({"broker": r.get("broker"), "account_id": r.get("account_id")})
                    except Exception:
                        pass

                    new_cache = {}
                    if isinstance(results, list):
                        for row in results:
                            strat = cls._row_to_dict(row)
                            strat["targets"] = targets_map.get(strat["id"], [])
                            new_cache[strat["id"]] = strat
                    cls._strategies_cache = new_cache
                except Exception as e:
                    print(f"Error loading strategies cache from DB: {e}", flush=True)
                    if cls._strategies_cache is None:
                        cls._strategies_cache = {}

    @classmethod
    def save_strategy(cls, strategy: dict) -> bool:
        """
        Saves the strategy configuration to the SQL database using an upsert pattern
        and updates the in-memory cache immediately.
        """
        cls.init_db()
        if "id" not in strategy or not strategy["id"]:
            import uuid
            strategy["id"] = str(uuid.uuid4())

        query = """
        INSERT INTO live_strategies (
            id, name, symbol, status, timeframe, slVal, slType, rr, size, 
            useRiskSizing, riskPct, useBreakEven, beTriggerR, allowOppositeClose, lookbackWindow, deployedAt,
            timezone, sessions, useGlobalClose, globalCloseTime, useEntryCutoff, entryCutoffTime, entryStabilityRule, broker, account_id, target_computer,
            dateRangeOption, customFrom, customTo, candleLimit,
            dailyFirstSignalsMode, dailyFirstSignalsCount, dailyFirstSignalsRiskMult
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s
        ) ON DUPLICATE KEY UPDATE 
            name=VALUES(name),
            symbol=VALUES(symbol),
            status=VALUES(status),
            timeframe=VALUES(timeframe),
            slVal=VALUES(slVal),
            slType=VALUES(slType),
            rr=VALUES(rr),
            size=VALUES(size),
            useRiskSizing=VALUES(useRiskSizing),
            riskPct=VALUES(riskPct),
            useBreakEven=VALUES(useBreakEven),
            beTriggerR=VALUES(beTriggerR),
            allowOppositeClose=VALUES(allowOppositeClose),
            lookbackWindow=VALUES(lookbackWindow),
            deployedAt=VALUES(deployedAt),
            timezone=VALUES(timezone),
            sessions=VALUES(sessions),
            useGlobalClose=VALUES(useGlobalClose),
            globalCloseTime=VALUES(globalCloseTime),
            useEntryCutoff=VALUES(useEntryCutoff),
            entryCutoffTime=VALUES(entryCutoffTime),
            entryStabilityRule=VALUES(entryStabilityRule),
            broker=VALUES(broker),
            account_id=VALUES(account_id),
            target_computer=VALUES(target_computer),
            dateRangeOption=VALUES(dateRangeOption),
            customFrom=VALUES(customFrom),
            customTo=VALUES(customTo),
            candleLimit=VALUES(candleLimit),
            dailyFirstSignalsMode=VALUES(dailyFirstSignalsMode),
            dailyFirstSignalsCount=VALUES(dailyFirstSignalsCount),
            dailyFirstSignalsRiskMult=VALUES(dailyFirstSignalsRiskMult)
        """
        # Resolve currently active account if not provided
        acc_id = strategy.get("account_id")
        if not acc_id:
            from account_handler import AccountHandler
            active_acc = AccountHandler.get_active_account()
            if active_acc:
                acc_id = active_acc.get("account_id")

        params = (
            strategy["id"],
            strategy.get("name", ""),
            strategy["symbol"],
            strategy["status"],
            strategy["timeframe"],
            strategy["slVal"],
            strategy["slType"],
            strategy["rr"],
            strategy["size"],
            1 if strategy.get("useRiskSizing") else 0,
            strategy.get("riskPct", 1.0),
            1 if strategy.get("useBreakEven") else 0,
            strategy.get("beTriggerR", 1.0),
            1 if strategy.get("allowOppositeClose", True) else 0,
            strategy.get("lookbackWindow", 100),
            strategy.get("deployedAt", str(int(time.time()))),
            strategy.get("timezone", "Local"),
            json.dumps(strategy.get("sessions", [])),
            1 if strategy.get("useGlobalClose", False) else 0,
            strategy.get("globalCloseTime", ""),
            1 if strategy.get("useEntryCutoff", False) else 0,
            strategy.get("entryCutoffTime", ""),
            strategy.get("entryStabilityRule", "default"),
            strategy.get("broker", "metatrader"),
            acc_id,
            strategy.get("target_computer", "All"),
            strategy.get("dateRangeOption", "last_candles"),
            strategy.get("customFrom", ""),
            strategy.get("customTo", ""),
            strategy.get("candleLimit", 1000),
            strategy.get("dailyFirstSignalsMode", "disabled"),
            int(strategy.get("dailyFirstSignalsCount", 1)),
            float(strategy.get("dailyFirstSignalsRiskMult", 0.5))
        )
        try:
            SQLHandler.execute_query(query, params)
            
            # Save strategy targets
            SQLHandler.execute_query("DELETE FROM live_strategy_targets WHERE strategy_id = %s", (strategy["id"],))
            
            targets = strategy.get("targets", [])
            if not targets and strategy.get("broker") and acc_id:
                targets = [{"broker": strategy.get("broker"), "account_id": acc_id}]
                
            for t in targets:
                import uuid
                target_id = str(uuid.uuid4())
                SQLHandler.execute_query(
                    "INSERT INTO live_strategy_targets (id, strategy_id, broker, account_id) VALUES (%s, %s, %s, %s)",
                    (target_id, strategy["id"], t.get("broker"), t.get("account_id"))
                )
            
            # Update cache immediately
            cls._ensure_cache_loaded()
            with cls._lock:
                strat_copy = dict(strategy)
                strat_copy["account_id"] = acc_id
                strat_copy["targets"] = targets
                cls._strategies_cache[strategy["id"]] = strat_copy
            return True
        except Exception as e:
            print(f"Failed to save strategy: {e}", flush=True)
            return False

    @classmethod
    def get_strategy(cls, strategy_id: str = None) -> dict:
        """
        Gets strategy from in-memory cache without hitting DB.
        """
        cls._ensure_cache_loaded()
        with cls._lock:
            if strategy_id:
                return dict(cls._strategies_cache[strategy_id]) if strategy_id in cls._strategies_cache else None

            import socket
            try:
                comp_name = socket.gethostname().strip().lower()
            except Exception:
                comp_name = "unknown"

            for s in cls._strategies_cache.values():
                tgt = str(s.get("target_computer", "All")).strip().lower()
                if tgt in ("all", comp_name):
                    return dict(s)
            return None

    @classmethod
    def get_all_strategies(cls) -> list:
        """
        Retrieves all strategies directly from in-memory cache.
        """
        cls._ensure_cache_loaded()
        with cls._lock:
            return [dict(s) for s in cls._strategies_cache.values()]

    @classmethod
    def delete_strategy(cls, strategy_id: str) -> bool:
        """
        Deletes a strategy by ID and evicts from in-memory cache.
        """
        cls.init_db()
        try:
            SQLHandler.execute_query("DELETE FROM live_strategy_targets WHERE strategy_id = %s", (strategy_id,))
            SQLHandler.execute_query("DELETE FROM live_strategies WHERE id = %s", (strategy_id,))
            cls._ensure_cache_loaded()
            with cls._lock:
                cls._strategies_cache.pop(strategy_id, None)
            return True
        except Exception as e:
            print(f"Error deleting strategy {strategy_id}: {e}", flush=True)
            return False

    @staticmethod
    def _row_to_dict(row: dict) -> dict:
        sessions_raw = row.get("sessions")
        sessions_list = []
        if sessions_raw:
            try:
                sessions_list = json.loads(sessions_raw)
            except Exception:
                pass
        
        live_state_raw = row.get("live_state")
        live_state_dict = {}
        if live_state_raw:
            try:
                live_state_dict = json.loads(live_state_raw)
            except Exception:
                pass

        return {
            "id": row["id"],
            "name": row.get("name", "") or "",
            "symbol": row["symbol"],
            "status": row["status"],
            "timeframe": row["timeframe"],
            "slVal": float(row["slVal"]),
            "slType": row["slType"],
            "rr": float(row["rr"]),
            "size": float(row["size"]),
            "useRiskSizing": bool(row["useRiskSizing"]),
            "riskPct": float(row["riskPct"]),
            "useBreakEven": bool(row["useBreakEven"]),
            "beTriggerR": float(row["beTriggerR"]),
            "allowOppositeClose": bool(row.get("allowOppositeClose", True)),
            "lookbackWindow": int(row["lookbackWindow"]),
            "deployedAt": row["deployedAt"],
            "timezone": row.get("timezone", "Local") or "Local",
            "sessions": sessions_list,
            "useGlobalClose": bool(row.get("useGlobalClose", False)),
            "globalCloseTime": row.get("globalCloseTime", "") or "",
            "useEntryCutoff": bool(row.get("useEntryCutoff", False)),
            "entryCutoffTime": row.get("entryCutoffTime", "") or "",
            "entryStabilityRule": row.get("entryStabilityRule", "default") or "default",
            "broker": row.get("broker", "metatrader") or "metatrader",
            "account_id": row.get("account_id") or "",
            "target_computer": row.get("target_computer", "All") or "All",
            "dateRangeOption": row.get("dateRangeOption", "last_candles") or "last_candles",
            "customFrom": row.get("customFrom") or "",
            "customTo": row.get("customTo") or "",
            "candleLimit": int(row.get("candleLimit", 1000) if row.get("candleLimit") is not None else 1000),
            "dailyFirstSignalsMode": row.get("dailyFirstSignalsMode", "disabled") or "disabled",
            "dailyFirstSignalsCount": int(row.get("dailyFirstSignalsCount", 1) if row.get("dailyFirstSignalsCount") is not None else 1),
            "dailyFirstSignalsRiskMult": float(row.get("dailyFirstSignalsRiskMult", 0.5) if row.get("dailyFirstSignalsRiskMult") is not None else 0.5),
            "live_state": live_state_dict
        }

    @staticmethod
    def update_strategy_state(strategy_id: str, state: dict) -> bool:
        """
        Updates only the live_state column of a strategy.
        """
        StrategyHandler.init_db()
        query = "UPDATE live_strategies SET live_state = %s WHERE id = %s"
        try:
            SQLHandler.execute_query(query, (json.dumps(state), strategy_id))
            return True
        except Exception as e:
            print(f"Failed to update state for strategy {strategy_id}: {e}", flush=True)
            return False

    @staticmethod
    def is_trading_allowed(strategy_or_id) -> tuple:
        """
        Checks if trading is currently allowed for the strategy based on its active sessions and cutoff time.
        Accepts either a strategy dictionary or strategy ID string.
        Returns (is_allowed, error_message).
        """
        if isinstance(strategy_or_id, dict):
            strategy = strategy_or_id
        else:
            strategy = StrategyHandler.get_strategy(strategy_or_id)

        if not strategy or strategy.get("status") != "active":
            return True, ""
            
        sessions = [s for s in strategy.get("sessions", []) if s.get("active", True)]
        if not sessions:
            return True, ""
            
        timezone_str = strategy.get("timezone", "Local")
        
        import time
        from datetime import datetime, timezone as pytimezone
        ts = time.time()
        if timezone_str == 'UTC':
            dt_now = datetime.fromtimestamp(ts, tz=pytimezone.utc).replace(tzinfo=None)
        else:
            dt_now = datetime.fromtimestamp(ts)
            
        wd = dt_now.weekday() + 1
        time_val = dt_now.time()
        
        in_session = False
        for s in sessions:
            weekdays = s.get("weekdays", [])
            if wd not in weekdays:
                continue
            try:
                sh, sm = map(int, s.get("start", "00:00").split(":"))
                eh, em = map(int, s.get("end", "23:59").split(":"))
            except ValueError:
                continue
            
            from datetime import time as dttime
            start_time = dttime(sh, sm)
            end_time = dttime(eh, em)
            
            if start_time <= end_time:
                if start_time <= time_val <= end_time:
                    in_session = True
                    break
            else:
                if time_val >= start_time or time_val <= end_time:
                    in_session = True
                    break
                    
        if not in_session:
            return False, f"Trade rejected: Outside configured trading sessions ({timezone_str} timezone)."

        # Check entry cutoff time
        use_entry_cutoff = strategy.get("useEntryCutoff", False)
        entry_cutoff_time = strategy.get("entryCutoffTime", "")
        if use_entry_cutoff and entry_cutoff_time and len(entry_cutoff_time.strip()) == 5:
            try:
                ch, cm = map(int, entry_cutoff_time.strip().split(":"))
                from datetime import time as dttime
                if time_val >= dttime(ch, cm):
                    return False, f"Trade rejected: Past entry cutoff time ({entry_cutoff_time})."
            except Exception:
                pass
            
        return True, ""

    @staticmethod
    def restore_active_strategies():
        """
        Called on startup to fetch active strategies from the database.
        """
        StrategyHandler.init_db()
        strategy = StrategyHandler.get_strategy()
        if strategy and strategy.get("status") == "active":
            print(f"Startup Recovery: Active strategy {strategy['id']} for {strategy['symbol']} is ready in DB.", flush=True)
        else:
            print("Startup Recovery: No active strategy found in DB.", flush=True)

    @staticmethod
    def _evaluate_wyckoff_setup(c: dict, state: dict, entry_stability_rule: str) -> tuple:
        """
        Evaluates Wyckoff accumulation/distribution state, Spring/Upthrust triggers,
        and returns potential structural trade opportunities: (possible_buy, possible_sell).
        """
        wyckoff_sig = c.get('wyckoff_signal')
        stage = c.get('wyckoff_stage', 'TRANSITION')

        accum_consec_bars = state.get('accum_consec_bars', 0)
        dist_consec_bars = state.get('dist_consec_bars', 0)
        pending_buy = state.get('pending_buy', False)
        pending_sell = state.get('pending_sell', False)
        spring_high = state.get('spring_high', None)
        upthrust_low = state.get('upthrust_low', None)
        pending_buy_age = state.get('pending_buy_age', 0)
        pending_sell_age = state.get('pending_sell_age', 0)

        # Update stage consecutive bars counter
        if stage == "ACCUMULATION":
            accum_consec_bars += 1
        else:
            accum_consec_bars = 0

        if stage == "DISTRIBUTION":
            dist_consec_bars += 1
        else:
            dist_consec_bars = 0

        # Enforce max age for pending setups (15 candles)
        if pending_buy:
            pending_buy_age += 1
            if pending_buy_age > 15:
                pending_buy = False

        if pending_sell:
            pending_sell_age += 1
            if pending_sell_age > 15:
                pending_sell = False

        # Set up structural triggers
        is_new_spring = False
        is_new_upthrust = False

        if wyckoff_sig == "Spring detected":
            pending_buy = True
            spring_high = float(c.get('high', 0))
            pending_buy_age = 0
            pending_sell = False
            is_new_spring = True

        if wyckoff_sig == "Upthrust detected":
            pending_sell = True
            upthrust_low = float(c.get('low', 0))
            pending_sell_age = 0
            pending_buy = False
            is_new_upthrust = True

        possible_buy = False
        possible_sell = False

        # Evaluate pending buy setup confirmation
        if pending_buy:
            duration_ok = True
            if entry_stability_rule in ('duration', 'both'):
                duration_ok = (accum_consec_bars >= 3)

            confirmation_ok = True
            if entry_stability_rule in ('confirmation', 'both'):
                if is_new_spring:
                    confirmation_ok = False
                else:
                    confirmation_ok = (float(c.get('close', 0)) > spring_high)

            if duration_ok and confirmation_ok:
                if stage != "DISTRIBUTION":
                    possible_buy = True
                    pending_buy = False

            if wyckoff_sig == "Upthrust detected" or stage == "DISTRIBUTION":
                pending_buy = False

        # Evaluate pending sell setup confirmation
        if pending_sell:
            duration_ok = True
            if entry_stability_rule in ('duration', 'both'):
                duration_ok = (dist_consec_bars >= 3)

            confirmation_ok = True
            if entry_stability_rule in ('confirmation', 'both'):
                if is_new_upthrust:
                    confirmation_ok = False
                else:
                    confirmation_ok = (float(c.get('close', 0)) < upthrust_low)

            if duration_ok and confirmation_ok:
                if stage != "ACCUMULATION":
                    possible_sell = True
                    pending_sell = False

            if wyckoff_sig == "Spring detected" or stage == "ACCUMULATION":
                pending_sell = False

        state.update({
            'accum_consec_bars': accum_consec_bars,
            'dist_consec_bars': dist_consec_bars,
            'pending_buy': pending_buy,
            'pending_sell': pending_sell,
            'spring_high': spring_high,
            'upthrust_low': upthrust_low,
            'pending_buy_age': pending_buy_age,
            'pending_sell_age': pending_sell_age
        })

        return possible_buy, possible_sell

    @staticmethod
    def _is_session_allowed(dt_curr, sessions: list) -> bool:
        """Returns True if current datetime is within allowed trading sessions."""
        if not sessions:
            return True
        from backtest_helpers import is_datetime_in_sessions
        in_session, _ = is_datetime_in_sessions(dt_curr, sessions)
        return in_session

    @staticmethod
    def _is_entry_cutoff_allowed(dt_curr, use_entry_cutoff: bool, entry_cutoff_time: str) -> bool:
        """Returns True if trade entry is allowed (cutoff time not reached)."""
        if use_entry_cutoff and entry_cutoff_time and len(entry_cutoff_time.strip()) == 5:
            try:
                ch, cm = map(int, entry_cutoff_time.strip().split(":"))
                from datetime import time as dttime
                cutoff_t = dttime(ch, cm)
                if dt_curr.time() >= cutoff_t:
                    return False
            except Exception:
                pass
        return True

    @staticmethod
    def _is_date_range_allowed(candle_time: int, date_from: float, date_to: float) -> bool:
        """Returns True if candle time is within allowed date range."""
        if date_from is not None and candle_time < int(date_from):
            return False
        if date_to is not None and candle_time > int(date_to):
            return False
        return True

    @staticmethod
    def _is_daily_retry_allowed(date_str: str, daily_retry_limit: int, daily_trades_count: dict) -> bool:
        """Returns True if daily trade retry count has not exceeded limit."""
        if daily_retry_limit > 0 and daily_trades_count.get(date_str, 0) >= daily_retry_limit:
            return False
        return True

    @staticmethod
    def _is_timing_allowed(
        dt_curr,
        candle_time: int,
        date_str: str,
        sessions: list = None,
        date_from: float = None,
        date_to: float = None,
        use_entry_cutoff: bool = False,
        entry_cutoff_time: str = '',
        daily_retry_limit: int = 0,
        daily_trades_count: dict = None
    ) -> bool:
        """1. Datetime & Schedule: Validates trading sessions, cutoff time, date bounds, and daily trade limits."""
        if not StrategyHandler._is_session_allowed(dt_curr, sessions):
            return False

        if not StrategyHandler._is_entry_cutoff_allowed(dt_curr, use_entry_cutoff, entry_cutoff_time):
            return False

        if not StrategyHandler._is_date_range_allowed(candle_time, date_from, date_to):
            return False

        if not StrategyHandler._is_daily_retry_allowed(date_str, daily_retry_limit, daily_trades_count or {}):
            return False

        return True

    @staticmethod
    def _is_trade_allowed(c: dict, side: str) -> bool:
        """2. Technical & Trade Filters: Validates indicator confirmation rules and HTF EMA trend filter."""
        # Indicator confirmation layer check
        if side == 'BUY' and c.get('indicator_buy_valid') is False:
            return False
        if side == 'SELL' and c.get('indicator_sell_valid') is False:
            return False

        # HTF EMA Trend Filter
        if c.get('htf_ema_enabled'):
            htf_ema_val = c.get('htf_ema')
            if htf_ema_val is not None and not pd.isna(htf_ema_val):
                close_price = float(c.get('close', 0))
                if side == 'BUY' and close_price <= float(htf_ema_val):
                    return False
                if side == 'SELL' and close_price >= float(htf_ema_val):
                    return False

        return True

    @staticmethod
    def single_candle_signal(
        c: dict,
        state: dict,
        strategy: dict,
        daily_trades_count: dict = None,
        daily_signals_count: dict = None
    ) -> tuple:
        """
        Pure signal detection logic shared between Backtesting and Live Trading.
        Updates state dictionary in-place and returns (buy, sell, state).
        """
        if daily_trades_count is None:
            daily_trades_count = {}
        if daily_signals_count is None:
            daily_signals_count = {}

        entry_stability_rule = strategy.get("entryStabilityRule", "default")
        timezone = strategy.get("timezone", "Local")
        sessions = strategy.get("sessions") or []
        date_from = strategy.get("date_from") or strategy.get("dateFrom")
        date_to = strategy.get("date_to") or strategy.get("dateTo")
        daily_retry_limit = int(strategy.get("dailyRetryLimit", 0))
        daily_first_signals_mode = strategy.get("dailyFirstSignalsMode", "disabled")
        daily_first_signals_count = int(strategy.get("dailyFirstSignalsCount", 1))
        daily_first_signals_risk_mult = float(strategy.get("dailyFirstSignalsRiskMult", 0.5))
        use_entry_cutoff = bool(strategy.get("useEntryCutoff", False))
        entry_cutoff_time = strategy.get("entryCutoffTime", "")

        # 1. Structural Wyckoff Setup Detection
        possible_buy, possible_sell = StrategyHandler._evaluate_wyckoff_setup(c, state, entry_stability_rule)

        # 2. Timing & Datetime context
        candle_time = int(c.get('time', 0))
        from backtest_helpers import get_candle_datetime
        dt_curr = get_candle_datetime(candle_time, timezone)
        try:
            date_str = dt_curr.strftime('%Y-%m-%d')
        except Exception:
            date_str = 'unknown'

        # 3. Step A: Datetime & Schedule Filter
        timing_ok = StrategyHandler._is_timing_allowed(
            dt_curr=dt_curr,
            candle_time=candle_time,
            date_str=date_str,
            sessions=sessions,
            date_from=date_from,
            date_to=date_to,
            use_entry_cutoff=use_entry_cutoff,
            entry_cutoff_time=entry_cutoff_time,
            daily_retry_limit=daily_retry_limit,
            daily_trades_count=daily_trades_count
        )

        # 3. Step B: Technical Trade Filters (Indicators & HTF EMA)
        buy = False
        sell = False

        if timing_ok:
            if possible_buy and StrategyHandler._is_trade_allowed(c, 'BUY'):
                buy = True
            if possible_sell and StrategyHandler._is_trade_allowed(c, 'SELL'):
                sell = True

        # 4. Daily Initial Signals (Skip or Reduced Risk)
        if buy or sell:
            daily_signals_count[date_str] = daily_signals_count.get(date_str, 0) + 1
            curr_signal_idx = daily_signals_count[date_str]
            raw_sig_type = 'BUY' if buy else 'SELL'
            c['signal_index_in_day'] = curr_signal_idx

            if daily_first_signals_mode in ('skip', 'reduced_risk') and curr_signal_idx <= daily_first_signals_count:
                if daily_first_signals_mode == 'skip':
                    c['signal_action'] = 'skipped'
                    c['skipped_signal_type'] = raw_sig_type
                    buy = False
                    sell = False
                elif daily_first_signals_mode == 'reduced_risk':
                    c['signal_action'] = 'reduced'
                    c['risk_multiplier'] = float(daily_first_signals_risk_mult)
            else:
                c['signal_action'] = 'normal'
                c['risk_multiplier'] = 1.0

        return buy, sell, state

    @staticmethod
    def analyze_wyckoff_structure(candles: list, lookback: int = 20, progress_callback=None) -> list:
        """Step 1: Analyzes raw candlestick data for Wyckoff phases and structures."""
        if not candles:
            return []
        from wyckoff_handler import WyckoffHandler
        return WyckoffHandler.analyze_wyckoff_structure(candles, lookback=lookback, progress_callback=progress_callback)

    @staticmethod
    def apply_indicators(candles: list, indicator_rules: list = None) -> list:
        """Step 2: Calculates ATR and evaluates indicator confirmation rules."""
        if not candles:
            return []
        try:
            df = pd.DataFrame(candles)
            atr_series = IndicatorHandler.atr(df, period=14, smoothing='rma')
            for idx, c in enumerate(candles):
                c['atr'] = float(atr_series.iloc[idx]) if not pd.isna(atr_series.iloc[idx]) else 0.0

            if indicator_rules and len(indicator_rules) > 0:
                buy_mask, sell_mask = IndicatorHandler.evaluate_indicator_rules(df, indicator_rules)
                for idx, c in enumerate(candles):
                    c['indicator_buy_valid'] = bool(buy_mask.iloc[idx])
                    c['indicator_sell_valid'] = bool(sell_mask.iloc[idx])
        except Exception as e:
            print(f"[StrategyHandler] Warning: indicator calculation failed: {e}", flush=True)
        return candles

    @staticmethod
    def apply_htf_ema(
        candles: list,
        htf_candles: list = None,
        htf_ema_enabled: bool = False,
        htf_ema_period: int = 200
    ) -> list:
        """Step 3: Calculates and annotates HTF EMA trend filter."""
        if not candles:
            return []
        if not htf_ema_enabled:
            return candles

        try:
            if htf_candles and len(htf_candles) > 0:
                df = pd.DataFrame(candles)
                htf_df = pd.DataFrame(htf_candles)
                htf_ema_series = IndicatorHandler.htf_ema(df, htf_df, period=int(htf_ema_period), column='close')
                for idx, c in enumerate(candles):
                    ema_val = htf_ema_series.iloc[idx]
                    c['htf_ema_enabled'] = True
                    c['htf_ema'] = float(ema_val) if not pd.isna(ema_val) else None
            else:
                for c in candles:
                    c['htf_ema_enabled'] = True
        except Exception as e:
            print(f"[StrategyHandler] Warning: HTF EMA calculation failed: {e}", flush=True)
        return candles

    @staticmethod
    def prepare_annotated_candles(
        candles: list,
        strategy_or_params,
        htf_candles: list = None,
        progress_callback = None
    ) -> list:
        """
        Unified market data preparation pipeline shared across Backtest, Live Worker, and Optimization.
        Executes sequentially:
            Step 1: Wyckoff structure analysis
            Step 2: Indicators evaluation
            Step 3: HTF EMA filter
            (All future steps can be added here)
        """
        if not candles:
            return []

        strategy = StrategyHandler.get_strategy_settings(strategy_or_params, strict=False)
        lookback = int(strategy.get("lookbackWindow", 20))
        indicator_rules = strategy.get("indicatorRules") or []
        htf_ema_enabled = bool(strategy.get("htfEmaEnabled", False))
        htf_ema_period = int(strategy.get("htfEmaPeriod", 200))

        # Step 1: Wyckoff Structure Analysis
        annotated = StrategyHandler.analyze_wyckoff_structure(candles, lookback=lookback, progress_callback=progress_callback)
        if not annotated or len(annotated) < 2:
            return []

        # Step 2: Apply Indicators
        annotated = StrategyHandler.apply_indicators(annotated, indicator_rules=indicator_rules)

        # Step 3: Apply HTF EMA
        annotated = StrategyHandler.apply_htf_ema(annotated, htf_candles=htf_candles, htf_ema_enabled=htf_ema_enabled, htf_ema_period=htf_ema_period)

        return annotated

    @staticmethod
    def analyze_market_data(
        bars_list: list,
        lookback: int = 20,
        progress_callback=None,
        indicator_rules: list = None,
        htf_candles: list = None,
        htf_ema_enabled: bool = False,
        htf_ema_period: int = 200
    ) -> dict:
        """Step-by-step pipeline runner: Wyckoff -> Indicators -> HTF EMA."""
        annotated = StrategyHandler.prepare_annotated_candles(
            candles=bars_list,
            strategy_or_params={
                "lookbackWindow": lookback,
                "indicatorRules": indicator_rules,
                "htfEmaEnabled": htf_ema_enabled,
                "htfEmaPeriod": htf_ema_period
            },
            htf_candles=htf_candles,
            progress_callback=progress_callback
        )
        return {"status": "success", "data": annotated, "fvgs": []}

    @staticmethod
    def evaluate_signal(
        candles: list,
        strategy_or_params,
        htf_candles: list = None,
        progress_callback = None,
        is_live: bool = False
    ) -> tuple:
        """
        Unified market analysis and signal evaluation pipeline.
        Executes sequentially:
            1. Unified market data preparation (prepare_annotated_candles)
            2. Sequential candle state machine replay
        """
        if not candles or len(candles) < 2:
            return False, False, {"stage": "UNKNOWN", "status_message": "Insufficient candle history"}, []

        strategy = StrategyHandler.get_strategy_settings(strategy_or_params, strict=False)
        timezone_str = strategy.get("timezone", "Local")
        sessions = strategy.get("sessions") or []
        use_entry_cutoff = bool(strategy.get("useEntryCutoff", False))
        entry_cutoff_time = strategy.get("entryCutoffTime", "")

        # Step 0: Early Datetime & Session Schedule Check (bypass expensive calculations if out of session/cutoff)
        target_candle = candles[-2] if (is_live and len(candles) >= 2) else candles[-1]
        candle_time = int(target_candle.get('time', 0))
        from backtest_helpers import get_candle_datetime
        dt_curr = get_candle_datetime(candle_time, timezone_str)
        try:
            date_str = dt_curr.strftime('%Y-%m-%d')
        except Exception:
            date_str = 'unknown'

        if is_live and not StrategyHandler._is_timing_allowed(
            dt_curr=dt_curr,
            candle_time=candle_time,
            date_str=date_str,
            sessions=sessions,
            use_entry_cutoff=use_entry_cutoff,
            entry_cutoff_time=entry_cutoff_time
        ):
            from datetime import datetime
            time_str = datetime.fromtimestamp(candle_time).strftime("%Y-%m-%d %H:%M:%S") if candle_time else None
            state_info = {
                "stage": "OUT_OF_SESSION",
                "consec_bars": 0,
                "pending_buy": False,
                "pending_sell": False,
                "spring_high": None,
                "upthrust_low": None,
                "pending_buy_age": 0,
                "pending_sell_age": 0,
                "status_message": f"Outside active trading sessions or past entry cutoff ({timezone_str}).",
                "last_candle_time": time_str,
                "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            return False, False, state_info, candles

        # Unified Market Preparation (Steps 1, 2, 3)
        annotated_candles = StrategyHandler.prepare_annotated_candles(
            candles=candles,
            strategy_or_params=strategy,
            htf_candles=htf_candles,
            progress_callback=progress_callback
        )
        if not annotated_candles or len(annotated_candles) < 2:
            return False, False, {"stage": "UNKNOWN", "status_message": "Analysis returned empty dataset"}, []

        # Step 4: Sequential state machine evaluation
        eval_slice = annotated_candles[:-1] if is_live else annotated_candles
        state_dict = {}
        daily_signals_count = {}
        buy = False
        sell = False

        for c in eval_slice:
            buy, sell, state_dict = StrategyHandler.single_candle_signal(
                c=c,
                state=state_dict,
                strategy=strategy,
                daily_signals_count=daily_signals_count
            )

        # Extract final state telemetry
        accum_consec_bars = state_dict.get('accum_consec_bars', 0)
        dist_consec_bars = state_dict.get('dist_consec_bars', 0)
        pending_buy = state_dict.get('pending_buy', False)
        pending_sell = state_dict.get('pending_sell', False)
        spring_high = state_dict.get('spring_high', None)
        upthrust_low = state_dict.get('upthrust_low', None)
        pending_buy_age = state_dict.get('pending_buy_age', 0)
        pending_sell_age = state_dict.get('pending_sell_age', 0)

        last_c = eval_slice[-1] if eval_slice else {}
        final_stage = last_c.get('wyckoff_stage', 'TRANSITION')
        final_consec = accum_consec_bars if final_stage == "ACCUMULATION" else (dist_consec_bars if final_stage == "DISTRIBUTION" else 0)

        status_message = "Waiting for setup..."
        if pending_buy:
            status_message = f"Spring detected. Waiting for confirmation/stability. Close must cross above high {spring_high:.5f} (Age: {pending_buy_age}/15)."
        elif pending_sell:
            status_message = f"Upthrust detected. Waiting for confirmation/stability. Close must cross below low {upthrust_low:.5f} (Age: {pending_sell_age}/15)."
        else:
            status_message = f"Market in {final_stage} stage. Monitoring for Spring/Upthrust."

        from datetime import datetime
        last_c_time = last_c.get('time')
        last_c_time_str = datetime.fromtimestamp(last_c_time).strftime("%Y-%m-%d %H:%M:%S") if last_c_time else None

        state_info = {
            "stage": final_stage,
            "consec_bars": final_consec,
            "pending_buy": pending_buy,
            "pending_sell": pending_sell,
            "spring_high": spring_high,
            "upthrust_low": upthrust_low,
            "pending_buy_age": pending_buy_age,
            "pending_sell_age": pending_sell_age,
            "status_message": status_message,
            "last_candle_time": last_c_time_str,
            "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        return buy, sell, state_info, annotated_candles

    @staticmethod
    def get_strategy_settings(strategy_or_params, strict: bool = False) -> dict:
        """
        Fetches, validates, and normalizes strategy settings in 1 single pass.
        Accepts either a strategy dictionary or a strategy ID string.
        Ensures strict parameter integrity when strict=True (e.g. for LiveWorker),
        and applies standardized defaults when strict=False (e.g. for BacktestWorker).
        """
        if isinstance(strategy_or_params, str):
            strategy_obj = StrategyHandler.get_strategy(strategy_or_params)
            if not strategy_obj:
                raise ValueError(f"Strategy with ID '{strategy_or_params}' not found.")
            raw = dict(strategy_obj)
        else:
            raw = dict(strategy_or_params or {})

        # If strategy is nested under 'strategy', unpack and merge it
        if isinstance(raw.get('strategy'), dict):
            nested = raw.pop('strategy')
            merged = {**nested, **raw}
            raw = merged

        # Standardize aliases upfront
        if raw.get("broker") is None and (raw.get("candleSource") or raw.get("candle_source")):
            raw["broker"] = raw.get("candleSource") or raw.get("candle_source")
        if raw.get("broker") is None:
            raw["broker"] = "metatrader"

        if raw.get("lookbackWindow") is None and raw.get("lookback") is not None:
            raw["lookbackWindow"] = raw.get("lookback")

        if strict:
            required_fields = ["symbol", "timeframe", "lookbackWindow", "slVal", "slType", "rr", "broker"]

            missing_fields = [f for f in required_fields if raw.get(f) is None]

            use_risk_sizing = raw.get("useRiskSizing")
            if use_risk_sizing is None:
                missing_fields.append("useRiskSizing")
            elif use_risk_sizing and raw.get("riskPct") is None:
                missing_fields.append("riskPct")
            elif not use_risk_sizing and raw.get("size") is None:
                missing_fields.append("size")

            if raw.get("useBreakEven"):
                if raw.get("beTriggerR") is None:
                    missing_fields.append("beTriggerR")
                if raw.get("beOffsetMode") is None:
                    missing_fields.append("beOffsetMode")

            if raw.get("useGlobalClose") and not raw.get("globalCloseTime"):
                missing_fields.append("globalCloseTime")
            if raw.get("useEntryCutoff") and not raw.get("entryCutoffTime"):
                missing_fields.append("entryCutoffTime")

            if missing_fields:
                raise ValueError(f"Strategy integrity validation failed. Missing mandatory fields: {', '.join(missing_fields)}")

        lookback = raw.get('lookbackWindow', raw.get('lookback', 20))
        try:
            lookback_val = int(lookback) if lookback is not None else 20
        except (ValueError, TypeError):
            lookback_val = 20

        min_save_pnl = None
        if raw.get('minSavePnl') is not None and str(raw.get('minSavePnl')).strip() != '':
            try:
                min_save_pnl = float(raw.get('minSavePnl'))
            except (ValueError, TypeError):
                min_save_pnl = None

        normalized = {
            **raw,
            "id": str(raw.get("id", "")),
            "name": str(raw.get("name") or raw.get("strategy_name") or ""),
            "symbol": str(raw.get("symbol", "")),
            "timeframe": str(raw.get("timeframe", "5m")),
            "broker": str(raw.get("broker") or raw.get("candleSource") or "metatrader"),
            "account_id": raw.get("account_id") or raw.get("login"),
            "slVal": float(raw.get("slVal", 1.0)) if raw.get("slVal") is not None else 1.0,
            "slType": str(raw.get("slType", "pct")),
            "rr": float(raw.get("rr", 2.0)) if raw.get("rr") is not None else 2.0,
            "size": float(raw.get("size", 1.0)) if raw.get("size") is not None else 1.0,
            "initialBalance": float(raw.get("initialBalance", 10000.0)) if raw.get("initialBalance") is not None else 10000.0,
            "useRiskSizing": bool(raw.get("useRiskSizing", False)),
            "riskPct": float(raw.get("riskPct", 1.0)) if raw.get("riskPct") is not None else 1.0,
            "useBreakEven": bool(raw.get("useBreakEven", False)),
            "beTriggerR": float(raw.get("beTriggerR", 1.0)) if raw.get("beTriggerR") is not None else 1.0,
            "beOffsetMode": str(raw.get("beOffsetMode", "half_r")),
            "lookbackWindow": lookback_val,
            "feesPercent": float(raw.get("feesPercent", 0.0)) if raw.get("feesPercent") is not None else 0.0,
            "dailyRetryLimit": int(raw.get("dailyRetryLimit", 0)) if raw.get("dailyRetryLimit") is not None else 0,
            "allowOppositeClose": bool(raw.get("allowOppositeClose", True)),
            "timezone": str(raw.get("timezone", "Local")),
            "sessions": raw.get("sessions") or [],
            "useGlobalClose": bool(raw.get("useGlobalClose", False)),
            "globalCloseTime": str(raw.get("globalCloseTime", "")),
            "useEntryCutoff": bool(raw.get("useEntryCutoff", False)),
            "entryCutoffTime": str(raw.get("entryCutoffTime", "")),
            "entryStabilityRule": str(raw.get("entryStabilityRule", "default")),
            "dailyFirstSignalsMode": str(raw.get("dailyFirstSignalsMode", "disabled")),
            "dailyFirstSignalsCount": int(raw.get("dailyFirstSignalsCount", 0)) if raw.get("dailyFirstSignalsCount") is not None else 0,
            "dailyFirstSignalsRiskMult": float(raw.get("dailyFirstSignalsRiskMult", 0.5)) if raw.get("dailyFirstSignalsRiskMult") is not None else 0.5,
            "indicatorRules": raw.get("indicatorRules") or raw.get("indicator_rules") or [],
            "htfEmaEnabled": bool(raw.get("htfEmaEnabled", raw.get("htf_ema_enabled", False))),
            "htfEmaPeriod": int(raw.get("htfEmaPeriod", raw.get("htf_ema_period", 200))) if (raw.get("htfEmaPeriod") is not None or raw.get("htf_ema_period") is not None) else 200,
            "htfEmaTimeframe": str(raw.get("htfEmaTimeframe", raw.get("htf_ema_timeframe", "4h"))),
            "minSavePnl": min_save_pnl,
            "findBestSession": bool(raw.get("findBestSession", False)),
            "minHourlyPnl": float(raw.get("minHourlyPnl", 0.0)) if raw.get("minHourlyPnl") is not None else 0.0
        }
        return normalized

    @staticmethod
    def prepare_batch_strategies(params: dict) -> list:
        """
        Generates a list of standardized strategy configuration dictionaries.
        If params represent a single strategy, returns [StrategyHandler.get_strategy_settings(params, strict=False)].
        If params represent an optimization matrix (ranges for SL, RR, BE, HTF, symbols, timeframes),
        unrolls the full Cartesian product into individual strategy dictionaries.
        """
        if not params:
            return []

        raw = dict(params)
        if isinstance(raw.get('strategy'), dict):
            raw = {**raw.pop('strategy'), **raw}

        job_type = raw.get('type')
        has_matrix = (
            job_type == 'optimize'
            or bool(raw.get('slRangeMode'))
            or bool(raw.get('beRangeMode'))
            or bool(raw.get('beOffsetRangeMode'))
            or bool(raw.get('htfEmaRangeMode'))
            or (isinstance(raw.get('symbols'), list) and len(raw.get('symbols')) > 1)
            or (isinstance(raw.get('timeframes'), list) and len(raw.get('timeframes')) > 1)
            or (raw.get('rrStart') is not None and raw.get('rrEnd') is not None and raw.get('rrStart') != raw.get('rrEnd'))
        )

        if not has_matrix:
            return [StrategyHandler.get_strategy_settings(raw, strict=False)]

        symbols = raw.get('symbols') or [raw.get('symbol', 'BTCUSD')]
        timeframes = raw.get('timeframes') or [raw.get('timeframe') or raw.get('interval', '15m')]

        # Stop Loss values
        sl_val = float(raw.get('slVal', 1.0))
        if raw.get('slRangeMode') and raw.get('slStart') is not None and raw.get('slEnd') is not None and raw.get('slStep'):
            sl_values = []
            curr = float(raw['slStart'])
            sl_end = float(raw['slEnd'])
            sl_step = float(raw['slStep'])
            while curr <= sl_end + 0.0001:
                sl_values.append(round(curr, 2))
                curr += sl_step
        else:
            sl_values = [sl_val]

        # Reward-to-Risk values
        rr_start = float(raw.get('rrStart', raw.get('rr', 2.0)))
        rr_end = float(raw.get('rrEnd', rr_start))
        rr_step = float(raw.get('rrStep', 0.5))
        rr_values = []
        curr = rr_start
        while curr <= rr_end + 0.0001:
            rr_values.append(round(curr, 2))
            curr += rr_step
        if not rr_values:
            rr_values = [float(raw.get('rr', 2.0))]

        # Break-Even Trigger values
        use_break_even = bool(raw.get('useBreakEven', False))
        be_trigger_r = float(raw.get('beTriggerR', 1.0))
        if use_break_even and raw.get('beRangeMode') and raw.get('beStart') is not None and raw.get('beEnd') is not None and raw.get('beStep'):
            be_values = []
            curr = float(raw['beStart'])
            be_end = float(raw['beEnd'])
            be_step = float(raw['beStep'])
            while curr <= be_end + 0.0001:
                be_values.append(round(curr, 2))
                curr += be_step
        else:
            be_values = [be_trigger_r] if use_break_even else [None]

        # Break-Even Offset values
        be_offset_mode = str(raw.get('beOffsetMode', 'half_r'))
        if use_break_even and raw.get('beOffsetRangeMode') and raw.get('beOffsetStart') is not None and raw.get('beOffsetEnd') is not None and raw.get('beOffsetStep'):
            be_offset_values = []
            curr = float(raw['beOffsetStart'])
            be_offset_end = float(raw['beOffsetEnd'])
            be_offset_step = float(raw['beOffsetStep'])
            while curr <= be_offset_end + 0.0001:
                be_offset_values.append(str(round(curr, 2)))
                curr += be_offset_step
        else:
            be_offset_values = [be_offset_mode]

        # HTF EMA Modes
        htf_ema_enabled = bool(raw.get('htfEmaEnabled', False))
        if raw.get('htfEmaRangeMode'):
            htf_ema_modes = [False, True]
        else:
            htf_ema_modes = [htf_ema_enabled]

        strategies = []
        for s in symbols:
            for tf in timeframes:
                for sl in sl_values:
                    for rr in rr_values:
                        for be in be_values:
                            for be_off in be_offset_values:
                                for htf_on in htf_ema_modes:
                                    if use_break_even and be is not None and be >= rr:
                                        continue  # Skip invalid BE >= RR combinations
                                    combo = {
                                        **raw,
                                        "symbol": s,
                                        "timeframe": tf,
                                        "slVal": sl,
                                        "rr": rr,
                                        "useBreakEven": (be is not None),
                                        "beTriggerR": be if be is not None else 1.0,
                                        "beOffsetMode": be_off,
                                        "htfEmaEnabled": htf_on
                                    }
                                    normalized = StrategyHandler.get_strategy_settings(combo, strict=False)
                                    strategies.append(normalized)

        return strategies

    @staticmethod
    def run_backtest(
        candles: list = None,
        strategy: dict = None,
        strategies: list = None,
        symbol: str = None,
        broker: str = None,
        timeframe: str = None,
        date_from: float = None,
        date_to: float = None,
        candles_1m: list = None,
        htf_candles: list = None,
        progress_callback = None,
        check_cancelled = None,
        session_config: dict = None,
        lookback_window: int = None,
        fees_percent: float = None,
        daily_retry_limit: int = None,
        checkpoint_callback = None,
        start_index: int = 0,
        initial_results: list = None,
        account_id: str = None,
        candle_source: str = None,
        limit: int = 1000
    ) -> dict:
        """
        Universal Backtest Runner: Executes single strategy or batch strategy matrix.
        If given a single strategy (or strategies list of len 1), executes detailed single backtest.
        If given multiple strategies, executes batch matrix simulation with candle/indicator caching.
        """
        # Resolve strategy list
        if strategies is not None:
            strat_list = strategies
        elif isinstance(strategy, list):
            strat_list = strategy
        elif strategy is not None:
            strat_list = [strategy]
        else:
            strat_list = []

        # =========================================================================
        # SINGLE STRATEGY EXECUTION FLOW
        # =========================================================================
        if len(strat_list) <= 1:
            single_strat = strat_list[0] if strat_list else {}
            strat_settings = StrategyHandler.get_strategy_settings(single_strat, strict=False)
            symbol = symbol or strat_settings["symbol"]
            broker = broker or candle_source or strat_settings["broker"]
            tf = timeframe or strat_settings["timeframe"]
            date_from = date_from if date_from is not None else strat_settings.get('date_from', strat_settings.get('dateFrom'))
            date_to = date_to if date_to is not None else strat_settings.get('date_to', strat_settings.get('dateTo'))

            # Fetch candles if not provided
            if candles is None:
                from broker_handler import BrokerHandler
                handler = BrokerHandler.get_handler(broker)
                acc_id = account_id or strat_settings.get("account_id")
                candles = handler.fetch_candles(
                    symbol=symbol,
                    timeframe=tf,
                    limit=limit,
                    date_from=date_from,
                    date_to=date_to,
                    login=acc_id,
                    account_id=acc_id
                )
                if len(candles) > 1 and not date_to:
                    candles = candles[:-1]
                if not candles:
                    raise RuntimeError(f"Failed to fetch candles for '{symbol}' from broker '{broker}'. Zero candles returned.")

            sl_val = strat_settings["slVal"]
            sl_type = strat_settings["slType"]
            rr = strat_settings["rr"]
            size = strat_settings["size"]
            initial_balance = strat_settings["initialBalance"]
            use_risk_sizing = strat_settings["useRiskSizing"]
            risk_pct = strat_settings["riskPct"]
            use_break_even = strat_settings["useBreakEven"]
            be_trigger_r = strat_settings["beTriggerR"]
            be_offset_mode = strat_settings["beOffsetMode"]
            lookback_window = lookback_window if lookback_window is not None else strat_settings["lookbackWindow"]
            fees_percent = fees_percent if fees_percent is not None else strat_settings["feesPercent"]
            daily_retry_limit = daily_retry_limit if daily_retry_limit is not None else strat_settings["dailyRetryLimit"]
            allow_opposite_close = strat_settings["allowOppositeClose"]
            timezone = strat_settings["timezone"]
            sessions = strat_settings["sessions"]
            use_global_close = strat_settings["useGlobalClose"]
            global_close_time = strat_settings["globalCloseTime"]
            use_entry_cutoff = strat_settings["useEntryCutoff"]
            entry_cutoff_time = strat_settings["entryCutoffTime"]
            entry_stability_rule = strat_settings["entryStabilityRule"]
            daily_first_signals_mode = strat_settings["dailyFirstSignalsMode"]
            daily_first_signals_count = strat_settings["dailyFirstSignalsCount"]
            daily_first_signals_risk_mult = strat_settings["dailyFirstSignalsRiskMult"]
            indicator_rules = strat_settings["indicatorRules"]
            htf_ema_enabled = strat_settings["htfEmaEnabled"]
            htf_ema_period = strat_settings["htfEmaPeriod"]
            htf_ema_timeframe = strat_settings["htfEmaTimeframe"]
            min_save_pnl = strat_settings["minSavePnl"]
            find_best_session = strat_settings["findBestSession"]
            min_hourly_pnl = strat_settings["minHourlyPnl"]

            from colorama import Fore, Style
            htf_str = f" | HTF EMA: {htf_ema_timeframe} {htf_ema_period} EMA" if htf_ema_enabled else ""
            print(f"\n{Fore.CYAN}[Backtest]{Style.RESET_ALL} Starting Wyckoff Structure Analysis backtest for {symbol} on {len(candles)} candles (1m Intrabar: {'Enabled' if candles_1m else 'Off'}{htf_str})...", flush=True)

            if use_break_even and be_trigger_r >= rr:
                print(f"{Fore.YELLOW}[Backtest]{Style.RESET_ALL} Warning: Break-Even trigger ({be_trigger_r}R) >= RR ({rr}R). Disabling Break-Even to prevent non-sensical simulation.", flush=True)
                use_break_even = False

            # 1. Run Market Data Analysis (0% to 50% progress)
            wrapped_cb = None
            if progress_callback:
                wrapped_cb = lambda p: progress_callback(int(p / 2))

            annotated_data = StrategyHandler.prepare_annotated_candles(
                candles=candles,
                strategy_or_params=strat_settings,
                htf_candles=htf_candles,
                progress_callback=wrapped_cb
            )
            if not annotated_data:
                return {"status": "error", "message": "Failed to analyze Wyckoff structure"}

            # 2. Run Trade Simulation (50% to 100% progress)
            from backtest_helpers import run_trade_simulation
            sim_cb = (lambda p: progress_callback(50 + int(p / 4))) if (progress_callback and find_best_session) else progress_callback

            pass1_sessions = [] if find_best_session else sessions

            sim_result = run_trade_simulation(
                annotated_data=annotated_data,
                symbol=symbol,
                sl_val=sl_val,
                sl_type=sl_type,
                rr=rr,
                size=size,
                initial_balance=initial_balance,
                use_risk_sizing=use_risk_sizing,
                risk_pct=risk_pct,
                use_break_even=use_break_even,
                be_trigger_r=be_trigger_r,
                be_offset_mode=be_offset_mode,
                fees_percent=fees_percent,
                daily_retry_limit=daily_retry_limit,
                allow_opposite_close=allow_opposite_close,
                check_cancelled=check_cancelled,
                date_from=date_from,
                date_to=date_to,
                timezone=timezone,
                sessions=pass1_sessions,
                use_global_close=use_global_close,
                global_close_time=global_close_time,
                use_entry_cutoff=use_entry_cutoff,
                entry_cutoff_time=entry_cutoff_time,
                progress_callback=sim_cb,
                entry_stability_rule=entry_stability_rule,
                session_config=session_config,
                daily_first_signals_mode=daily_first_signals_mode,
                daily_first_signals_count=daily_first_signals_count,
                daily_first_signals_risk_mult=daily_first_signals_risk_mult,
                candles_1m=candles_1m
            )

            from candle_sanitizer import sanitize_and_fill_candles
            annotated_data = sanitize_and_fill_candles(annotated_data)

            from sql_handler import SQLHandler
            ts_now = int(time.time())
            baseline_summary = {
                "netPnl": sim_result["netPnl"],
                "winRate": sim_result["winRate"],
                "profitFactor": sim_result["profitFactor"],
                "totalTrades": sim_result["totalTrades"]
            }

            try:
                full_run_id = f"bt_{symbol.lower()}_{tf}_sl{sl_val}_rr{rr}_be{be_trigger_r}_full_{ts_now}" if find_best_session else f"bt_{symbol.lower()}_{tf}_sl{sl_val}_rr{rr}_be{be_trigger_r}_{ts_now}"
                full_results_to_save = {
                    "explainer": "Wyckoff Structure Analysis backtest (Full / Baseline 24/7)" if find_best_session else "Wyckoff Structure Analysis backtest.",
                    "settings": {
                        "symbol": symbol,
                        "timeframe": tf,
                        "broker": broker,
                        "sl_val": sl_val,
                        "sl_type": sl_type,
                        "rr": rr,
                        "size": size,
                        "initial_balance": initial_balance,
                        "use_risk_sizing": use_risk_sizing,
                        "risk_pct": risk_pct,
                        "use_break_even": use_break_even,
                        "be_trigger_r": be_trigger_r,
                        "be_offset_mode": be_offset_mode,
                        "lookback_window": lookback_window,
                        "fees_percent": fees_percent,
                        "daily_retry_limit": daily_retry_limit,
                        "allow_opposite_close": allow_opposite_close,
                        "date_from": date_from,
                        "date_to": date_to,
                        "timezone": timezone,
                        "sessions": pass1_sessions,
                        "use_global_close": use_global_close,
                        "global_close_time": global_close_time,
                        "use_entry_cutoff": use_entry_cutoff,
                        "entry_cutoff_time": entry_cutoff_time,
                        "entry_stability_rule": entry_stability_rule,
                        "indicator_rules": indicator_rules,
                        "htf_ema_enabled": htf_ema_enabled,
                        "htf_ema_period": htf_ema_period,
                        "htf_ema_timeframe": htf_ema_timeframe,
                        "limit": len(annotated_data)
                    },
                    "metrics": {
                        "winRate": sim_result["winRate"],
                        "netPnl": sim_result["netPnl"],
                        "profitFactor": sim_result["profitFactor"],
                        "totalTrades": sim_result["totalTrades"],
                        "maxDrawdown": sim_result["maxDrawdown"],
                        "maxDailyLoss": sim_result["maxDailyLoss"],
                        "dailyLossBreached": sim_result["dailyLossBreached"],
                        "candleCount": len(annotated_data)
                    },
                    "trades": sim_result["completed_trades_raw"]
                }

                SQLHandler.save_backtest_run(
                    backtest_id=full_run_id,
                    symbol=symbol,
                    timeframe=tf,
                    broker=broker,
                    sl_val=sl_val,
                    sl_type=sl_type,
                    rr=rr,
                    be_trigger_r=be_trigger_r,
                    net_pnl=sim_result["netPnl"],
                    win_rate=sim_result["winRate"],
                    trades_cnt=sim_result["totalTrades"],
                    profit_factor=sim_result["profitFactor"],
                    max_drawdown=sim_result["maxDrawdown"],
                    payload_dict=full_results_to_save,
                    min_pnl=min_save_pnl
                )
                print(f"{Fore.GREEN}[SQLHandler]{Style.RESET_ALL} Successfully saved baseline backtest run '{full_run_id}' to MySQL DB.", flush=True)
            except Exception as sql_err:
                print(f"{Fore.RED}[SQLHandler]{Style.RESET_ALL} Failed saving baseline backtest run: {sql_err}", flush=True)

            discovered_sessions = []
            hourly_breakdown = {}

            # Pass 2: If Find Best Session is active, discover winning hours and re-run simulation
            if find_best_session:
                completed_trades = sim_result.get("completed_trades_raw", [])
                discovered_sessions, hourly_breakdown = StrategyHandler.filter_best_sessions_from_trades(
                    trades=completed_trades,
                    timezone_str=timezone,
                    min_hourly_pnl=min_hourly_pnl
                )
                print(f"{Fore.CYAN}[FindBestSession]{Style.RESET_ALL} Discovered {len(discovered_sessions)} profitable 1-hour sessions (Min PnL > ${min_hourly_pnl:.2f}) from {len(completed_trades)} baseline trades.", flush=True)

                if discovered_sessions:
                    pass2_cb = (lambda p: progress_callback(75 + int(p / 4))) if progress_callback else None
                    sim_result = run_trade_simulation(
                        annotated_data=annotated_data,
                        symbol=symbol,
                        sl_val=sl_val,
                        sl_type=sl_type,
                        rr=rr,
                        size=size,
                        initial_balance=initial_balance,
                        use_risk_sizing=use_risk_sizing,
                        risk_pct=risk_pct,
                        use_break_even=use_break_even,
                        be_trigger_r=be_trigger_r,
                        be_offset_mode=be_offset_mode,
                        fees_percent=fees_percent,
                        daily_retry_limit=daily_retry_limit,
                        allow_opposite_close=allow_opposite_close,
                        check_cancelled=check_cancelled,
                        date_from=date_from,
                        date_to=date_to,
                        timezone=timezone,
                        sessions=discovered_sessions,
                        use_global_close=use_global_close,
                        global_close_time=global_close_time,
                        use_entry_cutoff=use_entry_cutoff,
                        entry_cutoff_time=entry_cutoff_time,
                        progress_callback=pass2_cb,
                        entry_stability_rule=entry_stability_rule,
                        session_config=session_config,
                        daily_first_signals_mode=daily_first_signals_mode,
                        daily_first_signals_count=daily_first_signals_count,
                        daily_first_signals_risk_mult=daily_first_signals_risk_mult,
                        candles_1m=candles_1m
                    )

                    # Persist Pass 2 (Session-Optimized) Run to MySQL DB
                    try:
                        session_run_id = f"bt_{symbol.lower()}_{tf}_sl{sl_val}_rr{rr}_be{be_trigger_r}_session_{ts_now}"
                        session_results_to_save = {
                            "explainer": "Wyckoff Structure Analysis backtest (Session-Optimized)",
                            "settings": {
                                "symbol": symbol,
                                "timeframe": tf,
                                "broker": broker,
                                "sl_val": sl_val,
                                "sl_type": sl_type,
                                "rr": rr,
                                "size": size,
                                "initial_balance": initial_balance,
                                "use_risk_sizing": use_risk_sizing,
                                "risk_pct": risk_pct,
                                "use_break_even": use_break_even,
                                "be_trigger_r": be_trigger_r,
                                "be_offset_mode": be_offset_mode,
                                "lookback_window": lookback_window,
                                "fees_percent": fees_percent,
                                "daily_retry_limit": daily_retry_limit,
                                "allow_opposite_close": allow_opposite_close,
                                "date_from": date_from,
                                "date_to": date_to,
                                "timezone": timezone,
                                "sessions": discovered_sessions,
                                "use_global_close": use_global_close,
                                "global_close_time": global_close_time,
                                "use_entry_cutoff": use_entry_cutoff,
                                "entry_cutoff_time": entry_cutoff_time,
                                "entry_stability_rule": entry_stability_rule,
                                "indicator_rules": indicator_rules,
                                "htf_ema_enabled": htf_ema_enabled,
                                "htf_ema_period": htf_ema_period,
                                "htf_ema_timeframe": htf_ema_timeframe,
                                "limit": len(annotated_data)
                            },
                            "metrics": {
                                "winRate": sim_result["winRate"],
                                "netPnl": sim_result["netPnl"],
                                "profitFactor": sim_result["profitFactor"],
                                "totalTrades": sim_result["totalTrades"],
                                "maxDrawdown": sim_result["maxDrawdown"],
                                "maxDailyLoss": sim_result["maxDailyLoss"],
                                "dailyLossBreached": sim_result["dailyLossBreached"],
                                "candleCount": len(annotated_data)
                            },
                            "trades": sim_result["completed_trades_raw"]
                        }

                        SQLHandler.save_backtest_run(
                            backtest_id=session_run_id,
                            symbol=symbol,
                            timeframe=tf,
                            broker=broker,
                            sl_val=sl_val,
                            sl_type=sl_type,
                            rr=rr,
                            be_trigger_r=be_trigger_r,
                            net_pnl=sim_result["netPnl"],
                            win_rate=sim_result["winRate"],
                            trades_cnt=sim_result["totalTrades"],
                            profit_factor=sim_result["profitFactor"],
                            max_drawdown=sim_result["maxDrawdown"],
                            payload_dict=session_results_to_save,
                            min_pnl=min_save_pnl
                        )
                        print(f"{Fore.GREEN}[SQLHandler]{Style.RESET_ALL} Successfully saved session-optimized backtest run '{session_run_id}' to MySQL DB.", flush=True)
                    except Exception as sql_err:
                        print(f"{Fore.RED}[SQLHandler]{Style.RESET_ALL} Failed saving session backtest run: {sql_err}", flush=True)

            return {
                "status": "success",
                "strategy_type": "wyckoff",
                "symbol": symbol,
                "timeframe": tf,
                "summary": baseline_summary,
                "trades": sim_result["trades"],
                "completed_trades_raw": sim_result["completed_trades_raw"],
                "winRate": sim_result["winRate"],
                "netPnl": sim_result["netPnl"],
                "profitFactor": sim_result["profitFactor"],
                "totalTrades": sim_result["totalTrades"],
                "maxDrawdown": sim_result["maxDrawdown"],
                "maxDailyLoss": sim_result["maxDailyLoss"],
                "dailyLossBreached": sim_result["dailyLossBreached"],
                "candles": annotated_data,
                "monthlyBreakdown": sim_result["monthlyBreakdown"],
                "weeklyBreakdown": sim_result["weeklyBreakdown"],
                "dateFrom": sim_result.get("dateFrom"),
                "dateTo": sim_result.get("dateTo"),
                "discovered_sessions": discovered_sessions,
                "hourly_breakdown": hourly_breakdown,
                "baseline_summary": baseline_summary if find_best_session else None,
                "fvgs": []
            }

        # =========================================================================
        # BATCH STRATEGY / OPTIMIZATION MATRIX EXECUTION FLOW
        # =========================================================================
        from broker_handler import BrokerHandler
        from backtest_helpers import run_trade_simulation
        from sql_handler import SQLHandler

        total_runs = len(strat_list)
        results = list(initial_results) if initial_results else []
        candle_cache = {}
        candles_1m_cache = {}
        analysis_cache = {}
        recent_durations = []
        overall_start_time = time.time()

        print("\n==========================================================================", flush=True)
        print(f"[Batch Backtest] STARTING BATCH EXECUTION ({total_runs} STRATEGIES)", flush=True)
        print("==========================================================================\n", flush=True)

        for idx in range(start_index, total_runs):
            if check_cancelled and check_cancelled():
                print(f"[Batch Backtest] Cancel signal detected at run {idx+1}/{total_runs}. Halting execution.", flush=True)
                break

            strat = strat_list[idx]
            s = strat["symbol"]
            tf = strat["timeframe"]
            sl = strat["slVal"]
            sl_type = strat["slType"]
            rr = strat["rr"]
            be = strat["beTriggerR"] if strat.get("useBreakEven") else None
            be_off = strat.get("beOffsetMode", "half_r")
            size = strat["size"]
            initial_balance = strat["initialBalance"]
            use_risk_sizing = strat["useRiskSizing"]
            risk_pct = strat["riskPct"]
            lookback_window = strat["lookbackWindow"]
            fees_percent = strat["feesPercent"]
            daily_retry_limit = strat["dailyRetryLimit"]
            allow_opposite_close = strat["allowOppositeClose"]
            timezone = strat["timezone"]
            sessions = strat["sessions"]
            use_global_close = strat["useGlobalClose"]
            global_close_time = strat["globalCloseTime"]
            use_entry_cutoff = strat["useEntryCutoff"]
            entry_cutoff_time = strat["entryCutoffTime"]
            entry_stability_rule = strat["entryStabilityRule"]
            daily_first_signals_mode = strat["dailyFirstSignalsMode"]
            daily_first_signals_count = strat["dailyFirstSignalsCount"]
            daily_first_signals_risk_mult = strat["dailyFirstSignalsRiskMult"]
            htf_on = strat["htfEmaEnabled"]
            htf_per = strat["htfEmaPeriod"]
            htf_tf = strat["htfEmaTimeframe"]
            min_save_pnl = strat.get("minSavePnl")
            broker_src = broker or candle_source or strat.get("broker", "metatrader")
            acc_id = account_id or strat.get("account_id")
            d_from = date_from if date_from is not None else strat.get("date_from", strat.get("dateFrom"))
            d_to = date_to if date_to is not None else strat.get("date_to", strat.get("dateTo"))

            run_start_time = time.time()
            cache_key = (s, tf, lookback_window, htf_on, htf_per, htf_tf)

            # Fetch / cache primary candles
            candle_key = (s, tf, broker_src)
            if candle_key not in candle_cache:
                handler = BrokerHandler.get_handler(broker_src)
                try:
                    c_data = handler.fetch_candles(
                        symbol=s,
                        timeframe=tf,
                        limit=limit,
                        date_from=d_from,
                        date_to=d_to,
                        account_id=acc_id
                    )
                    if len(c_data) > 1 and not d_to:
                        c_data = c_data[:-1]
                    candle_cache[candle_key] = c_data
                except Exception as e:
                    print(f"[Batch Backtest] Failed to fetch candles for {s} {tf}: {e}", flush=True)
                    continue

            c_list = candle_cache.get(candle_key, [])
            if not c_list:
                print(f"[Batch Backtest] No candle data available for {s} {tf}.", flush=True)
                continue

            # Fetch / cache HTF candles if needed
            htf_candles_opt = None
            if htf_on:
                htf_key = (s, htf_tf, broker_src)
                if htf_key not in candle_cache:
                    handler = BrokerHandler.get_handler(broker_src)
                    try:
                        h_data = handler.fetch_candles(
                            symbol=s,
                            timeframe=htf_tf,
                            limit=limit,
                            date_from=d_from,
                            date_to=d_to,
                            account_id=acc_id
                        )
                        if len(h_data) > 1 and not d_to:
                            h_data = h_data[:-1]
                        candle_cache[htf_key] = h_data
                    except Exception as e_htf:
                        print(f"[Batch Backtest] Warning: Failed to fetch HTF candles for {s} {htf_tf}: {e_htf}", flush=True)
                        candle_cache[htf_key] = None
                htf_candles_opt = candle_cache.get(htf_key)

            # Prepare / cache annotated market data
            if cache_key not in analysis_cache:
                opt_annotated = StrategyHandler.prepare_annotated_candles(
                    candles=c_list,
                    strategy_or_params=strat,
                    htf_candles=htf_candles_opt,
                    progress_callback=lambda p: None
                )
                analysis_cache[cache_key] = opt_annotated

            annotated_data = analysis_cache[cache_key]
            if not annotated_data:
                print(f"[Batch Backtest] No market data analyzed for {s} {tf}.", flush=True)
                continue

            # Fetch / cache 1m candles for intrabar resolution
            candles_1m_opt = None
            if tf.lower() not in ('1m', '1min'):
                if s not in candles_1m_cache:
                    handler = BrokerHandler.get_handler(broker_src)
                    try:
                        c_1m = handler.fetch_candles(
                            symbol=s,
                            timeframe='1m',
                            limit=limit * 15,
                            date_from=d_from,
                            date_to=d_to,
                            account_id=acc_id
                        )
                        if len(c_1m) > 1 and not d_to:
                            c_1m = c_1m[:-1]
                        candles_1m_cache[s] = c_1m
                    except Exception as e:
                        print(f"[Batch Backtest] Warning: Failed to fetch 1m candles for {s}: {e}", flush=True)
                        candles_1m_cache[s] = []
                candles_1m_opt = candles_1m_cache.get(s)

            sim_result = run_trade_simulation(
                annotated_data=annotated_data,
                symbol=s,
                sl_val=sl,
                sl_type=sl_type,
                rr=rr,
                size=size,
                initial_balance=initial_balance,
                use_risk_sizing=use_risk_sizing,
                risk_pct=risk_pct,
                use_break_even=(be is not None),
                be_trigger_r=be if be is not None else 1.0,
                be_offset_mode=be_off,
                fees_percent=fees_percent,
                daily_retry_limit=daily_retry_limit,
                allow_opposite_close=allow_opposite_close,
                check_cancelled=check_cancelled,
                date_from=d_from,
                date_to=d_to,
                timezone=timezone,
                sessions=sessions,
                use_global_close=use_global_close,
                global_close_time=global_close_time,
                use_entry_cutoff=use_entry_cutoff,
                entry_cutoff_time=entry_cutoff_time,
                progress_callback=None,
                entry_stability_rule=entry_stability_rule,
                daily_first_signals_mode=daily_first_signals_mode,
                daily_first_signals_count=daily_first_signals_count,
                daily_first_signals_risk_mult=daily_first_signals_risk_mult,
                candles_1m=candles_1m_opt,
                verbose=False
            )

            run_duration = time.time() - run_start_time
            pnl = sim_result["netPnl"]
            win_rate = sim_result["winRate"]
            trades_cnt = sim_result["totalTrades"]
            pf = sim_result["profitFactor"]
            pnl_str = f"+${pnl:.2f}" if pnl >= 0 else f"-${abs(pnl):.2f}"
            be_str = f"{be}R ({be_off})" if be is not None else "Off"

            recent_durations.append(run_duration)
            if len(recent_durations) > 10:
                recent_durations.pop(0)

            avg_dur = sum(recent_durations) / len(recent_durations)
            rem_jobs = total_runs - (idx + 1)
            eta_sec = int(rem_jobs * avg_dur)
            eta_str = f"ETA: {eta_sec // 60}m {eta_sec % 60}s" if eta_sec >= 60 else f"ETA: {eta_sec}s"
            pct = round(((idx + 1) / total_runs) * 100, 1)

            if min_save_pnl is None or pnl >= float(min_save_pnl):
                print(f"[Batch Backtest] [{idx+1}/{total_runs}] ({pct}%) Testing {s} ({tf}) | SL:{sl}{sl_type} RR:1:{rr} BE:{be_str} -> {pnl_str} | WR: {win_rate:.1f}% | Trades: {trades_cnt} | PF: {pf:.2f} ({run_duration:.2f}s | {eta_str})", flush=True)

            # Auto-persist iteration run to MySQL database if qualified
            try:
                htf_tag = f"_htf{htf_per}" if htf_on else ""
                backtest_id_str = f"bt_{s.lower()}_{tf}_sl{sl}_rr{rr}_be{be_str}{htf_tag}_{int(time.time())}"
                results_to_save = {
                    "settings": {
                        "symbol": s,
                        "timeframe": tf,
                        "sl_val": sl,
                        "sl_type": sl_type,
                        "rr": rr,
                        "be_trigger_r": be,
                        "be_offset_mode": be_off,
                        "size": size,
                        "initial_balance": initial_balance,
                        "use_risk_sizing": use_risk_sizing,
                        "risk_pct": risk_pct,
                        "use_break_even": (be is not None),
                        "lookback_window": lookback_window,
                        "fees_percent": fees_percent,
                        "daily_retry_limit": daily_retry_limit,
                        "allow_opposite_close": allow_opposite_close,
                        "timezone": timezone,
                        "sessions": sessions,
                        "use_global_close": use_global_close,
                        "global_close_time": global_close_time,
                        "use_entry_cutoff": use_entry_cutoff,
                        "entry_cutoff_time": entry_cutoff_time,
                        "entry_stability_rule": entry_stability_rule,
                        "htf_ema_enabled": htf_on,
                        "htf_ema_period": htf_per,
                        "htf_ema_timeframe": htf_tf,
                        "date_from": d_from,
                        "date_to": d_to,
                        "limit": len(annotated_data)
                    },
                    "metrics": {
                        "winRate": sim_result["winRate"],
                        "netPnl": sim_result["netPnl"],
                        "profitFactor": sim_result["profitFactor"],
                        "totalTrades": sim_result["totalTrades"],
                        "maxDrawdown": sim_result["maxDrawdown"],
                        "maxDailyLoss": sim_result["maxDailyLoss"],
                        "dailyLossBreached": sim_result["dailyLossBreached"],
                        "candleCount": len(annotated_data),
                        "executionTimeSec": round(run_duration, 3)
                    },
                    "trades": sim_result["completed_trades_raw"]
                }
                SQLHandler.save_backtest_run(
                    backtest_id=backtest_id_str,
                    symbol=s,
                    timeframe=tf,
                    broker=broker_src,
                    sl_val=sl,
                    sl_type=sl_type,
                    rr=rr,
                    be_trigger_r=be if be is not None else 0.0,
                    net_pnl=sim_result["netPnl"],
                    win_rate=sim_result["winRate"],
                    trades_cnt=sim_result["totalTrades"],
                    profit_factor=sim_result["profitFactor"],
                    max_drawdown=sim_result["maxDrawdown"],
                    payload_dict=results_to_save,
                    min_pnl=min_save_pnl
                )
            except Exception as e:
                print(f"[SQLHandler] Failed auto-persisting backtest run to MySQL DB for {s} {tf}: {e}", flush=True)

            results.append({
                "symbol": s,
                "timeframe": tf,
                "sl": sl,
                "slType": sl_type,
                "rr": rr,
                "be": be,
                "beOffsetMode": be_off,
                "htfEmaEnabled": htf_on,
                "htfEmaPeriod": htf_per,
                "htfEmaTimeframe": htf_tf,
                "winRate": sim_result["winRate"],
                "netPnl": sim_result["netPnl"],
                "profitFactor": sim_result["profitFactor"],
                "totalTrades": sim_result["totalTrades"],
                "maxDrawdown": sim_result["maxDrawdown"],
                "maxDailyLoss": sim_result["maxDailyLoss"],
                "dailyLossBreached": sim_result["dailyLossBreached"],
                "executionTimeSec": round(run_duration, 3)
            })

            if checkpoint_callback:
                try:
                    checkpoint_callback(idx + 1, results)
                except Exception:
                    pass

        if progress_callback:
            progress_callback(100)

        total_duration = time.time() - overall_start_time
        duration_str = f"{int(total_duration // 60)}m {total_duration % 60:.2f}s" if total_duration >= 60 else f"{total_duration:.2f}s"
        best_combo = max(results, key=lambda x: x['netPnl']) if results else None
        if best_combo:
            print(f"[Batch Backtest] Completed batch execution ({len(results)} runs) in {duration_str}. Best Net PnL: +${best_combo['netPnl']:.2f} ({best_combo['symbol']} {best_combo['timeframe']} SL:{best_combo['sl']} RR:{best_combo['rr']})", flush=True)
        else:
            print(f"[Batch Backtest] Completed batch execution ({len(results)} runs) in {duration_str}.", flush=True)

        return {
            "status": "success",
            "results": results,
            "totalExecutionTimeSec": round(total_duration, 2)
        }

    @staticmethod
    def run_optimization(**kwargs) -> dict:
        """Alias delegating to prepare_batch_strategies and universal run_backtest."""
        strategies = StrategyHandler.prepare_batch_strategies(kwargs)
        return StrategyHandler.run_backtest(
            strategies=strategies,
            date_from=kwargs.get('date_from'),
            date_to=kwargs.get('date_to'),
            account_id=kwargs.get('account_id'),
            broker=kwargs.get('broker') or kwargs.get('candle_source', 'metatrader'),
            limit=kwargs.get('limit', 1000),
            progress_callback=kwargs.get('progress_callback'),
            check_cancelled=kwargs.get('check_cancelled'),
            checkpoint_callback=kwargs.get('checkpoint_callback'),
            start_index=kwargs.get('start_index', 0),
            initial_results=kwargs.get('initial_results')
        )

    @staticmethod
    def filter_best_sessions_from_trades(trades: list, timezone_str: str = 'Local', min_hourly_pnl: float = 0.0) -> tuple:
        """
        Groups trades by entry hour in specified timezone, filters hours with total PnL > min_hourly_pnl
        (and at least 1 trade), and generates 1-hour session objects for all 7 weekdays.
        Returns (discovered_sessions, hourly_stats).
        """
        from backtest_helpers import get_candle_datetime
        hourly_stats = {h: {"count": 0, "wins": 0, "pnl": 0.0} for h in range(24)}
        for tr in trades:
            ts = tr.get('entryTimestamp') or tr.get('entry_time') or tr.get('entry_timestamp')
            if not ts:
                continue
            dt = get_candle_datetime(float(ts), timezone_str)
            h = dt.hour
            pnl = float(tr.get('pnl', 0.0))
            hourly_stats[h]["count"] += 1
            hourly_stats[h]["pnl"] += pnl
            if tr.get('outcome') == 'WIN' or pnl >= 0:
                hourly_stats[h]["wins"] += 1

        discovered_sessions = []
        for h in range(24):
            stat = hourly_stats[h]
            if stat["count"] > 0 and stat["pnl"] > min_hourly_pnl:
                discovered_sessions.append({
                    "id": f"sess_h{h:02d}",
                    "name": f"Hour {h:02d}:00-{h:02d}:59",
                    "start": f"{h:02d}:00",
                    "end": f"{h:02d}:59",
                    "weekdays": [1, 2, 3, 4, 5, 6, 7],
                    "active": True
                })

        return discovered_sessions, hourly_stats
