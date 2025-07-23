import * as THREE from 'three';
import { useMemo, useEffect } from 'react';
import { ModuleData, SectionConfig } from '@/data/modules/shelving';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { isCabinetTexture1, applyCabinetTexture1Settings } from '@/editor/shared/utils/materialConstants';

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
  adjustedWidth?: number; // 기둥/엔드판넬에 의해 조정된 폭 (mm)
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
    isDragging = false,
    adjustedWidth
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
  // adjustedWidth가 있으면 사용, 없으면 원래 폭 사용
  const actualWidthMm = adjustedWidth !== undefined ? adjustedWidth : moduleData.dimensions.width;
  const width = mmToThreeUnits(actualWidthMm);
  const height = mmToThreeUnits(internalHeight || moduleData.dimensions.height);
  const actualDepthMm = customDepth || moduleData.dimensions.depth;
  const depth = mmToThreeUnits(actualDepthMm);
  
  // console.log('🔧 useBaseFurniture 폭 결정:', {
  //   originalWidth: moduleData.dimensions.width + 'mm',
  //   adjustedWidth: adjustedWidth ? adjustedWidth + 'mm' : 'undefined',
  //   actualWidthMm: actualWidthMm + 'mm',
  //   finalWidth: width.toFixed(3) + ' (Three.js units)',
  //   logic: adjustedWidth !== undefined ? '조정된 폭 사용' : '원래 폭 사용'
  // });
  
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
  const material = useMemo(() => {
    const newMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(furnitureColor),
      metalness: 0.0,        // 완전 비금속 (도어와 동일)
      roughness: 0.6,        // 도어와 동일한 거칠기
      envMapIntensity: 0.0,  // 환경맵 완전 제거
      emissive: new THREE.Color(0x000000),  // 자체발광 완전 제거
      // 도어와 동일한 투명도 처리 (단, 드래그 상태는 가구만의 특수 처리)
      transparent: renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || isDragging,
      opacity: renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid') ? 0.5 : isDragging ? 0.4 : 1.0,
    });

    return newMaterial;
  }, [furnitureColor, renderMode, viewMode, isDragging]);

  // 텍스처 적용 (별도 useEffect로 처리)
  useEffect(() => {
    const textureUrl = materialConfig.interiorTexture;
    if (import.meta.env.DEV) {
      console.log('🎨 Texture URL:', textureUrl, 'Material:', material);
    }
    
    if (textureUrl && material) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isCabinetTexture1(textureUrl)) {
        if (import.meta.env.DEV) {
          console.log('🎨 Cabinet Texture1 즉시 어둡게 적용 중...');
        }
        applyCabinetTexture1Settings(material);
        if (import.meta.env.DEV) {
          console.log('✅ Cabinet Texture1 즉시 색상 적용 완료 (공통 설정 사용)');
        }
      }
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        textureUrl, 
        (texture) => {
          if (import.meta.env.DEV) {
            console.log('✅ 텍스처 로딩 성공:', textureUrl);
          }
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);
          material.map = texture;
          
          // Cabinet Texture1이 아닌 경우에만 기본 설정 적용
          if (!isCabinetTexture1(textureUrl)) {
            material.color.setHex(0xffffff); // 다른 텍스처는 기본 흰색
            material.toneMapped = true; // 기본 톤 매핑 활성화
            material.roughness = 0.6; // 기본 거칠기
          }
          
          material.needsUpdate = true;
          
          // 강제 리렌더링을 위해 다음 프레임에서 한번 더 업데이트
          requestAnimationFrame(() => {
            material.needsUpdate = true;
            if (import.meta.env.DEV) {
              console.log('🔄 서랍/선반 텍스처 강제 업데이트 완료');
            }
          });
        },
        undefined,
        (error) => {
          console.error('❌ 텍스처 로딩 실패:', textureUrl, error);
        }
      );
    } else if (material) {
      if (import.meta.env.DEV) {
        console.log('🧹 텍스처 제거, 색상만 사용');
      }
      // 텍스처가 없으면 맵 제거하고 기본 색상으로 복원
      material.map = null;
      material.color.set(furnitureColor);
      material.toneMapped = true; // 기본 톤 매핑 복원
      material.roughness = 0.6; // 기본 거칠기 복원
      material.needsUpdate = true;
    }
  }, [materialConfig.interiorTexture, material, furnitureColor]);
  
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