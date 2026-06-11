// 뷰어(DoorModule)가 실제 렌더링한 경첩 지오메트리를 우측바(PlacedModulePropertiesPanel)와 공유하는 레지스트리.
// 뷰어와 우측바가 몸통 높이/도어 높이/도어 하단 기준을 각자 계산하면 기본 경첩 위치가 어긋나므로,
// 뷰어 계산 결과를 single source of truth로 publish하고 우측바는 이를 우선 사용한다.

export type DoorHingeGeometryField =
  | 'hingePositionsMm'
  | 'upperDoorHingePositionsMm'
  | 'lowerDoorHingePositionsMm';

export interface DoorHingeGeometry {
  furnitureId: string;
  field: DoorHingeGeometryField;
  doorHeightMm: number;
  doorBottomOnSideMm: number;
  /** 도어 하단 기준(mm, 아래→위) 경첩 위치 — 뷰어가 실제 표시하는 값 */
  doorPositionsMm: number[];
}

const geometries = new Map<string, DoorHingeGeometry>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (furnitureId: string, field: DoorHingeGeometryField) => `${furnitureId}::${field}`;

const notify = () => {
  version += 1;
  listeners.forEach(listener => listener());
};

export const subscribeDoorHingeGeometry = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getDoorHingeGeometrySnapshot = () => version;

export const updateDoorHingeGeometry = ({
  furnitureId,
  field,
  doorHeightMm,
  doorBottomOnSideMm,
  doorPositionsMm,
}: {
  furnitureId?: string;
  field: DoorHingeGeometryField;
  doorHeightMm: number;
  doorBottomOnSideMm: number;
  doorPositionsMm: number[];
}) => {
  if (!furnitureId) return;
  if (!Number.isFinite(doorHeightMm) || doorHeightMm <= 0) return;
  if (!Number.isFinite(doorBottomOnSideMm)) return;

  const positions = (doorPositionsMm || [])
    .filter(position => Number.isFinite(position))
    .map(position => Math.round(position * 1000) / 1000)
    .sort((a, b) => a - b);

  const next: DoorHingeGeometry = {
    furnitureId,
    field,
    doorHeightMm: Math.round(doorHeightMm * 1000) / 1000,
    doorBottomOnSideMm: Math.round(doorBottomOnSideMm * 1000) / 1000,
    doorPositionsMm: positions,
  };
  const key = keyOf(furnitureId, field);
  const prev = geometries.get(key);
  if (
    prev &&
    prev.doorHeightMm === next.doorHeightMm &&
    prev.doorBottomOnSideMm === next.doorBottomOnSideMm &&
    prev.doorPositionsMm.length === next.doorPositionsMm.length &&
    prev.doorPositionsMm.every((position, index) => position === next.doorPositionsMm[index])
  ) {
    return;
  }

  geometries.set(key, next);
  notify();
};

export const removeDoorHingeGeometry = (furnitureId?: string, field?: DoorHingeGeometryField) => {
  if (!furnitureId) return;
  let changed = false;
  if (field) {
    changed = geometries.delete(keyOf(furnitureId, field));
  } else {
    Array.from(geometries.keys()).forEach(key => {
      if (key.startsWith(`${furnitureId}::`)) {
        geometries.delete(key);
        changed = true;
      }
    });
  }
  if (changed) notify();
};

export const findDoorHingeGeometry = (
  furnitureId: string | undefined,
  field: DoorHingeGeometryField
): DoorHingeGeometry | undefined => {
  if (!furnitureId) return undefined;
  return geometries.get(keyOf(furnitureId, field));
};
