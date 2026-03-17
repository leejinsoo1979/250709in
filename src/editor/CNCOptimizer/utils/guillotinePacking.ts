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
    let bestResult: Strip[];
    let bestEfficiency: number;

    if (stripDirection === 'horizontal') {
      bestResult = this.packStrips(panels, true);
      bestEfficiency = this.calculateEfficiency(bestResult);
    } else if (stripDirection === 'vertical') {
      bestResult = this.packStrips(panels, false);
      bestEfficiency = this.calculateEfficiency(bestResult);
    } else {
      const hResult = this.packStrips(panels, true);
      const hEff = this.calculateEfficiency(hResult);
      const vResult = this.packStrips(panels, false);
      const vEff = this.calculateEfficiency(vResult);

      if (hEff > vEff) {
        bestResult = hResult;
        bestEfficiency = hEff;
      } else if (vEff > hEff) {
        bestResult = vResult;
        bestEfficiency = vEff;
      } else {
        if (hResult.length < vResult.length) {
          bestResult = hResult;
          bestEfficiency = hEff;
        } else {
          bestResult = vResult;
          bestEfficiency = vEff;
        }
      }
    }

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
   * 잔여 공간에 미배치 패널 채우기 (길로틴 컷 유지)
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
      // 이 잔여 공간에 길로틴 방식으로 패널 배치
      // 잔여 공간 내에서도 스트립 방식 적용 (같은 방향)
      let fillPos = horizontal ? area.x : area.y;
      const areaFillMax = horizontal ? (area.x + area.width) : (area.y + area.height);
      const areaDimMax = horizontal ? area.height : area.width;

      for (const panel of unplaced) {
        if (placedIds.has(panel.id)) continue;

        // 원본 방향으로 시도
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
          // 가장 가까운 스트립에 추가
          const targetStrip = this.findStripForResidual(strips, area, horizontal);
          if (targetStrip) {
            targetStrip.panels.push(placed);
          } else {
            // 새 스트립 생성
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
          continue;
        }

        // 회전 시도 (grain이 없거나 NONE일 때만)
        // rotationLocked에 원본 치수가 있으면 → 이미 non-rotated로 배치된 것이므로 회전 금지
        const sizeKey = `${panel.width}×${panel.height}`;
        const isRotationLocked = rotationLocked?.has(sizeKey);
        if (!isRotationLocked && panel.canRotate !== false && (!panel.grain || panel.grain === 'NONE')) {
          const rotFill = horizontal ? panel.height : panel.width;
          const rotDim = horizontal ? panel.width : panel.height;

          if (rotDim <= areaDimMax && fillPos + rotFill <= areaFillMax) {
            const placed: PlacedRect = {
              ...panel,
              x: horizontal ? fillPos : area.x,
              y: horizontal ? area.y : fillPos,
              rotated: true,
              stripIndex: strips.length - 1
            };
            const targetStrip = this.findStripForResidual(strips, area, horizontal);
            if (targetStrip) {
              targetStrip.panels.push(placed);
            } else {
              strips.push({
                x: horizontal ? fillPos : area.x,
                y: horizontal ? area.y : fillPos,
                width: horizontal ? panel.height : rotDim,
                height: horizontal ? rotDim : panel.width,
                panels: [placed],
                horizontal
              });
            }
            placedIds.add(panel.id);
            fillPos += rotFill + this.kerf;
          }
        }
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
    rotationLocked?: Map<string, boolean>
  ): void {
    // 미배치 패널을 치수별로 그룹핑해서 스트립 생성
    let currentPos = startPos;
    const maxPos = horizontal ? this.binHeight : this.binWidth;

    // 치수별 그룹핑
    const groups = new Map<number, Rect[]>();
    for (const panel of unplaced) {
      if (placedIds.has(panel.id)) continue;
      const dim = horizontal ? panel.height : panel.width;
      const roundedDim = Math.round(dim);
      if (roundedDim > remainingDim) continue; // 남은 공간에 안 들어가면 스킵
      if (!groups.has(roundedDim)) {
        groups.set(roundedDim, []);
      }
      groups.get(roundedDim)!.push(panel);
    }

    // 회전 가능한 패널도 추가 시도
    for (const panel of unplaced) {
      if (placedIds.has(panel.id)) continue;
      if (panel.canRotate === false || (panel.grain && panel.grain !== 'NONE')) continue;
      // rotationLocked에 원본 치수가 있으면 회전 금지
      const sizeKeyBottom = `${panel.width}×${panel.height}`;
      if (rotationLocked?.has(sizeKeyBottom)) continue;
      const rotDim = horizontal ? panel.width : panel.height;
      const roundedRotDim = Math.round(rotDim);
      if (roundedRotDim > remainingDim) continue;
      // 원본 방향으로 이미 그룹에 들어간 경우 스킵
      const origDim = Math.round(horizontal ? panel.height : panel.width);
      if (groups.has(origDim) && groups.get(origDim)!.some(p => p.id === panel.id)) continue;
      // 회전 방향으로도 그룹에 추가 (별도 마킹)
      if (!groups.has(roundedRotDim)) {
        groups.set(roundedRotDim, []);
      }
      const existing = groups.get(roundedRotDim)!;
      if (!existing.some(p => p.id === panel.id)) {
        existing.push({ ...panel, _rotateHint: true } as any);
      }
    }

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
        const isRotateHint = (panel as any)._rotateHint === true;
        const panelFillDim = isRotateHint
          ? (horizontal ? panel.height : panel.width)
          : (horizontal ? panel.width : panel.height);

        if (fillPos + panelFillDim <= fillMax) {
          const placed: PlacedRect = {
            ...panel,
            x: horizontal ? fillPos : currentPos,
            y: horizontal ? currentPos : fillPos,
            rotated: isRotateHint,
            stripIndex: strips.length
          };
          // _rotateHint 제거
          delete (placed as any)._rotateHint;
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
 * 가구 무결성 검사: 같은 가구의 패널이 일부만 배치된 경우 해당 가구번호 반환
 * (같은 가구의 상부/하부 백패널이 분리되는 것을 방지)
 */
function detectSplitFurniture(allPanels: Rect[], placedIds: Set<string>): Set<number> {
  const furnitureStatus = new Map<number, { placed: number; unplaced: number }>();

  for (const p of allPanels) {
    const fn = extractFurnitureNum(p.name || '');
    if (fn === 0) continue; // 가구번호 없는 패널은 제외
    if (!furnitureStatus.has(fn)) furnitureStatus.set(fn, { placed: 0, unplaced: 0 });
    if (placedIds.has(p.id)) {
      furnitureStatus.get(fn)!.placed++;
    } else {
      furnitureStatus.get(fn)!.unplaced++;
    }
  }

  const splitSet = new Set<number>();
  for (const [fn, status] of furnitureStatus) {
    if (status.placed > 0 && status.unplaced > 0) {
      splitSet.add(fn);
    }
  }
  return splitSet;
}

/**
 * 길로틴 방식 멀티 빈 패킹
 */
export function packGuillotine(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 5,
  maxBins: number = 999,
  stripDirection: 'horizontal' | 'vertical' | 'auto' = 'auto'
): PackedBin[] {
  const bins: PackedBin[] = [];

  // ── 가구번호별 그룹핑: 같은 가구 패널은 반드시 같은 시트에 ──
  const furnitureGroups = new Map<number, Rect[]>();
  for (const panel of panels) {
    const fn = extractFurnitureNum(panel.name || '');
    if (!furnitureGroups.has(fn)) furnitureGroups.set(fn, []);
    furnitureGroups.get(fn)!.push(panel);
  }
  // 가구번호 순으로 정렬, 각 그룹 내에서 면적 내림차순
  const sortedFurnitureNums = [...furnitureGroups.keys()].sort((a, b) => a - b);
  for (const fn of sortedFurnitureNums) {
    furnitureGroups.get(fn)!.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  }

  // ── 가구 그룹 단위로 시트에 채우기 ──
  // 현재 시트에 누적할 패널 목록
  let currentSheetPanels: Rect[] = [];
  let currentSheetArea = 0;
  const sheetArea = binWidth * binHeight;
  // 무결성 체크에서 실패 경험 있는 가구는 분리 허용 (무한루프 방지)
  const splitExemptFurniture = new Set<number>();

  for (const fn of sortedFurnitureNums) {
    const group = furnitureGroups.get(fn)!;
    const groupArea = group.reduce((sum, p) => sum + p.width * p.height, 0);

    // 현재 시트에 이 가구 그룹을 추가해도 원장 면적 이내인지 (kerf 여유 포함)
    // 면적 기준 대략 체크 — 실제 배치 가능 여부는 패커가 결정
    if (currentSheetPanels.length > 0 && currentSheetArea + groupArea > sheetArea * 0.95) {
      // 현재 시트 패킹 실행 후 새 시트 시작
      const packer = new GuillotinePacker(binWidth, binHeight, kerf);
      const result = packer.packAll(currentSheetPanels, stripDirection);
      if (result.panels.length > 0) {
        // ── 가구 무결성 체크: 같은 가구의 패널이 분리되면 전부 다음 시트로 ──
        const placedIds = new Set(result.panels.map(p => p.id));
        const splitFurniture = detectSplitFurniture(currentSheetPanels, placedIds);
        // 면제된 가구 제외
        for (const efn of splitExemptFurniture) splitFurniture.delete(efn);
        if (splitFurniture.size > 0) {
          for (const sfn of splitFurniture) splitExemptFurniture.add(sfn);
          // 분리된 가구의 배치된 패널을 시트에서 제거
          result.panels = result.panels.filter(p => !splitFurniture.has(extractFurnitureNum(p.name || '')));
          // 효율 재계산
          result.usedArea = result.panels.reduce((sum, p) => sum + p.width * p.height, 0);
          result.efficiency = (result.usedArea / (binWidth * binHeight)) * 100;
        }
        if (result.panels.length > 0) {
          bins.push(result);
        }
        // 배치 안 된 패널 + 분리된 가구 패널은 다음 시트로
        const finalPlacedIds = new Set(result.panels.map(p => p.id));
        const unplaced = currentSheetPanels.filter(p => !finalPlacedIds.has(p.id));
        currentSheetPanels = [...unplaced, ...group];
        currentSheetArea = currentSheetPanels.reduce((sum, p) => sum + p.width * p.height, 0);
      } else {
        currentSheetPanels.push(...group);
        currentSheetArea += groupArea;
      }
    } else {
      currentSheetPanels.push(...group);
      currentSheetArea += groupArea;
    }
  }

  // 마지막 시트 패킹 (splitExemptFurniture는 위에서 선언됨 — 무한루프 방지)
  while (currentSheetPanels.length > 0 && bins.length < maxBins) {
    const packer = new GuillotinePacker(binWidth, binHeight, kerf);
    const result = packer.packAll(currentSheetPanels, stripDirection);

    if (result.panels.length === 0) {
      console.warn(`[packGuillotine] Cannot place ${currentSheetPanels.length} remaining panels`);
      break;
    }

    // ── 가구 무결성 체크 (면제된 가구 제외) ──
    const placedIds = new Set(result.panels.map(p => p.id));
    const splitFurniture = detectSplitFurniture(currentSheetPanels, placedIds);
    // 면제된 가구 제외
    for (const fn of splitExemptFurniture) splitFurniture.delete(fn);

    if (splitFurniture.size > 0) {
      // 이 가구들은 다음에 분리 허용
      for (const fn of splitFurniture) splitExemptFurniture.add(fn);
      result.panels = result.panels.filter(p => !splitFurniture.has(extractFurnitureNum(p.name || '')));
      result.usedArea = result.panels.reduce((sum, p) => sum + p.width * p.height, 0);
      result.efficiency = (result.usedArea / (binWidth * binHeight)) * 100;
    }

    const finalPlacedIds = new Set(result.panels.map(p => p.id));
    currentSheetPanels = currentSheetPanels.filter(p => !finalPlacedIds.has(p.id));
    if (result.panels.length > 0) {
      bins.push(result);
    }
  }

  // === 후처리: 저효율 시트의 패널을 다른 시트 빈 공간에 합치기 ===
  if (bins.length > 1) {
    backfillBins(bins, binWidth, binHeight, kerf);
  }

  return bins;
}

/**
 * 후처리: 저효율 시트의 패널을 다른 시트의 빈 공간에 합치기
 * - 같은 가구 패널 그룹핑을 유지하면서 이동
 * - 회전 상태는 원본 유지 (rotated 변경 금지)
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

    // 이 시트의 모든 패널을 다른 시트에 넣을 수 있는지 시도
    // 같은 가구의 패널은 같은 대상 시트로 이동해야 함
    const panelsToMove = [...srcBin.panels];
    const movedPanels: Rect[] = [];
    // 이동된 패널 임시 추적 (실패 시 롤백)
    const moveLog: { dstIdx: number; panel: Rect }[] = [];
    // 가구번호 → 대상 시트 인덱스 (같은 가구는 같은 시트로)
    const furnitureDstMap = new Map<number, number>();

    for (const panel of panelsToMove) {
      let placed = false;
      const fn = extractFurnitureNum(panel.name || '');
      const preferredDst = fn > 0 ? furnitureDstMap.get(fn) : undefined;

      // 같은 가구 패널이 이미 다른 시트에 갔으면 그 시트 우선 시도
      const dstOrder: number[] = [];
      if (preferredDst !== undefined) dstOrder.push(preferredDst);
      for (let i = 0; i < bins.length; i++) {
        if (i !== srcIdx && !removedBins.has(i) && i !== preferredDst) dstOrder.push(i);
      }

      for (const dstIdx of dstOrder) {
        const dstBin = bins[dstIdx];

        // canRotate=false인 패널(좌우측판)만 회전 금지, 백패널 등은 회전 허용
        const noRotate = panel.canRotate === false;
        const pos = findFreePosition(dstBin, panel, binWidth, binHeight, kerf, noRotate);
        if (pos) {
          const movedPanel = { ...panel, x: pos.x, y: pos.y, rotated: pos.rotated };
          dstBin.panels.push(movedPanel);
          dstBin.usedArea = (dstBin.usedArea || 0) + panel.width * panel.height;
          dstBin.efficiency = ((dstBin.usedArea || 0) / (binWidth * binHeight)) * 100;
          movedPanels.push(panel);
          moveLog.push({ dstIdx, panel: movedPanel });
          if (fn > 0) furnitureDstMap.set(fn, dstIdx);
          placed = true;
          break;
        }
      }

      if (!placed) {
        // 하나라도 못 옮기면 이 시트는 유지 → 이미 옮긴 패널 롤백
        for (const log of moveLog) {
          const dstBin = bins[log.dstIdx];
          const idx = dstBin.panels.indexOf(log.panel);
          if (idx !== -1) {
            dstBin.panels.splice(idx, 1);
            dstBin.usedArea = (dstBin.usedArea || 0) - log.panel.width * log.panel.height;
            dstBin.efficiency = ((dstBin.usedArea || 0) / (binWidth * binHeight)) * 100;
          }
        }
        movedPanels.length = 0;
        break;
      }
    }

    // 모든 패널을 옮겼으면 시트 제거
    if (movedPanels.length === panelsToMove.length) {
      removedBins.add(srcIdx);
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

  // 원본 방향 + 회전 방향 시도 (noRotate 시 원본 rotated 상태만 사용)
  const orientations: { w: number; h: number; rotated: boolean }[] = [];
  if (noRotate) {
    // 원본 rotated 상태 유지
    if (panel.rotated) {
      orientations.push({ w: panel.height, h: panel.width, rotated: true });
    } else {
      orientations.push({ w: panel.width, h: panel.height, rotated: false });
    }
  } else {
    orientations.push({ w: panel.width, h: panel.height, rotated: false });
    if (panel.canRotate !== false && (!panel.grain || panel.grain === 'NONE')) {
      orientations.push({ w: panel.height, h: panel.width, rotated: true });
    }
  }

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
