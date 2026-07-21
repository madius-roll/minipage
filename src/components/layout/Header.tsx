import Button from '../ui/Button';
import { IconBook, IconLogOut, IconUser } from '../ui/Icon';
import { useAuth } from '../auth/AuthContext';
import './Header.css';

interface HeaderProps {
  onOpenGuide?: () => void;
}

/** 상단 헤더 — 로고, 법령 가이드 진입, 프로필/로그아웃 */
export default function Header({ onOpenGuide }: HeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-logo">🧯</span>
        <div className="header-title">
          <h1>Smart Sprinkler CAD</h1>
          <span className="header-subtitle">현장용 간이 소방 CAD &amp; 법령 가이드</span>
        </div>
      </div>

      <div className="header-actions">
        <Button variant="ghost" size="sm" icon={<IconBook />} onClick={onOpenGuide} disabled={!onOpenGuide}>
          법령 가이드
        </Button>

        <div className="header-profile">
          <span className="header-avatar">
            <IconUser className="header-avatar-icon" />
          </span>
          <div className="header-profile-info">
            <span className="header-profile-name">{user?.name ?? '게스트'}</span>
            <span className="header-profile-role">{user?.email ?? '로그인 필요'}</span>
          </div>
        </div>

        <Button variant="ghost" size="sm" icon={<IconLogOut />} onClick={logout} disabled={!user} aria-label="로그아웃" />
      </div>
    </header>
  );
}
