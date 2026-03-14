import React, { useState, useEffect } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useThree } from '@react-three/fiber';
import { PanelB } from '@/types/space';

interface PanelBCreationMarkersProps {
  spaceInfo: any;
}

const PanelBCreationMarkers: React.FC<PanelBCreationMarkersProps> = ({ spaceInfo }) => {
  const { isPanelBCreationMode } = useUIStore();
  const { addPanelB } = useSpaceConfigStore();
  const { indexing } = useDerivedSpaceStore();
  const { viewMode } = useSpace3DView();
  const { camera, raycaster, gl } = useThree();
  
  // 고스트 패널B 상태
  const [ghostPosition, setGhostPosition] = useState<[number, number, number] | null>(null);
  const [isHoveringSpace, setIsHoveringSpace] = useState(false);

  // 마우스 움직임 추적
  useEffect(() => {
    if (!isPanelBCreationMode || !gl.domElement) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // raycaster 설정
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      
      // 바닥 평면과의 교차점 계산
      const planeY = 0; // 바닥 높이
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersectPoint);
      
      if (intersectPoint) {
        // 공간 크기 제한
        const spaceWidth = (spaceInfo?.width || 3000) * 0.01;
        const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01;
        const panelDepthM = 730 * 0.01; // 패널B 깊이
        const panelWidthM = 600 * 0.01; // 패널B 너비
        const zPosition = -(spaceDepthM / 2) + (panelDepthM / 2); // 뒷벽에 맞닿도록
        
        const boundedX = Math.max(-spaceWidth/2 + panelWidthM/2, Math.min(spaceWidth/2 - panelWidthM/2, intersectPoint.x));
        
        setGhostPosition([boundedX, 0, zPosition]);
        setIsHoveringSpace(true);
      }
    };

    const handleMouseLeave = () => {
      setIsHoveringSpace(false);
      setGhostPosition(null);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isPanelBCreationMode, camera, raycaster, gl, spaceInfo]);

  // 패널B 생성 모드가 아니면 아무것도 렌더링하지 않음
  if (!isPanelBCreationMode) {
    return null;
  }

  // 간단한 고정 위치 계산 (공간 너비 기준)
  const getPlusIconPositions = (): number[] => {
    if (!spaceInfo?.width) {
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
    
    return positions;
  };

  // 패널B 생성 핸들러
  const handleCreatePanelB = (position?: [number, number, number]) => {
    // 위치가 제공되지 않으면 고스트 위치 사용
    const finalPosition = position || ghostPosition;
    if (!finalPosition) return;
    
    const newPanelB: PanelB = {
      id: `panelB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: finalPosition,
      width: 600, // 600mm
      height: 18, // 18mm 고정
      depth: 730, // 730mm
      color: '#8B4513',
      material: 'wood',
      orientation: 'horizontal'
    };
    
// console.log('🪵 새 패널B 생성:', newPanelB);
    addPanelB(newPanelB);
  };

  // 클릭 핸들러
  const handleClick = (e: any) => {
    e.stopPropagation();
    if (ghostPosition) {
      handleCreatePanelB();
    }
  };

  const plusPositions = getPlusIconPositions();

  if (plusPositions.length === 0) {
    return null;
  }

  return (
    <group>
      {/* 전체 공간 클릭 영역 (고스트 배치용) */}
      <mesh
        position={[0, 0, 0]}
        onPointerMove={(e) => e.stopPropagation()}
        onClick={handleClick}
      >
        <boxGeometry args={[(spaceInfo?.width || 3000) * 0.01, 0.01, (spaceInfo?.depth || 1500) * 0.01]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* 고스트 패널B */}
      {ghostPosition && isHoveringSpace && (
        <group position={ghostPosition}>
          {/* 고스트 패널B 본체 (가로 프레임) */}
          <mesh position={[0, 0.009, 0]}>
            <boxGeometry args={[600 * 0.01, 18 * 0.01, 730 * 0.01]} />
            <meshStandardMaterial
              color="#f59e0b"
              transparent
              opacity={0.5}
              emissive="#f59e0b"
              emissiveIntensity={0.2}
            />
          </mesh>
          
          {/* 고스트 패널B 윤곽선 */}
          <lineSegments position={[0, 0.009, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(600 * 0.01, 18 * 0.01, 730 * 0.01)]} />
            <lineBasicMaterial color="#f59e0b" linewidth={2} />
          </lineSegments>
          
          {/* 바닥 표시 */}
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.5, 32]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.8} />
          </mesh>
        </group>
      )}

      {/* 기존 + 아이콘들 (참고용으로 남겨둠) */}
      {plusPositions.map((xPosition, index) => (
        <group key={`panelB-marker-${index}`} position={[xPosition, 0, 0]}>
          
          {/* 큰 투명 클릭 영역 */}
          <mesh
            position={[0, 0.5, 0]}
            onClick={(e) => {
              e.stopPropagation();
// console.log('🎯 + 아이콘 클릭됨 (패널B):', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreatePanelB([xPosition, 0, zPosition]);
            }}
          >
            <boxGeometry args={[1.0, 1.0, 1.0]} />
            <meshBasicMaterial
              color="#f59e0b"
              transparent
              opacity={0.2}
              wireframe={false}
            />
          </mesh>

          {/* 큰 + 아이콘 배경 */}
          <mesh
            position={[0, 0.5, 0.1]}
            onClick={(e) => {
              e.stopPropagation();
// console.log('🎯 + 배경 클릭됨 (패널B):', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreatePanelB([xPosition, 0, zPosition]);
            }}
          >
            <planeGeometry args={[0.8, 0.8]} />
            <meshBasicMaterial
              color="#f59e0b"
              transparent
              opacity={0.8}
              side={2}
            />
          </mesh>

          {/* 큰 + 텍스트 */}
          <Text
            position={[0, 0.5, 0.11]}
            fontSize={0.5}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            onClick={(e) => {
              e.stopPropagation();
// console.log('🎯 + 텍스트 클릭됨 (패널B):', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreatePanelB([xPosition, 0, zPosition]);
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
// console.log('🎯 바닥 원 클릭됨 (패널B):', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreatePanelB([xPosition, 0, zPosition]);
            }}
          >
            <circleGeometry args={[0.4, 32]} />
            <meshBasicMaterial
              color="#dc2626"
              transparent
              opacity={0.7}
              side={2}
            />
          </mesh>

          {/* 세로 가이드 라인 */}
          <mesh
            position={[0, 0.25, 0]}
            onClick={(e) => {
              e.stopPropagation();
// console.log('🎯 가이드 라인 클릭됨 (패널B):', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreatePanelB([xPosition, 0, zPosition]);
            }}
          >
            <boxGeometry args={[0.05, 0.5, 0.05]} />
            <meshBasicMaterial
              color="#f59e0b"
              transparent
              opacity={0.8}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

export default PanelBCreationMarkers;