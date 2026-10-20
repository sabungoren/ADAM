import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Wifi,
  Radio,
  Server,
  Zap,
  CheckCircle2,
  RefreshCw,
  X,
  Activity,
} from 'lucide-react';
import {
  FleetConfig,
  getFleetConfig,
  saveFleetConfig,
  testFleetPing,
  triggerRefreshGraphToRobot,
} from '../services/fleetService';
import { useAlert } from '../context/AlertContext';
import './FleetConnectionModal.css';

interface FleetConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FleetConnectionModal: React.FC<FleetConnectionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { toast } = useAlert();
  const [config, setConfig] = useState<FleetConfig>(getFleetConfig());
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveFleetConfig(config);
    toast.success('Pengaturan koneksi armada Wi-Fi berhasil disimpan!');
    onClose();
  };

  const handleTestPing = async () => {
    setIsTestingPing(true);
    setPingResult(null);
    try {
      const result = await testFleetPing(config);
      setConfig((prev) => ({
        ...prev,
        pingMs: result.latencyMs,
        isOnline: result.success,
        lastPingTime: new Date().toLocaleTimeString(),
      }));
      setPingResult(result.message);
      toast.success(result.message);
    } catch {
      toast.error('Gagal menghubungi armada.');
    } finally {
      setIsTestingPing(false);
    }
  };

  const handleRefreshGraphSignal = async () => {
    setIsRefreshing(true);
    try {
      const res = await triggerRefreshGraphToRobot(config);
      toast.success(res.message);
    } catch {
      toast.error('Gagal mengirimkan sinyal pembaruan graf ke armada.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return createPortal(
    <div className="fleet-modal-overlay" onClick={onClose}>
      <div
        className="fleet-modal-card glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="fleet-modal-title"
      >
        {/* Header */}
        <div className="fleet-modal-header">
          <div className="fleet-modal-title-box">
            <div className="fleet-icon-badge">
              <Wifi size={22} />
            </div>
            <div>
              <h2 id="fleet-modal-title" className="fleet-modal-title">
                Koneksi Armada Robot ADAM (Wi-Fi &amp; Cloud)
              </h2>
              <p className="fleet-modal-subtitle">
                Protokol komunikasi mikrokontroler ESP32 via Wi-Fi Lokal &amp; MQTT Cloud
              </p>
            </div>
          </div>
          <button
            className="fleet-close-btn"
            onClick={onClose}
            aria-label="Tutup modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Live Status Summary Banner */}
        <div className="fleet-status-banner">
          <div className="fleet-status-item">
            <span className="fleet-status-label">Status Wi-Fi Armada</span>
            <div className="fleet-status-value">
              <div className="status-dot-active" />
              <span className="mono">TERHUBUNG (ONLINE)</span>
            </div>
          </div>

          <div className="fleet-status-item">
            <span className="fleet-status-label">Latensi Sinyal (Ping)</span>
            <span className="fleet-status-value mono text-emerald">
              {config.pingMs ? `${config.pingMs} ms` : '24 ms'} &bull; RSSI -46 dBm
            </span>
          </div>

          <div className="fleet-status-item">
            <span className="fleet-status-label">Target Firmware</span>
            <span className="fleet-status-value mono">
              ESP32 FreeRTOS (Dual Core)
            </span>
          </div>
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSave} className="fleet-form">
          {/* Mode Selector */}
          <div className="fleet-form-group">
            <label className="fleet-label">
              <Radio size={16} />
              <span>Metode Komunikasi Armada</span>
            </label>
            <div className="fleet-mode-grid">
              <button
                type="button"
                className={`fleet-mode-card ${
                  config.connectionMode === 'AUTO' ? 'selected' : ''
                }`}
                onClick={() => setConfig({ ...config, connectionMode: 'AUTO' })}
              >
                <div className="fleet-mode-title">
                  <Zap size={16} />
                  <span>Otomatis (Hybrid)</span>
                </div>
                <p className="fleet-mode-desc">
                  Mencoba Wi-Fi Lokal langsung, fallback otomatis ke Supabase/MQTT
                </p>
              </button>

              <button
                type="button"
                className={`fleet-mode-card ${
                  config.connectionMode === 'DIRECT_WIFI' ? 'selected' : ''
                }`}
                onClick={() =>
                  setConfig({ ...config, connectionMode: 'DIRECT_WIFI' })
                }
              >
                <div className="fleet-mode-title">
                  <Wifi size={16} />
                  <span>Wi-Fi Langsung (LAN)</span>
                </div>
                <p className="fleet-mode-desc">
                  Koneksi HTTP REST langsung ke IP lokal ESP32 (misal di kelas)
                </p>
              </button>

              <button
                type="button"
                className={`fleet-mode-card ${
                  config.connectionMode === 'CLOUD_BRIDGE' ? 'selected' : ''
                }`}
                onClick={() =>
                  setConfig({ ...config, connectionMode: 'CLOUD_BRIDGE' })
                }
              >
                <div className="fleet-mode-title">
                  <Server size={16} />
                  <span>Cloud Bridge (MQTT)</span>
                </div>
                <p className="fleet-mode-desc">
                  Koneksi via broker EMQX Cloud &amp; Supabase Realtime channel
                </p>
              </button>
            </div>
          </div>

          {/* DYNAMIC MODE CONTENT 1: DIRECT WI-FI (LAN) */}
          {config.connectionMode === 'DIRECT_WIFI' && (
            <>
              <div className="fleet-mode-info-box direct-wifi">
                <div className="fleet-mode-info-header">
                  <span className="fleet-mode-info-title">
                    <Wifi size={16} />
                    <span>Mode Wi-Fi Langsung (Local Peer-to-Peer / Hotspot)</span>
                  </span>
                  <span className="fleet-protocol-pill">HTTP REST API</span>
                </div>
                <p className="fleet-mode-info-desc">
                  Perintah dikirimkan langsung ke mikrokontroler ESP32 tanpa internet. Sangat cepat (&lt;25 ms), ideal untuk pengujian perakitan di lab/kelas atau saat laptop/HP terhubung ke Hotspot robot.
                </p>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-ip" className="fleet-label">
                    <span>Alamat IP Robot (ESP32)</span>
                  </label>
                  <input
                    id="fleet-ip"
                    type="text"
                    className="fleet-input mono"
                    value={config.robotIp}
                    onChange={(e) =>
                      setConfig({ ...config, robotIp: e.target.value })
                    }
                    placeholder="192.168.4.1 atau 192.168.1.50"
                    required
                  />
                  <span className="fleet-help-text">
                    IP mode Hotspot SoftAP bawaan ESP32: <code>192.168.4.1</code>
                  </span>
                </div>

                <div className="fleet-form-group w-32">
                  <label htmlFor="fleet-port" className="fleet-label">
                    <span>Port HTTP</span>
                  </label>
                  <input
                    id="fleet-port"
                    type="number"
                    className="fleet-input mono"
                    value={config.robotPort}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        robotPort: parseInt(e.target.value) || 80,
                      })
                    }
                    placeholder="80"
                    required
                  />
                </div>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-ssid" className="fleet-label">
                    <span>SSID Hotspot Robot</span>
                  </label>
                  <input
                    id="fleet-ssid"
                    type="text"
                    className="fleet-input"
                    value={config.wifiSsid}
                    onChange={(e) =>
                      setConfig({ ...config, wifiSsid: e.target.value })
                    }
                    placeholder="SMART-ADAM-FLEET"
                  />
                </div>

                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-pass" className="fleet-label">
                    <span>Password Wi-Fi Default</span>
                  </label>
                  <input
                    id="fleet-pass"
                    type="text"
                    className="fleet-input mono"
                    value={config.wifiPassword || 'adam12345'}
                    onChange={(e) =>
                      setConfig({ ...config, wifiPassword: e.target.value })
                    }
                    placeholder="adam12345"
                  />
                  <span className="fleet-help-text">
                    Default firmware: <code>adam12345</code>
                  </span>
                </div>
              </div>
            </>
          )}

          {/* DYNAMIC MODE CONTENT 2: CLOUD BRIDGE (MQTT) */}
          {config.connectionMode === 'CLOUD_BRIDGE' && (
            <>
              <div className="fleet-mode-info-box cloud-bridge">
                <div className="fleet-mode-info-header">
                  <span className="fleet-mode-info-title">
                    <Server size={16} />
                    <span>Mode Cloud Bridge (MQTT Broker &amp; Supabase Realtime)</span>
                  </span>
                  <span className="fleet-protocol-pill">MQTT over SSL</span>
                </div>
                <p className="fleet-mode-info-desc">
                  Armada robot dikendalikan secara nirkabel jarak jauh melalui Broker Cloud MQTT. Robot dapat berada di ruangan mana pun selama mikrokontroler ESP32 terhubung ke Wi-Fi dengan akses internet.
                </p>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-broker" className="fleet-label">
                    <span>Broker MQTT Server</span>
                  </label>
                  <input
                    id="fleet-broker"
                    type="text"
                    className="fleet-input mono"
                    value={config.mqttBroker}
                    onChange={(e) =>
                      setConfig({ ...config, mqttBroker: e.target.value })
                    }
                    placeholder="broker.emqx.io"
                    required
                  />
                  <span className="fleet-help-text">
                    Default: <code>broker.emqx.io</code> (Port SSL: <code>8883</code>)
                  </span>
                </div>

                <div className="fleet-form-group w-32">
                  <label htmlFor="fleet-mqtt-port" className="fleet-label">
                    <span>Port MQTT</span>
                  </label>
                  <input
                    id="fleet-mqtt-port"
                    type="number"
                    className="fleet-input mono"
                    value={config.mqttPort || 8883}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        mqttPort: parseInt(e.target.value) || 8883,
                      })
                    }
                    placeholder="8883"
                  />
                </div>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-mqtt-moveto" className="fleet-label">
                    <span>Topik MQTT Panggilan</span>
                  </label>
                  <input
                    id="fleet-mqtt-moveto"
                    type="text"
                    className="fleet-input mono"
                    value={config.mqttTopicMoveto}
                    onChange={(e) =>
                      setConfig({ ...config, mqttTopicMoveto: e.target.value })
                    }
                    placeholder="srv/adam/moveto"
                    required
                  />
                </div>

                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-mqtt-refresh" className="fleet-label">
                    <span>Topik Pembaruan Rute (Refresh Graph)</span>
                  </label>
                  <input
                    id="fleet-mqtt-refresh"
                    type="text"
                    className="fleet-input mono"
                    value={config.mqttTopicRefresh}
                    onChange={(e) =>
                      setConfig({ ...config, mqttTopicRefresh: e.target.value })
                    }
                    placeholder="srv/adam/refreshgraph"
                  />
                </div>
              </div>
            </>
          )}

          {/* DYNAMIC MODE CONTENT 3: OTOMATIS (HYBRID) */}
          {config.connectionMode === 'AUTO' && (
            <>
              <div className="fleet-mode-info-box">
                <div className="fleet-mode-info-header">
                  <span className="fleet-mode-info-title">
                    <Zap size={16} />
                    <span>Mode Otomatis / Hybrid (Wi-Fi Cepat + Fallback Cloud)</span>
                  </span>
                  <span className="fleet-protocol-pill">Dual Failover</span>
                </div>
                <p className="fleet-mode-info-desc">
                  Sistem cerdas mencoba memanggil armada melalui Wi-Fi Lokal terlebih dahulu (&lt;25 ms). Jika robot berada di luar jangkauan Wi-Fi lokal, sistem otomatis mengalihkan perintah ke Cloud MQTT &amp; Supabase Realtime!
                </p>
              </div>

              <div className="fleet-section-divider">
                <span>Jalur 1: Wi-Fi Lokal Utama (Direct)</span>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-ip-hybrid" className="fleet-label">
                    <span>Alamat IP Robot</span>
                  </label>
                  <input
                    id="fleet-ip-hybrid"
                    type="text"
                    className="fleet-input mono"
                    value={config.robotIp}
                    onChange={(e) =>
                      setConfig({ ...config, robotIp: e.target.value })
                    }
                    placeholder="192.168.4.1"
                    required
                  />
                </div>

                <div className="fleet-form-group w-32">
                  <label htmlFor="fleet-port-hybrid" className="fleet-label">
                    <span>Port HTTP</span>
                  </label>
                  <input
                    id="fleet-port-hybrid"
                    type="number"
                    className="fleet-input mono"
                    value={config.robotPort}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        robotPort: parseInt(e.target.value) || 80,
                      })
                    }
                    placeholder="80"
                  />
                </div>

                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-ssid-hybrid" className="fleet-label">
                    <span>SSID Wi-Fi</span>
                  </label>
                  <input
                    id="fleet-ssid-hybrid"
                    type="text"
                    className="fleet-input"
                    value={config.wifiSsid}
                    onChange={(e) =>
                      setConfig({ ...config, wifiSsid: e.target.value })
                    }
                    placeholder="SMART-ADAM-FLEET"
                  />
                </div>
              </div>

              <div className="fleet-section-divider">
                <span>Jalur 2: Cloud MQTT Cadangan (Internet Fallback)</span>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-broker-hybrid" className="fleet-label">
                    <span>Broker MQTT</span>
                  </label>
                  <input
                    id="fleet-broker-hybrid"
                    type="text"
                    className="fleet-input mono"
                    value={config.mqttBroker}
                    onChange={(e) =>
                      setConfig({ ...config, mqttBroker: e.target.value })
                    }
                    placeholder="broker.emqx.io"
                  />
                </div>

                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-mqtt-moveto-hybrid" className="fleet-label">
                    <span>Topik MQTT Panggilan</span>
                  </label>
                  <input
                    id="fleet-mqtt-moveto-hybrid"
                    type="text"
                    className="fleet-input mono"
                    value={config.mqttTopicMoveto}
                    onChange={(e) =>
                      setConfig({ ...config, mqttTopicMoveto: e.target.value })
                    }
                    placeholder="srv/adam/moveto"
                  />
                </div>
              </div>
            </>
          )}

          {/* Ping Result Feedback */}
          {pingResult && (
            <div className="fleet-ping-result">
              <Activity size={16} />
              <span>{pingResult}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="fleet-modal-actions">
            <button
              type="button"
              className="fleet-btn fleet-btn-test"
              onClick={handleTestPing}
              disabled={isTestingPing}
              id="btn-fleet-ping"
            >
              <Activity
                size={16}
                className={isTestingPing ? 'spin-animation' : ''}
              />
              <span>
                {isTestingPing
                  ? 'Menguji...'
                  : config.connectionMode === 'CLOUD_BRIDGE'
                  ? 'Uji Koneksi Cloud Broker'
                  : config.connectionMode === 'DIRECT_WIFI'
                  ? 'Uji Ping Wi-Fi Armada'
                  : 'Uji Koneksi Armada'}
              </span>
            </button>

            <button
              type="button"
              className="fleet-btn fleet-btn-secondary"
              onClick={handleRefreshGraphSignal}
              disabled={isRefreshing}
              id="btn-fleet-refresh-graph"
            >
              <RefreshCw
                size={16}
                className={isRefreshing ? 'spin-animation' : ''}
              />
              <span>Kirim Sinyal Rute ke RAM</span>
            </button>

            <div className="flex-spacer" />

            <button
              type="button"
              className="fleet-btn fleet-btn-cancel"
              onClick={onClose}
            >
              Tutup
            </button>

            <button
              type="submit"
              className="fleet-btn fleet-btn-primary"
              id="btn-fleet-save"
            >
              <CheckCircle2 size={16} />
              <span>Simpan Pengaturan</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
