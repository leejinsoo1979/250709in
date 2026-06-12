import { useSyncExternalStore } from 'react';
import type { ModuleData } from './shelving';

let adminModules: ModuleData[] = [];
let revision = 0;
const listeners = new Set<() => void>();

const emit = () => {
  revision += 1;
  listeners.forEach(listener => listener());
};

export const setAdminFurnitureModules = (modules: ModuleData[]) => {
  adminModules = modules;
  emit();
};

export const clearAdminFurnitureModules = () => {
  adminModules = [];
  emit();
};

export const getAdminFurnitureModules = () => adminModules;

export const getAdminFurnitureModuleById = (id: string) => (
  adminModules.find(module => module.id === id) || null
);

/** ID에서 끝의 폭(-600, -599.67 등)을 제거한 base 타입 */
export const stripAdminModuleWidth = (id: string) => id.replace(/-[\d.]+$/, '');

/** base 타입(폭 제외)으로 admin 모듈 검색 — 동적 폭 매칭용 */
export const getAdminFurnitureModuleByBaseId = (baseId: string) => (
  adminModules.find(module => stripAdminModuleWidth(module.id) === baseId) || null
);

export const useAdminFurnitureModuleRegistryVersion = () => (
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
    () => revision
  )
);
