import React from 'react';
import { Grid, Line } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';

interface SimpleCADGrid2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
}

/**
 * 간단한 테스트용 CAD 그리드 - 문제 진단용
 */
const SimpleCADGrid2D: React.FC<SimpleCADGrid2DProps> = ({ viewDirection }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { view2DDirection } = useUIStore();
  
  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;
  
  console.log('SimpleCADGrid2D 렌더링:', { currentViewDirection, spaceInfo });
  
  return (
    <group>
      {/* 기본 Grid 컴포넌트 테스트 */}
      <Grid
        position={[0, 0, 0]}
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={1}
        cellColor="#ff0000"
        sectionSize={2}
        sectionThickness={2}
        sectionColor="#0000ff"
        fadeDistance={100}
        fadeStrength={0.1}
        infiniteGrid={true}
        followCamera={false}
      />
      
      {/* 시각적 확인을 위한 라인들 */}
      <Line
        points={[[-10, 0, 0.01], [10, 0, 0.01]]}
        color="#ff0000"
        lineWidth={3}
      />
      <Line
        points={[[0, -10, 0.01], [0, 10, 0.01]]}
        color="#00ff00"
        lineWidth={3}
      />
      
      {/* 공간 경계 표시 */}
      <Line
        points={[
          [0, 0, 0.02], 
          [spaceInfo.width * 0.01, 0, 0.02],
          [spaceInfo.width * 0.01, spaceInfo.height * 0.01, 0.02], 
          [0, spaceInfo.height * 0.01, 0.02], 
          [0, 0, 0.02]
        ]}
        color="#ffff00"
        lineWidth={4}
      />
      
      {/* 디버깅용 박스 */}
      <mesh position={[1, 1, 0.1]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshBasicMaterial color="#ff00ff" />
      </mesh>
    </group>
  );
};

export default SimpleCADGrid2D;