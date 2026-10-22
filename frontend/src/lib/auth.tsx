import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "./api";
import { live } from "./live";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ otp_session_id: string; message: string }>;
  verifyOtp: (otpSessionId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    try {
      localStorage.removeItem("nova-token");
    } catch {
      /* storage unavailable */
    }
    refreshUser().finally(() => setLoading(false));

    const onUnauthorized = () => setUser(null);
    window.addEventListener("nova:unauthorized", onUnauthorized);
    return () => window.removeEventListener("nova:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    if (user) live.start();
    else live.stop();
  }, [user]);

  const login = (email: string, password: string) => api.login(email, password);

  const verifyOtp = async (otpSessionId: string, code: string) => {
    const result = await api.verifyOtp(otpSessionId, code);
    setUser(result.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* already signed out server-side */
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyOtp, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
