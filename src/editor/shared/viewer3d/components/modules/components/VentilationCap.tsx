import React, { useMemo } from 'react';
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

  // 2D 정면뷰 체크
  const isFrontView = viewMode === '2D' && view2DDirection === 'front';
  const is3DMode = viewMode === '3D';

  console.log('🌀 VentilationCap 렌더링:', {
    position,
    diameter,
    thickness,
    outerRadius,
    crossLineLength,
    viewMode,
    view2DDirection,
    is3DMode,
    isFrontView,
    renderMode
  });

  // 탑뷰, 측면뷰에서는 렌더링하지 않음
  if (!is3DMode && !isFrontView) {
    return null;
  }

  // 육각형 벌집 패턴 생성 함수
  const generateHoneycombPattern = () => {
    const hexSize = mmToThreeUnits(8); // 육각형 한 변 크기
    const holes: JSX.Element[] = [];

    // 육각형 간격 계산
    const hexWidth = hexSize * Math.sqrt(3);
    const hexHeight = hexSize * 1.5;

    let holeIndex = 0;

    // 행/열로 배치
    for (let row = -3; row <= 3; row++) {
      for (let col = -3; col <= 3; col++) {
        // 육각형 그리드 오프셋 계산
        const xOffset = col * hexWidth + (row % 2) * (hexWidth / 2);
        const zOffset = row * hexHeight;

        // 원형 범위 내에만 구멍 배치
        const distance = Math.sqrt(xOffset * xOffset + zOffset * zOffset);
        if (distance < outerRadius * 0.7) {
          holes.push(
            <mesh
              key={holeIndex++}
              position={[xOffset, mmToThreeUnits(thickness) / 2 + 0.001, zOffset]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[hexSize * 0.4, hexSize * 0.4, mmToThreeUnits(2), 6]} />
              <meshStandardMaterial
                color="#333333"
                metalness={0.2}
                roughness={0.8}
              />
            </mesh>
          );
        }
      }
    }

    return holes;
  };

  // 3D 모드: 실제 환기캡 모델
  if (is3DMode) {
    return (
      <group position={position}>
        {/* 흰색 원형 베이스 */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[outerRadius, outerRadius, mmToThreeUnits(thickness), 32]} />
          <meshStandardMaterial
            color="#ffffff"
          />
        </mesh>

        {/* 벌집 패턴 구멍들 */}
        {generateHoneycombPattern()}
      </group>
    );
  }

  // 2D 모드: 도면 표시
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
    </group>
  );
};
