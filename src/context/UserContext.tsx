import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, AuthResponse, RegisterPayload } from "../types";

const TOKEN_KEY = "ic_token";

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

// ── Context shape ─────────────────────────────────────────────────────────────
interface UserContextValue {
  user: User | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  /** Email + password sign-in */
  login: (email: string, password: string) => Promise<void>;
  /** Create new account */
  register: (payload: RegisterPayload) => Promise<void>;
  /** Google OAuth (pass the credential JWT from Google Identity Services) */
  loginWithGoogle: (credential: string) => Promise<void>;
  /** Update user interests after signup */
  saveInterests: (interests: string[]) => Promise<void>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
}

const UserContext = createContext<UserContextValue>({
  user: null, isLoggedIn: false, isAdmin: false, isLoading: true,
  login: async () => {}, register: async () => {}, loginWithGoogle: async () => {},
  saveInterests: async () => {}, logout: () => {}, updateUser: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: restore session from stored token
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setIsLoading(false); return; }

    apiGet<{ user: User }>("/api/auth/me", token)
      .then(({ user: u }) => setUser(u))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setIsLoading(false));
  }, []);

  const storeSession = (token: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(u);
  };

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await apiPost<AuthResponse>("/api/auth/login", { email, password });
    storeSession(token, u);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { token, user: u } = await apiPost<AuthResponse>("/api/auth/register", payload);
    storeSession(token, u);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const { token, user: u } = await apiPost<AuthResponse>("/api/auth/google", { credential });
    storeSession(token, u);
  }, []);

  const saveInterests = useCallback(async (interests: string[]) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const { user: u } = await apiPost<{ user: User }>("/api/auth/interests", { interests }, token);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev);
  }, []);

  return (
    <UserContext.Provider value={{
      user, isLoggedIn: !!user, isAdmin: user?.role === "admin",
      isLoading, login, register, loginWithGoogle, saveInterests, logout, updateUser,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);

