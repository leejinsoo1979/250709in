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
    this.lines.push('AC1009'); // AutoCAD R12 format - most compatible
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
    this.lines.push('4');
    
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
      // Panel outline
      this.addRectangle(
        offsetX + panel.x,
        offsetY + panel.y,
        panel.width,
        panel.height,
        'PANELS'
      );
      
      // Panel ID and dimensions
      const panelText = panel.id ? `${panel.id}\n${Math.round(panel.width)}x${Math.round(panel.height)}` : `P${idx + 1}\n${Math.round(panel.width)}x${Math.round(panel.height)}`;
      this.addText(
        panelText.split('\n')[0], // ID
        offsetX + panel.x + panel.width / 2,
        offsetY + panel.y + panel.height / 2 + 10,
        Math.min(panel.height / 10, 15),
        'TEXT'
      );
      
      // Dimensions on separate line
      this.addText(
        panelText.split('\n')[1] || `${Math.round(panel.width)}x${Math.round(panel.height)}`, // Dimensions
        offsetX + panel.x + panel.width / 2,
        offsetY + panel.y + panel.height / 2 - 10,
        Math.min(panel.height / 12, 12),
        'TEXT'
      );
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