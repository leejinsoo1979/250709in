import type { CutStep, CutAxis, WorkPiece } from '@/types/cutlist';

interface PanelPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated?: boolean;
}

interface Strip {
  x: number;
  y: number;
  width: number;
  height: number;
  panels: PanelPlacement[];
}

/**
 * 패널들을 스트립으로 그룹화
 * W방향 우선 (horizontal=true): 가로 스트립으로 그룹화 (같은 y 위치의 패널들)
 * L방향 우선 (horizontal=false): 세로 스트립으로 그룹화 (같은 x 위치의 패널들)
 */
function groupPanelsIntoStrips(
  panels: PanelPlacement[],
  sheetW: number,
  sheetH: number,
  kerf: number,
  horizontal: boolean
): Strip[] {
  if (panels.length === 0) return [];

  const tolerance = kerf * 2;
  const strips: Strip[] = [];
  const usedPanels = new Set<string>();

  // 패널들을 위치별로 정렬
  const sortedPanels = [...panels].sort((a, b) => {
    if (horizontal) {
      // 가로 스트립: y 위치로 정렬, 그 다음 x 위치
      return a.y !== b.y ? a.y - b.y : a.x - b.x;
    } else {
      // 세로 스트립: x 위치로 정렬, 그 다음 y 위치
      return a.x !== b.x ? a.x - b.x : a.y - b.y;
    }
  });

  for (const panel of sortedPanels) {
    if (usedPanels.has(panel.id)) continue;

    // 이 패널과 같은 스트립에 속하는 패널들 찾기
    const stripPanels: PanelPlacement[] = [panel];
    usedPanels.add(panel.id);

    if (horizontal) {
      // 가로 스트립: 비슷한 y 위치의 패널들
      for (const other of sortedPanels) {
        if (usedPanels.has(other.id)) continue;

        // 같은 높이 행에 있는지 확인 (y 범위가 겹치는지)
        const panelTop = panel.y;
        const panelBottom = panel.y + panel.height;
        const otherTop = other.y;
        const otherBottom = other.y + other.height;

        // y 범위가 상당 부분 겹치면 같은 스트립
        const overlapStart = Math.max(panelTop, otherTop);
        const overlapEnd = Math.min(panelBottom, otherBottom);
        const overlap = overlapEnd - overlapStart;
        const minHeight = Math.min(panel.height, other.height);

        if (overlap > minHeight * 0.5) {
          stripPanels.push(other);
          usedPanels.add(other.id);
        }
      }
    } else {
      // 세로 스트립: 비슷한 x 위치의 패널들
      for (const other of sortedPanels) {
        if (usedPanels.has(other.id)) continue;

        // 같은 너비 열에 있는지 확인 (x 범위가 겹치는지)
        const panelLeft = panel.x;
        const panelRight = panel.x + panel.width;
        const otherLeft = other.x;
        const otherRight = other.x + other.width;

        // x 범위가 상당 부분 겹치면 같은 스트립
        const overlapStart = Math.max(panelLeft, otherLeft);
        const overlapEnd = Math.min(panelRight, otherRight);
        const overlap = overlapEnd - overlapStart;
        const minWidth = Math.min(panel.width, other.width);

        if (overlap > minWidth * 0.5) {
          stripPanels.push(other);
          usedPanels.add(other.id);
        }
      }
    }

    // 스트립 경계 계산
    const minX = Math.min(...stripPanels.map(p => p.x));
    const minY = Math.min(...stripPanels.map(p => p.y));
    const maxX = Math.max(...stripPanels.map(p => p.x + p.width));
    const maxY = Math.max(...stripPanels.map(p => p.y + p.height));

    strips.push({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      panels: stripPanels
    });
  }

  return strips;
}

