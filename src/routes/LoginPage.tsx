import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import GoogleButton from '../components/auth/GoogleButton';
import { useAuth } from '../components/auth/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleEmailLogin = (email: string) => {
    loginWithEmail(email);
    navigate('/');
  };

  const handleGoogleLogin = () => {
    loginWithGoogle();
    navigate('/');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo">🧯</span>
          <h1>Smart Sprinkler CAD</h1>
          <p>현장용 간이 소방 CAD &amp; 법령 가이드</p>
        </div>

        <LoginForm onSubmit={handleEmailLogin} />

        <div className="login-divider">
          <span>또는</span>
        </div>

        <GoogleButton onClick={handleGoogleLogin} />

        <p className="login-note">
          데모용 더미 로그인입니다. 실제 인증은 아직 연결되지 않았습니다.
          <br />
          테스트 계정: <strong>asd</strong> / <strong>asd</strong>
        </p>
      </div>
    </div>
  );
}
