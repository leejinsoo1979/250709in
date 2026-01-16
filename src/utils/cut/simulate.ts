import type { CutStep, CutAxis, WorkPiece } from '@/types/cutlist';

/**
 * Generate guillotine cuts for a panel - 2-4 cuts to isolate the panel
 * Order: horizontal cuts first (rip), then vertical cuts (crosscut)
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
  
  // Horizontal cuts (y-axis) - rip cuts
  // Bottom edge of panel
  if (p.y > 0) {
    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: 'y' as CutAxis,
      pos: p.y - kerf / 2,
      spanStart: 0,
      spanEnd: sheetW,
      before: currentWorkpiece,
      result: { width: sheetW, length: sheetH - p.y },
      kerf,
      label: `가로 재단 y=${p.y}`,
      source: 'derived'
    });
    currentWorkpiece = { width: sheetW, length: sheetH - p.y };
  }
  
  // Top edge of panel
  if (p.y + p.height < sheetH) {
    const resultHeight = p.height + (p.y > 0 ? 0 : p.y);
    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: 'y' as CutAxis,
      pos: p.y + p.height + kerf / 2,
      spanStart: 0,
      spanEnd: sheetW,
      before: currentWorkpiece,
      result: { width: sheetW, length: resultHeight },
      kerf,
      label: `가로 재단 y=${p.y + p.height}`,
      source: 'derived'
    });
    currentWorkpiece = { width: sheetW, length: resultHeight };
  }
  
  // Vertical cuts (x-axis) - crosscuts
  // Left edge of panel
  if (p.x > 0) {
    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: 'x' as CutAxis,
      pos: p.x - kerf / 2,
      spanStart: Math.max(0, p.y - kerf),
      spanEnd: Math.min(sheetH, p.y + p.height + kerf),
      before: currentWorkpiece,
      result: { width: currentWorkpiece.width - p.x, length: currentWorkpiece.length },
      kerf,
      label: `세로 재단 x=${p.x}`,
      source: 'derived'
    });
    currentWorkpiece = { width: currentWorkpiece.width - p.x, length: currentWorkpiece.length };
  }
  
  // Right edge of panel - 마지막 재단으로 패널 완성
  if (p.x + p.width < sheetW) {
    cuts.push({
      id: `cut-${order}`,
      order: order++,
      sheetId: '',
      axis: 'x' as CutAxis,
      pos: p.x + p.width + kerf / 2,
      spanStart: Math.max(0, p.y - kerf),
      spanEnd: Math.min(sheetH, p.y + p.height + kerf),
      before: currentWorkpiece,
      result: { width: p.width, length: p.height },
      yieldsPanelId: panelId,
      kerf,
      label: `세로 재단 x=${p.x + p.width}`,
      source: 'derived'
    });
  }
  
  // 마지막 컷에 패널 ID 표시 (패널이 완성됨)
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