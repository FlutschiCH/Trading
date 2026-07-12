import pandas as pd

class IndicatorHandler:
    @staticmethod
    def compute_fvgs(df: pd.DataFrame) -> list:
        fvgs = []
        if len(df) < 3:
            return fvgs

        for i in range(2, len(df)):
            c1 = df.iloc[i - 2]
            c2 = df.iloc[i - 1]
            c3 = df.iloc[i]

            # Bullish FVG
            if c3['low'] > c1['high']:
                price_min = float(c1['high'])
                price_max = float(c3['low'])
                time_start = int(c2['time'])
                time_end = int(df.iloc[-1]['time'])
                mitigated = False

                for j in range(i + 1, len(df)):
                    if df.iloc[j]['low'] <= price_max:
                        time_end = int(df.iloc[j]['time'])
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
            if c3['high'] < c1['low']:
                price_min = float(c3['high'])
                price_max = float(c1['low'])
                time_start = int(c2['time'])
                time_end = int(df.iloc[-1]['time'])
                mitigated = False

                for j in range(i + 1, len(df)):
                    if df.iloc[j]['high'] >= price_min:
                        time_end = int(df.iloc[j]['time'])
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
