import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useUIStore } from '@/store/uiStore';
import { getExcludedPanelAliases, useExcludedPanelsStore } from '../../context/ExcludedPanelsContext';

interface TapeMeasureInspectorProps {
  enabled: boolean;
}

interface TapeEdge {
  axis: 'x' | 'y' | 'z';
  start: [number, number, number];
  end: [number, number, number];
  lengthMm: number;
}

interface TapeSnap {
  key: string;
  type: 'corner' | 'edge';
  point: [number, number, number];
  edge?: TapeEdge;
  edgeStart?: [number, number, number];
  edgeEnd?: [number, number, number];
}

interface TapeHover {
  key: string;
  snap: TapeSnap;
}

interface TapeMeasurement {
  start: [number, number, number];
  end: [number, number, number];
  guidePoint: [number, number, number];
}

interface TapePickResult {
  hover: TapeHover | null;
  point: [number, number, number] | null;
  target: THREE.Object3D | null;
  selectionKey: string | null;
}

interface LiveDimensionMetadata {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

interface FaceGrooveDimension {
  face: 'left' | 'right';
  fromY: number;
  height: number;
  fromZ: number;
  depth: number;
  cutDepth: number;
  grooveWidthMm?: number;
  cutDepthMm: number;
}

const THREE_UNITS_TO_MM = 100;
const TAPE_EDGE_COLOR = '#dc2626';
const TAPE_CORNER_COLOR = '#16a34a';
const AXIS_COLORS = {
  x: '#ef4444',
  y: '#22c55e',
  z: '#3b82f6',
} as const;
const TAPE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cg fill='none' stroke='%23f97316' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 16 17 6'/%3E%3Cpath d='M15 4h7v7'/%3E%3Crect x='4' y='16' width='14' height='7' rx='2'/%3E%3Cpath d='M7 19h1M11 19h1M15 19h1'/%3E%3C/g%3E%3C/svg%3E") 4 24, crosshair`;

const findUserData = (object: THREE.Object3D, key: string): unknown => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData && current.userData[key] !== undefined) return current.userData[key];
    current = current.parent;
  }
  return undefined;
};

const isLiveDimensionMetadata = (value: unknown): value is LiveDimensionMetadata => (
  Boolean(value) &&
  typeof value === 'object' &&
  Number.isFinite(Number((value as Partial<LiveDimensionMetadata>).widthMm)) &&
  Number.isFinite(Number((value as Partial<LiveDimensionMetadata>).heightMm)) &&
  Number.isFinite(Number((value as Partial<LiveDimensionMetadata>).depthMm))
);

const getTemporaryHideTarget = (object: THREE.Object3D) => {
  const key = findUserData(object, 'liveDimensionKey');
  if (!key) return object;

  let target = object;
  let current: THREE.Object3D | null = object.parent;
  while (current) {
    if (current.userData?.liveDimensionKey === key) {
      target = current;
      current = current.parent;
      continue;
    }
    break;
  }
  return target;
};

const getSelectionKey = (object: THREE.Object3D) => {
  const liveDimensionKey = findUserData(object, 'liveDimensionKey');
  if (liveDimensionKey) return String(liveDimensionKey);

  const furnitureId = findUserData(object, 'furnitureId');
  const panelName = findUserData(object, 'panelName');
  if (furnitureId && panelName) return `${furnitureId}::${panelName}`;

  return object.uuid;
};

const getExclusionKeys = (object: THREE.Object3D) => {
  const keys = new Set<string>();
  const liveDimensionKey = findUserData(object, 'liveDimensionKey');
  const liveDimensionKeyText = typeof liveDimensionKey === 'string' ? liveDimensionKey : null;
  const separatorIndex = liveDimensionKeyText?.indexOf('::') ?? -1;

  let furnitureId = typeof findUserData(object, 'furnitureId') === 'string'
    ? findUserData(object, 'furnitureId') as string
    : null;
  let panelName = typeof findUserData(object, 'panelName') === 'string'
    ? findUserData(object, 'panelName') as string
    : null;

  if (liveDimensionKeyText && separatorIndex >= 0) {
    furnitureId = liveDimensionKeyText.slice(0, separatorIndex);
    panelName = liveDimensionKeyText.slice(separatorIndex + 2);
  }

  if (!furnitureId || !panelName) return keys;

  getExcludedPanelAliases(panelName).forEach((alias) => {
    keys.add(`${furnitureId}::${alias}`);
  });
  return keys;
};

