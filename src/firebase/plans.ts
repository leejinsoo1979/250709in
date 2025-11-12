/**
 * 사용자 플랜 관리
 */

import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from './config';

// 플랜 타입 정의
export type PlanType = 'free' | 'basic' | 'pro' | 'enterprise';

export interface PlanInfo {
  type: PlanType;
  name: string;
  color: string;
  features: string[];
}

// 플랜 정보
export const PLANS: Record<PlanType, PlanInfo> = {
  free: {
    type: 'free',
    name: '무료',
    color: '#6b7280',
    features: ['기본 기능', '1개 프로젝트']
  },
  basic: {
    type: 'basic',
    name: '베이직',
    color: '#3b82f6',
    features: ['기본 기능', '10개 프로젝트', '팀 협업']
  },
  pro: {
    type: 'pro',
    name: '프로',
    color: '#8b5cf6',
    features: ['전체 기능', '무제한 프로젝트', '우선 지원']
  },
  enterprise: {
    type: 'enterprise',
    name: '엔터프라이즈',
    color: '#f59e0b',
    features: ['전체 기능', '무제한 프로젝트', '전담 지원', '커스텀 기능']
  }
};

/**
 * 사용자 플랜 변경
 */
export async function updateUserPlan(userId: string, plan: PlanType): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      plan,
      planUpdatedAt: new Date()
    });
    console.log('✅ 사용자 플랜 변경 성공:', userId, plan);
  } catch (error) {
    console.error('❌ 사용자 플랜 변경 실패:', error);
    throw error;
  }
}

/**
 * 사용자 플랜 조회
 */
export async function getUserPlan(userId: string): Promise<PlanType> {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return 'free'; // 기본값
    }

    return (userDoc.data().plan as PlanType) || 'free';
  } catch (error) {
    console.error('❌ 사용자 플랜 조회 실패:', error);
    return 'free';
  }
}

/**
 * 플랜 이름 가져오기
 */
export function getPlanName(plan: PlanType): string {
  return PLANS[plan]?.name || '무료';
}

/**
 * 플랜 색상 가져오기
 */
export function getPlanColor(plan: PlanType): string {
  return PLANS[plan]?.color || '#6b7280';
}
