import React from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { Column } from '@/types/space';

interface ColumnCreationMarkersProps {
  spaceInfo: any;
}

const ColumnCreationMarkers: React.FC<ColumnCreationMarkersProps> = ({ spaceInfo }) => {
  const { isColumnCreationMode } = useUIStore();
  const { addColumn } = useSpaceConfigStore();
  const { indexing } = useDerivedSpaceStore();
  const { viewMode } = useSpace3DView();

  // 디버깅용 로그
  console.log('🔍 ColumnCreationMarkers 렌더링 상태:', {
    isColumnCreationMode,
    indexing,
    threeUnitPositions: indexing?.threeUnitPositions,
    positionsLength: indexing?.threeUnitPositions?.length
  });

  // 기둥 생성 모드가 아니면 아무것도 렌더링하지 않음
  if (!isColumnCreationMode) {
    return null;
  }

  // 간단한 고정 위치 계산 (공간 너비 기준)
  const getPlusIconPositions = (): number[] => {
    console.log('🏠 공간 정보:', spaceInfo);
    
    if (!spaceInfo?.width) {
      console.log('❌ 공간 너비 정보가 없음');
      return [];
    }

    const spaceWidthInMeters = spaceInfo.width * 0.001; // mm를 미터로 변환
    const positions: number[] = [];
    
    // 공간을 4등분하여 3개의 + 아이콘 위치 생성
    const numSections = 4;
    for (let i = 1; i < numSections; i++) {
      const x = (-spaceWidthInMeters / 2) + (spaceWidthInMeters / numSections) * i;
      positions.push(x);
    }
    
    console.log('✅ 고정 위치 계산된 + 아이콘 위치들:', positions);
    return positions;
  };

  // 기둥 생성 핸들러
  const handleCreateColumn = (xPosition: number) => {
    // 공간 높이 가져오기
    const spaceHeightMm = spaceInfo?.height || 2400;
    const spaceHeightM = spaceHeightMm * 0.001;
    
    const newColumn: Column = {
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [xPosition, 0, -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2], // Y=0 바닥 기준, Z는 뒷벽에 맞닿도록
      width: 300, // 300mm
      height: 2400, // 2400mm
      depth: 730, // 730mm
      color: '#888888',
      material: 'concrete'
    };
    
    console.log('🏗️ 새 기둥 생성:', newColumn);
    console.log('🏗️ 공간 높이:', spaceHeightMm, 'mm');
    addColumn(newColumn);
  };

  const plusPositions = getPlusIconPositions();

  console.log('🎯 최종 렌더링할 + 아이콘 개수:', plusPositions.length);

  if (plusPositions.length === 0) {
    console.log('❌ 렌더링할 + 아이콘이 없음');
    return null;
  }

  return (
    <group>
      {plusPositions.map((xPosition, index) => (
        <group key={`column-marker-${index}`} position={[xPosition, 0, 0]}>
          {console.log(`🎯 렌더링 중: index=${index}, xPosition=${xPosition}`)}
          
          {/* 큰 투명 클릭 영역 */}
          <mesh
            position={[0, 1.0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              console.log('🎯 + 아이콘 클릭됨:', xPosition);
              handleCreateColumn(xPosition);
            }}
          >
            <boxGeometry args={[1.0, 2.0, 1.0]} />
            <meshBasicMaterial
              color="#4CAF50"
              transparent
              opacity={0.2}
              wireframe={false}
            />
          </mesh>

          {/* 큰 + 아이콘 배경 */}
          <mesh
            position={[0, 1.0, 0.1]}
            onClick={(e) => {
              e.stopPropagation();
              console.log('🎯 + 배경 클릭됨:', xPosition);
              handleCreateColumn(xPosition);
            }}
          >
            <planeGeometry args={[0.8, 0.8]} />
            <meshBasicMaterial
              color="#4CAF50"
              transparent
              opacity={0.8}
              side={2}
            />
          </mesh>

          {/* 큰 + 텍스트 */}
          <Text
            position={[0, 1.0, 0.11]}
            fontSize={0.5}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            onClick={(e) => {
              e.stopPropagation();
              console.log('🎯 + 텍스트 클릭됨:', xPosition);
              handleCreateColumn(xPosition);
            }}
          >
            +
          </Text>

          {/* 바닥 표시 원 (더 크게) */}
          <mesh
            position={[0, 0.05, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              console.log('🎯 바닥 원 클릭됨:', xPosition);
              handleCreateColumn(xPosition);
            }}
          >
            <circleGeometry args={[0.4, 32]} />
            <meshBasicMaterial
              color="#ff6b6b"
              transparent
              opacity={0.7}
              side={2}
            />
          </mesh>

          {/* 세로 가이드 라인 */}
          <mesh
            position={[0, 0.5, 0]}
            onClick={(e) => {
              e.stopPropagation();
              console.log('🎯 가이드 라인 클릭됨:', xPosition);
              handleCreateColumn(xPosition);
            }}
          >
            <boxGeometry args={[0.05, 1.0, 0.05]} />
            <meshBasicMaterial
              color="#4CAF50"
              transparent
              opacity={0.8}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

export default ColumnCreationMarkers;