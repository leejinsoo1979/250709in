import { OptimizedResult } from '../types';

export class DXFExporter {
  private lines: string[] = [];
  
  constructor() {
    this.initDXF();
  }
  
  private initDXF() {
    // DXF Header
    this.lines.push('0');
    this.lines.push('SECTION');
    this.lines.push('2');
    this.lines.push('HEADER');
    this.lines.push('9');
    this.lines.push('$ACADVER');
    this.lines.push('1');
    this.lines.push('AC1015'); // AutoCAD 2000 format - better compatibility with modern AutoCAD
    this.lines.push('9');
    this.lines.push('$INSBASE');
    this.lines.push('10');
    this.lines.push('0.0');
    this.lines.push('20');
    this.lines.push('0.0');
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('9');
    this.lines.push('$EXTMIN');
    this.lines.push('10');
    this.lines.push('0.0');
    this.lines.push('20');
    this.lines.push('0.0');
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('9');
    this.lines.push('$EXTMAX');
    this.lines.push('10');
    this.lines.push('20000.0'); // 가로로 더 넓게 설정
    this.lines.push('20');
    this.lines.push('3000.0'); // 세로는 줄임
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('9');
    this.lines.push('$LIMMIN');
    this.lines.push('10');
    this.lines.push('0.0');
    this.lines.push('20');
    this.lines.push('0.0');
    this.lines.push('9');
    this.lines.push('$LIMMAX');
    this.lines.push('10');
    this.lines.push('20000.0'); // 가로로 더 넓게 설정
    this.lines.push('20');
    this.lines.push('3000.0'); // 세로는 줄임
    this.lines.push('0');
    this.lines.push('ENDSEC');
    
    // Tables section
    this.lines.push('0');
    this.lines.push('SECTION');
    this.lines.push('2');
    this.lines.push('TABLES');
    
    // Skip VPORT table for better compatibility
    
    // Line type table (simplified)
    this.lines.push('0');
    this.lines.push('TABLE');
    this.lines.push('2');
    this.lines.push('LTYPE');
    this.lines.push('70');
    this.lines.push('1');
    this.lines.push('0');
    this.lines.push('LTYPE');
    this.lines.push('2');
    this.lines.push('CONTINUOUS');
    this.lines.push('70');
    this.lines.push('64');
    this.lines.push('3');
    this.lines.push('Solid line');
    this.lines.push('72');
    this.lines.push('65');
    this.lines.push('73');
    this.lines.push('0');
    this.lines.push('40');
    this.lines.push('0.0');
    this.lines.push('0');
    this.lines.push('ENDTAB');
    
    // Layer table
    this.lines.push('0');
    this.lines.push('TABLE');
    this.lines.push('2');
    this.lines.push('LAYER');
    this.lines.push('70');
    this.lines.push('6');
    
    // Default layer (required)
    this.lines.push('0');
    this.lines.push('LAYER');
    this.lines.push('2');
    this.lines.push('0');
    this.lines.push('70');
    this.lines.push('0');
    this.lines.push('62');
    this.lines.push('7');
    this.lines.push('6');
    this.lines.push('CONTINUOUS');
    
    // Panel layer
    this.lines.push('0');
    this.lines.push('LAYER');
    this.lines.push('2');
    this.lines.push('PANELS');
    this.lines.push('70');
    this.lines.push('0');
    this.lines.push('62');
    this.lines.push('3');
    this.lines.push('6');
    this.lines.push('CONTINUOUS');
    
    // Cut layer
    this.lines.push('0');
    this.lines.push('LAYER');
    this.lines.push('2');
    this.lines.push('CUTS');
    this.lines.push('70');
    this.lines.push('0');
    this.lines.push('62');
    this.lines.push('1');
    this.lines.push('6');
    this.lines.push('CONTINUOUS');
    
    // Text layer
    this.lines.push('0');
    this.lines.push('LAYER');
    this.lines.push('2');
    this.lines.push('TEXT');
    this.lines.push('70');
    this.lines.push('0');
    this.lines.push('62');
    this.lines.push('2');
    this.lines.push('6');
    this.lines.push('CONTINUOUS');

    // Boring layer (cyan)
    this.lines.push('0');
    this.lines.push('LAYER');
    this.lines.push('2');
    this.lines.push('BORING');
    this.lines.push('70');
    this.lines.push('0');
    this.lines.push('62');
    this.lines.push('4');
    this.lines.push('6');
    this.lines.push('CONTINUOUS');

    // Groove layer (magenta)
    this.lines.push('0');
    this.lines.push('LAYER');
    this.lines.push('2');
    this.lines.push('GROOVE');
    this.lines.push('70');
    this.lines.push('0');
    this.lines.push('62');
    this.lines.push('6');
    this.lines.push('6');
    this.lines.push('CONTINUOUS');

    this.lines.push('0');
    this.lines.push('ENDTAB');
    this.lines.push('0');
    this.lines.push('ENDSEC');
    
    // Start entities section
    this.lines.push('0');
    this.lines.push('SECTION');
    this.lines.push('2');
    this.lines.push('ENTITIES');
  }
  
