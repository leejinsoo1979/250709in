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
    this.lines.push('AC1014'); // AutoCAD 2000 format
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
    this.lines.push('0');
    this.lines.push('ENDSEC');
    
    // Tables section
    this.lines.push('0');
    this.lines.push('SECTION');
    this.lines.push('2');
    this.lines.push('TABLES');
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
    this.lines.push('0');
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
    this.lines.push('2');
    
    // Panel layer
    this.lines.push('0');
    this.lines.push('LAYER');
    this.lines.push('2');
    this.lines.push('PANELS');
    this.lines.push('70');
    this.lines.push('0');
    this.lines.push('62');
    this.lines.push('3'); // Green
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
    this.lines.push('1'); // Red
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
    // Draw rectangle as LWPOLYLINE
    this.lines.push('0');
    this.lines.push('LWPOLYLINE');
    this.lines.push('8');
    this.lines.push(layer);
    this.lines.push('90');
    this.lines.push('4'); // 4 vertices
    this.lines.push('70');
    this.lines.push('1'); // Closed polyline
    
    // Vertex 1
    this.lines.push('10');
    this.lines.push(x.toFixed(2));
    this.lines.push('20');
    this.lines.push(y.toFixed(2));
    
    // Vertex 2
    this.lines.push('10');
    this.lines.push((x + width).toFixed(2));
    this.lines.push('20');
    this.lines.push(y.toFixed(2));
    
    // Vertex 3
    this.lines.push('10');
    this.lines.push((x + width).toFixed(2));
    this.lines.push('20');
    this.lines.push((y + height).toFixed(2));
    
    // Vertex 4
    this.lines.push('10');
    this.lines.push(x.toFixed(2));
    this.lines.push('20');
    this.lines.push((y + height).toFixed(2));
  }
  
  private addText(text: string, x: number, y: number, height: number = 10) {
    this.lines.push('0');
    this.lines.push('TEXT');
    this.lines.push('8');
    this.lines.push('PANELS');
    this.lines.push('10');
    this.lines.push(x.toFixed(2));
    this.lines.push('20');
    this.lines.push(y.toFixed(2));
    this.lines.push('40');
    this.lines.push(height.toFixed(2));
    this.lines.push('1');
    this.lines.push(text);
  }
  
  public addSheet(result: OptimizedResult, sheetNumber: number) {
    const offsetY = sheetNumber * (result.stockPanel.height + 100);
    
    // Draw stock panel outline
    this.addRectangle(0, offsetY, result.stockPanel.width, result.stockPanel.height, 'CUTS');
    
    // Add sheet label
    this.addText(
      `Sheet ${sheetNumber + 1}`,
      result.stockPanel.width / 2 - 50,
      offsetY - 30,
      20
    );
    
    // Draw panels
    result.panels.forEach(panel => {
      // Panel outline
      this.addRectangle(
        panel.x,
        offsetY + panel.y,
        panel.width,
        panel.height,
        'PANELS'
      );
      
      // Panel label
      this.addText(
        `${panel.width}x${panel.height}`,
        panel.x + panel.width / 2 - 30,
        offsetY + panel.y + panel.height / 2,
        8
      );
    });
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