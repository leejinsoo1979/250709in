import React from 'react';
import { Grid } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface CADGrid2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
}

/**
 * CAD 스타일 2D 무한 격자 및 가이드라인 컴포넌트
 * 모든 2D 뷰포트에서 무한 그리드를 표시하며 줌 레벨에 관계없이 일정한 격자 제공
 */
const CADGrid2D: React.FC<CADGrid2DProps> = ({ viewDirection }) => {
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
  
  // 격자 간격 설정 (100mm = 0.1 Three.js 단위)
  const gridSpacing = 0.1; // 100mm 간격
  const majorGridSpacing = 1.0; // 1000mm(1m) 간격
  
  // 뷰포트 방향에 따른 그리드 설정
  const getGridConfig = () => {
    switch (currentViewDirection) {
      case 'front':
        return {
          position: [spaceWidth / 2, spaceHeight / 2, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          args: [100, 100] as [number, number], // 무한 그리드를 위한 큰 크기
        };
      case 'left':
        return {
          position: [0, spaceHeight / 2, spaceDepth / 2] as [number, number, number],
          rotation: [0, Math.PI / 2, 0] as [number, number, number],
          args: [100, 100] as [number, number],
        };
      case 'right':
        return {
          position: [spaceWidth, spaceHeight / 2, spaceDepth / 2] as [number, number, number],
          rotation: [0, -Math.PI / 2, 0] as [number, number, number],
          args: [100, 100] as [number, number],
        };
      case 'top':
        return {
          position: [spaceWidth / 2, spaceHeight, spaceDepth / 2] as [number, number, number],
          rotation: [Math.PI / 2, 0, 0] as [number, number, number],
          args: [100, 100] as [number, number],
        };
      default:
        return {
          position: [spaceWidth / 2, spaceHeight / 2, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          args: [100, 100] as [number, number],
        };
    }
  };
  
  const gridConfig = getGridConfig();

  return (
    <group>
      {/* 무한 CAD 스타일 격자 */}
      <Grid
        position={gridConfig.position}
        rotation={gridConfig.rotation}
        args={gridConfig.args}
        cellSize={gridSpacing}
        cellThickness={0.5}
        cellColor="#e8e8e8"
        sectionSize={majorGridSpacing}
        sectionThickness={1.5}
        sectionColor="#c0c0c0"
        fadeDistance={30}
        fadeStrength={0.5}
        infiniteGrid={true}
        followCamera={false}
        side={THREE.DoubleSide}
      />
      
      {/* 뷰포트별 공간 경계선만 표시 (축 제거) */}
      {currentViewDirection === 'front' && (
        <>
          {/* 공간 경계선 */}
          <Line
            points={[
              [0, 0, 0.002], [spaceWidth, 0, 0.002],
              [spaceWidth, spaceHeight, 0.002], [0, spaceHeight, 0.002], [0, 0, 0.002]
            ]}
            color="#1976d2"
            lineWidth={3}
          />
          
          {/* 컬럼 경계선 */}
          {columnCount > 1 && threeUnitBoundaries.map((xPos, index) => (
            <Line
              key={`column-boundary-${index}`}
              points={[[xPos, 0, 0.001], [xPos, spaceHeight, 0.001]]}
              color="#2196f3"
              lineWidth={1.5}
              dashed
              dashSize={0.05}
              gapSize={0.025}
            />
          ))}
        </>
      )}
      
      {currentViewDirection === 'left' && (
        <>
          {/* 공간 경계선 (좌측면) */}
          <Line
            points={[
              [0, 0, 0], [0, 0, spaceDepth],
              [0, spaceHeight, spaceDepth], [0, spaceHeight, 0], [0, 0, 0]
            ]}
            color="#1976d2"
            lineWidth={3}
          />
        </>
      )}
      
      {currentViewDirection === 'right' && (
        <>
          {/* 공간 경계선 (우측면) */}
          <Line
            points={[
              [spaceWidth, 0, 0], [spaceWidth, 0, spaceDepth],
              [spaceWidth, spaceHeight, spaceDepth], [spaceWidth, spaceHeight, 0], [spaceWidth, 0, 0]
            ]}
            color="#1976d2"
            lineWidth={3}
          />
        </>
      )}
      
      {currentViewDirection === 'top' && (
        <>
          {/* 공간 경계선 (상단면) */}
          <Line
            points={[
              [0, spaceHeight, 0], [spaceWidth, spaceHeight, 0],
              [spaceWidth, spaceHeight, spaceDepth], [0, spaceHeight, spaceDepth], [0, spaceHeight, 0]
            ]}
            color="#1976d2"
            lineWidth={3}
          />
          
          {/* 컬럼 경계선 (상단뷰) */}
          {columnCount > 1 && threeUnitBoundaries.map((xPos, index) => (
            <Line
              key={`column-boundary-top-${index}`}
              points={[[xPos, spaceHeight, 0], [xPos, spaceHeight, spaceDepth]]}
              color="#2196f3"
              lineWidth={1.5}
              dashed
              dashSize={0.05}
              gapSize={0.025}
            />
          ))}
        </>
      )}
    </group>
  );
};

export default CADGrid2D;