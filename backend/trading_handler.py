import pandas as pd
import json
from vsa import analyze_vsa_patterns
from weis_wave import compute_weis_wave
from execution import execute_signal

class TradingHandler:
    @staticmethod
    def process_webhook_signal(signal_data: dict) -> dict:
        """
        Processes an incoming webhook signal, validates using Risk safeguards, and executes.
        """
        # Execute order using execution.py controller
        return execute_signal(signal_data)

    @staticmethod
    def analyze_market_data(bars_list: list) -> dict:
        """
        Takes raw candlestick data, runs Wyckoff VSA and Weis Wave Volume analysis,
        and returns the annotated dataset.
        """
        if not bars_list:
            return {"status": "success", "data": []}
            
        df = pd.DataFrame(bars_list)
        # Required columns: time, open, high, low, close, volume
        # Check and cast
        for col in ['open', 'high', 'low', 'close', 'volume']:
            if col in df.columns:
                df[col] = df[col].astype(float)
        
        # Calculate VSA patterns
        patterns = analyze_vsa_patterns(df)
        df['vsa_patterns'] = patterns
        
        # Calculate Weis Wave Volume
        df = compute_weis_wave(df)
        
        # Convert df back to dict
        result_data = df.to_dict(orient='records')
        return {"status": "success", "data": result_data}
