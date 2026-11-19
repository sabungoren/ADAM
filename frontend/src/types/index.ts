export type Direction = 'N' | 'E' | 'S' | 'W';

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;      // 1..63
  direction: Direction; // N, E, S, W
}

export interface GraphData {
  version?: number;
  nodes: string[];
  edges: GraphEdge[];
  positions?: Record<string, { x: number; y: number }>;
}

export interface NodePosition {
  id: string;
  x: number;
  y: number;
}

export type RobotStatus = 'IDLE' | 'MOVING' | 'DWELL' | 'ERROR' | 'UNKNOWN';

export interface RobotPos {
  current: string;
  next: string;
}

export interface GraphMeta {
  gateway_version: number;
  robot_version: number;
  ready: boolean;
}

export interface RequestItem {
  request_id: number;
  node: string;
  client_id?: string;
  status: 'queued' | 'dispatched' | 'serving' | 'done' | 'failed' | 'cancelled';
  queue_position: number | null;
  req_id: number;
  created_at: string;
  dispatched_at?: string;
}

export interface TelemetryState {
  pos: RobotPos;
  status: RobotStatus;
  fresh: boolean;
  battery: number;
  trash: number;
  online: boolean;
  maintenance: boolean;
  auto_simulate?: boolean;
  graph: GraphMeta;
  queue: RequestItem[];
}

export interface CallResult {
  request_id: number;
  node: string;
  status: string;
  message: string;
}

export interface VersionMeta {
  version: number;
  node_count: number;
  edge_count: number;
  created_at: string;
}

export interface LogItem {
  id: number;
  ts: string;
  level: string;
  event: string;
  request_id?: number;
  req_id?: number;
  code?: string;
  message: string;
}

