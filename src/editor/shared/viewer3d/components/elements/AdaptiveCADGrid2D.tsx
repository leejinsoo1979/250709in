import React, { useMemo } from 'react';
import { Grid } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { NativeLine } from '@/editor/shared/viewer3d/components/elements/NativeLine';
import * as THREE from 'three';

interface AdaptiveCADGrid2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
}

/**
 * 줌 레벨에 적응하는 CAD 스타일 무한 격자 컴포넌트
 * 줌 아웃 시 더 큰 간격의 격자로 자동 전환하여 CAD와 같은 경험 제공
 */
const AdaptiveCADGrid2D: React.FC<AdaptiveCADGrid2DProps> = ({ viewDirection }) => {
  const { camera } = useThree();
  const { spaceInfo } = useSpaceConfigStore();
  const { view2DDirection } = useUIStore();
  const indexing = calculateSpaceIndexing(spaceInfo);
  const { threeUnitBoundaries, columnCount } = indexing;
  
  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 공간 크기 (Three.js 단위)
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  const spaceDepth = mmToThreeUnits(spaceInfo.depth || 600);
  
  // 줌 레벨에 따른 적응형 격자 간격 계산
  const adaptiveGridSpacing = useMemo(() => {
    if (!camera) return { cellSize: 0.1, sectionSize: 1.0 };
    
    // orthographic 카메라의 줌 레벨 계산
    const zoom = (camera as any).zoom || 1;
    const distance = camera.position.distanceTo({ x: 0, y: 0, z: 0 } as any);
    
    // 줌 레벨과 거리를 기반으로 적절한 격자 간격 결정
    let cellSize: number;
    let sectionSize: number;
    
    if (zoom > 5 || distance < 5) {
      // 가까이: 50mm 간격 (세밀)
      cellSize = 0.05;
      sectionSize = 0.5;
    } else if (zoom > 2 || distance < 15) {
      // 중간: 100mm 간격 (기본)
      cellSize = 0.1;
      sectionSize = 1.0;
    } else if (zoom > 0.5 || distance < 50) {
      // 멀리: 500mm 간격 (거시)
      cellSize = 0.5;
      sectionSize = 5.0;
    } else {
      // 매우 멀리: 1000mm 간격 (광역)
      cellSize = 1.0;
      sectionSize = 10.0;
    }
    
    return { cellSize, sectionSize };
  }, [camera]);
  
  // 뷰포트 방향에 따른 그리드 설정
  const getGridConfig = () => {
    const baseSize = 200; // 무한 그리드를 위한 기본 크기
    
    switch (currentViewDirection) {
      case 'front':
        return {
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          args: [baseSize, baseSize] as [number, number],
        };
      case 'left':
        return {
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, Math.PI / 2, 0] as [number, number, number],
          args: [baseSize, baseSize] as [number, number],
        };
      case 'right':
        return {
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, -Math.PI / 2, 0] as [number, number, number],
          args: [baseSize, baseSize] as [number, number],
        };
      case 'top':
        return {
          position: [0, 0, 0] as [number, number, number],
          rotation: [Math.PI / 2, 0, 0] as [number, number, number],
          args: [baseSize, baseSize] as [number, number],
        };
      default:
        return {
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          args: [baseSize, baseSize] as [number, number],
        };
    }
  };
  
  const gridConfig = getGridConfig();

  return (
    <group>
      {/* 적응형 무한 CAD 스타일 격자 */}
      <Grid
        position={gridConfig.position}
        rotation={gridConfig.rotation}
        args={gridConfig.args}
        cellSize={adaptiveGridSpacing.cellSize}
        cellThickness={0.6}
        cellColor="#e0e0e0"
        sectionSize={adaptiveGridSpacing.sectionSize}
        sectionThickness={1.2}
        sectionColor="#b0b0b0"
        fadeDistance={50}
        fadeStrength={0.3}
        infiniteGrid={true}
        followCamera={true}
        side={THREE.DoubleSide}
      />
      
      {/* 뷰포트별 축 표시 */}
      {currentViewDirection === 'front' && (
        <>
          {/* 정면뷰: X축(빨간색), Y축(초록색) */}
          <NativeLine points={[[-100, 0, 0.001], [100, 0, 0.001]]} color="#ff3333" lineWidth={3} />
          <NativeLine points={[[0, -100, 0.001], [0, 100, 0.001]]} color="#33ff33" lineWidth={3} />
          
          {/* 공간 경계선 */}
          <NativeLine
            points={[
              [0, 0, 0.002], [spaceWidth, 0, 0.002],
              [spaceWidth, spaceHeight, 0.002], [0, spaceHeight, 0.002], [0, 0, 0.002]
            ]}
            color="#1976d2"
            lineWidth={4}
          />
          
          {/* 컬럼 경계선 */}
          {columnCount > 1 && threeUnitBoundaries.map((xPos, index) => (
            <NativeLine
              key={`column-boundary-${index}`}
              points={[[xPos, 0, 0.001], [xPos, spaceHeight, 0.001]]}
              color="#2196f3"
              lineWidth={2}
              dashed
              dashSize={0.08}
              gapSize={0.04}
            />
          ))}
        </>
      )}
      
      {currentViewDirection === 'left' && (
        <>
          {/* 좌측뷰: Z축(빨간색), Y축(초록색) */}
          <NativeLine points={[[0, 0, -100], [0, 0, 100]]} color="#ff3333" lineWidth={3} />
          <NativeLine points={[[0, -100, 0], [0, 100, 0]]} color="#33ff33" lineWidth={3} />
          
          {/* 공간 경계선 (좌측면) */}
          <NativeLine
            points={[
              [0, 0, 0], [0, 0, spaceDepth],
              [0, spaceHeight, spaceDepth], [0, spaceHeight, 0], [0, 0, 0]
            ]}
            color="#1976d2"
            lineWidth={4}
          />
        </>
      )}
      
      {currentViewDirection === 'right' && (
        <>
          {/* 우측뷰: Z축(빨간색), Y축(초록색) */}
          <NativeLine points={[[0, 0, -100], [0, 0, 100]]} color="#ff3333" lineWidth={3} />
          <NativeLine points={[[0, -100, 0], [0, 100, 0]]} color="#33ff33" lineWidth={3} />
          
          {/* 공간 경계선 (우측면) */}
          <NativeLine
            points={[
              [0, 0, 0], [0, 0, spaceDepth],
              [0, spaceHeight, spaceDepth], [0, spaceHeight, 0], [0, 0, 0]
            ]}
            color="#1976d2"
            lineWidth={4}
          />
        </>
      )}
      
      {currentViewDirection === 'top' && (
        <>
          {/* 상단뷰: X축(빨간색), Z축(파란색) */}
          <NativeLine points={[[-100, 0, 0], [100, 0, 0]]} color="#ff3333" lineWidth={3} />
          <NativeLine points={[[0, 0, -100], [0, 0, 100]]} color="#3333ff" lineWidth={3} />
          
          {/* 공간 경계선 (상단면) */}
          <NativeLine
            points={[
              [0, 0, 0], [spaceWidth, 0, 0],
              [spaceWidth, 0, spaceDepth], [0, 0, spaceDepth], [0, 0, 0]
            ]}
            color="#1976d2"
            lineWidth={4}
          />
          
          {/* 컬럼 경계선 (상단뷰) */}
          {columnCount > 1 && threeUnitBoundaries.map((xPos, index) => (
            <NativeLine
              key={`column-boundary-top-${index}`}
              points={[[xPos, 0, 0], [xPos, 0, spaceDepth]]}
              color="#2196f3"
              lineWidth={2}
              dashed
              dashSize={0.08}
              gapSize={0.04}
            />
          ))}
        </>
      )}
    </group>
  );
};

export default AdaptiveCADGrid2D;