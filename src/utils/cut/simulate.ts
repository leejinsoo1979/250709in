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
 * 기요틴 재단: 큰 영역부터 분할하여 재단
 * 재귀적 분할 방식으로 올바른 재단 순서 생성
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

  // L방향 우선 = 세로 재단(x) 우선, W방향 우선 = 가로 재단(y) 우선
  const preferVertical = optimizationType === 'BY_LENGTH';

  // 이미 추가된 재단 위치 추적 (중복 방지)
  const addedCuts = new Set<string>();

  // 재단 추가 함수
  const addCut = (axis: 'x' | 'y', pos: number, spanStart: number, spanEnd: number) => {
    // 시트 경계에 있는 재단은 스킵
    if (axis === 'x' && (pos <= 0.5 || pos >= sheetW - 0.5)) return;
    if (axis === 'y' && (pos <= 0.5 || pos >= sheetH - 0.5)) return;

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
      label: axis === 'x' ? `L방향 재단 #${cuts.length + 1}` : `W방향 재단 #${cuts.length + 1}`,
      source: 'derived'
    });
  };

  // 재귀적 영역 분할 함수
  const divideRegion = (
    xStart: number,
    yStart: number,
    xEnd: number,
    yEnd: number,
    regionPanels: PanelPlacement[]
  ) => {
    // 패널이 없거나 1개면 더 이상 분할 불필요
    if (regionPanels.length <= 1) return;

    // 영역이 너무 작으면 종료
    if (xEnd - xStart < kerf * 2 || yEnd - yStart < kerf * 2) return;

    // 현재 영역 내 패널만 고려하여 재단 가능 여부 판단
    const canCutVertically = (cutX: number): boolean => {
      for (const p of regionPanels) {
        // 재단선이 패널 내부를 지나가면 불가
        if (p.x < cutX - 0.1 && p.x + p.width > cutX + 0.1) {
          return false;
        }
      }
      return true;
    };

    const canCutHorizontally = (cutY: number): boolean => {
      for (const p of regionPanels) {
        // 재단선이 패널 내부를 지나가면 불가
        if (p.y < cutY - 0.1 && p.y + p.height > cutY + 0.1) {
          return false;
        }
      }
      return true;
    };

    // 가능한 세로 재단 위치 수집 (패널 경계)
    const verticalCuts: number[] = [];
    regionPanels.forEach(p => {
      if (p.x > xStart + kerf && p.x < xEnd - kerf) {
        if (canCutVertically(p.x)) verticalCuts.push(p.x);
      }
      if (p.x + p.width > xStart + kerf && p.x + p.width < xEnd - kerf) {
        if (canCutVertically(p.x + p.width)) verticalCuts.push(p.x + p.width);
      }
    });

    // 가능한 가로 재단 위치 수집 (패널 경계)
    const horizontalCuts: number[] = [];
    regionPanels.forEach(p => {
      if (p.y > yStart + kerf && p.y < yEnd - kerf) {
        if (canCutHorizontally(p.y)) horizontalCuts.push(p.y);
      }
      if (p.y + p.height > yStart + kerf && p.y + p.height < yEnd - kerf) {
        if (canCutHorizontally(p.y + p.height)) horizontalCuts.push(p.y + p.height);
      }
    });

    // 중복 제거 및 정렬
    const uniqueVertical = [...new Set(verticalCuts.map(v => Math.round(v)))].sort((a, b) => a - b);
    const uniqueHorizontal = [...new Set(horizontalCuts.map(v => Math.round(v)))].sort((a, b) => a - b);

    let cutMade = false;

    if (preferVertical) {
      // 세로 재단 우선
      if (uniqueVertical.length > 0 && !cutMade) {
        // 가장 효과적인 재단 위치 선택 (중앙에 가까운 것)
        const midX = (xStart + xEnd) / 2;
        uniqueVertical.sort((a, b) => Math.abs(a - midX) - Math.abs(b - midX));
        const cutX = uniqueVertical[0];

        addCut('x', cutX, yStart, yEnd);

        // 왼쪽 영역
        const leftPanels = regionPanels.filter(p => p.x + p.width <= cutX + kerf);
        divideRegion(xStart, yStart, cutX, yEnd, leftPanels);

        // 오른쪽 영역
        const rightPanels = regionPanels.filter(p => p.x >= cutX - kerf);
        divideRegion(cutX, yStart, xEnd, yEnd, rightPanels);

        cutMade = true;
      }

      // 세로 재단이 안 되면 가로 재단
      if (uniqueHorizontal.length > 0 && !cutMade) {
        const midY = (yStart + yEnd) / 2;
        uniqueHorizontal.sort((a, b) => Math.abs(a - midY) - Math.abs(b - midY));
        const cutY = uniqueHorizontal[0];

        addCut('y', cutY, xStart, xEnd);

        // 아래쪽 영역
        const bottomPanels = regionPanels.filter(p => p.y + p.height <= cutY + kerf);
        divideRegion(xStart, yStart, xEnd, cutY, bottomPanels);

        // 위쪽 영역
        const topPanels = regionPanels.filter(p => p.y >= cutY - kerf);
        divideRegion(xStart, cutY, xEnd, yEnd, topPanels);

        cutMade = true;
      }
    } else {
      // 가로 재단 우선
      if (uniqueHorizontal.length > 0 && !cutMade) {
        const midY = (yStart + yEnd) / 2;
        uniqueHorizontal.sort((a, b) => Math.abs(a - midY) - Math.abs(b - midY));
        const cutY = uniqueHorizontal[0];

        addCut('y', cutY, xStart, xEnd);

        // 아래쪽 영역
        const bottomPanels = regionPanels.filter(p => p.y + p.height <= cutY + kerf);
        divideRegion(xStart, yStart, xEnd, cutY, bottomPanels);

        // 위쪽 영역
        const topPanels = regionPanels.filter(p => p.y >= cutY - kerf);
        divideRegion(xStart, cutY, xEnd, yEnd, topPanels);

        cutMade = true;
      }

      // 가로 재단이 안 되면 세로 재단
      if (uniqueVertical.length > 0 && !cutMade) {
        const midX = (xStart + xEnd) / 2;
        uniqueVertical.sort((a, b) => Math.abs(a - midX) - Math.abs(b - midX));
        const cutX = uniqueVertical[0];

        addCut('x', cutX, yStart, yEnd);

        // 왼쪽 영역
        const leftPanels = regionPanels.filter(p => p.x + p.width <= cutX + kerf);
        divideRegion(xStart, yStart, cutX, yEnd, leftPanels);

        // 오른쪽 영역
        const rightPanels = regionPanels.filter(p => p.x >= cutX - kerf);
        divideRegion(cutX, yStart, xEnd, yEnd, rightPanels);

        cutMade = true;
      }
    }
  };

  // 전체 시트에서 시작
  divideRegion(0, 0, sheetW, sheetH, panels);

  // order 재설정
  cuts.forEach((cut, idx) => {
    cut.order = idx;
    cut.id = `cut-${idx}`;
    cut.label = cut.axis === 'x' ? `L방향 재단 #${idx + 1}` : `W방향 재단 #${idx + 1}`;
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
      spanEnd: sheetW,
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
      spanEnd: sheetW,
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
      spanEnd: sheetH,
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
      spanEnd: sheetH,
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

  // Left edge
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
  const baseDelay = 1000 / speed;

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

  animate();
}

/**
 * Run simulation with smooth progress animation
 */
export function runSmoothSimulation(
  steps: CutStep[],
  controls: {
    onProgress: (cutIndex: number, progress: number) => void;
    onCutComplete: (cutIndex: number) => void;
    onDone: () => void;
    speed: number;
    cancelRef: { current: boolean };
  }
): void {
  const { onProgress, onCutComplete, onDone, speed, cancelRef } = controls;

  let currentIndex = 0;
  let startTime = 0;

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
    const duration = (cutLength / speed) * 1000;

    if (startTime === 0) {
      startTime = timestamp;
    }

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);

    onProgress(currentIndex, progress);

    if (progress >= 1) {
      onCutComplete(currentIndex);
      currentIndex++;
      startTime = 0;

      if (currentIndex < steps.length) {
        requestAnimationFrame(animateCut);
      } else {
        onDone();
      }
    } else {
      requestAnimationFrame(animateCut);
    }
  };

  requestAnimationFrame(animateCut);
}
