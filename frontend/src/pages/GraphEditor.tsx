import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { useAuth } from '../context/AuthContext';
import { GraphData, GraphEdge, Direction } from '../types';
import { 
  Check, 
  Trash2, 
  Plus, 
  ArrowUp, 
  ArrowRight, 
  ArrowDown, 
  ArrowLeft, 
  Wrench, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Compass,
  Lock
} from 'lucide-react';

interface DragConnectionState {
  fromNode: string;
  fromDirection: Direction;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface GraphEditorProps {
  onGoToAdmin?: () => void;
}

export const GraphEditor: React.FC<GraphEditorProps> = () => {
  const { graph: activeGraph, telemetry, refreshGraph } = useTelemetry();
  const { isAdmin, login } = useAuth();

  const [adminEmail, setAdminEmail] = useState('smartadam@smartadam.my.id');
  const [adminPassword, setAdminPassword] = useState('smartadam');
  const [authError, setAuthError] = useState<string | null>(null);

  // Local editable graph state
  const [nodes, setNodes] = useState<string[]>(['A']);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({
    A: { x: 120, y: 120 },
  });

  // If not admin, block access and present login gate!
  if (!isAdmin) {
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError(null);
      const res = await login(adminEmail, adminPassword);
      if (!res.success) {
        setAuthError(res.error || 'Autentikasi gagal');
      }
    };

    return (
      <div className="max-w-md mx-auto px-4 py-16 space-y-6 font-sans">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-white">Akses Terbatas: Administrator Only</h1>
          <p className="text-xs text-gray-400 leading-relaxed">
            Halaman Graph Editor berisi konfigurasi topologi peta dan koordinat fisik pergerakan armada Project A.D.A.M.
            Hanya administrator yang berhak mengedit topologi lintasan.
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-dark-900 border border-dark-700 p-6 rounded-2xl shadow-2xl space-y-4">
          {authError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{authError}</span>
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
            Masuk untuk Membuka Graph Editor
          </button>
        </form>
      </div>
    );
  }

  // Canvas Pan & Zoom (Draw.io infinite canvas feel)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 80, y: 40 });
  const [zoom, setZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState(false);
  const [startPanMouse, setStartPanMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Selection & Modal States
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [editingEdge, setEditingEdge] = useState<GraphEdge | null>(null);
  const [edgeWeightInput, setEdgeWeightInput] = useState<number>(10);

  // Dragging connection line state
  const [dragConnection, setDragConnection] = useState<DragConnectionState | null>(null);

  // Dragging node state
  const [draggingNode, setDraggingNode] = useState<{ id: string; startNodeX: number; startNodeY: number; startMouseX: number; startMouseY: number } | null>(null);

  // Status feedback
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load from backend active graph
  useEffect(() => {
    if (activeGraph && activeGraph.nodes && activeGraph.nodes.length > 0) {
      setNodes(activeGraph.nodes);
      setEdges(activeGraph.edges || []);

      // If backend saved positions exist, use them!
      if (activeGraph.positions && Object.keys(activeGraph.positions).length > 0) {
        setNodePositions(activeGraph.positions);
      } else {
        // Fallback default layout
        const pos: Record<string, { x: number; y: number }> = {};
        activeGraph.nodes.forEach((n, idx) => {
          const col = idx % 5;
          const row = Math.floor(idx / 5);
          pos[n] = { x: 100 + col * 160, y: 100 + row * 140 };
        });
        setNodePositions(pos);
      }
    }
  }, [activeGraph]);

  // Find next available uppercase letter A..Z
  const getNextAvailableLabel = (): string | null => {
    for (let c = 65; c <= 90; c++) {
      const char = String.fromCharCode(c);
      if (!nodes.includes(char)) {
        return char;
      }
    }
    return null;
  };

  const getOppositeDir = (dir: Direction): Direction => {
    switch (dir) {
      case 'N': return 'S';
      case 'S': return 'N';
      case 'E': return 'W';
      case 'W': return 'E';
    }
  };

  // 1. CLICK ARROW: Spawns new node strictly aligned horizontally or vertically!
  const handleArrowClick = (fromNode: string, dir: Direction, e: React.MouseEvent) => {
    e.stopPropagation();

    // Check if direction already taken
    const existing = edges.find(
      edge => (edge.from === fromNode && edge.direction === dir) ||
              (edge.to === fromNode && getOppositeDir(edge.direction) === dir)
    );
    if (existing) {
      setStatusMessage({
        type: 'error',
        text: `Node ${fromNode} sudah memiliki hubungan pada arah ${dir}`,
      });
      return;
    }

    const nextLabel = getNextAvailableLabel();
    if (!nextLabel) {
      setStatusMessage({ type: 'error', text: 'Batas maksimal 26 node (A-Z) telah tercapai' });
      return;
    }

    const fromPos = nodePositions[fromNode] || { x: 200, y: 200 };
    // Strict orthogonal offsets (Horizontal: deltaX = 160, deltaY = 0 | Vertical: deltaX = 0, deltaY = 140)
    let newX = fromPos.x;
    let newY = fromPos.y;

    switch (dir) {
      case 'N': newY -= 140; break;
      case 'S': newY += 140; break;
      case 'E': newX += 160; break;
      case 'W': newX -= 160; break;
    }

    setNodes(prev => [...prev, nextLabel].sort());
    setNodePositions(prev => ({
      ...prev,
      [nextLabel]: { x: newX, y: newY },
    }));

    // Add bidirectional edge
    const newEdge: GraphEdge = {
      from: fromNode,
      to: nextLabel,
      weight: 10,
      direction: dir,
    };
    setEdges(prev => [...prev, newEdge]);
    setSelectedNode(nextLabel);

    setStatusMessage({
      type: 'success',
      text: `Node '${nextLabel}' berhasil ditambahkan di arah ${dir} dari '${fromNode}'.`,
    });
  };

  // 2. DRAG ARROW: Drag connection line to existing node
  const handleArrowMouseDown = (fromNode: string, dir: Direction, e: React.MouseEvent) => {
    e.stopPropagation();
    const fromPos = nodePositions[fromNode] || { x: 200, y: 200 };

    setDragConnection({
      fromNode,
      fromDirection: dir,
      startX: fromPos.x,
      startY: fromPos.y,
      currentX: fromPos.x,
      currentY: fromPos.y,
    });
  };

  // Canvas Mouse Down: Start Pan or Deselect
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking canvas background directly
    if ((e.target as HTMLElement).closest('.node-box') || (e.target as HTMLElement).closest('.edge-line')) {
      return;
    }
    setIsPanning(true);
    setStartPanMouse({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  // Canvas Mouse Move (Pan, Node Drag, Connection Drag)
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - startPanMouse.x,
        y: e.clientY - startPanMouse.y,
      });
      return;
    }

    if (dragConnection && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = (e.clientX - rect.left - pan.x) / zoom;
      const rawY = (e.clientY - rect.top - pan.y) / zoom;

      // Lock drag line strictly horizontal or vertical based on starting arrow direction!
      let lockedX = rawX;
      let lockedY = rawY;
      if (dragConnection.fromDirection === 'N' || dragConnection.fromDirection === 'S') {
        lockedX = dragConnection.startX; // Pure vertical
      } else {
        lockedY = dragConnection.startY; // Pure horizontal
      }

      setDragConnection(prev => prev ? { ...prev, currentX: lockedX, currentY: lockedY } : null);
      return;
    }

    if (draggingNode) {
      const deltaX = (e.clientX - draggingNode.startMouseX) / zoom;
      const deltaY = (e.clientY - draggingNode.startMouseY) / zoom;

      // Snap to 20px grid
      const targetX = Math.round((draggingNode.startNodeX + deltaX) / 20) * 20;
      const targetY = Math.round((draggingNode.startNodeY + deltaY) / 20) * 20;

      setNodePositions(prev => ({
        ...prev,
        [draggingNode.id]: { x: targetX, y: targetY },
      }));
    }
  };

  // Canvas Mouse Up
  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (dragConnection && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;

      // Check which node the mouse was dropped onto
      for (const [nodeId, pos] of Object.entries(nodePositions)) {
        if (nodeId !== dragConnection.fromNode) {
          const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
          if (dist <= 40) {
            connectNodes(dragConnection.fromNode, nodeId, dragConnection.fromDirection);
            break;
          }
        }
      }
      setDragConnection(null);
    }

    if (draggingNode) {
      setDraggingNode(null);
    }
  };

