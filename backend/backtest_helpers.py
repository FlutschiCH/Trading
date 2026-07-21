from datetime import datetime, timezone as pytimezone, time

def get_candle_datetime(ts: float, tz_str: str) -> datetime:
    """
    Helper to convert timestamp to naive datetime in specified timezone.
    """
    if tz_str == 'UTC':
        return datetime.fromtimestamp(ts, tz=pytimezone.utc).replace(tzinfo=None)
    else:
        return datetime.fromtimestamp(ts)

def is_datetime_in_sessions(dt: datetime, sessions_list: list) -> tuple:
    """
    Helper to check if datetime falls within defined sessions.
    """
    if not sessions_list:
        return True, None
    wd = dt.weekday() + 1  # 1=Mon, ..., 7=Sun
    time_val = dt.time()
    for s in sessions_list:
        weekdays = s.get("weekdays", [])
        if wd not in weekdays:
            continue
        try:
            sh, sm = map(int, s.get("start", "00:00").split(":"))
            eh, em = map(int, s.get("end", "23:59").split(":"))
        except ValueError:
            continue
        
        start_time = time(sh, sm)
        end_time = time(eh, em)
        if start_time <= end_time:
            if start_time <= time_val <= end_time:
                return True, s
        else:
            if time_val >= start_time or time_val <= end_time:
                return True, s
    return False, None

def is_in_specific_session(dt: datetime, s: dict) -> bool:
    """
    Helper to check if datetime is in a specific session.
    """
    if not s:
        return True
    wd = dt.weekday() + 1
    time_val = dt.time()
    weekdays = s.get("weekdays", [])
    if wd not in weekdays:
        return False
    try:
        sh, sm = map(int, s.get("start", "00:00").split(":"))
        eh, em = map(int, s.get("end", "23:59").split(":"))
    except ValueError:
        return False
    
    start_time = time(sh, sm)
    end_time = time(eh, em)
    if start_time <= end_time:
        return start_time <= time_val <= end_time
    else:
        return time_val >= start_time or time_val <= end_time

def get_pip_size(sym: str, price: float) -> float:
    """
    Helper to determine pip size dynamically based on asset conventions.
    """
    sym_upper = sym.upper()
    if 'JPY' in sym_upper:
        return 0.01
    if 'XAU' in sym_upper or 'GOLD' in sym_upper or 'XAG' in sym_upper:
        return 0.1
    is_crypto_pair = any(c in sym_upper for c in ['BTC', 'ETH', 'SOL', 'LTC', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'UNI', 'PEPE', 'SHIB'])
    if is_crypto_pair:
        if price > 1000:
            return 1.0
        elif price > 10:
            return 0.1
        return 0.001
    forex_currencies = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'SEK', 'NOK', 'SGD', 'HKD', 'ZAR', 'MXN']
    if any(curr in sym_upper for curr in forex_currencies):
        return 0.0001
    if price > 1000:
        return 1.0
    elif price > 100:
        return 0.1
    elif price > 1:
        return 0.01
    return 0.0001

def get_lot_size(sym: str) -> float:
    """
    Helper to determine lot size / contract size multiplier.
    """
    sym_upper = sym.upper()
    if 'XAU' in sym_upper or 'GOLD' in sym_upper or 'XAG' in sym_upper:
        return 100.0
    is_crypto_pair = any(c in sym_upper for c in ['BTC', 'ETH', 'SOL', 'LTC', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'UNI', 'PEPE', 'SHIB'])
    if is_crypto_pair:
        return 1.0
    forex_currencies = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'SEK', 'NOK', 'SGD', 'HKD', 'ZAR', 'MXN']
    if any(curr in sym_upper for curr in forex_currencies):
        return 100000.0
    return 1.0
