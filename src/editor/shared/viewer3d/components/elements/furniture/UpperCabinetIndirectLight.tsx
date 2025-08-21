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
      height: number; // 조명 높이 추가
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
      let lightHeight: number; // 조명의 실제 높이
      
      // 띄워서 배치 모드 확인
      const isFloatingMode = spaceInfo?.baseConfig?.placementType === 'float' && 
                            (spaceInfo?.baseConfig?.floatHeight || 0) > 0;
      
      if (isFloatingMode && !(moduleData.category === 'upper')) {
        // 띄워서 배치한 경우 (상부장이 아닌 경우)
        const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
        // 조명 높이 = 띄움 높이
        lightHeight = mmToThreeUnits(floatHeight);
        // 조명 Y 위치 = 띄움 높이의 중간
        lightY = mmToThreeUnits(floatHeight / 2);
      } else {
        // 상부장인 경우 - 하부장과 상부장 사이 간격 계산
        const lowerCabinetHeight = 820; // 하부장 표준 높이 (mm)
        const upperCabinetBottomMm = internalSpace.height - height; // 상부장 하단 위치
        const gapBetweenCabinets = upperCabinetBottomMm - lowerCabinetHeight; // 상하부장 사이 간격
        
        // 조명 높이 = 상하부장 사이 간격 (시각적으로 보이도록 2배 확대)
        lightHeight = mmToThreeUnits(gapBetweenCabinets) * 2.0;
        // 조명 Y 위치 = 상부장 하단에 더 가깝게 (간격의 80% 위치)
        lightY = mmToThreeUnits(lowerCabinetHeight + gapBetweenCabinets * 0.8);
      }
      
      // X 위치 계산
      const halfWidth = mmToThreeUnits(width / 2);
      const startX = cabinet.position.x - halfWidth;
      const endX = cabinet.position.x + halfWidth;
      
      // 가구 깊이 (Z축 방향)
      const lightDepth = mmToThreeUnits(depth);
      
      // 첫 번째 캐비넷이거나 이전 그룹과 인접하지 않은 경우
      if (!currentGroup || Math.abs(currentGroup.endX - startX) > 0.01) {
        // 새 그룹 시작
        currentGroup = {
          startX,
          endX,
          y: lightY,
          z: cabinet.position.z,
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
        
        // 조명 높이를 그대로 사용 (띄워서 배치: 띄움 높이, 상하부장: 사이 간격)
        const lightHeightToUse = group.height;
        
        return (
          <>
            {/* 뒤쪽 조명 (기존) */}
            <IndirectLight
              key={`upper-indirect-light-back-${index}`}
              width={width}
              depth={lightHeightToUse} // 조명 높이 사용 (Y축 방향)
              intensity={indirectLightIntensity || 0.8}
              position={[centerX, group.y, group.z - group.depth / 2 - 2.5]} // 백패널에서 25cm 뒤로
            />
            {/* 앞쪽 조명 (추가) */}
            <IndirectLight
              key={`upper-indirect-light-front-${index}`}
              width={width}
              depth={lightHeightToUse} // 조명 높이 사용 (Y축 방향)
              intensity={indirectLightIntensity || 0.8}
              position={[centerX, group.y, group.z + group.depth / 2 - 3.0]} // 가구 앞단에서 30cm 뒤로
            />
          </>
        );
      })}
    </>
  );
};

export default UpperCabinetIndirectLight;