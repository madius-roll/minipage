import { createContext, useContext, useState, type ReactNode } from 'react';

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

/**
 * 더미 인증 상태. 실제 이메일·구글 인증(Supabase/Firebase Auth)은 PART 2에서 연결되며,
 * 여기서는 화면 흐름(로그인 → 보호 라우트 → 로그아웃)만 검증한다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

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
