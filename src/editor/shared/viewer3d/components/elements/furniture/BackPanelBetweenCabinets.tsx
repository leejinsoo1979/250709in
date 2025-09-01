import React, { useMemo } from 'react';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import FinishingPanelWithTexture from '../../modules/components/FinishingPanelWithTexture';
import { useSpace3DView } from '../../../context/useSpace3DView';

interface BackPanelBetweenCabinetsProps {
  placedModules: PlacedModule[];
  spaceInfo: SpaceInfo;
}

// 단위 변환 함수
const mmToThreeUnits = (mm: number): number => mm * 0.01;

// 백패널 상수
const GAP_PANEL_OFFSET = 0.11; // 갭 백패널이 가구 뒷면에서 떨어진 거리 (11mm)

/**
 * 상하부장 사이의 백패널을 렌더링하는 컴포넌트
 * 같은 슬롯에 있는 상부장과 하부장을 찾아서 그 사이에 백패널을 렌더링
 */
const BackPanelBetweenCabinets: React.FC<BackPanelBetweenCabinetsProps> = ({
  placedModules,
  spaceInfo
}) => {
  const internalSpace = useMemo(() => calculateInternalSpace(spaceInfo), [spaceInfo]);
  const { renderMode } = useSpace3DView();
  
  // 슬롯별로 상부장과 하부장을 그룹화하고 백패널 정보 생성
  const backPanels = useMemo(() => {
    const slotGroups: { [key: number]: { upper?: PlacedModule; lower?: PlacedModule; hasPanel?: boolean } } = {};
    
    // 모든 배치된 모듈을 순회하면서 상하부장 찾기
    placedModules.forEach(module => {
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;
      
      const isUpper = moduleData.category === 'upper' || module.moduleId.includes('upper-cabinet');
      const isLower = moduleData.category === 'lower' || module.moduleId.includes('lower-cabinet');
      
      if (!isUpper && !isLower) return;
      
      const slotIndex = module.slotIndex ?? -1;
      if (slotIndex < 0) return;
      
      if (!slotGroups[slotIndex]) {
        slotGroups[slotIndex] = {};
      }
      
      if (isUpper) {
        slotGroups[slotIndex].upper = module;
        // 상부장에 갭 백패널이 활성화되어 있으면 슬롯에 패널 표시
        if (module.hasGapBackPanel) {
          slotGroups[slotIndex].hasPanel = true;
        }
        
        // 듀얼 상부장인 경우 다음 슬롯에도 등록
        if (module.isDualSlot) {
          const nextSlotIndex = slotIndex + 1;
          if (!slotGroups[nextSlotIndex]) {
            slotGroups[nextSlotIndex] = {};
          }
          slotGroups[nextSlotIndex].upper = module;
          if (module.hasGapBackPanel) {
            slotGroups[nextSlotIndex].hasPanel = true;
          }
        }
      } else if (isLower) {
        slotGroups[slotIndex].lower = module;
        // 하부장에 갭 백패널이 활성화되어 있으면 슬롯에 패널 표시
        if (module.hasGapBackPanel) {
          slotGroups[slotIndex].hasPanel = true;
        }
        
        // 듀얼 하부장인 경우 다음 슬롯에도 등록
        if (module.isDualSlot) {
          const nextSlotIndex = slotIndex + 1;
          if (!slotGroups[nextSlotIndex]) {
            slotGroups[nextSlotIndex] = {};
          }
          slotGroups[nextSlotIndex].lower = module;
          if (module.hasGapBackPanel) {
            slotGroups[nextSlotIndex].hasPanel = true;
          }
        }
      }
    });
    
    // 상부장과 하부장이 모두 있는 슬롯에 대해 백패널 정보 생성
    const panels: Array<{
      slotIndex: number;
      x: number;
      y: number;
      z: number;
      width: number;
      height: number;
      depth: number;
      furnitureDepth: number;
    }> = [];
    
    // 이미 처리된 상하부장 조합을 추적하기 위한 Set
    const processedPairs = new Set<string>();
    
    Object.entries(slotGroups).forEach(([slotIndexStr, group]) => {
      // 상부장과 하부장이 모두 있고, 둘 중 하나라도 hasPanel이 true인 경우에만 백패널 생성
      if (group.upper && group.lower && group.hasPanel) {
        const slotIndex = parseInt(slotIndexStr);
        
        // 중복 처리 방지를 위한 고유 키 생성
        const pairKey = `${group.upper.id}-${group.lower.id}`;
        if (processedPairs.has(pairKey)) {
          return; // 이미 처리된 조합은 건너뛰기
        }
        processedPairs.add(pairKey);
        
        // 상부장과 하부장의 데이터 가져오기
        const upperData = getModuleById(group.upper.moduleId, internalSpace, spaceInfo);
        const lowerData = getModuleById(group.lower.moduleId, internalSpace, spaceInfo);
        
        if (!upperData || !lowerData) return;
        
        // 위치 계산
        const upperHeight = upperData.dimensions.height;
        const lowerHeight = lowerData.dimensions.height;
        
        // 하부장의 실제 Y 위치 (저장된 위치 사용) - 저장된 위치를 그대로 사용
        // 하부장의 상단 Y 위치 = 하부장 중심 Y + 높이/2 + 상부 마감재(18mm)
        const lowerCenterY = group.lower.position.y * 100; // Three.js 단위를 mm로 변환
        const lowerTopY = lowerCenterY + lowerHeight / 2 + 18; // 하부장 상부 마감재 18mm 추가
        
        // 상부장의 실제 Y 위치 (저장된 위치 사용)
        // 상부장의 하단 Y 위치 = 상부장 중심 Y - 높이/2 - 하부 마감재(18mm)
        const upperCenterY = group.upper.position.y * 100; // Three.js 단위를 mm로 변환
        const upperBottomY = upperCenterY - upperHeight / 2 - 18; // 상부장 하부 마감재 18mm 제외
        
        // 갭 높이 계산 (상하부장 마감재 사이의 거리가 백패널 높이)
        const gapHeight = upperBottomY - lowerTopY;
        
        console.log('🎨 백패널 높이 계산 (실제 위치 기반):', {
          slotIndex,
          lowerModule: group.lower.moduleId,
          upperModule: group.upper.moduleId,
          lowerPosition_Y: group.lower.position.y,
          upperPosition_Y: group.upper.position.y,
          lowerCenterY_mm: lowerCenterY,
          upperCenterY_mm: upperCenterY,
          lowerHeight,
          upperHeight,
          lowerTopY,
          upperBottomY,
          gapHeight,
          설명: '저장된 가구 위치를 직접 사용하여 백패널 위치 계산'
        });
        
        // 갭이 있는 경우만 백패널 생성
        if (gapHeight > 0) {
          // 가구의 너비 (조정된 너비 사용)
          const width = group.upper.adjustedWidth || group.upper.customWidth || upperData.dimensions.width;
          
          // 가구의 깊이
          const depth = group.upper.customDepth || upperData.dimensions.depth;
          
          panels.push({
            slotIndex,
            x: group.upper.position.x,
            y: mmToThreeUnits(lowerTopY + gapHeight / 2 + 9), // 갭의 중앙에서 9mm 위로
            z: group.upper.position.z,
            width: mmToThreeUnits(width),
            height: mmToThreeUnits(gapHeight + 18), // 높이 18mm 확장
            depth: mmToThreeUnits(18), // 18mm 두께
            furnitureDepth: mmToThreeUnits(depth) // 가구 깊이 추가
          });
        }
      }
    });
    
    return panels;
  }, [placedModules, spaceInfo, internalSpace]);
  
  // 도어 색상 가져오기
  const doorColor = spaceInfo.materialConfig?.doorColor || '#E0E0E0';
  
  return (
    <>
      {backPanels.map((panel, index) => (
        <FinishingPanelWithTexture
          key={`back-panel-${panel.slotIndex}-${index}`}
          width={panel.width}
          height={panel.height}
          depth={panel.depth}
          position={[
            panel.x,
            panel.y,
            panel.z - panel.furnitureDepth - GAP_PANEL_OFFSET // 가구 뒷면에서 GAP_PANEL_OFFSET만큼 뒤로
          ]}
          spaceInfo={spaceInfo}
          doorColor={doorColor}
          renderMode={renderMode}
        />
      ))}
    </>
  );
};

export default BackPanelBetweenCabinets;