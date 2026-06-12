import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useUIStore } from '@/store/uiStore';
import { getExcludedPanelAliases, useExcludedPanelsStore } from '../../context/ExcludedPanelsContext';

interface LiveDimensionInspectorProps {
  enabled: boolean;
}

interface HoverDimension {
  key: string;
  selectionKey: string;
  label: string;
  center: [number, number, number];
  quaternion: [number, number, number, number];
  sizeThree: [number, number, number];
  notchLines?: LineSegment[];
  sideNotches?: SideNotchDimension[];
  faceGrooves?: FaceGrooveDimension[];
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

interface ViewSigns {
  x: 1 | -1;
  y: 1 | -1;
  z: 1 | -1;
}

type DimensionAxis = 'x' | 'y' | 'z';
type Point3 = [number, number, number];
type LineSegment = [Point3, Point3];

interface SideNotchDimension {
  y: number;
  z: number;
  fromBottom: number;
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
  heightMm: number;
  lengthMm: number;
  grooveWidthMm?: number;
  cutDepthMm: number;
}

const THREE_UNITS_TO_MM = 100;
const PANEL_GRID_MINOR_COLOR = '#343a40';
const PANEL_GRID_MAJOR_COLOR = '#111827';
const DIMENSION_GUIDE_COLOR = '#ea580c';

const getCameraViewSigns = (
  camera: THREE.Camera,
  center: [number, number, number],
  quaternion: [number, number, number, number]
): ViewSigns => {
  const localCamera = camera.position
    .clone()
    .sub(new THREE.Vector3(center[0], center[1], center[2]))
    .applyQuaternion(new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]).invert());

  return {
    x: localCamera.x >= 0 ? 1 : -1,
    y: localCamera.y >= 0 ? 1 : -1,
    z: localCamera.z >= 0 ? 1 : -1,
  };
};

const getThemePrimaryColor = () => {
  if (typeof window !== 'undefined') {
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary').trim();
    if (primaryColor) return primaryColor;
  }
  return '#3b82f6';
};

const createPanelGridPositions = (w: number, h: number, d: number) => {
  const minor: number[] = [];
  const major: number[] = [];
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const offset = 0.006;
  const minorStep = 0.1; // 10mm
  const majorEvery = 10; // 100mm

  const push = (target: number[], a: [number, number, number], b: [number, number, number]) => {
    target.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  };

  const forGridLines = (length: number, fn: (offsetFromStart: number, isMajor: boolean) => void) => {
    const steps = Math.max(1, Math.min(600, Math.round(length / minorStep)));
    for (let i = 0; i <= steps; i += 1) {
      const offsetFromStart = (length * i) / steps;
      fn(offsetFromStart, i % majorEvery === 0 || i === steps);
    }
  };

  const addXYFace = (z: number) => {
    forGridLines(w, (offsetFromStart, isMajor) => {
      const x = x0 + offsetFromStart;
      push(isMajor ? major : minor, [x, y0, z], [x, y1, z]);
    });
    forGridLines(h, (offsetFromStart, isMajor) => {
      const y = y0 + offsetFromStart;
      push(isMajor ? major : minor, [x0, y, z], [x1, y, z]);
    });
  };

  const addXZFace = (y: number) => {
    forGridLines(w, (offsetFromStart, isMajor) => {
      const x = x0 + offsetFromStart;
      push(isMajor ? major : minor, [x, y, z0], [x, y, z1]);
    });
    forGridLines(d, (offsetFromStart, isMajor) => {
      const z = z0 + offsetFromStart;
      push(isMajor ? major : minor, [x0, y, z], [x1, y, z]);
    });
  };

  const addYZFace = (x: number) => {
    forGridLines(h, (offsetFromStart, isMajor) => {
      const y = y0 + offsetFromStart;
      push(isMajor ? major : minor, [x, y, z0], [x, y, z1]);
    });
    forGridLines(d, (offsetFromStart, isMajor) => {
      const z = z0 + offsetFromStart;
      push(isMajor ? major : minor, [x, y0, z], [x, y1, z]);
    });
  };

  addXYFace(z1 + offset);
  addXYFace(z0 - offset);
  addXZFace(y1 + offset);
  addXZFace(y0 - offset);
  addYZFace(x1 + offset);
  addYZFace(x0 - offset);

  return {
    minor: new Float32Array(minor),
    major: new Float32Array(major),
  };
};

const createBoxOutlineSegments = (w: number, h: number, d: number) => {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const z0 = -d / 2;
  const z1 = d / 2;

  return [
    [[x0, y0, z0], [x1, y0, z0]],
    [[x1, y0, z0], [x1, y1, z0]],
    [[x1, y1, z0], [x0, y1, z0]],
    [[x0, y1, z0], [x0, y0, z0]],
    [[x0, y0, z1], [x1, y0, z1]],
    [[x1, y0, z1], [x1, y1, z1]],
    [[x1, y1, z1], [x0, y1, z1]],
    [[x0, y1, z1], [x0, y0, z1]],
    [[x0, y0, z0], [x0, y0, z1]],
    [[x1, y0, z0], [x1, y0, z1]],
    [[x1, y1, z0], [x1, y1, z1]],
    [[x0, y1, z0], [x0, y1, z1]],
  ] as [number, number, number][][];
};

