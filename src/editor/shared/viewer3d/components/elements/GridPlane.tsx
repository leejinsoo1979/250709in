import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';

interface GridPlaneProps {
  viewMode: '2D' | '3D';
}

/**
 * 2D 모드에서 캔버스 줌과 연동되는 그리드 평면
 */
const GridPlane: React.FC<GridPlaneProps> = ({ viewMode }) => {
  const { spaceInfo } = useSpaceConfigStore();

  const gridData = useMemo(() => {
    if (viewMode !== '2D') return null;

    const spaceWidth = spaceInfo.width || 3000; // mm
    const spaceHeight = spaceInfo.height || 2500; // mm

    // Three.js 단위로 변환 (mm → m)
    const width = 50; // 50m x 50m 큰 영역
    const height = 50;

    // 그리드 선 생성 (CAD 스타일)
    const points: THREE.Vector3[] = [];
    const majorGridSize = 1.0; // 1000mm (1m) 간격 - 주요 그리드
    const minorGridSize = 0.1; // 100mm 간격 - 보조 그리드

    // 주요 그리드 (1000mm = 1m 간격)
    for (let x = -width; x <= width; x += majorGridSize) {
      points.push(new THREE.Vector3(x, -height, 0));
      points.push(new THREE.Vector3(x, height, 0));
    }
    for (let y = -height; y <= height; y += majorGridSize) {
      points.push(new THREE.Vector3(-width, y, 0));
      points.push(new THREE.Vector3(width, y, 0));
    }

    // 보조 그리드 (100mm 간격)
    const minorPoints: THREE.Vector3[] = [];
    for (let x = -width; x <= width; x += minorGridSize) {
      minorPoints.push(new THREE.Vector3(x, -height, 0));
      minorPoints.push(new THREE.Vector3(x, height, 0));
    }
    for (let y = -height; y <= height; y += minorGridSize) {
      minorPoints.push(new THREE.Vector3(-width, y, 0));
      minorPoints.push(new THREE.Vector3(width, y, 0));
    }

    return { majorPoints: points, minorPoints, width, height };
  }, [viewMode, spaceInfo.width, spaceInfo.height]);

  if (!gridData) return null;

  return (
    <group position={[0, 0, -0.001]}> {/* 살짝 뒤로 배치 */}
      {/* 보조 그리드 (100mm) */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={gridData.minorPoints.length}
            array={new Float32Array(gridData.minorPoints.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={0xe0e0e0} opacity={0.2} transparent />
      </lineSegments>

      {/* 주요 그리드 (1000mm) */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={gridData.majorPoints.length}
            array={new Float32Array(gridData.majorPoints.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={0xc0c0c0} opacity={0.5} transparent />
      </lineSegments>

      {/* 중앙 축 */}
      {/* X축 (빨간색) */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([-gridData.width, 0, 0, gridData.width, 0, 0])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={0xff4444} opacity={0.8} transparent linewidth={2} />
      </lineSegments>

      {/* Y축 (초록색) */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([0, -gridData.height, 0, 0, gridData.height, 0])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={0x44ff44} opacity={0.8} transparent linewidth={2} />
      </lineSegments>

      {/* 원점 표시 */}
      <mesh position={[0, 0, 0.001]}>
        <sphereGeometry args={[0.01]} />
        <meshBasicMaterial color={0xff0000} />
      </mesh>
    </group>
  );
};

export default GridPlane;