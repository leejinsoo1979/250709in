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

  // 마지막으로 체크한 UID 저장
  const lastCheckedUid = useRef<string>('');

  useEffect(() => {
    // user가 없으면 초기화
    if (!user) {
      setAdminRole(null);
      setIsAdminUser(false);
      setIsSuperAdminUser(false);
      setLoading(false);
      lastCheckedUid.current = '';
      return;
    }

    // 같은 UID는 다시 체크하지 않음 (무한 루프 방지)
    if (lastCheckedUid.current === user.uid) {
      return;
    }

    lastCheckedUid.current = user.uid;

    // 슈퍼 관리자 이메일 체크 (단순 비교)
    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

    console.log('👤 로그인 이메일:', user.email);
    console.log('🔑 슈퍼 관리자:', isSuperAdmin ? 'YES' : 'NO');

    setAdminRole(isSuperAdmin ? 'super' : null);
    setIsAdminUser(isSuperAdmin);
    setIsSuperAdminUser(isSuperAdmin);
    setLoading(false);
  }, [user?.uid]);

  return {
    adminRole,
    isAdmin: isAdminUser,
    isSuperAdmin: isSuperAdminUser,
    loading
  };
};
