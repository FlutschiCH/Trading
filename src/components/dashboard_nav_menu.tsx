import React, { useState, useEffect } from 'react';
import {
  Compass,
  ChevronRight,
  ChevronLeft,
  BarChart2,
  Sliders,
  LineChart,
  Zap,
  Link as LinkIcon,
  Bot,
  Activity,
  Cpu,
  Terminal as TerminalIcon,
  Database,
  Menu
} from 'lucide-react';

export interface DashboardNavMenuProps {
  showTerminal?: boolean;
  onNavigate?: (cardId: string) => void;
}

export const DashboardNavMenu: React.FC<DashboardNavMenuProps> = ({
  showTerminal = false,
  onNavigate
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    return localStorage.getItem('wyckoff_side_menu_expanded') === 'true';
  });

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('wyckoff_side_menu_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('wyckoff_side_menu_expanded', isExpanded.toString());
  }, [isExpanded]);

  useEffect(() => {
    localStorage.setItem('wyckoff_side_menu_collapsed', isCollapsed.toString());
  }, [isCollapsed]);

  const toggleExpand = () => {
    setIsExpanded(prev => !prev);
  };

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

  const jumpToCard = (id: string) => {
    if (onNavigate) {
      onNavigate(id);
      return;
    }
    const elem = document.getElementById(`card-panel-${id}`);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const menuItems = [
    { id: 'chart', label: 'Chart & Wave', icon: <BarChart2 size={15} color="#38bdf8" /> },
    { id: 'backtester', label: 'Backtester', icon: <Sliders size={15} color="#a855f7" /> },
    { id: 'trades', label: 'Live Trades', icon: <LineChart size={15} color="#10b981" /> },
    { id: 'live_overview', label: 'Live Strategies', icon: <Zap size={15} color="#f59e0b" /> },
    { id: 'symbol_mapping', label: 'Symbol Maps', icon: <LinkIcon size={15} color="#6366f1" /> },
    { id: 'analyzer', label: 'AI Analyzer', icon: <Bot size={15} color="#ec4899" /> },
    { id: 'scalper', label: 'Void Scalper', icon: <Activity size={15} color="#14b8a6" /> },
    { id: 'copytrader-bottom', label: 'Copytrader', icon: <Cpu size={15} color="#f97316" /> },
    ...(showTerminal ? [{ id: 'terminal', label: 'Terminal Logs', icon: <TerminalIcon size={15} color="#4ade80" /> }] : []),
    { id: 'collector', label: '1M Collector', icon: <Database size={15} color="#94a3b8" /> },
  ];

  if (isCollapsed) {
    return (
      <div
        style={{
          position: 'fixed',
          left: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 999,
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '8px',
          padding: '4px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 10px rgba(59, 130, 246, 0.2)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <button
          type="button"
          onClick={toggleCollapse}
          title="Expand Quick Navigation Menu"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#60a5fa',
            borderRadius: '6px',
            padding: '8px 6px',
            cursor: 'pointer',
            outline: 'none',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
          }}
        >
          <Menu size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: isExpanded ? '16px' : '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 999,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: isExpanded ? '14px' : '10px',
        padding: isExpanded ? '10px 8px' : '6px 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.7), 0 0 15px rgba(59, 130, 246, 0.2)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        maxWidth: isExpanded ? '210px' : '44px',
      }}
    >
      {/* Top Header with Expand/Labels & Collapse Dock buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          onClick={toggleExpand}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isExpanded ? 'space-between' : 'center',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#60a5fa',
            borderRadius: '8px',
            padding: isExpanded ? '6px 10px' : '6px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
            outline: 'none',
            transition: 'all 0.15s ease',
          }}
          title={isExpanded ? 'Hide Labels' : 'Show Labels'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Compass size={16} />
            {isExpanded && <span>Card Jump</span>}
          </div>
          {isExpanded ? (
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          ) : null}
        </button>

        {isExpanded && (
          <button
            type="button"
            onClick={toggleCollapse}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.15s ease',
            }}
            title="Collapse Sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Card Jump Navigation Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => jumpToCard(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'transparent',
              border: '1px solid transparent',
              borderRadius: '6px',
              padding: isExpanded ? '6px 8px' : '6px',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              color: 'var(--app-text, #f3f4f6)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500,
              textAlign: 'left',
              outline: 'none',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
            title={`Jump to ${item.label}`}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {item.icon}
            </span>
            {isExpanded && (
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bottom Hide / Collapse Handle when minimized icons mode */}
      {!isExpanded && (
        <button
          type="button"
          onClick={toggleCollapse}
          title="Collapse Menu"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--app-text-muted, #9ca3af)',
            borderRadius: '4px',
            padding: '4px 0',
            cursor: 'pointer',
            outline: 'none',
            fontSize: '10px',
            marginTop: '2px',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--app-text-muted, #9ca3af)';
          }}
        >
          <ChevronLeft size={13} />
        </button>
      )}
    </div>
  );
};

export default DashboardNavMenu;
