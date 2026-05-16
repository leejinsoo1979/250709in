import * as THREE from 'three';
import type { PanelSimulationLayout } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getExcludedPanelAliases } from '../context/ExcludedPanelsContext';
import {
  getCanonicalPanelNameCandidates,
  getCanonicalPanelNameMatchScore,
  normalizeCanonicalPanelName,
} from '@/editor/shared/utils/panelNameCanonical';

export const PANEL_SIMULATION_DURATION = 0.92;
export const PANEL_SIMULATION_DELAY_STEP = 0.0045;
export const PANEL_SIMULATION_ASSEMBLY_DELAY_STEP = 0.0038;
export const PANEL_SIMULATION_FURNITURE_SPAN = 960;
export const PANEL_SIMULATION_FINAL_STAGE_ORDER = 600;
export const MIN_SIMULATION_BOX_SIZE = 0.001;

const panelSimulationSlots = new Map<string, number>();

export const getPanelSimulationSlot = (key: string) => {
  const existing = panelSimulationSlots.get(key);
  if (existing !== undefined) return existing;
  const next = panelSimulationSlots.size;
  panelSimulationSlots.set(key, next);
  return next;
};

export const easeInOutCubic = (t: number) => {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
};

export const easeOutCubic = (t: number) => {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
};

export const smootherStep = (t: number) => {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
};

export const normalizeSimulationPanelName = (name?: string) => {
  return normalizeCanonicalPanelName(name);
};

const getSimulationPanelNameCandidates = (panelName?: string) => {
  const candidates = getCanonicalPanelNameCandidates(panelName);
  getExcludedPanelAliases(panelName).forEach(alias => {
    getCanonicalPanelNameCandidates(alias).forEach(candidate => candidates.add(candidate));
  });
  return candidates;
};

const getPanelNameMatchScore = (sourceName?: string, layoutName?: string) => {
  return getCanonicalPanelNameMatchScore(sourceName, layoutName);
};