  // Connect two nodes strictly orthogonal
  const connectNodes = (fromNode: string, toNode: string, dir: Direction) => {
    const pairExists = edges.some(
      e => (e.from === fromNode && e.to === toNode) || (e.from === toNode && e.to === fromNode)
    );
    if (pairExists) {
      setStatusMessage({ type: 'error', text: `Node ${fromNode} dan ${toNode} sudah terhubung` });
      return;
    }

    const fromHasDir = edges.some(
      e => (e.from === fromNode && e.direction === dir) ||
           (e.to === fromNode && getOppositeDir(e.direction) === dir)
    );
    if (fromHasDir) {
      setStatusMessage({ type: 'error', text: `Node ${fromNode} sudah memiliki edge di arah ${dir}` });
      return;
    }

    const oppDir = getOppositeDir(dir);
    const toHasOppDir = edges.some(
      e => (e.from === toNode && e.direction === oppDir) ||
           (e.to === toNode && getOppositeDir(e.direction) === oppDir)
    );
    if (toHasOppDir) {
      setStatusMessage({
        type: 'error',
        text: `Node ${toNode} sudah memiliki edge di arah ${oppDir} (koneksi terbalik)`,
      });
      return;
    }

    // Align target node coordinate to guarantee 100% straight horizontal or vertical line!
    const fromPos = nodePositions[fromNode];
    const toPos = nodePositions[toNode];
    if (fromPos && toPos) {
      if (dir === 'E' || dir === 'W') {
        // Must have same Y coordinate
        setNodePositions(prev => ({
          ...prev,
          [toNode]: { ...toPos, y: fromPos.y }
        }));
      } else {
        // Must have same X coordinate
        setNodePositions(prev => ({
          ...prev,
          [toNode]: { ...toPos, x: fromPos.x }
        }));
      }
    }

    const newEdge: GraphEdge = {
      from: fromNode,
      to: toNode,
      weight: 10,
      direction: dir,
    };
    setEdges(prev => [...prev, newEdge]);
    setStatusMessage({
      type: 'success',
      text: `Hubungan lurus berhasil dibuat: ${fromNode} <--> ${toNode} (${dir})`,
    });
  };