const normalizeLineSegments = (value: unknown): LineSegment[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const lines = value
    .map((line) => {
      if (!Array.isArray(line) || line.length !== 2) return null;
      const start = line[0];
      const end = line[1];
      if (!Array.isArray(start) || !Array.isArray(end) || start.length !== 3 || end.length !== 3) return null;
      const normalizedStart = start.map(Number) as Point3;
      const normalizedEnd = end.map(Number) as Point3;
      if (
        normalizedStart.some((v) => !Number.isFinite(v)) ||
        normalizedEnd.some((v) => !Number.isFinite(v))
      ) {
        return null;
      }
      return [normalizedStart, normalizedEnd] as LineSegment;
    })
    .filter((line): line is LineSegment => Boolean(line));

  return lines.length > 0 ? lines : undefined;
};

const normalizeSideNotches = (value: unknown): SideNotchDimension[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const notches = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Partial<SideNotchDimension>;
      const y = Number(source.y);
      const z = Number(source.z);
      const fromBottom = Number(source.fromBottom);
      const heightMm = Number(source.heightMm);
      const depthMm = Number(source.depthMm);
      if (![y, z, fromBottom, heightMm, depthMm].every(Number.isFinite)) return null;
      if (y <= 0 || z <= 0) return null;
      return { y, z, fromBottom, heightMm, depthMm };
    })
    .filter((item): item is SideNotchDimension => Boolean(item));

  return notches.length > 0 ? notches : undefined;
};

const normalizeFaceGrooves = (value: unknown): FaceGrooveDimension[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const grooves = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Partial<FaceGrooveDimension>;
      const face = source.face === 'left' || source.face === 'right' ? source.face : null;
      const fromY = Number(source.fromY);
      const height = Number(source.height);
      const fromZ = Number(source.fromZ);
      const depth = Number(source.depth);
      const cutDepth = Number(source.cutDepth);
      const heightMm = Number(source.heightMm);
      const lengthMm = Number(source.lengthMm);
      const grooveWidthMm = Number(source.grooveWidthMm ?? source.lengthMm);
      const cutDepthMm = Number(source.cutDepthMm);
      if (!face) return null;
      if (![fromY, height, fromZ, depth, cutDepth, heightMm, lengthMm, grooveWidthMm, cutDepthMm].every(Number.isFinite)) return null;
      if (height <= 0 || depth <= 0 || cutDepth <= 0) return null;
      return { face, fromY, height, fromZ, depth, cutDepth, heightMm, lengthMm, grooveWidthMm, cutDepthMm };
    })
    .filter((item): item is FaceGrooveDimension => Boolean(item));

  return grooves.length > 0 ? grooves : undefined;
};

const findUserData = (object: THREE.Object3D, key: string): unknown => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData && current.userData[key] !== undefined) return current.userData[key];
    current = current.parent;
  }
  return undefined;
};

const findUserDataOwner = (object: THREE.Object3D, key: string): THREE.Object3D | null => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData && current.userData[key] !== undefined) return current;
    current = current.parent;
  }
  return null;
};

const getScanExclusionKeys = (object: THREE.Object3D) => {
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

const getScanExclusionKeysFromSelectionKey = (selectionKey: string | null | undefined) => {
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

const hasInspectableMetadata = (object: THREE.Object3D) => {
  return Boolean(
    findUserData(object, 'liveDimension') ||
    findUserData(object, 'panelName') ||
    findUserData(object, 'furnitureId')
  );
};

const hasHiddenAncestor = (object: THREE.Object3D) => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return true;
    current = current.parent;
  }
  return false;
};

