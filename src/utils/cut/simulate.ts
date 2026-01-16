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
 * Generate guillotine cuts for an entire sheet
 * 모든 패널 경계를 수집하고 방향 우선순위에 따라 정렬하여 재단
 */
export function generateGuillotineCuts(
  sheetW: number,
  sheetH: number,
  panels: PanelPlacement[],
  kerf: number,
  optimizationType: 'BY_LENGTH' | 'BY_WIDTH' | 'OPTIMAL_CNC' = 'BY_LENGTH'
): CutStep[] {
  const cuts: CutStep[] = [];
  let order = 0;
  const workpiece: WorkPiece = { width: sheetW, length: sheetH };

  if (panels.length === 0) return cuts;

  // BY_WIDTH = W방향 우선 = x축 재단(세로선) 우선
  // BY_LENGTH = L방향 우선 = y축 재단(가로선) 우선
  const preferVertical = optimizationType === 'BY_WIDTH';

  // 이미 추가된 재단 위치 추적 (중복 방지)
  const addedCuts = new Set<string>();

  // 재단 추가 함수
  const addCut = (axis: 'x' | 'y', pos: number, spanStart: number, spanEnd: number) => {
    // span이 유효한지 확인
    if (spanEnd <= spanStart + 0.5) return;

    // 중복 체크
    const key = `${axis}-${Math.round(pos)}`;
    if (addedCuts.has(key)) return;
    addedCuts.add(key);

    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: axis as CutAxis,
      pos,
      spanStart,
      spanEnd,
      before: workpiece,
      result: workpiece,
      kerf,
      label: axis === 'y' ? `L방향 재단 #${cuts.length + 1}` : `W방향 재단 #${cuts.length + 1}`,
      source: 'derived'
    });
  };

  // 모든 패널 경계 위치 수집
  const verticalPositions = new Set<number>(); // x축 재단 위치 (세로선)
  const horizontalPositions = new Set<number>(); // y축 재단 위치 (가로선)

  // 가장자리 추가 (왼쪽 x=0, 하단 y=0)
  verticalPositions.add(0);
  horizontalPositions.add(0);

  // 모든 패널의 4면 경계 수집
  panels.forEach(p => {
    // 왼쪽 경계 (세로선)
    if (p.x > kerf) verticalPositions.add(Math.round(p.x));
    // 오른쪽 경계 (세로선)
    if (p.x + p.width < sheetW - kerf) verticalPositions.add(Math.round(p.x + p.width));

    // 아래 경계 (가로선)
    if (p.y > kerf) horizontalPositions.add(Math.round(p.y));
    // 위 경계 (가로선)
    if (p.y + p.height < sheetH - kerf) horizontalPositions.add(Math.round(p.y + p.height));
  });

  // 정렬
  const sortedVertical = [...verticalPositions].sort((a, b) => a - b);
  const sortedHorizontal = [...horizontalPositions].sort((a, b) => a - b);

  // 방향 우선순위에 따라 재단 추가
  if (preferVertical) {
    // W방향 우선: 세로선 먼저, 그 다음 가로선
    sortedVertical.forEach(x => addCut('x', x, 0, sheetH));
    sortedHorizontal.forEach(y => addCut('y', y, 0, sheetW));
  } else {
    // L방향 우선: 가로선 먼저, 그 다음 세로선
    sortedHorizontal.forEach(y => addCut('y', y, 0, sheetW));
    sortedVertical.forEach(x => addCut('x', x, 0, sheetH));
  }

  // order 재설정
  cuts.forEach((cut, idx) => {
    cut.order = idx;
    cut.id = `cut-${idx}`;
    cut.label = cut.axis === 'y' ? `L방향 재단 #${idx + 1}` : `W방향 재단 #${idx + 1}`;
  });

  return cuts;
}

/**
 * Generate guillotine cuts for a panel - 2-4 cuts to isolate the panel
 * Order: horizontal cuts first (rip), then vertical cuts (crosscut)
 * @deprecated Use generateGuillotineCuts for proper full-span cuts
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

  // Bottom edge (y = panel.y) - horizontal cut
  if (p.y > kerf) {
    addCut('y', p.y, 0, sheetW);
  }

  // Top edge (y = panel.y + panel.height) - horizontal cut
  if (p.y + p.height < sheetH - kerf) {
    addCut('y', p.y + p.height, 0, sheetW);
  }

  // Left edge (x = panel.x) - vertical cut
  if (p.x > kerf) {
    addCut('x', p.x, 0, sheetH);
  }

  // Right edge (x = panel.x + panel.width) - vertical cut
  if (p.x + p.width < sheetW - kerf) {
    addCut('x', p.x + p.width, 0, sheetH);
  }

  return cuts;
}

/**
 * Build sequence for a single panel (OPTIMAL_CNC mode)
 */
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

/**
 * Run smooth simulation (placeholder for animation)
 */
export function runSmoothSimulation(
  cuts: CutStep[],
  onStep: (cut: CutStep, index: number) => void,
  onComplete: () => void,
  delay = 500
): { cancel: () => void } {
  let cancelled = false;
  let currentIndex = 0;

  const step = () => {
    if (cancelled || currentIndex >= cuts.length) {
      if (!cancelled) onComplete();
      return;
    }
    onStep(cuts[currentIndex], currentIndex);
    currentIndex++;
    setTimeout(step, delay);
  };

  setTimeout(step, delay);

  return {
    cancel: () => {
      cancelled = true;
    }
  };
}
