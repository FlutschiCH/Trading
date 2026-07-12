import pandas as pd
import numpy as np

class IndicatorHandler:
    @staticmethod
    def compute_fvgs(df: pd.DataFrame) -> list:
        fvgs = []
        n = len(df)
        if n < 3:
            return fvgs

        # Convert columns to numpy arrays for extremely fast lookup (C-speed)
        highs = df['high'].to_numpy()
        lows = df['low'].to_numpy()
        times = df['time'].to_numpy()

        for i in range(2, n):
            c1_high = highs[i - 2]
            c3_low = lows[i]

            # Bullish FVG
            if c3_low > c1_high:
                price_min = float(c1_high)
                price_max = float(c3_low)
                time_start = int(times[i - 1])
                time_end = int(times[-1])
                mitigated = False

                for j in range(i + 1, n):
                    if lows[j] <= price_max:
                        time_end = int(times[j])
                        mitigated = True
                        break

                fvgs.append({
                    "type": "bullish",
                    "priceMin": price_min,
                    "priceMax": price_max,
                    "timeStart": time_start,
                    "timeEnd": time_end,
                    "mitigated": mitigated
                })

            # Bearish FVG
            c1_low = lows[i - 2]
            c3_high = highs[i]
            if c3_high < c1_low:
                price_min = float(c3_high)
                price_max = float(c1_low)
                time_start = int(times[i - 1])
                time_end = int(times[-1])
                mitigated = False

                for j in range(i + 1, n):
                    if highs[j] >= price_min:
                        time_end = int(times[j])
                        mitigated = True
                        break

                fvgs.append({
                    "type": "bearish",
                    "priceMin": price_min,
                    "priceMax": price_max,
                    "timeStart": time_start,
                    "timeEnd": time_end,
                    "mitigated": mitigated
                })
        return fvgs
