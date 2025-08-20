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
 * 상부장 하단에 연속된 간접조명을 렌더링하는 컴포넌트
 * 인접한 상부장들을 그룹화하여 하나의 연속된 조명으로 표시
 */
const UpperCabinetIndirectLight: React.FC<UpperCabinetIndirectLightProps> = ({
  placedModules,
  spaceInfo
}) => {
  const internalSpace = useMemo(() => calculateInternalSpace(spaceInfo), [spaceInfo]);
  const { viewMode } = useSpace3DView();
  const { indirectLightEnabled, indirectLightIntensity } = useUIStore();
  
  // 상부장들과 띄워서 배치한 모듈들을 그룹화하여 연속된 조명 생성
  const lightGroups = useMemo(() => {
    // 띄워서 배치 모드 확인
    const isFloatingMode = spaceInfo?.baseConfig?.placementType === 'float' && 
                          (spaceInfo?.baseConfig?.floatHeight || 0) > 0;
    
    // 상부장 및 띄워서 배치한 모듈 필터링
    const modulesWithLight = placedModules.filter(module => {
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      // 상부장인지 확인
      const isUpperCabinet = moduleData && (moduleData.category === 'upper' || module.moduleId.includes('upper-cabinet'));
      
      // 띄워서 배치 모드일 때는 상부장이 아닌 모든 모듈도 포함
      if (isFloatingMode && !isUpperCabinet && moduleData) {
        return true;
      }
      
      return isUpperCabinet;
    });
    
    if (modulesWithLight.length === 0) return [];
    
    // 슬롯 인덱스로 정렬
    const sortedCabinets = [...modulesWithLight].sort((a, b) => {
      const slotA = a.slotIndex ?? -1;
      const slotB = b.slotIndex ?? -1;
      return slotA - slotB;
    });
    
    // 인접한 상부장들을 그룹화
    const groups: Array<{
      startX: number;
      endX: number;
      y: number;
      z: number;
      depth: number;
    }> = [];
    
    let currentGroup: typeof groups[0] | null = null;
    
    sortedCabinets.forEach((cabinet, index) => {
      const moduleData = getModuleById(cabinet.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;
      
      const width = cabinet.adjustedWidth || cabinet.customWidth || moduleData.dimensions.width;
      const height = cabinet.customHeight || moduleData.dimensions.height;
      const depth = cabinet.customDepth || moduleData.dimensions.depth;
      
      // Y 위치 계산 (상부장 하단 또는 띄워서 배치한 모듈 하단)
      let lightY: number;
      
      // 띄워서 배치 모드 확인
      const isFloatingMode = spaceInfo?.baseConfig?.placementType === 'float' && 
                            (spaceInfo?.baseConfig?.floatHeight || 0) > 0;
      
      // 깊이 계산 - 띄워서 배치일 때는 줄임
      let lightDepth = mmToThreeUnits(depth);
      
      if (isFloatingMode && !(moduleData.category === 'upper')) {
        // 띄워서 배치한 경우 (상부장이 아닌 경우)
        const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
        const furnitureBottomY = mmToThreeUnits(floatHeight);
        lightY = furnitureBottomY - 0.5; // 가구 하단에서 50cm 아래
        lightDepth = lightDepth * 0.8; // 띄워서 배치 시 깊이를 0.8배로 더 축소
      } else {
        // 상부장인 경우 (기존 로직)
        const furnitureStartYMm = internalSpace.height - height;
        const furnitureBottomY = mmToThreeUnits(furnitureStartYMm);
        lightY = furnitureBottomY - 0.18 - 0.85; // 상부장 하단 마감재(18mm) 아래 85cm로 더 내림
      }
      
      // X 위치 계산
      const halfWidth = mmToThreeUnits(width / 2);
      const startX = cabinet.position.x - halfWidth;
      const endX = cabinet.position.x + halfWidth;
      
      // 첫 번째 캐비넷이거나 이전 그룹과 인접하지 않은 경우
      if (!currentGroup || Math.abs(currentGroup.endX - startX) > 0.01) {
        // 새 그룹 시작
        currentGroup = {
          startX,
          endX,
          y: lightY,
          z: cabinet.position.z,
          depth: lightDepth
        };
        groups.push(currentGroup);
      } else {
        // 현재 그룹 확장
        currentGroup.endX = endX;
      }
    });
    
    return groups;
  }, [placedModules, spaceInfo, internalSpace]);
  
  // 2D 모드이거나 간접조명이 비활성화된 경우 렌더링하지 않음
  const is2DMode = viewMode === '2D' || viewMode !== '3D';
  if (is2DMode || !indirectLightEnabled) {
    return null;
  }
  
  return (
    <>
      {lightGroups.map((group, index) => {
        const baseWidth = group.endX - group.startX;
        const width = baseWidth * 1.2; // 폭을 1.2배로 확장
        const centerX = (group.startX + group.endX) / 2;
        
        // 띄워서 배치 모드일 때는 depth가 이미 축소되어 있으므로 작은 배수 사용
        const depthMultiplier = 1.5; // 기본 1.5배로 축소 (띄워서 배치 시 더 작은 효과)
        
        return (
          <>
            {/* 뒤쪽 조명 (기존) */}
            <IndirectLight
              key={`upper-indirect-light-back-${index}`}
              width={width}
              depth={group.depth * depthMultiplier} // Y축 방향으로 확장
              intensity={indirectLightIntensity || 0.8}
              position={[centerX, group.y, group.z - group.depth / 2 - 0.1]} // 가구 뒷면에서 10cm 뒤로
            />
            {/* 앞쪽 조명 (추가) */}
            <IndirectLight
              key={`upper-indirect-light-front-${index}`}
              width={width}
              depth={group.depth * depthMultiplier} // Y축 방향으로 확장
              intensity={indirectLightIntensity || 0.8}
              position={[centerX, group.y, group.z - group.depth / 2 + 0.2]} // 가구 뒷면에서 20cm 앞으로
            />
          </>
        );
      })}
    </>
  );
};

export default UpperCabinetIndirectLight;