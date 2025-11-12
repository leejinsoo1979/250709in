import { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { checkAdminRole, isAdmin, isSuperAdmin, AdminRole } from '@/firebase/admin';

// 슈퍼 관리자 이메일 (프로젝트 소유자) - 항상 최고 권한
const SUPER_ADMIN_EMAIL = 'sbbc212@gmail.com';

export const useAdmin = (user: User | null) => {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // 이미 체크한 UID를 저장 (중복 체크 방지)
  const checkedUidRef = useRef<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      // user가 없으면 초기화
      if (!user) {
        setAdminRole(null);
        setIsAdminUser(false);
        setIsSuperAdminUser(false);
        setLoading(false);
        checkedUidRef.current = null;
        return;
      }

      // 이미 체크한 UID면 스킵 (무한 루프 방지)
      if (checkedUidRef.current === user.uid) {
        return;
      }

      checkedUidRef.current = user.uid;
      setLoading(true);

      try {
        // 1순위: 하드코딩된 슈퍼 관리자 이메일 체크
        if (user.email === SUPER_ADMIN_EMAIL) {
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
  }, [user?.uid, user?.email]);

  return {
    adminRole,
    isAdmin: isAdminUser,
    isSuperAdmin: isSuperAdminUser,
    loading
  };
};
