/**
 * Auth Service - Firebase Auth 래퍼
 * Firebase Auth 직접 접근을 추상화하여 서비스 계층에서 사용
 */

import { getCurrentUserAsync } from '@/firebase/auth';
import { User } from 'firebase/auth';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * 현재 로그인된 사용자 가져오기
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const user = await getCurrentUserAsync();
  
  if (!user) {
    return null;
  }
  
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL
  };
}

/**
 * 사용자 인증 여부 확인
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}

/**
 * 사용자 UID 가져오기
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.uid || null;
}

/**
 * 권한 검사 헬퍼
 */
export async function checkPermission(
  resourceOwnerId: string
): Promise<boolean> {
  const currentUserId = await getCurrentUserId();
  
  if (!currentUserId) {
    return false;
  }
  
  return currentUserId === resourceOwnerId;
}

/**
 * 관리자 권한 검사 (향후 확장 가능)
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  
  if (!user) {
    return false;
  }
  
  // 향후 관리자 권한 로직 추가 가능
  // 예: custom claims, Firestore의 admin 컬렉션 체크 등
  return false;
}