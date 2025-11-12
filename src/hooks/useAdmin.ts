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

  // 마지막으로 체크한 user의 UID와 이메일 저장
  const lastCheckedUserRef = useRef<{ uid: string; email: string } | null>(null);

  useEffect(() => {
    // user가 없으면 초기화
    if (!user) {
      setAdminRole(null);
      setIsAdminUser(false);
      setIsSuperAdminUser(false);
      setLoading(false);
      lastCheckedUserRef.current = null;
      return;
    }

    // 같은 user는 다시 체크하지 않음 (무한 루프 방지)
    const currentUserKey = { uid: user.uid, email: user.email || '' };
    if (
      lastCheckedUserRef.current &&
      lastCheckedUserRef.current.uid === currentUserKey.uid &&
      lastCheckedUserRef.current.email === currentUserKey.email
    ) {
      return;
    }

    lastCheckedUserRef.current = currentUserKey;

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
