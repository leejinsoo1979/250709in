import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { signInWithEmail, signUpWithEmail, signInWithGoogle, handleRedirectResult } from '@/firebase/auth';
import { SignInFlo } from '@/components/ui/sign-in-flo';

interface SplitLoginFormProps {
  onSuccess?: () => void;
}

export const SplitLoginForm: React.FC<SplitLoginFormProps> = ({ onSuccess }) => {
  const navigate = useNavigate();
  useAuth();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkRedirectResult = async () => {
      const result = await handleRedirectResult();
      if (result.user) {
        navigate('/dashboard');
      } else if (result.error) {
        setError(result.error);
      }
    };
    checkRedirectResult();
  }, [navigate]);

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
        navigate('/dashboard');
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
        navigate('/dashboard');
      }
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
    />
  );
};
