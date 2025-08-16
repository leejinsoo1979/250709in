/**
 * Column-based packing algorithm for efficient material usage
 * 세로 컬럼 기반 패킹 - 왼쪽에서 오른쪽으로 채우기
 */

import { Rect, PackedBin } from './simpleBinPacking';

interface Column {
  x: number;         // 컬럼의 x 위치
  width: number;     // 컬럼의 너비
  currentY: number;  // 현재 y 위치
  panels: Rect[];    // 컬럼에 배치된 패널들
}

export class ColumnPacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private columns: Column[] = [];
  private panels: Rect[] = [];
  
  constructor(width: number, height: number, kerf: number = 5) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
  }
  
  /**
   * 패널을 컬럼 방식으로 배치
   */
  pack(panel: Rect): Rect | null {
    // 1. 기존 컬럼에서 맞는 곳 찾기
    for (const column of this.columns) {
      if (this.canFitInColumn(panel, column)) {
        return this.placeInColumn(panel, column, false);
      }
    }
    
    // 2. 회전해서 기존 컬럼에 맞는지 확인
    if (panel.canRotate !== false) {
      for (const column of this.columns) {
        if (this.canFitInColumnRotated(panel, column)) {
          return this.placeInColumn(panel, column, true);
        }
      }
    }
    
    // 3. 새 컬럼 생성 가능한지 확인
    const currentX = this.getNextColumnX();
    
    // 일반 방향으로 새 컬럼
    if (currentX + panel.width <= this.binWidth) {
      const newColumn: Column = {
        x: currentX,
        width: panel.width,
        currentY: this.kerf,
        panels: []
      };
      this.columns.push(newColumn);
      return this.placeInColumn(panel, newColumn, false);
    }
    
    // 회전해서 새 컬럼
    if (panel.canRotate !== false && currentX + panel.height <= this.binWidth) {
      const newColumn: Column = {
        x: currentX,
        width: panel.height,
        currentY: this.kerf,
        panels: []
      };
      this.columns.push(newColumn);
      return this.placeInColumn(panel, newColumn, true);
    }
    
    return null;
  }
  
  /**
   * 다음 컬럼의 x 위치 계산
   */
  private getNextColumnX(): number {
    if (this.columns.length === 0) {
      return this.kerf;
    }
    
    let maxX = this.kerf;
    for (const column of this.columns) {
      const columnEnd = column.x + column.width + this.kerf;
      if (columnEnd > maxX) {
        maxX = columnEnd;
      }
    }
    
    return maxX;
  }
  
  /**
   * 컬럼에 패널이 들어갈 수 있는지 확인
   */
  private canFitInColumn(panel: Rect, column: Column): boolean {
    // 너비 체크
    if (panel.width > column.width) {
      return false;
    }
    
    // 높이 체크
    if (column.currentY + panel.height > this.binHeight) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 회전된 패널이 컬럼에 들어갈 수 있는지 확인
   */
  private canFitInColumnRotated(panel: Rect, column: Column): boolean {
    // 회전된 너비 체크
    if (panel.height > column.width) {
      return false;
    }
    
    // 회전된 높이 체크
    if (column.currentY + panel.width > this.binHeight) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 패널을 컬럼에 배치
   */
  private placeInColumn(panel: Rect, column: Column, rotate: boolean): Rect {
    const actualWidth = rotate ? panel.height : panel.width;
    const actualHeight = rotate ? panel.width : panel.height;
    
    const packed: Rect = {
      ...panel,
      x: column.x,
      y: column.currentY,
      width: panel.width,  // 원본 크기 유지
      height: panel.height,  // 원본 크기 유지
      rotated: rotate
    };
    
    column.panels.push(packed);
    column.currentY += actualHeight + this.kerf;
    
    // 컬럼 너비는 변경하지 않음 (패널이 컬럼 너비를 초과하지 않도록 이미 체크했음)
    // if (actualWidth > column.width) {
    //   column.width = actualWidth;
    // }
    
    this.panels.push(packed);
    return packed;
  }
  
  /**
   * 패킹 결과 반환
   */
  getResult(): PackedBin {
    let usedArea = 0;
    for (const panel of this.panels) {
      usedArea += panel.width * panel.height;
    }
    
    const totalArea = this.binWidth * this.binHeight;
    const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
    
    return {
      width: this.binWidth,
      height: this.binHeight,
      panels: this.panels,
      efficiency,
      usedArea
    };
  }
}

/**
 * 컬럼 기반 패킹 함수
 */
export function packColumns(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 5,
  maxBins: number = 999
): PackedBin[] {
  // 패널을 높이 순으로 정렬 (세로로 긴 패널 우선)
  const sortedPanels = [...panels].sort((a, b) => {
    // 먼저 높이가 긴 것 우선
    const heightDiff = b.height - a.height;
    if (heightDiff !== 0) return heightDiff;
    
    // 높이가 같으면 너비가 좁은 것 우선 (컬럼을 덜 차지)
    return a.width - b.width;
  });
  
  const bins: PackedBin[] = [];
  let currentBin = 0;
  const unpacked = [...sortedPanels];
  
  while (unpacked.length > 0 && currentBin < maxBins) {
    const packer = new ColumnPacker(binWidth, binHeight, kerf);
    const panelsToRemove: number[] = [];
    
    // 모든 패널을 순서대로 패킹 시도
    for (let i = 0; i < unpacked.length; i++) {
      const panel = unpacked[i];
      const packed = packer.pack(panel);
      if (packed) {
        panelsToRemove.push(i);
      }
    }
    
    // 패킹된 패널 제거
    panelsToRemove.sort((a, b) => b - a);
    for (const idx of panelsToRemove) {
      unpacked.splice(idx, 1);
    }
    
    // 결과 추가
    const result = packer.getResult();
    if (result.panels.length > 0) {
      bins.push(result);
    } else {
      break; // 더 이상 패킹할 수 없음
    }
    
    currentBin++;
  }
  
  return bins;
}