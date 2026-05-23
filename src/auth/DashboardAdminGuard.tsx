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
// 캐시 사용 안 함: 관리자가 plan 변경 즉시 반영되도록 매번 Firestore 1회 read

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
      // 1) admins 컬렉션 체크 (이메일이 강제 일반사용자 목록이면 자동 false)
      let allowedFlag = await isUserAdmin(user.uid, user.email);
      // 2) 기업회원(plan: 'enterprise') 및 제조파트너사(users.isPartner)도 통과
      if (!allowedFlag) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userData = userDoc.exists() ? (userDoc.data() as { plan?: string; isPartner?: boolean }) : undefined;
          const plan = userData?.plan;
          if (plan === 'enterprise') allowedFlag = true;
          if (userData?.isPartner === true) allowedFlag = true;
        } catch {
          /* ignore */
        }
      }
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
