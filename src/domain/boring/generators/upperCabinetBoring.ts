/**
 * 상부장 보링 데이터 생성기
 * 측판, 상판, 하판, 도어 보링 생성
 * 하부장과 차이: 조절발 없음, 벽걸이 브래킷 보링 추가 가능
 */

import type { PanelBoringData, BoringSettings, Boring } from '../types';
import {
  calculateShelfPinBorings,
  calculateCamBoltBorings,
  calculateCamHousingBorings,
  calculateSidePanelScrewBorings,
  calculateDoorCupBorings,
  mergeBorings,
} from '../calculators';
import { DEFAULT_BORING_SETTINGS, BORING_DIAMETERS, BORING_DEPTHS } from '../constants';

// ============================================
// 타입
// ============================================

export interface UpperCabinetParams {
  id: string;
  name: string;
  width: number;           // 가구 외부 너비 (mm)
  height: number;          // 가구 외부 높이 (mm)
  depth: number;           // 가구 외부 깊이 (mm)
  thickness: number;       // 패널 두께 (mm), 기본 18mm
  material: string;        // 재질
  hasDoor: boolean;        // 도어 유무
  doorCount: 1 | 2;        // 도어 개수 (1: 단문, 2: 양문)
  isLeftDoor?: boolean;    // 단문일 경우 좌측 힌지 여부
  shelfCount: number;      // 고정 선반 개수
  hasWallBracket: boolean; // 벽걸이 브래킷 유무
  wallBracketType?: 'standard' | 'concealed';  // 브래킷 타입
  settings?: Partial<BoringSettings>;
}

export interface UpperCabinetBoringResult {
  panels: PanelBoringData[];
  summary: {
    panelCount: number;
    totalBorings: number;
  };
}

// ============================================
// 내부 치수 계산
// ============================================

function calculateInternalDimensions(params: UpperCabinetParams) {
  const t = params.thickness;
  return {
    internalWidth: params.width - 2 * t,
    internalHeight: params.height - 2 * t,
    internalDepth: params.depth,
    sidePanelHeight: params.height - 2 * t,
    sidePanelDepth: params.depth,
  };
}

// ============================================
// 벽걸이 브래킷 보링 계산
// ============================================

function calculateWallBracketBorings(
  panelHeight: number,
  panelDepth: number,
  bracketType: 'standard' | 'concealed' = 'standard'
): Boring[] {
  const borings: Boring[] = [];

  // 브래킷 위치: 상단에서 약 50mm, 전면에서 약 50mm
  const topOffset = 50;
  const frontOffset = 50;

  if (bracketType === 'standard') {
    // 표준 브래킷: Ø5mm 나사홀 2개
    borings.push({
      id: 'wall-bracket-1',
      type: 'custom' as const,
      face: 'right' as const,
      x: frontOffset,
      y: panelHeight - topOffset,
      diameter: 5,
      depth: 12,
      note: '벽걸이브래킷-상단',
    });
    borings.push({
      id: 'wall-bracket-2',
      type: 'custom' as const,
      face: 'right' as const,
      x: frontOffset + 32,
      y: panelHeight - topOffset,
      diameter: 5,
      depth: 12,
      note: '벽걸이브래킷-하단',
    });
  } else {
    // 숨김 브래킷: Ø35mm 컵홀 + 조절나사홀
    borings.push({
      id: 'wall-bracket-cup',
      type: 'custom' as const,
      face: 'right' as const,
      x: frontOffset,
      y: panelHeight - topOffset,
      diameter: 35,
      depth: 13,
      note: '숨김브래킷-컵홀',
    });
  }

  return borings;
}

// ============================================
// 측판 보링 생성
// ============================================

