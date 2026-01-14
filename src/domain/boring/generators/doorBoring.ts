/**
 * 도어 보링 데이터 생성기
 * 힌지 컵홀, 핸들홀 생성
 */

import type { PanelBoringData, BoringSettings, Boring } from '../types';
import { calculateDoorCupBorings, calculateHingePositions } from '../calculators';
import { DEFAULT_BORING_SETTINGS } from '../constants';

// ============================================
// 타입
// ============================================

export interface DoorBoringParams {
  id: string;
  name: string;
  width: number;           // 도어 너비 (mm)
  height: number;          // 도어 높이 (mm)
  thickness: number;       // 도어 두께 (mm), 기본 18mm
  material: string;        // 재질
  isLeftHinge: boolean;    // 좌측 힌지 여부
  hasHandle: boolean;      // 핸들 유무
  handlePosition?: 'top' | 'center' | 'bottom';  // 핸들 위치
  handleSpacing?: number;  // 핸들 나사 간격 (mm)
  settings?: Partial<BoringSettings>;
}

export interface DoorBoringResult {
  panel: PanelBoringData;
  hingeCount: number;
  hingePositions: number[];
}

// ============================================
// 핸들 보링 계산
// ============================================

function calculateHandleBorings(
  doorWidth: number,
  doorHeight: number,
  isLeftHinge: boolean,
  position: 'top' | 'center' | 'bottom' = 'center',
  spacing: number = 96
): Boring[] {
  const borings: Boring[] = [];

  // 핸들 X 위치: 힌지 반대쪽
  // 좌측 힌지면 핸들은 우측, 우측 힌지면 핸들은 좌측
  const handleX = isLeftHinge
    ? doorWidth - 50  // 우측에서 50mm
    : 50;             // 좌측에서 50mm

  // 핸들 Y 위치
  let handleY: number;
  switch (position) {
    case 'top':
      handleY = doorHeight - 100;  // 상단에서 100mm
      break;
    case 'bottom':
      handleY = 100;  // 하단에서 100mm
      break;
    case 'center':
    default:
      handleY = doorHeight / 2;  // 중앙
      break;
  }

  // 수직 핸들 (세로 방향 나사)
  borings.push({
    id: 'door-handle-top',
    type: 'custom' as const,
    face: 'front' as const,
    x: handleX,
    y: handleY + spacing / 2,
    diameter: 5,
    depth: 18,  // 관통
    note: '핸들-상단나사',
  });

  borings.push({
    id: 'door-handle-bottom',
    type: 'custom' as const,
    face: 'front' as const,
    x: handleX,
    y: handleY - spacing / 2,
    diameter: 5,
    depth: 18,  // 관통
    note: '핸들-하단나사',
  });

  return borings;
}

// ============================================
// 메인 생성 함수
// ============================================

/**
 * 도어 보링 데이터 생성
 */
export function generateDoorBorings(params: DoorBoringParams): DoorBoringResult {
  const settings = { ...DEFAULT_BORING_SETTINGS, ...params.settings };
  const borings: Boring[] = [];

  // 1. 힌지 컵홀
  const cupBorings = calculateDoorCupBorings({
    doorHeight: params.height,
    doorWidth: params.width,
    isLeftHinge: params.isLeftHinge,
    settings: settings.hinge,
  });
  borings.push(...cupBorings);

  // 2. 핸들홀 (필요 시)
  if (params.hasHandle) {
    const handleBorings = calculateHandleBorings(
      params.width,
      params.height,
      params.isLeftHinge,
      params.handlePosition,
      params.handleSpacing
    );
    borings.push(...handleBorings);
  }

  // 힌지 위치 정보
  const hingePositions = calculateHingePositions(params.height, settings.hinge);

  const panel: PanelBoringData = {
    panelId: params.id,
    furnitureId: params.id,
    furnitureName: params.name,
    panelType: 'door',
    panelName: params.name,
    width: params.width,
    height: params.height,
    thickness: params.thickness,
    material: params.material,
    grain: 'V',
    borings,
  };

  return {
    panel,
    hingeCount: hingePositions.length,
    hingePositions,
  };
}

// ============================================
// 양문 도어 생성
// ============================================

export interface DoubleDoorParams {
  id: string;
  name: string;
  totalWidth: number;      // 전체 너비 (가구 외부)
  height: number;          // 도어 높이 (mm)
  thickness: number;       // 도어 두께 (mm)
  material: string;        // 재질
  gap: number;             // 도어 간 갭 (mm), 기본 2mm
  hasHandle: boolean;      // 핸들 유무
  handlePosition?: 'top' | 'center' | 'bottom';
  handleSpacing?: number;
  settings?: Partial<BoringSettings>;
}

/**
 * 양문 도어 보링 데이터 생성
 */
export function generateDoubleDoorBorings(
  params: DoubleDoorParams
): { leftDoor: DoorBoringResult; rightDoor: DoorBoringResult } {
  const doorWidth = (params.totalWidth - params.gap) / 2;

  // 좌측 도어 (좌측 힌지)
  const leftDoor = generateDoorBorings({
    id: `${params.id}-door-left`,
    name: `${params.name}-좌측도어`,
    width: doorWidth,
    height: params.height,
    thickness: params.thickness,
    material: params.material,
    isLeftHinge: true,
    hasHandle: params.hasHandle,
    handlePosition: params.handlePosition,
    handleSpacing: params.handleSpacing,
    settings: params.settings,
  });

  // 우측 도어 (우측 힌지)
  const rightDoor = generateDoorBorings({
    id: `${params.id}-door-right`,
    name: `${params.name}-우측도어`,
    width: doorWidth,
    height: params.height,
    thickness: params.thickness,
    material: params.material,
    isLeftHinge: false,
    hasHandle: params.hasHandle,
    handlePosition: params.handlePosition,
    handleSpacing: params.handleSpacing,
    settings: params.settings,
  });

  return { leftDoor, rightDoor };
}

export default {
  generateDoorBorings,
  generateDoubleDoorBorings,
};
