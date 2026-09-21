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
  params: Record<string, any>;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface CalculatedIndicatorData {
  [indicatorId: string]: {
    type: 'series' | 'dataframe' | 'error';
    points?: IndicatorPoint[];
    columns?: {
      [colName: string]: {
        points: IndicatorPoint[];
        values?: (number | null)[];
      };
    };
    error?: string;
  };
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
 * Fetches the dynamic indicator catalog from Python backend GET /indicators/catalog.
 */
export async function fetchIndicatorCatalog(): Promise<CatalogIndicatorItem[]> {
  if (cachedCatalog) return cachedCatalog;

  try {
    const response = await fetch(`${API_BASE_URL}/indicators/catalog`);
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
  ];
}

/**
 * Sends active candles and active indicator configs to the Python backend
 * to calculate exact values using IndicatorHandler.
 */
export async function calculateIndicatorsBackend(
  candles: Candle[] | any[],
  indicators: IndicatorConfig[]
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
    params: ind.params || {},
  }));

  try {
    const response = await fetch(`${API_BASE_URL}/indicators/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candles: payloadCandles,
        indicators: payloadIndicators,
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
