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
    // 주의: shelfPositions: [0]은 "치수 표시용"으로만 사용되며 실제 선반이 아님
    // pos === 0은 무시해야 함 (shelving.ts에서 치수 표시용으로 사용)
    if (section.shelfPositions && section.shelfPositions.length > 0) {
      section.shelfPositions.forEach(pos => {
        // pos > 0 조건: 0은 치수 표시용이므로 무시
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

/**
 * 섹션별 보링 위치 계산 (상/하 분리 측판용)
 *
 * 각 섹션의 측판에 대해 해당 섹션 범위 내의 보링만 반환하고,
 * 좌표를 해당 섹션의 바닥 기준으로 변환합니다.
 *
 * @example
 * ```ts
 * const result = calculateSectionBoringPositions({
 *   sections: moduleData.modelConfig.sections,
 *   totalHeightMm: 1600,
 *   basicThicknessMm: 18,
 * });
 *
 * // 결과:
 * // result.sectionPositions[0] = { positions: [9, 200, 391], sectionStart: 0, sectionEnd: 400, height: 400 }
 * // result.sectionPositions[1] = { positions: [9, 200, 391], sectionStart: 400, sectionEnd: 800, height: 400 }
 * ```
 */
export interface SectionBoringInfo {
  /** 섹션 내 보링 위치 (섹션 바닥 기준 mm) */
  positions: number[];
  /** 섹션 시작 위치 (가구 바닥 기준 mm) */
  sectionStart: number;
  /** 섹션 끝 위치 (가구 바닥 기준 mm) */
  sectionEnd: number;
  /** 섹션 높이 (mm) */
  height: number;
}

export interface SectionBoringPositionsResult {
  /** 섹션별 보링 정보 배열 (인덱스 = 섹션 인덱스) */
  sectionPositions: SectionBoringInfo[];
  /** 전체 가구의 모든 보링 위치 (가구 바닥 기준 mm) */
  allPositions: number[];
}

export function calculateSectionBoringPositions(
  params: CalculateShelfBoringPositionsParams
): SectionBoringPositionsResult {
  const { sections, totalHeightMm, basicThicknessMm } = params;

  if (!sections || sections.length === 0) {
    return {
      sectionPositions: [],
      allPositions: [],
    };
  }

  const halfThicknessMm = basicThicknessMm / 2;
  const availableHeightMm = totalHeightMm - basicThicknessMm * 2;

  // 먼저 각 섹션의 범위 계산
  const sectionRanges: { start: number; end: number; height: number }[] = [];
  let currentY = basicThicknessMm; // 바닥판 상면에서 시작

  sections.forEach((section, index) => {
    let sectionHeightMm: number;
    if (section.heightType === 'absolute') {
      sectionHeightMm = section.height;
    } else {
      sectionHeightMm = availableHeightMm * (section.height / 100);
    }

    const sectionStart = currentY;
    const sectionEnd = currentY + sectionHeightMm - basicThicknessMm;

    sectionRanges.push({
      start: sectionStart,
      end: sectionEnd,
      height: sectionEnd - sectionStart + basicThicknessMm, // 측판 높이
    });

    currentY += sectionHeightMm;
  });

  // 전체 보링 위치 계산
  const fullResult = calculateShelfBoringPositions(params);
  const allPositions = fullResult.positions;

  // 각 섹션별로 보링 위치 필터링 및 변환
  const sectionPositions: SectionBoringInfo[] = sectionRanges.map((range, sectionIndex) => {
    // 해당 섹션 범위 내의 보링만 필터링
    //
    // 중요: 섹션 경계의 보링 처리
    // - 하부섹션 상판 보링 (sectionEnd - halfThickness): 하부섹션에만 포함
    // - 상부섹션 바닥판 보링 (다음 섹션 start + halfThickness): 상부섹션에만 포함
    //
    // 각 섹션에는 다음 보링이 포함되어야 함:
    // - 첫 번째 섹션(하부): 바닥판 중심(9mm) + 선반들 + 상판 중심(섹션끝-9mm)
    // - 중간 섹션들: 바닥판 중심(9mm) + 선반들 + 상판 중심(섹션끝-9mm)
    // - 마지막 섹션(상부): 바닥판 중심(9mm) + 선반들 + 상판 중심(전체높이-9mm)
    const sectionBorings = allPositions.filter(pos => {
      // 기본 범위: 섹션 내부 (바닥판 상면 ~ 상판 하면)
      const inSectionRange = pos >= range.start - halfThicknessMm && pos <= range.end + halfThicknessMm;

      if (!inSectionRange) return false;

      // 섹션 경계 보링 처리 (다음 섹션의 바닥판 보링 제외)
      // sectionDividers에서 생성된 상부섹션 바닥판 보링(섹션끝+9mm)은 하부섹션에서 제외
      if (sectionIndex < sections.length - 1) {
        // 마지막 섹션이 아닌 경우, 다음 섹션 바닥판 보링(range.end + halfThickness 근처)은 제외
        const nextSectionBottomBoring = range.end + halfThicknessMm;
        // 허용 오차 2mm 이내이면 다음 섹션 바닥판으로 간주
        if (Math.abs(pos - nextSectionBottomBoring) < 2) {
          return false;
        }
      }

      return true;
    });

    // 섹션 바닥 기준으로 좌표 변환
    const transformedPositions = sectionBorings.map(pos => {
      return pos - range.start + halfThicknessMm;
    });

    return {
      positions: transformedPositions.sort((a, b) => a - b),
      sectionStart: range.start,
      sectionEnd: range.end,
      height: range.height,
    };
  });

  return {
    sectionPositions,
    allPositions,
  };
}

export default calculateShelfBoringPositions;
