/**
 * 힌지 보링 계산기
 * Blum CLIP top BLUMOTION / Full Overlay / 나사고정 기준
 */

import type { Boring, BlumClipTopSettings } from '../types';
import { DEFAULT_HINGE_SETTINGS, BORING_DIAMETERS, BORING_DEPTHS } from '../constants';

// ============================================
// 타입
// ============================================

export interface HingeBoringParams {
  doorHeight: number;
  doorWidth: number;
  isLeftHinge: boolean;  // 왼쪽 힌지 여부 (도어 기준)
  settings?: Partial<BlumClipTopSettings>;
}

export interface HingeBoringResult {
  cupBorings: Boring[];     // 도어 힌지컵 보링
  screwBorings: Boring[];   // 측판 마운팅 나사홀 보링
  hingeCount: number;
  hingePositions: number[]; // Y 위치 (하단부터)
}

export interface HingeShelfAvoidanceOptions {
  clearanceMm?: number;
  minMarginMm?: number;
  maxMarginMm?: number;
}

export interface HingeShelfCollisionRange {
  bottomMm: number;
  topMm: number;
}

// ============================================
// 힌지 개수 계산
// ============================================

/**
 * 도어 높이에 따른 힌지 개수 계산
 */
export function calculateHingeCount(
  doorHeight: number,
  settings: BlumClipTopSettings = DEFAULT_HINGE_SETTINGS
): number {
  if (doorHeight < settings.minDoorHeightFor3Hinges) {
    return 2;
  } else if (doorHeight < settings.minDoorHeightFor4Hinges) {
    return 3;
  } else if (doorHeight < settings.minDoorHeightFor5Hinges) {
    return 4;
  } else {
    return 5;
  }
}

// ============================================
// 힌지 위치 계산
// ============================================

/**
 * 힌지 Y 위치 계산 (하단부터)
 */
export function calculateHingePositions(
  doorHeight: number,
  settings: BlumClipTopSettings = DEFAULT_HINGE_SETTINGS
): number[] {
  const hingeCount = calculateHingeCount(doorHeight, settings);
  const margin = settings.topBottomMargin;
  const positions: number[] = [];

  if (hingeCount === 2) {
    // 2개: 상단, 하단
    positions.push(margin);                    // 하단
    positions.push(doorHeight - margin);       // 상단
  } else {
    // 3개 이상: 균등 배치
    const spacing = (doorHeight - 2 * margin) / (hingeCount - 1);
    for (let i = 0; i < hingeCount; i++) {
      positions.push(margin + spacing * i);
    }
  }

  return positions;
}

export function avoidHingePositionsForShelves(
  hingePositions: number[],
  shelfPositions: Array<number | HingeShelfCollisionRange> = [],
  doorHeight: number,
  options: HingeShelfAvoidanceOptions = {}
): number[] {
  if (!Array.isArray(hingePositions) || hingePositions.length === 0) return [];
  const clearance = options.clearanceMm ?? 50;
  const minY = options.minMarginMm ?? DEFAULT_HINGE_SETTINGS.topBottomMargin;
  const maxY = doorHeight - (options.maxMarginMm ?? DEFAULT_HINGE_SETTINGS.topBottomMargin);
  const shelves = shelfPositions
    .map(position => {
      if (typeof position === 'number') {
        return Number.isFinite(position)
          ? { bottomMm: position, topMm: position }
          : null;
      }

      if (!position || !Number.isFinite(position.bottomMm) || !Number.isFinite(position.topMm)) {
        return null;
      }

      return {
        bottomMm: Math.min(position.bottomMm, position.topMm),
        topMm: Math.max(position.bottomMm, position.topMm),
      };
    })
    .filter((position): position is HingeShelfCollisionRange => position !== null)
    .sort((a, b) => a.bottomMm - b.bottomMm);

  if (shelves.length === 0 || maxY <= minY) {
    return hingePositions.map(position => Math.round(position * 1000) / 1000);
  }

  const collidesWithShelf = (position: number) => (
    shelves.some(shelf => {
      if (position < shelf.bottomMm) return shelf.bottomMm - position < clearance;
      if (position > shelf.topMm) return position - shelf.topMm < clearance;
      return true;
    })
  );
  const clamp = (position: number) => Math.max(minY, Math.min(maxY, position));
  const getCollision = (position: number) => (
    shelves.find(shelf => {
      if (position < shelf.bottomMm) return shelf.bottomMm - position < clearance;
      if (position > shelf.topMm) return position - shelf.topMm < clearance;
      return true;
    })
  );

  return hingePositions
    .map(originalPosition => {
      let position = originalPosition;

      for (let attempt = 0; attempt < shelves.length + 2; attempt += 1) {
        const shelf = getCollision(position);
        if (shelf === undefined) break;

        const below = shelf.bottomMm - clearance;
        const above = shelf.topMm + clearance;
        const shelfCenter = (shelf.bottomMm + shelf.topMm) / 2;
        const preferredBelow = position < shelfCenter || (position === shelfCenter && position <= doorHeight / 2);
        const candidates = preferredBelow ? [below, above] : [above, below];
        const validCandidates = candidates
          .map(clamp)
          .filter(candidate => !collidesWithShelf(candidate));

        position = validCandidates.length > 0
          ? validCandidates.sort((a, b) => Math.abs(a - originalPosition) - Math.abs(b - originalPosition))[0]
          : clamp(candidates[0]);
      }

      return Math.round(position * 1000) / 1000;
    })
    .sort((a, b) => a - b);
}