const getLayoutNameFromKey = (key: string) => {
  const separatorIndex = key.indexOf('::');
  if (separatorIndex < 0) return key;
  return key.slice(separatorIndex + 2).replace(/#\d+$/g, '');
};

export const resolvePanelSimulationTarget = (
  layouts: Record<string, PanelSimulationLayout>,
  furnitureId?: string,
  panelName?: string,
  args?: [number, number, number]
) => {
  if (!furnitureId || !panelName) return undefined;
  const exactKey = `${furnitureId}::${panelName}`;
  if (layouts[exactKey]) return { key: exactKey, layout: layouts[exactKey] };

  const targetNames = getSimulationPanelNameCandidates(panelName);
  for (const [key, layout] of Object.entries(layouts)) {
    const separatorIndex = key.indexOf('::');
    if (separatorIndex < 0 || key.slice(0, separatorIndex) !== furnitureId) continue;
    const candidateNames = getSimulationPanelNameCandidates(getLayoutNameFromKey(key));
    for (const targetName of targetNames) {
      if (candidateNames.has(targetName)) return { key, layout };
    }
  }

  if (!args) return undefined;

  const { widthAxis, lengthAxis } = getFlatPanelAxes(args);
  const sourceFace = [args[widthAxis.index], args[lengthAxis.index]].sort((a, b) => a - b);
  let best: { key: string; layout: PanelSimulationLayout; score: number } | undefined;
  const seenLayouts = new Set<string>();
  for (const [key, layout] of Object.entries(layouts)) {
    const separatorIndex = key.indexOf('::');
    if (separatorIndex < 0 || key.slice(0, separatorIndex) !== furnitureId) continue;
    const layoutIdentity = `${layout.sheetIndex}:${layout.order}:${layout.worldX.toFixed(4)}:${layout.worldZ.toFixed(4)}`;
    if (seenLayouts.has(layoutIdentity)) continue;
    seenLayouts.add(layoutIdentity);
    const layoutFace = [
      layout.widthWorld / Math.max(layout.scale, 0.001),
      layout.heightWorld / Math.max(layout.scale, 0.001),
    ].sort((a, b) => a - b);
    const dimensionScore = Math.abs(sourceFace[0] - layoutFace[0]) + Math.abs(sourceFace[1] - layoutFace[1]);
    if (dimensionScore > 0.18) continue;
    const nameScore = getPanelNameMatchScore(panelName, getLayoutNameFromKey(key));
    const score = dimensionScore + nameScore;
    if (!best || score < best.score) {
      best = { key, layout, score };
    }
  }
  return best ? { key: best.key, layout: best.layout } : undefined;
};

export const resolvePanelSimulationLayout = (
  layouts: Record<string, PanelSimulationLayout>,
  furnitureId?: string,
  panelName?: string
) => {
  return resolvePanelSimulationTarget(layouts, furnitureId, panelName)?.layout;
};

export const getPanelSimulationLayoutKey = (
  layouts: Record<string, PanelSimulationLayout>,
  furnitureId?: string,
  panelName?: string
) => {
  return resolvePanelSimulationTarget(layouts, furnitureId, panelName)?.key || (furnitureId && panelName ? `${furnitureId}::${panelName}` : undefined);
};

export const getPanelAssemblyStage = (panelName?: string, isClothingRod = false) => {
  const name = panelName || '';
  if (name.includes('도어')) return 8;
  if (name.includes('상단몰딩') || name === 'top-frame') return 7;
  if (name.includes('걸레받이') || name.includes('걸래받이') || name === 'base-frame') return 6;
  if (isClothingRod || name.includes('옷봉')) return 5;
  if (name.includes('(상)') || name.includes('상부')) return 4;
  if (name.includes('서랍') || name.includes('마이다')) return 3;
  if (name.includes('조절발')) return 1;
  if (name.includes('(하)') || name.includes('하부')) return 2;
  return 2;
};

const getDrawerAssemblySubOrder = (panelName?: string) => {
  const name = panelName || '';
  if (!name.includes('서랍') && !name.includes('마이다')) return 0;
  if (name.includes('날개')) return 0;
  if (name.includes('바닥')) return 32;
  if (name.includes('뒷판') || name.includes('후면')) return 64;
  if (name.includes('측판') || name.includes('좌측판') || name.includes('우측판') || name.includes('좌측') || name.includes('우측')) return 96;
  if (name.includes('마이다')) return 160;
  if (name.includes('앞판') || name.includes('전면')) return 128;
  return 80;
};

const getPanelNameHash = (value?: string) => {
  const text = value || '';
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  return hash;
};

const getCabinetPanelSubOrder = (panelName?: string) => {
  const name = panelName || '';
  if (name.includes('조절발')) return 0;
  if (name.includes('바닥')) return 0;
  if (name.includes('좌측판') || name.includes('좌측') || name.includes('left')) return 34;
  if (name.includes('우측판') || name.includes('우측') || name.includes('right')) return 52;
  if (name.includes('뒷판') || name.includes('후면') || name.includes('백패널') || name.includes('back')) return 76;
  if (name.includes('보강대')) return 98;
  if (name.includes('선반') || name.includes('고정')) return 116;
  if (name.includes('상판') || name.includes('천판')) return 142;
  return 92;
};

export const getPanelAssemblySequence = (
  furnitureId: string | undefined,
  panelName: string | undefined,
  localPosition: [number, number, number],
  parent?: THREE.Object3D | null,
  isClothingRod = false
) => {
  const modules = useFurnitureStore.getState().placedModules;
  const sortedIds = [...modules]
    .sort((a, b) => {
      const aSlot = typeof a.slotIndex === 'number' ? a.slotIndex : Number.POSITIVE_INFINITY;
      const bSlot = typeof b.slotIndex === 'number' ? b.slotIndex : Number.POSITIVE_INFINITY;
      if (aSlot !== bSlot) return aSlot - bSlot;
      return (a.position?.x || 0) - (b.position?.x || 0);
    })
    .map(module => module.id);
  const furnitureIndex = furnitureId ? Math.max(0, sortedIds.indexOf(furnitureId)) : 0;
  const furnitureCount = Math.max(1, sortedIds.length);
  const stage = getPanelAssemblyStage(panelName, isClothingRod);
  const worldPosition = new THREE.Vector3(localPosition[0], localPosition[1], localPosition[2]);
  if (parent) parent.localToWorld(worldPosition);
  const positionOrder = Math.max(0, Math.round(
    (worldPosition.y + 30) * 0.95 +
    (worldPosition.x + 50) * 0.18 +
    (worldPosition.z + 50) * 0.12
  ));
  const nameNudge = getPanelNameHash(panelName) % 18;
  const rawLocalOrder = Math.min(210, getCabinetPanelSubOrder(panelName) + positionOrder + nameNudge);
  const localOrder = stage === 1
    ? Math.min(70, rawLocalOrder)
    : stage === 3
      ? Math.min(150, rawLocalOrder)
      : stage >= 5
        ? Math.min(110, rawLocalOrder)
        : Math.min(170, rawLocalOrder);
  const bodyStageBase: Record<number, number> = {
    1: 0,
    2: 150,
    3: 380,
    4: 740,
  };
  const finalStageBase: Record<number, number> = {
    5: 0,
    6: 190,
    7: 390,
    8: PANEL_SIMULATION_FINAL_STAGE_ORDER,
  };

  if (stage >= 5) {
    const allFurnitureBodyEnd = furnitureCount * PANEL_SIMULATION_FURNITURE_SPAN;
    return allFurnitureBodyEnd + (finalStageBase[stage] ?? 0) + furnitureIndex * 18 + localOrder;
  }

  return furnitureIndex * PANEL_SIMULATION_FURNITURE_SPAN + (bodyStageBase[stage] ?? 70) + getDrawerAssemblySubOrder(panelName) + localOrder;
};

export const getFlatPanelAxes = (dims: [number, number, number]) => {
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

export const buildFlatPanelQuaternion = (dims: [number, number, number], rotationZ: number) => {
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
