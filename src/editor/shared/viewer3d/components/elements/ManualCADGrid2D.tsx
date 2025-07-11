import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';

interface ManualCADGrid2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
}

/**
 * 수동으로 그린 CAD 스타일 무한 그리드
 * Grid 컴포넌트 대신 Line으로 직접 그리드 생성
 */
const ManualCADGrid2D: React.FC<ManualCADGrid2DProps> = ({ viewDirection }) => {
  const { camera } = useThree();
  const { spaceInfo } = useSpaceConfigStore();
  const { view2DDirection } = useUIStore();
  
  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 공간 크기 (Three.js 단위)
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  
  // 줌 레벨에 따른 그리드 간격 결정
  const getGridSpacing = () => {
    if (!camera) return { spacing: 0.5, majorSpacing: 5.0 };
    
    const zoom = ('zoom' in camera ? (camera as { zoom: number }).zoom : undefined) || 1;
    const distance = camera.position.length();
    
    if (zoom > 3 || distance < 10) {
      return { spacing: 0.1, majorSpacing: 1.0 }; // 100mm, 1m
    } else if (zoom > 1 || distance < 30) {
      return { spacing: 0.5, majorSpacing: 5.0 }; // 500mm, 5m
    } else {
      return { spacing: 1.0, majorSpacing: 10.0 }; // 1m, 10m
    }
  };
  
  // 뷰포트별 그리드 라인 생성
  const gridLines = useMemo(() => {
    const lines: React.ReactElement[] = [];
    const { spacing, majorSpacing } = getGridSpacing();
    const gridSize = 100;
    let lineIndex = 0;
    
    // 뷰포트별로 다른 축에 그리드 생성
    switch (currentViewDirection) {
      case 'front':
        // 정면뷰: XY 평면
        for (let x = -gridSize; x <= gridSize; x += spacing) {
          const isMajor = Math.abs(x % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`front-v-${lineIndex++}`}
              points={[[x, -gridSize, 0], [x, gridSize, 0]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        for (let y = -gridSize; y <= gridSize; y += spacing) {
          const isMajor = Math.abs(y % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`front-h-${lineIndex++}`}
              points={[[-gridSize, y, 0], [gridSize, y, 0]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        break;
        
      case 'left':
        // 좌측뷰: ZY 평면
        for (let z = -gridSize; z <= gridSize; z += spacing) {
          const isMajor = Math.abs(z % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`left-v-${lineIndex++}`}
              points={[[0, -gridSize, z], [0, gridSize, z]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        for (let y = -gridSize; y <= gridSize; y += spacing) {
          const isMajor = Math.abs(y % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`left-h-${lineIndex++}`}
              points={[[0, y, -gridSize], [0, y, gridSize]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        break;
        
      case 'right':
        // 우측뷰: ZY 평면
        for (let z = -gridSize; z <= gridSize; z += spacing) {
          const isMajor = Math.abs(z % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`right-v-${lineIndex++}`}
              points={[[spaceWidth, -gridSize, z], [spaceWidth, gridSize, z]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        for (let y = -gridSize; y <= gridSize; y += spacing) {
          const isMajor = Math.abs(y % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`right-h-${lineIndex++}`}
              points={[[spaceWidth, y, -gridSize], [spaceWidth, y, gridSize]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        break;
        
      case 'top':
        // 상단뷰: XZ 평면
        for (let x = -gridSize; x <= gridSize; x += spacing) {
          const isMajor = Math.abs(x % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`top-v-${lineIndex++}`}
              points={[[x, spaceHeight, -gridSize], [x, spaceHeight, gridSize]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        for (let z = -gridSize; z <= gridSize; z += spacing) {
          const isMajor = Math.abs(z % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`top-h-${lineIndex++}`}
              points={[[-gridSize, spaceHeight, z], [gridSize, spaceHeight, z]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        break;
        
      default:
        // 기본값: 정면뷰와 동일
        for (let x = -gridSize; x <= gridSize; x += spacing) {
          const isMajor = Math.abs(x % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`default-v-${lineIndex++}`}
              points={[[x, -gridSize, 0], [x, gridSize, 0]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        for (let y = -gridSize; y <= gridSize; y += spacing) {
          const isMajor = Math.abs(y % majorSpacing) < 0.01;
          lines.push(
            <Line
              key={`default-h-${lineIndex++}`}
              points={[[-gridSize, y, 0], [gridSize, y, 0]]}
              color={isMajor ? "#b0b0b0" : "#e8e8e8"}
              lineWidth={isMajor ? 1.0 : 0.5}
              transparent={true}
              opacity={isMajor ? 0.8 : 0.4}
            />
          );
        }
        break;
    }
    
    return lines;
  }, [camera, currentViewDirection, spaceWidth, spaceHeight]);
  
  console.log('ManualCADGrid2D 렌더링:', { 
    currentViewDirection, 
    spaceWidth, 
    spaceHeight,
    gridLinesCount: gridLines.length 
  });
  
  return (
    <group>
      {/* 수동 그리드 라인들 */}
      {gridLines}
      
      {/* 뷰포트별 축 표시 */}
      {currentViewDirection === 'front' && (
        <>
          {/* 정면뷰: X축(빨간색), Y축(초록색) */}
          <Line points={[[-50, 0, 0.001], [50, 0, 0.001]]} color="#ff4444" lineWidth={2} />
          <Line points={[[0, -50, 0.001], [0, 50, 0.001]]} color="#44ff44" lineWidth={2} />
          
          {/* 공간 경계선 */}
          <Line
            points={[
              [0, 0, 0.002], [spaceWidth, 0, 0.002],
              [spaceWidth, spaceHeight, 0.002], [0, spaceHeight, 0.002], [0, 0, 0.002]
            ]}
            color="#1976d2"
            lineWidth={3}
          />
        </>
      )}
      
      {currentViewDirection === 'left' && (
        <>
          {/* 좌측뷰: Z축(빨간색), Y축(초록색) */}
          <Line points={[[0, 0, -50], [0, 0, 50]]} color="#ff4444" lineWidth={2} />
          <Line points={[[0, -50, 0], [0, 50, 0]]} color="#44ff44" lineWidth={2} />
          
          {/* 공간 경계선 (좌측면) */}
          <Line
            points={[
              [0, 0, 0], [0, 0, spaceHeight * 0.6],
              [0, spaceHeight, spaceHeight * 0.6], [0, spaceHeight, 0], [0, 0, 0]
            ]}
            color="#1976d2"
            lineWidth={3}
          />
        </>
      )}
      
      {currentViewDirection === 'right' && (
        <>
          {/* 우측뷰: Z축(빨간색), Y축(초록색) */}
          <Line points={[[spaceWidth, 0, -50], [spaceWidth, 0, 50]]} color="#ff4444" lineWidth={2} />
          <Line points={[[spaceWidth, -50, 0], [spaceWidth, 50, 0]]} color="#44ff44" lineWidth={2} />
          
          {/* 공간 경계선 (우측면) */}
          <Line
            points={[
              [spaceWidth, 0, 0], [spaceWidth, 0, spaceHeight * 0.6],
              [spaceWidth, spaceHeight, spaceHeight * 0.6], [spaceWidth, spaceHeight, 0], [spaceWidth, 0, 0]
            ]}
            color="#1976d2"
            lineWidth={3}
          />
        </>
      )}
      
      {currentViewDirection === 'top' && (
        <>
          {/* 상단뷰: X축(빨간색), Z축(파란색) */}
          <Line points={[[-50, spaceHeight, 0], [50, spaceHeight, 0]]} color="#ff4444" lineWidth={2} />
          <Line points={[[0, spaceHeight, -50], [0, spaceHeight, 50]]} color="#4444ff" lineWidth={2} />
          
          {/* 공간 경계선 (상단면) */}
          <Line
            points={[
              [0, spaceHeight, 0], [spaceWidth, spaceHeight, 0],
              [spaceWidth, spaceHeight, spaceHeight * 0.6], [0, spaceHeight, spaceHeight * 0.6], [0, spaceHeight, 0]
            ]}
            color="#1976d2"
            lineWidth={3}
          />
        </>
      )}
      
      {/* 디버깅용 중심점 표시 */}
      <mesh position={[0, 0, 0.05]}>
        <sphereGeometry args={[0.05]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
    </group>
  );
};

export default ManualCADGrid2D;