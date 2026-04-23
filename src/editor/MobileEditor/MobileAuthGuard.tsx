// MobileAuthGuard — 모바일 라우트 인증 가드
// 미인증 시 /mobile/login 으로 리다이렉트
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';

const MobileAuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        background: '#000', color: '#FFF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        fontSize: 14, letterSpacing: 1,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFF', opacity: 0.9 }}/>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFF', opacity: 0.6 }}/>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFF', opacity: 0.3 }}/>
          </div>
          <span style={{ color: '#9CA3AF', fontSize: 12 }}>로딩중...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/mobile/login"
        replace
        state={{ redirectTo: location.pathname + location.search }}
      />
    );
  }

  return <>{children}</>;
};

export default MobileAuthGuard;