  private addRectangle(x: number, y: number, width: number, height: number, layer: string) {
    // Draw rectangle using LINE entities (more compatible)
    // Top line
    this.lines.push('0');
    this.lines.push('LINE');
    this.lines.push('8');
    this.lines.push(layer);
    this.lines.push('10');
    this.lines.push(x.toFixed(2));
    this.lines.push('20');
    this.lines.push(y.toFixed(2));
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('11');
    this.lines.push((x + width).toFixed(2));
    this.lines.push('21');
    this.lines.push(y.toFixed(2));
    this.lines.push('31');
    this.lines.push('0.0');
    
    // Right line
    this.lines.push('0');
    this.lines.push('LINE');
    this.lines.push('8');
    this.lines.push(layer);
    this.lines.push('10');
    this.lines.push((x + width).toFixed(2));
    this.lines.push('20');
    this.lines.push(y.toFixed(2));
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('11');
    this.lines.push((x + width).toFixed(2));
    this.lines.push('21');
    this.lines.push((y + height).toFixed(2));
    this.lines.push('31');
    this.lines.push('0.0');
    
    // Bottom line
    this.lines.push('0');
    this.lines.push('LINE');
    this.lines.push('8');
    this.lines.push(layer);
    this.lines.push('10');
    this.lines.push((x + width).toFixed(2));
    this.lines.push('20');
    this.lines.push((y + height).toFixed(2));
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('11');
    this.lines.push(x.toFixed(2));
    this.lines.push('21');
    this.lines.push((y + height).toFixed(2));
    this.lines.push('31');
    this.lines.push('0.0');
    
    // Left line
    this.lines.push('0');
    this.lines.push('LINE');
    this.lines.push('8');
    this.lines.push(layer);
    this.lines.push('10');
    this.lines.push(x.toFixed(2));
    this.lines.push('20');
    this.lines.push((y + height).toFixed(2));
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('11');
    this.lines.push(x.toFixed(2));
    this.lines.push('21');
    this.lines.push(y.toFixed(2));
    this.lines.push('31');
    this.lines.push('0.0');
  }
  
  private addCircle(cx: number, cy: number, radius: number, layer: string = 'BORING') {
    this.lines.push('0');
    this.lines.push('CIRCLE');
    this.lines.push('8');
    this.lines.push(layer);
    this.lines.push('10');
    this.lines.push(cx.toFixed(2));
    this.lines.push('20');
    this.lines.push(cy.toFixed(2));
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('40');
    this.lines.push(radius.toFixed(2));
  }

  private addLine(x1: number, y1: number, x2: number, y2: number, layer: string = 'BORING') {
    this.lines.push('0');
    this.lines.push('LINE');
    this.lines.push('8');
    this.lines.push(layer);
    this.lines.push('10');
    this.lines.push(x1.toFixed(2));
    this.lines.push('20');
    this.lines.push(y1.toFixed(2));
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('11');
    this.lines.push(x2.toFixed(2));
    this.lines.push('21');
    this.lines.push(y2.toFixed(2));
    this.lines.push('31');
    this.lines.push('0.0');
  }

  private addBoringHole(cx: number, cy: number, radius: number, crossSize: number, layer: string = 'BORING') {
    this.addCircle(cx, cy, radius, layer);
    // 센터 십자
    this.addLine(cx - crossSize, cy, cx + crossSize, cy, layer);
    this.addLine(cx, cy - crossSize, cx, cy + crossSize, layer);
  }

  private addText(text: string, x: number, y: number, height: number = 10, layer: string = 'TEXT') {
    this.lines.push('0');
    this.lines.push('TEXT');
    this.lines.push('8');
    this.lines.push(layer);
    this.lines.push('10');
    this.lines.push(x.toFixed(2));
    this.lines.push('20');
    this.lines.push(y.toFixed(2));
    this.lines.push('30');
    this.lines.push('0.0');
    this.lines.push('40');
    this.lines.push(height.toFixed(2));
    this.lines.push('1');
    this.lines.push(text);
  }
  
