/**
 * 보링 생성기 통합 모듈
 */

// 하부장
export {
  generateLowerCabinetBorings,
  type LowerCabinetParams,
  type LowerCabinetBoringResult,
} from './lowerCabinetBoring';

// 상부장
export {
  generateUpperCabinetBorings,
  type UpperCabinetParams,
  type UpperCabinetBoringResult,
} from './upperCabinetBoring';

// 서랍장
export {
  generateDrawerCabinetBorings,
  type DrawerCabinetParams,
  type DrawerCabinetBoringResult,
} from './drawerCabinetBoring';

// 도어
export {
  generateDoorBorings,
  generateDoubleDoorBorings,
  type DoorBoringParams,
  type DoorBoringResult,
  type DoubleDoorParams,
} from './doorBoring';

// ============================================
// 통합 생성 함수
// ============================================

import type { PanelBoringData, CabinetType, BoringSettings } from '../types';
import { generateLowerCabinetBorings, LowerCabinetParams } from './lowerCabinetBoring';
import { generateUpperCabinetBorings, UpperCabinetParams } from './upperCabinetBoring';
import { generateDrawerCabinetBorings, DrawerCabinetParams } from './drawerCabinetBoring';

/**
 * 가구 타입에 따른 보링 데이터 생성
 */
export function generateCabinetBorings(
  cabinetType: CabinetType,
  params: LowerCabinetParams | UpperCabinetParams | DrawerCabinetParams
): {
  panels: PanelBoringData[];
  summary: {
    panelCount: number;
    totalBorings: number;
  };
} {
  switch (cabinetType) {
    case 'lower':
      return generateLowerCabinetBorings(params as LowerCabinetParams);

    case 'upper':
      return generateUpperCabinetBorings(params as UpperCabinetParams);

    case 'drawer':
      return generateDrawerCabinetBorings(params as DrawerCabinetParams);

    case 'tall':
      // 장신장은 하부장 로직 + 상부장 옵션 조합
      // 기본적으로 하부장으로 처리
      return generateLowerCabinetBorings(params as LowerCabinetParams);

    default:
      throw new Error(`Unknown cabinet type: ${cabinetType}`);
  }
}

/**
 * 여러 가구의 보링 데이터 일괄 생성
 */
export function generateMultipleCabinetBorings(
  cabinets: Array<{
    type: CabinetType;
    params: LowerCabinetParams | UpperCabinetParams | DrawerCabinetParams;
  }>
): {
  allPanels: PanelBoringData[];
  summary: {
    cabinetCount: number;
    totalPanels: number;
    totalBorings: number;
  };
} {
  const allPanels: PanelBoringData[] = [];
  let totalBorings = 0;

  cabinets.forEach((cabinet) => {
    const result = generateCabinetBorings(cabinet.type, cabinet.params);
    allPanels.push(...result.panels);
    totalBorings += result.summary.totalBorings;
  });

  return {
    allPanels,
    summary: {
      cabinetCount: cabinets.length,
      totalPanels: allPanels.length,
      totalBorings,
    },
  };
}
