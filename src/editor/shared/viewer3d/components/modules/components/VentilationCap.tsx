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

  // 3D 모드: 실제 환기캡 모델
  if (is3DMode) {
    const capDepth = mmToThreeUnits(thickness);
    const rimThickness = mmToThreeUnits(2);

    return (
      <group position={position}>
        {/* 외부 테두리 링 */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[outerRadius - rimThickness, outerRadius, 32]} />
          <meshStandardMaterial
            color="#ffffff"
            metalness={0.6}
            roughness={0.3}
          />
        </mesh>

        {/* 메인 베이스 (얇은 원형 플레이트) */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -capDepth / 2, 0]}>
          <cylinderGeometry args={[outerRadius - rimThickness, outerRadius - rimThickness, rimThickness, 32]} />
          <meshStandardMaterial
            color="#f5f5f5"
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>

        {/* 루버 (가로 통풍구) - 여러 줄 */}
        {Array.from({ length: 6 }).map((_, i) => {
          const louverHeight = (i - 2.5) * mmToThreeUnits(12);
          const louverWidth = outerRadius * 1.6;
          const louverDepth = mmToThreeUnits(2);
          const louverThickness = mmToThreeUnits(1);

          return (
            <mesh
              key={i}
              position={[0, louverDepth / 2, louverHeight]}
              rotation={[Math.PI / 6, 0, 0]}
            >
              <boxGeometry args={[louverWidth, louverDepth, louverThickness]} />
              <meshStandardMaterial
                color="#e8e8e8"
                metalness={0.5}
                roughness={0.4}
              />
            </mesh>
          );
        })}

        {/* 고정 나사 구멍 (4개) */}
        {Array.from({ length: 4 }).map((_, i) => {
          const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const screwRadius = outerRadius * 0.85;
          const screwX = Math.cos(angle) * screwRadius;
          const screwZ = Math.sin(angle) * screwRadius;
          const screwHoleRadius = mmToThreeUnits(3);

          return (
            <mesh
              key={`screw-${i}`}
              position={[screwX, 0, screwZ]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[screwHoleRadius, screwHoleRadius, rimThickness * 2, 8]} />
              <meshStandardMaterial
                color="#999999"
                metalness={0.7}
                roughness={0.2}
              />
            </mesh>
          );
        })}
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
