import React, { useState } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { 
  QrCode, 
  Bot, 
  MapPin, 
  Clock, 
  XCircle, 
  CheckCircle, 
  AlertTriangle,
  Battery, 
  Trash2, 
  ShieldCheck 
} from 'lucide-react';

export const QuickCall: React.FC = () => {
  const { telemetry, graph, callNode, cancelRequest } = useTelemetry();

  // If path is /cmd/B, extract 'B' or default to first active node
  const activeNodes = graph?.nodes || ['A', 'B', 'C'];
  const [selectedNode, setSelectedNode] = useState<string>(activeNodes[0] || 'A');
  const [calling, setCalling] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCall = async () => {
    setCalling(true);
    setErrorMessage(null);
    setLastResponse(null);

    const res = await callNode(selectedNode, `qr-${selectedNode}`);
    setCalling(false);

    if (res.success) {
      setLastResponse(res.data);
    } else {
      setErrorMessage(res.error || 'Gagal memanggil robot');
    }
  };

  // Check if this node is currently queued or in progress
  const activeReq = telemetry.queue.find(q => q.node === selectedNode);
  const isRobotAtThisNode = telemetry.pos.current === selectedNode && !telemetry.pos.next && telemetry.status === 'IDLE';
  const isRobotHeadingHere = telemetry.pos.next === selectedNode;

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-cyan-400 flex items-center justify-center mx-auto shadow-xl shadow-cyan-500/20">
          <QrCode className="w-8 h-8 text-dark-950 font-bold" />
        </div>
        <h1 className="text-2xl font-black text-white">Quick-Call Armada</h1>
        <p className="text-xs text-gray-400">
          Panggil tempat sampah otomatis ke lokasi titik fisik Anda secara langsung.
        </p>
      </div>

      {/* Select Location / Node */}
      <div className="bg-dark-900 border border-dark-700 p-4 rounded-2xl shadow-xl space-y-3">
        <label className="block text-xs font-bold text-gray-300">
          Pilih Titik Lokasi Panggilan (Node):
        </label>
        <div className="grid grid-cols-4 gap-2">
          {activeNodes.map(nodeId => (
            <button
              key={nodeId}
              onClick={() => {
                setSelectedNode(nodeId);
                setLastResponse(null);
                setErrorMessage(null);
              }}
              className={`py-2.5 rounded-xl font-bold text-sm transition-all border ${
                selectedNode === nodeId
                  ? 'bg-cyan-500 text-dark-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                  : 'bg-dark-950 text-gray-300 border-dark-800 hover:border-dark-700'
              }`}
            >
              Node {nodeId}
            </button>
          ))}
        </div>
      </div>

      {/* Primary 1-Click Call Button & Status */}
      <div className="bg-dark-900 border border-dark-700 p-6 rounded-2xl shadow-xl text-center space-y-5">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-dark-950 border border-dark-800 text-cyan-400">
          <MapPin className="w-3.5 h-3.5" />
          <span>Lokasi Terpilih: Node {selectedNode}</span>
        </div>

        {/* Dynamic Status message based on fleet state */}
        {isRobotAtThisNode ? (
          <div className="bg-emerald-950/60 border border-emerald-800/80 p-4 rounded-xl text-xs text-emerald-300 space-y-1">
            <CheckCircle className="w-6 h-6 mx-auto text-emerald-400" />
            <p className="font-bold">Robot Sudah Berada di Lokasi Ini!</p>
            <p className="text-[11px] text-emerald-400/80">Silakan buang sampah Anda langsung ke wadah.</p>
          </div>
        ) : isRobotHeadingHere ? (
          <div className="bg-cyan-950/60 border border-cyan-800/80 p-4 rounded-xl text-xs text-cyan-300 space-y-1">
            <Bot className="w-6 h-6 mx-auto text-cyan-400 animate-bounce" />
            <p className="font-bold">Robot Sedang Menuju ke Lokasi Ini!</p>
            <p className="text-[11px] text-cyan-400/80">Harap menunggu beberapa saat.</p>
          </div>
        ) : activeReq ? (
          <div className="bg-cyan-950/60 border border-cyan-800/80 p-4 rounded-xl text-xs text-cyan-300 space-y-2">
            <Clock className="w-6 h-6 mx-auto text-cyan-400" />
            <p className="font-bold">Rute ke Node {selectedNode} Sudah Dijadwalkan!</p>
            <p className="text-[11px] text-cyan-400/80">
              Posisi Antrean: #{activeReq.queue_position || 1} (Status: {activeReq.status})
            </p>
            {activeReq.status === 'queued' && (
              <button
                onClick={() => cancelRequest(activeReq.request_id)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Batalkan Panggilan</span>
              </button>
            )}
          </div>
        ) : (
          /* Large Call Button */
          <button
            onClick={handleCall}
            disabled={calling || telemetry.trash >= 95 || telemetry.maintenance}
            className={`w-full py-4 rounded-2xl font-black text-lg tracking-wide uppercase shadow-2xl transition-all ${
              calling
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : telemetry.trash >= 95 || telemetry.maintenance
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-cyan-400 hover:brightness-110 active:scale-95 text-dark-950 shadow-cyan-500/30'
            }`}
          >
            {calling ? (
              <span className="flex items-center justify-center space-x-2">
                <Clock className="w-5 h-5 animate-spin" />
                <span>Menghubungi...</span>
              </span>
            ) : (
              `PANGGIL ROBOT KE SINI`
            )}
          </button>
        )}

        {/* Rejection / Warning messages */}
        {telemetry.trash >= 95 && (
          <div className="flex items-center space-x-2 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 p-3 rounded-xl text-left">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>Tempat sampah robot penuh (≥95%). Robot sedang menunggu pengosongan di Home A.</span>
          </div>
        )}

        {telemetry.maintenance && (
          <div className="flex items-center space-x-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl text-left">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>Sistem sedang dalam mode pemeliharaan admin. Panggilan ditunda sementara.</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center space-x-2 text-xs text-rose-300 bg-rose-950/50 border border-rose-800 p-3 rounded-xl text-left">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {lastResponse && (
          <div className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800 p-3 rounded-xl text-left space-y-1">
            <p className="font-bold flex items-center space-x-1.5 text-emerald-400">
              <CheckCircle className="w-4 h-4" />
              <span>Panggilan Diterima Server!</span>
            </p>
            <p className="text-[11px] text-gray-300">
              ID: {lastResponse.request_id || '-'} | Status: {lastResponse.status}
              {lastResponse.queue_position && ` | Antrean ke: #${lastResponse.queue_position}`}
            </p>
          </div>
        )}
      </div>

      {/* Fleet Telemetry Info Card */}
      <div className="bg-dark-900 border border-dark-700 p-4 rounded-2xl shadow-xl space-y-3">
        <h4 className="font-bold text-xs uppercase tracking-wider text-gray-400 border-b border-dark-800 pb-2">
          Status Armada Terkini
        </h4>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center space-x-2 text-gray-300">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span>Status: <strong className="text-white uppercase">{telemetry.status}</strong></span>
          </div>
          <div className="flex items-center space-x-2 text-gray-300">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <span>Posisi: <strong className="text-white">Node {telemetry.pos.current}</strong></span>
          </div>
          <div className="flex items-center space-x-2 text-gray-300">
            <Battery className="w-4 h-4 text-emerald-400" />
            <span>Baterai: <strong className="text-white">{telemetry.battery}%</strong></span>
          </div>
          <div className="flex items-center space-x-2 text-gray-300">
            <Trash2 className="w-4 h-4 text-amber-400" />
            <span>Kapasitas: <strong className="text-white">{telemetry.trash}%</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};

