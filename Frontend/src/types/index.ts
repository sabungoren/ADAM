// ==========================================================================
// SMART ADAM - TypeScript Type Definitions
// ==========================================================================

export type RobotStatus = 'IDLE' | 'MOVING' | 'SERVING' | 'RETURNING' | 'OBSTACLE' | 'ERROR';

export type UserRole = 'admin' | 'user';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt?: string;
}

export type CardinalDirection = 0 | 1 | 2 | 3; // 0: North, 1: East, 2: South, 3: West

export interface NodeItem {
  id: string; // e.g. 'A', 'B', 'C', 'D'
  label: string; // e.g. 'Home Base', 'Station 1 (Meja Alpha)'
  x: number; // canvas x (percentage or px)
  y: number; // canvas y (percentage or px)
  isHome?: boolean;
  colorHex?: string; // visual accent color
}

export interface EdgeItem {
  from: string; // Node ID
  to: string; // Node ID
  weight: number; // 1 to 63
  direction: CardinalDirection; // 00 (North), 01 (East), 10 (South), 11 (West)
}

export interface GraphData {
  nodes: NodeItem[];
  edges: EdgeItem[];
}

export interface RobotState {
  currentNode: string;
  targetNode: string | null;
  status: RobotStatus;
  battery: number; // 0 - 100
  trashLevel: number; // 0 - 100
  trashDistanceCm: number;
  obstacleDetected: boolean;
  lidOpen: boolean;
  lastUpdated: string;
}

export interface CallRequest {
  id: string;
  nodeId: string;
  stationLabel: string;
  timestamp: string;
  status: 'PENDING' | 'SERVING' | 'COMPLETED' | 'CANCELLED';
}

export interface LogItem {
  id: string;
  timestamp: string;
  type: 'DISPATCH' | 'VOLUME_SCAN' | 'SAFETY_OBSTACLE' | 'RETURN';
  nodeId?: string;
  details: string;
  durationSec?: number;
  trashPercent?: number;
  severity?: 'info' | 'warning' | 'error' | 'success';
}

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
}

export interface ModalOptions {
  title?: string;
  message: string;
  type?: ToastType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}