const getExclusionKeysFromSelectionKey = (selectionKey: string | null | undefined) => {
  const keys = new Set<string>();
  if (!selectionKey) return keys;

  const separatorIndex = selectionKey.indexOf('::');
  if (separatorIndex < 0) return keys;

  const furnitureId = selectionKey.slice(0, separatorIndex);
  const panelName = selectionKey.slice(separatorIndex + 2);
  if (!furnitureId || !panelName) return keys;

  getExcludedPanelAliases(panelName).forEach((alias) => {
    keys.add(`${furnitureId}::${alias}`);
  });
  return keys;
};

const hasInspectableMetadata = (object: THREE.Object3D) => Boolean(
  findUserData(object, 'liveDimension') ||
  findUserData(object, 'panelName') ||
  findUserData(object, 'furnitureId')
);

const isVisibleInHierarchy = (object: THREE.Object3D) => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
};

const shouldInspectObject = (object: THREE.Object3D): object is THREE.Mesh => {
  if (!(object instanceof THREE.Mesh) || !isVisibleInHierarchy(object)) return false;
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

const closestPointOnSegment = (point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) => {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 0.000001) return start.clone();

  const t = clamp01(point.clone().sub(start).dot(segment) / lengthSq);
  return start.clone().add(segment.multiplyScalar(t));
};

const distanceToSegment = (point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) => {
  return point.distanceTo(closestPointOnSegment(point, start, end));
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

const normalizeFaceGrooves = (value: unknown): FaceGrooveDimension[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Partial<FaceGrooveDimension>;
      const face = source.face === 'left' || source.face === 'right' ? source.face : null;
      const fromY = Number(source.fromY);
      const height = Number(source.height);
      const fromZ = Number(source.fromZ);
      const depth = Number(source.depth);
      const cutDepth = Number(source.cutDepth);
      const grooveWidthMm = Number(source.grooveWidthMm);
      const cutDepthMm = Number(source.cutDepthMm);
      if (!face) return null;
      if (![fromY, height, fromZ, depth, cutDepth, grooveWidthMm, cutDepthMm].every(Number.isFinite)) return null;
      if (height <= 0 || depth <= 0 || cutDepth <= 0) return null;
      return { face, fromY, height, fromZ, depth, cutDepth, grooveWidthMm, cutDepthMm };
    })
    .filter((item): item is FaceGrooveDimension => Boolean(item));
};

const createFaceGrooveEdges = (
  grooves: FaceGrooveDimension[],
  width: number,
  height: number,
  depth: number
): TapeEdge[] => {
  if (!grooves.length) return [];

  const xHalf = width / 2;
  const yHalf = height / 2;
  const zHalf = depth / 2;

  return grooves.flatMap((groove, index) => {
    const faceSign = groove.face === 'right' ? 1 : -1;
    const faceX = faceSign * xHalf;
    const bottomX = faceX - faceSign * groove.cutDepth;
    const y0 = Math.max(-yHalf, Math.min(yHalf, -yHalf + groove.fromY));
    const y1 = Math.max(y0, Math.min(yHalf, y0 + groove.height));
    const z0 = Math.max(-zHalf, Math.min(zHalf, -zHalf + groove.fromZ));
    const z1 = Math.max(z0, Math.min(zHalf, z0 + groove.depth));
    const sectionZ = z1;
    const thicknessOnY = groove.height <= groove.depth;
    const thicknessStart: [number, number, number] = thicknessOnY
      ? [bottomX, y0, sectionZ]
      : [bottomX, y1, z0];
    const thicknessEnd: [number, number, number] = thicknessOnY
      ? [bottomX, y1, sectionZ]
      : [bottomX, y1, z1];

    return [
      {
        axis: 'x',
        start: [faceX, y1, sectionZ] as [number, number, number],
        end: [bottomX, y1, sectionZ] as [number, number, number],
        lengthMm: groove.cutDepthMm,
      },
      {
        axis: thicknessOnY ? 'y' : 'z',
        start: thicknessStart,
        end: thicknessEnd,
        lengthMm: groove.grooveWidthMm ?? Math.round(Math.min(groove.height, groove.depth) * THREE_UNITS_TO_MM),
      },
    ].map((edge, edgeIndex) => ({
      ...edge,
      start: edge.start,
      end: edge.end,
      lengthMm: edge.lengthMm,
      key: `face-groove-${index}-${edgeIndex}`,
    } as TapeEdge));
  });
};

