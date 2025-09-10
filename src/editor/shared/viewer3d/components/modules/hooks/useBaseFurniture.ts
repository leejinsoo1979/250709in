import * as THREE from 'three';
import { useMemo, useEffect, useState } from 'react';
import { ModuleData, SectionConfig } from '@/data/modules/shelving';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { isCabinetTexture1, applyCabinetTexture1Settings } from '@/editor/shared/utils/materialConstants';
import { useTheme } from '@/contexts/ThemeContext';

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
  isEditMode?: boolean; // 편집 모드 여부
  adjustedWidth?: number; // 기둥/엔드판넬에 의해 조정된 폭 (mm)
  slotWidths?: number[]; // 듀얼 가구의 개별 슬롯 너비들 (mm)
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
    isEditMode = false,
    adjustedWidth,
    slotWidths
  } = options;
  
  // Store에서 재질 설정 가져오기
  const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const materialConfig = storeSpaceInfo.materialConfig || { 
    interiorColor: '#FFFFFF', 
    doorColor: '#E0E0E0' // Changed default from #FFFFFF to light gray
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
  // 듀얼 가구의 경우 slotWidths 합산, adjustedWidth가 있으면 사용, 없으면 원래 폭 사용
  let actualWidthMm: number;
  
  // 듀얼 가구 판별
  const isDualFurniture = moduleData.id.includes('dual');
  
  // adjustedWidth가 있으면 최우선 사용 (엔드패널이나 기둥 침범 시 조정된 너비)
  if (adjustedWidth !== undefined && adjustedWidth !== null) {
    actualWidthMm = adjustedWidth;
    
  } else if (isDualFurniture && slotWidths && slotWidths.length >= 2) {
    // 듀얼 가구이고 slotWidths가 제공된 경우: 두 슬롯 너비 합산
    actualWidthMm = slotWidths[0] + slotWidths[1];
    
  } else {
    // 기본값: 원래 모듈 너비 사용
    actualWidthMm = moduleData.dimensions.width;
  }
  
  const width = mmToThreeUnits(actualWidthMm);
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
  const { theme } = useTheme();
  
  // 테마 색상 가져오기
  const getThemeColor = () => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
      if (primaryColor) {
        return primaryColor;
      }
    }
    return '#10b981'; // 기본값 (green)
  };
  
  // 색상 결정: 드래그 중이거나 편집 모드면 테마 색상 사용, 아니면 기본 색상
  const furnitureColor = (isDragging || isEditMode) ? getThemeColor() : (
    color || (materialConfig.interiorColor === materialConfig.doorColor 
      ? materialConfig.doorColor
      : materialConfig.interiorColor)
  );
  
  // 공통 재질 생성 함수 - 한 번만 생성
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#FFFFFF'), // 기본 흰색으로 생성
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
      emissive: new THREE.Color(0x000000),
    });
    
    
    
    return mat;
  }, []); // 의존성 배열 비움 - 한 번만 생성
  
  // 재질 속성 업데이트 (재생성 없이)
  useEffect(() => {
    if (material) {
      // 드래그 중이거나 편집 모드일 때는 항상 테마 색상 사용
      if (isDragging || (isEditMode && viewMode !== '2D')) { // 2D 모드에서는 편집 모드 효과 제거
        material.color.set(getThemeColor());
        material.map = null; // 드래그 중이거나 편집 모드에는 텍스처 제거
        material.emissive.set(new THREE.Color(getThemeColor())); // 편집 모드에서 발광 효과
        material.emissiveIntensity = 0.2; // 약간의 발광
      } else {
        material.emissive.set(new THREE.Color(0x000000)); // 발광 제거
        material.emissiveIntensity = 0;
        if (!material.map) {
          // 드래그 중이 아니고 편집 모드가 아니고 텍스처가 없을 때만 기본 색상 사용
          material.color.set(furnitureColor);
        }
      }
      
      // 투명도 설정 - 2D 모드에서는 편집 모드 여부와 관계없이 일정한 투명도 유지
      material.transparent = renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || isDragging || isEditMode;
      material.opacity = renderMode === 'wireframe' ? 0.3 : 
                        (viewMode === '2D' && renderMode === 'solid') ? 0.5 : // 2D 모드에서는 항상 0.5
                        (isDragging ? 0.6 : 
                        (isEditMode ? 0.3 : 1.0));
      material.needsUpdate = true;
      
      
    }
  }, [material, furnitureColor, renderMode, viewMode, isDragging, isEditMode]);

  // 텍스처 적용 (별도 useEffect로 처리)
  useEffect(() => {
    // 드래그 중이거나 편집 모드일 때는 텍스처 적용하지 않음
    if (isDragging || isEditMode) {
      if (material) {
        material.map = null;
        material.needsUpdate = true;
      }
      return;
    }
    
    const textureUrl = materialConfig.interiorTexture;
    
    
    
    if (textureUrl && material) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isCabinetTexture1(textureUrl)) {
        
        applyCabinetTexture1Settings(material);
        
        
        // 강제로 씬 업데이트
        material.needsUpdate = true;
      }
      
      const textureLoader = new THREE.TextureLoader();
      const fullUrl = textureUrl.startsWith('http') ? textureUrl : `${window.location.origin}${textureUrl}`;
      
      
      textureLoader.load(
        textureUrl, 
        (texture) => {
          // 편집 모드나 드래그 중이면 텍스처 로드해도 적용하지 않음
          if (isDragging || isEditMode) {
            texture.dispose(); // 메모리 해제
            return;
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
            
          });
        },
        undefined,
        (error) => {
          
        }
      );
    } else if (material) {
      
      // 텍스처가 없으면 맵 제거하고 기본 색상으로 복원
      if (material.map) {
        material.map.dispose(); // 기존 텍스처 메모리 해제
        material.map = null;
      }
      material.color.set(furnitureColor);
      material.toneMapped = true; // 기본 톤 매핑 복원
      material.roughness = 0.6; // 기본 거칠기 복원
      material.needsUpdate = true;
    }
  }, [materialConfig.interiorTexture, material, furnitureColor, isDragging, isEditMode]);
  
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
    actualWidthMm,  // 실제 가구 너비 (mm 단위) 추가
    
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