import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';

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

const findUserData = (object: THREE.Object3D, key: string): any => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData && current.userData[key] !== undefined) return current.userData[key];
    current = current.parent;
  }
  return undefined;
};

const hasInspectableMetadata = (object: THREE.Object3D) => {
  return Boolean(
    findUserData(object, 'liveDimension') ||
    findUserData(object, 'panelName') ||
    findUserData(object, 'furnitureId')
  );
};

const shouldInspectObject = (object: THREE.Object3D): object is THREE.Mesh => {
  if (!(object instanceof THREE.Mesh) || !object.visible) return false;
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
    key: String(findUserData(object, 'liveDimensionKey') || object.uuid),
    selectionKey: String(findUserData(object, 'liveDimensionKey') || object.uuid),
    label: formatMeshName(object),
    center: [center.x, center.y, center.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    sizeThree: [size.x, size.y, size.z],
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

const LiveDimensionOverlay: React.FC<{ hover: HoverDimension }> = ({ hover }) => {
  const { camera } = useThree();
  const { theme } = useTheme();
  const [w, h, d] = hover.sizeThree;
  const [viewSigns, setViewSigns] = useState<ViewSigns>(() => getCameraViewSigns(camera, hover.center, hover.quaternion));
  const gridPositions = useMemo(() => createPanelGridPositions(w, h, d), [w, h, d]);
  const outlineSegments = useMemo(() => createBoxOutlineSegments(w, h, d), [w, h, d]);
  const inspectorColor = useMemo(() => getThemePrimaryColor(), [theme.color]);
  const margin = Math.max(0.18, Math.min(0.55, Math.max(w, h, d) * 0.08));
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
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

  return (
    <group position={hover.center} quaternion={hover.quaternion} userData={{ liveDimensionOverlay: true }}>
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
      <DimensionLabel position={[0, 0, 0]} color={inspectorColor} variant="summary">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, opacity: 0.92 }}>{hover.label}</span>
          <span>{hover.widthMm} / {hover.heightMm} / {hover.depthMm}</span>
        </div>
      </DimensionLabel>
    </group>
  );
};

const LiveDimensionInspector: React.FC<LiveDimensionInspectorProps> = ({ enabled }) => {
  const { camera, scene, gl } = useThree();
  const { liveDimensionSelectedKey, setLiveDimensionSelectedKey } = useUIStore();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const rafRef = useRef<number | null>(null);
  const lastEventRef = useRef<PointerEvent | null>(null);
  const [hover, setHover] = useState<HoverDimension | null>(null);
  const [selectedHover, setSelectedHover] = useState<HoverDimension | null>(null);

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
      return;
    }

    const canvas = gl.domElement;

    const pickDimension = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      scene.updateMatrixWorld(true);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find((item) => shouldInspectObject(item.object));
      return hit ? getHoverDimension(hit.object) : null;
    };

    const updateHover = () => {
      rafRef.current = null;
      const event = lastEventRef.current;
      if (!event) return;

      const next = pickDimension(event);
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

    const handleClick = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const next = pickDimension(event);
      if (!next) {
        setSelectedHover(null);
        setLiveDimensionSelectedKey(null);
        return;
      }

      if (liveDimensionSelectedKey === next.selectionKey) {
        setSelectedHover(null);
        setLiveDimensionSelectedKey(null);
        return;
      }

      setSelectedHover(next);
      setLiveDimensionSelectedKey(next.selectionKey);
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('click', handleClick, true);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('click', handleClick, true);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setHover(null);
      setSelectedHover(null);
    };
  }, [enabled, gl, camera, scene, pointer, raycaster, liveDimensionSelectedKey, setLiveDimensionSelectedKey]);

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
