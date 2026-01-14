/**
 * 가구 모듈에서 보링 데이터로 변환하는 컨버터
 * PlacedModule + ModuleData → PanelBoringData[]
 */

import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { ModuleData, SectionConfig } from '@/data/modules/shelving';
import type { PanelBoringData, CabinetType, BoringSettings } from '../types';
import {
  generateLowerCabinetBorings,
  generateUpperCabinetBorings,
  generateDrawerCabinetBorings,
  type LowerCabinetParams,
  type UpperCabinetParams,
  type DrawerCabinetParams,
} from '../generators';
import { DEFAULT_BORING_SETTINGS } from '../constants';

// ============================================
// 타입 정의
// ============================================

export interface FurnitureBoringInput {
  placedModule: PlacedModule;
  moduleData: ModuleData;
  panelThickness?: number;  // 기본 18mm
  material?: string;        // 기본 '멜라민'
}

export interface FurnitureBoringResult {
  panels: PanelBoringData[];
  summary: {
    furnitureId: string;
    furnitureName: string;
    panelCount: number;
    totalBorings: number;
  };
}

export interface BatchConversionResult {
  allPanels: PanelBoringData[];
  summary: {
    furnitureCount: number;
    totalPanels: number;
    totalBorings: number;
    byFurniture: Array<{
      id: string;
      name: string;
      panelCount: number;
      boringCount: number;
    }>;
  };
}

// ============================================
// 헬퍼 함수들
// ============================================

/**
 * ModuleData의 category를 CabinetType으로 변환
 */
function getCabinetType(moduleData: ModuleData): CabinetType {
  switch (moduleData.category) {
    case 'upper':
      return 'upper';
    case 'lower':
      return 'lower';
    case 'full':
    default:
      // full 카테고리의 경우 섹션 구성으로 판단
      return determineCabinetTypeFromSections(moduleData);
  }
}

/**
 * 섹션 구성에서 가구 타입 결정
 */
function determineCabinetTypeFromSections(moduleData: ModuleData): CabinetType {
  const sections = moduleData.modelConfig?.sections;
  if (!sections || sections.length === 0) {
    return 'lower'; // 기본값
  }

  // 서랍 섹션이 있는지 확인
  const hasDrawer = sections.some(s => s.type === 'drawer');
  const drawerSections = sections.filter(s => s.type === 'drawer');

  // 전체가 서랍인 경우 drawer
  if (hasDrawer && drawerSections.length === sections.length) {
    return 'drawer';
  }

  // 서랍이 포함된 복합 가구도 lower로 처리
  return 'lower';
}

/**
 * 섹션에서 서랍 개수 계산
 */
function getDrawerCount(sections: SectionConfig[]): number {
  let count = 0;
  sections.forEach(section => {
    if (section.type === 'drawer') {
      count += section.count || 1;
    }
  });
  return count;
}

/**
 * 섹션에서 선반 개수 계산
 */
function getShelfCount(sections: SectionConfig[]): number {
  let count = 0;
  sections.forEach(section => {
    if (section.type === 'shelf') {
      count += section.count || 0;
    }
  });
  return count;
}

/**
 * 가구 내부 치수 계산
 */
function calculateFurnitureDimensions(
  placedModule: PlacedModule,
  moduleData: ModuleData,
  thickness: number
) {
  // 실제 적용되는 치수 (customWidth, adjustedWidth 우선)
  const width = placedModule.adjustedWidth || placedModule.customWidth || moduleData.dimensions.width;
  const height = placedModule.customHeight || moduleData.dimensions.height;
  const depth = placedModule.customDepth || moduleData.dimensions.depth;

  return {
    width,
    height,
    depth,
    internalWidth: width - 2 * thickness,
    internalHeight: height - 2 * thickness,
    internalDepth: depth,
  };
}

/**
 * 도어 개수 결정 (가구 너비 기준)
 */
function getDoorCount(width: number): 1 | 2 {
  // 600mm 이상이면 양문, 미만이면 단문
  return width >= 600 ? 2 : 1;
}

