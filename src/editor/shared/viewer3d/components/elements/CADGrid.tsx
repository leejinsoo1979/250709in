import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';
import { useUIStore } from '@/store/uiStore';

interface CADGridProps {
  viewMode: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top';
  enabled?: boolean;
  showAxis?: boolean;
}

/**
 * 확실히 작동하는 CAD 스타일 그리드
 */
const CADGrid: React.FC<CADGridProps> = ({ viewMode, view2DDirection = 'front', enabled = true, showAxis = true }) => {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const { theme } = useViewerTheme();
  const { view2DTheme } = useUIStore();
  
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

  // 테마 기반 색상
  const gridColors = useMemo(() => ({
    minor: theme.mode === 'dark' ? '#444444' : '#dddddd',
    major: theme.mode === 'dark' ? '#555555' : '#bbbbbb', 
    origin: theme.mode === 'dark' ? '#888888' : '#666666'
  }), [theme.mode]);

  // 간단한 고정 그리드 생성
  const { majorLines, minorLines, axis1Lines, axis2Lines, axis1Color, axis2Color } = useMemo(() => {
    if (viewMode === '3D') return { majorLines: null, minorLines: null, axis1Lines: null, axis2Lines: null, axis1Color: 0xff0000, axis2Color: 0x0000ff };
    
    const size = 200; // 고정 크기 200m
    // 테마와 관계없이 완전히 고정된 그리드 간격 - 양쪽 동일하게 설정
    const major = 1.0; // 1m 간격 (라이트/다크 동일)
    const minor = 0.1; // 10cm 간격 (라이트/다크 동일)
    
    console.log('🔲 CADGrid 렌더링:', {
      theme: theme.mode,
      viewMode,
      view2DDirection,
      enabled,
      major,
      minor,
      size,
      gridColors: {
        minor: gridColors.minor,
        major: gridColors.major,
        origin: gridColors.origin
      },
      majorPointsLength: 'generating...',
      minorPointsLength: 'generating...'
    });
    
    const majorPoints: number[] = [];
    const minorPoints: number[] = [];

    // 뷰별 평면에 맞게 그리드 생성
    switch (view2DDirection) {
      case 'front':
        // XY 평면 (z=0)
        for (let i = -size; i <= size; i += major) {
          majorPoints.push(i, -size, 0, i, size, 0); // 세로
          majorPoints.push(-size, i, 0, size, i, 0); // 가로
        }
        for (let i = -size; i <= size; i += minor) {
          if (Math.abs(i % major) < 0.001) continue;
          minorPoints.push(i, -size, 0, i, size, 0);
          minorPoints.push(-size, i, 0, size, i, 0);
        }
        break;
      case 'top':
        // XZ 평면 (y=0)
        for (let i = -size; i <= size; i += major) {
          majorPoints.push(i, 0, -size, i, 0, size); // 세로
          majorPoints.push(-size, 0, i, size, 0, i); // 가로
        }
        for (let i = -size; i <= size; i += minor) {
          if (Math.abs(i % major) < 0.001) continue;
          minorPoints.push(i, 0, -size, i, 0, size);
          minorPoints.push(-size, 0, i, size, 0, i);
        }
        break;
      case 'left':
      case 'right':
        // YZ 평면 (x=0)
        for (let i = -size; i <= size; i += major) {
          majorPoints.push(0, i, -size, 0, i, size); // 세로
          majorPoints.push(0, -size, i, 0, size, i); // 가로
        }
        for (let i = -size; i <= size; i += minor) {
          if (Math.abs(i % major) < 0.001) continue;
          minorPoints.push(0, i, -size, 0, i, size);
          minorPoints.push(0, -size, i, 0, size, i);
        }
        break;
      default:
        // XY 평면 (z=0)
        for (let i = -size; i <= size; i += major) {
          majorPoints.push(i, -size, 0, i, size, 0);
          majorPoints.push(-size, i, 0, size, i, 0);
        }
        for (let i = -size; i <= size; i += minor) {
          if (Math.abs(i % major) < 0.001) continue;
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
  }, [enabled, viewMode, view2DDirection, gridColors]);
  
  // 그리드 머티리얼 레퍼런스
  const minorMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const majorMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  useFrame(() => {
    if (!enabled || viewMode === '3D' || !groupRef.current) return;
    
    // 뷰별 위치 설정 유지하고 강제로 보이게 설정
    groupRef.current.visible = true;
    groupRef.current.renderOrder = -1000;
    
    // 카메라 거리 계산 (OrthographicCamera는 zoom 사용)
    const distance = viewMode === '2D' && 'zoom' in camera 
      ? 100 / (camera as THREE.OrthographicCamera).zoom  // zoom이 클수록 가까움
      : camera.position.length();
    
    // 그리드 크기와 뷰포트 크기 비교
    const gridSize = 200; // 그리드 전체 크기 (200m)
    let viewportSize = 100; // 기본값
    
    if (viewMode === '2D' && 'zoom' in camera) {
      const orthoCamera = camera as THREE.OrthographicCamera;
      // 뷰포트에서 보이는 실제 크기 계산
      const viewHeight = (orthoCamera.top - orthoCamera.bottom) / orthoCamera.zoom;
      const viewWidth = (orthoCamera.right - orthoCamera.left) / orthoCamera.zoom;
      viewportSize = Math.max(viewHeight, viewWidth);
    }
    
    // 그리드가 뷰포트보다 작아지면 투명도를 0으로
    const gridToViewportRatio = gridSize / viewportSize;
    
    // 거리에 따른 투명도 계산 (멀어질수록 투명해짐)
    let opacity = 1.0;
    
    // 그리드가 뷰포트의 80% 이하가 되면 사라지기 시작
    if (gridToViewportRatio < 0.8) {
      opacity = 0.0;
    } else if (distance <= 10) {
      opacity = 1.0; // 10 이하: 완전 불투명
    } else if (distance <= 30) {
      // 10에서 30 사이: 1.0에서 0.4로 감소
      opacity = 1.0 - ((distance - 10) / 20) * 0.6;
    } else if (distance <= 60) {
      // 30에서 60 사이: 0.4에서 0.1로 감소
      opacity = 0.4 - ((distance - 30) / 30) * 0.3;
    } else {
      // 60 이상: 완전히 사라짐
      opacity = 0.0;
    }
    
    // 부드러운 전환을 위해 최소값 제거
    opacity = Math.max(opacity, 0.0);
    
    // 머티리얼에 직접 opacity 적용
    if (minorMaterialRef.current) {
      minorMaterialRef.current.opacity = 0.3 * opacity; // 보조 그리드는 더 투명하게
      minorMaterialRef.current.needsUpdate = true;
    }
    if (majorMaterialRef.current) {
      majorMaterialRef.current.opacity = 0.5 * opacity; // 주요 그리드는 조금 더 진하게
      majorMaterialRef.current.needsUpdate = true;
    }
    
    // 디버깅용 로그 (0.1% 확률로만 출력)
    if (Math.random() < 0.001) {
      console.log('🔲 Grid opacity:', { 
        distance, 
        opacity, 
        minorOpacity: 0.3 * opacity,
        majorOpacity: 0.5 * opacity,
        zoom: 'zoom' in camera ? (camera as THREE.OrthographicCamera).zoom : 'N/A',
        gridSize,
        viewportSize,
        gridToViewportRatio
      });
    }
  });
  
  if (viewMode === '3D' || !axis1Lines || !axis2Lines) {
    return null;
  }

  // 2D 뷰에서는 그리드 평면과 축선을 분리 렌더링
  if (viewMode === '2D') {
    
    return (
      <>
        {/* 그리드 평면 (회전 적용) - enabled가 true일 때만 표시 */}
        {enabled && majorLines && minorLines && (
          <group ref={groupRef} name="grid-group" position={viewConfig.position as [number, number, number]} rotation={viewConfig.rotation as [number, number, number]}>
            {/* 보조 그리드 (가는 선) - 더 흐리게 */}
            <lineSegments name="grid-minor" renderOrder={-999}>
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
              ref={minorMaterialRef}
              color={gridColors.minor} 
              opacity={0.3}
              transparent
              depthTest={false}
              depthWrite={false}
            />
          </lineSegments>
          {/* 주요 그리드 (굵은 선) - 더 흐리게 */}
          <lineSegments name="grid-major" renderOrder={-998}>
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
              ref={majorMaterialRef}
              color={gridColors.major}
              opacity={0.5}
              transparent
              depthTest={false}
              depthWrite={false}
            />
          </lineSegments>
          </group>
        )}
        {/* 좌표축(축선) - rotation 없이 고정, showAxis가 true일 때만 표시 */}
        {showAxis && (
          <group name="grid-axis-group" position={[0,0,0] as [number, number, number]} rotation={[0,0,0] as [number, number, number]}>
            {/* 첫 번째 축선 (X/Z축) */}
            <lineSegments name="grid-axis1" renderOrder={-997}>
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
            <lineSegments name="grid-axis2" renderOrder={-996}>
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
            <mesh name="grid-origin" position={[0, 0, 0.01]} renderOrder={-995}>
              <sphereGeometry args={[0.05]} />
              <meshBasicMaterial color={gridColors.origin} opacity={0.8} transparent />
            </mesh>
          </group>
        )}
      </>
    );
  }

  // 3D 등 기존 로직 (회전 적용)
  return (
    <group ref={groupRef} name="grid-group" position={viewConfig.position as [number, number, number]} rotation={viewConfig.rotation as [number, number, number]}>
      {/* 보조 그리드 (가는 선) - 더 흐리게 */}
      <lineSegments name="grid-minor" renderOrder={-999}>
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
          color={viewMode === '2D' && view2DTheme === 'dark' ? '#444444' : '#dddddd'}
          opacity={0.3}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
      {/* 주요 그리드 (굵은 선) - 더 흐리게 */}
      <lineSegments name="grid-major" renderOrder={-998}>
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
          color={viewMode === '2D' && view2DTheme === 'dark' ? '#555555' : '#bbbbbb'}
          opacity={0.4}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
      {/* 첫 번째 축선 (X/Z축) */}
      <lineSegments name="grid-axis1" renderOrder={-997}>
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
      <lineSegments name="grid-axis2" renderOrder={-996}>
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
      <mesh name="grid-origin" position={[0, 0, 0.01]} renderOrder={-995}>
        <sphereGeometry args={[0.05]} />
        <meshBasicMaterial color={gridColors.origin} />
      </mesh>
    </group>
  );
};

export default CADGrid;