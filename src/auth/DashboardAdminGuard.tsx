import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { isSuperAdmin, isUserAdmin } from '@/firebase/admins';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import LoadingSpinner from '@/components/common/LoadingSpinner';

/**
 * /dashboard 접근 가드
 * - 비로그인: /login
 * - 슈퍼 관리자 또는 admins 컬렉션에 등록된 관리자: 통과
 * - 그 외 일반 사용자: /demo 로 강제 이동
 *
 * Firestore admins 문서 read 결과는 sessionStorage에 캐싱 (탭 닫기 전까지 유지)
 * → 같은 사용자가 /dashboard 여러 번 진입해도 read는 1회만 발생
 */
const CACHE_KEY_PREFIX = 'dashboard_access_check_v2_';

function getCachedAdminFlag(uid: string): boolean | null {
  try {
    const v = sessionStorage.getItem(CACHE_KEY_PREFIX + uid);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch {
    return null;
  }
}

function setCachedAdminFlag(uid: string, allowed: boolean) {
  try {
    sessionStorage.setItem(CACHE_KEY_PREFIX + uid, allowed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export default function DashboardAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (authLoading) return;
      if (!user) {
        if (!cancelled) {
          setAllowed(false);
          setChecking(false);
        }
        return;
      }
      // 슈퍼관리자: read 없이 즉시 통과
      if (isSuperAdmin(user.email)) {
        if (!cancelled) {
          setAllowed(true);
          setChecking(false);
        }
        return;
      }
      // 캐시 확인 — 있으면 Firestore read 스킵
      const cached = getCachedAdminFlag(user.uid);
      if (cached !== null) {
        if (!cancelled) {
          setAllowed(cached);
          setChecking(false);
        }
        return;
      }
      // 캐시 미스 시에만 Firestore read
      // 1) admins 컬렉션 체크
      let allowedFlag = await isUserAdmin(user.uid);
      // 2) 기업회원(plan: 'enterprise') 도 통과
      if (!allowedFlag) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const plan = userDoc.exists() ? (userDoc.data() as { plan?: string }).plan : undefined;
          if (plan === 'enterprise') allowedFlag = true;
        } catch {
          /* ignore */
        }
      }
      setCachedAdminFlag(user.uid, allowedFlag);
      if (!cancelled) {
        setAllowed(allowedFlag);
        setChecking(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading || checking) {
    return <LoadingSpinner fullscreen message="확인 중..." />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to="/demo" replace />;
  return <>{children}</>;
}
