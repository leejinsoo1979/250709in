import { useMemo } from 'react';
import { User } from 'firebase/auth';

// 슈퍼 관리자 이메일 (프로젝트 소유자)
const SUPER_ADMIN_EMAIL = 'sbbc212@gmail.com';

export type AdminRole = 'super' | 'admin' | 'support' | 'sales';

export const useAdmin = (user: User | null) => {
  // 단순 계산 - 이메일만 체크
  const isAdmin = useMemo(() => {
    return user?.email === SUPER_ADMIN_EMAIL;
  }, [user?.email]);

  return {
    adminRole: isAdmin ? ('super' as AdminRole) : null,
    isAdmin,
    isSuperAdmin: isAdmin,
    loading: false
  };
};
