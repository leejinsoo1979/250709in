import { useCallback, useState } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/store/core/furnitureStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useUIStore } from '@/store/uiStore';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { getModuleById } from '@/data/modules';
import { addKoreanText, addMixedText } from '@/editor/shared/utils/pdfKoreanFont';

export type ViewType = '3d-front' | '2d-front' | '2d-top' | '2d-left' | '2d-right';

interface ViewInfo {
  id: ViewType;
  name: string;
  viewMode: '2D' | '3D';
  viewDirection?: 'front' | 'top' | 'left' | 'right';
}

const VIEW_TYPES: ViewInfo[] = [
  { id: '3d-front', name: '3D 정면뷰', viewMode: '3D' },
  { id: '2d-front', name: '2D 정면뷰 (치수)', viewMode: '2D', viewDirection: 'front' },
  { id: '2d-top', name: '2D 상부뷰 (치수)', viewMode: '2D', viewDirection: 'top' },
  { id: '2d-left', name: '2D 좌측뷰 (치수)', viewMode: '2D', viewDirection: 'left' },
  { id: '2d-right', name: '2D 우측뷰 (치수)', viewMode: '2D', viewDirection: 'right' },
];

export function usePDFExport() {
  const [isExporting, setIsExporting] = useState(false);
  const { title } = useProjectStore();
  const { viewMode, view2DDirection, renderMode, setViewMode, setView2DDirection, setRenderMode } = useUIStore();
  
  const captureView = useCallback(async (viewType: ViewType, targetRenderMode: 'solid' | 'wireframe'): Promise<string> => {
    const viewInfo = VIEW_TYPES.find(v => v.id === viewType);
    if (!viewInfo) throw new Error('잘못된 뷰 타입입니다.');
    
    // 현재 뷰 설정 저장
    const originalViewMode = viewMode;
    const originalView2DDirection = view2DDirection;
    const originalRenderMode = renderMode;
    
    // 요청된 뷰로 변경
    if (viewInfo.viewMode === '3D') {
      setViewMode('3D');
    } else {
      setViewMode('2D');
      if (viewInfo.viewDirection) {
        setView2DDirection(viewInfo.viewDirection);
      }
    }
    
    // 렌더 모드 설정
    setRenderMode(targetRenderMode);
    
    // 뷰 변경이 적용되길 기다림
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 3D 뷰어 컨테이너 찾기
    const viewerContainer = document.querySelector('[data-viewer-container]');
    if (!viewerContainer) {
      throw new Error('3D 뷰어를 찾을 수 없습니다.');
    }
    
    // html2canvas로 캡처
    const capturedCanvas = await html2canvas(viewerContainer as HTMLElement, {
      backgroundColor: '#ffffff',
      scale: 2, // 고화질을 위해 2배 스케일
      logging: false,
      useCORS: true,
      allowTaint: true,
    });
    
    // 원래 뷰로 복원
    setViewMode(originalViewMode);
    if (originalViewMode === '2D') {
      setView2DDirection(originalView2DDirection);
    }
    setRenderMode(originalRenderMode);
    
    // 복원 대기
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return capturedCanvas.toDataURL('image/png');
  }, [viewMode, view2DDirection, renderMode, setViewMode, setView2DDirection, setRenderMode]);
  
  const exportToPDF = useCallback(async (
    spaceInfo: SpaceInfo,
    placedModules: PlacedModule[],
    selectedViews: ViewType[],
    targetRenderMode: 'solid' | 'wireframe' = 'solid'
  ) => {
    setIsExporting(true);
    
    try {
      // PDF 문서 생성 (A4 가로 방향)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      const contentHeight = pageHeight - (margin * 2);
      
      // 프로젝트 정보
      const projectTitle = title || '가구 배치 설계도';
      const currentDate = new Date().toLocaleDateString('ko-KR');
      
      // 가구 정보 수집
      const furnitureList = placedModules.map(module => {
        const moduleData = getModuleById(module.moduleId, spaceInfo);
        return {
          name: moduleData?.name || '알 수 없음',
          width: module.customWidth || moduleData?.width || 0,
          height: module.customHeight || moduleData?.height || 0,
          depth: module.customDepth || moduleData?.depth || 0,
          position: module.slotPosition || 'N/A'
        };
      });
      
      for (let i = 0; i < selectedViews.length; i++) {
        const viewType = selectedViews[i];
        const viewInfo = VIEW_TYPES.find(v => v.id === viewType);
        
        if (!viewInfo) continue;
        
        // 새 페이지 추가 (첫 페이지 제외)
        if (i > 0) {
          pdf.addPage();
        }
        
        // 헤더 - 회사명과 로고
        pdf.setFontSize(24);
        pdf.setTextColor(16, 185, 129); // 테마 컬러
        pdf.text('MODULAR FURNITURE', margin, margin);
        
        // 프로젝트 정보
        await addMixedText(pdf, projectTitle, margin, margin + 10, {
          fontSize: 16,
          color: '#000000'
        });
        
        await addMixedText(pdf, `날짜: ${currentDate}`, margin, margin + 18, {
          fontSize: 12,
          color: '#646464'
        });
        await addMixedText(pdf, `뷰: ${viewInfo.name}`, margin, margin + 25, {
          fontSize: 12,
          color: '#646464'
        });
        await addMixedText(pdf, `렌더링: ${targetRenderMode === 'solid' ? '솔리드' : '와이어프레임'}`, margin, margin + 32, {
          fontSize: 12,
          color: '#646464'
        });
        
        // 공간 정보
        const spaceInfoText = `공간: ${spaceInfo.width}W × ${spaceInfo.height}H × ${spaceInfo.depth}D mm`;
        const furnitureInfoText = `가구: ${placedModules.length}개`;
        await addMixedText(pdf, spaceInfoText, pageWidth - margin - 80, margin + 10, {
          fontSize: 12,
          color: '#646464'
        });
        await addMixedText(pdf, furnitureInfoText, pageWidth - margin - 80, margin + 18, {
          fontSize: 12,
          color: '#646464'
        });
        
        // 구분선
        pdf.setDrawColor(220, 220, 220);
        pdf.line(margin, margin + 38, pageWidth - margin, margin + 38);
        
        try {
          // 뷰 캡처
          const imageData = await captureView(viewType, targetRenderMode);
          
          // 이미지 크기 계산 (비율 유지)
          const imageAreaHeight = contentHeight - 43;
          const imageAreaWidth = contentWidth;
          
          // 이미지를 PDF에 삽입
          pdf.addImage(
            imageData,
            'PNG',
            margin,
            margin + 43,
            imageAreaWidth,
            imageAreaHeight,
            undefined,
            'FAST'
          );
        } catch (error) {
          console.error(`뷰 캡처 실패 (${viewType}):`, error);
          // 캡처 실패 시 플레이스홀더 표시
          pdf.setFillColor(245, 245, 245);
          pdf.rect(margin, margin + 43, contentWidth, contentHeight - 43, 'F');
          
          await addKoreanText(pdf, '뷰 캡처에 실패했습니다', pageWidth / 2, pageHeight / 2, {
            fontSize: 14,
            color: '#969696',
            align: 'center'
          });
        }
        
        // 하단 정보
        await addMixedText(pdf, `페이지 ${i + 1} / ${selectedViews.length}`, pageWidth / 2, pageHeight - 10, {
          fontSize: 10,
          color: '#969696',
          align: 'center'
        });
        
        // 하단 구분선
        pdf.setDrawColor(220, 220, 220);
        pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
      }
      
      // 마지막 페이지에 가구 목록 추가
      if (furnitureList.length > 0) {
        pdf.addPage();
        
        // 헤더
        pdf.setFontSize(24);
        pdf.setTextColor(16, 185, 129);
        pdf.text('MODULAR FURNITURE', margin, margin);
        
        await addMixedText(pdf, '가구 목록', margin, margin + 10, {
          fontSize: 16,
          color: '#000000'
        });
        
        await addMixedText(pdf, `총 ${furnitureList.length}개 가구`, margin, margin + 18, {
          fontSize: 12,
          color: '#646464'
        });
        
        // 구분선
        pdf.setDrawColor(220, 220, 220);
        pdf.line(margin, margin + 25, pageWidth - margin, margin + 25);
        
        // 테이블 헤더
        let yPos = margin + 35;
        
        const colWidths = [80, 30, 30, 30, 30];
        const headers = ['가구명', '폭(mm)', '높이(mm)', '깊이(mm)', '위치'];
        let xPos = margin;
        
        // 헤더 배경
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margin, yPos - 5, contentWidth, 15, 'F');
        
        for (let index = 0; index < headers.length; index++) {
          await addKoreanText(pdf, headers[index], xPos + 2, yPos + 3, {
            fontSize: 11,
            color: '#000000'
          });
          xPos += colWidths[index];
        }
        
        yPos += 15;
        
        // 테이블 내용
        
        for (let index = 0; index < furnitureList.length; index++) {
          const furniture = furnitureList[index];
          if (yPos > pageHeight - 30) {
            // 페이지가 넘어가면 새 페이지 추가
            pdf.addPage();
            yPos = margin + 20;
          }
          
          xPos = margin;
          
          // 홀수 행 배경색
          if (index % 2 === 0) {
            pdf.setFillColor(250, 250, 250);
            pdf.rect(margin, yPos - 5, contentWidth, 12, 'F');
          }
          
          // 테이블 데이터
          const rowData = [
            furniture.name,
            furniture.width.toString(),
            furniture.height.toString(),
            furniture.depth.toString(),
            furniture.position.toString()
          ];
          
          for (let colIndex = 0; colIndex < rowData.length; colIndex++) {
            const data = rowData[colIndex];
            const text = data.length > 20 ? data.substring(0, 18) + '...' : data;
            await addMixedText(pdf, text, xPos + 2, yPos + 3, {
              fontSize: 11,
              color: '#3c3c3c'
            });
            xPos += colWidths[colIndex];
          }
          
          // 행 구분선
          pdf.setDrawColor(240, 240, 240);
          pdf.line(margin, yPos + 7, pageWidth - margin, yPos + 7);
          
          yPos += 12;
        }
        
        // 하단 정보
        await addMixedText(pdf, `페이지 ${selectedViews.length + 1} / ${selectedViews.length + 1}`, pageWidth / 2, pageHeight - 10, {
          fontSize: 10,
          color: '#969696',
          align: 'center'
        });
      }
      
      // PDF 다운로드
      const filename = `${projectTitle.replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${currentDate.replace(/\./g, '')}.pdf`;
      pdf.save(filename);
      
      return {
        success: true,
        message: 'PDF가 성공적으로 생성되었습니다.',
        filename
      };
      
    } catch (error) {
      console.error('PDF 생성 중 오류:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'PDF 생성 중 오류가 발생했습니다.'
      };
    } finally {
      setIsExporting(false);
    }
  }, [title]);
  
  const canExportPDF = useCallback((spaceInfo: SpaceInfo | null, placedModules: PlacedModule[]) => {
    return spaceInfo !== null && placedModules.length > 0;
  }, []);
  
  const getExportStatusMessage = useCallback((spaceInfo: SpaceInfo | null, placedModules: PlacedModule[]) => {
    if (!spaceInfo) {
      return '공간 정보가 없습니다.';
    }
    if (placedModules.length === 0) {
      return '배치된 가구가 없습니다.';
    }
    return '내보낼 준비가 완료되었습니다.';
  }, []);
  
  return {
    exportToPDF,
    canExportPDF,
    getExportStatusMessage,
    isExporting,
    VIEW_TYPES
  };
}