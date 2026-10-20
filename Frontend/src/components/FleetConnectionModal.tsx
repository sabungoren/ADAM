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
import { useLanguage } from '../context/LanguageContext';
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
  const { t } = useLanguage();
  const [config, setConfig] = useState<FleetConfig>(getFleetConfig());
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveFleetConfig(config);
    toast.success(t('fleetToastSaved'));
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
      toast.error(t('fleetToastPingFailed'));
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
      toast.error(t('fleetToastGraphFailed'));
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
                {t('fleetModalTitle')}
              </h2>
              <p className="fleet-modal-subtitle">
                {t('fleetModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            className="fleet-close-btn"
            onClick={onClose}
            aria-label={t('fleetCloseModal')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Live Status Summary Banner */}
        <div className="fleet-status-banner">
          <div className="fleet-status-item">
            <span className="fleet-status-label">{t('fleetStatusWifiLabel')}</span>
            <div className="fleet-status-value">
              <div className="status-dot-active" />
              <span className="mono">{t('fleetStatusConnected')}</span>
            </div>
          </div>

          <div className="fleet-status-item">
            <span className="fleet-status-label">{t('fleetStatusLatencyLabel')}</span>
            <span className="fleet-status-value mono text-emerald">
              {config.pingMs ? `${config.pingMs} ms` : '24 ms'} &bull; RSSI -46 dBm
            </span>
          </div>

          <div className="fleet-status-item">
            <span className="fleet-status-label">{t('fleetStatusTargetFirmwareLabel')}</span>
            <span className="fleet-status-value mono">
              {t('fleetStatusTargetFirmwareVal')}
            </span>
          </div>
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSave} className="fleet-form">
          {/* Mode Selector */}
          <div className="fleet-form-group">
            <label className="fleet-label">
              <Radio size={16} />
              <span>{t('fleetCommMethodLabel')}</span>
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
                  <span>{t('fleetModeAutoTitle')}</span>
                </div>
                <p className="fleet-mode-desc">
                  {t('fleetModeAutoDesc')}
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
                  <span>{t('fleetModeDirectWifiTitle')}</span>
                </div>
                <p className="fleet-mode-desc">
                  {t('fleetModeDirectWifiDesc')}
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
                  <span>{t('fleetModeCloudBridgeTitle')}</span>
                </div>
                <p className="fleet-mode-desc">
                  {t('fleetModeCloudBridgeDesc')}
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
                    <span>{t('fleetModeDirectWifiHeading')}</span>
                  </span>
                  <span className="fleet-protocol-pill">{t('fleetProtocolHttpRest')}</span>
                </div>
                <p className="fleet-mode-info-desc">
                  {t('fleetModeDirectWifiExplanation')}
                </p>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-ip" className="fleet-label">
                    <span>{t('fleetLabelRobotIp')}</span>
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
                    {t('fleetHelpRobotIp')} <code>192.168.4.1</code>
                  </span>
                </div>

                <div className="fleet-form-group w-32">
                  <label htmlFor="fleet-port" className="fleet-label">
                    <span>{t('fleetLabelHttpPort')}</span>
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
                    <span>{t('fleetLabelSsid')}</span>
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
                    <span>{t('fleetLabelPassword')}</span>
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
                    {t('fleetHelpPassword')} <code>adam12345</code>
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
                    <span>{t('fleetModeCloudBridgeHeading')}</span>
                  </span>
                  <span className="fleet-protocol-pill">{t('fleetProtocolMqttSsl')}</span>
                </div>
                <p className="fleet-mode-info-desc">
                  {t('fleetModeCloudBridgeExplanation')}
                </p>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-broker" className="fleet-label">
                    <span>{t('fleetLabelBroker')}</span>
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
                    <span>{t('fleetLabelMqttPort')}</span>
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
                    <span>{t('fleetLabelMqttMoveto')}</span>
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
                    <span>{t('fleetLabelMqttRefresh')}</span>
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
                    <span>{t('fleetModeAutoHeading')}</span>
                  </span>
                  <span className="fleet-protocol-pill">{t('fleetProtocolDualFailover')}</span>
                </div>
                <p className="fleet-mode-info-desc">
                  {t('fleetModeAutoExplanation')}
                </p>
              </div>

              <div className="fleet-section-divider">
                <span>{t('fleetSectionPath1')}</span>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-ip-hybrid" className="fleet-label">
                    <span>{t('fleetLabelRobotIp')}</span>
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
                    <span>{t('fleetLabelHttpPort')}</span>
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
                    <span>{t('fleetLabelSsid')}</span>
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
                <span>{t('fleetSectionPath2')}</span>
              </div>

              <div className="fleet-form-row">
                <div className="fleet-form-group flex-1">
                  <label htmlFor="fleet-broker-hybrid" className="fleet-label">
                    <span>{t('fleetLabelBroker')}</span>
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
                    <span>{t('fleetLabelMqttMoveto')}</span>
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
                  ? t('fleetBtnTesting')
                  : config.connectionMode === 'CLOUD_BRIDGE'
                  ? t('fleetBtnTestCloud')
                  : config.connectionMode === 'DIRECT_WIFI'
                  ? t('fleetBtnTestWifi')
                  : t('fleetBtnTestFleet')}
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
              <span>{t('fleetBtnSendRoute')}</span>
            </button>

            <div className="flex-spacer" />

            <button
              type="button"
              className="fleet-btn fleet-btn-cancel"
              onClick={onClose}
            >
              {t('fleetBtnClose')}
            </button>

            <button
              type="submit"
              className="fleet-btn fleet-btn-primary"
              id="btn-fleet-save"
            >
              <CheckCircle2 size={16} />
              <span>{t('fleetBtnSave')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
