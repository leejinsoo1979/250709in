/**
 * 가구 모듈에서 보링 데이터를 생성하는 React 훅
 */

import { useMemo } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import {
  convertMultipleFurnitureToBoring,
  type FurnitureBoringInput,
  type BatchConversionResult,
} from '../converters';
import type { PanelBoringData, BoringSettings } from '../types';

// ============================================
// 훅 인터페이스
// ============================================

export interface UseFurnitureBoringOptions {
  /** 보링 설정 커스텀 */
  settings?: Partial<BoringSettings>;
  /** 패널 두께 (mm), 기본 18mm */
  panelThickness?: number;
  /** 재질명, 기본 '멜라민' */
  material?: string;
  /** 도어가 있는 가구만 포함 */
  onlyWithDoors?: boolean;
  /** 특정 가구 ID만 포함 */
  furnitureIds?: string[];
}

export interface UseFurnitureBoringResult {
  /** 모든 패널의 보링 데이터 */
  panels: PanelBoringData[];
  /** 변환 결과 요약 */
  summary: BatchConversionResult['summary'];
  /** 데이터 로딩 중 여부 */
  isLoading: boolean;
  /** 변환된 가구 개수 */
  furnitureCount: number;
  /** 총 보링 개수 */
  totalBorings: number;
}

// ============================================
// 메인 훅
// ============================================

/**
 * 배치된 가구 모듈에서 보링 데이터를 생성하는 훅
 *
 * @example
 * ```tsx
 * const { panels, summary, totalBorings } = useFurnitureBoring();
 *
 * // 도어가 있는 가구만
 * const { panels } = useFurnitureBoring({ onlyWithDoors: true });
 *
 * // 특정 가구만
 * const { panels } = useFurnitureBoring({ furnitureIds: ['furniture-1', 'furniture-2'] });
 * ```
 */
export function useFurnitureBoring(
  options: UseFurnitureBoringOptions = {}
): UseFurnitureBoringResult {
  const {
    settings,
    panelThickness = 18,
    material = '멜라민',
    onlyWithDoors = false,
    furnitureIds,
  } = options;

  // Store에서 데이터 가져오기
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);

  // 보링 데이터 계산
  const result = useMemo(() => {
    // 내부 공간 계산
    const internalSpace = calculateInternalSpace(spaceInfo);

    // FurnitureBoringInput 배열 생성
    const inputs: FurnitureBoringInput[] = [];

    placedModules.forEach((placedModule) => {
      // 필터링: 특정 ID만 포함
      if (furnitureIds && !furnitureIds.includes(placedModule.id)) {
        return;
      }

      // 필터링: 도어가 있는 가구만
      if (onlyWithDoors && !placedModule.hasDoor) {
        return;
      }

      // ModuleData 가져오기
      const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
      if (!moduleData) {
        console.warn(`Module not found: ${placedModule.moduleId}`);
        return;
      }

      inputs.push({
        placedModule,
        moduleData,
        panelThickness,
        material,
      });
    });

    // 변환 실행
    if (inputs.length === 0) {
      return {
        panels: [],
        summary: {
          furnitureCount: 0,
          totalPanels: 0,
          totalBorings: 0,
          byFurniture: [],
        },
      };
    }

    return convertMultipleFurnitureToBoring(inputs, settings);
  }, [placedModules, spaceInfo, settings, panelThickness, material, onlyWithDoors, furnitureIds]);

  return {
    panels: result.allPanels,
    summary: result.summary,
    isLoading: false,
    furnitureCount: result.summary.furnitureCount,
    totalBorings: result.summary.totalBorings,
  };
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 특정 가구의 보링 데이터만 가져오기
 */
export function getFurnitureBoringById(
  furnitureId: string,
  placedModules: ReturnType<typeof useFurnitureStore.getState>['placedModules'],
  spaceInfo: ReturnType<typeof useSpaceConfigStore.getState>['spaceInfo'],
  options: Omit<UseFurnitureBoringOptions, 'furnitureIds'> = {}
): PanelBoringData[] {
  const placedModule = placedModules.find((m) => m.id === furnitureId);
  if (!placedModule) {
    return [];
  }

  const internalSpace = calculateInternalSpace(spaceInfo);
  const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
  if (!moduleData) {
    return [];
  }

  const result = convertMultipleFurnitureToBoring(
    [
      {
        placedModule,
        moduleData,
        panelThickness: options.panelThickness,
        material: options.material,
      },
    ],
    options.settings
  );

  return result.allPanels;
}

export default useFurnitureBoring;
