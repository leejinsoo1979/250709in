import React, { useMemo } from 'react';
import * as THREE from 'three';

interface NativeLineProps {
  points: THREE.Vector3[];
  color?: string | number;
  lineWidth?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  opacity?: number;
  transparent?: boolean;
}

/**
 * Native Three.js line component to replace @react-three/drei Line
 * This avoids R3F hooks errors by using pure Three.js geometry and materials
 */
export const NativeLine: React.FC<NativeLineProps> = ({
  points,
  color = '#000000',
  lineWidth = 1,
  dashed = false,
  dashSize = 1,
  gapSize = 1,
  opacity = 1,
  transparent = false
}) => {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    
    points.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
    });
    
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Compute line distances for dashed lines
    if (dashed && points.length > 1) {
      const lineDistances = new Float32Array(points.length);
      lineDistances[0] = 0;
      
      for (let i = 1; i < points.length; i++) {
        const prevPoint = points[i - 1];
        const currPoint = points[i];
        const distance = Math.sqrt(
          Math.pow(currPoint.x - prevPoint.x, 2) +
          Math.pow(currPoint.y - prevPoint.y, 2) +
          Math.pow(currPoint.z - prevPoint.z, 2)
        );
        lineDistances[i] = lineDistances[i - 1] + distance;
      }
      
      geo.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistances, 1));
    }
    
    return geo;
  }, [points, dashed]);
  
  const material = useMemo(() => {
    if (dashed) {
      return (
        <lineDashedMaterial
          color={color}
          dashSize={dashSize}
          gapSize={gapSize}
          opacity={opacity}
          transparent={transparent}
        />
      );
    } else {
      return (
        <lineBasicMaterial
          color={color}
          opacity={opacity}
          transparent={transparent}
        />
      );
    }
  }, [color, dashed, dashSize, gapSize, opacity, transparent]);
  
  return (
    <line geometry={geometry}>
      {material}
    </line>
  );
};

export default NativeLine;