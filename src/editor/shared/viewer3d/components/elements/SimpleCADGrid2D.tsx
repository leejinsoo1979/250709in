import React from 'react';
import { Grid, Line } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';

interface SimpleCADGrid2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
}

/**
 * 간단한 테스트용 CAD 그리드 - 문제 진단용
 */
const SimpleCADGrid2D: React.FC<SimpleCADGrid2DProps> = ({ viewDirection }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { view2DDirection } = useUIStore();
  const { theme } = useTheme();
  
  // 테마 색상 매핑
  const themeColorMap: Record<string, string> = {
    green: '#10b981',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    vivid: '#a25378',
    red: '#D2042D',
    pink: '#ec4899',
    indigo: '#6366f1',
    teal: '#14b8a6',
    yellow: '#eab308',
    gray: '#6b7280',
    cyan: '#06b6d4',
    lime: '#84cc16',
    black: '#1a1a1a',
    wine: '#845EC2',
    gold: '#d97706',
    navy: '#1e3a8a',
    emerald: '#059669',
    violet: '#C128D7',
    mint: '#0CBA80',
    neon: '#18CF23',
    rust: '#FF7438',
    white: '#D65DB1',
    plum: '#790963',
    brown: '#5A2B1D',
    darkgray: '#2C3844',
    maroon: '#3F0D0D',
    turquoise: '#003A7A',
    slate: '#2E3A47',
    copper: '#AD4F34',
    forest: '#1B3924',
    olive: '#4C462C'
  };
  
  // 현재 테마 색상
  const highlightColor = themeColorMap[theme.color] || '#3b82f6';
  
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
      <NativeLine
        points={[[-10, 0, 0.01], [10, 0, 0.01]]}
        color="#ff0000"
        lineWidth={3}
      />
      <NativeLine
        points={[[0, -10, 0.01], [0, 10, 0.01]]}
        color="#00ff00"
        lineWidth={3}
      />
      
      {/* 공간 경계 표시 */}
      <NativeLine
        points={[
          [0, 0, 0.02], 
          [spaceInfo.width * 0.01, 0, 0.02],
          [spaceInfo.width * 0.01, spaceInfo.height * 0.01, 0.02], 
          [0, spaceInfo.height * 0.01, 0.02], 
          [0, 0, 0.02]
        ]}
        color={highlightColor}
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