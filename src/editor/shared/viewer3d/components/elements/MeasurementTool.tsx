import React, { useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { useUIStore, MeasurePoint } from '@/store/uiStore';
import * as THREE from 'three';

/**
 * CAD 스타일 측정 도구 컴포넌트
 * 2D 뷰에서 클릭으로 거리를 측정
 */
export const MeasurementTool: React.FC = () => {
  const {
    isMeasureMode,
    measurePoints,
    measureLines,
    setMeasureStartPoint,
    setMeasureEndPoint,
    addMeasureLine,
    clearMeasurePoints
  } = useUIStore();

  const { camera, raycaster, gl } = useThree();
  const [hoverPoint, setHoverPoint] = useState<MeasurePoint | null>(null);

  // 마우스 이동 시 호버 포인트 업데이트
  const handlePointerMove = (event: PointerEvent) => {
    if (!isMeasureMode) return;

    // 마우스 위치를 normalized device coordinates로 변환
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycaster로 평면과의 교차점 찾기 (Z=0 평면)
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      setHoverPoint([intersection.x, intersection.y, 0]);
    }
  };

  // 클릭 시 측정점 저장
  const handleClick = (event: PointerEvent) => {
    if (!isMeasureMode || !hoverPoint) return;

    if (!measurePoints) {
      // 첫 번째 클릭: 시작점 저장
      setMeasureStartPoint(hoverPoint);
    } else if (measurePoints[1] === null) {
      // 두 번째 클릭: 끝점 저장하고 측정 라인 생성
      setMeasureEndPoint(hoverPoint);

      const start = measurePoints[0];
      const end = hoverPoint;

      // 거리 계산 (three.js 단위 -> mm)
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const distance = Math.sqrt(dx * dx + dy * dy) * 100; // three.js 단위를 mm로 변환 (1 unit = 10mm)

      // 측정 라인 추가
      addMeasureLine({
        id: `measure-${Date.now()}`,
        start,
        end,
        distance
      });
    }
  };

  // 이벤트 리스너 등록
  React.useEffect(() => {
    if (!isMeasureMode) {
      setHoverPoint(null);
      return;
    }

    const canvas = gl.domElement;
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [isMeasureMode, measurePoints, hoverPoint]);

  if (!isMeasureMode) return null;

  const lineColor = '#FF6600'; // 주황색

  return (
    <group>
      {/* 저장된 측정 라인들 */}
      {measureLines.map((line) => {
        const midPoint: MeasurePoint = [
          (line.start[0] + line.end[0]) / 2,
          (line.start[1] + line.end[1]) / 2,
          0
        ];

        return (
          <group key={line.id}>
            {/* 측정 라인 */}
            <Line
              points={[line.start, line.end]}
              color={lineColor}
              lineWidth={2}
            />

            {/* 시작점 마커 */}
            <mesh position={line.start}>
              <circleGeometry args={[0.05, 16]} />
              <meshBasicMaterial color={lineColor} />
            </mesh>

            {/* 끝점 마커 */}
            <mesh position={line.end}>
              <circleGeometry args={[0.05, 16]} />
              <meshBasicMaterial color={lineColor} />
            </mesh>

            {/* 거리 텍스트 */}
            <Text
              position={[midPoint[0], midPoint[1] + 0.2, 0]}
              fontSize={0.3}
              color={lineColor}
              anchorX="center"
              anchorY="middle"
            >
              {`${Math.round(line.distance)}mm`}
            </Text>
          </group>
        );
      })}

      {/* 임시 측정 라인 (첫 번째 클릭 후) */}
      {measurePoints && measurePoints[0] && hoverPoint && (
        <group>
          <Line
            points={[measurePoints[0], hoverPoint]}
            color={lineColor}
            lineWidth={2}
            opacity={0.7}
            transparent
          />

          {/* 시작점 마커 */}
          <mesh position={measurePoints[0]}>
            <circleGeometry args={[0.05, 16]} />
            <meshBasicMaterial color={lineColor} />
          </mesh>

          {/* 호버점 마커 */}
          <mesh position={hoverPoint}>
            <circleGeometry args={[0.05, 16]} />
            <meshBasicMaterial color={lineColor} opacity={0.7} transparent />
          </mesh>

          {/* 임시 거리 텍스트 */}
          {(() => {
            const start = measurePoints[0];
            const end = hoverPoint;
            const dx = end[0] - start[0];
            const dy = end[1] - start[1];
            const distance = Math.sqrt(dx * dx + dy * dy) * 100;
            const midPoint: MeasurePoint = [
              (start[0] + end[0]) / 2,
              (start[1] + end[1]) / 2,
              0
            ];

            return (
              <Text
                position={[midPoint[0], midPoint[1] + 0.2, 0]}
                fontSize={0.3}
                color={lineColor}
                anchorX="center"
                anchorY="middle"
                opacity={0.7}
              >
                {`${Math.round(distance)}mm`}
              </Text>
            );
          })()}
        </group>
      )}

      {/* 호버 커서 (측정 시작 전) */}
      {!measurePoints && hoverPoint && (
        <mesh position={hoverPoint}>
          <circleGeometry args={[0.05, 16]} />
          <meshBasicMaterial color={lineColor} opacity={0.5} transparent />
        </mesh>
      )}
    </group>
  );
};
