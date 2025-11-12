import { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';

// 슈퍼 관리자 이메일 (프로젝트 소유자)
const SUPER_ADMIN_EMAIL = 'sbbc212@gmail.com';

export type AdminRole = 'super' | 'admin' | 'support' | 'sales';

export const useAdmin = (user: User | null) => {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // 이미 체크했는지 여부 (한 번만 실행)
  const hasChecked = useRef<boolean>(false);

  useEffect(() => {
    // user가 없으면 초기화
    if (!user) {
      if (hasChecked.current) {
        setAdminRole(null);
        setIsAdminUser(false);
        setIsSuperAdminUser(false);
        setLoading(false);
        hasChecked.current = false;
      }
      return;
    }

    // 이미 체크했으면 스킵 (무한 루프 방지)
    if (hasChecked.current) {
      return;
    }

    hasChecked.current = true;

    // 슈퍼 관리자 이메일 체크
    const userEmail = user.email?.toLowerCase().trim() || '';
    const adminEmail = SUPER_ADMIN_EMAIL.toLowerCase().trim();
    const isSuperAdmin = userEmail === adminEmail;

    console.log('🔐 Admin Check - Email:', user.email, '/ Super Admin:', isSuperAdmin);

    setAdminRole(isSuperAdmin ? 'super' : null);
    setIsAdminUser(isSuperAdmin);
    setIsSuperAdminUser(isSuperAdmin);
    setLoading(false);
  }, [user]);

  return {
    adminRole,
    isAdmin: isAdminUser,
    isSuperAdmin: isSuperAdminUser,
    loading
  };
};
