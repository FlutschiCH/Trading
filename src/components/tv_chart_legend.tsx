import React from 'react';
import { Eye, EyeOff, Settings, X } from 'lucide-react';
import type { IndicatorConfig } from '../services/indicatorService';

interface TVChartLegendProps {
  indicators: IndicatorConfig[];
  pane?: 'main' | 'subpane';
  indicatorLatestValues: Record<string, string>;
  theme?: 'dark' | 'light';
  top?: string | number;
  left?: string | number;
  direction?: 'column' | 'row';
  onToggleVisibility: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export const TVChartLegend: React.FC<TVChartLegendProps> = ({
  indicators,
  pane = 'main',
  indicatorLatestValues,
  theme = 'dark',
  top = '12px',
  left = '14px',
  direction = 'column',
  onToggleVisibility,
  onEdit,
  onRemove,
}) => {
  const isLight = theme === 'light';
  const paneIndicators = indicators.filter((i) =>
    pane === 'subpane' ? i.pane === 'subpane' : i.pane !== 'subpane'
  );

  if (paneIndicators.length === 0) return null;

  return (
    <div
      style={{
        position: top !== undefined && left !== undefined ? 'absolute' : 'relative',
        top,
        left,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '4px',
        pointerEvents: 'auto',
        maxWidth: '90%',
      }}
    >
      {paneIndicators.map((ind) => {
        const valStr = indicatorLatestValues[ind.id];
        const labelText =
          ind.label ||
          (pane === 'subpane'
            ? `${ind.name.toUpperCase()} ${ind.params.period || ''}`.trim()
            : `${ind.name.toUpperCase()} ${ind.params.period}`);

        return (
          <div
            key={ind.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              backgroundColor: isLight
                ? 'rgba(255, 255, 255, 0.88)'
                : 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(4px)',
              border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
              borderRadius: '6px',
              padding: '3px 10px',
              fontSize: '11px',
              lineHeight: '1.2',
              color: isLight ? '#0f172a' : '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              opacity: ind.visible ? 1 : 0.75,
              flexShrink: 0,
            }}
          >
            {/* Indicator Dot & Name */}
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: ind.color,
                display: 'inline-block',
                flexShrink: 0,
                opacity: ind.visible ? 1 : 0.4,
              }}
            />
            <span
              style={{
                fontWeight: 'bold',
                color: ind.color,
                opacity: ind.visible ? 1 : 0.6,
                marginLeft: '5px',
                marginRight: '3px',
                whiteSpace: 'nowrap',
              }}
            >
              {labelText}
            </span>

            {/* Action buttons (Eye, Settings, Remove) placed FIRST after the label */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                marginLeft: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => onToggleVisibility(ind.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '1px',
                  cursor: 'pointer',
                  color: ind.visible
                    ? isLight
                      ? '#3b82f6'
                      : '#60a5fa'
                    : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={ind.visible ? 'Hide indicator' : 'Show indicator'}
              >
                {ind.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                type="button"
                onClick={() => onEdit(ind.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '1px',
                  cursor: 'pointer',
                  color: isLight ? '#64748b' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Edit indicator"
              >
                <Settings size={12} />
              </button>
              <button
                type="button"
                onClick={() => onRemove(ind.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '1px',
                  cursor: 'pointer',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Remove indicator"
              >
                <X size={12} />
              </button>
            </div>

            {/* Price / Value placed AFTER the action buttons */}
            {ind.visible && valStr && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: isLight ? '#334155' : '#cbd5e1',
                  marginLeft: '6px',
                }}
              >
                {valStr}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TVChartLegend;
