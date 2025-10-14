import React, { useEffect, useState, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { useUIStore, MeasurePoint } from '@/store/uiStore';
import * as THREE from 'three';
import {
  extractVertices,
  findNearestVertex,
  calculateDistance,
  calculateGuideOffset,
  calculateGuidePoints,
  SNAP_DISTANCE
} from '../../utils/snapUtils';

interface MeasurementToolProps {
  viewDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
}

/**
 * CAD 스타일 측정 도구 컴포넌트
 * - 객체 모서리에 자동 스냅
 * - 스냅 시 십자가 색상 변경
 * - 가이드선 위치 조정 가능
 */
export const MeasurementTool: React.FC<MeasurementToolProps> = ({ viewDirection = 'front' }) => {
  const {
    isMeasureMode,
    measurePoints,
    measureLines,
    setMeasureStartPoint,
    setMeasureEndPoint,
    addMeasureLine,
    clearMeasurePoints
  } = useUIStore();

  const { scene, camera, raycaster, gl } = useThree();

  const [hoverPoint, setHoverPoint] = useState<MeasurePoint | null>(null);
  const [isSnapped, setIsSnapped] = useState(false);
  const [guideOffset, setGuideOffset] = useState<number>(0);
  const [isAdjustingGuide, setIsAdjustingGuide] = useState(false);

  // 씬의 모든 꼭지점 추출 (캐싱)
  const sceneVertices = useMemo(() => {
    if (!isMeasureMode) return [];
    console.log('📐 씬 꼭지점 추출 중...');
    const vertices = extractVertices(scene);
    console.log(`📐 총 ${vertices.length}개 꼭지점 발견`);
    return vertices;
  }, [scene, isMeasureMode]);

  // 마우스 이동 핸들러
  const handlePointerMove = (event: PointerEvent) => {
    if (!isMeasureMode) return;

    // 마우스 위치를 NDC로 변환
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 시점에 따라 다른 평면 사용
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    let plane: THREE.Plane;

    switch (viewDirection) {
      case 'front':
        // 정면: Z=0 평면 (XY 평면)
        plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        break;
      case 'left':
        // 좌측: X=0 평면 (YZ 평면)
        plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        break;
      case 'right':
        // 우측: X=0 평면 (YZ 평면)
        plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
        break;
      case 'top':
        // 상단: Y=중간높이 평면 (XZ 평면)
        plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        break;
      default:
        plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    }

    const intersection = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, intersection);

    if (!hit) return;

    const rawPoint: MeasurePoint = [intersection.x, intersection.y, intersection.z];

    // 가이드 조정 모드인 경우
    if (isAdjustingGuide && measurePoints && measurePoints[0] && measurePoints[1]) {
      const offset = calculateGuideOffset(measurePoints[0], measurePoints[1], rawPoint);
      setGuideOffset(offset);
      return;
    }

    // 스냅 기능: 가장 가까운 꼭지점 찾기
    const nearestSnap = findNearestVertex(rawPoint, sceneVertices);

    if (nearestSnap) {
      setHoverPoint(nearestSnap.vertex);
      setIsSnapped(true);
      console.log('✅ 스냅됨:', nearestSnap.vertex, '거리:', nearestSnap.distance.toFixed(3));
    } else {
      setHoverPoint(rawPoint);
      setIsSnapped(false);
    }
  };

  // 클릭 핸들러
  const handleClick = (event: PointerEvent) => {
    if (!isMeasureMode || !hoverPoint) return;

    // 가이드 조정 모드인 경우
    if (isAdjustingGuide) {
      // 가이드 위치 확정
      setIsAdjustingGuide(false);

      if (measurePoints && measurePoints[0] && measurePoints[1]) {
        const start = measurePoints[0];
        const end = measurePoints[1];
        const distance = calculateDistance(start, end);

        // 측정 라인 추가
        addMeasureLine({
          id: `measure-${Date.now()}`,
          start,
          end,
          distance,
          offset: guideOffset
        });

        // 리셋
        setGuideOffset(0);
      }
      return;
    }

    // 첫 번째 클릭: 시작점 저장
    if (!measurePoints) {
      console.log('📍 시작점 설정:', hoverPoint);
      setMeasureStartPoint(hoverPoint);
      return;
    }

    // 두 번째 클릭: 끝점 저장하고 가이드 조정 모드 진입
    if (measurePoints[1] === null) {
      console.log('📍 끝점 설정:', hoverPoint);
      setMeasureEndPoint(hoverPoint);
      setIsAdjustingGuide(true);
      setGuideOffset(0);
    }
  };

  // ESC 키로 취소, Ctrl+Z로 마지막 측정 라인 삭제
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isMeasureMode) return;

      // ESC: 현재 측정 취소
      if (event.key === 'Escape') {
        console.log('❌ ESC: 측정 취소');
        clearMeasurePoints();
        setIsAdjustingGuide(false);
        setGuideOffset(0);
      }

      // Ctrl+Z: 마지막 측정 라인 삭제
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault(); // 브라우저 기본 동작 방지
        event.stopPropagation(); // 이벤트 전파 중단 (OrbitControls 등 다른 핸들러 방지)
        if (measureLines.length > 0) {
          const lastLine = measureLines[measureLines.length - 1];
          console.log('🔙 Ctrl+Z: 마지막 측정 라인 삭제', lastLine.id);
          useUIStore.getState().removeMeasureLine(lastLine.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // capture phase에서 먼저 처리
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isMeasureMode, clearMeasurePoints, measureLines]);

  // 이벤트 리스너 등록
  useEffect(() => {
    if (!isMeasureMode) {
      setHoverPoint(null);
      setIsSnapped(false);
      return;
    }

    const canvas = gl.domElement;
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [isMeasureMode, measurePoints, hoverPoint, isAdjustingGuide, guideOffset, sceneVertices]);

  if (!isMeasureMode) return null;

  const lineColor = '#FF6600'; // 주황색
  const snapColor = '#00FF00'; // 초록색 (스냅됨)

  return (
    <group>
      {/* 저장된 측정 라인들 */}
      {measureLines.map((line) => {
        const offset = (line as any).offset || 0;
        const guidePoints = calculateGuidePoints(line.start, line.end, offset);
        const midPoint: MeasurePoint = [
          (guidePoints.start[0] + guidePoints.end[0]) / 2,
          (guidePoints.start[1] + guidePoints.end[1]) / 2,
          (guidePoints.start[2] + guidePoints.end[2]) / 2
        ];

        return (
          <group key={line.id}>
            {/* 수직/수평 연장선 (점선) - 시작점 */}
            <Line
              points={[line.start, guidePoints.start]}
              color={lineColor}
              lineWidth={1}
              dashed
              dashSize={0.1}
              gapSize={0.05}
            />

            {/* 수직/수평 연장선 (점선) - 끝점 */}
            <Line
              points={[line.end, guidePoints.end]}
              color={lineColor}
              lineWidth={1}
              dashed
              dashSize={0.1}
              gapSize={0.05}
            />

            {/* 측정 라인 */}
            <Line
              points={[guidePoints.start, guidePoints.end]}
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

            {/* 화살표 - 시작 */}
            <mesh position={guidePoints.start} rotation={[0, 0, Math.atan2(guidePoints.end[1] - guidePoints.start[1], guidePoints.end[0] - guidePoints.start[0])]}>
              <coneGeometry args={[0.08, 0.15, 8]} />
              <meshBasicMaterial color={lineColor} />
            </mesh>

            {/* 화살표 - 끝 */}
            <mesh position={guidePoints.end} rotation={[0, 0, Math.atan2(guidePoints.start[1] - guidePoints.end[1], guidePoints.start[0] - guidePoints.end[0]) + Math.PI]}>
              <coneGeometry args={[0.08, 0.15, 8]} />
              <meshBasicMaterial color={lineColor} />
            </mesh>

            {/* 거리 텍스트 */}
            <Text
              position={[midPoint[0], midPoint[1] + 0.2, midPoint[2]]}
              fontSize={0.25}
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
      {measurePoints && measurePoints[0] && hoverPoint && !isAdjustingGuide && (
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
            <meshBasicMaterial color={snapColor} />
          </mesh>

          {/* 호버점 마커 */}
          <mesh position={hoverPoint}>
            <circleGeometry args={[0.05, 16]} />
            <meshBasicMaterial color={isSnapped ? snapColor : lineColor} opacity={0.7} transparent />
          </mesh>

          {/* 임시 거리 텍스트 */}
          {(() => {
            const distance = calculateDistance(measurePoints[0], hoverPoint);
            const midPoint: MeasurePoint = [
              (measurePoints[0][0] + hoverPoint[0]) / 2,
              (measurePoints[0][1] + hoverPoint[1]) / 2,
              (measurePoints[0][2] + hoverPoint[2]) / 2
            ];

            return (
              <Text
                position={[midPoint[0], midPoint[1] + 0.2, midPoint[2]]}
                fontSize={0.25}
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

      {/* 가이드 조정 모드 */}
      {isAdjustingGuide && measurePoints && measurePoints[0] && measurePoints[1] && (
        <group>
          {(() => {
            const start = measurePoints[0];
            const end = measurePoints[1];
            const guidePoints = calculateGuidePoints(start, end, guideOffset);
            const midPoint: MeasurePoint = [
              (guidePoints.start[0] + guidePoints.end[0]) / 2,
              (guidePoints.start[1] + guidePoints.end[1]) / 2,
              (guidePoints.start[2] + guidePoints.end[2]) / 2
            ];
            const distance = calculateDistance(start, end);

            return (
              <>
                {/* 수직/수평 연장선 (점선) - 시작점 */}
                <Line
                  points={[start, guidePoints.start]}
                  color={snapColor}
                  lineWidth={1}
                  dashed
                  dashSize={0.1}
                  gapSize={0.05}
                />

                {/* 수직/수평 연장선 (점선) - 끝점 */}
                <Line
                  points={[end, guidePoints.end]}
                  color={snapColor}
                  lineWidth={1}
                  dashed
                  dashSize={0.1}
                  gapSize={0.05}
                />

                {/* 측정 라인 */}
                <Line
                  points={[guidePoints.start, guidePoints.end]}
                  color={snapColor}
                  lineWidth={2}
                />

                {/* 시작점 마커 */}
                <mesh position={start}>
                  <circleGeometry args={[0.05, 16]} />
                  <meshBasicMaterial color={snapColor} />
                </mesh>

                {/* 끝점 마커 */}
                <mesh position={end}>
                  <circleGeometry args={[0.05, 16]} />
                  <meshBasicMaterial color={snapColor} />
                </mesh>

                {/* 거리 텍스트 */}
                <Text
                  position={[midPoint[0], midPoint[1] + 0.2, midPoint[2]]}
                  fontSize={0.25}
                  color={snapColor}
                  anchorX="center"
                  anchorY="middle"
                >
                  {`${Math.round(distance)}mm`}
                </Text>

                {/* 안내 텍스트 */}
                <Text
                  position={[midPoint[0], midPoint[1] - 0.4, midPoint[2]]}
                  fontSize={0.15}
                  color={snapColor}
                  anchorX="center"
                  anchorY="middle"
                >
                  가이드 위치 조정 후 클릭
                </Text>
              </>
            );
          })()}
        </group>
      )}

      {/* 호버 커서 (측정 시작 전) */}
      {!measurePoints && hoverPoint && (
        <mesh position={hoverPoint}>
          <circleGeometry args={[0.05, 16]} />
          <meshBasicMaterial color={isSnapped ? snapColor : lineColor} opacity={0.5} transparent />
        </mesh>
      )}
    </group>
  );
};
