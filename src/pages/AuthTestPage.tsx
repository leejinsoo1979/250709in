import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signOutUser } from '../firebase/auth';
import { testFirebaseConnection, testFirestoreRules } from '../firebase/test';
import styles from './AuthTestPage.module.css';

// Firebase 테스트 함수들의 실제 반환 타입에 맞게 수정
interface TestResult {
  success: boolean;
  exists?: boolean;
  error?: unknown; // unknown 타입으로 변경
  data?: Record<string, unknown>; // any 대신 Record 타입 사용
}

// 에러 메시지 추출 유틸리티 함수
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as Record<string, unknown>).message);
  }
  return '알 수 없는 오류';
};

const AuthTestPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [testResults, setTestResults] = useState<TestResult | null>(null);

  // 로그인 성공 시 홈으로 리다이렉트
  useEffect(() => {
    if (user && !loading) {
      console.log('✅ 로그인된 사용자 감지, 홈페이지로 이동합니다.');
      setMessage('✅ 로그인 성공! 홈페이지로 이동합니다...');
      
      // 2초 후 홈으로 이동 (사용자가 성공 메시지를 볼 시간을 줌)
      const timeoutId = setTimeout(() => {
        navigate('/');
      }, 2000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [user, loading, navigate]);

  // Firebase 연결 테스트
  const handleConnectionTest = async () => {
    setMessage('Firebase 연결 테스트 중...');
    const result = await testFirebaseConnection();
    setTestResults(result);
    
    if (result.success) {
      setMessage('✅ Firebase 연결 성공!');
    } else {
      const errorMessage = getErrorMessage(result.error);
      setMessage(`❌ Firebase 연결 실패: ${errorMessage}`);
    }
  };

  // Firestore 보안 규칙 테스트
  const handleRulesTest = async () => {
    setMessage('Firestore 보안 규칙 테스트 중...');
    const result = await testFirestoreRules();
    
    if (result.success) {
      setMessage('✅ Firestore 보안 규칙 테스트 성공!');
    } else {
      const errorMessage = getErrorMessage(result.error);
      setMessage(`❌ Firestore 보안 규칙 테스트 실패: ${errorMessage}`);
    }
  };

  // 이메일 로그인
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setMessage('로그인 중...');
      const result = await signInWithEmail(email, password);
      if (result.error) {
        setMessage(`❌ 로그인 실패: ${result.error}`);
      } else {
        setMessage('✅ 로그인 성공!');
      }
    } catch (error: unknown) {
      setMessage(`❌ 로그인 실패: ${getErrorMessage(error)}`);
    }
  };

  // 이메일 회원가입
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setMessage('회원가입 중...');
      const result = await signUpWithEmail(email, password);
      if (result.error) {
        setMessage(`❌ 회원가입 실패: ${result.error}`);
      } else {
        setMessage('✅ 회원가입 성공!');
      }
    } catch (error: unknown) {
      setMessage(`❌ 회원가입 실패: ${getErrorMessage(error)}`);
    }
  };

  // 구글 로그인
  const handleGoogleLogin = async () => {
    try {
      setMessage('구글 로그인 중...');
      const result = await signInWithGoogle();
      if (result.error) {
        setMessage(`❌ 구글 로그인 실패: ${result.error}`);
      } else {
        setMessage('✅ 구글 로그인 성공!');
      }
    } catch (error: unknown) {
      setMessage(`❌ 구글 로그인 실패: ${getErrorMessage(error)}`);
    }
  };

  // 로그아웃
  const handleLogout = async () => {
    try {
      const result = await signOutUser();
      if (result.error) {
        setMessage(`❌ 로그아웃 실패: ${result.error}`);
      } else {
        setMessage('✅ 로그아웃 성공!');
      }
    } catch (error: unknown) {
      setMessage(`❌ 로그아웃 실패: ${getErrorMessage(error)}`);
    }
  };

  if (loading) {
    return <div className={styles.loading}>인증 상태 확인 중...</div>;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>🔥 Firebase 인증 테스트</h1>
      
      {/* Firebase 연결 테스트 섹션 */}
      <div className={styles.testSection}>
        <h2>🔧 연결 테스트</h2>
        <div className={styles.testButtons}>
          <button onClick={handleConnectionTest} className={styles.testButton}>
            Firebase 연결 테스트
          </button>
          <button onClick={handleRulesTest} className={styles.testButton}>
            Firestore 보안 규칙 테스트
          </button>
        </div>
        
        {testResults && (
          <div className={styles.testResults}>
            <strong>테스트 결과:</strong>
            <pre>{JSON.stringify(testResults, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* 현재 사용자 정보 */}
      <div className={styles.userInfo}>
        <h3>👤 현재 사용자</h3>
        {user ? (
          <div>
            <p><strong>이메일:</strong> {user.email}</p>
            <p><strong>이름:</strong> {user.displayName || '설정되지 않음'}</p>
            <p><strong>UID:</strong> {user.uid}</p>
            <button onClick={handleLogout} className={styles.logoutButton}>
              로그아웃
            </button>
          </div>
        ) : (
          <p>로그인되지 않음</p>
        )}
      </div>

      {/* 로그인이 되지 않은 경우에만 로그인 폼 표시 */}
      {!user && (
        <>
          {/* 구글 로그인 */}
          <button 
            onClick={handleGoogleLogin}
            className={styles.googleLoginButton}
          >
            🔍 Google로 로그인
          </button>

          {/* 이메일 로그인 폼 */}
          <form onSubmit={handleEmailLogin} className={styles.loginForm}>
            <h3>📧 이메일 로그인</h3>
            <div className={styles.inputGroup}>
              <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={styles.input}
              />
            </div>
            <div className={styles.inputGroup}>
              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={styles.input}
              />
            </div>
            <div className={styles.buttonGroup}>
              <button type="submit" className={styles.primaryButton}>
                로그인
              </button>
              <button type="button" onClick={handleEmailSignup} className={styles.secondaryButton}>
                회원가입
              </button>
            </div>
          </form>
        </>
      )}

      {/* 메시지 표시 */}
      {message && (
        <div className={`${styles.message} ${message.includes('❌') ? styles.messageError : styles.messageSuccess}`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default AuthTestPage; 