-- ==========================================================================
-- SMART ADAM (Autonomous Dustbin And Management) - Supabase PostgreSQL Schema
-- Database Host: db.oslhwkhztahfghefwkjk.supabase.co:5432
-- Project Ref: oslhwkhztahfghefwkjk
-- ==========================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================================================
-- 2. USER PROFILES TABLE (Linked with Supabase Auth & Google OAuth)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Row Level Security (RLS) for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone."
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own profile."
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Trigger to automatically populate public.profiles on new Auth signups (Google SSO & Email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', NULL),
        COALESCE(new.raw_user_meta_data->>'role', 'user')
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================================================
-- 3. ROBOT TELEMETRY TABLE (Real-time ADAM-01 Status)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.robot_telemetry (
    id TEXT PRIMARY KEY DEFAULT 'ADAM',
    current_node TEXT NOT NULL DEFAULT 'A',
    status TEXT NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'MOVING', 'SERVING', 'RETURNING', 'OBSTACLE', 'ERROR')),
    battery_percent INT NOT NULL DEFAULT 100 CHECK (battery_percent >= 0 AND battery_percent <= 100),
    trash_percent INT NOT NULL DEFAULT 0 CHECK (trash_percent >= 0 AND trash_percent <= 100),
    obstacle_detected BOOLEAN NOT NULL DEFAULT FALSE,
    lid_open BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.robot_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on robot_telemetry"
    ON public.robot_telemetry FOR SELECT
    USING (true);

CREATE POLICY "Allow authenticated upsert on robot_telemetry"
    ON public.robot_telemetry FOR ALL
    USING (true)
    WITH CHECK (true);

-- Insert initial robot state if empty
INSERT INTO public.robot_telemetry (id, current_node, status, battery_percent, trash_percent, obstacle_detected, lid_open)
VALUES ('ADAM', 'A', 'IDLE', 92, 35, false, false)
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- 4. GRAPH TOPOLOGY CONFIGURATION TABLE
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.graph_config (
    id TEXT PRIMARY KEY DEFAULT 'MAIN_MAP',
    nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    edges JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.graph_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on graph_config"
    ON public.graph_config FOR SELECT
    USING (true);

CREATE POLICY "Allow authenticated upsert on graph_config"
    ON public.graph_config FOR ALL
    USING (true)
    WITH CHECK (true);

-- ==========================================================================
-- 5. SYSTEM OPERATIONAL LOGS TABLE
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    node_id TEXT,
    details TEXT,
    trash_percent INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on system_logs"
    ON public.system_logs FOR SELECT
    USING (true);

CREATE POLICY "Allow insert on system_logs"
    ON public.system_logs FOR INSERT
    WITH CHECK (true);

-- ==========================================================================
-- 6. ENABLE SUPABASE REALTIME REPLICATION (For live telemetry streaming)
-- ==========================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.robot_telemetry;
EXCEPTION WHEN duplicate_object THEN
    -- Table already added to publication
END $$;
