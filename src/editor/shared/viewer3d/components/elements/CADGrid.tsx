import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTheme } from '@/contexts/ThemeContext';

interface CADGridProps {
  viewMode: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top';
  enabled?: boolean;
}

/**
 * 확실히 작동하는 CAD 스타일 그리드
 */
const CADGrid: React.FC<CADGridProps> = ({ viewMode, view2DDirection = 'front', enabled = true }) => {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const { theme } = useTheme();
  
  // 카메라 거리에 따른 동적 그리드 스케일 계산
  const gridParams = useMemo(() => {
    const distance = camera.position.length();
    
    // CAD 스타일 동적 스케일 - 카메라 거리에 따라 실시간 변경
    let major, minor, size;
    
    // 그리드를 10배 덜 촘촘하게 (10cm → 1m, 1cm → 10cm)
    // 모든 줌 레벨에서 동일한 간격 유지
    major = 1.0;  // 1m 진한선 (주요 그리드) - 10배 증가
    minor = 0.1;  // 10cm 셀 (보조 그리드) - 10배 증가
    
    // 줌 레벨에 따라 그리드 범위만 조정
    if (distance < 5) {
      size = distance * 30;
    } else if (distance < 15) {
      size = distance * 25;
    } else if (distance < 40) {
      size = distance * 20;
    } else {
      size = distance * 15;
    }
    
    return { major, minor, size: Math.max(size, 1000) }; // 최소 1000m 범위 (매우 큰 그리드)
  }, [camera.position]);
  
  // 뷰별 그리드 회전 설정
  const viewConfig = useMemo(() => {
    if (viewMode === '2D') {
      return {
        rotation: [0, 0, 0],
        position: [0, 0, 0]
      };
    }
    // 3D 모드일 때만 기존 로직 사용
    switch (view2DDirection) {
      case 'front':
        return {
          rotation: [0, 0, 0],
          position: [0, 0, 0]
        };
      case 'left':
        return {
          rotation: [0, Math.PI / 2, 0],
          position: [0, 0, 0]
        };
      case 'right':
        return {
          rotation: [0, -Math.PI / 2, 0],
          position: [0, 0, 0]
        };
      case 'top':
        return {
          rotation: [-Math.PI / 2, 0, 0],
          position: [0, 0, 0.01]
        };
      default:
        return {
          rotation: [0, 0, 0],
          position: [0, 0, 0]
        };
    }
  }, [view2DDirection, viewMode]);

  // 간단한 고정 그리드 생성
  const { majorLines, minorLines, axis1Lines, axis2Lines, axis1Color, axis2Color } = useMemo(() => {
    if (!enabled || viewMode === '3D') return { majorLines: null, minorLines: null, axis1Lines: null, axis2Lines: null, axis1Color: 0xff0000, axis2Color: 0x0000ff };
    
    const size = 200; // 고정 크기 200m
    const major = 1.0; // 1m 간격
    const minor = 0.1; // 10cm 간격
    
    let majorPoints: number[] = [];
    let minorPoints: number[] = [];

    // 뷰별 평면에 맞게 그리드 생성
    switch (view2DDirection) {
      case 'front':
        // XY 평면 (z=0)
        for (let i = -size; i <= size; i += major) {
          if (Math.abs(i) < 0.001) continue;
          majorPoints.push(i, -size, 0, i, size, 0); // 세로
          majorPoints.push(-size, i, 0, size, i, 0); // 가로
        }
        for (let i = -size; i <= size; i += minor) {
          if (Math.abs(i % major) < 0.001) continue;
          if (Math.abs(i) < 0.001) continue;
          minorPoints.push(i, -size, 0, i, size, 0);
          minorPoints.push(-size, i, 0, size, i, 0);
        }
        break;
      case 'top':
        // XZ 평면 (y=0)
        for (let i = -size; i <= size; i += major) {
          if (Math.abs(i) < 0.001) continue;
          majorPoints.push(i, 0, -size, i, 0, size); // 세로
          majorPoints.push(-size, 0, i, size, 0, i); // 가로
        }
        for (let i = -size; i <= size; i += minor) {
          if (Math.abs(i % major) < 0.001) continue;
          if (Math.abs(i) < 0.001) continue;
          minorPoints.push(i, 0, -size, i, 0, size);
          minorPoints.push(-size, 0, i, size, 0, i);
        }
        break;
      case 'left':
      case 'right':
        // YZ 평면 (x=0)
        for (let i = -size; i <= size; i += major) {
          if (Math.abs(i) < 0.001) continue;
          majorPoints.push(0, i, -size, 0, i, size); // 세로
          majorPoints.push(0, -size, i, 0, size, i); // 가로
        }
        for (let i = -size; i <= size; i += minor) {
          if (Math.abs(i % major) < 0.001) continue;
          if (Math.abs(i) < 0.001) continue;
          minorPoints.push(0, i, -size, 0, i, size);
          minorPoints.push(0, -size, i, 0, size, i);
        }
        break;
      default:
        // XY 평면 (z=0)
        for (let i = -size; i <= size; i += major) {
          if (Math.abs(i) < 0.001) continue;
          majorPoints.push(i, -size, 0, i, size, 0);
          majorPoints.push(-size, i, 0, size, i, 0);
        }
        for (let i = -size; i <= size; i += minor) {
          if (Math.abs(i % major) < 0.001) continue;
          if (Math.abs(i) < 0.001) continue;
          minorPoints.push(i, -size, 0, i, size, 0);
          minorPoints.push(-size, i, 0, size, i, 0);
        }
        break;
    }
    
    // 뷰별 축선 설정
    let axis1Points: number[] = [];
    let axis2Points: number[] = [];
    
    // 뷰별 축선과 색상 설정
    let axis1Color = 0xff0000; // 기본 빨강
    let axis2Color = 0x0000ff; // 기본 파랑
    
    switch (view2DDirection) {
      case 'front':
        // 정면뷰: X축(빨강, 좌우), Y축(파랑, 상하)
        axis1Points = [-size, 0, 0, size, 0, 0]; // X축 (좌우)
        axis2Points = [0, -size, 0, 0, size, 0]; // Y축 (상하)
        axis1Color = 0xff0000; // X축 = 빨강
        axis2Color = 0x0000ff; // Y축 = 파랑
        break;
      case 'top':
        // 탑뷰: X축(빨강, 좌우), Z축(초록, 상하)
        axis1Points = [-size, 0, 0, size, 0, 0]; // X축 (좌우)
        axis2Points = [0, 0, -size, 0, 0, size]; // Z축 (상하)
        axis1Color = 0xff0000; // X축 = 빨강
        axis2Color = 0x00ff00; // Z축 = 초록
        break;
      case 'left':
        // 좌측뷰: Z축(초록, 좌우), Y축(파랑, 상하)
        axis1Points = [0, 0, -size, 0, 0, size]; // Z축 (좌우)
        axis2Points = [0, -size, 0, 0, size, 0]; // Y축 (상하)
        axis1Color = 0x00ff00; // Z축 = 초록
        axis2Color = 0x0000ff; // Y축 = 파랑
        break;
      case 'right':
        // 우측뷰: Z축(초록, 좌우), Y축(파랑, 상하)
        axis1Points = [0, 0, -size, 0, 0, size]; // Z축 (좌우)
        axis2Points = [0, -size, 0, 0, size, 0]; // Y축 (상하)
        axis1Color = 0x00ff00; // Z축 = 초록
        axis2Color = 0x0000ff; // Y축 = 파랑
        break;
      default:
        axis1Points = [-size, 0, 0, size, 0, 0]; // X축
        axis2Points = [0, -size, 0, 0, size, 0]; // Y축
        axis1Color = 0xff0000; // X축 = 빨강
        axis2Color = 0x0000ff; // Y축 = 파랑
        break;
    }
    
    console.log('🔲 그리드 라인 생성 완료:', {
      majorCount: majorPoints.length / 6,
      minorCount: minorPoints.length / 6
    });
    
    return {
      majorLines: new Float32Array(majorPoints),
      minorLines: new Float32Array(minorPoints), 
      axis1Lines: new Float32Array(axis1Points),
      axis2Lines: new Float32Array(axis2Points),
      axis1Color,
      axis2Color
    };
  }, [enabled, viewMode, view2DDirection]);
  
  // 그리드 강제 표시
  useFrame(() => {
    if (!enabled || viewMode === '3D' || !groupRef.current) return;
    
    // 뷰별 위치 설정 유지하고 강제로 보이게 설정
    groupRef.current.visible = true;
    groupRef.current.renderOrder = -1000;
  });
  
  if (!enabled || viewMode === '3D' || !majorLines || !minorLines || !axis1Lines || !axis2Lines) {
    return null;
  }

  // 2D 뷰에서는 그리드 평면과 축선을 분리 렌더링
  if (viewMode === '2D') {
    return (
      <>
        {/* 그리드 평면 (회전 적용) */}
        <group ref={groupRef} position={viewConfig.position as [number, number, number]} rotation={viewConfig.rotation as [number, number, number]}>
          {/* 보조 그리드 (가는 선) - 더 흐리게 */}
          <lineSegments renderOrder={-999}>
            <bufferGeometry>
              <bufferAttribute
                args={[minorLines, 3]}
                attach="attributes-position"
                count={minorLines.length / 3}
                array={minorLines}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial 
              color={theme.mode === 'dark' ? '#444444' : '#dddddd'} 
              opacity={0.3}
              transparent
              depthTest={false}
              depthWrite={false}
            />
          </lineSegments>
          {/* 주요 그리드 (굵은 선) - 더 흐리게 */}
          <lineSegments renderOrder={-998}>
            <bufferGeometry>
              <bufferAttribute
                args={[majorLines, 3]}
                attach="attributes-position"
                count={majorLines.length / 3}
                array={majorLines}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial 
              color={theme.mode === 'dark' ? '#555555' : '#bbbbbb'} 
              opacity={0.4}
              transparent
              depthTest={false}
              depthWrite={false}
            />
          </lineSegments>
        </group>
        {/* 좌표축(축선) - rotation 없이 고정 */}
        <group position={[0,0,0] as [number, number, number]} rotation={[0,0,0] as [number, number, number]}>
          {/* 첫 번째 축선 (X/Z축) */}
          <lineSegments renderOrder={-997}>
            <bufferGeometry>
              <bufferAttribute
                args={[axis1Lines, 3]}
                attach="attributes-position"
                count={axis1Lines.length / 3}
                array={axis1Lines}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial 
              color={axis1Color} 
              opacity={0.6}
              transparent
              depthTest={false}
              depthWrite={false}
            />
          </lineSegments>
          {/* 두 번째 축선 (Y/Z축) */}
          <lineSegments renderOrder={-996}>
            <bufferGeometry>
              <bufferAttribute
                args={[axis2Lines, 3]}
                attach="attributes-position"
                count={axis2Lines.length / 3}
                array={axis2Lines}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial 
              color={axis2Color} 
              opacity={0.6}
              transparent
              depthTest={false}
              depthWrite={false}
            />
          </lineSegments>
          {/* 원점 표시 */}
          <mesh position={[0, 0, 0.01]} renderOrder={-995}>
            <sphereGeometry args={[0.05]} />
            <meshBasicMaterial color={theme.mode === 'dark' ? '#888888' : '#666666'} />
          </mesh>
        </group>
      </>
    );
  }

  // 3D 등 기존 로직 (회전 적용)
  return (
    <group ref={groupRef} position={viewConfig.position as [number, number, number]} rotation={viewConfig.rotation as [number, number, number]}>
      {/* 보조 그리드 (가는 선) - 더 흐리게 */}
      <lineSegments renderOrder={-999}>
        <bufferGeometry>
          <bufferAttribute
            args={[minorLines, 3]}
            attach="attributes-position"
            count={minorLines.length / 3}
            array={minorLines}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color={theme.mode === 'dark' ? '#444444' : '#dddddd'} 
          opacity={0.3}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
      {/* 주요 그리드 (굵은 선) - 더 흐리게 */}
      <lineSegments renderOrder={-998}>
        <bufferGeometry>
          <bufferAttribute
            args={[majorLines, 3]}
            attach="attributes-position"
            count={majorLines.length / 3}
            array={majorLines}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color={theme.mode === 'dark' ? '#555555' : '#bbbbbb'} 
          opacity={0.4}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
      {/* 첫 번째 축선 (X/Z축) */}
      <lineSegments renderOrder={-997}>
        <bufferGeometry>
          <bufferAttribute
            args={[axis1Lines, 3]}
            attach="attributes-position"
            count={axis1Lines.length / 3}
            array={axis1Lines}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color={axis1Color} 
          opacity={0.6}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
      {/* 두 번째 축선 (Y/Z축) */}
      <lineSegments renderOrder={-996}>
        <bufferGeometry>
          <bufferAttribute
            args={[axis2Lines, 3]}
            attach="attributes-position"
            count={axis2Lines.length / 3}
            array={axis2Lines}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color={axis2Color} 
          opacity={0.6}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
      {/* 원점 표시 */}
      <mesh position={[0, 0, 0.01]} renderOrder={-995}>
        <sphereGeometry args={[0.05]} />
        <meshBasicMaterial color={theme.mode === 'dark' ? '#888888' : '#666666'} />
      </mesh>
    </group>
  );
};

export default CADGrid;