import * as THREE from 'three';
import { ModuleData, SectionConfig } from '@/data/modules/shelving';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useSpace3DView } from '../../../context/useSpace3DView';

// 백패널 두께 상수
const BACK_PANEL_THICKNESS = 9;

// 단위 변환 함수
const mmToThreeUnits = (mm: number): number => mm * 0.01;

// 가구 기본 설정 옵션
interface BaseFurnitureOptions {
  color?: string;
  internalHeight?: number;
  customDepth?: number;
  isDragging?: boolean;
}

// 가구 기본 설정 반환 타입
interface BaseFurnitureResult {
  // 재질 관련
  material: THREE.MeshStandardMaterial;
  doorColor: string;
  
  // 치수 관련
  width: number;
  height: number;
  depth: number;
  innerWidth: number;
  innerHeight: number;
  actualDepthMm: number;
  
  // 계산된 값들
  basicThickness: number;
  backPanelThickness: number;
  adjustedDepthForShelves: number;
  shelfZOffset: number;
  
  // 헬퍼 함수들
  calculateSectionHeight: (section: SectionConfig, availableHeight: number) => number;
  isMultiSectionFurniture: () => boolean;
  getSectionHeights: () => number[];
  
  // 유틸리티
  mmToThreeUnits: (mm: number) => number;
  
  // 설정 데이터
  modelConfig: NonNullable<ModuleData['modelConfig']>;
}

/**
 * 가구 컴포넌트 공통 로직 훅
 * - 재질 설정, 치수 계산, 헬퍼 함수들 제공
 * - 모든 타입 컴포넌트에서 공통으로 사용
 */
export const useBaseFurniture = (
  moduleData: ModuleData,
  options: BaseFurnitureOptions = {}
): BaseFurnitureResult => {
  const { 
    color, 
    internalHeight, 
    customDepth, 
    isDragging = false 
  } = options;
  
  // Store에서 재질 설정 가져오기
  const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const materialConfig = storeSpaceInfo.materialConfig || { 
    interiorColor: '#FFFFFF', 
    doorColor: '#FFFFFF' 
  };
  
  // 모듈 설정 데이터 가져오기
  const modelConfig = moduleData.modelConfig || {
    basicThickness: 18,
    hasOpenFront: true,
    hasShelf: false,
    shelfCount: 0
  };
  
  // 기본 판재 두께 변환 (mm -> Three.js 단위)
  const basicThickness = mmToThreeUnits(modelConfig.basicThickness || 18);
  
  // 백패널 두께 변환 (9mm -> Three.js 단위)
  const backPanelThickness = mmToThreeUnits(BACK_PANEL_THICKNESS);
  
  // 가구 치수 변환 (mm -> Three.js 단위)
  const width = mmToThreeUnits(moduleData.dimensions.width);
  const height = mmToThreeUnits(internalHeight || moduleData.dimensions.height);
  const actualDepthMm = customDepth || moduleData.dimensions.depth;
  const depth = mmToThreeUnits(actualDepthMm);
  
  // 내경 치수 계산
  const innerWidth = width - basicThickness * 2;
  const innerHeight = height - basicThickness * 2;
  
  // 선반용 조정된 깊이 계산
  const adjustedDepthForShelves = depth - mmToThreeUnits(8);
  
  // 선반 Z축 위치 조정 계산
  const shelfZOffset = mmToThreeUnits(4);
  
  // 재질 설정 (도어와 완전히 동일한 재질로 통일)
  const { renderMode, viewMode } = useSpace3DView();
  
  // 색상 결정: 특수 상태가 아닐 때 내부 색상과 도어 색상이 같으면 도어 색상을 직접 사용
  const furnitureColor = color || (
    !color && materialConfig.interiorColor === materialConfig.doorColor 
      ? materialConfig.doorColor  // 같은 색상이면 도어 색상을 직접 사용하여 완전히 동일한 처리
      : materialConfig.interiorColor
  );
  
  // 공통 재질 생성 함수 (도어, 프레임과 완전히 동일)
  const createUnifiedMaterial = (colorValue: string) => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorValue),
      metalness: 0.0,        // 완전 비금속 (도어와 동일)
      roughness: 0.6,        // 도어와 동일한 거칠기
      envMapIntensity: 0.0,  // 환경맵 완전 제거
      emissive: new THREE.Color(0x000000),  // 자체발광 완전 제거
      // 도어와 동일한 투명도 처리 (단, 드래그 상태는 가구만의 특수 처리)
      transparent: renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || isDragging,
      opacity: renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid') ? 0.5 : isDragging ? 0.4 : 1.0,
    });
  };
  
  const material = createUnifiedMaterial(furnitureColor);
  
  // 도어 색상 설정 - 고스트 상태일 때 전달받은 색상 사용
  const doorColor = color || materialConfig.doorColor;
  
  // 높이 계산 헬퍼 함수
  const calculateSectionHeight = (section: SectionConfig, availableHeight: number) => {
    const heightType = section.heightType || 'percentage';
    
    switch (heightType) {
      case 'absolute': {
        const absoluteHeightInThreeUnits = mmToThreeUnits(section.height);
        return Math.min(absoluteHeightInThreeUnits, availableHeight);
      }
      case 'percentage':
      default:
        return availableHeight * (section.height / 100);
    }
  };
  
  // 다중 섹션 가구 감지
  const isMultiSectionFurniture = () => {
    const { sections } = modelConfig;
    if (sections && sections.length >= 2) {
      return true;
    }
    return false;
  };
  
  // 섹션별 높이 계산
  const getSectionHeights = () => {
    const { sections } = modelConfig;
    
    if (!sections || sections.length === 0) {
      return [];
    }

    const availableHeight = height - basicThickness * 2;
    
    // 고정 높이 섹션들 분리
    const fixedSections = sections.filter((s: SectionConfig) => s.heightType === 'absolute');
    
    // 고정 섹션들의 총 높이 계산
    const totalFixedHeight = fixedSections.reduce((sum: number, section: SectionConfig) => {
      return sum + calculateSectionHeight(section, availableHeight);
    }, 0);
    
    // 나머지 공간 계산
    const remainingHeight = availableHeight - totalFixedHeight;
    
    // 모든 섹션의 높이 계산
    return sections.map((section: SectionConfig) => 
      (section.heightType === 'absolute') 
        ? calculateSectionHeight(section, availableHeight)
        : calculateSectionHeight(section, remainingHeight)
    );
  };
  
  return {
    // 재질 관련
    material,
    doorColor,
    
    // 치수 관련
    width,
    height,
    depth,
    innerWidth,
    innerHeight,
    actualDepthMm,
    
    // 계산된 값들
    basicThickness,
    backPanelThickness,
    adjustedDepthForShelves,
    shelfZOffset,
    
    // 헬퍼 함수들
    calculateSectionHeight,
    isMultiSectionFurniture,
    getSectionHeights,
    
    // 유틸리티
    mmToThreeUnits,
    
    // 설정 데이터
    modelConfig
  };
}; 