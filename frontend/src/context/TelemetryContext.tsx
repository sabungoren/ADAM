import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { TelemetryState, GraphData, CallResult } from '../types';

interface TelemetryContextType {
  telemetry: TelemetryState;
  graph: GraphData | null;
  callResult: CallResult | null;
  lastError: { req_id: number; code: string } | null;
  refreshGraph: () => Promise<void>;
  refreshTelemetry: () => Promise<void>;
  callNode: (node: string, clientId?: string) => Promise<{ success: boolean; data?: any; error?: string; status?: number }>;
  cancelRequest: (requestId: number) => Promise<{ success: boolean; error?: string }>;
  clearCallResult: () => void;
}

const initialTelemetry: TelemetryState = {
  pos: { current: 'A', next: '' },
  status: 'IDLE',
  fresh: false,
  battery: 100,
  trash: 0,
  online: false,
  maintenance: false,
  auto_simulate: false,
  graph: { gateway_version: 0, robot_version: 0, ready: false },
  queue: [],
};

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [telemetry, setTelemetry] = useState<TelemetryState>(initialTelemetry);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [callResult, setCallResult] = useState<CallResult | null>(null);
  const [lastError, setLastError] = useState<{ req_id: number; code: string } | null>(null);

  // Fetch active graph
  const refreshGraph = useCallback(async () => {
    try {
      const res = await fetch('/api/graph');
      if (res.ok) {
        const data = await res.json();
        setGraph(data);
      } else if (res.status === 404) {
        setGraph(null);
      }
    } catch (err) {
      console.error('[TelemetryContext] Gagal memuat graf:', err);
    }
  }, []);

  // Fetch active telemetry snapshot via HTTP GET
  const refreshTelemetry = useCallback(async () => {
    try {
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data: TelemetryState = await res.json();
        setTelemetry(prev => ({
          ...prev,
          ...data,
          // Preserve queue if data.queue is null or undefined
          queue: data.queue || []
        }));
      }
    } catch (err) {
      console.warn('[TelemetryContext] Gagal memuat telemetri via HTTP:', err);
    }
  }, []);

  useEffect(() => {
    refreshGraph();
    refreshTelemetry();

    // Background sync polling fallback (setiap 1.5 detik)
    const pollTimer = setInterval(() => {
      refreshTelemetry();
    }, 1500);

    return () => clearInterval(pollTimer);
  }, [refreshGraph, refreshTelemetry]);

  // Connect SSE
  useEffect(() => {
    const sseUrl = '/events';
    const eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      // Segera sinkronisasi telemetri begitu koneksi SSE terbuka
      refreshTelemetry();
    };

    eventSource.onerror = (err) => {
      console.warn('[TelemetryContext] SSE terputus atau buffered. Polling HTTP tetap aktif.', err);
    };

    eventSource.addEventListener('snapshot', (e: MessageEvent) => {
      try {
        const data: TelemetryState = JSON.parse(e.data);
        setTelemetry(data);
      } catch (err) {
        console.error('Error parse snapshot:', err);
      }
    });

    eventSource.addEventListener('pos_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({
          ...prev,
          pos: { current: data.current || prev.pos.current, next: data.next || '' }
        }));
      } catch (err) {}
    });

    eventSource.addEventListener('status_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({ ...prev, status: data }));
      } catch (err) {}
    });

    eventSource.addEventListener('online_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({ ...prev, online: Boolean(data) }));
      } catch (err) {}
    });

    eventSource.addEventListener('fresh_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({ ...prev, fresh: Boolean(data) }));
      } catch (err) {}
    });

    eventSource.addEventListener('battery_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({ ...prev, battery: Number(data) }));
      } catch (err) {}
    });

    eventSource.addEventListener('trash_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({ ...prev, trash: Number(data) }));
      } catch (err) {}
    });

    eventSource.addEventListener('maintenance_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({ ...prev, maintenance: Boolean(data) }));
      } catch (err) {}
    });

    eventSource.addEventListener('auto_simulate_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({ ...prev, auto_simulate: Boolean(data) }));
      } catch (err) {}
    });

    eventSource.addEventListener('graph_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({
          ...prev,
          graph: {
            ...prev.graph,
            ...data
          }
        }));
        // Reload graph data when gateway version changes
        refreshGraph();
      } catch (err) {}
    });

    eventSource.addEventListener('queue_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => ({ ...prev, queue: data || [] }));
      } catch (err) {}
    });

    eventSource.addEventListener('call_result', (e: MessageEvent) => {
      try {
        const data: CallResult = JSON.parse(e.data);
        setCallResult(data);
      } catch (err) {}
    });

    eventSource.addEventListener('error_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setLastError(data);
      } catch (err) {}
    });

    return () => {
      eventSource.close();
    };
  }, [refreshGraph]);

  // Call Node function
  const callNode = async (node: string, clientId?: string) => {
    try {
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node, client_id: clientId || 'web-client' }),
      });
      const data = await res.json();
      if (res.ok) {
        // Optimistic queue update jika data memiliki info antrean
        if (data.request_id && data.status === 'queued') {
          setTelemetry(prev => {
            const alreadyExists = prev.queue.some(q => q.request_id === data.request_id);
            if (alreadyExists) return prev;
            return {
              ...prev,
              queue: [
                ...prev.queue,
                {
                  request_id: data.request_id,
                  node: data.node || node,
                  status: 'queued',
                  client_id: clientId || 'web-client',
                  queue_position: data.queue_position || (prev.queue.length + 1),
                  req_id: 0,
                  created_at: new Date().toISOString(),
                }
              ]
            };
          });
        }
        // Segera refresh telemetri via HTTP untuk sinkronisasi penuh
        refreshTelemetry();
        return { success: true, data, status: res.status };
      } else {
        return { success: false, error: data.message || data.error || 'Gagal memanggil robot', status: res.status };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Koneksi jaringan gagal' };
    }
  };

  // Cancel Request function
  const cancelRequest = async (requestId: number) => {
    try {
      // Optimistic remove
      setTelemetry(prev => ({
        ...prev,
        queue: prev.queue.filter(q => q.request_id !== requestId)
      }));

      const res = await fetch(`/api/request/${requestId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        refreshTelemetry();
        return { success: true };
      } else {
        refreshTelemetry();
        return { success: false, error: data.message || 'Gagal membatalkan panggilan' };
      }
    } catch (err: any) {
      refreshTelemetry();
      return { success: false, error: err.message || 'Koneksi jaringan gagal' };
    }
  };

  const clearCallResult = () => setCallResult(null);

  return (
    <TelemetryContext.Provider
      value={{
        telemetry,
        graph,
        callResult,
        lastError,
        refreshGraph,
        refreshTelemetry,
        callNode,
        cancelRequest,
        clearCallResult,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry harus digunakan di dalam TelemetryProvider');
  }
  return context;
};

