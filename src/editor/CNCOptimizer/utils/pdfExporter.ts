import jsPDF from 'jspdf';
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
    
    this.pageWidth = this.pdf.internal.pageSize.getWidth();
    this.pageHeight = this.pdf.internal.pageSize.getHeight();
    
    // Store panel details for reference
    if (panels) {
      panels.forEach(panel => {
        this.panelDetails.set(panel.id, panel);
      });
    }
  }
  
  private drawSheet(result: OptimizedResult, sheetNumber: number) {
    // Add new page for all sheets except the first one
    // First sheet uses the initial page created by jsPDF
    if (sheetNumber > 0) {
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
    
    // Calculate scale to fit the sheet on the page
    const drawableWidth = this.pageWidth - (this.margin * 2);
    const drawableHeight = this.pageHeight - (this.margin * 2) - 20;
    
    const scaleX = drawableWidth / result.stockPanel.width;
    const scaleY = drawableHeight / result.stockPanel.height;
    const scale = Math.min(scaleX, scaleY, 0.2); // Max scale 0.2 for readability
    
    const offsetX = this.margin;
    const offsetY = this.margin + 20;
    
    // Draw stock panel outline
    this.pdf.setDrawColor(200, 200, 200);
    this.pdf.setLineWidth(0.5);
    this.pdf.rect(
      offsetX,
      offsetY,
      result.stockPanel.width * scale,
      result.stockPanel.height * scale
    );
    
    // Draw grid
    this.pdf.setDrawColor(240, 240, 240);
    this.pdf.setLineWidth(0.1);
    
    // Vertical grid lines (every 100mm)
    for (let x = 100; x < result.stockPanel.width; x += 100) {
      this.pdf.line(
        offsetX + (x * scale),
        offsetY,
        offsetX + (x * scale),
        offsetY + (result.stockPanel.height * scale)
      );
    }
    
    // Horizontal grid lines (every 100mm)
    for (let y = 100; y < result.stockPanel.height; y += 100) {
      this.pdf.line(
        offsetX,
        offsetY + (y * scale),
        offsetX + (result.stockPanel.width * scale),
        offsetY + (y * scale)
      );
    }
    
    // Material colors
    const materialColors: { [key: string]: [number, number, number] } = {
      'PB': [232, 245, 233],    // Light green
      'MDF': [255, 243, 224],   // Light orange
      'PLY': [227, 242, 253],   // Light blue
      'HPL': [243, 229, 245],   // Light purple
      'LPM': [252, 228, 236]    // Light pink
    };
    
    // Draw panels
    result.panels.forEach((panel, index) => {
      const x = offsetX + (panel.x * scale);
      const y = offsetY + (panel.y * scale);
      const width = panel.width * scale;
      const height = panel.height * scale;
      
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
        
        // Panel name (if available)
        if (panel.name) {
          const nameText = panel.name.length > 20 ? panel.name.substring(0, 17) + '...' : panel.name;
          const nameWidth = this.pdf.getTextWidth(nameText);
          this.pdf.text(
            nameText,
            x + (width - nameWidth) / 2,
            y + height / 2 - 2
          );
        }
        
        // Panel dimensions
        this.pdf.setFontSize(7);
        this.pdf.setTextColor(100, 100, 100);
        const dimText = `${Math.round(panel.width)} × ${Math.round(panel.height)}`;
        const dimWidth = this.pdf.getTextWidth(dimText);
        this.pdf.text(
          dimText,
          x + (width - dimWidth) / 2,
          y + height / 2 + (panel.name ? 2 : 0)
        );
        
        // Material label in corner
        if (width > 25) {
          this.pdf.setFontSize(5);
          this.pdf.setTextColor(150, 150, 150);
          this.pdf.text(panel.material, x + 2, y + height - 2);
        }
      }
    });
    
    // Draw dimensions
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(100, 100, 100);
    
    // Width dimension
    this.pdf.text(
      `${result.stockPanel.width} mm`,
      offsetX + (result.stockPanel.width * scale) / 2 - 10,
      offsetY - 5
    );
    
    // Height dimension (rotated text)
    this.pdf.save();
    const heightText = `${result.stockPanel.height} mm`;
    const textX = offsetX - 15;
    const textY = offsetY + (result.stockPanel.height * scale) / 2;
    this.pdf.translate(textX, textY);
    this.pdf.rotate(-Math.PI / 2);
    this.pdf.text(heightText, 0, 0);
    this.pdf.restore();
    
    // Statistics at bottom
    this.pdf.setFontSize(8);
    this.pdf.setTextColor(0, 0, 0);
    let statsY = offsetY + (result.stockPanel.height * scale) + 10;
    
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
      
      xPos = offsetX;
      const rowData = [
        data.count.toString(),
        panelName.length > 20 ? panelName.substring(0, 17) + '...' : panelName,
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
    const text = 'Configurator 페이지에서 3D 뷰를 확인하세요';
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
        const rowData = [
          data.panel.name || `Panel ${data.panel.id}`,
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

  public addSheets(results: OptimizedResult[]) {
    console.log(`=== addSheets called with ${results.length} results ===`);
    
    // Add cutting layout sheets first - 미리보기에 있는 모든 시트 추가
    results.forEach((result, index) => {
      console.log(`Adding sheet ${index + 1} of ${results.length}`);
      this.drawSheet(result, index);
    });
    
    console.log('All sheets added, now adding furniture info page');
    
    // Add furniture information page
    this.addFurnitureInfoPage();
    
    // Then add panel details page at the end
    if (results.length > 0) {
      console.log('Adding panel details page');
      this.addPanelDetailsPage(results);
    }
    
    console.log(`Total pages in PDF: ${this.pdf.getNumberOfPages()}`);
  }
  
  public save(filename: string = 'cutting_layout.pdf') {
    this.pdf.save(filename);
  }
  
  public static exportToPDF(results: OptimizedResult[], furnitureData?: FurnitureData, filename?: string) {
    console.log('=== PDF Export ===');
    console.log('Original sheets count:', results.length);
    
    // 결과가 없으면 경고
    if (!results || results.length === 0) {
      console.error('No optimization results to export');
      alert('최적화 결과가 없습니다.');
      return;
    }
    
    // 테스트: 1장만 있으면 강제로 3장으로 만들기
    let finalResults = [...results];
    if (results.length === 1) {
      console.warn('Only 1 sheet found, creating test copies');
      const baseSheet = results[0];
      
      // 2번째 시트 (동일한 패널들 복사)
      const sheet2: OptimizedResult = {
        ...baseSheet,
        stockPanel: { ...baseSheet.stockPanel, id: 'sheet-2' },
        panels: baseSheet.panels.map(p => ({ ...p }))
      };
      
      // 3번째 시트 (동일한 패널들 복사)
      const sheet3: OptimizedResult = {
        ...baseSheet,
        stockPanel: { ...baseSheet.stockPanel, id: 'sheet-3' },
        panels: baseSheet.panels.map(p => ({ ...p }))
      };
      
      finalResults = [baseSheet, sheet2, sheet3];
      console.log('Created 3 test sheets from 1 original sheet');
    }
    
    // panels 데이터를 furnitureData에서 추출
    const panels = furnitureData?.panels || [];
    const exporter = new PDFExporter(Array.isArray(panels) ? panels : []);
    exporter.furnitureData = furnitureData;
    
    // PDF에 추가
    console.log(`Exporting ${finalResults.length} sheets to PDF`);
    exporter.addSheets(finalResults);
    exporter.save(filename);
  }
}