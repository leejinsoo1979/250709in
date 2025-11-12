import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';

// 슈퍼 관리자 UID (Firebase 프로젝트 소유자)
const SUPER_ADMIN_UID = 'YOUR_UID_HERE'; // TODO: 실제 UID로 교체

export type AdminRole = 'super' | 'admin' | 'support' | 'sales';

export const useAdmin = (user: User | null) => {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!user) {
      setAdminRole(null);
      setIsAdminUser(false);
      setIsSuperAdminUser(false);
      setLoading(false);
      return;
    }

    // 개발 환경에서 현재 사용자 UID 출력
    if (import.meta.env.DEV) {
      console.log('=== 현재 로그인 사용자 정보 ===');
      console.log('UID:', user.uid);
      console.log('Email:', user.email);
      console.log('Display Name:', user.displayName);
      console.log('==========================');
      console.log('위 UID를 src/hooks/useAdmin.ts의 SUPER_ADMIN_UID에 복사하세요!');
    }

    // UID 기반 슈퍼 관리자 체크 (하드코딩)
    const isSuperAdmin = user.uid === SUPER_ADMIN_UID;

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
