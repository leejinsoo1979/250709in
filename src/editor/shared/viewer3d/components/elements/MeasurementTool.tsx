import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
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
  const [guideOffset, setGuideOffset] = useState<MeasurePoint>([0, 0, 0]);
  const [isAdjustingGuide, setIsAdjustingGuide] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);

  // 매 프레임 줌 레벨 체크
  useFrame(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      const zoom = camera.zoom || 1;
      if (zoom !== currentZoom) {
        setCurrentZoom(zoom);
      }
    }
  });

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

  // 십자가 크기 (화면 픽셀 크기로 고정하기 위해 줌의 역수 사용)
  const crosshairSize = useMemo(() => {
    // 화면상 약 20픽셀 정도 크기로 보이도록 조정
    const baseSize = 200; // 기준 값
    return baseSize / currentZoom;
  }, [currentZoom]);

  // 사각형 크기 (2mm = 0.2 three.js 단위, 줌 보정)
  const snapBoxSize = useMemo(() => {
    const baseSize = 20; // 2mm의 10배 스케일로 계산 (화면상 적당한 크기)
    const size = baseSize / currentZoom;
    console.log('📦 사각형 크기:', size, 'zoom:', currentZoom);
    return size;
  }, [currentZoom]);

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

    console.log(`🎯 레이캐스트 결과: view=${viewDirection} point=[${rawPoint[0].toFixed(2)}, ${rawPoint[1].toFixed(2)}, ${rawPoint[2].toFixed(2)}]`);

    // 가이드 조정 모드인 경우
    if (isAdjustingGuide && measurePoints && measurePoints[0] && measurePoints[1]) {
      // 뷰 방향에 따라 마우스 위치를 뷰 평면에 강제
      const normalizedMousePos: MeasurePoint = viewDirection === 'front'
        ? [rawPoint[0], rawPoint[1], 0]  // 정면: Z=0 강제
        : viewDirection === 'top'
        ? [rawPoint[0], 0, rawPoint[2]]  // 상단: Y=0 강제
        : viewDirection === 'left'
        ? [0, rawPoint[1], rawPoint[2]]  // 좌측: X=0 강제
        : viewDirection === 'right'
        ? [0, rawPoint[1], rawPoint[2]]  // 우측: X=0 강제
        : rawPoint;

      const offset = calculateGuideOffset(measurePoints[0], measurePoints[1], normalizedMousePos, viewDirection);
      console.log('🔧 가이드 오프셋 조정:', {
        start: `[${measurePoints[0][0].toFixed(2)}, ${measurePoints[0][1].toFixed(2)}, ${measurePoints[0][2].toFixed(2)}]`,
        end: `[${measurePoints[1][0].toFixed(2)}, ${measurePoints[1][1].toFixed(2)}, ${measurePoints[1][2].toFixed(2)}]`,
        mousePos: `[${rawPoint[0].toFixed(2)}, ${rawPoint[1].toFixed(2)}, ${rawPoint[2].toFixed(2)}]`,
        normalizedMousePos: `[${normalizedMousePos[0].toFixed(2)}, ${normalizedMousePos[1].toFixed(2)}, ${normalizedMousePos[2].toFixed(2)}]`,
        offset: `[${offset[0].toFixed(2)}, ${offset[1].toFixed(2)}, ${offset[2].toFixed(2)}]`,
        viewDirection
      });
      setGuideOffset(offset);
      return;
    }

    // 스냅 기능: Shift 키를 눌렀을 때만 가장 가까운 꼭지점 찾기
    if (event.shiftKey) {
      const snapDistance = getSnapDistance();
      const totalVertices = sceneVerticesRef.current.length;
      const zoom = camera instanceof THREE.OrthographicCamera ? camera.zoom : 1;

      console.log(`🔍 스냅 시도 (Shift): point[${rawPoint[0].toFixed(2)}, ${rawPoint[1].toFixed(2)}, ${rawPoint[2].toFixed(2)}] snapDist=${snapDistance.toFixed(3)} vertices=${totalVertices} view=${viewDirection} zoom=${zoom.toFixed(1)}`);

      const nearestSnap = findNearestVertex(rawPoint, sceneVerticesRef.current, viewDirection, snapDistance);

      if (nearestSnap) {
        console.log(`✅ 스냅 성공! vertex[${nearestSnap.vertex[0].toFixed(2)}, ${nearestSnap.vertex[1].toFixed(2)}, ${nearestSnap.vertex[2].toFixed(2)}] distance=${nearestSnap.distance.toFixed(3)}`);
        setHoverPoint(nearestSnap.vertex);
        setIsSnapped(true);
      } else {
        console.log(`❌ 스냅 실패: snapDist=${snapDistance.toFixed(3)} vertices=${totalVertices}`);
        setHoverPoint(rawPoint);
        setIsSnapped(false);
      }
    } else {
      // Shift 키 없으면 스냅 안 함 - 클릭한 위치 그대로 사용
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

        // 실제 측정 거리 계산 (원래 start-end 사이의 거리, viewDirection 고려)
        const distance = calculateDistance(start, end, viewDirection);

        console.log('📏 측정 라인 추가:', {
          start: `[${start[0].toFixed(2)}, ${start[1].toFixed(2)}, ${start[2].toFixed(2)}]`,
          end: `[${end[0].toFixed(2)}, ${end[1].toFixed(2)}, ${end[2].toFixed(2)}]`,
          distance,
          offset: `[${guideOffset[0].toFixed(2)}, ${guideOffset[1].toFixed(2)}, ${guideOffset[2].toFixed(2)}]`,
          viewDirection
        });

        // 측정 라인 추가
        addMeasureLine({
          id: `measure-${Date.now()}`,
          start,
          end,
          distance,
          offset: guideOffset
        });

        // 리셋 - 측정 포인트와 오프셋 초기화
        clearMeasurePoints();
        setGuideOffset([0, 0, 0]);
      }
      return;
    }

    // 첫 번째 클릭: 시작점 저장
    if (!measurePoints) {
      console.log('📍 시작점 설정:', hoverPoint);
      // 뷰 방향에 따라 좌표 정규화 (뷰 평면에 강제)
      const normalizedPoint: MeasurePoint = viewDirection === 'front'
        ? [hoverPoint[0], hoverPoint[1], 0]  // 정면: Z=0 강제
        : viewDirection === 'top'
        ? [hoverPoint[0], 0, hoverPoint[2]]  // 상단: Y=0 강제
        : viewDirection === 'left'
        ? [0, hoverPoint[1], hoverPoint[2]]  // 좌측: X=0 강제
        : viewDirection === 'right'
        ? [0, hoverPoint[1], hoverPoint[2]]  // 우측: X=0 강제
        : hoverPoint;
      console.log('📍 정규화된 시작점:', normalizedPoint);
      setMeasureStartPoint(normalizedPoint);
      return;
    }

    // 두 번째 클릭: 끝점 저장하고 가이드 조정 모드 진입
    if (measurePoints[1] === null) {
      console.log('📍 끝점 설정:', hoverPoint);
      // 뷰 방향에 따라 좌표 정규화 (뷰 평면에 강제)
      const normalizedPoint: MeasurePoint = viewDirection === 'front'
        ? [hoverPoint[0], hoverPoint[1], 0]  // 정면: Z=0 강제
        : viewDirection === 'top'
        ? [hoverPoint[0], 0, hoverPoint[2]]  // 상단: Y=0 강제
        : viewDirection === 'left'
        ? [0, hoverPoint[1], hoverPoint[2]]  // 좌측: X=0 강제
        : viewDirection === 'right'
        ? [0, hoverPoint[1], hoverPoint[2]]  // 우측: X=0 강제
        : hoverPoint;
      console.log('📍 정규화된 끝점:', normalizedPoint);
      setMeasureEndPoint(normalizedPoint);
      setIsAdjustingGuide(true);
      // 가이드 오프셋은 마우스 이동 시 업데이트됨 - 초기값은 끝점과 동일
      // 사용자가 마우스를 움직여서 원하는 위치로 조정 후 클릭
      setGuideOffset(normalizedPoint);
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
        setGuideOffset([0, 0, 0]);
      }

      // Ctrl+Z: 마지막 측정 라인 삭제
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault(); // 브라우저 기본 동작 방지
        event.stopPropagation(); // 이벤트 전파 중단
        event.stopImmediatePropagation(); // 같은 레벨의 다른 리스너도 중단
        if (measureLines.length > 0) {
          const lastLine = measureLines[measureLines.length - 1];
          console.log('🔙 Ctrl+Z: 마지막 측정 라인 삭제', lastLine.id);
          useUIStore.getState().removeMeasureLine(lastLine.id);
        }
        return false; // 완전 차단
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
  const snapColor = '#FFFF00'; // 노란색 (스냅됨)
  const pointSize = getPointSize(); // 동적 점 크기

  return (
    <group>
      {/* 저장된 측정 라인들 */}
      {measureLines.map((line) => {
        // offset이 없으면 시작점 좌표를 기본값으로 사용
        const dx = Math.abs(line.end[0] - line.start[0]);
        const dy = Math.abs(line.end[1] - line.start[1]);
        const dz = Math.abs(line.end[2] - line.start[2]);

        // Legacy offset data conversion (number → MeasurePoint)
        const offset: MeasurePoint = (() => {
          const savedOffset = (line as any).offset;

          // Check if offset is valid MeasurePoint (array of 3 numbers)
          if (Array.isArray(savedOffset) && savedOffset.length === 3) {
            return savedOffset as MeasurePoint;
          }

          // Legacy number type or invalid data - use end point as default
          // This places the guide at the measurement endpoint
          return line.end;
        })();
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

            {/* 가이드 시작점 엔드포인트 (슬래시) */}
            <Line
              points={[
                [guidePoints.start[0] - snapBoxSize/2, guidePoints.start[1] - snapBoxSize/2, guidePoints.start[2]],
                [guidePoints.start[0] + snapBoxSize/2, guidePoints.start[1] + snapBoxSize/2, guidePoints.start[2]]
              ]}
              color={lineColor}
              lineWidth={2}
            />

            {/* 가이드 끝점 엔드포인트 (슬래시) */}
            <Line
              points={[
                [guidePoints.end[0] - snapBoxSize/2, guidePoints.end[1] - snapBoxSize/2, guidePoints.end[2]],
                [guidePoints.end[0] + snapBoxSize/2, guidePoints.end[1] + snapBoxSize/2, guidePoints.end[2]]
              ]}
              color={lineColor}
              lineWidth={2}
            />

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

          {/* 시작점 마커 (슬래시) */}
          <Line
            points={[
              [measurePoints[0][0] - snapBoxSize/2, measurePoints[0][1] - snapBoxSize/2, measurePoints[0][2]],
              [measurePoints[0][0] + snapBoxSize/2, measurePoints[0][1] + snapBoxSize/2, measurePoints[0][2]]
            ]}
            color={lineColor}
            lineWidth={2}
          />

          {/* 호버점 마커 - 스냅되면 노란 네모만 표시 */}
          {isSnapped && (() => {
            console.log(`🎯 측정 중 마커: [${hoverPoint[0].toFixed(2)}, ${hoverPoint[1].toFixed(2)}, ${hoverPoint[2].toFixed(2)}] snapped=${isSnapped}`);

            return (
              <Line
                points={[
                  [hoverPoint[0] - snapBoxSize/2, hoverPoint[1] - snapBoxSize/2, hoverPoint[2]],
                  [hoverPoint[0] + snapBoxSize/2, hoverPoint[1] - snapBoxSize/2, hoverPoint[2]],
                  [hoverPoint[0] + snapBoxSize/2, hoverPoint[1] + snapBoxSize/2, hoverPoint[2]],
                  [hoverPoint[0] - snapBoxSize/2, hoverPoint[1] + snapBoxSize/2, hoverPoint[2]],
                  [hoverPoint[0] - snapBoxSize/2, hoverPoint[1] - snapBoxSize/2, hoverPoint[2]]
                ]}
                color={snapColor}
                lineWidth={3}
              />
            );
          })()}

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

                {/* 가이드 시작점 엔드포인트 (슬래시) */}
                <Line
                  points={[
                    [guidePoints.start[0] - snapBoxSize/2, guidePoints.start[1] - snapBoxSize/2, guidePoints.start[2]],
                    [guidePoints.start[0] + snapBoxSize/2, guidePoints.start[1] + snapBoxSize/2, guidePoints.start[2]]
                  ]}
                  color={snapColor}
                  lineWidth={2}
                />

                {/* 가이드 끝점 엔드포인트 (슬래시) */}
                <Line
                  points={[
                    [guidePoints.end[0] - snapBoxSize/2, guidePoints.end[1] - snapBoxSize/2, guidePoints.end[2]],
                    [guidePoints.end[0] + snapBoxSize/2, guidePoints.end[1] + snapBoxSize/2, guidePoints.end[2]]
                  ]}
                  color={snapColor}
                  lineWidth={2}
                />

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

      {/* 호버 커서 (측정 시작 전) - 스냅되면 노란 네모만 표시 */}
      {!measurePoints && hoverPoint && isSnapped && (() => {
        console.log(`🖱️ 호버 커서: [${hoverPoint[0].toFixed(2)}, ${hoverPoint[1].toFixed(2)}, ${hoverPoint[2].toFixed(2)}] snapped=${isSnapped} boxSize=${snapBoxSize.toFixed(4)}`);

        return (
          <Line
            points={[
              [hoverPoint[0] - snapBoxSize/2, hoverPoint[1] - snapBoxSize/2, hoverPoint[2]],
              [hoverPoint[0] + snapBoxSize/2, hoverPoint[1] - snapBoxSize/2, hoverPoint[2]],
              [hoverPoint[0] + snapBoxSize/2, hoverPoint[1] + snapBoxSize/2, hoverPoint[2]],
              [hoverPoint[0] - snapBoxSize/2, hoverPoint[1] + snapBoxSize/2, hoverPoint[2]],
              [hoverPoint[0] - snapBoxSize/2, hoverPoint[1] - snapBoxSize/2, hoverPoint[2]]
            ]}
            color={snapColor}
            lineWidth={3}
          />
        );
      })()}
    </group>
  );
};
