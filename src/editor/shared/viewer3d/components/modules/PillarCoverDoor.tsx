import React, { useMemo } from 'react';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { Column } from '@/types/space';
import { PillarCoverDoor as PillarCoverDoorType } from '@/editor/shared/utils/columnSlotProcessor';
import { useSpace3DView } from '../../context/useSpace3DView';

interface PillarCoverDoorProps {
  column: Column;
  spaceInfo: SpaceInfo;
  doorConfig: PillarCoverDoorType;
  slotWidth: number;
}

/**
 * 기둥 커버 도어 컴포넌트
 * 기둥을 숨기기 위한 비수납형 도어
 */
const PillarCoverDoor: React.FC<PillarCoverDoorProps> = ({
  column,
  spaceInfo,
  doorConfig,
  slotWidth
}) => {
  const { viewMode } = useSpace3DView();
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 도어 치수 계산
  const doorWidth = mmToThreeUnits(doorConfig.width);
  const doorHeight = mmToThreeUnits(doorConfig.height);
  const doorThickness = mmToThreeUnits(20); // 도어 두께 20mm
  
  // 도어 위치 계산 (기둥 앞면에 배치)
  const columnFrontZ = column.position[2] - (column.depth * 0.01) / 2;
  const doorZ = columnFrontZ - doorThickness / 2;
  
  // 도어 색상 (기본 도어와 동일)
  const doorColor = '#E8E8E8'; // 연한 회색
  const handleColor = '#C0C0C0'; // 손잡이 색상
  
  // 윤곽선을 위한 geometry
  const doorGeometry = useMemo(() => new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness), [doorWidth, doorHeight, doorThickness]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(doorGeometry), [doorGeometry]);
  
  return (
    <group position={[column.position[0], column.position[1], doorZ]}>
      {/* 도어 본체 */}
      <mesh castShadow receiveShadow geometry={doorGeometry}>
        <meshLambertMaterial color={doorColor} />
      </mesh>
      
      {/* 도어 윤곽선 */}
      {viewMode === '3D' ? (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial 
            color="#505050"
            transparent={true}
            opacity={0.9}
            depthTest={true}
            depthWrite={false}
            polygonOffset={true}
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-10}
          />
        </lineSegments>
      ) : (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial 
            color="#666666" 
            linewidth={0.5} 
          />
        </lineSegments>
      )}
      
      {/* 도어 손잡이 */}
      <mesh 
        position={[doorWidth * 0.35, 0, doorThickness / 2 + 0.005]}
        castShadow
      >
        <boxGeometry args={[0.02, 0.15, 0.01]} />
        <meshLambertMaterial color={handleColor} />
      </mesh>
      
      {/* 비수납 표시 (시각적 구별을 위한 작은 표시) */}
      <mesh 
        position={[-doorWidth * 0.4, doorHeight * 0.4, doorThickness / 2 + 0.002]}
        visible={false} // 개발 중에만 표시, 실제로는 숨김
      >
        <circleGeometry args={[0.01]} />
        <meshBasicMaterial color="#FF6B6B" />
      </mesh>
    </group>
  );
};

export default PillarCoverDoor; 