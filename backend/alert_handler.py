import threading
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from sql_handler import SQLHandler
from notification_handler import NotificationHandler

class AlertHandler:
    _db_initialized = False
    _lock = threading.RLock()
    _alerts_cache = None  # {alert_id: alert_dict}
    _monitor_thread = None
    _running = False

    @classmethod
    def _ensure_cache_loaded(cls, force: bool = False):
        with cls._lock:
            if cls._alerts_cache is None or force:
                cls.init_db()
                try:
                    query = "SELECT id, symbol, target_price, alert_condition, status, note, created_at, triggered_at FROM price_alerts ORDER BY created_at DESC"
                    rows = SQLHandler.execute_query(query)
                    new_cache = {}
                    if isinstance(rows, list):
                        for r in rows:
                            a_id = int(r["id"])
                            new_cache[a_id] = {
                                "id": a_id,
                                "symbol": r["symbol"],
                                "target_price": float(r["target_price"]),
                                "alert_condition": r["alert_condition"],
                                "status": r["status"],
                                "note": r.get("note", "") or "",
                                "created_at": str(r["created_at"]) if r.get("created_at") else None,
                                "triggered_at": str(r["triggered_at"]) if r.get("triggered_at") else None
                            }
                    cls._alerts_cache = new_cache
                except Exception as e:
                    print(f"Error loading alerts cache from DB: {e}", flush=True)
                    if cls._alerts_cache is None:
                        cls._alerts_cache = {}

    @classmethod
    def init_db(cls):
        """Initializes price_alerts table."""
        with cls._lock:
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
        """Starts background loop monitoring active alerts in-memory every 1s."""
        cls._ensure_cache_loaded()
        with cls._lock:
            if cls._running:
                return
            cls._running = True
            cls._monitor_thread = threading.Thread(target=cls._monitoring_loop, daemon=True)
            cls._monitor_thread.start()
            from colorama import Fore, Style
            print(f"{Fore.GREEN}[ALERT_HANDLER]{Style.RESET_ALL} Background in-memory monitoring started.", flush=True)

    @classmethod
    def stop_monitoring(cls):
        cls._running = False

    @classmethod
    def _fetch_current_price(cls, symbol: str) -> Optional[float]:
        """Fetch latest price for symbol from live runner / candle cache."""
        try:
            from live_runner_handler import LiveRunner
            # Check cached candles in memory
            candles = LiveRunner._candles_cache.get(symbol) or []
            if candles:
                last_c = candles[-1]
                return float(last_c.get("close", 0.0))
        except Exception:
            pass

        try:
            from live_runner_handler import LiveRunnerHandler
            state = LiveRunnerHandler.get_runner_state(symbol)
            if state and isinstance(state, dict):
                current_price = state.get("current_price") or state.get("price") or state.get("last_price")
                if current_price:
                    return float(current_price)
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
                            if abs(curr_price - target_price) / max(target_price, 1e-6) <= 0.001 or curr_price >= target_price:
                                triggered = True

                        if triggered:
                            cls.trigger_alert(alert, curr_price)
            except Exception as e:
                print(f"[ALERT_HANDLER] Monitoring error: {e}", flush=True)

            time.sleep(1)

    @classmethod
    def trigger_alert(cls, alert: Dict[str, Any], curr_price: float):
        alert_id = int(alert["id"])
        symbol = alert["symbol"]
        target_price = float(alert["target_price"])
        note_str = f" ({alert['note']})" if alert.get("note") else ""
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Update in-memory cache instantly
        cls._ensure_cache_loaded()
        with cls._lock:
            if alert_id in cls._alerts_cache:
                cls._alerts_cache[alert_id]["status"] = "TRIGGERED"
                cls._alerts_cache[alert_id]["triggered_at"] = now_str

        # Update alert in DB
        try:
            SQLHandler.execute_query(
                "UPDATE price_alerts SET status = 'TRIGGERED', triggered_at = CURRENT_TIMESTAMP WHERE id = %s",
                (alert_id,)
            )
        except Exception as e:
            print(f"[ALERT_HANDLER] Error updating alert trigger in DB: {e}", flush=True)
        
        msg = f"🚨 **PRICE ALERT TRIGGERED** 🚨\nSymbol: **{symbol}**\nTarget: **{target_price}** | Current: **{curr_price}**{note_str}"
        print(f"[ALERT_HANDLER] {msg}", flush=True)
        NotificationHandler.send_notification(msg, sound_type="alert")

    @classmethod
    def get_alerts(cls, symbol: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        cls._ensure_cache_loaded()
        with cls._lock:
            alerts = list(cls._alerts_cache.values())
            filtered = []
            for a in alerts:
                if symbol and a["symbol"].upper() != symbol.upper():
                    continue
                if status and a["status"].upper() != status.upper():
                    continue
                filtered.append(dict(a))
            filtered.sort(key=lambda x: x.get("created_at") or "", reverse=True)
            return filtered

    @classmethod
    def create_alert(cls, symbol: str, target_price: float, alert_condition: str = "CROSSES", note: str = "") -> Dict[str, Any]:
        cls.init_db()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        res = SQLHandler.execute_query(
            "INSERT INTO price_alerts (symbol, target_price, alert_condition, status, note) VALUES (%s, %s, %s, 'ACTIVE', %s)",
            (symbol, target_price, alert_condition, note)
        )
        new_id = None
        if isinstance(res, list) and res and res[0].get("lastrowid"):
            new_id = int(res[0]["lastrowid"])
        else:
            id_res = SQLHandler.execute_query("SELECT LAST_INSERT_ID() as id")
            new_id = int(id_res[0]["id"]) if id_res else None

        alert_dict = {
            "id": new_id,
            "symbol": symbol,
            "target_price": float(target_price),
            "alert_condition": alert_condition,
            "status": "ACTIVE",
            "note": note or "",
            "created_at": now_str,
            "triggered_at": None
        }

        cls._ensure_cache_loaded()
        with cls._lock:
            if new_id:
                cls._alerts_cache[new_id] = alert_dict

        return alert_dict

    @classmethod
    def update_alert(cls, alert_id: int, target_price: Optional[float] = None, alert_condition: Optional[str] = None, status: Optional[str] = None, note: Optional[str] = None) -> bool:
        cls.init_db()
        alert_id = int(alert_id)
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

        # Update in-memory cache instantly
        cls._ensure_cache_loaded()
        with cls._lock:
            if alert_id in cls._alerts_cache:
                if target_price is not None:
                    cls._alerts_cache[alert_id]["target_price"] = float(target_price)
                if alert_condition is not None:
                    cls._alerts_cache[alert_id]["alert_condition"] = alert_condition
                if status is not None:
                    cls._alerts_cache[alert_id]["status"] = status
                if note is not None:
                    cls._alerts_cache[alert_id]["note"] = note

        query = f"UPDATE price_alerts SET {', '.join(updates)} WHERE id = %s"
        params.append(alert_id)
        try:
            SQLHandler.execute_query(query, tuple(params))
            return True
        except Exception as e:
            print(f"[ALERT_HANDLER] Error updating alert {alert_id}: {e}", flush=True)
            return False

    @classmethod
    def delete_alert(cls, alert_id: int) -> bool:
        cls.init_db()
        alert_id = int(alert_id)
        cls._ensure_cache_loaded()
        with cls._lock:
            cls._alerts_cache.pop(alert_id, None)
        try:
            SQLHandler.execute_query("DELETE FROM price_alerts WHERE id = %s", (alert_id,))
            return True
        except Exception as e:
            print(f"[ALERT_HANDLER] Error deleting alert {alert_id}: {e}", flush=True)
            return False
