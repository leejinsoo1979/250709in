import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { useAuth } from '@/auth/AuthProvider';
import { auth, signInWithEmail, signUpWithEmail, signInWithGoogle, handleRedirectResult } from '@/firebase/auth';
import { SignInFlo } from '@/components/ui/sign-in-flo';
import {
  isSketchUpEnvironment,
  canDelegateOAuthToSketchUp,
  delegateGoogleOAuthToSketchUp,
} from '@/editor/shared/utils/sketchupBridge';

interface SplitLoginFormProps {
  onSuccess?: () => void;
  defaultSignUp?: boolean;
}

export const SplitLoginForm: React.FC<SplitLoginFormProps> = ({ onSuccess, defaultSignUp }) => {
  const navigate = useNavigate();
  useAuth();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  // SketchUp HtmlDialog 환경이면 로그인 후 SketchUp 전용 대시보드로 이동
  const postLoginPath = useMemo(
    () => (isSketchUpEnvironment() ? '/sketchup' : '/dashboard'),
    []
  );

  useEffect(() => {
    const checkRedirectResult = async () => {
      const result = await handleRedirectResult();
      if (result.user) {
        navigate(postLoginPath);
      } else if (result.error) {
        setError(result.error);
      }
    };
    checkRedirectResult();
  }, [navigate, postLoginPath]);

  // SketchUp 외부 OAuth 위임 흐름의 토큰 수신 콜백 등록
  useEffect(() => {
    if (!isSketchUpEnvironment()) return;

    (window as any).__sketchupOAuthToken = async (idToken: string) => {
      try {
        if (!auth) {
          setError('Firebase Auth가 초기화되지 않았습니다.');
          return;
        }
        // ID 토큰을 Firebase Credential로 변환
        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(auth, credential);
        if (userCred.user) {
          navigate(postLoginPath);
        }
      } catch (err: any) {
        console.error('signInWithCredential 실패:', err);
        setError('구글 로그인 처리 중 오류: ' + (err?.message || '알 수 없음'));
        setGoogleLoading(false);
        setLoading(false);
      }
    };

    (window as any).__sketchupOAuthError = (reason: string) => {
      setError(`SketchUp 로그인 브릿지 오류: ${reason}`);
      setGoogleLoading(false);
      setLoading(false);
    };

    return () => {
      delete (window as any).__sketchupOAuthToken;
      delete (window as any).__sketchupOAuthError;
    };
  }, [navigate, postLoginPath]);

  const handleSubmit = async (data: {
    email: string;
    password: string;
    name?: string;
    isSignUp: boolean;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const result = data.isSignUp
        ? await signUpWithEmail(data.email, data.password, data.name || '')
        : await signInWithEmail(data.email, data.password);

      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        onSuccess?.();
        navigate(postLoginPath);
      }
    } catch {
      setError('예상치 못한 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setGoogleLoading(true);
    setError(null);

    // SketchUp 환경 + 루비 브릿지 사용 가능 → 시스템 브라우저로 OAuth 위임
    // (HtmlDialog의 자동완성/한글 미지원 문제 회피)
    if (canDelegateOAuthToSketchUp()) {
      const state = delegateGoogleOAuthToSketchUp();
      if (state) {
        // 외부 브라우저에서 OAuth 진행 중 - 토큰 수신은 __sketchupOAuthToken에서 처리
        setError('외부 브라우저에서 구글 로그인을 완료해 주세요. 완료 후 자동으로 진행됩니다.');
        // googleLoading은 토큰 수신 시점까지 유지
        return;
      }
      // 위임 실패 시 fallback (아래 일반 흐름)
    }

    try {
      const result = await signInWithGoogle();
      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        navigate(postLoginPath);
      }
      // result.user가 null이면 redirect 진행 중 - 페이지가 곧 떠나므로 대기
    } catch {
      setError('구글 로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setGoogleLoading(false);
    }
  };

  return (
    <SignInFlo
      onSubmit={handleSubmit}
      onGoogleLogin={handleGoogleLogin}
      onNavigateHome={() => navigate('/')}
      error={error}
      loading={loading}
      googleLoading={googleLoading}
      defaultSignUp={defaultSignUp}
    />
  );
};
