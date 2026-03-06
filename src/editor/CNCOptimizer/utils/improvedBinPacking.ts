/**
 * 개선된 2D 빈 패킹 알고리즘 - MaxRects 방식
 * 자재 효율 + 재단 길이 최소화를 동시에 고려
 *
 * 핵심 개선:
 *   - 패널 배치 시 기존 패널/시트 엣지와 겹치는 위치를 우선 선택
 *   - 엣지가 정렬되면 컷 라인이 공유되어 총 재단 길이 감소
 */

import { Rect, PackedBin } from './simpleBinPacking';

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class MaxRectsPacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private freeRects: FreeRect[] = [];
  private placedPanels: Rect[] = [];

  constructor(width: number, height: number, kerf: number = 5) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
    // 초기에는 전체 빈이 하나의 자유 공간
    this.freeRects = [{
      x: 0,
      y: 0,
      width: width,
      height: height
    }];
  }

  /**
   * 엣지 정렬 점수 계산
   * 새 패널의 엣지가 기존 패널 또는 시트 엣지와 얼마나 겹치는지 계산
   * 높을수록 컷 라인을 더 많이 공유 → 재단 길이 감소
   */
  private calculateAlignmentScore(x: number, y: number, w: number, h: number): number {
    let score = 0;
    const tol = 1; // 1mm 허용

    // 시트 엣지와 정렬 (시트 경계는 컷 불필요)
    if (x < tol) score += h;                              // 좌측 시트 엣지
    if (y < tol) score += w;                              // 하단 시트 엣지
    if (Math.abs(x + w - this.binWidth) < tol) score += h;  // 우측 시트 엣지
    if (Math.abs(y + h - this.binHeight) < tol) score += w; // 상단 시트 엣지

    // 기존 배치된 패널 엣지와 정렬
    for (const placed of this.placedPanels) {
      const pw = placed.rotated ? placed.height : placed.width;
      const ph = placed.rotated ? placed.width : placed.height;
      const px = placed.x!;
      const py = placed.y!;

      // 수직 엣지 정렬 (같은 X 위치 → 세로 컷 라인 공유)
      const xEdges = [x, x + w];
      const pxEdges = [px, px + pw];
      for (const xe of xEdges) {
        for (const pxe of pxEdges) {
          if (Math.abs(xe - pxe) < tol) {
            // Y 방향 겹침 구간 계산
            const overlapStart = Math.max(y, py);
            const overlapEnd = Math.min(y + h, py + ph);
            if (overlapEnd > overlapStart) {
              score += (overlapEnd - overlapStart);
            }
          }
        }
      }

      // 수평 엣지 정렬 (같은 Y 위치 → 가로 컷 라인 공유)
      const yEdges = [y, y + h];
      const pyEdges = [py, py + ph];
      for (const ye of yEdges) {
        for (const pye of pyEdges) {
          if (Math.abs(ye - pye) < tol) {
            // X 방향 겹침 구간 계산
            const overlapStart = Math.max(x, px);
            const overlapEnd = Math.min(x + w, px + pw);
            if (overlapEnd > overlapStart) {
              score += (overlapEnd - overlapStart);
            }
          }
        }
      }
    }

    return score;
  }

  /**
   * Best Area Fit + 엣지 정렬 최적화로 패널 배치
   * 1차: 자재 효율 (areaFit - 낮을수록 좋음)
   * 2차: 재단 길이 최소화 (alignmentScore - 높을수록 좋음)
   * 3차: 짧은 변 낭비 최소화 (shortSideFit - 낮을수록 좋음)
   */
  pack(panel: Rect): Rect | null {
    let bestAreaFit = Infinity;
    let bestAlignScore = -1;
    let bestShortSideFit = Infinity;
    let bestFreeRect: FreeRect | null = null;
    let bestRotated = false;
    let bestFitIndex = -1;

    // 모든 자유 공간에 대해 시도
    for (let i = 0; i < this.freeRects.length; i++) {
      const freeRect = this.freeRects[i];

      // 원래 방향으로 맞는지 확인
      if (panel.width + this.kerf <= freeRect.width &&
          panel.height + this.kerf <= freeRect.height) {
        const leftoverX = freeRect.width - panel.width - this.kerf;
        const leftoverY = freeRect.height - panel.height - this.kerf;
        const areaFit = freeRect.width * freeRect.height - panel.width * panel.height;
        const shortSideFit = Math.min(leftoverX, leftoverY);
        const alignScore = this.calculateAlignmentScore(
          freeRect.x, freeRect.y, panel.width, panel.height
        );

        if (this.isBetterFit(areaFit, alignScore, shortSideFit,
                              bestAreaFit, bestAlignScore, bestShortSideFit)) {
          bestAreaFit = areaFit;
          bestAlignScore = alignScore;
          bestShortSideFit = shortSideFit;
          bestFreeRect = freeRect;
          bestRotated = false;
          bestFitIndex = i;
        }
      }

      // 회전 가능하면 회전해서도 시도
      if (panel.canRotate !== false) {
        if (panel.height + this.kerf <= freeRect.width &&
            panel.width + this.kerf <= freeRect.height) {
          const leftoverX = freeRect.width - panel.height - this.kerf;
          const leftoverY = freeRect.height - panel.width - this.kerf;
          const areaFit = freeRect.width * freeRect.height - panel.width * panel.height;
          const shortSideFit = Math.min(leftoverX, leftoverY);
          const alignScore = this.calculateAlignmentScore(
            freeRect.x, freeRect.y, panel.height, panel.width
          );

          if (this.isBetterFit(areaFit, alignScore, shortSideFit,
                                bestAreaFit, bestAlignScore, bestShortSideFit)) {
            bestAreaFit = areaFit;
            bestAlignScore = alignScore;
            bestShortSideFit = shortSideFit;
            bestFreeRect = freeRect;
            bestRotated = true;
            bestFitIndex = i;
          }
        }
      }
    }

    // 최적 위치에 배치
    if (bestFreeRect && bestFitIndex >= 0) {
      const actualWidth = bestRotated ? panel.height : panel.width;
      const actualHeight = bestRotated ? panel.width : panel.height;

      const placed: Rect = {
        ...panel,
        x: bestFreeRect.x,
        y: bestFreeRect.y,
        width: panel.width,
        height: panel.height,
        rotated: bestRotated
      };

      this.placedPanels.push(placed);

      // 자유 공간 업데이트 - 표준 MaxRects 방식
      const placedRect: FreeRect = {
        x: bestFreeRect.x,
        y: bestFreeRect.y,
        width: actualWidth + this.kerf,
        height: actualHeight + this.kerf
      };

      this.splitAllFreeRects(placedRect);
      this.pruneFreeRects();

      return placed;
    }

    return null;
  }

  /**
   * 배치 후보 비교
   * 1차: areaFit (낮을수록 좋음) — 자재 효율
   * 2차: alignScore (높을수록 좋음) — 재단 길이 절감
   * 3차: shortSideFit (낮을수록 좋음) — 잔여 공간 최소화
   *
   * areaFit이 비슷하면 (20% 이내) alignScore로 판단
   */
  private isBetterFit(
    areaFit: number, alignScore: number, shortSideFit: number,
    bestAreaFit: number, bestAlignScore: number, bestShortSideFit: number
  ): boolean {
    // 첫 번째 후보
    if (bestAreaFit === Infinity) return true;

    // areaFit이 확실히 더 좋으면 (20% 이상 차이) 무조건 선택
    const areaDiff = areaFit - bestAreaFit;
    const areaThreshold = bestAreaFit * 0.2;

    if (areaDiff < -areaThreshold) return true;   // 확실히 더 좋은 면적
    if (areaDiff > areaThreshold) return false;    // 확실히 더 나쁜 면적

    // 면적이 비슷하면 (±20%) → 엣지 정렬 점수로 판단 (재단 길이)
    if (alignScore > bestAlignScore + 10) return true;   // 재단 라인 공유 더 많음
    if (alignScore < bestAlignScore - 10) return false;

    // 정렬 점수도 비슷하면 → areaFit 정밀 비교
    if (areaFit < bestAreaFit) return true;
    if (areaFit > bestAreaFit) return false;

    // areaFit도 같으면 → shortSideFit
    return shortSideFit < bestShortSideFit;
  }

  /**
   * 두 사각형이 겹치는지 확인
   */
  private rectsIntersect(a: FreeRect, b: FreeRect): boolean {
    return !(a.x >= b.x + b.width ||
             a.x + a.width <= b.x ||
             a.y >= b.y + b.height ||
             a.y + a.height <= b.y);
  }

  /**
   * 표준 MaxRects 알고리즘 - 모든 자유 공간에 대해 배치된 영역과 겹치는 부분 분할
   */
  private splitAllFreeRects(placedRect: FreeRect) {
    const newFreeRects: FreeRect[] = [];

    for (const freeRect of this.freeRects) {
      if (!this.rectsIntersect(freeRect, placedRect)) {
        newFreeRects.push(freeRect);
        continue;
      }

      // 왼쪽 부분
      if (placedRect.x > freeRect.x) {
        newFreeRects.push({
          x: freeRect.x,
          y: freeRect.y,
          width: placedRect.x - freeRect.x,
          height: freeRect.height
        });
      }

      // 오른쪽 부분
      if (placedRect.x + placedRect.width < freeRect.x + freeRect.width) {
        newFreeRects.push({
          x: placedRect.x + placedRect.width,
          y: freeRect.y,
          width: (freeRect.x + freeRect.width) - (placedRect.x + placedRect.width),
          height: freeRect.height
        });
      }

      // 아래쪽 부분
      if (placedRect.y > freeRect.y) {
        newFreeRects.push({
          x: freeRect.x,
          y: freeRect.y,
          width: freeRect.width,
          height: placedRect.y - freeRect.y
        });
      }

      // 위쪽 부분
      if (placedRect.y + placedRect.height < freeRect.y + freeRect.height) {
        newFreeRects.push({
          x: freeRect.x,
          y: placedRect.y + placedRect.height,
          width: freeRect.width,
          height: (freeRect.y + freeRect.height) - (placedRect.y + placedRect.height)
        });
      }
    }

    this.freeRects = newFreeRects;
  }

  /**
   * 중복되거나 포함된 자유 공간 제거
   */
  private pruneFreeRects() {
    const newFreeRects: FreeRect[] = [];

    for (let i = 0; i < this.freeRects.length; i++) {
      const rect1 = this.freeRects[i];
      let isContained = false;

      for (let j = 0; j < this.freeRects.length; j++) {
        if (i === j) continue;
        const rect2 = this.freeRects[j];

        if (rect1.x >= rect2.x &&
            rect1.y >= rect2.y &&
            rect1.x + rect1.width <= rect2.x + rect2.width &&
            rect1.y + rect1.height <= rect2.y + rect2.height) {
          isContained = true;
          break;
        }
      }

      if (!isContained) {
        newFreeRects.push(rect1);
      }
    }

    this.freeRects = newFreeRects;
  }

  /**
   * 결과 반환
   */
  getResult(): PackedBin {
    let usedArea = 0;

    for (const panel of this.placedPanels) {
      usedArea += panel.width * panel.height;
    }

    const totalArea = this.binWidth * this.binHeight;
    const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

    return {
      width: this.binWidth,
      height: this.binHeight,
      panels: this.placedPanels,
      efficiency,
      usedArea
    };
  }
}

