import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { isSuperAdmin, isUserAdmin } from '@/firebase/admins';
import LoadingSpinner from '@/components/common/LoadingSpinner';

/**
 * /dashboard 접근 가드
 * - 비로그인: /login
 * - 슈퍼 관리자 또는 admins 컬렉션에 등록된 관리자: 통과
 * - 그 외 일반 사용자: /demo 로 강제 이동
 */
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
      if (isSuperAdmin(user.email)) {
        if (!cancelled) {
          setAllowed(true);
          setChecking(false);
        }
        return;
      }
      const adminFlag = await isUserAdmin(user.uid);
      if (!cancelled) {
        setAllowed(adminFlag);
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
