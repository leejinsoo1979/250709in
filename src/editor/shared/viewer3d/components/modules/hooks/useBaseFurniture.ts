import * as THREE from 'three';
import { ModuleData, SectionConfig } from '@/data/modules/shelving';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';

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
  material: THREE.MeshPhysicalMaterial;
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
  
  // 재질 설정 (자연스러운 목재 질감)
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color || materialConfig.interiorColor),
    clearcoat: 0.1,        // 코팅 반사 최소화 (0.3 → 0.1)
    clearcoatRoughness: 0.8, // 코팅 거칠기 증가 (0.5 → 0.8)
    metalness: 0.0,        // 완전 비금속 (0.1 → 0.0)
    roughness: 0.7,        // 표면 거칠기 증가 (0.4 → 0.7)
    reflectivity: 0.2,     // 반사율 더 감소 (0.4 → 0.2)
    // 드래그 상태일 때만 반투명 처리
    transparent: isDragging,
    opacity: isDragging ? 0.4 : 1.0  // 더 투명하게 (0.6 → 0.4)
  });
  
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