/**
 * MaxRects 알고리즘으로 멀티 빈 패킹
 * 자재 효율 + 재단 길이 최소화 동시 최적화
 */
export function packMaxRects(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 5,
  maxBins: number = 999
): PackedBin[] {

  // 패널 정렬 - 면적 큰 것 먼저, 같으면 긴 변 우선
  const sortedPanels = [...panels].sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (Math.abs(areaA - areaB) > 10000) {
      return areaB - areaA;
    }
    const maxA = Math.max(a.width, a.height);
    const maxB = Math.max(b.width, b.height);
    return maxB - maxA;
  });

  const bins: PackedBin[] = [];
  let currentBin = 0;
  const remainingPanels = [...sortedPanels];

  while (remainingPanels.length > 0 && currentBin < maxBins) {

    const packer = new MaxRectsPacker(binWidth, binHeight, kerf);
    const placedInThisBin: number[] = [];

    for (let i = 0; i < remainingPanels.length; i++) {
      const panel = remainingPanels[i];
      const placed = packer.pack(panel);

      if (placed) {
        placedInThisBin.push(i);
      }
    }

    if (placedInThisBin.length === 0) {
      console.warn(`[packMaxRects] Cannot place ${remainingPanels.length} remaining panels`);
      break;
    }

    placedInThisBin.reverse().forEach(index => {
      remainingPanels.splice(index, 1);
    });

    const result = packer.getResult();
    bins.push(result);

    currentBin++;
  }

  return bins;
}
