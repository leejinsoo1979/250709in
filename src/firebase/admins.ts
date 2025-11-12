/**
 * 관리자 권한 관리
 */

import { doc, setDoc, deleteDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './config';

export interface AdminData {
  email: string;
  displayName: string;
  role: 'admin' | 'support' | 'sales';
  grantedAt: Date;
  grantedBy: string; // 권한을 부여한 사람의 UID
}

/**
 * 관리자 권한 부여
 */
export async function grantAdminRole(userId: string, userData: { email: string; displayName: string }, grantedBy: string, role: 'admin' | 'support' | 'sales' = 'admin'): Promise<void> {
  try {
    const adminRef = doc(db, 'admins', userId);
    await setDoc(adminRef, {
      email: userData.email,
      displayName: userData.displayName,
      role: role,
      grantedAt: new Date(),
      grantedBy
    });
    console.log('✅ 관리자 권한 부여 성공:', userId, 'role:', role);
  } catch (error) {
    console.error('❌ 관리자 권한 부여 실패:', error);
    throw error;
  }
}

/**
 * 관리자 권한 해제
 */
export async function revokeAdminRole(userId: string): Promise<void> {
  try {
    const adminRef = doc(db, 'admins', userId);
    await deleteDoc(adminRef);
    console.log('✅ 관리자 권한 해제 성공:', userId);
  } catch (error) {
    console.error('❌ 관리자 권한 해제 실패:', error);
    throw error;
  }
}

/**
 * 사용자가 관리자인지 확인
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const adminRef = doc(db, 'admins', userId);
    const adminDoc = await getDoc(adminRef);
    return adminDoc.exists();
  } catch (error) {
    console.error('❌ 관리자 확인 실패:', error);
    return false;
  }
}

/**
 * 모든 관리자 목록 가져오기
 */
export async function getAllAdmins(): Promise<Map<string, AdminData>> {
  try {
    const adminsRef = collection(db, 'admins');
    const snapshot = await getDocs(adminsRef);

    const adminsMap = new Map<string, AdminData>();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      adminsMap.set(doc.id, {
        email: data.email,
        displayName: data.displayName,
        role: data.role || 'admin',
        grantedAt: data.grantedAt?.toDate?.() || new Date(),
        grantedBy: data.grantedBy
      });
    });

    return adminsMap;
  } catch (error) {
    console.error('❌ 관리자 목록 조회 실패:', error);
    return new Map();
  }
}

/**
 * 슈퍼 관리자 이메일 가져오기
 */
export function getSuperAdminEmail(): string {
  return import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'sbbc212@gmail.com';
}

/**
 * 사용자가 슈퍼 관리자인지 확인
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email === getSuperAdminEmail();
}
