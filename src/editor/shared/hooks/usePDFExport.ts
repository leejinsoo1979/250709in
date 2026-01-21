import { useCallback, useState } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/store/core/furnitureStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useUIStore } from '@/store/uiStore';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { getModuleById, ModuleData } from '@/data/modules';
import { addKoreanText, addMixedText } from '@/editor/shared/utils/pdfKoreanFont';
import { exportWithPersistence } from '@/services/exportService';
import { getCurrentVersionId } from '@/services/designs.repo';
import { auth } from '@/firebase/config';

// 도어/서랍 정보 인터페이스
interface DoorDrawingItem {
  moduleId: string;
  moduleName: string;
  furnitureX: number; // 가구 X 위치 (mm)
  furnitureWidth: number; // 가구 전체 너비 (mm)
  furnitureHeight: number; // 가구 전체 높이 (mm)
  items: {
    type: 'door' | 'drawer';
    x: number; // 도어/서랍 X 위치 (가구 기준, mm)
    y: number; // 도어/서랍 Y 위치 (가구 바닥 기준, mm)
    width: number; // 도어/서랍 너비 (mm)
    height: number; // 도어/서랍 높이 (mm)
    label?: string; // 라벨 (서랍1, 서랍2 등)
  }[];
}

/**
 * 가구에서 도어/서랍 정보 추출
 */
const extractDoorInfo = (
  placedModule: PlacedModule,
  moduleData: ModuleData | undefined,
  spaceInfo: SpaceInfo
): DoorDrawingItem | null => {
  if (!moduleData) return null;

  const hasDoor = placedModule.hasDoor ?? moduleData.hasDoor ?? false;
  const sections = moduleData.modelConfig?.sections || [];

  // 도어나 서랍이 있는 섹션이 있는지 확인
  const hasDrawer = sections.some(s => s.type === 'drawer');

  if (!hasDoor && !hasDrawer) return null;

  const furnitureWidth = placedModule.customWidth || moduleData.dimensions.width;
  const furnitureHeight = placedModule.customHeight || moduleData.dimensions.height;
  const furnitureX = placedModule.position.x * 100; // Three.js 좌표를 mm로 변환

  const items: DoorDrawingItem['items'] = [];

  // 기본 두께 (측판, 하판 등)
  const basicThickness = moduleData.modelConfig?.basicThickness || 18;

  // 도어 갭 설정
  const doorTopGap = placedModule.doorTopGap ?? 10;
  const doorBottomGap = placedModule.doorBottomGap ?? 65;

  // 서랍 처리
  let currentY = basicThickness; // 하판 위부터 시작

  for (const section of sections) {
    if (section.type === 'drawer') {
      const drawerHeights = section.drawerHeights || [];
      const gapHeight = section.gapHeight || 24;

      for (let i = 0; i < drawerHeights.length; i++) {
        const drawerHeight = drawerHeights[i];

        items.push({
          type: 'drawer',
          x: basicThickness, // 좌측판 두께
          y: currentY,
          width: furnitureWidth - basicThickness * 2, // 양쪽 측판 두께 제외
          height: drawerHeight,
          label: `Drawer ${i + 1}`
        });

        currentY += drawerHeight + gapHeight;
      }
    } else if (section.type === 'hanging' || section.type === 'shelf' || section.type === 'open') {
      // 서랍이 아닌 섹션의 높이를 계산
      if (section.heightType === 'absolute') {
        currentY += section.height;
      } else {
        // 퍼센트 기반 높이 계산
        currentY += (section.height / 100) * furnitureHeight;
      }
    }
  }

  // 도어 처리 (hasDoor가 true인 경우)
  if (hasDoor) {
    const doorX = basicThickness;
    const doorY = doorBottomGap;
    const doorWidth = furnitureWidth - basicThickness * 2;
    const doorHeight = furnitureHeight - doorTopGap - doorBottomGap;

    // 도어가 서랍과 겹치지 않도록 서랍 영역 위에 도어 배치
    // 서랍이 있는 경우 도어 영역 조정
    const hasDrawerSections = sections.some(s => s.type === 'drawer');

    if (!hasDrawerSections && doorHeight > 0) {
      items.push({
        type: 'door',
        x: doorX,
        y: doorY,
        width: doorWidth,
        height: doorHeight,
        label: 'Door'
      });
    }
  }

  if (items.length === 0) return null;

  return {
    moduleId: placedModule.moduleId,
    moduleName: moduleData.name,
    furnitureX,
    furnitureWidth,
    furnitureHeight,
    items
  };
};

export type ViewType = '3d-front' | '2d-front' | '2d-top' | '2d-left' | '2d-door';

interface ViewInfo {
  id: ViewType;
  name: string;
  viewMode: '2D' | '3D';
  viewDirection?: 'front' | 'top' | 'left';
  isDoorDrawing?: boolean; // 도어도면 여부
}

const VIEW_TYPES: ViewInfo[] = [
  { id: '3d-front', name: '3D 투시도 (Perspective)', viewMode: '3D' },
  { id: '2d-front', name: '입면도 (Front View)', viewMode: '2D', viewDirection: 'front' },
  { id: '2d-top', name: '평면도 (Top View)', viewMode: '2D', viewDirection: 'top' },
  { id: '2d-left', name: '측면도 (Side View)', viewMode: '2D', viewDirection: 'left' },
  { id: '2d-door', name: '도어도면 (Door Drawing)', viewMode: '2D', viewDirection: 'front', isDoorDrawing: true },
];

/**
 * 도어도면 페이지 렌더링 함수
 * 가구 본체 없이 도어/서랍만 정면뷰로 사이즈와 함께 표시
 */
