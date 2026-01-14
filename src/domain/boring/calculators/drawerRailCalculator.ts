/**
 * 서랍 레일 보링 계산기
 * Blum TANDEM / MOVENTO / LEGRABOX / METABOX 지원
 */

import type { Boring, DrawerRailSettings, DrawerRailType } from '../types';
import { DRAWER_RAIL_SETTINGS, BORING_DIAMETERS, BORING_DEPTHS } from '../constants';

// ============================================
// 타입
// ============================================

export interface DrawerRailBoringParams {
  panelHeight: number;         // 측판 높이 (mm)
  panelDepth: number;          // 측판 깊이 (mm)
  isLeftPanel: boolean;        // 좌측판 여부
  drawerHeights: number[];     // 각 서랍 높이 배열 (mm)
  drawerBottomOffset: number;  // 첫 서랍 하단 시작 위치 (mm)
  railType?: DrawerRailType;   // 레일 타입
  settings?: Partial<DrawerRailSettings>;
}

export interface DrawerRailBoringResult {
  borings: Boring[];
  drawerCount: number;
  railType: DrawerRailType;
  hasSlots: boolean;           // 장공 포함 여부
}

// ============================================
// 서랍 레일 Y 위치 계산
// ============================================

/**
 * 각 서랍의 레일 Y 위치 계산
 * 서랍 하단 기준으로 레일 중심 위치 반환
 */
export function calculateDrawerRailYPositions(
  drawerHeights: number[],
  drawerBottomOffset: number
): number[] {
  const positions: number[] = [];
  let currentY = drawerBottomOffset;

  drawerHeights.forEach((height) => {
    // 레일은 서랍 하단에서 약간 위에 위치 (보통 서랍 높이의 중간 하단)
    // 일반적으로 서랍 하단에서 레일 중심까지 약 20-30mm
    const railCenterOffset = 25;  // 서랍 하단에서 레일 중심까지
    positions.push(currentY + railCenterOffset);
    currentY += height;
  });

  return positions;
}

// ============================================
// 서랍 레일 보링 계산
// ============================================

/**
 * 측판 서랍 레일 보링 생성
 * - TANDEM/MOVENTO: 전면 원형홀 + 후면 장공
 * - LEGRABOX: 전면/후면 원형홀
 * - METABOX: 전면/후면 나사홀 (Ø3.5)
 */
export function calculateDrawerRailBorings(params: DrawerRailBoringParams): DrawerRailBoringResult {
  const railType = params.railType || 'tandem';
  const settings = { ...DRAWER_RAIL_SETTINGS[railType], ...params.settings };
  const yPositions = calculateDrawerRailYPositions(params.drawerHeights, params.drawerBottomOffset);

  const borings: Boring[] = [];

  // 보링 면 결정
  const face = params.isLeftPanel ? 'right' : 'left';

  yPositions.forEach((yPos, drawerIndex) => {
    const drawerNum = drawerIndex + 1;

    // 전면 홀 (모든 타입 공통)
    borings.push({
      id: `drawer-rail-${drawerNum}-front`,
      type: 'drawer-rail' as const,
      face: face as const,
      x: settings.frontHoleDistance,  // 37mm
      y: yPos,
      diameter: settings.frontHoleDiameter,
      depth: settings.frontHoleDepth,
      note: `서랍${drawerNum}-전면홀`,
    });

    // 후면 홀 (타입에 따라 다름)
    if (settings.rearHoleType === 'slot') {
      // 장공 (TANDEM, MOVENTO)
      borings.push({
        id: `drawer-rail-${drawerNum}-rear`,
        type: 'drawer-rail-slot' as const,
        face: face as const,
        x: settings.rearHoleDistance,  // 69mm
        y: yPos,
        diameter: settings.rearHoleDiameter,
        depth: settings.rearHoleDepth,
        slotWidth: settings.slotWidth,    // 10mm
        slotHeight: settings.slotHeight,  // 5mm
        note: `서랍${drawerNum}-후면장공`,
      });
    } else {
      // 원형 홀 (LEGRABOX, METABOX)
      borings.push({
        id: `drawer-rail-${drawerNum}-rear`,
        type: 'drawer-rail' as const,
        face: face as const,
        x: settings.rearHoleDistance,  // 69mm
        y: yPos,
        diameter: settings.rearHoleDiameter,
        depth: settings.rearHoleDepth,
        note: `서랍${drawerNum}-후면홀`,
      });
    }
  });

  return {
    borings,
    drawerCount: yPositions.length,
    railType,
    hasSlots: settings.rearHoleType === 'slot',
  };
}

// ============================================
// 서랍 레일 타입별 정보
// ============================================

/**
 * 서랍 레일 타입 정보 조회
 */
export function getDrawerRailInfo(type: DrawerRailType): {
  name: string;
  description: string;
  hasSlot: boolean;
  frontHoleDiameter: number;
  rearHoleDiameter: number;
} {
  const settings = DRAWER_RAIL_SETTINGS[type];

  const info: Record<DrawerRailType, { name: string; description: string }> = {
    tandem: {
      name: 'Blum TANDEM',
      description: '언더마운트 서랍 레일, 전면 원형 + 후면 장공',
    },
    movento: {
      name: 'Blum MOVENTO',
      description: '프리미엄 언더마운트 레일, 전면 원형 + 후면 장공',
    },
    legrabox: {
      name: 'Blum LEGRABOX',
      description: '박스 시스템 레일, 전면/후면 원형',
    },
    metabox: {
      name: 'Blum METABOX',
      description: '사이드 마운트 레일, 전면/후면 나사홀',
    },
  };

  return {
    ...info[type],
    hasSlot: settings.rearHoleType === 'slot',
    frontHoleDiameter: settings.frontHoleDiameter,
    rearHoleDiameter: settings.rearHoleDiameter,
  };
}

// ============================================
// 유틸리티
// ============================================

/**
 * 서랍 레일 보링 개수 계산
 */
export function calculateDrawerRailBoringCount(drawerCount: number): number {
  // 각 서랍당 2개 (전면, 후면) × 좌우 측판
  return drawerCount * 2 * 2;
}

/**
 * 레일 타입에 따른 공구 직경 목록
 */
export function getRequiredToolDiameters(type: DrawerRailType): number[] {
  const settings = DRAWER_RAIL_SETTINGS[type];
  const diameters = new Set<number>();

  diameters.add(settings.frontHoleDiameter);
  diameters.add(settings.rearHoleDiameter);

  return Array.from(diameters).sort((a, b) => a - b);
}

export default {
  calculateDrawerRailYPositions,
  calculateDrawerRailBorings,
  getDrawerRailInfo,
  calculateDrawerRailBoringCount,
  getRequiredToolDiameters,
};
