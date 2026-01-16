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
 * 기요틴 재단: 재귀적으로 1차 방향 우선 → 2차 방향 재단
 *
 * 핵심 원칙:
 * 1. W방향 우선 (BY_WIDTH): 파란선(세로, x)을 우선 재단, 불가능하면 빨간선(가로, y)
 * 2. L방향 우선 (BY_LENGTH): 빨간선(가로, y)을 우선 재단, 불가능하면 파란선(세로, x)
 * 3. kerf(5mm)는 이미 패널 간격에 반영되어 있음 - 같은 위치는 1회만 재단
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
  // W방향 우선 = 파란색 세로선(│) 먼저 = axis='x'
  // L방향 우선 = 빨간색 가로선(─) 먼저 = axis='y'
  const primaryAxis = optimizationType === 'BY_WIDTH' ? 'x' : 'y';

  console.log(`🔪 generateGuillotineCuts: ${optimizationType}, primaryAxis=${primaryAxis}, panels=${panels.length}`);

  interface CutInfo {
    axis: 'x' | 'y';
    pos: number;
    spanStart: number;
    spanEnd: number;
  }

  const allCuts: CutInfo[] = [];
  const addedCutKeys = new Set<string>(); // 중복 방지 (axis-pos-spanStart-spanEnd)

  // 해당 위치에서 영역 내 패널을 관통하지 않는지 체크
  const canCutThrough = (pos: number, axis: 'x' | 'y', targetPanels: PanelPlacement[]): boolean => {
    return targetPanels.every(p => {
      if (axis === 'x') {
        return pos <= Math.round(p.x) || pos >= Math.round(p.x + p.width);
      } else {
        return pos <= Math.round(p.y) || pos >= Math.round(p.y + p.height);
      }
    });
  };

  // 재단 추가 (중복 체크)
  const addCut = (axis: 'x' | 'y', pos: number, spanStart: number, spanEnd: number) => {
    const key = `${axis}-${Math.round(pos)}-${Math.round(spanStart)}-${Math.round(spanEnd)}`;
    if (addedCutKeys.has(key)) return;
    addedCutKeys.add(key);
    allCuts.push({ axis, pos, spanStart, spanEnd });
  };

  // 재귀적 영역 분할
  const divideRegion = (
    left: number, top: number, right: number, bottom: number,
    regionPanels: PanelPlacement[]
  ) => {
    if (regionPanels.length <= 1) return;

    // 이 영역 내 패널들의 경계 위치 수집
    const xPositions = new Set<number>();
    const yPositions = new Set<number>();

    regionPanels.forEach(p => {
      const pLeft = Math.round(p.x);
      const pRight = Math.round(p.x + p.width);
      const pTop = Math.round(p.y);
      const pBottom = Math.round(p.y + p.height);

      // 영역 경계 안쪽에 있는 위치만
      if (pLeft > left && pLeft < right) xPositions.add(pLeft);
      if (pRight > left && pRight < right) xPositions.add(pRight);
      if (pTop > top && pTop < bottom) yPositions.add(pTop);
      if (pBottom > top && pBottom < bottom) yPositions.add(pBottom);
    });

    // 관통 가능한 위치만 필터링
    const validX = Array.from(xPositions)
      .filter(x => canCutThrough(x, 'x', regionPanels))
      .sort((a, b) => a - b);
    const validY = Array.from(yPositions)
      .filter(y => canCutThrough(y, 'y', regionPanels))
      .sort((a, b) => a - b);

    // 우선 방향에 따라 재단 위치 선택
    let cutAxis: 'x' | 'y' | null = null;
    let cutPos = 0;

    if (primaryAxis === 'x') {
      // W방향 우선: 세로선(x) 먼저
      if (validX.length > 0) {
        cutAxis = 'x';
        cutPos = validX[0];
      } else if (validY.length > 0) {
        cutAxis = 'y';
        cutPos = validY[0];
      }
    } else {
      // L방향 우선: 가로선(y) 먼저
      if (validY.length > 0) {
        cutAxis = 'y';
        cutPos = validY[0];
      } else if (validX.length > 0) {
        cutAxis = 'x';
        cutPos = validX[0];
      }
    }

    if (!cutAxis) return; // 더 이상 재단 불가

    // 재단 추가
    if (cutAxis === 'x') {
      addCut('x', cutPos, top, bottom);
      // 좌우 분할
      const leftPanels = regionPanels.filter(p => Math.round(p.x + p.width) <= cutPos);
      const rightPanels = regionPanels.filter(p => Math.round(p.x) >= cutPos);
      if (leftPanels.length > 0) divideRegion(left, top, cutPos, bottom, leftPanels);
      if (rightPanels.length > 0) divideRegion(cutPos, top, right, bottom, rightPanels);
    } else {
      addCut('y', cutPos, left, right);
      // 상하 분할
      const topPanels = regionPanels.filter(p => Math.round(p.y + p.height) <= cutPos);
      const bottomPanels = regionPanels.filter(p => Math.round(p.y) >= cutPos);
      if (topPanels.length > 0) divideRegion(left, top, right, cutPos, topPanels);
      if (bottomPanels.length > 0) divideRegion(left, cutPos, right, bottom, bottomPanels);
    }
  };

  // 전체 시트에서 시작
  divideRegion(0, 0, sheetW, sheetH, panels);

  // CutStep 배열 생성 (추가된 순서 = 재단 순서)
  const cuts: CutStep[] = allCuts.map((cut, idx) => ({
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
  }));

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
