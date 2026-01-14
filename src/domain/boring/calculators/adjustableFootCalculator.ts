/**
 * 조절발 보링 계산기
 * 하부장 하판 하면 기준 / Ø10mm 깊이 15mm
 */

import type { Boring, AdjustableFootSettings } from '../types';
import { DEFAULT_ADJUSTABLE_FOOT_SETTINGS, BORING_DIAMETERS, BORING_DEPTHS } from '../constants';

// ============================================
// 타입
// ============================================

export interface AdjustableFootBoringParams {
  panelWidth: number;      // 하판 너비 (mm)
  panelDepth: number;      // 하판 깊이 (mm)
  settings?: Partial<AdjustableFootSettings>;
}

export interface AdjustableFootBoringResult {
  borings: Boring[];
  footCount: number;
  positions: Array<{ x: number; y: number }>;
}

// ============================================
// 조절발 위치 계산
// ============================================

/**
 * 조절발 위치 계산
 * 4개 또는 6개 배치
 */
export function calculateAdjustableFootPositions(
  panelWidth: number,
  panelDepth: number,
  settings: AdjustableFootSettings = DEFAULT_ADJUSTABLE_FOOT_SETTINGS
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const inset = settings.insetFromEdge;

  if (settings.count === 4) {
    // 4개: 네 모서리
    positions.push({ x: inset, y: inset });                           // 좌측 전면
    positions.push({ x: panelWidth - inset, y: inset });              // 우측 전면
    positions.push({ x: inset, y: panelDepth - inset });              // 좌측 후면
    positions.push({ x: panelWidth - inset, y: panelDepth - inset }); // 우측 후면
  } else if (settings.count === 6) {
    // 6개: 네 모서리 + 중앙 2개
    positions.push({ x: inset, y: inset });                           // 좌측 전면
    positions.push({ x: panelWidth / 2, y: inset });                  // 중앙 전면
    positions.push({ x: panelWidth - inset, y: inset });              // 우측 전면
    positions.push({ x: inset, y: panelDepth - inset });              // 좌측 후면
    positions.push({ x: panelWidth / 2, y: panelDepth - inset });     // 중앙 후면
    positions.push({ x: panelWidth - inset, y: panelDepth - inset }); // 우측 후면
  }

  return positions;
}

// ============================================
// 조절발 보링 계산
// ============================================

/**
 * 하판 조절발 보링 생성
 * - 보링면: 하면 (bottom)
 * - 직경: 10mm
 * - 깊이: 15mm
 */
export function calculateAdjustableFootBorings(
  params: AdjustableFootBoringParams
): AdjustableFootBoringResult {
  const settings = { ...DEFAULT_ADJUSTABLE_FOOT_SETTINGS, ...params.settings };
  const positions = calculateAdjustableFootPositions(
    params.panelWidth,
    params.panelDepth,
    settings
  );

  const borings: Boring[] = positions.map((pos, index) => {
    const posName = getPositionName(index, settings.count);
    return {
      id: `adjustable-foot-${index + 1}`,
      type: 'adjustable-foot' as const,
      face: 'bottom' as const,
      x: pos.x,
      y: pos.y,
      diameter: BORING_DIAMETERS['adjustable-foot'],
      depth: BORING_DEPTHS['adjustable-foot'],
      note: `조절발-${posName}`,
    };
  });

  return {
    borings,
    footCount: settings.count,
    positions,
  };
}

/**
 * 위치 이름 생성
 */
function getPositionName(index: number, count: 4 | 6): string {
  if (count === 4) {
    const names = ['좌전', '우전', '좌후', '우후'];
    return names[index] || `${index + 1}`;
  } else {
    const names = ['좌전', '중전', '우전', '좌후', '중후', '우후'];
    return names[index] || `${index + 1}`;
  }
}

// ============================================
// 유틸리티
// ============================================

/**
 * 패널 크기에 따른 권장 조절발 개수
 */
export function getRecommendedFootCount(
  panelWidth: number,
  panelDepth: number
): 4 | 6 {
  // 폭이 800mm 이상이면 6개 권장
  if (panelWidth >= 800) {
    return 6;
  }
  return 4;
}

export default {
  calculateAdjustableFootPositions,
  calculateAdjustableFootBorings,
  getRecommendedFootCount,
};
