import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { checkAdminRole, isAdmin, isSuperAdmin, AdminRole } from '@/firebase/admin';

// 환경 변수에서 슈퍼 관리자 이메일 가져오기
const SUPER_ADMIN_EMAIL = import.meta.env.VITE_SUPER_ADMIN_EMAIL;

export const useAdmin = (user: User | null) => {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setAdminRole(null);
        setIsAdminUser(false);
        setIsSuperAdminUser(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1순위: 환경 변수의 슈퍼 관리자 이메일 확인 (프로젝트 소유자)
        if (SUPER_ADMIN_EMAIL && user.email === SUPER_ADMIN_EMAIL) {
          setAdminRole('super');
          setIsAdminUser(true);
          setIsSuperAdminUser(true);
          setLoading(false);
          return;
        }

        // 2순위: Firebase admins 컬렉션에서 권한 확인
        const role = await checkAdminRole(user.uid);
        const adminStatus = await isAdmin(user.uid);
        const superAdminStatus = await isSuperAdmin(user.uid);

        setAdminRole(role);
        setIsAdminUser(adminStatus);
        setIsSuperAdminUser(superAdminStatus);
      } catch (error) {
        console.error('관리자 권한 확인 오류:', error);
        setAdminRole(null);
        setIsAdminUser(false);
        setIsSuperAdminUser(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [user]);

  return {
    adminRole,
    isAdmin: isAdminUser,
    isSuperAdmin: isSuperAdminUser,
    loading
  };
};
