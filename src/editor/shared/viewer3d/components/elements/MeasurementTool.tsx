import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { useUIStore, MeasurePoint } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
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
    clearMeasurePoints,
    view2DDirection,
    setMeasureMode
  } = useUIStore();

  const { scene, camera, raycaster, gl } = useThree();
  const spaceInfo = useDerivedSpaceStore((state) => state.spaceInfo);

  const [hoverPoint, setHoverPoint] = useState<MeasurePoint | null>(null);
  const [isSnapped, setIsSnapped] = useState(false);
  const [guideOffset, setGuideOffset] = useState<number>(0);
  const [isAdjustingGuide, setIsAdjustingGuide] = useState(false);

  // 카메라 줌 레벨에 따른 점 크기 계산
  const getPointSize = useCallback(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      // 직교 카메라: zoom 값이 클수록 확대됨
      // 2D뷰에서는 고정 크기 사용 (화면 크기 기준)
      const baseSize = 0.5; // 큰 기본 크기
      const zoom = camera.zoom || 1;
      return baseSize / Math.sqrt(zoom); // 제곱근으로 완만하게 조정
    }
    return 0.5; // 기본 크기
  }, [camera]);

  // 카메라 줌 레벨에 따른 스냅 거리 계산
  const getSnapDistance = useCallback(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      const baseSnapDistance = SNAP_DISTANCE;
      const zoom = camera.zoom || 1;
      return baseSnapDistance / zoom; // 줌이 커질수록 스냅 거리 작아짐
    }
    return SNAP_DISTANCE;
  }, [camera]);

  // 시점에 따른 텍스트 오프셋 계산
  const getTextOffset = (point: MeasurePoint, offset: number = 0.2): MeasurePoint => {
    switch (viewDirection) {
      case 'front':
        // 정면: Y축 위로 오프셋
        return [point[0], point[1] + offset, point[2]];
      case 'left':
      case 'right':
        // 측면: Z축 앞으로 오프셋
        return [point[0], point[1] + offset, point[2]];
      case 'top':
        // 상단: Z축 앞으로 오프셋
        return [point[0], point[1], point[2] - offset];
      default:
        return [point[0], point[1] + offset, point[2]];
    }
  };

  // 씬의 모든 꼭지점 추출 (캐싱)
  const sceneVertices = useMemo(() => {
    if (!isMeasureMode) return [];
    console.log(`📐 씬 꼭지점 추출 중... (viewDirection: ${viewDirection})`);
    const vertices = extractVertices(scene);
    console.log(`📐 총 ${vertices.length}개 꼭지점 발견`);
    return vertices;
  }, [scene, isMeasureMode, viewDirection]);

  // sceneVertices를 ref로 관리하여 최신 값 유지
  const sceneVerticesRef = useRef(sceneVertices);
  useEffect(() => {
    sceneVerticesRef.current = sceneVertices;
  }, [sceneVertices]);

  // 마우스 이동 핸들러
  const handlePointerMove = useCallback((event: PointerEvent) => {
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
        // 정면: Z=0 평면 (XY 평면) - 정면 벽
        plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        break;
      case 'left':
        // 좌측: X=0 평면 (YZ 평면) - 왼쪽 벽
        plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        break;
      case 'right':
        // 우측: X=0 평면 (YZ 평면) - 오른쪽에서 보는 것도 같은 평면
        plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        break;
      case 'top':
        // 상단: Y=0 평면 (XZ 평면) - 바닥
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
      const offset = calculateGuideOffset(measurePoints[0], measurePoints[1], rawPoint, viewDirection);
      console.log('🔧 가이드 오프셋 조정:', {
        start: measurePoints[0],
        end: measurePoints[1],
        mousePos: rawPoint,
        offset,
        viewDirection
      });
      setGuideOffset(offset);
      return;
    }

    // 스냅 기능: 가장 가까운 꼭지점 찾기 (시점별 2D 거리 계산, 줌 레벨 반영)
    const snapDistance = getSnapDistance();
    const nearestSnap = findNearestVertex(rawPoint, sceneVerticesRef.current, viewDirection, snapDistance);

    if (nearestSnap) {
      console.log('✅ 스냅됨:', {
        distance: nearestSnap.distance.toFixed(3),
        snapDistance: snapDistance.toFixed(3),
        zoom: camera instanceof THREE.OrthographicCamera ? camera.zoom : 'N/A',
        vertex: nearestSnap.vertex.map(v => v.toFixed(2))
      });
      setHoverPoint(nearestSnap.vertex);
      setIsSnapped(true);
    } else {
      console.log('❌ 스냅 안됨:', {
        snapDistance: snapDistance.toFixed(3),
        zoom: camera instanceof THREE.OrthographicCamera ? camera.zoom : 'N/A',
        nearestVertices: sceneVerticesRef.current.length
      });
      setHoverPoint(rawPoint);
      setIsSnapped(false);
    }
  }, [isMeasureMode, gl, raycaster, camera, viewDirection, isAdjustingGuide, measurePoints, getSnapDistance]);

  // 클릭 핸들러
  const handleClick = useCallback((event: PointerEvent) => {
    if (!isMeasureMode || !hoverPoint) return;

    // 가이드 조정 모드인 경우
    if (isAdjustingGuide) {
      // 가이드 위치 확정
      setIsAdjustingGuide(false);

      if (measurePoints && measurePoints[0] && measurePoints[1]) {
        const start = measurePoints[0];
        const end = measurePoints[1];

        // 가이드 포인트 계산
        const guidePoints = calculateGuidePoints(start, end, guideOffset, viewDirection);

        // 가이드 라인의 실제 거리 계산
        const dx = Math.abs(guidePoints.end[0] - guidePoints.start[0]);
        const dy = Math.abs(guidePoints.end[1] - guidePoints.start[1]);
        const dz = Math.abs(guidePoints.end[2] - guidePoints.start[2]);
        const guideDistance = Math.sqrt(dx * dx + dy * dy + dz * dz) * 100; // mm 단위

        console.log('📏 측정 라인 추가:', {
          start,
          end,
          guidePoints,
          distance: guideDistance,
          offset: guideOffset,
          viewDirection
        });

        // 측정 라인 추가
        addMeasureLine({
          id: `measure-${Date.now()}`,
          start,
          end,
          distance: guideDistance,
          offset: guideOffset
        });

        // 리셋 - 측정 포인트와 오프셋 초기화
        clearMeasurePoints();
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
  }, [isMeasureMode, hoverPoint, isAdjustingGuide, measurePoints, setMeasureStartPoint, setMeasureEndPoint, addMeasureLine, clearMeasurePoints]);

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

  // 시점 변경 시 측정 모드 자동 종료
  useEffect(() => {
    if (isMeasureMode) {
      console.log('🔄 시점 변경 감지 - 측정 모드 종료');
      setMeasureMode(false);
      clearMeasurePoints();
    }
  }, [view2DDirection]);

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
  }, [isMeasureMode, handlePointerMove, handleClick, gl]);

  if (!isMeasureMode) return null;

  const lineColor = '#00FF00'; // 형광 초록색
  const snapColor = '#00FF00'; // 형광 초록색 (스냅됨)
  const pointSize = getPointSize(); // 동적 점 크기

  return (
    <group>
      {/* 저장된 측정 라인들 */}
      {measureLines.map((line) => {
        // offset이 없으면 시작점 좌표를 기본값으로 사용
        const dx = Math.abs(line.end[0] - line.start[0]);
        const dy = Math.abs(line.end[1] - line.start[1]);
        const dz = Math.abs(line.end[2] - line.start[2]);

        let defaultOffset: number;
        if (dx >= dy && dx >= dz) {
          defaultOffset = line.start[1]; // X축 주방향 -> Y좌표
        } else if (dy >= dx && dy >= dz) {
          defaultOffset = line.start[0]; // Y축 주방향 -> X좌표
        } else {
          defaultOffset = line.start[0]; // Z축 주방향 -> X좌표
        }

        const offset = (line as any).offset ?? defaultOffset;
        const guidePoints = calculateGuidePoints(line.start, line.end, offset, viewDirection);
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

            {/* 가이드 시작점 엔드포인트 (점) */}
            <mesh position={guidePoints.start}>
              <sphereGeometry args={[pointSize, 16, 16]} />
              <meshBasicMaterial color={lineColor} />
            </mesh>

            {/* 가이드 끝점 엔드포인트 (점) */}
            <mesh position={guidePoints.end}>
              <sphereGeometry args={[pointSize, 16, 16]} />
              <meshBasicMaterial color={lineColor} />
            </mesh>

            {/* 거리 텍스트 */}
            <Text
              position={getTextOffset(midPoint, 0.2)}
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
            <sphereGeometry args={[pointSize, 16, 16]} />
            <meshBasicMaterial color={snapColor} />
          </mesh>

          {/* 호버점 마커 */}
          <mesh position={hoverPoint}>
            <sphereGeometry args={[pointSize, 16, 16]} />
            <meshBasicMaterial color={isSnapped ? snapColor : lineColor} opacity={0.7} transparent />
          </mesh>

          {/* 임시 거리 텍스트 */}
          {(() => {
            const distance = calculateDistance(measurePoints[0], hoverPoint, viewDirection);
            const midPoint: MeasurePoint = [
              (measurePoints[0][0] + hoverPoint[0]) / 2,
              (measurePoints[0][1] + hoverPoint[1]) / 2,
              (measurePoints[0][2] + hoverPoint[2]) / 2
            ];

            return (
              <Text
                position={getTextOffset(midPoint, 0.2)}
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
            const guidePoints = calculateGuidePoints(start, end, guideOffset, viewDirection);
            const midPoint: MeasurePoint = [
              (guidePoints.start[0] + guidePoints.end[0]) / 2,
              (guidePoints.start[1] + guidePoints.end[1]) / 2,
              (guidePoints.start[2] + guidePoints.end[2]) / 2
            ];
            const distance = calculateDistance(start, end, viewDirection);

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

                {/* 가이드 시작점 엔드포인트 (점) */}
                <mesh position={guidePoints.start}>
                  <sphereGeometry args={[pointSize, 16, 16]} />
                  <meshBasicMaterial color={snapColor} />
                </mesh>

                {/* 가이드 끝점 엔드포인트 (점) */}
                <mesh position={guidePoints.end}>
                  <sphereGeometry args={[pointSize, 16, 16]} />
                  <meshBasicMaterial color={snapColor} />
                </mesh>

                {/* 거리 텍스트 */}
                <Text
                  position={getTextOffset(midPoint, 0.2)}
                  fontSize={0.25}
                  color={snapColor}
                  anchorX="center"
                  anchorY="middle"
                >
                  {`${Math.round(distance)}mm`}
                </Text>

                {/* 안내 텍스트 */}
                <Text
                  position={getTextOffset(midPoint, -0.4)}
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
          <sphereGeometry args={[pointSize, 16, 16]} />
          <meshBasicMaterial color={isSnapped ? snapColor : lineColor} opacity={0.5} transparent />
        </mesh>
      )}
    </group>
  );
};
