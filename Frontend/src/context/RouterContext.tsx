import React, { createContext, useContext, useState, useEffect } from 'react';

export type RoutePath =
  | '/'
  | '/dashboard'
  | '/editor'
  | '/logs'
  | '/login'
  | '/register'
  | '/verify-otp'
  | '/forgot-password';

interface RouterContextType {
  currentPath: string;
  navigate: (to: string, state?: any) => void;
  routeState: any;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const raw = window.location.pathname;
    if (!raw || raw === '') return '/dashboard';
    return raw;
  });

  const [routeState, setRouteState] = useState<any>(() => {
    return window.history.state || null;
  });

  // Listen to browser Back / Forward events
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const path = window.location.pathname || '/dashboard';
      setCurrentPath(path);
      setRouteState(event.state);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string, state?: any) => {
    // Clean target path
    let target = to;
    if (target === '/') target = '/dashboard';

    // Push state to browser History API (changes URL in address bar)
    window.history.pushState(state, '', target);
    setCurrentPath(target);
    setRouteState(state || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <RouterContext.Provider value={{ currentPath, navigate, routeState }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = (): RouterContextType => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
};
