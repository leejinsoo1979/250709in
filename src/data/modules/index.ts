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
  
  const allModules = [...dynamicModules, ...staticModules];
  const filteredModules = allModules.filter(module => module.category === category);
  
  
  
  return filteredModules;
};

export const getModuleById = (
  id: string, 
  internalSpace?: { width: number; height: number; depth: number },
  spaceInfo?: SpaceInfo
) => {
  // baseModuleType 처리: ID에서 너비를 제외한 기본 타입 추출 (소수점 포함)
  const baseType = id.replace(/-[\d.]+$/, '');
  const widthMatch = id.match(/-([\d.]+)$/);
  const requestedWidth = widthMatch ? parseFloat(widthMatch[1]) : null;
  
  console.log('🔍🔍🔍 getModuleById 요청:', {
    id,
    baseType,
    requestedWidth,
    '소수점1자리': requestedWidth ? Math.round(requestedWidth * 10) / 10 : null,
    '상하부장여부': {
      isUpperCabinet: id.includes('upper-cabinet'),
      isLowerCabinet: id.includes('lower-cabinet')
    },
    internalSpace: internalSpace ? {
      width: internalSpace.width,
      height: internalSpace.height
    } : null,
    spaceInfo: spaceInfo ? {
      width: spaceInfo.width,
      surroundType: spaceInfo.surroundType,
      customColumnCount: spaceInfo.customColumnCount
    } : null
  });
  
  
  // ID로 직접 찾기
  if (internalSpace) {
    // 요청된 너비가 있으면 해당 너비를 포함한 모듈 생성을 위해 spaceInfo 수정
    let modifiedSpaceInfo = spaceInfo;
    if (requestedWidth && spaceInfo) {
      // 임시로 슬롯 너비 정보를 추가
      const isDual = baseType.includes('dual-');
      
      if (isDual) {
        // 듀얼 가구의 경우 두 개의 슬롯 너비를 역산 (소수점 유지)
        const singleWidth = requestedWidth / 2;
        modifiedSpaceInfo = {
          ...spaceInfo,
          _tempSlotWidths: [singleWidth, singleWidth]
        };
      } else {
        // 싱글 가구의 경우
        modifiedSpaceInfo = {
          ...spaceInfo,
          _tempSlotWidths: [requestedWidth]
        };
      }
    }
    
    // zone 정보가 있으면 그대로 유지
    if (spaceInfo && (spaceInfo as any).zone) {
      modifiedSpaceInfo = {
        ...modifiedSpaceInfo,
        zone: (spaceInfo as any).zone
      };
      
    }
    
    const dynamicModules = generateDynamicModules(internalSpace, modifiedSpaceInfo);
    
    // 상하부장 모듈 확인
    const upperCabinets = dynamicModules.filter(m => m.id.includes('upper-cabinet'));
    const lowerCabinets = dynamicModules.filter(m => m.id.includes('lower-cabinet'));
    
    console.log('📦📦📦 생성된 모듈 중 매칭 시도:', {
      요청ID: id,
      전체개수: dynamicModules.length,
      상부장개수: upperCabinets.length,
      하부장개수: lowerCabinets.length,
      상부장ID: upperCabinets.map(m => m.id),
      하부장ID: lowerCabinets.map(m => m.id),
      생성된모든ID: dynamicModules.map(m => m.id),
      생성된싱글: dynamicModules.filter(m => m.id.includes('single-')).map(m => m.id),
      modifiedSpaceInfo: modifiedSpaceInfo ? {
        _tempSlotWidths: (modifiedSpaceInfo as any)._tempSlotWidths,
        zone: (modifiedSpaceInfo as any).zone
      } : null
    });
    
    // 먼저 정확히 일치하는 모듈 찾기
    let found = dynamicModules.find(module => module.id === id);
    
    // 정확히 일치하는 모듈이 없으면 반올림된 값으로 다시 시도
    if (!found && requestedWidth) {
      const roundedWidth = Math.round(requestedWidth * 10) / 10;
      const alternativeId = `${baseType}-${roundedWidth}`;
      console.log('🔄 반올림된 ID로 재시도:', alternativeId);
      found = dynamicModules.find(module => module.id === alternativeId);
    }
    
    if (found) {
      console.log('✅ 모듈 찾음');
      return found;
    } else {
      console.log('❌ 모듈 못찾음');
    }
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
  
  // 스타일러장이나 바지걸이장인지 확인
  const isStylerOrPantshanger = module.id.includes('styler') || module.id.includes('pantshanger');
  
  // 상부장과 하부장은 높이 검증을 하지 않음
  // 상부장은 상단에, 하부장은 하단에 배치되므로 전체 내경 높이와 비교할 필요가 없음
  const isUpperOrLowerCabinet = module.category === 'upper' || module.category === 'lower';
  
  // 스타일러장과 바지걸이장은 폭 체크를 하지 않고 항상 표시
  const fitsWidth = isStylerOrPantshanger ? true : width <= internalSpace.width;
  const actualFitsWidth = width <= internalSpace.width;
  
  // 상하부장은 높이 체크를 하지 않음
  const fitsHeight = isUpperOrLowerCabinet ? true : height <= internalSpace.height;
  
  return {
    fitsWidth: actualFitsWidth, // 실제 맞는지 여부
    fitsHeight: fitsHeight,
    fitsDepth: depth <= internalSpace.depth,
    isValid: fitsWidth && // 표시용 (스타일러/바지걸이는 항상 true)
             fitsHeight && 
             depth <= internalSpace.depth,
    needsWarning: isStylerOrPantshanger && !actualFitsWidth // 경고가 필요한 경우
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