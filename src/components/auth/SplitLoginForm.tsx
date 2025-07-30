import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '@/firebase/auth';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Logo from '@/components/common/Logo';
import { Interactive3DBackground } from './Interactive3DBackground';
import styles from './SplitLoginForm.module.css';

interface SplitLoginFormProps {
  onSuccess?: () => void;
}

export const SplitLoginForm: React.FC<SplitLoginFormProps> = ({ onSuccess }) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);

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
      setError('데모 환경에서는 구글 로그인을 사용할 수 없습니다.');
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

  // Facebook 로그인 처리 (데모용)
  const handleFacebookLogin = () => {
    console.log('Facebook 로그인 (데모)');
    navigate('/configurator');
  };

  return (
    <div className={styles.container}>
      <Interactive3DBackground />
      <div className={styles.leftPanel}>
        <div className={styles.leftContent}>
          <div className={styles.logo}>
            <Logo size="large" />
          </div>
          
          <h1 className={styles.welcomeTitle}>Hey, Hello!</h1>
          <p className={styles.welcomeSubtitle}>
            Join The Waitlist For The Design System!
          </p>
        </div>
      </div>

      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>Welcome Back</h2>
          <p className={styles.formSubtitle}>
            Let's get started with your 30 days free trial.
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            {isSignUp && (
              <Input
                type="text"
                placeholder="Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className={styles.input}
              />
            )}
            
            <Input
              type="email"
              placeholder="Username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
            />
            
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={styles.input}
            />
            
            {!isSignUp && (
              <div className={styles.forgotPasswordWrapper}>
                <a href="#" className={styles.forgotPassword}>
                  Forgot Password?
                </a>
              </div>
            )}
            
            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}
            
            <Button 
              type="submit" 
              disabled={loading}
              className={styles.loginButton}
            >
              {loading ? 'Processing...' : 'Login'}
            </Button>
          </form>

          <div className={styles.divider}>
            <span>OR</span>
          </div>

          <div className={styles.socialButtons}>
            <button
              type="button"
              className={`${styles.socialButton} ${styles.googleButton}`}
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg className={styles.socialIcon} viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Google</span>
            </button>
            
            <button
              type="button"
              className={`${styles.socialButton} ${styles.facebookButton}`}
              onClick={handleFacebookLogin}
              disabled={loading}
            >
              <svg className={styles.socialIcon} viewBox="0 0 24 24">
                <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span>Facebook</span>
            </button>
          </div>

          {/* 데모체험 버튼 */}
          <div className={styles.demoSection}>
            <div className={styles.divider}>
              <span>또는</span>
            </div>
            <button
              type="button"
              className={styles.demoButton}
              onClick={() => navigate('/configurator')}
            >
              데모체험하기
            </button>
          </div>

          <p className={styles.signupPrompt}>
            {isSignUp ? '이미 계정이 있으신가요?' : "Don't have an account?"}{' '}
            <a 
              href="#" 
              className={styles.signupLink}
              onClick={(e) => {
                e.preventDefault();
                setIsSignUp(!isSignUp);
                setError(null);
              }}
            >
              {isSignUp ? 'Login' : 'Sign Up'}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};