const createBoxCorners = (width: number, height: number, depth: number): [number, number, number][] => {
  const x0 = -width / 2;
  const x1 = width / 2;
  const y0 = -height / 2;
  const y1 = height / 2;
  const z0 = -depth / 2;
  const z1 = depth / 2;

  return [
    [x0, y0, z0],
    [x1, y0, z0],
    [x0, y1, z0],
    [x1, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x0, y1, z1],
    [x1, y1, z1],
  ];
};

const createFaceGrooveCorners = (
  grooves: FaceGrooveDimension[],
  width: number,
  height: number,
  depth: number
): [number, number, number][] => {
  if (!grooves.length) return [];

  const xHalf = width / 2;
  const yHalf = height / 2;
  const zHalf = depth / 2;

  return grooves.flatMap((groove) => {
    const faceSign = groove.face === 'right' ? 1 : -1;
    const faceX = faceSign * xHalf;
    const bottomX = faceX - faceSign * groove.cutDepth;
    const y0 = Math.max(-yHalf, Math.min(yHalf, -yHalf + groove.fromY));
    const y1 = Math.max(y0, Math.min(yHalf, y0 + groove.height));
    const z0 = Math.max(-zHalf, Math.min(zHalf, -zHalf + groove.fromZ));
    const z1 = Math.max(z0, Math.min(zHalf, z0 + groove.depth));

    return [
      [faceX, y0, z0],
      [faceX, y0, z1],
      [faceX, y1, z0],
      [faceX, y1, z1],
      [bottomX, y0, z0],
      [bottomX, y0, z1],
      [bottomX, y1, z0],
      [bottomX, y1, z1],
    ] as [number, number, number][];
  });
};

const toPoint3 = (vector: THREE.Vector3): [number, number, number] => [vector.x, vector.y, vector.z];

const getAxisForVector = (start: [number, number, number], end: [number, number, number]): keyof typeof AXIS_COLORS => {
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);
  const dz = Math.abs(end[2] - start[2]);
  if (dy >= dx && dy >= dz) return 'y';
  if (dz >= dx && dz >= dy) return 'z';
  return 'x';
};

const getDistanceMm = (start: [number, number, number], end: [number, number, number]) => {
  return Math.round(new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...end)) * THREE_UNITS_TO_MM);
};

const getOffsetMm = (start: [number, number, number], end: [number, number, number]) => ({
  x: Math.round(Math.abs(end[0] - start[0]) * THREE_UNITS_TO_MM),
  y: Math.round(Math.abs(end[1] - start[1]) * THREE_UNITS_TO_MM),
  z: Math.round(Math.abs(end[2] - start[2]) * THREE_UNITS_TO_MM),
});

const getAxisUnitVector = (axis: keyof typeof AXIS_COLORS) => {
  if (axis === 'y') return new THREE.Vector3(0, 1, 0);
  if (axis === 'z') return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(1, 0, 0);
};

