import React from 'react';
import { Line } from '@react-three/drei';
import { useSpace3DView } from '../context/useSpace3DView';

interface HingeProps {
  position: [number, number, number];
  diameter?: number;
}

export const Hinge: React.FC<HingeProps> = ({
  position,
  diameter = 35 // Blum MODUL 35mm diameter
}) => {
  const { viewMode } = useSpace3DView();

  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  const radius = mmToThreeUnits(diameter) / 2;
  const lineColor = '#00FFFF'; // Cyan color from CAD images

  // Generate circle points
  const generateCirclePoints = (segments: number = 64): [number, number, number][] => {
    const points: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      points.push([x, y, 0]);
    }
    return points;
  };

  const circlePoints = generateCirclePoints();

  // Only render in 2D front view
  if (viewMode !== '2D') {
    return null;
  }

  return (
    <group position={position}>
      <Line points={circlePoints} color={lineColor} lineWidth={1} />
    </group>
  );
};
