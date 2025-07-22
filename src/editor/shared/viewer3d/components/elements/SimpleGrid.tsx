import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';

interface SimpleGridProps {
  viewMode: '2D' | '3D';
  enabled?: boolean;
}

/**
 * 간단한 테스트용 그리드 - 디버깅용
 */
const SimpleGrid: React.FC<SimpleGridProps> = ({ viewMode, enabled = true }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // 간단한 그리드 생성
  const gridGeometry = useMemo(() => {
    if (viewMode === '3D' || !enabled) return null;
    
    console.log('🔲 SimpleGrid 생성 중...');
    
    const points: number[] = [];
    const size = 20; // 20m x 20m
    const gridSize = 1; // 1m 간격
    
    // 세로 라인
    for (let x = -size; x <= size; x += gridSize) {
      points.push(x, -size, 0, x, size, 0);
    }
    
    // 가로 라인
    for (let y = -size; y <= size; y += gridSize) {
      points.push(-size, y, 0, size, y, 0);
    }
    
    console.log('🔲 SimpleGrid 포인트 생성:', points.length / 6, '개 라인');
    
    return new Float32Array(points);
  }, [viewMode, enabled]);
  
  // 축 라인 생성
  const axisGeometry = useMemo(() => {
    if (viewMode === '3D' || !enabled) return null;
    
    const size = 20;
    return new Float32Array([
      // X축 (빨간색)
      -size, 0, 0, size, 0, 0,
      // Y축 (초록색)
      0, -size, 0, 0, size, 0
    ]);
  }, [viewMode, enabled]);
  
  if (viewMode === '3D' || !enabled || !gridGeometry || !axisGeometry) {
    return null;
  }
  
  console.log('🔲 SimpleGrid 렌더링!', { viewMode, enabled });
  
  return (
    <group ref={groupRef} position={[0, 0, -0.001]} renderOrder={-1000}>
      {/* 그리드 라인 */}
      <lineSegments renderOrder={-999}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={gridGeometry.length / 3}
            array={gridGeometry}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color="#c0c0c0" 
          opacity={0.5} 
          transparent 
          depthWrite={false}
          depthTest={false}
        />
      </lineSegments>
      
      {/* 축 라인 */}
      <lineSegments renderOrder={-998}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={axisGeometry.length / 3}
            array={axisGeometry}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color="#ff4444" 
          opacity={0.8} 
          transparent 
          depthWrite={false}
          depthTest={false}
        />
      </lineSegments>
      
      {/* 원점 표시 */}
      <mesh position={[0, 0, 0.01]} renderOrder={-997}>
        <sphereGeometry args={[0.05]} />
        <meshBasicMaterial 
          color="#ff0000" 
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
};

export default SimpleGrid;