const getDimensionOffset = (
  start: [number, number, number],
  end: [number, number, number],
  guidePoint: [number, number, number] | null,
  camera: THREE.Camera
) => {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const midpoint = startVector.clone().add(endVector).multiplyScalar(0.5);
  const measurementAxis = getAxisForVector(start, end);
  const fallbackSource = camera.position.clone().sub(midpoint);
  const rawOffset = guidePoint
    ? new THREE.Vector3(...guidePoint).sub(midpoint)
    : fallbackSource;
  const candidateAxes = (['x', 'y', 'z'] as Array<keyof typeof AXIS_COLORS>)
    .filter(axis => axis !== measurementAxis);

  let bestAxis = candidateAxes[0];
  let bestValue = 0;
  candidateAxes.forEach((axis) => {
    const unit = getAxisUnitVector(axis);
    const value = rawOffset.dot(unit);
    if (Math.abs(value) > Math.abs(bestValue)) {
      bestAxis = axis;
      bestValue = value;
    }
  });

  if (Math.abs(bestValue) <= 0.035) {
    candidateAxes.forEach((axis) => {
      const unit = getAxisUnitVector(axis);
      const value = fallbackSource.dot(unit);
      if (Math.abs(value) > Math.abs(bestValue)) {
        bestAxis = axis;
        bestValue = value;
      }
    });
  }

  const direction = bestValue >= 0 ? 1 : -1;
  const magnitude = Math.max(0.35, Math.min(8, Math.abs(bestValue)));
  return getAxisUnitVector(bestAxis).multiplyScalar(direction * magnitude);
};

const getBillboardScale = (camera: THREE.Camera, position: [number, number, number], base = 0.07) => {
  if (camera instanceof THREE.OrthographicCamera) {
    return base / Math.max(0.35, camera.zoom);
  }
  const distance = camera.position.distanceTo(new THREE.Vector3(...position));
  return Math.max(0.045, Math.min(0.18, distance * 0.012));
};

const getTapeHover = (object: THREE.Object3D, hitPoint: THREE.Vector3): TapeHover | null => {
  object.updateMatrixWorld(true);

  const center = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const size = new THREE.Vector3();
  const explicitValue = findUserData(object, 'liveDimension');
  const explicit = isLiveDimensionMetadata(explicitValue) ? explicitValue : null;

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
  const faceGrooves = normalizeFaceGrooves(findUserData(object, 'liveDimensionFaceGrooves'));
  const edges = [
    ...createBoxEdges(size.x, size.y, size.z, widthMm, heightMm, depthMm),
    ...createFaceGrooveEdges(faceGrooves, size.x, size.y, size.z),
  ];
  const corners = [
    ...createBoxCorners(size.x, size.y, size.z),
    ...createFaceGrooveCorners(faceGrooves, size.x, size.y, size.z),
  ];

  let nearestCorner: { point: THREE.Vector3; distance: number; index: number } | null = null;
  corners.forEach((corner, index) => {
    const point = new THREE.Vector3(...corner);
    const distance = localHit.distanceTo(point);
    if (!nearestCorner || distance < nearestCorner.distance) {
      nearestCorner = { point, distance, index };
    }
  });

  const baseSnapThreshold = Math.max(0.08, Math.min(0.2, Math.max(size.x, size.y, size.z) * 0.018));
  if (nearestCorner && nearestCorner.distance <= baseSnapThreshold) {
    const worldPoint = nearestCorner.point.clone().applyQuaternion(quaternion).add(center);
    return {
      key: `${findUserData(object, 'liveDimensionKey') || object.uuid}:corner:${nearestCorner.index}`,
      snap: {
        key: `${object.uuid}:corner:${nearestCorner.index}`,
        type: 'corner',
        point: toPoint3(worldPoint),
      },
    };
  }

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

  const edgeSnapThreshold = baseSnapThreshold;
  if (nearest.distance > edgeSnapThreshold) return null;

  const start = new THREE.Vector3(...nearest.edge.start);
  const end = new THREE.Vector3(...nearest.edge.end);
  const closest = closestPointOnSegment(localHit, start, end);
  const worldPoint = closest.clone().applyQuaternion(quaternion).add(center);
  const worldStart = start.clone().applyQuaternion(quaternion).add(center);
  const worldEnd = end.clone().applyQuaternion(quaternion).add(center);

  return {
    key: `${findUserData(object, 'liveDimensionKey') || object.uuid}:${nearest.edge.axis}:${nearest.edge.start.join(',')}`,
    snap: {
      key: `${object.uuid}:edge:${nearest.edge.axis}:${nearest.edge.start.join(',')}`,
      type: 'edge',
      point: toPoint3(worldPoint),
      edge: nearest.edge,
      edgeStart: toPoint3(worldStart),
      edgeEnd: toPoint3(worldEnd),
    },
  };
};

