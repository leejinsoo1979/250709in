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
 * 톱날 이동 통계 계산
 */
export function computeSawStats(cuts: CutStep[], unit: 'mm' | 'm' = 'm'): SawStats {
  const bySheet: Record<string, number> = {};
  const groups = new Map<string, CutStep[]>();
  
  // 시트별로 재단 그룹화
  for (const c of cuts) {
    if (!groups.has(c.sheetId)) groups.set(c.sheetId, []);
    groups.get(c.sheetId)!.push(c);
  }
  
  let totalMm = 0;
  
  // 시트별 톱날 이동 길이 계산
  for (const [sid, arr] of groups) {
    const mm = unionCutLength(arr);
    bySheet[sid] = unit === 'm' ? mm / 1000 : mm;
    totalMm += mm;
  }
  
  return {
    bySheet,
    total: unit === 'm' ? totalMm / 1000 : totalMm,
    unit
  };
}