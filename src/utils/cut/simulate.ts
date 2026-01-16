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
 * Generate proper guillotine cuts for an entire sheet
 * 실제 기요틴(패널쏘) 재단 방식:
 * - 톱날이 한 번 지나가면 하나의 조각이 둘로 분리됨
 * - 같은 위치를 두 번 자르지 않음
 * - L방향 우선: 모든 가로 재단 먼저 (시트 전체 폭) → 그 다음 세로 재단
 * - W방향 우선: 모든 세로 재단 먼저 (시트 전체 높이) → 그 다음 가로 재단
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

  // 모든 패널 경계에서 재단 위치 수집
  const horizontalPositions: number[] = []; // y 좌표 (가로 재단)
  const verticalPositions: number[] = [];   // x 좌표 (세로 재단)

  panels.forEach(p => {
    // 패널의 모든 경계 추가
    horizontalPositions.push(p.y);
    horizontalPositions.push(p.y + p.height);
    verticalPositions.push(p.x);
    verticalPositions.push(p.x + p.width);
  });

  // kerf 범위 내의 위치들을 하나로 통합 (중복 제거)
  const consolidatePositions = (positions: number[], minVal: number, maxVal: number): number[] => {
    const sorted = [...new Set(positions)].sort((a, b) => a - b);
    const result: number[] = [];

    for (const pos of sorted) {
      // 시트 끝(0, maxVal)은 제외 - 그 외 모든 위치는 재단 필요
      if (pos <= minVal || pos >= maxVal) continue;

      // 이전 위치와 kerf*2 이내면 중복으로 간주하고 스킵
      if (result.length > 0 && pos - result[result.length - 1] <= kerf * 2) {
        continue;
      }
      result.push(pos);
    }
    return result;
  };

  const sortedHorizontal = consolidatePositions(horizontalPositions, 0, sheetH);
  const sortedVertical = consolidatePositions(verticalPositions, 0, sheetW);

  // L방향 우선 (BY_LENGTH): 가로 재단 먼저 (→ 방향, 톱날이 왼쪽→오른쪽)
  // W방향 우선 (BY_WIDTH): 세로 재단 먼저 (↓ 방향, 톱날이 위→아래)
  const horizontalFirst = optimizationType === 'BY_LENGTH';

  if (horizontalFirst) {
    // === L방향 우선 (→) ===
    // 1단계: 모든 가로 재단 (톱날이 왼쪽에서 오른쪽으로)
    sortedHorizontal.forEach(yPos => {
      cuts.push({
        id: `cut-${order}`,
        order: order++,
        sheetId: '',
        axis: 'y' as CutAxis,
        pos: yPos,
        spanStart: 0,
        spanEnd: sheetW,
        before: workpiece,
        result: workpiece,
        kerf,
        label: `L방향 재단 #${cuts.length + 1}`,
        source: 'derived'
      });
    });

    // 2단계: 모든 세로 재단 (톱날이 위에서 아래로)
    sortedVertical.forEach(xPos => {
      cuts.push({
        id: `cut-${order}`,
        order: order++,
        sheetId: '',
        axis: 'x' as CutAxis,
        pos: xPos,
        spanStart: 0,
        spanEnd: sheetH,
        before: workpiece,
        result: workpiece,
        kerf,
        label: `W방향 재단 #${cuts.length + 1}`,
        source: 'derived'
      });
    });

  } else {
    // === W방향 우선 (↓) ===
    // 1단계: 모든 세로 재단 (톱날이 위에서 아래로)
    sortedVertical.forEach(xPos => {
      cuts.push({
        id: `cut-${order}`,
        order: order++,
        sheetId: '',
        axis: 'x' as CutAxis,
        pos: xPos,
        spanStart: 0,
        spanEnd: sheetH,
        before: workpiece,
        result: workpiece,
        kerf,
        label: `W방향 재단 #${cuts.length + 1}`,
        source: 'derived'
      });
    });

    // 2단계: 모든 가로 재단 (톱날이 왼쪽에서 오른쪽으로)
    sortedHorizontal.forEach(yPos => {
      cuts.push({
        id: `cut-${order}`,
        order: order++,
        sheetId: '',
        axis: 'y' as CutAxis,
        pos: yPos,
        spanStart: 0,
        spanEnd: sheetW,
        before: workpiece,
        result: workpiece,
        kerf,
        label: `L방향 재단 #${cuts.length + 1}`,
        source: 'derived'
      });
    });
  }

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
  const cuts: CutStep[] = [];
  let order = 0;
  let currentWorkpiece: WorkPiece = { width: sheetW, length: sheetH };

  // Horizontal cuts (y-axis) - rip cuts - FULL WIDTH
  if (p.y > 0) {
    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: 'y' as CutAxis,
      pos: p.y,
      spanStart: 0,
      spanEnd: sheetW, // 전체 시트 너비
      before: currentWorkpiece,
      result: { width: sheetW, length: sheetH - p.y },
      kerf,
      label: `가로 재단 y=${p.y}`,
      source: 'derived'
    });
    currentWorkpiece = { width: sheetW, length: sheetH - p.y };
  }

  if (p.y + p.height < sheetH) {
    const resultHeight = p.height + (p.y > 0 ? 0 : p.y);
    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: 'y' as CutAxis,
      pos: p.y + p.height,
      spanStart: 0,
      spanEnd: sheetW, // 전체 시트 너비
      before: currentWorkpiece,
      result: { width: sheetW, length: resultHeight },
      kerf,
      label: `가로 재단 y=${p.y + p.height}`,
      source: 'derived'
    });
    currentWorkpiece = { width: sheetW, length: resultHeight };
  }

  // Vertical cuts (x-axis) - crosscuts - FULL STRIP HEIGHT
  if (p.x > 0) {
    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: 'x' as CutAxis,
      pos: p.x,
      spanStart: 0,
      spanEnd: sheetH, // 전체 시트 높이 (또는 스트립 높이)
      before: currentWorkpiece,
      result: { width: currentWorkpiece.width - p.x, length: currentWorkpiece.length },
      kerf,
      label: `세로 재단 x=${p.x}`,
      source: 'derived'
    });
    currentWorkpiece = { width: currentWorkpiece.width - p.x, length: currentWorkpiece.length };
  }

  if (p.x + p.width < sheetW) {
    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: 'x' as CutAxis,
      pos: p.x + p.width,
      spanStart: 0,
      spanEnd: sheetH, // 전체 시트 높이 (또는 스트립 높이)
      before: currentWorkpiece,
      result: { width: p.width, length: p.height },
      yieldsPanelId: panelId,
      kerf,
      label: `세로 재단 x=${p.x + p.width}`,
      source: 'derived'
    });
  }

  if (cuts.length > 0 && panelId) {
    cuts[cuts.length - 1].yieldsPanelId = panelId;
  }

  return cuts;
}