/**
 * Generate hierarchical guillotine cuts for an entire sheet
 * 계층적 기요틴 재단: 먼저 큰 스트립을 분리하고, 각 스트립 내에서 패널 분리
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

  // BY_WIDTH = W방향 우선 = 가로선(y축)을 먼저 재단하여 가로 스트립으로 분리
  // BY_LENGTH = L방향 우선 = 세로선(x축)을 먼저 재단하여 세로 스트립으로 분리
  const horizontal = optimizationType === 'BY_WIDTH';

  console.log(`🔪 generateGuillotineCuts: ${optimizationType}, horizontal=${horizontal}`);

  // 이미 추가된 재단 위치 추적 (중복 방지)
  const addedCuts = new Set<string>();

  // 재단 추가 함수
  const addCut = (axis: 'x' | 'y', pos: number, spanStart: number, spanEnd: number) => {
    // 시트 가장자리 재단 제외
    if (axis === 'x' && (pos <= kerf || pos >= sheetW - kerf)) return;
    if (axis === 'y' && (pos <= kerf || pos >= sheetH - kerf)) return;

    // span이 유효한지 확인
    if (spanEnd <= spanStart + kerf) return;

    // 중복 체크 (위치와 범위 모두 체크)
    const key = `${axis}-${Math.round(pos)}-${Math.round(spanStart)}-${Math.round(spanEnd)}`;
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
      // axis 'y' = 가로선 = W방향 재단, axis 'x' = 세로선 = L방향 재단
      label: axis === 'y' ? `W방향 재단 #${cuts.length + 1}` : `L방향 재단 #${cuts.length + 1}`,
      source: 'derived'
    });
  };

  // 패널들을 스트립으로 그룹화
  const strips = groupPanelsIntoStrips(panels, sheetW, sheetH, kerf, horizontal);

  console.log(`📦 Found ${strips.length} strips:`, strips.map(s => ({
    x: s.x, y: s.y, w: s.width, h: s.height, panels: s.panels.length
  })));

  if (horizontal) {
    // W방향 우선: 가로선으로 스트립 분리 먼저, 그 다음 각 스트립 내 세로선

    // 1단계: 스트립 분리를 위한 가로선 (y축 재단)
    // 스트립을 y 위치순으로 정렬
    const sortedStrips = [...strips].sort((a, b) => a.y - b.y);

    for (let i = 0; i < sortedStrips.length; i++) {
      const strip = sortedStrips[i];

      // 스트립 하단 경계 (다음 스트립과의 분리)
      if (strip.y > kerf) {
        addCut('y', strip.y, 0, sheetW);
      }

      // 마지막 스트립의 상단 경계
      if (strip.y + strip.height < sheetH - kerf) {
        addCut('y', strip.y + strip.height, 0, sheetW);
      }
    }

    // 2단계: 각 스트립 내에서 패널 분리를 위한 세로선 (x축 재단)
    for (const strip of sortedStrips) {
      // 스트립 내 패널들을 x 위치순으로 정렬
      const sortedPanels = [...strip.panels].sort((a, b) => a.x - b.x);

      for (const panel of sortedPanels) {
        // 패널 왼쪽 경계 (스트립 범위 내에서만)
        if (panel.x > kerf && panel.x > strip.x) {
          addCut('x', panel.x, strip.y, strip.y + strip.height);
        }

        // 패널 오른쪽 경계 (스트립 범위 내에서만)
        if (panel.x + panel.width < sheetW - kerf && panel.x + panel.width < strip.x + strip.width) {
          addCut('x', panel.x + panel.width, strip.y, strip.y + strip.height);
        }
      }
    }
  } else {
    // L방향 우선: 세로선으로 스트립 분리 먼저, 그 다음 각 스트립 내 가로선

    // 1단계: 스트립 분리를 위한 세로선 (x축 재단)
    // 스트립을 x 위치순으로 정렬
    const sortedStrips = [...strips].sort((a, b) => a.x - b.x);

    for (let i = 0; i < sortedStrips.length; i++) {
      const strip = sortedStrips[i];

      // 스트립 왼쪽 경계 (다음 스트립과의 분리)
      if (strip.x > kerf) {
        addCut('x', strip.x, 0, sheetH);
      }

      // 마지막 스트립의 오른쪽 경계
      if (strip.x + strip.width < sheetW - kerf) {
        addCut('x', strip.x + strip.width, 0, sheetH);
      }
    }

    // 2단계: 각 스트립 내에서 패널 분리를 위한 가로선 (y축 재단)
    for (const strip of sortedStrips) {
      // 스트립 내 패널들을 y 위치순으로 정렬
      const sortedPanels = [...strip.panels].sort((a, b) => a.y - b.y);

      for (const panel of sortedPanels) {
        // 패널 하단 경계 (스트립 범위 내에서만)
        if (panel.y > kerf && panel.y > strip.y) {
          addCut('y', panel.y, strip.x, strip.x + strip.width);
        }

        // 패널 상단 경계 (스트립 범위 내에서만)
        if (panel.y + panel.height < sheetH - kerf && panel.y + panel.height < strip.y + strip.height) {
          addCut('y', panel.y + panel.height, strip.x, strip.x + strip.width);
        }
      }
    }
  }

  // order 재설정 및 라벨 업데이트
  cuts.forEach((cut, idx) => {
    cut.order = idx;
    cut.id = `cut-${idx}`;
    cut.label = cut.axis === 'y' ? `W방향 재단 #${idx + 1}` : `L방향 재단 #${idx + 1}`;
  });

  console.log(`✂️ Generated ${cuts.length} cuts:`, cuts.map(c => ({
    order: c.order,
    axis: c.axis,
    pos: c.pos,
    span: `${c.spanStart}-${c.spanEnd}`,
    label: c.label
  })));

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
    // 재단 길이 계산 (spanStart에서 spanEnd까지)
    const cutLength = Math.abs((cut.spanEnd || 0) - (cut.spanStart || 0));
    // 재단 시간 계산 (ms)
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
        // 재단 완료
        onCutComplete(currentCutIndex);
        currentCutIndex++;

        // 다음 재단으로 이동 (약간의 딜레이)
        if (currentCutIndex < cuts.length) {
          setTimeout(animateCut, 100);
        } else {
          onDone();
        }
      }
    };

    requestAnimationFrame(animate);
  };

  // 시작
  animateCut();
}
