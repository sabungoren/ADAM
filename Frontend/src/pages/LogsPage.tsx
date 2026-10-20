import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAlert } from '../context/AlertContext';
import { LogItem } from '../types';
import {
  History,
  TrendingUp,
  ShieldAlert,
  Search,
  Download,
  Trash2,
  Calendar,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Filter,
  ChevronDown,
  X,
} from 'lucide-react';
import './LogsPage.css';

interface LogsPageProps {
  logs: LogItem[];
  setLogs: React.Dispatch<React.SetStateAction<LogItem[]>>;
}

export const LogsPage: React.FC<LogsPageProps> = ({ logs, setLogs }) => {
  const { t } = useLanguage();
  const { showToast, showModal } = useAlert();

  const [activeSubTab, setActiveSubTab] = useState<'dispatches' | 'volume' | 'safety'>('dispatches');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Filter options config
  const filterOptions = [
    {
      id: 'dispatches' as const,
      label: t('tabCallHistory') || 'Riwayat Pemanggilan ADAM',
      shortLabel: 'Dispatch History',
      icon: History,
      desc: 'Log panggilan dan pergerakan robot antar stasiun',
    },
    {
      id: 'volume' as const,
      label: t('tabVolumeTrend') || 'Tren Volume Sampah',
      shortLabel: 'Trash Fill Trend',
      icon: TrendingUp,
      desc: 'Telemetri sensor ultrasonik HC-SR04 & persentase isi',
    },
    {
      id: 'safety' as const,
      label: t('tabSafetyIncidents') || 'Safety Logs (FC-51)',
      shortLabel: 'Safety Logs (FC-51)',
      icon: ShieldAlert,
      desc: 'Insiden rintangan infra merah & intervensi E-Stop',
    },
  ];

  const currentTabObj = filterOptions.find((f) => f.id === activeSubTab) || filterOptions[0];

  // Filter logs based on active sub-tab and search query (matches all fields: details, nodeId, type, timestamp, severity)
  const q = searchQuery.trim().toLowerCase();
  const filteredLogs = logs.filter((log) => {
    // 1. Check if matches search query
    const matchesQuery =
      !q ||
      (log.details && log.details.toLowerCase().includes(q)) ||
      (log.nodeId && log.nodeId.toLowerCase().includes(q)) ||
      (log.nodeId && `node ${log.nodeId.toLowerCase()}`.includes(q)) ||
      (log.timestamp && log.timestamp.toLowerCase().includes(q)) ||
      (log.type && log.type.toLowerCase().includes(q)) ||
      (log.type && log.type.toLowerCase().replace('_', ' ').includes(q)) ||
      (log.severity && log.severity.toLowerCase().includes(q));

    if (!matchesQuery) return false;

    // 2. Category tab filter
    if (activeSubTab === 'dispatches' && !(log.type === 'DISPATCH' || log.type === 'RETURN')) {
      return false;
    }
    if (activeSubTab === 'volume' && log.type !== 'VOLUME_SCAN') {
      return false;
    }
    if (activeSubTab === 'safety' && log.type !== 'SAFETY_OBSTACLE') {
      return false;
    }

    return true;
  });

  // Calculate high-level summary metrics
  const totalCalls = logs.filter((l) => l.type === 'DISPATCH').length;
  const volumeScans = logs.filter((l) => l.type === 'VOLUME_SCAN');
  const latestVolume = volumeScans[volumeScans.length - 1]?.trashPercent || 0;
  const totalIncidents = logs.filter((l) => l.type === 'SAFETY_OBSTACLE').length;

  // Export to CSV
  const handleExportCsv = () => {
    if (logs.length === 0) {
      showToast('Tidak ada data riwayat untuk diekspor!', 'warning');
      return;
    }

    const headers = ['ID', 'Waktu', 'Tipe', 'Node', 'Detail', 'Kapasitas_%'];
    const rows = logs.map((l) => [
      l.id,
      `"${l.timestamp}"`,
      l.type,
      l.nodeId || '-',
      `"${l.details.replace(/"/g, '""')}"`,
      l.trashPercent ?? '-',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smart_adam_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast('File CSV riwayat berhasil diunduh!', 'success');
  };

  // Clear logs with luxury modal confirmation
  const handleClearLogs = () => {
    showModal({
      title: t('confirmClearLogsTitle'),
      message: t('confirmClearLogsMsg'),
      type: 'error',
      confirmText: t('confirmClearLogsBtn'),
      cancelText: t('cancelBtn'),
      onConfirm: () => {
        setLogs([]);
        try {
          localStorage.removeItem('adam_telemetry_logs');
        } catch {}
        showToast('Seluruh riwayat berhasil dibersihkan.', 'info');
      },
    });
  };

  // Helper for trend chart coordinates
  const chartPoints = volumeScans.slice(-10); // last 10 scans

  return (
    <div className="logs-page-container">
      {/* Page Header */}
      <div className="page-intro glass-panel">
        <div>
          <h1 className="page-heading">{t('logsTitle')}</h1>
          <p className="page-subheading">{t('logsDesc')}</p>
        </div>
        <div className="top-action-buttons">
          <button className="btn-secondary" onClick={handleExportCsv} id="btn-export-csv">
            <Download size={16} />
            <span>{t('exportCsvBtn')}</span>
          </button>

          <button className="btn-secondary btn-danger-subtle" onClick={handleClearLogs} id="btn-clear-logs">
            <Trash2 size={16} />
            <span>{t('clearLogsBtn')}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="summary-cards-grid">
        <div className="summary-card glass-panel">
          <div className="summary-icon-box call">
            <History size={22} />
          </div>
          <div className="summary-info">
            <span className="summary-label">Total Pemanggilan</span>
            <span className="summary-value mono">{totalCalls} Kali</span>
          </div>
        </div>

        <div className="summary-card glass-panel">
          <div className="summary-icon-box volume">
            <TrendingUp size={22} />
          </div>
          <div className="summary-info">
            <span className="summary-label">Tingkat Isi Terakhir</span>
            <span className="summary-value mono" style={{ color: latestVolume > 80 ? 'var(--accent-rose)' : 'var(--accent-amber)' }}>
              {latestVolume}% Terisi
            </span>
          </div>
        </div>

        <div className="summary-card glass-panel">
          <div className="summary-icon-box safety">
            <ShieldAlert size={22} />
          </div>
          <div className="summary-info">
            <span className="summary-label">Insiden Halangan FC-51</span>
            <span className="summary-value mono">{totalIncidents} Rem Darurat</span>
          </div>
        </div>
      </div>

      {/* Main Logs Container */}
      <div className="glass-panel logs-panel">
        {/* Navigation Toolbar */}
        <div className="logs-toolbar">
          {/* Desktop Tab Buttons (Hidden on mobile) */}
          <div className="logs-tab-group desktop-only-tabs">
            {filterOptions.map((opt) => {
              const IconComp = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`logs-tab-btn ${activeSubTab === opt.id ? 'active' : ''}`}
                  onClick={() => setActiveSubTab(opt.id)}
                >
                  <IconComp size={16} />
                  <span>{opt.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile Filter Button: Posisi Center (Only on mobile) */}
          <div className="mobile-filter-center-container">
            <button
              type="button"
              className="btn-mobile-filter-popup"
              onClick={() => setIsFilterModalOpen(true)}
              id="btn-open-log-filter"
              title="Klik untuk memilih filter log"
            >
              <Filter size={15} className="filter-icon-gold" />
              <span className="filter-text">Filter: <strong>{currentTabObj.shortLabel}</strong></span>
              <ChevronDown size={14} className="filter-arrow" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Cari stasiun, tipe event, status, waktu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="input-search-logs"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                title={t('clearSearchBtn')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Volume Trend SVG Chart View (Shown when Volume tab is active) */}
        {activeSubTab === 'volume' && (
          <div className="chart-wrapper glass-card">
            <div className="chart-header">
              <span className="chart-title">Grafik Akumulasi Volume Sampah (HC-SR04 Internal)</span>
              <span className="chart-hint">Menampilkan 10 sesi pemindaian terakhir</span>
            </div>
            {chartPoints.length > 1 ? (
              <div className="svg-chart-container">
                <svg viewBox="0 0 500 160" className="trend-svg">
                  {/* Grid Lines */}
                  <line x1="40" y1="20" x2="480" y2="20" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                  <text x="30" y="24" textAnchor="end" className="chart-axis-label">100%</text>
                  <line x1="40" y1="75" x2="480" y2="75" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                  <text x="30" y="79" textAnchor="end" className="chart-axis-label">50%</text>
                  <line x1="40" y1="130" x2="480" y2="130" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                  <text x="30" y="134" textAnchor="end" className="chart-axis-label">0%</text>

                  {/* Polyline */}
                  <polyline
                    fill="none"
                    stroke="var(--accent-amber)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartPoints
                      .map((pt, idx) => {
                        const x = 50 + (idx * (420 / Math.max(1, chartPoints.length - 1)));
                        const y = 130 - (pt.trashPercent || 0) * 1.1;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />

                  {/* Data Points */}
                  {chartPoints.map((pt, idx) => {
                    const x = 50 + (idx * (420 / Math.max(1, chartPoints.length - 1)));
                    const y = 130 - (pt.trashPercent || 0) * 1.1;
                    return (
                      <g key={idx}>
                        <circle cx={x} cy={y} r="4.5" fill="var(--bg-primary)" stroke="var(--accent-amber)" strokeWidth="2.5" />
                        <text x={x} y={y - 8} textAnchor="middle" className="chart-point-value">
                          {pt.trashPercent}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <p className="no-chart-data">Belum cukup data pemindaian volume. Tekan tombol "Deteksi Volume" di dashboard untuk merekam titik data baru.</p>
            )}
          </div>
        )}

        {/* 1. Desktop Table View (Hidden on mobile) */}
        <div className="table-responsive desktop-only-table">
          <table className="logs-table">
            <thead>
              <tr>
                <th>{t('colTime')}</th>
                <th>Tipe Event</th>
                <th>{t('colTarget')}</th>
                <th>{t('colIncident')}</th>
                <th>{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-table-cell">
                    {t('noLogsData')}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  return (
                    <tr key={log.id} className={`log-row ${log.severity || 'info'}`}>
                      <td className="time-cell mono">
                        <Clock size={13} className="cell-sub-icon" />
                        <span>{log.timestamp}</span>
                      </td>
                      <td>
                        <span className={`log-type-tag ${log.type}`}>
                          {log.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="node-cell mono">
                        {log.nodeId ? (
                          <span className="node-chip">Node {log.nodeId}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="details-cell">{log.details}</td>
                      <td>
                        <span className={`badge log-badge ${log.severity || 'info'}`}>
                          {log.severity === 'error'
                            ? 'ALERT'
                            : log.severity === 'warning'
                            ? 'WARNING'
                            : 'SUCCESS'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 2. Mobile Responsive Card List: 1 Baris Tidak Lebih Dari 1 Komponen (Only on mobile) */}
        <div className="mobile-logs-list-wrapper">
          {filteredLogs.length === 0 ? (
            <div className="empty-mobile-logs-card glass-card">
              <p className="empty-logs-text">{t('noLogsData')}</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className={`mobile-log-card severity-${log.severity || 'info'}`}>
                {/* Baris 1: Waktu & Status Badge */}
                <div className="mobile-card-row time-status-row">
                  <div className="mobile-time-badge mono">
                    <Clock size={13} className="cell-sub-icon" />
                    <span>{log.timestamp}</span>
                  </div>
                  <span className={`badge log-badge ${log.severity || 'info'}`}>
                    {log.severity === 'error'
                      ? 'ALERT'
                      : log.severity === 'warning'
                      ? 'WARNING'
                      : 'SUCCESS'}
                  </span>
                </div>

                {/* Baris 2: Tipe Event */}
                <div className="mobile-card-row">
                  <span className="mobile-row-label">TIPE EVENT:</span>
                  <span className={`log-type-tag ${log.type}`}>
                    {log.type.replace('_', ' ')}
                  </span>
                </div>

                {/* Baris 3: Target Stasiun */}
                <div className="mobile-card-row">
                  <span className="mobile-row-label">TARGET STASIUN:</span>
                  {log.nodeId ? (
                    <span className="node-chip">Node {log.nodeId}</span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </div>

                {/* Baris 4: Detail Kejadian (Full Width, No Truncation) */}
                <div className="mobile-card-row details-block">
                  <span className="mobile-row-label">DETAIL KEJADIAN:</span>
                  <p className="mobile-log-details-text">{log.details}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Centered Popup Filter Modal for Mobile */}
      {isFilterModalOpen && (
        <div className="log-filter-modal-overlay" onClick={() => setIsFilterModalOpen(false)}>
          <div className="log-filter-modal-dialog glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="log-filter-modal-header">
              <div className="log-filter-title-wrap">
                <Filter size={18} className="filter-title-icon" />
                <span className="log-filter-modal-title">{t('filterModalTitle')}</span>
              </div>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setIsFilterModalOpen(false)}
                title={t('cppModalClose')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="log-filter-options-stack">
              {filterOptions.map((opt) => {
                const IconComp = opt.icon;
                const isSelected = activeSubTab === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`log-filter-option-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setActiveSubTab(opt.id);
                      setIsFilterModalOpen(false);
                      showToast(`Kategori log diganti ke: ${opt.shortLabel}`, 'info');
                    }}
                  >
                    <div className="filter-option-icon-box">
                      <IconComp size={20} />
                    </div>
                    <div className="filter-option-text-col">
                      <strong className="filter-option-title">{opt.label}</strong>
                      <span className="filter-option-desc">{opt.desc}</span>
                    </div>
                    {isSelected && <CheckCircle2 size={18} className="filter-selected-check" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
