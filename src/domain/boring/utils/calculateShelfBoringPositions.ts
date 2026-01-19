/**
 * 선반/패널 보링 위치 계산 유틸리티
 *
 * 가구의 실제 선반/패널 위치를 기반으로 보링 위치를 계산합니다.
 * 32mm 피치 시스템과 달리, 실제 구조물이 있는 위치에만 보링을 생성합니다.
 *
 * 사용처:
 * - SectionsRenderer: 2D 측면뷰에서 보링 시각화
 * - 옵티마이저 내보내기: DXF 파일에 실제 보링 위치 반영
 */

import type { SectionConfig } from '@/data/modules/shelving';

export interface CalculateShelfBoringPositionsParams {
  /** 섹션 설정 배열 */
  sections: SectionConfig[];
  /** 가구 전체 높이 (mm) */
  totalHeightMm: number;
  /** 기본 패널 두께 (mm), 보통 18mm */
  basicThicknessMm: number;
}

export interface ShelfBoringPositionsResult {
  /** 모든 보링 위치 (가구 바닥 기준 mm, 측판 기준) */
  positions: number[];
  /** 바닥판 보링 위치 */
  bottomPanel: number;
  /** 상판 보링 위치 */
  topPanel: number;
  /** 선반 보링 위치들 */
  shelves: number[];
  /** 섹션 구분 패널 위치들 (하부섹션 상판 + 상부섹션 바닥판) */
  sectionDividers: number[];
}

/**
 * 가구의 실제 선반/패널 위치에 기반한 보링 위치 계산
 *
 * @example
 * ```ts
 * const result = calculateShelfBoringPositions({
 *   sections: moduleData.modelConfig.sections,
 *   totalHeightMm: 800,
 *   basicThicknessMm: 18,
 * });
 *
 * console.log(result.positions); // [9, 200, 400, 591, 609, 791]
 * ```
 */
export function calculateShelfBoringPositions(
  params: CalculateShelfBoringPositionsParams
): ShelfBoringPositionsResult {
  const { sections, totalHeightMm, basicThicknessMm } = params;

  if (!sections || sections.length === 0) {
    return {
      positions: [],
      bottomPanel: 0,
      topPanel: 0,
      shelves: [],
      sectionDividers: [],
    };
  }

  const halfThicknessMm = basicThicknessMm / 2; // 9mm - 패널 중심까지의 거리
  const shelves: number[] = [];
  const sectionDividers: number[] = [];

  // 1. 바닥판 중심 위치 (가구 바닥에서 9mm = 18/2)
  const bottomPanel = halfThicknessMm;

  // 2. 상판 중심 위치 (가구 전체 높이 - 9mm)
  const topPanel = totalHeightMm - halfThicknessMm;

  // 3. 선반 및 섹션 구분 패널 위치 계산
  const availableHeightMm = totalHeightMm - basicThicknessMm * 2; // 상판+바닥판 제외
  let currentYPositionFromBottom = basicThicknessMm; // = 18mm (바닥판 상면)

  sections.forEach((section, index) => {
    // 섹션 높이 계산
    let sectionHeightMm: number;
    if (section.heightType === 'absolute') {
      sectionHeightMm = section.height;
    } else {
      // percentage 타입: 가용 높이에서 비율로 계산
      sectionHeightMm = availableHeightMm * (section.height / 100);
    }

    // 선반 위치가 있으면 추가
    if (section.shelfPositions && section.shelfPositions.length > 0) {
      section.shelfPositions.forEach(pos => {
        if (pos > 0) {
          // ShelfRenderer 계산 방식과 동일:
          // 절대 Y = currentYPositionFromBottom + pos
          shelves.push(currentYPositionFromBottom + pos);
        }
      });
    }

    // 섹션 구분 패널 (마지막 섹션이 아닌 경우)
    // BaseFurnitureShell에서 하부섹션 상판과 상부섹션 바닥판이 별도로 렌더링됨
    if (index < sections.length - 1) {
      // 섹션 끝의 가구 바닥 기준 위치
      const sectionEndFromBottom = currentYPositionFromBottom + sectionHeightMm - basicThicknessMm;

      // 하부섹션 상판 중심 (섹션 끝에서 9mm 아래)
      sectionDividers.push(sectionEndFromBottom - halfThicknessMm);
      // 상부섹션 바닥판 중심 (섹션 끝에서 9mm 위)
      sectionDividers.push(sectionEndFromBottom + halfThicknessMm);
    }

    // 다음 섹션으로 이동
    currentYPositionFromBottom += sectionHeightMm;
  });

  // 모든 위치 합치기
  const allPositions = [bottomPanel, topPanel, ...shelves, ...sectionDividers];

  // 중복 제거 및 정렬
  const uniquePositions = [...new Set(allPositions)].sort((a, b) => a - b);

  return {
    positions: uniquePositions,
    bottomPanel,
    topPanel,
    shelves,
    sectionDividers,
  };
}

/**
 * Three.js 단위에서 mm 단위로 변환 후 보링 위치 계산
 *
 * @example
 * ```ts
 * const result = calculateShelfBoringPositionsFromThreeUnits({
 *   sections: modelConfig.sections,
 *   heightInThreeUnits: 0.8, // Three.js 단위
 *   basicThicknessInThreeUnits: 0.018, // Three.js 단위
 * });
 * ```
 */
export function calculateShelfBoringPositionsFromThreeUnits(params: {
  sections: SectionConfig[];
  heightInThreeUnits: number;
  basicThicknessInThreeUnits: number;
}): ShelfBoringPositionsResult {
  const { sections, heightInThreeUnits, basicThicknessInThreeUnits } = params;

  // Three.js 단위를 mm로 변환 (1 Three.js 단위 = 100mm)
  const totalHeightMm = heightInThreeUnits * 100;
  const basicThicknessMm = basicThicknessInThreeUnits * 100;

  return calculateShelfBoringPositions({
    sections,
    totalHeightMm,
    basicThicknessMm,
  });
}

export default calculateShelfBoringPositions;
