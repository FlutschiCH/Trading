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
    const eventSource = new EventSource(`${API_BASE_URL}/api/terminal/stream`);

    eventSource.onmessage = (event) => {
      if (isPausedRef.current) return;
      const text = event.data;
      if (!text) return;

      setLogs((prevLogs) => {
        const next = [...prevLogs, text];
        if (next.length > 2000) {
          return next.slice(next.length - 2000);
        }
        return next;
      });

      // Extract bracket source tags like [CandleCollectorHandler] or [API Log]
      const match = text.match(/\[([A-Za-z0-9_ -]+)\]/);
      if (match && match[1]) {
        const tag = match[1].trim();
        setDiscoveredSources((prev) => {
          if (!prev.includes(tag)) {
            setSelectedSources((prevSel) => ({ ...prevSel, [tag]: true }));
            return [...prev, tag];
          }
          return prev;
        });
      }
    };

    eventSource.onerror = (err) => {
      console.warn("Log SSE Connection Error:", err);
    };

    return () => {
      eventSource.close();
    };
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
      backgroundColor: '#0b0f19',
      color: '#f3f4f6',
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
        backgroundColor: '#111827',
        borderBottom: '1px solid #1f2937',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={16} className="text-emerald-400" />
          <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#f3f4f6' }}>System Realtime Logs</span>
          <span style={{ fontSize: '11px', color: '#9ca3af', backgroundColor: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>
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
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#ffffff',
                borderRadius: '4px',
                padding: '4px 8px 4px 26px',
                fontSize: '11px',
                outline: 'none',
                width: '130px'
              }}
            />
          </div>

          {/* Sources Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: showFilterDropdown ? '#3b82f6' : '#1e293b',
                border: '1px solid #3b82f6',
                color: '#ffffff',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                transition: 'all 0.2s',
              }}
            >
              <Filter size={13} style={{ color: showFilterDropdown ? '#ffffff' : '#60a5fa' }} />
              <span>Log Sources & Settings</span>
            </button>


            {showFilterDropdown && (
              <>
                <div
                  onClick={() => setShowFilterDropdown(false)}
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1f2937',
                  borderRadius: '6px',
                  padding: '10px',
                  zIndex: 999,
                  minWidth: '220px',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <button onClick={selectAll} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '10px', cursor: 'pointer' }}>Select All</button>
                    <button onClick={deselectAll} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '10px', cursor: 'pointer' }}>Deselect All</button>
                  </div>

                  {discoveredSources.map((src) => (
                    <label key={src} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer', color: '#f3f4f6' }}>
                      <input
                        type="checkbox"
                        checked={selectedSources[src] !== false}
                        onChange={() => toggleSource(src)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{src}</span>
                    </label>
                  ))}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer', color: '#9ca3af', borderTop: '1px solid #1f2937', paddingTop: '6px' }}>
                    <input
                      type="checkbox"
                      checked={showOther}
                      onChange={(e) => setShowOther(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Uncategorized Logs</span>
                  </label>
                </div>
              </>
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
