import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Filter, Trash2, Pause, Play, Download, Search, CheckSquare, Square } from 'lucide-react';
import { API_BASE_URL } from '../api';

interface LogPanelProps {
  isMobileLayout?: boolean;
}

const KNOWN_SOURCES = [
  'Flask API',
  'CandleCollectorHandler',
  'LiveRunner',
  'TerminalHandler',
  'SQLHandler',
  'BrokerHandler',
  'WyckoffHandler',
  'PositionManager'
];

export default function LogPanel({ isMobileLayout = false }: LogPanelProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [selectedSources, setSelectedSources] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { 'Flask API': true };
    KNOWN_SOURCES.forEach(s => {
      initial[s] = true;
    });
    return initial;
  });
  const [showOther, setShowOther] = useState<boolean>(true);
  const [filterText, setFilterText] = useState<string>('');
  const [sourceSearchText, setSourceSearchText] = useState<string>('');
  const [discoveredSources, setDiscoveredSources] = useState<string[]>(KNOWN_SOURCES);
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 40;
      userScrolledUpRef.current = !isAtBottom;
    }
  };

  useEffect(() => {
    // SSE streaming disabled
  }, []);

  useEffect(() => {
    if (!isPaused && containerRef.current && !userScrolledUpRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, isPaused]);



  const classifySource = (logLine: string): string => {
    // Check if Flask/WSGI API log line
    if (logLine.includes('GET /') || logLine.includes('POST /') || logLine.includes('PUT /') || logLine.includes('DELETE /') || logLine.includes('[API Log]')) {
      return 'Flask API';
    }

    const match = logLine.match(/\[([A-Za-z0-9_ -]+)\]/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return 'Other';
  };

  const filteredLogs = logs.filter((line) => {
    if (filterText && !line.toLowerCase().includes(filterText.toLowerCase())) {
      return false;
    }

    const src = classifySource(line);
    if (src === 'Other') {
      return showOther;
    }
    return selectedSources[src] !== false;
  });

  useEffect(() => {
    // Fetch log settings from database on mount
    fetch(`${API_BASE_URL}/api/system/log-settings`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.settings) {
          setSelectedSources(prev => ({
            ...prev,
            ...data.settings
          }));
        }
      })
      .catch(err => console.warn("Failed to load DB log settings:", err));
  }, []);

  const toggleSource = (source: string) => {
    const nextVal = !selectedSources[source];
    setSelectedSources((prev) => ({
      ...prev,
      [source]: nextVal
    }));

    // Persist setting to MySQL database via API
    fetch(`${API_BASE_URL}/api/system/log-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: source, enabled: nextVal })
    }).catch(err => console.error("Failed to persist log setting to DB:", err));
  };

  const selectAll = () => {
    const updated: Record<string, boolean> = {};
    discoveredSources.forEach((s) => (updated[s] = true));
    setSelectedSources(updated);
    setShowOther(true);
  };

  const deselectAll = () => {
    const updated: Record<string, boolean> = {};
    discoveredSources.forEach((s) => (updated[s] = false));
    setSelectedSources(updated);
    setShowOther(false);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleDownloadLogs = () => {
    const element = document.createElement("a");
    const file = new Blob([logs.join('\n')], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `system_logs_${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      backgroundColor: 'var(--app-bg, #0b0f19)',
      color: 'var(--app-text, #f3f4f6)',
      borderRadius: '8px',
      overflow: 'hidden',
      fontFamily: 'monospace',
    }}>
      {/* Header Controls */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        backgroundColor: 'var(--app-panel-header-bg, #111827)',
        borderBottom: '1px solid var(--app-card-border, #1f2937)',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={16} className="text-emerald-400" />
          <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--app-text, #f3f4f6)' }}>System Realtime Logs</span>
          <span style={{ fontSize: '11px', color: 'var(--app-text-muted, #9ca3af)', backgroundColor: 'var(--app-hover-bg, #1e293b)', padding: '2px 6px', borderRadius: '4px' }}>
            {filteredLogs.length} / {logs.length} lines
          </span>
        </div>

        {/* Toolbar controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Search Filter input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Filter text..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{
                backgroundColor: 'var(--app-input-bg, #1e293b)',
                border: '1px solid var(--app-input-border, #334155)',
                color: 'var(--app-input-text, #ffffff)',
                borderRadius: '4px',
                padding: '4px 8px 4px 26px',
                fontSize: '11px',
                outline: 'none',
                width: '130px'
              }}
            />
          </div>

          {/* Sources Overlay Button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowFilterDropdown(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: showFilterDropdown ? '#2563eb' : 'var(--app-hover-bg, #1e293b)',
                border: '1px solid #3b82f6',
                color: 'var(--app-text, #ffffff)',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(59, 130, 246, 0.25)',
                transition: 'all 0.2s',
              }}
            >
              <Filter size={13} style={{ color: '#60a5fa' }} />
              <span>Log Sources & Settings</span>
              <span style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '1px 6px',
                borderRadius: '10px',
                marginLeft: '2px'
              }}>
                {Object.values(selectedSources).filter(Boolean).length} / {discoveredSources.length}
              </span>
            </button>

            {/* Modal Overlay */}
            {showFilterDropdown && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(4px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px'
              }} onClick={() => setShowFilterDropdown(false)}>
                <div style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  width: '100%',
                  maxWidth: '480px',
                  maxHeight: '85vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
                  overflow: 'hidden',
                  fontFamily: 'sans-serif'
                }} onClick={(e) => e.stopPropagation()}>
                  {/* Modal Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 18px',
                    borderBottom: '1px solid #1e293b',
                    backgroundColor: '#1e293b'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Filter size={18} className="text-blue-400" />
                      <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#f8fafc' }}>Configure Log Sources & Filters</span>
                    </div>
                    <button
                      onClick={() => setShowFilterDropdown(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >✕</button>
                  </div>

                  {/* Search Bar inside Modal */}
                  <div style={{ padding: '14px 18px 8px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', color: '#64748b' }} />
                      <input
                        type="text"
                        placeholder="Search log source categories..."
                        value={sourceSearchText}
                        onChange={(e) => setSourceSearchText(e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #334155',
                          color: '#f8fafc',
                          borderRadius: '6px',
                          padding: '8px 12px 8px 32px',
                          fontSize: '12px',
                          outline: 'none'
                        }}
                      />
                    </div>

                    {/* Quick Action Presets */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button onClick={selectAll} style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #3b82f6',
                        color: '#60a5fa',
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}>Enable All</button>
                      <button onClick={deselectAll} style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #ef4444',
                        color: '#f87171',
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}>Disable All</button>
                    </div>
                  </div>

                  {/* Sources Checklist */}
                  <div style={{
                    padding: '8px 18px 14px 18px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '320px'
                  }}>
                    {discoveredSources
                      .filter(src => src.toLowerCase().includes(sourceSearchText.toLowerCase()))
                      .map((src) => {
                        const isEnabled = selectedSources[src] !== false;
                        return (
                          <div
                            key={src}
                            onClick={() => toggleSource(src)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              backgroundColor: isEnabled ? '#1e293b' : '#020617',
                              border: `1px solid ${isEnabled ? '#3b82f6' : '#1e293b'}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '12px', fontWeight: isEnabled ? '600' : 'normal', color: isEnabled ? '#f8fafc' : '#64748b' }}>
                              {src}
                            </span>
                            {isEnabled ? <CheckSquare size={16} style={{ color: '#3b82f6' }} /> : <Square size={16} style={{ color: '#475569' }} />}
                          </div>
                        );
                      })}

                    {/* Uncategorized Toggle */}
                    <div
                      onClick={() => setShowOther(!showOther)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: showOther ? '#1e293b' : '#020617',
                        border: `1px solid ${showOther ? '#10b981' : '#1e293b'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        marginTop: '6px'
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: showOther ? '600' : 'normal', color: showOther ? '#10b981' : '#64748b' }}>
                        Uncategorized / System Logs
                      </span>
                      {showOther ? <CheckSquare size={16} style={{ color: '#10b981' }} /> : <Square size={16} style={{ color: '#475569' }} />}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div style={{
                    padding: '12px 18px',
                    borderTop: '1px solid #1e293b',
                    backgroundColor: '#0f172a',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      💾 Settings are automatically saved to Database
                    </span>
                    <button
                      onClick={() => setShowFilterDropdown(false)}
                      style={{
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        padding: '6px 16px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >Apply & Close</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pause / Resume */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: isPaused ? '#15803d' : '#1e293b',
              border: '1px solid #334155',
              color: '#ffffff',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />} {isPaused ? 'Resume' : 'Pause'}
          </button>

          {/* Download Logs */}
          <button
            onClick={handleDownloadLogs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#ffffff',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            <Download size={12} /> Export
          </button>

          {/* Clear */}
          <button
            onClick={handleClearLogs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#7f1d1d',
              border: '1px solid #991b1b',
              color: '#ffffff',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      {/* Logs Console Box */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          padding: '12px',
          overflowY: 'auto',
          backgroundColor: '#090d16',
          fontSize: '11px',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >

        {filteredLogs.length === 0 ? (
          <div style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
            No log messages matching selected sources.
          </div>
        ) : (
          filteredLogs.map((log, idx) => {
            let color = '#d1d5db';
            if (log.includes('ERROR') || log.includes('Exception') || log.includes('Failed') || log.includes('500 ')) {
              color = '#f87171';
            } else if (log.includes('WARNING') || log.includes('⚠️')) {
              color = '#fbbf24';
            } else if (log.includes('SUCCESS') || log.includes('✅') || log.includes('200 ')) {
              color = '#34d399';
            } else if (log.includes('Flask API') || log.includes('POST /') || log.includes('GET /')) {
              color = '#60a5fa';
            }

            return (
              <div key={idx} style={{ color, marginBottom: '2px' }}>
                {log}
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
