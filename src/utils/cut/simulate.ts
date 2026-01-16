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
 * 진짜 기요틴(패널쏘) 재단 방식:
 * - 재단선이 패널을 관통하면 안됨
 * - 재단선은 빈 공간 또는 패널 경계에서만 가능
 * - 재귀적으로 영역을 분할
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

  // 특정 위치에서 재단이 가능한지 확인 (패널을 관통하지 않는지)
  const canCutVertically = (xPos: number, yStart: number, yEnd: number): boolean => {
    for (const p of panels) {
      // 패널이 이 X 위치를 가로지르고, Y 범위가 겹치는지 확인
      if (p.x < xPos && p.x + p.width > xPos) {
        // 패널의 Y 범위와 재단 Y 범위가 겹치면 재단 불가
        if (p.y < yEnd && p.y + p.height > yStart) {
          return false;
        }
      }
    }
    return true;
  };

  const canCutHorizontally = (yPos: number, xStart: number, xEnd: number): boolean => {
    for (const p of panels) {
      // 패널이 이 Y 위치를 가로지르고, X 범위가 겹치는지 확인
      if (p.y < yPos && p.y + p.height > yPos) {
        // 패널의 X 범위와 재단 X 범위가 겹치면 재단 불가
        if (p.x < xEnd && p.x + p.width > xStart) {
          return false;
        }
      }
    }
    return true;
  };

  // 재귀적으로 영역을 분할하는 함수
  const divideRegion = (
    xStart: number, yStart: number,
    xEnd: number, yEnd: number,
    regionPanels: PanelPlacement[],
    preferVertical: boolean
  ) => {
    if (regionPanels.length <= 1) return;

    // 이 영역 내의 가능한 재단 위치 수집
    const possibleVerticalCuts: number[] = [];
    const possibleHorizontalCuts: number[] = [];

    regionPanels.forEach(p => {
      // 패널 경계 위치들
      if (p.x > xStart + kerf) possibleVerticalCuts.push(p.x);
      if (p.x + p.width < xEnd - kerf) possibleVerticalCuts.push(p.x + p.width);
      if (p.y > yStart + kerf) possibleHorizontalCuts.push(p.y);
      if (p.y + p.height < yEnd - kerf) possibleHorizontalCuts.push(p.y + p.height);
    });

    // 중복 제거 및 정렬
    const uniqueVertical = [...new Set(possibleVerticalCuts)].sort((a, b) => a - b);
    const uniqueHorizontal = [...new Set(possibleHorizontalCuts)].sort((a, b) => a - b);

    // 유효한 재단 위치 필터링 (패널을 관통하지 않는 것만)
    const validVerticalCuts = uniqueVertical.filter(x => canCutVertically(x, yStart, yEnd));
    const validHorizontalCuts = uniqueHorizontal.filter(y => canCutHorizontally(y, xStart, xEnd));

    let cutMade = false;

    if (preferVertical) {
      // 세로 재단 우선 시도
      if (validVerticalCuts.length > 0) {
        const cutX = validVerticalCuts[0];
        cuts.push({
          id: `cut-${order}`,
          order: order++,
          sheetId: '',
          axis: 'x' as CutAxis,
          pos: cutX,
          spanStart: yStart,
          spanEnd: yEnd,
          before: workpiece,
          result: workpiece,
          kerf,
          label: `L방향 재단 #${cuts.length + 1}`,
          source: 'derived'
        });

        // 왼쪽 영역 재귀
        const leftPanels = regionPanels.filter(p => p.x + p.width <= cutX + kerf);
        divideRegion(xStart, yStart, cutX, yEnd, leftPanels, preferVertical);

        // 오른쪽 영역 재귀
        const rightPanels = regionPanels.filter(p => p.x >= cutX - kerf);
        divideRegion(cutX, yStart, xEnd, yEnd, rightPanels, preferVertical);

        cutMade = true;
      }

      // 세로 재단이 없으면 가로 재단 시도
      if (!cutMade && validHorizontalCuts.length > 0) {
        const cutY = validHorizontalCuts[0];
        cuts.push({
          id: `cut-${order}`,
          order: order++,
          sheetId: '',
          axis: 'y' as CutAxis,
          pos: cutY,
          spanStart: xStart,
          spanEnd: xEnd,
          before: workpiece,
          result: workpiece,
          kerf,
          label: `W방향 재단 #${cuts.length + 1}`,
          source: 'derived'
        });

        // 위쪽 영역 재귀
        const topPanels = regionPanels.filter(p => p.y + p.height <= cutY + kerf);
        divideRegion(xStart, yStart, xEnd, cutY, topPanels, preferVertical);

        // 아래쪽 영역 재귀
        const bottomPanels = regionPanels.filter(p => p.y >= cutY - kerf);
        divideRegion(xStart, cutY, xEnd, yEnd, bottomPanels, preferVertical);
      }
    } else {
      // 가로 재단 우선 시도
      if (validHorizontalCuts.length > 0) {
        const cutY = validHorizontalCuts[0];
        cuts.push({
          id: `cut-${order}`,
          order: order++,
          sheetId: '',
          axis: 'y' as CutAxis,
          pos: cutY,
          spanStart: xStart,
          spanEnd: xEnd,
          before: workpiece,
          result: workpiece,
          kerf,
          label: `W방향 재단 #${cuts.length + 1}`,
          source: 'derived'
        });

        // 위쪽 영역 재귀
        const topPanels = regionPanels.filter(p => p.y + p.height <= cutY + kerf);
        divideRegion(xStart, yStart, xEnd, cutY, topPanels, preferVertical);

        // 아래쪽 영역 재귀
        const bottomPanels = regionPanels.filter(p => p.y >= cutY - kerf);
        divideRegion(xStart, cutY, xEnd, yEnd, bottomPanels, preferVertical);

        cutMade = true;
      }

      // 가로 재단이 없으면 세로 재단 시도
      if (!cutMade && validVerticalCuts.length > 0) {
        const cutX = validVerticalCuts[0];
        cuts.push({
          id: `cut-${order}`,
          order: order++,
          sheetId: '',
          axis: 'x' as CutAxis,
          pos: cutX,
          spanStart: yStart,
          spanEnd: yEnd,
          before: workpiece,
          result: workpiece,
          kerf,
          label: `L방향 재단 #${cuts.length + 1}`,
          source: 'derived'
        });

        // 왼쪽 영역 재귀
        const leftPanels = regionPanels.filter(p => p.x + p.width <= cutX + kerf);
        divideRegion(xStart, yStart, cutX, yEnd, leftPanels, preferVertical);

        // 오른쪽 영역 재귀
        const rightPanels = regionPanels.filter(p => p.x >= cutX - kerf);
        divideRegion(cutX, yStart, xEnd, yEnd, rightPanels, preferVertical);
      }
    }
  };

  // L방향 우선 = 세로 재단 우선, W방향 우선 = 가로 재단 우선
  const preferVertical = optimizationType === 'BY_LENGTH';

  console.log('🔧 generateGuillotineCuts (재귀):', {
    optimizationType,
    preferVertical,
    panelCount: panels.length
  });

  // 전체 시트에서 시작
  divideRegion(0, 0, sheetW, sheetH, panels, preferVertical);

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