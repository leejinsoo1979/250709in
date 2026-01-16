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

  // 캔버스 좌표계 기준:
  // - x축 재단 (axis='x') = 세로선 = W방향 (파란색)
  // - y축 재단 (axis='y') = 가로선 = L방향 (빨간색)
  // BY_LENGTH = L방향 우선 = y축 재단(가로선) 우선
  // BY_WIDTH = W방향 우선 = x축 재단(세로선) 우선
  const preferVertical = optimizationType === 'BY_WIDTH';

  // 이미 추가된 재단 위치 추적 (중복 방지)
  const addedCuts = new Set<string>();

  // 재단 추가 함수 (isEdge=true면 경계 재단 허용)
  const addCut = (axis: 'x' | 'y', pos: number, spanStart: number, spanEnd: number, isEdge = false) => {
    // 시트 경계에 있는 재단은 스킵 (단, isEdge=true면 허용)
    if (!isEdge) {
      if (axis === 'x' && (pos <= 0.5 || pos >= sheetW - 0.5)) return;
      if (axis === 'y' && (pos <= 0.5 || pos >= sheetH - 0.5)) return;
    }

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

  // 재귀적 영역 분할 함수
  const divideRegion = (
    xStart: number,
    yStart: number,
    xEnd: number,
    yEnd: number,
    regionPanels: PanelPlacement[]
  ) => {
    // 패널이 없으면 종료
    if (regionPanels.length === 0) return;

    // 패널이 1개면 해당 패널의 오른쪽/위쪽 경계 재단만 추가
    if (regionPanels.length === 1) {
      const p = regionPanels[0];
      // 오른쪽 경계 재단 (패널 오른쪽 끝 위치)
      const rightEdge = p.x + p.width;
      if (rightEdge > xStart + kerf && rightEdge < sheetW - kerf) {
        addCut('x', rightEdge, yStart, yEnd);
      }
      // 위쪽 경계 재단 (패널 위쪽 끝 위치)
      const topEdge = p.y + p.height;
      if (topEdge > yStart + kerf && topEdge < sheetH - kerf) {
        addCut('y', topEdge, xStart, xEnd);
      }
      return;
    }

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

    // 세로 재단 실행
    const doVerticalCut = (cutX: number) => {
      addCut('x', cutX, yStart, yEnd);

      const leftPanels = regionPanels.filter(p => p.x + p.width <= cutX + kerf);
      divideRegion(xStart, yStart, cutX, yEnd, leftPanels);

      const rightPanels = regionPanels.filter(p => p.x >= cutX - kerf);
      divideRegion(cutX, yStart, xEnd, yEnd, rightPanels);

      cutMade = true;
    };

    // 가로 재단 실행
    const doHorizontalCut = (cutY: number) => {
      addCut('y', cutY, xStart, xEnd);

      const bottomPanels = regionPanels.filter(p => p.y + p.height <= cutY + kerf);
      divideRegion(xStart, yStart, xEnd, cutY, bottomPanels);

      const topPanels = regionPanels.filter(p => p.y >= cutY - kerf);
      divideRegion(xStart, cutY, xEnd, yEnd, topPanels);

      cutMade = true;
    };

    if (preferVertical) {
      // BY_WIDTH: W방향(세로선, x축) 우선 - 세로 재단이 있으면 무조건 세로 먼저
      if (uniqueVertical.length > 0 && !cutMade) {
        const sortedV = [...uniqueVertical].sort((a, b) => a - b);
        doVerticalCut(sortedV[0]);
      }
      // 세로 재단이 없으면 가로 재단
      if (uniqueHorizontal.length > 0 && !cutMade) {
        const sortedH = [...uniqueHorizontal].sort((a, b) => a - b);
        doHorizontalCut(sortedH[0]);
      }
    } else {
      // BY_LENGTH: L방향(가로선, y축) 우선 - 가로 재단이 있으면 무조건 가로 먼저
      if (uniqueHorizontal.length > 0 && !cutMade) {
        // 위치순 정렬 (아래에서 위로)
        const sortedH = [...uniqueHorizontal].sort((a, b) => a - b);
        doHorizontalCut(sortedH[0]);
      }
      // 가로 재단이 없으면 세로 재단
      if (uniqueVertical.length > 0 && !cutMade) {
        const sortedV = [...uniqueVertical].sort((a, b) => a - b);
        doVerticalCut(sortedV[0]);
      }
    }
  };

  // 먼저 가장자리 재단 추가 (왼쪽, 하단만) - 방향 우선순위에 따라 순서 결정
  if (preferVertical) {
    // W방향 우선: 세로(왼쪽) 먼저
    addCut('x', 0, 0, sheetH, true);
    addCut('y', 0, 0, sheetW, true);
  } else {
    // L방향 우선: 가로(하단) 먼저
    addCut('y', 0, 0, sheetW, true);
    addCut('x', 0, 0, sheetH, true);
  }

  // 전체 시트에서 시작
  divideRegion(0, 0, sheetW, sheetH, panels);

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
