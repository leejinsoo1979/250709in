import type { CutStep, CutAxis, WorkPiece } from '@/types/cutlist';

interface PanelPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated?: boolean;
}

/**
 * 주어진 위치에서 재단 가능한 범위 계산
 * 패널을 관통하지 않는 범위만 반환
 * kerf는 이미 패널 간 갭에 반영되어 있으므로 추가 tolerance 없음
 */
function calculateValidSpans(
  axis: 'x' | 'y',
  pos: number,
  panels: PanelPlacement[],
  sheetW: number,
  sheetH: number
): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const epsilon = 0.1; // 부동소수점 비교용 작은 값

  if (axis === 'x') {
    // 세로선 (x 위치 고정, y 방향으로 재단)
    // 이 x 위치를 관통하는 패널들의 y 범위 수집
    const blockedRanges: { start: number; end: number }[] = [];

    panels.forEach(p => {
      // 패널 내부를 관통하는지 체크 (경계선 위는 허용)
      if (p.x + epsilon < pos && pos < p.x + p.width - epsilon) {
        blockedRanges.push({ start: p.y, end: p.y + p.height });
      }
    });

    // 막힌 범위를 정렬하고 병합
    blockedRanges.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const range of blockedRanges) {
      if (merged.length === 0 || merged[merged.length - 1].end <= range.start) {
        merged.push({ ...range });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, range.end);
      }
    }

    // 막히지 않은 범위 계산
    let currentStart = 0;
    for (const blocked of merged) {
      if (blocked.start > currentStart) {
        spans.push({ start: currentStart, end: blocked.start });
      }
      currentStart = blocked.end;
    }
    if (sheetH > currentStart) {
      spans.push({ start: currentStart, end: sheetH });
    }
  } else {
    // 가로선 (y 위치 고정, x 방향으로 재단)
    const blockedRanges: { start: number; end: number }[] = [];

    panels.forEach(p => {
      // 패널 내부를 관통하는지 체크 (경계선 위는 허용)
      if (p.y + epsilon < pos && pos < p.y + p.height - epsilon) {
        blockedRanges.push({ start: p.x, end: p.x + p.width });
      }
    });

    // 막힌 범위를 정렬하고 병합
    blockedRanges.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const range of blockedRanges) {
      if (merged.length === 0 || merged[merged.length - 1].end <= range.start) {
        merged.push({ ...range });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, range.end);
      }
    }

    // 막히지 않은 범위 계산
    let currentStart = 0;
    for (const blocked of merged) {
      if (blocked.start > currentStart) {
        spans.push({ start: currentStart, end: blocked.start });
      }
      currentStart = blocked.end;
    }
    if (sheetW > currentStart) {
      spans.push({ start: currentStart, end: sheetW });
    }
  }

  return spans;
}

/**
 * Generate guillotine cuts for an entire sheet
 * 기요틴 재단: 1차 방향으로 모든 스트립 분리 → 각 스트립 내에서 2차 방향 재단
 *
 * 핵심 원칙:
 * 1. W방향 우선: 먼저 모든 파란선(세로, x)으로 스트립 분리 → 각 스트립 내에서 빨간선(가로, y)
 * 2. L방향 우선: 먼저 모든 빨간선(가로, y)으로 스트립 분리 → 각 스트립 내에서 파란선(세로, x)
 * 3. kerf(5mm)는 이미 패널 간격에 반영되어 있음 - 같은 위치 재단 1회만
 */
