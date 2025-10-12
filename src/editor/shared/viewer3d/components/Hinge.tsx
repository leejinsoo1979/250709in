import React from 'react';
import { Line } from '@react-three/drei';
import { useSpace3DView } from '../context/useSpace3DView';

interface HingeProps {
  position: [number, number, number]; // 메인 원의 위치
  mainDiameter?: number;
  smallCircleDiameter?: number;
  verticalSpacing?: number;
  smallCircleXOffset?: number; // 작은 원의 X축 오프셋 (측판에서 더 안쪽으로)
  viewDirection?: 'front' | 'side'; // 뷰 방향 (정면 또는 측면)
  view2DDirection?: 'front' | 'left' | 'right' | 'top'; // DoorModule에서 전달받을 뷰 방향
}

export const Hinge: React.FC<HingeProps> = ({
  position,
  mainDiameter = 17.5, // 메인 경첩 반지름 17.5mm
  smallCircleDiameter = 4, // 작은 원 반지름 4mm
  verticalSpacing = 20, // 작은 원들 사이 간격 (사용 안 함)
  smallCircleXOffset = 9.5, // 작은 원이 메인 원보다 안쪽으로 9.5mm (33.5 - 24)
  viewDirection = 'front', // 기본값은 정면뷰
  view2DDirection: propsView2DDirection // props로 전달받은 view2DDirection
}) => {
  const { viewMode, view2DDirection: contextView2DDirection } = useSpace3DView();
  // props로 전달받은 값이 있으면 우선 사용, 없으면 컨텍스트 값 사용
  const view2DDirection = propsView2DDirection || contextView2DDirection;

  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  // 값이 이미 반지름이므로 그대로 사용
  const mainRadius = mmToThreeUnits(mainDiameter);
  const smallRadius = mmToThreeUnits(smallCircleDiameter);

  // 작은 원 간 세로 간격: 45mm (중심점 간 거리)
  // 각 작은 원은 메인 원 중심에서 22.5mm(45/2) 떨어진 위치
  const smallCircleSpacing = mmToThreeUnits(45) / 2; // 22.5mm
  const smallCircleX = mmToThreeUnits(smallCircleXOffset); // X축 오프셋
  const lineColor = '#00CCCC'; // Dark cyan color

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

  // Only render in 2D view
  if (viewMode !== '2D') {
    return null;
  }

  // 측면뷰 렌더링 - 실제 컵 힌지 형상
  if ((view2DDirection === 'left' || view2DDirection === 'right') && viewDirection === 'side') {
    // 힌지 치수 (실제 컵 힌지 기준)
    const baseWidth = mmToThreeUnits(18);    // 베이스플레이트 너비 18mm
    const baseHeight = mmToThreeUnits(35);   // 베이스플레이트 높이 35mm
    const cupDiameter = mmToThreeUnits(35);  // 컵 직경 35mm
    const armThickness = mmToThreeUnits(3);  // 암 두께 3mm
    const armLength = mmToThreeUnits(12);    // 암 길이 12mm
    const sideViewColor = '#00CCCC'; // 시안색 (정면뷰 경첩 타공점과 동일)

    return (
      <group position={position}>
        {/* 베이스플레이트 (캐비닛에 고정되는 부분) - Y-Z 평면 */}
        <Line
          points={[
            [0, baseHeight / 2, -baseWidth / 2],
            [0, baseHeight / 2, baseWidth / 2],
            [0, -baseHeight / 2, baseWidth / 2],
            [0, -baseHeight / 2, -baseWidth / 2],
            [0, baseHeight / 2, -baseWidth / 2]
          ]}
          color={sideViewColor}
          lineWidth={1}
        />

        {/* 힌지 컵 (원통형 부분) - 베이스플레이트 중앙에 위치 - Y-Z 평면 */}
        <Line
          points={[
            [0, cupDiameter / 2, 0],
            [0, -cupDiameter / 2, 0]
          ]}
          color={sideViewColor}
          lineWidth={1}
        />

        {/* 힌지 암 (도어로 연장되는 부분) - 베이스플레이트 오른쪽에서 시작 - Y-Z 평면 */}
        <Line
          points={[
            [0, armThickness / 2, baseWidth / 2],
            [0, armThickness / 2, baseWidth / 2 + armLength],
            [0, -armThickness / 2, baseWidth / 2 + armLength],
            [0, -armThickness / 2, baseWidth / 2],
            [0, armThickness / 2, baseWidth / 2]
          ]}
          color={sideViewColor}
          lineWidth={1}
        />
      </group>
    );
  }

  // 정면뷰 렌더링 (기본값)
  if (viewDirection === 'front') {
    return (
      <group position={position}>
        {/* 메인 경첩 원 (17.5mm 반지름) - 측판에서 24mm 안쪽 */}
        <Line points={mainCirclePoints} color={lineColor} lineWidth={1} />

        {/* 위쪽 작은 원 (4mm 반지름) - 측판에서 33.5mm 안쪽, 메인 원 중심에서 위로 22.5mm */}
        <group position={[smallCircleX, smallCircleSpacing, 0]}>
          <Line points={smallCirclePoints} color={lineColor} lineWidth={1} />
        </group>

        {/* 아래쪽 작은 원 (4mm 반지름) - 측판에서 33.5mm 안쪽, 메인 원 중심에서 아래로 22.5mm */}
        <group position={[smallCircleX, -smallCircleSpacing, 0]}>
          <Line points={smallCirclePoints} color={lineColor} lineWidth={1} />
        </group>
      </group>
    );
  }

  return null;
};
