import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthUser {
  name: string;
  email: string;
  provider: 'email' | 'google';
}

interface AuthContextValue {
  user: AuthUser | null;
  loginWithEmail: (email: string) => void;
  loginWithGoogle: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'minicad:user';

function loadStoredUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { name, email, provider } = parsed as Record<string, unknown>;
    if (typeof name !== 'string' || typeof email !== 'string' || (provider !== 'email' && provider !== 'google')) return null;
    return { name, email, provider };
  } catch {
    return null;
  }
}

/**
 * 더미 인증 상태. 실제 이메일·구글 인증(Supabase/Firebase Auth)은 PART 2에서 연결되며,
 * 여기서는 화면 흐름(로그인 → 보호 라우트 → 로그아웃)만 검증한다.
 * 새로고침해도 로그인 화면으로 튕기지 않도록 더미 사용자 정보만 브라우저에 기억해 둔다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser);

  useEffect(() => {
    try {
      if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 기억하지 않고 넘어간다
    }
  }, [user]);

  const loginWithEmail = (email: string) => {
    setUser({ name: email.split('@')[0], email, provider: 'email' });
  };

  const loginWithGoogle = () => {
    setUser({ name: '구글 사용자', email: 'guest@gmail.com', provider: 'google' });
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, loginWithEmail, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