const TapeLabel: React.FC<{ position: [number, number, number]; start: [number, number, number]; end: [number, number, number] }> = ({ position, start, end }) => {
  const offsets = getOffsetMm(start, end);
  return (
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
        flexDirection: 'column',
        gap: '2px',
        color: '#111827',
        fontSize: '13px',
        fontWeight: 800,
        lineHeight: 1.12,
        whiteSpace: 'nowrap',
        padding: '4px 7px',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.88)',
        border: '1px solid rgba(15, 23, 42, 0.18)',
        boxShadow: '0 5px 16px rgba(15, 23, 42, 0.18)',
      }}
    >
      <span>{getDistanceMm(start, end)}</span>
      <span style={{ color: '#475569', fontSize: 10, fontWeight: 700 }}>
        X {offsets.x} · Y {offsets.y} · Z {offsets.z}
      </span>
    </div>
  </Html>
  );
};

const TapeSnapDot: React.FC<{ snap: TapeSnap; selected?: boolean }> = ({ snap, selected = false }) => {
  const { camera } = useThree();
  const size = getBillboardScale(camera, snap.point, selected ? 0.095 : 0.075);
  const color = snap.type === 'corner' ? TAPE_CORNER_COLOR : TAPE_EDGE_COLOR;
  return (
    <mesh position={snap.point} renderOrder={100040} userData={{ tapeMeasureOverlay: true }}>
      <sphereGeometry args={[size, 18, 18]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={selected ? 1 : 0.94} />
    </mesh>
  );
};

const TapeEdgeHoverLabel: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  value: number;
}> = ({ start, end, value }) => {
  const { camera } = useThree();
  const midpoint = new THREE.Vector3(...start).add(new THREE.Vector3(...end)).multiplyScalar(0.5);
  const labelOffset = camera.position.clone().sub(midpoint).normalize().multiplyScalar(0.18);
  const position = toPoint3(midpoint.add(labelOffset));

  return (
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
          color: '#111827',
          fontSize: '14px',
          fontWeight: 900,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          textShadow: '0 1px 2px rgba(255,255,255,0.95), 0 0 3px rgba(255,255,255,0.9)',
        }}
      >
        {value}
      </div>
    </Html>
  );
};

const TapeMeasureLine: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  guidePoint: [number, number, number] | null;
  preview?: boolean;
}> = ({ start, end, guidePoint, preview = false }) => {
  const { camera } = useThree();
  const axis = getAxisForVector(start, end);
  const offset = getDimensionOffset(start, end, guidePoint, camera);
  const offsetStart = toPoint3(new THREE.Vector3(...start).add(offset));
  const offsetEnd = toPoint3(new THREE.Vector3(...end).add(offset));
  const midpoint = new THREE.Vector3(...offsetStart).add(new THREE.Vector3(...offsetEnd)).multiplyScalar(0.5);
  const labelOffset = camera.position.clone().sub(midpoint).normalize().multiplyScalar(0.12);
  const labelPosition = toPoint3(midpoint.add(labelOffset));

  return (
    <group userData={{ tapeMeasureOverlay: true }}>
      <Line
        points={[start, end]}
        color={AXIS_COLORS[axis]}
        lineWidth={1}
        transparent
        opacity={0.28}
        depthTest={false}
        renderOrder={100028}
      />
      <Line
        points={[start, offsetStart]}
        color="#64748b"
        lineWidth={1.25}
        transparent
        opacity={0.72}
        depthTest={false}
        renderOrder={100029}
        dashed
        dashSize={0.065}
        gapSize={0.04}
      />
      <Line
        points={[end, offsetEnd]}
        color="#64748b"
        lineWidth={1.25}
        transparent
        opacity={0.72}
        depthTest={false}
        renderOrder={100029}
        dashed
        dashSize={0.065}
        gapSize={0.04}
      />
      <Line
        points={[offsetStart, offsetEnd]}
        color={AXIS_COLORS[axis]}
        lineWidth={preview ? 2 : 2.6}
        transparent
        opacity={preview ? 0.68 : 1}
        depthTest={false}
        renderOrder={100030}
      />
      <TapeSnapDot snap={{ key: 'start', type: 'corner', point: start }} selected={!preview} />
      <TapeSnapDot snap={{ key: 'end', type: 'corner', point: end }} selected={!preview} />
      <TapeLabel position={labelPosition} start={start} end={end} />
    </group>
  );
};

