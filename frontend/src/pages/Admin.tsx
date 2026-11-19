import React, { useState, useEffect } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { VersionMeta, LogItem } from '../types';
import { 
  Shield, 
  Lock, 
  RotateCcw, 
  Wrench, 
  Trash2, 
  History, 
  ScrollText, 
  Cpu, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  LogOut,
  Sliders,
  Wifi,
  WifiOff,
  Battery,
  Activity,
  Check,
  Zap,
  ChevronDown,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AdminProps {
  onGoToEditor?: () => void;
}

export const Admin: React.FC<AdminProps> = () => {
  const { telemetry, graph } = useTelemetry();
  const { isAdmin, adminEmail: authEmail, login, logout } = useAuth();

  const [adminEmail, setAdminEmail] = useState('smartadam@smartadam.my.id');
  const [adminPassword, setAdminPassword] = useState('smartadam');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Admin Data states
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [activeTab, setActiveTab] = useState<'controls' | 'versions' | 'logs' | 'simulator'>('controls');
  const [showTabModal, setShowTabModal] = useState(false);

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Info Modal Popup Center State
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalContent, setInfoModalContent] = useState<{ title: string; desc: string } | null>(null);

  // Custom Themed Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  } | null>(null);

  const openInfoModal = (title: string, desc: string) => {
    setInfoModalContent({ title, desc });
    setShowInfoModal(true);
  };

  useEffect(() => {
    if (isAdmin) {
      if (authEmail) setAdminEmail(authEmail);
      loadVersions();
      loadLogs();
    }
  }, [isAdmin, authEmail]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const res = await login(adminEmail, adminPassword);
    if (res.success) {
      loadVersions();
      loadLogs();
    } else {
      setLoginError(res.error || 'Email atau password salah');
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const loadVersions = async () => {
    try {
      const res = await fetch('/api/admin/graph/versions');
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch {}
  };

  const loadLogs = async () => {
    try {
      const res = await fetch('/api/admin/logs?limit=50');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {}
  };

  // Toggle Maintenance
  const handleToggleMaintenance = async () => {
    try {
      const nextState = !telemetry.maintenance;
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Mode pemeliharaan berhasil ${nextState ? 'diaktifkan' : 'dinonaktifkan'}`,
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  // Admin Reset Robot
  const handleAdminReset = () => {
    setConfirmModal({
      title: 'Kirim Admin Reset ke Armada?',
      message: 'Perintah ini akan memaksa armada kembali ke posisi Home A (Utara), mengosongkan pembacaan kapasitas sampah, menyinkronkan versi graf, dan memulihkan status robot dari status ERROR ke IDLE.',
      confirmText: 'Ya, Kirim Reset',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModal(null);
        setIsResetting(true);
        setActionMessage(null);
        try {
          const res = await fetch('/api/admin/reset', { method: 'POST' });
          const data = await res.json();
          if (res.ok) {
            setActionMessage({
              type: 'success',
              text: data.message || 'Armada berhasil direset ke Home A (IDLE) dan kapasitas sampah di-nolkan.',
            });
          } else {
            setActionMessage({
              type: 'error',
              text: data.message || data.error || 'Gagal mengirim reset',
            });
          }
        } catch (err: any) {
          setActionMessage({ type: 'error', text: err.message });
        } finally {
          setTimeout(() => setIsResetting(false), 1500);
        }
      },
    });
  };

  // Clear Queued Requests
  const handleClearQueue = () => {
    setConfirmModal({
      title: 'Kosongkan Semua Antrean?',
      message: 'Apakah Anda yakin ingin membatalkan semua permintaan di antrean? Permintaan yang sedang aktif dilayani tidak akan dibatalkan.',
      confirmText: 'Ya, Kosongkan Antrean',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch('/api/admin/queue/clear', { method: 'POST' });
          const data = await res.json();
          if (res.ok) {
            setActionMessage({
              type: 'success',
              text: `Antrean berhasil dikosongkan (${data.cancelled} request dibatalkan)`,
            });
          }
        } catch (err: any) {
          setActionMessage({ type: 'error', text: err.message });
        }
      },
    });
  };

  // Rollback Graph
  const handleRollback = (version: number) => {
    setConfirmModal({
      title: `Rollback Graf ke Versi v${version}?`,
      message: `Konfigurasi graf lintasan akan dipulihkan ke versi v${version}. Versi graf baru akan dibuat dan robot armada wajib di-reset/reboot.`,
      confirmText: `Ya, Rollback ke v${version}`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch('/api/admin/graph/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version }),
          });
          const data = await res.json();
          if (res.ok) {
            setActionMessage({
              type: 'success',
              text: `Rollback berhasil! Dibuat versi baru v${data.version}. Silakan reboot/reset robot.`,
            });
            loadVersions();
          } else {
            setActionMessage({
              type: 'error',
              text: data.error || data.message || 'Gagal rollback graf',
            });
          }
        } catch (err: any) {
          setActionMessage({ type: 'error', text: err.message });
        }
      },
    });
  };

  // Simulator Triggers: sinkron langsung dengan telemetry.auto_simulate
  const autoSimulate = Boolean(telemetry.auto_simulate);

  const handleSimulateUpdate = async (params: any) => {
    try {
      const res = await fetch('/api/admin/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (res.ok) {
        if (params.auto_simulate !== undefined) {
          const nextVal = Boolean(data.auto_simulate);
          setActionMessage({
            type: 'success',
            text: nextVal
              ? 'Mode Auto-Simulate DIAKTIFKAN: Panggilan dari Beranda akan disimulasikan otomatis bertahap.'
              : 'Mode Auto-Simulate DINONAKTIFKAN: Panggilan antrean akan menunggu armada fisik terhubung.',
          });
        } else {
          setActionMessage({ type: 'success', text: 'Simulasi telemetri armada berhasil disinkronkan ke server.' });
        }
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-white">Login Admin Project A.D.A.M</h1>
          <p className="text-xs text-gray-400">Autentikasi sesi khusus administrator sistem.</p>
        </div>

        <form onSubmit={handleLogin} className="bg-dark-900 border border-dark-700 p-6 rounded-2xl shadow-2xl space-y-4">
          {loginError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{loginError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1">Email Administrator:</label>
            <input
              type="email"
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
              required
              className="w-full bg-dark-950 border border-dark-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1">Password:</label>
            <input
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              required
              className="w-full bg-dark-950 border border-dark-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-cyan-600 text-dark-950 hover:brightness-110 shadow-lg shadow-cyan-500/20 transition"
          >
            Masuk ke Dashboard Admin
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      {/* Admin Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-dark-900 border border-dark-700 p-4 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-white">Administrator Dashboard</h1>
          <p className="text-xs text-gray-400">Login sebagai: <strong className="text-cyan-400">{adminEmail}</strong></p>
        </div>

        <div className="w-full md:w-auto">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-dark-800 text-rose-400 hover:bg-rose-500/10 border border-dark-700 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
              : 'bg-rose-950/70 text-rose-300 border-rose-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-gray-400 hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Tab Selector: Mobile Button Filter Modal vs Desktop Tabs */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setShowTabModal(true)}
          className="w-full flex items-center justify-between p-3.5 rounded-xl bg-dark-900 border border-dark-700 text-white shadow-lg active:scale-[0.99] transition"
        >
          <div className="flex items-center space-x-2.5">
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-400">Pilih Menu:</span>
            <span className="text-xs font-extrabold text-cyan-300">
              {activeTab === 'controls' && 'Kendali Sistem'}
              {activeTab === 'versions' && `Riwayat Versi Graf (${versions.length})`}
              {activeTab === 'logs' && 'Audit Log Sistem'}
              {activeTab === 'simulator' && 'Simulator Robot'}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Centered Modal Popup for Mobile Tabs */}
      {showTabModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-dark-800 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                <span>Pilih Menu Tab Administrator</span>
              </h3>
              <button
                onClick={() => setShowTabModal(false)}
                className="w-7 h-7 rounded-lg bg-dark-800 flex items-center justify-center text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setActiveTab('controls');
                  setShowTabModal(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition border ${
                  activeTab === 'controls'
                    ? 'bg-cyan-500 text-dark-950 border-cyan-400 font-extrabold shadow-md'
                    : 'bg-dark-950 text-gray-300 border-dark-800 hover:bg-dark-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Wrench className="w-4 h-4" />
                  <span>Kendali Sistem</span>
                </div>
                {activeTab === 'controls' && <Check className="w-4 h-4" />}
              </button>

              <button
                onClick={() => {
                  setActiveTab('versions');
                  loadVersions();
                  setShowTabModal(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition border ${
                  activeTab === 'versions'
                    ? 'bg-cyan-500 text-dark-950 border-cyan-400 font-extrabold shadow-md'
                    : 'bg-dark-950 text-gray-300 border-dark-800 hover:bg-dark-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <History className="w-4 h-4" />
                  <span>Riwayat Versi Graf ({versions.length})</span>
                </div>
                {activeTab === 'versions' && <Check className="w-4 h-4" />}
              </button>

              <button
                onClick={() => {
                  setActiveTab('logs');
                  loadLogs();
                  setShowTabModal(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition border ${
                  activeTab === 'logs'
                    ? 'bg-cyan-500 text-dark-950 border-cyan-400 font-extrabold shadow-md'
                    : 'bg-dark-950 text-gray-300 border-dark-800 hover:bg-dark-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <ScrollText className="w-4 h-4" />
                  <span>Audit Log Sistem</span>
                </div>
                {activeTab === 'logs' && <Check className="w-4 h-4" />}
              </button>

              <button
                onClick={() => {
                  setActiveTab('simulator');
                  setShowTabModal(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition border ${
                  activeTab === 'simulator'
                    ? 'bg-cyan-500 text-dark-950 border-cyan-400 font-extrabold shadow-md'
                    : 'bg-dark-950 text-gray-300 border-dark-800 hover:bg-dark-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Sliders className="w-4 h-4" />
                  <span>Simulator Robot</span>
                </div>
                {activeTab === 'simulator' && <Check className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Horizontal Tabs */}
      <div className="hidden md:flex space-x-2 border-b border-dark-800 pb-2">
        <button
          onClick={() => setActiveTab('controls')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'controls'
              ? 'bg-cyan-500 text-dark-950 shadow'
              : 'text-gray-400 hover:text-white hover:bg-dark-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Kendali Sistem</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('versions');
            loadVersions();
          }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'versions'
              ? 'bg-cyan-500 text-dark-950 shadow'
              : 'text-gray-400 hover:text-white hover:bg-dark-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Riwayat Versi Graf ({versions.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('logs');
            loadLogs();
          }}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'logs'
              ? 'bg-cyan-500 text-dark-950 shadow'
              : 'text-gray-400 hover:text-white hover:bg-dark-800'
          }`}
        >
          <ScrollText className="w-4 h-4" />
          <span>Audit Log Sistem</span>
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'simulator'
              ? 'bg-cyan-500 text-dark-950 shadow'
              : 'text-gray-400 hover:text-white hover:bg-dark-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Simulator Robot</span>
        </button>
      </div>

      {/* TAB 1: CONTROLS */}
      {activeTab === 'controls' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card Maintenance */}
          <div className="bg-dark-900 border border-dark-700 p-5 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <Wrench className="w-5 h-5" />
                <h3>Mode Pemeliharaan</h3>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${telemetry.maintenance ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'}`}>
                {telemetry.maintenance ? 'AKTIF' : 'NONAKTIF'}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Menghentikan panggilan baru dan dispatch antrean. Wajib diaktifkan sebelum menyimpan graf baru.
            </p>
            <div className="pt-2">
              <button
                onClick={handleToggleMaintenance}
                className={`w-full py-2.5 rounded-xl font-bold text-xs transition border ${
                  telemetry.maintenance
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                    : 'bg-dark-800 text-gray-300 border-dark-700 hover:bg-dark-700'
                }`}
              >
                {telemetry.maintenance ? 'Nonaktifkan Maintenance' : 'Aktifkan Mode Maintenance'}
              </button>
            </div>
          </div>

          {/* Card Admin Reset */}
          <div className="bg-dark-900 border border-dark-700 p-5 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm">
                <RotateCcw className="w-5 h-5" />
                <h3>Admin Reset Robot</h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                Node {telemetry.pos.current} ({telemetry.status})
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Memaksa armada kembali ke Home A (Utara), mengosongkan sampah, menyinkronkan graf, dan memulihkan status ke IDLE.
            </p>
            <div className="pt-2">
              <button
                onClick={handleAdminReset}
                disabled={isResetting}
                className={`w-full py-2.5 rounded-xl font-bold text-xs transition ${
                  isResetting
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-cyan-500 text-dark-950 hover:bg-cyan-400 shadow-md shadow-cyan-500/20'
                }`}
              >
                {isResetting ? 'Mengeksekusi Reset...' : 'Kirim Admin Reset ke Robot'}
              </button>
            </div>
          </div>

          {/* Card Clear Queue */}
          <div className="bg-dark-900 border border-dark-700 p-5 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
                <Trash2 className="w-5 h-5" />
                <h3>Kosongkan Antrean</h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-dark-950 text-gray-300 border border-dark-800">
                {telemetry.queue.length} Menunggu
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Membatalkan seluruh request berstatus <strong className="text-white">queued</strong> sekaligus (request yang sedang aktif tidak dihentikan).
            </p>
            <div className="pt-2">
              <button
                onClick={handleClearQueue}
                disabled={telemetry.queue.length === 0}
                className={`w-full py-2.5 rounded-xl font-bold text-xs border transition ${
                  telemetry.queue.length === 0
                    ? 'bg-dark-950 text-gray-600 border-dark-800 cursor-not-allowed'
                    : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border-rose-500/40'
                }`}
              >
                Kosongkan Semua Antrean
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GRAPH VERSIONS & ROLLBACK */}
      {activeTab === 'versions' && (
        <div className="bg-dark-900 border border-dark-700 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <h3 className="font-bold text-white text-sm">Riwayat Snapshot & Versi Graf</h3>
            <span className="text-xs text-gray-400 font-mono">
              Gateway: v{telemetry.graph.gateway_version} | Robot: v{telemetry.graph.robot_version}
            </span>
          </div>

          {/* Mobile View: Vertical Stacked Cards (1 Baris 1 Komponen, Tanpa Scrollbar Horizontal) */}
          <div className="md:hidden space-y-3">
            {versions.map(v => {
              const isCurrent = v.version === telemetry.graph.gateway_version;
              return (
                <div
                  key={v.version}
                  className={`p-4 rounded-xl border space-y-2.5 ${
                    isCurrent ? 'bg-cyan-950/30 border-cyan-500/40' : 'bg-dark-950 border-dark-800'
                  }`}
                >
                  <div className="text-xs font-mono font-bold text-white flex items-center justify-between">
                    <span>Versi: <strong className="text-cyan-400">v{v.version}</strong></span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        Aktif
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-300">
                    Jumlah Node: <strong className="text-white font-mono">{v.node_count}</strong> Titik
                  </div>
                  <div className="text-xs text-gray-300">
                    Jumlah Hubungan Fisik: <strong className="text-white font-mono">{v.edge_count}</strong> Lintasan
                  </div>
                  <div className="text-xs text-gray-400">
                    Waktu Pembuatan: <span className="font-mono">{new Date(v.created_at).toLocaleString('id-ID')}</span>
                  </div>
                  {!isCurrent && (
                    <div className="pt-1">
                      <button
                        onClick={() => handleRollback(v.version)}
                        className="w-full py-2.5 rounded-lg text-xs font-bold bg-dark-800 text-cyan-400 hover:bg-cyan-500 hover:text-dark-950 border border-dark-700 transition"
                      >
                        Rollback ke Versi Ini
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop View: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-dark-950 text-gray-400 border-b border-dark-800">
                <tr>
                  <th className="py-2.5 px-3">Versi</th>
                  <th className="py-2.5 px-3">Jumlah Node</th>
                  <th className="py-2.5 px-3">Jumlah Edge</th>
                  <th className="py-2.5 px-3">Waktu Pembuatan</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {versions.map(v => {
                  const isCurrent = v.version === telemetry.graph.gateway_version;
                  return (
                    <tr key={v.version} className={isCurrent ? 'bg-cyan-950/20' : ''}>
                      <td className="py-3 px-3 font-bold font-mono">
                        v{v.version} {isCurrent && <span className="text-cyan-400 ml-1.5">(Aktif)</span>}
                      </td>
                      <td className="py-3 px-3">{v.node_count} Node</td>
                      <td className="py-3 px-3">{v.edge_count} Hubungan Fisik</td>
                      <td className="py-3 px-3 text-gray-400">{new Date(v.created_at).toLocaleString('id-ID')}</td>
                      <td className="py-3 px-3 text-right">
                        {!isCurrent && (
                          <button
                            onClick={() => handleRollback(v.version)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-dark-800 text-cyan-400 hover:bg-cyan-500 hover:text-dark-950 transition border border-dark-700"
                          >
                            Rollback
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'logs' && (
        <div className="bg-dark-900 border border-dark-700 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">Audit Log Kejadian Sistem</h3>
            <button
              onClick={loadLogs}
              className="flex items-center space-x-1 text-xs text-cyan-400 hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Muat Ulang Log</span>
            </button>
          </div>

          {/* Rata Vertikal: 1 Baris Tidak Boleh Lebih dari 1 Komponen */}
          <div className="max-h-[500px] overflow-y-auto divide-y divide-dark-800 text-xs font-mono">
            {logs.map(log => (
              <div key={log.id} className="py-3 px-1 space-y-1.5">
                {/* Baris 1: Waktu Kejadian */}
                <div className="text-[11px] text-gray-500 break-words">
                  Waktu: {new Date(log.ts).toLocaleString('id-ID')}
                </div>
                {/* Baris 2: Kategori / Event Badge */}
                <div>
                  <span
                    className={`inline-block font-bold px-2 py-0.5 rounded text-[10px] uppercase border ${
                      log.level === 'error'
                        ? 'bg-rose-950 text-rose-400 border-rose-800'
                        : log.level === 'warn'
                        ? 'bg-amber-950 text-amber-400 border-amber-800'
                        : 'bg-dark-950 text-cyan-400 border-cyan-800/50'
                    }`}
                  >
                    Event: {log.event}
                  </span>
                </div>
                {/* Baris 3: Pesan Kejadian */}
                <div className="text-gray-200 text-xs leading-relaxed break-words">
                  Pesan: {log.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: FLEET SIMULATOR PANEL */}
      {activeTab === 'simulator' && (
        <div className="space-y-5">
          {/* Header Title with Small Circular Info Button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-dark-900 border border-dark-800 p-4 rounded-2xl">
            <div className="flex items-center space-x-2.5">
              <h3 className="font-bold text-white text-base">
                Fleet Simulation Sandbox (Pengujian Tanpa Robot Fisik)
              </h3>
              <button
                type="button"
                onClick={() => openInfoModal(
                  'Fleet Simulation Sandbox',
                  'Alat ini memungkinkan penguji memverifikasi fungsionalitas web, antrean FIFO, pergerakan armada, dan perubahan daya baterai secara real-time tanpa membutuhkan perangkat robot fisik menyala. Seluruh perubahan disiarkan secara instan melalui SSE ke seluruh klien.'
                )}
                className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-xs font-black hover:bg-cyan-500/30 transition flex-shrink-0"
                title="Lihat Informasi Selengkapnya"
              >
                !
              </button>
            </div>
            <span className="text-[11px] font-sans font-semibold text-cyan-300 bg-cyan-950/60 px-2.5 py-1 rounded-lg border border-cyan-800/60 w-fit">
              Live Dynamic Sync via SSE
            </span>
          </div>

          {/* Live Telemetry Status Summary (Plus Jakarta Sans) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-dark-900 border border-dark-800 p-4 rounded-xl text-xs font-sans">
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Koneksi</span>
              <span className={`font-extrabold text-sm block ${telemetry.online ? 'text-emerald-400' : 'text-rose-400'}`}>
                {telemetry.online ? 'Online (Fresh)' : 'Offline'}
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Status</span>
              <span className="font-extrabold text-sm text-white block">{telemetry.status}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Posisi / Target</span>
              <span className="font-extrabold text-sm text-cyan-400 block">Node {telemetry.pos.current} {telemetry.pos.next ? `-> ${telemetry.pos.next}` : ''}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Daya Baterai</span>
              <span className={`font-extrabold text-sm block ${telemetry.battery <= 20 ? 'text-rose-400' : telemetry.battery <= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {telemetry.battery}%
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Wadah Sampah</span>
              <span className={`font-extrabold text-sm block ${telemetry.trash >= 95 ? 'text-rose-400' : 'text-gray-200'}`}>
                {telemetry.trash}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Mode Auto-Simulate Antrean */}
            <div className="bg-dark-900 border border-dark-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 block">
                  Mode Simulasi Antrean Otomatis
                </span>
                <button
                  type="button"
                  onClick={() => openInfoModal(
                    'Mode Simulasi Antrean Otomatis',
                    'Saat aktif, panggilan node dari Beranda akan dieksekusi otomatis secara bertahap (MOVING -> DWELL -> IDLE), mengonsumsi baterai 1%, dan menambah isi volume sampah 3%.'
                  )}
                  className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-xs font-black hover:bg-cyan-500/30 transition flex-shrink-0"
                  title="Lihat Penjelasan Fitur"
                >
                  !
                </button>
              </div>
              {/* Status NONAKTIF atau AKTIF di baris berikutnya */}
              <div>
                <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded border ${autoSimulate ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-dark-950 text-gray-500 border-dark-800'}`}>
                  Status: {autoSimulate ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </div>
              {/* 1 Baris 1 Button */}
              <div className="pt-1">
                <button
                  onClick={() => handleSimulateUpdate({ auto_simulate: !autoSimulate })}
                  className={`w-full py-2.5 rounded-lg text-xs font-bold transition border ${
                    autoSimulate
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                      : 'bg-dark-950 text-gray-300 border-dark-700 hover:bg-dark-800'
                  }`}
                >
                  {autoSimulate ? 'Nonaktifkan Auto-Simulate' : 'Aktifkan Mode Auto-Simulate'}
                </button>
              </div>
            </div>

            {/* 2. Koneksi & Liveness Robot */}
            <div className="bg-dark-900 border border-dark-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200">
                  Simulasi Status Koneksi (Liveness)
                </span>
                <button
                  type="button"
                  onClick={() => openInfoModal(
                    'Simulasi Status Koneksi (Liveness)',
                    'Gunakan saklar ini untuk menguji perilaku website saat armada offline atau kehilangan sinyal MQTT.'
                  )}
                  className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-xs font-black hover:bg-cyan-500/30 transition flex-shrink-0"
                  title="Lihat Penjelasan"
                >
                  !
                </button>
              </div>
              {/* 1 Baris 1 Button */}
              <div className="flex flex-col space-y-2 pt-1">
                <button
                  onClick={() => handleSimulateUpdate({ online: true })}
                  className="w-full py-2.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition"
                >
                  Set Online (Fresh)
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ online: false })}
                  className="w-full py-2.5 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition"
                >
                  Set Offline
                </button>
              </div>
            </div>

            {/* 3. Status Operasional */}
            <div className="bg-dark-900 border border-dark-800 p-4 rounded-xl space-y-3">
              <span className="block text-xs font-bold text-gray-200">
                Simulasikan Status Robot:
              </span>
              {/* 1 Baris 1 Button */}
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => handleSimulateUpdate({ status: 'IDLE' })}
                  className={`w-full py-2.5 rounded-lg text-xs font-bold border transition ${
                    telemetry.status === 'IDLE'
                      ? 'bg-emerald-500 text-dark-950 border-emerald-400 shadow-sm font-extrabold'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                  }`}
                >
                  Set IDLE (Siap)
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ status: 'MOVING' })}
                  className={`w-full py-2.5 rounded-lg text-xs font-bold border transition ${
                    telemetry.status === 'MOVING'
                      ? 'bg-cyan-500 text-dark-950 border-cyan-400 shadow-sm font-extrabold'
                      : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25'
                  }`}
                >
                  Set MOVING
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ status: 'DWELL' })}
                  className={`w-full py-2.5 rounded-lg text-xs font-bold border transition ${
                    telemetry.status === 'DWELL'
                      ? 'bg-amber-500 text-dark-950 border-amber-400 shadow-sm font-extrabold'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                  }`}
                >
                  Set DWELL (Terbuka)
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ status: 'ERROR' })}
                  className={`w-full py-2.5 rounded-lg text-xs font-bold border transition ${
                    telemetry.status === 'ERROR'
                      ? 'bg-rose-500 text-dark-950 border-rose-400 shadow-sm font-extrabold'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
                  }`}
                >
                  Set ERROR (Darurat)
                </button>
              </div>
            </div>

            {/* 4. Posisi Node Saat Ini */}
            <div className="bg-dark-900 border border-dark-800 p-4 rounded-xl space-y-3">
              <span className="block text-xs font-bold text-gray-200">
                Pindahkan Lokasi Node Armada:
              </span>
              <p className="text-[11px] text-gray-400">
                Klik node di bawah untuk merelokasikan armada ke titik lintasan secara instan:
              </p>
              {/* Hilangkan scrollbar, gunakan flex-wrap agar pindah ke baris berikutnya */}
              <div className="flex flex-wrap gap-2">
                {(graph?.nodes || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S']).map(n => (
                  <button
                    key={n}
                    onClick={() => handleSimulateUpdate({ current: n })}
                    className={`w-8 h-8 rounded-lg text-xs font-bold font-sans transition border ${
                      telemetry.pos.current === n
                        ? 'bg-cyan-500 text-dark-950 border-cyan-400 shadow-sm font-extrabold'
                        : 'bg-dark-950 text-gray-300 border-dark-700 hover:bg-dark-800 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Baterai Dinamis (Live Slider & Presets) */}
            <div className="bg-dark-900 border border-dark-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 flex items-center space-x-1.5">
                  <Battery className="w-4 h-4 text-emerald-400" />
                  <span>Daya Baterai Armada:</span>
                </span>
                <span className={`text-xs font-sans font-bold ${telemetry.battery <= 20 ? 'text-rose-400' : telemetry.battery <= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {telemetry.battery}%
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="0"
                max="100"
                value={telemetry.battery}
                onChange={e => handleSimulateUpdate({ battery: Number(e.target.value) })}
                className="w-full accent-cyan-400 bg-dark-800 h-2 rounded-lg cursor-pointer"
              />

              {/* 1 Baris 1 Button Presets */}
              <div className="flex flex-col space-y-2 pt-1">
                <button
                  onClick={() => handleSimulateUpdate({ battery: 100 })}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-dark-950 text-emerald-400 border border-dark-700 hover:bg-emerald-500/10 transition"
                >
                  Set Baterai 100% (Penuh)
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ battery: 75 })}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-dark-950 text-emerald-300 border border-dark-700 hover:bg-dark-800 transition"
                >
                  Set Baterai 75%
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ battery: 50 })}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-dark-950 text-amber-300 border border-dark-700 hover:bg-dark-800 transition"
                >
                  Set Baterai 50%
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ battery: 20 })}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-dark-950 text-rose-300 border border-dark-700 hover:bg-dark-800 transition"
                >
                  Set Baterai 20% (Peringatan)
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ battery: 10 })}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-dark-950 text-rose-400 border border-dark-700 hover:bg-rose-500/10 transition"
                >
                  Set Baterai 10% (Kritis)
                </button>
              </div>
            </div>

            {/* 6. Kapasitas Wadah Sampah (Live Slider & Presets) */}
            <div className="bg-dark-900 border border-dark-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 flex items-center space-x-1.5">
                  <Trash2 className="w-4 h-4 text-cyan-400" />
                  <span>Kapasitas Wadah Sampah:</span>
                </span>
                <span className={`text-xs font-sans font-bold ${telemetry.trash >= 95 ? 'text-rose-400' : 'text-cyan-400'}`}>
                  {telemetry.trash}% {telemetry.trash >= 95 ? '(Penuh & Blokir)' : ''}
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="0"
                max="100"
                value={telemetry.trash}
                onChange={e => handleSimulateUpdate({ trash: Number(e.target.value) })}
                className="w-full accent-cyan-400 bg-dark-800 h-2 rounded-lg cursor-pointer"
              />

              {/* 1 Baris 1 Button Presets */}
              <div className="flex flex-col space-y-2 pt-1">
                <button
                  onClick={() => handleSimulateUpdate({ trash: 0 })}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-dark-950 text-gray-300 border border-dark-700 hover:bg-dark-800 transition"
                >
                  Set Sampah 0% (Kosong)
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ trash: 50 })}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-dark-950 text-gray-300 border border-dark-700 hover:bg-dark-800 transition"
                >
                  Set Sampah 50% (Separuh)
                </button>
                <button
                  onClick={() => handleSimulateUpdate({ trash: 96 })}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-dark-950 text-rose-400 border border-dark-700 hover:bg-rose-500/10 transition"
                >
                  Set Sampah 96% (Penuh / Tolak Panggilan)
                </button>
              </div>
            </div>
          </div>

          {/* 7. Sinkronisasi Versi Graf */}
          <div className="bg-dark-900 border border-dark-800 p-4 rounded-xl space-y-3">
            <div>
              <span className="block text-xs font-bold text-white">Sinkronisasi Versi Graf Robot:</span>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Gateway aktif: <strong className="text-cyan-400">v{telemetry.graph.gateway_version}</strong> | Versi di robot: <strong className="text-white">v{telemetry.graph.robot_version}</strong>
              </p>
            </div>
            {/* 1 Baris 1 Button */}
            <button
              onClick={() => handleSimulateUpdate({ graph_version: telemetry.graph.gateway_version })}
              className="w-full py-2.5 rounded-lg text-xs font-bold bg-dark-950 text-cyan-400 hover:bg-cyan-500 hover:text-dark-950 border border-dark-700 transition"
            >
              Sinkronkan Versi Graf ke v{telemetry.graph.gateway_version}
            </button>
          </div>
        </div>
      )}

      {/* Centered Modal Popup for Information */}
      {showInfoModal && infoModalContent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-dark-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-xs font-black">
                  !
                </div>
                <h3 className="font-bold text-sm text-white">{infoModalContent.title}</h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-7 h-7 rounded-lg bg-dark-800 flex items-center justify-center text-gray-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-gray-300 leading-relaxed space-y-2">
              <p>{infoModalContent.desc}</p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-cyan-500 text-dark-950 hover:bg-cyan-400 transition"
              >
                Tutup Informasi
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Custom Themed Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                confirmModal.variant === 'danger'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : confirmModal.variant === 'warning'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              }`}>
                {confirmModal.variant === 'danger' ? (
                  <Trash2 className="w-5 h-5 text-rose-400" />
                ) : confirmModal.variant === 'warning' ? (
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-cyan-400" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-base text-white">{confirmModal.title}</h3>
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Konfirmasi Tindakan</span>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed pt-1">
              {confirmModal.message}
            </p>

            <div className="flex items-center space-x-3 pt-3 border-t border-dark-800">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="w-1/2 py-2.5 rounded-xl font-bold text-xs bg-dark-800 text-gray-300 hover:bg-dark-700 hover:text-white transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`w-1/2 py-2.5 rounded-xl font-bold text-xs transition shadow-lg ${
                  confirmModal.variant === 'danger'
                    ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20'
                    : confirmModal.variant === 'warning'
                    ? 'bg-amber-500 text-dark-950 hover:bg-amber-400 shadow-amber-500/20'
                    : 'bg-cyan-500 text-dark-950 hover:bg-cyan-400 shadow-cyan-500/20'
                }`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
