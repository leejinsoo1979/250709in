import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { useUIStore, MeasurePoint } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useThemeColors } from '@/hooks/useThemeColors';
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
    setMeasureMode,
    isEraserMode,
    hoveredMeasureLineId,
    setHoveredMeasureLineId,
    removeMeasureLine
  } = useUIStore();

  const { scene, camera, raycaster, gl } = useThree();
  const spaceInfo = useDerivedSpaceStore((state) => state.spaceInfo);
  const { colors } = useThemeColors();

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

  // 고정 스냅 거리 사용
  const getSnapDistance = useCallback(() => {
    return SNAP_DISTANCE; // 3.0 = 300mm 고정
  }, []);

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

  // 시점과 측정 방향에 따른 텍스트 오프셋 계산 (선과 겹치지 않도록)
  const getTextOffset = (point: MeasurePoint, start: MeasurePoint, end: MeasurePoint, offset: number = 0.2): MeasurePoint => {
    const dx = Math.abs(end[0] - start[0]);
    const dy = Math.abs(end[1] - start[1]);
    const dz = Math.abs(end[2] - start[2]);

    switch (viewDirection) {
      case 'front':
        // 정면(XY 평면): 가로 측정이면 Y축 위, 세로 측정이면 X축 오른쪽
        if (dx > dy) {
          return [point[0], point[1] + offset, point[2]];
        } else {
          return [point[0] + offset, point[1], point[2]];
        }
      case 'top':
        // 상단(XZ 평면): 가로 측정이면 Z축 앞, 세로 측정이면 X축 오른쪽
        if (dx > dz) {
          return [point[0], point[1], point[2] - offset];
        } else {
          return [point[0] + offset, point[1], point[2]];
        }
      case 'left':
      case 'right':
        // 측면(YZ 평면): Z축 측정이면 Y축 위, Y축 측정이면 Z축 앞
        if (dz > dy) {
          return [point[0], point[1] + offset, point[2]];
        } else {
          return [point[0], point[1], point[2] + offset];
        }
      default:
        return [point[0], point[1] + offset, point[2]];
    }
  };

  // 시점과 측정 방향에 따른 텍스트 회전 (카메라를 향하고 측정선과 평행하도록)
  const getTextRotation = (start: MeasurePoint, end: MeasurePoint): [number, number, number] => {
    const dx = Math.abs(end[0] - start[0]);
    const dy = Math.abs(end[1] - start[1]);
    const dz = Math.abs(end[2] - start[2]);

    switch (viewDirection) {
      case 'front':
        // 정면(XY 평면): Y축 측정이면 Z축으로 90도 회전
        if (dy > dx) {
          return [0, 0, Math.PI / 2];
        }
        return [0, 0, 0];
      case 'top':
        // 상단(XZ 평면): X축 -90도 회전 (아래를 바라봄)
        // Z축 측정이면 추가로 Z축 90도 회전
        if (dz > dx) {
          return [-Math.PI / 2, 0, Math.PI / 2];
        }
        return [-Math.PI / 2, 0, 0];
      case 'left':
        // 좌측(YZ 평면): Y축 -90도 회전 (왼쪽을 바라봄)
        // Y축 측정이면 추가로 Z축 90도 회전
        if (dy > dz) {
          return [0, -Math.PI / 2, Math.PI / 2];
        }
        return [0, -Math.PI / 2, 0];
      case 'right':
        // 우측(YZ 평면): Y축 90도 회전 (오른쪽을 바라봄)
        // Y축 측정이면 추가로 Z축 90도 회전
        if (dy > dz) {
          return [0, Math.PI / 2, Math.PI / 2];
        }
        return [0, Math.PI / 2, 0];
      default:
        return [0, 0, 0];
    }
  };

  // 시점에 따른 박스 포인트 생성 (스냅 마커)
  const getBoxPoints = (point: MeasurePoint, size: number): MeasurePoint[] => {
    const half = size / 2;
    switch (viewDirection) {
      case 'front':
        // 정면(XY 평면): XY로 네모
        return [
          [point[0] - half, point[1] - half, point[2]],
          [point[0] + half, point[1] - half, point[2]],
          [point[0] + half, point[1] + half, point[2]],
          [point[0] - half, point[1] + half, point[2]],
          [point[0] - half, point[1] - half, point[2]]
        ];
      case 'top':
        // 상단(XZ 평면): XZ로 네모
        return [
          [point[0] - half, point[1], point[2] - half],
          [point[0] + half, point[1], point[2] - half],
          [point[0] + half, point[1], point[2] + half],
          [point[0] - half, point[1], point[2] + half],
          [point[0] - half, point[1], point[2] - half]
        ];
      case 'left':
      case 'right':
        // 측면(YZ 평면): YZ로 네모
        return [
          [point[0], point[1] - half, point[2] - half],
          [point[0], point[1] + half, point[2] - half],
          [point[0], point[1] + half, point[2] + half],
          [point[0], point[1] - half, point[2] + half],
          [point[0], point[1] - half, point[2] - half]
        ];
      default:
        return [
          [point[0] - half, point[1] - half, point[2]],
          [point[0] + half, point[1] - half, point[2]],
          [point[0] + half, point[1] + half, point[2]],
          [point[0] - half, point[1] + half, point[2]],
          [point[0] - half, point[1] - half, point[2]]
        ];
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

  // 지우개 모드에서 측정선과의 거리 계산 (호버 감지용)
  const getDistanceToLine = useCallback((point: MeasurePoint, lineStart: MeasurePoint, lineEnd: MeasurePoint): number => {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const dz = lineEnd[2] - lineStart[2];

    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (length === 0) return Infinity;

    // 점에서 선분까지의 최단 거리 계산
    const t = Math.max(0, Math.min(1, (
      (point[0] - lineStart[0]) * dx +
      (point[1] - lineStart[1]) * dy +
      (point[2] - lineStart[2]) * dz
    ) / (length * length)));

    const projX = lineStart[0] + t * dx;
    const projY = lineStart[1] + t * dy;
    const projZ = lineStart[2] + t * dz;

    const distX = point[0] - projX;
    const distY = point[1] - projY;
    const distZ = point[2] - projZ;

    return Math.sqrt(distX * distX + distY * distY + distZ * distZ);
  }, []);

  // 마우스 이동 핸들러
  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!isMeasureMode && !isEraserMode) return;

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

    // 지우개 모드인 경우
    if (isEraserMode) {
      // 현재 뷰에 표시되는 측정선 필터링
      const visibleLines = measureLines.filter(
        (line) => !line.viewDirection || line.viewDirection === viewDirection
      );

      // 가장 가까운 측정선 찾기
      let closestLineId: string | null = null;
      let minDistance = 0.3; // 호버 감지 거리 (three.js 단위, 약 30cm)

      visibleLines.forEach((line) => {
        const guidePoints = line.offset
          ? calculateGuidePoints(line.start, line.end, line.offset, viewDirection)
          : { start: line.start, end: line.end };

        const distance = getDistanceToLine(rawPoint, guidePoints.start, guidePoints.end);
        if (distance < minDistance) {
          minDistance = distance;
          closestLineId = line.id;
        }
      });

      setHoveredMeasureLineId(closestLineId);
      return;
    }

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
      // hoverPoint도 업데이트해야 클릭 시 올바른 위치 저장됨
      setHoverPoint(normalizedMousePos);
      return;
    }

    // 스냅 기능: 가장 가까운 꼭지점 찾기
    const snapDistance = getSnapDistance();
    const nearestSnap = findNearestVertex(rawPoint, sceneVerticesRef.current, viewDirection, snapDistance);

    if (nearestSnap) {
      // 꼭지점 근처 - 네모로 표시하고 스냅
      setHoverPoint(nearestSnap.vertex);
      setIsSnapped(true);
    } else {
      // 자유 위치 - 십자가로 표시
      setHoverPoint(rawPoint);
      setIsSnapped(false);
    }
  }, [isMeasureMode, isEraserMode, gl, raycaster, camera, viewDirection, isAdjustingGuide, measurePoints, getSnapDistance, measureLines, setHoveredMeasureLineId, getDistanceToLine]);

  // 클릭 핸들러
  const handleClick = useCallback((event: PointerEvent) => {
    // 지우개 모드인 경우
    if (isEraserMode) {
      if (hoveredMeasureLineId) {
        console.log('🗑️ 측정선 삭제:', hoveredMeasureLineId);
        removeMeasureLine(hoveredMeasureLineId);
        setHoveredMeasureLineId(null);
      }
      return;
    }

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

        // 현재 호버 포인트를 최종 오프셋으로 사용 (클릭 시점의 마우스 위치)
        // 뷰 방향에 따라 정규화
        const finalOffset: MeasurePoint = viewDirection === 'front'
          ? [hoverPoint[0], hoverPoint[1], 0]
          : viewDirection === 'top'
          ? [hoverPoint[0], 0, hoverPoint[2]]
          : viewDirection === 'left'
          ? [0, hoverPoint[1], hoverPoint[2]]
          : viewDirection === 'right'
          ? [0, hoverPoint[1], hoverPoint[2]]
          : hoverPoint;

        console.log('📏 측정 라인 추가:', {
          start: `[${start[0].toFixed(2)}, ${start[1].toFixed(2)}, ${start[2].toFixed(2)}]`,
          end: `[${end[0].toFixed(2)}, ${end[1].toFixed(2)}, ${end[2].toFixed(2)}]`,
          distance,
          offset: `[${finalOffset[0].toFixed(2)}, ${finalOffset[1].toFixed(2)}, ${finalOffset[2].toFixed(2)}]`,
          hoverPoint: `[${hoverPoint[0].toFixed(2)}, ${hoverPoint[1].toFixed(2)}, ${hoverPoint[2].toFixed(2)}]`,
          viewDirection
        });

        // 측정 라인 추가 - finalOffset과 viewDirection 저장
        addMeasureLine({
          id: `measure-${Date.now()}`,
          start,
          end,
          distance,
          offset: finalOffset,
          viewDirection // 측정한 시점 저장
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
  }, [isMeasureMode, isEraserMode, hoverPoint, isAdjustingGuide, measurePoints, setMeasureStartPoint, setMeasureEndPoint, addMeasureLine, clearMeasurePoints, hoveredMeasureLineId, removeMeasureLine, setHoveredMeasureLineId]);

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
    if (!isMeasureMode && !isEraserMode) {
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
  }, [isMeasureMode, isEraserMode, handlePointerMove, handleClick, gl]);

  const lineColor = colors.primary; // 테마 색상
  const snapColor = colors.warning || '#FFFF00'; // 노란색 (스냅됨)
  const eraserColor = colors.danger; // 지우개 빨간색
  const pointSize = getPointSize(); // 동적 점 크기

  return (
    <group>
      {/* 저장된 측정 라인들 - 현재 시점과 일치하는 것만 표시 */}
      {measureLines
        .filter((line) => !line.viewDirection || line.viewDirection === viewDirection)
        .map((line) => {
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

        // 호버 중인지 확인
        const isHovered = isEraserMode && hoveredMeasureLineId === line.id;
        const displayLineColor = isHovered ? eraserColor : lineColor; // 지우개 색상으로 강조
        const lineWidth = isHovered ? 3 : 2; // 두껍게 표시

        return (
          <group key={line.id}>
            {/* 수직/수평 연장선 (점선) - 시작점 */}
            <Line
              points={[line.start, guidePoints.start]}
              color={displayLineColor}
              lineWidth={isHovered ? 2 : 1}
              dashed
              dashSize={0.1}
              gapSize={0.05}
            />

            {/* 수직/수평 연장선 (점선) - 끝점 */}
            <Line
              points={[line.end, guidePoints.end]}
              color={displayLineColor}
              lineWidth={isHovered ? 2 : 1}
              dashed
              dashSize={0.1}
              gapSize={0.05}
            />

            {/* 측정 라인 */}
            <Line
              points={[guidePoints.start, guidePoints.end]}
              color={displayLineColor}
              lineWidth={lineWidth}
            />

            {/* 가이드 시작점 엔드포인트 (원형 점) */}
            <mesh position={guidePoints.start}>
              <sphereGeometry args={[isHovered ? 0.07 : 0.05, 8, 8]} />
              <meshBasicMaterial color={displayLineColor} />
            </mesh>

            {/* 가이드 끝점 엔드포인트 (원형 점) */}
            <mesh position={guidePoints.end}>
              <sphereGeometry args={[isHovered ? 0.07 : 0.05, 8, 8]} />
              <meshBasicMaterial color={displayLineColor} />
            </mesh>

            {/* 거리 텍스트 */}
            <Text
              position={getTextOffset(midPoint, line.start, line.end, 0.2)}
              rotation={getTextRotation(line.start, line.end)}
              fontSize={isHovered ? 0.3 : 0.25}
              color={displayLineColor}
              anchorX="center"
              anchorY="middle"
            >
              {Math.round(line.distance)}
            </Text>
          </group>
        );
      })}

      {/* 임시 측정 라인 (첫 번째 클릭 후) - 측정 모드일 때만 표시 */}
      {isMeasureMode && measurePoints && measurePoints[0] && hoverPoint && !isAdjustingGuide && (
        <group>
          <Line
            points={[measurePoints[0], hoverPoint]}
            color={lineColor}
            lineWidth={2}
            opacity={0.7}
            transparent
          />

          {/* 시작점 마커 (원형 점) */}
          <mesh position={measurePoints[0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial color={lineColor} />
          </mesh>

          {/* 호버점 마커 - 스냅되면 노란 네모만 표시 */}
          {isSnapped && (() => {
            console.log(`🎯 측정 중 마커: [${hoverPoint[0].toFixed(2)}, ${hoverPoint[1].toFixed(2)}, ${hoverPoint[2].toFixed(2)}] snapped=${isSnapped}`);

            return (
              <Line
                points={getBoxPoints(hoverPoint, snapBoxSize)}
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
                position={getTextOffset(midPoint, measurePoints[0], hoverPoint, 0.2)}
                rotation={getTextRotation(measurePoints[0], hoverPoint)}
                fontSize={0.25}
                color={lineColor}
                anchorX="center"
                anchorY="middle"
                opacity={0.7}
              >
                {Math.round(distance)}
              </Text>
            );
          })()}
        </group>
      )}

      {/* 가이드 조정 모드 - 측정 모드일 때만 표시 */}
      {isMeasureMode && isAdjustingGuide && measurePoints && measurePoints[0] && measurePoints[1] && (
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

                {/* 가이드 시작점 엔드포인트 (원형 점) */}
                <mesh position={guidePoints.start}>
                  <sphereGeometry args={[0.05, 8, 8]} />
                  <meshBasicMaterial color={snapColor} />
                </mesh>

                {/* 가이드 끝점 엔드포인트 (원형 점) */}
                <mesh position={guidePoints.end}>
                  <sphereGeometry args={[0.05, 8, 8]} />
                  <meshBasicMaterial color={snapColor} />
                </mesh>

                {/* 거리 텍스트 */}
                <Text
                  position={getTextOffset(midPoint, start, end, 0.2)}
                  rotation={getTextRotation(start, end)}
                  fontSize={0.25}
                  color={snapColor}
                  anchorX="center"
                  anchorY="middle"
                >
                  {Math.round(distance)}
                </Text>

                {/* 안내 텍스트 */}
                <Text
                  position={getTextOffset(midPoint, start, end, -0.4)}
                  rotation={getTextRotation(start, end)}
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

      {/* 호버 커서 (측정 시작 전) - 측정 모드일 때만 표시 */}
      {isMeasureMode && !measurePoints && hoverPoint && isSnapped && (() => {
        console.log(`🖱️ 호버 커서: [${hoverPoint[0].toFixed(2)}, ${hoverPoint[1].toFixed(2)}, ${hoverPoint[2].toFixed(2)}] snapped=${isSnapped} boxSize=${snapBoxSize.toFixed(4)}`);

        return (
          <Line
            points={getBoxPoints(hoverPoint, snapBoxSize)}
            color={snapColor}
            lineWidth={3}
          />
        );
      })()}
    </group>
  );
};
