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

  // 측면뷰 렌더링 - 힌지 측면 도면
  if ((view2DDirection === 'left' || view2DDirection === 'right') && viewDirection === 'side') {
    // 측면뷰 좌표 변환: 정면뷰의 Z를 측면뷰의 X로
    const [x, y, z] = position;
    const sidePosition: [number, number, number] = [z, y, 0];

    const mm = mmToThreeUnits;

    // 타원 생성
    const oval = (cx: number, cy: number, rx: number, ry: number): [number, number, number][] => {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0]);
      }
      return pts;
    };

    // 원 생성
    const circle = (cx: number, cy: number, r: number): [number, number, number][] => oval(cx, cy, r, r);

    // 둥근 사각형 생성
    const roundRect = (x: number, y: number, w: number, h: number, r: number): [number, number, number][] => {
      const pts: [number, number, number][] = [];
      const x1 = x, x2 = x + w, y1 = y, y2 = y + h;
      // 우상단 코너
      for (let i = 0; i <= 8; i++) pts.push([x2 - r + Math.cos(i/8 * Math.PI/2) * r, y2 - r + Math.sin(i/8 * Math.PI/2) * r, 0]);
      // 좌상단 코너
      for (let i = 0; i <= 8; i++) pts.push([x1 + r - Math.cos(i/8 * Math.PI/2) * r, y2 - r + Math.sin(i/8 * Math.PI/2) * r, 0]);
      // 좌하단 코너
      for (let i = 0; i <= 8; i++) pts.push([x1 + r - Math.cos(i/8 * Math.PI/2) * r, y1 + r - Math.sin(i/8 * Math.PI/2) * r, 0]);
      // 우하단 코너
      for (let i = 0; i <= 8; i++) pts.push([x2 - r + Math.cos(i/8 * Math.PI/2) * r, y1 + r - Math.sin(i/8 * Math.PI/2) * r, 0]);
      pts.push(pts[0]);
      return pts;
    };

    return (
      <group position={sidePosition}>
        {/* 왼쪽 측판 세로 직사각형 */}
        <Line points={[[mm(-2), mm(17.5), 0], [mm(1), mm(17.5), 0], [mm(1), mm(-17.5), 0], [mm(-2), mm(-17.5), 0], [mm(-2), mm(17.5), 0]]} color={lineColor} lineWidth={1} />

        {/* 중앙 본체 가로 직사각형 */}
        <Line points={[[mm(1), mm(6.5), 0], [mm(55), mm(6.5), 0], [mm(55), mm(-6.5), 0], [mm(1), mm(-6.5), 0], [mm(1), mm(6.5), 0]]} color={lineColor} lineWidth={1} />

        {/* 본체 안 왼쪽 십자나사 (원+십자) */}
        <Line points={circle(mm(12), 0, mm(3.5))} color={lineColor} lineWidth={1} />
        <Line points={[[mm(12), mm(-3.5), 0], [mm(12), mm(3.5), 0]]} color={lineColor} lineWidth={1} />
        <Line points={[[mm(8.5), 0, 0], [mm(15.5), 0, 0]]} color={lineColor} lineWidth={1} />

        {/* 본체 안 중앙 긴 타원 슬롯 */}
        <Line points={oval(mm(28), 0, mm(10), mm(2.5))} color={lineColor} lineWidth={1} />

        {/* 본체 안 중앙 오른쪽 십자나사 */}
        <Line points={circle(mm(42), 0, mm(3.5))} color={lineColor} lineWidth={1} />
        <Line points={[[mm(42), mm(-3.5), 0], [mm(42), mm(3.5), 0]]} color={lineColor} lineWidth={1} />
        <Line points={[[mm(38.5), 0, 0], [mm(45.5), 0, 0]]} color={lineColor} lineWidth={1} />

        {/* 본체 오른쪽 작은 돌출부 */}
        <Line points={[[mm(55), mm(2), 0], [mm(58), mm(2), 0], [mm(58), mm(-2), 0], [mm(55), mm(-2), 0]]} color={lineColor} lineWidth={1} />

        {/* 상단 패드 외곽 둥근사각형 */}
        <Line points={roundRect(mm(30), mm(9), mm(18), mm(8.5), mm(3))} color={lineColor} lineWidth={1} />
        {/* 상단 패드 큰 타원 */}
        <Line points={oval(mm(39), mm(13.5), mm(5.5), mm(4))} color={lineColor} lineWidth={1} />
        {/* 상단 패드 작은 타원 */}
        <Line points={oval(mm(39), mm(13.5), mm(3), mm(2.5))} color={lineColor} lineWidth={1} />
        {/* 상단 패드 중심 원 */}
        <Line points={circle(mm(39), mm(13.5), mm(1.2))} color={lineColor} lineWidth={1} />

        {/* 하단 패드 외곽 둥근사각형 */}
        <Line points={roundRect(mm(30), mm(-17.5), mm(18), mm(8.5), mm(3))} color={lineColor} lineWidth={1} />
        {/* 하단 패드 큰 타원 */}
        <Line points={oval(mm(39), mm(-13.5), mm(5.5), mm(4))} color={lineColor} lineWidth={1} />
        {/* 하단 패드 작은 타원 */}
        <Line points={oval(mm(39), mm(-13.5), mm(3), mm(2.5))} color={lineColor} lineWidth={1} />
        {/* 하단 패드 중심 원 */}
        <Line points={circle(mm(39), mm(-13.5), mm(1.2))} color={lineColor} lineWidth={1} />

        {/* 오른쪽 끝 십자나사 */}
        <Line points={circle(mm(52), 0, mm(3.5))} color={lineColor} lineWidth={1} />
        <Line points={[[mm(52), mm(-3.5), 0], [mm(52), mm(3.5), 0]]} color={lineColor} lineWidth={1} />
        <Line points={[[mm(48.5), 0, 0], [mm(55.5), 0, 0]]} color={lineColor} lineWidth={1} />
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
