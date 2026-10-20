// ==========================================================================
// SUPABASE DATABASE CLIENT & SYNC SERVICE (TypeScript)
// Connecting to PostgreSQL on Supabase (oslhwkhztahfghefwkjk)
// ==========================================================================

import { createClient } from '@supabase/supabase-js';
import { RobotState, GraphData, LogItem, UserProfile, UserRole } from '../types';

// Read configuration strictly from environment variables (.env)
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://oslhwkhztahfghefwkjk.supabase.co';

const envKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

const SUPABASE_ANON_KEY =
  (!envKey.includes('placeholder') ? envKey : '') ||
  'sb_publishable_7dM51SRaq_RAx6oPkczpOg_cpfSVupp';
const ROBOT_ID = 'ADAM';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes('placeholder')
);

// Create client with persistent session enabled for Google OAuth & Email auth
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : (null as any);

// ==========================================================================
// REALTIME & QUERY DATABASE METHODS
// ==========================================================================

// Fetch current Robot Telemetry from Supabase
export async function fetchRobotTelemetryFromCloud(): Promise<Partial<RobotState> | null> {
  try {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('robot_telemetry')
      .select('*')
      .eq('id', ROBOT_ID)
      .single();

    if (error || !data) return null;
    return {
      currentNode: data.current_node,
      status: data.status,
      battery: data.battery_percent,
      trashLevel: data.trash_percent,
      obstacleDetected: data.obstacle_detected,
      lidOpen: data.lid_open,
      lastUpdated: new Date(data.updated_at).toLocaleTimeString(),
    };
  } catch {
    return null;
  }
}

// Sync Robot State to Supabase (supports full state or partial delta updates)
export async function syncRobotStateToCloud(state: Partial<RobotState>): Promise<boolean> {
  try {
    if (!isSupabaseConfigured || !supabase) return false;
    const payload: Record<string, any> = {
      id: ROBOT_ID,
      updated_at: new Date().toISOString(),
    };
    if (state.currentNode !== undefined) payload.current_node = state.currentNode;
    if (state.status !== undefined) payload.status = state.status;
    if (state.battery !== undefined) payload.battery_percent = state.battery;
    if (state.trashLevel !== undefined) payload.trash_percent = state.trashLevel;
    if (state.obstacleDetected !== undefined) payload.obstacle_detected = state.obstacleDetected;
    if (state.lidOpen !== undefined) payload.lid_open = state.lidOpen;

    const { error } = await supabase
      .from('robot_telemetry')
      .upsert(payload);
    return !error;
  } catch {
    return false;
  }
}

// Subscribe to live Realtime updates on Robot Telemetry
export function subscribeToRobotTelemetry(
  onUpdate: (state: Partial<RobotState>) => void
): { unsubscribe: () => void } | null {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const channel = supabase
      .channel('public:robot_telemetry')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'robot_telemetry', filter: `id=eq.${ROBOT_ID}` },
        (payload: any) => {
          if (payload.new) {
            onUpdate({
              currentNode: payload.new.current_node,
              status: payload.new.status,
              battery: payload.new.battery_percent,
              trashLevel: payload.new.trash_percent,
              obstacleDetected: payload.new.obstacle_detected,
              lidOpen: payload.new.lid_open,
              lastUpdated: new Date(payload.new.updated_at).toLocaleTimeString(),
            });
          }
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
    };
  } catch {
    return null;
  }
}

// Fetch Graph Configuration from Supabase
export async function fetchGraphFromCloud(): Promise<GraphData | null> {
  try {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('graph_config')
      .select('*')
      .eq('id', 'MAIN_MAP')
      .single();

    if (error || !data || !data.nodes) return null;
    return {
      nodes: data.nodes,
      edges: data.edges || [],
    };
  } catch {
    return null;
  }
}

// Sync Graph Configuration to Supabase
export async function syncGraphToCloud(graph: GraphData): Promise<boolean> {
  try {
    if (!isSupabaseConfigured || !supabase) return false;
    const { error } = await supabase
      .from('graph_config')
      .upsert({
        id: 'MAIN_MAP',
        nodes: graph.nodes,
        edges: graph.edges,
        updated_at: new Date().toISOString(),
      });
    return !error;
  } catch {
    return false;
  }
}

