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

  // 측면뷰 렌더링 - 힌지 측면 도면 (정확한 형상)
  if ((view2DDirection === 'left' || view2DDirection === 'right') && viewDirection === 'side') {
    // 측면뷰 좌표 변환: 정면뷰의 Z를 측면뷰의 X로
    const [x, y, z] = position;
    const sidePosition: [number, number, number] = [z, y, 0];

    // 힌지 도면 치수 (비율 기준)
    const plateW = mmToThreeUnits(8);
    const plateH = mmToThreeUnits(35);
    const bodyW = mmToThreeUnits(50);
    const bodyH = mmToThreeUnits(13);
    const padW = mmToThreeUnits(15);
    const padH = mmToThreeUnits(12);
    const ovalW = mmToThreeUnits(8);
    const ovalH = mmToThreeUnits(10);
    const smallCircleR = mmToThreeUnits(3);
    const screwR = mmToThreeUnits(4);

    // 타원 생성 함수
    const generateOval = (cx: number, cy: number, rx: number, ry: number, segments: number = 24): [number, number, number][] => {
      const points: [number, number, number][] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const px = cx + Math.cos(angle) * rx;
        const py = cy + Math.sin(angle) * ry;
        points.push([px, py, 0]);
      }
      return points;
    };

    // 원 생성 함수
    const generateCircle = (cx: number, cy: number, r: number, segments: number = 16): [number, number, number][] => {
      return generateOval(cx, cy, r, r, segments);
    };

    // 십자 나사 생성
    const createCrossLines = (cx: number, cy: number, size: number): [number, number, number][][] => {
      const half = size / 2;
      return [
        [[cx, cy - half, 0], [cx, cy + half, 0]],
        [[cx - half, cy, 0], [cx + half, cy, 0]]
      ];
    };

    const padY = plateH * 0.3;
    const bodyX = plateW;
    const padX = bodyX + bodyW * 0.7;

    return (
      <group position={sidePosition}>
        {/* 왼쪽 측판 */}
        <Line points={[[0, plateH/2, 0], [plateW, plateH/2, 0], [plateW, -plateH/2, 0], [0, -plateH/2, 0], [0, plateH/2, 0]]} color={lineColor} lineWidth={1} />

        {/* 중앙 본체 (큰 직사각형) */}
        <Line points={[[bodyX, bodyH/2, 0], [bodyX + bodyW, bodyH/2, 0], [bodyX + bodyW, -bodyH/2, 0], [bodyX, -bodyH/2, 0], [bodyX, bodyH/2, 0]]} color={lineColor} lineWidth={1} />

        {/* 본체 내부 작은 직사각형 (나사구멍 - 왼쪽) */}
        <Line points={[[bodyX + bodyW*0.15, bodyH*0.25, 0], [bodyX + bodyW*0.25, bodyH*0.25, 0], [bodyX + bodyW*0.25, -bodyH*0.25, 0], [bodyX + bodyW*0.15, -bodyH*0.25, 0], [bodyX + bodyW*0.15, bodyH*0.25, 0]]} color={lineColor} lineWidth={0.5} />

        {/* 본체 내부 타원형 구멍 (중앙) */}
        <Line points={generateOval(bodyX + bodyW*0.45, 0, bodyW*0.08, bodyH*0.25)} color={lineColor} lineWidth={0.5} />

        {/* 상단 패드 (둥근 사각형) */}
        <Line points={[[padX - padW/2, padY + padH/2, 0], [padX + padW/2, padY + padH/2, 0], [padX + padW/2, padY - padH/2, 0], [padX - padW/2, padY - padH/2, 0], [padX - padW/2, padY + padH/2, 0]]} color={lineColor} lineWidth={1} />
        <Line points={generateOval(padX, padY, ovalW/2, ovalH/2)} color={lineColor} lineWidth={1} />
        <Line points={generateCircle(padX, padY, smallCircleR)} color={lineColor} lineWidth={0.5} />

        {/* 하단 패드 (둥근 사각형) */}
        <Line points={[[padX - padW/2, -padY + padH/2, 0], [padX + padW/2, -padY + padH/2, 0], [padX + padW/2, -padY - padH/2, 0], [padX - padW/2, -padY - padH/2, 0], [padX - padW/2, -padY + padH/2, 0]]} color={lineColor} lineWidth={1} />
        <Line points={generateOval(padX, -padY, ovalW/2, ovalH/2)} color={lineColor} lineWidth={1} />
        <Line points={generateCircle(padX, -padY, smallCircleR)} color={lineColor} lineWidth={0.5} />

        {/* 오른쪽 십자 나사들 */}
        <Line points={generateCircle(bodyX + bodyW*0.15, 0, screwR)} color={lineColor} lineWidth={0.5} />
        {createCrossLines(bodyX + bodyW*0.15, 0, screwR).map((line, i) => <Line key={`cross1-${i}`} points={line} color={lineColor} lineWidth={0.5} />)}

        <Line points={generateCircle(bodyX + bodyW*0.9, 0, screwR)} color={lineColor} lineWidth={0.5} />
        {createCrossLines(bodyX + bodyW*0.9, 0, screwR).map((line, i) => <Line key={`cross2-${i}`} points={line} color={lineColor} lineWidth={0.5} />)}
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
