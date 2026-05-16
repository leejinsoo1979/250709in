import * as THREE from 'three';

export interface PanelSimulationSource {
  key: string;
  layoutKey: string;
  furnitureId: string;
  panelName: string;
  args: [number, number, number];
  worldPosition: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
  color: string;
  opacity: number;
  assemblyOnly?: boolean;
  shape?: 'box' | 'adjustableFoot' | 'glassDoor';
  objectClone?: THREE.Object3D;
}

const sources = new Map<string, PanelSimulationSource>();
let sourceRegistryVersion = 0;

const findRenderableMaterial = (object: THREE.Object3D): THREE.Material | undefined => {
  let found: THREE.Material | undefined;
  object.traverse(child => {
    if (found) return;
    const material = (child as THREE.Mesh).material;
    if (Array.isArray(material)) {
      found = material.find(Boolean);
    } else if (material) {
      found = material;
    }
  });
  return found;
};

const getMaterialColor = (material?: THREE.Material) => {
  const color = (material as any)?.color;
  if (color && typeof color.getHexString === 'function') {
    return `#${color.getHexString()}`;
  }
  return '#cbd5e1';
};

const getMaterialOpacity = (material?: THREE.Material) => {
  const opacity = (material as any)?.opacity;
  return Number.isFinite(opacity) ? opacity : 1;
};

export const updatePanelSimulationSource = ({
  key,
  furnitureId,
  panelName,
  args,
  object,
  material,
  assemblyOnly = false,
  shape = 'box',
}: {
  key: string;
  furnitureId: string;
  panelName: string;
  args: [number, number, number];
  object: THREE.Object3D;
  material?: THREE.Material;
  assemblyOnly?: boolean;
  shape?: 'box' | 'adjustableFoot' | 'glassDoor';
}) => {
  object.updateWorldMatrix(true, false);
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  object.getWorldPosition(worldPosition);
  object.getWorldQuaternion(worldQuaternion);
  const sourceMaterial = material || findRenderableMaterial(object);
  const registryKey = `${key}@@${object.uuid}`;
  const existing = sources.get(registryKey);
  const objectClone = existing?.objectClone || (() => {
    const clone = object.clone(true);
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    return clone;
  })();
  if (assemblyOnly) {
    objectClone.visible = true;
    objectClone.traverse(child => {
      child.visible = true;
    });
  }

  sources.set(registryKey, {
    key: registryKey,
    layoutKey: key,
    furnitureId,
    panelName,
    args,
    worldPosition,
    worldQuaternion,
    color: getMaterialColor(sourceMaterial),
    opacity: getMaterialOpacity(sourceMaterial),
    assemblyOnly,
    shape,
    objectClone,
  });
};

export const removePanelSimulationSource = (key: string) => {
  sources.delete(key);
  Array.from(sources.keys()).forEach(sourceKey => {
    if (sourceKey.startsWith(`${key}@@`) || sourceKey.startsWith(`accessory::${key}@@`)) {
      sources.delete(sourceKey);
    }
  });
};

export const clearPanelSimulationSources = () => {
  sources.clear();
  sourceRegistryVersion += 1;
};

export const getPanelSimulationSourceRegistryVersion = () => sourceRegistryVersion;

export const getPanelSimulationSources = () => Array.from(sources.values());
