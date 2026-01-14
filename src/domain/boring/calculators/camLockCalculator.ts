/**
 * 캠락 보링 계산기
 * 캠 하우징 Ø15mm / 캠 볼트홀 Ø5mm 기준
 */

import type { Boring, CamLockSettings } from '../types';
import { DEFAULT_CAM_LOCK_SETTINGS, BORING_DIAMETERS, BORING_DEPTHS } from '../constants';

// ============================================
// 타입
// ============================================

export interface CamLockBoringParams {
  panelWidth: number;      // 패널 너비 (상판/하판의 경우 가구 내부 폭)
  panelDepth: number;      // 패널 깊이
  settings?: Partial<CamLockSettings>;
}

export interface CamBoltBoringParams {
  panelHeight: number;     // 측판 높이
  panelDepth: number;      // 측판 깊이
  isLeftPanel: boolean;    // 좌측판 여부
  hasTopConnection: boolean;   // 상판 연결 여부
  hasBottomConnection: boolean; // 하판 연결 여부
  settings?: Partial<CamLockSettings>;
}

export interface CamLockBoringResult {
  housingBorings: Boring[];  // 캠 하우징 보링 (상판/하판)
  boltBorings: Boring[];     // 캠 볼트홀 보링 (측판)
}

// ============================================
// 캠 하우징 위치 계산 (상판/하판)
// ============================================

/**
 * 캠 하우징 X 위치 계산
 * 좌우 끝에서 edgeDistance 위치에 배치
 */
function calculateCamHousingXPositions(
  panelWidth: number,
  settings: CamLockSettings
): number[] {
  return [
    settings.edgeDistance,                    // 좌측
    panelWidth - settings.edgeDistance,       // 우측
  ];
}

/**
 * 캠 하우징 Y 위치 계산
 * positions 배열에 정의된 위치 사용
 */
function calculateCamHousingYPositions(
  settings: CamLockSettings
): number[] {
  return settings.positions;  // [37, 69] 기본값
}

// ============================================
// 캠 하우징 보링 계산 (상판/하판)
// ============================================

/**
 * 상판/하판 캠 하우징 보링 생성
 * - 보링면: 하면 (상판) 또는 상면 (하판)
 * - 직경: 15mm
 * - 깊이: 12mm
 */
export function calculateCamHousingBorings(
  params: CamLockBoringParams,
  isTopPanel: boolean  // true: 상판, false: 하판
): Boring[] {
  const settings = { ...DEFAULT_CAM_LOCK_SETTINGS, ...params.settings };
  const xPositions = calculateCamHousingXPositions(params.panelWidth, settings);
  const yPositions = calculateCamHousingYPositions(settings);

  const borings: Boring[] = [];

  // 보링 면: 상판은 하면, 하판은 상면
  const face = isTopPanel ? 'bottom' : 'top';
  const panelName = isTopPanel ? '상판' : '하판';

  xPositions.forEach((xPos, xIndex) => {
    const side = xIndex === 0 ? '좌' : '우';

    yPositions.forEach((yPos, yIndex) => {
      const row = yIndex === 0 ? '전면' : '후면';

      borings.push({
        id: `cam-housing-${panelName}-${side}-${row}`,
        type: 'cam-housing' as const,
        face: face as const,
        x: xPos,
        y: yPos,
        diameter: BORING_DIAMETERS['cam-housing'],
        depth: BORING_DEPTHS['cam-housing'],
        note: `캠하우징-${side}측-${row}`,
      });
    });
  });

  return borings;
}

// ============================================
// 캠 볼트홀 보링 계산 (측판)
// ============================================

/**
 * 측판 캠 볼트홀 보링 생성
 * - 보링면: 상단 가장자리(front) 또는 하단 가장자리(back)
 * - 직경: 5mm
 * - 깊이: 34mm (측판 방향으로 진입)
 */
export function calculateCamBoltBorings(params: CamBoltBoringParams): Boring[] {
  const settings = { ...DEFAULT_CAM_LOCK_SETTINGS, ...params.settings };
  const borings: Boring[] = [];

  // X 위치 (패널 깊이 방향)
  const xPositions = settings.positions;  // [37, 69]

  // 상판 연결부 캠볼트 (측판 상단)
  if (params.hasTopConnection) {
    xPositions.forEach((xPos, index) => {
      const row = index === 0 ? '전면' : '후면';
      borings.push({
        id: `cam-bolt-top-${row}`,
        type: 'cam-bolt' as const,
        face: 'top' as const,  // 측판 상단 가장자리
        x: xPos,
        y: settings.boltEdgeDistance,  // 상단 가장자리에서 8mm
        diameter: BORING_DIAMETERS['cam-bolt'],
        depth: BORING_DEPTHS['cam-bolt'],
        note: `캠볼트-상단-${row}`,
      });
    });
  }

  // 하판 연결부 캠볼트 (측판 하단)
  if (params.hasBottomConnection) {
    xPositions.forEach((xPos, index) => {
      const row = index === 0 ? '전면' : '후면';
      borings.push({
        id: `cam-bolt-bottom-${row}`,
        type: 'cam-bolt' as const,
        face: 'bottom' as const,  // 측판 하단 가장자리
        x: xPos,
        y: settings.boltEdgeDistance,  // 하단 가장자리에서 8mm
        diameter: BORING_DIAMETERS['cam-bolt'],
        depth: BORING_DEPTHS['cam-bolt'],
        note: `캠볼트-하단-${row}`,
      });
    });
  }

  return borings;
}

// ============================================
// 통합 계산
// ============================================

/**
 * 캠락 전체 보링 계산
 */
export function calculateCamLockBorings(
  housingParams: CamLockBoringParams,
  boltParams: CamBoltBoringParams
): CamLockBoringResult {
  const topHousingBorings = calculateCamHousingBorings(housingParams, true);
  const bottomHousingBorings = calculateCamHousingBorings(housingParams, false);
  const boltBorings = calculateCamBoltBorings(boltParams);

  return {
    housingBorings: [...topHousingBorings, ...bottomHousingBorings],
    boltBorings,
  };
}

export default {
  calculateCamHousingBorings,
  calculateCamBoltBorings,
  calculateCamLockBorings,
};