function generateSidePanelBorings(
  params: UpperCabinetParams,
  isLeftPanel: boolean,
  settings: BoringSettings
): PanelBoringData {
  const dims = calculateInternalDimensions(params);
  const panelId = `${params.id}-side-${isLeftPanel ? 'left' : 'right'}`;
  const borings: Boring[] = [];

  // 1. 선반핀 보링
  const shelfPinResult = calculateShelfPinBorings({
    panelHeight: dims.sidePanelHeight,
    panelDepth: dims.sidePanelDepth,
    isLeftPanel,
    settings: settings.shelfPin,
  });
  borings.push(...shelfPinResult.borings);

  // 2. 캠 볼트홀 (상판/하판 연결)
  const camBoltBorings = calculateCamBoltBorings({
    panelHeight: dims.sidePanelHeight,
    panelDepth: dims.sidePanelDepth,
    isLeftPanel,
    hasTopConnection: true,
    hasBottomConnection: true,
    settings: settings.camLock,
  });
  borings.push(...camBoltBorings);

  // 3. 힌지 마운팅 나사홀 (도어가 있는 경우)
  if (params.hasDoor) {
    const needsHinge = params.doorCount === 2 ||
      (params.doorCount === 1 && params.isLeftDoor === isLeftPanel);

    if (needsHinge) {
      const screwBorings = calculateSidePanelScrewBorings(
        dims.sidePanelHeight,
        isLeftPanel,
        { settings: settings.hinge }
      );
      borings.push(...screwBorings);
    }
  }

  // 4. 벽걸이 브래킷 보링 (필요 시)
  if (params.hasWallBracket) {
    const bracketBorings = calculateWallBracketBorings(
      dims.sidePanelHeight,
      dims.sidePanelDepth,
      params.wallBracketType
    );
    // 좌측판에서 계산된 것을 기준으로, 우측판은 face만 변경
    const adjustedBorings = bracketBorings.map(b => ({
      ...b,
      face: (isLeftPanel ? 'right' : 'left') as const,
    }));
    borings.push(...adjustedBorings);
  }

  return {
    panelId,
    furnitureId: params.id,
    furnitureName: params.name,
    panelType: isLeftPanel ? 'side-left' : 'side-right',
    panelName: isLeftPanel ? '좌측판' : '우측판',
    width: dims.sidePanelDepth,
    height: dims.sidePanelHeight,
    thickness: params.thickness,
    material: params.material,
    grain: 'V',
    borings: mergeBorings(borings),
    isMirrored: !isLeftPanel,
    mirrorSourceId: isLeftPanel ? undefined : `${params.id}-side-left`,
  };
}

// ============================================
// 상판/하판 보링 생성
// ============================================

function generateHorizontalPanelBorings(
  params: UpperCabinetParams,
  isTopPanel: boolean,
  settings: BoringSettings
): PanelBoringData {
  const dims = calculateInternalDimensions(params);
  const panelId = `${params.id}-${isTopPanel ? 'top' : 'bottom'}`;
  const borings: Boring[] = [];

  // 캠 하우징 보링
  const camHousingBorings = calculateCamHousingBorings(
    {
      panelWidth: dims.internalWidth,
      panelDepth: dims.internalDepth,
      settings: settings.camLock,
    },
    isTopPanel
  );
  borings.push(...camHousingBorings);

  // 상부장은 조절발 없음 (하부장과의 차이)

  return {
    panelId,
    furnitureId: params.id,
    furnitureName: params.name,
    panelType: isTopPanel ? 'top' : 'bottom',
    panelName: isTopPanel ? '상판' : '하판',
    width: dims.internalWidth,
    height: dims.internalDepth,
    thickness: params.thickness,
    material: params.material,
    grain: 'H',
    borings: mergeBorings(borings),
  };
}

// ============================================
// 도어 보링 생성
// ============================================

function generateDoorBorings(
  params: UpperCabinetParams,
  doorIndex: number,
  isLeftHinge: boolean,
  settings: BoringSettings
): PanelBoringData {
  const doorWidth = params.doorCount === 2
    ? params.width / 2 - 2
    : params.width - 4;

  const doorHeight = params.height - 4;

  const panelId = `${params.id}-door-${doorIndex}`;

  const cupBorings = calculateDoorCupBorings({
    doorHeight,
    doorWidth,
    isLeftHinge,
    settings: settings.hinge,
  });

  return {
    panelId,
    furnitureId: params.id,
    furnitureName: params.name,
    panelType: 'door',
    panelName: params.doorCount === 2 ? `도어-${isLeftHinge ? '좌' : '우'}` : '도어',
    width: doorWidth,
    height: doorHeight,
    thickness: params.thickness,
    material: params.material,
    grain: 'V',
    borings: mergeBorings(cupBorings),
  };
}

// ============================================
// 메인 생성 함수
// ============================================

/**
 * 상부장 전체 보링 데이터 생성
 */
export function generateUpperCabinetBorings(
  params: UpperCabinetParams
): UpperCabinetBoringResult {
  const settings = { ...DEFAULT_BORING_SETTINGS, ...params.settings };
  const panels: PanelBoringData[] = [];

  // 1. 좌측판
  panels.push(generateSidePanelBorings(params, true, settings));

  // 2. 우측판
  panels.push(generateSidePanelBorings(params, false, settings));

  // 3. 상판
  panels.push(generateHorizontalPanelBorings(params, true, settings));

  // 4. 하판
  panels.push(generateHorizontalPanelBorings(params, false, settings));

  // 5. 도어
  if (params.hasDoor) {
    if (params.doorCount === 2) {
      panels.push(generateDoorBorings(params, 1, true, settings));
      panels.push(generateDoorBorings(params, 2, false, settings));
    } else {
      panels.push(generateDoorBorings(params, 1, params.isLeftDoor ?? true, settings));
    }
  }

  const totalBorings = panels.reduce(
    (sum, panel) => sum + panel.borings.length,
    0
  );

  return {
    panels,
    summary: {
      panelCount: panels.length,
      totalBorings,
    },
  };
}

export default {
  generateUpperCabinetBorings,
};
