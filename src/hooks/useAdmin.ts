import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { checkAdminRole, isAdmin, isSuperAdmin, AdminRole, createAdmin } from '@/firebase/admin';

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

        // Firebase에서 관리자 권한 확인
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
