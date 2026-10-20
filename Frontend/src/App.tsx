import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ToastContainer } from './components/Alert/ToastContainer';
import { DashboardPage } from './pages/DashboardPage';
import { GraphEditorPage } from './pages/GraphEditorPage';
import { LogsPage } from './pages/LogsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyOtpPage } from './pages/VerifyOtpPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { useAuth } from './context/AuthContext';
import { useRouter } from './context/RouterContext';
import { useLanguage } from './context/LanguageContext';
import { GraphData, RobotState, CallRequest, LogItem } from './types';
import { DEFAULT_GRAPH } from './services/robotService';
import {
  syncRobotStateToCloud,
  logEventToCloud,
  fetchRobotTelemetryFromCloud,
  fetchGraphFromCloud,
  fetchLogsFromCloud,
  subscribeToRobotTelemetry,
  subscribeToLogs,
  isSupabaseConfigured,
} from './services/supabase';
import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';
import './App.css';

export const App: React.FC = () => {
  const { role, isAuthenticated } = useAuth();
  const { currentPath, navigate } = useRouter();
  const { lang, t } = useLanguage();
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // ==========================================================================
  // DYNAMIC PAGE METADATA MANAGEMENT (Document Title & SEO Meta)
  // ==========================================================================
  useEffect(() => {
    let title = t('metaDashboardTitle');
    let desc = t('metaDashboardDesc');

    if (currentPath === '/editor') {
      title = t('metaEditorTitle');
      desc = t('metaEditorDesc');
    } else if (currentPath === '/logs') {
      title = t('metaLogsTitle');
      desc = t('metaLogsDesc');
    } else if (currentPath === '/login') {
      title = t('metaLoginTitle');
      desc = t('metaLoginDesc');
    } else if (currentPath === '/register') {
      title = t('metaRegisterTitle');
      desc = t('metaRegisterDesc');
    } else if (currentPath === '/verify-otp') {
      title = t('metaVerifyOtpTitle');
      desc = t('metaVerifyOtpDesc');
    } else if (currentPath === '/forgot-password') {
      title = t('metaForgotTitle');
      desc = t('metaForgotDesc');
    }

    // Set document title
    document.title = title;

    // Set or create meta description
    let metaDescEl = document.querySelector('meta[name="description"]');
    if (!metaDescEl) {
      metaDescEl = document.createElement('meta');
      metaDescEl.setAttribute('name', 'description');
      document.head.appendChild(metaDescEl);
    }
    metaDescEl.setAttribute('content', desc);

    // Set or create OpenGraph Title
    let ogTitleEl = document.querySelector('meta[property="og:title"]');
    if (!ogTitleEl) {
      ogTitleEl = document.createElement('meta');
      ogTitleEl.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitleEl);
    }
    ogTitleEl.setAttribute('content', title);

    // Set or create OpenGraph Description
    let ogDescEl = document.querySelector('meta[property="og:description"]');
    if (!ogDescEl) {
      ogDescEl = document.createElement('meta');
      ogDescEl.setAttribute('property', 'og:description');
      document.head.appendChild(ogDescEl);
    }
    ogDescEl.setAttribute('content', desc);
  }, [currentPath, lang, t]);

  // Graph state (loaded from Supabase / localStorage / DEFAULT_GRAPH)
  const [graph, setGraph] = useState<GraphData>(() => {
    try {
      const saved = localStorage.getItem('adam_graph_data');
      return saved ? JSON.parse(saved) : DEFAULT_GRAPH;
    } catch {
      return DEFAULT_GRAPH;
    }
  });

  // Robot telemetry state
  const [robotState, setRobotState] = useState<RobotState>({
    currentNode: 'A',
    targetNode: null,
    status: 'IDLE',
    battery: 92,
    trashLevel: 35,
    trashDistanceCm: 16.2,
    obstacleDetected: false,
    lidOpen: false,
    lastUpdated: new Date().toLocaleTimeString(),
  });

  // Call queue (FIFO)
  const [queue, setQueue] = useState<CallRequest[]>([]);

  // Telemetry logs: Dynamic from localStorage (starts empty, NO static seed data)
  const [logs, setLogs] = useState<LogItem[]>(() => {
    try {
      const saved = localStorage.getItem('adam_telemetry_logs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Persist telemetry logs across page reloads
  useEffect(() => {
    try {
      localStorage.setItem('adam_telemetry_logs', JSON.stringify(logs));
    } catch {}
  }, [logs]);

  // ==========================================================================
  // REAL SUPABASE DATABASE INITIALIZATION & REALTIME SUBSCRIPTIONS
  // ==========================================================================
  useEffect(() => {
    let mounted = true;

    async function initSupabaseData() {
      // 1. Fetch current robot telemetry from Supabase
      const cloudTelemetry = await fetchRobotTelemetryFromCloud();
      if (cloudTelemetry && mounted) {
        setRobotState((prev) => ({ ...prev, ...cloudTelemetry }));
        setIsOnline(true);
      }

      // 2. Fetch graph configuration from Supabase
      const cloudGraph = await fetchGraphFromCloud();
      if (cloudGraph && cloudGraph.nodes?.length > 0 && mounted) {
        setGraph(cloudGraph);
      }

      // 3. Fetch logs from Supabase
      const cloudLogs = await fetchLogsFromCloud();
      if (cloudLogs && cloudLogs.length > 0 && mounted) {
        setLogs(cloudLogs);
      }
    }

    initSupabaseData();

    // Realtime subscription: Live robot status streaming
    const telemetrySub = subscribeToRobotTelemetry((incomingState) => {
      if (mounted) {
        setRobotState((prev) => ({ ...prev, ...incomingState }));
        setIsOnline(true);
      }
    });

    // Realtime subscription: Live system events streaming
    const logsSub = subscribeToLogs((incomingLog) => {
      if (mounted) {
        setLogs((prev) => [incomingLog, ...prev.filter((l) => l.id !== incomingLog.id)]);
      }
    });

    return () => {
      mounted = false;
      telemetrySub?.unsubscribe();
      logsSub?.unsubscribe();
    };
  }, []);

  // Save graph changes to localStorage & sync to Supabase
  useEffect(() => {
    localStorage.setItem('adam_graph_data', JSON.stringify(graph));
  }, [graph]);

  // Sync robot telemetry to Supabase
  useEffect(() => {
    syncRobotStateToCloud(robotState);
  }, [robotState]);

  // Process FIFO Queue when robot becomes IDLE
  useEffect(() => {
    if (robotState.status === 'IDLE' && queue.length > 0) {
      const nextRequest = queue[0];
      setQueue((prev) => prev.slice(1));

      // Trigger automatic dispatch to next station in queue
      setRobotState((prev) => ({
        ...prev,
        status: 'MOVING',
        targetNode: nextRequest.nodeId,
      }));
    }
  }, [robotState.status, queue]);

  const addLog = (logData: Omit<LogItem, 'id' | 'timestamp'>) => {
    const newLog: LogItem = {
      ...logData,
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      timestamp: new Date().toLocaleTimeString(),
    };
    setLogs((prev) => [newLog, ...prev]);
    logEventToCloud(newLog);
  };

  // Route helper
  const isDashboard = currentPath === '/' || currentPath === '/dashboard';
  const isEditor = currentPath === '/editor';
  const isLogs = currentPath === '/logs';
  const isLogin = currentPath === '/login';
  const isRegister = currentPath === '/register';
  const isVerifyOtp = currentPath === '/verify-otp';
  const isForgotPassword = currentPath === '/forgot-password';

  return (
    <div className="app-layout">
      {/* Navbar with real URL routing & mobile dropdown */}
      <Navbar isOnline={isOnline} />

      {/* Main Content Area: Route Switching */}
      <main className="app-main-content">
        {isDashboard && (
          isAuthenticated ? (
            <DashboardPage
              graph={graph}
              robotState={robotState}
              setRobotState={setRobotState}
              queue={queue}
              setQueue={setQueue}
              addLog={addLog}
            />
          ) : (
            <div className="restricted-access-container">
              <div className="restricted-card glass-panel">
                <div className="restricted-icon-box">
                  <ShieldAlert size={36} />
                </div>
                <h2>Autentikasi Operator Diperlukan</h2>
                <p>
                  Untuk mencegah tabrakan perintah antar-pengguna saat simulasi berlangsung, silakan <strong>Masuk</strong> terlebih dahulu sebelum mengakses <strong>Dashboard Kontrol ADAM</strong>.
                </p>
                <div className="restricted-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate('/login')}
                    id="btn-auth-guard-login"
                  >
                    <LogIn size={18} />
                    <span>Masuk ke Akun Operator</span>
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => navigate('/register')}
                    id="btn-auth-guard-register"
                  >
                    <span>Daftar Akun Baru</span>
                  </button>
                </div>
              </div>
            </div>
          )
        )}

        {isEditor && (
          role === 'admin' ? (
            <GraphEditorPage graph={graph} setGraph={setGraph} />
          ) : (
            <div className="restricted-access-container">
              <div className="restricted-card glass-panel">
                <div className="restricted-icon-box">
                  <ShieldAlert size={36} />
                </div>
                <h2>Akses Terbatas: Role Admin Diperlukan</h2>
                <p>
                  Halaman <strong>Graph Editor</strong> (konfigurasi simpul stasiun, bobot jalur Dijkstra, dan matriks hex RAM ESP32) dikhususkan untuk akun <strong>Administrator ADAM</strong>.
                </p>
                <div className="restricted-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate('/login')}
                    id="btn-restricted-login"
                  >
                    <LogIn size={18} />
                    <span>Masuk sebagai Admin</span>
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => navigate('/dashboard')}
                    id="btn-restricted-back"
                  >
                    <ArrowLeft size={18} />
                    <span>Kembali ke Dashboard</span>
                  </button>
                </div>
              </div>
            </div>
          )
        )}

        {isLogs && (
          <LogsPage logs={logs} setLogs={setLogs} />
        )}

        {isLogin && <LoginPage />}

        {isRegister && <RegisterPage />}

        {isVerifyOtp && <VerifyOtpPage />}

        {isForgotPassword && <ForgotPasswordPage />}
      </main>

      {/* Luxury Toast & Modal Container */}
      <ToastContainer />

      {/* Footer with Group Attribution */}
      <footer className="app-footer glass-panel">
        <div className="footer-content">
          <div className="footer-left">
            <span className="footer-brand">SMART ADAM (Autonomous Dustbin And Management)</span>
            <span className="footer-sub">
              Proyek UAS Mata Kuliah Internet of Things (IoT) &bull; Kelas IoT 24E
            </span>
          </div>
          <div className="footer-right">
            <span className="footer-members-title">Kelompok 1:</span>
            <span className="footer-members">
              Adam R., M Ilham J., M Thoriq D. H., M Anwar I., A Hisyammuddin, A Shobrun J., Ramzi Pandu M., M Jazaul A.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
