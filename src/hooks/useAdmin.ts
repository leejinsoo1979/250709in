import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';

// 슈퍼 관리자 이메일 (프로젝트 소유자)
const SUPER_ADMIN_EMAIL = 'sbbc212@gmail.com';

export type AdminRole = 'super' | 'admin' | 'support' | 'sales';

export const useAdmin = (user: User | null) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user || !user.email) {
        console.log('🔐 useAdmin: user 없음');
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setAdminRole(null);
        setLoading(false);
        return;
      }

      try {
        // 슈퍼 관리자 체크
        const isSuperAdminUser = user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim();

        if (isSuperAdminUser) {
          console.log('🔐 useAdmin: 슈퍼 관리자');
          setIsAdmin(true);
          setIsSuperAdmin(true);
          setAdminRole('super');
          setLoading(false);
          return;
        }

        // Firestore admins 컬렉션 체크
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));

        if (adminDoc.exists()) {
          const adminData = adminDoc.data();
          console.log('🔐 useAdmin: 관리자 권한 확인됨', { uid: user.uid, role: adminData.role });
          setIsAdmin(true);
          setIsSuperAdmin(false);
          setAdminRole(adminData.role || 'admin');
        } else {
          console.log('🔐 useAdmin: 관리자 권한 없음', { uid: user.uid });
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setAdminRole(null);
        }
      } catch (error) {
        console.error('🔐 useAdmin: 권한 체크 실패', error);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setAdminRole(null);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user?.uid, user?.email]);

  return {
    adminRole,
    isAdmin,
    isSuperAdmin,
    loading
  };
};
