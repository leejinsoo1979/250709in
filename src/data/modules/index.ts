import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { generateShelvingModules } from './shelving';

// ModuleData를 shelving에서 import
import type { ModuleData } from './shelving';

// 공통 타입들 re-export
export type { ModuleData };

/**
 * 모든 동적 모듈들을 생성하는 통합 함수
 * 
 * 이제 모든 박스형 가구(오픈박스, 선반형 수납장)가 shelving에서 통합 관리됩니다.
 */
export const generateDynamicModules = (
  internalSpace: { width: number; height: number; depth: number }, 
  spaceInfo?: SpaceInfo
): ModuleData[] => {
  // shelving 모듈에서 모든 박스형 가구(0단~7단)를 생성
  const shelvingModules = generateShelvingModules(internalSpace, spaceInfo);
  
  return [
    ...shelvingModules
  ];
};

/**
 * 정적 모듈들 (기본 모듈, 참고용)
 */
export const STATIC_MODULES: ModuleData[] = [];

export const getModulesByCategory = (
  category: ModuleData['category'], 
  internalSpace: { width: number; height: number; depth: number },
  spaceInfo?: SpaceInfo
) => {
  const dynamicModules = generateDynamicModules(internalSpace, spaceInfo);
  const staticModules = STATIC_MODULES;
  
  return [...dynamicModules, ...staticModules].filter(module => module.category === category);
};

export const getModuleById = (
  id: string, 
  internalSpace?: { width: number; height: number; depth: number },
  spaceInfo?: SpaceInfo
) => {
  if (internalSpace) {
    const dynamicModules = generateDynamicModules(internalSpace, spaceInfo);
    const found = dynamicModules.find(module => module.id === id);
    if (found) return found;
  }
  
  return STATIC_MODULES.find(module => module.id === id);
};

/**
 * 모듈이 내경 공간에 맞는지 검증
 */
export const validateModuleForInternalSpace = (
  module: ModuleData, 
  internalSpace: { width: number; height: number; depth: number }
) => {
  const { width, height, depth } = module.dimensions;
  
  return {
    fitsWidth: width <= internalSpace.width,
    fitsHeight: height <= internalSpace.height,
    fitsDepth: depth <= internalSpace.depth,
    isValid: width <= internalSpace.width && 
             height <= internalSpace.height && 
             depth <= internalSpace.depth
  };
};

/**
 * 내경 공간에 맞는 모듈들만 필터링
 */
export const getValidModulesForInternalSpace = (
  internalSpace: { width: number; height: number; depth: number }
) => {
  const dynamicModules = generateDynamicModules(internalSpace);
  const staticModules = STATIC_MODULES;
  
  return [...dynamicModules, ...staticModules].filter(module => 
    validateModuleForInternalSpace(module, internalSpace).isValid
  );
}; 