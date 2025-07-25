// 새로운 클래스들 import
import { SpaceCalculator } from './SpaceCalculator';
import { ColumnIndexer, SpaceIndexingResult } from './ColumnIndexer';
import { FurniturePositioner } from './FurniturePositioner';
import { FurnitureSpaceAdapter } from './FurnitureSpaceAdapter';

// 기존 API 유지를 위한 re-export
// 이렇게 하면 기존 import 경로가 모두 그대로 작동합니다

/**
 * mm 단위를 Three.js 단위로 변환 (1mm = 0.01 three.js 단위)
 */
export const mmToThreeUnits = SpaceCalculator.mmToThreeUnits;

/**
 * 공간 내경에 따른 슬롯(컬럼) 인덱싱 계산
 * - 내경 600mm 이하: 1개 슬롯
 * - 내경 600mm 초과: 균등 분할된 N개 슬롯
 * - customColumnCount가 설정된 경우 해당 값 우선 사용
 */
export const calculateSpaceIndexing = ColumnIndexer.calculateSpaceIndexing;

/**
 * 주어진 위치(Three.js 좌표)에 가장 가까운 컬럼 인덱스 찾기
 */
export const findClosestColumnIndex = ColumnIndexer.findClosestColumnIndex;

/**
 * 내경 폭 계산 유틸리티 함수
 */
export const calculateInternalWidth = SpaceCalculator.calculateInternalWidth;

/**
 * 내경 공간 계산 유틸리티 함수 (geometry에서 re-export)
 */
export { calculateInternalSpace } from '../../viewer3d/utils/geometry';

/**
 * 내경 폭에 따른 최소/최대 컬럼 수 계산
 */
export const getColumnCountLimits = SpaceCalculator.getColumnCountLimits;

/**
 * 현재 컬럼 수가 유효한지 검증
 */
export const validateColumnCount = SpaceCalculator.validateColumnCount;

/**
 * 내경폭에 맞는 기본 컬럼 수 계산 (자동 모드)
 */
export const getDefaultColumnCount = SpaceCalculator.getDefaultColumnCount;

/**
 * 배치된 가구의 슬롯 인덱스를 찾는 함수
 */
export const findSlotIndexFromPosition = ColumnIndexer.findSlotIndexFromPosition;

/**
 * 가구가 새로운 공간 설정에서 유효한지 검증하는 함수
 */
export const validateFurniturePosition = FurniturePositioner.validateFurniturePosition;

/**
 * 새로운 공간 설정에 맞게 가구 위치를 조정하는 함수
 */
export const adjustFurniturePosition = FurniturePositioner.adjustFurniturePosition;

/**
 * 공간 변경 시 가구 목록을 필터링하고 위치를 조정하는 함수
 */
export const filterAndAdjustFurniture = FurnitureSpaceAdapter.filterAndAdjustFurniture;

// 타입들도 re-export
export type { SpaceIndexingResult };

// 새로운 클래스들도 export (고급 사용자용)
export { SpaceCalculator, ColumnIndexer, FurniturePositioner, FurnitureSpaceAdapter }; 