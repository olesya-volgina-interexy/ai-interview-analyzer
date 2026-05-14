import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AuthUser, LoginRequest } from '@shared/schemas';
import axios from 'axios';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setIsLoading(false); return; }
    axios.get(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setUser(r.data))
      .catch(() => { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (data: LoginRequest) => {
    const r = await axios.post(`${BASE}/auth/login`, data);
    localStorage.setItem('accessToken', r.data.accessToken);
    localStorage.setItem('refreshToken', r.data.refreshToken);
    setUser(r.data.user);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
