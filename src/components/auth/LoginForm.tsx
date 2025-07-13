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

  // 로그인 상태 확인 후 자동 리다이렉트
  useEffect(() => {
    if (user && !authLoading) {
      console.log('✅ 로그인된 상태 감지, 홈페이지로 이동합니다.');
      // 짧은 지연 후 이동 (로그인 성공 메시지를 볼 시간 제공)
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
        // 회원가입
        result = await signUpWithEmail(email, password, displayName);
      } else {
        // 로그인
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

    // Firebase가 설정되지 않은 경우 안내 메시지
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

  return (
    <div className={styles.loginForm}>
      <div className={styles.container}>
        <h2>{isSignUp ? '회원가입' : '로그인'}</h2>
        
        {/* Firebase 설정 여부에 따른 버튼 표시 */}
        {isFirebaseConfigured() ? (
          <Button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className={styles.googleButton}
          >
            <span className={styles.googleIcon}>🔍</span>
            Google로 {isSignUp ? '회원가입' : '로그인'}
          </Button>
        ) : (
          <Button 
            onClick={handleDemoAccess}
            disabled={loading}
            className={styles.demoButton}
          >
            <span className={styles.demoIcon}>🎨</span>
            데모 체험하기 (로그인 없이 사용)
          </Button>
        )}
        
        {/* 구분선 */}
        <div className={styles.divider}>
          <span>또는</span>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* 회원가입 시 이름 입력 */}
          {isSignUp && (
            <Input
              type="text"
              placeholder="이름"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required={isSignUp}
            />
          )}
          
          {/* 이메일 입력 */}
          <Input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          
          {/* 비밀번호 입력 */}
          <Input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          {/* 에러 메시지 */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}
          
          {/* 제출 버튼 */}
          <Button 
            type="submit" 
            disabled={loading}
            className={styles.submitButton}
          >
            {loading ? '처리 중...' : (isSignUp ? '회원가입' : '로그인')}
          </Button>
        </form>
        
        {/* 로그인/회원가입 전환 */}
        <div className={styles.switchMode}>
          {isSignUp ? '이미 계정이 있으신가요?' : '계정이 없으신가요?'}
          <button 
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className={styles.switchButton}
          >
            {isSignUp ? '로그인' : '회원가입'}
          </button>
        </div>
      </div>
    </div>
  );
}; 