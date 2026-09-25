import { API_BASE_URL } from '../api';
import type { Candle } from '../types/trading';

export type IndicatorType = string;
export type PriceSource = 'close' | 'open' | 'high' | 'low';

export interface ParamDefinition {
  type: 'int' | 'float' | 'select' | 'string';
  default: any;
  min?: number;
  max?: number;
  options?: string[];
  label?: string;
}

export interface CatalogIndicatorItem {
  id: string;
  name: string;
  category: string;
  pane: 'overlay' | 'subpane';
  description?: string;
  params: Record<string, ParamDefinition>;
}

export interface IndicatorConfig {
  id: string;
  name: string;
  label?: string;
  pane?: 'overlay' | 'subpane';
  visible: boolean;
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: number; // 0: Solid, 1: Dotted, 2: Dashed
  timeframe?: string; // Optional custom timeframe ('chart' or empty for base chart timeframe, or '1m', '5m', '15m', '1h', '4h', '1d', etc.)
  params: Record<string, any>;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface VolumeProfileBin {
  price: number;
  buyVol: number;
  sellVol: number;
  totalVol: number;
  inValueArea: boolean;
}

export interface VolumeProfileBucket {
  timeStart: number;
  timeEnd: number;
  priceMin: number;
  priceMax: number;
  poc: number;
  vah: number;
  val: number;
  totalVolume: number;
  maxBinVolume: number;
  bins: VolumeProfileBin[];
}

export interface CalculatedIndicatorData {
  [indicatorId: string]: {
    type: 'series' | 'dataframe' | 'list' | 'value' | 'error';
    points?: IndicatorPoint[];
    data?: any[];
    columns?: {
      [colName: string]: {
        points: IndicatorPoint[];
        values?: (number | null)[];
      };
    };
    error?: string;
  };
}

/**
 * High-performance client-side Volume Profile calculation for instant panning/zooming.
 */
export function calculateVolumeProfilesClient(
  candles: Candle[] | any[],
  periodMode: string = 'daily',
  numBins: number = 40,
  valueAreaPct: number = 0.70
): VolumeProfileBucket[] {
  if (!candles || candles.length === 0) return [];

  const mode = String(periodMode).toLowerCase().trim();
  const buckets: { [key: string]: any[] } = {};

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const t = Number(c.time);
    let key = '0';

    if (mode === '15m') {
      key = String(Math.floor(t / (15 * 60)));
    } else if (mode === 'hourly' || mode === '1h') {
      key = String(Math.floor(t / 3600));
    } else if (mode === '4h') {
      key = String(Math.floor(t / (4 * 3600)));
    } else if (mode === 'weekly' || mode === '1w') {
      key = String(Math.floor(t / (7 * 86400)));
    } else if (mode === 'entire_range' || mode === 'visible' || mode === 'all') {
      key = 'all';
    } else {
      // Daily default (86400s)
      key = String(Math.floor(t / 86400));
    }

    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(c);
  }

  const profiles: VolumeProfileBucket[] = [];
  const binCount = Math.max(10, Math.min(Number(numBins) || 40, 150));
  const vaRatio = Math.max(0.1, Math.min(Number(valueAreaPct) || 0.70, 1.0));

