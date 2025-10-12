/**
 * 가구 치수 계산 유틸리티
 *
 * 정면뷰, 좌측뷰, 우측뷰에서 공통으로 사용할 수 있는 가구 치수 데이터를 계산합니다.
 * 각 뷰는 이 데이터를 자신의 좌표계에 맞게 렌더링합니다.
 */

import { getModuleById } from '@/data/modules';
import type { PlacedModule } from '@/store/core/furnitureStore';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';

/**
 * 가구 섹션 정보
 */
export interface FurnitureSection {
  /** 섹션 인덱스 (0: 하부, 1: 상부) */
  index: number;
  /** 섹션 높이 (mm) */
  height: number;
  /** 섹션 시작 Y 위치 (mm, 바닥 기준) */
  startY: number;
  /** 섹션 종료 Y 위치 (mm, 바닥 기준) */
  endY: number;
  /** 내경 너비 (mm) */
  innerWidth: number;
  /** 내경 높이 (mm) */
  innerHeight: number;
  /** 내경 깊이 (mm) */
  innerDepth: number;
}

/**
 * 가구 치수 데이터
 */
export interface FurnitureDimension {
  /** 가구 모듈 */
  module: PlacedModule;
  /** 모듈 데이터 */
  moduleData: any;
  /** 실제 너비 (mm) */
  actualWidth: number;
  /** 실제 높이 (mm) */
  actualHeight: number;
  /** 실제 깊이 (mm) */
  actualDepth: number;
  /** 내경 너비 (mm) */
  innerWidth: number;
  /** 내경 높이 (mm) */
  innerHeight: number;
  /** 내경 깊이 (mm) */
  innerDepth: number;
  /** 패널 두께 (mm) */
  basicThickness: number;
  /** 백패널 두께 (mm) */
  backPanelThickness: number;
  /** 위치 (Three.js 단위) */
  position: {
    x: number;
    y: number;
    z: number;
  };
  /** 섹션 정보 (다단 가구의 경우) */
  sections?: FurnitureSection[];
  /** 멀티 섹션 여부 */
  isMultiSection: boolean;
}

/**
 * mm를 Three.js 단위로 변환
 */
const mmToThreeUnits = (mm: number) => mm * 0.01;

/**
 * 가구가 멀티 섹션인지 확인
 */
const isMultiSectionFurniture = (moduleId: string): boolean => {
  return moduleId.includes('2drawer-hanging') ||
         moduleId.includes('2hanging') ||
         moduleId.includes('4drawer-hanging');
};

/**
 * 섹션별 높이 계산
 */
const calculateSectionHeights = (moduleId: string, totalHeight: number): { lower: number; upper: number } => {
  if (moduleId.includes('4drawer-hanging')) {
    // 4단서랍장: 4:6 비율
    return {
      lower: totalHeight * 0.4,
      upper: totalHeight * 0.6
    };
  } else if (moduleId.includes('2drawer-hanging') || moduleId.includes('2hanging')) {
    // 2단서랍장, 2단행거: 5:5 비율
    return {
      lower: totalHeight * 0.5,
      upper: totalHeight * 0.5
    };
  }

  // 단일 섹션
  return {
    lower: totalHeight,
    upper: 0
  };
};

/**
 * 가구 내경 치수 계산
 */
