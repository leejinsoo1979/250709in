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
  calculateDrawerPanelConnectorBorings,
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
  drawerCount: number;     // 서랍 개수
  drawerHeights?: number[]; // 각 서랍 높이 배열 (mm), 없으면 균등 분배
  drawerRailType?: DrawerRailType;  // 서랍 레일 타입, 기본 tandem
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
    borings: mergeBorings(borings),
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
    borings: mergeBorings(borings),
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
// 서랍 측판 보링 생성 (앞/뒤판 체결용)
// ============================================

function generateDrawerSidePanelBorings(
  params: DrawerCabinetParams,
  drawerIndex: number,
  drawerHeight: number,
  isLeftPanel: boolean
): PanelBoringData {
  const panelId = `${params.id}-drawer-${drawerIndex + 1}-side-${isLeftPanel ? 'left' : 'right'}`;

  // 서랍 측판 치수 계산
  // 서랍 측판 두께는 보통 15mm
  const sideThickness = 15;
  // 서랍 깊이 = 가구 깊이 - 백패널 - 전면 간격
  const drawerDepth = params.depth - params.thickness - 20;
  // 서랍 측판 높이 = 서랍 높이 - 바닥판 두께 - 간격
  const sidePanelHeight = drawerHeight - sideThickness - 10;

  // 앞/뒤판 체결용 보링 계산
  const connectorResult = calculateDrawerPanelConnectorBorings({
    drawerHeight: sidePanelHeight,
    drawerDepth,
    sideThickness,
    isLeftPanel,
    drawerIndex,
  });

  return {
    panelId,
    furnitureId: params.id,
    furnitureName: params.name,
    panelType: isLeftPanel ? 'drawer-side-left' : 'drawer-side-right',
    panelName: `서랍${drawerIndex + 1}측판-${isLeftPanel ? '좌' : '우'}`,
    width: drawerDepth,
    height: sidePanelHeight,
    thickness: sideThickness,
    material: params.material,
    grain: 'V',
    borings: connectorResult.borings,
    isMirrored: !isLeftPanel,
    mirrorSourceId: isLeftPanel ? undefined : `${params.id}-drawer-${drawerIndex + 1}-side-left`,
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
  const drawerRailType = params.drawerRailType || 'tandem';

  // 서랍 레일 설정 업데이트
  settings.drawerRail = {
    ...settings.drawerRail,
    type: drawerRailType,
  };

  const panels: PanelBoringData[] = [];

  // 서랍 높이 계산 (개별 지정 또는 균등 분배)
  const drawerHeights = params.drawerHeights ||
    Array(params.drawerCount).fill(
      (params.height - 2 * params.thickness) / params.drawerCount
    );

  // 1. 좌측판
  panels.push(generateSidePanelBorings({...params, drawerHeights}, true, settings));

  // 2. 우측판
  panels.push(generateSidePanelBorings({...params, drawerHeights}, false, settings));

  // 3. 상판
  panels.push(generateHorizontalPanelBorings(params, true, settings));

  // 4. 하판
  panels.push(generateHorizontalPanelBorings(params, false, settings));

  // 5. 서랍별 패널들
  drawerHeights.forEach((drawerHeight, index) => {
    // 서랍 전판
    panels.push(generateDrawerFrontBorings(params, index, drawerHeight));

    // 서랍 좌측판 (앞/뒤판 체결용 보링)
    panels.push(generateDrawerSidePanelBorings(params, index, drawerHeight, true));

    // 서랍 우측판 (앞/뒤판 체결용 보링)
    panels.push(generateDrawerSidePanelBorings(params, index, drawerHeight, false));
  });

  const totalBorings = panels.reduce(
    (sum, panel) => sum + panel.borings.length,
    0
  );

  // 장공 포함 여부 확인
  const hasSlots = ['tandem', 'movento'].includes(drawerRailType);

  return {
    panels,
    summary: {
      panelCount: panels.length,
      totalBorings,
      drawerCount: drawerHeights.length,
      hasSlots,
    },
  };
}

export default {
  generateDrawerCabinetBorings,
};
