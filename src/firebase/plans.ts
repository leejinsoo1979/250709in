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
  // 사용량 제한
  credits: number; // 기본 크레딧
  maxProjects: number; // 최대 프로젝트 수 (-1: 무제한)
  maxDesigns: number; // 프로젝트당 최대 디자인 파일 수 (-1: 무제한)
  maxStorage: number; // 최대 스토리지 (bytes) (-1: 무제한)
  maxTeamMembers: number; // 최대 팀 멤버 수 (-1: 무제한)
}

// 플랜 정보
export const PLANS: Record<PlanType, PlanInfo> = {
  free: {
    type: 'free',
    name: '무료',
    color: '#6b7280',
    features: ['기본 기능', '1개 프로젝트', '프로젝트당 5개 디자인'],
    credits: 200,
    maxProjects: 1,
    maxDesigns: 5,
    maxStorage: 500 * 1024 * 1024, // 500MB
    maxTeamMembers: 1
  },
  basic: {
    type: 'basic',
    name: '베이직',
    color: '#3b82f6',
    features: ['기본 기능', '10개 프로젝트', '프로젝트당 20개 디자인', '팀 협업 (3명)'],
    credits: 1000,
    maxProjects: 10,
    maxDesigns: 20,
    maxStorage: 5 * 1024 * 1024 * 1024, // 5GB
    maxTeamMembers: 3
  },
  pro: {
    type: 'pro',
    name: '프로',
    color: '#8b5cf6',
    features: ['전체 기능', '무제한 프로젝트', '무제한 디자인', '팀 협업 (10명)', '우선 지원'],
    credits: 5000,
    maxProjects: -1, // 무제한
    maxDesigns: -1, // 무제한
    maxStorage: 50 * 1024 * 1024 * 1024, // 50GB
    maxTeamMembers: 10
  },
  enterprise: {
    type: 'enterprise',
    name: '엔터프라이즈',
    color: '#f59e0b',
    features: ['전체 기능', '무제한 프로젝트', '무제한 디자인', '무제한 팀원', '전담 지원', '커스텀 기능'],
    credits: 999999, // 사실상 무제한
    maxProjects: -1, // 무제한
    maxDesigns: -1, // 무제한
    maxStorage: -1, // 무제한
    maxTeamMembers: -1 // 무제한
  }
};

/**
 * 사용자 플랜 변경
 */
export async function updateUserPlan(userId: string, plan: PlanType): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const userProfileRef = doc(db, 'userProfiles', userId);

    // 새 플랜의 크레딧
    const newPlanCredits = PLANS[plan].credits;

    // users 컬렉션 업데이트
    await updateDoc(userRef, {
      plan,
      planUpdatedAt: new Date()
    });

    // userProfiles 컬렉션의 크레딧도 업데이트
    const userProfileDoc = await getDoc(userProfileRef);
    if (userProfileDoc.exists()) {
      await updateDoc(userProfileRef, {
        credits: newPlanCredits,
        updatedAt: new Date()
      });
      console.log('✅ 사용자 플랜 및 크레딧 변경 성공:', userId, plan, '크레딧:', newPlanCredits);
    } else {
      console.log('✅ 사용자 플랜 변경 성공 (프로필 없음):', userId, plan);
    }
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

/**
 * 플랜별 제한사항 가져오기
 */
export function getPlanLimits(plan: PlanType) {
  const planInfo = PLANS[plan] || PLANS.free;
  return {
    credits: planInfo.credits,
    maxProjects: planInfo.maxProjects,
    maxDesigns: planInfo.maxDesigns,
    maxStorage: planInfo.maxStorage,
    maxTeamMembers: planInfo.maxTeamMembers
  };
}

/**
 * 플랜 업그레이드 시 크레딧 추가 (기존 크레딧 + 플랜 크레딧)
 */
export function getCreditsForPlanUpgrade(newPlan: PlanType): number {
  return PLANS[newPlan]?.credits || 0;
}