export function generateGuillotineCuts(
  sheetW: number,
  sheetH: number,
  panels: PanelPlacement[],
  kerf: number,
  optimizationType: 'BY_LENGTH' | 'BY_WIDTH' | 'OPTIMAL_CNC' = 'BY_LENGTH'
): CutStep[] {
  const workpiece: WorkPiece = { width: sheetW, length: sheetH };

  if (panels.length === 0) return [];

  // 시트: 2440mm(가로=sheetW) x 1220mm(세로=sheetH)
  // W방향 = 1220mm = 파란색 = 세로선(│) = axis='x' (x 위치 고정, 위아래로 자름)
  // L방향 = 2440mm = 빨간색 = 가로선(─) = axis='y' (y 위치 고정, 좌우로 자름)
  //
  // W방향 우선 (BY_WIDTH): 파란선(세로, x) 먼저 모두 → 각 스트립 내 빨간선(가로, y)
  // L방향 우선 (BY_LENGTH): 빨간선(가로, y) 먼저 모두 → 각 스트립 내 파란선(세로, x)
  const primaryAxis = optimizationType === 'BY_WIDTH' ? 'x' : 'y';
  const secondaryAxis = primaryAxis === 'x' ? 'y' : 'x';

  console.log(`🔪 generateGuillotineCuts: ${optimizationType}, primary=${primaryAxis}(${primaryAxis === 'x' ? '파란선/세로' : '빨간선/가로'}), panels=${panels.length}`);

  interface CutInfo {
    axis: 'x' | 'y';
    pos: number;
    spanStart: number;
    spanEnd: number;
    order: number;
  }

  const allCuts: CutInfo[] = [];
  let cutOrder = 0;

  // 해당 위치에서 패널을 관통하지 않는지 체크
  const canCutAt = (pos: number, axis: 'x' | 'y', targetPanels: PanelPlacement[]): boolean => {
    return targetPanels.every(p => {
      if (axis === 'x') {
        // 세로선: 패널의 좌우 경계 밖이어야 함
        return pos <= Math.round(p.x) || pos >= Math.round(p.x + p.width);
      } else {
        // 가로선: 패널의 상하 경계 밖이어야 함
        return pos <= Math.round(p.y) || pos >= Math.round(p.y + p.height);
      }
    });
  };

  // 1차 재단: 시트 전체를 관통하는 선으로 스트립 분리
  // 모든 패널 경계 위치 수집
  const primaryPositions = new Set<number>();

  panels.forEach(p => {
    if (primaryAxis === 'x') {
      // W방향 우선: 세로선 위치 (패널의 좌우 경계)
      primaryPositions.add(Math.round(p.x));
      primaryPositions.add(Math.round(p.x + p.width));
    } else {
      // L방향 우선: 가로선 위치 (패널의 상하 경계)
      primaryPositions.add(Math.round(p.y));
      primaryPositions.add(Math.round(p.y + p.height));
    }
  });

  // 시트 경계 제외, 관통 가능한 위치만 필터링
  const sheetMax = primaryAxis === 'x' ? sheetW : sheetH;
  const validPrimaryPositions = Array.from(primaryPositions)
    .filter(pos => pos > 0 && pos < sheetMax && canCutAt(pos, primaryAxis, panels))
    .sort((a, b) => a - b);

  console.log(`  1차 재단 위치(${primaryAxis}): [${validPrimaryPositions.join(', ')}]`);

  // 1차 재단선 추가 (시트 전체 관통)
  validPrimaryPositions.forEach(pos => {
    allCuts.push({
      axis: primaryAxis,
      pos,
      spanStart: 0,
      spanEnd: primaryAxis === 'x' ? sheetH : sheetW,
      order: cutOrder++
    });
  });

  // 스트립 경계 계산 (0, pos1, pos2, ..., sheetMax)
  const stripBoundaries = [0, ...validPrimaryPositions, sheetMax];

  // 2차 재단: 각 스트립 내에서 2차 방향 재단
  for (let i = 0; i < stripBoundaries.length - 1; i++) {
    const stripStart = stripBoundaries[i];
    const stripEnd = stripBoundaries[i + 1];

    // 이 스트립에 속한 패널들 (경계 포함)
    const stripPanels = panels.filter(p => {
      if (primaryAxis === 'x') {
        // 세로 스트립: 패널이 이 스트립 범위 내에 있음
        const pLeft = Math.round(p.x);
        const pRight = Math.round(p.x + p.width);
        return pLeft >= stripStart && pRight <= stripEnd;
      } else {
        // 가로 스트립: 패널이 이 스트립 범위 내에 있음
        const pTop = Math.round(p.y);
        const pBottom = Math.round(p.y + p.height);
        return pTop >= stripStart && pBottom <= stripEnd;
      }
    });

    console.log(`  스트립 ${i}: [${stripStart}-${stripEnd}], 패널 ${stripPanels.length}개`);

    if (stripPanels.length <= 1) continue;

    // 2차 방향 재단 위치 수집 (패널 경계)
    const secondaryPositions = new Set<number>();
    stripPanels.forEach(p => {
      if (secondaryAxis === 'y') {
        // 가로선 위치 (패널의 상하 경계)
        secondaryPositions.add(Math.round(p.y));
        secondaryPositions.add(Math.round(p.y + p.height));
      } else {
        // 세로선 위치 (패널의 좌우 경계)
        secondaryPositions.add(Math.round(p.x));
        secondaryPositions.add(Math.round(p.x + p.width));
      }
    });

    const stripMax = secondaryAxis === 'y' ? sheetH : sheetW;

    // 스트립 내 패널을 관통하지 않는 위치만 필터링
    const validSecondaryPositions = Array.from(secondaryPositions)
      .filter(pos => {
        if (pos <= 0 || pos >= stripMax) return false;
        // 이 위치가 스트립 내 패널을 관통하지 않는지 확인
        return canCutAt(pos, secondaryAxis, stripPanels);
      })
      .sort((a, b) => a - b);

    console.log(`    2차 재단 위치(${secondaryAxis}): [${validSecondaryPositions.join(', ')}]`);

    // 2차 재단선 추가 (스트립 범위 내에서만)
    validSecondaryPositions.forEach(pos => {
      allCuts.push({
        axis: secondaryAxis,
        pos,
        spanStart: stripStart,
        spanEnd: stripEnd,
        order: cutOrder++
      });
    });
  }

  // 같은 위치(axis + pos)의 재단은 하나로 병합 (span 확장)
  const cutMap = new Map<string, CutInfo>();

  allCuts.forEach(cut => {
    const key = `${cut.axis}-${Math.round(cut.pos)}`;
    const existing = cutMap.get(key);

    if (!existing) {
      cutMap.set(key, { ...cut });
    } else {
      // 같은 위치면 span 확장, order는 더 작은 값 유지
      existing.spanStart = Math.min(existing.spanStart, cut.spanStart);
      existing.spanEnd = Math.max(existing.spanEnd, cut.spanEnd);
      existing.order = Math.min(existing.order, cut.order);
    }
  });

  const uniqueCuts = Array.from(cutMap.values());

  // order 순으로 정렬 (재단 순서 유지)
  uniqueCuts.sort((a, b) => a.order - b.order);

  // CutStep 배열 생성
  const cuts: CutStep[] = [];
  uniqueCuts.forEach((cut, idx) => {
    cuts.push({
      id: `cut-${idx}`,
      order: idx,
      sheetId: '',
      axis: cut.axis as CutAxis,
      pos: cut.pos,
      spanStart: cut.spanStart,
      spanEnd: cut.spanEnd,
      before: workpiece,
      result: workpiece,
      kerf,
      label: cut.axis === 'x' ? `W방향 재단 #${idx + 1}` : `L방향 재단 #${idx + 1}`,
      source: 'derived'
    });
  });

  const xCutCount = cuts.filter(c => c.axis === 'x').length;
  const yCutCount = cuts.filter(c => c.axis === 'y').length;
  console.log(`✂️ Generated ${cuts.length} cuts (세로:${xCutCount}, 가로:${yCutCount})`);

  return cuts;
}

