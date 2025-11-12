import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './config';

export type AdminRole = 'super' | 'admin' | 'support' | 'sales';

export interface Admin {
  userId: string;
  role: AdminRole;
  permissions: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 관리자 권한 확인
export const checkAdminRole = async (userId: string): Promise<AdminRole | null> => {
  try {
    const adminRef = doc(db, 'admins', userId);
    const adminDoc = await getDoc(adminRef);

    if (adminDoc.exists()) {
      const data = adminDoc.data() as Admin;
      return data.role;
    }

    return null;
  } catch (error) {
    console.error('관리자 권한 확인 오류:', error);
    return null;
  }
};

// 관리자 여부 확인
export const isAdmin = async (userId: string): Promise<boolean> => {
  const role = await checkAdminRole(userId);
  return role !== null;
};

// 슈퍼 관리자 여부 확인
export const isSuperAdmin = async (userId: string): Promise<boolean> => {
  const role = await checkAdminRole(userId);
  return role === 'super';
};

// 관리자 생성
export const createAdmin = async (
  userId: string,
  role: AdminRole,
  permissions: string[] = []
): Promise<void> => {
  try {
    const adminRef = doc(db, 'admins', userId);
    const admin: Admin = {
      userId,
      role,
      permissions,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await setDoc(adminRef, admin);
    console.log('✅ 관리자 생성 완료:', userId, role);
  } catch (error) {
    console.error('관리자 생성 오류:', error);
    throw error;
  }
};

// 관리자 역할 변경
export const updateAdminRole = async (
  userId: string,
  role: AdminRole
): Promise<void> => {
  try {
    const adminRef = doc(db, 'admins', userId);
    await updateDoc(adminRef, {
      role,
      updatedAt: serverTimestamp()
    });
    console.log('✅ 관리자 역할 변경 완료:', userId, role);
  } catch (error) {
    console.error('관리자 역할 변경 오류:', error);
    throw error;
  }
};

// 관리자 권한 추가
export const addAdminPermission = async (
  userId: string,
  permission: string
): Promise<void> => {
  try {
    const adminRef = doc(db, 'admins', userId);
    const adminDoc = await getDoc(adminRef);

    if (!adminDoc.exists()) {
      throw new Error('관리자를 찾을 수 없습니다.');
    }

    const currentPermissions = adminDoc.data().permissions || [];
    if (!currentPermissions.includes(permission)) {
      await updateDoc(adminRef, {
        permissions: [...currentPermissions, permission],
        updatedAt: serverTimestamp()
      });
      console.log('✅ 권한 추가 완료:', userId, permission);
    }
  } catch (error) {
    console.error('권한 추가 오류:', error);
    throw error;
  }
};

// 관리자 권한 제거
export const removeAdminPermission = async (
  userId: string,
  permission: string
): Promise<void> => {
  try {
    const adminRef = doc(db, 'admins', userId);
    const adminDoc = await getDoc(adminRef);

    if (!adminDoc.exists()) {
      throw new Error('관리자를 찾을 수 없습니다.');
    }

    const currentPermissions = adminDoc.data().permissions || [];
    await updateDoc(adminRef, {
      permissions: currentPermissions.filter((p: string) => p !== permission),
      updatedAt: serverTimestamp()
    });
    console.log('✅ 권한 제거 완료:', userId, permission);
  } catch (error) {
    console.error('권한 제거 오류:', error);
    throw error;
  }
};

// 관리자 삭제
export const deleteAdmin = async (userId: string): Promise<void> => {
  try {
    const adminRef = doc(db, 'admins', userId);
    await deleteDoc(adminRef);
    console.log('✅ 관리자 삭제 완료:', userId);
  } catch (error) {
    console.error('관리자 삭제 오류:', error);
    throw error;
  }
};

// 모든 관리자 목록 조회
export const getAllAdmins = async (): Promise<Admin[]> => {
  try {
    const adminsRef = collection(db, 'admins');
    const snapshot = await getDocs(adminsRef);

    return snapshot.docs.map((doc) => doc.data() as Admin);
  } catch (error) {
    console.error('관리자 목록 조회 오류:', error);
    return [];
  }
};

// 역할별 관리자 조회
export const getAdminsByRole = async (role: AdminRole): Promise<Admin[]> => {
  try {
    const adminsRef = collection(db, 'admins');
    const q = query(adminsRef, where('role', '==', role));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => doc.data() as Admin);
  } catch (error) {
    console.error('역할별 관리자 조회 오류:', error);
    return [];
  }
};
