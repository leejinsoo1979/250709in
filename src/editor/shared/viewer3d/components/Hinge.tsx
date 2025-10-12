import React from 'react';
import { Line } from '@react-three/drei';
import { useSpace3DView } from '../context/useSpace3DView';

interface HingeProps {
  position: [number, number, number];
  mainDiameter?: number;
  smallCircleDiameter?: number;
  verticalSpacing?: number;
}

export const Hinge: React.FC<HingeProps> = ({
  position,
  mainDiameter = 17.5, // 메인 경첩 직경 17.5mm
  smallCircleDiameter = 4, // 작은 원 직경 4mm
  verticalSpacing = 20 // 작은 원들 사이 간격 (임시값, 이미지에서 정확한 값 확인 필요)
}) => {
  const { viewMode } = useSpace3DView();

  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  const mainRadius = mmToThreeUnits(mainDiameter) / 2;
  const smallRadius = mmToThreeUnits(smallCircleDiameter) / 2;
  const spacing = mmToThreeUnits(verticalSpacing);
  const lineColor = '#00FFFF'; // Cyan color

  // Generate circle points
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

  const mainCirclePoints = generateCirclePoints(mainRadius);
  const smallCirclePoints = generateCirclePoints(smallRadius);

  // Only render in 2D front view
  if (viewMode !== '2D') {
    return null;
  }

  return (
    <group position={position}>
      {/* 메인 경첩 원 (17.5mm) */}
      <Line points={mainCirclePoints} color={lineColor} lineWidth={1} />

      {/* 위쪽 작은 원 (4mm) */}
      <group position={[0, spacing, 0]}>
        <Line points={smallCirclePoints} color={lineColor} lineWidth={1} />
      </group>

      {/* 아래쪽 작은 원 (4mm) */}
      <group position={[0, -spacing, 0]}>
        <Line points={smallCirclePoints} color={lineColor} lineWidth={1} />
      </group>
    </group>
  );
};
