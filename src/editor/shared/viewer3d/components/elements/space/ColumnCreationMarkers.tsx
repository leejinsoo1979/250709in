import React, { useState, useEffect } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useThree } from '@react-three/fiber';
import { Column } from '@/types/space';
import { ColumnIndexer } from '@/editor/shared/utils/indexing';

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

  // 단내림 구간 경계 체크 - 걸치면 무조건 스냅
  const checkDroppedCeilingBoundary = (xPosition: number): { adjusted: boolean; newX: number; zone?: 'normal' | 'dropped' } => {
    if (!spaceInfo?.droppedCeiling?.enabled) {
      return { adjusted: false, newX: xPosition };
    }

    const columnWidthMm = 300;
    const columnWidthInThreeUnits = columnWidthMm / 100;
    const halfColumnWidth = columnWidthInThreeUnits / 2;
    
    // 단내림 구간 정보 가져오기
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    if (!zoneInfo || !zoneInfo.dropped || !zoneInfo.normal) {
      return { adjusted: false, newX: xPosition };
    }

    // mm를 Three.js 단위로 변환
    const droppedStartX = (zoneInfo.dropped.startX / 100);
    const droppedEndX = ((zoneInfo.dropped.startX + zoneInfo.dropped.width) / 100);
    const normalStartX = (zoneInfo.normal.startX / 100);
    const normalEndX = ((zoneInfo.normal.startX + zoneInfo.normal.width) / 100);

    // 기둥의 왼쪽과 오른쪽 경계
    const columnLeft = xPosition - halfColumnWidth;
    const columnRight = xPosition + halfColumnWidth;

    // 단내림 위치에 따른 경계 체크
    if (spaceInfo.droppedCeiling.position === 'left') {
      // 왼쪽 단내림
      const boundaryX = droppedEndX;
      
      // 경계를 걸치면 무조건 스냅
      if (columnLeft < boundaryX && columnRight > boundaryX) {
        // 기둥 중심이 어디에 있는지로 결정
        if (xPosition < boundaryX) {
          // 단내림 구간으로 스냅
          const newX = boundaryX - halfColumnWidth;
          return { adjusted: true, newX, zone: 'dropped' };
        } else {
          // 일반 구간으로 스냅
          const newX = boundaryX + halfColumnWidth;
          return { adjusted: true, newX, zone: 'normal' };
        }
      }
      
      // 단내림 구간에 완전히 있으면 경계 끝에 스냅
      if (columnRight <= boundaryX) {
        const newX = boundaryX - halfColumnWidth;
        return { adjusted: true, newX, zone: 'dropped' };
      }
      
      return { adjusted: false, newX: xPosition };
    } else {
      // 오른쪽 단내림
      const boundaryX = normalEndX;
      
      // 경계를 걸치면 무조건 스냅
      if (columnLeft < boundaryX && columnRight > boundaryX) {
        // 기둥 중심이 어디에 있는지로 결정
        if (xPosition < boundaryX) {
          // 일반 구간으로 스냅
          const newX = boundaryX - halfColumnWidth;
          return { adjusted: true, newX, zone: 'normal' };
        } else {
          // 단내림 구간으로 스냅
          const newX = boundaryX + halfColumnWidth;
          return { adjusted: true, newX, zone: 'dropped' };
        }
      }
      
      // 단내림 구간에 완전히 있으면 경계 시작에 스냅
      if (columnLeft >= boundaryX) {
        const newX = boundaryX + halfColumnWidth;
        return { adjusted: true, newX, zone: 'dropped' };
      }
      
      return { adjusted: false, newX: xPosition };
    }

    return { adjusted: false, newX: xPosition };
  };

  // 기둥 위치를 가장 가까운 기둥에 스냅하는 함수 (뛰어넘기 방지)
  const snapToNearestColumn = (position: [number, number, number]): [number, number, number] => {
    const existingColumns = storeSpaceInfo?.columns || [];
    const columnWidthInThreeUnits = 300 / 100; // 300mm = 3 three units
    const snapThreshold = columnWidthInThreeUnits * 0.3; // 스냅 임계값 (30% 이내에서만 스냅)
    
    let snappedX = position[0];
    let shouldSnap = false;
    
    // 모든 기둥에 대해 검사
    for (const column of existingColumns) {
      if (!column.position) continue;
      
      const columnX = column.position[0];
      const columnLeft = columnX - columnWidthInThreeUnits / 2;
      const columnRight = columnX + columnWidthInThreeUnits / 2;
      
      // 현재 위치가 기둥과 겹치려고 하는지 확인
      const mouseLeft = position[0] - columnWidthInThreeUnits / 2;
      const mouseRight = position[0] + columnWidthInThreeUnits / 2;
      
      // 겹침 감지
      if ((mouseLeft < columnRight && mouseRight > columnLeft)) {
        // 겹치는 경우, 가장 가까운 쪽으로 밀착
        if (position[0] > columnX) {
          // 오른쪽으로 밀착
          const rightEdge = columnX + columnWidthInThreeUnits;
          if (Math.abs(position[0] - rightEdge) < snapThreshold) {
            snappedX = rightEdge;
            shouldSnap = true;
          }
        } else {
          // 왼쪽으로 밀착
          const leftEdge = columnX - columnWidthInThreeUnits;
          if (Math.abs(position[0] - leftEdge) < snapThreshold) {
            snappedX = leftEdge;
            shouldSnap = true;
          }
        }
      }
    }
    
    // 스냅되지 않았다면 가장 가까운 기둥에 밀착 시도
    if (!shouldSnap) {
      let closestDistance = Infinity;
      
      for (const column of existingColumns) {
        if (!column.position) continue;
        
        const leftSnapX = column.position[0] - columnWidthInThreeUnits;
        const rightSnapX = column.position[0] + columnWidthInThreeUnits;
        
        const distToLeft = Math.abs(position[0] - leftSnapX);
        const distToRight = Math.abs(position[0] - rightSnapX);
        
        // 왼쪽 스냅 체크 (겹치지 않는 경우만)
        if (distToLeft < snapThreshold && distToLeft < closestDistance) {
          // 스냅 위치가 다른 기둥과 겹치는지 확인
          const willOverlap = checkColumnOverlap([leftSnapX, position[1], position[2]]);
          if (!willOverlap) {
            closestDistance = distToLeft;
            snappedX = leftSnapX;
          }
        }
        
        // 오른쪽 스냅 체크 (겹치지 않는 경우만)
        if (distToRight < snapThreshold && distToRight < closestDistance) {
          // 스냅 위치가 다른 기둥과 겹치는지 확인
          const willOverlap = checkColumnOverlap([rightSnapX, position[1], position[2]]);
          if (!willOverlap) {
            closestDistance = distToRight;
            snappedX = rightSnapX;
          }
        }
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
        
        // 1. 먼저 단내림 구간 경계 체크 (최우선 순위) - 반복 체크로 확실하게
        let boundaryCheck = checkDroppedCeilingBoundary(newPosition[0]);
        let maxIterations = 10; // 최대 10번 반복해서 경계 걸침을 완전히 제거
        while (boundaryCheck.adjusted && maxIterations > 0) {
          newPosition[0] = boundaryCheck.newX;
          setIsSnapped(true);
          // 조정 후 다시 체크 (확실히 경계를 걸치지 않도록)
          boundaryCheck = checkDroppedCeilingBoundary(newPosition[0]);
          maxIterations--;
        }
        
        // 2. 경계 스냅이 없을 때만 기존 기둥에 스냅
        if (!isSnapped) {
          const originalX = newPosition[0];
          newPosition = snapToNearestColumn(newPosition);
          const snapped = Math.abs(originalX - newPosition[0]) > 0.01;
          setIsSnapped(snapped);
        }
        
        // 3. 스냅 후에도 공간 범위 체크
        newPosition[0] = Math.max(-spaceWidth/2 + columnWidthM/2, Math.min(spaceWidth/2 - columnWidthM/2, newPosition[0]));
        
        // 4. 최종적으로 다시 한번 경계 체크 (확실하게)
        const finalBoundaryCheck = checkDroppedCeilingBoundary(newPosition[0]);
        if (finalBoundaryCheck.adjusted) {
          newPosition[0] = finalBoundaryCheck.newX;
          setIsSnapped(true);
        }
        
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
    let finalPosition = position || ghostPosition;
    if (!finalPosition) return;
    
    // 단내림 구간 경계 체크 - 생성 시에도 정확한 위치로 조정
    const boundaryCheck = checkDroppedCeilingBoundary(finalPosition[0]);
    if (boundaryCheck.adjusted) {
      finalPosition = [boundaryCheck.newX, finalPosition[1], finalPosition[2]];
      console.log('🎯 기둥 생성 시 경계 조정:', { 
        original: position?.[0] || ghostPosition?.[0], 
        adjusted: boundaryCheck.newX 
      });
    }
    
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
              경계에 정렬됨
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