// ============================================
// 도어 힌지컵 보링 계산
// ============================================

/**
 * 도어 힌지컵 보링 생성
 * - 보링면: 후면 (back)
 * - 직경: 35mm
 * - 깊이: 13mm
 */
export function calculateDoorCupBorings(
  params: HingeBoringParams
): Boring[] {
  const settings = { ...DEFAULT_HINGE_SETTINGS, ...params.settings };
  const positions = calculateHingePositions(params.doorHeight, settings);

  // X 위치: 도어 가장자리에서 3mm
  const xPosition = params.isLeftHinge
    ? settings.cupEdgeDistance  // 좌측힌지: 왼쪽 가장자리
    : params.doorWidth - settings.cupEdgeDistance;  // 우측힌지: 오른쪽 가장자리

  return positions.map((yPos, index) => ({
    id: `hinge-cup-${index + 1}`,
    type: 'hinge-cup' as const,
    face: 'back' as const,  // 도어 후면에 가공
    x: xPosition,
    y: yPos,
    diameter: BORING_DIAMETERS['hinge-cup'],
    depth: BORING_DEPTHS['hinge-cup'],
    note: `힌지컵-${index === 0 ? '하단' : index === positions.length - 1 ? '상단' : `중간${index}`}`,
  }));
}

// ============================================
// 측판 마운팅 나사홀 보링 계산
// ============================================

/**
 * 측판 힌지 마운팅 플레이트 나사홀 보링 생성
 * - 보링면: 우측 또는 좌측 (측판 내면)
 * - 직경: 2.5mm
 * - 깊이: 12mm
 * - 나사홀 2개 (32mm 간격)
 */
export function calculateSidePanelScrewBorings(
  sidePanelHeight: number,
  isLeftPanel: boolean,
  params: Partial<HingeBoringParams> = {}
): Boring[] {
  const settings = { ...DEFAULT_HINGE_SETTINGS, ...params.settings };
  const positions = calculateHingePositions(sidePanelHeight, settings);

  const borings: Boring[] = [];

  // 보링 면 결정
  // 좌측판: 우측면에 보링 (가구 내부 방향)
  // 우측판: 좌측면에 보링 (가구 내부 방향)
  const face = isLeftPanel ? 'right' : 'left';

  positions.forEach((yPos, hingeIndex) => {
    // 첫 번째 나사홀
    borings.push({
      id: `hinge-screw-${hingeIndex + 1}-1`,
      type: 'hinge-screw' as const,
      face: face as const,
      x: settings.screwRowDistance,  // 전면에서 37mm
      y: yPos,
      diameter: BORING_DIAMETERS['hinge-screw'],
      depth: BORING_DEPTHS['hinge-screw'],
      note: `힌지마운팅-${hingeIndex === 0 ? '하단' : hingeIndex === positions.length - 1 ? '상단' : `중간${hingeIndex}`}-전면`,
    });

    // 두 번째 나사홀 (32mm 뒤)
    borings.push({
      id: `hinge-screw-${hingeIndex + 1}-2`,
      type: 'hinge-screw' as const,
      face: face as const,
      x: settings.screwRowDistance + settings.screwHoleSpacing,  // 37 + 32 = 69mm
      y: yPos,
      diameter: BORING_DIAMETERS['hinge-screw'],
      depth: BORING_DEPTHS['hinge-screw'],
      note: `힌지마운팅-${hingeIndex === 0 ? '하단' : hingeIndex === positions.length - 1 ? '상단' : `중간${hingeIndex}`}-후면`,
    });
  });

  return borings;
}

// ============================================
// 통합 계산
// ============================================

/**
 * 힌지 보링 전체 계산
 */
export function calculateHingeBorings(params: HingeBoringParams): HingeBoringResult {
  const settings = { ...DEFAULT_HINGE_SETTINGS, ...params.settings };
  const hingePositions = calculateHingePositions(params.doorHeight, settings);

  return {
    cupBorings: calculateDoorCupBorings(params),
    screwBorings: calculateSidePanelScrewBorings(
      params.doorHeight,
      params.isLeftHinge,
      params
    ),
    hingeCount: hingePositions.length,
    hingePositions,
  };
}

export default {
  calculateHingeCount,
  calculateHingePositions,
  avoidHingePositionsForShelves,
  calculateDoorCupBorings,
  calculateSidePanelScrewBorings,
  calculateHingeBorings,
};
