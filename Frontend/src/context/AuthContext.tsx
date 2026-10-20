import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';
import {
  supabase,
  isSupabaseConfigured,
  signInWithGoogleOAuth,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  signOutSupabase,
  fetchUserProfile,
} from '../services/supabase';

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  registerWithEmail: (
    name: string,
    email: string,
    pass: string,
    role?: UserRole
  ) => Promise<{ success: boolean; error?: string }>;
  quickLoginDemo: (role: UserRole) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'adam_auth_profile';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync Supabase Auth session on mount and listen to changes
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      if (!isSupabaseConfigured || !supabase) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          const profile = await resolveProfileFromSession(session.user);
          setUser(profile);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
        }
      } catch {
        // Fallback to existing localStorage if network error
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initSession();

    // Listen to auth events (SIGN_IN, SIGN_OUT, TOKEN_REFRESHED)
    if (isSupabaseConfigured && supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (_event: string, session: any) => {
          if (!mounted) return;
          if (session?.user) {
            const profile = await resolveProfileFromSession(session.user);
            setUser(profile);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
          } else {
            // Only clear if we were not using demo offline account
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (!parsed.id?.startsWith('demo-')) {
                setUser(null);
                localStorage.removeItem(LOCAL_STORAGE_KEY);
              }
            }
          }
        }
      );

      return () => {
        mounted = false;
        authListener?.subscription.unsubscribe();
      };
    } else {
      setIsLoading(false);
    }
  }, []);

  async function resolveProfileFromSession(authUser: any): Promise<UserProfile> {
    const meta = authUser.user_metadata || {};
    const dbProfile = await fetchUserProfile(authUser.id);
    const emailLower = (authUser.email || '').trim().toLowerCase();
    const isSpecialAdmin = emailLower === 'stanvision1534@gmail.com';

    return {
      id: authUser.id,
      email: authUser.email || '',
      name:
        dbProfile?.name ||
        meta.full_name ||
        meta.name ||
        authUser.email?.split('@')[0] ||
        'Pengguna ADAM',
      avatarUrl:
        dbProfile?.avatarUrl ||
        meta.avatar_url ||
        meta.picture,
      role: isSpecialAdmin ? 'admin' : ((dbProfile?.role || meta.role || 'user') as UserRole),
      createdAt: authUser.created_at,
    };
  }

  // Google OAuth flow
  const loginWithGoogle = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Layanan autentikasi dengan Google saat ini sedang tidak tersedia. Silakan gunakan pendaftaran atau login via email di bawah ini.'
      );
    }
    const { error } = await signInWithGoogleOAuth();
    if (error) {
      throw new Error(
        'Gagal menghubungkan ke akun Google. Silakan periksa koneksi internet Anda atau gunakan email dan kata sandi.'
      );
    }
  };

  // Email and Password Login
  const loginWithEmail = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured) {
      const { data, error } = await signInWithEmailPassword(email, pass);
      if (error) {
        const msg = (error.message || '').toLowerCase();
        let friendlyMsg = 'Gagal masuk. Silakan periksa kembali email dan kata sandi Anda.';
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
          friendlyMsg = 'Email atau kata sandi yang Anda masukkan tidak sesuai.';
        } else if (msg.includes('email not confirmed')) {
          friendlyMsg = 'Alamat email belum dikonfirmasi. Silakan periksa kotak masuk email Anda.';
        }
        return { success: false, error: friendlyMsg };
      }
      if (data?.user) {
        const profile = await resolveProfileFromSession(data.user);
        setUser(profile);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
        return { success: true };
      }
    }

    // Graceful offline fallback / demo email support
    const emailClean = email.trim().toLowerCase();
    const isSpecialAdmin = emailClean === 'stanvision1534@gmail.com';
    const demoRole: UserRole = isSpecialAdmin || emailClean.includes('admin') ? 'admin' : 'user';
    const fallbackProfile: UserProfile = {
      id: 'usr-' + Date.now().toString(36),
      email: email,
      name: email.split('@')[0],
      role: demoRole,
      createdAt: new Date().toISOString(),
    };
    setUser(fallbackProfile);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fallbackProfile));
    return { success: true };
  };

  // Register with Email and Password
  const registerWithEmail = async (
    name: string,
    email: string,
    pass: string,
    selectedRole: UserRole = 'user'
  ): Promise<{ success: boolean; error?: string }> => {
    const emailClean = email.trim().toLowerCase();
    const isSpecialAdmin = emailClean === 'stanvision1534@gmail.com';
    const effectiveRole: UserRole = isSpecialAdmin ? 'admin' : selectedRole;

    if (isSupabaseConfigured) {
      const { data, error } = await signUpWithEmailPassword(email, pass, name, effectiveRole);
      if (error) {
        const msg = (error.message || '').toLowerCase();
        let friendlyMsg = 'Gagal memproses pendaftaran akun. Silakan coba beberapa saat lagi.';
        if (
          msg.includes('already registered') ||
          msg.includes('unique constraint') ||
          msg.includes('user already exists')
        ) {
          friendlyMsg = 'Alamat email ini sudah terdaftar. Silakan masuk ke akun Anda.';
        } else if (msg.includes('password should be at least')) {
          friendlyMsg = 'Kata sandi minimal 6 karakter.';
        }
        return { success: false, error: friendlyMsg };
      }
      if (data?.user) {
        const profile: UserProfile = {
          id: data.user.id,
          email: email,
          name: name,
          role: effectiveRole,
          createdAt: new Date().toISOString(),
        };
        setUser(profile);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
        return { success: true };
      }
    }

    // Offline / Demo register fallback
    const fallbackProfile: UserProfile = {
      id: 'reg-' + Date.now().toString(36),
      email: email,
      name: name,
      role: effectiveRole,
      createdAt: new Date().toISOString(),
    };
    setUser(fallbackProfile);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fallbackProfile));
    return { success: true };
  };

  // Demo Quick-Login (Instant safe access for UAS presentation)
  const quickLoginDemo = (targetRole: UserRole) => {
    const isTargetAdmin = targetRole === 'admin';
    const demoProfile: UserProfile = {
      id: `demo-${targetRole}-${Date.now().toString(36)}`,
      name: isTargetAdmin ? 'Adam (Admin Sistem ADAM)' : 'Operator Meja Alpha',
      email: isTargetAdmin ? 'adam.admin@smart-adam.iot' : 'operator.alpha@smart-adam.iot',
      role: targetRole,
      createdAt: new Date().toISOString(),
    };
    setUser(demoProfile);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(demoProfile));
  };

  // Sign out
  const logout = async (): Promise<void> => {
    try {
      await signOutSupabase();
    } catch {
      // Ignore
    } finally {
      setUser(null);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  };

  const role: UserRole = user?.role || 'user';
  const isAuthenticated = Boolean(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isLoading,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        quickLoginDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
