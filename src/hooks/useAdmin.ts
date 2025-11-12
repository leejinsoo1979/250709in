import { useMemo } from 'react';
import { User } from 'firebase/auth';

// 슈퍼 관리자 이메일 (프로젝트 소유자)
const SUPER_ADMIN_EMAIL = 'sbbc212@gmail.com';

export type AdminRole = 'super' | 'admin' | 'support' | 'sales';

export const useAdmin = (user: User | null) => {
  const result = useMemo(() => {
    if (!user || !user.email) {
      return {
        adminRole: null,
        isAdmin: false,
        isSuperAdmin: false,
        loading: false
      };
    }

    const isSuperAdmin = user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim();

    return {
      adminRole: isSuperAdmin ? ('super' as AdminRole) : null,
      isAdmin: isSuperAdmin,
      isSuperAdmin: isSuperAdmin,
      loading: false
    };
  }, [user?.email]);

  return result;
};
