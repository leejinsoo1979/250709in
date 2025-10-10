import React, { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { Line as NativeLine } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';


interface DimensionLines2DProps {
  onTextsChange?: (arr: { x: number; y: number; value: string }[]) => void;
}

const DimensionLines2D: React.FC<DimensionLines2DProps> = ({ onTextsChange }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  // mm → three.js 단위 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // 2D 도면 치수선 색상 - 호버 시 형광색
  const highlightColor = '#00ff00'; // 형광 녹색
  const normalColor = theme?.mode === 'light' ? '#000000' : '#FFFFFF';
  const dimensionColor = isHovered ? highlightColor : normalColor;

  // 프레임 두께 포함 전체 외경 기준
  const topY = mmToThreeUnits(spaceInfo.height + 100); // 가구 맨 위 + 100mm
  const overallLeft = mmToThreeUnits(0); // 좌측 프레임 바깥
  const overallRight = mmToThreeUnits(spaceInfo.width); // 우측 프레임 바깥
  // z값: 0.05로 앞으로
  const zVal = 0.05;

  useEffect(() => {
    // onTextsChange가 있을 때만 빈 배열로 호출 (기존 SVG 시스템과의 호환성)
    if (onTextsChange) onTextsChange([]);
  }, [onTextsChange]);

  // 화살표, 가이드선 등 기존 3D 라인 렌더링은 그대로 유지
  // SVG 오버레이는 Space3DView에서 별도 렌더링 필요(예시)

  return (
    <group>
      {/* 전체 치수선 (상단, 프레임 포함 전체 외경) */}
      <NativeLine
        points={[[overallLeft, topY, zVal], [overallRight, topY, zVal]]}
        color={dimensionColor}
        lineWidth={2.5}
        renderOrder={1000}  // 높은 renderOrder로 항상 앞에 표시
        depthTest={false}   // depth test 비활성화로 다른 메쉬에 가려지지 않도록
      />
      {/* 전체 치수선 양 끝 화살표 */}
      <NativeLine
        points={[[overallLeft, topY + mmToThreeUnits(18) * Math.sin(Math.PI / 6), zVal], [overallLeft, topY, zVal], [overallLeft, topY - mmToThreeUnits(18) * Math.sin(Math.PI / 6), zVal]]}
        color={dimensionColor}
        lineWidth={1.5}
        renderOrder={1000}
        depthTest={false}
      />
      <NativeLine
        points={[[overallRight, topY + mmToThreeUnits(18) * Math.sin(Math.PI / 6), zVal], [overallRight, topY, zVal], [overallRight, topY - mmToThreeUnits(18) * Math.sin(Math.PI / 6), zVal]]}
        color={dimensionColor}
        lineWidth={1.5}
        renderOrder={1000}
        depthTest={false}
      />
      
      {/* 내부 공간 치수 (슬롯 내경) */}
      {(() => {
        // 프레임 두께 계산
        const frameSize = spaceInfo.frameSize || { top: 50, side: 9 };
        const sideFrameThickness = frameSize.side || 9;

        // 내부 공간 계산 (프레임 두께를 제외한 실제 사용 가능한 공간)
        const internalWidth = spaceInfo.width - (sideFrameThickness * 2);

        // 내부 치수선 위치 (상단에서 조금 아래)
        const internalY = topY - mmToThreeUnits(100);
        const internalLeft = mmToThreeUnits(sideFrameThickness);
        const internalRight = mmToThreeUnits(spaceInfo.width - sideFrameThickness);

        // 내부 치수 전용 색상 (호버 상태 반영)
        const internalDimensionColor = isHovered ? highlightColor : normalColor;

        return (
          <>
            {/* 내부 폭 치수선 */}
            <NativeLine
              points={[[internalLeft, internalY, zVal], [internalRight, internalY, zVal]]}
              color={internalDimensionColor}
              lineWidth={2}
              renderOrder={1000}
              depthTest={false}
            />

            {/* 내부 폭 좌측 화살표 */}
            <NativeLine
              points={[
                [internalLeft, internalY + mmToThreeUnits(10), zVal],
                [internalLeft, internalY, zVal],
                [internalLeft, internalY - mmToThreeUnits(10), zVal]
              ]}
              color={internalDimensionColor}
              lineWidth={1.5}
              renderOrder={1000}
              depthTest={false}
            />

            {/* 내부 폭 우측 화살표 */}
            <NativeLine
              points={[
                [internalRight, internalY + mmToThreeUnits(10), zVal],
                [internalRight, internalY, zVal],
                [internalRight, internalY - mmToThreeUnits(10), zVal]
              ]}
              color={internalDimensionColor}
              lineWidth={1.5}
              renderOrder={1000}
              depthTest={false}
            />

            {/* 내부 폭 텍스트 */}
            <Html
              position={[(internalLeft + internalRight) / 2, internalY + mmToThreeUnits(30), zVal]}
              center
              transform={false}
              occlude={false}
              zIndexRange={[1000, 1001]}
              style={{
                pointerEvents: 'auto'
              }}
            >
              <div
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{
                  background: theme?.mode === 'dark' ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                  color: internalDimensionColor,
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  border: `2px solid ${internalDimensionColor}`,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                  cursor: 'pointer'
                }}
              >
                {internalWidth}mm
              </div>
            </Html>
          </>
        );
      })()}
    </group>
  );
};

export default DimensionLines2D; 