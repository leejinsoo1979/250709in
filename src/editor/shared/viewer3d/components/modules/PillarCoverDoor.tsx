import React from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { Column } from '@/types/space';
import { PillarCoverDoor as PillarCoverDoorType } from '@/editor/shared/utils/columnSlotProcessor';

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
  
  return (
    <group position={[column.position[0], column.position[1], doorZ]}>
      {/* 도어 본체 */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[doorWidth, doorHeight, doorThickness]} />
        <meshLambertMaterial color={doorColor} />
      </mesh>
      
      {/* 도어 손잡이 */}
      <mesh 
        position={[doorWidth * 0.35, 0, doorThickness / 2 + 0.005]}
        castShadow
      >
        <boxGeometry args={[0.02, 0.15, 0.01]} />
        <meshLambertMaterial color={handleColor} />
      </mesh>
      
      {/* 도어 프레임 (외곽선) */}
      <mesh position={[0, 0, doorThickness / 2 + 0.001]}>
        <ringGeometry args={[doorWidth / 2 - 0.005, doorWidth / 2]} />
        <meshBasicMaterial color="#AAAAAA" transparent opacity={0.5} />
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