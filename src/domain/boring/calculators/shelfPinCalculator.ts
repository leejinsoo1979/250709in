/**
 * 선반핀 보링 계산기
 * 32mm 시스템 기준 / Ø5mm 깊이 12mm
 */

import type { Boring, ShelfPinSettings } from '../types';
import { DEFAULT_SHELF_PIN_SETTINGS, BORING_DIAMETERS, BORING_DEPTHS, SYSTEM_32MM } from '../constants';

// ============================================
// 타입
// ============================================

export interface ShelfPinBoringParams {
  panelHeight: number;     // 측판 높이 (mm)
  panelDepth: number;      // 측판 깊이 (mm)
  isLeftPanel: boolean;    // 좌측판 여부
  startHeight?: number;    // 시작 높이 (mm), 기본 37mm
  endMargin?: number;      // 상단 마진 (mm), 기본 37mm
  settings?: Partial<ShelfPinSettings>;
}

export interface ShelfPinBoringResult {
  borings: Boring[];
  rowCount: number;
  holeCount: number;
  yPositions: number[];    // Y 위치 배열
  xPositions: number[];    // X 위치 배열 (전면열, 후면열 등)
}

// ============================================
// Y 위치 계산 (수직 방향)
// ============================================

/**
 * 선반핀 Y 위치 계산
 * 32mm 피치 기준으로 시작점부터 끝점까지 배열
 */
export function calculateShelfPinYPositions(
  panelHeight: number,
  settings: ShelfPinSettings = DEFAULT_SHELF_PIN_SETTINGS
): number[] {
  const positions: number[] = [];
  const startY = settings.startHeight;
  const endY = panelHeight - settings.endMargin;

  for (let y = startY; y <= endY; y += settings.pitch) {
    positions.push(y);
  }

  return positions;
}

// ============================================
// X 위치 계산 (깊이 방향)
// ============================================

/**
 * 선반핀 X 위치 계산
 * 2열 또는 4열 기준
 */
export function calculateShelfPinXPositions(
  panelDepth: number,
  settings: ShelfPinSettings = DEFAULT_SHELF_PIN_SETTINGS
): number[] {
  const positions: number[] = [];

  // 전면열
  positions.push(settings.frontRowPosition);

  // 4열인 경우 중간열 추가
  if (settings.rowCount === 4) {
    const midFront = settings.frontRowPosition + SYSTEM_32MM.PITCH * 2;  // 37 + 64 = 101
    const midBack = panelDepth - settings.backRowPosition - SYSTEM_32MM.PITCH * 2;
    positions.push(midFront);
    positions.push(midBack);
  }

  // 후면열
  positions.push(panelDepth - settings.backRowPosition);

  return positions;
}

// ============================================
// 선반핀 보링 계산
// ============================================

/**
 * 측판 선반핀 보링 생성
 * - 보링면: 측판 내면 (좌측판→우측면, 우측판→좌측면)
 * - 직경: 5mm
 * - 깊이: 12mm
 */
export function calculateShelfPinBorings(params: ShelfPinBoringParams): ShelfPinBoringResult {
  const settings = { ...DEFAULT_SHELF_PIN_SETTINGS, ...params.settings };

  // 시작/종료 높이 오버라이드
  if (params.startHeight !== undefined) {
    settings.startHeight = params.startHeight;
  }
  if (params.endMargin !== undefined) {
    settings.endMargin = params.endMargin;
  }

  const yPositions = calculateShelfPinYPositions(params.panelHeight, settings);
  const xPositions = calculateShelfPinXPositions(params.panelDepth, settings);

  const borings: Boring[] = [];

  // 보링 면 결정
  // 좌측판: 우측면에 보링 (가구 내부 방향)
  // 우측판: 좌측면에 보링 (가구 내부 방향)
  const face = params.isLeftPanel ? 'right' : 'left';

  let boringIndex = 0;

  xPositions.forEach((xPos, xIndex) => {
    const rowName = getRowName(xIndex, xPositions.length);

    yPositions.forEach((yPos, yIndex) => {
      boringIndex++;
      borings.push({
        id: `shelf-pin-${boringIndex}`,
        type: 'shelf-pin' as const,
        face: face as const,
        x: xPos,
        y: yPos,
        diameter: BORING_DIAMETERS['shelf-pin'],
        depth: BORING_DEPTHS['shelf-pin'],
        note: `선반핀-${rowName}-${yIndex + 1}`,
      });
    });
  });

  return {
    borings,
    rowCount: xPositions.length,
    holeCount: borings.length,
    yPositions,
    xPositions,
  };
}

/**
 * 열 이름 생성
 */
function getRowName(index: number, total: number): string {
  if (total === 2) {
    return index === 0 ? '전면열' : '후면열';
  } else if (total === 4) {
    const names = ['전면열', '전면중간열', '후면중간열', '후면열'];
    return names[index] || `열${index + 1}`;
  }
  return `열${index + 1}`;
}

// ============================================
// 선반 고정용 보링 계산 (선반 자체)
// ============================================

/**
 * 선반 패널에 대한 핀 수용홀 계산
 * (선반 하면에 핀이 들어가는 홀)
 */
export function calculateShelfReceiverBorings(
  shelfWidth: number,
  shelfDepth: number,
  settings: ShelfPinSettings = DEFAULT_SHELF_PIN_SETTINGS
): Boring[] {
  const borings: Boring[] = [];
  const xPositions = calculateShelfPinXPositions(shelfDepth, settings);

  // 좌우 각 2개씩
  const edgeDistance = settings.frontRowPosition;  // 37mm

  xPositions.forEach((xPos, xIndex) => {
    const rowName = xIndex === 0 ? '전면' : '후면';

    // 좌측
    borings.push({
      id: `shelf-receiver-left-${rowName}`,
      type: 'shelf-pin' as const,
      face: 'bottom' as const,
      x: xPos,
      y: edgeDistance,
      diameter: BORING_DIAMETERS['shelf-pin'],
      depth: BORING_DEPTHS['shelf-pin'],
      note: `선반수용-좌측-${rowName}`,
    });

    // 우측
    borings.push({
      id: `shelf-receiver-right-${rowName}`,
      type: 'shelf-pin' as const,
      face: 'bottom' as const,
      x: xPos,
      y: shelfWidth - edgeDistance,
      diameter: BORING_DIAMETERS['shelf-pin'],
      depth: BORING_DEPTHS['shelf-pin'],
      note: `선반수용-우측-${rowName}`,
    });
  });

  return borings;
}

export default {
  calculateShelfPinYPositions,
  calculateShelfPinXPositions,
  calculateShelfPinBorings,
  calculateShelfReceiverBorings,
};
