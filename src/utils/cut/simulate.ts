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
 * 기요틴 재단: 패널을 관통하지 않는 재단선만 생성
 * 모든 패널의 4면 경계를 재단
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

  // 재단선 중복 체크용 (key: "axis-pos-spanStart-spanEnd")
  const addedCuts = new Set<string>();

  // 특정 위치에서 재단이 패널을 관통하는지 확인
  const wouldCutThroughPanel = (axis: 'x' | 'y', pos: number, spanStart: number, spanEnd: number): boolean => {
    const tolerance = 0.1; // 부동소수점 오차 허용
    for (const p of panels) {
      if (axis === 'x') {
        // 세로 재단: 패널 내부를 지나가는지 확인
        // pos가 패널의 왼쪽 경계와 오른쪽 경계 사이에 있어야 관통
        if (p.x + tolerance < pos && p.x + p.width - tolerance > pos) {
          // 패널의 Y 범위와 재단 Y 범위가 겹치면 관통
          if (p.y < spanEnd - tolerance && p.y + p.height > spanStart + tolerance) {
            return true;
          }
        }
      } else {
        // 가로 재단: 패널 내부를 지나가는지 확인
        // pos가 패널의 위쪽 경계와 아래쪽 경계 사이에 있어야 관통
        if (p.y + tolerance < pos && p.y + p.height - tolerance > pos) {
          // 패널의 X 범위와 재단 X 범위가 겹치면 관통
          if (p.x < spanEnd - tolerance && p.x + p.width > spanStart + tolerance) {
            return true;
          }
        }
      }
    }
    return false;
  };

  // 재단 추가 함수 (중복 방지) - 같은 위치에는 하나의 재단만 허용
  const addCut = (axis: 'x' | 'y', pos: number, spanStart: number, spanEnd: number) => {
    // 시트 경계에 있는 재단은 스킵 (kerf 범위 내)
    if (axis === 'x' && (pos <= kerf / 2 || pos >= sheetW - kerf / 2)) return;
    if (axis === 'y' && (pos <= kerf / 2 || pos >= sheetH - kerf / 2)) return;

    // span이 유효한지 확인
    if (spanEnd <= spanStart) return;

    // 재단이 패널을 관통하면 스킵
    if (wouldCutThroughPanel(axis, pos, spanStart, spanEnd)) {
      return;
    }

    // 중복 체크 - axis와 pos만으로 체크 (같은 위치에 재단은 하나만)
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

  // L방향 우선 = 세로 재단(x) 우선, W방향 우선 = 가로 재단(y) 우선
  const preferVertical = optimizationType === 'BY_LENGTH';

  console.log('🔧 generateGuillotineCuts:', {
    optimizationType,
    preferVertical,
    panelCount: panels.length,
    sheetW,
    sheetH
  });

  // 모든 패널의 경계에서 재단선 생성
  interface CutCandidate {
    axis: 'x' | 'y';
    pos: number;
    spanStart: number;
    spanEnd: number;
  }
  const candidates: CutCandidate[] = [];

  // 각 패널의 4면 경계를 재단 후보로 수집
  panels.forEach((p, idx) => {
    console.log(`  패널 ${idx}: x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} w=${p.width.toFixed(1)} h=${p.height.toFixed(1)}`);

    // 세로 재단 (X 경계) - 좌측과 우측
    // 좌측 경계: x 위치에서 패널 높이만큼 재단
    candidates.push({ axis: 'x', pos: p.x, spanStart: p.y, spanEnd: p.y + p.height });
    // 우측 경계: x + width 위치에서 패널 높이만큼 재단
    candidates.push({ axis: 'x', pos: p.x + p.width, spanStart: p.y, spanEnd: p.y + p.height });

    // 가로 재단 (Y 경계) - 아래쪽과 위쪽
    // 아래쪽 경계: y 위치에서 패널 너비만큼 재단
    candidates.push({ axis: 'y', pos: p.y, spanStart: p.x, spanEnd: p.x + p.width });
    // 위쪽 경계: y + height 위치에서 패널 너비만큼 재단
    candidates.push({ axis: 'y', pos: p.y + p.height, spanStart: p.x, spanEnd: p.x + p.width });
  });

  console.log(`  후보 재단 수: ${candidates.length}`);

  // 같은 위치, 같은 방향의 재단은 span을 병합
  // positionMap: "axis-pos" -> { spans: [{ start, end }, ...] }
  const positionMap = new Map<string, { axis: 'x' | 'y'; pos: number; spans: { start: number; end: number }[] }>();

  candidates.forEach(c => {
    // 정수 단위로 반올림하여 같은 위치로 취급 (부동소수점 오차 방지)
    const roundedPos = Math.round(c.pos);
    const key = `${c.axis}-${roundedPos}`;
    const existing = positionMap.get(key);
    if (existing) {
      existing.spans.push({ start: c.spanStart, end: c.spanEnd });
    } else {
      positionMap.set(key, {
        axis: c.axis,
        pos: roundedPos, // 반올림된 값 사용
        spans: [{ start: c.spanStart, end: c.spanEnd }]
      });
    }
  });

  // span 병합 - 같은 위치의 모든 span을 하나로 합침 (기요틴 재단은 한 번에 전체 재단)
  positionMap.forEach((value) => {
    if (value.spans.length === 0) return;

    // 모든 span의 최소 시작점과 최대 끝점을 찾아 하나로 합침
    let minStart = value.spans[0].start;
    let maxEnd = value.spans[0].end;

    for (const span of value.spans) {
      minStart = Math.min(minStart, span.start);
      maxEnd = Math.max(maxEnd, span.end);
    }

    // 하나의 span으로 대체
    value.spans = [{ start: minStart, end: maxEnd }];
  });

  // 우선순위에 따라 정렬
  const sortedEntries = Array.from(positionMap.entries()).sort((a, b) => {
    const [, aVal] = a;
    const [, bVal] = b;

    if (preferVertical) {
      // 세로 재단(x) 먼저, 그 다음 가로 재단(y)
      if (aVal.axis !== bVal.axis) return aVal.axis === 'x' ? -1 : 1;
    } else {
      // 가로 재단(y) 먼저, 그 다음 세로 재단(x)
      if (aVal.axis !== bVal.axis) return aVal.axis === 'y' ? -1 : 1;
    }
    return aVal.pos - bVal.pos;
  });

  // 재단 생성 - 각 위치당 하나의 재단만 생성
  console.log(`  정렬된 위치 수: ${sortedEntries.length}`);
  for (const [key, value] of sortedEntries) {
    const span = value.spans[0]; // 병합되어 하나만 존재
    console.log(`  처리: ${key} span:${span.start.toFixed(1)}-${span.end.toFixed(1)}`);
    addCut(value.axis, value.pos, span.start, span.end);
  }

  console.log(`  최종 재단 수: ${cuts.length}`);

  // 중복 체크 - 같은 axis와 pos를 가진 재단이 있는지 확인
  const posCheck = new Map<string, number>();
  cuts.forEach(cut => {
    const key = `${cut.axis}-${Math.round(cut.pos)}`;
    posCheck.set(key, (posCheck.get(key) || 0) + 1);
  });
  const duplicates = Array.from(posCheck.entries()).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.warn('⚠️ 중복 재단 발견:', duplicates);
  }

  // 재단 순서 재정렬 (우선 방향 고려)
  cuts.sort((a, b) => {
    if (preferVertical) {
      if (a.axis !== b.axis) return a.axis === 'x' ? -1 : 1;
    } else {
      if (a.axis !== b.axis) return a.axis === 'y' ? -1 : 1;
    }
    return a.pos - b.pos;
  });

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
