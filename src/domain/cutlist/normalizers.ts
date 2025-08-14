/**
 * 정규화 함수들 - 데이터 일관성 보장
 */

import { Unit, Grain, CutListPanel } from './types';

/**
 * 단위 변환 상수
 */
const UNIT_CONVERSION = {
  mm: {
    mm: 1,
    cm: 0.1,
    in: 0.0393701
  },
  cm: {
    mm: 10,
    cm: 1,
    in: 0.393701
  },
  in: {
    mm: 25.4,
    cm: 2.54,
    in: 1
  }
};

/**
 * 단위 변환 함수
 */
export function convertUnit(value: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return value;
  return Math.round(value * UNIT_CONVERSION[fromUnit][toUnit] * 100) / 100;
}

/**
 * 패널 치수 정규화 - 길이 > 폭 규칙 적용
 * CutList Optimizer는 Length(세로) × Width(가로) 형식을 사용
 */
export function normalizePanelDimensions(panel: {
  width: number;
  height: number;
  grain?: Grain;
}): { length: number; width: number; grain: Grain } {
  // 원본 데이터에서 height가 세로, width가 가로
  const length = panel.height;
  const width = panel.width;
  
  // 결 방향 결정: 가로가 더 길면 H, 세로가 더 길면 V
  let grain: Grain = panel.grain || 'NONE';
  if (!panel.grain) {
    grain = width > length ? 'H' : 'V';
  }
  
  return {
    length: Math.round(length * 10) / 10,  // 소수점 1자리로 반올림
    width: Math.round(width * 10) / 10,
    grain
  };
}

/**
 * 단위 목록 정규화
 */
export function normalizeUnits(
  values: number[],
  fromUnit: Unit,
  toUnit: Unit
): number[] {
  return values.map(v => convertUnit(v, fromUnit, toUnit));
}

/**
 * 패널 리스트 정규화
 */
export function normalizePanelList(
  panels: any[],
  targetUnit: Unit = 'mm'
): CutListPanel[] {
  return panels.map((panel, index) => {
    const normalized = normalizePanelDimensions({
      width: panel.width,
      height: panel.height,
      grain: panel.grain
    });
    
    return {
      id: panel.id || `panel-${index + 1}`,
      label: sanitizeLabel(panel.name || panel.label || `Panel ${index + 1}`),
      length: normalized.length,
      width: normalized.width,
      thickness: panel.thickness || 18,
      quantity: panel.quantity || 1,
      material: panel.material || 'PB',
      grain: normalized.grain,
      enabled: true,
      canRotate: normalized.grain === 'NONE'
    };
  });
}

/**
 * 라벨 정리 - CSV 호환을 위해 특수문자 제거
 */
export function sanitizeLabel(label: string): string {
  return label
    .replace(/,/g, '_')      // 콤마를 언더스코어로
    .replace(/"/g, '')       // 따옴표 제거
    .replace(/\n/g, ' ')     // 줄바꿈을 공백으로
    .replace(/\r/g, '')      // 캐리지 리턴 제거
    .replace(/\t/g, ' ')     // 탭을 공백으로
    .trim()
    .substring(0, 50);       // 최대 50자
}

/**
 * 숫자 반올림 - 지정된 소수점 자리수로
 */
export function roundToDecimals(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * 면적 계산 (mm²)
 */
export function calculateArea(length: number, width: number): number {
  return roundToDecimals(length * width / 1000000, 4); // m²로 변환
}

/**
 * 재료별 그룹화
 */
export function groupByMaterial<T extends { material: string }>(
  items: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  
  items.forEach(item => {
    const key = item.material;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  });
  
  return groups;
}

/**
 * 패널 정렬 - 크기 내림차순 (최적화를 위해)
 */
export function sortPanelsBySize(panels: CutListPanel[]): CutListPanel[] {
  return [...panels].sort((a, b) => {
    const areaA = a.length * a.width;
    const areaB = b.length * b.width;
    return areaB - areaA; // 큰 것부터
  });
}

/**
 * 두께별 그룹화
 */
export function groupByThickness<T extends { thickness: number }>(
  items: T[]
): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  
  items.forEach(item => {
    const key = item.thickness;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  });
  
  return groups;
}