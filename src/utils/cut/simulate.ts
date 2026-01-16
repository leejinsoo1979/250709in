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
 * 실제 기요틴 재단 방식: 톱날이 시트 전체를 가로질러 재단
 * 1. 먼저 가로 재단(y축)으로 스트립 분리
 * 2. 각 스트립에서 세로 재단(x축)으로 패널 분리
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

  // BY_LENGTH: 가로 재단 먼저 (L방향 우선)
  // BY_WIDTH: 세로 재단 먼저 (W방향 우선)
  const horizontalFirst = optimizationType !== 'BY_WIDTH';

  if (horizontalFirst) {
    // === L방향 우선: 가로 재단 → 세로 재단 ===

    // 1. 고유한 y 좌표 찾기 (스트립 경계)
    const yPositions = new Set<number>();
    panels.forEach(p => {
      if (p.y > kerf) yPositions.add(p.y);
      if (p.y + p.height < sheetH - kerf) yPositions.add(p.y + p.height);
    });
    const sortedY = Array.from(yPositions).sort((a, b) => a - b);

    // 2. 가로 재단 (전체 너비를 가로지름)
    sortedY.forEach(yPos => {
      cuts.push({
        id: `cut-${order}`,
        order: order++,
        sheetId: '',
        axis: 'y' as CutAxis,
        pos: yPos,
        spanStart: 0,
        spanEnd: sheetW, // 전체 시트 너비
        before: workpiece,
        result: workpiece,
        kerf,
        label: `가로 재단 #${order}`,
        source: 'derived'
      });
    });

    // 3. 스트립별로 세로 재단
    const strips: { yStart: number; yEnd: number; panels: PanelPlacement[] }[] = [];
    const yBoundaries = [0, ...sortedY, sheetH];

    for (let i = 0; i < yBoundaries.length - 1; i++) {
      const yStart = yBoundaries[i];
      const yEnd = yBoundaries[i + 1];
      const stripPanels = panels.filter(p =>
        p.y >= yStart - kerf && p.y + p.height <= yEnd + kerf
      );
      if (stripPanels.length > 0) {
        strips.push({ yStart, yEnd, panels: stripPanels });
      }
    }

    // 4. 각 스트립에서 세로 재단 (스트립 높이 전체를 가로지름)
    strips.forEach(strip => {
      const xPositions = new Set<number>();
      strip.panels.forEach(p => {
        if (p.x > kerf) xPositions.add(p.x);
        if (p.x + p.width < sheetW - kerf) xPositions.add(p.x + p.width);
      });
      const sortedX = Array.from(xPositions).sort((a, b) => a - b);

      sortedX.forEach(xPos => {
        // 이 x 위치에서 실제로 재단이 필요한지 확인
        const needsCut = strip.panels.some(p =>
          Math.abs(p.x - xPos) < kerf || Math.abs(p.x + p.width - xPos) < kerf
        );

        if (needsCut) {
          cuts.push({
            id: `cut-${order}`,
            order: order++,
            sheetId: '',
            axis: 'x' as CutAxis,
            pos: xPos,
            spanStart: strip.yStart,
            spanEnd: strip.yEnd, // 스트립 전체 높이
            before: workpiece,
            result: workpiece,
            kerf,
            label: `세로 재단 #${order}`,
            source: 'derived'
          });
        }
      });
    });

  } else {
    // === W방향 우선: 세로 재단 → 가로 재단 ===

    // 1. 고유한 x 좌표 찾기 (스트립 경계)
    const xPositions = new Set<number>();
    panels.forEach(p => {
      if (p.x > kerf) xPositions.add(p.x);
      if (p.x + p.width < sheetW - kerf) xPositions.add(p.x + p.width);
    });
    const sortedX = Array.from(xPositions).sort((a, b) => a - b);

    // 2. 세로 재단 (전체 높이를 가로지름)
    sortedX.forEach(xPos => {
      cuts.push({
        id: `cut-${order}`,
        order: order++,
        sheetId: '',
        axis: 'x' as CutAxis,
        pos: xPos,
        spanStart: 0,
        spanEnd: sheetH, // 전체 시트 높이
        before: workpiece,
        result: workpiece,
        kerf,
        label: `세로 재단 #${order}`,
        source: 'derived'
      });
    });

    // 3. 스트립별로 가로 재단
    const strips: { xStart: number; xEnd: number; panels: PanelPlacement[] }[] = [];
    const xBoundaries = [0, ...sortedX, sheetW];

    for (let i = 0; i < xBoundaries.length - 1; i++) {
      const xStart = xBoundaries[i];
      const xEnd = xBoundaries[i + 1];
      const stripPanels = panels.filter(p =>
        p.x >= xStart - kerf && p.x + p.width <= xEnd + kerf
      );
      if (stripPanels.length > 0) {
        strips.push({ xStart, xEnd, panels: stripPanels });
      }
    }

    // 4. 각 스트립에서 가로 재단 (스트립 너비 전체를 가로지름)
    strips.forEach(strip => {
      const yPositions = new Set<number>();
      strip.panels.forEach(p => {
        if (p.y > kerf) yPositions.add(p.y);
        if (p.y + p.height < sheetH - kerf) yPositions.add(p.y + p.height);
      });
      const sortedY = Array.from(yPositions).sort((a, b) => a - b);

      sortedY.forEach(yPos => {
        const needsCut = strip.panels.some(p =>
          Math.abs(p.y - yPos) < kerf || Math.abs(p.y + p.height - yPos) < kerf
        );

        if (needsCut) {
          cuts.push({
            id: `cut-${order}`,
            order: order++,
            sheetId: '',
            axis: 'y' as CutAxis,
            pos: yPos,
            spanStart: strip.xStart,
            spanEnd: strip.xEnd, // 스트립 전체 너비
            before: workpiece,
            result: workpiece,
            kerf,
            label: `가로 재단 #${order}`,
            source: 'derived'
          });
        }
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