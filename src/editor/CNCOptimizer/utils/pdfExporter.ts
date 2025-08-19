import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { OptimizedResult, Panel } from '../types';

interface FurnitureData {
  projectName: string;
  spaceInfo: any;
  placedModules: any[];
  panels: Panel[];
  needsConfiguratorView?: boolean;
  furniture3DImage?: string;
}

export class PDFExporter {
  private pdf: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 20;
  private panelDetails: Map<string, Panel> = new Map();
  private furnitureData: FurnitureData | undefined;
  
  constructor(panels?: Panel[]) {
    this.pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3'
    });
    
    // 한글 폰트 처리를 위한 설정
    // jsPDF는 기본적으로 한글을 지원하지 않으므로 영문으로 대체
    this.pdf.setFont('helvetica');
    
    this.pageWidth = this.pdf.internal.pageSize.getWidth();
    this.pageHeight = this.pdf.internal.pageSize.getHeight();
    
    // Store panel details for reference
    if (panels) {
      panels.forEach(panel => {
        this.panelDetails.set(panel.id, panel);
      });
    }
  }
  
  private drawSheet(result: OptimizedResult, sheetNumber: number, addNewPage: boolean = true) {
    // Add new page only if requested
    // This allows more flexible usage
    if (addNewPage && sheetNumber > 0) {
      this.pdf.addPage();
    }
    
    // Title
    this.pdf.setFontSize(16);
    this.pdf.text(`Cutting Layout - Sheet ${sheetNumber + 1}`, this.margin, this.margin);
    
    // Sheet info
    this.pdf.setFontSize(10);
    this.pdf.text(
      `Stock: ${result.stockPanel.width} x ${result.stockPanel.height} mm | ` +
      `Panels: ${result.panels.length} | ` +
      `Efficiency: ${result.efficiency.toFixed(1)}%`,
      this.margin,
      this.margin + 10
    );
    
    // Calculate scale to fit the sheet on the page (가로 방향으로 표시)
    const drawableWidth = this.pageWidth - (this.margin * 2);
    const drawableHeight = this.pageHeight - (this.margin * 2) - 20;
    
    // 패널을 가로로 표시하기 위해 width와 height를 바꿔서 계산
    const isRotated = result.stockPanel.height > result.stockPanel.width;
    const displayWidth = isRotated ? result.stockPanel.height : result.stockPanel.width;
    const displayHeight = isRotated ? result.stockPanel.width : result.stockPanel.height;
    
    const scaleX = drawableWidth / displayWidth;
    const scaleY = drawableHeight / displayHeight;
    const scale = Math.min(scaleX, scaleY, 0.2); // Max scale 0.2 for readability
    
    const offsetX = this.margin;
    const offsetY = this.margin + 20;
    
    // Draw stock panel outline (가로 방향)
    this.pdf.setDrawColor(200, 200, 200);
    this.pdf.setLineWidth(0.5);
    this.pdf.rect(
      offsetX,
      offsetY,
      displayWidth * scale,
      displayHeight * scale
    );
    
    // 원장에 빗살무늬 해치 추가
    this.pdf.setDrawColor(100, 100, 100); // 진한 회색
    this.pdf.setLineWidth(0.1);
    
    // 대각선 해치 그리기 (45도 각도)
    const hatchSpacing = 5; // 해치 간격 (mm)
    const panelWidth = displayWidth * scale;
    const panelHeight = displayHeight * scale;
    const maxDimension = Math.max(panelWidth, panelHeight);
    
    // 왼쪽 아래에서 오른쪽 위로 가는 대각선 해치
    for (let i = -maxDimension; i < maxDimension * 2; i += hatchSpacing) {
      const x1 = offsetX + i;
      const y1 = offsetY;
      const x2 = offsetX + i + panelHeight;
      const y2 = offsetY + panelHeight;
      
      // 클리핑: 패널 영역 내에서만 그리기
      const clippedX1 = Math.max(offsetX, Math.min(offsetX + panelWidth, x1));
      const clippedY1 = x1 < offsetX ? offsetY + (offsetX - x1) : y1;
      const clippedX2 = Math.max(offsetX, Math.min(offsetX + panelWidth, x2));
      const clippedY2 = x2 > offsetX + panelWidth ? offsetY + panelHeight - (x2 - offsetX - panelWidth) : y2;
      
      if (clippedX1 < offsetX + panelWidth && clippedX2 > offsetX) {
        this.pdf.line(clippedX1, clippedY1, clippedX2, clippedY2);
      }
    }
    
    // Material colors
    const materialColors: { [key: string]: [number, number, number] } = {
      'PB': [232, 245, 233],    // Light green
      'MDF': [255, 243, 224],   // Light orange
      'PLY': [227, 242, 253],   // Light blue
      'HPL': [243, 229, 245],   // Light purple
      'LPM': [252, 228, 236]    // Light pink
    };
    
    
    // Draw panels (가로 방향 고려)
    result.panels.forEach((panel, index) => {
      let x, y, width, height;
      
      if (isRotated) {
        // 패널이 세로일 때는 90도 회전하여 그리기
        x = offsetX + (panel.y * scale);
        y = offsetY + ((result.stockPanel.width - panel.x - panel.width) * scale);
        width = panel.height * scale;
        height = panel.width * scale;
      } else {
        // 패널이 가로일 때는 그대로
        x = offsetX + (panel.x * scale);
        y = offsetY + (panel.y * scale);
        width = panel.width * scale;
        height = panel.height * scale;
      }
      
      // Panel fill
      const color = materialColors[panel.material] || [243, 244, 246];
      this.pdf.setFillColor(color[0], color[1], color[2]);
      this.pdf.rect(x, y, width, height, 'F');
      
      // Panel border
      this.pdf.setDrawColor(100, 100, 100);
      this.pdf.setLineWidth(0.2);
      this.pdf.rect(x, y, width, height, 'S');
      
      // Panel info (if space allows)
      if (width > 15 && height > 10) {
        this.pdf.setFontSize(6);
        this.pdf.setTextColor(50, 50, 50);
        
        // Panel name (if available) - ASCII 문자만 표시
        if (panel.name) {
          // 한글이 포함된 경우 패널 ID로 대체
          const cleanName = /^[\x00-\x7F]*$/.test(panel.name) ? panel.name : `Panel_${panel.id}`;
          const nameText = cleanName.length > 20 ? cleanName.substring(0, 17) + '...' : cleanName;
          const nameWidth = this.pdf.getTextWidth(nameText);
          this.pdf.text(
            nameText,
            x + (width - nameWidth) / 2,
            y + height / 2 - 2
          );
        }
        
        // Panel dimensions (keep center display as is)
        this.pdf.setFontSize(7);
        this.pdf.setTextColor(100, 100, 100);
        const dimText = `${Math.round(panel.width)} × ${Math.round(panel.height)}`;
        const dimWidth = this.pdf.getTextWidth(dimText);
        this.pdf.text(
          dimText,
          x + (width - dimWidth) / 2,
          y + height / 2 + (panel.name ? 2 : 0)
        );
        
        // 패널 가장자리에 치수 표시
        // 화면에 그려진 크기를 그대로 표시
        
        // 화면에 그려진 실제 크기 계산
        // width와 height는 이미 위에서 계산된 화면에 표시되는 크기
        const actualDisplayWidth = Math.round(width / scale);  // 스케일을 역산하여 실제 크기 계산
        const actualDisplayHeight = Math.round(height / scale);
        
        // L방향 치수 - 상단에 표시 (화면의 가로 치수)
        if (width > 10) {
          this.pdf.setFontSize(10);
          this.pdf.setTextColor(0, 0, 0);
          const topText = String(actualDisplayWidth);
          const topTextWidth = this.pdf.getTextWidth(topText);
          this.pdf.text(
            topText,
            x + (width - topTextWidth) / 2,
            y + 7
          );
        }
        
        // W방향 치수 - 패널 안쪽 좌측에 90도 회전하여 표시
        if (height > 10) {
          this.pdf.setFontSize(10);
          this.pdf.setTextColor(0, 0, 0);
          const leftText = String(actualDisplayHeight);
          
          // 패널 안쪽 좌측 중앙에 90도 회전하여 표시
          const textX = x + 7;
          const textY = y + height / 2;
          
          // jsPDF의 angle 파라미터 사용 (90도 회전)
          this.pdf.text(leftText, textX, textY, { angle: 90 });
        }
        
        // Material label in corner
        if (width > 25) {
          this.pdf.setFontSize(5);
          this.pdf.setTextColor(150, 150, 150);
          this.pdf.text(panel.material, x + 2, y + height - 2);
        }
      }
    });
    
    // Draw dimensions (가로 방향 고려)
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(100, 100, 100);
    
    // Width dimension (항상 위쪽에 표시)
    this.pdf.text(
      `${displayWidth} mm`,
      offsetX + (displayWidth * scale) / 2 - 10,
      offsetY - 5
    );
    
    // Height dimension (항상 왼쪽에 표시)
    const heightText = `${displayHeight} mm`;
    this.pdf.setFontSize(8);
    // Write height dimension to the left of the sheet
    this.pdf.text(
      heightText,
      offsetX - 35,
      offsetY + (displayHeight * scale) / 2
    );
    
    // Statistics at bottom (가로 방향 고려)
    this.pdf.setFontSize(8);
    this.pdf.setTextColor(0, 0, 0);
    let statsY = offsetY + (displayHeight * scale) + 10;
    
    // Calculate areas if not provided
    const totalArea = result.stockPanel.width * result.stockPanel.height;
    const usedArea = result.panels.reduce((sum, p) => sum + (p.width * p.height), 0);
    const wasteArea = totalArea - usedArea;
    
    this.pdf.text(
      `Used Area: ${(usedArea / 1000000).toFixed(2)} m² | ` +
      `Waste Area: ${(wasteArea / 1000000).toFixed(2)} m²`,
      offsetX,
      statsY
    );
    
    // Add panel list for this sheet
    statsY += 10;
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text('Panels in this sheet:', offsetX, statsY);
    
    statsY += 7;
    this.pdf.setFontSize(8);
    
    // Create panel summary with quantities
    const panelSummary = new Map<string, {count: number, width: number, height: number, material: string}>();
    result.panels.forEach(panel => {
      const key = `${panel.name || panel.id}_${panel.width}_${panel.height}_${panel.material}`;
      if (!panelSummary.has(key)) {
        panelSummary.set(key, {
          count: 0,
          width: panel.width,
          height: panel.height,
          material: panel.material
        });
      }
      panelSummary.get(key)!.count++;
    });
    
    // Draw panel list table
    const tableStartY = statsY;
    const colWidths = [10, 50, 20, 20, 18]; // No, Name, Width, Height, Material
    const headers = ['Qty', 'Panel Name', 'Width', 'Height', 'Mat.'];
    
    // Draw table header background
    this.pdf.setFillColor(240, 240, 240);
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    this.pdf.rect(offsetX, tableStartY - 5, tableWidth, 7, 'F');
    
    // Draw table header text
    this.pdf.setFontSize(8);
    this.pdf.setTextColor(0, 0, 0);
    let xPos = offsetX;
    headers.forEach((header, i) => {
      this.pdf.text(header, xPos + 2, tableStartY - 1);
      xPos += colWidths[i];
    });
    
    statsY = tableStartY + 5;
    
    // Draw panel rows
    let rowIndex = 1;
    Array.from(panelSummary.entries()).forEach(([key, data]) => {
      // Check if we need to wrap to next column or page
      if (statsY > this.pageHeight - 30) {
        // Continue in next column or page if needed
        return;
      }
      
      const panelName = key.split('_')[0];
      // 한글이 포함된 경우 영문으로 대체
      const cleanPanelName = /^[\x00-\x7F]*$/.test(panelName) ? panelName : `Panel_${rowIndex}`;
      
      xPos = offsetX;
      const rowData = [
        data.count.toString(),
        cleanPanelName.length > 20 ? cleanPanelName.substring(0, 17) + '...' : cleanPanelName,
        Math.round(data.width).toString(),
        Math.round(data.height).toString(),
        data.material
      ];
      
      // Alternate row background
      if (rowIndex % 2 === 0) {
        this.pdf.setFillColor(250, 250, 250);
        this.pdf.rect(offsetX, statsY - 3, tableWidth, 5, 'F');
      }
      
      this.pdf.setFontSize(7);
      this.pdf.setTextColor(0, 0, 0);
      rowData.forEach((text, i) => {
        this.pdf.text(text, xPos + 2, statsY);
        xPos += colWidths[i];
      });
      
      statsY += 5;
      rowIndex++;
    });
  }
  
  private addFurnitureInfoPage() {
    if (!this.furnitureData) return;
    
    this.pdf.addPage();
    
    // Title
    this.pdf.setFontSize(18);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text('Furniture Information', this.margin, this.margin);
    
    // Project info
    this.pdf.setFontSize(12);
    let yPos = this.margin + 15;
    this.pdf.text(`Project: ${this.furnitureData.projectName}`, this.margin, yPos);
    
    yPos += 8;
    if (this.furnitureData.spaceInfo) {
      const space = this.furnitureData.spaceInfo;
      this.pdf.setFontSize(10);
      this.pdf.text(`Space: ${space.width} x ${space.height} x ${space.depth} mm`, this.margin, yPos);
    }
    
    // Furniture modules list
    yPos += 15;
    this.pdf.setFontSize(14);
    this.pdf.text('Placed Furniture Modules', this.margin, yPos);
    
    yPos += 10;
    this.pdf.setFontSize(10);
    
    if (this.furnitureData.placedModules && this.furnitureData.placedModules.length > 0) {
      this.furnitureData.placedModules.forEach((module, index) => {
        if (yPos > this.pageHeight - 30) {
          this.pdf.addPage();
          yPos = this.margin;
        }
        
        // Module info
        this.pdf.setFillColor(250, 250, 250);
        this.pdf.rect(this.margin, yPos - 4, 200, 20, 'F');
        
        this.pdf.setTextColor(0, 0, 0);
        this.pdf.text(`${index + 1}. Module ID: ${module.moduleId}`, this.margin + 5, yPos);
        yPos += 5;
        this.pdf.text(`   Position: X=${module.position.x}, Y=${module.position.y}`, this.margin + 5, yPos);
        yPos += 5;
        if (module.adjustedWidth) {
          this.pdf.text(`   Size: ${module.adjustedWidth} mm (adjusted)`, this.margin + 5, yPos);
        }
        yPos += 10;
      });
    }
    
    // Add 3D View section
    yPos += 10;
    if (yPos > this.pageHeight - 100) {
      this.pdf.addPage();
      yPos = this.margin;
    }
    
    this.pdf.setFontSize(14);
    this.pdf.text('3D Furniture View', this.margin, yPos);
    yPos += 10;
    
    // Add note about viewing in Configurator
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(100, 100, 100);
    this.pdf.text('Note: For detailed 3D view, please visit the Configurator page', this.margin, yPos);
    yPos += 5;
    this.pdf.text('The 3D visualization shows the complete furniture arrangement in the space', this.margin, yPos);
    yPos += 10;
    
    // Add placeholder for 3D view
    this.pdf.setDrawColor(200, 200, 200);
    this.pdf.setFillColor(245, 245, 245);
    this.pdf.rect(this.margin, yPos, 180, 100, 'FD');
    
    // Add text in center of placeholder
    this.pdf.setTextColor(150, 150, 150);
    this.pdf.setFontSize(12);
    const text = 'View 3D visualization in Configurator';
    const textWidth = this.pdf.getTextWidth(text);
    this.pdf.text(text, this.margin + (180 - textWidth) / 2, yPos + 50);
    
    this.pdf.setTextColor(0, 0, 0); // Reset text color
  }
  
  private addPanelDetailsPage(results: OptimizedResult[]) {
    this.pdf.addPage();
    
    // Title
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text('Panel Details Summary', this.margin, this.margin);
    
    // Collect all unique panels
    const panelMap = new Map<string, {panel: Panel, totalQty: number, sheets: number[]}>();
    
    results.forEach((result, sheetIndex) => {
      result.panels.forEach(panel => {
        const key = `${panel.id}_${panel.width}_${panel.height}`;
        if (!panelMap.has(key)) {
          panelMap.set(key, {
            panel: panel,
            totalQty: 0,
            sheets: []
          });
        }
        const data = panelMap.get(key)!;
        data.totalQty += 1;
        if (!data.sheets.includes(sheetIndex + 1)) {
          data.sheets.push(sheetIndex + 1);
        }
      });
    });
    
    // Table headers
    let yPos = this.margin + 15;
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(0, 0, 0);
    
    // Draw table header
    const colWidths = [60, 30, 30, 25, 15, 30];
    const headers = ['Panel Name', 'Width', 'Height', 'Material', 'Qty', 'Sheet(s)'];
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    
    // Header background
    this.pdf.setFillColor(240, 240, 240);
    this.pdf.rect(this.margin, yPos - 5, tableWidth, 8, 'F');
    
    // Header text
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(0, 0, 0);
    let xPos = this.margin;
    headers.forEach((header, i) => {
      this.pdf.text(header, xPos + 2, yPos);
      xPos += colWidths[i];
    });
    
    yPos += 8;
    
    // Draw table rows
    this.pdf.setFontSize(8);
    Array.from(panelMap.values())
      .sort((a, b) => a.panel.name.localeCompare(b.panel.name))
      .forEach((data, index) => {
        // Check if we need a new page
        if (yPos > this.pageHeight - 30) {
          this.pdf.addPage();
          yPos = this.margin;
          
          // Redraw header on new page
          this.pdf.setFillColor(240, 240, 240);
          this.pdf.rect(this.margin, yPos - 5, tableWidth, 8, 'F');
          
          this.pdf.setFontSize(9);
          this.pdf.setTextColor(0, 0, 0);
          xPos = this.margin;
          headers.forEach((header, i) => {
            this.pdf.text(header, xPos + 2, yPos);
            xPos += colWidths[i];
          });
          yPos += 8;
          this.pdf.setFontSize(8);
        }
        
        // Alternate row background
        if (index % 2 === 0) {
          this.pdf.setFillColor(250, 250, 250);
          this.pdf.rect(this.margin, yPos - 4, tableWidth, 6, 'F');
        }
        
        // Row data
        xPos = this.margin;
        // 한글이 포함된 경우 영문으로 대체
        const cleanName = data.panel.name && /^[\x00-\x7F]*$/.test(data.panel.name) 
          ? data.panel.name 
          : `Panel_${data.panel.id}`;
        const rowData = [
          cleanName,
          Math.round(data.panel.width).toString(),
          Math.round(data.panel.height).toString(),
          data.panel.material,
          data.totalQty.toString(),
          data.sheets.join(', ')
        ];
        
        this.pdf.setFontSize(8);
        this.pdf.setTextColor(0, 0, 0);
        rowData.forEach((text, i) => {
          // Truncate long text
          let displayText = text;
          if (i === 0 && text.length > 30) {
            displayText = text.substring(0, 27) + '...';
          }
          this.pdf.text(displayText, xPos + 2, yPos);
          xPos += colWidths[i];
        });
        
        yPos += 6;
      });
    
    // Summary statistics
    yPos += 10;
    if (yPos > this.pageHeight - 40) {
      this.pdf.addPage();
      yPos = this.margin;
    }
    
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text('Summary', this.margin, yPos);
    
    yPos += 7;
    this.pdf.setFontSize(9);
    const totalPanels = Array.from(panelMap.values()).reduce((sum, data) => sum + data.totalQty, 0);
    const totalSheets = results.length;
    const avgEfficiency = results.reduce((sum, r) => sum + r.efficiency, 0) / results.length;
    
    this.pdf.text(`Total Panels: ${totalPanels}`, this.margin, yPos);
    yPos += 6;
    this.pdf.text(`Total Sheets: ${totalSheets}`, this.margin, yPos);
    yPos += 6;
    this.pdf.text(`Average Efficiency: ${avgEfficiency.toFixed(1)}%`, this.margin, yPos);
  }

  private drawAllSheetsOnOnePage(results: OptimizedResult[]) {
    // Title
    this.pdf.setFontSize(16);
    this.pdf.text(`Cutting Layout - Total ${results.length} Sheets`, this.margin, this.margin);
    
    // Calculate grid layout
    const cols = Math.ceil(Math.sqrt(results.length));
    const rows = Math.ceil(results.length / cols);
    
    // Calculate cell size
    const cellWidth = (this.pageWidth - (this.margin * 2) - (cols - 1) * 5) / cols;
    const cellHeight = (this.pageHeight - (this.margin * 2) - 30) / rows;
    
    // Draw each sheet in grid
    results.forEach((result, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      const cellX = this.margin + col * (cellWidth + 5);
      const cellY = this.margin + 30 + row * (cellHeight + 5);
      
      // Calculate scale for this sheet
      const scaleX = (cellWidth - 10) / result.stockPanel.width;
      const scaleY = (cellHeight - 20) / result.stockPanel.height;
      const scale = Math.min(scaleX, scaleY, 0.15);
      
      // Sheet number and info
      this.pdf.setFontSize(8);
      this.pdf.setTextColor(0, 0, 0);
      this.pdf.text(`Sheet ${index + 1}`, cellX + 2, cellY - 2);
      this.pdf.setFontSize(6);
      this.pdf.text(`${result.panels.length} panels (${result.efficiency.toFixed(0)}%)`, cellX + 2, cellY + 3);
      
      const offsetX = cellX + 5;
      const offsetY = cellY + 8;
      
      // Draw stock panel outline
      this.pdf.setDrawColor(200, 200, 200);
      this.pdf.setLineWidth(0.3);
      this.pdf.rect(
        offsetX,
        offsetY,
        result.stockPanel.width * scale,
        result.stockPanel.height * scale
      );
      
      // Material colors
      const materialColors: { [key: string]: [number, number, number] } = {
        'PB': [232, 245, 233],
        'PET': [255, 248, 220],
        'MDF': [255, 243, 224],
        'PLY': [227, 242, 253],
        'HPL': [243, 229, 245],
        'LPM': [252, 228, 236]
      };
      
      // Draw panels
      result.panels.forEach(panel => {
        const x = offsetX + (panel.x * scale);
        const y = offsetY + (panel.y * scale);
        const width = (panel.rotated ? panel.height : panel.width) * scale;
        const height = (panel.rotated ? panel.width : panel.height) * scale;
        
        // Panel fill
        const color = materialColors[panel.material] || [243, 244, 246];
        this.pdf.setFillColor(color[0], color[1], color[2]);
        this.pdf.rect(x, y, width, height, 'F');
        
        // Panel border
        this.pdf.setDrawColor(150, 150, 150);
        this.pdf.setLineWidth(0.1);
        this.pdf.rect(x, y, width, height, 'S');
      });
      
      // Stock dimensions
      this.pdf.setFontSize(5);
      this.pdf.setTextColor(100, 100, 100);
      this.pdf.text(
        `${result.stockPanel.width}x${result.stockPanel.height}`,
        offsetX + (result.stockPanel.width * scale) / 2 - 8,
        offsetY + result.stockPanel.height * scale + 3
      );
    });
    
    // Summary at bottom
    const totalPanels = results.reduce((sum, r) => sum + r.panels.length, 0);
    const avgEfficiency = results.reduce((sum, r) => sum + r.efficiency, 0) / results.length;
    
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text(
      `Total: ${totalPanels} panels across ${results.length} sheets | Average efficiency: ${avgEfficiency.toFixed(1)}%`,
      this.margin,
      this.pageHeight - 10
    );
  }
  
  public addSheets(results: OptimizedResult[]) {
    console.log(`=== addSheets called with ${results.length} results ===`);
    
    if (!results || results.length === 0) {
      console.error('No results provided to addSheets');
      return;
    }
    
    // 1. First page: Draw all sheets on one page in grid layout
    try {
      this.drawAllSheetsOnOnePage(results);
      console.log('All sheets drawn on one page');
    } catch (error) {
      console.error('Error drawing sheets:', error);
    }
    
    // 2. Following pages: Draw each sheet in detail
    results.forEach((result, index) => {
      console.log(`Adding detailed sheet ${index + 1} of ${results.length}`);
      try {
        // Always add new page for detailed sheets (after overview page)
        this.pdf.addPage();
        // Don't add another page inside drawSheet
        this.drawSheet(result, index, false);
        console.log(`Detailed sheet ${index + 1} added successfully`);
      } catch (error) {
        console.error(`Error adding detailed sheet ${index + 1}:`, error);
      }
    });
    
    // 3. Last page: Add panel details table
    if (results.length > 0) {
      console.log('Adding panel details page');
      try {
        this.addPanelDetailsPage(results);
        console.log('Panel details page added');
      } catch (error) {
        console.error('Error adding panel details page:', error);
      }
    }
    
    console.log(`Total pages in PDF: ${this.pdf.getNumberOfPages()}`);
  }
  
  public save(filename: string = 'cutting_layout.pdf') {
    this.pdf.save(filename);
  }
  
  public static exportToPDF(results: OptimizedResult[], furnitureData?: FurnitureData, filename?: string) {
    console.log('=== PDF Export ===');
    console.log('Total sheets to export:', results.length);
    
    // 결과가 없으면 경고
    if (!results || results.length === 0) {
      console.error('No optimization results to export');
      alert('최적화 결과가 없습니다.');
      return;
    }
    
    // panels 데이터를 furnitureData에서 추출
    const panels = furnitureData?.panels || [];
    const exporter = new PDFExporter(Array.isArray(panels) ? panels : []);
    exporter.furnitureData = furnitureData;
    
    // PDF에 모든 시트 추가
    console.log(`Exporting ${results.length} sheets to PDF`);
    exporter.addSheets(results);
    exporter.save(filename);
  }
  
  // 개별 시트 PDF 생성 메서드 (가로 방향)
  private static createIndividualSheetPDF(result: OptimizedResult, sheetNumber: number, panels?: Panel[]): jsPDF {
    // 개별 시트는 가로(landscape) 방향으로 생성
    const individualPdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3'
    });
    
    individualPdf.setFont('helvetica');
    
    // PDFExporter 인스턴스 생성하고 pdf 객체 교체
    const exporter = new PDFExporter(panels);
    exporter.pdf = individualPdf;
    exporter.pageWidth = individualPdf.internal.pageSize.getWidth();
    exporter.pageHeight = individualPdf.internal.pageSize.getHeight();
    
    // 개별 시트 그리기 (첫 페이지에)
    exporter.drawSheet(result, sheetNumber, false);
    
    return individualPdf;
  }
  
  // ZIP 파일로 내보내기 메서드
  public static async exportToZIP(results: OptimizedResult[], furnitureData?: FurnitureData) {
    console.log('=== ZIP Export with PDFs ===');
    console.log('Total sheets to export:', results.length);
    
    // 결과가 없으면 경고
    if (!results || results.length === 0) {
      console.error('No optimization results to export');
      alert('최적화 결과가 없습니다.');
      return;
    }
    
    const zip = new JSZip();
    const timestamp = new Date().toISOString().slice(0, 10);
    
    try {
      // 1. 전체 시트 PDF 생성 (모든 시트가 포함된 하나의 PDF)
      console.log('Creating overview PDF with all sheets...');
      const panels = furnitureData?.panels || [];
      const validPanels = Array.isArray(panels) ? panels : [];
      const overviewExporter = new PDFExporter(validPanels);
      overviewExporter.furnitureData = furnitureData;
      overviewExporter.addSheets(results);
      const overviewBlob = overviewExporter.pdf.output('blob');
      zip.file(`00_전체_시트_${timestamp}.pdf`, overviewBlob);
      
      // 2. 개별 시트 PDF들 생성 (가로 방향)
      console.log('Creating individual sheet PDFs...');
      for (let i = 0; i < results.length; i++) {
        try {
          const result = results[i];
          const sheetNumber = i + 1;
          
          console.log(`Creating PDF for sheet ${sheetNumber}...`);
          
          // 개별 시트 PDF 생성 (가로 방향)
          const individualPdf = PDFExporter.createIndividualSheetPDF(result, i, validPanels);
          
          // PDF를 Blob으로 변환
          const sheetBlob = individualPdf.output('blob');
          const sheetFileName = `시트_${String(sheetNumber).padStart(2, '0')}_${result.stockPanel.material || 'PB'}_${result.stockPanel.width}x${result.stockPanel.height}.pdf`;
          
          zip.file(sheetFileName, sheetBlob);
          console.log(`Added sheet ${sheetNumber} to ZIP`);
        } catch (sheetError) {
          console.error(`Error creating sheet ${i + 1}:`, sheetError);
          // 개별 시트 오류는 무시하고 계속 진행
        }
      }
      
      // 3. 패널 목록 CSV 파일 추가 (보너스)
      if (validPanels && validPanels.length > 0) {
        const csvContent = PDFExporter.generatePanelCSV(validPanels);
        zip.file(`패널_목록_${timestamp}.csv`, csvContent);
      }
      
      // 4. 최적화 결과 요약 텍스트 파일 추가
      const summaryContent = PDFExporter.generateSummary(results, furnitureData);
      zip.file(`최적화_요약_${timestamp}.txt`, summaryContent);
      
      // ZIP 파일 생성 및 다운로드
      console.log('Generating ZIP file...');
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });
      
      console.log('ZIP file created, size:', zipBlob.size);
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cutting_layout_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
      
      console.log('ZIP file downloaded successfully');
    } catch (error) {
      console.error('Error creating ZIP file:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        alert(`ZIP 파일 생성 중 오류가 발생했습니다: ${error.message}`);
      } else {
        console.error('Unknown error:', error);
        alert('ZIP 파일 생성 중 알 수 없는 오류가 발생했습니다.');
      }
    }
  }
  
  // 패널 CSV 생성 헬퍼 메서드
  private static generatePanelCSV(panels: any[]): string {
    let csv = 'ID,이름,가로,세로,두께,재질,수량\n';
    panels.forEach(panel => {
      const name = panel.label || panel.name || `Panel_${panel.id}`;
      csv += `${panel.id},"${name}",${panel.width},${panel.length || panel.height},${panel.thickness || 18},${panel.material || 'PB'},${panel.quantity || 1}\n`;
    });
    return csv;
  }
  
  // 요약 정보 생성 헬퍼 메서드
  private static generateSummary(results: OptimizedResult[], furnitureData?: FurnitureData): string {
    const projectName = furnitureData?.projectName || 'Project';
    const totalSheets = results.length;
    const totalPanels = results.reduce((sum, r) => sum + r.panels.length, 0);
    const avgEfficiency = results.reduce((sum, r) => sum + r.efficiency, 0) / results.length;
    const totalWaste = results.reduce((sum, r) => sum + r.wasteArea, 0) / 1000000;
    
    let summary = `========================================\n`;
    summary += `컷팅 최적화 결과 요약\n`;
    summary += `========================================\n\n`;
    summary += `프로젝트: ${projectName}\n`;
    summary += `생성일시: ${new Date().toLocaleString('ko-KR')}\n\n`;
    summary += `----------------------------------------\n`;
    summary += `전체 통계\n`;
    summary += `----------------------------------------\n`;
    summary += `총 시트 수: ${totalSheets}장\n`;
    summary += `총 패널 수: ${totalPanels}개\n`;
    summary += `평균 효율: ${avgEfficiency.toFixed(1)}%\n`;
    summary += `총 폐기량: ${totalWaste.toFixed(2)} m²\n\n`;
    summary += `----------------------------------------\n`;
    summary += `시트별 상세\n`;
    summary += `----------------------------------------\n`;
    
    results.forEach((result, index) => {
      summary += `\n[시트 ${index + 1}]\n`;
      summary += `원자재: ${result.stockPanel.material} ${result.stockPanel.width}x${result.stockPanel.height}mm\n`;
      summary += `패널 수: ${result.panels.length}개\n`;
      summary += `효율: ${result.efficiency.toFixed(1)}%\n`;
      summary += `사용 면적: ${(result.usedArea / 1000000).toFixed(2)} m²\n`;
      summary += `폐기 면적: ${(result.wasteArea / 1000000).toFixed(2)} m²\n`;
    });
    
    return summary;
  }
}