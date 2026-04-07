import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

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
 * Native Three.js line component to replace @react-three/drei Line
 * Uses useRef + useEffect for reliable geometry updates when points change.
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
  const geoRef = useRef<THREE.BufferGeometry>(null!);

  // points를 값 기반으로 비교하기 위해 직렬화
  const pointsKey = useMemo(() => {
    const flat: number[] = [];
    for (const point of points) {
      if (point instanceof THREE.Vector3) {
        flat.push(point.x, point.y, point.z);
      } else if (Array.isArray(point)) {
        flat.push(point[0] || 0, point[1] || 0, point[2] || 0);
      }
    }
    return flat.join(',');
  }, [points]);

  // points 변경 시 geometry의 position attribute를 인-플레이스 업데이트
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;

    const positions = new Float32Array(points.length * 3);

    points.forEach((point, index) => {
      if (point instanceof THREE.Vector3) {
        positions[index * 3] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = point.z;
      } else if (Array.isArray(point)) {
        positions[index * 3] = point[0] || 0;
        positions[index * 3 + 1] = point[1] || 0;
        positions[index * 3 + 2] = point[2] || 0;
      }
    });

    const existingAttr = geo.getAttribute('position') as THREE.BufferAttribute | null;
    if (existingAttr && existingAttr.array.length === positions.length) {
      (existingAttr.array as Float32Array).set(positions);
      existingAttr.needsUpdate = true;
    } else {
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }

    // Compute line distances for dashed lines
    if (dashed && points.length > 1) {
      const lineDistances = new Float32Array(points.length);
      lineDistances[0] = 0;

      for (let i = 1; i < points.length; i++) {
        const prevPoint = points[i - 1];
        const currPoint = points[i];

        let distance: number;
        if (prevPoint instanceof THREE.Vector3 && currPoint instanceof THREE.Vector3) {
          distance = Math.sqrt(
            Math.pow(currPoint.x - prevPoint.x, 2) +
            Math.pow(currPoint.y - prevPoint.y, 2) +
            Math.pow(currPoint.z - prevPoint.z, 2)
          );
        } else if (Array.isArray(prevPoint) && Array.isArray(currPoint)) {
          const px = prevPoint[0] || 0;
          const py = prevPoint[1] || 0;
          const pz = prevPoint[2] || 0;
          const cx = currPoint[0] || 0;
          const cy = currPoint[1] || 0;
          const cz = currPoint[2] || 0;
          distance = Math.sqrt(
            Math.pow(cx - px, 2) +
            Math.pow(cy - py, 2) +
            Math.pow(cz - pz, 2)
          );
        } else {
          distance = 0;
        }

        lineDistances[i] = lineDistances[i - 1] + distance;
      }

      const existingDist = geo.getAttribute('lineDistance') as THREE.BufferAttribute | null;
      if (existingDist && existingDist.array.length === lineDistances.length) {
        (existingDist.array as Float32Array).set(lineDistances);
        existingDist.needsUpdate = true;
      } else {
        geo.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistances, 1));
      }
    }

    geo.computeBoundingSphere();
  }, [pointsKey, dashed]); // eslint-disable-line react-hooks/exhaustive-deps

  // cleanup
  useEffect(() => {
    return () => {
      if (geoRef.current) {
        geoRef.current.dispose();
      }
    };
  }, []);

  const material = useMemo(() => {
    if (dashed) {
      return (
        <lineDashedMaterial
          color={color}
          dashSize={dashSize}
          gapSize={gapSize}
          opacity={opacity}
          transparent={transparent}
          depthTest={depthTest}
          depthWrite={depthWrite}
        />
      );
    } else {
      return (
        <lineBasicMaterial
          color={color}
          opacity={opacity}
          transparent={transparent}
          depthTest={depthTest}
          depthWrite={depthWrite}
        />
      );
    }
  }, [color, dashed, dashSize, gapSize, opacity, transparent, depthTest, depthWrite]);

  return (
    <line renderOrder={renderOrder} name={name}>
      <bufferGeometry ref={geoRef} />
      {material}
    </line>
  );
};

export default NativeLine;
