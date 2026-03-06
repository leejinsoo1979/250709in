/**
 * 길로틴 컷(Guillotine Cut) 최적화 알고리즘
 *
 * 실제 공장 컷쏘 재단 방식:
 *   1. 시트를 한 방향으로 쭉 잘라 스트립(행/열)을 만듦
 *   2. 각 스트립 안에서 반대 방향으로 잘라 개별 패널 분리
 *
 * 핵심 원칙:
 *   - 같은 높이(또는 너비) 패널끼리 한 스트립에 나란히 배치
 *   - 스트립 높이는 첫 번째(가장 큰) 패널 기준, 작은 패널도 같이 넣음
 *   - 스트립 내 빈 공간에는 더 작은 패널을 채워넣어 효율 극대화
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
   * 스트립 기반 패킹
   *
   * horizontal=true (가로 스트립):
   *   시트를 가로로 잘라 행(row) 생성. 행 높이 = 가장 큰 패널 높이.
   *   행 안에서 패널을 왼→오 순서로 배치.
   *
   * horizontal=false (세로 스트립):
   *   시트를 세로로 잘라 열(column) 생성. 열 너비 = 가장 큰 패널 너비.
   *   열 안에서 패널을 위→아래 순서로 배치.
   */
  private packStrips(panels: Rect[], horizontal: boolean): Strip[] {
    const strips: Strip[] = [];
    // 스트립 방향 기준 치수로 내림차순 정렬
    // 같은 치수면 반대 방향 치수도 내림차순
    const remaining = [...panels].sort((a, b) => {
      if (horizontal) {
        const hDiff = b.height - a.height;
        if (Math.abs(hDiff) > 1) return hDiff;
        return b.width - a.width;
      } else {
        const wDiff = b.width - a.width;
        if (Math.abs(wDiff) > 1) return wDiff;
        return b.height - a.height;
      }
    });

    let currentPos = 0;
    const maxPos = horizontal ? this.binHeight : this.binWidth;

    while (remaining.length > 0 && currentPos < maxPos) {
      // 첫 번째(가장 큰) 패널의 치수를 스트립 크기로 사용
      const firstPanel = remaining[0];
      const stripDim = horizontal ? firstPanel.height : firstPanel.width;

      // 공간 체크
      if (currentPos + stripDim > maxPos) {
        // 이 패널은 안 들어감 → 더 작은 패널 찾기
        const smallerIdx = remaining.findIndex(p => {
          const dim = horizontal ? p.height : p.width;
          return currentPos + dim <= maxPos;
        });
        if (smallerIdx === -1) break;
        // 더 작은 패널을 맨 앞으로 옮겨서 재시도
        const [smaller] = remaining.splice(smallerIdx, 1);
        remaining.unshift(smaller);
        continue;
      }

      // 스트립 생성
      const strip: Strip = {
        x: horizontal ? 0 : currentPos,
        y: horizontal ? currentPos : 0,
        width: horizontal ? this.binWidth : stripDim,
        height: horizontal ? stripDim : this.binHeight,
        panels: [],
        horizontal
      };

      // 스트립에 패널 채우기
      let fillPos = 0; // 채워진 길이 (가로면 X, 세로면 Y)
      const fillMax = horizontal ? this.binWidth : this.binHeight;
      const toRemove: number[] = [];

      for (let i = 0; i < remaining.length; i++) {
        if (toRemove.includes(i)) continue;

        const panel = remaining[i];
        const panelStripDim = horizontal ? panel.height : panel.width; // 스트립 방향 치수
        const panelFillDim = horizontal ? panel.width : panel.height; // 채우기 방향 치수

        // 스트립 치수 이하이고, 채우기 방향으로 공간이 있으면 배치
        if (panelStripDim <= stripDim && fillPos + panelFillDim <= fillMax) {
          const placed: PlacedRect = {
            ...panel,
            x: horizontal ? fillPos : currentPos,
            y: horizontal ? currentPos : fillPos,
            rotated: false,
            stripIndex: strips.length
          };
          strip.panels.push(placed);
          fillPos += panelFillDim + this.kerf;
          toRemove.push(i);
        }
        // 회전해서 들어가는지
        else if (panel.canRotate) {
          const rotStripDim = horizontal ? panel.width : panel.height;
          const rotFillDim = horizontal ? panel.height : panel.width;
          if (rotStripDim <= stripDim && fillPos + rotFillDim <= fillMax) {
            const placed: PlacedRect = {
              ...panel,
              x: horizontal ? fillPos : currentPos,
              y: horizontal ? currentPos : fillPos,
              rotated: true,
              stripIndex: strips.length
            };
            strip.panels.push(placed);
            fillPos += rotFillDim + this.kerf;
            toRemove.push(i);
          }
        }
      }

      // 배치된 패널 제거 (역순)
      for (let i = toRemove.length - 1; i >= 0; i--) {
        remaining.splice(toRemove[i], 1);
      }

      if (strip.panels.length > 0) {
        strips.push(strip);
        currentPos += stripDim + this.kerf;
      } else {
        // 아무것도 못 넣었으면 첫 번째 패널 건너뛰기 (무한루프 방지)
        remaining.shift();
      }
    }

    return strips;
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