// ============================================
// 메인 변환 함수
// ============================================

/**
 * 단일 가구 모듈을 보링 데이터로 변환
 */
export function convertFurnitureToBoring(
  input: FurnitureBoringInput,
  settings?: Partial<BoringSettings>
): FurnitureBoringResult {
  const {
    placedModule,
    moduleData,
    panelThickness = 18,
    material = '멜라민',
  } = input;

  const mergedSettings = { ...DEFAULT_BORING_SETTINGS, ...settings };
  const dims = calculateFurnitureDimensions(placedModule, moduleData, panelThickness);
  const cabinetType = getCabinetType(moduleData);
  const sections = moduleData.modelConfig?.sections || [];

  let result: { panels: PanelBoringData[]; summary: { panelCount: number; totalBorings: number } };

  // 가구 ID 및 이름
  const furnitureId = placedModule.id;
  const furnitureName = moduleData.name;

  // 가구 타입별 처리
  switch (cabinetType) {
    case 'drawer': {
      const drawerParams: DrawerCabinetParams = {
        id: furnitureId,
        name: furnitureName,
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
        thickness: panelThickness,
        material,
        drawerCount: getDrawerCount(sections) || 4,
        hasAdjustableFoot: false, // 기본값
        settings: mergedSettings,
      };
      result = generateDrawerCabinetBorings(drawerParams);
      break;
    }

    case 'upper': {
      const upperParams: UpperCabinetParams = {
        id: furnitureId,
        name: furnitureName,
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
        thickness: panelThickness,
        material,
        hasDoor: placedModule.hasDoor ?? false,
        doorCount: getDoorCount(dims.width),
        isLeftDoor: placedModule.hingePosition === 'left',
        shelfCount: getShelfCount(sections),
        settings: mergedSettings,
      };
      result = generateUpperCabinetBorings(upperParams);
      break;
    }

    case 'lower':
    case 'tall':
    default: {
      const lowerParams: LowerCabinetParams = {
        id: furnitureId,
        name: furnitureName,
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
        thickness: panelThickness,
        material,
        hasDoor: placedModule.hasDoor ?? false,
        doorCount: getDoorCount(dims.width),
        isLeftDoor: placedModule.hingePosition === 'left',
        shelfCount: getShelfCount(sections),
        hasAdjustableFoot: false, // 기본값
        settings: mergedSettings,
      };
      result = generateLowerCabinetBorings(lowerParams);
      break;
    }
  }

  // Debug: Check borings array structure at creation
  if (result.panels.length > 0) {
    const firstPanel = result.panels[0];
    console.log('🟠 Converter output:',
      'panelType:', firstPanel.panelType,
      'borings isArray:', Array.isArray(firstPanel.borings),
      'borings length:', firstPanel.borings?.length,
      'first boring x:', firstPanel.borings?.[0]?.x);
  }

  return {
    panels: result.panels,
    summary: {
      furnitureId,
      furnitureName,
      panelCount: result.summary.panelCount,
      totalBorings: result.summary.totalBorings,
    },
  };
}

/**
 * 여러 가구 모듈을 일괄 변환
 */
export function convertMultipleFurnitureToBoring(
  inputs: FurnitureBoringInput[],
  settings?: Partial<BoringSettings>
): BatchConversionResult {
  const allPanels: PanelBoringData[] = [];
  const byFurniture: BatchConversionResult['summary']['byFurniture'] = [];
  let totalBorings = 0;

  inputs.forEach((input) => {
    const result = convertFurnitureToBoring(input, settings);
    allPanels.push(...result.panels);
    totalBorings += result.summary.totalBorings;
    byFurniture.push({
      id: result.summary.furnitureId,
      name: result.summary.furnitureName,
      panelCount: result.summary.panelCount,
      boringCount: result.summary.totalBorings,
    });
  });

  return {
    allPanels,
    summary: {
      furnitureCount: inputs.length,
      totalPanels: allPanels.length,
      totalBorings,
      byFurniture,
    },
  };
}

export default {
  convertFurnitureToBoring,
  convertMultipleFurnitureToBoring,
};