  public addSheet(result: OptimizedResult, sheetNumber: number) {
    // 가로로 배열 - X축 오프셋 사용
    const offsetX = sheetNumber * (result.stockPanel.width + 200);
    const offsetY = 150; // 상단에 라벨을 위한 고정 Y 오프셋
    
    // Draw stock panel outline
    this.addRectangle(offsetX, offsetY, result.stockPanel.width, result.stockPanel.height, 'CUTS');
    
    // Add sheet label
    this.addText(
      `Sheet ${sheetNumber + 1}`,
      offsetX + result.stockPanel.width / 2,
      offsetY - 50,
      30,
      'TEXT'
    );
    
    // Add stock dimensions
    this.addText(
      `Stock: ${result.stockPanel.width} x ${result.stockPanel.height} mm`,
      offsetX + result.stockPanel.width / 2,
      offsetY - 100,
      20,
      'TEXT'
    );
    
    // Draw panels
    result.panels.forEach((panel, idx) => {
      // 회전 여부에 따른 실제 표시 크기
      const displayWidth = panel.rotated ? panel.height : panel.width;
      const displayHeight = panel.rotated ? panel.width : panel.height;
      
      // Panel outline - 실제 표시 크기 사용
      this.addRectangle(
        offsetX + panel.x,
        offsetY + panel.y,
        displayWidth,
        displayHeight,
        'PANELS'
      );
      
      // Panel ID and dimensions - 원래 치수 표시 (L×W)
      const panelText = panel.id ? `${panel.id}\n${Math.round(panel.width)}×${Math.round(panel.height)}` : `P${idx + 1}\n${Math.round(panel.width)}×${Math.round(panel.height)}`;
      this.addText(
        panelText.split('\n')[0], // ID
        offsetX + panel.x + displayWidth / 2,
        offsetY + panel.y + displayHeight / 2 + 10,
        Math.min(displayHeight / 10, 15),
        'TEXT'
      );
      
      // Dimensions on separate line - 원래 치수 표시 (L×W)
      this.addText(
        panelText.split('\n')[1] || `${Math.round(panel.width)}×${Math.round(panel.height)}`, // 원래 치수
        offsetX + panel.x + displayWidth / 2,
        offsetY + panel.y + displayHeight / 2 - 10,
        Math.min(displayHeight / 12, 12),
        'TEXT'
      );

      const origW = panel.width;
      const origH = panel.height;
      const isDoorPanel = panel.name?.includes('도어') || panel.name?.includes('Door');
      const isDrawerSidePanel = panel.name?.includes('서랍') && (panel.name?.includes('좌측판') || panel.name?.includes('우측판'));
      const isDrawerFrontPanel = panel.name?.includes('서랍') && panel.name?.includes('앞판');
      const isFurnitureSidePanel = (panel.name?.includes('좌측') || panel.name?.includes('우측') || panel.name?.includes('측판'))
        && !panel.name?.includes('서랍') && !isDoorPanel;
      const isLeftSidePanel = panel.name?.includes('좌측');

      // 시트 좌표 → DXF 좌표 변환 헬퍼
      const toDxf = (sx: number, sy: number): [number, number] => {
        return [offsetX + sx, offsetY + sy];
      };

      // ★★★ 선반핀/서랍 보링 표시 ★★★
      if ((panel as any).boringPositions && (panel as any).boringPositions.length > 0 && !isDoorPanel) {
        let depthPositions: number[] = [];
        if (isDrawerSidePanel) {
          depthPositions = (panel as any).boringDepthPositions?.length > 0
            ? (panel as any).boringDepthPositions
            : [7.5, origW - 7.5];
        } else if (isDrawerFrontPanel) {
          depthPositions = (panel as any).boringDepthPositions?.length > 0
            ? (panel as any).boringDepthPositions
            : [50, origW / 2, origW - 50];
        } else {
          // 가구 측판
          const bpt = 18, eo = 50;
          let frontX: number, backX: number;
          if (isLeftSidePanel) { frontX = eo; backX = origW - bpt - eo; }
          else { frontX = origW - eo; backX = bpt + eo; }
          const safeBack = isLeftSidePanel ? Math.max(backX, frontX + 40) : Math.min(backX, frontX - 40);
          const center = (frontX + safeBack) / 2;
          depthPositions = isLeftSidePanel ? [frontX, center, safeBack] : [safeBack, center, frontX];
        }

        ((panel as any).boringPositions as number[]).forEach((boringPosMm: number) => {
          depthPositions.forEach((depthPosMm: number) => {
            let sx: number, sy: number;
            if (isDrawerSidePanel || isDrawerFrontPanel) {
              sx = panel.x + boringPosMm;
              sy = panel.y + depthPosMm;
            } else if (panel.rotated) {
              const flippedY = origH - boringPosMm;
              const scX = (origH) / origW;
              const scY = (origW) / origH;
              sx = panel.x + depthPosMm * scX;
              sy = panel.y + flippedY * scY;
            } else {
              const flippedY = origH - boringPosMm;
              sx = panel.x + depthPosMm;
              sy = panel.y + flippedY;
            }
            const [dx, dy] = toDxf(sx, sy);
            this.addBoringHole(dx, dy, 1.5, 2, 'BORING');
          });
        });
      }

      // ★★★ 도어 힌지 보링 표시 ★★★
      if (isDoorPanel && (panel as any).boringPositions && (panel as any).boringPositions.length > 0) {
        const cupRadius = 35 / 2;
        const boringDepthPos: number[] = (panel as any).boringDepthPositions || [];
        const screwPos: number[] = (panel as any).screwPositions || [];
        const screwDepthPos: number[] = (panel as any).screwDepthPositions || [];

        // 힌지컵 보링
        ((panel as any).boringPositions as number[]).forEach((yPos: number) => {
          boringDepthPos.forEach((xPos: number) => {
            const [dx, dy] = toDxf(panel.x + xPos, panel.y + yPos);
            this.addBoringHole(dx, dy, cupRadius, 3, 'BORING');
          });
        });

        // 나사홀
        screwPos.forEach((yPos: number) => {
          screwDepthPos.forEach((xPos: number) => {
            const [dx, dy] = toDxf(panel.x + xPos, panel.y + yPos);
            this.addBoringHole(dx, dy, 4, 2, 'BORING');
          });
        });
      }

      // ★★★ 측판 힌지 브라켓 타공 표시 ★★★
      if ((panel as any).isBracketSide && (panel as any).bracketBoringPositions?.length > 0) {
        const bracketXPos: number[] = (panel as any).bracketBoringDepthPositions || [20, 52];
        ((panel as any).bracketBoringPositions as number[]).forEach((yPosMm: number) => {
          const flippedY = origH - yPosMm;
          bracketXPos.forEach((xPosMm: number) => {
            let sx: number, sy: number;
            if (panel.rotated) {
              const scX = origH / origW;
              const scY = origW / origH;
              sx = panel.x + xPosMm * scX;
              sy = panel.y + flippedY * scY;
            } else {
              sx = panel.x + xPosMm;
              sy = panel.y + flippedY;
            }
            const [dx, dy] = toDxf(sx, sy);
            this.addBoringHole(dx, dy, 1.5, 1.5, 'BORING');
          });
        });
      }

      // ★★★ 백패널 홈 가공 표시 ★★★
      if (isFurnitureSidePanel) {
        const bpOffset = 17, gw = 10;
        const gsX = isLeftSidePanel ? origW - bpOffset - gw : bpOffset;

        if (panel.rotated) {
          const gx1 = panel.x;
          const gx2 = panel.x + origH;
          const gy = panel.y + gsX;
          const [dx1, dy1] = toDxf(gx1, gy);
          const [dx2, dy2] = toDxf(gx2, gy);
          const [dx3, dy3] = toDxf(gx2, gy + gw);
          const [dx4, dy4] = toDxf(gx1, gy + gw);
          this.addRectangle(dx1, dy1, dx2 - dx1, dy3 - dy1, 'GROOVE');
        } else {
          const gx = panel.x + gsX;
          const gy = panel.y;
          const [dx, dy] = toDxf(gx, gy);
          this.addRectangle(dx, dy, gw, origH, 'GROOVE');
        }
      }

      // ★★★ 서랍 바닥판 홈 가공 표시 ★★★
      if (panel.name?.includes('서랍') && (panel as any).groovePositions?.length > 0) {
        ((panel as any).groovePositions as any[]).forEach((groove: any) => {
          const gy = groove.y;
          const gh = groove.height;
          // 서랍 패널에서 홈은 높이 방향
          const gx1 = panel.x;
          const gy1 = panel.y + gy;
          const [dx, dy] = toDxf(gx1, gy1);
          this.addRectangle(dx, dy, displayWidth, gh, 'GROOVE');
        });
      }
    });
    
    // Add efficiency info (아래쪽에 배치)
    this.addText(
      `Efficiency: ${result.efficiency.toFixed(1)}%`,
      offsetX + result.stockPanel.width / 2,
      offsetY + result.stockPanel.height + 50,
      20,
      'TEXT'
    );
  }
  
  public finalize(): string {
    // End entities section
    this.lines.push('0');
    this.lines.push('ENDSEC');
    
    // End of file
    this.lines.push('0');
    this.lines.push('EOF');
    
    return this.lines.join('\n');
  }
  
  public static exportToDXF(results: OptimizedResult[]): string {
    const exporter = new DXFExporter();
    
    results.forEach((result, index) => {
      exporter.addSheet(result, index);
    });
    
    return exporter.finalize();
  }
}