  for (const key in buckets) {
    const grp = buckets[key];
    if (!grp || grp.length === 0) continue;

    let pMin = Infinity;
    let pMax = -Infinity;
    let tStart = Infinity;
    let tEnd = -Infinity;
    let totalVol = 0;

    for (let i = 0; i < grp.length; i++) {
      const c = grp[i];
      const l = Number(c.low);
      const h = Number(c.high);
      const t = Number(c.time);
      const v = Number(c.volume || 0);

      if (l < pMin) pMin = l;
      if (h > pMax) pMax = h;
      if (t < tStart) tStart = t;
      if (t > tEnd) tEnd = t;
      totalVol += v;
    }

    if (pMax <= pMin || totalVol <= 0) continue;

    const step = (pMax - pMin) / binCount;
    const binBuyVol = new Float64Array(binCount);
    const binSellVol = new Float64Array(binCount);
    const binPrices = new Float64Array(binCount);

    for (let b = 0; b < binCount; b++) {
      binPrices[b] = pMin + (b + 0.5) * step;
    }

    for (let i = 0; i < grp.length; i++) {
      const c = grp[i];
      const op = Number(c.open);
      const cl = Number(c.close);
      const hi = Number(c.high);
      const lo = Number(c.low);
      const vol = Number(c.volume || 0);

      const rng = hi - lo;
      const bullRatio = rng > 0 ? Math.max(0.05, Math.min(0.95, 0.5 + (0.5 * (cl - op)) / rng)) : 0.5;
      const buyV = vol * bullRatio;
      const sellV = vol * (1.0 - bullRatio);

      if (hi <= lo) {
        const bIdx = Math.max(0, Math.min(binCount - 1, Math.floor((lo - pMin) / step)));
        binBuyVol[bIdx] += buyV;
        binSellVol[bIdx] += sellV;
      } else {
        const bStart = Math.max(0, Math.min(binCount - 1, Math.floor((lo - pMin) / step)));
        const bEnd = Math.max(0, Math.min(binCount - 1, Math.floor((hi - pMin) / step)));
        const count = Math.max(1, bEnd - bStart + 1);
        const buyEach = buyV / count;
        const sellEach = sellV / count;
        for (let b = bStart; b <= bEnd; b++) {
          binBuyVol[b] += buyEach;
          binSellVol[b] += sellEach;
        }
      }
    }

    const binTotalVol = new Float64Array(binCount);
    let maxBinIdx = 0;
    let maxBinVol = -1;

    for (let b = 0; b < binCount; b++) {
      binTotalVol[b] = binBuyVol[b] + binSellVol[b];
      if (binTotalVol[b] > maxBinVol) {
        maxBinVol = binTotalVol[b];
        maxBinIdx = b;
      }
    }

    const poc = binPrices[maxBinIdx];
    const targetVaVol = totalVol * vaRatio;
    let currentVaVol = binTotalVol[maxBinIdx];
    let vaLowIdx = maxBinIdx;
    let vaHighIdx = maxBinIdx;

    while (currentVaVol < targetVaVol && (vaLowIdx > 0 || vaHighIdx < binCount - 1)) {
      const nextLowVol = vaLowIdx > 0 ? binTotalVol[vaLowIdx - 1] : -1;
      const nextHighVol = vaHighIdx < binCount - 1 ? binTotalVol[vaHighIdx + 1] : -1;

      if (nextHighVol >= nextLowVol && nextHighVol >= 0) {
        vaHighIdx++;
        currentVaVol += nextHighVol;
      } else if (nextLowVol >= 0) {
        vaLowIdx--;
        currentVaVol += nextLowVol;
      } else {
        break;
      }
    }

    const vah = binPrices[vaHighIdx] + 0.5 * step;
    const val = binPrices[vaLowIdx] - 0.5 * step;

    const binsList: VolumeProfileBin[] = [];
    for (let b = 0; b < binCount; b++) {
      binsList.push({
        price: binPrices[b],
        buyVol: binBuyVol[b],
        sellVol: binSellVol[b],
        totalVol: binTotalVol[b],
        inValueArea: b >= vaLowIdx && b <= vaHighIdx,
      });
    }

    profiles.push({
      timeStart: tStart,
      timeEnd: tEnd,
      priceMin: pMin,
      priceMax: pMax,
      poc,
      vah,
      val,
      totalVolume: totalVol,
      maxBinVolume: maxBinVol,
      bins: binsList,
    });
  }

  return profiles;
}

const STORAGE_KEY = 'wyckoff_chart_indicators';
let cachedCatalog: CatalogIndicatorItem[] | null = null;

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  {
    id: 'ema_20_default',
    name: 'ema',
    label: 'EMA 20',
    visible: true,
    color: '#3b82f6',
    lineWidth: 2,
    lineStyle: 0,
    params: { period: 20, column: 'close' },
  },
  {
    id: 'ema_50_default',
    name: 'ema',
    label: 'EMA 50',
    visible: true,
    color: '#f59e0b',
    lineWidth: 2,
    lineStyle: 0,
    params: { period: 50, column: 'close' },
  },
];

export const loadStoredIndicators = (): IndicatorConfig[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Failed to load stored indicators:', err);
  }
  return DEFAULT_INDICATORS;
};

