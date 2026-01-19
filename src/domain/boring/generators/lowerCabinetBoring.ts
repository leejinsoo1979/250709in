/**
 * 하부장 보링 데이터 생성기
 * 측판, 상판, 하판, 도어, 선반 보링 생성
 */

import type { PanelBoringData, BoringSettings, Boring } from '../types';
import {
  calculateShelfPinBorings,
  calculateCamBoltBorings,
  calculateCamHousingBorings,
  calculateSidePanelScrewBorings,
  calculateDoorCupBorings,
  calculateAdjustableFootBorings,
  mergeBorings,
} from '../calculators';
import { DEFAULT_BORING_SETTINGS } from '../constants';

// ============================================
// 타입
// ============================================

export interface LowerCabinetParams {
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
  hasAdjustableFoot: boolean;  // 조절발 유무
  settings?: Partial<BoringSettings>;
  customShelfYPositions?: number[];  // 커스텀 선반/패널 Y 위치 (바닥판 중심부터의 mm)
  useCustomPositions?: boolean;      // true면 32mm 피치 대신 커스텀 위치 사용
}

export interface LowerCabinetBoringResult {
  panels: PanelBoringData[];
  summary: {
    panelCount: number;
    totalBorings: number;
  };
}

// ============================================
// 내부 치수 계산
// ============================================

function calculateInternalDimensions(params: LowerCabinetParams) {
  const t = params.thickness;
  return {
    internalWidth: params.width - 2 * t,   // 좌우 측판 두께 제외
    internalHeight: params.height - 2 * t, // 상하판 두께 제외
    internalDepth: params.depth,           // 깊이는 그대로
    sidePanelHeight: params.height - 2 * t, // 측판 높이 (상하판 사이)
    sidePanelDepth: params.depth,           // 측판 깊이
  };
}

// ============================================
// 측판 보링 생성
// ============================================

function generateSidePanelBorings(
  params: LowerCabinetParams,
  isLeftPanel: boolean,
  settings: BoringSettings
): PanelBoringData {
  const dims = calculateInternalDimensions(params);
  const panelId = `${params.id}-side-${isLeftPanel ? 'left' : 'right'}`;
  const borings: Boring[] = [];

  // 1. 선반핀 보링
  // customShelfYPositions는 가구 바닥(0mm) 기준 절대 위치
  // 측판 좌표로 변환 필요: 측판 바닥 = 가구 바닥 + 하판두께(thickness)
  // 측판 기준 Y = 가구 기준 Y - thickness
  let convertedCustomYPositions: number[] | undefined;
  if (params.useCustomPositions && params.customShelfYPositions) {
    // 가구 바닥 기준 → 측판 바닥 기준으로 변환
    // 상판/하판 위치는 측판 범위 밖이므로 자동 필터링됨
    convertedCustomYPositions = params.customShelfYPositions
      .map(y => y - params.thickness)  // 측판 좌표로 변환
      .filter(y => y > 0 && y < dims.sidePanelHeight);  // 측판 범위 내만
  }

  const shelfPinResult = calculateShelfPinBorings({
    panelHeight: dims.sidePanelHeight,
    panelDepth: dims.sidePanelDepth,
    isLeftPanel,
    settings: settings.shelfPin,
    // 커스텀 위치가 있으면 사용, 없으면 32mm 피치 시스템
    customYPositions: convertedCustomYPositions,
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
    // 단문인 경우 해당 측판에만, 양문인 경우 양쪽 모두
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
  params: LowerCabinetParams,
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

  // 하판에 조절발 보링 (필요 시)
  if (!isTopPanel && params.hasAdjustableFoot) {
    const footBorings = calculateAdjustableFootBorings({
      panelWidth: dims.internalWidth,
      panelDepth: dims.internalDepth,
      settings: settings.adjustableFoot,
    });
    borings.push(...footBorings.borings);
  }

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
  params: LowerCabinetParams,
  doorIndex: number,
  isLeftHinge: boolean,
  settings: BoringSettings
): PanelBoringData {
  const doorWidth = params.doorCount === 2
    ? params.width / 2 - 2  // 양문: 가구 폭의 절반 - 갭
    : params.width - 4;     // 단문: 가구 폭 - 갭

  const doorHeight = params.height - 4;  // 상하 갭

  const panelId = `${params.id}-door-${doorIndex}`;

  // 힌지 컵홀 생성
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
 * 하부장 전체 보링 데이터 생성
 */
export function generateLowerCabinetBorings(
  params: LowerCabinetParams
): LowerCabinetBoringResult {
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
      // 양문
      panels.push(generateDoorBorings(params, 1, true, settings));   // 좌측 도어
      panels.push(generateDoorBorings(params, 2, false, settings));  // 우측 도어
    } else {
      // 단문
      panels.push(generateDoorBorings(params, 1, params.isLeftDoor ?? true, settings));
    }
  }

  // 총 보링 개수 계산
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
  generateLowerCabinetBorings,
};
