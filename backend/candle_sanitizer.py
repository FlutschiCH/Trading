import math
import re
import time as pytime

def get_timeframe_seconds(timeframe: str) -> int:
    if not timeframe:
        return 900
    tf_str = str(timeframe).lower()
    match = re.match(r'(\d+)([mhdws])', tf_str)
    if not match:
        # Fallback mappings
        if '1m' in tf_str: return 60
        if '3m' in tf_str: return 180
        if '5m' in tf_str: return 300
        if '15m' in tf_str: return 900
        if '30m' in tf_str: return 1800
        if '1h' in tf_str or '60m' in tf_str: return 3600
        if '2h' in tf_str or '90m' in tf_str: return 7200
        if '4h' in tf_str: return 14400
        if '1d' in tf_str: return 86400
        return 900
    
    val = int(match.group(1))
    unit = match.group(2)
    if unit == 's':
        return val
    elif unit == 'm':
        return val * 60
    elif unit == 'h':
        return val * 3600
    elif unit == 'd':
        return val * 86400
    elif unit == 'w':
        return val * 86400 * 7
    return 900

def sanitize_and_fill_candles(candles: list, timeframe: str = '15m') -> list:
    if not candles:
        return []
        
    sanitized = []
    tf_sec = get_timeframe_seconds(timeframe)
    
    # First pass: convert fields to appropriate types and check for NaNs/None
    for c in candles:
        if not isinstance(c, dict):
            continue
            
        cleaned = {}
        
        # Time
        t_val = c.get('time')
        if t_val is not None:
            try:
                cleaned['time'] = int(float(t_val))
            except Exception:
                cleaned['time'] = None
        else:
            cleaned['time'] = None
            
        # OHLCV
        for field in ['open', 'high', 'low', 'close', 'volume']:
            val = c.get(field)
            if val is not None:
                try:
                    f_val = float(val)
                    if math.isnan(f_val) or math.isinf(f_val):
                        cleaned[field] = None
                    else:
                        cleaned[field] = f_val
                except Exception:
                    cleaned[field] = None
            else:
                cleaned[field] = None
                
        # Preserve other custom attributes
        for k, v in c.items():
            if k not in ['time', 'open', 'high', 'low', 'close', 'volume']:
                cleaned[k] = v
                
        sanitized.append(cleaned)
        
    # Second pass: Forward/Backward fill prices and volumes
    last_valid_price = None
    for c in sanitized:
        for field in ['close', 'open', 'high', 'low']:
            if c[field] is not None:
                last_valid_price = c[field]
                break
        if last_valid_price is not None:
            break
            
    if last_valid_price is None:
        last_valid_price = 1.0
        
    last_price = last_valid_price
    last_volume = 0.0
    
    for c in sanitized:
        if c['close'] is None:
            c['close'] = last_price
        else:
            last_price = c['close']
            
        if c['open'] is None:
            c['open'] = last_price
            
        if c['high'] is None:
            c['high'] = max(c['open'], c['close'])
        if c['low'] is None:
            c['low'] = min(c['open'], c['close'])
            
        c['high'] = max(c['high'], c['open'], c['close'])
        c['low'] = min(c['low'], c['open'], c['close'])
        
        if c['volume'] is None:
            c['volume'] = last_volume
        else:
            last_volume = c['volume']
            
    # Third pass: Fix time values
    first_valid_time = None
    first_valid_idx = -1
    for idx, c in enumerate(sanitized):
        if c['time'] is not None:
            first_valid_time = c['time']
            first_valid_idx = idx
            break
            
    if first_valid_time is None:
        first_valid_time = int(pytime.time()) - len(sanitized) * tf_sec
        first_valid_idx = 0
        sanitized[0]['time'] = first_valid_time
        
    for i in range(first_valid_idx - 1, -1, -1):
        sanitized[i]['time'] = sanitized[i+1]['time'] - tf_sec
        
    for i in range(first_valid_idx + 1, len(sanitized)):
        if sanitized[i]['time'] is None:
            sanitized[i]['time'] = sanitized[i-1]['time'] + tf_sec
            
    return sanitized
