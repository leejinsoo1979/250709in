import React from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useUIStore } from '@/store/uiStore';
import { useSpace3DView } from '../../../context/useSpace3DView';

interface VentilationCapProps {
  position: [number, number, number];
  diameter?: number; // mm 단위
  thickness?: number; // mm 단위 (기본 9mm)
  renderMode: '2d' | '3d';
}

/**
 * VentilationCap 컴포넌트
 * 환기캡 표시: 동심원 2개로 표현
 *
 * 기본 크기: 직경 98mm, 두께 9mm
 */
export const VentilationCap: React.FC<VentilationCapProps> = ({
  position,
  diameter = 98,
  thickness = 9,
  renderMode
}) => {
  const { view2DTheme, view2DDirection } = useUIStore();
  const { viewMode } = useSpace3DView();

  // 단위 변환 함수
  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  // 원 직경 (Three.js 단위)
  const outerRadius = mmToThreeUnits(diameter) / 2;
  const innerRadius = outerRadius * 0.95; // 내부 원은 외부 원의 95% 크기

  // 십자선 길이 (150mm)
  const crossLineLength = mmToThreeUnits(150) / 2;

  // 2D 도면용 선 색상
  const lineColor = view2DTheme === 'light' ? '#FF00FF' : '#FF00FF'; // 마젠타(보라) 색상

  // 원을 그리기 위한 점 생성
  const generateCirclePoints = (radius: number, segments: number = 64): [number, number, number][] => {
    const points: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      points.push([x, y, 0]);
    }
    return points;
  };

  const outerCirclePoints = generateCirclePoints(outerRadius);
  const innerCirclePoints = generateCirclePoints(innerRadius);

  // 측면뷰에서 두께 표시 (9mm)
  const capThickness = mmToThreeUnits(thickness);
  const isSideView = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');

  console.log('🌀 VentilationCap 렌더링:', {
    position,
    diameter,
    thickness,
    outerRadius,
    crossLineLength,
    viewMode,
    view2DDirection,
    isSideView,
    renderMode
  });

  return (
    <group position={position}>
      {isSideView ? (
        // 측면뷰: 9mm 두께의 수평선으로 표시 (Y축 위치에 Z축 두께)
        <>
          {/* 환기캡 두께를 나타내는 수평선 */}
          <Line
            points={[
              [0, -capThickness / 2, 0],
              [0, capThickness / 2, 0]
            ]}
            color={lineColor}
            lineWidth={2}
          />
        </>
      ) : (
        // 정면뷰/탑뷰: 동심원으로 표시
        <>
          {/* 외부 원 */}
          <Line
            points={outerCirclePoints}
            color={lineColor}
            lineWidth={1}
          />

          {/* 내부 원 */}
          <Line
            points={innerCirclePoints}
            color={lineColor}
            lineWidth={1}
          />

          {/* 중심선 - 가로 (150mm) */}
          <Line
            points={[
              [-crossLineLength, 0, 0],
              [crossLineLength, 0, 0]
            ]}
            color={lineColor}
            lineWidth={0.5}
          />

          {/* 중심선 - 세로 (150mm) */}
          <Line
            points={[
              [0, -crossLineLength, 0],
              [0, crossLineLength, 0]
            ]}
            color={lineColor}
            lineWidth={0.5}
          />
        </>
      )}
    </group>
  );
};
