import React, { useState, useEffect } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useThree } from '@react-three/fiber';
import { Column } from '@/types/space';

interface ColumnCreationMarkersProps {
  spaceInfo: any;
}

const ColumnCreationMarkers: React.FC<ColumnCreationMarkersProps> = ({ spaceInfo }) => {
  const { isColumnCreationMode } = useUIStore();
  const { addColumn, spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const { indexing } = useDerivedSpaceStore();
  const { viewMode } = useSpace3DView();
  const { camera, raycaster, gl } = useThree();
  
  // 고스트 기둥 상태
  const [ghostPosition, setGhostPosition] = useState<[number, number, number] | null>(null);
  const [isHoveringSpace, setIsHoveringSpace] = useState(false);
  const [isValidPosition, setIsValidPosition] = useState(true);
  const [isSnapped, setIsSnapped] = useState(false); // 스냅 상태

  // 디버깅용 로그
  // console.log('🔍 ColumnCreationMarkers 렌더링 상태:', {
  //   isColumnCreationMode,
  //   indexing,
  //   threeUnitPositions: indexing?.threeUnitPositions,
  //   positionsLength: indexing?.threeUnitPositions?.length,
  //   ghostPosition
  // });

  // 기둥이 겹치는지 확인하는 함수
  const checkColumnOverlap = (newPosition: [number, number, number]): boolean => {
    const existingColumns = storeSpaceInfo?.columns || [];
    const columnWidthInThreeUnits = 300 / 100; // 300mm = 3 three units (1 unit = 100mm)
    const epsilon = 0.001; // 부동소수점 오차 허용치
    const minDistance = columnWidthInThreeUnits - epsilon; // 아주 약간의 여유를 두어 완전히 붙을 수 있게 함

    for (const column of existingColumns) {
      if (!column.position) continue;
      
      // X축 거리만 확인 (기둥은 보통 X축으로만 이동)
      const distance = Math.abs(column.position[0] - newPosition[0]);
      
      // 두 기둥 중심 간 거리가 최소 거리보다 작으면 겹침 (아주 약간의 허용치 포함)
      if (distance < minDistance) {
        return true; // 겹침
      }
    }
    
    return false; // 겹치지 않음
  };

  // 기둥 위치를 가장 가까운 기둥에 스냅하는 함수
  const snapToNearestColumn = (position: [number, number, number]): [number, number, number] => {
    const existingColumns = storeSpaceInfo?.columns || [];
    const columnWidthInThreeUnits = 300 / 100; // 300mm = 3 three units
    const snapThreshold = columnWidthInThreeUnits * 0.3; // 스냅 임계값 (30% 이내에서만 스냅)
    
    let snappedX = position[0];
    let closestDistance = Infinity;
    let closestColumn = null;
    
    // 가장 가까운 기둥 찾기
    for (const column of existingColumns) {
      if (!column.position) continue;
      
      // 왼쪽에 붙을 위치와 오른쪽에 붙을 위치 계산
      const leftSnapX = column.position[0] - columnWidthInThreeUnits;
      const rightSnapX = column.position[0] + columnWidthInThreeUnits;
      
      const distToLeft = Math.abs(position[0] - leftSnapX);
      const distToRight = Math.abs(position[0] - rightSnapX);
      
      // 왼쪽 스냅 체크
      if (distToLeft < snapThreshold && distToLeft < closestDistance) {
        closestDistance = distToLeft;
        snappedX = leftSnapX;
        closestColumn = column;
      }
      
      // 오른쪽 스냅 체크
      if (distToRight < snapThreshold && distToRight < closestDistance) {
        closestDistance = distToRight;
        snappedX = rightSnapX;
        closestColumn = column;
      }
    }
    
    return [snappedX, position[1], position[2]];
  };

  // 마우스 움직임 추적
  useEffect(() => {
    if (!isColumnCreationMode || !gl.domElement) return;

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
        const columnDepthM = 730 * 0.01; // 기둥 깊이
        const columnWidthM = 300 * 0.01; // 기둥 너비
        const zPosition = -(spaceDepthM / 2) + (columnDepthM / 2); // 뒷벽에 맞닿도록
        
        const boundedX = Math.max(-spaceWidth/2 + columnWidthM/2, Math.min(spaceWidth/2 - columnWidthM/2, intersectPoint.x));
        
        let newPosition: [number, number, number] = [boundedX, 0, zPosition];
        
        // 기존 기둥에 스냅
        const originalX = newPosition[0];
        newPosition = snapToNearestColumn(newPosition);
        const snapped = Math.abs(originalX - newPosition[0]) > 0.01; // 스냅되었는지 확인
        setIsSnapped(snapped);
        
        // 스냅 후에도 공간 범위 체크
        newPosition[0] = Math.max(-spaceWidth/2 + columnWidthM/2, Math.min(spaceWidth/2 - columnWidthM/2, newPosition[0]));
        
        setGhostPosition(newPosition);
        setIsHoveringSpace(true);
        
        // 겹침 검사
        const isOverlapping = checkColumnOverlap(newPosition);
        setIsValidPosition(!isOverlapping);
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
  }, [isColumnCreationMode, camera, raycaster, gl, spaceInfo]);

  // 기둥 생성 모드가 아니면 아무것도 렌더링하지 않음
  if (!isColumnCreationMode) {
    return null;
  }

  // 간단한 고정 위치 계산 (공간 너비 기준)
  const getPlusIconPositions = (): number[] => {
    // console.log('🏠 공간 정보:', spaceInfo);
    
    if (!spaceInfo?.width) {
      // console.log('❌ 공간 너비 정보가 없음');
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
    
    // console.log('✅ 고정 위치 계산된 + 아이콘 위치들:', positions);
    return positions;
  };

  // 기둥 생성 핸들러
  const handleCreateColumn = (position?: [number, number, number]) => {
    // 위치가 제공되지 않으면 고스트 위치 사용
    const finalPosition = position || ghostPosition;
    if (!finalPosition) return;
    
    // 겹침 검사
    if (checkColumnOverlap(finalPosition)) {
      // console.log('❌ 기둥 생성 실패: 기존 기둥과 겹침');
      return; // 겹치면 생성하지 않음
    }
    
    // 공간 높이 가져오기
    const spaceHeightMm = spaceInfo?.height || 2400;
    
    const newColumn: Column = {
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: finalPosition,
      width: 300, // 300mm
      height: spaceHeightMm, // 공간 높이와 동일
      depth: 730, // 730mm
      color: '#E0E0E0',
      material: 'concrete'
    };
    
    // console.log('✅ 새 기둥 생성 성공:', newColumn);
    addColumn(newColumn);
  };

  // 클릭 핸들러
  const handleClick = (e: any) => {
    e.stopPropagation();
    if (ghostPosition && isValidPosition) {
      handleCreateColumn();
    }
  };

  const plusPositions = getPlusIconPositions();

  // console.log('🎯 최종 렌더링할 + 아이콘 개수:', plusPositions.length);

  if (plusPositions.length === 0) {
    // console.log('❌ 렌더링할 + 아이콘이 없음');
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

      {/* 고스트 기둥 */}
      {ghostPosition && isHoveringSpace && (
        <group position={ghostPosition}>
          {/* 고스트 기둥 본체 */}
          <mesh position={[0, (spaceInfo?.height || 2400) * 0.01 / 2, 0]}>
            <boxGeometry args={[300 * 0.01, (spaceInfo?.height || 2400) * 0.01, 730 * 0.01]} />
            <meshStandardMaterial
              color={isValidPosition ? (isSnapped ? "#3b82f6" : "#10b981") : "#ef4444"}
              transparent
              opacity={isSnapped ? 0.7 : 0.5}
              emissive={isValidPosition ? (isSnapped ? "#3b82f6" : "#10b981") : "#ef4444"}
              emissiveIntensity={isSnapped ? 0.4 : 0.2}
            />
          </mesh>
          
          {/* 고스트 기둥 윤곽선 */}
          <lineSegments position={[0, (spaceInfo?.height || 2400) * 0.01 / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(300 * 0.01, (spaceInfo?.height || 2400) * 0.01, 730 * 0.01)]} />
            <lineBasicMaterial color={isValidPosition ? (isSnapped ? "#3b82f6" : "#10b981") : "#ef4444"} linewidth={isSnapped ? 3 : 2} />
          </lineSegments>
          
          {/* 바닥 표시 */}
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[isSnapped ? 0.7 : 0.5, 32]} />
            <meshBasicMaterial color={isValidPosition ? (isSnapped ? "#3b82f6" : "#10b981") : "#ef4444"} transparent opacity={isSnapped ? 1.0 : 0.8} />
          </mesh>
          
          {/* 스냅 표시 */}
          {isSnapped && isValidPosition && (
            <Text
              position={[0, (spaceInfo?.height || 2400) * 0.01 + 2, 0]}
              fontSize={0.4}
              color="#3b82f6"
              anchorX="center"
              anchorY="middle"
            >
              완전히 붙음
            </Text>
          )}
          
          {/* 겹침 경고 텍스트 */}
          {!isValidPosition && (
            <Text
              position={[0, (spaceInfo?.height || 2400) * 0.01 + 2, 0]}
              fontSize={0.5}
              color="#ef4444"
              anchorX="center"
              anchorY="middle"
            >
              기둥이 겹칩니다
            </Text>
          )}
        </group>
      )}

      {/* 기존 + 아이콘들 (참고용으로 남겨둠) */}
      {plusPositions.map((xPosition, index) => (
        <group key={`column-marker-${index}`} position={[xPosition, 0, 0]}>
          {/* console.log(`🎯 렌더링 중: index=${index}, xPosition=${xPosition}`) */}
          
          {/* 큰 투명 클릭 영역 */}
          <mesh
            position={[0, 1.0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              // console.log('🎯 + 아이콘 클릭됨:', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreateColumn([xPosition, 0, zPosition]);
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
              // console.log('🎯 + 배경 클릭됨:', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreateColumn([xPosition, 0, zPosition]);
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
              // console.log('🎯 + 텍스트 클릭됨:', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreateColumn([xPosition, 0, zPosition]);
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
              // console.log('🎯 바닥 원 클릭됨:', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreateColumn([xPosition, 0, zPosition]);
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
              // console.log('🎯 가이드 라인 클릭됨:', xPosition);
              const zPosition = -(spaceInfo?.depth || 1500) * 0.01 / 2 + (730 * 0.01) / 2;
              handleCreateColumn([xPosition, 0, zPosition]);
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