// Fetch historical System Logs from Supabase
export async function fetchLogsFromCloud(): Promise<LogItem[] | null> {
  try {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) return null;
    return data.map((row: any) => ({
      id: row.id,
      timestamp: new Date(row.created_at).toLocaleTimeString(),
      type: row.event_type,
      nodeId: row.node_id,
      details: row.details,
      trashPercent: row.trash_percent,
      severity:
        row.event_type === 'SAFETY_OBSTACLE'
          ? 'error'
          : row.event_type === 'VOLUME_SCAN'
          ? 'warning'
          : 'info',
    }));
  } catch {
    return null;
  }
}

// Log an event to Supabase
export async function logEventToCloud(
  log: Omit<LogItem, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
): Promise<boolean> {
  try {
    if (!isSupabaseConfigured || !supabase) return false;
    const { error } = await supabase
      .from('system_logs')
      .insert({
        event_type: log.type,
        node_id: log.nodeId || null,
        details: log.details,
        trash_percent: log.trashPercent || null,
        created_at: new Date().toISOString(),
      });
    return !error;
  } catch {
    return false;
  }
}

// Subscribe to Realtime System Logs
export function subscribeToLogs(
  onNewLog: (log: LogItem) => void
): { unsubscribe: () => void } | null {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const channel = supabase
      .channel('public:system_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_logs' },
        (payload: any) => {
          if (payload.new) {
            onNewLog({
              id: payload.new.id,
              timestamp: new Date(payload.new.created_at).toLocaleTimeString(),
              type: payload.new.event_type,
              nodeId: payload.new.node_id,
              details: payload.new.details,
              trashPercent: payload.new.trash_percent,
              severity:
                payload.new.event_type === 'SAFETY_OBSTACLE'
                  ? 'error'
                  : payload.new.event_type === 'VOLUME_SCAN'
                  ? 'warning'
                  : 'info',
            });
          }
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
    };
  } catch {
    return null;
  }
}

// ==========================================================================
// SUPABASE AUTHENTICATION SERVICES
// ==========================================================================

/**
 * Trigger Google OAuth sign-in flow.
 * Note: Redirects to Google, which then redirects to:
 * https://<project-ref>.supabase.co/auth/v1/callback
 */
export async function signInWithGoogleOAuth(): Promise<{ error: any }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      error: new Error(
        'Layanan masuk dengan Google saat ini sedang tidak dapat diakses. Silakan masuk menggunakan email dan kata sandi Anda.'
      ),
    };
  }
  const redirectTarget =
    (import.meta as any).env?.VITE_SUPABASE_REDIRECT_URL ||
    `${window.location.origin}/dashboard`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTarget,
    },
  });
  return { error };
}

/**
 * Sign in with Email and Password
 */
export async function signInWithEmailPassword(email: string, password: string): Promise<{ data: any; error: any }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Layanan autentikasi sedang tidak tersedia.') };
  }
  return await supabase.auth.signInWithPassword({ email, password });
}

/**
 * Sign up with Email and Password
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
  fullName: string,
  role: UserRole = 'user'
): Promise<{ data: any; error: any }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Layanan pendaftaran akun sedang tidak tersedia.') };
  }
  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role,
      },
    },
  });

  // If user created, store profile row in 'profiles' table if available
  if (result.data?.user) {
    try {
      await supabase.from('profiles').upsert({
        id: result.data.user.id,
        email: email,
        full_name: fullName,
        role: role,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Table may not yet be migrated
    }
  }

  return result;
}

/**
 * Sign out current active session
 */
export async function signOutSupabase(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
}

/**
 * Fetch profile data for a specific user ID
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      email: data.email,
      name: data.full_name || data.email.split('@')[0],
      avatarUrl: data.avatar_url,
      role: (data.role as UserRole) || 'user',
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}
