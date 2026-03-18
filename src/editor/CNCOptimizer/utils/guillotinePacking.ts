/**
 * 길로틴 컷(Guillotine Cut) 최적화 알고리즘
 *
 * 실제 공장 컷쏘 재단 방식:
 *   1. 같은 높이(또는 너비) 패널끼리 그룹핑
 *   2. 그룹별로 스트립(행/열)을 만들어 한 줄로 쭉 배치
 *   3. 스트립 끝 남는 공간에 작은 패널 채움 (잔여 공간 활용)
 *
 * 핵심 원칙:
 *   - 같은 치수 패널끼리 우선 한 스트립에 배치
 *   - 스트립 간 여백(kerf)만큼 간격 유지
 *   - 스트립 옆 잔여 공간에 다른 치수 패널 배치 가능 (길로틴 컷 유지)
 */

import { Rect, PackedBin } from './simpleBinPacking';

interface Strip {
  x: number;
  y: number;
  width: number;
  height: number;
  panels: PlacedRect[];
  horizontal: boolean;
}

interface PlacedRect extends Rect {
  stripIndex?: number;
}

/** 잔여 공간 영역 */
interface ResidualArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class GuillotinePacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private strips: Strip[] = [];
  private bestLayout: { strips: Strip[], efficiency: number } | null = null;

  constructor(width: number, height: number, kerf: number = 5) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
  }

  packAll(panels: Rect[], stripDirection: 'horizontal' | 'vertical' | 'auto' = 'auto'): PackedBin {
    // horizontal: height로 그룹핑, width를 x축(W방향)에 배치
    // vertical: width로 그룹핑, height를 y축(L방향)에 배치 — 측판용
    const isHorizontal = stripDirection !== 'vertical';
    const bestResult = this.packStrips(panels, isHorizontal);
    const bestEfficiency = this.calculateEfficiency(bestResult);

    this.strips = bestResult;
    this.bestLayout = { strips: bestResult, efficiency: bestEfficiency };
    return this.getResult();
  }

  /**
   * 스트립 기반 패킹 (같은 높이 그룹핑) + 잔여 공간 활용
   */
  private packStrips(panels: Rect[], horizontal: boolean): Strip[] {
    const strips: Strip[] = [];

    // 회전 일관성: 같은 원본 치수(w×h)의 패널은 모두 같은 rotated 상태로 유지
    // 메인 스트립에서 non-rotated로 배치된 치수는 잔여/하단에서도 회전 금지
    const rotationLocked = new Map<string, boolean>(); // "w×h" → false(회전금지)

    // 1단계: 스트립 방향 치수로 그룹핑 (같은 높이/너비끼리)
    const groups = new Map<number, Rect[]>();
    for (const panel of panels) {
      const dim = horizontal ? panel.height : panel.width;
      const roundedDim = Math.round(dim);
      if (!groups.has(roundedDim)) {
        groups.set(roundedDim, []);
      }
      groups.get(roundedDim)!.push(panel);
    }

    // 2단계: 그룹을 치수 내림차순으로 정렬 (큰 패널 먼저)
    const sortedDims = [...groups.keys()].sort((a, b) => b - a);

    // 각 그룹 내에서 정렬: 가구번호 → 패널 종류(좌/우) → 채우기 치수
    // 같은 가구의 측판이 같은 시트에 연속 배치되도록 가구번호 우선
    for (const [, groupPanels] of groups) {
      groupPanels.sort((a, b) => {
        // 1순위: 가구번호 — 같은 가구 패널끼리 묶기
        const fnA = this.extractFurnitureNumber(a.name || '');
        const fnB = this.extractFurnitureNumber(b.name || '');
        if (fnA !== fnB) return fnA - fnB;

        // 2순위: 패널 종류 — 같은 좌/우 끼리 묶기 (보링 효율)
        const sideA = this.extractPanelSide(a.name || '');
        const sideB = this.extractPanelSide(b.name || '');
        if (sideA !== sideB) return sideA.localeCompare(sideB);

        // 3순위: 채우기 방향 치수 내림차순
        const fillA = horizontal ? a.width : a.height;
        const fillB = horizontal ? b.width : b.height;
        return fillB - fillA;
      });
    }

    // 3단계: 라운드 로빈으로 스트립 생성
    // 각 치수 그룹에서 한 스트립씩만 만들고 다음 치수 그룹으로 순환
    // → 같은 가구의 서로 다른 치수 패널이 같은 시트에 배치됨
    // 예: (하)백패널(600높이) 스트립 → (상)백패널(564높이) 스트립 → 같은 시트
    let currentPos = 0;
    const maxPos = horizontal ? this.binHeight : this.binWidth;
    const fillMax = horizontal ? this.binWidth : this.binHeight;

    // 배치된 패널 ID 추적
    const placedPanelIds = new Set<string>();
    // 잔여 공간 목록 (스트립 옆 빈 공간)
    const residualAreas: ResidualArea[] = [];

    // 각 치수 그룹의 다음 배치 인덱스 추적
    const groupNextIndex = new Map<number, number>();
    for (const dim of sortedDims) {
      groupNextIndex.set(dim, 0);
    }

    // 라운드 로빈: 모든 그룹이 소진될 때까지 반복
    let anyPlaced = true;
    while (anyPlaced) {
      anyPlaced = false;

      for (const dim of sortedDims) {
        const groupPanels = groups.get(dim)!;
        const startIdx = groupNextIndex.get(dim)!;

        // 이 그룹에서 아직 배치 안 된 패널 찾기
        let hasUnplaced = false;
        for (let i = startIdx; i < groupPanels.length; i++) {
          if (!placedPanelIds.has(groupPanels[i].id)) {
            hasUnplaced = true;
            break;
          }
        }
        if (!hasUnplaced) continue;

        // 이 치수의 스트립이 시트에 들어가는지 확인
        if (currentPos + dim > maxPos) continue;

        // 한 스트립분만 채우기
        let fillPos = 0;
        const currentStrip: Strip = {
          x: horizontal ? 0 : currentPos,
          y: horizontal ? currentPos : 0,
          width: horizontal ? this.binWidth : dim,
          height: horizontal ? dim : this.binHeight,
          panels: [],
          horizontal
        };

        for (let i = startIdx; i < groupPanels.length; i++) {
          const panel = groupPanels[i];
          if (placedPanelIds.has(panel.id)) continue;
          const panelFillDim = horizontal ? panel.width : panel.height;

          if (fillPos + panelFillDim <= fillMax) {
            const placed: PlacedRect = {
              ...panel,
              x: horizontal ? fillPos : currentPos,
              y: horizontal ? currentPos : fillPos,
              rotated: false,
              stripIndex: strips.length
            };
            currentStrip.panels.push(placed);
            placedPanelIds.add(panel.id);
            fillPos += panelFillDim + this.kerf;
            const sizeKey = `${panel.width}×${panel.height}`;
            rotationLocked.set(sizeKey, false);
          } else {
            // 스트립 꽉 참 → 이 그룹의 나머지는 다음 라운드에서
            groupNextIndex.set(dim, i);
            break;
          }
        }

        // 스트립 저장
        if (currentStrip.panels.length > 0) {
          if (fillPos < fillMax) {
            residualAreas.push(this.calcResidual(currentStrip, fillPos, horizontal, dim));
          }
          strips.push(currentStrip);
          currentPos += dim + this.kerf;
          anyPlaced = true;
        }
      }
    }

    // 4단계: 잔여 공간에 미배치 패널 채우기
    // 모든 패널 중 아직 배치되지 않은 것들을 면적 내림차순으로
    const allUnplaced = panels
      .filter(p => !placedPanelIds.has(p.id))
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));

    if (allUnplaced.length > 0 && residualAreas.length > 0) {
      this.fillResidualAreas(strips, allUnplaced, residualAreas, placedPanelIds, horizontal, rotationLocked);
    }

    // 5단계: 시트 하단 잔여 공간 활용 (스트립 아래 남은 전체 영역)
    if (currentPos < maxPos) {
      const bottomRemaining = maxPos - currentPos;
      const bottomFillMax = fillMax;
      const bottomUnplaced = panels
        .filter(p => !placedPanelIds.has(p.id))
        .sort((a, b) => (b.width * b.height) - (a.width * a.height));

      if (bottomUnplaced.length > 0 && bottomRemaining > 0) {
        this.fillBottomArea(strips, bottomUnplaced, currentPos, bottomRemaining, bottomFillMax, placedPanelIds, horizontal, rotationLocked);
      }
    }

    return strips;
  }

  /**
   * 스트립 옆 잔여 공간 계산
   */
  private calcResidual(strip: Strip, fillPos: number, horizontal: boolean, stripDim: number): ResidualArea {
    if (horizontal) {
      return {
        x: fillPos,
        y: strip.y,
        width: this.binWidth - fillPos,
        height: stripDim
      };
    } else {
      return {
        x: strip.x,
        y: fillPos,
        width: stripDim,
        height: this.binHeight - fillPos
      };
    }
  }

  /**
   * 잔여 공간에 미배치 패널 채우기 (길로틴 컷 유지, 회전 금지)
   */
  private fillResidualAreas(
    strips: Strip[],
    unplaced: Rect[],
    residualAreas: ResidualArea[],
    placedIds: Set<string>,
    horizontal: boolean,
    rotationLocked?: Map<string, boolean>
  ): void {
    // 잔여 공간을 면적 내림차순 정렬 (큰 공간부터)
    residualAreas.sort((a, b) => (b.width * b.height) - (a.width * a.height));

    for (const area of residualAreas) {
      let fillPos = horizontal ? area.x : area.y;
      const areaFillMax = horizontal ? (area.x + area.width) : (area.y + area.height);
      const areaDimMax = horizontal ? area.height : area.width;

      for (const panel of unplaced) {
        if (placedIds.has(panel.id)) continue;

        // 원본 방향으로만 시도 (회전 절대 금지)
        const panelFill = horizontal ? panel.width : panel.height;
        const panelDim = horizontal ? panel.height : panel.width;

        if (panelDim <= areaDimMax && fillPos + panelFill <= areaFillMax) {
          const placed: PlacedRect = {
            ...panel,
            x: horizontal ? fillPos : area.x,
            y: horizontal ? area.y : fillPos,
            rotated: false,
            stripIndex: strips.length - 1
          };
          const targetStrip = this.findStripForResidual(strips, area, horizontal);
          if (targetStrip) {
            targetStrip.panels.push(placed);
          } else {
            strips.push({
              x: horizontal ? fillPos : area.x,
              y: horizontal ? area.y : fillPos,
              width: horizontal ? panel.width : panelDim,
              height: horizontal ? panelDim : panel.height,
              panels: [placed],
              horizontal
            });
          }
          placedIds.add(panel.id);
          fillPos += panelFill + this.kerf;
        }
        // 회전 시도 제거 — 모든 패널 회전 금지
      }
    }
  }

  /**
   * 잔여 공간이 속한 스트립 찾기
   */
  private findStripForResidual(strips: Strip[], area: ResidualArea, horizontal: boolean): Strip | null {
    for (const strip of strips) {
      if (horizontal) {
        // 같은 y 위치의 스트립
        if (Math.abs(strip.y - area.y) < 1) return strip;
      } else {
        // 같은 x 위치의 스트립
        if (Math.abs(strip.x - area.x) < 1) return strip;
      }
    }
    return null;
  }

  /**
   * 시트 하단(또는 우측) 잔여 공간에 패널 배치
   */
  private fillBottomArea(
    strips: Strip[],
    unplaced: Rect[],
    startPos: number,
    remainingDim: number,
    fillMax: number,
    placedIds: Set<string>,
    horizontal: boolean,
    _rotationLocked?: Map<string, boolean>
  ): void {
    // 미배치 패널을 치수별로 그룹핑해서 스트립 생성 (회전 금지)
    let currentPos = startPos;
    const maxPos = horizontal ? this.binHeight : this.binWidth;

    // 치수별 그룹핑 (원본 방향만)
    const groups = new Map<number, Rect[]>();
    for (const panel of unplaced) {
      if (placedIds.has(panel.id)) continue;
      const dim = horizontal ? panel.height : panel.width;
      const roundedDim = Math.round(dim);
      if (roundedDim > remainingDim) continue;
      if (!groups.has(roundedDim)) {
        groups.set(roundedDim, []);
      }
      groups.get(roundedDim)!.push(panel);
    }
    // 회전 시도 제거 — 모든 패널 회전 금지

    const sortedDims = [...groups.keys()].sort((a, b) => b - a);

    for (const dim of sortedDims) {
      const groupPanels = groups.get(dim)!;
      if (groupPanels.length === 0) continue;
      if (currentPos + dim > maxPos) continue;

      let fillPos = 0;
      const currentStrip: Strip = {
        x: horizontal ? 0 : currentPos,
        y: horizontal ? currentPos : 0,
        width: horizontal ? this.binWidth : dim,
        height: horizontal ? dim : this.binHeight,
        panels: [],
        horizontal
      };

      for (const panel of groupPanels) {
        if (placedIds.has(panel.id)) continue;
        const panelFillDim = horizontal ? panel.width : panel.height;

        if (fillPos + panelFillDim <= fillMax) {
          const placed: PlacedRect = {
            ...panel,
            x: horizontal ? fillPos : currentPos,
            y: horizontal ? currentPos : fillPos,
            rotated: false,
            stripIndex: strips.length
          };
          currentStrip.panels.push(placed);
          placedIds.add(panel.id);
          fillPos += panelFillDim + this.kerf;
        }
      }

      if (currentStrip.panels.length > 0) {
        strips.push(currentStrip);
        currentPos += dim + this.kerf;
      }
    }
  }

  /**
   * 패널 이름에서 좌/우 종류 추출 (보링 쌍 맞추기용)
   * 예: "[3]듀얼 2단서랍+옷장 (상)우측" → "우측"
   */
  private extractPanelSide(name: string): string {
    // (상)좌측, (하)우측, 좌측판, 우측판 등에서 좌/우 추출
    const match = name.match(/(좌측|우측|좌측판|우측판)/);
    return match ? match[1] : '';
  }

  /**
   * 패널 이름에서 가구 번호 추출
   * 예: "[3]듀얼 2단서랍+옷장 (상)우측" → 3
   */
  private extractFurnitureNumber(name: string): number {
    const match = name.match(/^\[(\d+)\]/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private calculateEfficiency(strips: Strip[]): number {
    let usedArea = 0;
    for (const strip of strips) {
      for (const panel of strip.panels) {
        usedArea += panel.width * panel.height;
      }
    }
    const totalArea = this.binWidth * this.binHeight;
    return totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
  }

  getResult(): PackedBin {
    const panels: Rect[] = [];
    let usedArea = 0;
    const placedIds = new Set<string>();
    const placedRects: { x: number; y: number; w: number; h: number }[] = [];

    for (const strip of this.strips) {
      for (const panel of strip.panels) {
        const panelKey = `${panel.id}-${panel.x}-${panel.y}`;
        if (placedIds.has(panelKey)) continue;
        placedIds.add(panelKey);

        const finalPanel = { ...panel };
        if (finalPanel.x! < 0) finalPanel.x = 0;
        if (finalPanel.y! < 0) finalPanel.y = 0;

        const actualW = finalPanel.rotated ? finalPanel.height : finalPanel.width;
        const actualH = finalPanel.rotated ? finalPanel.width : finalPanel.height;

        if (finalPanel.x! + actualW > this.binWidth + 0.5) continue;
        if (finalPanel.y! + actualH > this.binHeight + 0.5) continue;

        // 겹침 감지
        const nr = { x: finalPanel.x!, y: finalPanel.y!, w: actualW, h: actualH };
        const overlaps = placedRects.some(r => {
          const m = 0.5;
          return nr.x < r.x + r.w - m && nr.x + nr.w > r.x + m &&
                 nr.y < r.y + r.h - m && nr.y + nr.h > r.y + m;
        });
        if (overlaps) continue;

        placedRects.push(nr);
        panels.push(finalPanel);
        usedArea += finalPanel.width * finalPanel.height;
      }
    }

    return {
      width: this.binWidth,
      height: this.binHeight,
      panels,
      efficiency: this.bestLayout?.efficiency || 0,
      usedArea
    };
  }
}

/** 패널 이름에서 가구번호 추출 (예: "[3]듀얼..." → 3) */
function extractFurnitureNum(name: string): number {
  const match = name.match(/^\[(\d+)\]/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 패널 카테고리 분류 — 같은 카테고리끼리만 같은 시트에 배치
 *
 * 카테고리 (우선순위 = 큰 패널부터 재단):
 *   1. side    — 측판 (좌측/우측, 서랍·백패널 제외)
 *   2. back    — 백패널 (같은 width끼리 strip에 나란히)
 *   3. body    — 상판/하판/선반/칸막이/바닥판/서랍 등 본체 패널
 *   4. frame   — 상부프레임/하부프레임 (맨 마지막 재단)
 */
function getPanelCategory(name: string): 'side' | 'back' | 'body' | 'frame' {
  if (!name) return 'body';
  // 프레임 판별 (최하위 우선순위)
  if (name.includes('프레임') || name.includes('프래임')) return 'frame';
  // 백패널 판별 (측판보다 먼저! '백패널'이 포함되면 무조건 back)
  if (name.includes('백패널')) return 'back';
  // 측판 판별 (서랍 제외)
  if (!name.includes('서랍')) {
    if (name.includes('좌측판') || name.includes('우측판') ||
        name.includes('좌측') || name.includes('우측')) return 'side';
  }
  // 나머지: 상판, 하판, 선반, 칸막이, 바닥판, 서랍 패널 등
  return 'body';
}

// packBySizeGroups 제거 — packCategoryToMultiBins으로 대체

/**
 * 패널 이름에서 종류 키를 추출 (같은 종류끼리 같은 방향 강제용)
 * 예: "[1]듀얼 2단 옷장 (상)백패널" → "백패널"
 *     "[1]듀얼 2단 옷장 좌측판" → "좌측판"
 */
function extractPanelTypeKey(name: string): string {
  if (!name) return '';
  // 가구번호와 모델명 제거 후 핵심 패널 종류만 추출
  const types = ['백패널', '좌측판', '우측판', '상판', '바닥', '선반', '칸막이',
    '상부프레임', '하부프레임', '상부프래임', '하부프래임', '후면 보강대',
    '서랍앞판', '서랍뒷판', '서랍좌측', '서랍우측', '서랍바닥', '도어'];
  for (const t of types) {
    if (name.includes(t)) return t;
  }
  return name;
}

/**
 * 개별 패널 방향 정규화: width > binWidth이면 해당 패널만 스왑
 */
function normalizeOrientation(panels: Rect[], binWidth: number): Rect[] {
  return panels.map(panel => {
    if (panel.width > binWidth && panel.height <= binWidth) {
      return { ...panel, width: panel.height, height: panel.width, rotated: true };
    }
    return { ...panel, rotated: false };
  });
}

/**
 * 백패널 전용 방향 정규화
 * - 같은 가구의 (상)(하) 백패널은 동일한 width(내경폭+10)
 * - 가구별로 묶어서, 해당 가구의 width > binWidth이면 그 가구 전체를 스왑
 * - 일부만 스왑하면 vertical에서 다른 그룹이 되어 분리되므로, 가구 단위 통일
 */
function normalizeBackPanels(panels: Rect[], binWidth: number): Rect[] {
  if (panels.length === 0) return [];

  // 가구번호별 그룹
  const byFurniture = new Map<number, Rect[]>();
  for (const p of panels) {
    const fn = extractFurnitureNum(p.name || '');
    if (!byFurniture.has(fn)) byFurniture.set(fn, []);
    byFurniture.get(fn)!.push(p);
  }

  const result: Rect[] = [];
  for (const [, group] of byFurniture) {
    // 이 가구의 백패널 width (모두 동일해야 함)
    const w = group[0].width;
    if (w > binWidth) {
      // 전체 스왑 — 모든 패널을 같은 방향으로
      for (const p of group) {
        result.push({ ...p, width: p.height, height: p.width, rotated: true });
      }
    } else {
      // 스왑 불필요 — 원본 방향 유지
      for (const p of group) {
        result.push({ ...p, rotated: false });
      }
    }
  }
  return result;
}

/**
 * 카테고리 패널을 멀티 시트로 패킹 (단순 반복)
 * GuillotinePacker에 통째로 넘기고, 배치 안 된 패널은 새 시트에 반복
 */
function packCategoryToMultiBins(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number,
  direction: 'horizontal' | 'vertical'
): PackedBin[] {
  if (panels.length === 0) return [];

  const bins: PackedBin[] = [];
  // 면적 내림차순 정렬 (큰 패널 먼저)
  let remaining = [...panels].sort((a, b) => (b.width * b.height) - (a.width * a.height));

  while (remaining.length > 0) {
    const packer = new GuillotinePacker(binWidth, binHeight, kerf);
    const result = packer.packAll(remaining, direction);
    if (result.panels.length === 0) break; // 더 이상 배치 불가
    bins.push(result);
    const placedIds = new Set(result.panels.map(p => p.id));
    remaining = remaining.filter(p => !placedIds.has(p.id));
  }

  return bins;
}

/**
 * 백패널 전용 멀티 시트 패킹 — 같은 가구의 (상)+(하) 백패널 반드시 같은 시트
 *
 * 핵심 원칙:
 *   - 같은 가구의 백패널은 절대 분리하지 않음
 *   - 가구 최대 크기 1200×2400, 원장 1220×2440 → 한 가구의 백패널은 항상 한 시트에 수용 가능
 *   - 여러 가구의 백패널을 같은 시트에 합칠 수 있으면 합침 (효율 향상)
 */
/**
 * 백패널 전용 멀티 시트 패킹 — 같은 가구의 (상)+(하) 백패널 반드시 같은 시트
 *
 * GuillotinePacker를 쓰지 않고 직접 배치:
 *   - vertical 방향: 스트립 width = 패널의 width (x축), 패널의 height가 y축으로 쌓임
 *   - 같은 가구의 백패널을 한 스트립에 y축으로 연속 배치
 *   - 스트립 width는 해당 가구 백패널 중 가장 큰 width 사용
 *   - 시트 x축(1220)에 여러 스트립이 들어가면 합침
 */
function packBackPanelsToMultiBins(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number
): PackedBin[] {
  if (panels.length === 0) return [];

  // 1단계: 가구번호별 그룹핑
  const byFurniture = new Map<number, Rect[]>();
  for (const p of panels) {
    const fn = extractFurnitureNum(p.name || '');
    if (!byFurniture.has(fn)) byFurniture.set(fn, []);
    byFurniture.get(fn)!.push(p);
  }

  // 2단계: 가구별 스트립 정보 계산
  interface FurnitureStrip {
    fn: number;
    panels: Rect[];
    stripWidth: number;   // 스트립이 차지하는 x축 폭 (= max panel.width)
    totalFillH: number;   // y축 총 높이 (패널 heights + kerfs)
  }

  const furnitureStrips: FurnitureStrip[] = [];
  for (const [fn, group] of byFurniture) {
    const stripWidth = Math.max(...group.map(p => p.width));
    // y축으로 쌓이는 높이: 큰 패널 먼저 (상부 → 하부)
    group.sort((a, b) => b.height - a.height);
    const totalFillH = group.reduce((sum, p) => sum + p.height, 0) + (group.length - 1) * kerf;
    furnitureStrips.push({ fn, panels: group, stripWidth, totalFillH });
  }

  // 총면적 내림차순 정렬 (큰 가구 먼저)
  furnitureStrips.sort((a, b) => {
    const areaA = a.panels.reduce((s, p) => s + p.width * p.height, 0);
    const areaB = b.panels.reduce((s, p) => s + p.width * p.height, 0);
    return areaB - areaA;
  });

  // 3단계: 시트에 배치 — 가구 스트립을 x축으로 나란히 배치
  const bins: PackedBin[] = [];
  const packed = new Set<number>(); // packed furniture indices

  for (let i = 0; i < furnitureStrips.length; i++) {
    if (packed.has(i)) continue;

    // 이 시트에 배치할 가구 스트립들 모으기
    const sheetStrips: FurnitureStrip[] = [furnitureStrips[i]];
    packed.add(i);
    let usedX = furnitureStrips[i].stripWidth;

    // 남은 x 공간에 다른 가구 스트립 넣을 수 있는지 시도
    for (let j = i + 1; j < furnitureStrips.length; j++) {
      if (packed.has(j)) continue;
      const needed = usedX + kerf + furnitureStrips[j].stripWidth;
      if (needed <= binWidth && furnitureStrips[j].totalFillH <= binHeight) {
        sheetStrips.push(furnitureStrips[j]);
        packed.add(j);
        usedX = needed;
      }
    }

    // 시트 내 패널 좌표 계산
    const placedPanels: Rect[] = [];
    let xPos = 0;

    for (const strip of sheetStrips) {
      let yPos = 0;
      for (const panel of strip.panels) {
        placedPanels.push({
          ...panel,
          x: xPos,
          y: yPos,
          rotated: false
        });
        yPos += panel.height + kerf;
      }
      xPos += strip.stripWidth + kerf;
    }

    // PackedBin 생성
    const usedArea = placedPanels.reduce((s, p) => s + p.width * p.height, 0);
    const totalArea = binWidth * binHeight;
    bins.push({
      width: binWidth,
      height: binHeight,
      panels: placedPanels,
      efficiency: (usedArea / totalArea) * 100,
      usedArea
    });
  }

  return bins;
}

/**
 * 길로틴 방식 멀티 빈 패킹
 *
 * 핵심 원칙:
 *   1. 측판 / 본체 / 프레임 — 카테고리별로 시트 분리
 *   2. 측판: vertical (같은 width끼리 한 줄, 상하 대칭)
 *   3. 본체/프레임: horizontal (width → x축=W방향)
 *   4. 큰 패널부터 먼저 재단, 프레임은 맨 마지막
 */
export function packGuillotine(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 5,
  maxBins: number = 999,
  stripDirection: 'horizontal' | 'vertical' | 'auto' = 'auto'
): PackedBin[] {
  // ── 0단계: 카테고리 분류 (normalizeOrientation 전에!) ──
  const sidePanelsRaw: Rect[] = [];
  const backPanelsRaw: Rect[] = [];
  const bodyPanelsRaw: Rect[] = [];
  const framePanelsRaw: Rect[] = [];
  for (const panel of panels) {
    const cat = getPanelCategory(panel.name || '');
    if (cat === 'side') sidePanelsRaw.push(panel);
    else if (cat === 'back') backPanelsRaw.push(panel);
    else if (cat === 'frame') framePanelsRaw.push(panel);
    else bodyPanelsRaw.push(panel);
  }

  // ── 1단계: 카테고리별 방향 정규화 ──
  // 측판/본체/프레임: width > binWidth이면 개별 스왑
  const sidePanels = normalizeOrientation(sidePanelsRaw, binWidth);
  const bodyPanels = normalizeOrientation(bodyPanelsRaw, binWidth);
  const framePanels = normalizeOrientation(framePanelsRaw, binWidth);
  // 백패널: 같은 가구의 (상)(하)는 동일 width → vertical에서 같은 스트립에 나란히
  // width > binWidth인 경우만 전체를 같은 방향으로 스왑 (일부만 스왑하면 분리됨)
  const backPanels = normalizeBackPanels(backPanelsRaw, binWidth);

  // ── 2단계: 카테고리별 패킹 ──
  // 측판: vertical (같은 width끼리 한 줄)
  const sideBins = packCategoryToMultiBins(sidePanels, binWidth, binHeight, kerf, 'vertical');
  // 백패널: 가구별 그룹 패킹 — 같은 가구의 (상)+(하) 백패널은 반드시 같은 시트
  const backBins = packBackPanelsToMultiBins(backPanels, binWidth, binHeight, kerf);
  // 본체(상판/하판/선반 등): horizontal
  const bodyBins = packCategoryToMultiBins(bodyPanels, binWidth, binHeight, kerf, 'horizontal');
  // 프레임: horizontal (맨 마지막)
  const frameBins = packCategoryToMultiBins(framePanels, binWidth, binHeight, kerf, 'horizontal');

  // 순서: 측판 → 백패널 → 본체 → 프레임
  return [...sideBins, ...backBins, ...bodyBins, ...frameBins];
}

/**
 * 후처리: 저효율 시트의 패널을 다른 시트의 빈 공간에 합치기
 * 핵심 원칙: 같은 가구의 패널은 절대 분리하지 않음
 * - 시트 단위로만 합침 (시트의 모든 패널이 하나의 대상 시트에 들어가야 함)
 * - 회전 금지 (canRotate=false)
 * - 빈 시트가 되면 제거
 */
function backfillBins(bins: PackedBin[], binWidth: number, binHeight: number, kerf: number): void {
  // 효율 낮은 시트부터 처리 (낮은 효율 → 높은 효율)
  const binIndices = bins.map((_, i) => i);
  binIndices.sort((a, b) => (bins[a].efficiency || 0) - (bins[b].efficiency || 0));

  const removedBins = new Set<number>();

  for (const srcIdx of binIndices) {
    if (removedBins.has(srcIdx)) continue;
    const srcBin = bins[srcIdx];
    if (!srcBin.panels || srcBin.panels.length === 0) continue;

    // 이 시트의 모든 패널을 하나의 대상 시트에 넣을 수 있는지 시도
    // (같은 가구 패널 분리 방지: 시트 전체를 하나의 대상으로만 이동)
    const panelsToMove = [...srcBin.panels];

    for (let dstIdx = 0; dstIdx < bins.length; dstIdx++) {
      if (dstIdx === srcIdx || removedBins.has(dstIdx)) continue;

      // 이 대상 시트에 srcBin의 모든 패널이 들어가는지 시도
      const dstBin = bins[dstIdx];
      const moveLog: { panel: Rect }[] = [];
      let allFit = true;

      for (const panel of panelsToMove) {
        const pos = findFreePosition(dstBin, panel, binWidth, binHeight, kerf, true);
        if (pos) {
          const movedPanel = { ...panel, x: pos.x, y: pos.y, rotated: pos.rotated };
          dstBin.panels.push(movedPanel);
          dstBin.usedArea = (dstBin.usedArea || 0) + panel.width * panel.height;
          moveLog.push({ panel: movedPanel });
        } else {
          allFit = false;
          break;
        }
      }

      if (allFit) {
        // 모든 패널이 하나의 대상 시트에 들어감 → 원본 시트 제거
        dstBin.efficiency = ((dstBin.usedArea || 0) / (binWidth * binHeight)) * 100;
        removedBins.add(srcIdx);
        break;
      } else {
        // 롤백: 이미 추가한 패널 제거
        for (const log of moveLog) {
          const idx = dstBin.panels.indexOf(log.panel);
          if (idx !== -1) {
            dstBin.panels.splice(idx, 1);
            dstBin.usedArea = (dstBin.usedArea || 0) - log.panel.width * log.panel.height;
          }
        }
        dstBin.efficiency = ((dstBin.usedArea || 0) / (binWidth * binHeight)) * 100;
      }
    }
  }

  // 빈 시트 제거 (뒤에서부터)
  const toRemove = [...removedBins].sort((a, b) => b - a);
  for (const idx of toRemove) {
    bins.splice(idx, 1);
  }
}

/**
 * 시트의 빈 공간에 패널이 들어갈 위치 찾기
 */
function findFreePosition(
  bin: PackedBin,
  panel: Rect,
  binWidth: number,
  binHeight: number,
  kerf: number,
  noRotate: boolean = false
): { x: number; y: number; rotated: boolean } | null {
  const placed = (bin.panels || []).map(p => ({
    x: p.x || 0,
    y: p.y || 0,
    w: p.rotated ? p.height : p.width,
    h: p.rotated ? p.width : p.height
  }));

  // 후보 위치 생성 — 더 많은 후보를 생성하여 빈 공간 활용도 향상
  const candidateSet = new Set<string>();
  const candidates: { x: number; y: number }[] = [];
  const addCandidate = (x: number, y: number) => {
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (!candidateSet.has(key) && x >= 0 && y >= 0 && x < binWidth && y < binHeight) {
      candidateSet.add(key);
      candidates.push({ x, y });
    }
  };
  addCandidate(0, 0);
  for (const r of placed) {
    addCandidate(r.x + r.w + kerf, r.y);              // 우측
    addCandidate(r.x, r.y + r.h + kerf);              // 상단
    addCandidate(r.x + r.w + kerf, r.y + r.h + kerf); // 대각
    addCandidate(r.x + r.w + kerf, 0);                // 우측 바닥
    addCandidate(0, r.y + r.h + kerf);                // 좌측 위
  }

  // 회전 절대 금지 — 항상 원본 방향(width=W, height=L)으로만 배치
  const orientations: { w: number; h: number; rotated: boolean }[] = [
    { w: panel.width, h: panel.height, rotated: false }
  ];

  // 후보 위치를 좌하단 우선 정렬
  candidates.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

  for (const { w, h, rotated } of orientations) {
    for (const { x, y } of candidates) {
      if (x + w > binWidth + 0.5 || y + h > binHeight + 0.5) continue;
      if (x < 0 || y < 0) continue;

      // 겹침 확인
      const margin = 0.5;
      const overlaps = placed.some(r =>
        x < r.x + r.w - margin && x + w > r.x + margin &&
        y < r.y + r.h - margin && y + h > r.y + margin
      );
      if (!overlaps) {
        return { x, y, rotated };
      }
    }
  }

  return null;
}
