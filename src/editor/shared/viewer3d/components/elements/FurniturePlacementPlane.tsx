import React from 'react';
import { Plane, Edges } from '@react-three/drei';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '../../utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';

interface FurniturePlacementPlaneProps {
  spaceInfo: SpaceInfo;
}

const FurniturePlacementPlane: React.FC<FurniturePlacementPlaneProps> = ({ spaceInfo }) => {
  const isFurniturePlacementMode = useFurnitureStore(state => state.isFurniturePlacementMode);
  
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
  
  return (
    <group position={[internalCenterXThreeUnits, planeY - 0.1, planeZ]}>
      {/* 가구 배치 기준면 - 초록색 반투명 (Z-fighting 방지를 위해 0.1 단위 아래로, 내경 중심에 배치) */}
      <Plane
        args={[planeWidth, planeDepth]}
        rotation={[-Math.PI / 2, 0, 0]} // 수평으로 회전
      >
        <meshBasicMaterial 
          color={isFurniturePlacementMode ? "#10B981" : "#10B981"} 
          transparent 
          opacity={0.3}
          side={2} // DoubleSide
        />
        
        {/* R3F 방식의 테두리 선 */}
        <Edges color={isFurniturePlacementMode ? "#10B981" : "#10B981"} />
      </Plane>
    </group>
  );
};

export default FurniturePlacementPlane; 