const TapeMeasureOverlay: React.FC<{
  hover: TapeHover | null;
  startSnap: TapeSnap | null;
  endSnap: TapeSnap | null;
  guidePoint: [number, number, number] | null;
  measurement: TapeMeasurement | null;
  pointMeasureMode: boolean;
}> = ({ hover, startSnap, endSnap, guidePoint, measurement, pointMeasureMode }) => {
  const edgeHover = hover?.snap.edgeStart && hover.snap.edgeEnd && hover.snap.edge
    ? {
      start: hover.snap.edgeStart,
      end: hover.snap.edgeEnd,
      lengthMm: hover.snap.edge.lengthMm,
    }
    : null;

  return (
    <group userData={{ tapeMeasureOverlay: true }}>
      {pointMeasureMode && measurement && (
        <TapeMeasureLine
          start={measurement.start}
          end={measurement.end}
          guidePoint={measurement.guidePoint}
        />
      )}

      {pointMeasureMode && startSnap && !endSnap && hover?.snap.type === 'corner' && (
        <TapeMeasureLine
          start={startSnap.point}
          end={hover.snap.point}
          guidePoint={hover.snap.point}
          preview
        />
      )}

      {pointMeasureMode && startSnap && endSnap && (
        <TapeMeasureLine
          start={startSnap.point}
          end={endSnap.point}
          guidePoint={guidePoint}
          preview
        />
      )}

      {pointMeasureMode && startSnap && <TapeSnapDot snap={startSnap} selected />}
      {pointMeasureMode && endSnap && <TapeSnapDot snap={endSnap} selected />}

      {edgeHover && (
        <Line
          points={[edgeHover.start, edgeHover.end]}
          color={TAPE_EDGE_COLOR}
          lineWidth={2}
          transparent
          opacity={0.78}
          depthTest={false}
          renderOrder={100020}
        />
      )}
      {!pointMeasureMode && edgeHover && (
        <TapeEdgeHoverLabel
          start={edgeHover.start}
          end={edgeHover.end}
          value={edgeHover.lengthMm}
        />
      )}

      {pointMeasureMode && hover?.snap && <TapeSnapDot snap={hover.snap} />}
    </group>
  );
};

