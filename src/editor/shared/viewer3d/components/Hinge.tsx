import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useSpace3DView } from '../context/useSpace3DView';
import { hingeSidePaths, parseSVGPath } from './HingeSideData';

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
  const sideGeometry = useMemo(() => {
    const segments = hingeSidePaths.map(pathData => parseSVGPath(pathData.d, pathData.matrix));
    const allPoints = segments.flat();
    const getSegmentCenter = (segmentIndex: number) => {
      const points = segments[segmentIndex] || [];
      if (points.length === 0) return null;
      const xs = points.map(point => point[0]);
      const ys = points.map(point => point[1]);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    };
    if (allPoints.length === 0) {
      return {
        segments,
        centerX: 0,
        centerY: 0,
        height: 1,
        boreAnchorX: 0,
        frontBoreY: 0,
        rearBoreY: 1,
      };
    }

    const xs = allPoints.map(point => point[0]);
    const ys = allPoints.map(point => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const frontBore = getSegmentCenter(17);
    const rearBore = getSegmentCenter(30);
    const fallbackCenterX = (minX + maxX) / 2;
    const fallbackCenterY = (minY + maxY) / 2;

    return {
      segments,
      centerX: fallbackCenterX,
      centerY: fallbackCenterY,
      height: Math.max(1, maxY - minY),
      boreAnchorX: frontBore?.x ?? fallbackCenterX,
      frontBoreY: frontBore?.y ?? fallbackCenterY,
      rearBoreY: rearBore?.y ?? (fallbackCenterY + 1),
    };
  }, []);

  // Only render in 2D view
  if (viewMode !== '2D') {
    return null;
  }

  // 측면뷰 렌더링 - 직접 SVG 경로 파싱
  if ((view2DDirection === 'left' || view2DDirection === 'right') && viewDirection === 'side') {
    const [, y, z] = position;
    const sidePosition: [number, number, number] = [z, y, 0];
    const bracketBoreSpacingMm = 32;
    const bracketBoreSpacing = mmToThreeUnits(bracketBoreSpacingMm);
    const sourceBoreSpacing = Math.max(1, Math.abs(sideGeometry.rearBoreY - sideGeometry.frontBoreY));
    const scale = bracketBoreSpacing / sourceBoreSpacing;
    const sideMultiplier = view2DDirection === 'right' ? -1 : 1;

    return (
      <group name="door-hinge" position={sidePosition}>
        <group name="door-hinge-side">
          {sideGeometry.segments.map((points, index) => {
            if (points.length < 2) return null;
            const centeredPoints = points.map(([x, pointY]) => ([
              (sideGeometry.frontBoreY - pointY) * scale,
              -((x - sideGeometry.boreAnchorX) * scale * sideMultiplier),
              0,
            ] as [number, number, number]));
            return (
              <Line
                key={index}
                name="door-hinge"
                points={centeredPoints}
                color={lineColor}
                lineWidth={2}
                renderOrder={200000}
                depthTest={false}
                depthWrite={false}
                transparent={true}
              />
            );
          })}
        </group>
      </group>
    );
  }

  // 정면뷰 렌더링 (기본값)
  if (viewDirection === 'front') {
    return (
      <group name="door-hinge" position={position}>
        {/* 메인 경첩 원 (17.5mm 반지름) - 측판에서 24mm 안쪽 */}
        <Line name="door-hinge" points={mainCirclePoints} color={lineColor} lineWidth={1} />

        {/* 위쪽 작은 원 (4mm 반지름) - 측판에서 33.5mm 안쪽, 메인 원 중심에서 위로 22.5mm */}
        <group name="door-hinge-screw" position={[smallCircleX, smallCircleSpacing, 0]}>
          <Line name="door-hinge" points={smallCirclePoints} color={lineColor} lineWidth={1} />
        </group>

        {/* 아래쪽 작은 원 (4mm 반지름) - 측판에서 33.5mm 안쪽, 메인 원 중심에서 아래로 22.5mm */}
        <group name="door-hinge-screw" position={[smallCircleX, -smallCircleSpacing, 0]}>
          <Line name="door-hinge" points={smallCirclePoints} color={lineColor} lineWidth={1} />
        </group>
      </group>
    );
  }

  return null;
};
