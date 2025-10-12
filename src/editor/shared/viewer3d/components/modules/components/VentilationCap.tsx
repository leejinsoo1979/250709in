import React from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useUIStore } from '@/store/uiStore';
import { useSpace3DView } from '../../../context/useSpace3DView';

interface VentilationCapProps {
  position: [number, number, number];
  diameter?: number; // mm 단위
  renderMode: '2d' | '3d';
}

/**
 * VentilationCap 컴포넌트
 * 환기캡 표시: 동심원 2개로 표현
 *
 * 기본 크기: 직경 98mm
 */
export const VentilationCap: React.FC<VentilationCapProps> = ({
  position,
  diameter = 98,
  renderMode
}) => {
  const { view2DTheme } = useUIStore();
  const { viewMode } = useSpace3DView();

  // 단위 변환 함수
  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  // 원 직경 (Three.js 단위)
  const outerRadius = mmToThreeUnits(diameter) / 2;
  const innerRadius = outerRadius * 0.95; // 내부 원은 외부 원의 95% 크기

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

  return (
    <group position={position}>
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

      {/* 중심선 - 가로 */}
      <Line
        points={[
          [-outerRadius, 0, 0],
          [outerRadius, 0, 0]
        ]}
        color={lineColor}
        lineWidth={0.5}
      />

      {/* 중심선 - 세로 */}
      <Line
        points={[
          [0, -outerRadius, 0],
          [0, outerRadius, 0]
        ]}
        color={lineColor}
        lineWidth={0.5}
      />
    </group>
  );
};
