import React, { useMemo } from 'react';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import IndirectLight from '../../modules/IndirectLight';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';

interface UpperCabinetIndirectLightProps {
  placedModules: PlacedModule[];
  spaceInfo: SpaceInfo;
}

// 단위 변환 함수
const mmToThreeUnits = (mm: number): number => mm * 0.01;

/**
 * 간접조명을 연속적으로 렌더링하는 통합 컴포넌트
 * 1. 상부장 하단 간접조명 (상하부장 사이)
 * 2. 띄워서 배치한 가구 하단 간접조명
 * 인접한 가구들을 그룹화하여 하나의 연속된 조명으로 표시
 */
const UpperCabinetIndirectLight: React.FC<UpperCabinetIndirectLightProps> = ({
  placedModules,
  spaceInfo
}) => {
  const internalSpace = useMemo(() => calculateInternalSpace(spaceInfo), [spaceInfo]);
  const { viewMode } = useSpace3DView();
  const { indirectLightEnabled, indirectLightIntensity } = useUIStore();
  
  // 조명 그룹 생성 함수
  const createLightGroups = (modules: PlacedModule[], lightY: number, lightHeight: number) => {
    if (modules.length === 0) return [];
    
    // 슬롯 인덱스로 정렬
    const sortedModules = [...modules].sort((a, b) => {
      const slotA = a.slotIndex ?? -1;
      const slotB = b.slotIndex ?? -1;
      return slotA - slotB;
    });
    
    // 인접한 가구들을 그룹화
    const groups: Array<{
      startX: number;
      endX: number;
      y: number;
      z: number;
      depth: number;
      height: number;
    }> = [];
    
    let currentGroup: typeof groups[0] | null = null;
    
    sortedModules.forEach((module) => {
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;
      
      const width = module.adjustedWidth || module.customWidth || moduleData.dimensions.width;
      const depth = module.customDepth || moduleData.dimensions.depth;
      
      // 키큰장 디버그
      if (module.moduleId.includes('tall') || module.moduleId.includes('pantry') || module.moduleId.includes('wardrobe')) {
// console.log('🔦 키큰장 폭 계산:', {
          moduleId: module.moduleId,
          adjustedWidth: module.adjustedWidth,
          customWidth: module.customWidth,
          dimensionsWidth: moduleData.dimensions.width,
          finalWidth: width
        });
      }
      
      // X 위치 계산
      const halfWidth = mmToThreeUnits(width / 2);
      const startX = module.position.x - halfWidth;
      const endX = module.position.x + halfWidth;
      
      // 가구 깊이 (Z축 방향)
      const lightDepth = mmToThreeUnits(depth);
      
      // 첫 번째 가구이거나 이전 그룹과 인접하지 않은 경우
      if (!currentGroup || Math.abs(currentGroup.endX - startX) > 0.01) {
        // 새 그룹 시작
        currentGroup = {
          startX,
          endX,
          y: lightY,
          z: module.position.z,
          depth: lightDepth,
          height: lightHeight
        };
        groups.push(currentGroup);
      } else {
        // 현재 그룹 확장
        currentGroup.endX = endX;
      }
    });
    
    return groups;
  };
  
  // 상부장과 띄워서 배치 가구들을 각각 그룹화
  const { upperCabinetGroups, floatingGroups } = useMemo(() => {
    // 띄워서 배치 모드 확인
    const isFloatingMode = spaceInfo?.baseConfig?.placementType === 'float' && 
                          (spaceInfo?.baseConfig?.floatHeight || 0) > 0;
    const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
    
    // 상부장과 일반 가구 분리
    const upperCabinets = placedModules.filter(module => {
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      return moduleData && (moduleData.category === 'upper' || module.moduleId.includes('upper-cabinet'));
    });
    
    const floatingModules = isFloatingMode ? placedModules.filter(module => {
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      // 상부장이 아닌 가구들
      return moduleData && !(moduleData.category === 'upper' || module.moduleId.includes('upper-cabinet'));
    }) : [];
    
    // 상부장 조명 그룹 생성
    const upperGroups = upperCabinets.map((cabinet) => {
      const moduleData = getModuleById(cabinet.moduleId, internalSpace, spaceInfo)!;
      const height = cabinet.customHeight || moduleData.dimensions.height;
      
      // 상부장 하단 위치와 간격 계산
      const lowerCabinetHeight = 820; // 하부장 표준 높이 (mm)
      const upperCabinetBottomMm = internalSpace.height - height; // 상부장 하단 위치
      
      // 띄워서 배치 모드일 때 하부장이 올라간 높이 고려
      const floatHeightMm = isFloatingMode ? floatHeight : 0;
      const actualLowerCabinetTop = lowerCabinetHeight + floatHeightMm;
      const gapBetweenCabinets = upperCabinetBottomMm - actualLowerCabinetTop;
      
      // 조명 높이와 Y 위치
      const lightHeight = mmToThreeUnits(gapBetweenCabinets) * 2.0;
      const lightY = mmToThreeUnits(actualLowerCabinetTop + gapBetweenCabinets * 0.8);
      
      return { cabinet, lightY, lightHeight };
    });
    
    // 상부장 그룹화
    const upperCabinetLightGroups = upperGroups.length > 0 
      ? createLightGroups(
          upperGroups.map(g => g.cabinet), 
          upperGroups[0]?.lightY || 0, 
          upperGroups[0]?.lightHeight || 0
        ) 
      : [];
    
    // 띄워서 배치 조명 그룹 생성
// console.log('🔦 띄움 배치 조명 생성:', {
      isFloatingMode,
      floatHeight,
      floatHeightInThreeUnits: mmToThreeUnits(floatHeight),
      lightY: mmToThreeUnits(floatHeight / 2),
      floatingModulesCount: floatingModules.length
    });
    
    const floatingLightGroups = isFloatingMode && floatingModules.length > 0
      ? createLightGroups(
          floatingModules,
          mmToThreeUnits(floatHeight / 2),
          mmToThreeUnits(floatHeight) * 2.0  // 시각적 효과를 위해 2배 (상부장과 동일)
        )
      : [];
    
    return { 
      upperCabinetGroups: upperCabinetLightGroups, 
      floatingGroups: floatingLightGroups 
    };
  }, [placedModules, spaceInfo, internalSpace]);
  
  // 2D 모드이거나 간접조명이 비활성화된 경우 렌더링하지 않음
  const is2DMode = viewMode === '2D' || viewMode !== '3D';
  if (is2DMode || !indirectLightEnabled) {
    return null;
  }
  
  return (
    <>
      {/* 상부장 간접조명 렌더링 */}
      {upperCabinetGroups.map((group, index) => {
        const baseWidth = group.endX - group.startX;
        const width = baseWidth * 1.2; // 폭을 1.2배로 확장
        const centerX = (group.startX + group.endX) / 2;
        
        return (
          <React.Fragment key={`upper-cabinet-light-${index}`}>
            {/* 뒤쪽 조명 */}
            <IndirectLight
              width={width}
              depth={group.height}
              intensity={indirectLightIntensity || 0.8}
              position={[centerX, group.y, group.z - group.depth / 2 - 2.5]}
            />
            {/* 앞쪽 조명 */}
            <IndirectLight
              width={width}
              depth={group.height}
              intensity={indirectLightIntensity || 0.8}
              position={[centerX, group.y, group.z + group.depth / 2 - 3.0]}
            />
          </React.Fragment>
        );
      })}
      
      {/* 띄워서 배치 간접조명 렌더링 */}
      {floatingGroups.map((group, index) => {
        const baseWidth = group.endX - group.startX;
        const width = baseWidth * 1.2; // 상부장과 동일하게 1.2배 확장
        const centerX = (group.startX + group.endX) / 2;
        
// console.log('🔦 띄워서 배치 조명 상세:', {
          baseWidth,
          width,
          height: group.height,
          heightInMM: group.height / 0.01, // Three.js units를 mm로 역변환
          y: group.y,
          z: group.z,
          depth: group.depth
        });
        
        return (
          <React.Fragment key={`floating-light-${index}`}>
            {/* 뒤쪽 조명 */}
            <IndirectLight
              width={width}
              depth={group.height}
              intensity={indirectLightIntensity || 0.8}
              position={[centerX, group.y, group.z - group.depth / 2 - 2.5]}
            />
            {/* 앞쪽 조명 */}
            <IndirectLight
              width={width}
              depth={group.height}
              intensity={indirectLightIntensity || 0.8}
              position={[centerX, group.y, group.z + group.depth / 2 - 3.0]}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

export default UpperCabinetIndirectLight;