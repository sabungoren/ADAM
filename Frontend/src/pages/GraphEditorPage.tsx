import React, { useState, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAlert } from '../context/AlertContext';
import { GraphData, NodeItem, EdgeItem, CardinalDirection } from '../types';
import {
  GRAPH_TEMPLATES,
  encodeGraphMatrix,
  generateCppHeader,
} from '../services/robotService';
import {
  Plus,
  Trash2,
  RefreshCw,
  Code,
  Download,
  Share2,
  FolderOpen,
  HelpCircle,
  Compass,
  Upload,
  Edit2,
  Save,
  Check,
  X,
  Sliders,
  Move,
  Cpu,
} from 'lucide-react';
import {
  triggerRefreshGraphToRobot,
  getFleetConfig,
} from '../services/fleetService';
import './GraphEditorPage.css';

interface GraphEditorPageProps {
  graph: GraphData;
  setGraph: React.Dispatch<React.SetStateAction<GraphData>>;
}

export const GraphEditorPage: React.FC<GraphEditorPageProps> = ({ graph, setGraph }) => {
  const { t } = useLanguage();
  const { showToast, showModal } = useAlert();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);

  // Form states for adding node
  const [newNodeId, setNewNodeId] = useState('');
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newNodeColor, setNewNodeColor] = useState('#3b82f6');
  const [newNodeX, setNewNodeX] = useState<number>(75);
  const [newNodeY, setNewNodeY] = useState<number>(65);

  // Form states for adding edge
  const [edgeFrom, setEdgeFrom] = useState(graph.nodes[0]?.id || 'A');
  const [edgeTo, setEdgeTo] = useState(graph.nodes[1]?.id || 'B');
  const [edgeWeight, setEdgeWeight] = useState(10);
  const [edgeDirection, setEdgeDirection] = useState<CardinalDirection>(1); // East default

  // Editing state for selected node
  const [editNodeLabel, setEditNodeLabel] = useState('');
  const [editNodeColor, setEditNodeColor] = useState('#3b82f6');
  const [editNodeX, setEditNodeX] = useState<number>(50);
  const [editNodeY, setEditNodeY] = useState<number>(50);

  // Interactive Drag & Drop Node State
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Editing state for selected edge
  const [editEdgeWeight, setEditEdgeWeight] = useState(10);
  const [editEdgeDirection, setEditEdgeDirection] = useState<CardinalDirection>(1);

  // Syncing state
  const [isSyncing, setIsSyncing] = useState(false);

  // C++ Header modal view
  const [showCppModal, setShowCppModal] = useState(false);
  const [cppCode, setCppCode] = useState('');

  // Matrix calculation
  const { matrix, hexString, byteCount } = encodeGraphMatrix(graph);

  // Select Node and populate edit form
  const handleSelectNode = (id: string) => {
    setSelectedNodeId(id);
    setSelectedEdgeIdx(null);
    const n = graph.nodes.find((item) => item.id === id);
    if (n) {
      setEditNodeLabel(n.label);
      setEditNodeColor(n.colorHex || '#3b82f6');
      setEditNodeX(n.x);
      setEditNodeY(n.y);
    }
  };

  // Update existing node
  const handleUpdateNode = () => {
    if (!selectedNodeId) return;
    const clampedX = Math.round(Math.max(8, Math.min(92, Number(editNodeX) || 50)));
    const clampedY = Math.round(Math.max(10, Math.min(80, Number(editNodeY) || 50)));

    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              label: editNodeLabel.trim() || n.label,
              colorHex: editNodeColor,
              x: clampedX,
              y: clampedY,
            }
          : n
      ),
    }));
    showToast(`Koordinat & properti Node ${selectedNodeId} (X: ${clampedX}%, Y: ${clampedY}%) berhasil disimpan!`, 'success');
  };

  // Drag and drop mouse & touch move handler on SVG Canvas
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    if (!draggingNodeId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    // Convert screen pixel position to SVG viewBox 100 x 88 percentage coordinates
    const rawX = ((clientX - rect.left) / rect.width) * 100;
    const rawY = ((clientY - rect.top) / rect.height) * 88;

    const clampedX = Math.round(Math.max(8, Math.min(92, rawX)));
    const clampedY = Math.round(Math.max(10, Math.min(80, rawY)));

    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === draggingNodeId ? { ...n, x: clampedX, y: clampedY } : n
      ),
    }));

    setEditNodeX(clampedX);
    setEditNodeY(clampedY);
  };

  const handleStopDragging = () => {
    if (draggingNodeId) {
      setDraggingNodeId(null);
    }
  };

  // Select Edge and populate edit form
  const handleSelectEdge = (idx: number) => {
    setSelectedEdgeIdx(idx);
    setSelectedNodeId(null);
    const e = graph.edges[idx];
    if (e) {
      setEditEdgeWeight(e.weight);
      setEditEdgeDirection(e.direction);
    }
  };

  // Update existing edge
  const handleUpdateEdge = () => {
    if (selectedEdgeIdx === null || !graph.edges[selectedEdgeIdx]) return;
    const currentEdge = graph.edges[selectedEdgeIdx];
    const weightClamped = Math.max(1, Math.min(63, Number(editEdgeWeight) || 1));
    const oppositeDir = ((editEdgeDirection + 2) % 4) as CardinalDirection;

    setGraph((prev) => ({
      ...prev,
      edges: prev.edges.map((e) => {
        if (e.from === currentEdge.from && e.to === currentEdge.to) {
          return { ...e, weight: weightClamped, direction: editEdgeDirection };
        }
        if (e.from === currentEdge.to && e.to === currentEdge.from) {
          return { ...e, weight: weightClamped, direction: oppositeDir };
        }
        return e;
      }),
    }));
    showToast(`Lintasan ${currentEdge.from} <-> ${currentEdge.to} berhasil diperbarui!`, 'success');
  };

  // Delete selected edge
  const handleDeleteEdge = () => {
    if (selectedEdgeIdx === null || !graph.edges[selectedEdgeIdx]) return;
    const currentEdge = graph.edges[selectedEdgeIdx];
    setGraph((prev) => ({
      ...prev,
      edges: prev.edges.filter(
        (e) =>
          !(
            (e.from === currentEdge.from && e.to === currentEdge.to) ||
            (e.from === currentEdge.to && e.to === currentEdge.from)
          )
      ),
    }));
    setSelectedEdgeIdx(null);
    showToast(`Lintasan ${currentEdge.from} <-> ${currentEdge.to} berhasil dihapus.`, 'info');
  };

  // Add new node
  const handleAddNode = () => {
    const id = newNodeId.trim().toUpperCase();
    if (!id) {
      showToast('Harap masukkan ID Node (misal: E)', 'warning');
      return;
    }
    if (graph.nodes.some((n) => n.id === id)) {
      showToast(`Node ${id} sudah ada dalam graf!`, 'error');
      return;
    }

    const clampedX = Math.round(Math.max(8, Math.min(92, Number(newNodeX) || 50)));
    const clampedY = Math.round(Math.max(10, Math.min(80, Number(newNodeY) || 50)));

    const newNode: NodeItem = {
      id,
      label: newNodeLabel.trim() || `Stasiun ${id}`,
      x: clampedX,
      y: clampedY,
      isHome: false,
      colorHex: newNodeColor,
    };

    setGraph((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));

    setNewNodeId('');
    setNewNodeLabel('');
    showToast(`Node ${id} berhasil ditambahkan pada koordinat (${clampedX}%, ${clampedY}%)!`, 'success');
  };

  // Add new edge (bidirectional)
  const handleAddEdge = () => {
    if (edgeFrom === edgeTo) {
      showToast('Node asal dan tujuan tidak boleh sama!', 'warning');
      return;
    }

    const weightClamped = Math.max(1, Math.min(63, Number(edgeWeight) || 1));
    const oppositeDir = ((edgeDirection + 2) % 4) as CardinalDirection;

    // Filter out any existing edge between these two
    const filtered = graph.edges.filter(
      (e) =>
        !(
          (e.from === edgeFrom && e.to === edgeTo) ||
          (e.from === edgeTo && e.to === edgeFrom)
        )
    );

    const newEdges: EdgeItem[] = [
      ...filtered,
      { from: edgeFrom, to: edgeTo, weight: weightClamped, direction: edgeDirection },
      { from: edgeTo, to: edgeFrom, weight: weightClamped, direction: oppositeDir },
    ];

    setGraph((prev) => ({
      ...prev,
      edges: newEdges,
    }));

    showToast(`Lintasan ${edgeFrom} <-> ${edgeTo} (Bobot: ${weightClamped}) berhasil ditambahkan!`, 'success');
  };

  // Delete selected node
  const handleDeleteNode = (id: string) => {
    if (id === 'A') {
      showToast('Node A adalah Home Base dan tidak boleh dihapus!', 'warning');
      return;
    }

    setGraph((prev) => ({
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.from !== id && e.to !== id),
    }));

    if (selectedNodeId === id) setSelectedNodeId(null);
    showToast(`Node ${id} dan lintasannya berhasil dihapus.`, 'info');
  };

  // Load Preset
  const handleLoadPreset = (templateKey: 'line' | 'tJunction' | 'grid') => {
    showModal({
      title: 'Terapkan Template Preset?',
      message: 'Menerapkan preset ini akan mengganti topologi graf saat ini dengan template standar.',
      type: 'warning',
      confirmText: 'Terapkan Preset',
      cancelText: 'Batal',
      onConfirm: () => {
        setGraph(GRAPH_TEMPLATES[templateKey]);
        showToast('Template graf berhasil dimuat!', 'success');
      },
    });
  };

  // Generate C++ Header
  const handleOpenCppExport = () => {
    const code = generateCppHeader(graph);
    setCppCode(code);
    setShowCppModal(true);
  };

  const copyCppToClipboard = () => {
    navigator.clipboard.writeText(cppCode);
    showToast(t('toastCppExported'), 'success');
  };

  // Export JSON
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(graph, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'adam_graph_config.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('File konfigurasi JSON berhasil diunduh!', 'success');
  };

  // Import / Upload JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.nodes || !Array.isArray(parsed.nodes) || !parsed.edges || !Array.isArray(parsed.edges)) {
          showToast('Format JSON tidak sesuai standar topologi graf ADAM.', 'error');
          return;
        }
        setGraph(parsed);
        showToast(`Topologi graf (${parsed.nodes.length} stasiun) berhasil diimpor!`, 'success');
      } catch {
        showToast('Gagal membaca file JSON. Pastikan format file valid.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Sync to Cloud / Robot via Fleet Service
  const handleSyncToRobot = async () => {
    setIsSyncing(true);
    try {
      const res = await triggerRefreshGraphToRobot(getFleetConfig());
      showToast(res.message, 'success', 'Sinkronisasi Graf Selesai');
    } catch {
      showToast('Gagal mengirim sinyal sinkronisasi ke armada.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const directionLabels = [
    t('dirNorth'),
    t('dirEast'),
    t('dirSouth'),
    t('dirWest'),
  ];

  return (
    <div className="graph-editor-page-container">
      {/* Page Header */}
      <div className="page-intro glass-panel">
        <div>
          <h1 className="page-heading">{t('editorTitle')}</h1>
          <p className="page-subheading">{t('editorDesc')}</p>
        </div>
        <div className="top-action-buttons">
          {/* Upload / Import JSON Button */}
          <label className="btn-secondary file-upload-label" id="btn-upload-json" title="Unggah file konfigurasi JSON graf">
            <Upload size={16} />
            <span>{t('uploadJsonBtn')}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportJson}
              style={{ display: 'none' }}
            />
          </label>

          <button className="btn-secondary" onClick={handleOpenCppExport} id="btn-export-cpp">
            <Code size={16} />
            <span>{t('exportCppBtn')}</span>
          </button>

          <button className="btn-secondary" onClick={handleExportJson} id="btn-export-json">
            <Download size={16} />
            <span>{t('exportJsonBtn')}</span>
          </button>

          <button
            className="btn-primary"
            onClick={handleSyncToRobot}
            disabled={isSyncing}
            id="btn-sync-graph"
            title="Kirim sinyal rute baru ke RAM ESP32 secara instan"
          >
            <Share2 size={16} className={isSyncing ? 'spin-animation' : ''} />
            <span>{isSyncing ? t('syncingBtn') : t('syncToRobotBtn')}</span>
          </button>
        </div>
      </div>

      <div className="editor-layout-grid">
        {/* Left Column: Interactive Visual Canvas */}
        <div className="editor-canvas-column">
          <div className="glass-panel canvas-panel">
            <div className="canvas-header-row">
              <span className="canvas-badge">Interactive 2D Topology Canvas</span>
              {/* Presets */}
              <div className="presets-pill-group">
                <span className="presets-label">{t('presetTemplates')}:</span>
                <button
                  className="preset-btn"
                  onClick={() => handleLoadPreset('line')}
                  title="Garis Lurus 3 Titik"
                >
                  {t('presetLine')}
                </button>
                <button
                  className="preset-btn"
                  onClick={() => handleLoadPreset('tJunction')}
                  title="Percabangan T"
                >
                  {t('presetTJunction')}
                </button>
                <button
                  className="preset-btn"
                  onClick={() => handleLoadPreset('grid')}
                  title="Grid Loop 4 Titik"
                >
                  {t('presetGrid')}
                </button>
              </div>
            </div>

            <div className="editor-svg-wrapper">
              <svg
                ref={svgRef}
                className={`editor-svg ${draggingNodeId ? 'is-dragging' : ''}`}
                viewBox="0 0 100 88"
                preserveAspectRatio="xMidYMid meet"
                onMouseMove={handleSvgMouseMove}
                onTouchMove={handleSvgMouseMove}
                onMouseUp={handleStopDragging}
                onTouchEnd={handleStopDragging}
                onMouseLeave={handleStopDragging}
              >
                {/* Grid guidelines */}
                <defs>
                  <pattern id="editorGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path
                      d="M 10 0 L 0 0 0 10"
                      fill="none"
                      stroke="var(--border-subtle)"
                      strokeWidth="0.3"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#editorGrid)" />

                {/* Edges */}
                {graph.edges.map((edge, idx) => {
                  const nodeFrom = graph.nodes.find((n) => n.id === edge.from);
                  const nodeTo = graph.nodes.find((n) => n.id === edge.to);
                  if (!nodeFrom || !nodeTo) return null;
                  if (edge.from > edge.to) return null; // render once

                  const midX = (nodeFrom.x + nodeTo.x) / 2;
                  const midY = (nodeFrom.y + nodeTo.y) / 2;
                  const isSelected = selectedEdgeIdx === idx;

                  return (
                    <g
                      key={`ed-${idx}`}
                      className={`editor-edge-group ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectEdge(idx)}
                    >
                      <line
                        x1={nodeFrom.x}
                        y1={nodeFrom.y}
                        x2={nodeTo.x}
                        y2={nodeTo.y}
                        className="editor-edge-line"
                      />
                      {/* Weight badge */}
                      <rect
                        x={midX - 5}
                        y={midY - 2.5}
                        width={10}
                        height={5}
                        rx={1.5}
                        className="editor-weight-box"
                      />
                      <text
                        x={midX}
                        y={midY + 1.2}
                        textAnchor="middle"
                        className="editor-weight-text"
                      >
                        w:{edge.weight}
                      </text>
                    </g>
                  );
                })}

                {/* Nodes with Drag & Drop */}
                {graph.nodes.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  const isDragging = draggingNodeId === node.id;

                  return (
                    <g
                      key={`nd-${node.id}`}
                      className={`editor-node-group ${isSelected ? 'selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleSelectNode(node.id);
                        setDraggingNodeId(node.id);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        handleSelectNode(node.id);
                        setDraggingNodeId(node.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectNode(node.id);
                      }}
                      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    >
                      {/* Outer pulse / halo ring when selected or dragging */}
                      {(isSelected || isDragging) && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={7.2}
                          fill="none"
                          stroke={node.colorHex || 'var(--accent-blue)'}
                          strokeWidth="0.8"
                          strokeDasharray="1.5 1.5"
                          opacity="0.9"
                        />
                      )}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={4.8}
                        className="editor-node-circle"
                        style={{
                          stroke: node.colorHex || 'var(--accent-blue)',
                          fill: node.isHome ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                        }}
                      />
                      <text
                        x={node.x}
                        y={node.y + 1.4}
                        textAnchor="middle"
                        className="editor-node-id"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {node.id}
                      </text>
                      <text
                        x={node.x}
                        y={node.y + 8}
                        textAnchor="middle"
                        className="editor-node-label"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* 1. Selected Node Inspector & Edit Panel */}
            {selectedNodeId && (
              <div className="selected-inspector glass-card">
                <div className="inspector-header-row">
                  <div className="inspector-info">
                    <span className="inspector-title">
                      Edit Node <strong>{selectedNodeId}</strong>
                    </span>
                    <span className="inspector-sub">
                      {graph.nodes.find((n) => n.id === selectedNodeId)?.isHome
                        ? 'Home Base (Stasiun Awal)'
                        : 'Stasiun Panggilan Normal'}
                    </span>
                  </div>
                  <button
                    className="btn-icon-subtle"
                    onClick={() => setSelectedNodeId(null)}
                    title="Tutup Inspector"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="inspector-edit-form">
                  <div className="inspector-field flex-2">
                    <label className="inspector-label">Nama / Label Stasiun:</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editNodeLabel}
                      onChange={(e) => setEditNodeLabel(e.target.value)}
                      placeholder="e.g. Meja VIP 1"
                    />
                  </div>

                  <div className="inspector-field">
                    <label className="inspector-label">{t('nodeAccentColor')}:</label>
                    <input
                      type="color"
                      className="form-color-picker"
                      value={editNodeColor}
                      onChange={(e) => setEditNodeColor(e.target.value)}
                    />
                  </div>

                  {/* Manual Coordinate Inputs: X & Y */}
                  <div className="inspector-field flex-1">
                    <label className="inspector-label">{t('coordXLabel')}:</label>
                    <input
                      type="number"
                      min={8}
                      max={92}
                      className="form-input"
                      value={editNodeX}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEditNodeX(val);
                        setGraph((prev) => ({
                          ...prev,
                          nodes: prev.nodes.map((n) =>
                            n.id === selectedNodeId ? { ...n, x: val } : n
                          ),
                        }));
                      }}
                      title="Geser posisi horizontal node (8 - 92%)"
                    />
                  </div>

                  <div className="inspector-field flex-1">
                    <label className="inspector-label">{t('coordYLabel')}:</label>
                    <input
                      type="number"
                      min={10}
                      max={80}
                      className="form-input"
                      value={editNodeY}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setEditNodeY(val);
                        setGraph((prev) => ({
                          ...prev,
                          nodes: prev.nodes.map((n) =>
                            n.id === selectedNodeId ? { ...n, y: val } : n
                          ),
                        }));
                      }}
                      title="Geser posisi vertikal node (10 - 80%)"
                    />
                  </div>

                  <div className="node-drag-hint-box full-width">
                    <span>{t('nodePositionTip')}</span>
                  </div>

                  <div className="inspector-actions">
                    <button
                      className="btn-primary btn-sm"
                      onClick={handleUpdateNode}
                      id="btn-save-node-edit"
                    >
                      <Save size={14} />
                      <span>{t('saveNodeBtn')}</span>
                    </button>

                    {selectedNodeId !== 'A' && (
                      <button
                        className="btn-delete btn-sm"
                        onClick={() => handleDeleteNode(selectedNodeId)}
                        id="btn-delete-node"
                      >
                        <Trash2 size={14} />
                        <span>{t('deleteBtn')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Selected Edge Inspector & Edit Panel */}
            {selectedEdgeIdx !== null && graph.edges[selectedEdgeIdx] && (
              <div className="selected-inspector glass-card edge-inspector">
                <div className="inspector-header-row">
                  <div className="inspector-info">
                    <span className="inspector-title">
                      {t('editEdgeTitle')}: <strong>{graph.edges[selectedEdgeIdx].from} &harr; {graph.edges[selectedEdgeIdx].to}</strong>
                    </span>
                    <span className="inspector-sub">
                      {t('bidirectionalDesc')}
                    </span>
                  </div>
                  <button
                    className="btn-icon-subtle"
                    onClick={() => setSelectedEdgeIdx(null)}
                    title="Tutup Inspector"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="inspector-edit-form">
                  <div className="inspector-field flex-1">
                    <label className="inspector-label">{t('edgeWeightLabel')}:</label>
                    <input
                      type="number"
                      min={1}
                      max={63}
                      className="form-input"
                      value={editEdgeWeight}
                      onChange={(e) => setEditEdgeWeight(Number(e.target.value))}
                    />
                  </div>

                  <div className="inspector-field flex-1">
                    <label className="inspector-label">{t('edgeDirLabel')} ({graph.edges[selectedEdgeIdx].from}):</label>
                    <select
                      className="form-select"
                      value={editEdgeDirection}
                      onChange={(e) => setEditEdgeDirection(Number(e.target.value) as CardinalDirection)}
                    >
                      <option value={0}>{t('dirNorth')}</option>
                      <option value={1}>{t('dirEast')}</option>
                      <option value={2}>{t('dirSouth')}</option>
                      <option value={3}>{t('dirWest')}</option>
                    </select>
                  </div>

                  <div className="inspector-actions">
                    <button
                      className="btn-primary btn-sm"
                      onClick={handleUpdateEdge}
                      id="btn-save-edge-edit"
                    >
                      <Save size={14} />
                      <span>{t('saveEdgeBtn')}</span>
                    </button>

                    <button
                      className="btn-delete btn-sm"
                      onClick={handleDeleteEdge}
                      id="btn-delete-edge"
                    >
                      <Trash2 size={14} />
                      <span>{t('deleteBtn')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Node/Edge Tool Forms & Matrix Preview */}
        <div className="editor-controls-column">
          {/* Form: Add Node */}
          <div className="glass-panel editor-card">
            <h3 className="card-section-title">
              <Plus size={18} />
              <span>{t('addNodeBtn')}</span>
            </h3>
            <div className="form-row">
              <div className="form-group flex-1">
                <label className="form-label">{t('nodeNameLabel')} (ID)</label>
                <input
                  type="text"
                  maxLength={2}
                  className="form-input"
                  placeholder="e.g. E"
                  value={newNodeId}
                  onChange={(e) => setNewNodeId(e.target.value)}
                />
              </div>
              <div className="form-group flex-2">
                <label className="form-label">{t('nodeLabelDesc')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Meja 4 (Delta)"
                  value={newNodeLabel}
                  onChange={(e) => setNewNodeLabel(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('nodeAccentColor')}</label>
                <input
                  type="color"
                  className="form-color-picker"
                  value={newNodeColor}
                  onChange={(e) => setNewNodeColor(e.target.value)}
                />
              </div>
            </div>

            {/* Custom Coordinates for new node */}
            <div className="form-row coordinates-row">
              <div className="form-group flex-1">
                <label className="form-label">{t('coordXLabel')} (8 - 92%)</label>
                <input
                  type="number"
                  min={8}
                  max={92}
                  className="form-input"
                  value={newNodeX}
                  onChange={(e) => setNewNodeX(Number(e.target.value))}
                  placeholder="e.g. 75"
                />
              </div>
              <div className="form-group flex-1">
                <label className="form-label">{t('coordYLabel')} (10 - 80%)</label>
                <input
                  type="number"
                  min={10}
                  max={80}
                  className="form-input"
                  value={newNodeY}
                  onChange={(e) => setNewNodeY(Number(e.target.value))}
                  placeholder="e.g. 65"
                />
              </div>
            </div>

            <button className="btn-primary full-width" onClick={handleAddNode}>
              {t('addNodeBtn')}
            </button>
          </div>

          {/* Form: Connect Edge */}
          <div className="glass-panel editor-card">
            <h3 className="card-section-title">
              <Compass size={18} />
              <span>{t('addEdgeBtn')}</span>
            </h3>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Dari Node (From)</label>
                <select
                  className="form-select"
                  value={edgeFrom}
                  onChange={(e) => setEdgeFrom(e.target.value)}
                >
                  {graph.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      Node {n.id} ({n.label})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Ke Node (To)</label>
                <select
                  className="form-select"
                  value={edgeTo}
                  onChange={(e) => setEdgeTo(e.target.value)}
                >
                  {graph.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      Node {n.id} ({n.label})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('edgeWeightLabel')}</label>
                <input
                  type="number"
                  min="1"
                  max="63"
                  className="form-input"
                  value={edgeWeight}
                  onChange={(e) => setEdgeWeight(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('edgeDirLabel')}</label>
                <select
                  className="form-select"
                  value={edgeDirection}
                  onChange={(e) => setEdgeDirection(Number(e.target.value) as CardinalDirection)}
                >
                  <option value={0}>{t('dirNorth')}</option>
                  <option value={1}>{t('dirEast')}</option>
                  <option value={2}>{t('dirSouth')}</option>
                  <option value={3}>{t('dirWest')}</option>
                </select>
              </div>
            </div>
            <button className="btn-primary full-width" onClick={handleAddEdge}>
              {t('addEdgeBtn')}
            </button>
          </div>

          {/* Adjacency Matrix Hex Viewer (Matching spec.md) */}
          <div className="glass-panel editor-card">
            <div className="matrix-header-block">
              <h3 className="card-section-title">{t('matrixViewerHeading')}</h3>
              <div className="matrix-meta-row">
                <span className="badge matrix-size-badge">
                  <Cpu size={13} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />
                  {byteCount} {t('bytesInRamLabel')}
                </span>
                <span className="matrix-meta-desc">
                  {t('matrixBitFormat')}
                </span>
              </div>
            </div>

            {/* Informative Dynamic Matrix Guide Callout */}
            <div className="matrix-info-callout">
              <p>{t('matrixDynamicNotice')}</p>
            </div>

            <div className="matrix-scroll-wrapper">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>{t('matrixColNode')}</th>
                    {graph.nodes.map((n) => (
                      <th key={n.id}>{n.id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {graph.nodes.map((rowNode, rIdx) => (
                    <tr key={rowNode.id}>
                      <td className="row-header">{rowNode.id}</td>
                      {graph.nodes.map((colNode, cIdx) => {
                        const val = matrix[rIdx]?.[cIdx] || 0;
                        const isNonZero = val > 0;
                        return (
                          <td
                            key={colNode.id}
                            className={`matrix-cell ${isNonZero ? 'connected' : 'zero'}`}
                          >
                            {isNonZero
                              ? '0x' + val.toString(16).toUpperCase().padStart(2, '0')
                              : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* C++ Code Export Modal */}
      {showCppModal && (
        <div className="modal-overlay" onClick={() => setShowCppModal(false)}>
          <div className="modal-dialog cpp-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header info">
              <Code size={24} />
              <h3 className="modal-title">{t('cppModalTitle')}</h3>
            </div>
            <div className="modal-body">
              <p className="modal-instruction">
                {t('cppModalDesc')}
              </p>
              <pre className="cpp-code-preview">
                <code>{cppCode}</code>
              </pre>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCppModal(false)}>
                {t('cppModalClose')}
              </button>
              <button className="btn-primary" onClick={copyCppToClipboard}>
                {t('cppModalCopy')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
