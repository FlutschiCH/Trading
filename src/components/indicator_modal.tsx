import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, Edit2, Check, Search, Sliders, Layers } from 'lucide-react';
import {
  type IndicatorConfig,
  type CatalogIndicatorItem,
  fetchIndicatorCatalog,
} from '../services/indicatorService';

interface IndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  indicators: IndicatorConfig[];
  onSaveIndicators: (indicators: IndicatorConfig[]) => void;
  theme?: 'dark' | 'light';
  initialEditingId?: string | null;
}

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#f59e0b', // Amber/Orange
  '#10b981', // Green
  '#ef4444', // Red
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#eab308', // Yellow
  '#ffffff', // White
  '#94a3b8', // Slate Gray
];

export default function IndicatorModal({
  isOpen,
  onClose,
  indicators,
  onSaveIndicators,
  theme = 'dark',
  initialEditingId = null,
}: IndicatorModalProps) {
  const isLight = theme === 'light';

  const [catalog, setCatalog] = useState<CatalogIndicatorItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'library' | 'active'>('library');

  // Currently selected indicator for adding / editing
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogIndicatorItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(initialEditingId);
  const [formParams, setFormParams] = useState<Record<string, any>>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('chart');
  const [color, setColor] = useState<string>('#3b82f6');
  const [lineWidth, setLineWidth] = useState<1 | 2 | 3 | 4>(2);
  const [lineStyle, setLineStyle] = useState<number>(0);

  // Fetch catalog on modal open
  useEffect(() => {
    if (isOpen) {
      setLoadingCatalog(true);
      fetchIndicatorCatalog()
        .then((items) => {
          setCatalog(items);
          if (items.length > 0 && !selectedCatalogItem && !editingId) {
            selectForAdd(items[0]);
          }
        })
        .finally(() => setLoadingCatalog(false));
    }
  }, [isOpen]);

  // Handle initialEditingId
  useEffect(() => {
    if (initialEditingId && indicators.length > 0) {
      const target = indicators.find((i) => i.id === initialEditingId);
      if (target) {
        startEdit(target);
        setActiveTab('active');
      }
    }
  }, [initialEditingId, indicators]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ['All', ...Array.from(set)];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [catalog, searchQuery, selectedCategory]);

  const selectForAdd = (item: CatalogIndicatorItem) => {
    setSelectedCatalogItem(item);
    setEditingId(null);
    const defaults: Record<string, any> = {};
    Object.entries(item.params || {}).forEach(([pKey, pDef]) => {
      defaults[pKey] = pDef.default;
    });
    setFormParams(defaults);
    setSelectedTimeframe('chart');

    // Pick a complementary color based on category
    if (item.id === 'supertrend') setColor('#10b981');
    else if (item.id === 'vwap') setColor('#eab308');
    else if (item.id === 'hma') setColor('#ec4899');
    else if (item.id === 'donchian_channels' || item.id === 'keltner_channels') setColor('#06b6d4');
    else if (item.id === 'parabolic_sar') setColor('#a855f7');
    else setColor('#3b82f6');
  };

  const startEdit = (ind: IndicatorConfig) => {
    setEditingId(ind.id);
    const catalogItem = catalog.find((c) => c.id === ind.name) || {
      id: ind.name,
      name: ind.label || ind.name.toUpperCase(),
      category: 'Indicator',
      pane: 'overlay',
      params: {},
    };
    setSelectedCatalogItem(catalogItem);
    setFormParams(ind.params || {});
    setSelectedTimeframe(ind.timeframe || ind.params?.timeframe || 'chart');
    setColor(ind.color || '#3b82f6');
    setLineWidth(ind.lineWidth || 2);
    setLineStyle(ind.lineStyle || 0);
  };

  const handleSaveIndicator = () => {
    if (!selectedCatalogItem) return;

    const baseName = selectedCatalogItem.name.split('(')[0].trim();
    const periodStr = formParams.period ? ` ${formParams.period}` : '';
    const tfStr = selectedTimeframe && selectedTimeframe !== 'chart' ? ` [${selectedTimeframe.toUpperCase()}]` : '';
    const computedLabel = `${baseName}${periodStr}${tfStr}`.trim();

    if (editingId) {
      // Update existing
      const updated = indicators.map((ind) => {
        if (ind.id === editingId) {
          return {
            ...ind,
            name: selectedCatalogItem.id,
            label: computedLabel,
            pane: selectedCatalogItem.pane || 'overlay',
            color,
            lineWidth,
            lineStyle,
            timeframe: selectedTimeframe || 'chart',
            params: { ...formParams, timeframe: selectedTimeframe || 'chart' },
          };
        }
        return ind;
      });
      onSaveIndicators(updated);
      setEditingId(null);
      setActiveTab('active');
    } else {
      // Add new
      const newId = `${selectedCatalogItem.id}_${Date.now()}`;
      const newInd: IndicatorConfig = {
        id: newId,
        name: selectedCatalogItem.id,
        label: computedLabel,
        pane: selectedCatalogItem.pane || 'overlay',
        visible: true,
        color,
        lineWidth,
        lineStyle,
        timeframe: selectedTimeframe || 'chart',
        params: { ...formParams, timeframe: selectedTimeframe || 'chart' },
      };
      onSaveIndicators([...indicators, newInd]);
      setActiveTab('active');
    }
  };

  const handleToggleVisible = (id: string) => {
    const updated = indicators.map((ind) => (ind.id === id ? { ...ind, visible: !ind.visible } : ind));
    onSaveIndicators(updated);
  };

  const handleDelete = (id: string) => {
    const updated = indicators.filter((ind) => ind.id !== id);
    onSaveIndicators(updated);
    if (editingId === id) setEditingId(null);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: isLight ? '#ffffff' : '#0f172a',
          border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
          borderRadius: '12px',
          padding: '20px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.7)',
          color: isLight ? '#0f172a' : '#ffffff',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={20} /> Indicators Directory
            </span>
            <span style={{ fontSize: '11px', color: isLight ? '#64748b' : '#94a3b8', backgroundColor: isLight ? '#f1f5f9' : '#1e293b', padding: '2px 8px', borderRadius: '4px', border: isLight ? '1px solid #e2e8f0' : '1px solid #334155' }}>
              Python Backend Engine ({catalog.length} Available)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Tab switchers */}
            <div style={{ display: 'flex', backgroundColor: isLight ? '#f1f5f9' : '#1e293b', borderRadius: '6px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'library' ? '#3b82f6' : 'transparent',
                  color: activeTab === 'library' ? '#ffffff' : (isLight ? '#64748b' : '#94a3b8'),
                }}
              >
                Browse Library
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('active')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'active' ? '#3b82f6' : 'transparent',
                  color: activeTab === 'active' ? '#ffffff' : (isLight ? '#64748b' : '#94a3b8'),
                }}
              >
                Active ({indicators.length})
              </button>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: isLight ? '#64748b' : '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', flex: 1, overflowY: 'auto', paddingTop: '16px' }}>
          {/* Left Column: Directory / Search / Active List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', paddingRight: '4px' }}>
            {activeTab === 'library' ? (
              <>
                {/* Search Bar */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', color: isLight ? '#94a3b8' : '#64748b' }} />
                  <input
                    type="text"
                    placeholder="Search indicators (e.g. EMA, Supertrend, Bollinger, HMA, VWAP)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: isLight ? '#f1f5f9' : '#1e293b',
                      border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
                      borderRadius: '6px',
                      padding: '8px 12px 8px 32px',
                      color: isLight ? '#0f172a' : '#ffffff',
                      fontSize: '12px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Category Filter Chips */}
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        border: selectedCategory === cat ? '1px solid #3b82f6' : (isLight ? '1px solid #cbd5e1' : '1px solid #334155'),
                        backgroundColor: selectedCategory === cat ? (isLight ? '#dbeafe' : 'rgba(59, 130, 246, 0.2)') : (isLight ? '#f8fafc' : '#1e293b'),
                        color: selectedCategory === cat ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
                        cursor: 'pointer',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Indicator Cards List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', maxHeight: '380px' }}>
                  {filteredCatalog.map((item) => {
                    const isSelected = selectedCatalogItem?.id === item.id && !editingId;
                    return (
                      <div
                        key={item.id}
                        onClick={() => selectForAdd(item)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          backgroundColor: isSelected
                            ? isLight ? '#eff6ff' : 'rgba(59, 130, 246, 0.2)'
                            : isLight ? '#f8fafc' : '#1e293b',
                          border: isSelected ? '1px solid #3b82f6' : (isLight ? '1px solid #e2e8f0' : '1px solid #334155'),
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: isSelected ? '#3b82f6' : (isLight ? '#0f172a' : '#ffffff') }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: '9px', fontWeight: 600, color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)', padding: '1px 5px', borderRadius: '3px' }}>
                            {item.category}
                          </span>
                        </div>
                        {item.description && (
                          <span style={{ fontSize: '10px', color: isLight ? '#64748b' : '#94a3b8', lineHeight: '1.3' }}>
                            {item.description}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Active Indicators List Tab */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: isLight ? '#64748b' : '#94a3b8' }}>
                  Active on Current Chart:
                </div>
                {indicators.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', fontSize: '12px', color: isLight ? '#94a3b8' : '#64748b' }}>
                    No indicators added yet. Choose an indicator from the Library tab!
                  </div>
                ) : (
                  indicators.map((ind) => {
                    const isCurrentEdit = editingId === ind.id;
                    return (
                      <div
                        key={ind.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          backgroundColor: isCurrentEdit
                            ? isLight ? '#eff6ff' : 'rgba(59, 130, 246, 0.2)'
                            : isLight ? '#f8fafc' : '#1e293b',
                          border: isCurrentEdit ? '1px solid #3b82f6' : (isLight ? '1px solid #e2e8f0' : '1px solid #334155'),
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: ind.color,
                              display: 'inline-block',
                            }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 'bold', opacity: ind.visible ? 1 : 0.4 }}>
                            {ind.label || ind.name.toUpperCase()}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleVisible(ind.id)}
                            style={{ background: 'none', border: 'none', color: ind.visible ? '#3b82f6' : '#94a3b8', cursor: 'pointer', padding: '2px' }}
                            title={ind.visible ? 'Hide' : 'Show'}
                          >
                            {ind.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(ind)}
                            style={{ background: 'none', border: 'none', color: isCurrentEdit ? '#3b82f6' : (isLight ? '#475569' : '#cbd5e1'), cursor: 'pointer', padding: '2px' }}
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(ind.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Right Column: Dynamic Parameter Editor */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              backgroundColor: isLight ? '#f8fafc' : '#1e293b',
              padding: '16px',
              borderRadius: '8px',
              border: isLight ? '1px solid #e2e8f0' : '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid #334155', paddingBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                  {editingId ? 'Edit Configuration' : 'Parameters & Styling'}
                </span>
                {selectedCatalogItem && (
                  <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 600 }}>
                    {selectedCatalogItem.name}
                  </div>
                )}
              </div>

              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    if (catalog.length > 0) selectForAdd(catalog[0]);
                  }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {/* Dynamic Inputs from Backend Schema */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto' }}>
              {/* Universal Timeframe Selector for any Indicator */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#64748b' : '#94a3b8' }}>
                  Timeframe:
                </label>
                <select
                  value={selectedTimeframe}
                  onChange={(e) => setSelectedTimeframe(e.target.value)}
                  style={{
                    backgroundColor: isLight ? '#ffffff' : '#0f172a',
                    border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: isLight ? '#0f172a' : '#ffffff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    outline: 'none',
                  }}
                >
                  <option value="chart">CHART (Current Timeframe)</option>
                  <option value="1m">1m</option>
                  <option value="3m">3m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="30m">30m</option>
                  <option value="1h">1h</option>
                  <option value="2h">2h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                  <option value="1w">1w</option>
                </select>
              </div>

              {selectedCatalogItem && Object.keys(selectedCatalogItem.params || {}).length > 0 ? (
                Object.entries(selectedCatalogItem.params).map(([paramName, paramDef]) => {
                  const currVal = formParams[paramName] !== undefined ? formParams[paramName] : paramDef.default;
                  const label = paramDef.label || paramName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

                  if (paramDef.type === 'select' && Array.isArray(paramDef.options)) {
                    return (
                      <div key={paramName} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#64748b' : '#94a3b8' }}>
                          {label}:
                        </label>
                        <select
                          value={currVal}
                          onChange={(e) => setFormParams({ ...formParams, [paramName]: e.target.value })}
                          style={{
                            backgroundColor: isLight ? '#ffffff' : '#0f172a',
                            border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: isLight ? '#0f172a' : '#ffffff',
                            fontSize: '12px',
                            outline: 'none',
                          }}
                        >
                          {paramDef.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  const isFloat = paramDef.type === 'float';
                  return (
                    <div key={paramName} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#64748b' : '#94a3b8' }}>
                        {label}:
                      </label>
                      <input
                        type="number"
                        step={isFloat ? '0.1' : '1'}
                        min={paramDef.min ?? 1}
                        max={paramDef.max ?? 10000}
                        value={currVal}
                        onChange={(e) => {
                          const parsed = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                          setFormParams({ ...formParams, [paramName]: isNaN(parsed) ? '' : parsed });
                        }}
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#0f172a',
                          border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          color: isLight ? '#0f172a' : '#ffffff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          outline: 'none',
                        }}
                      />
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: '11px', color: isLight ? '#64748b' : '#94a3b8', fontStyle: 'italic' }}>
                  No extra tuning parameters required for this indicator.
                </div>
              )}

              {/* Color & Line Appearance */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid #334155', paddingTop: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#64748b' : '#94a3b8' }}>Line Color & Style:</label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: c,
                          border: color === c ? '2px solid #38bdf8' : '1px solid rgba(0,0,0,0.3)',
                          cursor: 'pointer',
                          transform: color === c ? 'scale(1.15)' : 'scale(1)',
                          transition: 'all 0.15s',
                        }}
                      />
                    ))}
                  </div>

                  <select
                    value={lineWidth}
                    onChange={(e) => setLineWidth(Number(e.target.value) as 1 | 2 | 3 | 4)}
                    style={{
                      backgroundColor: isLight ? '#ffffff' : '#0f172a',
                      border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
                      borderRadius: '6px',
                      padding: '4px 6px',
                      color: isLight ? '#0f172a' : '#ffffff',
                      fontSize: '11px',
                      outline: 'none',
                    }}
                  >
                    <option value={1}>1px (Thin)</option>
                    <option value={2}>2px (Standard)</option>
                    <option value={3}>3px (Thick)</option>
                    <option value={4}>4px (Extra)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={handleSaveIndicator}
              disabled={!selectedCatalogItem}
              style={{
                marginTop: 'auto',
                padding: '10px 16px',
                borderRadius: '8px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
              }}
            >
              {editingId ? <Check size={16} /> : <Plus size={16} />}
              {editingId ? 'Update Indicator' : 'Add to Chart'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
