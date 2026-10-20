import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAlert } from '../context/AlertContext';
import {
  GraphData,
  RobotState,
  CallRequest,
  LogItem,
  RobotStatus,
} from '../types';
import { findShortestPath } from '../services/robotService';
import {
  BatteryCharging,
  Trash2,
  Navigation,
  ShieldCheck,
  ShieldAlert,
  Send,
  Home,
  Scan,
  AlertTriangle,
  Clock,
  Layers,
  CheckCircle,
  Wifi,
  OctagonAlert,
  RotateCcw,
  Lock,
  Unlock,
} from 'lucide-react';
import { FleetConnectionModal } from '../components/FleetConnectionModal';
import {
  FleetConfig,
  getFleetConfig,
  dispatchCommandToRobot,
  sendEmergencyStopToRobot,
  sendResetCommandToRobot,
} from '../services/fleetService';
import './DashboardPage.css';

interface DashboardPageProps {
  graph: GraphData;
  robotState: RobotState;
  setRobotState: React.Dispatch<React.SetStateAction<RobotState>>;
  queue: CallRequest[];
  setQueue: React.Dispatch<React.SetStateAction<CallRequest[]>>;
  addLog: (log: Omit<LogItem, 'id' | 'timestamp'>) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  graph,
  robotState,
  setRobotState,
  queue,
  setQueue,
  addLog,
}) => {
  const { t } = useLanguage();
  const { showToast } = useAlert();

  // State for user-selected station
  const availableStations = graph.nodes.filter((n) => !n.isHome);
  const [selectedStationId, setSelectedStationId] = useState<string>(
    availableStations[0]?.id || 'B'
  );
  const [isScanningVolume, setIsScanningVolume] = useState<boolean>(false);
  const [isFleetModalOpen, setIsFleetModalOpen] = useState<boolean>(false);
  const [fleetConfig, setFleetConfig] = useState<FleetConfig>(getFleetConfig());

  // Listen to fleet configuration updates across components & modal
  useEffect(() => {
    const handleConfigUpdate = () => {
      setFleetConfig(getFleetConfig());
    };
    window.addEventListener('adam_fleet_config_updated', handleConfigUpdate);
    window.addEventListener('storage', handleConfigUpdate);
    return () => {
      window.removeEventListener('adam_fleet_config_updated', handleConfigUpdate);
      window.removeEventListener('storage', handleConfigUpdate);
    };
  }, []);

  // Helper for Robot Status Color & Text
  const getStatusBadge = (status: RobotStatus) => {
    switch (status) {
      case 'IDLE':
        return { label: t('stateIdle'), class: 'status-idle' };
      case 'MOVING':
        return { label: t('stateMoving'), class: 'status-moving' };
      case 'SERVING':
        return { label: t('stateServing'), class: 'status-serving' };
      case 'RETURNING':
        return { label: t('stateReturning'), class: 'status-returning' };
      case 'OBSTACLE':
        return { label: t('stateObstacle'), class: 'status-obstacle' };
      case 'ERROR':
        return { label: t('stateError'), class: 'status-error' };
    }
  };

  // Helper for Trash Level Color
  const getTrashInfo = (level: number) => {
    if (level > 80) return { label: t('trashFull'), color: 'var(--accent-rose)', badge: 'danger' };
    if (level > 50) return { label: t('trashWarning'), color: 'var(--accent-amber)', badge: 'warning' };
    return { label: t('trashSafe'), color: 'var(--accent-emerald)', badge: 'safe' };
  };

  const statusInfo = getStatusBadge(robotState.status);
  const trashInfo = getTrashInfo(robotState.trashLevel);

  // ==========================================================================
  // ACTION 1: PANGGIL ADAM KE STASIUN TERPILIH
  // ==========================================================================
  const handleDispatch = (targetNodeId: string) => {
    const targetNode = graph.nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return;

    if (robotState.trashLevel >= 85) {
      showToast(t('toastBinFullAlert'), 'error', 'Kapasitas Penuh');
      return;
    }

    if (robotState.currentNode === targetNodeId && robotState.status === 'IDLE') {
      showToast(`Robot ADAM sudah berada di ${targetNode.label}`, 'info');
      return;
    }

    const newRequest: CallRequest = {
      id: Date.now().toString(36),
      nodeId: targetNodeId,
      stationLabel: targetNode.label,
      timestamp: new Date().toLocaleTimeString(),
      status: 'PENDING',
    };

    // Calculate Dijkstra Path
    const { path, distance } = findShortestPath(robotState.currentNode, targetNodeId, graph);

    if (robotState.status === 'IDLE') {
      // Start moving immediately
      setRobotState((prev) => ({
        ...prev,
        status: 'MOVING',
        targetNode: targetNodeId,
      }));

      showToast(
        `${t('toastCallDispatched')} Menuju ${targetNode.label} (Rute: ${path.join(' -> ')}, Bobot: ${distance})`,
        'success',
        'ADAM Berangkat'
      );

      // Send dispatch signal directly to ESP32 robot armada via Wi-Fi / MQTT
      dispatchCommandToRobot(targetNodeId);

      addLog({
        type: 'DISPATCH',
        nodeId: targetNodeId,
        details: `Robot dipanggil ke ${targetNode.label}. Rute: ${path.join(' -> ')} (Jarak: ${distance})`,
        durationSec: distance * 0.8,
        severity: 'info',
      });

      // Simulate step-by-step travel along the shortest path
      let stepIndex = 0;
      const stepInterval = setInterval(() => {
        if (robotState.obstacleDetected) {
          // Pause if obstacle active
          return;
        }

        stepIndex++;
        if (stepIndex < path.length) {
          const nextNode = path[stepIndex];
          setRobotState((prev) => ({
            ...prev,
            currentNode: nextNode,
          }));
        } else {
          // Arrived at destination station!
          clearInterval(stepInterval);
          setRobotState((prev) => ({
            ...prev,
            status: 'SERVING',
            currentNode: targetNodeId,
            lidOpen: true, // Servo opens to 90 degrees
          }));

          showToast(
            `Robot ADAM telah tiba di ${targetNode.label}. Tutup sampah terbuka otomatis (Servo 90°)!`,
            'info',
            'Tiba di Stasiun'
          );

          // After dwell time (serving interaction), close lid
          setTimeout(() => {
            setRobotState((prev) => ({
              ...prev,
              lidOpen: false,
              trashLevel: Math.min(100, prev.trashLevel + Math.floor(Math.random() * 8 + 4)),
            }));
          }, 4500);
        }
      }, 1400);
    } else {
      // Robot is currently busy, enqueue request
      setQueue((prev) => [...prev, newRequest]);
      showToast(
        `${t('toastCallQueued')} Permintaan untuk ${targetNode.label} ada di antrean #${queue.length + 1}`,
        'warning',
        'Antrean Ditambahkan'
      );
    }
  };

  // ==========================================================================
  // ACTION 2: SELESAI & KEMBALIKAN KE HOME BASE
  // ==========================================================================
  const handleReturnHome = () => {
    const homeNode = graph.nodes.find((n) => n.isHome) || graph.nodes[0];
    if (robotState.currentNode === homeNode.id && robotState.status === 'IDLE') {
      showToast(`Robot ADAM sudah berada di Home Base (${homeNode.id})`, 'info');
      return;
    }

    const { path, distance } = findShortestPath(robotState.currentNode, homeNode.id, graph);

    setRobotState((prev) => ({
      ...prev,
      status: 'RETURNING',
      targetNode: homeNode.id,
      lidOpen: false, // Close servo
    }));

    showToast(t('toastReturnTriggered'), 'info', 'ADAM Pulang ke Base');

    addLog({
      type: 'RETURN',
      nodeId: homeNode.id,
      details: `Robot kembali ke ${homeNode.label} via jalur: ${path.join(' -> ')}`,
      durationSec: distance * 0.8,
      severity: 'info',
    });

    let stepIndex = 0;
    const returnInterval = setInterval(() => {
      stepIndex++;
      if (stepIndex < path.length) {
        setRobotState((prev) => ({
          ...prev,
          currentNode: path[stepIndex],
        }));
      } else {
        clearInterval(returnInterval);
        setRobotState((prev) => ({
          ...prev,
          status: 'IDLE',
          targetNode: null,
          currentNode: homeNode.id,
        }));
        showToast(`Robot ADAM telah tiba dan siaga di Home Base (${homeNode.label})!`, 'success');
      }
    }, 1200);
  };

  // ==========================================================================
  // ACTION 3: DETEKSI VOLUME SAMPAH REAL-TIME (HC-SR04 Internal)
  // ==========================================================================
  const handleCheckTrashVolume = () => {
    setIsScanningVolume(true);
    showToast('Mengirim pemicu ultrasonik HC-SR04 internal ke wadah sampah...', 'info');

    setTimeout(() => {
      // Simulate real-time ultrasonic measurement
      const totalBinHeight = 25; // 25 cm
      // Calculate realistic random variation or increment
      const measuredDistanceCm = Math.max(3, 25 - (robotState.trashLevel * 25) / 100 + (Math.random() * 2 - 1));
      const calculatedPercent = Math.min(
        100,
        Math.max(0, Math.round(((totalBinHeight - measuredDistanceCm) / (totalBinHeight - 3)) * 100))
      );

      setRobotState((prev) => ({
        ...prev,
        trashLevel: calculatedPercent,
        trashDistanceCm: parseFloat(measuredDistanceCm.toFixed(1)),
        lastUpdated: new Date().toLocaleTimeString(),
      }));

      setIsScanningVolume(false);
      showToast(
        `${t('toastVolumeDetected')} Sisa ruang: ${measuredDistanceCm.toFixed(1)} cm | Terisi: ${calculatedPercent}%`,
        calculatedPercent > 80 ? 'warning' : 'success',
        'Hasil Pemindaian Sensor'
      );

      addLog({
        type: 'VOLUME_SCAN',
        nodeId: robotState.currentNode,
        details: `Pemindaian sensor HC-SR04: Jarak = ${measuredDistanceCm.toFixed(1)} cm, Kapasitas = ${calculatedPercent}%`,
        trashPercent: calculatedPercent,
        severity: calculatedPercent > 80 ? 'warning' : 'success',
      });
    }, 1400);
  };

  // ==========================================================================
  // SIMULASI SENSOR FC-51 (OBSTACLE EMERGENCY STOP)
  // ==========================================================================
  const toggleObstacleSensor = () => {
    const newState = !robotState.obstacleDetected;
    setRobotState((prev) => ({
      ...prev,
      obstacleDetected: newState,
      status: newState ? 'OBSTACLE' : prev.targetNode ? 'MOVING' : 'IDLE',
    }));

    if (newState) {
      showToast(t('toastObstacleTriggered'), 'error', 'Sensor FC-51 Aktif');
      addLog({
        type: 'SAFETY_OBSTACLE',
        nodeId: robotState.currentNode,
        details: 'Sensor IR FC-51 mendeteksi objek di depan. Motor DC dihentikan seketika (Emergency Brake).',
        severity: 'error',
      });
    } else {
      showToast(t('toastObstacleCleared'), 'success', 'Jalur Bebas');
      addLog({
        type: 'SAFETY_OBSTACLE',
        nodeId: robotState.currentNode,
        details: 'Halangan di depan robot telah hilang. Sistem kembali normal.',
        severity: 'info',
      });
    }
  };

  // ==========================================================================
  // EMERGENCY STOP (E-STOP) & RESET ARMADA
  // ==========================================================================
  const [isEStopTriggering, setIsEStopTriggering] = useState(false);

  const handleEmergencyStop = async () => {
    setIsEStopTriggering(true);
    const isCurrentlyStopped = robotState.status === 'OBSTACLE';

    if (isCurrentlyStopped) {
      // Release E-STOP / Reset to Normal
      const res = await sendResetCommandToRobot();
      setRobotState((prev) => ({
        ...prev,
        obstacleDetected: false,
        status: 'IDLE',
      }));
      showToast(res.message, 'success', 'Sistem Normal (IDLE)');
    } else {
      // Trigger E-STOP Immediately
      const res = await sendEmergencyStopToRobot();
      setRobotState((prev) => ({
        ...prev,
        obstacleDetected: true,
        status: 'OBSTACLE',
      }));
      showToast(res.message, 'error', '🚨 E-STOP Aktif: Motor Berhenti Seketika');
    }
    setIsEStopTriggering(false);
  };

  // Get current node coordinates for robot position on canvas
  const currNodeObj = graph.nodes.find((n) => n.id === robotState.currentNode) || graph.nodes[0];

  return (
    <div className="dashboard-page-container">
      {/* ===================================================================
          1. TOP TELEMETRY BAR
          =================================================================== */}
      {/* ===================================================================
          1. TOP TELEMETRY BAR (5 SENSOR & STATS CARDS)
          =================================================================== */}
      <section className="telemetry-bar glass-panel" aria-label="Robot Telemetry">
        {/* Robot Status Card */}
        <div className="telemetry-item">
          <div className="telemetry-icon-box status-icon">
            <Navigation size={22} />
          </div>
          <div className="telemetry-info">
            <span className="telemetry-label">{t('robotStatus')}</span>
            {fleetConfig.isOnline ? (
              <div className={`status-pill ${statusInfo.class}`}>
                <div className="status-dot" />
                <span>{statusInfo.label}</span>
              </div>
            ) : (
              <div className="status-pill status-offline">
                <div className="status-dot status-dot-offline" />
                <span>-- (OFFLINE)</span>
              </div>
            )}
          </div>
        </div>

        {/* Current Node Location */}
        <div className="telemetry-item">
          <div className="telemetry-icon-box node-icon">
            <Layers size={22} />
          </div>
          <div className="telemetry-info">
            <span className="telemetry-label">{t('currentNode')}</span>
            <span className="telemetry-value mono">
              {fleetConfig.isOnline ? `Node ${robotState.currentNode} • ${currNodeObj?.label}` : '-- (TERPUTUS)'}
            </span>
          </div>
        </div>

        {/* Battery Level */}
        <div className="telemetry-item">
          <div className="telemetry-icon-box battery-icon">
            <BatteryCharging size={22} />
          </div>
          <div className="telemetry-info">
            <span className="telemetry-label">{t('batteryLevel')}</span>
            {fleetConfig.isOnline ? (
              <div className="battery-display">
                <span className="telemetry-value mono">{robotState.battery}%</span>
                <div className="battery-bar-track">
                  <div
                    className="battery-bar-fill"
                    style={{
                      width: `${robotState.battery}%`,
                      background:
                        robotState.battery > 40
                          ? 'var(--accent-emerald)'
                          : robotState.battery > 20
                          ? 'var(--accent-amber)'
                          : 'var(--accent-rose)',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="battery-display">
                <span className="telemetry-value mono text-muted">--%</span>
                <div className="battery-bar-track">
                  <div className="battery-bar-fill offline-bar" style={{ width: '0%' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Trash Volume Level (HC-SR04 Internal) */}
        <div className="telemetry-item">
          <div className="telemetry-icon-box trash-icon">
            <Trash2 size={22} />
          </div>
          <div className="telemetry-info">
            <span className="telemetry-label">{t('trashVolume')}</span>
            {fleetConfig.isOnline ? (
              <>
                <div className="trash-display">
                  <span className="telemetry-value mono" style={{ color: trashInfo.color }}>
                    {robotState.trashLevel}%
                  </span>
                  <div className="trash-bar-track">
                    <div
                      className="trash-bar-fill"
                      style={{
                        width: `${robotState.trashLevel}%`,
                        background: trashInfo.color,
                      }}
                    />
                  </div>
                </div>
                <span className="telemetry-subtext" style={{ color: trashInfo.color }}>
                  {trashInfo.label}
                </span>
              </>
            ) : (
              <>
                <div className="trash-display">
                  <span className="telemetry-value mono text-muted">--%</span>
                  <div className="trash-bar-track">
                    <div className="trash-bar-fill offline-bar" style={{ width: '0%' }} />
                  </div>
                </div>
                <span className="telemetry-subtext text-muted">{t('notConnected')}</span>
              </>
            )}
          </div>
        </div>

        {/* Safety Status (FC-51) */}
        <div className="telemetry-item">
          <div
            className={`telemetry-icon-box ${
              fleetConfig.isOnline && robotState.obstacleDetected ? 'obstacle-alert' : 'safety-icon'
            }`}
          >
            {fleetConfig.isOnline && robotState.obstacleDetected ? (
              <ShieldAlert size={22} />
            ) : (
              <ShieldCheck size={22} />
            )}
          </div>
          <div className="telemetry-info">
            <span className="telemetry-label">{t('safetyStatus')}</span>
            <span
              className="telemetry-value"
              style={{
                color: fleetConfig.isOnline
                  ? (robotState.obstacleDetected ? 'var(--accent-rose)' : 'var(--accent-emerald)')
                  : 'var(--text-muted)',
              }}
            >
              {fleetConfig.isOnline
                ? (robotState.obstacleDetected ? t('safetyBlocked') : t('safetyClear'))
                : '-- (OFFLINE)'}
            </span>
          </div>
        </div>
      </section>

      {/* ===================================================================
          1.5 FLEET WI-FI ARMADA CONNECTION BAR (BARIS BERIKUTNYA / DEDICATED ROW)
          =================================================================== */}
      <section
        className={`fleet-connection-banner glass-panel ${fleetConfig.isOnline ? 'banner-online' : 'banner-offline'}`}
        onClick={() => setIsFleetModalOpen(true)}
        role="button"
        tabIndex={0}
        title="Klik untuk membuka Konfigurasi Wi-Fi & Cloud Armada"
        id="btn-fleet-wifi-settings"
      >
        <div className="fleet-banner-left">
          <div className={`fleet-banner-icon ${fleetConfig.isOnline ? 'icon-online' : 'icon-offline'}`}>
            <Wifi size={22} />
          </div>
          <div className="fleet-banner-details">
            <div className="fleet-banner-title-row">
              <strong className="fleet-banner-title">{t('fleetBannerTitle')}</strong>
              <div className={`status-pill ${fleetConfig.isOnline ? 'status-fleet' : 'status-offline'}`}>
                <div className={`status-dot ${fleetConfig.isOnline ? 'status-dot-fleet' : 'status-dot-offline'}`} />
                <span>{fleetConfig.isOnline ? t('fleetOnline') : t('fleetOffline')}</span>
              </div>
            </div>
            <p className="fleet-banner-desc">
              Mode: <strong>{fleetConfig.connectionMode === 'DIRECT_WIFI' ? 'Direct Wi-Fi (SoftAP / LAN HTTP)' : fleetConfig.connectionMode === 'CLOUD_BRIDGE' ? 'Cloud Bridge (MQTT Broker SSL & Supabase)' : 'Auto Dual-Channel'}</strong>
              &bull; Target IP: <code>{fleetConfig.robotIp}:{fleetConfig.robotPort || 80}</code>
              {fleetConfig.isOnline && fleetConfig.pingMs ? ` • Latensi: ${fleetConfig.pingMs} ms` : ''}
            </p>
          </div>
        </div>

        <button type="button" className="btn-fleet-manage-action">
          <span>{t('fleetManageAction')}</span>
        </button>
      </section>

      {/* ===================================================================
          2. MAIN GRID: INTERACTIVE 2D MAP & CONTROL PANEL
          =================================================================== */}
      <div className="dashboard-main-grid">
        {/* Left Column: Interactive 2D Graph Map */}
        <section className="glass-panel map-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{t('mapHeading')}</h2>
              <p className="panel-subtitle">{t('mapHint')}</p>
            </div>
          </div>

          {/* Dedicated Subbar Row for Servo Lid Status */}
          <div className="map-subbar">
            <div className={`lid-badge ${robotState.lidOpen ? 'lid-open' : 'lid-closed'}`}>
              <span className="lid-indicator" />
              <span>
                {t('lidStatus')}: {robotState.lidOpen ? 'TERBUKA (90°)' : 'TERTUTUP (0°)'}
              </span>
            </div>
            <span className="lid-subtext">{t('servoLidInfo')}</span>
          </div>

          <div className="canvas-wrapper">
            <svg className="graph-svg" viewBox="0 0 100 88" preserveAspectRatio="xMidYMid meet">
              {/* Edges / Black Line Follower Tracks */}
              {graph.edges.map((edge, idx) => {
                const nodeFrom = graph.nodes.find((n) => n.id === edge.from);
                const nodeTo = graph.nodes.find((n) => n.id === edge.to);
                if (!nodeFrom || !nodeTo) return null;

                // Render bidirectional line once
                if (edge.from > edge.to) return null;

                const midX = (nodeFrom.x + nodeTo.x) / 2;
                const midY = (nodeFrom.y + nodeTo.y) / 2;

                return (
                  <g key={`edge-${idx}`}>
                    {/* Shadow line */}
                    <line
                      x1={nodeFrom.x}
                      y1={nodeFrom.y}
                      x2={nodeTo.x}
                      y2={nodeTo.y}
                      className="track-line-shadow"
                    />
                    {/* Main track */}
                    <line
                      x1={nodeFrom.x}
                      y1={nodeFrom.y}
                      x2={nodeTo.x}
                      y2={nodeTo.y}
                      className="track-line"
                    />
                    {/* Weight tag */}
                    <rect
                      x={midX - 3.5}
                      y={midY - 2.5}
                      width={7}
                      height={5}
                      rx={1.5}
                      className="edge-weight-bg"
                    />
                    <text
                      x={midX}
                      y={midY + 1.2}
                      textAnchor="middle"
                      className="edge-weight-text"
                    >
                      {edge.weight}
                    </text>
                  </g>
                );
              })}

              {/* Node markers on floor */}
              {graph.nodes.map((node) => {
                const isCurrent = robotState.currentNode === node.id;
                const isSelected = selectedStationId === node.id;

                return (
                  <g
                    key={`node-${node.id}`}
                    className={`graph-node-group ${isCurrent ? 'current' : ''} ${
                      isSelected ? 'selected' : ''
                    }`}
                    onClick={() => {
                      if (!fleetConfig.isOnline) {
                        showToast(
                          'Armada offline! Hubungkan website dengan mikrokontroler armada terlebih dahulu untuk menggerakkan robot.',
                          'warning',
                          'Armada Terkunci'
                        );
                        setIsFleetModalOpen(true);
                        return;
                      }
                      if (!node.isHome) {
                        setSelectedStationId(node.id);
                        handleDispatch(node.id);
                      } else {
                        handleReturnHome();
                      }
                    }}
                  >
                    {/* Concentric Sonar Pulse (Native SVG animate: perfectly centered at node) */}
                    {isCurrent && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={4.8}
                        fill="none"
                        stroke="var(--accent-blue)"
                        strokeWidth="1.2"
                      >
                        <animate
                          attributeName="r"
                          from="4.8"
                          to="10.5"
                          dur="1.8s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          from="0.9"
                          to="0"
                          dur="1.8s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}

                    {/* Node base circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={4.8}
                      className={`node-circle ${node.isHome ? 'home-node' : 'station-node'}`}
                      style={{
                        stroke: node.colorHex || 'var(--accent-blue)',
                      }}
                    />

                    {/* Label */}
                    <text
                      x={node.x}
                      y={node.y + 1.4}
                      textAnchor="middle"
                      className="node-text-id"
                    >
                      {node.id}
                    </text>

                    {/* Subtitle tag */}
                    <text
                      x={node.x}
                      y={node.y + 7.5}
                      textAnchor="middle"
                      className="node-sub-label"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}

              {/* Real-time Animated Robot Avatar (aligned perfectly at node center) */}
              {currNodeObj && (
                <g
                  className="robot-avatar-group float-animation"
                  transform={`translate(${currNodeObj.x}, ${currNodeObj.y})`}
                  style={{
                    transition: 'transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <circle r={3.2} className="robot-chassis" />
                  <circle r={1.4} className="robot-sensor-eye" />
                  {/* Direction indicator */}
                  <polygon points="0,-4.2 -1.4,-2.2 1.4,-2.2" className="robot-heading-arrow" />
                </g>
              )}
            </svg>
          </div>
        </section>

        {/* Right Column: Dynamic Stations & 3 Control Buttons */}
        <section className="glass-panel control-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{t('actionHeading')}</h2>
              <p className="panel-subtitle">{t('stationSub')}</p>
            </div>
            <div className="control-header-status">
              {fleetConfig.isOnline ? (
                <button
                  type="button"
                  className="control-status-badge online"
                  onClick={() => setIsFleetModalOpen(true)}
                  title="Armada online dan terhubung. Klik untuk konfigurasi Wi-Fi / Cloud."
                >
                  <span className="dot-green-pulse" />
                  <span>{t('fleetReadyOnline')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="control-status-badge offline"
                  onClick={() => setIsFleetModalOpen(true)}
                  title="Armada belum terkoneksi. Klik untuk menghubungkan armada."
                >
                  <Lock size={12} />
                  <span>{t('fleetLockedOffline')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Locked Notice Banner if Fleet is Offline */}
          {!fleetConfig.isOnline && (
            <div
              className="control-panel-locked-notice"
              onClick={() => setIsFleetModalOpen(true)}
              role="button"
              tabIndex={0}
              title="Klik untuk membuka pengaturan koneksi armada"
            >
              <div className="locked-notice-icon">
                <Lock size={20} />
              </div>
              <div className="locked-notice-text">
                <strong>{t('fleetLockedNoticeTitle')}</strong>
                <p>{t('fleetLockedNoticeDesc')}</p>
              </div>
              <button
                type="button"
                className="btn-unlock-badge"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFleetModalOpen(true);
                }}
              >
                {t('btnConnectFleet')}
              </button>
            </div>
          )}

          {/* Dynamic Station Selector (Based on active nodes in graph) */}
          <div className="stations-section">
            <span className="control-section-label">{t('stationHeading')}</span>
            <div className="station-cards-grid">
              {availableStations.map((station) => {
                const isSelected = selectedStationId === station.id;
                const isCurrentRobotStation = robotState.currentNode === station.id;

                return (
                  <div
                    key={station.id}
                    className={`station-card ${isSelected ? 'selected' : ''} ${
                      !fleetConfig.isOnline ? 'locked' : ''
                    }`}
                    onClick={() => {
                      if (!fleetConfig.isOnline) {
                        showToast('Armada offline! Hubungkan Wi-Fi/Cloud untuk memilih stasiun.', 'warning');
                        setIsFleetModalOpen(true);
                        return;
                      }
                      setSelectedStationId(station.id);
                    }}
                    style={{
                      borderLeftColor: station.colorHex || 'var(--accent-blue)',
                    }}
                  >
                    <div className="station-card-top">
                      <span className="station-id-pill" style={{ background: station.colorHex }}>
                        Node {station.id}
                      </span>
                    </div>
                    <span className="station-name">{station.label}</span>
                    {isCurrentRobotStation && (
                      <div className="station-here-row">
                        <span className="badge station-here-badge">
                          <span className="dot-green-tiny" />
                          {t('adamHereBadge')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3 Main Action Buttons - Standard Website SaaS Styling */}
          <div className="main-actions-stack">
            {/* Button 1: Panggil ADAM ke Stasiun Terpilih (Primary SaaS Action) */}
            <button
              className="std-action-btn std-btn-primary"
              onClick={() => handleDispatch(selectedStationId)}
              disabled={!fleetConfig.isOnline || robotState.status === 'OBSTACLE'}
              id="btn-call-adam"
              title={
                !fleetConfig.isOnline
                  ? 'Tombol terkunci karena armada sedang offline'
                  : `Panggil robot ke Node ${selectedStationId}`
              }
            >
              {!fleetConfig.isOnline ? <Lock size={16} /> : <Send size={16} />}
              <span>
                {!fleetConfig.isOnline
                  ? t('lockedConnectFirst')
                  : `Panggil ADAM ke Node ${selectedStationId} (${availableStations.find((s) => s.id === selectedStationId)?.label || 'Stasiun'})`}
              </span>
            </button>

            {/* Button 2: Selesai & Kembalikan ke Home Base (Secondary SaaS Action) */}
            <button
              className="std-action-btn std-btn-secondary"
              onClick={handleReturnHome}
              disabled={!fleetConfig.isOnline || robotState.status === 'OBSTACLE'}
              id="btn-return-home"
              title={
                !fleetConfig.isOnline
                  ? 'Tombol terkunci karena armada sedang offline'
                  : 'Kembalikan robot ke Home Base (Node A)'
              }
            >
              {!fleetConfig.isOnline ? <Lock size={16} /> : <Home size={16} />}
              <span>
                {!fleetConfig.isOnline
                  ? t('lockedConnectFirst')
                  : t('btnReturnHome')}
              </span>
            </button>

            {/* Button 3: Deteksi Volume Sampah Real-Time (Tertiary / Sensor Action) */}
            <button
              className={`std-action-btn std-btn-secondary ${isScanningVolume ? 'is-scanning' : ''}`}
              onClick={handleCheckTrashVolume}
              disabled={!fleetConfig.isOnline || isScanningVolume}
              id="btn-check-volume"
              title={
                !fleetConfig.isOnline
                  ? 'Tombol terkunci karena armada sedang offline'
                  : 'Pindai ketinggian sampah via sensor ultrasonik'
              }
            >
              {!fleetConfig.isOnline ? (
                <Lock size={16} />
              ) : (
                <Scan size={16} className={isScanningVolume ? 'pulse-animation' : ''} />
              )}
              <span>
                {!fleetConfig.isOnline
                  ? t('lockedConnectFirst')
                  : isScanningVolume
                  ? t('scanningUltrasonic')
                  : t('btnCheckVolume')}
              </span>
            </button>
          </div>

          {/* Dedicated Row: Sensor Halangan FC-51 & E-STOP Armada */}
          <div className="obstacle-sensor-section">
            <div className="obstacle-sensor-header">
              <span className="control-section-label">{t('obstacleSensorSectionTitle')}</span>
              <span className="obstacle-sensor-hint">
                {t('obstacleSensorSectionDesc')}
              </span>
            </div>
            
            <div className="obstacle-actions-grid">
              <button
                className={`obstacle-status-btn ${
                  robotState.obstacleDetected ? 'active' : 'normal'
                } ${!fleetConfig.isOnline ? 'disabled-btn' : ''}`}
                onClick={toggleObstacleSensor}
                disabled={!fleetConfig.isOnline}
                id="btn-simulate-obstacle"
                title="Status sensor infra merah FC-51 di depan robot"
              >
                {!fleetConfig.isOnline ? <Lock size={16} /> : <AlertTriangle size={16} />}
                <span>
                  {!fleetConfig.isOnline
                    ? t('lockedConnectFirst')
                    : robotState.obstacleDetected
                    ? t('btnTriggerObstacleActive')
                    : t('btnTriggerObstacleInactive')}
                </span>
              </button>

              <button
                className={`std-action-btn ${
                  robotState.status === 'OBSTACLE' ? 'std-btn-reset-estop' : 'std-btn-danger-estop'
                }`}
                onClick={handleEmergencyStop}
                disabled={!fleetConfig.isOnline || isEStopTriggering}
                id="btn-emergency-stop"
                title="Kirim sinyal rem darurat seketika ke ESP32 via Wi-Fi/MQTT"
              >
                {!fleetConfig.isOnline ? (
                  <>
                    <Lock size={16} />
                    <span>{t('fleetLockedOffline')}</span>
                  </>
                ) : robotState.status === 'OBSTACLE' ? (
                  <>
                    <RotateCcw size={16} />
                    <span>{t('btnResetBrake')}</span>
                  </>
                ) : (
                  <>
                    <OctagonAlert size={16} />
                    <span>{t('btnEmergencyStop')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Queue (FIFO) List */}
          <div className="queue-section glass-card">
            <div className="queue-header">
              <Clock size={16} className="queue-icon" />
              <span className="queue-title">{t('queueHeading')}</span>
            </div>
            {queue.length === 0 ? (
              <p className="queue-empty-text">{t('queueEmpty')}</p>
            ) : (
              <div className="queue-list">
                {queue.map((req, idx) => (
                  <div key={req.id} className="queue-item">
                    <span className="queue-idx">#{idx + 1}</span>
                    <span className="queue-station">
                      Node {req.nodeId} &bull; {req.stationLabel}
                    </span>
                    <span className="queue-time">{req.timestamp}</span>
                    <span className="badge queue-pending-badge">MENUNGGU</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Fleet Wi-Fi & MQTT Armada Connection Modal */}
      <FleetConnectionModal
        isOpen={isFleetModalOpen}
        onClose={() => setIsFleetModalOpen(false)}
      />
    </div>
  );
};
