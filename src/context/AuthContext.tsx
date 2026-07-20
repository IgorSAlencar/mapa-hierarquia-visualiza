import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  currentUserRequest,
  loginRequest,
  logoutRequest,
  type AuthUser,
} from '@/lib/authApi';
import { AUTH_EXPIRED_EVENT } from '@/lib/apiClient';
import { clearMapDataCache } from '@/lib/mapDataApi';
import { clearSupervisionAreasCache } from '@/lib/supervisionAreas';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (funcional: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function clearUserCaches() {
  clearMapDataCache();
  clearSupervisionAreasCache();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const clearAllCaches = useCallback(() => {
    clearUserCaches();
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    void currentUserRequest()
      .then((current) => {
        if (active) setUser(current);
      })
      .catch((error) => {
        console.warn('Não foi possível restaurar a sessão.', error);
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      clearAllCaches();
      setUser(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [clearAllCaches]);

  const login = useCallback(async (funcional: string, password: string) => {
    const authenticated = await loginRequest(funcional, password);
    clearAllCaches();
    setUser(authenticated);
    return authenticated;
  }, [clearAllCaches]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearAllCaches();
      setUser(null);
    }
  }, [clearAllCaches]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
