import os
import json
import time
from sql_handler import SQLHandler

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'active_strategy.json')

class LiveStrategyHandler:
    @staticmethod
    def init_db():
        """
        Initializes the schema for live strategies in the DB.
        """
        # Create MySQL style table
        create_mysql = """
        CREATE TABLE IF NOT EXISTS live_strategies (
            symbol VARCHAR(50) PRIMARY KEY,
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
            deployedAt VARCHAR(50) NOT NULL
        )
        """
        try:
            SQLHandler.execute_query(create_mysql)
            
            # Add columns if not exist
            for col_name, col_type in [
                ("timezone", "VARCHAR(10) DEFAULT 'Local'"),
                ("sessions", "TEXT"),
                ("useGlobalClose", "TINYINT(1) DEFAULT 0"),
                ("globalCloseTime", "VARCHAR(5) DEFAULT ''"),
                ("entryStabilityRule", "VARCHAR(20) DEFAULT 'default'")
            ]:
                try:
                    SQLHandler.execute_query(f"ALTER TABLE live_strategies ADD COLUMN {col_name} {col_type}")
                except Exception:
                    pass
        except Exception as e:
            print(f"Error initializing live_strategies DB table: {e}", flush=True)

    @staticmethod
    def save_strategy(strategy: dict) -> bool:
        """
        Saves the strategy configuration to the SQL database using an upsert pattern.
        """
        query = """
        INSERT INTO live_strategies (
            symbol, status, timeframe, slVal, slType, rr, size, 
            useRiskSizing, riskPct, useBreakEven, beTriggerR, lookbackWindow, deployedAt,
            timezone, sessions, useGlobalClose, globalCloseTime, entryStabilityRule
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s
        ) ON DUPLICATE KEY UPDATE 
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
            # Write to active_strategy.json locally for cache compatibility
            with open(CONFIG_PATH, 'w') as f:
                json.dump(strategy, f, indent=4)
            return True
        except Exception as e:
            print(f"Failed to save live strategy: {e}", flush=True)
            return False

    @staticmethod
    def get_strategy(symbol: str = None) -> dict:
        """
        Gets the strategy for a symbol from the database.
        """
        if symbol:
            query = "SELECT * FROM live_strategies WHERE symbol = %s"
            params = (symbol,)
        else:
            # Get latest deployed active strategy
            query = "SELECT * FROM live_strategies ORDER BY deployedAt DESC LIMIT 1"
            params = ()

        try:
            results = SQLHandler.execute_query(query, params)
            if results:
                row = results[0]
                
                # Parse sessions safely
                sessions_raw = row.get("sessions")
                sessions_list = []
                if sessions_raw:
                    try:
                        sessions_list = json.loads(sessions_raw)
                    except Exception:
                        pass
                
                return {
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
        except Exception as e:
            print(f"Error fetching strategy from DB: {e}", flush=True)
        
        # Fallback to local active_strategy.json if DB fails
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, 'r') as f:
                    return json.load(f)
            except Exception:
                pass
        return None

    @staticmethod
    def is_trading_allowed(symbol: str) -> tuple:
        """
        Checks if trading is currently allowed for the symbol based on active sessions.
        Returns (is_allowed, error_message).
        """
        strategy = LiveStrategyHandler.get_strategy(symbol)
        if not strategy or strategy.get("status") != "active":
            return True, "" # No active strategy deployed, allow manual trading without restrictions
            
        sessions = [s for s in strategy.get("sessions", []) if s.get("active", True)]
        if not sessions:
            return True, "" # No sessions configured, allow trading anytime
            
        timezone_str = strategy.get("timezone", "Local")
        
        # Get current time in specified timezone
        import time
        from datetime import datetime, timezone as pytimezone
        ts = time.time()
        if timezone_str == 'UTC':
            dt_now = datetime.fromtimestamp(ts, tz=pytimezone.utc).replace(tzinfo=None)
        else:
            dt_now = datetime.fromtimestamp(ts)
            
        wd = dt_now.weekday() + 1 # 1=Mon, ..., 7=Sun
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
        Called on startup to fetch active strategies from the database
        and rebuild active_strategy.json.
        """
        # Initialize DB tables on startup
        LiveStrategyHandler.init_db()

        strategy = LiveStrategyHandler.get_strategy()
        if strategy and strategy.get("status") == "active":
            print(f"Startup Recovery: Restoring active live strategy for {strategy['symbol']} from DB.", flush=True)
            try:
                with open(CONFIG_PATH, 'w') as f:
                    json.dump(strategy, f, indent=4)
            except Exception as e:
                print(f"Error writing active_strategy.json on startup: {e}", flush=True)
        else:
            print("Startup Recovery: No active live strategy found in DB.", flush=True)
