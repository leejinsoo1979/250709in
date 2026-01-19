/**
 * 보링 계산기 통합 모듈
 */

// 힌지 계산기
export {
  calculateHingeCount,
  calculateHingePositions,
  calculateDoorCupBorings,
  calculateSidePanelScrewBorings,
  calculateHingeBorings,
  type HingeBoringParams,
  type HingeBoringResult,
} from './hingeCalculator';

// 캠락 계산기
export {
  calculateCamHousingBorings,
  calculateCamBoltBorings,
  calculateCamLockBorings,
  type CamLockBoringParams,
  type CamBoltBoringParams,
  type CamLockBoringResult,
} from './camLockCalculator';

// 선반핀 계산기
export {
  calculateShelfPinYPositions,
  calculateShelfPinXPositions,
  calculateShelfPinBorings,
  calculateShelfReceiverBorings,
  type ShelfPinBoringParams,
  type ShelfPinBoringResult,
} from './shelfPinCalculator';

// 서랍레일 계산기
export {
  calculateDrawerRailYPositions,
  calculateDrawerRailBorings,
  getDrawerRailInfo,
  calculateDrawerRailBoringCount,
  getRequiredToolDiameters,
  type DrawerRailBoringParams,
  type DrawerRailBoringResult,
} from './drawerRailCalculator';

// 조절발 계산기
export {
  calculateAdjustableFootPositions,
  calculateAdjustableFootBorings,
  getRecommendedFootCount,
  type AdjustableFootBoringParams,
  type AdjustableFootBoringResult,
} from './adjustableFootCalculator';

// 서랍 측판-앞뒤판 체결 계산기
export {
  calculateDrawerPanelConnectorBorings,
  DRAWER_CONNECTOR_DIAMETER,
  DRAWER_CONNECTOR_DEPTH,
  DRAWER_CONNECTOR_EDGE_OFFSET,
  type DrawerPanelConnectorParams,
  type DrawerPanelConnectorResult,
} from './drawerPanelConnectorCalculator';

// ============================================
// 통합 유틸리티
// ============================================

import type { Boring, BoringType } from '../types';

/**
 * 보링 ID 생성
 */
export function generateBoringId(type: BoringType, index: number, prefix?: string): string {
  const prefixStr = prefix ? `${prefix}-` : '';
  return `${prefixStr}${type}-${index}`;
}

/**
 * 보링 배열에서 타입별 개수 집계
 */
export function countBoringsByType(borings: Boring[]): Record<BoringType, number> {
  const counts: Partial<Record<BoringType, number>> = {};

  borings.forEach((boring) => {
    counts[boring.type] = (counts[boring.type] || 0) + 1;
  });

  return counts as Record<BoringType, number>;
}

/**
 * 보링 배열에서 면별 개수 집계
 */
export function countBoringsByFace(borings: Boring[]): Record<string, number> {
  const counts: Record<string, number> = {};

  borings.forEach((boring) => {
    counts[boring.face] = (counts[boring.face] || 0) + 1;
  });

  return counts;
}

/**
 * 보링 배열 ID 재생성
 */
export function reindexBorings(borings: Boring[], prefix?: string): Boring[] {
  return borings.map((boring, index) => ({
    ...boring,
    id: generateBoringId(boring.type, index + 1, prefix),
  }));
}

/**
 * 보링 배열 병합 및 ID 재생성
 */
export function mergeBorings(...boringArrays: Boring[][]): Boring[] {
  const merged = boringArrays.flat();
  return reindexBorings(merged);
}
