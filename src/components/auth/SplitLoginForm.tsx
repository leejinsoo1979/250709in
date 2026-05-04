import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { signInWithEmail, signUpWithEmail, signInWithGoogle, handleRedirectResult } from '@/firebase/auth';
import { SignInFlo } from '@/components/ui/sign-in-flo';
import { isSketchUpEnvironment } from '@/editor/shared/utils/sketchupBridge';

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
