/**
 * 길로틴 컷(Guillotine Cut) 최적화 알고리즘
 *
 * 실제 공장 컷쏘 재단 방식:
 *   1. 같은 높이(또는 너비) 패널끼리 그룹핑
 *   2. 그룹별로 스트립(행/열)을 만들어 한 줄로 쭉 배치
 *   3. 스트립 내 남는 공간에 같은 높이의 다른 패널 채움
 *
 * 핵심 원칙:
 *   - 같은 치수 패널끼리만 한 스트립에 배치 (모자이크/계단 패턴 방지)
 *   - 스트립 간 여백(kerf)만큼 간격 유지
 *   - 스트립 끝 남는 공간은 여유분으로 남김 (다른 치수 패널 혼합 금지)
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

      // 효율이 같으면 스트립 수가 적은 쪽 선택 (적은 컷 = 더 효율적 재단)
      // 스트립 수도 같으면 vertical 우선 (L방향 우선이 공장 기본)
      if (hEff > vEff) {
        bestResult = hResult;
        bestEfficiency = hEff;
      } else if (vEff > hEff) {
        bestResult = vResult;
        bestEfficiency = vEff;
      } else {
        // 효율 동일 → 스트립 수 비교
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
   * 스트립 기반 패킹 (같은 높이 그룹핑)
   *
   * horizontal=true (가로 스트립):
   *   시트를 가로로 잘라 행(row) 생성.
   *   같은 height 패널끼리 한 행에 배치.
   *
   * horizontal=false (세로 스트립):
   *   시트를 세로로 잘라 열(column) 생성.
   *   같은 width 패널끼리 한 열에 배치.
   */
  private packStrips(panels: Rect[], horizontal: boolean): Strip[] {
    const strips: Strip[] = [];

    console.log(`🔵 [guillotinePacking] packStrips 호출됨! horizontal=${horizontal}, panels=${panels.length}개`);
    console.log(`🔵 [guillotinePacking] binWidth=${this.binWidth}, binHeight=${this.binHeight}, kerf=${this.kerf}`);

    // 1단계: 스트립 방향 치수로 그룹핑 (같은 높이/너비끼리)
    const groups = new Map<number, Rect[]>();
    for (const panel of panels) {
      const dim = horizontal ? panel.height : panel.width;
      // 1mm 이내 차이는 같은 그룹으로 (부동소수점 대응)
      const roundedDim = Math.round(dim);
      if (!groups.has(roundedDim)) {
        groups.set(roundedDim, []);
      }
      groups.get(roundedDim)!.push(panel);
    }

    // 2단계: 그룹을 치수 내림차순으로 정렬 (큰 패널 먼저)
    const sortedDims = [...groups.keys()].sort((a, b) => b - a);

    console.log(`🔵 [guillotinePacking] 그룹 수: ${sortedDims.length}개`);
    sortedDims.forEach(d => {
      console.log(`   - 치수 ${d}mm: ${groups.get(d)!.length}개 패널`);
    });

    // 각 그룹 내에서 채우기 방향 치수 내림차순 정렬
    for (const [dim, groupPanels] of groups) {
      groupPanels.sort((a, b) => {
        const fillA = horizontal ? a.width : a.height;
        const fillB = horizontal ? b.width : b.height;
        return fillB - fillA;
      });
    }

    // 3단계: 그룹별로 스트립 생성
    let currentPos = 0;
    const maxPos = horizontal ? this.binHeight : this.binWidth;
    const fillMax = horizontal ? this.binWidth : this.binHeight;

    for (const dim of sortedDims) {
      const groupPanels = groups.get(dim)!;
      if (groupPanels.length === 0) continue;

      // 이 치수의 스트립이 시트에 들어가는지 확인
      if (currentPos + dim > maxPos) continue; // 안 들어가면 스킵

      // 같은 치수 패널들로 스트립을 채움
      // 하나의 스트립 폭을 넘으면 새 스트립 생성 (같은 치수)
      let fillPos = 0;
      let currentStrip: Strip = {
        x: horizontal ? 0 : currentPos,
        y: horizontal ? currentPos : 0,
        width: horizontal ? this.binWidth : dim,
        height: horizontal ? dim : this.binHeight,
        panels: [],
        horizontal
      };

      for (const panel of groupPanels) {
        const panelFillDim = horizontal ? panel.width : panel.height;

        if (fillPos + panelFillDim <= fillMax) {
          // 현재 스트립에 넣기
          const placed: PlacedRect = {
            ...panel,
            x: horizontal ? fillPos : currentPos,
            y: horizontal ? currentPos : fillPos,
            rotated: false,
            stripIndex: strips.length
          };
          currentStrip.panels.push(placed);
          fillPos += panelFillDim + this.kerf;
        } else {
          // 현재 스트립이 꽉 참 → 스트립 저장 후 새 스트립
          if (currentStrip.panels.length > 0) {
            strips.push(currentStrip);
            currentPos += dim + this.kerf;

            // 새 스트립 공간 확인
            if (currentPos + dim > maxPos) break; // 더 이상 공간 없음
          }

          fillPos = 0;
          currentStrip = {
            x: horizontal ? 0 : currentPos,
            y: horizontal ? currentPos : 0,
            width: horizontal ? this.binWidth : dim,
            height: horizontal ? dim : this.binHeight,
            panels: [],
            horizontal
          };

          if (fillPos + panelFillDim <= fillMax) {
            const placed: PlacedRect = {
              ...panel,
              x: horizontal ? fillPos : currentPos,
              y: horizontal ? currentPos : fillPos,
              rotated: false,
              stripIndex: strips.length
            };
            currentStrip.panels.push(placed);
            fillPos += panelFillDim + this.kerf;
          }
        }
      }

      // 마지막 스트립 저장
      if (currentStrip.panels.length > 0) {
        // ※ fillResidual 제거: 다른 치수 패널을 같은 스트립에 넣으면 계단 패턴 발생
        // 실제 공장에서는 같은 폭(또는 높이)으로 자른 스트립에 다른 치수 패널을 넣지 않음
        strips.push(currentStrip);
        currentPos += dim + this.kerf;
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

    console.log(`🔵 [guillotinePacking] getResult: ${this.strips.length}개 스트립`);
    this.strips.forEach((s, i) => {
      console.log(`   스트립${i}: pos=(${s.x},${s.y}), size=${s.width}x${s.height}, panels=${s.panels.length}개, horizontal=${s.horizontal}`);
      s.panels.forEach(p => {
        console.log(`     - ${p.name||p.id}: pos=(${p.x},${p.y}), size=${p.width}x${p.height}, rotated=${p.rotated}`);
      });
    });

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
  console.log(`🟢🟢🟢 [packGuillotine] 새 그룹핑 알고리즘 v2 호출됨! panels=${panels.length}, bin=${binWidth}x${binHeight}, kerf=${kerf}, direction=${stripDirection}`);
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
