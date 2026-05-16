import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useTheme } from '@/contexts/ThemeContext';

interface TapeMeasureInspectorProps {
  enabled: boolean;
}

interface TapeEdge {
  axis: 'x' | 'y' | 'z';
  start: [number, number, number];
  end: [number, number, number];
  lengthMm: number;
}

interface TapeHover {
  key: string;
  center: [number, number, number];
  quaternion: [number, number, number, number];
  edge: TapeEdge;
  labelPosition: [number, number, number];
}

const THREE_UNITS_TO_MM = 100;
const TAPE_LINE_COLOR = '#c2410c';

const findUserData = (object: THREE.Object3D, key: string): any => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData && current.userData[key] !== undefined) return current.userData[key];
    current = current.parent;
  }
  return undefined;
};

const hasInspectableMetadata = (object: THREE.Object3D) => Boolean(
  findUserData(object, 'liveDimension') ||
  findUserData(object, 'panelName') ||
  findUserData(object, 'furnitureId')
);

const shouldInspectObject = (object: THREE.Object3D): object is THREE.Mesh => {
  if (!(object instanceof THREE.Mesh) || !object.visible) return false;
  if (object.userData?.liveDimensionOverlay || object.userData?.tapeMeasureOverlay || object.userData?.decoration) return false;
  if (!hasInspectableMetadata(object)) return false;

  const name = object.name || '';
  if (
    name.includes('dimension') ||
    name.includes('edge') ||
    name.includes('grid') ||
    name.includes('axis') ||
    name.includes('ghost') ||
    name.includes('highlight') ||
    name.includes('pick-helper') ||
    name.includes('placement')
  ) {
    return false;
  }

  const material = object.material as THREE.Material | THREE.Material[] | undefined;
  const materials = Array.isArray(material) ? material : material ? [material] : [];
  return !materials.some((mat) => mat.visible === false);
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const distanceToSegment = (point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) => {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 0.000001) return point.distanceTo(start);

  const t = clamp01(point.clone().sub(start).dot(segment) / lengthSq);
  return point.distanceTo(start.clone().add(segment.multiplyScalar(t)));
};

const createBoxEdges = (
  width: number,
  height: number,
  depth: number,
  widthMm: number,
  heightMm: number,
  depthMm: number
): TapeEdge[] => {
  const x0 = -width / 2;
  const x1 = width / 2;
  const y0 = -height / 2;
  const y1 = height / 2;
  const z0 = -depth / 2;
  const z1 = depth / 2;

  const edge = (
    axis: TapeEdge['axis'],
    start: [number, number, number],
    end: [number, number, number],
    lengthMm: number
  ): TapeEdge => ({ axis, start, end, lengthMm });

  return [
    edge('x', [x0, y0, z0], [x1, y0, z0], widthMm),
    edge('x', [x0, y1, z0], [x1, y1, z0], widthMm),
    edge('x', [x0, y0, z1], [x1, y0, z1], widthMm),
    edge('x', [x0, y1, z1], [x1, y1, z1], widthMm),
    edge('y', [x0, y0, z0], [x0, y1, z0], heightMm),
    edge('y', [x1, y0, z0], [x1, y1, z0], heightMm),
    edge('y', [x0, y0, z1], [x0, y1, z1], heightMm),
    edge('y', [x1, y0, z1], [x1, y1, z1], heightMm),
    edge('z', [x0, y0, z0], [x0, y0, z1], depthMm),
    edge('z', [x1, y0, z0], [x1, y0, z1], depthMm),
    edge('z', [x0, y1, z0], [x0, y1, z1], depthMm),
    edge('z', [x1, y1, z0], [x1, y1, z1], depthMm),
  ];
};

