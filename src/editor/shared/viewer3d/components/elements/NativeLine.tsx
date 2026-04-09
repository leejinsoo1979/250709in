import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

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
      opacity: opacity,
      transparent: transparent || opacity < 1,
      depthTest: depthTest,
      depthWrite: depthWrite,
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
    material.opacity = opacity;
    material.transparent = transparent || opacity < 1;
    material.depthTest = depthTest;
    material.depthWrite = depthWrite;
    material.needsUpdate = true;
  }, [material, color, lineWidth, dashed, dashSize, gapSize, opacity, transparent, depthTest, depthWrite]);

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
    return new Line2(geometry, material);
  }, [geometry, material]);

  // renderOrder, name 업데이트
  useEffect(() => {
    if (line2) {
      line2.renderOrder = renderOrder;
      if (name !== undefined) line2.name = name || '';
    }
  }, [line2, renderOrder, name]);

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
