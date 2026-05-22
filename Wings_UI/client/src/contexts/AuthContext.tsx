import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
  type AuthStatus,
} from "@/lib/api";

type AuthContextValue = {
  status: AuthStatus | null;
  loading: boolean;
  refresh: () => Promise<AuthStatus>;
  login: (password: string) => Promise<AuthStatus>;
  bootstrap: (password: string) => Promise<AuthStatus>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthStatus>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const next = await api.getAuthStatus();
    setStatus(next);
    if (next.enabled && !next.authenticated && getStoredAuthToken()) {
      clearStoredAuthToken();
    }
    return next;
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleInvalidated = () => {
      api.getAuthStatus().then(setStatus).catch(() => {});
    };
    window.addEventListener("wings-of-world:auth-invalidated", handleInvalidated);
    window.addEventListener("wings:auth-invalidated", handleInvalidated);
    return () => {
      window.removeEventListener("wings-of-world:auth-invalidated", handleInvalidated);
      window.removeEventListener("wings:auth-invalidated", handleInvalidated);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      loading,
      refresh,
      login: async (password: string) => {
        const result = await api.login(password);
        setStoredAuthToken(result.token);
        setStatus(result.status);
        return result.status;
      },
      bootstrap: async (password: string) => {
        const result = await api.bootstrapAuth(password);
        setStoredAuthToken(result.token);
        setStatus(result.status);
        return result.status;
      },
      logout: async () => {
        try {
          await api.logout();
        } finally {
          clearStoredAuthToken();
          setStatus({
            enabled: true,
            authenticated: false,
            canBootstrap: false,
            sessionExpiresAt: null,
          });
        }
      },
      changePassword: async (currentPassword: string, newPassword: string) => {
        const result = await api.changePassword(currentPassword, newPassword);
        setStoredAuthToken(result.token);
        setStatus(result.status);
        return result.status;
      },
    }),
    [loading, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