const getTapeHover = (object: THREE.Object3D, hitPoint: THREE.Vector3, camera: THREE.Camera): TapeHover | null => {
  object.updateMatrixWorld(true);

  const center = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const size = new THREE.Vector3();
  const explicit = findUserData(object, 'liveDimension');

  object.matrixWorld.decompose(center, quaternion, scale);

  if (explicit) {
    size.set(
      Math.max(0.001, explicit.widthMm / THREE_UNITS_TO_MM),
      Math.max(0.001, explicit.heightMm / THREE_UNITS_TO_MM),
      Math.max(0.001, explicit.depthMm / THREE_UNITS_TO_MM)
    );
  } else if (object instanceof THREE.Mesh && object.geometry) {
    if (!object.geometry.boundingBox) {
      object.geometry.computeBoundingBox();
    }
    const box = object.geometry.boundingBox;
    if (!box || box.isEmpty()) return null;

    const localCenter = new THREE.Vector3();
    box.getCenter(localCenter);
    box.getSize(size);
    center.copy(localCenter.applyMatrix4(object.matrixWorld));
    size.set(
      Math.abs(size.x * scale.x),
      Math.abs(size.y * scale.y),
      Math.abs(size.z * scale.z)
    );
  } else {
    return null;
  }

  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null;

  const inverseQuaternion = quaternion.clone().invert();
  const localHit = hitPoint.clone().sub(center).applyQuaternion(inverseQuaternion);
  const widthMm = explicit?.widthMm ?? Math.round(size.x * THREE_UNITS_TO_MM);
  const heightMm = explicit?.heightMm ?? Math.round(size.y * THREE_UNITS_TO_MM);
  const depthMm = explicit?.depthMm ?? Math.round(size.z * THREE_UNITS_TO_MM);
  const edges = createBoxEdges(size.x, size.y, size.z, widthMm, heightMm, depthMm);

  let nearest: { edge: TapeEdge; distance: number } | null = null;
  edges.forEach((edge) => {
    const distance = distanceToSegment(
      localHit,
      new THREE.Vector3(...edge.start),
      new THREE.Vector3(...edge.end)
    );
    if (!nearest || distance < nearest.distance) {
      nearest = { edge, distance };
    }
  });

  if (!nearest) return null;

  const edgeSnapThreshold = Math.max(0.08, Math.min(0.18, Math.max(size.x, size.y, size.z) * 0.015));
  if (nearest.distance > edgeSnapThreshold) return null;

  const start = new THREE.Vector3(...nearest.edge.start);
  const end = new THREE.Vector3(...nearest.edge.end);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const cameraDirection = camera.position
    .clone()
    .sub(center)
    .applyQuaternion(inverseQuaternion)
    .normalize();
  const labelPosition = midpoint.clone().add(cameraDirection.multiplyScalar(0.22));

  return {
    key: `${findUserData(object, 'liveDimensionKey') || object.uuid}:${nearest.edge.axis}:${nearest.edge.start.join(',')}`,
    center: [center.x, center.y, center.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    edge: nearest.edge,
    labelPosition: [labelPosition.x, labelPosition.y, labelPosition.z],
  };
};

const TapeLabel: React.FC<{ position: [number, number, number]; value: number }> = ({ position, value }) => (
  <Html
    position={position}
    center
    occlude={false}
    transform={false}
    style={{ pointerEvents: 'none' }}
    zIndexRange={[10000, 10]}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: TAPE_LINE_COLOR,
        fontSize: '13px',
        fontWeight: 800,
        lineHeight: 1.12,
        whiteSpace: 'nowrap',
        textShadow: '0 1px 2px rgba(255,255,255,0.75), 0 0 2px rgba(0,0,0,0.35)',
      }}
    >
      {value}
    </div>
  </Html>
);

const TapeMeasureOverlay: React.FC<{ hover: TapeHover }> = ({ hover }) => {
  const { theme } = useTheme();
  const lineColor = useMemo(() => {
    if (typeof window !== 'undefined') {
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary').trim();
      if (primaryColor) return primaryColor;
    }
    return theme.mode === 'dark' ? '#60a5fa' : '#2563eb';
  }, [theme.color, theme.mode]);

  return (
    <group position={hover.center} quaternion={hover.quaternion} userData={{ tapeMeasureOverlay: true }}>
      <Line
        points={[hover.edge.start, hover.edge.end]}
        color={lineColor}
        lineWidth={4}
        transparent
        opacity={1}
        depthTest={false}
        renderOrder={100020}
      />
      <Line
        points={[hover.edge.start, hover.edge.end]}
        color={TAPE_LINE_COLOR}
        lineWidth={2}
        transparent
        opacity={1}
        depthTest={false}
        renderOrder={100021}
      />
      <TapeLabel position={hover.labelPosition} value={hover.edge.lengthMm} />
    </group>
  );
};

const TapeMeasureInspector: React.FC<TapeMeasureInspectorProps> = ({ enabled }) => {
  const { camera, scene, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const rafRef = useRef<number | null>(null);
  const lastEventRef = useRef<PointerEvent | null>(null);
  const [hover, setHover] = useState<TapeHover | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const previousCursor = canvas.style.cursor;
    if (enabled) canvas.style.cursor = 'crosshair';

    return () => {
      canvas.style.cursor = previousCursor;
    };
  }, [enabled, gl]);

  useEffect(() => {
    if (!enabled) {
      setHover(null);
      return;
    }

    const canvas = gl.domElement;

    const pickEdge = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      scene.updateMatrixWorld(true);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((item) => shouldInspectObject(item.object));
      return hit ? getTapeHover(hit.object, hit.point, camera) : null;
    };

    const updateHover = () => {
      rafRef.current = null;
      const event = lastEventRef.current;
      if (!event) return;

      const next = pickEdge(event);
      setHover((prev) => {
        if (prev && next && prev.key === next.key && prev.edge.lengthMm === next.edge.lengthMm) return prev;
        return next;
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      lastEventRef.current = event;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(updateHover);
      }
    };

    const handlePointerLeave = () => {
      lastEventRef.current = null;
      setHover(null);
    };

    const blockEditorClick = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('click', blockEditorClick, true);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('click', blockEditorClick, true);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setHover(null);
    };
  }, [enabled, gl, camera, scene, pointer, raycaster]);

  if (!enabled || !hover) return null;
  return <TapeMeasureOverlay hover={hover} />;
};

export default TapeMeasureInspector;
