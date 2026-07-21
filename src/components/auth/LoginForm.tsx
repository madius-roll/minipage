import { useState, type FormEvent } from 'react';
import Button from '../ui/Button';

interface LoginFormProps {
  onSubmit: (email: string) => void;
}

export default function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const valid = email.trim().length > 0 && password.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit(email);
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="login-email">이메일 또는 아이디</label>
        <input
          id="login-email"
          type="text"
          placeholder="예: asd 또는 you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
      </div>
      <div className="field">
        <label htmlFor="login-password">비밀번호</label>
        <input
          id="login-password"
          type="password"
          placeholder="예: asd"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" disabled={!valid} className="login-submit">
        로그인
      </Button>
    </form>
  );
}
