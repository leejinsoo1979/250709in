import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useViewerTheme } from '../../../context/ViewerThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';
import { getDefaultGrainDirection, resolvePanelGrainDirection } from '@/editor/shared/utils/materialConstants';
import { useTexture } from '@react-three/drei';
import { isPanelKeyExcluded, useExcludedPanelsStore } from '../../../context/ExcludedPanelsContext';
import { useFurnitureGhostContext } from '../../../context/FurnitureGhostContext';
import { NativeLine } from '../../elements/NativeLine';
import {
  getPanelAssemblySequence,
  getPanelSimulationPlaybackElapsed,
  getPanelSimulationStyleProgress,
  getPanelSimulationStyleTiming,
  getPanelSimulationLayoutKey,
  resolvePanelSimulationTarget
} from '../../../utils/panelSimulationMotion';
import { getPanelSimulationSourceRegistryVersion, removePanelSimulationSource, updatePanelSimulationSource } from '../../../utils/panelSimulationRegistry';

const MIN_BOX_GEOMETRY_SIZE = 0.001;
const panelSimulationSlots = new Map<string, number>();

const getPanelSimulationSlot = (key: string) => {
  const existing = panelSimulationSlots.get(key);
  if (existing !== undefined) return existing;
  const next = panelSimulationSlots.size;
  panelSimulationSlots.set(key, next);
  return next;
};

const getAssemblyStage = (panelName?: string, isClothingRod = false) => {
  const name = panelName || '';
  if (isClothingRod || name.includes('옷봉')) return 4;
  if (name.includes('걸레받이') || name.includes('걸래받이') || name.includes('상단몰딩') || name === 'top-frame' || name === 'base-frame') return 5;
  if (name.includes('도어')) return 6;
  if (name.includes('(하)') || name.includes('하부')) return 1;
  if (name.includes('(상)') || name.includes('상부')) return 2;
  return 3;
};

const getAssemblySequence = (
  furnitureId: string | undefined,
  panelName: string | undefined,
  isClothingRod: boolean,
  localPosition: [number, number, number],
  parent?: THREE.Object3D | null
) => {
  const modules = useFurnitureStore.getState().placedModules;
  const sortedIds = [...modules]
    .sort((a, b) => (a.position?.x || 0) - (b.position?.x || 0))
    .map(module => module.id);
  const furnitureIndex = furnitureId ? Math.max(0, sortedIds.indexOf(furnitureId)) : 0;
  const stage = getAssemblyStage(panelName, isClothingRod);
  const worldPosition = new THREE.Vector3(localPosition[0], localPosition[1], localPosition[2]);
  if (parent) parent.localToWorld(worldPosition);
  const localOrder = Math.max(0, Math.round((worldPosition.x + 50) * 0.18 + (worldPosition.y + 20) * 0.08));
  return furnitureIndex * 120 + stage * 16 + localOrder;
};

const getFlatPanelAxes = (dims: [number, number, number]) => {
  const axes = [
    { name: 'x' as const, size: dims[0], index: 0 },
    { name: 'y' as const, size: dims[1], index: 1 },
    { name: 'z' as const, size: dims[2], index: 2 },
  ].sort((a, b) => a.size - b.size);
  const thicknessAxis = axes[0];
  const faceAxes = axes.slice(1).sort((a, b) => a.size - b.size);
  return {
    thicknessAxis,
    widthAxis: faceAxes[0],
    lengthAxis: faceAxes[1],
  };
};

const buildFlatPanelQuaternion = (dims: [number, number, number], rotationZ: number) => {
  const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(dims);
  const localBasis = {
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3(),
  };
  const widthVector = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationZ);
  const lengthVector = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationZ);

  localBasis[thicknessAxis.name].set(0, 1, 0);
  localBasis[widthAxis.name].copy(widthVector);
  localBasis[lengthAxis.name].copy(lengthVector);

  const matrix = new THREE.Matrix4().makeBasis(localBasis.x, localBasis.y, localBasis.z);
  if (matrix.determinant() < 0) {
    localBasis[lengthAxis.name].multiplyScalar(-1);
    matrix.makeBasis(localBasis.x, localBasis.y, localBasis.z);
  }

  return new THREE.Quaternion().setFromRotationMatrix(matrix);
};

const sanitizeBoxGeometrySize = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return MIN_BOX_GEOMETRY_SIZE;
  }
  return value;
};

type FaceGroove = {
  face: 'left' | 'right';
  fromY: number;
  height: number;
  fromZ: number;
  depth: number;
  cutDepth: number;
};

type NormalizedFaceGroove = FaceGroove & {
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  faceX: number;
  bottomX: number;
};

const buildBoxEdgeLines = (width: number, height: number, depth: number): [number, number, number][][] => {
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;

  return [
    [[-halfW, -halfH, -halfD], [halfW, -halfH, -halfD]],
    [[halfW, -halfH, -halfD], [halfW, halfH, -halfD]],
    [[halfW, halfH, -halfD], [-halfW, halfH, -halfD]],
    [[-halfW, halfH, -halfD], [-halfW, -halfH, -halfD]],
    [[-halfW, -halfH, halfD], [halfW, -halfH, halfD]],
    [[halfW, -halfH, halfD], [halfW, halfH, halfD]],
    [[halfW, halfH, halfD], [-halfW, halfH, halfD]],
    [[-halfW, halfH, halfD], [-halfW, -halfH, halfD]],
    [[-halfW, -halfH, -halfD], [-halfW, -halfH, halfD]],
    [[halfW, -halfH, -halfD], [halfW, -halfH, halfD]],
    [[halfW, halfH, -halfD], [halfW, halfH, halfD]],
    [[-halfW, halfH, -halfD], [-halfW, halfH, halfD]],
  ];
};

const normalizeFaceGrooves = (
  faceGrooves: FaceGroove[] | undefined,
  size: [number, number, number]
): NormalizedFaceGroove[] => {
  if (!faceGrooves || faceGrooves.length === 0) return [];

  const [width, height, depth] = size;
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;
  const minSpan = 0.0005;

  return faceGrooves
    .map((groove) => {
      const y0 = Math.max(-halfH, Math.min(halfH - minSpan, -halfH + groove.fromY));
      const y1 = Math.max(y0 + minSpan, Math.min(halfH, y0 + groove.height));
      const z0 = Math.max(-halfD, Math.min(halfD - minSpan, -halfD + groove.fromZ));
      const z1 = Math.max(z0 + minSpan, Math.min(halfD, z0 + groove.depth));
      const cutDepth = Math.max(minSpan, Math.min(Math.abs(groove.cutDepth), width - minSpan));
      const faceX = groove.face === 'right' ? halfW : -halfW;
      const bottomX = groove.face === 'right' ? halfW - cutDepth : -halfW + cutDepth;

      return {
        ...groove,
        y0,
        y1,
        z0,
        z1,
        cutDepth,
        faceX,
        bottomX,
      };
    })
    .filter((groove) => groove.y1 > groove.y0 && groove.z1 > groove.z0 && Math.abs(groove.faceX - groove.bottomX) > minSpan);
};

const buildProfileYZ = (
  height: number,
  depth: number,
  notch?: { y: number; z: number },
  notches?: Array<{ y: number; z: number; fromBottom: number }>
): [number, number][] => {
  const halfH = height / 2;
  const halfD = depth / 2;
  const profileVertices: [number, number][] = [];

  if (notches && notches.length > 0) {
    profileVertices.push([-halfH, -halfD]);
    profileVertices.push([-halfH, halfD]);

    const sortedNotches = [...notches].sort((a, b) => a.fromBottom - b.fromBottom);
    for (let ni = 0; ni < sortedNotches.length; ni++) {
      const n = sortedNotches[ni];
      const notchBottom = -halfH + n.fromBottom;
      const notchTop = notchBottom + n.y;
      const isUppermostNotch = Math.abs(notchTop - halfH) < 0.01;
      const next = ni < sortedNotches.length - 1 ? sortedNotches[ni + 1] : null;
      const nextBottom = next ? -halfH + next.fromBottom : null;
      const adjacentToNext = next && nextBottom !== null && Math.abs(notchTop - nextBottom) < 0.01;
      const prev = ni > 0 ? sortedNotches[ni - 1] : null;
      const prevTop = prev ? -halfH + prev.fromBottom + prev.y : null;
      const adjacentToPrev = prev && prevTop !== null && Math.abs(prevTop - notchBottom) < 0.01;

      if (!adjacentToPrev) {
        profileVertices.push([notchBottom, halfD]);
      }
      profileVertices.push([notchBottom, halfD - n.z]);
      profileVertices.push([notchTop, halfD - n.z]);

      if (isUppermostNotch) {
        profileVertices.push([halfH, -halfD]);
      } else if (!adjacentToNext) {
        profileVertices.push([notchTop, halfD]);
      }
    }

    const lastNotch = sortedNotches[sortedNotches.length - 1];
    const lastNotchTop = -halfH + lastNotch.fromBottom + lastNotch.y;
    if (Math.abs(lastNotchTop - halfH) >= 0.001) {
      profileVertices.push([halfH, halfD]);
      profileVertices.push([halfH, -halfD]);
    }
  } else if (notch) {
    profileVertices.push([-halfH, -halfD]);
    profileVertices.push([-halfH, halfD]);
    profileVertices.push([halfH - notch.y, halfD]);
    profileVertices.push([halfH - notch.y, halfD - notch.z]);
    profileVertices.push([halfH, halfD - notch.z]);
    profileVertices.push([halfH, -halfD]);
  } else {
    profileVertices.push([-halfH, -halfD]);
    profileVertices.push([-halfH, halfD]);
    profileVertices.push([halfH, halfD]);
    profileVertices.push([halfH, -halfD]);
  }

  return profileVertices.filter((v, i) =>
    i === 0 || v[0] !== profileVertices[i - 1][0] || v[1] !== profileVertices[i - 1][1]
  );
};

const buildFaceGrooveEdgeLines = (grooves: NormalizedFaceGroove[]): [number, number, number][][] => {
  const lines: [number, number, number][][] = [];

  grooves.forEach(({ y0, y1, z0, z1, faceX, bottomX }) => {
    const faceRect: [number, number, number][] = [
      [faceX, y0, z0],
      [faceX, y1, z0],
      [faceX, y1, z1],
      [faceX, y0, z1],
    ];
    const bottomRect: [number, number, number][] = [
      [bottomX, y0, z0],
      [bottomX, y1, z0],
      [bottomX, y1, z1],
      [bottomX, y0, z1],
    ];

    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      lines.push([faceRect[i], faceRect[next]]);
      lines.push([bottomRect[i], bottomRect[next]]);
      lines.push([faceRect[i], bottomRect[i]]);
    }
  });

  return lines;
};

const buildTopViewFaceGrooveEdgeLines = (grooves: NormalizedFaceGroove[]): [number, number, number][][] => {
  const lines: [number, number, number][][] = [];

  grooves.forEach(({ y1, z0, z1, faceX, bottomX }) => {
    // 탑뷰에서는 홈을 닫힌 사각형으로 그리면 측판 내부에 불필요한 세로선이 생긴다.
    // 실제 절삭 윤곽만 보이도록 홈 바닥선 + 양 끝 절삭 깊이선만 표시한다.
    lines.push(
      [[faceX, y1, z0], [bottomX, y1, z0]],
      [[bottomX, y1, z0], [bottomX, y1, z1]],
      [[bottomX, y1, z1], [faceX, y1, z1]]
    );
  });

  return lines;
};

const buildFrontViewFaceGrooveEdgeLines = (grooves: NormalizedFaceGroove[]): [number, number, number][][] => {
  const lines: [number, number, number][][] = [];

  grooves.forEach(({ y0, y1, z1, faceX, bottomX }) => {
    lines.push(
      [[faceX, y0, z1], [bottomX, y0, z1]],
      [[bottomX, y0, z1], [bottomX, y1, z1]],
      [[bottomX, y1, z1], [faceX, y1, z1]]
    );
  });

  return lines;
};

