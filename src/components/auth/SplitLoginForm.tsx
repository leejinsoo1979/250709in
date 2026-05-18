import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { useAuth } from '@/auth/AuthProvider';
import { auth, signInWithEmail, signUpWithEmail, signInWithGoogle, handleRedirectResult } from '@/firebase/auth';
import { isSuperAdmin, isUserAdmin } from '@/firebase/admins';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
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
  const { user: authUser, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  // 관리자(슈퍼/일반/기업회원)는 대시보드, 그 외 일반 사용자는 데모 모드로 라우팅
  // SketchUp HtmlDialog 환경은 기존 /sketchup 경로 유지
  // ⚠️ 보안: enterprise_inquiries 최신 status를 plan과 동기화해서 우회 방지
  const resolvePostLoginPath = async (
    user: { uid?: string | null; email?: string | null } | null | undefined
  ): Promise<string> => {
    if (isSketchUpEnvironment()) return '/sketchup';
    if (!user) return '/demo';
    if (isSuperAdmin(user.email)) return '/dashboard';
    if (!user.uid) return '/demo';
    if (await isUserAdmin(user.uid, user.email)) return '/dashboard';

    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() as { plan?: string; displayName?: string } : {};
      const currentPlan = userData.plan;
      const currentDisplayName = userData.displayName;

      // enterprise_inquiries 최신 신청 1건 조회 → 그 status가 진실
      let truePlan: 'enterprise' | 'free' = 'free';
      let companyName: string | undefined;
      try {
        const q = query(
          collection(db, 'enterprise_inquiries'),
          where('uid', '==', user.uid)
        );
        const snap = await getDocs(q);
        const valid = snap.docs.filter((d) => (d.data().status as string) !== 'superseded');
        if (valid.length > 0) {
          const sorted = valid.slice().sort((a, b) => {
            const ta = (a.data().createdAt?.toMillis?.() ?? 0) as number;
            const tb = (b.data().createdAt?.toMillis?.() ?? 0) as number;
            return tb - ta;
          });
          const latest = sorted[0].data() as { status?: string; companyName?: string };
          if (latest.status === 'approved') truePlan = 'enterprise';
          companyName = latest.companyName;
        }
      } catch (e) {
        console.warn('enterprise_inquiries 조회 실패:', e);
      }

      // plan + displayName 자동 동기화
      // - plan: 승인 상태 진실 기준
      // - displayName: 기업회원이면 항상 회사명으로 (이미 가입된 회원도 자동 보정)
      const updates: Record<string, unknown> = {};
      if (currentPlan !== truePlan) {
        updates.plan = truePlan;
        updates.planUpdatedAt = new Date();
      }
      if (truePlan === 'enterprise' && companyName && currentDisplayName !== companyName) {
        updates.displayName = companyName;
      }
      if (Object.keys(updates).length > 0) {
        try {
          await setDoc(userRef, updates, { merge: true });
          // Firebase Auth user 객체 displayName도 동기화
          if (updates.displayName && auth.currentUser) {
            const { updateProfile } = await import('firebase/auth');
            await updateProfile(auth.currentUser, { displayName: updates.displayName as string }).catch(() => {});
          }
        } catch (e) {
          console.warn('plan/displayName 동기화 실패:', e);
        }
      }

      return truePlan === 'enterprise' ? '/dashboard' : '/demo';
    } catch {
      return '/demo';
    }
  };

  useEffect(() => {
    const checkRedirectResult = async () => {
      const result = await handleRedirectResult();
      if (result.user) {
        const path = await resolvePostLoginPath(result.user);
        navigate(path, { replace: true });
      } else if (result.error) {
        setError(result.error);
      }
    };
    checkRedirectResult();
  }, [navigate]);

  useEffect(() => {
    if (authLoading || !authUser) return;

    let cancelled = false;
    const redirectAuthenticatedUser = async () => {
      const path = await resolvePostLoginPath(authUser);
      if (!cancelled) {
        navigate(path, { replace: true });
      }
    };

    redirectAuthenticatedUser();
    return () => {
      cancelled = true;
    };
  }, [authUser, authLoading, navigate]);

  // SketchUp 외부 OAuth 위임 흐름의 토큰 수신 콜백 등록
  useEffect(() => {
    if (!isSketchUpEnvironment()) return;

    (window as any).__sketchupOAuthToken = async (
      payload: string | { idToken?: string; accessToken?: string }
    ) => {
      try {
        if (!auth) {
          setError('Firebase Auth가 초기화되지 않았습니다.');
          return;
        }

        // 구버전 호환: 문자열로 들어오면 idToken으로 간주
        const tokens = typeof payload === 'string'
          ? { idToken: payload, accessToken: undefined }
          : payload;

        const idToken = tokens.idToken || null;
        const accessToken = tokens.accessToken || null;

        if (!idToken && !accessToken) {
          throw new Error('구글 OAuth 토큰이 비어 있습니다.');
        }

        // GoogleAuthProvider.credential(idToken, accessToken)
        // 둘 중 하나만 있어도 Firebase가 처리 가능
        const credential = GoogleAuthProvider.credential(idToken, accessToken);
        const userCred = await signInWithCredential(auth, credential);
        if (userCred.user) {
          const path = await resolvePostLoginPath(userCred.user);
          navigate(path, { replace: true });
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
  }, [navigate]);

  const handleSubmit = async (data: {
    email: string;
    password: string;
    name?: string;
    isSignUp: boolean;
  }) => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = data.isSignUp
        ? await signUpWithEmail(data.email, data.password, data.name || '')
        : await signInWithEmail(data.email, data.password);

      if (result.error) {
        setError(result.error);
      } else if ('needsEmailVerification' in result && result.needsEmailVerification) {
        setNotice(result.message || '가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.');
      } else if (result.user) {
        onSuccess?.();
        const path = await resolvePostLoginPath(result.user);
        navigate(path, { replace: true });
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
        const path = await resolvePostLoginPath(result.user);
        navigate(path, { replace: true });
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
      notice={notice}
      loading={loading}
      googleLoading={googleLoading}
      defaultSignUp={defaultSignUp}
    />
  );
};
