import React, { useMemo } from 'react';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { Column } from '@/types/space';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';

interface MullionPanelProps {
  column: Column;
  spaceInfo: SpaceInfo;
  side: 'left' | 'right'; // 멍장이 위치할 쪽
  slotIndex: number;
  slotWidth: number;
}

/**
 * 멍장 패널 컴포넌트
 * 기둥이 중간에 위치한 슬롯에서 좁은 쪽을 마감하는 패널
 */
const MullionPanel: React.FC<MullionPanelProps> = ({
  column,
  spaceInfo,
  side,
  slotIndex,
  slotWidth
}) => {
  const { viewMode } = useSpace3DView();
  const { shadowEnabled } = useUIStore();
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 멍장 패널 치수
  const mullionWidth = mmToThreeUnits(50); // 멍장 패널 너비 50mm
  const mullionHeight = mmToThreeUnits(column.height);
  const mullionDepth = mmToThreeUnits(spaceInfo.depth * 0.9); // 가구 깊이와 동일
  
  // 멍장 패널 위치 계산
  const columnCenterX = column.position[0];
  const columnWidth = mmToThreeUnits(column.width);
  
  let mullionX: number;
  if (side === 'left') {
    // 기둥 왼쪽에 멍장 패널 배치
    mullionX = columnCenterX - columnWidth / 2 - mullionWidth / 2;
  } else {
    // 기둥 오른쪽에 멍장 패널 배치
    mullionX = columnCenterX + columnWidth / 2 + mullionWidth / 2;
  }
  
  // 멍장 패널 색상
  const panelColor = '#F5F5F5'; // 연한 회색
  const edgeColor = '#DDDDDD'; // 테두리 색상
  
  // 윤곽선을 위한 geometry
  const panelGeometry = useMemo(() => new THREE.BoxGeometry(mullionWidth, mullionHeight, mullionDepth), [mullionWidth, mullionHeight, mullionDepth]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(panelGeometry), [panelGeometry]);
  
  return (
    <group position={[mullionX, column.position[1], 0]}>
      {/* 멍장 패널 본체 */}
      <mesh castShadow={shadowEnabled} receiveShadow={shadowEnabled} geometry={panelGeometry}>
        <meshLambertMaterial color={panelColor} />
      </mesh>
      
      {/* 멍장 패널 윤곽선 */}
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
      
      {/* 멍장 패널 식별 표시 (개발용) */}
      <mesh 
        position={[0, mullionHeight * 0.4, mullionDepth / 2 + 0.002]}
        visible={false} // 개발 중에만 표시
      >
        <circleGeometry args={[0.015]} />
        <meshBasicMaterial color="#4ECDC4" />
      </mesh>
    </group>
  );
};

export default MullionPanel; 