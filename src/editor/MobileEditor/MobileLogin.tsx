// MobileLogin — /mobile/login 전용 로그인 화면 (브랜드 블랙 배경)
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { signInWithEmail, signInWithGoogle, signUpWithEmail, handleRedirectResult } from '@/firebase/auth';
import './MobileEditor.css';

type Mode = 'login' | 'signup';

const MobileLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as any)?.redirectTo || '/mobile';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모바일 구글 로그인은 redirect 방식 → 페이지 복귀 시 결과 처리
  useEffect(() => {
    (async () => {
      try {
        const result = await handleRedirectResult();
        if (result.user) {
          navigate(redirectTo, { replace: true });
        } else if (result.error) {
          setError(result.error);
        }
      } catch (err: any) {
        // redirect 결과 없음 - 무시
      }
    })();
  }, [navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = mode === 'login'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password, name || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message || '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.error) {
        setError(result.error);
        return;
      }
      // redirect 방식(모바일)이면 user가 null로 돌아옴 → 페이지가 곧 떠나므로 navigate 호출하지 않음
      if (result.user) {
        navigate(redirectTo, { replace: true });
      }
    } catch (err: any) {
      setError(err?.message || '구글 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw', minHeight: '100vh',
      background: '#000000', color: '#FFFFFF',
      fontFamily: `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", system-ui, sans-serif`,
      display: 'flex', flexDirection: 'column',
      padding: '24px 24px 32px',
      paddingTop: 'calc(24px + env(safe-area-inset-top, 0))',
      paddingLeft: 'calc(24px + env(safe-area-inset-left, 0))',
      paddingRight: 'calc(24px + env(safe-area-inset-right, 0))',
      paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0))',
      boxSizing: 'border-box',
    }}>
      {/* 로고 영역 */}
      <div style={{ textAlign: 'center', marginTop: 36, marginBottom: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#FFF' }}/>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#FFF' }}/>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#FFF' }}/>
        </div>
        <div style={{ fontSize: 13, color: '#9CA3AF', letterSpacing: 2, marginBottom: 4 }}>
          think thing thank
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: 4 }}>CRAFT</div>
      </div>

      {/* 탭 전환 */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 24,
        background: '#111827', borderRadius: 10, padding: 4,
      }}>
        {(['login', 'signup'] as const).map(m => (
          <button key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, height: 40, borderRadius: 8, border: 'none',
              background: mode === m ? '#FFF' : 'transparent',
              color: mode === m ? '#000' : '#9CA3AF',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >{m === 'login' ? '로그인' : '회원가입'}</button>
        ))}
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="이름 (선택)"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
          />
        )}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete={mode === 'login' ? 'email' : 'email'}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          style={inputStyle}
        />

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
            color: '#FCA5A5', padding: '10px 12px', borderRadius: 8, fontSize: 13,
          }}>{error}</div>
        )}

        <button type="submit" disabled={loading} style={{
          ...primaryBtnStyle,
          opacity: loading ? 0.6 : 1,
        }}>{loading ? '처리중...' : (mode === 'login' ? '로그인' : '회원가입')}</button>
      </form>

      {/* 구분선 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        margin: '20px 0', color: '#6B7280', fontSize: 12,
      }}>
        <div style={{ flex: 1, height: 1, background: '#1F2937' }}/>
        <span>또는</span>
        <div style={{ flex: 1, height: 1, background: '#1F2937' }}/>
      </div>

      {/* 구글 로그인 */}
      <button onClick={handleGoogle} disabled={loading} style={googleBtnStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        구글 계정으로 계속하기
      </button>

      {/* 하단 안내 */}
      <div style={{ flex: 1 }}/>
      <div style={{ textAlign: 'center', color: '#6B7280', fontSize: 12, marginTop: 24 }}>
        <Link to="/" style={{ color: '#9CA3AF', textDecoration: 'none' }}>
          웹 버전으로 이동 →
        </Link>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  height: 48, borderRadius: 10,
  border: '1px solid #1F2937', background: '#0B0F19',
  color: '#FFFFFF', fontSize: 15, padding: '0 14px',
  outline: 'none',
  WebkitAppearance: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  height: 50, borderRadius: 10, border: 'none',
  background: '#FFFFFF', color: '#000000',
  fontSize: 15, fontWeight: 700, cursor: 'pointer',
  marginTop: 4,
};

const googleBtnStyle: React.CSSProperties = {
  height: 50, borderRadius: 10,
  border: '1px solid #374151', background: 'transparent',
  color: '#FFFFFF', fontSize: 14, fontWeight: 500,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  cursor: 'pointer',
};

export default MobileLogin;
