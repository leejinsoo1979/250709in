import React from 'react';
import { Html, Line } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';

interface VerticalDimensionsProps {
  viewMode?: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top';
}

const VerticalDimensions: React.FC<VerticalDimensionsProps> = ({ viewMode = '3D', view2DDirection = 'front' }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { theme } = useTheme();

  // 2D 사이드뷰 또는 탑뷰에서는 표시 안함
  if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) {
    return null;
  }

  // mm → three.js 단위 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // CSS 변수에서 실제 테마 색상 가져오기
  const getThemeColorFromCSS = (variableName: string, fallback: string) => {
    if (typeof window !== 'undefined') {
      const computedColor = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName).trim();
      return computedColor || fallback;
    }
    return fallback;
  };

  // 테마 기반 치수선 색상
  const dimensionColor = getThemeColorFromCSS('--theme-primary', '#10b981');
  const labelBgColor = theme?.mode === 'dark' 
    ? 'rgba(17, 24, 39, 0.95)' // 다크모드: 진한 배경
    : 'rgba(255, 255, 255, 0.95)'; // 라이트모드: 흰 배경

  // 치수선 위치 계산
  const rightEdgeX = mmToThreeUnits(spaceInfo.width + 150); // 우측 가구 외경에서 150mm 떨어진 위치
  const zPos = 0.1; // 앞쪽으로 살짝

  // 높이 계산
  const frameSize = spaceInfo.frameSize || { top: 50, side: 9 };
  const topFrameHeight = frameSize.top || 50;
  
  // 바닥 마감 및 받침대 높이
  const floorFinishHeight = spaceInfo.hasFloorFinish && spaceInfo.floorFinish 
    ? spaceInfo.floorFinish.height 
    : 0;
  const baseFrameHeight = spaceInfo.baseConfig?.height || 0;
  
  // 세 구간의 Y 좌표 계산 (mm 단위)
  const bottomY = 0; // 바닥 (0)
  const internalBottomY = floorFinishHeight + baseFrameHeight; // 내경 시작점
  const internalTopY = spaceInfo.height - topFrameHeight; // 내경 끝점 (상부프레임 하단)
  const topY = spaceInfo.height; // 전체 높이 (상부프레임 상단)

  // Three.js 단위로 변환
  const bottomYThree = mmToThreeUnits(bottomY);
  const internalBottomYThree = mmToThreeUnits(internalBottomY);
  const internalTopYThree = mmToThreeUnits(internalTopY);
  const topYThree = mmToThreeUnits(topY);

  // 각 구간의 높이 계산
  const bottomSectionHeight = internalBottomY - bottomY; // 하단 구간
  const internalHeight = internalTopY - internalBottomY; // 내경
  const topSectionHeight = topY - internalTopY; // 상단 구간

  // 화살표 크기
  const arrowSize = mmToThreeUnits(15);

  // Konva Label/Tag 스타일의 HTML 라벨 컴포넌트
  const DimensionLabel: React.FC<{ 
    value: number; 
    position: [number, number, number];
    isInternal?: boolean;
  }> = ({ value, position, isInternal = false }) => (
    <Html
      position={position}
      center
      transform={false}
      occlude={false}
      zIndexRange={[2000, 2001]} // 최상단 레이어
      className="dim-text" // CSS 클래스 추가
    >
      <div
        style={{
          background: labelBgColor,
          color: dimensionColor,
          padding: isInternal ? '10px 16px' : '6px 10px',
          borderRadius: '6px',
          fontSize: isInternal ? '28px' : '18px',
          fontWeight: isInternal ? 'bold' : 'normal',
          border: `2px solid ${dimensionColor}`,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          position: 'relative',
          zIndex: 2000,
        }}
      >
        {value}mm
        {isInternal && (
          <div style={{
            position: 'absolute',
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: `8px solid ${dimensionColor}`,
          }} />
        )}
      </div>
    </Html>
  );

  return (
    <group name="vertical-dimensions" renderOrder={1000}>
      {/* 상단 구간 (상부프레임) */}
      {topSectionHeight > 0 && (
        <>
          {/* 치수선 */}
          <Line
            points={[
              [rightEdgeX, internalTopYThree, zPos],
              [rightEdgeX, topYThree, zPos]
            ]}
            color={dimensionColor}
            lineWidth={2}
          />
          {/* 상단 화살표 */}
          <Line
            points={[
              [rightEdgeX - arrowSize/2, topYThree - arrowSize/3, zPos],
              [rightEdgeX, topYThree, zPos],
              [rightEdgeX + arrowSize/2, topYThree - arrowSize/3, zPos]
            ]}
            color={dimensionColor}
            lineWidth={1.5}
          />
          {/* 하단 화살표 */}
          <Line
            points={[
              [rightEdgeX - arrowSize/2, internalTopYThree + arrowSize/3, zPos],
              [rightEdgeX, internalTopYThree, zPos],
              [rightEdgeX + arrowSize/2, internalTopYThree + arrowSize/3, zPos]
            ]}
            color={dimensionColor}
            lineWidth={1.5}
          />
          {/* 라벨 */}
          <DimensionLabel
            value={Math.round(topSectionHeight)}
            position={[rightEdgeX + mmToThreeUnits(50), (topYThree + internalTopYThree) / 2, zPos]}
          />
        </>
      )}

      {/* 내경 구간 (메인) */}
      <>
        {/* 치수선 */}
        <Line
          points={[
            [rightEdgeX, internalBottomYThree, zPos],
            [rightEdgeX, internalTopYThree, zPos]
          ]}
          color={dimensionColor}
          lineWidth={3}
        />
        {/* 상단 화살표 */}
        <Line
          points={[
            [rightEdgeX - arrowSize, internalTopYThree - arrowSize/2, zPos],
            [rightEdgeX, internalTopYThree, zPos],
            [rightEdgeX + arrowSize, internalTopYThree - arrowSize/2, zPos]
          ]}
          color={dimensionColor}
          lineWidth={2}
        />
        {/* 하단 화살표 */}
        <Line
          points={[
            [rightEdgeX - arrowSize, internalBottomYThree + arrowSize/2, zPos],
            [rightEdgeX, internalBottomYThree, zPos],
            [rightEdgeX + arrowSize, internalBottomYThree + arrowSize/2, zPos]
          ]}
          color={dimensionColor}
          lineWidth={2}
        />
        {/* 라벨 (내경은 더 크고 강조됨) */}
        <DimensionLabel
          value={Math.round(internalHeight)}
          position={[rightEdgeX + mmToThreeUnits(60), (internalTopYThree + internalBottomYThree) / 2, zPos]}
          isInternal={true}
        />
      </>

      {/* 하단 구간 (바닥마감 + 받침대) */}
      {bottomSectionHeight > 0 && (
        <>
          {/* 치수선 */}
          <Line
            points={[
              [rightEdgeX, bottomYThree, zPos],
              [rightEdgeX, internalBottomYThree, zPos]
            ]}
            color={dimensionColor}
            lineWidth={2}
          />
          {/* 상단 화살표 */}
          <Line
            points={[
              [rightEdgeX - arrowSize/2, internalBottomYThree - arrowSize/3, zPos],
              [rightEdgeX, internalBottomYThree, zPos],
              [rightEdgeX + arrowSize/2, internalBottomYThree - arrowSize/3, zPos]
            ]}
            color={dimensionColor}
            lineWidth={1.5}
          />
          {/* 하단 화살표 */}
          <Line
            points={[
              [rightEdgeX - arrowSize/2, bottomYThree + arrowSize/3, zPos],
              [rightEdgeX, bottomYThree, zPos],
              [rightEdgeX + arrowSize/2, bottomYThree + arrowSize/3, zPos]
            ]}
            color={dimensionColor}
            lineWidth={1.5}
          />
          {/* 라벨 */}
          <DimensionLabel
            value={Math.round(bottomSectionHeight)}
            position={[rightEdgeX + mmToThreeUnits(50), (bottomYThree + internalBottomYThree) / 2, zPos]}
          />
        </>
      )}

      {/* 연결 가이드선 */}
      <Line
        points={[
          [mmToThreeUnits(spaceInfo.width), bottomYThree, zPos],
          [rightEdgeX + mmToThreeUnits(20), bottomYThree, zPos]
        ]}
        color={dimensionColor}
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.05}
      />
      <Line
        points={[
          [mmToThreeUnits(spaceInfo.width), internalBottomYThree, zPos],
          [rightEdgeX + mmToThreeUnits(20), internalBottomYThree, zPos]
        ]}
        color={dimensionColor}
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.05}
      />
      <Line
        points={[
          [mmToThreeUnits(spaceInfo.width), internalTopYThree, zPos],
          [rightEdgeX + mmToThreeUnits(20), internalTopYThree, zPos]
        ]}
        color={dimensionColor}
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.05}
      />
      <Line
        points={[
          [mmToThreeUnits(spaceInfo.width), topYThree, zPos],
          [rightEdgeX + mmToThreeUnits(20), topYThree, zPos]
        ]}
        color={dimensionColor}
        lineWidth={0.5}
        dashed
        dashSize={0.05}
        gapSize={0.05}
      />
    </group>
  );
};

export default VerticalDimensions;