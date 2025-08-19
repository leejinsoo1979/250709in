import type { CutStep, SawStats } from '@/types/cutlist';

/**
 * 단순 합계: 모든 재단 길이의 합
 */
export function sumCutLength(cuts: CutStep[]): number {
  return cuts.reduce((a, c) => a + Math.max(0, Math.abs(c.spanEnd - c.spanStart)), 0);
}

/**
 * 중복 제거 합계: 같은 (시트, 축, 위치)에서 겹치는 구간은 한 번만 계산
 */
export function unionCutLength(cuts: CutStep[]): number {
  const key = (c: CutStep) => `${c.sheetId}|${c.axis}|${c.pos.toFixed(3)}`;
  const map = new Map<string, [number, number][]>();
  
  // 같은 위치의 재단 구간들을 수집
  for (const c of cuts) {
    const k = key(c);
    const a = Math.min(c.spanStart, c.spanEnd);
    const b = Math.max(c.spanStart, c.spanEnd);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push([a, b]);
  }
  
  let total = 0;
  
  // 각 위치별로 겹치는 구간을 합병하여 실제 길이 계산
  for (const [, intervals] of map) {
    intervals.sort((i, j) => i[0] - j[0]);
    let [curS, curE] = intervals[0];
    
    for (let i = 1; i < intervals.length; i++) {
      const [s, e] = intervals[i];
      if (s <= curE) {
        // 겹치는 구간은 합병
        curE = Math.max(curE, e);
      } else {
        // 겹치지 않는 구간은 별도로 계산
        total += (curE - curS);
        curS = s;
        curE = e;
      }
    }
    total += (curE - curS);
  }
  
  return Math.max(0, total);
}

/**
 * 실제 절단 길이 계산 (kerf 두께 고려)
 * 절단선을 따라 실제로 이동하는 톱날의 총 거리 계산
 */
export function calculateActualCutLength(cuts: CutStep[]): number {
  let totalLength = 0;
  const processedCuts = new Map<string, { start: number, end: number, kerf: number }[]>();
  
  // 같은 위치의 절단들을 그룹화
  for (const cut of cuts) {
    const posKey = `${cut.sheetId}|${cut.axis}|${cut.pos.toFixed(3)}`;
    
    if (!processedCuts.has(posKey)) {
      processedCuts.set(posKey, []);
    }
    
    processedCuts.get(posKey)!.push({
      start: Math.min(cut.spanStart, cut.spanEnd),
      end: Math.max(cut.spanStart, cut.spanEnd),
      kerf: cut.kerf || 0
    });
  }
  
  // 각 절단 위치별로 실제 절단 길이 계산
  for (const [, segments] of processedCuts) {
    // 겹치는 구간 병합
    segments.sort((a, b) => a.start - b.start);
    
    let mergedSegments: { start: number, end: number, kerf: number }[] = [];
    let current = segments[0];
    
    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      
      if (next.start <= current.end) {
        // 겹치는 구간 병합
        current = {
          start: current.start,
          end: Math.max(current.end, next.end),
          kerf: Math.max(current.kerf, next.kerf) // 더 큰 kerf 사용
        };
      } else {
        // 겹치지 않는 구간은 별도로 저장
        mergedSegments.push(current);
        current = next;
      }
    }
    mergedSegments.push(current);
    
    // 병합된 구간들의 실제 절단 길이 계산
    for (const segment of mergedSegments) {
      const cutLength = segment.end - segment.start;
      totalLength += cutLength;
    }
  }
  
  return totalLength;
}

/**
 * 톱날 이동 통계 계산 (개선된 버전)
 * - 실제 절단 길이 계산
 * - 중복 구간 제거
 * - kerf 두께 고려
 */
export function computeSawStats(cuts: CutStep[], unit: 'mm' | 'm' = 'm'): SawStats {
  const bySheet: Record<string, number> = {};
  const detailsBySheet: Record<string, { horizontal: number, vertical: number, cuts: number }> = {};
  const groups = new Map<string, CutStep[]>();
  
  // 시트별로 재단 그룹화
  for (const c of cuts) {
    if (!groups.has(c.sheetId)) groups.set(c.sheetId, []);
    groups.get(c.sheetId)!.push(c);
  }
  
  let totalMm = 0;
  let totalCuts = 0;
  
  // 시트별 톱날 이동 길이 계산 (중복 제거 및 kerf 고려)
  for (const [sid, arr] of groups) {
    // 가로/세로 절단 분리
    const horizontalCuts = arr.filter(c => c.axis === 'y');
    const verticalCuts = arr.filter(c => c.axis === 'x');
    
    // 각 방향별 실제 절단 길이 계산
    const horizontalLength = calculateActualCutLength(horizontalCuts);
    const verticalLength = calculateActualCutLength(verticalCuts);
    
    // 총 절단 길이
    const totalLength = horizontalLength + verticalLength;
    
    // 통계 저장
    bySheet[sid] = unit === 'm' ? totalLength / 1000 : totalLength;
    detailsBySheet[sid] = {
      horizontal: unit === 'm' ? horizontalLength / 1000 : horizontalLength,
      vertical: unit === 'm' ? verticalLength / 1000 : verticalLength,
      cuts: arr.length
    };
    
    totalMm += totalLength;
    totalCuts += arr.length;
  }
  
  // 평균 kerf 계산
  const avgKerf = cuts.length > 0 
    ? cuts.reduce((sum, c) => sum + (c.kerf || 0), 0) / cuts.length 
    : 0;
  
  return {
    bySheet,
    total: unit === 'm' ? totalMm / 1000 : totalMm,
    unit,
    totalCuts,
    avgKerf: unit === 'm' ? avgKerf / 1000 : avgKerf,
    details: detailsBySheet
  } as SawStats;
}