import React, { useEffect } from 'react';
import { Line } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';


interface DimensionLines2DProps {
  onTextsChange?: (arr: { x: number; y: number; value: string }[]) => void;
}

const DimensionLines2D: React.FC<DimensionLines2DProps> = ({ onTextsChange }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { theme } = useTheme();
  
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
      <Line
        points={[[overallLeft, topY, zVal], [overallRight, topY, zVal]]}
        color={dimensionColor}
        lineWidth={2.5}
      />
      {/* 전체 치수선 양 끝 화살표 */}
      <Line
        points={[[overallLeft, topY + mmToThreeUnits(18) * Math.sin(Math.PI / 6), zVal], [overallLeft, topY, zVal], [overallLeft, topY - mmToThreeUnits(18) * Math.sin(Math.PI / 6), zVal]]}
        color={dimensionColor}
        lineWidth={1.5}
      />
      <Line
        points={[[overallRight, topY + mmToThreeUnits(18) * Math.sin(Math.PI / 6), zVal], [overallRight, topY, zVal], [overallRight, topY - mmToThreeUnits(18) * Math.sin(Math.PI / 6), zVal]]}
        color={dimensionColor}
        lineWidth={1.5}
      />
      {/* 컬럼 치수선/치수 텍스트(슬롯 내경)는 완전히 제거 */}
    </group>
  );
};

export default DimensionLines2D; 