export const calculateFurnitureDimensions = (
  placedModules: PlacedModule[],
  spaceInfo: SpaceInfo
): FurnitureDimension[] => {
  if (!placedModules || placedModules.length === 0) {
    return [];
  }

  return placedModules.map(module => {
    const moduleData = getModuleById(
      module.moduleId,
      { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
      spaceInfo
    );

    if (!moduleData) {
      return null;
    }

    // 패널 두께
    const basicThickness = 18; // mm
    const backPanelThickness = 9; // mm

    // 실제 치수
    const actualWidth = module.customWidth || module.adjustedWidth || moduleData.dimensions.width;
    const actualHeight = moduleData.dimensions.height;
    const actualDepth = module.customDepth || moduleData.dimensions.depth;

    // 내경 치수 계산
    const innerWidth = actualWidth - basicThickness * 2; // 좌우 측판 제외
    const innerDepth = actualDepth - basicThickness - backPanelThickness; // 앞판 + 백패널 제외

    // 멀티 섹션 여부
    const isMultiSection = isMultiSectionFurniture(moduleData.id);

    // 띄워서 배치 높이
    const isFloating = spaceInfo.baseConfig?.type === 'stand' &&
                       spaceInfo.baseConfig?.placementType === 'float';
    const floatHeight = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
    const baseFrameHeight = spaceInfo.baseConfig?.height || 0;

    // 섹션 정보 계산
    let sections: FurnitureSection[] | undefined;
    let totalInnerHeight = actualHeight - basicThickness * 2; // 상하판 제외

    if (isMultiSection) {
      const sectionHeights = calculateSectionHeights(moduleData.id, actualHeight);

      sections = [
        // 하부 섹션
        {
          index: 0,
          height: sectionHeights.lower,
          startY: floatHeight + baseFrameHeight + basicThickness, // 바닥판 위
          endY: floatHeight + baseFrameHeight + sectionHeights.lower - basicThickness, // 상판 아래
          innerWidth,
          innerHeight: sectionHeights.lower - basicThickness * 2, // 상하판 제외
          innerDepth
        },
        // 상부 섹션
        {
          index: 1,
          height: sectionHeights.upper,
          startY: floatHeight + baseFrameHeight + sectionHeights.lower + basicThickness, // 바닥판 위
          endY: floatHeight + baseFrameHeight + actualHeight - basicThickness, // 상판 아래
          innerWidth,
          innerHeight: sectionHeights.upper - basicThickness * 2, // 상하판 제외
          innerDepth
        }
      ];
    }

    return {
      module,
      moduleData,
      actualWidth,
      actualHeight,
      actualDepth,
      innerWidth,
      innerHeight: totalInnerHeight,
      innerDepth,
      basicThickness,
      backPanelThickness,
      position: {
        x: module.position.x,
        y: spaceInfo.height / 2, // 공간 중앙 높이
        z: module.position.z || 0
      },
      sections,
      isMultiSection
    };
  }).filter((dim): dim is FurnitureDimension => dim !== null);
};

/**
 * Three.js 단위로 변환된 가구 치수 데이터
 */
export interface FurnitureDimensionThreeUnits extends Omit<FurnitureDimension, 'actualWidth' | 'actualHeight' | 'actualDepth' | 'innerWidth' | 'innerHeight' | 'innerDepth' | 'basicThickness' | 'backPanelThickness' | 'sections'> {
  actualWidth: number;
  actualHeight: number;
  actualDepth: number;
  innerWidth: number;
  innerHeight: number;
  innerDepth: number;
  basicThickness: number;
  backPanelThickness: number;
  sections?: Array<Omit<FurnitureSection, 'height' | 'startY' | 'endY' | 'innerWidth' | 'innerHeight' | 'innerDepth'> & {
    height: number;
    startY: number;
    endY: number;
    innerWidth: number;
    innerHeight: number;
    innerDepth: number;
  }>;
}

/**
 * 가구 치수를 Three.js 단위로 변환
 */
export const convertToThreeUnits = (dimension: FurnitureDimension): FurnitureDimensionThreeUnits => {
  return {
    ...dimension,
    actualWidth: mmToThreeUnits(dimension.actualWidth),
    actualHeight: mmToThreeUnits(dimension.actualHeight),
    actualDepth: mmToThreeUnits(dimension.actualDepth),
    innerWidth: mmToThreeUnits(dimension.innerWidth),
    innerHeight: mmToThreeUnits(dimension.innerHeight),
    innerDepth: mmToThreeUnits(dimension.innerDepth),
    basicThickness: mmToThreeUnits(dimension.basicThickness),
    backPanelThickness: mmToThreeUnits(dimension.backPanelThickness),
    sections: dimension.sections?.map(section => ({
      ...section,
      height: mmToThreeUnits(section.height),
      startY: mmToThreeUnits(section.startY),
      endY: mmToThreeUnits(section.endY),
      innerWidth: mmToThreeUnits(section.innerWidth),
      innerHeight: mmToThreeUnits(section.innerHeight),
      innerDepth: mmToThreeUnits(section.innerDepth)
    }))
  };
};
