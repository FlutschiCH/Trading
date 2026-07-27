import os
import json
import time
from sql_handler import SQLHandler

# No local config path

class LiveStrategyHandler:
    _db_initialized = False

    @staticmethod
    def init_db():
        """
        Initializes the schema for live strategies in the DB.
        """
        if LiveStrategyHandler._db_initialized:
            return
        # Check if table has 'id' column, if not drop it to migrate
        try:
            SQLHandler.execute_query("SELECT id FROM live_strategies LIMIT 1")
        except Exception:
            try:
                SQLHandler.execute_query("DROP TABLE IF EXISTS live_strategies")
            except Exception:
                pass

        # Create MySQL style table
        create_mysql = """
        CREATE TABLE IF NOT EXISTS live_strategies (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) DEFAULT '',
            symbol VARCHAR(50) NOT NULL,
            status VARCHAR(20) NOT NULL,
            timeframe VARCHAR(10) NOT NULL,
            slVal DOUBLE NOT NULL,
            slType VARCHAR(10) NOT NULL,
            rr DOUBLE NOT NULL,
            size DOUBLE NOT NULL,
            useRiskSizing TINYINT(1) NOT NULL,
            riskPct DOUBLE NOT NULL,
            useBreakEven TINYINT(1) NOT NULL,
            beTriggerR DOUBLE NOT NULL,
            lookbackWindow INT NOT NULL,
            deployedAt VARCHAR(50) NOT NULL,
            timezone VARCHAR(10) DEFAULT 'Local',
            sessions TEXT,
            useGlobalClose TINYINT(1) DEFAULT 0,
            globalCloseTime VARCHAR(5) DEFAULT '',
            entryStabilityRule VARCHAR(20) DEFAULT 'default',
            broker VARCHAR(50) DEFAULT 'metatrader',
            account_id VARCHAR(100),
            live_state TEXT
        )
        """
        create_targets_table = """
        CREATE TABLE IF NOT EXISTS live_strategy_targets (
            id VARCHAR(50) PRIMARY KEY,
            strategy_id VARCHAR(50) NOT NULL,
            account_id VARCHAR(100) NOT NULL,
            broker VARCHAR(50) NOT NULL
        )
        """
        try:
            SQLHandler.execute_query(create_mysql)
            SQLHandler.execute_query(create_targets_table)
            # Add name column if not exists
            try:
                SQLHandler.execute_query("SELECT name FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN name VARCHAR(100) DEFAULT ''")
                except Exception:
                    pass
            # Add broker column if not exists
            try:
                SQLHandler.execute_query("SELECT broker FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN broker VARCHAR(50) DEFAULT 'metatrader'")
                except Exception:
                    pass
            # Add account_id column if not exists
            try:
                SQLHandler.execute_query("SELECT account_id FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN account_id VARCHAR(100)")
                except Exception:
                    pass
            # Try to query live_state column, if not exists, alter table to add it
            try:
                SQLHandler.execute_query("SELECT live_state FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN live_state TEXT")
                except Exception:
                    pass
            # Add target_computer column if not exists
            try:
                SQLHandler.execute_query("SELECT target_computer FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN target_computer VARCHAR(100) DEFAULT 'All'")
                except Exception:
                    pass
            # Add dateRangeOption column if not exists
            try:
                SQLHandler.execute_query("SELECT dateRangeOption FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN dateRangeOption VARCHAR(50) DEFAULT 'last_candles'")
                except Exception:
                    pass
            # Add customFrom column if not exists
            try:
                SQLHandler.execute_query("SELECT customFrom FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN customFrom VARCHAR(100) DEFAULT ''")
                except Exception:
                    pass
            # Add customTo column if not exists
            try:
                SQLHandler.execute_query("SELECT customTo FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN customTo VARCHAR(100) DEFAULT ''")
                except Exception:
                    pass
            # Add candleLimit column if not exists
            try:
                SQLHandler.execute_query("SELECT candleLimit FROM live_strategies LIMIT 1")
            except Exception:
                try:
                    SQLHandler.execute_query("ALTER TABLE live_strategies ADD COLUMN candleLimit INT DEFAULT 1000")
                except Exception:
                    pass
            LiveStrategyHandler._db_initialized = True
        except Exception as e:
            print(f"Error initializing live_strategies DB table: {e}", flush=True)


    @staticmethod
    def save_strategy(strategy: dict) -> bool:
        """
        Saves the strategy configuration to the SQL database using an upsert pattern.
        """
        LiveStrategyHandler.init_db()
        if "id" not in strategy or not strategy["id"]:
            import uuid
            strategy["id"] = str(uuid.uuid4())

        query = """
        INSERT INTO live_strategies (
            id, name, symbol, status, timeframe, slVal, slType, rr, size, 
            useRiskSizing, riskPct, useBreakEven, beTriggerR, lookbackWindow, deployedAt,
            timezone, sessions, useGlobalClose, globalCloseTime, entryStabilityRule, broker, account_id, target_computer,
            dateRangeOption, customFrom, customTo, candleLimit
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
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
            lookbackWindow=VALUES(lookbackWindow),
            deployedAt=VALUES(deployedAt),
            timezone=VALUES(timezone),
            sessions=VALUES(sessions),
            useGlobalClose=VALUES(useGlobalClose),
            globalCloseTime=VALUES(globalCloseTime),
            entryStabilityRule=VALUES(entryStabilityRule),
            broker=VALUES(broker),
            account_id=VALUES(account_id),
            target_computer=VALUES(target_computer),
            dateRangeOption=VALUES(dateRangeOption),
            customFrom=VALUES(customFrom),
            customTo=VALUES(customTo),
            candleLimit=VALUES(candleLimit)
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
            1 if strategy["useRiskSizing"] else 0,
            strategy["riskPct"],
            1 if strategy["useBreakEven"] else 0,
            strategy["beTriggerR"],
            strategy["lookbackWindow"],
            strategy["deployedAt"],
            strategy.get("timezone", "Local"),
            json.dumps(strategy.get("sessions", [])),
            1 if strategy.get("useGlobalClose", False) else 0,
            strategy.get("globalCloseTime", ""),
            strategy.get("entryStabilityRule", "default"),
            strategy.get("broker", "metatrader"),
            acc_id,
            strategy.get("target_computer", "All"),
            strategy.get("dateRangeOption", "last_candles"),
            strategy.get("customFrom", ""),
            strategy.get("customTo", ""),
            strategy.get("candleLimit", 1000)
        )
        try:
            SQLHandler.execute_query(query, params)
            
            # Save strategy targets
            # Clear old targets
            SQLHandler.execute_query("DELETE FROM live_strategy_targets WHERE strategy_id = %s", (strategy["id"],))
            
            targets = strategy.get("targets", [])
            # If no targets provided, fallback to the main broker/account_id as the single target
            if not targets and strategy.get("broker") and acc_id:
                targets = [{"broker": strategy.get("broker"), "account_id": acc_id}]
                
            for t in targets:
                import uuid
                target_id = str(uuid.uuid4())
                SQLHandler.execute_query(
                    "INSERT INTO live_strategy_targets (id, strategy_id, broker, account_id) VALUES (%s, %s, %s, %s)",
                    (target_id, strategy["id"], t.get("broker"), t.get("account_id"))
                )
            return True
        except Exception as e:
            print(f"Failed to save live strategy: {e}", flush=True)
            return False

    @staticmethod
    def get_strategy(strategy_id: str = None) -> dict:
        """
        Gets the strategy by ID from the database, or the latest if none provided.
        """
        LiveStrategyHandler.init_db()
        if strategy_id:
            query = "SELECT * FROM live_strategies WHERE id = %s"
            params = (strategy_id,)
        else:
            import socket
            try:
                comp_name = socket.gethostname()
            except:
                comp_name = "Unknown"
            query = "SELECT * FROM live_strategies WHERE (target_computer = 'All' OR target_computer = %s) ORDER BY deployedAt DESC LIMIT 1"
            params = (comp_name,)

        try:
            results = SQLHandler.execute_query(query, params)
            if results:
                row = results[0]
                strat = LiveStrategyHandler._row_to_dict(row)
                # Fetch targets
                targets_rows = SQLHandler.execute_query(
                    "SELECT broker, account_id FROM live_strategy_targets WHERE strategy_id = %s",
                    (strat["id"],)
                )
                strat["targets"] = [{"broker": r["broker"], "account_id": r["account_id"]} for r in targets_rows]
                return strat
        except Exception as e:
            print(f"Error fetching strategy from DB: {e}", flush=True)
        
        return None

    @staticmethod
    def get_all_strategies() -> list:
        """
        Retrieves all live strategies from the database.
        """
        LiveStrategyHandler.init_db()
        query = "SELECT * FROM live_strategies ORDER BY deployedAt DESC"
        try:
            results = SQLHandler.execute_query(query)
            strats = []
            for row in results:
                strat = LiveStrategyHandler._row_to_dict(row)
                targets_rows = SQLHandler.execute_query(
                    "SELECT broker, account_id FROM live_strategy_targets WHERE strategy_id = %s",
                    (strat["id"],)
                )
                strat["targets"] = [{"broker": r["broker"], "account_id": r["account_id"]} for r in targets_rows]
                strats.append(strat)
            return strats
        except Exception as e:
            print(f"Error fetching all strategies from DB: {e}", flush=True)
            return []

    @staticmethod
    def delete_strategy(strategy_id: str) -> bool:
        """
        Deletes a live strategy by ID.
        """
        LiveStrategyHandler.init_db()
        try:
            SQLHandler.execute_query("DELETE FROM live_strategy_targets WHERE strategy_id = %s", (strategy_id,))
            SQLHandler.execute_query("DELETE FROM live_strategies WHERE id = %s", (strategy_id,))
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
            "lookbackWindow": int(row["lookbackWindow"]),
            "deployedAt": row["deployedAt"],
            "timezone": row.get("timezone", "Local") or "Local",
            "sessions": sessions_list,
            "useGlobalClose": bool(row.get("useGlobalClose", False)),
            "globalCloseTime": row.get("globalCloseTime", "") or "",
            "entryStabilityRule": row.get("entryStabilityRule", "default") or "default",
            "broker": row.get("broker", "metatrader") or "metatrader",
            "account_id": row.get("account_id") or "",
            "target_computer": row.get("target_computer", "All") or "All",
            "dateRangeOption": row.get("dateRangeOption", "last_candles") or "last_candles",
            "customFrom": row.get("customFrom") or "",
            "customTo": row.get("customTo") or "",
            "candleLimit": int(row.get("candleLimit", 1000) if row.get("candleLimit") is not None else 1000),
            "live_state": live_state_dict
        }

    @staticmethod
    def update_strategy_state(strategy_id: str, state: dict) -> bool:
        """
        Updates only the live_state column of a live strategy.
        """
        LiveStrategyHandler.init_db()
        query = "UPDATE live_strategies SET live_state = %s WHERE id = %s"
        try:
            from sql_handler import SQLHandler
            SQLHandler.execute_query(query, (json.dumps(state), strategy_id))
            return True
        except Exception as e:
            print(f"Failed to update live state for strategy {strategy_id}: {e}", flush=True)
            return False

    @staticmethod
    def is_trading_allowed(strategy_id: str) -> tuple:
        """
        Checks if trading is currently allowed for the strategy based on its active sessions.
        Returns (is_allowed, error_message).
        """
        strategy = LiveStrategyHandler.get_strategy(strategy_id)
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
            
        return True, ""

    @staticmethod
    def restore_active_strategies():
        """
        Called on startup to fetch active strategies from the database.
        """
        LiveStrategyHandler.init_db()
        strategy = LiveStrategyHandler.get_strategy()
        if strategy and strategy.get("status") == "active":
            print(f"Startup Recovery: Active live strategy {strategy['id']} for {strategy['symbol']} is ready in DB.", flush=True)
        else:
            print("Startup Recovery: No active live strategy found in DB.", flush=True)
