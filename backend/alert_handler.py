import threading
import time
from typing import List, Dict, Any, Optional
from sql_handler import SQLHandler
from notification_handler import NotificationHandler

class AlertHandler:
    _db_initialized = False
    _db_lock = threading.Lock()
    _monitor_thread = None
    _running = False

    @classmethod
    def init_db(cls):
        """Initializes price_alerts table."""
        with cls._db_lock:
            if cls._db_initialized:
                return
            SQLHandler.execute_query(
                "CREATE TABLE IF NOT EXISTS price_alerts ("
                "  id INT AUTO_INCREMENT PRIMARY KEY,"
                "  symbol VARCHAR(50) NOT NULL,"
                "  target_price DECIMAL(18, 8) NOT NULL,"
                "  alert_condition VARCHAR(20) NOT NULL DEFAULT 'CROSSES',"
                "  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',"
                "  note VARCHAR(255) DEFAULT '',"
                "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"
                "  triggered_at TIMESTAMP NULL DEFAULT NULL"
                ")"
                " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
            )
            cls._db_initialized = True

    @classmethod
    def start_monitoring(cls):
        """Starts background loop fetching prices and monitoring active alerts every 1s."""
        cls.init_db()
        with cls._db_lock:
            if cls._running:
                return
            cls._running = True
            cls._monitor_thread = threading.Thread(target=cls._monitoring_loop, daemon=True)
            cls._monitor_thread.start()
            from colorama import Fore, Style
            print(f"{Fore.GREEN}[ALERT_HANDLER]{Style.RESET_ALL} Background monitoring started.", flush=True)

    @classmethod
    def stop_monitoring(cls):
        cls._running = False

    @classmethod
    def _fetch_current_price(cls, symbol: str) -> Optional[float]:
        """Fetch latest price for symbol from live runner / candle cache / broker."""
        try:
            from live_runner_handler import LiveRunnerHandler
            state = LiveRunnerHandler.get_runner_state(symbol)
            if state and isinstance(state, dict):
                current_price = state.get("current_price") or state.get("price") or state.get("last_price")
                if current_price:
                    return float(current_price)
        except Exception:
            pass

        try:
            res = SQLHandler.execute_query(
                "SELECT close_price, close FROM market_candles WHERE symbol = %s ORDER BY timestamp DESC LIMIT 1",
                (symbol,)
            )
            if res:
                cp = res[0].get("close_price") or res[0].get("close")
                if cp:
                    return float(cp)
        except Exception:
            pass

        return None

    @classmethod
    def _monitoring_loop(cls):
        while cls._running:
            try:
                active_alerts = cls.get_alerts(status="ACTIVE")
                if active_alerts:
                    # Group by symbol to optimize price fetching
                    symbols = set(a["symbol"] for a in active_alerts)
                    prices: Dict[str, float] = {}
                    for sym in symbols:
                        p = cls._fetch_current_price(sym)
                        if p is not None:
                            prices[sym] = p

                    for alert in active_alerts:
                        sym = alert["symbol"]
                        if sym not in prices:
                            continue
                        
                        curr_price = prices[sym]
                        target_price = float(alert["target_price"])
                        cond = alert.get("alert_condition", "CROSSES").upper()
                        triggered = False

                        if cond == "ABOVE" and curr_price >= target_price:
                            triggered = True
                        elif cond == "BELOW" and curr_price <= target_price:
                            triggered = True
                        elif cond == "CROSSES":
                            # Default check: if reached/crossed
                            if abs(curr_price - target_price) / max(target_price, 1e-6) <= 0.001 or curr_price >= target_price:
                                triggered = True

                        if triggered:
                            cls.trigger_alert(alert, curr_price)
            except Exception as e:
                print(f"[ALERT_HANDLER] Monitoring error: {e}", flush=True)

            time.sleep(1)

    @classmethod
    def trigger_alert(cls, alert: Dict[str, Any], curr_price: float):
        alert_id = alert["id"]
        symbol = alert["symbol"]
        target_price = float(alert["target_price"])
        note_str = f" ({alert['note']})" if alert.get("note") else ""
        
        # Update alert in DB
        SQLHandler.execute_query(
            "UPDATE price_alerts SET status = 'TRIGGERED', triggered_at = CURRENT_TIMESTAMP WHERE id = %s",
            (alert_id,)
        )
        
        msg = f"🚨 **PRICE ALERT TRIGGERED** 🚨\nSymbol: **{symbol}**\nTarget: **{target_price}** | Current: **{curr_price}**{note_str}"
        print(f"[ALERT_HANDLER] {msg}", flush=True)
        NotificationHandler.send_notification(msg, sound_type="alert")

    @classmethod
    def get_alerts(cls, symbol: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        cls.init_db()
        query = "SELECT id, symbol, target_price, alert_condition, status, note, created_at, triggered_at FROM price_alerts WHERE 1=1"
        params = []

        if symbol:
            query += " AND symbol = %s"
            params.append(symbol)
        if status:
            query += " AND status = %s"
            params.append(status)

        query += " ORDER BY created_at DESC"
        rows = SQLHandler.execute_query(query, tuple(params) if params else None)
        
        results = []
        if rows:
            for r in rows:
                results.append({
                    "id": r["id"],
                    "symbol": r["symbol"],
                    "target_price": float(r["target_price"]),
                    "alert_condition": r["alert_condition"],
                    "status": r["status"],
                    "note": r.get("note", ""),
                    "created_at": str(r["created_at"]) if r.get("created_at") else None,
                    "triggered_at": str(r["triggered_at"]) if r.get("triggered_at") else None
                })
        return results

    @classmethod
    def create_alert(cls, symbol: str, target_price: float, alert_condition: str = "CROSSES", note: str = "") -> Dict[str, Any]:
        cls.init_db()
        SQLHandler.execute_query(
            "INSERT INTO price_alerts (symbol, target_price, alert_condition, status, note) VALUES (%s, %s, %s, 'ACTIVE', %s)",
            (symbol, target_price, alert_condition, note)
        )
        res = SQLHandler.execute_query("SELECT LAST_INSERT_ID() as id")
        new_id = res[0]["id"] if res else None
        return {
            "id": new_id,
            "symbol": symbol,
            "target_price": float(target_price),
            "alert_condition": alert_condition,
            "status": "ACTIVE",
            "note": note
        }

    @classmethod
    def update_alert(cls, alert_id: int, target_price: Optional[float] = None, alert_condition: Optional[str] = None, status: Optional[str] = None, note: Optional[str] = None) -> bool:
        cls.init_db()
        updates = []
        params = []
        if target_price is not None:
            updates.append("target_price = %s")
            params.append(target_price)
        if alert_condition is not None:
            updates.append("alert_condition = %s")
            params.append(alert_condition)
        if status is not None:
            updates.append("status = %s")
            params.append(status)
        if note is not None:
            updates.append("note = %s")
            params.append(note)

        if not updates:
            return False

        query = f"UPDATE price_alerts SET {', '.join(updates)} WHERE id = %s"
        params.append(alert_id)
        SQLHandler.execute_query(query, tuple(params))
        return True

    @classmethod
    def delete_alert(cls, alert_id: int) -> bool:
        cls.init_db()
        SQLHandler.execute_query("DELETE FROM price_alerts WHERE id = %s", (alert_id,))
        return True
