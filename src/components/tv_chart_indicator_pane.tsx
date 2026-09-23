import React from 'react';
import type { IndicatorConfig } from '../services/indicatorService';
import TVChartLegend from './tv_chart_legend';

interface TVChartIndicatorPaneProps {
  containerRef: React.RefObject<HTMLDivElement>;
  height: number;
  indicators: IndicatorConfig[];
  indicatorLatestValues: Record<string, string>;
  theme?: 'dark' | 'light';
  onToggleVisibility: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export default function TVChartIndicatorPane({
  containerRef,
  height,
  indicators,
  indicatorLatestValues,
  theme = 'dark',
  onToggleVisibility,
  onEdit,
  onRemove,
}: TVChartIndicatorPaneProps) {
  const isVisible = indicators.some((i) => (i.pane === 'subpane' || (i.name && ['rsi', 'macd', 'stochastic', 'atr'].includes(i.name.toLowerCase()))) && i.visible);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: isVisible ? height : 0,
        display: isVisible ? 'block' : 'none',
        overflow: 'hidden',
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: `${height}px`, touchAction: 'none' }}
      />

      {/* Indicators Subpane Legend */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '14px',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          pointerEvents: 'auto',
          maxWidth: '90%',
        }}
      >
        <TVChartLegend
          indicators={indicators}
          pane="subpane"
          indicatorLatestValues={indicatorLatestValues}
          theme={theme}
          top="0px"
          left="0px"
          onToggleVisibility={onToggleVisibility}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
