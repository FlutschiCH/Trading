import time
import threading
import logging
from datetime import datetime
from logger_handler import logPrint
from sql_handler import SQLHandler
from account_handler import AccountHandler
from metatrader_handler import MetaTraderHandler

class CandleCollectorHandler:
    _lock = threading.Lock()
    _background_started = False
    _last_run_timestamp = 0
    _interval_seconds = 600  # 10 minutes

    @classmethod
    def init_db(cls):
        """Initializes tables for 1M candle collection in MySQL."""
        create_symbols_table = """
        CREATE TABLE IF NOT EXISTS mt5_1m_symbols (
            symbol VARCHAR(64) PRIMARY KEY,
            is_active TINYINT(1) DEFAULT 1,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_synced DATETIME NULL,
            server VARCHAR(128) NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        create_candles_table = """
        CREATE TABLE IF NOT EXISTS mt5_1m_candles (
            server VARCHAR(128) NOT NULL,
            symbol VARCHAR(64) NOT NULL,
            timestamp BIGINT NOT NULL,
            open DOUBLE NOT NULL,
            high DOUBLE NOT NULL,
            low DOUBLE NOT NULL,
            close DOUBLE NOT NULL,
            volume DOUBLE NOT NULL,
            PRIMARY KEY (server, symbol, timestamp)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        try:
            SQLHandler.execute_query(create_symbols_table)
            SQLHandler.execute_query(create_candles_table)
            logPrint("Tables initialized successfully.", category="CandleCollectorHandler", level="INFO")
        except Exception as e:
            logPrint(f"Error initializing tables: {e}", category="CandleCollectorHandler", level="ERROR")

    @classmethod
    def get_tracked_symbols(cls) -> list:
        try:
            query = "SELECT symbol, is_active, added_at, last_synced, server FROM mt5_1m_symbols ORDER BY added_at ASC"
            results = SQLHandler.execute_query(query)
            
            # Fetch count of candles for each symbol
            count_query = "SELECT symbol, count(*) as count FROM mt5_1m_candles GROUP BY symbol"
            counts_raw = SQLHandler.execute_query(count_query)
            counts = {row['symbol']: row['count'] for row in counts_raw} if isinstance(counts_raw, list) else {}

            symbols_data = []
            for row in (results if isinstance(results, list) else []):
                sym = row.get('symbol')
                symbols_data.append({
                    "symbol": sym,
                    "is_active": bool(row.get('is_active', 1)),
                    "added_at": str(row.get('added_at')) if row.get('added_at') else None,
                    "last_synced": str(row.get('last_synced')) if row.get('last_synced') else None,
                    "server": row.get('server') or "Unknown",
                    "candle_count": counts.get(sym, 0)
                })
            return symbols_data
        except Exception as e:
            logPrint(f"Error fetching tracked symbols: {e}", category="CandleCollectorHandler", level="ERROR")
            return []

    @classmethod
    def add_symbol(cls, symbol: str) -> dict:
        symbol = symbol.strip().upper()
        if not symbol:
            return {"status": "error", "message": "Symbol cannot be empty"}
        
        try:
            query = """
            INSERT INTO mt5_1m_symbols (symbol, is_active, added_at)
            VALUES (%s, 1, NOW())
            ON DUPLICATE KEY UPDATE is_active = 1
            """
            SQLHandler.execute_query(query, (symbol,))
            
            # Immediately trigger initial 20k backfill in background thread
            threading.Thread(target=cls.sync_candles_for_symbol, args=(symbol, 20000), daemon=True).start()
            
            return {"status": "success", "message": f"Symbol {symbol} added and initial 20k candle backfill started."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @classmethod
    def remove_symbol(cls, symbol: str) -> dict:
        symbol = symbol.strip().upper()
        try:
            query = "DELETE FROM mt5_1m_symbols WHERE symbol = %s"
            SQLHandler.execute_query(query, (symbol,))
            return {"status": "success", "message": f"Symbol {symbol} removed."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @classmethod
    def toggle_symbol(cls, symbol: str, active: bool) -> dict:
        symbol = symbol.strip().upper()
        try:
            query = "UPDATE mt5_1m_symbols SET is_active = %s WHERE symbol = %s"
            SQLHandler.execute_query(query, (1 if active else 0, symbol))
            return {"status": "success", "message": f"Symbol {symbol} active state set to {active}."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @classmethod
    def sync_candles_for_symbol(cls, symbol: str, limit: int = 50) -> dict:
        symbol = symbol.strip().upper()
        try:
            # Fetch candles using current MT5 session handled by MetaTraderHandler
            candles = MetaTraderHandler.fetch_candles(
                symbol=symbol,
                timeframe='1m',
                limit=limit
            )
            if not candles:
                logPrint(f"No candles returned for {symbol}", category="CandleCollectorHandler", level="WARNING")
                return {"status": "warning", "message": f"No candles returned for {symbol}."}

            # Batch insert/upsert into mt5_1m_candles
            upsert_query = """
            INSERT INTO mt5_1m_candles (server, symbol, timestamp, open, high, low, close, volume)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                open = VALUES(open),
                high = VALUES(high),
                low = VALUES(low),
                close = VALUES(close),
                volume = VALUES(volume)
            """

            server_name = "MetaTrader"
            records = []
            for c in candles:
                ts = int(c.get('timestamp') or c.get('time') or 0)
                if ts <= 0:
                    continue
                records.append((
                    server_name,
                    symbol,
                    ts,
                    float(c.get('open', 0)),
                    float(c.get('high', 0)),
                    float(c.get('low', 0)),
                    float(c.get('close', 0)),
                    float(c.get('volume', 0))
                ))

            if records:
                # Execute batch upsert
                for i in range(0, len(records), 500):
                    batch = records[i:i+500]
                    # Format multi-row query for efficiency
                    val_str = ",".join(["(%s, %s, %s, %s, %s, %s, %s, %s)"] * len(batch))
                    flat_params = [item for sublist in batch for item in sublist]
                    batch_query = f"""
                    INSERT INTO mt5_1m_candles (server, symbol, timestamp, open, high, low, close, volume)
                    VALUES {val_str}
                    ON DUPLICATE KEY UPDATE
                        open = VALUES(open),
                        high = VALUES(high),
                        low = VALUES(low),
                        close = VALUES(close),
                        volume = VALUES(volume)
                    """
                    SQLHandler.execute_query(batch_query, tuple(flat_params))

                # Update mt5_1m_symbols table with last_synced and server name
                update_symbol_query = """
                UPDATE mt5_1m_symbols
                SET last_synced = NOW(), server = %s
                WHERE symbol = %s
                """
                SQLHandler.execute_query(update_symbol_query, (server_name, symbol))

            logPrint(f"Successfully synced {len(records)} 1m candles for {symbol} ({server_name}).", category="CandleCollectorHandler", level="INFO")
            return {"status": "success", "count": len(records), "symbol": symbol, "server": server_name}

        except Exception as e:
            logPrint(f"Error syncing candles for {symbol}: {e}", category="CandleCollectorHandler", level="ERROR")
            return {"status": "error", "message": str(e)}

    @classmethod
    def sync_all_active(cls, limit: int = 50):
        cls._last_run_timestamp = time.time()
        tracked = cls.get_tracked_symbols()
        active_symbols = [s['symbol'] for s in tracked if s['is_active']]

        if not active_symbols:
            return

        logPrint(f"Periodic 10m sync starting for active symbols: {active_symbols}", category="CandleCollectorHandler", level="INFO")
        for sym in active_symbols:
            cls.sync_candles_for_symbol(sym, limit=limit)

    @classmethod
    def start_background_collector(cls):
        with cls._lock:
            if cls._background_started:
                return
            cls._background_started = True

        cls.init_db()

        def _loop():
            logPrint("Background 10-minute collector daemon started.", category="CandleCollectorHandler", level="INFO")
            time.sleep(15)  # Initial delay on startup
            while True:
                try:
                    cls.sync_all_active(limit=50)
                except Exception as e:
                    logPrint(f"Error in background loop cycle: {e}", category="CandleCollectorHandler", level="ERROR")
                time.sleep(cls._interval_seconds)

        thread = threading.Thread(target=_loop, daemon=True)
        thread.start()

    @classmethod
    def get_stats(cls) -> dict:
        symbols = cls.get_tracked_symbols()
        next_run = cls._last_run_timestamp + cls._interval_seconds if cls._last_run_timestamp > 0 else 0
        return {
            "symbols": symbols,
            "last_sync_timestamp": cls._last_run_timestamp,
            "next_sync_timestamp": next_run,
            "interval_seconds": cls._interval_seconds
        }
