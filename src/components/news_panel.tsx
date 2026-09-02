import React, { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl } from './ip_switcher';
import { isFetchAllowed } from '../services/fetchControlStore';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pub_date: string;
  timestamp: number;
  currency: string;
  impact: 'High' | 'Medium' | 'Low' | string;
  source: string;
  created_at?: string;
}

interface NewsPanelProps {
  isCompact?: boolean;
}

export const NewsPanel: React.FC<NewsPanelProps> = ({ isCompact = false }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [selectedImpact, setSelectedImpact] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchNews = useCallback(async (force: boolean = false) => {
    if (!isFetchAllowed('news') && !force) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCurrency !== 'ALL') params.append('currency', selectedCurrency);
      if (selectedImpact !== 'ALL') params.append('impact', selectedImpact);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      params.append('limit', isCompact ? '20' : '100');

      const res = await fetch(`${getApiBaseUrl()}/api/news?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setNews(data.data);
      } else {
        setNews([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch news:', err);
      setError(err.message || 'Failed to load news');
    } finally {
      setLoading(false);
    }
  }, [selectedCurrency, selectedImpact, searchTerm, isCompact]);

  useEffect(() => {
    const handleManual = (e: Event) => {
      if ((e as CustomEvent).detail?.category === 'news') {
        fetchNews(true);
      }
    };
    window.addEventListener('manual_fetch_trigger', handleManual);
    return () => window.removeEventListener('manual_fetch_trigger', handleManual);
  }, [fetchNews]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${getApiBaseUrl()}/api/news/refresh`, { method: 'POST' });
      await fetchNews();
    } catch (err) {
      console.error('Failed to trigger news refresh:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 60000); // 1 minute auto refresh in UI
    return () => clearInterval(interval);
  }, [fetchNews]);

  const getImpactBadgeStyle = (impact: string) => {
    const imp = impact ? impact.toLowerCase() : '';
    if (imp === 'high') {
      return { backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' };
    }
    if (imp === 'medium') {
      return { backgroundColor: '#7c2d12', color: '#fdba74', border: '1px solid #9a3412' };
    }
    return { backgroundColor: '#14532d', color: '#86efac', border: '1px solid #166534' };
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#090d16',
      color: '#e2e8f0',
      borderRadius: '8px',
      border: '1px solid #1e293b',
      padding: isCompact ? '12px' : '16px',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* Header Controls */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        borderBottom: '1px solid #1e293b',
        paddingBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#38bdf8' }}>📰 Trading News & Events</span>
          {loading && <span style={{ fontSize: '12px', color: '#94a3b8' }}>Loading...</span>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {!isCompact && (
            <input
              type="text"
              placeholder="Search news..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                outline: 'none',
                width: '160px'
              }}
            />
          )}

          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              color: '#f8fafc',
              borderRadius: '6px',
              padding: '6px 8px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">Currency: ALL</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
            <option value="CHF">CHF</option>
            <option value="NZD">NZD</option>
          </select>

          <select
            value={selectedImpact}
            onChange={(e) => setSelectedImpact(e.target.value)}
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              color: '#f8fafc',
              borderRadius: '6px',
              padding: '6px 8px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">Impact: ALL</option>
            <option value="High">High Impact</option>
            <option value="Medium">Medium Impact</option>
            <option value="Low">Low Impact</option>
          </select>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.7 : 1,
              transition: 'background-color 0.2s'
            }}
          >
            {refreshing ? 'Syncing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Content List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        paddingRight: '4px'
      }}>
        {error && (
          <div style={{
            backgroundColor: '#450a0a',
            color: '#fca5a5',
            border: '1px solid #991b1b',
            borderRadius: '6px',
            padding: '12px',
            fontSize: '13px'
          }}>
            {error}
          </div>
        )}

        {!loading && news.length === 0 && !error && (
          <div style={{
            textAlign: 'center',
            color: '#64748b',
            padding: '32px 16px',
            fontSize: '14px'
          }}>
            No news articles found for the selected filters.
          </div>
        )}

        {news.map((item) => (
          <div
            key={item.id}
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              transition: 'border-color 0.2s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  letterSpacing: '0.5px',
                  ...getImpactBadgeStyle(item.impact)
                }}>
                  {item.impact ? item.impact.toUpperCase() : 'MEDIUM'}
                </span>

                <span style={{
                  backgroundColor: '#1e293b',
                  color: '#e2e8f0',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  {item.currency || 'ALL'}
                </span>

                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {item.source}
                </span>
              </div>

              <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {item.pub_date || (item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString() : '')}
              </span>
            </div>

            <a
              href={item.link || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#f1f5f9',
                textDecoration: 'none',
                lineHeight: '1.4'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#f1f5f9')}
            >
              {item.title}
            </a>

            {item.description && (
              <p style={{
                fontSize: '12px',
                color: '#94a3b8',
                margin: 0,
                lineHeight: '1.5',
                display: '-webkit-box',
                WebkitLineClamp: isCompact ? 2 : 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {item.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewsPanel;
