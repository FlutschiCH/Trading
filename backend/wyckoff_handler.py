import pandas as pd
import numpy as np
from datetime import datetime
from wyckoff_structure import WyckoffStructure

class WyckoffHandler:
    @staticmethod
    def analyze_wyckoff_structure(candles: list, lookback: int = 20, progress_callback=None) -> list:
        """
        Analyzes OHLCV candles to detect Wyckoff cycles (Accumulation, Markup, Distribution, Markdown),
        key support/resistance levels, and trap sweeps (Springs and Upthrusts) by delegating to WyckoffStructure.
        """
        return WyckoffStructure.analyze_structure(candles, lookback=lookback, progress_callback=progress_callback)