const buildTopViewBoxEdgeLinesWithFaceGrooveOpenings = (
  width: number,
  height: number,
  depth: number,
  grooves: NormalizedFaceGroove[]
): [number, number, number][][] => {
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;
  const eps = 0.00001;
  const lines = buildBoxEdgeLines(width, height, depth).filter((line) => {
    const [a, b] = line;
    const isFaceZEdge =
      Math.abs(a[0] - b[0]) < eps &&
      Math.abs(Math.abs(a[0]) - halfW) < eps &&
      Math.abs(a[1] - b[1]) < eps &&
      Math.abs(Math.abs(a[1]) - halfH) < eps &&
      Math.abs(a[2] - b[2]) > eps;
    return !isFaceZEdge;
  });

  ([-halfW, halfW] as const).forEach((faceX) => {
    const faceGrooves = grooves
      .filter((groove) => Math.abs(groove.faceX - faceX) < eps)
      .map((groove) => [Math.max(-halfD, groove.z0), Math.min(halfD, groove.z1)] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    if (!faceGrooves.length) {
      lines.push(
        [[faceX, -halfH, -halfD], [faceX, -halfH, halfD]],
        [[faceX, halfH, -halfD], [faceX, halfH, halfD]]
      );
      return;
    }

    const segments: [number, number][] = [];
    let cursor = -halfD;
    faceGrooves.forEach(([z0, z1]) => {
      if (z0 > cursor + eps) segments.push([cursor, z0]);
      cursor = Math.max(cursor, z1);
    });
    if (cursor < halfD - eps) segments.push([cursor, halfD]);

    segments.forEach(([z0, z1]) => {
      lines.push(
        [[faceX, -halfH, z0], [faceX, -halfH, z1]],
        [[faceX, halfH, z0], [faceX, halfH, z1]]
      );
    });
  });

  return lines;
};

const buildFrontViewBoxEdgeLinesWithFaceGrooveOpenings = (
  width: number,
  height: number,
  depth: number,
  grooves: NormalizedFaceGroove[]
): [number, number, number][][] => {
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;
  const eps = 0.00001;
  const lines = buildBoxEdgeLines(width, height, depth).filter((line) => {
    const [a, b] = line;
    const isFaceYEdge =
      Math.abs(a[0] - b[0]) < eps &&
      Math.abs(Math.abs(a[0]) - halfW) < eps &&
      Math.abs(a[2] - b[2]) < eps &&
      Math.abs(Math.abs(a[2]) - halfD) < eps &&
      Math.abs(a[1] - b[1]) > eps;
    return !isFaceYEdge;
  });

  ([-halfW, halfW] as const).forEach((faceX) => {
    const faceGrooves = grooves
      .filter((groove) => Math.abs(groove.faceX - faceX) < eps)
      .map((groove) => [Math.max(-halfH, groove.y0), Math.min(halfH, groove.y1)] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    if (!faceGrooves.length) {
      lines.push(
        [[faceX, -halfH, -halfD], [faceX, halfH, -halfD]],
        [[faceX, -halfH, halfD], [faceX, halfH, halfD]]
      );
      return;
    }

    const segments: [number, number][] = [];
    let cursor = -halfH;
    faceGrooves.forEach(([y0, y1]) => {
      if (y0 > cursor + eps) segments.push([cursor, y0]);
      cursor = Math.max(cursor, y1);
    });
    if (cursor < halfH - eps) segments.push([cursor, halfH]);

    segments.forEach(([y0, y1]) => {
      lines.push(
        [[faceX, y0, -halfD], [faceX, y1, -halfD]],
        [[faceX, y0, halfD], [faceX, y1, halfD]]
      );
    });
  });

  return lines;
};

const createGroovedPanelGeometry = (
  size: [number, number, number],
  grooves: NormalizedFaceGroove[],
  notch?: { y: number; z: number },
  notches?: Array<{ y: number; z: number; fromBottom: number }>
): THREE.BufferGeometry => {
  const [width, height, depth] = size;
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;
  const contour = buildProfileYZ(height, depth, notch, notches).map(([y, z]) => new THREE.Vector2(y, z));
  const positions: number[] = [];
  const uvs: number[] = [];
  const triangleMaterialIndices: number[] = [];
  const eps = 0.0001;
  const isPlainRectContour = !notch && !(notches && notches.length > 0);

  const pushVertex = (x: number, y: number, z: number, u: number, v: number) => {
    positions.push(x, y, z);
    uvs.push(u, v);
  };

  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    uvA: [number, number],
    uvB: [number, number],
    uvC: [number, number],
    materialIndex = 0
  ) => {
    pushVertex(a[0], a[1], a[2], uvA[0], uvA[1]);
    pushVertex(b[0], b[1], b[2], uvB[0], uvB[1]);
    pushVertex(c[0], c[1], c[2], uvC[0], uvC[1]);
    triangleMaterialIndices.push(materialIndex);
  };

  const pushQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    uvA: [number, number] = [0, 0],
    uvB: [number, number] = [1, 0],
    uvC: [number, number] = [1, 1],
    uvD: [number, number] = [0, 1],
    materialIndex = 0
  ) => {
    pushTri(a, b, c, uvA, uvB, uvC, materialIndex);
    pushTri(a, c, d, uvA, uvC, uvD, materialIndex);
  };

  const uvForYZ = (point: THREE.Vector2): [number, number] => [
    (point.y + halfD) / depth,
    (point.x + halfH) / height,
  ];

  const pushSplitCap = (x: number, face: 'left' | 'right', sideGrooves: NormalizedFaceGroove[]) => {
    const yCuts = [-halfH, halfH];
    const zCuts = [-halfD, halfD];

    sideGrooves.forEach((groove) => {
      yCuts.push(Math.max(-halfH, Math.min(halfH, groove.y0)));
      yCuts.push(Math.max(-halfH, Math.min(halfH, groove.y1)));
      zCuts.push(Math.max(-halfD, Math.min(halfD, groove.z0)));
      zCuts.push(Math.max(-halfD, Math.min(halfD, groove.z1)));
    });

    const sortedYCuts = [...new Set(yCuts.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
    const sortedZCuts = [...new Set(zCuts.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);

    for (let yi = 0; yi < sortedYCuts.length - 1; yi++) {
      for (let zi = 0; zi < sortedZCuts.length - 1; zi++) {
        const y0 = sortedYCuts[yi];
        const y1 = sortedYCuts[yi + 1];
        const z0 = sortedZCuts[zi];
        const z1 = sortedZCuts[zi + 1];
        if (y1 - y0 < eps || z1 - z0 < eps) continue;

        const centerY = (y0 + y1) / 2;
        const centerZ = (z0 + z1) / 2;
        const insideGroove = sideGrooves.some((groove) =>
          centerY > groove.y0 + eps &&
          centerY < groove.y1 - eps &&
          centerZ > groove.z0 + eps &&
          centerZ < groove.z1 - eps
        );
        if (insideGroove) continue;

        if (face === 'right') {
          pushQuad(
            [x, y0, z0],
            [x, y1, z0],
            [x, y1, z1],
            [x, y0, z1],
            [(z0 + halfD) / depth, (y0 + halfH) / height],
            [(z0 + halfD) / depth, (y1 + halfH) / height],
            [(z1 + halfD) / depth, (y1 + halfH) / height],
            [(z1 + halfD) / depth, (y0 + halfH) / height],
            1
          );
        } else {
          pushQuad(
            [x, y0, z1],
            [x, y1, z1],
            [x, y1, z0],
            [x, y0, z0],
            [(z1 + halfD) / depth, (y0 + halfH) / height],
            [(z1 + halfD) / depth, (y1 + halfH) / height],
            [(z0 + halfD) / depth, (y1 + halfH) / height],
            [(z0 + halfD) / depth, (y0 + halfH) / height],
            1
          );
        }
      }
    }
  };

  const pushCap = (x: number, face: 'left' | 'right') => {
    const sideGrooves = grooves.filter((groove) => groove.face === face);
    if (isPlainRectContour) {
      pushSplitCap(x, face, sideGrooves);
      return;
    }

    const holes = sideGrooves.map((groove) => {
      const y0 = Math.max(-halfH + eps, Math.min(halfH - eps, groove.y0));
      const y1 = Math.max(y0 + eps, Math.min(halfH - eps, groove.y1));
      const z0 = Math.max(-halfD + eps, Math.min(halfD - eps, groove.z0));
      const z1 = Math.max(z0 + eps, Math.min(halfD - eps, groove.z1));
      return [
        new THREE.Vector2(y0, z0),
        new THREE.Vector2(y1, z0),
        new THREE.Vector2(y1, z1),
        new THREE.Vector2(y0, z1),
      ];
    });
    const triangles = THREE.ShapeUtils.triangulateShape(contour, holes);
    const points = [...contour, ...holes.flat()];

    triangles.forEach((tri) => {
      const ordered = face === 'right' ? tri : [tri[2], tri[1], tri[0]];
      const a = points[ordered[0]];
      const b = points[ordered[1]];
      const c = points[ordered[2]];
      pushTri(
        [x, a.x, a.y],
        [x, b.x, b.y],
        [x, c.x, c.y],
        uvForYZ(a),
        uvForYZ(b),
        uvForYZ(c),
        1
      );
    });
  };

  const pushEndWallWithOpenGrooves = (z: number, yStart: number, yEnd: number, openedGrooves: NormalizedFaceGroove[]) => {
    const yMin = Math.min(yStart, yEnd);
    const yMax = Math.max(yStart, yEnd);
    const xCuts = [-halfW, halfW];
    const yCuts = [yMin, yMax];

    openedGrooves.forEach((groove) => {
      xCuts.push(Math.min(groove.faceX, groove.bottomX));
      xCuts.push(Math.max(groove.faceX, groove.bottomX));
      yCuts.push(Math.max(yMin, Math.min(yMax, groove.y0)));
      yCuts.push(Math.max(yMin, Math.min(yMax, groove.y1)));
    });

    const sortedXCuts = [...new Set(xCuts.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
    const sortedYCuts = [...new Set(yCuts.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);

    for (let xi = 0; xi < sortedXCuts.length - 1; xi++) {
      for (let yi = 0; yi < sortedYCuts.length - 1; yi++) {
        const x0 = sortedXCuts[xi];
        const x1 = sortedXCuts[xi + 1];
        const y0 = sortedYCuts[yi];
        const y1 = sortedYCuts[yi + 1];
        if (x1 - x0 < eps || y1 - y0 < eps) continue;

        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;
        const insideOpening = openedGrooves.some((groove) => {
          const gx0 = Math.min(groove.faceX, groove.bottomX);
          const gx1 = Math.max(groove.faceX, groove.bottomX);
          return centerX > gx0 + eps &&
            centerX < gx1 - eps &&
            centerY > groove.y0 + eps &&
            centerY < groove.y1 - eps;
        });
        if (insideOpening) continue;

        pushQuad(
          [x0, y0, z],
          [x1, y0, z],
          [x1, y1, z],
          [x0, y1, z],
          [(x0 + halfW) / width, (y0 + halfH) / height],
          [(x1 + halfW) / width, (y0 + halfH) / height],
          [(x1 + halfW) / width, (y1 + halfH) / height],
          [(x0 + halfW) / width, (y1 + halfH) / height]
        );
      }
    }
  };

  const pushHorizontalWallWithOpenGrooves = (y: number, zStart: number, zEnd: number, openedGrooves: NormalizedFaceGroove[]) => {
    const zMin = Math.min(zStart, zEnd);
    const zMax = Math.max(zStart, zEnd);
    const xCuts = [-halfW, halfW];
    const zCuts = [zMin, zMax];

    openedGrooves.forEach((groove) => {
      xCuts.push(Math.min(groove.faceX, groove.bottomX));
      xCuts.push(Math.max(groove.faceX, groove.bottomX));
      zCuts.push(Math.max(zMin, Math.min(zMax, groove.z0)));
      zCuts.push(Math.max(zMin, Math.min(zMax, groove.z1)));
    });

    const sortedXCuts = [...new Set(xCuts.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
    const sortedZCuts = [...new Set(zCuts.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);

    for (let xi = 0; xi < sortedXCuts.length - 1; xi++) {
      for (let zi = 0; zi < sortedZCuts.length - 1; zi++) {
        const x0 = sortedXCuts[xi];
        const x1 = sortedXCuts[xi + 1];
        const z0 = sortedZCuts[zi];
        const z1 = sortedZCuts[zi + 1];
        if (x1 - x0 < eps || z1 - z0 < eps) continue;

        const centerX = (x0 + x1) / 2;
        const centerZ = (z0 + z1) / 2;
        const insideOpening = openedGrooves.some((groove) => {
          const gx0 = Math.min(groove.faceX, groove.bottomX);
          const gx1 = Math.max(groove.faceX, groove.bottomX);
          return centerX > gx0 + eps &&
            centerX < gx1 - eps &&
            centerZ > groove.z0 + eps &&
            centerZ < groove.z1 - eps;
        });
        if (insideOpening) continue;

        pushQuad(
          [x0, y, z0],
          [x0, y, z1],
          [x1, y, z1],
          [x1, y, z0],
          [(x0 + halfW) / width, (z0 + halfD) / depth],
          [(x0 + halfW) / width, (z1 + halfD) / depth],
          [(x1 + halfW) / width, (z1 + halfD) / depth],
          [(x1 + halfW) / width, (z0 + halfD) / depth]
        );
      }
    }
  };

  pushCap(halfW, 'right');
  pushCap(-halfW, 'left');

  for (let i = 0; i < contour.length; i++) {
    const next = (i + 1) % contour.length;
    const a = contour[i];
    const b = contour[next];
    const isEndWall = Math.abs(a.y - b.y) < eps && (Math.abs(a.y - halfD) < eps || Math.abs(a.y + halfD) < eps);
    if (isPlainRectContour && isEndWall) {
      const openedGrooves = grooves.filter((groove) =>
        a.y > 0
          ? groove.z1 >= halfD - eps
          : groove.z0 <= -halfD + eps
      );
      if (openedGrooves.length > 0) {
        pushEndWallWithOpenGrooves(a.y, a.x, b.x, openedGrooves);
        continue;
      }
    }
    const isHorizontalWall = Math.abs(a.x - b.x) < eps && (Math.abs(a.x - halfH) < eps || Math.abs(a.x + halfH) < eps);
    if (isPlainRectContour && isHorizontalWall) {
      const openedGrooves = grooves.filter((groove) =>
        a.x > 0
          ? groove.y1 >= halfH - eps
          : groove.y0 <= -halfH + eps
      );
      if (openedGrooves.length > 0) {
        pushHorizontalWallWithOpenGrooves(a.x, a.y, b.y, openedGrooves);
        continue;
      }
    }
    pushQuad(
      [-halfW, a.x, a.y],
      [halfW, a.x, a.y],
      [halfW, b.x, b.y],
      [-halfW, b.x, b.y],
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    );
  }

  grooves.forEach(({ y0, y1, z0, z1, faceX, bottomX }) => {
    const openAtBack = z0 <= -halfD + eps;
    const openAtFront = z1 >= halfD - eps;
    const openAtBottom = y0 <= -halfH + eps;
    const openAtTop = y1 >= halfH - eps;
    pushQuad([bottomX, y0, z0], [bottomX, y1, z0], [bottomX, y1, z1], [bottomX, y0, z1]);
    if (!openAtBack) {
      pushQuad([faceX, y0, z0], [bottomX, y0, z0], [bottomX, y1, z0], [faceX, y1, z0]);
    }
    if (!openAtTop) {
      pushQuad([faceX, y1, z0], [bottomX, y1, z0], [bottomX, y1, z1], [faceX, y1, z1]);
    }
    if (!openAtFront) {
      pushQuad([faceX, y1, z1], [bottomX, y1, z1], [bottomX, y0, z1], [faceX, y0, z1]);
    }
    if (!openAtBottom) {
      pushQuad([faceX, y0, z1], [bottomX, y0, z1], [bottomX, y0, z0], [faceX, y0, z0]);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (triangleMaterialIndices.length > 0) {
    let groupStart = 0;
    let groupMaterialIndex = triangleMaterialIndices[0] ?? 0;
    for (let i = 1; i <= triangleMaterialIndices.length; i++) {
      const nextMaterialIndex = triangleMaterialIndices[i];
      if (i === triangleMaterialIndices.length || nextMaterialIndex !== groupMaterialIndex) {
        geometry.addGroup(groupStart * 3, (i - groupStart) * 3, groupMaterialIndex);
        groupStart = i;
        groupMaterialIndex = nextMaterialIndex ?? 0;
      }
    }
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

interface BoxWithEdgesProps {
  args: [number, number, number];
  position: [number, number, number];
  material?: THREE.Material; // material을 optional로 변경
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
  isEditMode?: boolean; // 편집 모드 여부 추가
  hideEdges?: boolean; // 엣지 숨김 옵션 추가
  hideTopEdge?: boolean; // 상단 엣지만 숨김
  hideBottomEdge?: boolean; // 하단 엣지만 숨김
  isBackPanel?: boolean; // 백패널 여부 추가
  isEndPanel?: boolean; // 엔드패널 여부 추가
  isHighlighted?: boolean; // 강조 상태 추가
  isClothingRod?: boolean; // 옷걸이 봉 여부 추가
  edgeOpacity?: number; // 엣지 투명도 (0.0 ~ 1.0)
  onClick?: (e: any) => void;
  onPointerOver?: (e: any) => void;
  onPointerOut?: (e: any) => void;
  panelName?: string; // 패널 이름 (예: "좌측판", "선반1")
  panelGrainDirections?: { [key: string]: 'horizontal' | 'vertical' }; // 패널별 결 방향 (fallback)
  textureUrl?: string; // 텍스처 URL
  furnitureId?: string; // 가구 ID - 스토어에서 직접 panelGrainDirections 가져오기 위함
  renderOrder?: number; // 렌더링 순서 (천장 뒤로 보낼 때 사용)
  notch?: { y: number; z: number }; // 앞쪽 상단 모서리 따내기 (Y방향 높이, Z방향 깊이) — L자형 단일 메시
  notches?: Array<{ y: number; z: number; fromBottom: number }>; // 다중 따내기 (fromBottom: 바닥에서 시작점, Three.js 단위)
  bottomRebate?: { width: number; height: number }; // 하단 양쪽 반턱 따내기 (width: 양쪽 폭, height: 따내기 높이, Three.js 단위)
  cornerNotch?: { width: number; depth: number; side: 'left' | 'right' }; // 상판 코너 따내기 (XZ평면, 위에서 본 ㄴ자형)
  backCenterNotch?: { sideStrip: number; depth: number }; // 뒷면 가운데 따내기 (XZ평면, 위에서 본 ㄷ자형) — sideStrip: 좌우 띠 폭, depth: 뒤에서 앞으로 깊이
  faceGrooves?: FaceGroove[]; // 측판 안쪽면 반턱 홈 (백패널/서랍바닥 끼움용)
  circleHoles?: Array<{ x: number; y: number; radius: number }>; // 백패널 등 평면 패널의 원형 타공 (Three.js 단위, 패널 중심 기준 X/Y)
}

/**
 * 공통 BoxWithEdges 컴포넌트
 * 모든 가구 타입에서 재사용되는 엣지 표시 박스
 */
const BoxWithEdges: React.FC<BoxWithEdgesProps> = ({
  args,
  position,
  material,
  renderMode = 'solid',
  isDragging = false,
  isEditMode = false,
  hideEdges = false,
  hideTopEdge = false,
  hideBottomEdge = false,
  isBackPanel = false,
  isEndPanel = false,
  isHighlighted = false,
  furnitureId,
  isClothingRod = false,
  edgeOpacity,
  onClick,
  onPointerOver,
  onPointerOut,
  panelName,
  panelGrainDirections,
  textureUrl,
  renderOrder,
  notch,
  notches,
  bottomRebate,
  cornerNotch,
  backCenterNotch,
  faceGrooves,
  circleHoles
}) => {
  const safeArgs = React.useMemo<[number, number, number]>(() => [
    sanitizeBoxGeometrySize(args[0]),
    sanitizeBoxGeometrySize(args[1]),
    sanitizeBoxGeometrySize(args[2]),
  ], [args[0], args[1], args[2]]);

  const { viewMode, plainMaterial: isPlainMaterial } = useSpace3DView();
  const { view2DDirection, shadowEnabled, edgeOutlineEnabled, isTransparentMode, isLiveDimensionMode, isTapeMeasureMode, liveDimensionSelectedKey, setLiveDimensionSelectedKey, panelSimulationPhase, panelSimulationRevision, panelSimulationLayouts } = useUIStore(); // view2DDirection, shadowEnabled, edgeOutlineEnabled 추가
  const { theme } = useViewerTheme();
  const { view2DTheme } = useUIStore();
  const { theme: appTheme } = useTheme();

  const hideInTop2D = viewMode === '2D' && view2DDirection === 'top' && panelName && (panelName.includes('(하)상판') || panelName.includes('(상)바닥'));
  const hideRearReinforcementInFront2D = viewMode === '2D' && view2DDirection === 'front' && panelName?.includes('보강대');
  const hideDrawerInnerFrontPanelInFront2D = viewMode === '2D' && view2DDirection === 'front' && !!panelName && panelName.includes('서랍') && panelName.includes('앞판');
  const hiddenByViewMode = !!(hideInTop2D || hideRearReinforcementInFront2D || hideDrawerInnerFrontPanelInFront2D);

  // CNC 옵티마이저에서 체크 해제된 패널이면 렌더링 생략 (furnitureId::panelName 복합키)
  // NOTE: React hook (useExcludedPanelsStore) 대신 useFrame으로 폴링 — R3F Canvas는 별도 React reconciler를 사용하므로
  // DOM 쪽 Zustand 구독이 R3F 내부 컴포넌트 리렌더를 트리거하지 못함
  const groupRef = useRef<THREE.Group>(null);
  const simulationStartTimeRef = React.useRef(0);
  const simulationRevisionRef = React.useRef(panelSimulationRevision);
  const assemblySourceSignatureRef = React.useRef<string | null>(null);
  const simulationFrameStateRef = React.useRef<{
    signature: string;
    sequenceIndex: number;
    startPosition: THREE.Vector3;
    startQuaternion: THREE.Quaternion;
    startScale: THREE.Vector3;
    targetPosition: THREE.Vector3;
    targetQuaternion: THREE.Quaternion;
    targetScale: THREE.Vector3;
    hasLayout: boolean;
    hasSimulationLayouts: boolean;
  } | null>(null);
  const compositeKey = furnitureId && panelName ? `${furnitureId}::${panelName}` : null;
  const panelSimulationLayoutCount = React.useMemo(
    () => Object.keys(panelSimulationLayouts).length,
    [panelSimulationLayouts]
  );
  React.useEffect(() => {
    return () => {
      if (compositeKey) removePanelSimulationSource(compositeKey);
      assemblySourceSignatureRef.current = null;
    };
  }, [compositeKey]);
  const liveDimensionSelectedFurnitureId = liveDimensionSelectedKey?.split('::')[0] ?? null;
  const isLiveDimensionActive = viewMode === '3D' && (isLiveDimensionMode || isTapeMeasureMode) && !!liveDimensionSelectedKey && !!compositeKey && liveDimensionSelectedFurnitureId === furnitureId;
  const isLiveDimensionSelected = !!(isLiveDimensionActive && liveDimensionSelectedKey === compositeKey);
  const activePopup = useUIStore(state => state.activePopup);
  const selectedFurnitureId = useUIStore(state => state.selectedFurnitureId);
  const liveDimensionInspecting = viewMode === '3D' && isLiveDimensionMode;
  const inspectorModeActive = viewMode === '3D' && (isLiveDimensionMode || isTapeMeasureMode);
  const handlePanelClick = React.useCallback((e: any) => {
    if (inspectorModeActive && compositeKey) {
      e.stopPropagation?.();
      setLiveDimensionSelectedKey(liveDimensionSelectedKey === compositeKey ? null : compositeKey);
      return;
    }
    onClick?.(e);
  }, [inspectorModeActive, compositeKey, liveDimensionSelectedKey, setLiveDimensionSelectedKey, onClick]);
  useFrame(() => {
    if (!groupRef.current) return;
    if (hiddenByViewMode) {
      groupRef.current.visible = false;
      return;
    }
    if (groupRef.current.visible === false) {
      groupRef.current.visible = true;
    }

    let shouldHide = false;
    if (compositeKey) {
      const { excludedKeys } = useExcludedPanelsStore.getState();
      shouldHide = isPanelKeyExcluded(excludedKeys, furnitureId, panelName);
      if (groupRef.current.visible === shouldHide) {
        groupRef.current.visible = !shouldHide;
      }
    }

    if (viewMode !== '3D') {
      groupRef.current.position.set(position[0], position[1], position[2]);
      groupRef.current.quaternion.identity();
      groupRef.current.scale.set(1, 1, 1);
      return;
    }

    if (shouldHide || !compositeKey || !furnitureId || !panelName) return;

    if (simulationRevisionRef.current !== panelSimulationRevision) {
      simulationRevisionRef.current = panelSimulationRevision;
      simulationStartTimeRef.current = performance.now() / 1000;
      simulationFrameStateRef.current = null;
    }

    if (panelSimulationRevision <= 0) return;

    const group = groupRef.current;
    const parent = group.parent;
    if (isClothingRod) {
      const sourceKey = `accessory::${furnitureId}::${panelName}`;
      const signature = `${getPanelSimulationSourceRegistryVersion()}:${panelSimulationRevision}:${panelSimulationPhase}:${sourceKey}:${safeArgs.join(',')}`;
      if (assemblySourceSignatureRef.current !== signature) {
        updatePanelSimulationSource({
          key: sourceKey,
          furnitureId,
          panelName,
          args: safeArgs,
          object: group,
          material: processedMaterial || material || undefined,
          assemblyOnly: true,
        });
        assemblySourceSignatureRef.current = signature;
      }
      group.visible = false;
      return;
    }
    const signature = `${panelSimulationRevision}:${panelSimulationPhase}:${compositeKey}:${safeArgs.join(',')}:${panelSimulationLayoutCount}`;
    let frameState = simulationFrameStateRef.current;
    if (!frameState || frameState.signature !== signature) {
      const simulationTarget = resolvePanelSimulationTarget(panelSimulationLayouts, furnitureId, panelName, safeArgs);
      const layoutKey = simulationTarget?.key || getPanelSimulationLayoutKey(panelSimulationLayouts, furnitureId, panelName) || compositeKey;
      const slot = getPanelSimulationSlot(layoutKey);
      const simulationLayout = simulationTarget?.layout;
      const hasSimulationLayouts = panelSimulationLayoutCount > 0;
      if (simulationLayout && layoutKey) {
        removePanelSimulationSource(layoutKey);
      }

      const originalPosition = new THREE.Vector3(position[0], position[1], position[2]);
      const originalQuaternion = new THREE.Quaternion();
      const originalScale = new THREE.Vector3(1, 1, 1);
      const layoutScaleVector = new THREE.Vector3(1, 1, 1);
      let layoutPosition = originalPosition.clone();
      let layoutQuaternion = new THREE.Quaternion();

      if (simulationLayout) {
        const { thicknessAxis, widthAxis, lengthAxis } = getFlatPanelAxes(safeArgs);
        layoutScaleVector.setComponent(thicknessAxis.index, simulationLayout.scale);
        layoutScaleVector.setComponent(widthAxis.index, simulationLayout.widthWorld / Math.max(safeArgs[widthAxis.index], MIN_BOX_GEOMETRY_SIZE));
        layoutScaleVector.setComponent(lengthAxis.index, simulationLayout.heightWorld / Math.max(safeArgs[lengthAxis.index], MIN_BOX_GEOMETRY_SIZE));
        const thickness = Math.min(safeArgs[0], safeArgs[1], safeArgs[2]);
        layoutPosition = new THREE.Vector3(
          simulationLayout.worldX,
          simulationLayout.worldY + thickness * simulationLayout.scale * 0.5 + 0.03,
          simulationLayout.worldZ
        );
        layoutQuaternion = buildFlatPanelQuaternion(safeArgs, simulationLayout.rotationZ);

        if (parent) {
          parent.updateWorldMatrix(true, false);
          parent.worldToLocal(layoutPosition);

          const parentWorldQuaternion = new THREE.Quaternion();
          parent.getWorldQuaternion(parentWorldQuaternion);
          layoutQuaternion.premultiply(parentWorldQuaternion.invert());
        }
      }

      const targetPosition = panelSimulationPhase === 'layout' ? layoutPosition : originalPosition;
      const targetQuaternion = panelSimulationPhase === 'layout' ? layoutQuaternion : originalQuaternion;
      const targetScaleVector = panelSimulationPhase === 'layout' ? layoutScaleVector : originalScale;
      const startPosition = panelSimulationPhase === 'layout' ? group.position.clone() : layoutPosition.clone();
      const startQuaternion = panelSimulationPhase === 'layout' ? group.quaternion.clone() : layoutQuaternion.clone();
      const startScale = panelSimulationPhase === 'layout' ? group.scale.clone() : layoutScaleVector.clone();

      const sequenceIndex = panelSimulationPhase === 'layout' && simulationLayout
        ? (simulationLayout.order ?? slot)
        : getPanelAssemblySequence(furnitureId, panelName, position, parent, isClothingRod);

      frameState = {
        signature,
        sequenceIndex,
        startPosition,
        startQuaternion,
        startScale,
        targetPosition,
        targetQuaternion,
        targetScale: targetScaleVector,
        hasLayout: !!simulationLayout,
        hasSimulationLayouts,
      };
      simulationFrameStateRef.current = frameState;
    }

    if (!frameState.hasLayout) {
      group.visible = true;
      group.position.set(position[0], position[1], position[2]);
      group.quaternion.identity();
      group.scale.set(1, 1, 1);
      if (frameState.hasSimulationLayouts && panelSimulationPhase === 'layout' && import.meta.env.DEV) {
        console.warn('[PanelSimulation] layout target missing, keeping original visible:', `${furnitureId}::${panelName}`);
      }
      return;
    }
    if (group.visible === false) {
      group.visible = true;
    }
    const playback = useUIStore.getState();
    const timing = getPanelSimulationStyleTiming(playback.panelSimulationAnimationStyle);
    const cameraSettleDelay = panelSimulationPhase === 'layout' ? timing.cameraSettleLayout : timing.cameraSettleAssembly;
    const elapsed = getPanelSimulationPlaybackElapsed(playback) - cameraSettleDelay - frameState.sequenceIndex * (panelSimulationPhase === 'layout' ? timing.layoutDelayStep : timing.assemblyDelayStep);
    if (elapsed < 0) {
      group.visible = true;
      group.position.copy(frameState.startPosition);
      group.quaternion.copy(frameState.startQuaternion);
      group.scale.copy(frameState.startScale);
      return;
    }
    if (group.visible === false) {
      group.visible = true;
    }
    const progress = getPanelSimulationStyleProgress(playback.panelSimulationAnimationStyle, elapsed / (panelSimulationPhase === 'layout' ? timing.layoutDuration : timing.duration));
    group.position.copy(frameState.startPosition).lerp(frameState.targetPosition, progress);
    group.quaternion.copy(frameState.startQuaternion).slerp(frameState.targetQuaternion, progress);
    group.scale.copy(frameState.startScale).lerp(frameState.targetScale, progress);
  });

  // 전역 스토어에서 직접 편집 상태 감지 (Context bridge 문제 회피)
  const storeEditMode = !inspectorModeActive && furnitureId ? (activePopup.type === 'furnitureEdit' && activePopup.id === furnitureId) : false;
  const storeSelected = furnitureId ? (selectedFurnitureId === furnitureId) : false;
  const parentEditMode = useFurnitureGhostContext();
  const effectiveEditMode = !inspectorModeActive && (isEditMode || parentEditMode || storeEditMode);
  const effectiveSelected = storeSelected;
  // 3D 편집/드래그 중에는 wireframe 대신 solid로 강제 (2D에서는 원래 renderMode 유지)
  const effectiveRenderMode = (viewMode === '3D' && (effectiveEditMode || isDragging || inspectorModeActive)) ? 'solid' as const : renderMode;

  // 스토어에서 직접 panelGrainDirections 가져오기 (실시간 업데이트 보장)
  // Zustand는 selector 함수의 참조가 바뀌면 재구독하므로, furnitureId별로 안정적인 selector 필요
  const storePanelGrainDirections = useFurnitureStore((state) => {
    if (!furnitureId) {
      return undefined;
    }
    const furniture = state.placedModules.find(m => m.id === furnitureId);
    return furniture?.panelGrainDirections;
  }, (a, b) => {
    // 커스텀 equality 함수: panelGrainDirections 객체의 내용이 같으면 리렌더링 방지
    if (a === b) return true;
    if (!a || !b) return a === b;
    return JSON.stringify(a) === JSON.stringify(b);
  });

  // 스토어에서 가져온 값 우선, 없으면 props 사용
  const activePanelGrainDirections = storePanelGrainDirections || panelGrainDirections;
  
  // 기본 material 생성 (material prop이 없을 때 사용)
  const defaultMaterial = React.useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ 
      color: '#E0E0E0',
      roughness: 0.8,
      metalness: 0.1
    });
    return mat;
  }, []);
  
  // cleanup: defaultMaterial 정리
  React.useEffect(() => {
    return () => {
      if (!material) {
        defaultMaterial.dispose();
      }
    };
  }, [material, defaultMaterial]);
  
  // 실제 사용할 material (plainMaterial 모드면 항상 기본 색상, 아니면 prop 우선)
  const baseMaterial = isPlainMaterial ? defaultMaterial : (material || defaultMaterial);
  const themePrimaryColor = React.useMemo(() => {
    if (typeof window !== 'undefined') {
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary').trim();
      if (primaryColor) return primaryColor;
    }
    return '#10b981';
  }, [appTheme.color]);
  const selectedPanelHighlightColor = '#ef4444';

  // 드래그/편집 고스트 효과 + 2D 솔리드 모드 투명 처리
  const processedMaterial = React.useMemo(() => {
    if (
      viewMode === '3D' &&
      isTransparentMode &&
      !liveDimensionInspecting &&
      (
        baseMaterial instanceof THREE.MeshStandardMaterial ||
        baseMaterial instanceof THREE.MeshBasicMaterial ||
        baseMaterial instanceof THREE.MeshLambertMaterial ||
        baseMaterial instanceof THREE.MeshPhongMaterial
      )
    ) {
      baseMaterial.transparent = true;
      baseMaterial.opacity = 0.28;
      baseMaterial.depthWrite = false;
      baseMaterial.depthTest = true;
      baseMaterial.side = THREE.DoubleSide;
      baseMaterial.needsUpdate = true;
      return baseMaterial;
    }

    // MeshBasicMaterial인 경우
    // - 패널 하이라이팅용 highlightMaterial은 그대로 사용 (투명 처리 안 함)
    // - 프레임 형광색 등도 그대로 사용
    if (baseMaterial instanceof THREE.MeshBasicMaterial) {
      return baseMaterial;
    }

    // 옷봉 전용: 항상 원본 재질 유지 (밝기 보존)
    if (isClothingRod) {
      return baseMaterial;
    }

    // 3D에서만 고스트 적용 (2D에서는 치수 확인을 위해 원래 재질 유지)
    // MeshBasicMaterial 사용: 조명/카메라 각도에 무관하게 일관된 고스트 색상
    if (viewMode === '3D' && !liveDimensionInspecting && isDragging && baseMaterial instanceof THREE.MeshStandardMaterial) {
      const ghostMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(themePrimaryColor),
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      return ghostMaterial;
    }

    // 2D 솔리드 모드에서 캐비넷을 투명하게 처리 (편집/드래그 중에도 항상 적용)
    // 2D에서는 고스트 색상 없이 원래 재질 그대로 투명화 → 와이어프레임 라인으로 치수 확인
    if (viewMode === '2D' && effectiveRenderMode === 'solid' && baseMaterial instanceof THREE.MeshStandardMaterial) {
      // 도어: DoorModule에서 이미 material 설정 완료 → 그대로 사용
      const isDoor = panelName && (panelName.includes('도어') || panelName.includes('door'));
      if (isDoor) {
        return baseMaterial;
      }

      // 인조대리석 상판/뒷턱: 2D에서도 면 채움 유지 (상판 재질 색상 표시)
      const isCountertop2D = panelName && (panelName.includes('인조대리석') || panelName.includes('countertop'));
      if (isCountertop2D) {
        return baseMaterial;
      }

      // 목찬넬프레임: 연한 파란색 반투명 면
      const isWoodChannel = panelName && panelName.includes('목찬넬프레임');
      if (isWoodChannel) {
        return new THREE.MeshBasicMaterial({
          color: '#00cfff',
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      }

      // 키큰장찬넬 상단프레임/걸레받이: 옆 가구처럼 면은 완전 투명 (외곽선만)
      const isInsertSurround = panelName && (panelName.includes('Insert상단프레임') || panelName.includes('Insert걸레받이'));
      const transparentMaterial = baseMaterial.clone();
      transparentMaterial.transparent = true;
      transparentMaterial.depthWrite = false;
      transparentMaterial.opacity = isInsertSurround ? 0 : 0.1;
      transparentMaterial.needsUpdate = true;
      return transparentMaterial;
    }

    // wireframe 모드에서는 메시를 완전히 투명하게 (클릭 가능하도록 visible은 유지)
    if (effectiveRenderMode === 'wireframe' && baseMaterial instanceof THREE.MeshStandardMaterial) {
      // 인조대리석 상판/뒷턱: 2D wireframe에서도 면 채움 유지 (상판 재질 색상 표시)
      const isCountertop = panelName && (panelName.includes('인조대리석') || panelName.includes('countertop'));
      if (isCountertop) {
        return baseMaterial;
      }
      const invisibleMaterial = baseMaterial.clone();
      invisibleMaterial.transparent = true;
      invisibleMaterial.opacity = 0;
      invisibleMaterial.depthWrite = false;
      invisibleMaterial.needsUpdate = true;
      return invisibleMaterial;
    }

    // 기본 상태: baseMaterial 투명도를 정상 복원 (useEffect 타이밍 이슈 방지)
    // isEditMode/isDragging false인데 baseMaterial이 아직 투명 상태면 즉시 복원
    // plainMaterial 모드(CNC 옵티마이저)에서는 PanelDimmer가 재질을 직접 제어하므로 건너뜀
    if (!isPlainMaterial && baseMaterial instanceof THREE.MeshStandardMaterial) {
      if (baseMaterial.transparent || baseMaterial.opacity < 1.0) {
        baseMaterial.transparent = false;
        baseMaterial.opacity = 1.0;
        baseMaterial.depthWrite = true;
        baseMaterial.needsUpdate = true;
      }
    }
    return baseMaterial;
  }, [baseMaterial, isDragging, effectiveEditMode, effectiveSelected, viewMode, effectiveRenderMode, isClothingRod, panelName, view2DDirection, view2DTheme, liveDimensionInspecting, themePrimaryColor, isTransparentMode]);

  // activePanelGrainDirections를 JSON 문자열로 변환하여 값 변경 감지
  const activePanelGrainDirectionsStr = activePanelGrainDirections ? JSON.stringify(activePanelGrainDirections) : '';

  // 이전 activePanelGrainDirectionsStr 값 저장
  const prevGrainDirectionsRef = React.useRef<string>(activePanelGrainDirectionsStr);
  const panelMaterialRef = React.useRef<THREE.Material | null>(null);
  const textureSignature = React.useMemo(() => {
    if (processedMaterial instanceof THREE.MeshStandardMaterial && processedMaterial.map) {
      return processedMaterial.map.uuid;
    }
    return null;
  }, [processedMaterial]);
  const prevTextureSignatureRef = React.useRef<string | null>(textureSignature);

  // processedMaterial 타입이 변경되면 ref 초기화
  React.useEffect(() => {
    if (!(processedMaterial instanceof THREE.MeshStandardMaterial)) {
      panelMaterialRef.current = null;
    }
  }, [processedMaterial]);

  // 편집/드래그 모드 해제 시 panelMaterialRef 캐시된 clone의 투명도 즉시 복원
  React.useEffect(() => {
    if (!effectiveEditMode && !effectiveSelected && !isDragging && panelMaterialRef.current instanceof THREE.MeshStandardMaterial) {
      if (panelMaterialRef.current.transparent || panelMaterialRef.current.opacity < 1.0) {
        panelMaterialRef.current.transparent = processedMaterial instanceof THREE.MeshStandardMaterial ? processedMaterial.transparent : false;
        panelMaterialRef.current.opacity = processedMaterial instanceof THREE.MeshStandardMaterial ? processedMaterial.opacity : 1.0;
        panelMaterialRef.current.depthWrite = processedMaterial instanceof THREE.MeshStandardMaterial ? processedMaterial.depthWrite : true;
        panelMaterialRef.current.needsUpdate = true;
      }
    }
  }, [effectiveEditMode, effectiveSelected, isDragging, processedMaterial]);

  // 패널별 개별 material 생성 (텍스처 회전 적용)
  const panelSpecificMaterial = React.useMemo(() => {
    // plainMaterial 모드에서는 텍스처/결 방향 처리 건너뜀
    if (isPlainMaterial) return processedMaterial;

    if (!panelName || !(processedMaterial instanceof THREE.MeshStandardMaterial)) {
      return processedMaterial;
    }

    // 고스트 모드: 텍스처 처리 건너뛰고 processedMaterial 그대로 사용
    if (isDragging || effectiveEditMode || effectiveSelected) {
      panelMaterialRef.current = null;
      return processedMaterial;
    }

    const sourceMap = processedMaterial.map;
    if (!sourceMap) {
      panelMaterialRef.current = null;
      prevGrainDirectionsRef.current = activePanelGrainDirectionsStr;
      prevTextureSignatureRef.current = textureSignature;
      return processedMaterial;
    }

    const grainDirection = resolvePanelGrainDirection(panelName, activePanelGrainDirections) || getDefaultGrainDirection(panelName);

    const isFurnitureSidePanel = panelName && !panelName.includes('서랍') &&
      (panelName.includes('측판') || panelName.includes('좌측') || panelName.includes('우측'));
    const isBackPanel = panelName && panelName.includes('백패널');

    const targetRotation = (() => {
      if (isFurnitureSidePanel || isBackPanel) {
        return grainDirection === 'vertical' ? 0 : Math.PI / 2;
      }
      return grainDirection === 'vertical' ? Math.PI / 2 : 0;
    })();

    const grainDirectionsChanged = prevGrainDirectionsRef.current !== activePanelGrainDirectionsStr;
    const textureChanged = prevTextureSignatureRef.current !== textureSignature;

    // 투명도 변경 여부 체크 (2D/3D 모드 전환 시 중요)
    const transparencyChanged = panelMaterialRef.current instanceof THREE.MeshStandardMaterial &&
      (panelMaterialRef.current.transparent !== processedMaterial.transparent ||
       panelMaterialRef.current.opacity !== processedMaterial.opacity);

    if (!grainDirectionsChanged && !textureChanged && !transparencyChanged && panelMaterialRef.current instanceof THREE.MeshStandardMaterial && panelMaterialRef.current.map) {
      const existingTexture = panelMaterialRef.current.map;
      if (existingTexture.rotation !== targetRotation) {
        existingTexture.rotation = targetRotation;
        existingTexture.center.set(0.5, 0.5);
        existingTexture.needsUpdate = true;
        panelMaterialRef.current.needsUpdate = true;
      }

      panelMaterialRef.current.transparent = processedMaterial.transparent;
      panelMaterialRef.current.opacity = processedMaterial.opacity;
      panelMaterialRef.current.depthWrite = processedMaterial.depthWrite;
      panelMaterialRef.current.needsUpdate = true;

      return panelMaterialRef.current;
    }

    prevGrainDirectionsRef.current = activePanelGrainDirectionsStr;
    prevTextureSignatureRef.current = textureSignature;

    const panelMaterial = processedMaterial.clone();
    const texture = sourceMap.clone();

    texture.rotation = targetRotation;
    texture.center.set(0.5, 0.5);

    panelMaterial.map = texture;
    panelMaterial.transparent = processedMaterial.transparent;
    panelMaterial.opacity = processedMaterial.opacity;
    panelMaterial.depthWrite = processedMaterial.depthWrite;

    panelMaterial.needsUpdate = true;
    texture.needsUpdate = true;

    panelMaterialRef.current = panelMaterial;

    return panelMaterial;
  }, [processedMaterial, panelName, activePanelGrainDirectionsStr, isDragging, effectiveEditMode, textureSignature, viewMode, effectiveRenderMode, isPlainMaterial]);

  const normalizedFaceGrooves = React.useMemo(
    () => normalizeFaceGrooves(faceGrooves, safeArgs),
    [faceGrooves, safeArgs]
  );

  // cornerNotch / backCenterNotch 커스텀 지오메트리는 일부 면 winding이 뒤집힐 수 있어 DoubleSide로 양면 렌더링.
  // faceGrooves만으로 material clone을 만들면 텍스처가 비동기로 붙기 전의 빈 map이 고정될 수 있다.
  // 그래서 홈가공 패널은 원본 material 참조를 유지하고 side만 보정해 텍스처 갱신을 그대로 따라가게 한다.
  const finalMaterial = React.useMemo(() => {
    const hasFaceGrooves = normalizedFaceGrooves.length > 0;
    const needsClone = isLiveDimensionSelected || cornerNotch || backCenterNotch;

    if (!needsClone) {
      if (
        hasFaceGrooves &&
        (
          panelSpecificMaterial instanceof THREE.MeshStandardMaterial ||
          panelSpecificMaterial instanceof THREE.MeshBasicMaterial ||
          panelSpecificMaterial instanceof THREE.MeshLambertMaterial ||
          panelSpecificMaterial instanceof THREE.MeshPhongMaterial
        ) &&
        panelSpecificMaterial.side !== THREE.DoubleSide
      ) {
        panelSpecificMaterial.side = THREE.DoubleSide;
        panelSpecificMaterial.needsUpdate = true;
      }
      return panelSpecificMaterial;
    }

    if (
      panelSpecificMaterial instanceof THREE.MeshStandardMaterial ||
      panelSpecificMaterial instanceof THREE.MeshBasicMaterial ||
      panelSpecificMaterial instanceof THREE.MeshLambertMaterial ||
      panelSpecificMaterial instanceof THREE.MeshPhongMaterial
    ) {
      const mat = panelSpecificMaterial.clone();

      if (cornerNotch || backCenterNotch || normalizedFaceGrooves.length > 0) {
        mat.side = THREE.DoubleSide;
      }

      if (isLiveDimensionSelected) {
        const highlightColor = new THREE.Color(selectedPanelHighlightColor);
        if ('color' in mat && mat.color instanceof THREE.Color) {
          mat.color.lerp(highlightColor, 0.62);
        }
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.depthTest = true;
        if ('toneMapped' in mat) {
          mat.toneMapped = false;
        }
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissive = highlightColor;
          mat.emissiveIntensity = 1.25;
        } else if (mat instanceof THREE.MeshPhongMaterial || mat instanceof THREE.MeshLambertMaterial) {
          mat.emissive = highlightColor;
          mat.emissiveIntensity = 0.85;
        }
      }

      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
      return mat;
    }

    return panelSpecificMaterial;
  }, [panelSpecificMaterial, cornerNotch, backCenterNotch, normalizedFaceGrooves.length, isLiveDimensionSelected, selectedPanelHighlightColor]);

  // 엣지밴딩 색상 (속장/도어 패널 단면 PVC 띠) 적용용
  // 판재 패널(MDF/PB)에만 적용 — 옷봉/브래킷/조절발/레그라/금속/손잡이 등 부속 부품은 제외
  const edgeBandingColor = useSpaceConfigStore(state => {
    if (viewMode !== '3D') return undefined;
    const cfg = state.spaceInfo.materialConfig;
    if (!cfg) return undefined;
    if (!panelName) return undefined;
    // 부속 부품 제외
    if (isClothingRod) return undefined;
    const nonPanelKeywords = ['옷봉', '브라켓', '브래킷', '조절발', '레그라', '금속', '손잡이', '핸들', '경첩', '레일'];
    if (nonPanelKeywords.some(k => panelName.includes(k))) return undefined;
    const isDoorPanel = panelName.includes('도어') || panelName.includes('door');
    return isDoorPanel ? cfg.doorEdgeColor : cfg.interiorEdgeColor;
  });
  const isDoorEdgeBandingPanel = !!edgeBandingColor && !!panelName && (panelName.includes('도어') || panelName.includes('door'));
  const doorEdgeBandingStrip = React.useMemo(() => {
    if (!isDoorEdgeBandingPanel) return null;
    const strip = Math.min(0.025, safeArgs[0] / 3, safeArgs[1] / 3);
    if (strip <= 0) return null;
    const frontZ = safeArgs[2] / 2 + 0.004;
    const backZ = -safeArgs[2] / 2 - 0.004;
    const stripDepth = 0.003;
    return {
      strip,
      frontZ,
      backZ,
      stripDepth,
      horizontalWidth: safeArgs[0],
      verticalHeight: Math.max(0.001, safeArgs[1] - strip * 2),
    };
  }, [isDoorEdgeBandingPanel, safeArgs]);

  // useEffect 제거: useMemo에서 이미 모든 회전 로직을 처리하므로 중복 실행 방지

  // 테마 색상 매핑
  const themeColorMap: Record<string, string> = {
    green: '#10b981',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    vivid: '#a25378',
    red: '#D2042D',
    pink: '#ec4899',
    indigo: '#6366f1',
    teal: '#14b8a6',
    yellow: '#eab308',
    gray: '#6b7280',
    cyan: '#06b6d4',
    lime: '#84cc16',
    black: '#1a1a1a',
    wine: '#845EC2',
    gold: '#d97706',
    navy: '#1e3a8a',
    emerald: '#059669',
    violet: '#C128D7',
    mint: '#0CBA80',
    neon: '#18CF23',
    rust: '#FF7438',
    white: '#D65DB1',
    plum: '#790963',
    brown: '#5A2B1D',
    darkgray: '#2C3844',
    maroon: '#3F0D0D',
    turquoise: '#003A7A',
    slate: '#2E3A47',
    copper: '#AD4F34',
    forest: '#1B3924',
    olive: '#4C462C'
  };

  const highlightColor = themeColorMap[appTheme.color] || '#3b82f6';

  // 엣지 색상 결정
  const edgeColor = React.useMemo(() => {
    // 메라톤 4319 / 8832: 어두운 재질이라 검정 윤곽선이 묻히므로 재질별 진한 색상 사용
    const getTextureSrc = (mat: any): string => {
      try {
        const map = mat?.map;
        if (!map) return '';
        return map?.image?.src || map?.source?.data?.src || map?.userData?.src || '';
      } catch {
        return '';
      }
    };
    const texSrc = getTextureSrc(baseMaterial);
    if (texSrc) {
      if (/MELATONE_4319/i.test(texSrc)) {
        return '#2f5d3a'; // 4319 → 진한 녹색
      }
      if (/MELATONE_8832/i.test(texSrc)) {
        return '#4a2e1f'; // 8832 → 진한 갈색
      }
    }
    // 인조대리석 상판은 연한 그레이 윤곽선
    if (panelName && panelName.includes('인조대리석')) {
      return '#b0b0b0';
    }
    // 2D 모드에서 목찬넬프레임은 파란색 윤곽선
    if (viewMode === '2D' && panelName && panelName.includes('목찬넬프레임')) {
      return '#00cfff';
    }
    // 2D 모드에서 도어/마이다/마감판 패널은 초록색 윤곽선
    if (viewMode === '2D' && panelName && (panelName.includes('도어') || panelName.includes('마이다') || panelName.includes('마감판'))) {
      return view2DTheme === 'dark' ? '#00ff00' : '#228B22'; // 다크→초록, 라이트→진한 녹색
    }
    // 2D 모드에서 키큰장찬넬 상단프레임/걸레받이: 옆 가구 프레임(상단몰딩/걸레받이)과 동일
    //   Room.tsx 정책: 다크 #FFFFFF / 라이트 #666666
    if (viewMode === '2D' && panelName && (panelName.includes('Insert상단프레임') || panelName.includes('Insert걸레받이'))) {
      return view2DTheme === 'dark' ? '#FFFFFF' : '#666666';
    }

    // 옷걸이 봉인 경우: 2D 모드에서 view2DTheme에 따라 색상 변경
    if (isClothingRod && viewMode === '2D') {
      return view2DTheme === 'light' ? '#808080' : '#FFFFFF';
    }

    // MeshBasicMaterial인 경우 (프레임 형광색 등)
    if (baseMaterial instanceof THREE.MeshBasicMaterial) {
      const color = "#" + baseMaterial.color.getHexString();

      // 2D 라이트 모드에서는 주황색을 검정색으로 변경
      if (viewMode === '2D' && view2DTheme === 'light' && color.toLowerCase() === '#ff4500') {
        return '#000000';
      }

      return color;
    }

    // 엔드패널이거나 강조 상태일 때는 2D/3D 모드에 따라 다른 색상 사용
    if (isEndPanel || isHighlighted) {
      if (viewMode === '2D') {
        // 2D 모드에서는 형광색 (neon green)
        return "#18CF23";
      } else {
        // 3D 모드에서는 테마 색상 (엔드패널은 3D에서 일반 색상)
        return isEndPanel ? (effectiveRenderMode === 'wireframe' ? (view2DTheme === 'dark' ? "#FF4500" : "#000000") : "#505050") : highlightColor;
      }
    }

    // Cabinet Texture1이 적용된 경우: 2D 모드에서는 theme-aware 색상 사용
    if (baseMaterial instanceof THREE.MeshStandardMaterial) {
      const materialColor = baseMaterial.color;
      // RGB 값이 정확히 0.12면 Cabinet Texture1 (오차 허용)
      if (Math.abs(materialColor.r - 0.12) < 0.01 &&
          Math.abs(materialColor.g - 0.12) < 0.01 &&
          Math.abs(materialColor.b - 0.12) < 0.01) {
        // 2D 모드: 테마에 맞는 대비 색상 사용 (라이트→검정, 다크→주황)
        if (viewMode === '2D') {
          if (effectiveRenderMode === 'wireframe') {
            return view2DTheme === 'dark' ? "#FFFFFF" : "#000000";
          }
          return view2DTheme === 'dark' ? "#FF4500" : "#444444";
        }
        // 3D 모드: 원래 색상 유지
        return "#" + new THREE.Color(0.12, 0.12, 0.12).getHexString();
      }
    }

    if (viewMode === '3D') {
      if (effectiveRenderMode === 'wireframe') {
        return view2DTheme === 'dark' ? "#ffffff" : "#000000"; // 3D 은선모드에서는 최대 대비 색상
      }
      const textureSource = `${textureUrl || ''} ${
        baseMaterial instanceof THREE.MeshStandardMaterial && baseMaterial.map?.image?.src
          ? baseMaterial.map.image.src
          : ''
      }`.toLowerCase();
      if (textureSource.includes('melatone_4319') || textureSource.includes('melatone_8832')) {
        return "#1f5f3a";
      }
      return "#5a5a5a"; // 3D 솔리드 모드: 진한 회색이 Windows 저DPR에서 뭉개져 보여 살짝 밝게
    } else if (effectiveRenderMode === 'wireframe') {
      return view2DTheme === 'dark' ? "#FFFFFF" : "#000000"; // 2D 와이어프레임 다크모드는 흰색(최대 대비), 라이트모드는 검정색
    } else {
      // 2D 솔리드 모드
      if (view2DDirection === 'front') {
        // 정면 뷰에서는 선반과 동일한 색상
        return view2DTheme === 'dark' ? "#FF4500" : "#444444"; // 다크모드는 붉은 주황색
      } else {
        // 다른 뷰에서는 기본 색상
        return view2DTheme === 'dark' ? "#FF4500" : "#444444"; // 다크모드는 붉은 주황색
      }
    }
  }, [viewMode, effectiveRenderMode, view2DTheme, view2DDirection, baseMaterial, isHighlighted, highlightColor, panelName, textureUrl]);

  // Debug log for position

  // 2D 모드: panelName 기반 깊이 등급 → opacity 매핑
  // 가장 앞(마이다, 측판 등) = 1.0, 서랍 내부 = 0.4, 백패널 = 0.1
  const panelDepthOpacity = React.useMemo((): number => {
    if (viewMode !== '2D') return 1;
    if (isHighlighted) return 1;
    if (isClothingRod) {
      if (view2DDirection === 'left' || view2DDirection === 'right') return 0.35;
      return 1;
    }
    if (edgeOpacity !== undefined) return edgeOpacity;
    if (isBackPanel && view2DDirection === 'front') return 0.1;
    if (!panelName) return 1;

    // 서랍 관련 패널 판별 (서랍속장 > 서랍 내부 > 마이다 순서로 체크)
    const isDrawerFrame = panelName.includes('서랍속장');  // 서랍속장 프레임
    const isDrawerPanel = !isDrawerFrame && panelName.includes('서랍'); // 서랍 내부 패널 (마이다 포함)
    const isMaida = panelName.includes('마이다'); // 마이다 (서랍 앞면 손잡이판)

    // 정면 뷰 기준 깊이 등급
    const isInductionDrawer = panelName.includes('인덕션') && panelName.includes('서랍');
    if (view2DDirection === 'front') {
      if (isMaida) return 1.0;
      if (isInductionDrawer) return view2DTheme === 'dark' ? 0.7 : 0.6; // 인덕션 서랍: 전대 뒤로 보이므로 진하게
      if (isDrawerFrame) return view2DTheme === 'dark' ? 0.45 : 0.6;
      if (isDrawerPanel) return view2DTheme === 'dark' ? 0.45 : 0.6;
      // 하부섹션 상판: 옵셋으로 뒤에 있으므로 약간 흐리게
      if (panelName.includes('(하)상판')) return 0.5;
      return 1.0;
    }

    // 측면 뷰 기준 깊이 등급
    // 측판이 가장 앞 → 진하게, 나머지는 뒤에 있으므로 흐리게
    if (view2DDirection === 'left' || view2DDirection === 'right') {
      // 가구 측판 (가장 앞)
      if (!isDrawerPanel && !isDrawerFrame && (panelName.includes('측판') || panelName.includes('좌측') || panelName.includes('우측'))) return 1.0;
      // 가로전대 / 목찬넬 프레임 (측판 안쪽에 있어 측면뷰에서 가려짐)
      if (panelName.includes('가로전대') || panelName.includes('목찬넬')) return 0.3;
      // 인덕션 서랍 (전대 뒤로 직접 보임)
      if (isInductionDrawer) return 0.6;
      // 마이다, 상판, 바닥, 선반
      if (isMaida) return 0.4;
      if (panelName.includes('상판') || panelName.includes('바닥') || panelName.includes('선반')) return 0.4;
      // 서랍 측판
      if (isDrawerPanel && (panelName.includes('좌측') || panelName.includes('우측') || panelName.includes('측판'))) return 0.35;
      // 보강대
      if (panelName.includes('보강대')) return 0.3;
      // 서랍속장 프레임
      if (isDrawerFrame) return 0.25;
      // 서랍 내부 (앞판, 뒷판, 바닥)
      if (isDrawerPanel) return 0.2;
      return 0.5;
    }

    // 탑뷰 기준 깊이 등급
    // 상판이 가장 앞, 서랍 바닥판은 아래에 있으므로 흐리게
    if (view2DDirection === 'top') {
      if (isMaida) return 0.35;
      if (isDrawerFrame) return 0.35;
      if (isDrawerPanel && panelName.includes('바닥')) return 0.15;
      if (isDrawerPanel) return 0.25;
      return 1.0;
    }

    return 1;
  }, [viewMode, view2DDirection, view2DTheme, panelName, isHighlighted, isClothingRod, isBackPanel, edgeOpacity]);


  // 다중 노치 여부 판별 (notches가 있으면 우선 사용)
  const hasCircleHoles = !!(circleHoles && circleHoles.length > 0);
  const hasFaceGrooves = normalizedFaceGrooves.length > 0;
  const hasAnyNotch = !!(notch || (notches && notches.length > 0) || bottomRebate || cornerNotch || backCenterNotch || hasFaceGrooves);
  const hasCustomGeometry = hasAnyNotch || hasCircleHoles;

  // L자형 노치 엣지 라인 생성 (2D/3D 공용) — 단일 및 다중 노치 지원
  const getNotchEdgeLines = React.useCallback((options?: {
    includeFaceGrooveEdges?: boolean;
    openFaceGrooveMouthsInTopView?: boolean;
    openFaceGrooveMouthsInFrontView?: boolean;
  }): [number, number, number][][] => {
    if (!hasAnyNotch) return [];
    const includeFaceGrooveEdges = options?.includeFaceGrooveEdges ?? true;
    const openFaceGrooveMouthsInTopView = options?.openFaceGrooveMouthsInTopView ?? false;
    const openFaceGrooveMouthsInFrontView = options?.openFaceGrooveMouthsInFrontView ?? false;
    const [width, height, depth] = safeArgs;
    const halfW = width / 2, halfH = height / 2, halfD = depth / 2;
    const lines: [number, number, number][][] = [];

    // 프로필 꼭짓점 계산 (YZ 평면) — 앞면 윤곽선 경로
    const profileVertices: [number, number][] = []; // [Y, Z] 쌍

    if (hasFaceGrooves && !notch && !(notches && notches.length > 0) && !bottomRebate && !cornerNotch && !backCenterNotch) {
      lines.push(...(
        openFaceGrooveMouthsInTopView
          ? buildTopViewBoxEdgeLinesWithFaceGrooveOpenings(width, height, depth, normalizedFaceGrooves)
          : openFaceGrooveMouthsInFrontView
            ? buildFrontViewBoxEdgeLinesWithFaceGrooveOpenings(width, height, depth, normalizedFaceGrooves)
          : buildBoxEdgeLines(width, height, depth)
      ));
      if (includeFaceGrooveEdges) {
        lines.push(...buildFaceGrooveEdgeLines(normalizedFaceGrooves));
      }
      return lines;
    }

    if (bottomRebate) {
      // 반턱: 정면(XY)에서 양쪽 하단 모서리 깎기 — 엣지 라인
      // 양쪽 바깥 수직선(측판에 묻히는 부분)은 제외
      const rw = bottomRebate.width, rh = bottomRebate.height;
      // 반턱 안쪽 단면만 (바깥 수직선 제외)
      const rebateInner: [number, number][] = [
        [-halfW + rw, -halfH],      // 중앙 좌측 하단
        [-halfW + rw, -halfH + rh], // 좌반턱 안쪽
        [-halfW, -halfH + rh],      // 좌반턱 상단 (좌측판 안쪽면)
      ];
      const rebateInnerR: [number, number][] = [
        [halfW, -halfH + rh],       // 우반턱 상단 (우측판 안쪽면)
        [halfW - rw, -halfH + rh],  // 우반턱 안쪽
        [halfW - rw, -halfH],       // 중앙 우측 하단
      ];
      // 하단 중앙 + 상단 사각형
      const boxEdges: [number, number][][] = [
        [[-halfW + rw, -halfH], [halfW - rw, -halfH]], // 하단 중앙
        [[-halfW, halfH], [halfW, halfH]],               // 상단
        [[-halfW, -halfH + rh], [-halfW, halfH]],        // 좌측 (반턱 상단~상단)
        [[halfW, -halfH + rh], [halfW, halfH]],          // 우측 (반턱 상단~상단)
      ];
      for (const zVal of [halfD, -halfD]) {
        // 좌측 반턱 안쪽 꺾임
        for (let i = 0; i < rebateInner.length - 1; i++) {
          lines.push([
            [rebateInner[i][0], rebateInner[i][1], zVal],
            [rebateInner[i+1][0], rebateInner[i+1][1], zVal],
          ]);
        }
        // 우측 반턱 안쪽 꺾임
        for (let i = 0; i < rebateInnerR.length - 1; i++) {
          lines.push([
            [rebateInnerR[i][0], rebateInnerR[i][1], zVal],
            [rebateInnerR[i+1][0], rebateInnerR[i+1][1], zVal],
          ]);
        }
        // 하단 중앙 + 상단 + 좌우 세로
        for (const edge of boxEdges) {
          lines.push([
            [edge[0][0], edge[0][1], zVal],
            [edge[1][0], edge[1][1], zVal],
          ]);
        }
      }
      // 앞뒤 연결 엣지 (바깥 수직선 꼭지점 제외)
      const connectPts: [number, number][] = [
        [-halfW + rw, -halfH], [-halfW + rw, -halfH + rh], [-halfW, -halfH + rh],
        [halfW, -halfH + rh], [halfW - rw, -halfH + rh], [halfW - rw, -halfH],
        [-halfW, halfH], [halfW, halfH],
      ];
      for (const v of connectPts) {
        lines.push([[v[0], v[1], -halfD], [v[0], v[1], halfD]]);
      }
      if (hasFaceGrooves && includeFaceGrooveEdges) lines.push(...buildFaceGrooveEdgeLines(normalizedFaceGrooves));
      return lines;
    } else if (notches && notches.length > 0) {
      // 다중 노치: bottom-back → bottom-front → 각 노치 → top-back
      profileVertices.push([-halfH, -halfD]); // bottom-back
      profileVertices.push([-halfH, halfD]);  // bottom-front

      // 노치들 (fromBottom 순으로 정렬)
      const sortedNotches = [...notches].sort((a, b) => a.fromBottom - b.fromBottom);
      for (let ni = 0; ni < sortedNotches.length; ni++) {
        const n = sortedNotches[ni];
        const notchBottom = -halfH + n.fromBottom;
        const notchTop = notchBottom + n.y;
        const isUppermostNotch = Math.abs(notchTop - halfH) < 0.01;
        // 다음 노치와 맞닿아 있는지 (있으면 "다시 앞면으로" 스킵)
        const next = ni < sortedNotches.length - 1 ? sortedNotches[ni + 1] : null;
        const nextBottom = next ? -halfH + next.fromBottom : null;
        const adjacentToNext = next && nextBottom !== null && Math.abs(notchTop - nextBottom) < 0.01;
        // 이전 노치와 맞닿아 있는지 (있으면 "노치 하단 앞면" 스킵)
        const prev = ni > 0 ? sortedNotches[ni - 1] : null;
        const prevTop = prev ? -halfH + prev.fromBottom + prev.y : null;
        const adjacentToPrev = prev && prevTop !== null && Math.abs(prevTop - notchBottom) < 0.01;

        if (!adjacentToPrev) {
          profileVertices.push([notchBottom, halfD]);           // 노치 하단 시작점 (앞면)
        }
        profileVertices.push([notchBottom, halfD - n.z]);       // 안쪽으로 꺾임
        profileVertices.push([notchTop, halfD - n.z]);          // 위로 올라감

        if (isUppermostNotch) {
          // 최상단 노치: 앞면으로 돌아가지 않고 바로 뒤쪽으로
          profileVertices.push([halfH, -halfD]); // top-back
        } else if (!adjacentToNext) {
          profileVertices.push([notchTop, halfD]); // 다시 앞면으로 (다음 노치와 인접하지 않을 때만)
        }
      }

      // 최상단 노치가 halfH에 도달하지 않은 경우 상단 마무리
      const lastNotch = sortedNotches[sortedNotches.length - 1];
      const lastNotchTop = -halfH + lastNotch.fromBottom + lastNotch.y;
      if (Math.abs(lastNotchTop - halfH) >= 0.001) {
        profileVertices.push([halfH, halfD]);    // top-front
        profileVertices.push([halfH, -halfD]);   // top-back
      }
    } else if (notch) {
      // 단일 상단 노치 (기존 로직)
      const ny = notch.y, nz = notch.z;
      profileVertices.push([-halfH, -halfD]);           // bottom-back
      profileVertices.push([-halfH, halfD]);             // bottom-front
      profileVertices.push([halfH - ny, halfD]);         // notch start (front)
      profileVertices.push([halfH - ny, halfD - nz]);    // notch corner
      profileVertices.push([halfH, halfD - nz]);         // above notch
      profileVertices.push([halfH, -halfD]);             // top-back
    }

    // 프로필에서 중복 연속 꼭짓점 제거
    const verts = profileVertices.filter((v, i) =>
      i === 0 || v[0] !== profileVertices[i-1][0] || v[1] !== profileVertices[i-1][1]
    );

    // 양쪽 면(x = ±halfW) 윤곽선
    for (const xSign of [-1, 1]) {
      const x = xSign * halfW;
      for (let i = 0; i < verts.length; i++) {
        const next = (i + 1) % verts.length;
        lines.push([
          [x, verts[i][0], verts[i][1]],
          [x, verts[next][0], verts[next][1]]
        ]);
      }
    }

    // 연결 엣지 (앞면↔뒷면, 각 꼭짓점)
    for (const v of verts) {
      lines.push([[-halfW, v[0], v[1]], [halfW, v[0], v[1]]]);
    }

    // cornerNotch: XZ평면 코너 따내기 (상판용 — 위에서 본 ㄴ자형)
    if (cornerNotch && profileVertices.length === 0) {
      const nw = cornerNotch.width;  // 따내기 X방향 폭 (Three.js 단위)
      const nd = cornerNotch.depth;  // 따내기 Z방향 깊이 (Three.js 단위)
      const isRight = cornerNotch.side === 'right';

      // XZ 평면 꼭짓점 (위에서 본 윤곽) — right: 오른쪽 뒤 모서리 따내기
      const xzVerts: [number, number][] = isRight ? [
        [-halfW, -halfD],           // 좌측 뒤
        [-halfW, halfD],            // 좌측 앞
        [halfW, halfD],             // 우측 앞
        [halfW, -halfD + nd],       // 우측 따내기 시작점
        [halfW - nw, -halfD + nd],  // 따내기 안쪽
        [halfW - nw, -halfD],       // 따내기 끝 → 뒤로
      ] : [
        [-halfW, -halfD + nd],      // 좌측 따내기 시작점
        [-halfW, halfD],            // 좌측 앞
        [halfW, halfD],             // 우측 앞
        [halfW, -halfD],            // 우측 뒤
        [-halfW + nw, -halfD],      // 따내기 끝
        [-halfW + nw, -halfD + nd], // 따내기 안쪽
      ];

      // 상면·하면 윤곽선 (Y = ±halfH)
      for (const yVal of [halfH, -halfH]) {
        for (let i = 0; i < xzVerts.length; i++) {
          const next = (i + 1) % xzVerts.length;
          lines.push([
            [xzVerts[i][0], yVal, xzVerts[i][1]],
            [xzVerts[next][0], yVal, xzVerts[next][1]]
          ]);
        }
      }

      // 수직 연결 엣지 (상면↔하면)
      for (const v of xzVerts) {
        lines.push([[v[0], -halfH, v[1]], [v[0], halfH, v[1]]]);
      }
    }

    // backCenterNotch: XZ 평면 ㄷ자 따내기 윤곽선
    if (backCenterNotch && profileVertices.length === 0 && !cornerNotch) {
      const ss = backCenterNotch.sideStrip;
      const nd = backCenterNotch.depth;
      const xzVerts: [number, number][] = [
        [-halfW, -halfD],
        [-halfW + ss, -halfD],
        [-halfW + ss, -halfD + nd],
        [halfW - ss, -halfD + nd],
        [halfW - ss, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
      ];
      for (const yVal of [halfH, -halfH]) {
        for (let i = 0; i < xzVerts.length; i++) {
          const next = (i + 1) % xzVerts.length;
          lines.push([
            [xzVerts[i][0], yVal, xzVerts[i][1]],
            [xzVerts[next][0], yVal, xzVerts[next][1]]
          ]);
        }
      }
      for (const v of xzVerts) {
        lines.push([[v[0], -halfH, v[1]], [v[0], halfH, v[1]]]);
      }
    }

    if (hasFaceGrooves && includeFaceGrooveEdges) {
      lines.push(...buildFaceGrooveEdgeLines(normalizedFaceGrooves));
    }

    return lines;
  }, [notch, notches, bottomRebate, cornerNotch, backCenterNotch, hasAnyNotch, hasFaceGrooves, normalizedFaceGrooves, safeArgs]);

  const liveDimensionNotchLines = React.useMemo(
    () => (hasAnyNotch ? getNotchEdgeLines() : undefined),
    [hasAnyNotch, getNotchEdgeLines]
  );

  const liveDimensionSideNotches = React.useMemo(() => {
    const sourceNotches = notches && notches.length > 0
      ? notches
      : notch
        ? [{ ...notch, fromBottom: safeArgs[1] - notch.y }]
        : [];

    if (sourceNotches.length === 0) return undefined;

    return sourceNotches.map((n) => ({
      y: n.y,
      z: n.z,
      fromBottom: n.fromBottom,
      heightMm: Math.round(n.y / 0.01),
      depthMm: Math.round(n.z / 0.01),
    }));
  }, [notch, notches, safeArgs]);

  const liveDimensionFaceGrooves = React.useMemo(() => {
    if (!normalizedFaceGrooves.length) return undefined;

    return normalizedFaceGrooves.map((groove) => ({
      face: groove.face,
      fromY: groove.y0 + safeArgs[1] / 2,
      height: groove.y1 - groove.y0,
      fromZ: groove.z0 + safeArgs[2] / 2,
      depth: groove.z1 - groove.z0,
      cutDepth: Math.abs(groove.faceX - groove.bottomX),
      heightMm: Math.round((groove.y1 - groove.y0) / 0.01),
      lengthMm: Math.round((groove.z1 - groove.z0) / 0.01),
      grooveWidthMm: Math.round(Math.min(groove.y1 - groove.y0, groove.z1 - groove.z0) / 0.01),
      cutDepthMm: Math.round((Math.abs(groove.faceX - groove.bottomX) / 0.01) * 10) / 10,
    }));
  }, [normalizedFaceGrooves, safeArgs]);

  // 2D 모드에서 엣지 렌더링 (panelName 기반 opacity 적용)
  const render2DEdgesWithDepth = React.useCallback(() => {
    const [width, height, depth] = safeArgs;
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;

    const faceGroovesSpanFullDepth = normalizedFaceGrooves.length > 0 && normalizedFaceGrooves.every((groove) =>
      groove.z0 <= -halfD + 0.00001 && groove.z1 >= halfD - 0.00001
    );
    const hideFaceGrooveEdgesInTop2D = view2DDirection === 'top' && hasFaceGrooves;
    const showFaceGrooveOpeningsInTop2D = hideFaceGrooveEdgesInTop2D && !faceGroovesSpanFullDepth;
    const openFaceGrooveMouthsInFront2D = view2DDirection === 'front' && hasFaceGrooves && faceGroovesSpanFullDepth;
    // notch가 있으면 L자형 엣지 사용. 탑뷰에서는 백패널/서랍 홈가공 내부선만 제외해 외곽선은 유지한다.
    const lines: [number, number, number][][] = hasAnyNotch
      ? getNotchEdgeLines({
        includeFaceGrooveEdges: !(hideFaceGrooveEdgesInTop2D || openFaceGrooveMouthsInFront2D),
        openFaceGrooveMouthsInTopView: showFaceGrooveOpeningsInTop2D,
        openFaceGrooveMouthsInFrontView: openFaceGrooveMouthsInFront2D,
      })
      : [];
    if (showFaceGrooveOpeningsInTop2D) {
      lines.push(...buildTopViewFaceGrooveEdgeLines(normalizedFaceGrooves));
    }
    if (openFaceGrooveMouthsInFront2D) {
      lines.push(...buildFrontViewFaceGrooveEdgeLines(normalizedFaceGrooves));
    }

    if (!hasAnyNotch) {
    // 입면도(front)에서는 앞면 사각형만 표시 (뒷면·연결 엣지 제거 → 불필요한 중앙선 방지)
    const isFrontView = view2DDirection === 'front';

    // 앞면 사각형
    if (!hideTopEdge) lines.push([[-halfW, halfH, halfD], [halfW, halfH, halfD]]);
    if (!hideBottomEdge) lines.push([[-halfW, -halfH, halfD], [halfW, -halfH, halfD]]);
    lines.push([[-halfW, -halfH, halfD], [-halfW, halfH, halfD]]);
    lines.push([[halfW, -halfH, halfD], [halfW, halfH, halfD]]);

    if (!isFrontView) {
      // 뒷면 사각형
      if (!hideTopEdge) lines.push([[-halfW, halfH, -halfD], [halfW, halfH, -halfD]]);
      if (!hideBottomEdge) lines.push([[-halfW, -halfH, -halfD], [halfW, -halfH, -halfD]]);
      lines.push([[-halfW, -halfH, -halfD], [-halfW, halfH, -halfD]]);
      lines.push([[halfW, -halfH, -halfD], [halfW, halfH, -halfD]]);

      // 연결 엣지
      if (!hideTopEdge) {
        lines.push([[-halfW, halfH, halfD], [-halfW, halfH, -halfD]]);
        lines.push([[halfW, halfH, halfD], [halfW, halfH, -halfD]]);
      }
      if (!hideBottomEdge) {
        lines.push([[-halfW, -halfH, halfD], [-halfW, -halfH, -halfD]]);
        lines.push([[halfW, -halfH, halfD], [halfW, -halfH, -halfD]]);
      }
    }
    } // end if (!hasAnyNotch)

    const edgeName = isClothingRod
      ? 'clothing-rod-edge'
      : isBackPanel
        ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
        : `furniture-edge${panelName ? `-${panelName}` : ''}`;

    const baseLineWidth = isHighlighted ? 2 : 1;

    // 깊이감 표현: 다크모드는 배경색과 color 블렌딩, 라이트모드는 opacity만으로 깊이감
    const blendedColor = (view2DTheme === 'light' || panelDepthOpacity >= 1.0) ? edgeColor : (() => {
      const base = new THREE.Color(edgeColor);
      const bg = new THREE.Color('#1a1a2e');
      bg.lerp(base, panelDepthOpacity);
      return '#' + bg.getHexString();
    })();

    // 측면뷰에서 전대/보강대 단면 대각선 표시 (한쪽만)
    const isCrossSection = panelName && (panelName.includes('전대') || panelName.includes('보강대'));
    const isSideView = view2DDirection === 'left' || view2DDirection === 'right';
    const crossLines: [number, number, number][][] = [];
    if (isCrossSection && isSideView) {
      crossLines.push(
        [[0, -halfH, -halfD], [0, halfH, halfD]]   // ↗ 대각선 1개
      );
    }

    return (
      <>
        {lines.map((line, i) => (
          <NativeLine
            key={`${i}-${args[0]}-${args[1]}-${args[2]}`}
            name={`${edgeName}-${i}`}
            points={line}
            color={blendedColor}
            lineWidth={baseLineWidth}
            opacity={panelDepthOpacity}
            transparent={true}
            depthTest={false}
            depthWrite={false}
          />
        ))}
        {crossLines.map((line, i) => (
          <NativeLine
            key={`cross-${i}-${args[0]}-${args[1]}-${args[2]}`}
            name={`${edgeName}-cross-${i}`}
            points={line}
            color={edgeColor}
            lineWidth={1}
            opacity={1.0}
            transparent={true}
            depthTest={false}
            depthWrite={false}
          />
        ))}
      </>
    );
  }, [args, safeArgs, edgeColor, hideTopEdge, hideBottomEdge, isHighlighted, isBackPanel, isClothingRod, panelName, panelDepthOpacity, view2DTheme, view2DDirection, hasAnyNotch, hasFaceGrooves, normalizedFaceGrooves, getNotchEdgeLines]);

  // 노치 지오메트리 (단일 notch 또는 다중 notches 지원)
  const notchGeometry = React.useMemo(() => {
    if (!hasCustomGeometry) return null;
    const [w, h, d] = safeArgs;
    const halfW = w / 2, halfH = h / 2, halfD = d / 2;

    if (hasFaceGrooves && !bottomRebate && !cornerNotch && !backCenterNotch && !hasCircleHoles) {
      return createGroovedPanelGeometry(safeArgs, normalizedFaceGrooves, notch, notches);
    }

    // YZ 평면 Shape 생성 (shapeX=Y축, shapeY=Z축)
    const shape = new THREE.Shape();

    if (bottomRebate) {
      // 반턱: XY 평면 Shape → Z축 extrude
      const rw = bottomRebate.width, rh = bottomRebate.height;
      // 정면 단면 (반시계 방향 — Three.js Shape 기본)
      shape.moveTo(-halfW, -halfH);            // 좌하단 바깥
      shape.lineTo(-halfW, halfH);             // 좌상단
      shape.lineTo(halfW, halfH);              // 우상단
      shape.lineTo(halfW, -halfH);             // 우하단 바깥
      shape.lineTo(halfW, -halfH + rh);        // 우반턱 상단
      shape.lineTo(halfW - rw, -halfH + rh);   // 우반턱 안쪽
      shape.lineTo(halfW - rw, -halfH);        // 중앙 우측 하단
      shape.lineTo(-halfW + rw, -halfH);       // 중앙 좌측 하단
      shape.lineTo(-halfW + rw, -halfH + rh);  // 좌반턱 안쪽
      shape.lineTo(-halfW, -halfH + rh);       // 좌반턱 상단
      shape.closePath();

      const extrudeSettings = { depth: d, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // 좌표 변환: Shape XY 그대로, extrude Z → Z축, 중심 맞추기
      const pos = geom.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        arr[i * 3 + 2] = arr[i * 3 + 2] - halfD; // Z 중심 맞춤
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
      return geom;
    } else if (notches && notches.length > 0) {
      // 다중 노치 프로필
      shape.moveTo(-halfH, -halfD); // bottom-back
      shape.lineTo(-halfH, halfD);  // bottom-front

      const sortedNotches = [...notches].sort((a, b) => a.fromBottom - b.fromBottom);
      for (let ni = 0; ni < sortedNotches.length; ni++) {
        const n = sortedNotches[ni];
        const notchBottom = -halfH + n.fromBottom;
        const notchTop = notchBottom + n.y;
        const isUppermostNotch = Math.abs(notchTop - halfH) < 0.01;
        const next = ni < sortedNotches.length - 1 ? sortedNotches[ni + 1] : null;
        const nextBottom = next ? -halfH + next.fromBottom : null;
        const adjacentToNext = next && nextBottom !== null && Math.abs(notchTop - nextBottom) < 0.01;
        const prev = ni > 0 ? sortedNotches[ni - 1] : null;
        const prevTop = prev ? -halfH + prev.fromBottom + prev.y : null;
        const adjacentToPrev = prev && prevTop !== null && Math.abs(prevTop - notchBottom) < 0.01;

        if (!adjacentToPrev) {
          shape.lineTo(notchBottom, halfD);         // 노치 하단 (앞면)
        }
        shape.lineTo(notchBottom, halfD - n.z);     // 안쪽으로 꺾임
        shape.lineTo(notchTop, halfD - n.z);        // 위로 올라감

        if (isUppermostNotch) {
          shape.lineTo(halfH, -halfD);
        } else if (!adjacentToNext) {
          shape.lineTo(notchTop, halfD);             // 다시 앞면으로
        }
      }

      // 최상단 노치가 halfH에 도달하지 않은 경우 상단 마무리
      const lastNotch = sortedNotches[sortedNotches.length - 1];
      const lastNotchTop = -halfH + lastNotch.fromBottom + lastNotch.y;
      if (Math.abs(lastNotchTop - halfH) >= 0.001) {
        shape.lineTo(halfH, halfD);   // top-front
        shape.lineTo(halfH, -halfD);  // top-back
      }
    } else if (notch) {
      // 단일 상단 노치 (기존 로직)
      const ny = notch.y, nz = notch.z;
      shape.moveTo(-halfH, -halfD);
      shape.lineTo(-halfH, halfD);
      shape.lineTo(halfH - ny, halfD);
      shape.lineTo(halfH - ny, halfD - nz);
      shape.lineTo(halfH, halfD - nz);
      shape.lineTo(halfH, -halfD);
    } else if (cornerNotch) {
      // 코너 따내기: XZ 평면 Shape → Y축 extrude
      const nw = cornerNotch.width;
      const nd = cornerNotch.depth;
      const isRight = cornerNotch.side === 'right';

      // XZ 평면 (shapeX=X축, shapeY=Z축)
      // 시계방향(CW)으로 정의 — 좌표 변환 후 법선이 올바르게 바깥을 향하도록
      if (isRight) {
        shape.moveTo(-halfW, -halfD);           // 좌측 뒤
        shape.lineTo(halfW - nw, -halfD);       // 따내기 끝
        shape.lineTo(halfW - nw, -halfD + nd);  // 따내기 안쪽
        shape.lineTo(halfW, -halfD + nd);       // 우측 따내기 시작
        shape.lineTo(halfW, halfD);             // 우측 앞
        shape.lineTo(-halfW, halfD);            // 좌측 앞
      } else {
        shape.moveTo(-halfW, -halfD + nd);      // 좌측 따내기 시작
        shape.lineTo(-halfW + nw, -halfD + nd); // 따내기 안쪽
        shape.lineTo(-halfW + nw, -halfD);      // 따내기 끝
        shape.lineTo(halfW, -halfD);            // 우측 뒤
        shape.lineTo(halfW, halfD);             // 우측 앞
        shape.lineTo(-halfW, halfD);            // 좌측 앞
      }
      shape.closePath();

      const extrudeSettings = { depth: h, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // 좌표 변환: (shapeX→X, shapeY→Z, extrudeZ→Y) 중심 맞추기
      const pos = geom.attributes.position;
      const arr = pos.array as Float32Array;
      const temp = new Float32Array(arr.length);
      for (let i = 0; i < pos.count; i++) {
        const sx = arr[i * 3];     // shape X → X
        const sy = arr[i * 3 + 1]; // shape Y → Z
        const sz = arr[i * 3 + 2]; // extrude Z → Y
        temp[i * 3]     = sx;          // X
        temp[i * 3 + 1] = sz - halfH;  // Y: 중심 맞춤
        temp[i * 3 + 2] = sy;          // Z
      }
      pos.array.set(temp);
      pos.needsUpdate = true;

      // face winding 뒤집기 — 축 스왑(Y↔Z)으로 인해 면 방향이 반전됨
      const index = geom.index;
      if (index) {
        const idxArr = index.array as Uint16Array | Uint32Array;
        for (let i = 0; i < idxArr.length; i += 3) {
          const tmp = idxArr[i];
          idxArr[i] = idxArr[i + 2];
          idxArr[i + 2] = tmp;
        }
        index.needsUpdate = true;
      }

      geom.computeVertexNormals();
      return geom;
    } else if (backCenterNotch) {
      // 뒷면 가운데 따내기: XZ 평면 ㄷ자 Shape → Y축 extrude
      // 단순히 BufferGeometry를 직접 만드는 방식으로 변경 (winding 문제 회피)
      const ss = backCenterNotch.sideStrip;
      const nd = backCenterNotch.depth;
      // ㄷ자 외곽 8개 정점 (XZ 평면, 시계방향 = 위에서 봤을 때의 외곽)
      // CCW 순서: 좌하 → 좌띠우하 → 좌띠우상(안쪽) → 우띠좌상(안쪽) → 우띠좌하 → 우하 → 우상 → 좌상
      const xzPoints: Array<[number, number]> = [
        [-halfW, -halfD],
        [-halfW + ss, -halfD],
        [-halfW + ss, -halfD + nd],
        [halfW - ss, -halfD + nd],
        [halfW - ss, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
      ];

      // shape 정의 (UV 생성/face triangulation용)
      shape.moveTo(xzPoints[0][0], xzPoints[0][1]);
      for (let i = 1; i < xzPoints.length; i++) shape.lineTo(xzPoints[i][0], xzPoints[i][1]);
      shape.closePath();

      const extrudeSettings = { depth: h, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // ExtrudeGeometry는 shape를 XY 평면에 만들고 Z축으로 extrude함
      // 우리는 shape Y → 월드 Z, extrude Z → 월드 Y 로 변환 + Y 중심 맞춤
      // (shapeX, shapeY, extZ) → (X, extZ - halfH, shapeY)
      const pos = geom.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const sx = arr[i * 3];
        const sy = arr[i * 3 + 1];
        const sz = arr[i * 3 + 2];
        arr[i * 3]     = sx;
        arr[i * 3 + 1] = sz - halfH;
        arr[i * 3 + 2] = sy;
      }
      pos.needsUpdate = true;

      // 위 변환은 (Y,Z) 스왑 = 거울 변환(det = -1) → 모든 face의 winding 반전 필요
      const index = geom.index;
      if (index) {
        const idxArr = index.array as Uint16Array | Uint32Array;
        for (let i = 0; i < idxArr.length; i += 3) {
          const tmp = idxArr[i];
          idxArr[i] = idxArr[i + 2];
          idxArr[i + 2] = tmp;
        }
        index.needsUpdate = true;
      }

      geom.computeVertexNormals();
      return geom;
    } else if (hasCircleHoles && circleHoles) {
      // 백패널 등 평면 패널의 원형 타공: XY 평면 사각형 + 원형 hole(s) → Z축 extrude
      // args = [width, height, thickness] — thickness 방향이 Z축
      const sheet = new THREE.Shape();
      sheet.moveTo(-halfW, -halfH);
      sheet.lineTo(halfW, -halfH);
      sheet.lineTo(halfW, halfH);
      sheet.lineTo(-halfW, halfH);
      sheet.closePath();
      circleHoles.forEach(({ x, y, radius }) => {
        const hole = new THREE.Path();
        hole.absarc(x, y, radius, 0, Math.PI * 2, true);
        sheet.holes.push(hole);
      });
      const extrudeSettings = { depth: d, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(sheet, extrudeSettings);
      // ExtrudeGeometry는 shape XY 평면을 Z축으로 돌출 → 그대로 두고 Z 중심만 맞춤
      const pos = geom.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        arr[i * 3 + 2] = arr[i * 3 + 2] - halfD;
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
      return geom;
    }

    if (!notch && !(notches && notches.length > 0) && !bottomRebate) {
      // cornerNotch/backCenterNotch만 있는 경우는 위에서 이미 반환했으므로 여기 도달하면 notch 없음
      return null;
    }

    shape.closePath();

    const extrudeSettings = { depth: w, bevelEnabled: false };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // 좌표 변환: (shapeX→Y, shapeY→Z, extrudeZ→X) 그리고 중심 맞추기
    const pos = geom.attributes.position;
    const arr = pos.array as Float32Array;
    const temp = new Float32Array(arr.length);
    for (let i = 0; i < pos.count; i++) {
      const sx = arr[i * 3];     // shape X → 우리의 Y
      const sy = arr[i * 3 + 1]; // shape Y → 우리의 Z
      const sz = arr[i * 3 + 2]; // extrude Z → 우리의 X
      temp[i * 3]     = sz - halfW; // X: 돌출 방향, 중심 맞춤
      temp[i * 3 + 1] = sx;         // Y: 높이
      temp[i * 3 + 2] = sy;         // Z: 깊이
    }
    pos.array.set(temp);
    pos.needsUpdate = true;

    // 법선 재계산
    geom.computeVertexNormals();

    return geom;
  }, [notch, notches, bottomRebate, cornerNotch, backCenterNotch, hasCircleHoles, circleHoles, hasAnyNotch, hasCustomGeometry, hasFaceGrooves, normalizedFaceGrooves, safeArgs]);

  // 엣지밴딩 multi-material 적용
  // - 속장 패널: 가구 앞쪽으로 보이는 +Z 단면 한 면에만 (좌/우/뒷/위/아래는 본체색)
  // - 도어 패널: 두께 축 외 4면 모두 엣지 (전후 메인면 제외)
  // - ExtrudeGeometry(faceGroove 있는 측판/백패널)는 측면 분리 불가 → 속장은 적용 보류
  const meshMaterial = React.useMemo<THREE.Material | THREE.Material[]>(() => {
    if (viewMode !== '3D') return finalMaterial; // 엣지 색은 3D에서만 표시
    if (!edgeBandingColor) return finalMaterial;
    const main = finalMaterial as THREE.Material;
    const isDoorPanel = !!panelName && (panelName.includes('도어') || panelName.includes('door'));
    const edgeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(edgeBandingColor),
      roughness: 0.6,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    if (notchGeometry) {
      if (!isDoorPanel) return finalMaterial; // 속장 ExtrudeGeometry는 측면 분리 어려워 보류
      const groups = (notchGeometry as any).groups as { materialIndex?: number }[] | undefined;
      if (groups && groups.length >= 2) {
        const maxIdx = groups.reduce((m, g) => Math.max(m, g.materialIndex ?? 0), 0);
        const mats: THREE.Material[] = [];
        for (let i = 0; i <= maxIdx; i++) {
          mats[i] = i === 0 ? edgeMat : main;
        }
        return mats;
      }
      return finalMaterial;
    }
    const [w, h, d] = safeArgs;
    const minDim = Math.min(w, h, d);
    const isThinX = w === minDim;
    const isThinY = h === minDim && !isThinX;
    const isThinZ = d === minDim && !isThinX && !isThinY;
    // BoxGeometry face order: [+X, -X, +Y, -Y, +Z, -Z]
    // 기본은 본체색, 노출되는 단면만 엣지색으로 덮어씀
    const mats: THREE.Material[] = [main, main, main, main, main, main];
    if (isDoorPanel) {
      // 도어: 두께 축 외 4면 모두 엣지밴딩 표시
      if (isThinX) { mats[2] = edgeMat; mats[3] = edgeMat; mats[4] = edgeMat; mats[5] = edgeMat; }
      else if (isThinY) { mats[0] = edgeMat; mats[1] = edgeMat; mats[4] = edgeMat; mats[5] = edgeMat; }
      else if (isThinZ) { mats[0] = edgeMat; mats[1] = edgeMat; mats[2] = edgeMat; mats[3] = edgeMat; }
      else { mats[0] = edgeMat; mats[1] = edgeMat; mats[2] = edgeMat; mats[3] = edgeMat; }
    } else {
      // 속장: 가구 앞쪽으로 보이는 +Z 단면 한 면에만 엣지밴딩
      mats[4] = edgeMat;
    }
    return mats;
  }, [finalMaterial, edgeBandingColor, notchGeometry, safeArgs, viewMode, panelName]);

  const selectedOutlineLines = React.useMemo<[number, number, number][][]>(() => {
    if (!isLiveDimensionSelected || viewMode !== '3D') return [];
    if (hasAnyNotch) return getNotchEdgeLines();

    const [width, height, depth] = safeArgs;
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;

    return [
      [[-halfW, -halfH, -halfD], [halfW, -halfH, -halfD]],
      [[halfW, -halfH, -halfD], [halfW, halfH, -halfD]],
      [[halfW, halfH, -halfD], [-halfW, halfH, -halfD]],
      [[-halfW, halfH, -halfD], [-halfW, -halfH, -halfD]],
      [[-halfW, -halfH, halfD], [halfW, -halfH, halfD]],
      [[halfW, -halfH, halfD], [halfW, halfH, halfD]],
      [[halfW, halfH, halfD], [-halfW, halfH, halfD]],
      [[-halfW, halfH, halfD], [-halfW, -halfH, halfD]],
      [[-halfW, -halfH, -halfD], [-halfW, -halfH, halfD]],
      [[halfW, -halfH, -halfD], [halfW, -halfH, halfD]],
      [[halfW, halfH, -halfD], [halfW, halfH, halfD]],
      [[-halfW, halfH, -halfD], [-halfW, halfH, halfD]],
    ];
  }, [isLiveDimensionSelected, viewMode, hasAnyNotch, getNotchEdgeLines, safeArgs]);

  return (
    <group ref={groupRef} position={position} userData={furnitureId ? { furnitureId, panelName, liveDimensionKey: compositeKey } : undefined}
      visible={!hiddenByViewMode}
    >
      {/* 면 렌더링 - 와이어프레임에서는 투명하게 */}
      {/* DXF 내보내기를 위해 mesh에도 이름 추가 */}
      <mesh
        name={isClothingRod ? 'clothing-rod-mesh' : isBackPanel ? `back-panel-mesh${panelName ? `-${panelName}` : ''}` : `furniture-mesh${panelName ? `-${panelName}` : ''}`}
        userData={{
          ...(furnitureId ? { furnitureId } : {}),
          ...(panelName ? { panelName } : {}),
          ...(compositeKey ? { liveDimensionKey: compositeKey } : {}),
          liveDimension: {
            widthMm: Math.round(safeArgs[0] / 0.01),
            heightMm: Math.round(safeArgs[1] / 0.01),
            depthMm: Math.round(safeArgs[2] / 0.01),
            useObjectBounds: true,
          },
          ...(liveDimensionNotchLines ? { liveDimensionNotchLines } : {}),
          ...(liveDimensionSideNotches ? { liveDimensionSideNotches } : {}),
          ...(liveDimensionFaceGrooves ? { liveDimensionFaceGrooves } : {}),
        }}
        receiveShadow={viewMode === '3D' && effectiveRenderMode === 'solid' && shadowEnabled}
        castShadow={viewMode === '3D' && effectiveRenderMode === 'solid' && shadowEnabled}
        renderOrder={renderOrder ?? 10}
        onClick={handlePanelClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        material={meshMaterial as any}
      >
        {notchGeometry ? (
          <primitive key={`notch-${safeArgs[0]}-${safeArgs[1]}-${safeArgs[2]}-${JSON.stringify(notch || notches || cornerNotch || backCenterNotch || faceGrooves || circleHoles)}`} object={notchGeometry} attach="geometry" />
        ) : (
          <boxGeometry key={`${safeArgs[0]}-${safeArgs[1]}-${safeArgs[2]}`} args={safeArgs} />
        )}
      </mesh>
      {viewMode === '3D' && doorEdgeBandingStrip && edgeBandingColor && effectiveRenderMode === 'solid' && (
        <group
          name={`door-edge-banding${panelName ? `-${panelName}` : ''}`}
          userData={{ decoration: true, edgeBandingOverlay: true }}
        >
          {[doorEdgeBandingStrip.frontZ, doorEdgeBandingStrip.backZ].map((z, faceIndex) => (
            <React.Fragment key={`door-edge-face-${faceIndex}`}>
              <mesh position={[0, safeArgs[1] / 2 - doorEdgeBandingStrip.strip / 2, z]} renderOrder={10020} raycast={() => null}>
                <boxGeometry args={[doorEdgeBandingStrip.horizontalWidth, doorEdgeBandingStrip.strip, doorEdgeBandingStrip.stripDepth]} />
                <meshBasicMaterial color={edgeBandingColor} toneMapped={false} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, -safeArgs[1] / 2 + doorEdgeBandingStrip.strip / 2, z]} renderOrder={10020} raycast={() => null}>
                <boxGeometry args={[doorEdgeBandingStrip.horizontalWidth, doorEdgeBandingStrip.strip, doorEdgeBandingStrip.stripDepth]} />
                <meshBasicMaterial color={edgeBandingColor} toneMapped={false} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[-safeArgs[0] / 2 + doorEdgeBandingStrip.strip / 2, 0, z]} renderOrder={10020} raycast={() => null}>
                <boxGeometry args={[doorEdgeBandingStrip.strip, doorEdgeBandingStrip.verticalHeight, doorEdgeBandingStrip.stripDepth]} />
                <meshBasicMaterial color={edgeBandingColor} toneMapped={false} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[safeArgs[0] / 2 - doorEdgeBandingStrip.strip / 2, 0, z]} renderOrder={10020} raycast={() => null}>
                <boxGeometry args={[doorEdgeBandingStrip.strip, doorEdgeBandingStrip.verticalHeight, doorEdgeBandingStrip.stripDepth]} />
                <meshBasicMaterial color={edgeBandingColor} toneMapped={false} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            </React.Fragment>
          ))}
        </group>
      )}
      {isLiveDimensionSelected && viewMode === '3D' && (
        <mesh
          name={`tape-selected-panel-glow${panelName ? `-${panelName}` : ''}`}
          scale={[1.012, 1.012, 1.012]}
          renderOrder={(renderOrder ?? 10) + 1000}
          raycast={() => null}
          userData={{ tapeMeasureOverlay: true, liveDimensionOverlay: true, decoration: true }}
        >
          {notchGeometry ? (
            <primitive key={`selected-glow-notch-${safeArgs[0]}-${safeArgs[1]}-${safeArgs[2]}-${JSON.stringify(notch || notches || cornerNotch || backCenterNotch || faceGrooves || circleHoles)}`} object={notchGeometry} attach="geometry" />
          ) : (
            <boxGeometry key={`selected-glow-${safeArgs[0]}-${safeArgs[1]}-${safeArgs[2]}`} args={safeArgs} />
          )}
          <meshBasicMaterial
            color={selectedPanelHighlightColor}
            transparent
            opacity={0.28}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {selectedOutlineLines.length > 0 && (
        <group userData={{ tapeMeasureOverlay: true, liveDimensionOverlay: true, decoration: true }}>
          {selectedOutlineLines.map((line, index) => (
            <React.Fragment key={`selected-outline-${index}-${line[0].join(',')}-${line[1].join(',')}`}>
              <NativeLine
                name={`tape-selected-panel-outline-shadow${panelName ? `-${panelName}` : ''}-${index}`}
                points={line}
                color="#111827"
                lineWidth={2.4}
                opacity={0.42}
                transparent
                depthTest={false}
                depthWrite={false}
                renderOrder={(renderOrder ?? 10) + 1002}
              />
              <NativeLine
                name={`tape-selected-panel-outline${panelName ? `-${panelName}` : ''}-${index}`}
                points={line}
                color={selectedPanelHighlightColor}
                lineWidth={1.35}
                opacity={0.98}
                transparent
                depthTest={false}
                depthWrite={false}
                renderOrder={(renderOrder ?? 10) + 1003}
              />
            </React.Fragment>
          ))}
        </group>
      )}
      {/* 윤곽선 렌더링 - hideEdges prop 또는 edgeOutlineEnabled 스토어 설정으로 제어 */}
      {!hideEdges && edgeOutlineEnabled && (() => {
        // 2D 모드: 깊이 기반 개별 라인 opacity 적용
        if (viewMode === '2D') {
          return render2DEdgesWithDepth();
        }

        const inspectionEdgeActive = false;
        const resolvedEdgeColor = edgeColor;
        const resolvedEdgeOpacity = isHighlighted ? 1.0 : (effectiveRenderMode === 'wireframe' ? 1.0 : 0.65);
        const resolvedEdgeLineWidth = isHighlighted ? 3 : 1;
        const resolvedEdgeDepthTest = effectiveRenderMode !== 'wireframe';

        // 3D 모드: notch가 있으면 L자형 엣지
        if (hasAnyNotch) {
          const notchLines = getNotchEdgeLines();
          const notchEdgeName = isClothingRod
            ? 'clothing-rod-edge'
            : isBackPanel
              ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
              : `furniture-edge${panelName ? `-${panelName}` : ''}`;
          return (
            <>
              {notchLines.map((line, i) => (
                inspectionEdgeActive ? (
                  <NativeLine
                    key={`${notchEdgeName}-${i}-${line[0].join(',')}-${line[1].join(',')}`}
                    name={`${notchEdgeName}-${i}`}
                    points={line}
                    color={resolvedEdgeColor}
                    lineWidth={resolvedEdgeLineWidth}
                    opacity={resolvedEdgeOpacity}
                    transparent
                    depthTest={resolvedEdgeDepthTest}
                    depthWrite={false}
                    renderOrder={100010}
                  />
                ) : (
                  <line key={`${notchEdgeName}-${i}-${line[0].join(',')}-${line[1].join(',')}`} name={`${notchEdgeName}-${i}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([...line[0], ...line[1]])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial
                      color={resolvedEdgeColor}
                      transparent={effectiveRenderMode !== 'wireframe'}
                      opacity={resolvedEdgeOpacity}
                      depthTest={resolvedEdgeDepthTest}
                      depthWrite={false}
                      linewidth={resolvedEdgeLineWidth}
                    />
                  </line>
                )
              ))}
            </>
          );
        }

        if (hideTopEdge || hideBottomEdge) {
          const [width, height, depth] = safeArgs;
          const halfW = width / 2;
          const halfH = height / 2;
          const halfD = depth / 2;

          const lines: [number, number, number][][] = [];

          // 앞면 사각형 (4개 엣지)
          if (!hideTopEdge) lines.push([[-halfW, halfH, halfD], [halfW, halfH, halfD]]);
          if (!hideBottomEdge) lines.push([[-halfW, -halfH, halfD], [halfW, -halfH, halfD]]);
          lines.push([[-halfW, -halfH, halfD], [-halfW, halfH, halfD]]);
          lines.push([[halfW, -halfH, halfD], [halfW, halfH, halfD]]);

          // 뒷면 사각형
          if (!hideTopEdge) lines.push([[-halfW, halfH, -halfD], [halfW, halfH, -halfD]]);
          if (!hideBottomEdge) lines.push([[-halfW, -halfH, -halfD], [halfW, -halfH, -halfD]]);
          lines.push([[-halfW, -halfH, -halfD], [-halfW, halfH, -halfD]]);
          lines.push([[halfW, -halfH, -halfD], [halfW, halfH, -halfD]]);

          // 연결 엣지
          if (!hideTopEdge) {
            lines.push([[-halfW, halfH, halfD], [-halfW, halfH, -halfD]]);
            lines.push([[halfW, halfH, halfD], [halfW, halfH, -halfD]]);
          }
          if (!hideBottomEdge) {
            lines.push([[-halfW, -halfH, halfD], [-halfW, -halfH, -halfD]]);
            lines.push([[halfW, -halfH, halfD], [halfW, -halfH, -halfD]]);
          }

          const partialEdgeName = isClothingRod
            ? 'clothing-rod-edge'
            : isBackPanel
              ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
              : `furniture-edge${panelName ? `-${panelName}` : ''}`;
          return (
            <>
              {lines.map((line, i) => (
                inspectionEdgeActive ? (
                  <NativeLine
                    key={i}
                    name={`${partialEdgeName}-${i}`}
                    points={line}
                    color={resolvedEdgeColor}
                    lineWidth={resolvedEdgeLineWidth}
                    opacity={resolvedEdgeOpacity}
                    transparent
                    depthTest={resolvedEdgeDepthTest}
                    depthWrite={false}
                    renderOrder={100010}
                  />
                ) : (
                  <line key={i} name={`${partialEdgeName}-${i}`}>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        count={2}
                        array={new Float32Array([...line[0], ...line[1]])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial
                      color={resolvedEdgeColor}
                      transparent={effectiveRenderMode !== 'wireframe'}
                      opacity={resolvedEdgeOpacity}
                      depthTest={resolvedEdgeDepthTest}
                      depthWrite={false}
                      linewidth={resolvedEdgeLineWidth}
                    />
                  </line>
                )
              ))}
            </>
          );
        } else {
          // 전체 엣지 표시
          const edgeName = isClothingRod
            ? 'clothing-rod-edge'
            : isBackPanel
              ? `back-panel-edge${panelName ? `-${panelName}` : ''}`
              : `furniture-edge${panelName ? `-${panelName}` : ''}`;
          if (inspectionEdgeActive) {
            const [width, height, depth] = safeArgs;
            const halfW = width / 2;
            const halfH = height / 2;
            const halfD = depth / 2;
            const lines: [number, number, number][][] = [
              [[-halfW, -halfH, -halfD], [halfW, -halfH, -halfD]],
              [[halfW, -halfH, -halfD], [halfW, halfH, -halfD]],
              [[halfW, halfH, -halfD], [-halfW, halfH, -halfD]],
              [[-halfW, halfH, -halfD], [-halfW, -halfH, -halfD]],
              [[-halfW, -halfH, halfD], [halfW, -halfH, halfD]],
              [[halfW, -halfH, halfD], [halfW, halfH, halfD]],
              [[halfW, halfH, halfD], [-halfW, halfH, halfD]],
              [[-halfW, halfH, halfD], [-halfW, -halfH, halfD]],
              [[-halfW, -halfH, -halfD], [-halfW, -halfH, halfD]],
              [[halfW, -halfH, -halfD], [halfW, -halfH, halfD]],
              [[halfW, halfH, -halfD], [halfW, halfH, halfD]],
              [[-halfW, halfH, -halfD], [-halfW, halfH, halfD]],
            ];
            return (
              <>
                {lines.map((line, i) => (
                  <NativeLine
                    key={`${edgeName}-${i}`}
                    name={`${edgeName}-${i}`}
                    points={line}
                    color={resolvedEdgeColor}
                    lineWidth={resolvedEdgeLineWidth}
                    opacity={resolvedEdgeOpacity}
                    transparent
                    depthTest={resolvedEdgeDepthTest}
                    depthWrite={false}
                    renderOrder={100010}
                  />
                ))}
              </>
            );
          }
          return (
            <>
              <lineSegments name={edgeName}>
                <edgesGeometry key={`${safeArgs[0]}-${safeArgs[1]}-${safeArgs[2]}`} args={[new THREE.BoxGeometry(...safeArgs)]} />
                <lineBasicMaterial
                  color={resolvedEdgeColor}
                  transparent={effectiveRenderMode !== 'wireframe'}
                  opacity={resolvedEdgeOpacity}
                  depthTest={resolvedEdgeDepthTest}
                  depthWrite={false}
                  polygonOffset={true}
                  polygonOffsetFactor={-10}
                  polygonOffsetUnits={-10}
                  linewidth={resolvedEdgeLineWidth}
                />
              </lineSegments>
            </>
          );
        }
      })()}
      {/* circleHoles 윤곽선: 백패널 앞/뒤 양면 + 중앙(2D 정면뷰용)에 원형 라인 표시 */}
      {hasCircleHoles && circleHoles && circleHoles.map((hole, hi) => {
        const segments = 64;
        // lineSegments용 — 인접한 두 점씩 쌍으로 배치
        const pairs: number[] = [];
        for (let i = 0; i < segments; i++) {
          const a1 = (i / segments) * Math.PI * 2;
          const a2 = ((i + 1) / segments) * Math.PI * 2;
          pairs.push(
            hole.x + Math.cos(a1) * hole.radius, hole.y + Math.sin(a1) * hole.radius, 0,
            hole.x + Math.cos(a2) * hole.radius, hole.y + Math.sin(a2) * hole.radius, 0,
          );
        }
        const halfD = args[2] / 2;
        const renderCircle = (zPos: number, keySuffix: string) => (
          <lineSegments key={keySuffix} position={[0, 0, zPos]}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={segments * 2}
                array={new Float32Array(pairs)}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={edgeColor} transparent={false} depthTest={false} depthWrite={false} />
          </lineSegments>
        );
        return (
          <React.Fragment key={`hole-outline-${hi}`}>
            {renderCircle(halfD + 0.002, `hole-${hi}-front`)}
            {renderCircle(-halfD - 0.002, `hole-${hi}-back`)}
            {renderCircle(0, `hole-${hi}-mid`)}
          </React.Fragment>
        );
      })}
    </group>
  );
};

export default BoxWithEdges;
