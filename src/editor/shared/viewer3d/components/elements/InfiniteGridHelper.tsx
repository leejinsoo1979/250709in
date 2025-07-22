import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';

interface InfiniteGridHelperProps {
  viewMode: '2D' | '3D';
  enabled?: boolean;
  fadeFactor?: number;
  axisColor?: string;
  gridColor?: string;
  centerLineColor?: string;
}

/**
 * CAD 스타일의 동적 무한 그리드 시스템
 * 카메라 줌 레벨에 따라 자동으로 그리드 밀도와 범위가 조정됩니다.
 */
const InfiniteGridHelper: React.FC<InfiniteGridHelperProps> = ({
  viewMode,
  enabled = true,
  fadeFactor = 0.8,
  axisColor = '#ff4444',
  gridColor = '#c0c0c0',
  centerLineColor = '#888888'
}) => {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const majorLinesRef = useRef<THREE.LineSegments>(null);
  const minorLinesRef = useRef<THREE.LineSegments>(null);
  const axisLinesRef = useRef<THREE.LineSegments>(null);
  
  const { spaceInfo } = useSpaceConfigStore();
  
  // 카메라 거리 기반으로 그리드 파라미터 계산
  const gridParams = useMemo(() => {
    if (!enabled || viewMode === '3D') return null;
    
    // 카메라 위치에서 원점까지의 거리 계산
    const cameraDistance = camera.position.length();
    
    // 줌 레벨에 따른 그리드 간격 결정 (CAD 스타일)
    let baseGridSize: number;
    let subdivisions: number;
    
    if (cameraDistance < 2) {
      // 매우 가까운 줌 - 10mm 간격
      baseGridSize = 0.01; // 10mm
      subdivisions = 10; // 1mm 세부 간격
    } else if (cameraDistance < 5) {
      // 가까운 줌 - 50mm 간격
      baseGridSize = 0.05; // 50mm
      subdivisions = 5; // 10mm 세부 간격
    } else if (cameraDistance < 10) {
      // 중간 줌 - 100mm 간격
      baseGridSize = 0.1; // 100mm
      subdivisions = 10; // 10mm 세부 간격
    } else if (cameraDistance < 20) {
      // 보통 줌 - 500mm 간격
      baseGridSize = 0.5; // 500mm
      subdivisions = 5; // 100mm 세부 간격
    } else if (cameraDistance < 50) {
      // 중간 거리 줌 - 1000mm (1m) 간격
      baseGridSize = 1.0; // 1000mm (1m)
      subdivisions = 10; // 100mm 세부 간격
    } else {
      // 먼 거리 줌 - 5000mm (5m) 간격
      baseGridSize = 5.0; // 5000mm (5m)
      subdivisions = 5; // 1000mm (1m) 세부 간격
    }
    
    // 그리드 크기는 카메라 거리에 비례하여 동적 조정 (더 크게)
    const gridExtent = Math.max(cameraDistance * 3, 50);
    const minorGridSize = baseGridSize / subdivisions;
    
    return {
      baseGridSize,
      minorGridSize,
      gridExtent,
      subdivisions,
      cameraDistance
    };
  }, [camera.position, enabled, viewMode]);
  
  // 그리드 지오메트리 생성
  const geometries = useMemo(() => {
    if (!gridParams) return null;
    
    const { baseGridSize, minorGridSize, gridExtent } = gridParams;
    
    // 주요 그리드 라인 생성
    const majorPoints: number[] = [];
    const minorPoints: number[] = [];
    const axisPoints: number[] = [];
    
    // 그리드 범위 계산
    const startX = -gridExtent;
    const endX = gridExtent;
    const startY = -gridExtent;
    const endY = gridExtent;
    
    // 주요 그리드 라인 (기본 간격)
    for (let x = startX; x <= endX; x += baseGridSize) {
      if (Math.abs(x) < 0.001) continue; // 축 라인 제외
      majorPoints.push(x, startY, 0, x, endY, 0);
    }
    for (let y = startY; y <= endY; y += baseGridSize) {
      if (Math.abs(y) < 0.001) continue; // 축 라인 제외
      majorPoints.push(startX, y, 0, endX, y, 0);
    }
    
    // 보조 그리드 라인 (세부 간격)
    for (let x = startX; x <= endX; x += minorGridSize) {
      if (Math.abs(x % baseGridSize) < 0.001) continue; // 주요 그리드와 겹치는 경우 제외
      if (Math.abs(x) < 0.001) continue; // 축 라인 제외
      minorPoints.push(x, startY, 0, x, endY, 0);
    }
    for (let y = startY; y <= endY; y += minorGridSize) {
      if (Math.abs(y % baseGridSize) < 0.001) continue; // 주요 그리드와 겹치는 경우 제외
      if (Math.abs(y) < 0.001) continue; // 축 라인 제외
      minorPoints.push(startX, y, 0, endX, y, 0);
    }
    
    // 중앙 축 라인 (X, Y축)
    axisPoints.push(
      // X축 (빨간색)
      startX, 0, 0, endX, 0, 0,
      // Y축 (초록색) 
      0, startY, 0, 0, endY, 0
    );
    
    return {
      majorPoints: new Float32Array(majorPoints),
      minorPoints: new Float32Array(minorPoints),
      axisPoints: new Float32Array(axisPoints)
    };
  }, [gridParams]);
  
  // 카메라 거리에 따른 투명도 계산
  const opacity = useMemo(() => {
    if (!gridParams) return 0;
    
    const { cameraDistance } = gridParams;
    
    // 카메라가 너무 가깝거나 멀 때 투명도 조정
    let baseOpacity = 0.8; // 더 진하게
    if (cameraDistance < 1) {
      baseOpacity = Math.max(0.3, 0.8 * (cameraDistance / 1));
    } else if (cameraDistance > 100) {
      baseOpacity = Math.max(0.3, 0.8 * (100 / cameraDistance));
    }
    
    return {
      major: baseOpacity * 0.9, // 더 진하게
      minor: baseOpacity * 0.5, // 더 진하게
      axis: Math.min(1.0, baseOpacity * 1.0)
    };
  }, [gridParams]);
  
  // 실시간 업데이트 (카메라 이동 감지)
  useFrame((state) => {
    if (!enabled || viewMode === '3D' || !groupRef.current) return;
    
    // 디버깅 로그 (2초마다)
    if (Math.floor(state.clock.elapsedTime) % 2 === 0 && state.clock.elapsedTime % 1 < 0.1) {
      console.log('🔲 InfiniteGridHelper 상태:', {
        enabled,
        viewMode,
        cameraDistance: camera.position.length(),
        gridParams: gridParams ? {
          baseGridSize: gridParams.baseGridSize,
          minorGridSize: gridParams.minorGridSize,
          gridExtent: gridParams.gridExtent
        } : null,
        geometries: !!geometries,
        groupVisible: groupRef.current?.visible
      });
    }
    
    // 그리드를 카메라 위치에 맞춰 이동 (무한 그리드 효과)
    const cameraPos = camera.position;
    groupRef.current.position.set(
      Math.floor(cameraPos.x), 
      Math.floor(cameraPos.y), 
      -0.001 // Z축은 바닥에 고정
    );
  });
  
  // 지오메트리 업데이트
  useEffect(() => {
    if (!geometries || !majorLinesRef.current || !minorLinesRef.current || !axisLinesRef.current) return;
    
    // 주요 그리드 업데이트
    const majorGeometry = majorLinesRef.current.geometry;
    majorGeometry.setAttribute('position', new THREE.BufferAttribute(geometries.majorPoints, 3));
    majorGeometry.computeBoundingSphere();
    
    // 보조 그리드 업데이트
    const minorGeometry = minorLinesRef.current.geometry;
    minorGeometry.setAttribute('position', new THREE.BufferAttribute(geometries.minorPoints, 3));
    minorGeometry.computeBoundingSphere();
    
    // 축 라인 업데이트
    const axisGeometry = axisLinesRef.current.geometry;
    axisGeometry.setAttribute('position', new THREE.BufferAttribute(geometries.axisPoints, 3));
    axisGeometry.computeBoundingSphere();
  }, [geometries]);
  
  if (!enabled || viewMode === '3D' || !gridParams || !geometries || !opacity) {
    return null;
  }
  
  return (
    <group ref={groupRef} renderOrder={-1000}>
      {/* 보조 그리드 (가장 세밀한 간격) */}
      <lineSegments ref={minorLinesRef} renderOrder={-999}>
        <bufferGeometry />
        <lineBasicMaterial 
          color="#999999"
          opacity={opacity.minor} 
          transparent 
          depthWrite={false}
          depthTest={false}
        />
      </lineSegments>
      
      {/* 주요 그리드 (기본 간격) */}
      <lineSegments ref={majorLinesRef} renderOrder={-998}>
        <bufferGeometry />
        <lineBasicMaterial 
          color="#666666"
          opacity={opacity.major} 
          transparent 
          depthWrite={false}
          depthTest={false}
        />
      </lineSegments>
      
      {/* 중앙 축 라인 */}
      <lineSegments ref={axisLinesRef} renderOrder={-997}>
        <bufferGeometry />
        <lineBasicMaterial 
          color="#ff0000"
          opacity={opacity.axis} 
          transparent 
          depthWrite={false}
          depthTest={false}
        />
      </lineSegments>
      
      {/* 원점 표시 */}
      <mesh position={[0, 0, 0.001]} renderOrder={-996}>
        <sphereGeometry args={[0.02]} />
        <meshBasicMaterial 
          color="#ff0000"
          opacity={1.0}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
};

export default InfiniteGridHelper;