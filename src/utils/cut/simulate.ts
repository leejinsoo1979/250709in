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
 * 기요틴 재단: 모든 재단은 시트 전체를 관통
 * 패널 경계 위치에서만 재단하므로 패널을 자르지 않음
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

  // BY_WIDTH = W방향 우선 = 가로선(y축) 먼저 (파란색)
  // BY_LENGTH = L방향 우선 = 세로선(x축) 먼저 (빨간색)
  const preferHorizontal = optimizationType === 'BY_WIDTH';

  console.log(`🔪 generateGuillotineCuts: ${optimizationType}, preferHorizontal=${preferHorizontal}`);

  // 이미 추가된 재단 위치 추적 (중복 방지)
  const addedCuts = new Set<string>();

  // 재단 추가 함수
  const addCut = (axis: 'x' | 'y', pos: number, spanStart: number, spanEnd: number) => {
    // 시트 가장자리는 재단 제외 (이미 잘려있음)
    if (axis === 'x' && (pos <= kerf || pos >= sheetW - kerf)) return;
    if (axis === 'y' && (pos <= kerf || pos >= sheetH - kerf)) return;

    // span이 유효한지 확인
    if (spanEnd <= spanStart + kerf) return;

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
      // axis 'y' = 가로선 = W방향 재단 (파란색)
      // axis 'x' = 세로선 = L방향 재단 (빨간색)
      label: axis === 'y' ? `W방향 재단 #${cuts.length + 1}` : `L방향 재단 #${cuts.length + 1}`,
      source: 'derived'
    });
  };

  // 모든 패널 경계 위치 수집
  const verticalPositions = new Set<number>(); // x축 재단 위치 (세로선)
  const horizontalPositions = new Set<number>(); // y축 재단 위치 (가로선)

  panels.forEach(p => {
    // 왼쪽 경계 (세로선)
    if (p.x > kerf) verticalPositions.add(Math.round(p.x));
    // 오른쪽 경계 (세로선)
    if (p.x + p.width < sheetW - kerf) verticalPositions.add(Math.round(p.x + p.width));

    // 하단 경계 (가로선)
    if (p.y > kerf) horizontalPositions.add(Math.round(p.y));
    // 상단 경계 (가로선)
    if (p.y + p.height < sheetH - kerf) horizontalPositions.add(Math.round(p.y + p.height));
  });

  // 정렬
  const sortedVertical = [...verticalPositions].sort((a, b) => a - b);
  const sortedHorizontal = [...horizontalPositions].sort((a, b) => a - b);

  console.log(`📏 Vertical positions (L방향 세로선):`, sortedVertical);
  console.log(`📏 Horizontal positions (W방향 가로선):`, sortedHorizontal);

  // 방향 우선순위에 따라 재단 추가
  // 기요틴 재단: 모든 재단은 시트 전체를 관통
  if (preferHorizontal) {
    // W방향 우선: 가로선 먼저, 그 다음 세로선
    sortedHorizontal.forEach(y => addCut('y', y, 0, sheetW));
    sortedVertical.forEach(x => addCut('x', x, 0, sheetH));
  } else {
    // L방향 우선: 세로선 먼저, 그 다음 가로선
    sortedVertical.forEach(x => addCut('x', x, 0, sheetH));
    sortedHorizontal.forEach(y => addCut('y', y, 0, sheetW));
  }

  // order 재설정
  cuts.forEach((cut, idx) => {
    cut.order = idx;
    cut.id = `cut-${idx}`;
    cut.label = cut.axis === 'y' ? `W방향 재단 #${idx + 1}` : `L방향 재단 #${idx + 1}`;
  });

  console.log(`✂️ Generated ${cuts.length} cuts`);

  return cuts;
}

/**
 * Generate guillotine cuts for a panel - 2-4 cuts to isolate the panel
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

  if (p.y > kerf) {
    addCut('y', p.y, 0, sheetW);
  }
  if (p.y + p.height < sheetH - kerf) {
    addCut('y', p.y + p.height, 0, sheetW);
  }
  if (p.x > kerf) {
    addCut('x', p.x, 0, sheetH);
  }
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
 * 시뮬레이션 옵션 인터페이스
 */
interface SimulationOptions {
  onProgress: (cutIndex: number, progress: number) => void;
  onCutComplete: (cutIndex: number) => void;
  onDone: () => void;
  speed: number; // mm/s
  cancelRef: { current: boolean };
}

/**
 * Run smooth simulation with animated saw movement
 */
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
      if (!cancelRef.current) {
        onDone();
      }
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