export const saveStoredIndicators = (indicators: IndicatorConfig[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(indicators));
  } catch (err) {
    console.error('Failed to save indicators to storage:', err);
  }
};

/**
 * Fetches the dynamic indicator catalog from Python backend GET /api/indicators/catalog.
 */
export async function fetchIndicatorCatalog(): Promise<CatalogIndicatorItem[]> {
  if (cachedCatalog) return cachedCatalog;

  try {
    const response = await fetch(`${API_BASE_URL}/api/indicators/catalog`);
    if (response.ok) {
      const json = await response.json();
      if (json.status === 'success' && json.data) {
        const items: CatalogIndicatorItem[] = Object.entries(json.data).map(([key, val]: [string, any]) => ({
          id: key,
          name: val.name || key.toUpperCase(),
          category: val.category || 'Other',
          pane: val.pane || 'overlay',
          description: val.description || '',
          params: val.params || {},
        }));
        cachedCatalog = items;
        return items;
      }
    }
  } catch (err) {
    console.warn('[IndicatorService] Failed to fetch catalog from backend, using fallback:', err);
  }

  // Fallback if backend is loading
  return [
    {
      id: 'ema',
      name: 'Exponential Moving Average (EMA)',
      category: 'Trend Overlays',
      pane: 'overlay',
      description: 'Weighted moving average giving higher weight to recent prices.',
      params: {
        period: { type: 'int', default: 20, min: 1, label: 'Period' },
        column: { type: 'select', default: 'close', options: ['close', 'open', 'high', 'low'], label: 'Source' },
      },
    },
    {
      id: 'sma',
      name: 'Simple Moving Average (SMA)',
      category: 'Trend Overlays',
      pane: 'overlay',
      description: 'Arithmetic moving average.',
      params: {
        period: { type: 'int', default: 50, min: 1, label: 'Period' },
        column: { type: 'select', default: 'close', options: ['close', 'open', 'high', 'low'], label: 'Source' },
      },
    },
    {
      id: 'volume_profile',
      name: 'Volume Profile (VP)',
      category: 'Volume & Flow',
      pane: 'overlay',
      description: 'Volume distribution across price levels, Point of Control (POC), and Value Area.',
      params: {
        period_mode: {
          type: 'select',
          default: 'daily',
          options: ['daily', 'hourly', '15m', '4h', 'weekly', 'visible'],
          label: 'Range / Bucket Mode',
        },
        num_bins: { type: 'int', default: 40, min: 10, max: 150, label: 'Number of Rows' },
        value_area_pct: { type: 'float', default: 0.70, min: 0.1, max: 1.0, label: 'Value Area %' },
      },
    },
  ];
}

export interface IndicatorCalculationContext {
  symbol?: string;
  timeframe?: string;
  broker?: string;
  account_id?: string;
}

/**
 * Sends active candles and active indicator configs to the Python backend
 * to calculate exact values using IndicatorHandler.
 */
export async function calculateIndicatorsBackend(
  candles: Candle[] | any[],
  indicators: IndicatorConfig[],
  context?: IndicatorCalculationContext
): Promise<CalculatedIndicatorData> {
  const activeIndicators = indicators.filter((ind) => ind.visible);
  if (!candles || candles.length === 0 || activeIndicators.length === 0) {
    return {};
  }

  const payloadCandles = candles.map((c) => ({
    time: Number(c.time),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume || 0),
  }));

  const payloadIndicators = activeIndicators.map((ind) => ({
    id: ind.id,
    name: ind.name,
    timeframe: ind.timeframe || ind.params?.timeframe || 'chart',
    params: ind.params || {},
  }));

  try {
    const response = await fetch(`${API_BASE_URL}/api/indicators/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candles: payloadCandles,
        indicators: payloadIndicators,
        symbol: context?.symbol,
        timeframe: context?.timeframe,
        broker: context?.broker,
        account_id: context?.account_id,
      }),
    });

    if (!response.ok) {
      throw new Error(`Indicator calculation failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.status === 'success' && data.data) {
      return data.data as CalculatedIndicatorData;
    }
  } catch (err) {
    console.error('[IndicatorService] Error fetching calculated indicators:', err);
  }

  return {};
}