const hasExcludedScanAncestor = (object: THREE.Object3D) => {
  let current: THREE.Object3D | null = object;
  while (current) {
    const data = current.userData || {};
    if (
      data.liveDimensionOverlay ||
      data.tapeMeasureOverlay ||
      data.decoration ||
      data.panelSimulationMovingPanels ||
      data.panelSimulationBoard ||
      data.dimensionLine ||
      data.measureLine
    ) {
      return true;
    }
    const name = current.name || '';
    if (
      name.includes('dimension') ||
      name.includes('grid') ||
      name.includes('axis') ||
      name.includes('ghost') ||
      name.includes('highlight') ||
      name.includes('pick-helper') ||
      name.includes('placement')
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const shouldInspectObject = (object: THREE.Object3D): object is THREE.Mesh => {
  if (!(object instanceof THREE.Mesh) || !object.visible) return false;
  if (hasHiddenAncestor(object) || hasExcludedScanAncestor(object)) return false;
  if (object.userData?.liveDimensionOverlay || object.userData?.decoration) return false;
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
  if (materials.some((mat) => mat.visible === false)) return false;
  if (materials.length > 0 && materials.every((mat) => mat.transparent && mat.opacity <= 0.03)) return false;

  return true;
};

const formatMeshName = (object: THREE.Object3D) => {
  const raw = String(findUserData(object, 'panelName') || object.name || 'Mesh');
  if (raw === 'top-frame') return '상부몰딩';
  if (raw === 'base-frame' || raw.startsWith('base-frame-')) return '걸레받이';
  if (raw === 'left-surround-ep') return '좌측 서라운드 프레임';
  if (raw === 'right-surround-ep') return '우측 서라운드 프레임';
  if (raw === 'left-surround-inner-side') return '좌측 서라운드 안쪽 프레임';
  if (raw === 'right-surround-inner-side') return '우측 서라운드 안쪽 프레임';
  if (raw === 'left-surround-inner-front') return '좌측 서라운드 정면 프레임';
  if (raw === 'right-surround-inner-front') return '우측 서라운드 정면 프레임';
  if (raw === 'Insert상단프레임') return '키큰장찬넬 상단프레임';
  if (raw === 'Insert걸레받이') return '키큰장찬넬 걸레받이';
  return raw
    .replace(/^furniture-mesh-/, '')
    .replace(/^back-panel-mesh-/, '')
    .replace(/^clothing-rod-mesh$/, '옷봉');
};

const getHoverDimension = (object: THREE.Object3D): HoverDimension | null => {
  object.updateMatrixWorld(true);
  const center = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const size = new THREE.Vector3();

  const explicitOwner = findUserDataOwner(object, 'liveDimension');
  const metadataObject = explicitOwner || object;
  const explicit = explicitOwner?.userData?.liveDimension;
  metadataObject.updateMatrixWorld(true);
  metadataObject.matrixWorld.decompose(center, quaternion, scale);

  if (explicit) {
    if (explicit.useObjectBounds && metadataObject instanceof THREE.Mesh && metadataObject.geometry) {
      if (!metadataObject.geometry.boundingBox) {
        metadataObject.geometry.computeBoundingBox();
      }
      const box = metadataObject.geometry.boundingBox;
      if (!box || box.isEmpty()) return null;

      const localCenter = new THREE.Vector3();
      box.getCenter(localCenter);
      box.getSize(size);
      center.copy(localCenter.applyMatrix4(metadataObject.matrixWorld));
      size.set(
        Math.abs(size.x * scale.x),
        Math.abs(size.y * scale.y),
        Math.abs(size.z * scale.z)
      );
    } else if (explicit.useObjectBounds) {
      const box = new THREE.Box3().setFromObject(metadataObject);
      if (box.isEmpty()) return null;
      box.getCenter(center);
      box.getSize(size);
      quaternion.identity();
    } else if (Array.isArray(explicit.sizeThree) && explicit.sizeThree.length === 3) {
      size.set(
        Math.max(0.001, Math.abs((Number(explicit.sizeThree[0]) || 0) * scale.x)),
        Math.max(0.001, Math.abs((Number(explicit.sizeThree[1]) || 0) * scale.y)),
        Math.max(0.001, Math.abs((Number(explicit.sizeThree[2]) || 0) * scale.z))
      );
    } else {
      size.set(
        Math.max(0.001, Math.abs((explicit.widthMm / THREE_UNITS_TO_MM) * scale.x)),
        Math.max(0.001, Math.abs((explicit.heightMm / THREE_UNITS_TO_MM) * scale.y)),
        Math.max(0.001, Math.abs((explicit.depthMm / THREE_UNITS_TO_MM) * scale.z))
      );
    }
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
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    box.getCenter(center);
    box.getSize(size);
    quaternion.identity();
  }

  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null;

  const widthMm = explicit?.widthMm ?? Math.round(size.x * THREE_UNITS_TO_MM);
  const heightMm = explicit?.heightMm ?? Math.round(size.y * THREE_UNITS_TO_MM);
  const depthMm = explicit?.depthMm ?? Math.round(size.z * THREE_UNITS_TO_MM);

  return {
    key: String(findUserData(metadataObject, 'liveDimensionKey') || metadataObject.uuid),
    selectionKey: String(findUserData(metadataObject, 'liveDimensionKey') || metadataObject.uuid),
    label: formatMeshName(metadataObject),
    center: [center.x, center.y, center.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    sizeThree: [size.x, size.y, size.z],
    notchLines: normalizeLineSegments(findUserData(object, 'liveDimensionNotchLines')),
    sideNotches: normalizeSideNotches(findUserData(object, 'liveDimensionSideNotches')),
    faceGrooves: normalizeFaceGrooves(findUserData(object, 'liveDimensionFaceGrooves')),
    widthMm,
    heightMm,
    depthMm,
  };
};

const DimensionLabel: React.FC<{
  position: [number, number, number];
  color: string;
  variant?: 'default' | 'summary';
  children: React.ReactNode;
}> = ({ position, color, variant = 'default', children }) => (
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
        padding: variant === 'summary' ? '5px 10px' : '3px 7px',
        borderRadius: '4px',
        background: variant === 'summary' ? 'rgba(8, 15, 23, 0.94)' : 'rgba(8, 15, 23, 0.9)',
        border: `1px solid ${color}`,
        color: '#ffffff',
        fontSize: variant === 'summary' ? '13px' : '11px',
        fontWeight: variant === 'summary' ? 800 : 700,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      {children}
    </div>
  </Html>
);

const PanelCenterTitle: React.FC<{
  position: [number, number, number];
  children: React.ReactNode;
}> = ({ position, children }) => (
  <Html
    position={position}
    center
    occlude={false}
    transform={false}
    style={{ pointerEvents: 'none' }}
    zIndexRange={[10001, 10]}
  >
    <div
      style={{
        padding: '3px 7px',
        borderRadius: '3px',
        background: 'rgba(8, 15, 23, 0.74)',
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: 800,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        maxWidth: '180px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        boxShadow: '0 1px 5px rgba(0,0,0,0.22)',
      }}
    >
      {children}
    </div>
  </Html>
);

const LiveDimensionOverlay: React.FC<{ hover: HoverDimension }> = ({ hover }) => {
  const { camera } = useThree();
  const [w, h, d] = hover.sizeThree;
  const [viewSigns, setViewSigns] = useState<ViewSigns>(() => getCameraViewSigns(camera, hover.center, hover.quaternion));
  const gridPositions = useMemo(() => createPanelGridPositions(w, h, d), [w, h, d]);
  const outlineSegments = useMemo(() => hover.notchLines ?? createBoxOutlineSegments(w, h, d), [hover.notchLines, w, h, d]);
  const inspectorColor = useMemo(() => getThemePrimaryColor(), []);
  const margin = Math.max(0.18, Math.min(0.55, Math.max(w, h, d) * 0.08));
  const axisSizes = useMemo<Record<DimensionAxis, number>>(() => ({ x: w, y: h, z: d }), [w, h, d]);
  const axisValues = useMemo<Record<DimensionAxis, number>>(() => ({
    x: hover.widthMm,
    y: hover.heightMm,
    z: hover.depthMm,
  }), [hover.widthMm, hover.heightMm, hover.depthMm]);

  useFrame(() => {
    const nextSigns = getCameraViewSigns(camera, hover.center, hover.quaternion);
    setViewSigns((prev) => (
      prev.x === nextSigns.x && prev.y === nextSigns.y && prev.z === nextSigns.z
        ? prev
        : nextSigns
    ));
  });

  const thicknessAxis = useMemo<DimensionAxis>(() => {
    const entries = Object.entries(axisSizes) as [DimensionAxis, number][];
    return entries.reduce((smallest, current) => current[1] < smallest[1] ? current : smallest)[0];
  }, [axisSizes]);
  const faceVerticalAxis = thicknessAxis === 'y' ? (axisSizes.x >= axisSizes.z ? 'x' : 'z') : 'y';
  const faceHorizontalAxis = (['x', 'y', 'z'] as DimensionAxis[])
    .find((axis) => axis !== thicknessAxis && axis !== faceVerticalAxis) || 'x';
  const visibleFaceAxisValue = (axis: DimensionAxis) => viewSigns[axis] * axisSizes[axis] / 2;
  const minAxisValue = (axis: DimensionAxis) => -axisSizes[axis] / 2;
  const maxAxisValue = (axis: DimensionAxis) => axisSizes[axis] / 2;
  const point = (values: Partial<Record<DimensionAxis, number>>): [number, number, number] => [
    values.x ?? 0,
    values.y ?? 0,
    values.z ?? 0,
  ];

  const faceHorizontalLineOffset = visibleFaceAxisValue(faceVerticalAxis) + viewSigns[faceVerticalAxis] * margin;
  const faceVerticalLineOffset = visibleFaceAxisValue(faceHorizontalAxis) + viewSigns[faceHorizontalAxis] * margin;
  const thicknessLineHorizontalOffset = visibleFaceAxisValue(faceHorizontalAxis) + viewSigns[faceHorizontalAxis] * margin;
  const faceDepthEdge = visibleFaceAxisValue(thicknessAxis);
  const faceVerticalEdge = visibleFaceAxisValue(faceVerticalAxis);
  const faceHorizontalEdge = visibleFaceAxisValue(faceHorizontalAxis);

  const faceHorizontalStart = point({
    [faceHorizontalAxis]: minAxisValue(faceHorizontalAxis),
    [faceVerticalAxis]: faceHorizontalLineOffset,
    [thicknessAxis]: faceDepthEdge,
  });
  const faceHorizontalEnd = point({
    [faceHorizontalAxis]: maxAxisValue(faceHorizontalAxis),
    [faceVerticalAxis]: faceHorizontalLineOffset,
    [thicknessAxis]: faceDepthEdge,
  });
  const faceVerticalStart = point({
    [faceHorizontalAxis]: faceVerticalLineOffset,
    [faceVerticalAxis]: minAxisValue(faceVerticalAxis),
    [thicknessAxis]: faceDepthEdge,
  });
  const faceVerticalEnd = point({
    [faceHorizontalAxis]: faceVerticalLineOffset,
    [faceVerticalAxis]: maxAxisValue(faceVerticalAxis),
    [thicknessAxis]: faceDepthEdge,
  });
  const thicknessStart = point({
    [faceHorizontalAxis]: thicknessLineHorizontalOffset,
    [faceVerticalAxis]: faceVerticalEdge,
    [thicknessAxis]: minAxisValue(thicknessAxis),
  });
  const thicknessEnd = point({
    [faceHorizontalAxis]: thicknessLineHorizontalOffset,
    [faceVerticalAxis]: faceVerticalEdge,
    [thicknessAxis]: maxAxisValue(thicknessAxis),
  });
  const lineProps = {
    color: DIMENSION_GUIDE_COLOR,
    lineWidth: 1.15,
    transparent: true,
    opacity: 0.82,
    depthTest: false,
    renderOrder: 100000,
  } as const;
  const endpointLineProps = {
    color: DIMENSION_GUIDE_COLOR,
    lineWidth: 1.15,
    transparent: true,
    opacity: 0.78,
    depthTest: false,
    renderOrder: 100001,
  } as const;
  const endpointHalfLength = Math.max(0.045, Math.min(0.09, margin * 0.18));
  const sideNotchGuides = useMemo(() => {
    if (!hover.sideNotches?.length) return [];
    const sideX = viewSigns.x * (w / 2 + 0.012);

    return hover.sideNotches.map((notchValue, index) => {
      const notchBottom = -h / 2 + notchValue.fromBottom;
      const notchTop = notchBottom + notchValue.y;
      const outerZ = d / 2;
      const innerZ = d / 2 - notchValue.z;

      return {
        index,
        depthLine: [
          [sideX, notchBottom, outerZ],
          [sideX, notchBottom, innerZ],
        ] as LineSegment,
        heightLine: [
          [sideX, notchBottom, innerZ],
          [sideX, notchTop, innerZ],
        ] as LineSegment,
        depthLabel: [sideX, notchBottom - margin * 0.13, (outerZ + innerZ) / 2] as Point3,
        heightLabel: [sideX, (notchBottom + notchTop) / 2, innerZ - margin * 0.12] as Point3,
        depthMm: notchValue.depthMm,
        heightMm: notchValue.heightMm,
      };
    });
  }, [hover.sideNotches, viewSigns.x, w, h, d, margin]);
  const faceGrooveGuides = useMemo(() => {
    if (!hover.faceGrooves?.length) return [];

    return hover.faceGrooves.map((groove, index) => {
      const faceSign = groove.face === 'right' ? 1 : -1;
      const faceX = faceSign * w / 2;
      const bottomX = faceX - faceSign * groove.cutDepth;
      const y0 = Math.max(-h / 2, Math.min(h / 2, -h / 2 + groove.fromY));
      const y1 = Math.max(y0, Math.min(h / 2, y0 + groove.height));
      const z0 = Math.max(-d / 2, Math.min(d / 2, -d / 2 + groove.fromZ));
      const z1 = Math.max(z0, Math.min(d / 2, z0 + groove.depth));
      const crossSectionZ = z1;
      const labelOffsetY = Math.min(0.08, Math.max(0.025, margin * 0.14));
      const labelOffsetX = faceSign * Math.min(0.08, Math.max(0.025, margin * 0.14));
      const showThicknessOnY = groove.height <= groove.depth;
      const thicknessLine = showThicknessOnY
        ? [[bottomX, y0, crossSectionZ], [bottomX, y1, crossSectionZ]]
        : [[bottomX, y1, z0], [bottomX, y1, z1]];
      const thicknessLabel = showThicknessOnY
        ? [bottomX + labelOffsetX, (y0 + y1) / 2, crossSectionZ]
        : [bottomX + labelOffsetX, y1, (z0 + z1) / 2];

      return {
        index,
        cutLine: [[faceX, y1, crossSectionZ], [bottomX, y1, crossSectionZ]] as LineSegment,
        heightLine: thicknessLine as LineSegment,
        cutLabel: [(faceX + bottomX) / 2, y1 + labelOffsetY, crossSectionZ] as Point3,
        heightLabel: thicknessLabel as Point3,
        cutDepthMm: groove.cutDepthMm,
        grooveWidthMm: groove.grooveWidthMm ?? groove.lengthMm,
      };
    });
  }, [hover.faceGrooves, w, h, d, margin]);

  return (
    <group position={hover.center} quaternion={hover.quaternion} userData={{ liveDimensionOverlay: true }}>
      {!hover.notchLines?.length && (
        <mesh renderOrder={99998}>
          <boxGeometry args={hover.sizeThree} />
          <meshBasicMaterial
            color={inspectorColor}
            wireframe
            transparent
            opacity={0.75}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
      <lineSegments renderOrder={99998}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[gridPositions.minor, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={PANEL_GRID_MINOR_COLOR} transparent opacity={0.32} depthTest depthWrite={false} />
      </lineSegments>
      <lineSegments renderOrder={99999}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[gridPositions.major, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={PANEL_GRID_MAJOR_COLOR} transparent opacity={0.78} depthTest depthWrite={false} linewidth={2} />
      </lineSegments>

      <lineSegments renderOrder={100000}>
        <edgesGeometry args={[new THREE.BoxGeometry(w, h, d)]} />
        <lineBasicMaterial color={inspectorColor} transparent opacity={1} depthTest={false} depthWrite={false} />
      </lineSegments>
      {outlineSegments.map((segment, index) => (
        <Line
          key={`selected-panel-outline-${index}`}
          points={segment}
          color={inspectorColor}
          lineWidth={4}
          depthTest={false}
          renderOrder={100002}
        />
      ))}
      <PanelCenterTitle position={point({ [thicknessAxis]: faceDepthEdge + viewSigns[thicknessAxis] * 0.018 })}>
        {hover.label}
      </PanelCenterTitle>
      {sideNotchGuides.map((guide) => (
        <React.Fragment key={`side-notch-guide-${guide.index}`}>
          <Line points={guide.depthLine} {...lineProps} />
          <Line points={guide.heightLine} {...lineProps} />
          <DimensionLabel position={guide.depthLabel} color={DIMENSION_GUIDE_COLOR}>
            {guide.depthMm}
          </DimensionLabel>
          <DimensionLabel position={guide.heightLabel} color={DIMENSION_GUIDE_COLOR}>
            {guide.heightMm}
          </DimensionLabel>
        </React.Fragment>
      ))}
      {faceGrooveGuides.map((guide) => (
        <React.Fragment key={`face-groove-guide-${guide.index}`}>
          <Line points={guide.cutLine} {...lineProps} />
          <Line points={guide.heightLine} {...lineProps} />
          <DimensionLabel position={guide.cutLabel} color={DIMENSION_GUIDE_COLOR}>
            {guide.cutDepthMm}
          </DimensionLabel>
          <DimensionLabel position={guide.heightLabel} color={DIMENSION_GUIDE_COLOR}>
            {guide.grooveWidthMm}
          </DimensionLabel>
        </React.Fragment>
      ))}

      <Line points={[faceHorizontalStart, faceHorizontalEnd]} {...lineProps} />
      <Line points={[faceVerticalStart, faceVerticalEnd]} {...lineProps} />
      <Line points={[thicknessStart, thicknessEnd]} {...lineProps} />
      <Line points={[point({ [faceHorizontalAxis]: minAxisValue(faceHorizontalAxis), [faceVerticalAxis]: faceVerticalEdge, [thicknessAxis]: faceDepthEdge }), faceHorizontalStart]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: maxAxisValue(faceHorizontalAxis), [faceVerticalAxis]: faceVerticalEdge, [thicknessAxis]: faceDepthEdge }), faceHorizontalEnd]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: faceHorizontalEdge, [faceVerticalAxis]: minAxisValue(faceVerticalAxis), [thicknessAxis]: faceDepthEdge }), faceVerticalStart]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: faceHorizontalEdge, [faceVerticalAxis]: maxAxisValue(faceVerticalAxis), [thicknessAxis]: faceDepthEdge }), faceVerticalEnd]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: faceHorizontalEdge, [faceVerticalAxis]: faceVerticalEdge, [thicknessAxis]: minAxisValue(thicknessAxis) }), thicknessStart]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: faceHorizontalEdge, [faceVerticalAxis]: faceVerticalEdge, [thicknessAxis]: maxAxisValue(thicknessAxis) }), thicknessEnd]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: minAxisValue(faceHorizontalAxis), [faceVerticalAxis]: faceHorizontalLineOffset - endpointHalfLength, [thicknessAxis]: faceDepthEdge }), point({ [faceHorizontalAxis]: minAxisValue(faceHorizontalAxis), [faceVerticalAxis]: faceHorizontalLineOffset + endpointHalfLength, [thicknessAxis]: faceDepthEdge })]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: maxAxisValue(faceHorizontalAxis), [faceVerticalAxis]: faceHorizontalLineOffset - endpointHalfLength, [thicknessAxis]: faceDepthEdge }), point({ [faceHorizontalAxis]: maxAxisValue(faceHorizontalAxis), [faceVerticalAxis]: faceHorizontalLineOffset + endpointHalfLength, [thicknessAxis]: faceDepthEdge })]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: faceVerticalLineOffset - endpointHalfLength, [faceVerticalAxis]: minAxisValue(faceVerticalAxis), [thicknessAxis]: faceDepthEdge }), point({ [faceHorizontalAxis]: faceVerticalLineOffset + endpointHalfLength, [faceVerticalAxis]: minAxisValue(faceVerticalAxis), [thicknessAxis]: faceDepthEdge })]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: faceVerticalLineOffset - endpointHalfLength, [faceVerticalAxis]: maxAxisValue(faceVerticalAxis), [thicknessAxis]: faceDepthEdge }), point({ [faceHorizontalAxis]: faceVerticalLineOffset + endpointHalfLength, [faceVerticalAxis]: maxAxisValue(faceVerticalAxis), [thicknessAxis]: faceDepthEdge })]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: thicknessLineHorizontalOffset - endpointHalfLength, [faceVerticalAxis]: faceVerticalEdge, [thicknessAxis]: minAxisValue(thicknessAxis) }), point({ [faceHorizontalAxis]: thicknessLineHorizontalOffset + endpointHalfLength, [faceVerticalAxis]: faceVerticalEdge, [thicknessAxis]: minAxisValue(thicknessAxis) })]} {...endpointLineProps} />
      <Line points={[point({ [faceHorizontalAxis]: thicknessLineHorizontalOffset - endpointHalfLength, [faceVerticalAxis]: faceVerticalEdge, [thicknessAxis]: maxAxisValue(thicknessAxis) }), point({ [faceHorizontalAxis]: thicknessLineHorizontalOffset + endpointHalfLength, [faceVerticalAxis]: faceVerticalEdge, [thicknessAxis]: maxAxisValue(thicknessAxis) })]} {...endpointLineProps} />

      <DimensionLabel position={point({ [faceVerticalAxis]: faceHorizontalLineOffset + viewSigns[faceVerticalAxis] * margin * 0.16, [thicknessAxis]: faceDepthEdge })} color={DIMENSION_GUIDE_COLOR}>
        {axisValues[faceHorizontalAxis]}
      </DimensionLabel>
      <DimensionLabel position={point({ [faceHorizontalAxis]: faceVerticalLineOffset + viewSigns[faceHorizontalAxis] * margin * 0.12, [thicknessAxis]: faceDepthEdge })} color={DIMENSION_GUIDE_COLOR}>
        {axisValues[faceVerticalAxis]}
      </DimensionLabel>
      <DimensionLabel position={point({ [faceHorizontalAxis]: thicknessLineHorizontalOffset + viewSigns[faceHorizontalAxis] * margin * 0.14, [faceVerticalAxis]: faceVerticalEdge })} color={DIMENSION_GUIDE_COLOR}>
        {axisValues[thicknessAxis]}
      </DimensionLabel>
    </group>
  );
};

