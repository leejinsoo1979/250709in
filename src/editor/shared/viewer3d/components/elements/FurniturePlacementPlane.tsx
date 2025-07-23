import React, { useMemo } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '../../utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useTheme } from '@/contexts/ThemeContext';

interface FurniturePlacementPlaneProps {
  spaceInfo: SpaceInfo;
}

const FurniturePlacementPlane: React.FC<FurniturePlacementPlaneProps> = ({ spaceInfo }) => {
  const isFurniturePlacementMode = useFurnitureStore(state => state.isFurniturePlacementMode);
  const placedModules = useFurnitureStore(state => state.placedModules);
  const { theme } = useTheme();
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 내경 공간의 중심 X 좌표 계산 (이격거리 고려)
  const totalWidth = spaceInfo.width;
  // internalSpace.startX는 이미 이격거리를 고려한 시작점
  const internalCenterX = -(totalWidth / 2) + internalSpace.startX + (internalSpace.width / 2);
  const internalCenterXThreeUnits = mmToThreeUnits(internalCenterX);
  
  // 바닥재 높이 계산
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const baseFrameHeightMm = spaceInfo.baseConfig?.height || 0;
  
  // 받침대 설정에 따른 기준면 높이 계산
  let planeY: number;
  
  if (!spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor') {
    // 받침대 있음: 바닥재 + 받침대 높이
    planeY = mmToThreeUnits(floorFinishHeightMm + baseFrameHeightMm);
  } else if (spaceInfo.baseConfig.type === 'stand') {
    // 받침대 없음
    if (spaceInfo.baseConfig.placementType === 'float') {
      // 띄워서 배치: 바닥재 + 띄움 높이
      const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
      planeY = mmToThreeUnits(floorFinishHeightMm + floatHeightMm);
    } else {
      // 바닥에 배치: 바닥재만
      planeY = mmToThreeUnits(floorFinishHeightMm);
    }
  } else {
    // 기본값: 바닥재만
    planeY = mmToThreeUnits(floorFinishHeightMm);
  }
  
  // 내경 공간 크기 - 공간 뒷면에 정확히 맞춤
  const planeWidth = mmToThreeUnits(internalSpace.width);
  const planeDepth = mmToThreeUnits(internalSpace.depth - 200); // 내경 공간에서 200mm 줄인 깊이 사용 (580mm)
  
  // 기준면을 내경 공간 중앙에 정확히 배치 (Z=0이 공간 앞면, -depth가 뒷면)
  const planeZ = mmToThreeUnits(0);
  
  // placedModules 중 도어가 장착된 모듈이 하나라도 있으면 바닥 슬롯 매쉬를 숨김
  const hasAnyDoor = placedModules.some(module => module.hasDoor);
  
  // 테마 색상을 실제 hex 값으로 변환
  const themeColorHex = useMemo(() => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
      if (primaryColor) {
        return primaryColor;
      }
    }
    return '#10b981'; // 기본값 (green)
  }, [theme.color]);
  
  return (
    <group position={[internalCenterXThreeUnits, planeY - 0.1, planeZ]}>
      {/* 도어가 하나라도 장착되어 있으면 바닥 슬롯 매쉬를 렌더링하지 않음 */}
      {!hasAnyDoor && (
        <mesh 
          key={`slot-mesh-${theme.color}-${theme.mode}`} // 테마 변경시 전체 재생성
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[planeWidth, planeDepth]} />
          <meshBasicMaterial 
            color={themeColorHex}
            transparent 
            opacity={0.3}
            side={2} // DoubleSide
          />
        </mesh>
      )}
    </group>
  );
};

export default FurniturePlacementPlane; 