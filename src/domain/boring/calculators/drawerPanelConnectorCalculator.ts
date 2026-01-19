/**
 * 서랍 측판-앞뒤판 체결용 보링 계산기
 * 서랍 측판에 앞판/뒷판을 체결하기 위한 보링홀 생성
 *
 * 각 체결 위치(앞판/뒷판)에 3개의 보링:
 * - 상단: 끝에서 20mm 아래
 * - 중간: 서랍 높이 중앙
 * - 하단: 끝에서 20mm 위
 *
 * 보링 사양:
 * - 직경: 3mm
 * - 깊이: 관통 (측판 두께)
 */

import type { Boring } from '../types';

// ============================================
// 상수
// ============================================

/** 서랍 측판 체결 보링 직경 (mm) */
export const DRAWER_CONNECTOR_DIAMETER = 3;

/** 서랍 측판 체결 보링 깊이 - 관통 */
export const DRAWER_CONNECTOR_DEPTH = 15; // 측판 두께 기본값

/** 서랍 가장자리에서 보링까지의 거리 (mm) */
export const DRAWER_CONNECTOR_EDGE_OFFSET = 20;

// ============================================
// 타입
// ============================================

export interface DrawerPanelConnectorParams {
  /** 서랍 높이 (mm) */
  drawerHeight: number;
  /** 서랍 깊이 (mm) */
  drawerDepth: number;
  /** 측판 두께 (mm), 기본 15mm */
  sideThickness?: number;
  /** 좌측판 여부 */
  isLeftPanel: boolean;
  /** 서랍 인덱스 (가구 내 서랍 번호) */
  drawerIndex: number;
}

export interface DrawerPanelConnectorResult {
  /** 생성된 보링 배열 */
  borings: Boring[];
  /** 보링 개수 */
  holeCount: number;
}

// ============================================
// 메인 계산 함수
// ============================================

/**
 * 서랍 측판의 앞뒤판 체결용 보링 계산
 *
 * 앞판과 뒷판 각각에 3개의 보링 (상/중/하) = 총 6개
 *
 * @example
 * ```ts
 * const result = calculateDrawerPanelConnectorBorings({
 *   drawerHeight: 150,
 *   drawerDepth: 450,
 *   sideThickness: 15,
 *   isLeftPanel: true,
 *   drawerIndex: 0,
 * });
 * // result.borings.length === 6
 * ```
 */
export function calculateDrawerPanelConnectorBorings(
  params: DrawerPanelConnectorParams
): DrawerPanelConnectorResult {
  const {
    drawerHeight,
    drawerDepth,
    sideThickness = 15,
    isLeftPanel,
    drawerIndex,
  } = params;

  const borings: Boring[] = [];

  // 보링 면 결정
  // 좌측판: 우측면에 보링 (서랍 내부 방향)
  // 우측판: 좌측면에 보링 (서랍 내부 방향)
  const face = isLeftPanel ? 'right' : 'left';

  // Y 위치 (서랍 높이 기준, 상/중/하)
  const topY = drawerHeight - DRAWER_CONNECTOR_EDGE_OFFSET; // 상단에서 20mm 아래
  const middleY = drawerHeight / 2; // 중앙
  const bottomY = DRAWER_CONNECTOR_EDGE_OFFSET; // 하단에서 20mm 위
  const yPositions = [topY, middleY, bottomY];
  const yLabels = ['상', '중', '하'];

  // X 위치 (서랍 깊이 기준, 앞판/뒷판 체결 위치)
  // 앞판 중심: 측판 두께의 절반 위치
  // 뒷판 중심: 서랍 깊이 - 측판 두께의 절반 위치
  const frontPanelX = sideThickness / 2;
  const backPanelX = drawerDepth - sideThickness / 2;
  const xPositions = [
    { x: frontPanelX, label: '앞판' },
    { x: backPanelX, label: '뒷판' },
  ];

  let boringIndex = 0;

  xPositions.forEach(({ x: xPos, label: xLabel }) => {
    yPositions.forEach((yPos, yIndex) => {
      boringIndex++;
      borings.push({
        id: `drawer-${drawerIndex + 1}-connector-${boringIndex}`,
        type: 'drawer-panel-connector' as const,
        face: face as 'left' | 'right',
        x: xPos,
        y: yPos,
        diameter: DRAWER_CONNECTOR_DIAMETER,
        depth: sideThickness, // 관통
        note: `서랍${drawerIndex + 1}-${xLabel}-${yLabels[yIndex]}`,
      });
    });
  });

  return {
    borings,
    holeCount: borings.length,
  };
}

export default {
  calculateDrawerPanelConnectorBorings,
  DRAWER_CONNECTOR_DIAMETER,
  DRAWER_CONNECTOR_DEPTH,
  DRAWER_CONNECTOR_EDGE_OFFSET,
};
