/**
 * 서랍장 보링 데이터 생성기
 * 측판, 상판, 하판, 서랍 레일 보링 생성
 */

import type { PanelBoringData, BoringSettings, Boring, DrawerRailType } from '../types';
import {
  calculateCamBoltBorings,
  calculateCamHousingBorings,
  calculateDrawerRailBorings,
  calculateAdjustableFootBorings,
  mergeBorings,
} from '../calculators';
import { DEFAULT_BORING_SETTINGS } from '../constants';

// ============================================
// 타입
// ============================================

export interface DrawerCabinetParams {
  id: string;
  name: string;
  width: number;           // 가구 외부 너비 (mm)
  height: number;          // 가구 외부 높이 (mm)
  depth: number;           // 가구 외부 깊이 (mm)
  thickness: number;       // 패널 두께 (mm), 기본 18mm
  material: string;        // 재질
  drawerHeights: number[]; // 각 서랍 높이 배열 (mm)
  drawerRailType: DrawerRailType;  // 서랍 레일 타입
  hasAdjustableFoot: boolean;      // 조절발 유무
  settings?: Partial<BoringSettings>;
}

export interface DrawerCabinetBoringResult {
  panels: PanelBoringData[];
  summary: {
    panelCount: number;
    totalBorings: number;
    drawerCount: number;
    hasSlots: boolean;
  };
}

// ============================================
// 내부 치수 계산
// ============================================

function calculateInternalDimensions(params: DrawerCabinetParams) {
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
// 측판 보링 생성 (서랍장용)
// ============================================

function generateSidePanelBorings(
  params: DrawerCabinetParams,
  isLeftPanel: boolean,
  settings: BoringSettings
): PanelBoringData {
  const dims = calculateInternalDimensions(params);
  const panelId = `${params.id}-side-${isLeftPanel ? 'left' : 'right'}`;
  const borings: Boring[] = [];

  // 1. 캠 볼트홀 (상판/하판 연결)
  const camBoltBorings = calculateCamBoltBorings({
    panelHeight: dims.sidePanelHeight,
    panelDepth: dims.sidePanelDepth,
    isLeftPanel,
    hasTopConnection: true,
    hasBottomConnection: true,
    settings: settings.camLock,
  });
  borings.push(...camBoltBorings);

  // 2. 서랍 레일 보링 (서랍장의 핵심)
  const drawerBottomOffset = params.thickness;  // 하판 두께만큼 오프셋

  const drawerRailResult = calculateDrawerRailBorings({
    panelHeight: dims.sidePanelHeight,
    panelDepth: dims.sidePanelDepth,
    isLeftPanel,
    drawerHeights: params.drawerHeights,
    drawerBottomOffset,
    railType: params.drawerRailType,
    settings: settings.drawerRail,
  });
  borings.push(...drawerRailResult.borings);

  // 서랍장은 선반핀 없음 (도어장과의 차이)
  // 서랍장은 힌지 마운팅 없음

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
    borings: mergeBorings([borings]),
    isMirrored: !isLeftPanel,
    mirrorSourceId: isLeftPanel ? undefined : `${params.id}-side-left`,
  };
}

// ============================================
// 상판/하판 보링 생성
// ============================================

function generateHorizontalPanelBorings(
  params: DrawerCabinetParams,
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
    borings: mergeBorings([borings]),
  };
}

// ============================================
// 서랍 전판 보링 생성 (핸들 설치용)
// ============================================

function generateDrawerFrontBorings(
  params: DrawerCabinetParams,
  drawerIndex: number,
  drawerHeight: number
): PanelBoringData {
  const dims = calculateInternalDimensions(params);
  const panelId = `${params.id}-drawer-front-${drawerIndex + 1}`;

  // 서랍 전판 크기
  const frontWidth = params.width - 4;  // 좌우 갭
  const frontHeight = drawerHeight - 4;  // 상하 갭

  // 핸들 보링 (중앙 또는 상단)
  const handleBorings: Boring[] = [];

  // 핸들 설치 위치 (전판 중앙 상단)
  const handleY = frontHeight - 50;  // 상단에서 50mm
  const handleSpacing = 96;  // 핸들 나사 간격 (96mm 또는 128mm)

  // 좌측 핸들홀
  handleBorings.push({
    id: `drawer-handle-${drawerIndex + 1}-left`,
    type: 'custom' as const,
    face: 'front' as const,
    x: frontWidth / 2 - handleSpacing / 2,
    y: handleY,
    diameter: 5,
    depth: 18,  // 관통
    note: `서랍${drawerIndex + 1}-핸들-좌`,
  });

  // 우측 핸들홀
  handleBorings.push({
    id: `drawer-handle-${drawerIndex + 1}-right`,
    type: 'custom' as const,
    face: 'front' as const,
    x: frontWidth / 2 + handleSpacing / 2,
    y: handleY,
    diameter: 5,
    depth: 18,  // 관통
    note: `서랍${drawerIndex + 1}-핸들-우`,
  });

  return {
    panelId,
    furnitureId: params.id,
    furnitureName: params.name,
    panelType: 'drawer-front',
    panelName: `서랍전판-${drawerIndex + 1}`,
    width: frontWidth,
    height: frontHeight,
    thickness: params.thickness,
    material: params.material,
    grain: 'H',
    borings: handleBorings,
  };
}

// ============================================
// 메인 생성 함수
// ============================================

/**
 * 서랍장 전체 보링 데이터 생성
 */
export function generateDrawerCabinetBorings(
  params: DrawerCabinetParams
): DrawerCabinetBoringResult {
  const settings = { ...DEFAULT_BORING_SETTINGS, ...params.settings };

  // 서랍 레일 설정 업데이트
  settings.drawerRail = {
    ...settings.drawerRail,
    type: params.drawerRailType,
  };

  const panels: PanelBoringData[] = [];

  // 1. 좌측판
  panels.push(generateSidePanelBorings(params, true, settings));

  // 2. 우측판
  panels.push(generateSidePanelBorings(params, false, settings));

  // 3. 상판
  panels.push(generateHorizontalPanelBorings(params, true, settings));

  // 4. 하판
  panels.push(generateHorizontalPanelBorings(params, false, settings));

  // 5. 서랍 전판들
  params.drawerHeights.forEach((drawerHeight, index) => {
    panels.push(generateDrawerFrontBorings(params, index, drawerHeight));
  });

  const totalBorings = panels.reduce(
    (sum, panel) => sum + panel.borings.length,
    0
  );

  // 장공 포함 여부 확인
  const hasSlots = ['tandem', 'movento'].includes(params.drawerRailType);

  return {
    panels,
    summary: {
      panelCount: panels.length,
      totalBorings,
      drawerCount: params.drawerHeights.length,
      hasSlots,
    },
  };
}

export default {
  generateDrawerCabinetBorings,
};