/**
 * Generate free cut perimeter - traces around the panel edges
 * Order: top → right → bottom → left
 */
export function deriveFreeCutPerimeter(
  sheetW: number,
  sheetH: number,
  p: { x: number; y: number; width: number; height: number },
  kerf: number,
  panelId?: string
): CutStep[] {
  const cuts: CutStep[] = [];
  let order = 0;
  
  // Free Cut에서는 전체 시트에서 패널 주변을 자름
  const workpiece: WorkPiece = { width: sheetW, length: sheetH };
  
  // Top edge
  cuts.push({
    id: `cut-${order}`,
    order: order++,
    sheetId: '',
    axis: 'y' as CutAxis,
    pos: p.y + p.height,
    spanStart: p.x,
    spanEnd: p.x + p.width,
    before: workpiece,
    result: { width: p.width, length: p.height },
    kerf,
    label: `상단: y=${p.y + p.height}`,
    source: 'derived'
  });
  
  // Right edge
  cuts.push({
    id: `cut-${order}`,
    order: order++,
    sheetId: '',
    axis: 'x' as CutAxis,
    pos: p.x + p.width,
    spanStart: p.y,
    spanEnd: p.y + p.height,
    before: workpiece,
    result: { width: p.width, length: p.height },
    kerf,
    label: `우측: x=${p.x + p.width}`,
    source: 'derived'
  });
  
  // Bottom edge
  cuts.push({
    id: `cut-${order}`,
    order: order++,
    sheetId: '',
    axis: 'y' as CutAxis,
    pos: p.y,
    spanStart: p.x,
    spanEnd: p.x + p.width,
    before: workpiece,
    result: { width: p.width, length: p.height },
    kerf,
    label: `하단: y=${p.y}`,
    source: 'derived'
  });
  
  // Left edge - 마지막 재단으로 패널 완성
  cuts.push({
    id: `cut-${order}`,
    order: order++,
    sheetId: '',
    axis: 'x' as CutAxis,
    pos: p.x,
    spanStart: p.y,
    spanEnd: p.y + p.height,
    before: workpiece,
    result: { width: p.width, length: p.height },
    yieldsPanelId: panelId,
    kerf,
    label: `좌측: x=${p.x}`,
    source: 'derived'
  });
  
  return cuts;
}

