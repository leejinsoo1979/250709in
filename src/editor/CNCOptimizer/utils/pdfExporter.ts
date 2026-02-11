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

      // ★★★ 타공(보링) 표시 - CuttingLayoutPreview2.tsx 완전 복사 ★★★
      const isDoorPanel = panel.name?.includes('도어') || panel.name?.includes('Door');
      if (panel.boringPositions && panel.boringPositions.length > 0 && !isDoorPanel) {
        const originalWidth = panel.width;
        const originalHeight = panel.height;

        // 시트에 배치된 크기 (회전 고려)
        const placedWidth = panel.rotated ? originalHeight : originalWidth;
        const placedHeight = panel.rotated ? originalWidth : originalHeight;

        // 서랍 측판/앞판 여부 확인
        const isDrawerSidePanel = panel.name?.includes('서랍') &&
          (panel.name?.includes('좌측판') || panel.name?.includes('우측판'));
        const isDrawerFrontPanel = panel.name?.includes('서랍') && panel.name?.includes('앞판');

        // 보링 X위치 결정 (깊이 방향)
        let depthPositions: number[] = [];
        if (isDrawerSidePanel) {
          if (panel.boringDepthPositions && panel.boringDepthPositions.length > 0) {
            depthPositions = panel.boringDepthPositions;
          } else {
            const sideThickness = 15;
            depthPositions = [sideThickness / 2, originalWidth - sideThickness / 2];
          }
        } else if (isDrawerFrontPanel) {
          if (panel.boringDepthPositions && panel.boringDepthPositions.length > 0) {
            depthPositions = panel.boringDepthPositions;
          } else {
            const edgeOffset = 50;
            depthPositions = [edgeOffset, originalWidth / 2, originalWidth - edgeOffset];
          }
        } else {
          // 가구 측판: 선반핀 보링 (3개)
          // 좌측판/우측판에 따라 앞/뒤 방향이 대칭
          const isLeftSidePanel = panel.name?.includes('좌측');
          const backPanelThickness = 18;
          const edgeOffset = 50;

          let frontX: number, backX: number;
          if (isLeftSidePanel) {
            frontX = edgeOffset;
            backX = originalWidth - backPanelThickness - edgeOffset;
          } else {
            frontX = originalWidth - edgeOffset;
            backX = backPanelThickness + edgeOffset;
          }
          const safeBackX = isLeftSidePanel ? Math.max(backX, frontX + 40) : Math.min(backX, frontX - 40);
          const safeCenterX = (frontX + safeBackX) / 2;
          depthPositions = isLeftSidePanel ? [frontX, safeCenterX, safeBackX] : [safeBackX, safeCenterX, frontX];
        }

        // 보링 홀 그리기
        const holeDiameter = 3; // mm
        const holeRadius = holeDiameter / 2 * scale;

        this.pdf.setDrawColor(0, 0, 0);
        this.pdf.setFillColor(255, 255, 255);
        this.pdf.setLineWidth(0.1);

        // ★★★ 옵티마이저와 완전 동일한 좌표 계산 ★★★
        // 옵티마이저에서 패널 시트 좌표: x = panel.x, y = panel.y
        // PDF에서는 isRotated에 따라 x, y가 변환되어 있음
        // 따라서 원본 시트 좌표를 기준으로 보링 위치 계산 후 PDF 좌표로 변환

        panel.boringPositions.forEach((boringPosMm: number) => {
          depthPositions.forEach((depthPosMm: number) => {
            // 옵티마이저와 동일하게 시트 좌표 계산
            let sheetBoringX: number, sheetBoringY: number;

            if (isDrawerSidePanel || isDrawerFrontPanel) {
              // 서랍 측판/앞판: boringPosMm → X, depthPosMm → Y
              sheetBoringX = panel.x + boringPosMm;
              sheetBoringY = panel.y + depthPosMm;
            } else if (panel.rotated) {
              // 가구 측판 (rotated=true)
              const scaleX = placedWidth / originalWidth;
              const scaleY = placedHeight / originalHeight;
              sheetBoringX = panel.x + depthPosMm * scaleX;
              sheetBoringY = panel.y + boringPosMm * scaleY;
            } else {
              // 가구 측판 (rotated=false)
              sheetBoringX = panel.x + depthPosMm;
              sheetBoringY = panel.y + boringPosMm;
            }

            // 시트 좌표를 PDF 좌표로 변환
            let pdfX: number, pdfY: number;
            if (isRotated) {
              // PDF 시트 회전: 시트Y → PDF X, (stockWidth - 시트X) → PDF Y
              pdfX = offsetX + sheetBoringY * scale;
              pdfY = offsetY + (result.stockPanel.width - sheetBoringX) * scale;
            } else {
              pdfX = offsetX + sheetBoringX * scale;
              pdfY = offsetY + sheetBoringY * scale;
            }

            // 원 그리기 (타공 홀)
            this.pdf.circle(pdfX, pdfY, holeRadius, 'FD');
          });
        });
      }

      // ★★★ 도어 패널 보링 표시 (힌지컵 Ø35 + 나사홀 Ø8) ★★★
      if (isDoorPanel && panel.boringPositions && panel.boringPositions.length > 0) {
        const originalWidth = panel.width;
        const originalHeight = panel.height;

        // 힌지컵 좌표
        const cupYPositions = panel.boringPositions;
        const cupXPositions = (panel as any).boringDepthPositions || [];

        // ★★★ 나사홀 좌표: screwPositions가 없으면 힌지컵에서 직접 계산 ★★★
        const SCREW_ROW_DISTANCE = 9.5; // 힌지컵 중심에서 나사열까지 (도어 안쪽 방향)
        const SCREW_Y_OFFSET = ((panel as any).screwHoleSpacing || 45) / 2; // A-type: 22.5mm, B-type: 24mm
        let screwYPositions: number[] = (panel as any).screwPositions || [];
        let screwXPositions: number[] = (panel as any).screwDepthPositions || [];
        if (screwYPositions.length === 0 && cupYPositions.length > 0) {
          screwYPositions = cupYPositions.flatMap((cy: number) => [cy - SCREW_Y_OFFSET, cy + SCREW_Y_OFFSET]);
        }
        if (screwXPositions.length === 0 && cupXPositions.length > 0) {
          const cupX = cupXPositions[0];
          const isLeftHinge = cupX < originalWidth / 2;
          // 나사홀은 힌지컵보다 도어 안쪽(중심 방향)에 위치
          screwXPositions = [isLeftHinge ? cupX + SCREW_ROW_DISTANCE : cupX - SCREW_ROW_DISTANCE];
        }

        const cupRadiusPdf = (35 / 2) * scale; // Ø35mm
        const screwRadiusPdf = (8 / 2) * scale; // Ø8mm

        this.pdf.setDrawColor(0, 0, 0);
        this.pdf.setFillColor(255, 255, 255);
        this.pdf.setLineWidth(0.15);

        // 시트→PDF 좌표 변환 헬퍼
        const toPdfCoords = (posMmX: number, posMmY: number): [number, number] => {
          let sheetX: number, sheetY: number;
          if (panel.rotated) {
            const placedWidth = originalHeight;
            const placedHeight = originalWidth;
            const scaleX = placedWidth / originalWidth;
            const scaleY = placedHeight / originalHeight;
            sheetX = panel.x + posMmX * scaleX;
            sheetY = panel.y + posMmY * scaleY;
          } else {
            sheetX = panel.x + posMmX;
            sheetY = panel.y + posMmY;
          }
          if (isRotated) {
            return [offsetX + sheetY * scale, offsetY + (result.stockPanel.width - sheetX) * scale];
          } else {
            return [offsetX + sheetX * scale, offsetY + sheetY * scale];
          }
        };

        // 힌지컵 그리기 (Ø35)
        cupXPositions.forEach((cx: number) => {
          cupYPositions.forEach((cy: number) => {
            const [px, py] = toPdfCoords(cx, cy);
            this.pdf.circle(px, py, cupRadiusPdf, 'FD');
            // 중심 십자
            this.pdf.setLineWidth(0.05);
            const cs = 2 * scale;
            this.pdf.line(px - cs, py, px + cs, py);
            this.pdf.line(px, py - cs, px, py + cs);
            this.pdf.setLineWidth(0.15);
          });
        });

        // 나사홀 그리기 (Ø8 + 센터 십자)
        screwXPositions.forEach((sx: number) => {
          screwYPositions.forEach((sy: number) => {
            const [px, py] = toPdfCoords(sx, sy);
            this.pdf.circle(px, py, screwRadiusPdf, 'FD');
            // 중심 십자
            this.pdf.setLineWidth(0.05);
            const cs = 1.5 * scale;
            this.pdf.line(px - cs, py, px + cs, py);
            this.pdf.line(px, py - cs, px, py + cs);
            this.pdf.setLineWidth(0.15);
          });
        });

        this.pdf.setLineDashPattern([], 0);
      }

      // ★★★ 측판 힌지 브라켓 타공 표시 (Ø3mm) ★★★
      if ((panel as any).isBracketSide && (panel as any).bracketBoringPositions && (panel as any).bracketBoringPositions.length > 0) {
        const originalWidth = panel.width;
        const originalHeight = panel.height;

        const bracketXPositions: number[] = (panel as any).bracketBoringDepthPositions || [20, 52];
        const bracketRadiusPdf = (3 / 2) * scale; // Ø3mm

        this.pdf.setDrawColor(0, 0, 0);
        this.pdf.setFillColor(255, 255, 255);
        this.pdf.setLineWidth(0.1);

        // 시트→PDF 좌표 변환 헬퍼
        // Y좌표: 패널 하단 기준(0=하단) → 캔버스 좌표(0=상단)로 변환
        const toBracketPdfCoords = (posMmX: number, posMmY: number): [number, number] => {
          const flippedY = originalHeight - posMmY;
          let sheetX: number, sheetY: number;
          if (panel.rotated) {
            const placedWidth = originalHeight;
            const placedHeight = originalWidth;
            const scaleX = placedWidth / originalWidth;
            const scaleY = placedHeight / originalHeight;
            sheetX = panel.x + posMmX * scaleX;
            sheetY = panel.y + flippedY * scaleY;
          } else {
            sheetX = panel.x + posMmX;
            sheetY = panel.y + flippedY;
          }
          if (isRotated) {
            return [offsetX + sheetY * scale, offsetY + (result.stockPanel.width - sheetX) * scale];
          } else {
            return [offsetX + sheetX * scale, offsetY + sheetY * scale];
          }
        };

        ((panel as any).bracketBoringPositions as number[]).forEach((yPosMm: number) => {
          bracketXPositions.forEach((xPosMm: number) => {
            const [px, py] = toBracketPdfCoords(xPosMm, yPosMm);
            this.pdf.circle(px, py, bracketRadiusPdf, 'FD');
            // 센터 십자
            this.pdf.setLineWidth(0.03);
            const cs = 1 * scale;
            this.pdf.line(px - cs, py, px + cs, py);
            this.pdf.line(px, py - cs, px, py + cs);
            this.pdf.setLineWidth(0.1);
          });
        });
      }

      // ★★★ 홈가공 표시 ★★★
      // 가구 측판 백패널 홈
      const isFurnitureSidePanel = (panel.name?.includes('좌측') || panel.name?.includes('우측') || panel.name?.includes('측판'))
        && !panel.name?.includes('서랍')
        && !panel.name?.includes('도어');

      if (isFurnitureSidePanel) {
        const originalWidth = panel.width;   // 측판의 깊이 방향 (가구 깊이)
        const originalHeight = panel.height; // 측판의 높이 방향
        // 좌측판/우측판에 따라 백패널 방향이 대칭
        const isLeftSidePanelForGroove = panel.name?.includes('좌측');
        const backPanelDepthOffset = 17;
        const grooveWidth = 10;
        const grooveStartX = isLeftSidePanelForGroove
          ? originalWidth - backPanelDepthOffset - grooveWidth // 좌측판: 뒤=X=width쪽
          : backPanelDepthOffset; // 우측판: 뒤=X=0쪽

        this.pdf.setDrawColor(100, 100, 100);
        this.pdf.setLineWidth(0.1);
        this.pdf.setLineDashPattern([1, 1], 0);

        // 먼저 시트 좌표 계산 (옵티마이저와 동일)
        let sheetGx: number, sheetGy: number, sheetGw: number, sheetGh: number;

        if (panel.rotated) {
          // 패널이 90도 회전된 경우:
          // 원래: width=깊이, height=높이 → 회전 후: X축=높이, Y축=깊이
          // 홈은 깊이 방향으로 있으므로 Y축을 따라 세로 줄로 표시
          sheetGx = panel.x; // 패널 왼쪽 끝부터
          sheetGw = originalHeight; // 홈 길이 (높이 방향 전체)
          sheetGy = panel.y + grooveStartX; // 홈 시작 Y 위치
          sheetGh = grooveWidth; // 홈 폭
        } else {
          // 패널이 회전 안된 경우:
          // X축=깊이, Y축=높이
          // 홈은 깊이 방향이므로 특정 X 위치에 세로 줄로 표시
          sheetGx = panel.x + grooveStartX; // 홈 시작 X 위치
          sheetGw = grooveWidth; // 홈 폭
          sheetGy = panel.y; // 패널 위쪽 끝부터
          sheetGh = originalHeight; // 홈 길이 (높이 방향 전체)
        }

        // 시트 좌표를 PDF 좌표로 변환
        let gx: number, gy: number, gw: number, gh: number;

        if (isRotated) {
          // PDF 시트 회전: 시트Y → PDF X, (stockWidth - 시트X) → PDF Y
          gx = offsetX + sheetGy * scale;
          gy = offsetY + (result.stockPanel.width - sheetGx - sheetGw) * scale;
          gw = sheetGh * scale;
          gh = sheetGw * scale;
        } else {
          gx = offsetX + sheetGx * scale;
          gy = offsetY + sheetGy * scale;
          gw = sheetGw * scale;
          gh = sheetGh * scale;
        }

        this.pdf.rect(gx, gy, gw, gh, 'S');
        this.pdf.setLineDashPattern([], 0);
      }

      // 서랍 패널 바닥판 홈 - 옵티마이저와 동일한 방식
      const isDrawerPanel = panel.name?.includes('서랍');
      if (panel.groovePositions && panel.groovePositions.length > 0 && isDrawerPanel) {
        this.pdf.setDrawColor(100, 100, 100);
        this.pdf.setLineWidth(0.1);
        this.pdf.setLineDashPattern([1, 1], 0);

        const isDrawerSidePanelForGroove = panel.name?.includes('서랍') &&
          (panel.name?.includes('좌측판') || panel.name?.includes('우측판'));
        const isDrawerFrontBackPanel = panel.name?.includes('서랍') &&
          (panel.name?.includes('앞판') || panel.name?.includes('뒷판'));

        panel.groovePositions.forEach((groove: { y: number; height: number; depth: number }) => {
          // groove.y = 하단에서의 Y 위치 (height 기준)
          // groove.height = 홈 높이
          // 옵티마이저: 서랍 측판/앞뒷판은 시트 좌측(X축)에 세로(Y축) 전체로 그림

          // 옵티마이저에서의 시트 좌표 (x, y는 패널 위치)
          // gx = x + grooveY, gw = grooveH, gy = y, gh = height
          let sheetGx: number, sheetGy: number, sheetGw: number, sheetGh: number;

          if (isDrawerSidePanelForGroove || isDrawerFrontBackPanel) {
            // 서랍 측판/앞뒷판: 좌측(X축)에 세로(Y축) 전체
            // 시트 좌표: x + groove.y, 너비 groove.height, y부터 height 전체
            sheetGx = panel.x + groove.y;
            sheetGw = groove.height;
            sheetGy = panel.y;
            sheetGh = panel.height;
          } else {
            // 기타: width 방향 전체에 groove.y 위치
            sheetGx = panel.x;
            sheetGw = panel.width;
            sheetGy = panel.y + groove.y;
            sheetGh = groove.height;
          }

          // 시트 좌표를 PDF 좌표로 변환
          let gx: number, gy: number, gw: number, gh: number;
          if (isRotated) {
            // PDF 시트 회전: 시트Y → PDF X, (stockWidth - 시트X) → PDF Y
            gx = offsetX + sheetGy * scale;
            gy = offsetY + (result.stockPanel.width - sheetGx - sheetGw) * scale;
            gw = sheetGh * scale;
            gh = sheetGw * scale;
          } else {
            gx = offsetX + sheetGx * scale;
            gy = offsetY + sheetGy * scale;
            gw = sheetGw * scale;
            gh = sheetGh * scale;
          }

          this.pdf.rect(gx, gy, gw, gh, 'S');
        });

        this.pdf.setLineDashPattern([], 0);
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
      
      // 3. 패널 목록 CSV 파일 추가
      if (validPanels && validPanels.length > 0) {
        const csvContent = PDFExporter.generatePanelCSV(validPanels);
        zip.file(`패널_목록_${timestamp}.csv`, csvContent);
      }

      // 4. 보링(타공) 좌표 CSV 파일 추가
      const allPanelsFromResults: Panel[] = [];
      results.forEach(result => {
        result.panels.forEach(panel => {
          allPanelsFromResults.push(panel as Panel);
        });
      });

      const panelsWithBoring = allPanelsFromResults.filter(
        panel => panel.boringPositions && panel.boringPositions.length > 0
      );

      if (panelsWithBoring.length > 0) {
        const boringCsvContent = PDFExporter.generateBoringCSV(panelsWithBoring);
        zip.file(`보링_좌표_${timestamp}.csv`, boringCsvContent);
      }

      // 5. 최적화 결과 요약 텍스트 파일 추가
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

  // 보링(타공) CSV 생성 헬퍼 메서드
  private static generateBoringCSV(panels: Panel[]): string {
    let csv = '패널ID,패널이름,가구ID,가구이름,보링X(mm),보링Y(mm),직경(mm),깊이(mm)\n';

    panels.forEach(panel => {
      const panelName = panel.name || `Panel_${panel.id}`;
      const furnitureId = (panel as any).furnitureId || '';
      const furnitureName = (panel as any).furnitureName || '';

      // boringPositions = Y위치 배열 (높이 방향)
      // boringDepthPositions = X위치 배열 (깊이 방향)
      const yPositions = panel.boringPositions || [];
      const xPositions = (panel as any).boringDepthPositions || [];

      // 기본 X위치 (depthPositions가 없는 경우)
      const defaultXPositions = xPositions.length > 0 ? xPositions : [50, panel.width / 2, panel.width - 50];

      // 각 Y위치 × X위치 조합으로 보링 좌표 출력
      yPositions.forEach((yPos: number) => {
        defaultXPositions.forEach((xPos: number) => {
          csv += `${panel.id},"${panelName}","${furnitureId}","${furnitureName}",${xPos.toFixed(1)},${yPos.toFixed(1)},5,13\n`;
        });
      });
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