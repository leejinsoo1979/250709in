import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { useUIStore } from '@/store/uiStore';

interface NativeLineProps {
  points: THREE.Vector3[] | [number, number, number][] | number[][];
  color?: string | number;
  lineWidth?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  opacity?: number;
  transparent?: boolean;
  renderOrder?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  name?: string; // DXF 내보내기에서 치수선 식별용
}

/**
 * Fat line component using Line2/LineMaterial for consistent rendering across platforms.
 * Unlike basic GL_LINES, Line2 renders as screen-space quads with proper lineWidth
 * support regardless of DPR (Device Pixel Ratio).
 */
export const NativeLine: React.FC<NativeLineProps> = ({
  points,
  color = '#000000',
  lineWidth = 1,
  dashed = false,
  dashSize = 1,
  gapSize = 1,
  opacity = 1,
  transparent = false,
  renderOrder = 0,
  depthTest = true,
  depthWrite = true,
  name
}) => {
  const lineRef = useRef<Line2>(null!);
  const { size } = useThree();
  const inspectorFocused = useUIStore(state => (
    state.viewMode === '3D' &&
    ((state.isLiveDimensionMode && !!state.liveDimensionSelectedKey) || state.isTapeMeasureMode)
  ));
  const isDimensionOverlay = typeof name === 'string' && (
    name.includes('dimension') ||
    name.includes('guide') ||
    name.includes('dim')
  );
  const isOccludableDepthDimension = typeof name === 'string' && name.startsWith('3d-depth-dimension');
  const effectiveOpacity = isDimensionOverlay && inspectorFocused ? Math.min(opacity, 0.18) : opacity;
  const effectiveDepthTest = isDimensionOverlay && !isOccludableDepthDimension ? false : depthTest;
  const effectiveDepthWrite = isDimensionOverlay && !isOccludableDepthDimension ? false : depthWrite;
  const effectiveRenderOrder = isDimensionOverlay && !isOccludableDepthDimension ? Math.max(renderOrder, 100000) : renderOrder;
  // 치수 오버레이는 항상 마지막에 그려지도록 transparent 강제 (Three.js는 transparent=true를 마지막에 렌더)
  const effectiveTransparent = isDimensionOverlay && !isOccludableDepthDimension ? true : (transparent || effectiveOpacity < 1);

  // points를 flat array로 변환
  const flatPositions = useMemo(() => {
    const flat: number[] = [];
    for (const point of points) {
      if (point instanceof THREE.Vector3) {
        flat.push(point.x, point.y, point.z);
      } else if (Array.isArray(point)) {
        flat.push(point[0] || 0, point[1] || 0, point[2] || 0);
      }
    }
    return flat;
  }, [points]);

  const positionsKey = flatPositions.join(',');

  // LineGeometry + LineMaterial 생성
  const { geometry, material } = useMemo(() => {
    const geo = new LineGeometry();
    geo.setPositions(flatPositions);

    const colorObj = new THREE.Color(color);

    const mat = new LineMaterial({
      color: colorObj.getHex(),
      linewidth: lineWidth,
      dashed: dashed,
      dashSize: dashSize,
      gapSize: gapSize,
      opacity: effectiveOpacity,
      transparent: effectiveTransparent,
      depthTest: effectiveDepthTest,
      depthWrite: effectiveDepthWrite,
      resolution: new THREE.Vector2(size.width, size.height),
    });

    return { geometry: geo, material: mat };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // positions 업데이트
  useEffect(() => {
    if (geometry) {
      geometry.setPositions(flatPositions);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsKey, geometry]);

  // material 속성 업데이트
  useEffect(() => {
    if (!material) return;
    const colorObj = new THREE.Color(color);
    material.color.set(colorObj);
    material.linewidth = lineWidth;
    material.dashed = dashed;
    material.dashSize = dashSize;
    material.gapSize = gapSize;
    material.opacity = effectiveOpacity;
    material.transparent = effectiveTransparent;
    material.depthTest = effectiveDepthTest;
    material.depthWrite = effectiveDepthWrite;
    material.needsUpdate = true;
  }, [material, color, lineWidth, dashed, dashSize, gapSize, effectiveOpacity, effectiveTransparent, effectiveDepthTest, effectiveDepthWrite]);

  // resolution 업데이트 (캔버스 리사이즈 대응)
  useEffect(() => {
    if (material) {
      material.resolution.set(size.width, size.height);
    }
  }, [material, size.width, size.height]);

  // dashed line의 경우 computeLineDistances 호출
  useEffect(() => {
    if (lineRef.current && dashed) {
      lineRef.current.computeLineDistances();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsKey, dashed]);

  // Line2 인스턴스 (한 번만 생성)
  const line2 = useMemo(() => {
    const line = new Line2(geometry, material);
    line.renderOrder = effectiveRenderOrder;
    if (name !== undefined) line.name = name || '';
    return line;
  }, [geometry, material, effectiveRenderOrder, name]);

  // renderOrder, name 업데이트
  useEffect(() => {
    if (line2) {
      line2.renderOrder = effectiveRenderOrder;
      if (name !== undefined) line2.name = name || '';
    }
  }, [line2, effectiveRenderOrder, name]);

  // cleanup
  useEffect(() => {
    return () => {
      geometry?.dispose();
      material?.dispose();
    };
  }, [geometry, material]);

  return (
    <primitive
      ref={lineRef}
      object={line2}
    />
  );
};

export default NativeLine;