/**
 * Build cut sequence for a panel based on mode
 */
export function buildSequenceForPanel(opts: {
  mode: 'guillotine' | 'free';
  sheetW: number;
  sheetH: number;
  kerf: number;
  placement: { x: number; y: number; width: number; height: number };
  sheetId?: string;
  panelId?: string;
}): CutStep[] {
  const { mode, sheetW, sheetH, kerf, placement, sheetId = '', panelId } = opts;
  
  let cuts: CutStep[];
  if (mode === 'guillotine') {
    cuts = deriveGuillotineForPanel(sheetW, sheetH, placement, kerf, panelId);
  } else {
    cuts = deriveFreeCutPerimeter(sheetW, sheetH, placement, kerf, panelId);
  }
  
  // Set sheetId for all cuts
  return cuts.map(cut => ({ ...cut, sheetId }));
}

/**
 * Run simulation with animation (legacy - step by step)
 */
export function runSimulation(
  steps: CutStep[],
  controls: {
    onTick: (i: number) => void;
    onDone: () => void;
    speed: number;
    cancelRef: { current: boolean };
  }
): void {
  const { onTick, onDone, speed, cancelRef } = controls;
  const baseDelay = 1000 / speed; // Base delay in ms (1 second per cut at speed 1)


  let currentIndex = 0;

  const animate = () => {
    if (cancelRef.current || currentIndex >= steps.length) {
      onDone();
      return;
    }

    onTick(currentIndex);
    currentIndex++;

    setTimeout(animate, baseDelay);
  };

  // Start animation
  animate();
}

/**
 * Run simulation with smooth progress animation
 * The saw blade moves along each cut line progressively
 */
export function runSmoothSimulation(
  steps: CutStep[],
  controls: {
    onProgress: (cutIndex: number, progress: number) => void; // progress: 0-1
    onCutComplete: (cutIndex: number) => void;
    onDone: () => void;
    speed: number; // mm per second
    cancelRef: { current: boolean };
  }
): void {
  const { onProgress, onCutComplete, onDone, speed, cancelRef } = controls;

  let currentIndex = 0;
  let startTime = 0;
  let animationId: number;

  const animateCut = (timestamp: number) => {
    if (cancelRef.current) {
      onDone();
      return;
    }

    if (currentIndex >= steps.length) {
      onDone();
      return;
    }

    const cut = steps[currentIndex];
    const cutLength = Math.abs(cut.spanEnd - cut.spanStart);
    const duration = (cutLength / speed) * 1000; // Convert to milliseconds

    if (startTime === 0) {
      startTime = timestamp;
    }

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);

    onProgress(currentIndex, progress);

    if (progress >= 1) {
      // Cut complete, move to next
      onCutComplete(currentIndex);
      currentIndex++;
      startTime = 0;

      if (currentIndex < steps.length) {
        animationId = requestAnimationFrame(animateCut);
      } else {
        onDone();
      }
    } else {
      animationId = requestAnimationFrame(animateCut);
    }
  };

  // Start animation
  animationId = requestAnimationFrame(animateCut);
}