  // Zoom handlers
  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(2.5, Math.max(0.4, Number((prev + delta).toFixed(2)))));
  };

  const handleResetView = () => {
    setPan({ x: 80, y: 40 });
    setZoom(1);
  };

  // Delete Node
  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === 'A') {
      setStatusMessage({ type: 'error', text: "Node 'A' adalah Home Node wajib dan tidak boleh dihapus!" });
      return;
    }

    setNodes(prev => prev.filter(n => n !== nodeId));
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    setNodePositions(prev => {
      const copy = { ...prev };
      delete copy[nodeId];
      return copy;
    });

    if (selectedNode === nodeId) {
      setSelectedNode(null);
    }
    setStatusMessage({ type: 'success', text: `Node '${nodeId}' dan seluruh hubungannya telah dihapus.` });
  };

  // Delete Edge
  const handleDeleteEdge = (edge: GraphEdge) => {
    setEdges(prev => prev.filter(e => !(e.from === edge.from && e.to === edge.to)));
    setSelectedEdge(null);
    setEditingEdge(null);
    setStatusMessage({ type: 'success', text: `Garis hubungan antara ${edge.from} dan ${edge.to} telah dihapus.` });
  };

  // Save modified edge properties
  const handleSaveEdgeProperty = () => {
    if (!editingEdge) return;
    const w = Math.max(1, Math.min(edgeWeightInput, 63));
    setEdges(prev =>
      prev.map(e => (e.from === editingEdge.from && e.to === editingEdge.to ? { ...e, weight: w } : e))
    );
    setEditingEdge(null);
    setStatusMessage({ type: 'success', text: `Panjang bobot lintasan diubah menjadi ${w} meter` });
  };

  // Save Graph via POST /save (Checkmark button action)
  const handleSaveGraph = async () => {
    if (!nodes.includes('A')) {
      setStatusMessage({ type: 'error', text: "Node 'A' wajib ada sebagai Home Node" });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const payload: GraphData = {
        nodes: [...nodes].sort(),
        edges: edges,
        positions: nodePositions, // Persist exact positions to SQLite!
      };

      const res = await fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Graf berhasil disimpan sebagai Versi ${data.version}! Perubahan tersimpan permanen di database.`,
        });
        refreshGraph();
      } else {
        if (data.error === 'maintenance') {
          setStatusMessage({
            type: 'error',
            text: 'Prasyarat: Aktifkan mode maintenance terlebih dahulu sebelum menyimpan graf baru.',
          });
        } else {
          setStatusMessage({
            type: 'error',
            text: data.message || data.error || 'Gagal menyimpan graf ke database',
          });
        }
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Kesalahan jaringan: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-dark-950 select-none">
      {/* Floating Top Toolbar (Draw.io Style) */}
      <div className="absolute top-4 left-4 right-4 z-30 pointer-events-none flex flex-wrap items-center justify-between gap-3">
        {/* Left: Info Card */}
        <div className="pointer-events-auto bg-dark-900/90 backdrop-blur-md border border-dark-700 px-4 py-2 rounded-2xl shadow-xl flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-sm text-white">Graph Editor</span>
            <span className="text-[10px] font-bold bg-dark-800 text-cyan-400 border border-dark-700 px-2 py-0.5 rounded-full">
              {nodes.length} Node &bull; {edges.length} Lintasan
            </span>
          </div>
          <div className="hidden sm:block text-[11px] text-gray-400 border-l border-dark-700 pl-3">
            Garis hanya horizontal/vertikal. Belokan 90° harus melewati node.
          </div>
        </div>

        {/* Right: Actions (Centang Simpan, Maintenance, Zoom) */}
        <div className="pointer-events-auto flex items-center space-x-2">
          {/* Zoom & View Controls */}
          <div className="bg-dark-900/90 backdrop-blur-md border border-dark-700 p-1 rounded-2xl shadow-xl flex items-center space-x-1">
            <button
              onClick={() => handleZoom(0.15)}
              className="p-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-dark-800 transition"
              title="Perbesar Canvas"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleZoom(-0.15)}
              className="p-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-dark-800 transition"
              title="Perkecil Canvas"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetView}
              className="p-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-dark-800 transition"
              title="Pusatkan Tampilan"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>

          {/* Save Checkmark Button */}
          <button
            onClick={handleSaveGraph}
            disabled={isSaving}
            className={`flex items-center space-x-2 px-4 py-2 rounded-2xl text-xs font-bold transition shadow-xl ${
              isSaving
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-dark-950 shadow-emerald-500/25'
            }`}
            title="Klik centang untuk menyimpan graf ke server"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Graf'}</span>
          </button>
        </div>
      </div>

      {/* Floating Status Notification Banner */}
      {statusMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 max-w-md w-full px-4 pointer-events-auto">
          <div
            className={`p-3 rounded-2xl border text-xs font-semibold shadow-2xl flex items-center justify-between ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                : 'bg-rose-950/90 text-rose-300 border-rose-700'
            }`}
          >
            <div className="flex items-center space-x-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-gray-400 hover:text-white ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Infinite Canvas Container (Pan & Zoom) */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        className="canvas-grid w-full h-full cursor-grab active:cursor-grabbing overflow-hidden relative"
      >
        {/* World Transform Layer */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0 pointer-events-auto"
        >
          {/* Compass Rose on Top Right (Matching Image 2) */}
          <div className="absolute top-8 left-[980px] pointer-events-none opacity-40 select-none flex flex-col items-center">
            <Compass className="w-20 h-20 text-cyan-500" />
            <span className="text-[10px] font-black tracking-widest text-cyan-400 mt-1">UTARA</span>
          </div>

          {/* SVG Layer for Strictly Horizontal and Vertical Edges */}
          <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none">
            {edges.map((edge, idx) => {
              const p1 = nodePositions[edge.from];
              const p2 = nodePositions[edge.to];
              if (!p1 || !p2) return null;

              const isSelected =
                selectedEdge &&
                ((selectedEdge.from === edge.from && selectedEdge.to === edge.to) ||
                  (selectedEdge.from === edge.to && selectedEdge.to === edge.from));

              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;

              return (
                <g key={`edge-${idx}`} className="pointer-events-auto cursor-pointer">
                  {/* Invisible wide line for easy click */}
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="transparent"
                    strokeWidth="20"
                    onClick={() => {
                      setSelectedEdge(edge);
                      setEditingEdge(edge);
                      setEdgeWeightInput(edge.weight);
                    }}
                  />
                  {/* Strictly Horizontal/Vertical Line */}
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={isSelected ? '#38bdf8' : '#334155'}
                    strokeWidth={isSelected ? 5 : 3.5}
                    strokeLinecap="round"
                  />

                  {/* Weight Badge (Click to Edit) */}
                  <g
                    transform={`translate(${midX}, ${midY})`}
                    onClick={() => {
                      setSelectedEdge(edge);
                      setEditingEdge(edge);
                      setEdgeWeightInput(edge.weight);
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      x="-20"
                      y="-10"
                      width="40"
                      height="20"
                      rx="6"
                      className="fill-dark-900 stroke-dark-700 hover:stroke-cyan-400"
                      strokeWidth="1.5"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      className="fill-gray-200 text-[10px] font-bold font-mono"
                    >
                      {edge.weight}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Active Drag Connection Line (Orthogonal locked) */}
            {dragConnection && (
              <line
                x1={dragConnection.startX}
                y1={dragConnection.startY}
                x2={dragConnection.currentX}
                y2={dragConnection.currentY}
                stroke="#22d3ee"
                strokeWidth="3"
                strokeDasharray="6,4"
              />
            )}
          </svg>

          {/* Nodes Layer: Circular Clean Nodes matching Image 2 */}
          {nodes.map(nodeId => {
            const pos = nodePositions[nodeId] || { x: 100, y: 100 };
            const isSelected = selectedNode === nodeId;
            const isHome = nodeId === 'A';

            return (
              <div
                key={nodeId}
                style={{
                  transform: `translate(${pos.x - 30}px, ${pos.y - 30}px)`,
                }}
                onMouseDown={e => {
                  if ((e.target as HTMLElement).closest('.arrow-handle')) return;
                  e.stopPropagation();
                  setSelectedNode(nodeId);
                  setSelectedEdge(null);
                  setDraggingNode({
                    id: nodeId,
                    startNodeX: pos.x,
                    startNodeY: pos.y,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                  });
                }}
                onClick={e => {
                  e.stopPropagation();
                  setSelectedNode(nodeId);
                }}
                className={`node-box group absolute w-[60px] h-[60px] rounded-full flex items-center justify-center cursor-move transition-shadow ${
                  isHome
                    ? 'bg-dark-900 border-[3px] border-cyan-400 ring-4 ring-cyan-500/20 shadow-xl'
                    : isSelected
                    ? 'bg-dark-900 border-[3px] border-cyan-400 shadow-xl shadow-cyan-500/20'
                    : 'bg-dark-900 border-[2.5px] border-slate-600 hover:border-cyan-500 shadow-md'
                }`}
              >
                {/* Node Letter */}
                <span className="text-xl font-black text-white">{nodeId}</span>

                {/* 4 Directional Arrows (North, East, South, West) */}
                {/* UP / NORTH */}
                <div
                  className="arrow-handle absolute -top-3.5 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-cyan-600 hover:bg-cyan-400 text-dark-950 flex items-center justify-center cursor-pointer shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  title={`Klik: Buat node baru di Utara | Drag: Hubungkan ke Utara`}
                  onClick={e => handleArrowClick(nodeId, 'N', e)}
                  onMouseDown={e => handleArrowMouseDown(nodeId, 'N', e)}
                >
                  <ArrowUp className="w-3.5 h-3.5 stroke-[3]" />
                </div>

                {/* RIGHT / EAST */}
                <div
                  className="arrow-handle absolute -right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-cyan-600 hover:bg-cyan-400 text-dark-950 flex items-center justify-center cursor-pointer shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  title={`Klik: Buat node baru di Timur | Drag: Hubungkan ke Timur`}
                  onClick={e => handleArrowClick(nodeId, 'E', e)}
                  onMouseDown={e => handleArrowMouseDown(nodeId, 'E', e)}
                >
                  <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                </div>

                {/* BOTTOM / SOUTH */}
                <div
                  className="arrow-handle absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-cyan-600 hover:bg-cyan-400 text-dark-950 flex items-center justify-center cursor-pointer shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  title={`Klik: Buat node baru di Selatan | Drag: Hubungkan ke Selatan`}
                  onClick={e => handleArrowClick(nodeId, 'S', e)}
                  onMouseDown={e => handleArrowMouseDown(nodeId, 'S', e)}
                >
                  <ArrowDown className="w-3.5 h-3.5 stroke-[3]" />
                </div>

                {/* LEFT / WEST */}
                <div
                  className="arrow-handle absolute -left-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-cyan-600 hover:bg-cyan-400 text-dark-950 flex items-center justify-center cursor-pointer shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  title={`Klik: Buat node baru di Barat | Drag: Hubungkan ke Barat`}
                  onClick={e => handleArrowClick(nodeId, 'W', e)}
                  onMouseDown={e => handleArrowMouseDown(nodeId, 'W', e)}
                >
                  <ArrowLeft className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Inspector Card for Selected Node */}
      {selectedNode && (
        <div className="absolute bottom-6 left-6 z-30 bg-dark-900/95 backdrop-blur-md border border-dark-700 p-4 rounded-2xl shadow-2xl w-64 space-y-3">
          <div className="flex items-center justify-between border-b border-dark-800 pb-2">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-xs flex items-center justify-center">
                {selectedNode}
              </span>
              <h4 className="font-bold text-sm text-white">Node {selectedNode}</h4>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-gray-400 space-y-1">
            <p>
              Posisi: ({nodePositions[selectedNode]?.x || 0}, {nodePositions[selectedNode]?.y || 0})
            </p>
            {selectedNode === 'A' && (
              <span className="inline-block text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                Home Node Wajib
              </span>
            )}
          </div>

          {selectedNode !== 'A' && (
            <button
              onClick={() => handleDeleteNode(selectedNode)}
              className="w-full py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 flex items-center justify-center space-x-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Node {selectedNode}</span>
            </button>
          )}
        </div>
      )}

      {/* Floating Modal for Selected Edge (Edit Weight or Delete) */}
      {editingEdge && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-dark-800 pb-2.5">
              <h3 className="font-bold text-white text-sm">
                Lintasan Node {editingEdge.from} &harr; {editingEdge.to}
              </h3>
              <button onClick={() => setEditingEdge(null)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  Panjang / Bobot Garis (1 - 63 meter):
                </label>
                <input
                  type="number"
                  min="1"
                  max="63"
                  value={edgeWeightInput}
                  onChange={e => setEdgeWeightInput(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-dark-950 border border-dark-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono font-bold"
                />
              </div>

              <div className="text-[11px] text-gray-400 bg-dark-950 p-2.5 rounded-xl border border-dark-800 space-y-0.5">
                <p>Arah Maju: {editingEdge.from} &rarr; {editingEdge.to} ({editingEdge.direction})</p>
                <p>Arah Balik: {editingEdge.to} &rarr; {editingEdge.from} ({getOppositeDir(editingEdge.direction)})</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => handleDeleteEdge(editingEdge)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 transition flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Garis</span>
              </button>

              <div className="flex space-x-2">
                <button
                  onClick={() => setEditingEdge(null)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveEdgeProperty}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-dark-950 hover:bg-cyan-400 transition"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