const TapeMeasureInspector: React.FC<TapeMeasureInspectorProps> = ({ enabled }) => {
  const { camera, scene, gl } = useThree();
  const { setLiveDimensionSelectedKey } = useUIStore();
  const setExcludedKeys = useExcludedPanelsStore(state => state.setExcludedKeys);
  const clearExcludedKeys = useExcludedPanelsStore(state => state.clearExcludedKeys);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const rafRef = useRef<number | null>(null);
  const lastEventRef = useRef<PointerEvent | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const handledPointerClickRef = useRef(false);
  const selectedKeyRef = useRef<string | null>(null);
  const selectedTargetRef = useRef<THREE.Object3D | null>(null);
  const tapeExcludedKeysRef = useRef<Set<string>>(new Set());
  const excludedOwnerIdRef = useRef(`tape-measure-${Math.random().toString(36).slice(2)}`);
  const pointMeasureModeRef = useRef(false);
  const startSnapRef = useRef<TapeSnap | null>(null);
  const endSnapRef = useRef<TapeSnap | null>(null);
  const guidePointRef = useRef<[number, number, number] | null>(null);
  const [pointMeasureMode, setPointMeasureMode] = useState(false);
  const [hover, setHover] = useState<TapeHover | null>(null);
  const [startSnap, setStartSnap] = useState<TapeSnap | null>(null);
  const [endSnap, setEndSnap] = useState<TapeSnap | null>(null);
  const [guidePoint, setGuidePoint] = useState<[number, number, number] | null>(null);
  const [measurement, setMeasurement] = useState<TapeMeasurement | null>(null);

  useEffect(() => {
    startSnapRef.current = startSnap;
    endSnapRef.current = endSnap;
    guidePointRef.current = guidePoint;
  }, [startSnap, endSnap, guidePoint]);

  useEffect(() => {
    const canvas = gl.domElement;
    const previousCursor = canvas.style.cursor;
    if (enabled) canvas.style.cursor = TAPE_CURSOR;

    return () => {
      canvas.style.cursor = previousCursor;
    };
  }, [enabled, gl]);

  useEffect(() => {
    if (!enabled) {
      setHover(null);
      setStartSnap(null);
      setEndSnap(null);
      setGuidePoint(null);
      setMeasurement(null);
      pointMeasureModeRef.current = false;
      setPointMeasureMode(false);
      selectedTargetRef.current = null;
      tapeExcludedKeysRef.current.clear();
      clearExcludedKeys(excludedOwnerIdRef.current);
      setLiveDimensionSelectedKey(null);
      return;
    }

    const canvas = gl.domElement;

    const restoreHiddenPanels = () => {
      tapeExcludedKeysRef.current.clear();
      clearExcludedKeys(excludedOwnerIdRef.current);
    };

    const pickTapePoint = (event: PointerEvent | MouseEvent): TapePickResult => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      scene.updateMatrixWorld(true);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((item) => shouldInspectObject(item.object));
      const hoverResult = hit ? getTapeHover(hit.object, hit.point) : null;
      const target = hit ? getTemporaryHideTarget(hit.object) : null;
      const selectionKey = hit ? getSelectionKey(hit.object) : null;
      const visibleHit = intersects.find((item) => {
        const data = item.object.userData || {};
        return isVisibleInHierarchy(item.object) && !data.tapeMeasureOverlay && !data.liveDimensionOverlay && !data.decoration;
      });

      if (visibleHit) {
        return {
          hover: hoverResult,
          point: toPoint3(visibleHit.point),
          target,
          selectionKey,
        };
      }

      const currentStartSnap = startSnapRef.current;
      const currentEndSnap = endSnapRef.current;
      if (currentStartSnap && currentEndSnap) {
        const midpoint = new THREE.Vector3(...currentStartSnap.point).add(new THREE.Vector3(...currentEndSnap.point)).multiplyScalar(0.5);
        const normal = camera.getWorldDirection(new THREE.Vector3()).normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, midpoint);
        const point = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, point)) {
          return {
            hover: hoverResult,
            point: toPoint3(point),
            target,
            selectionKey,
          };
        }
      }

      return { hover: hoverResult, point: hoverResult?.snap.point ?? null, target, selectionKey };
    };

    const selectPanel = (target: THREE.Object3D | null, selectionKey: string | null) => {
      selectedTargetRef.current = target;
      selectedKeyRef.current = selectionKey;
      setLiveDimensionSelectedKey(selectionKey);
    };

    const hideSelectedPanel = () => {
      const target = selectedTargetRef.current;
      const keys = target
        ? getExclusionKeys(target)
        : getExclusionKeysFromSelectionKey(selectedKeyRef.current || useUIStore.getState().liveDimensionSelectedKey);
      if (keys.size === 0) return;
      keys.forEach(key => tapeExcludedKeysRef.current.add(key));
      setExcludedKeys(new Set(tapeExcludedKeysRef.current), excludedOwnerIdRef.current);
      selectedTargetRef.current = null;
      selectedKeyRef.current = null;
      setLiveDimensionSelectedKey(null);
      setHover(null);
    };

    const updateHover = () => {
      rafRef.current = null;
      const event = lastEventRef.current;
      if (!event) return;

      const next = pickTapePoint(event);
      if (pointMeasureModeRef.current && startSnapRef.current && endSnapRef.current && next.point) {
        setGuidePoint(next.point);
      }
      setHover((prev) => {
        if (
          prev &&
          next.hover &&
          prev.key === next.hover.key &&
          prev.snap.type === next.hover.snap.type &&
          prev.snap.point[0] === next.hover.snap.point[0] &&
          prev.snap.point[1] === next.hover.snap.point[1] &&
          prev.snap.point[2] === next.hover.snap.point[2]
        ) {
          return prev;
        }
        return next.hover;
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

    const runTapeClick = (event: PointerEvent | MouseEvent) => {
      if (event.button === 2) return false;
      const next = pickTapePoint(event);
      const hasActivePointMeasurement = pointMeasureModeRef.current && (!!startSnapRef.current || !!endSnapRef.current);
      if (!next.hover && !next.target && !hasActivePointMeasurement) {
        selectPanel(null, null);
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      selectPanel(next.target, next.selectionKey);
      if (!pointMeasureModeRef.current) {
        setStartSnap(null);
        setEndSnap(null);
        setGuidePoint(null);
        setMeasurement(null);
        return true;
      }

      const currentStartSnap = startSnapRef.current;
      const currentEndSnap = endSnapRef.current;
      const currentGuidePoint = guidePointRef.current;

      if (currentStartSnap && currentEndSnap) {
        setMeasurement({
          start: currentStartSnap.point,
          end: currentEndSnap.point,
          guidePoint: next.point ?? currentGuidePoint ?? currentEndSnap.point,
        });
        setStartSnap(null);
        setEndSnap(null);
        setGuidePoint(null);
        return true;
      }

      if (!next.hover || next.hover.snap.type !== 'corner') {
        setStartSnap(null);
        setEndSnap(null);
        setGuidePoint(null);
        setMeasurement(null);
        return true;
      }

      if (!currentStartSnap) {
        setMeasurement(null);
        setStartSnap(next.hover.snap);
        setEndSnap(null);
        setGuidePoint(null);
        return true;
      }

      const distanceMm = getDistanceMm(currentStartSnap.point, next.hover.snap.point);
      if (distanceMm <= 0) return true;
      setEndSnap(next.hover.snap);
      setGuidePoint(next.point ?? next.hover.snap.point);
      return true;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        pointerDownRef.current = {
          x: event.clientX,
          y: event.clientY,
          button: event.button,
        };
        return;
      }

      if (event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const next = pickTapePoint(event);
      if (next.target && next.selectionKey) {
        selectPanel(next.target, next.selectionKey);
      }
      hideSelectedPanel();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down || down.button !== 0 || event.button !== 0) return;

      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      if ((dx * dx) + (dy * dy) > 25) return;

      handledPointerClickRef.current = runTapeClick(event);
    };

    const handleCanvasClick = (event: MouseEvent) => {
      if (handledPointerClickRef.current) {
        handledPointerClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      runTapeClick(event);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;

      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        hideSelectedPanel();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        const nextMode = !pointMeasureModeRef.current;
        pointMeasureModeRef.current = nextMode;
        setPointMeasureMode(nextMode);
        setStartSnap(null);
        setEndSnap(null);
        setGuidePoint(null);
        setMeasurement(null);
        return;
      }

      if (event.key === 'Escape') {
        setStartSnap(null);
        setEndSnap(null);
        setGuidePoint(null);
        setMeasurement(null);
        pointMeasureModeRef.current = false;
        setPointMeasureMode(false);
        restoreHiddenPanels();
        selectedTargetRef.current = null;
        selectedKeyRef.current = null;
        setLiveDimensionSelectedKey(null);
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setMeasurement(null);
        setStartSnap(null);
        setEndSnap(null);
        setGuidePoint(null);
        selectedTargetRef.current = null;
        selectedKeyRef.current = null;
        setLiveDimensionSelectedKey(null);
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointerdown', handlePointerDown, true);
    canvas.addEventListener('pointerup', handlePointerUp, true);
    canvas.addEventListener('click', handleCanvasClick, true);
    canvas.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('pointerdown', handlePointerDown, true);
      canvas.removeEventListener('pointerup', handlePointerUp, true);
      canvas.removeEventListener('click', handleCanvasClick, true);
      canvas.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('keydown', handleKeyDown);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      restoreHiddenPanels();
      selectedTargetRef.current = null;
      selectedKeyRef.current = null;
      setLiveDimensionSelectedKey(null);
      setHover(null);
    };
  }, [enabled, gl, camera, scene, pointer, raycaster, setLiveDimensionSelectedKey, setExcludedKeys, clearExcludedKeys]);

  if (!enabled) return null;
  return (
    <TapeMeasureOverlay
      hover={hover}
      startSnap={startSnap}
      endSnap={endSnap}
      guidePoint={guidePoint}
      measurement={measurement}
      pointMeasureMode={pointMeasureMode}
    />
  );
};

export default TapeMeasureInspector;