/**
 * @deprecated Use generateGuillotineCuts
 */
export function deriveGuillotineForPanel(
  sheetW: number,
  sheetH: number,
  p: { x: number; y: number; width: number; height: number },
  kerf: number,
  panelId?: string
): CutStep[] {
  const workpiece: WorkPiece = { width: sheetW, length: sheetH };
  const cuts: CutStep[] = [];
  let order = 0;

  const addCut = (axis: CutAxis, pos: number, spanStart: number, spanEnd: number) => {
    cuts.push({
      id: `cut-${panelId || 'panel'}-${order}`,
      order,
      sheetId: '',
      axis,
      pos,
      spanStart,
      spanEnd,
      before: workpiece,
      result: workpiece,
      kerf,
      label: `${axis === 'y' ? 'Rip' : 'Cross'} #${order + 1}`,
      source: 'derived'
    });
    order++;
  };

  if (p.y > kerf) addCut('y', p.y, 0, sheetW);
  if (p.y + p.height < sheetH - kerf) addCut('y', p.y + p.height, 0, sheetW);
  if (p.x > kerf) addCut('x', p.x, 0, sheetH);
  if (p.x + p.width < sheetW - kerf) addCut('x', p.x + p.width, 0, sheetH);

  return cuts;
}

export function buildSequenceForPanel(params: {
  mode?: string;
  sheetW: number;
  sheetH: number;
  kerf: number;
  placement: { x: number; y: number; width: number; height: number };
  sheetId: string;
  panelId: string;
}): CutStep[] {
  const { sheetW, sheetH, kerf, placement: p, panelId } = params;
  return deriveGuillotineForPanel(sheetW, sheetH, p, kerf, panelId);
}

interface SimulationOptions {
  onProgress: (cutIndex: number, progress: number) => void;
  onCutComplete: (cutIndex: number) => void;
  onDone: () => void;
  speed: number;
  cancelRef: { current: boolean };
}

export function runSmoothSimulation(
  cuts: CutStep[],
  options: SimulationOptions
): void {
  const { onProgress, onCutComplete, onDone, speed, cancelRef } = options;

  if (cuts.length === 0) {
    onDone();
    return;
  }

  let currentCutIndex = 0;

  const animateCut = () => {
    if (cancelRef.current || currentCutIndex >= cuts.length) {
      if (!cancelRef.current) onDone();
      return;
    }

    const cut = cuts[currentCutIndex];
    const cutLength = Math.abs((cut.spanEnd || 0) - (cut.spanStart || 0));
    const cutDuration = cutLength > 0 ? (cutLength / speed) * 1000 : 500;
    const startTime = Date.now();

    const animate = () => {
      if (cancelRef.current) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / cutDuration, 1);

      onProgress(currentCutIndex, progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        onCutComplete(currentCutIndex);
        currentCutIndex++;

        if (currentCutIndex < cuts.length) {
          setTimeout(animateCut, 100);
        } else {
          onDone();
        }
      }
    };

    requestAnimationFrame(animate);
  };

  animateCut();
}
