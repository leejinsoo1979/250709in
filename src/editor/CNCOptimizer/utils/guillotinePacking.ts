/**
 * 길로틴 컷(Guillotine Cut) 최적화 알고리즘
 * 같은 크기 패널을 그룹화하여 정돈된 스트립(선반)으로 배치
 * 실제 컷쏘 작업 방식을 반영한 최적화
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

/** 같은 크기끼리 묶은 그룹 */
interface SizeGroup {
  width: number;
  height: number;
  panels: Rect[];
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

  /**
   * 길로틴 방식으로 패널 배치
   */
  packAll(panels: Rect[], stripDirection: 'horizontal' | 'vertical' | 'auto' = 'auto'): PackedBin {
    let bestResult: Strip[];
    let bestEfficiency: number;

    if (stripDirection === 'horizontal') {
      bestResult = this.packShelves(panels, true);
      bestEfficiency = this.calculateEfficiency(bestResult);
    } else if (stripDirection === 'vertical') {
      bestResult = this.packShelves(panels, false);
      bestEfficiency = this.calculateEfficiency(bestResult);
    } else {
      // auto: 가로/세로 모두 시도하여 효율 높은 것 선택
      const hResult = this.packShelves(panels, true);
      const hEff = this.calculateEfficiency(hResult);

      const vResult = this.packShelves(panels, false);
      const vEff = this.calculateEfficiency(vResult);

      if (hEff >= vEff) {
        bestResult = hResult;
        bestEfficiency = hEff;
      } else {
        bestResult = vResult;
        bestEfficiency = vEff;
      }
    }

    this.strips = bestResult;
    this.bestLayout = { strips: bestResult, efficiency: bestEfficiency };

    return this.getResult();
  }

  /**
   * 선반(Shelf) 기반 정돈된 패킹
   * 1. 동일 크기 패널끼리 그룹화
   * 2. 각 그룹을 하나의 선반(스트립)에 일렬로 배치
   * 3. 선반들을 위에서 아래(가로) 또는 왼쪽에서 오른쪽(세로)으로 쌓기
   */
  private packShelves(panels: Rect[], horizontal: boolean): Strip[] {
    const strips: Strip[] = [];

    // 1단계: 동일 크기끼리 그룹화
    const groups = this.groupBySize(panels);

    // 2단계: 그룹을 선반 방향에 맞게 정렬
    //   가로 선반: 높이가 큰 그룹 먼저 (위→아래로 쌓으므로 큰 높이 먼저)
    //   세로 선반: 너비가 큰 그룹 먼저 (왼→오로 쌓으므로 큰 너비 먼저)
    this.sortGroups(groups, horizontal);

    // 3단계: 각 그룹을 선반으로 변환하여 배치
    let currentPos = 0; // 가로면 Y축, 세로면 X축 위치
    const maxPos = horizontal ? this.binHeight : this.binWidth;

    for (const group of groups) {
      if (group.panels.length === 0) continue;

      // 이 그룹의 패널들로 선반 생성
      const newStrips = this.createShelvesFromGroup(group, currentPos, horizontal, maxPos);

      for (const strip of newStrips) {
        if (strip.panels.length === 0) continue;
        strips.push(strip);

        // 다음 선반 위치 업데이트
        if (horizontal) {
          const stripEnd = strip.y + strip.height + this.kerf;
          if (stripEnd > currentPos) currentPos = stripEnd;
        } else {
          const stripEnd = strip.x + strip.width + this.kerf;
          if (stripEnd > currentPos) currentPos = stripEnd;
        }
      }

      if (currentPos >= maxPos) break;
    }

    return strips;
  }