const renderDoorDrawingPage = async (
  pdf: jsPDF,
  doorItems: DoorDrawingItem[],
  pageWidth: number,
  pageHeight: number,
  borderMargin: number,
  innerMargin: number,
  titleBlockHeight: number,
  titleBlockWidth: number,
  projectTitle: string,
  currentDate: string,
  pageIndex: number,
  totalPages: number,
  colors: { black: string; gray: string; lightGray: string; text: string; white: string }
): Promise<void> => {
  // 도면 영역 정의
  const drawingAreaX = borderMargin + innerMargin + 10;
  const drawingAreaY = borderMargin + innerMargin + 20;
  const drawingAreaWidth = pageWidth - 2 * (borderMargin + innerMargin) - titleBlockWidth - 30;
  const drawingAreaHeight = pageHeight - 2 * (borderMargin + innerMargin) - 60;

  // 전체 도어/서랍의 범위 계산 (스케일 결정용)
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const doorItem of doorItems) {
    for (const item of doorItem.items) {
      const absX = doorItem.furnitureX + item.x;
      minX = Math.min(minX, absX);
      maxX = Math.max(maxX, absX + item.width);
      minY = Math.min(minY, item.y);
      maxY = Math.max(maxY, item.y + item.height);
    }
  }

  // 여유 마진 추가
  const marginMm = 100; // 100mm 여유
  minX -= marginMm;
  maxX += marginMm;
  minY -= marginMm;
  maxY += marginMm;

  const totalWidthMm = maxX - minX;
  const totalHeightMm = maxY - minY;

  // 스케일 계산 (가로/세로 중 작은 쪽에 맞춤)
  const scaleX = drawingAreaWidth / totalWidthMm;
  const scaleY = drawingAreaHeight / totalHeightMm;
  const scale = Math.min(scaleX, scaleY) * 0.85; // 85%로 줄여서 여유 확보

  // mm 좌표를 PDF 좌표로 변환하는 함수
  const toPageX = (mmX: number): number => {
    return drawingAreaX + (mmX - minX) * scale + (drawingAreaWidth - totalWidthMm * scale) / 2;
  };
  const toPageY = (mmY: number): number => {
    // Y축 반전 (PDF는 위에서 아래로, 도면은 아래에서 위로)
    return drawingAreaY + drawingAreaHeight - (mmY - minY) * scale - (drawingAreaHeight - totalHeightMm * scale) / 2;
  };

  // 스케일 표시
  const scaleText = `1:${Math.round(1 / scale)}`;
  pdf.setFontSize(8);
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Scale: ${scaleText}`, drawingAreaX + drawingAreaWidth - 50, drawingAreaY - 5);

  // 각 가구의 도어/서랍 그리기
  for (const doorItem of doorItems) {
    for (const item of doorItem.items) {
      const absX = doorItem.furnitureX + item.x;
      const pdfX = toPageX(absX);
      const pdfY = toPageY(item.y + item.height); // Y 반전으로 상단 좌표
      const pdfWidth = item.width * scale;
      const pdfHeight = item.height * scale;

      // 도어/서랍 사각형 그리기
      if (item.type === 'door') {
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.setFillColor(245, 245, 245); // 연한 회색 배경
        pdf.rect(pdfX, pdfY, pdfWidth, pdfHeight, 'FD');

        // 도어 힌지 표시 (왼쪽에 작은 원)
        pdf.setFillColor(0, 0, 0);
        pdf.circle(pdfX + 3, pdfY + 10, 2, 'F');
        pdf.circle(pdfX + 3, pdfY + pdfHeight - 10, 2, 'F');
      } else {
        // 서랍
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.setFillColor(250, 250, 250);
        pdf.rect(pdfX, pdfY, pdfWidth, pdfHeight, 'FD');

        // 서랍 손잡이 표시 (중앙에 가로선)
        const handleY = pdfY + pdfHeight / 2;
        const handleWidth = Math.min(pdfWidth * 0.3, 30);
        pdf.setLineWidth(1);
        pdf.line(pdfX + pdfWidth / 2 - handleWidth / 2, handleY, pdfX + pdfWidth / 2 + handleWidth / 2, handleY);
      }

      // 치수선 그리기
      pdf.setLineWidth(0.2);
      pdf.setDrawColor(100, 100, 100);

      // 너비 치수선 (상단)
      const dimLineOffset = 8;
      const dimY = pdfY - dimLineOffset;

      // 치수선
      pdf.line(pdfX, dimY, pdfX + pdfWidth, dimY);
      // 끝단 표시
      pdf.line(pdfX, dimY - 2, pdfX, dimY + 2);
      pdf.line(pdfX + pdfWidth, dimY - 2, pdfX + pdfWidth, dimY + 2);
      // 연장선
      pdf.setDrawColor(200, 200, 200);
      pdf.line(pdfX, pdfY, pdfX, dimY - 2);
      pdf.line(pdfX + pdfWidth, pdfY, pdfX + pdfWidth, dimY - 2);

      // 너비 텍스트
      pdf.setDrawColor(0, 0, 0);
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(7);
      pdf.text(`${Math.round(item.width)}`, pdfX + pdfWidth / 2, dimY - 2, { align: 'center' });

      // 높이 치수선 (우측)
      const dimX = pdfX + pdfWidth + dimLineOffset;

      pdf.setDrawColor(100, 100, 100);
      pdf.line(dimX, pdfY, dimX, pdfY + pdfHeight);
      // 끝단 표시
      pdf.line(dimX - 2, pdfY, dimX + 2, pdfY);
      pdf.line(dimX - 2, pdfY + pdfHeight, dimX + 2, pdfY + pdfHeight);
      // 연장선
      pdf.setDrawColor(200, 200, 200);
      pdf.line(pdfX + pdfWidth, pdfY, dimX - 2, pdfY);
      pdf.line(pdfX + pdfWidth, pdfY + pdfHeight, dimX - 2, pdfY + pdfHeight);

      // 높이 텍스트 (세로로 회전)
      pdf.setDrawColor(0, 0, 0);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`${Math.round(item.height)}`, dimX + 3, pdfY + pdfHeight / 2, { angle: 90 });

      // 라벨 표시 (도어/서랍 내부)
      if (item.label) {
        pdf.setFontSize(6);
        pdf.setTextColor(80, 80, 80);
        pdf.text(item.label, pdfX + pdfWidth / 2, pdfY + pdfHeight - 5, { align: 'center' });
      }
    }

    // 가구 이름 표시 (하단) - 영문으로만 표시
    const furnitureCenterX = toPageX(doorItem.furnitureX + doorItem.furnitureWidth / 2);
    const furnitureBottomY = toPageY(0) + 15;
    pdf.setFontSize(8);
    pdf.setTextColor(51, 51, 51);
    // 모듈 이름에서 영문/숫자만 추출하거나 간단한 이름 사용
    const simpleName = doorItem.moduleId.substring(0, 20);
    pdf.text(simpleName, furnitureCenterX, furnitureBottomY, { align: 'center' });
  }

  // 범례 추가 (좌측 하단)
  const legendX = drawingAreaX;
  const legendY = pageHeight - borderMargin - innerMargin - titleBlockHeight - 50;

  pdf.setFontSize(7);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Legend:', legendX, legendY);

  // 도어 범례
  pdf.setFillColor(245, 245, 245);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.3);
  pdf.rect(legendX, legendY + 3, 15, 10, 'FD');
  pdf.setFontSize(6);
  pdf.text('Door', legendX + 20, legendY + 10);

  // 서랍 범례
  pdf.setFillColor(250, 250, 250);
  pdf.rect(legendX + 50, legendY + 3, 15, 10, 'FD');
  pdf.line(legendX + 55, legendY + 8, legendX + 60, legendY + 8); // 손잡이
  pdf.text('Drawer', legendX + 70, legendY + 10);

  // 단위 표시
  pdf.setFontSize(6);
  pdf.setTextColor(100, 100, 100);
  pdf.text('All dimensions in mm', legendX, legendY + 20);
};

export function usePDFExport() {
  const [isExporting, setIsExporting] = useState(false);
  const { title } = useProjectStore();
  const { viewMode, view2DDirection, showGuides, showAxis, showDimensions, showDimensionsText, showFurniture, renderMode, setViewMode, setView2DDirection, setShowGuides, setShowAxis, setShowDimensions, setShowDimensionsText, setShowFurniture, setRenderMode, selectedSlotIndex, setSelectedSlotIndex } = useUIStore();

  /**
   * 단일 뷰 캡처 (slotIndex 지정 가능)
   * @param viewType 뷰 타입
   * @param targetRenderMode 렌더 모드
   * @param slotIndex 측면뷰에서 특정 슬롯만 보여줄 때 사용
   */
  const captureView = useCallback(async (viewType: ViewType, targetRenderMode: 'solid' | 'wireframe', slotIndex?: number): Promise<string> => {
    const viewInfo = VIEW_TYPES.find(v => v.id === viewType);
    if (!viewInfo) throw new Error('잘못된 뷰 타입입니다.');
    
    // 현재 뷰 설정 저장
    const originalViewMode = viewMode;
    const originalView2DDirection = view2DDirection;
    const originalShowGuides = showGuides;
    const originalShowAxis = showAxis;
    const originalShowDimensions = showDimensions;
    const originalShowDimensionsText = showDimensionsText;
    const originalShowFurniture = showFurniture;
    const originalRenderMode = renderMode;
    const originalSelectedSlotIndex = selectedSlotIndex;

    console.log('📸 PDF 캡처 시작:', {
      viewType,
      slotIndex,
      원래설정: {
        viewMode: originalViewMode,
        view2DDirection: originalView2DDirection,
        showGuides: originalShowGuides,
        showAxis: originalShowAxis,
        showDimensions: originalShowDimensions,
        showDimensionsText: originalShowDimensionsText,
        renderMode: originalRenderMode,
        selectedSlotIndex: originalSelectedSlotIndex
      }
    });

    // 요청된 뷰로 변경
    if (viewInfo.viewMode === '3D') {
      setViewMode('3D');
      // 3D 모드에서는 사용자가 선택한 렌더 모드 적용
      setRenderMode(targetRenderMode);
    } else {
      // 2D 모드로 전환하면서 그리드/축만 비활성화, 치수는 유지
      setViewMode('2D');
      setShowGuides(false); // 그리드 끄기
      setShowAxis(false); // 축 끄기
      setShowDimensions(true); // 치수는 표시해야 함!
      setShowDimensionsText(true); // 치수 텍스트도 표시해야 함!
      setShowFurniture(true); // 가구도 표시해야 함!
      setRenderMode('wireframe'); // 2D는 반드시 와이어프레임 (검정색 선)
      if (viewInfo.viewDirection) {
        setView2DDirection(viewInfo.viewDirection);
      }

      // 측면뷰에서 특정 슬롯을 지정한 경우, selectedSlotIndex 설정
      if (viewInfo.viewDirection === 'left' && slotIndex !== undefined) {
        setSelectedSlotIndex(slotIndex);
        console.log(`📸 측면뷰 슬롯 ${slotIndex} 선택`);
      } else if (viewInfo.viewDirection === 'left') {
        // 측면뷰인데 슬롯 지정이 없으면 null로 리셋
        setSelectedSlotIndex(null);
      }
    }

    // 뷰 변경이 적용되길 기다림 (3초로 증가 - 카메라 및 씬 업데이트 완료 대기)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 추가 렌더링 사이클 대기 (requestAnimationFrame 2회)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    console.log(`📸 캡처 직전 상태: viewType=${viewType}, slotIndex=${slotIndex}`);
    
    // 캔버스를 직접 찾기 (2D/3D 모두 지원)
    let canvas: HTMLCanvasElement | null = null;
    
    // 먼저 3D 뷰어 컨테이너 시도
    let viewerContainer = document.querySelector('[data-viewer-container="true"]');
    if (viewerContainer) {
      canvas = viewerContainer.querySelector('canvas');
    }
    
    // 3D 뷰어가 없으면 모든 캔버스 검색
    if (!canvas) {
      const allCanvas = document.querySelectorAll('canvas');
      // 가장 큰 캔버스를 선택 (일반적으로 메인 렌더링 캔버스)
      let maxSize = 0;
      allCanvas.forEach(c => {
        const size = c.width * c.height;
        if (size > maxSize && c.width > 100 && c.height > 100) {
          maxSize = size;
          canvas = c;
        }
      });
    }
    
    if (!canvas) {
      console.error('렌더링 캔버스를 찾을 수 없습니다.');
      throw new Error('뷰어 캔버스를 찾을 수 없습니다.');
    }
    
    viewerContainer = viewerContainer || canvas.parentElement;
    let imageData: string;
    
    console.log('Canvas 캡처 시도:', {
      viewerContainer: !!viewerContainer,
      canvas: !!canvas,
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height
    });
    
    if (canvas && (viewInfo.viewMode === '3D' || viewInfo.viewMode === '2D')) {
      // WebGL canvas가 있으면 직접 캡처
      try {
        // Three.js 렌더링 대기
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Canvas를 캡처 (최고 품질로)
        imageData = (canvas as HTMLCanvasElement).toDataURL('image/png', 1.0);
        
        // 캡처된 이미지가 비어있는지 확인
        if (!imageData || imageData === 'data:,' || imageData.length < 100) {
          throw new Error('Canvas 캡처 결과가 비어있습니다.');
        }
        
        console.log('Canvas 직접 캡처 성공:', imageData.substring(0, 50) + '...');
      } catch (canvasError) {
        console.warn('Canvas 직접 캡처 실패, html2canvas 사용:', canvasError);
        
        // Canvas 직접 캡처 실패 시 html2canvas 사용
        const capturedCanvas = await html2canvas(viewerContainer as HTMLElement, {
          backgroundColor: '#ffffff',
          scale: 4, // 더 높은 해상도로 캡처 (벡터 품질에 가깝게)
          logging: false,
          useCORS: true,
          allowTaint: true,
          // WebGL 캔버스 캡처를 위한 추가 옵션
          onclone: (clonedDoc) => {
            const clonedCanvas = clonedDoc.querySelector('canvas');
            if (clonedCanvas && canvas) {
              const ctx = clonedCanvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(canvas, 0, 0);
              }
            }
          }
        });
        
        imageData = capturedCanvas.toDataURL('image/png');
      }
    } else {
      // WebGL canvas가 없으면 기존 방식으로 캡처
      const capturedCanvas = await html2canvas(viewerContainer as HTMLElement, {
        backgroundColor: '#ffffff',
        scale: 4, // 더 높은 해상도로 캡처 (벡터 품질에 가깝게)
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      
      imageData = capturedCanvas.toDataURL('image/png');
    }
    
    // 원래 뷰로 복원
    setViewMode(originalViewMode);
    if (originalViewMode === '2D') {
      setView2DDirection(originalView2DDirection);
    }
    // 모든 설정 복원
    setShowGuides(originalShowGuides);
    setShowAxis(originalShowAxis);
    setShowDimensions(originalShowDimensions);
    setShowDimensionsText(originalShowDimensionsText);
    setShowFurniture(originalShowFurniture);
    setRenderMode(originalRenderMode);
    setSelectedSlotIndex(originalSelectedSlotIndex);

    console.log('📸 PDF 캡처 완료 - 설정 복원:', {
      viewMode: originalViewMode,
      view2DDirection: originalView2DDirection,
      showGuides: originalShowGuides,
      showAxis: originalShowAxis,
      showDimensions: originalShowDimensions,
      showDimensionsText: originalShowDimensionsText,
      renderMode: originalRenderMode,
      selectedSlotIndex: originalSelectedSlotIndex
    });

    // 복원 대기
    await new Promise(resolve => setTimeout(resolve, 500));

    return imageData;
  }, [viewMode, view2DDirection, showGuides, showAxis, showDimensions, showDimensionsText, showFurniture, renderMode, selectedSlotIndex, setViewMode, setView2DDirection, setShowGuides, setShowAxis, setShowDimensions, setShowDimensionsText, setShowFurniture, setRenderMode, setSelectedSlotIndex]);
  
  const exportToPDF = useCallback(async (
    spaceInfo: SpaceInfo,
    placedModules: PlacedModule[],
    selectedViews: ViewType[],
    targetRenderMode: 'solid' | 'wireframe' = 'solid'
  ) => {
    setIsExporting(true);
    
    try {
      // PDF 문서 생성 (A3 가로 방향 - 건축 도면 표준)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3',
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const borderMargin = 10; // 외곽 테두리 여백
      const innerMargin = 5;   // 내부 테두리 여백
      const titleBlockHeight = 40; // 타이틀 블록 높이
      const titleBlockWidth = 180; // 타이틀 블록 너비
      
      // 도면 색상 정의 (건축 도면 표준)
      const colors = {
        black: '#000000',      // 주 선
        gray: '#666666',       // 보조 선
        lightGray: '#CCCCCC',  // 가이드 선
        text: '#000000',       // 텍스트
        white: '#FFFFFF'       // 배경
      };
      
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
      
      // 단내림 구간 정보
      const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
      const normalSlotCount = spaceInfo.customColumnCount || 4;
      const droppedSlotCount = spaceInfo.droppedCeiling?.columnCount || 0;
      const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';
      const droppedWidth = spaceInfo.droppedCeiling?.width || 0;

      // 내경 너비 계산 (mm)
      const wallThickness = (spaceInfo.wallConfig?.thickness || 18) * 2;
      const innerWidth = spaceInfo.width - wallThickness;
      const normalWidth = innerWidth - droppedWidth;

      // 가구가 단내림 구간에 있는지 X 위치로 판별하는 함수
      const isModuleInDroppedZone = (module: PlacedModule): boolean => {
        // zone이 명시적으로 설정된 경우 사용
        if (module.zone === 'dropped') return true;
        if (module.zone === 'normal') return false;

        // zone이 없으면 X 위치로 판별
        if (!hasDroppedCeiling) return false;

        const moduleXMm = module.position.x * 100; // Three.js 좌표를 mm로 변환
        if (droppedPosition === 'left') {
          return moduleXMm < droppedWidth;
        } else {
          return moduleXMm >= normalWidth;
        }
      };

      // 전체 슬롯 인덱스 배열 생성 (가구 유무와 상관없이 공간 설정 기준)
      // 일반 구간: 0 ~ (normalSlotCount - 1)
      // 단내림 구간: normalSlotCount ~ (normalSlotCount + droppedSlotCount - 1)
      const totalSlotCount = normalSlotCount + (hasDroppedCeiling ? droppedSlotCount : 0);
      const allSlotIndices = Array.from({ length: totalSlotCount }, (_, i) => i);

      // 가구가 있는 슬롯만 필터링 (측면도에서 가구가 있는 슬롯만 페이지 생성)
      const slotsWithFurniture = [...new Set(placedModules.map(m => {
        if (m.slotIndex === undefined) return undefined;

        // 단내림 구간 가구면 글로벌 인덱스로 변환
        if (hasDroppedCeiling && isModuleInDroppedZone(m)) {
          return normalSlotCount + m.slotIndex;
        }
        return m.slotIndex;
      }))]
        .filter((idx): idx is number => idx !== undefined)
        .sort((a, b) => a - b);

      // 측면도 페이지용 슬롯 인덱스: 가구가 있는 슬롯만 (없으면 전체 슬롯 사용)
      const uniqueSlotIndices = slotsWithFurniture.length > 0 ? slotsWithFurniture : allSlotIndices;

      console.log('📋 PDF 내보내기 - 슬롯 정보:', {
        totalModules: placedModules.length,
        hasDroppedCeiling,
        normalSlotCount,
        droppedSlotCount,
        totalSlotCount,
        allSlotIndices,
        slotsWithFurniture,
        uniqueSlotIndices,
        modules: placedModules.map(m => ({
          id: m.id.slice(-8),
          slotIndex: m.slotIndex,
          zone: m.zone,
          posX: m.position.x.toFixed(2),
          isDropped: isModuleInDroppedZone(m)
        }))
      });

      let pageIndex = 0;

      for (let i = 0; i < selectedViews.length; i++) {
        const viewType = selectedViews[i];
        const viewInfo = VIEW_TYPES.find(v => v.id === viewType);

        if (!viewInfo) continue;

        // 측면뷰(left)의 경우 각 슬롯별로 페이지 생성
        const isSideView = viewInfo.viewDirection === 'left';
        const slotIndicesToRender = isSideView ? uniqueSlotIndices : [undefined as number | undefined];

        console.log(`📄 PDF 페이지 생성 시작: viewType=${viewType}, isSideView=${isSideView}, slotIndicesToRender=`, slotIndicesToRender);

        for (let slotIdx = 0; slotIdx < slotIndicesToRender.length; slotIdx++) {
          const currentSlotIndex = slotIndicesToRender[slotIdx];
          console.log(`  📄 슬롯 ${slotIdx}/${slotIndicesToRender.length}: currentSlotIndex=${currentSlotIndex}`);

          // 새 페이지 추가 (첫 페이지 제외)
          if (pageIndex > 0) {
            pdf.addPage();
          }
          pageIndex++;
        
        // 페이지 외곽 테두리 (건축 도면 표준)
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.7);
        pdf.rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin, 'S');
        
        // 내부 테두리
        pdf.setLineWidth(0.3);
        pdf.rect(borderMargin + innerMargin, borderMargin + innerMargin, 
                pageWidth - 2 * (borderMargin + innerMargin), 
                pageHeight - 2 * (borderMargin + innerMargin), 'S');
        
        // 타이틀 블록 영역 (우측 하단)
        const titleBlockX = pageWidth - borderMargin - innerMargin - titleBlockWidth;
        const titleBlockY = pageHeight - borderMargin - innerMargin - titleBlockHeight;
        
        // 타이틀 블록 테두리
        pdf.setLineWidth(0.5);
        pdf.rect(titleBlockX, titleBlockY, titleBlockWidth, titleBlockHeight, 'S');
        
        // 타이틀 블록 내부 구분선들
        // 회사 로고 영역
        pdf.line(titleBlockX + 40, titleBlockY, titleBlockX + 40, titleBlockY + titleBlockHeight);
        // 프로젝트 정보 영역
        pdf.line(titleBlockX, titleBlockY + 20, titleBlockX + titleBlockWidth, titleBlockY + 20);
        // 도면 정보 영역  
        pdf.line(titleBlockX + 90, titleBlockY + 20, titleBlockX + 90, titleBlockY + titleBlockHeight);
        pdf.line(titleBlockX + 140, titleBlockY + 20, titleBlockX + 140, titleBlockY + titleBlockHeight);
        
        // 회사 로고 영역
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.text('MF', titleBlockX + 20, titleBlockY + 12, { align: 'center' });
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text('MODULAR', titleBlockX + 20, titleBlockY + 17, { align: 'center' });
        pdf.text('FURNITURE', titleBlockX + 20, titleBlockY + 21, { align: 'center' });
        
        // 프로젝트 정보 필드
        pdf.setFontSize(8);
        pdf.text('PROJECT:', titleBlockX + 45, titleBlockY + 6);
        await addMixedText(pdf, projectTitle.toUpperCase(), titleBlockX + 45, titleBlockY + 11, {
          fontSize: 10,
          color: colors.text,
          fontWeight: '700'
        });
        
        pdf.text('CLIENT:', titleBlockX + 45, titleBlockY + 17);
        await addMixedText(pdf, 'MODULAR FURNITURE SYSTEM', titleBlockX + 65, titleBlockY + 17, {
          fontSize: 8,
          color: colors.text
        });
        
        // 측면뷰에서 슬롯 정보가 있으면 뷰 이름에 추가
          const displayViewName = isSideView && currentSlotIndex !== undefined
            ? `${viewInfo.name} - Slot ${currentSlotIndex + 1}`
            : viewInfo.name;

          // 총 페이지 수 계산
          const totalSideViewPages = selectedViews.filter(v => {
            const info = VIEW_TYPES.find(vi => vi.id === v);
            return info?.viewDirection === 'left';
          }).length * uniqueSlotIndices.length;
          const totalNonSideViewPages = selectedViews.filter(v => {
            const info = VIEW_TYPES.find(vi => vi.id === v);
            return info?.viewDirection !== 'left';
          }).length;
          const totalPages = totalSideViewPages + totalNonSideViewPages;

          // 도면 정보 필드 - 텍스트 위치 조정
          pdf.text('SHEET:', titleBlockX + 5, titleBlockY + 25);
          pdf.text(`${pageIndex} / ${totalPages}`, titleBlockX + 25, titleBlockY + 25);

          pdf.text('DATE:', titleBlockX + 5, titleBlockY + 31);
          pdf.text(currentDate, titleBlockX + 25, titleBlockY + 31);

          pdf.text('SCALE:', titleBlockX + 5, titleBlockY + 37);
          pdf.text('AS SHOWN', titleBlockX + 25, titleBlockY + 37);

          // 공간 사양 - 중앙 칸 정렬
          pdf.text('SPACE:', titleBlockX + 95, titleBlockY + 25);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${spaceInfo.width} × ${spaceInfo.height} × ${spaceInfo.depth}`, titleBlockX + 115, titleBlockY + 31);
          pdf.setFont('helvetica', 'normal');
          pdf.text('(W × H × D) mm', titleBlockX + 115, titleBlockY + 37);

          // 도면 타입 - 우측 칸 정렬
          pdf.text('VIEW:', titleBlockX + 145, titleBlockY + 25);
          await addMixedText(pdf, displayViewName, titleBlockX + 145, titleBlockY + 31, {
            fontSize: 8,
            color: colors.text,
            fontWeight: '500'
          });

          // 렌더링 모드
          pdf.text('RENDER:', titleBlockX + 145, titleBlockY + 37);
          pdf.text(viewInfo.isDoorDrawing ? 'DOOR DETAIL' : targetRenderMode.toUpperCase(), titleBlockX + 175, titleBlockY + 37);

          try {
          // 이미지 영역 정의 (타이틀 블록을 피해서)
          const drawingAreaX = borderMargin + innerMargin + 5;
          const drawingAreaY = borderMargin + innerMargin + 5;
          const drawingAreaWidth = pageWidth - 2 * (borderMargin + innerMargin) - 10;
          const drawingAreaHeight = pageHeight - 2 * (borderMargin + innerMargin) - titleBlockHeight - 15;

          // 도어도면인 경우 별도 렌더링
          if (viewInfo.isDoorDrawing) {
            // 도어/서랍 정보 추출
            const doorItems: DoorDrawingItem[] = [];
            for (const placedModule of placedModules) {
              const moduleData = getModuleById(placedModule.moduleId, spaceInfo);
              const doorInfo = extractDoorInfo(placedModule, moduleData, spaceInfo);
              if (doorInfo) {
                doorItems.push(doorInfo);
              }
            }

            if (doorItems.length > 0) {
              // 도어도면 렌더링
              await renderDoorDrawingPage(
                pdf,
                doorItems,
                pageWidth,
                pageHeight,
                borderMargin,
                innerMargin,
                titleBlockHeight,
                titleBlockWidth,
                projectTitle,
                currentDate,
                pageIndex,
                totalPages,
                colors
              );

              // 뷰 타이틀 (좌측 하단)
              const viewTitleY = titleBlockY + 10;
              pdf.setLineWidth(0.3);
              pdf.rect(drawingAreaX, viewTitleY, 100, 25, 'S');

              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(10);
              pdf.text('VIEW TITLE', drawingAreaX + 50, viewTitleY + 8, { align: 'center' });

              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(9);
              await addMixedText(pdf, viewInfo.name.toUpperCase(), drawingAreaX + 50, viewTitleY + 15, {
                fontSize: 9,
                color: colors.text,
                align: 'center'
              });

              pdf.setFontSize(8);
              pdf.text('SCALE: AS SHOWN', drawingAreaX + 50, viewTitleY + 21, { align: 'center' });
            } else {
              // 도어/서랍이 없는 경우 메시지 표시
              pdf.setTextColor(150, 150, 150);
              pdf.setFontSize(14);
              pdf.text('NO DOORS OR DRAWERS FOUND', pageWidth / 2, pageHeight / 2, { align: 'center' });
            }
          } else {
            // 기존 캔버스 캡처 방식
            const imageData = await captureView(viewType, targetRenderMode, currentSlotIndex);

          // 뷰 타이틀 (좌측 하단)
          const viewTitleY = titleBlockY + 10;
          pdf.setLineWidth(0.3);
          pdf.rect(drawingAreaX, viewTitleY, 100, 25, 'S');

          // 뷰 타이틀 내용 - 텍스트 위치를 박스 내부 중앙에 맞춤
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.text('VIEW TITLE', drawingAreaX + 50, viewTitleY + 8, { align: 'center' });
          
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          await addMixedText(pdf, viewInfo.name.toUpperCase(), drawingAreaX + 50, viewTitleY + 15, {
            fontSize: 9,
            color: colors.text,
            align: 'center'
          });
          
          pdf.setFontSize(8);
          pdf.text('SCALE: AS SHOWN', drawingAreaX + 50, viewTitleY + 21, { align: 'center' });
          
          // 이미지를 PDF에 삽입 (최고 품질로)
          pdf.addImage(
            imageData,
            'PNG',
            drawingAreaX,
            drawingAreaY,
            drawingAreaWidth,
            drawingAreaHeight,
            undefined,
            'NONE' // 압축 없이 원본 품질 유지 (벡터 품질에 가깝게)
          );
          } // else (기존 캔버스 캡처) 끝
        } catch (error) {
          console.error(`뷰 캡처 실패 (${viewType}):`, error);
          // 캡처 실패 시 플레이스홀더 표시
          const drawingAreaX = borderMargin + innerMargin + 5;
          const drawingAreaY = borderMargin + innerMargin + 5;
          const drawingAreaWidth = pageWidth - 2 * (borderMargin + innerMargin) - 10;
          const drawingAreaHeight = pageHeight - 2 * (borderMargin + innerMargin) - titleBlockHeight - 15;
          
          // 십자선 표시
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.2);
          pdf.line(drawingAreaX, drawingAreaY, drawingAreaX + drawingAreaWidth, drawingAreaY + drawingAreaHeight);
          pdf.line(drawingAreaX + drawingAreaWidth, drawingAreaY, drawingAreaX, drawingAreaY + drawingAreaHeight);
          
          // 에러 메시지
          pdf.setTextColor(150, 150, 150);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(14);
          pdf.text('VIEW CAPTURE FAILED', pageWidth / 2, pageHeight / 2, { align: 'center' });
        }
        
        // 저작권 표시 (상단 테두리)
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6);
        pdf.setTextColor(100, 100, 100);
        const disclaimer = 'GENERAL NOTE: DO NOT SCALE FROM DRAWINGS. USE MARKED DIMENSIONS. TO BE READ WITH ALL OTHER CONSULTANTS DRAWINGS. THE ARCHITECT TO BE NOTIFIED IMMEDIATELY SHOULD ANY DISCREPANCY OCCUR.';
        pdf.text(disclaimer, pageWidth / 2, borderMargin - 2, { align: 'center' });
        
        // 도면 번호 표시 (각 모서리)
        pdf.setFontSize(8);
        pdf.setTextColor(0, 0, 0);
        // 좌상단
        pdf.text(`${i + 1}`, borderMargin + innerMargin + 3, borderMargin + innerMargin + 5);
        // 우상단
        pdf.text(`${i + 1}`, pageWidth - borderMargin - innerMargin - 3, borderMargin + innerMargin + 5, { align: 'right' });
        // 좌하단
        pdf.text(`${i + 1}`, borderMargin + innerMargin + 3, pageHeight - borderMargin - innerMargin - 2);
        // 우하단 (타이틀 블록에 포함됨)
        } // slotIndicesToRender 루프 끝
      } // selectedViews 루프 끝

      // 마지막 페이지에 가구 목록 추가
      if (furnitureList.length > 0) {
        pdf.addPage();
        
        // 외곽 테두리
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.7);
        pdf.rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin, 'S');
        
        // 내부 테두리
        pdf.setLineWidth(0.3);
        pdf.rect(borderMargin + innerMargin, borderMargin + innerMargin, 
                pageWidth - 2 * (borderMargin + innerMargin), 
                pageHeight - 2 * (borderMargin + innerMargin), 'S');
        
        // 타이틀 블록 (우측 하단)
        const titleBlockX = pageWidth - borderMargin - innerMargin - titleBlockWidth;
        const titleBlockY = pageHeight - borderMargin - innerMargin - titleBlockHeight;
        
        pdf.setLineWidth(0.5);
        pdf.rect(titleBlockX, titleBlockY, titleBlockWidth, titleBlockHeight, 'S');
        
        // 타이틀 블록 구분선
        pdf.line(titleBlockX + 40, titleBlockY, titleBlockX + 40, titleBlockY + titleBlockHeight);
        pdf.line(titleBlockX, titleBlockY + 20, titleBlockX + titleBlockWidth, titleBlockY + 20);
        pdf.line(titleBlockX + 90, titleBlockY + 20, titleBlockX + 90, titleBlockY + titleBlockHeight);
        pdf.line(titleBlockX + 140, titleBlockY + 20, titleBlockX + 140, titleBlockY + titleBlockHeight);
        
        // 회사 로고
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.text('MF', titleBlockX + 20, titleBlockY + 12, { align: 'center' });
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text('MODULAR', titleBlockX + 20, titleBlockY + 17, { align: 'center' });
        pdf.text('FURNITURE', titleBlockX + 20, titleBlockY + 21, { align: 'center' });
        
        // 프로젝트 정보
        pdf.setFontSize(8);
        pdf.text('PROJECT:', titleBlockX + 45, titleBlockY + 6);
        await addMixedText(pdf, projectTitle.toUpperCase(), titleBlockX + 45, titleBlockY + 11, {
          fontSize: 10,
          color: colors.text,
          fontWeight: '700'
        });
        
        pdf.text('CLIENT:', titleBlockX + 45, titleBlockY + 17);
        await addMixedText(pdf, 'MODULAR FURNITURE SYSTEM', titleBlockX + 65, titleBlockY + 17, {
          fontSize: 8,
          color: colors.text
        });
        
        // 도면 정보
        pdf.text('SHEET:', titleBlockX + 5, titleBlockY + 26);
        pdf.text(`${selectedViews.length + 1} / ${selectedViews.length + 1}`, titleBlockX + 20, titleBlockY + 26);
        
        pdf.text('DATE:', titleBlockX + 5, titleBlockY + 32);
        pdf.text(currentDate, titleBlockX + 20, titleBlockY + 32);
        
        pdf.text('SCALE:', titleBlockX + 5, titleBlockY + 38);
        pdf.text('N/A', titleBlockX + 20, titleBlockY + 38);
        
        // 도면 타입
        pdf.text('DRAWING:', titleBlockX + 95, titleBlockY + 26);
        pdf.setFont('helvetica', 'bold');
        pdf.text('FURNITURE', titleBlockX + 95, titleBlockY + 32);
        pdf.text('SCHEDULE', titleBlockX + 95, titleBlockY + 36);
        pdf.setFont('helvetica', 'normal');
        
        // 총 개수
        pdf.text('TOTAL:', titleBlockX + 145, titleBlockY + 26);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${furnitureList.length} ITEMS`, titleBlockX + 145, titleBlockY + 32);
        pdf.setFont('helvetica', 'normal');
        
        // 상단 경고문
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6);
        pdf.setTextColor(100, 100, 100);
        const disclaimer = 'GENERAL NOTE: DO NOT SCALE FROM DRAWINGS. USE MARKED DIMENSIONS. TO BE READ WITH ALL OTHER CONSULTANTS DRAWINGS. THE ARCHITECT TO BE NOTIFIED IMMEDIATELY SHOULD ANY DISCREPANCY OCCUR.';
        pdf.text(disclaimer, pageWidth / 2, borderMargin - 2, { align: 'center' });
        
        // 페이지 번호
        pdf.setFontSize(8);
        pdf.setTextColor(0, 0, 0);
        pdf.text(`${selectedViews.length + 1}`, borderMargin + innerMargin + 3, borderMargin + innerMargin + 5);
        pdf.text(`${selectedViews.length + 1}`, pageWidth - borderMargin - innerMargin - 3, borderMargin + innerMargin + 5, { align: 'right' });
        pdf.text(`${selectedViews.length + 1}`, borderMargin + innerMargin + 3, pageHeight - borderMargin - innerMargin - 2);
        
        // 가구 목록 테이블
        const tableX = borderMargin + innerMargin + 10;
        const tableY = borderMargin + innerMargin + 20;
        const tableWidth = pageWidth - 2 * (borderMargin + innerMargin) - titleBlockWidth - 30;
        
        // 테이블 헤더
        let yPos = tableY;
        const colWidths = [30, 120, 40, 40, 40, 50];
        const headers = ['NO.', 'FURNITURE NAME', 'WIDTH', 'HEIGHT', 'DEPTH', 'POSITION'];
        let xPos = tableX;
        
        // 헤더 테두리
        pdf.setLineWidth(0.5);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(tableX, yPos, tableWidth, 15, 'S');
        
        // 헤더 필드
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        for (let index = 0; index < headers.length; index++) {
          pdf.text(headers[index], xPos + colWidths[index] / 2, yPos + 10, { align: 'center' });
          if (index < headers.length - 1) {
            pdf.setLineWidth(0.3);
            pdf.line(xPos + colWidths[index], yPos, xPos + colWidths[index], yPos + 15);
          }
          xPos += colWidths[index];
        }
        
        yPos += 15;
        
        // 테이블 내용
        
        for (let index = 0; index < furnitureList.length; index++) {
          const furniture = furnitureList[index];
          if (yPos > pageHeight - 30) {
            // 페이지가 넘어가면 새 페이지 추가
            pdf.addPage();
            yPos = tableY;
          }
          
          xPos = tableX;
          
          // 행 테두리
          const rowHeight = 12;
          pdf.setLineWidth(0.3);
          pdf.rect(tableX, yPos, tableWidth, rowHeight, 'S');
          
          // 가구 번호
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.text((index + 1).toString().padStart(2, '0'), xPos + colWidths[0] / 2, yPos + 8, { align: 'center' });
          xPos += colWidths[0];
          pdf.line(xPos, yPos, xPos, yPos + rowHeight);
          
          // 가구명
          const furnitureName = furniture.name.toUpperCase();
          const displayName = furnitureName.length > 30 ? furnitureName.substring(0, 28) + '...' : furnitureName;
          await addMixedText(pdf, displayName, xPos + 5, yPos + 8, {
            fontSize: 8,
            color: colors.text
          });
          xPos += colWidths[1];
          pdf.line(xPos, yPos, xPos, yPos + rowHeight);
          
          // 치수 데이터
          const dimensions = [
            furniture.width.toString(),
            furniture.height.toString(), 
            furniture.depth.toString()
          ];
          
          for (let i = 0; i < dimensions.length; i++) {
            pdf.text(dimensions[i], xPos + colWidths[2 + i] / 2, yPos + 8, { align: 'center' });
            xPos += colWidths[2 + i];
            if (i < dimensions.length - 1) {
              pdf.line(xPos, yPos, xPos, yPos + rowHeight);
            }
          }
          
          // 위치
          pdf.line(xPos, yPos, xPos, yPos + rowHeight);
          pdf.text(furniture.position.toString(), xPos + colWidths[5] / 2, yPos + 8, { align: 'center' });
          
          yPos += rowHeight;
        }
        
        // 테이블 하단 마감
        pdf.setLineWidth(0.5);
        pdf.line(tableX, yPos, tableX + tableWidth, yPos);
        
        // 주석 (테이블 하단)
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text('ALL DIMENSIONS IN MILLIMETERS', tableX, yPos + 10);
        pdf.text('VERIFY ALL DIMENSIONS ON SITE', tableX, yPos + 15);
        pdf.text('FURNITURE POSITIONS REFER TO FLOOR PLAN', tableX, yPos + 20);
      }
      
      // PDF 파일명 생성
      const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const timeStr = new Date().toTimeString().slice(0, 5).replace(':', ''); // HHMM
      const sideViewCount = selectedViews.filter(v => v === '2d-left').length;
      const slotPageCount = sideViewCount * uniqueSlotIndices.length;
      const filename = `도면_${dateStr}_${timeStr}_측면${slotPageCount}p_총${pageIndex}p.pdf`;

      console.log('📄 PDF 파일명 생성:', { filename, sideViewCount, uniqueSlotIndices, slotPageCount, pageIndex });
      
      // 직접 다운로드 (Storage 업로드 스킵)
      try {
        // PDF 직접 다운로드
        pdf.save(filename);
        console.log('✅ PDF 다운로드 성공!', filename);
        
        // 나중에 Storage 업로드 시도 (선택사항)
        // const user = auth.currentUser;
        // if (user) {
        //   const pdfBlob = pdf.output('blob');
        //   // 비동기로 백그라운드 업로드 (실패해도 무시)
        //   exportWithPersistence(pdfBlob, filename, 'pdf', teamId, designId, versionId)
        //     .catch(err => console.log('Storage 업로드 실패 (무시):', err));
        // }
      } catch (error) {
        console.error('PDF 다운로드 실패:', error);
        // 대체 다운로드 방법
        const pdfBlob = pdf.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
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
  }, [title, captureView]);
  
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