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
            entryStabilityRule VARCHAR(20) DEFAULT 'default'
        )
        """
        try:
            SQLHandler.execute_query(create_mysql)
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
            id, symbol, status, timeframe, slVal, slType, rr, size, 
            useRiskSizing, riskPct, useBreakEven, beTriggerR, lookbackWindow, deployedAt,
            timezone, sessions, useGlobalClose, globalCloseTime, entryStabilityRule
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s
        ) ON DUPLICATE KEY UPDATE 
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
            entryStabilityRule=VALUES(entryStabilityRule)
        """
        params = (
            strategy["id"],
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
            strategy.get("entryStabilityRule", "default")
        )
        try:
            SQLHandler.execute_query(query, params)
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
            query = "SELECT * FROM live_strategies ORDER BY deployedAt DESC LIMIT 1"
            params = ()

        try:
            results = SQLHandler.execute_query(query, params)
            if results:
                row = results[0]
                return LiveStrategyHandler._row_to_dict(row)
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
            return [LiveStrategyHandler._row_to_dict(row) for row in results]
        except Exception as e:
            print(f"Error fetching all strategies from DB: {e}", flush=True)
            return []

    @staticmethod
    def delete_strategy(strategy_id: str) -> bool:
        """
        Deletes a live strategy by ID.
        """
        LiveStrategyHandler.init_db()
        query = "DELETE FROM live_strategies WHERE id = %s"
        try:
            SQLHandler.execute_query(query, (strategy_id,))
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
        return {
            "id": row["id"],
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
            "entryStabilityRule": row.get("entryStabilityRule", "default") or "default"
        }

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