const LiveDimensionInspector: React.FC<LiveDimensionInspectorProps> = ({ enabled }) => {
  const { camera, scene, gl } = useThree();
  const { liveDimensionSelectedKey, setLiveDimensionSelectedKey } = useUIStore();
  const setExcludedKeys = useExcludedPanelsStore(state => state.setExcludedKeys);
  const clearExcludedKeys = useExcludedPanelsStore(state => state.clearExcludedKeys);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const rafRef = useRef<number | null>(null);
  const lastEventRef = useRef<PointerEvent | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const handledPointerClickRef = useRef(false);
  const liveDimensionSelectedKeyRef = useRef<string | null>(null);
  const selectedTargetRef = useRef<THREE.Object3D | null>(null);
  const scanExcludedKeysRef = useRef<Set<string>>(new Set());
  const excludedOwnerIdRef = useRef(`scan-measure-${Math.random().toString(36).slice(2)}`);
  const [hover, setHover] = useState<HoverDimension | null>(null);
  const [selectedHover, setSelectedHover] = useState<HoverDimension | null>(null);

  useEffect(() => {
    liveDimensionSelectedKeyRef.current = liveDimensionSelectedKey;
  }, [liveDimensionSelectedKey]);

  // 외부 선택 (패널목록 클릭 등): 스토어 키만 바뀐 경우 씬에서 해당 패널을 찾아 클릭과 동일하게 표시
  useEffect(() => {
    if (!enabled) return;
    if (!liveDimensionSelectedKey) {
      setSelectedHover(prev => (prev ? null : prev));
      selectedTargetRef.current = null;
      return;
    }
    if (selectedHover?.selectionKey === liveDimensionSelectedKey) return;
    let found: THREE.Object3D | null = null;
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      if (found) return;
      if (!shouldInspectObject(object)) return;
      const key = findUserData(object, 'liveDimensionKey');
      if (key && String(key) === liveDimensionSelectedKey) found = object;
    });
    if (!found) return;
    const next = getHoverDimension(found);
    if (!next) return;
    setSelectedHover(next);
    selectedTargetRef.current = found;
  }, [enabled, liveDimensionSelectedKey, selectedHover, scene]);

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
      setSelectedHover(null);
      selectedTargetRef.current = null;
      scanExcludedKeysRef.current.clear();
      clearExcludedKeys(excludedOwnerIdRef.current);
      setLiveDimensionSelectedKey(null);
      liveDimensionSelectedKeyRef.current = null;
      return;
    }

    const canvas = gl.domElement;

    const restoreHiddenPanels = () => {
      scanExcludedKeysRef.current.clear();
      clearExcludedKeys(excludedOwnerIdRef.current);
    };

    const hideSelectedPanel = () => {
      const target = selectedTargetRef.current;
      const keys = target
        ? getScanExclusionKeys(target)
        : getScanExclusionKeysFromSelectionKey(liveDimensionSelectedKeyRef.current);
      if (keys.size === 0) return;
      keys.forEach(key => scanExcludedKeysRef.current.add(key));
      setExcludedKeys(new Set(scanExcludedKeysRef.current), excludedOwnerIdRef.current);
      selectedTargetRef.current = null;
      setSelectedHover(null);
      setLiveDimensionSelectedKey(null);
      liveDimensionSelectedKeyRef.current = null;
      setHover(null);
    };

    const pickDimension = (event: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      scene.updateMatrixWorld(true);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((item) => shouldInspectObject(item.object));
      return hit
        ? {
          hover: getHoverDimension(hit.object),
          target: hit.object,
        }
        : { hover: null, target: null };
    };

    const updateHover = () => {
      rafRef.current = null;
      const event = lastEventRef.current;
      if (!event) return;

      const next = pickDimension(event).hover;
      if (!next) {
        setHover(null);
        return;
      }

      setHover((prev) => {
        if (
          prev &&
          next &&
          prev.key === next.key &&
          prev.widthMm === next.widthMm &&
          prev.heightMm === next.heightMm &&
          prev.depthMm === next.depthMm
        ) {
          return prev;
        }
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

    const selectFromEvent = (event: PointerEvent | MouseEvent) => {
      const picked = pickDimension(event);
      const next = picked.hover;
      if (!next) {
        setSelectedHover(null);
        selectedTargetRef.current = null;
        setLiveDimensionSelectedKey(null);
        liveDimensionSelectedKeyRef.current = null;
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (liveDimensionSelectedKeyRef.current === next.selectionKey) {
        setSelectedHover(null);
        selectedTargetRef.current = null;
        setLiveDimensionSelectedKey(null);
        liveDimensionSelectedKeyRef.current = null;
        return true;
      }

      setSelectedHover(next);
      selectedTargetRef.current = picked.target;
      setLiveDimensionSelectedKey(next.selectionKey);
      liveDimensionSelectedKeyRef.current = next.selectionKey;
      return true;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
      };
    };

    const handlePointerUp = (event: PointerEvent) => {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down || down.button !== 0 || event.button !== 0) return;

      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      if ((dx * dx) + (dy * dy) > 25) return;

      handledPointerClickRef.current = selectFromEvent(event);
    };

    const handleClick = (event: MouseEvent) => {
      if (!handledPointerClickRef.current) return;
      handledPointerClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
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

      if (event.key === 'Escape') {
        restoreHiddenPanels();
        selectedTargetRef.current = null;
        setSelectedHover(null);
        setLiveDimensionSelectedKey(null);
        liveDimensionSelectedKeyRef.current = null;
      }
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointerdown', handlePointerDown, true);
    canvas.addEventListener('pointerup', handlePointerUp, true);
    canvas.addEventListener('click', handleClick, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('pointerdown', handlePointerDown, true);
      canvas.removeEventListener('pointerup', handlePointerUp, true);
      canvas.removeEventListener('click', handleClick, true);
      window.removeEventListener('keydown', handleKeyDown);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      restoreHiddenPanels();
      selectedTargetRef.current = null;
      setLiveDimensionSelectedKey(null);
      liveDimensionSelectedKeyRef.current = null;
      setHover(null);
      setSelectedHover(null);
    };
  }, [enabled, gl, camera, scene, pointer, raycaster, setLiveDimensionSelectedKey, setExcludedKeys, clearExcludedKeys]);

  useEffect(() => {
    if (!enabled || !liveDimensionSelectedKey) {
      setSelectedHover(null);
    }
  }, [enabled, liveDimensionSelectedKey]);

  const activeHover = selectedHover || hover;
  if (!enabled || !activeHover) return null;
  return <LiveDimensionOverlay hover={activeHover} />;
};

export default LiveDimensionInspector;
