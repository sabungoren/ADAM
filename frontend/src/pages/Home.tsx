import React, { useState, useRef } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { FleetRobotMarker } from '../components/FleetRobotMarker';
import { 
  Navigation, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  PenTool, 
  Compass, 
  Trash2, 
  Activity, 
  ZoomIn, 
  ZoomOut, 
  Maximize,
  X
} from 'lucide-react';

interface HomeProps {
  onGoToEditor: () => void;
}

export const Home: React.FC<HomeProps> = ({ onGoToEditor }) => {
  const { telemetry, graph, callNode, cancelRequest } = useTelemetry();

  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const positions = graph?.positions || {};

  const [selectedNode, setSelectedNode] = useState<string>('A');
  const [calling, setCalling] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  // Pan and Zoom for Home Map (Drag / Touch Swipeable on Mobile)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 30 });
  const [zoom, setZoom] = useState<number>(0.9);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [startDrag, setStartDrag] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Fallback layout if node has no saved position
  const getNodePos = (nodeId: string) => {
    if (positions[nodeId]) {
      return positions[nodeId];
    }
    const idx = nodes.indexOf(nodeId);
    const col = idx % 6;
    const row = Math.floor(idx / 6);
    return { x: 100 + col * 150, y: 100 + row * 140 };
  };

  // Pointer / Touch Handlers for Dragging the Map
  const handlePointerDown = (e: React.PointerEvent) => {
    // If user clicked directly on a node button, don't start drag
    if ((e.target as HTMLElement).closest('.node-btn')) return;

    setIsDraggingMap(true);
    setStartDrag({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingMap) return;
    setPan({
      x: e.clientX - startDrag.x,
      y: e.clientY - startDrag.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingMap) {
      setIsDraggingMap(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(2.0, Math.max(0.4, Number((prev + delta).toFixed(2)))));
  };

  const handleResetMap = () => {
    setPan({ x: 30, y: 30 });
    setZoom(0.9);
  };

  // 1-Click Call Armada to Selected Node
  const handleCall = async (targetNode: string) => {
    setSelectedNode(targetNode);
    setCalling(true);
    setFeedback(null);

    const res = await callNode(targetNode, `user-${targetNode}`);
    setCalling(false);

    if (res.success) {
      if (res.data?.status === 'already_here') {
        setFeedback({
          type: 'info',
          message: `Tempat sampah sudah berada di Node ${targetNode}! Silakan buang sampah Anda langsung ke wadah.`,
        });
      } else if (res.data?.status === 'already_queued') {
        setFeedback({
          type: 'info',
          message: `Node ${targetNode} sudah ada di dalam antrean pemanggilan (Nomor Antrean: #${res.data?.queue_position}).`,
        });
      } else if (res.data?.status === 'in_progress') {
        setFeedback({
          type: 'info',
          message: `Tempat sampah saat ini sedang meluncur / melayani lokasi Node ${targetNode}.`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `Panggilan berhasil dikirim! Armada dijadwalkan menuju Node ${targetNode} (Antrean #${res.data?.queue_position}).`,
        });
      }
    } else {
      setFeedback({
        type: 'error',
        message: res.error || `Gagal memanggil tempat sampah ke Node ${targetNode}.`,
      });
    }
  };

  const currentCoords = getNodePos(telemetry.pos.current);
  const nextCoords = telemetry.pos.next ? getNodePos(telemetry.pos.next) : null;

  // Check state for selectedNode
  const isRobotHere = telemetry.pos.current === selectedNode && !telemetry.pos.next && telemetry.status === 'IDLE';
  const isRobotHeadingHere = telemetry.pos.next === selectedNode;
  const activeReqForSelected = telemetry.queue.find(q => q.node === selectedNode);

  // Human-readable status label
  const getStatusLabel = () => {
    switch (telemetry.status) {
      case 'IDLE':
        return 'IDLE (Siap Melayani)';
      case 'MOVING':
        return 'MOVING (Sedang Bergerak)';
      case 'DWELL':
        return 'DWELL (Membuka Tutup Sampah)';
      case 'ERROR':
        return 'ERROR (Kendala / Butuh Reset)';
      default:
        return telemetry.status;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Top Section: Ringkasan Status & Kapasitas Sampah */}
      <div className="bg-dark-900 border border-dark-800 p-4 rounded-2xl shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-dark-800 pb-3">
          <div className="space-y-0.5">
            <h1 className="text-base sm:text-lg font-black text-white tracking-wide break-words">
              Pusat Kendali & Panggilan Tempat Sampah A.D.A.M
            </h1>
            <p className="text-xs text-gray-400 break-words">
              Panggil tempat sampah otomatis ke lokasi Anda. Sistem menggunakan antrean FIFO.
            </p>
          </div>
          <button
            onClick={onGoToEditor}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-dark-950 text-cyan-400 border border-dark-700 hover:bg-dark-800 flex items-center space-x-1.5 transition"
          >
            <PenTool className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Desain Peta</span>
          </button>
        </div>

        {/* Status Indicators Cards (1 Komponen Per Baris pada Mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Card 1: Kapasitas Sampah (Ditaruh di kanan atas sesuai instruksi) */}
          <div className="bg-dark-950 border border-dark-800 p-3 rounded-xl flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
              telemetry.trash >= 95 
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                : 'bg-dark-900 text-gray-300 border-dark-700'
            }`}>
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Kapasitas Sampah
              </span>
              <div className="flex items-baseline space-x-1.5">
                <span className={`text-base font-black ${telemetry.trash >= 95 ? 'text-rose-400' : 'text-white'}`}>
                  {telemetry.trash}%
                </span>
                <span className="text-[11px] text-gray-400">
                  {telemetry.trash >= 95 ? '(Wadah Penuh)' : '(Tersedia)'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Status Operasional Robot (IDLE / MOVING / DWELL / ERROR) */}
          <div className="bg-dark-950 border border-dark-800 p-3 rounded-xl flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
              telemetry.status === 'ERROR'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                : telemetry.status === 'MOVING'
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`}>
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Status Operasional
              </span>
              <span className="text-xs font-bold text-white block truncate">
                {getStatusLabel()}
              </span>
            </div>
          </div>

          {/* Card 3: Posisi Armada Terkini */}
          <div className="bg-dark-950 border border-dark-800 p-3 rounded-xl flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              <Navigation className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Lokasi Armada
              </span>
              <span className="text-xs font-bold text-white block">
                {telemetry.pos.next ? `Bergerak ke Node ${telemetry.pos.next}` : `Di Node ${telemetry.pos.current}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Map Section (Left) & Call / Queue Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 Cols): Touch-Draggable Orthogonal Map Canvas */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-dark-900 border border-dark-800 p-3.5 sm:p-4 rounded-2xl shadow-xl space-y-3">
            {/* Header Canvas dengan Kontrol Geser & Zoom */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-dark-800 pb-2.5">
              <div>
                <h2 className="text-xs sm:text-sm font-extrabold text-white">Denah Peta Lintasan Armada</h2>
                <p className="text-[11px] text-gray-400">Sentuh / usap layar untuk menggeser peta. Klik node untuk memanggil.</p>
              </div>

              {/* Tombol Kontrol Peta */}
              <div className="flex items-center space-x-1.5 self-start sm:self-auto">
                <button
                  onClick={() => handleZoom(0.15)}
                  className="p-1.5 rounded-lg bg-dark-950 text-gray-300 hover:text-white border border-dark-800 transition"
                  title="Perbesar Peta"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleZoom(-0.15)}
                  className="p-1.5 rounded-lg bg-dark-950 text-gray-300 hover:text-white border border-dark-800 transition"
                  title="Perkecil Peta"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={handleResetMap}
                  className="p-1.5 rounded-lg bg-dark-950 text-gray-300 hover:text-white border border-dark-800 transition"
                  title="Pusatkan Peta"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Draggable Map Canvas Area */}
            <div
              ref={mapContainerRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="canvas-grid relative w-full h-[380px] sm:h-[500px] rounded-xl border border-dark-800 overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
            >
              {/* World Transform Layer (Geser & Zoom Bebas) */}
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
                className="absolute inset-0 pointer-events-auto"
              >
                {/* Compass Rose at Top Right (Matching Image 2) */}
                <div className="absolute top-4 left-[960px] pointer-events-none opacity-40 select-none flex flex-col items-center">
                  <Compass className="w-16 h-16 text-cyan-500" />
                  <span className="text-[9px] font-extrabold tracking-widest text-cyan-400 mt-0.5">UTARA (N)</span>
                </div>

                {/* SVG Lines Layer (Strictly Horizontal and Vertical Only) */}
                <svg className="absolute inset-0 w-[4000px] h-[4000px] pointer-events-none">
                  {edges.map((edge, idx) => {
                    const p1 = getNodePos(edge.from);
                    const p2 = getNodePos(edge.to);
                    if (!p1 || !p2) return null;

                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;

                    return (
                      <g key={`edge-${idx}`}>
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke="#334155"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                        {/* Distance / Weight Badge */}
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x="-16"
                            y="-9"
                            width="32"
                            height="18"
                            rx="4"
                            className="fill-dark-950 stroke-dark-700"
                          />
                          <text
                            x="0"
                            y="4"
                            textAnchor="middle"
                            className="fill-gray-300 text-[10px] font-mono font-bold"
                          >
                            {edge.weight}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>

                {/* Animated Moving Armada Marker */}
                <FleetRobotMarker
                  currentPos={currentCoords}
                  nextPos={nextCoords}
                  status={telemetry.status}
                  currentNode={telemetry.pos.current}
                  nextNode={telemetry.pos.next}
                />

                {/* Circular Nodes Matching Image 2 */}
                {nodes.map(nodeId => {
                  const pos = getNodePos(nodeId);
                  const isHome = nodeId === 'A';
                  const isSelected = selectedNode === nodeId;
                  const isRobotAtNode = telemetry.pos.current === nodeId && !telemetry.pos.next;
                  const isTargetNode = telemetry.pos.next === nodeId;

                  return (
                    <button
                      key={nodeId}
                      style={{
                        transform: `translate(${pos.x - 24}px, ${pos.y - 24}px)`,
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedNode(nodeId);
                        handleCall(nodeId);
                      }}
                      className={`node-btn absolute w-12 h-12 rounded-full flex items-center justify-center font-black text-sm cursor-pointer transition-transform hover:scale-110 active:scale-95 shadow-md ${
                        isRobotAtNode
                          ? 'bg-dark-900 border-[3px] border-cyan-400 ring-4 ring-cyan-500/25 text-cyan-300'
                          : isTargetNode
                          ? 'bg-amber-950 border-[3px] border-amber-400 text-amber-200 animate-pulse'
                          : isSelected
                          ? 'bg-dark-900 border-[3px] border-cyan-400 text-white'
                          : isHome
                          ? 'bg-dark-900 border-[3px] border-cyan-400 ring-2 ring-cyan-500/40 text-white'
                          : 'bg-dark-900 border-2 border-slate-600 hover:border-cyan-400 text-gray-100'
                      }`}
                      title={`Klik untuk memanggil armada ke Node ${nodeId}`}
                    >
                      {nodeId}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 Cols): Call Controls & Antrean FIFO */}
        <div className="lg:col-span-5 space-y-4">
          {/* Box 1: Panggil Tempat Sampah */}
          <div className="bg-dark-900 border border-dark-800 p-4 sm:p-5 rounded-2xl shadow-xl space-y-3.5">
            <h2 className="text-xs sm:text-sm font-extrabold text-white border-b border-dark-800 pb-2.5 flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>Panggil Tempat Sampah ke Lokasi Anda</span>
            </h2>

            {/* Grid Tombol Pilihan Node */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">
                Pilih Titik Lokasi Panggilan:
              </label>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto pr-1">
                {nodes.map(n => (
                  <button
                    key={n}
                    onClick={() => {
                      setSelectedNode(n);
                      setFeedback(null);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      selectedNode === n
                        ? 'bg-cyan-500 text-dark-950 border-cyan-400 shadow-sm'
                        : 'bg-dark-950 text-gray-300 border-dark-800 hover:border-dark-700'
                    }`}
                  >
                    Node {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Big Action Button or Status Info */}
            <div className="pt-1">
              {isRobotHere ? (
                <div className="bg-emerald-950/60 border border-emerald-800 p-3.5 rounded-xl text-xs text-emerald-300 space-y-1 text-center">
                  <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-400" />
                  <p className="font-bold">Tempat sampah sudah berada di Node {selectedNode}!</p>
                  <p className="text-[11px] text-emerald-400/80">Silakan buang sampah Anda ke wadah.</p>
                </div>
              ) : isRobotHeadingHere ? (
                <div className="bg-cyan-950/60 border border-cyan-800 p-3.5 rounded-xl text-xs text-cyan-300 space-y-1 text-center">
                  <Navigation className="w-5 h-5 mx-auto text-cyan-400 animate-pulse" />
                  <p className="font-bold">Tempat sampah sedang meluncur ke Node {selectedNode}!</p>
                  <p className="text-[11px] text-cyan-400/80">Harap menunggu beberapa saat.</p>
                </div>
              ) : activeReqForSelected ? (
                <div className="bg-cyan-950/60 border border-cyan-800 p-3.5 rounded-xl text-xs text-cyan-300 space-y-2 text-center">
                  <Clock className="w-5 h-5 mx-auto text-cyan-400" />
                  <p className="font-bold">Rute ke Node {selectedNode} sudah dalam antrean!</p>
                  <p className="text-[11px] text-cyan-400/80">
                    Posisi antrean: #{activeReqForSelected.queue_position || 1}
                  </p>
                  {activeReqForSelected.status === 'queued' && (
                    <button
                      onClick={() => cancelRequest(activeReqForSelected.request_id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition"
                    >
                      Batalkan Panggilan
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleCall(selectedNode)}
                  disabled={calling || telemetry.trash >= 95 || telemetry.maintenance}
                  className={`w-full py-3.5 rounded-xl font-extrabold text-xs sm:text-sm tracking-wide transition shadow-lg ${
                    calling
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : telemetry.trash >= 95 || telemetry.maintenance
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-dark-950 shadow-cyan-500/20 active:scale-95'
                  }`}
                >
                  {calling ? 'Mengirim Panggilan...' : `PANGGIL TEMPAT SAMPAH KE NODE ${selectedNode}`}
                </button>
              )}
            </div>

            {/* Feedback Notification Banner */}
            {feedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  feedback.type === 'success'
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                    : feedback.type === 'error'
                    ? 'bg-rose-950/70 text-rose-300 border-rose-800'
                    : 'bg-cyan-950/70 text-cyan-300 border-cyan-800'
                }`}
              >
                <span className="break-words pr-2">{feedback.message}</span>
                <button onClick={() => setFeedback(null)} className="text-gray-400 hover:text-white flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Box 2: Daftar Antrean Real-Time FIFO (Akan Kosong saat Belum Ada Pemanggilan) */}
          <div className="bg-dark-900 border border-dark-800 p-4 sm:p-5 rounded-2xl shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-dark-800 pb-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-300">
                Daftar Antrean Saat Ini (FIFO)
              </h3>
              <span className="text-[11px] font-bold text-cyan-400 bg-dark-950 px-2 py-0.5 rounded border border-dark-800">
                {telemetry.queue.length} Menunggu
              </span>
            </div>

            {telemetry.queue.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-xs space-y-1">
                <p className="font-semibold text-gray-400">Belum ada antrean panggilan.</p>
                <p className="text-[11px] text-gray-600">Armada siap menerima panggilan ke node mana pun.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {telemetry.queue.map(req => {
                  const isServing = req.status === 'serving' || req.status === 'dispatched';
                  return (
                    <div
                      key={req.request_id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                        isServing
                          ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
                          : 'bg-dark-950 border-dark-800 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="font-bold">Node {req.node}</span>
                        {req.queue_position && (
                          <span className="text-[10px] font-mono text-cyan-400 bg-dark-900 px-1.5 py-0.5 rounded">
                            #{req.queue_position}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] uppercase font-bold text-gray-400">
                        {req.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
