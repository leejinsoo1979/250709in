import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '@/firebase/auth';
import Button from '@/components/common/Button';
import styles from './LoginForm.module.css';

interface LoginFormProps {
  onSuccess?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 로그인 폼에서는 다크모드를 무시하도록 강제
  useEffect(() => {
    // 1. document.documentElement에 전역 CSS 변수 오버라이드
    const root = document.documentElement;
    const originalValues = {
      background: getComputedStyle(root).getPropertyValue('--theme-background'),
      text: getComputedStyle(root).getPropertyValue('--theme-text'),
      surface: getComputedStyle(root).getPropertyValue('--theme-surface'),
      mode: getComputedStyle(root).getPropertyValue('--theme-mode')
    };

    // 로그인 페이지에서는 항상 light 모드 강제
    root.style.setProperty('--theme-background', '#ffffff', 'important');
    root.style.setProperty('--theme-text', '#333333', 'important');
    root.style.setProperty('--theme-surface', '#ffffff', 'important');
    root.style.setProperty('--theme-mode', 'light', 'important');

    // 2. body 클래스에서 dark 모드 제거
    const bodyClasses = Array.from(document.body.classList);
    const darkModeClasses = bodyClasses.filter(c => c.includes('dark'));
    darkModeClasses.forEach(c => document.body.classList.remove(c));

    // 3. 로그인 폼 영역에 직접 스타일 적용
    const applyLightModeStyles = () => {
      const loginForm = document.querySelector(`.${styles.loginForm}`) as HTMLElement;
      if (loginForm) {
        loginForm.style.setProperty('--theme-background', '#ffffff', 'important');
        loginForm.style.setProperty('--theme-text', '#333333', 'important');
        loginForm.style.setProperty('--theme-surface', '#ffffff', 'important');
        
        // 모든 input 요소에 직접 스타일 적용
        const inputs = loginForm.querySelectorAll('input');
        inputs.forEach(input => {
          input.style.backgroundColor = 'white';
          input.style.color = '#333';
          input.style.setProperty('background-color', 'white', 'important');
          input.style.setProperty('color', '#333', 'important');
          input.style.setProperty('-webkit-text-fill-color', '#333', 'important');
        });
      }
    };

    applyLightModeStyles();

    // 4. MutationObserver로 스타일 변경 감지 및 재적용
    const observer = new MutationObserver(() => {
      applyLightModeStyles();
    });

    const loginForm = document.querySelector(`.${styles.loginForm}`) as HTMLElement;
    if (loginForm) {
      observer.observe(loginForm, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        childList: true,
        subtree: true
      });
    }

    // 컴포넌트 언마운트 시 원래 값으로 복원
    return () => {
      observer.disconnect();
      root.style.setProperty('--theme-background', originalValues.background);
      root.style.setProperty('--theme-text', originalValues.text);
      root.style.setProperty('--theme-surface', originalValues.surface);
      root.style.setProperty('--theme-mode', originalValues.mode);
    };
  }, []);

  // 로그인 상태 확인 후 자동 리다이렉트
  useEffect(() => {
    if (user && !authLoading) {
      console.log('✅ 로그인된 상태 감지, 홈페이지로 이동합니다.');
      const timeoutId = setTimeout(() => {
        navigate('/');
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [user, authLoading, navigate]);

  // 이메일/비밀번호 로그인/회원가입 처리
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let result;
      
      if (isSignUp) {
        result = await signUpWithEmail(email, password, displayName);
      } else {
        result = await signInWithEmail(email, password);
      }

      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        console.log('✅ 인증 성공:', result.user.email);
        onSuccess?.();
      }
    } catch (err) {
      setError('예상치 못한 오류가 발생했습니다.');
      console.error('인증 에러:', err);
    } finally {
      setLoading(false);
    }
  };

  // Firebase 설정 확인
  const isFirebaseConfigured = () => {
    return !!(
      import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID
    );
  };

  // 구글 로그인 처리
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    if (!isFirebaseConfigured()) {
      setError('데모 환경에서는 구글 로그인을 사용할 수 없습니다. "데모 체험하기" 버튼을 이용해주세요.');
      setLoading(false);
      return;
    }

    try {
      const result = await signInWithGoogle();
      
      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        console.log('✅ 구글 로그인 성공:', result.user.email);
        onSuccess?.();
      }
    } catch (err) {
      setError('구글 로그인 중 오류가 발생했습니다.');
      console.error('구글 로그인 에러:', err);
    } finally {
      setLoading(false);
    }
  };

  // 데모 체험하기 버튼 처리
  const handleDemoAccess = () => {
    console.log('🎨 데모 모드로 에디터 접속');
    navigate('/configurator');
  };

  // 카카오 로그인 처리 (데모용)
  const handleKakaoLogin = () => {
    console.log('카카오 로그인 (데모)');
    handleDemoAccess();
  };

  // 네이버 로그인 처리 (데모용)
  const handleNaverLogin = () => {
    console.log('네이버 로그인 (데모)');
    handleDemoAccess();
  };

  return (
    <div className={styles.loginForm}>
      <div className={styles.container}>
        {/* 로고 영역 */}
        <div className={styles.logoSection}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>✨</span>
            <span className={styles.logoText}>MOHEIM</span>
          </div>
        </div>

        {/* 제목 */}
        <h2 className={styles.title}>Welcome Back</h2>
        <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginTop: '-20px', marginBottom: '30px' }}>
          로그인하여 계속 진행하세요
        </p>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* 이메일 입력 */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>이메일 주소</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
              style={{ background: 'white', color: '#333' }}
            />
          </div>
          
          {/* 비밀번호 입력 */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>비밀번호</label>
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="비밀번호 입력"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={styles.input}
                style={{ background: 'white', color: '#333' }}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          
          {/* 로그인 유지 & 비밀번호 찾기 */}
          <div className={styles.optionsRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={styles.checkbox}
              />
              <span className={styles.checkboxText}>로그인 유지</span>
            </label>
            <button type="button" className={styles.forgotPassword}>
              비밀번호 찾기 &gt;
            </button>
          </div>
          
          {/* 에러 메시지 */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}
          
          {/* 로그인 버튼 */}
          <Button 
            type="submit" 
            disabled={loading}
            className={styles.loginButton}
          >
            {loading ? '처리 중...' : '로그인'}
          </Button>
        </form>
        
        {/* 구분선 */}
        <div className={styles.divider}>
          <span>또는</span>
        </div>
        
        {/* SNS 로그인 */}
        <div className={styles.snsSection}>
          <p className={styles.snsTitle}>SNS 계정으로 3초만에 가입하기</p>
          <div className={styles.snsButtons}>
            <button
              type="button"
              className={styles.snsButton}
              onClick={handleKakaoLogin}
              style={{ backgroundColor: '#fee500' }}
              aria-label="카카오로 로그인"
            >
              <span className={styles.snsIcon} style={{ color: '#3c1e1e' }}>K</span>
            </button>
            <button
              type="button"
              className={styles.snsButton}
              onClick={handleGoogleLogin}
              style={{ backgroundColor: '#fff', border: '1px solid #dadce0' }}
              aria-label="구글로 로그인"
            >
              <svg className={styles.snsIcon} width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </button>
            <button
              type="button"
              className={styles.snsButton}
              onClick={handleNaverLogin}
              style={{ backgroundColor: '#03c75a' }}
              aria-label="네이버로 로그인"
            >
              <span className={styles.snsIcon}>N</span>
            </button>
          </div>
        </div>
        
        {/* 아이디 없이 가입하기 */}
        <Button 
          onClick={handleDemoAccess}
          className={styles.demoButton}
        >
          데모 체험하기
        </Button>
        
        {/* 회원가입 안내 */}
        <p style={{ 
          textAlign: 'center', 
          marginTop: '20px', 
          color: '#666', 
          fontSize: '14px' 
        }}>
          처음이신가요? {' '}
          <a 
            href="#" 
            style={{ 
              color: '#667eea', 
              textDecoration: 'none', 
              fontWeight: '500' 
            }}
            onClick={(e) => {
              e.preventDefault();
              setIsSignUp(true);
            }}
          >
            회원가입
          </a>
        </p>
      </div>
    </div>
  );
}; 