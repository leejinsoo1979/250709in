/**
 * 에디터/대시보드 접근 가드 (기업회원 + 관리자 전용)
 *
 * 통과 조건:
 *  - 슈퍼 관리자
 *  - admins 컬렉션에 등록된 관리자
 *  - users.plan === 'enterprise' (기업회원)
 *
 * 그 외:
 *  - 비로그인 → /login
 *  - 일반 사용자 → /demo 로 강제
 *
 * 결과는 sessionStorage에 캐싱하여 같은 세션 내 read 비용 최소화 (DashboardAdminGuard와 동일 키 공유)
 */

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { isSuperAdmin, isUserAdmin } from '@/firebase/admins';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// 캐시 사용 안 함: 관리자가 plan 변경 즉시 반영되도록 매번 Firestore 1회 read
// (본인 admin 문서 + users 문서 1개씩, 비용 미미)

export default function EnterpriseOrAdminGuard({ children }: { children: React.ReactNode }) {
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
      if (isSuperAdmin(user.email)) {
        if (!cancelled) {
          setAllowed(true);
          setChecking(false);
        }
        return;
      }
      // 1) admins 체크 (이메일이 강제 일반사용자 목록이면 자동 false)
      let allowedFlag = await isUserAdmin(user.uid, user.email);
      // 2) 기업회원 체크
      if (!allowedFlag) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const plan = userDoc.exists() ? (userDoc.data() as { plan?: string }).plan : undefined;
          if (plan === 'enterprise') allowedFlag = true;
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
    return () => { cancelled = true; };
  }, [user, authLoading]);

  if (authLoading || checking) {
    return <LoadingSpinner fullscreen message="확인 중..." />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to="/demo" replace />;
  return <>{children}</>;
}
