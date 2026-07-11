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
            useRiskSizing, riskPct, useBreakEven, beTriggerR, lookbackWindow, deployedAt
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
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
            deployedAt=VALUES(deployedAt)
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
            strategy["deployedAt"]
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
                    "deployedAt": row["deployedAt"]
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