  /**
   * 동일 크기 패널끼리 그룹화
   * 1mm 이내 차이는 동일 크기로 취급
   */
  private groupBySize(panels: Rect[]): SizeGroup[] {
    const groups: SizeGroup[] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < panels.length; i++) {
      if (assigned.has(i)) continue;

      const base = panels[i];
      const group: SizeGroup = {
        width: base.width,
        height: base.height,
        panels: [base]
      };
      assigned.add(i);

      // 같은 크기 패널 찾기 (1mm 이내)
      for (let j = i + 1; j < panels.length; j++) {
        if (assigned.has(j)) continue;
        const other = panels[j];

        if (Math.abs(other.width - base.width) <= 1 &&
            Math.abs(other.height - base.height) <= 1) {
          group.panels.push(other);
          assigned.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * 그룹 정렬: 선반 방향 기준 치수 내림차순
   * 같은 치수면 패널 수가 많은 그룹 먼저 (한 줄 가득 채우기 유리)
   */
  private sortGroups(groups: SizeGroup[], horizontal: boolean): void {
    groups.sort((a, b) => {
      if (horizontal) {
        // 가로 선반: 높이가 큰 것 먼저 → 같으면 개수 많은 것 먼저
        const hDiff = b.height - a.height;
        if (Math.abs(hDiff) > 1) return hDiff;
        return b.panels.length - a.panels.length;
      } else {
        // 세로 선반: 너비가 큰 것 먼저 → 같으면 개수 많은 것 먼저
        const wDiff = b.width - a.width;
        if (Math.abs(wDiff) > 1) return wDiff;
        return b.panels.length - a.panels.length;
      }
    });
  }

  /**
   * 하나의 크기 그룹에서 선반(들) 생성
   * 한 줄에 안 들어가면 같은 높이의 다음 줄로 이어서 배치
   */
  private createShelvesFromGroup(
    group: SizeGroup,
    startPos: number,
    horizontal: boolean,
    maxPos: number
  ): Strip[] {
    const strips: Strip[] = [];
    const remaining = [...group.panels];
    let currentPos = startPos;

    while (remaining.length > 0 && currentPos < maxPos) {
      if (horizontal) {
        // 가로 선반: 높이 = 그룹 높이, 패널을 왼→오로 배치
        const shelfHeight = group.height;

        // 공간 체크
        if (currentPos + shelfHeight > this.binHeight) break;

        const strip: Strip = {
          x: 0,
          y: currentPos,
          width: this.binWidth,
          height: shelfHeight,
          panels: [],
          horizontal: true
        };

        let currentX = 0;
        const toRemove: number[] = [];

        for (let i = 0; i < remaining.length; i++) {
          const panel = remaining[i];
          const panelW = panel.width;

          // 이 패널이 현재 X 위치에 들어가는지 체크
          if (currentX + panelW <= this.binWidth) {
            const placed: PlacedRect = {
              ...panel,
              x: currentX,
              y: currentPos,
              rotated: false,
              stripIndex: this.strips.length + strips.length
            };
            strip.panels.push(placed);
            currentX += panelW + this.kerf;
            toRemove.push(i);
          }
        }

        // 배치된 패널 제거 (역순으로)
        for (let i = toRemove.length - 1; i >= 0; i--) {
          remaining.splice(toRemove[i], 1);
        }

        if (strip.panels.length > 0) {
          strips.push(strip);
          currentPos += shelfHeight + this.kerf;
        } else {
          break; // 더 이상 배치 불가
        }
      } else {
        // 세로 선반: 너비 = 그룹 너비, 패널을 위→아래로 배치
        const shelfWidth = group.width;

        // 공간 체크
        if (currentPos + shelfWidth > this.binWidth) break;

        const strip: Strip = {
          x: currentPos,
          y: 0,
          width: shelfWidth,
          height: this.binHeight,
          panels: [],
          horizontal: false
        };

        let currentY = 0;
        const toRemove: number[] = [];

        for (let i = 0; i < remaining.length; i++) {
          const panel = remaining[i];
          const panelH = panel.height;

          if (currentY + panelH <= this.binHeight) {
            const placed: PlacedRect = {
              ...panel,
              x: currentPos,
              y: currentY,
              rotated: false,
              stripIndex: this.strips.length + strips.length
            };
            strip.panels.push(placed);
            currentY += panelH + this.kerf;
            toRemove.push(i);
          }
        }

        for (let i = toRemove.length - 1; i >= 0; i--) {
          remaining.splice(toRemove[i], 1);
        }

        if (strip.panels.length > 0) {
          strips.push(strip);
          currentPos += shelfWidth + this.kerf;
        } else {
          break;
        }
      }
    }

    return strips;
  }

  /**
   * 레이아웃 효율 계산
   */
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

  /**
   * 패킹 결과 반환 (검증 포함)
   */
  getResult(): PackedBin {
    const panels: Rect[] = [];
    let usedArea = 0;
    const placedIds = new Set<string>();
    const placedRects: { x: number; y: number; w: number; h: number }[] = [];

    for (const strip of this.strips) {
      for (const panel of strip.panels) {
        // 중복 방지
        const panelKey = `${panel.id}-${panel.x}-${panel.y}`;
        if (placedIds.has(panelKey)) continue;
        placedIds.add(panelKey);

        const finalPanel = { ...panel };

        // 좌표 음수 방지
        if (finalPanel.x < 0) finalPanel.x = 0;
        if (finalPanel.y < 0) finalPanel.y = 0;

        // 빈 경계 초과 체크
        const actualW = finalPanel.rotated ? finalPanel.height : finalPanel.width;
        const actualH = finalPanel.rotated ? finalPanel.width : finalPanel.height;

        if (finalPanel.x + actualW > this.binWidth + 0.5) continue;
        if (finalPanel.y + actualH > this.binHeight + 0.5) continue;

        // 겹침 감지
        const newRect = { x: finalPanel.x, y: finalPanel.y, w: actualW, h: actualH };
        const overlaps = placedRects.some(r => {
          const margin = 0.5;
          return newRect.x < r.x + r.w - margin &&
                 newRect.x + newRect.w > r.x + margin &&
                 newRect.y < r.y + r.h - margin &&
                 newRect.y + newRect.h > r.y + margin;
        });

        if (overlaps) continue;

        placedRects.push(newRect);
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
  let currentBin = 0;
  const remainingPanels = [...panels];

  while (remainingPanels.length > 0 && currentBin < maxBins) {
    const packer = new GuillotinePacker(binWidth, binHeight, kerf);
    const result = packer.packAll(remainingPanels, stripDirection);

    if (result.panels.length === 0) {
      console.warn(`[packGuillotine] Cannot place ${remainingPanels.length} remaining panels`);
      break;
    }

    // 배치된 패널 제거
    for (const placedPanel of result.panels) {
      const index = remainingPanels.findIndex(p =>
        p.id === placedPanel.id &&
        p.width === placedPanel.width &&
        p.height === placedPanel.height
      );
      if (index !== -1) {
        remainingPanels.splice(index, 1);
      }
    }

    bins.push(result);
    currentBin++;
  }

  return bins;
}
