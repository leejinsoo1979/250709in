import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '@/firebase/auth';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
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
            <span className={styles.logoIcon}>m</span>
            <span className={styles.logoText}>LOGO</span>
          </div>
        </div>

        {/* 제목 */}
        <h2 className={styles.title}>로그인</h2>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* 이메일 입력 */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>아이디/주소 (ID)</label>
            <Input
              type="email"
              placeholder="아이디 입력"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
            />
          </div>
          
          {/* 비밀번호 입력 */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>비밀번호</label>
            <div className={styles.passwordWrapper}>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="비밀번호 입력"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={styles.input}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '🙈' : '👁️'}
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
            >
              <span className={styles.snsIcon}>💬</span>
            </button>
            <button
              type="button"
              className={styles.snsButton}
              onClick={handleGoogleLogin}
              style={{ backgroundColor: '#4285f4' }}
            >
              <span className={styles.snsIcon}>G</span>
            </button>
            <button
              type="button"
              className={styles.snsButton}
              onClick={handleNaverLogin}
              style={{ backgroundColor: '#03c75a' }}
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
          아이디없로 가입하기
        </Button>
      </div>
    </div>
  );
}; 