import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useUIStore } from '@/store/uiStore';
import styles from './PDFTemplatePreview.module.css';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';

// 용지 규격 타입
type PaperSize = 'A3' | 'A4' | 'A2';
type Orientation = 'landscape' | 'portrait';

interface PaperDimensions {
  width: number;  // mm
  height: number; // mm
  displayWidth: number; // px for preview
  displayHeight: number; // px for preview
}

// 용지 규격 정의 (가로 방향 기준)
const PAPER_SIZES_BASE: Record<PaperSize, PaperDimensions> = {
  A4: { width: 297, height: 210, displayWidth: 891, displayHeight: 630 },
  A3: { width: 420, height: 297, displayWidth: 1260, displayHeight: 891 },
  A2: { width: 594, height: 420, displayWidth: 1782, displayHeight: 1260 }
};

// 방향에 따른 용지 크기 계산
const getPaperDimensions = (size: PaperSize, orientation: Orientation): PaperDimensions => {
  const base = PAPER_SIZES_BASE[size];
  if (orientation === 'portrait') {
    return {
      width: base.height,
      height: base.width,
      displayWidth: base.displayHeight,
      displayHeight: base.displayWidth
    };
  }
  return base;
};

interface PDFTemplatePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  capturedViews: {
    top?: string;
    front?: string;
    side?: string;
    door?: string;
    right?: string;
    base?: string;
    iso?: string;
    detail1?: string;
    detail2?: string;
    section?: string;
    [key: string]: string | undefined;
  };
}

interface ViewPosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

interface ViewMenuItem {
  id: string;
  label: string;
  img?: string;
}

// Available views for dragging
const AVAILABLE_VIEWS: ViewMenuItem[] = [
  { id: 'top', label: 'TOP VIEW' },
  { id: 'front', label: 'Front VIEW' },
  { id: 'side', label: 'Left VIEW' },
  { id: 'door', label: 'Door Front' },
  { id: 'right', label: 'Right VIEW' },
  { id: 'base', label: 'Base Frame' },
  { id: 'iso', label: 'ISO VIEW' },
  { id: 'detail1', label: 'Detail 1' },
  { id: 'detail2', label: 'Detail 2' },
  { id: 'section', label: 'Section A-A' }
];

const SNAP_THRESHOLD = 10; // 스냅이 작동하는 거리 (픽셀)
const GRID_SIZE = 20; // 그리드 크기

const PDFTemplatePreview: React.FC<PDFTemplatePreviewProps> = ({ isOpen, onClose, capturedViews }) => {
  const [selectedPaperSize, setSelectedPaperSize] = useState<PaperSize>('A3');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [isGenerating, setIsGenerating] = useState(false);
  const [draggingView, setDraggingView] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [viewPositions, setViewPositions] = useState<ViewPosition[]>([]);
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});
  const [isDraggingFromMenu, setIsDraggingFromMenu] = useState(false);
  const [draggedMenuItem, setDraggedMenuItem] = useState<ViewMenuItem | null>(null);
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [dragPreviewPos, setDragPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingView, setResizingView] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, viewX: 0, viewY: 0, direction: '' });
  const [alignmentGuides, setAlignmentGuides] = useState<{ vertical: number[], horizontal: number[] }>({ vertical: [], horizontal: [] });
  const [previewScale, setPreviewScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<ViewPosition[][]>([[]]);
  const [viewerOverlay, setViewerOverlay] = useState<{
    isOpen: boolean;
    viewId: string | null;
    viewType: string | null;
  }>({ isOpen: false, viewId: null, viewType: null });
  const [localCapturedViews, setLocalCapturedViews] = useState<{
    [key: string]: string;
  }>({});
  const previewRef = useRef<HTMLDivElement>(null);
  const drawingAreaRef = useRef<HTMLDivElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  
  const { title } = useProjectStore();
  const { spaceInfo, materialConfig } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { viewMode, view2DDirection, setViewMode, setView2DDirection, renderMode, setRenderMode } = useUIStore();

  const paperDimensions = useMemo(() => 
    getPaperDimensions(selectedPaperSize, orientation), 
    [selectedPaperSize, orientation]
  );

  const scale = useMemo(() => 
    Math.min(
      (window.innerWidth * 0.8) / paperDimensions.displayWidth,
      (window.innerHeight * 0.7) / paperDimensions.displayHeight,
      1
    ) * previewScale,
    [paperDimensions, previewScale]
  );

  // 메뉴에서 드래그 시작
  const handleMenuItemDragStart = (item: ViewMenuItem, e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingFromMenu(true);
    setDraggedMenuItem(item);
    
    // 드래그 프리뷰를 마우스 중앙에 위치
    setDragOffset({
      x: 100, // 프리뷰 너비의 절반
      y: 75   // 프리뷰 높이의 절반
    });
    
    // 초기 프리뷰 위치 설정
    setDragPreviewPos({
      x: e.clientX - 100,
      y: e.clientY - 75
    });
  };

  // 캔버스에서 드래그 시작
  const handleViewMouseDown = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const view = viewPositions.find(v => v.id === viewId);
    if (!view) return;
    
    setSelectedView(viewId);
    setDraggingView(viewId);
    setDragOffset({
      x: e.clientX - view.x * scale,
      y: e.clientY - view.y * scale
    });
  };

  // 뷰 더블클릭 핸들러
  const handleViewDoubleClick = (viewId: string, viewType: string) => {
    setViewerOverlay({
      isOpen: true,
      viewId: viewId,
      viewType: viewType
    });
  };

  // 뷰어에서 캡처 버튼 핸들러
  const handleCaptureFromViewer = async () => {
    if (!viewerContainerRef.current || !viewerOverlay.viewId) return;

    try {
      // 잠시 대기하여 렌더링이 완료되도록 함
      await new Promise(resolve => setTimeout(resolve, 500));

      // 뷰어 내부의 canvas 찾기
      const canvas = viewerContainerRef.current.querySelector('canvas');
      if (!canvas) {
        console.error('Canvas not found in viewer');
        return;
      }

      // Canvas를 이미지로 변환
      const dataUrl = canvas.toDataURL('image/png');
      
      // 캡처한 이미지를 해당 뷰에 저장
      const viewType = viewerOverlay.viewType;
      const viewId = viewerOverlay.viewId;
      
      if (viewType && viewId) {
        // 로컬 캡처 뷰 업데이트
        setLocalCapturedViews(prev => ({
          ...prev,
          [`${viewId}_${viewType}`]: dataUrl
        }));
        
        console.log('View captured successfully:', viewType);
      }

      // 오버레이 닫기
      setViewerOverlay({ isOpen: false, viewId: null, viewType: null });
    } catch (error) {
      console.error('Error capturing view:', error);
    }
  };

  // 뷰 크기 조정
  const handleViewScale = (viewId: string, delta: number) => {
    setViewPositions(prev => prev.map(view => 
      view.id === viewId 
        ? { ...view, scale: Math.max(0.5, Math.min(2, view.scale + delta)) }
        : view
    ));
  };

  // 뷰 삭제
  const handleDeleteView = (viewId: string) => {
    setViewPositions(prev => prev.filter(view => view.id !== viewId));
    if (selectedView === viewId) {
      setSelectedView(null);
    }
  };

  // 리사이징 시작
  const handleResizeStart = (viewId: string, direction: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const view = viewPositions.find(v => v.id === viewId);
    if (!view) return;
    
    setIsResizing(true);
    setResizingView(viewId);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: view.width * view.scale,
      height: view.height * view.scale,
      viewX: view.x,
      viewY: view.y,
      direction: direction
    });
  };

  // 정렬 가이드라인 찾기
  const findAlignmentGuides = (view: ViewPosition, excludeId: string) => {
    const guides = { vertical: [] as number[], horizontal: [] as number[] };
    const threshold = 5;

    viewPositions.forEach(otherView => {
      if (otherView.id === excludeId) return;

      const otherLeft = otherView.x;
      const otherRight = otherView.x + otherView.width * otherView.scale;
      const otherTop = otherView.y;
      const otherBottom = otherView.y + otherView.height * otherView.scale;
      const otherCenterX = otherView.x + (otherView.width * otherView.scale) / 2;
      const otherCenterY = otherView.y + (otherView.height * otherView.scale) / 2;

      const viewLeft = view.x;
      const viewRight = view.x + view.width * view.scale;
      const viewTop = view.y;
      const viewBottom = view.y + view.height * view.scale;
      const viewCenterX = view.x + (view.width * view.scale) / 2;
      const viewCenterY = view.y + (view.height * view.scale) / 2;

      // 수직 가이드
      if (Math.abs(viewLeft - otherLeft) < threshold) guides.vertical.push(otherLeft);
      if (Math.abs(viewLeft - otherRight) < threshold) guides.vertical.push(otherRight);
      if (Math.abs(viewRight - otherLeft) < threshold) guides.vertical.push(otherLeft);
      if (Math.abs(viewRight - otherRight) < threshold) guides.vertical.push(otherRight);
      if (Math.abs(viewCenterX - otherCenterX) < threshold) guides.vertical.push(otherCenterX);

      // 수평 가이드
      if (Math.abs(viewTop - otherTop) < threshold) guides.horizontal.push(otherTop);
      if (Math.abs(viewTop - otherBottom) < threshold) guides.horizontal.push(otherBottom);
      if (Math.abs(viewBottom - otherTop) < threshold) guides.horizontal.push(otherTop);
      if (Math.abs(viewBottom - otherBottom) < threshold) guides.horizontal.push(otherBottom);
      if (Math.abs(viewCenterY - otherCenterY) < threshold) guides.horizontal.push(otherCenterY);
    });

    return guides;
  };

  // 페이지 추가
  const handleAddPage = () => {
    const newPages = [...pages];
    newPages.push([]);
    setPages(newPages);
    setCurrentPage(newPages.length - 1);
  };

  // 페이지 변경
  const handlePageChange = (pageIndex: number) => {
    // 현재 페이지의 뷰들을 저장
    const newPages = [...pages];
    newPages[currentPage] = viewPositions;
    setPages(newPages);
    
    // 새 페이지의 뷰들을 로드
    setCurrentPage(pageIndex);
    setViewPositions(newPages[pageIndex] || []);
  };

  // 페이지 삭제
  const handleDeletePage = (pageIndex: number) => {
    if (pages.length <= 1) return; // 최소 1페이지는 유지
    
    const newPages = pages.filter((_, index) => index !== pageIndex);
    setPages(newPages);
    
    if (currentPage >= newPages.length) {
      setCurrentPage(newPages.length - 1);
    }
    
    setViewPositions(newPages[currentPage] || []);
  };

  // 확대/축소
  const handleZoom = (delta: number) => {
    setPreviewScale(prev => Math.max(0.5, Math.min(2, prev + delta)));
  };

  // 스냅 위치 계산 함수
  const calculateSnapPosition = (value: number, gridSize: number): number => {
    return Math.round(value / gridSize) * gridSize;
  };

  // 다른 뷰들과의 정렬 스냅 검사
  const checkAlignmentSnap = (
    targetX: number, 
    targetY: number, 
    targetWidth: number, 
    targetHeight: number,
    viewId: string
  ): { x: number; y: number; snapX?: number; snapY?: number } => {
    let finalX = targetX;
    let finalY = targetY;
    let snapX: number | undefined;
    let snapY: number | undefined;

    viewPositions.forEach(view => {
      if (view.id === viewId) return;

      // 좌측 정렬
      if (Math.abs(targetX - view.x) < SNAP_THRESHOLD) {
        finalX = view.x;
        snapX = view.x;
      }
      // 우측 정렬
      if (Math.abs(targetX + targetWidth - (view.x + view.width)) < SNAP_THRESHOLD) {
        finalX = view.x + view.width - targetWidth;
        snapX = view.x + view.width;
      }
      // 중앙 정렬 (수평)
      if (Math.abs(targetX + targetWidth / 2 - (view.x + view.width / 2)) < SNAP_THRESHOLD) {
        finalX = view.x + view.width / 2 - targetWidth / 2;
        snapX = view.x + view.width / 2;
      }

      // 상단 정렬
      if (Math.abs(targetY - view.y) < SNAP_THRESHOLD) {
        finalY = view.y;
        snapY = view.y;
      }
      // 하단 정렬
      if (Math.abs(targetY + targetHeight - (view.y + view.height)) < SNAP_THRESHOLD) {
        finalY = view.y + view.height - targetHeight;
        snapY = view.y + view.height;
      }
      // 중앙 정렬 (수직)
      if (Math.abs(targetY + targetHeight / 2 - (view.y + view.height / 2)) < SNAP_THRESHOLD) {
        finalY = view.y + view.height / 2 - targetHeight / 2;
        snapY = view.y + view.height / 2;
      }
    });

    return { x: finalX, y: finalY, snapX, snapY };
  };

  // 드래그 중
  const handleMouseMove = (e: MouseEvent) => {
    // 리사이징 중인 경우
    if (isResizing && resizingView) {
      const view = viewPositions.find(v => v.id === resizingView);
      if (!view) return;
      
      const deltaX = (e.clientX - resizeStart.x) / scale;
      const deltaY = (e.clientY - resizeStart.y) / scale;
      const aspectRatio = resizeStart.width / resizeStart.height;
      
      let newWidth = view.width * view.scale;
      let newHeight = view.height * view.scale;
      let newX = view.x;
      let newY = view.y;
      
      // Shift 키를 누르면 비율 유지
      const maintainRatio = e.shiftKey;
      
      switch (resizeStart.direction) {
        case 'nw':
          newX = resizeStart.viewX + deltaX;
          newY = resizeStart.viewY + deltaY;
          newWidth = resizeStart.width - deltaX;
          newHeight = resizeStart.height - deltaY;
          if (maintainRatio) {
            const avgDelta = (Math.abs(deltaX) + Math.abs(deltaY)) / 2 * (deltaX < 0 ? 1 : -1);
            newWidth = resizeStart.width - avgDelta;
            newHeight = newWidth / aspectRatio;
            newX = resizeStart.viewX + avgDelta;
            newY = resizeStart.viewY + avgDelta / aspectRatio;
          }
          break;
        case 'n':
          newY = resizeStart.viewY + deltaY;
          newHeight = resizeStart.height - deltaY;
          break;
        case 'ne':
          newY = resizeStart.viewY + deltaY;
          newWidth = resizeStart.width + deltaX;
          newHeight = resizeStart.height - deltaY;
          if (maintainRatio) {
            const avgDelta = (Math.abs(deltaX) + Math.abs(deltaY)) / 2 * (deltaX > 0 ? 1 : -1);
            newWidth = resizeStart.width + avgDelta;
            newHeight = newWidth / aspectRatio;
            newY = resizeStart.viewY - avgDelta / aspectRatio;
          }
          break;
        case 'w':
          newX = resizeStart.viewX + deltaX;
          newWidth = resizeStart.width - deltaX;
          break;
        case 'e':
          newWidth = resizeStart.width + deltaX;
          break;
        case 'sw':
          newX = resizeStart.viewX + deltaX;
          newWidth = resizeStart.width - deltaX;
          newHeight = resizeStart.height + deltaY;
          if (maintainRatio) {
            const avgDelta = (Math.abs(deltaX) + Math.abs(deltaY)) / 2 * (deltaX < 0 ? 1 : -1);
            newWidth = resizeStart.width - avgDelta;
            newHeight = newWidth / aspectRatio;
            newX = resizeStart.viewX + avgDelta;
          }
          break;
        case 's':
          newHeight = resizeStart.height + deltaY;
          break;
        case 'se':
          newWidth = resizeStart.width + deltaX;
          newHeight = resizeStart.height + deltaY;
          if (maintainRatio) {
            const avgDelta = (Math.abs(deltaX) + Math.abs(deltaY)) / 2 * (deltaX > 0 ? 1 : -1);
            newWidth = resizeStart.width + avgDelta;
            newHeight = newWidth / aspectRatio;
          }
          break;
      }
      
      // 최소 크기 및 경계 체크
      newWidth = Math.max(100, newWidth);
      newHeight = Math.max(75, newHeight);
      
      // 경계를 벗어나지 않도록 조정
      if (newX < 0) {
        newWidth += newX;
        newX = 0;
      }
      if (newY < 0) {
        newHeight += newY;
        newY = 0;
      }
      if (newX + newWidth > paperDimensions.displayWidth) {
        newWidth = paperDimensions.displayWidth - newX;
      }
      if (newY + newHeight > paperDimensions.displayHeight) {
        newHeight = paperDimensions.displayHeight - newY;
      }
      
      const updatedView = {
        ...view,
        x: newX,
        y: newY,
        width: newWidth / view.scale,
        height: newHeight / view.scale
      };
      
      const guides = findAlignmentGuides(updatedView, resizingView);
      setAlignmentGuides(guides);
      
      setViewPositions(prev => prev.map(v => 
        v.id === resizingView ? updatedView : v
      ));
      return;
    }

    if (isDraggingFromMenu && draggedMenuItem) {
      // 메뉴에서 드래그 중인 경우 - 마우스 위치에 프리뷰 표시
      setDragPreviewPos({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
      return;
    }
    
    if (!draggingView) return;
    
    const currentView = viewPositions.find(v => v.id === draggingView);
    if (!currentView) return;

    let newX = (e.clientX - dragOffset.x) / scale;
    let newY = (e.clientY - dragOffset.y) / scale;
    
    // 그리드 스냅
    const gridX = calculateSnapPosition(newX, GRID_SIZE);
    const gridY = calculateSnapPosition(newY, GRID_SIZE);
    
    // 그리드에 가까우면 스냅
    if (Math.abs(newX - gridX) < SNAP_THRESHOLD) {
      newX = gridX;
    }
    if (Math.abs(newY - gridY) < SNAP_THRESHOLD) {
      newY = gridY;
    }

    // 다른 뷰와의 정렬 스냅
    const { x: alignedX, y: alignedY, snapX, snapY } = checkAlignmentSnap(
      newX, 
      newY, 
      currentView.width * currentView.scale, 
      currentView.height * currentView.scale,
      draggingView
    );

    // 스냅 라인 업데이트
    setSnapLines({ x: snapX, y: snapY });
    
    // 정렬 가이드 업데이트
    const updatedView = {
      ...currentView,
      x: alignedX,
      y: alignedY
    };
    const guides = findAlignmentGuides(updatedView, draggingView);
    setAlignmentGuides(guides);
    
    // 경계 체크
    const finalX = Math.max(0, Math.min(paperDimensions.displayWidth - currentView.width, alignedX));
    const finalY = Math.max(0, Math.min(paperDimensions.displayHeight - currentView.height, alignedY));
    
    setViewPositions(prev => prev.map(view => 
      view.id === draggingView 
        ? { ...view, x: finalX, y: finalY }
        : view
    ));
  };

  // 드래그 종료
  const handleMouseUp = (e: MouseEvent) => {
    if (isResizing) {
      setIsResizing(false);
      setResizingView(null);
      setAlignmentGuides({ vertical: [], horizontal: [] });
      return;
    }

    if (isDraggingFromMenu && draggedMenuItem && drawingAreaRef.current) {
      // 메뉴에서 드롭
      const rect = drawingAreaRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      
      // 경계 내에 드롭했는지 확인
      if (x >= 0 && y >= 0 && x <= paperDimensions.displayWidth && y <= paperDimensions.displayHeight) {
        const newView: ViewPosition = {
          id: `${draggedMenuItem.id}_${Date.now()}`,
          x: calculateSnapPosition(x - 100, GRID_SIZE), // 중앙 정렬을 위해 오프셋
          y: calculateSnapPosition(y - 75, GRID_SIZE),
          width: 200,
          height: 150,
          scale: 1
        };
        setViewPositions(prev => [...prev, newView]);
      }
      
      setIsDraggingFromMenu(false);
      setDraggedMenuItem(null);
    }
    
    setDraggingView(null);
    setDragPreviewPos(null);
    setSnapLines({}); // 스냅 라인 제거
    setAlignmentGuides({ vertical: [], horizontal: [] }); // 가이드라인 제거
  };

  // 마우스 이벤트 리스너
  useEffect(() => {
    if (draggingView || isDraggingFromMenu || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingView, isDraggingFromMenu, isResizing, dragOffset, scale, resizeStart]);

  // 뷰 위치가 변경될 때마다 현재 페이지에 저장
  useEffect(() => {
    const newPages = [...pages];
    newPages[currentPage] = viewPositions;
    setPages(newPages);
  }, [viewPositions]);

  // 휠 이벤트 리스너
  useEffect(() => {
    const handleWheelEvent = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setPreviewScale(prev => Math.max(0.5, Math.min(2, prev + delta)));
      }
    };

    document.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      document.removeEventListener('wheel', handleWheelEvent);
    };
  }, []);


  // Early return must come after all hooks
  if (!isOpen) return null;

  const handleGeneratePDF = async () => {
    if (!previewRef.current) return;
    
    setIsGenerating(true);
    try {
      // PDF 생성
      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: [paperDimensions.width, paperDimensions.height]
      });

      // 미리보기 캡처
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      
      // PDF에 이미지 추가
      pdf.addImage(imgData, 'PNG', 0, 0, paperDimensions.width, paperDimensions.height);
      
      // PDF 다운로드
      const fileName = `${title || 'furniture-design'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF 생성 실패:', error);
      alert('PDF 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.fullContainer}>
        {/* 좌측 뷰 메뉴 */}
        <div className={styles.viewMenu}>
          <h3 className={styles.menuTitle}>Views</h3>
          <div className={styles.viewGrid}>
            {AVAILABLE_VIEWS.map(view => (
              <div
                key={view.id}
                className={styles.viewMenuItem}
                onMouseDown={(e) => handleMenuItemDragStart(view, e)}
              >
                <div className={styles.viewItemContent}>
                  {capturedViews[view.id as keyof typeof capturedViews] ? (
                    <img 
                      src={capturedViews[view.id as keyof typeof capturedViews]} 
                      alt={view.label} 
                      draggable={false}
                    />
                  ) : (
                    <div className={styles.viewItemPlaceholder}>{view.label}</div>
                  )}
                </div>
                <span className={styles.viewItemLabel}>{view.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 메인 컨테이너 */}
        <div className={styles.mainContainer}>
          <div className={styles.contentWrapper}>
          <div className={styles.header}>
            <h2>PDF 미리보기</h2>
            <div className={styles.controls}>
              <div className={styles.zoomControls}>
                <button 
                  className={styles.zoomBtn}
                  onClick={() => handleZoom(-0.1)}
                  title="축소"
                >
                  −
                </button>
                <span className={styles.zoomValue}>{(previewScale * 100).toFixed(0)}%</span>
                <button 
                  className={styles.zoomBtn}
                  onClick={() => handleZoom(0.1)}
                  title="확대"
                >
                  +
                </button>
              </div>
              <select 
                value={selectedPaperSize} 
                onChange={(e) => setSelectedPaperSize(e.target.value as PaperSize)}
                className={styles.paperSelect}
              >
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="A2">A2</option>
              </select>
              
              <div className={styles.orientationButtons}>
              <button 
                className={`${styles.orientButton} ${orientation === 'landscape' ? styles.active : ''}`}
                onClick={() => setOrientation('landscape')}
                title="가로"
              >
                <svg width="20" height="14" viewBox="0 0 20 14" fill="currentColor">
                  <rect x="0" y="0" width="20" height="14" />
                </svg>
              </button>
              <button 
                className={`${styles.orientButton} ${orientation === 'portrait' ? styles.active : ''}`}
                onClick={() => setOrientation('portrait')}
                title="세로"
              >
                <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
                  <rect x="0" y="0" width="14" height="20" />
                </svg>
              </button>
              </div>
              
              <button 
                onClick={handleGeneratePDF} 
                className={styles.generateButton}
                disabled={isGenerating}
              >
                {isGenerating ? 'PDF 생성 중...' : 'PDF 다운로드'}
              </button>
              <button onClick={onClose} className={styles.closeButton}>닫기</button>
            </div>
          </div>

          <div className={styles.previewContainer}>
            <div 
              ref={previewRef}
              className={styles.previewContent}
              style={{
                width: `${paperDimensions.displayWidth}px`,
                height: `${paperDimensions.displayHeight}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top center',
                marginTop: '20px'
              }}
            >
              {/* 상단 좌측 인포 영역 */}
              <div className={styles.infoArea}>
                <div className={styles.logoSection}>
                  <h1 className={styles.logo}>INSHOW</h1>
                  <h2 className={styles.projectTitle}>{title || '6 거실장'}</h2>
                </div>
                <div className={styles.specsList}>
                  <div className={styles.specItem}>
                    <span className={styles.label}>Size:</span>
                    <span className={styles.value}>W{spaceInfo.width} × D{spaceInfo.depth} × H{spaceInfo.height}</span>
                  </div>
                  <div className={styles.specItem}>
                    <span className={styles.label}>Door:</span>
                    <span className={styles.value}>{materialConfig?.door?.name || '18.5T_PET'}</span>
                  </div>
                  <div className={styles.specItem}>
                    <span className={styles.label}>Body:</span>
                    <span className={styles.value}>{materialConfig?.body?.name || '18.5T_LPM'}</span>
                  </div>
                </div>
              </div>

              {/* 메인 도면 영역 - 드래그 가능한 뷰들 */}
              <div 
                className={styles.drawingArea} 
                ref={drawingAreaRef}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelectedView(null);
                  }
                }}
              >
                {/* 스냅 가이드 라인 */}
                {snapLines.x !== undefined && (
                  <div 
                    className={styles.snapLineVertical}
                    style={{ left: `${snapLines.x}px` }}
                  />
                )}
                {snapLines.y !== undefined && (
                  <div 
                    className={styles.snapLineHorizontal}
                    style={{ top: `${snapLines.y}px` }}
                  />
                )}
                
                {/* 정렬 가이드라인 */}
                {alignmentGuides.vertical.map((x, index) => (
                  <div
                    key={`v-${index}`}
                    className={styles.alignmentGuideVertical}
                    style={{ left: `${x}px` }}
                  />
                ))}
                {alignmentGuides.horizontal.map((y, index) => (
                  <div
                    key={`h-${index}`}
                    className={styles.alignmentGuideHorizontal}
                    style={{ top: `${y}px` }}
                  />
                ))}
                
                {viewPositions.map(view => {
                  // 뷰 ID에서 원본 타입 추출 (timestamp 제거)
                  const viewType = view.id.split('_')[0];
                  const viewInfo = AVAILABLE_VIEWS.find(v => v.id === viewType);
                  // 로컬 캡처된 이미지가 있으면 사용, 없으면 기본 캡처 이미지 사용
                  const localImage = localCapturedViews[`${view.id}_${viewType}`];
                  const viewImage = localImage || capturedViews[viewType as keyof typeof capturedViews];

                  return (
                    <div
                      key={view.id}
                      className={`${styles.draggableView} ${draggingView === view.id ? styles.dragging : ''} ${selectedView === view.id ? styles.selected : ''} ${resizingView === view.id ? styles.resizing : ''}`}
                      style={{
                        position: 'absolute',
                        left: `${view.x}px`,
                        top: `${view.y}px`,
                        width: `${view.width * view.scale}px`,
                        height: `${view.height * view.scale}px`,
                        cursor: draggingView === view.id ? 'grabbing' : 'grab'
                      }}
                      onMouseDown={(e) => handleViewMouseDown(view.id, e)}
                      onDoubleClick={() => handleViewDoubleClick(view.id, viewType)}
                    >
                      {/* 리사이즈 핸들 */}
                      {selectedView === view.id && (
                        <>
                          <div className={`${styles.resizeHandle} ${styles.nw}`} onMouseDown={(e) => handleResizeStart(view.id, 'nw', e)} />
                          <div className={`${styles.resizeHandle} ${styles.n}`} onMouseDown={(e) => handleResizeStart(view.id, 'n', e)} />
                          <div className={`${styles.resizeHandle} ${styles.ne}`} onMouseDown={(e) => handleResizeStart(view.id, 'ne', e)} />
                          <div className={`${styles.resizeHandle} ${styles.w}`} onMouseDown={(e) => handleResizeStart(view.id, 'w', e)} />
                          <div className={`${styles.resizeHandle} ${styles.e}`} onMouseDown={(e) => handleResizeStart(view.id, 'e', e)} />
                          <div className={`${styles.resizeHandle} ${styles.sw}`} onMouseDown={(e) => handleResizeStart(view.id, 'sw', e)} />
                          <div className={`${styles.resizeHandle} ${styles.s}`} onMouseDown={(e) => handleResizeStart(view.id, 's', e)} />
                          <div className={`${styles.resizeHandle} ${styles.se}`} onMouseDown={(e) => handleResizeStart(view.id, 'se', e)} />
                        </>
                      )}
                      {/* 스케일 조정 버튼 */}
                      {selectedView === view.id && (
                        <div className={styles.viewControls}>
                          <button 
                            className={styles.scaleBtn}
                            onClick={() => handleViewScale(view.id, -0.1)}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            -
                          </button>
                          <span className={styles.scaleValue}>{(view.scale * 100).toFixed(0)}%</span>
                          <button 
                            className={styles.scaleBtn}
                            onClick={() => handleViewScale(view.id, 0.1)}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            +
                          </button>
                          <button 
                            className={styles.deleteBtn}
                            onClick={() => handleDeleteView(view.id)}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            ×
                          </button>
                        </div>
                      )}
                      
                      <div className={styles.viewLabel}>{viewInfo?.label || viewType}</div>
                      {viewImage && (
                        <img src={viewImage} alt={viewInfo?.label} draggable={false} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
          
          {/* 하단 페이지 네비게이션 */}
          <div className={styles.pageNavigation}>
            <h3 className={styles.pageNavTitle}>페이지</h3>
            <div className={styles.pageList}>
              {pages.map((page, index) => (
                <div key={index} className={styles.pageItemWrapper}>
                  <div 
                    className={`${styles.pageItem} ${currentPage === index ? styles.active : ''}`}
                    onClick={() => handlePageChange(index)}
                  >
                    <div className={styles.pageNumber}>{index + 1}</div>
                    <div className={styles.pageThumbnail}>
                      {page.length > 0 ? (
                        <div className={styles.pagePreview}>
                          {page.slice(0, 3).map((view, viewIndex) => (
                            <div 
                              key={viewIndex} 
                              className={styles.miniView}
                              style={{
                                left: `${(view.x / paperDimensions.displayWidth) * 100}%`,
                                top: `${(view.y / paperDimensions.displayHeight) * 100}%`,
                                width: `${(view.width / paperDimensions.displayWidth) * 100}%`,
                                height: `${(view.height / paperDimensions.displayHeight) * 100}%`
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className={styles.emptyPage}>빈 페이지</div>
                      )}
                    </div>
                  </div>
                  {pages.length > 1 && (
                    <button 
                      className={styles.deletePageBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePage(index);
                      }}
                      title="페이지 삭제"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              
              {/* 페이지 추가 카드 */}
              <div 
                className={styles.addPageCard}
                onClick={handleAddPage}
                title="페이지 추가"
              >
                <div className={styles.addPageIcon}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <line x1="12" y1="6" x2="12" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className={styles.addPageText}>페이지 추가</span>
              </div>
            </div>
          </div>
        </div>

        {/* 드래그 프리뷰 */}
        {isDraggingFromMenu && draggedMenuItem && dragPreviewPos && (
          <div
            style={{
              position: 'fixed',
              left: `${dragPreviewPos.x}px`,
              top: `${dragPreviewPos.y}px`,
              width: '200px',
              height: '150px',
              border: '2px dashed #00ffcc',
              backgroundColor: 'rgba(0, 255, 204, 0.1)',
              pointerEvents: 'none',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00ffcc',
              fontSize: '14px'
            }}
          >
            {draggedMenuItem.label}
          </div>
        )}

        {/* 뷰어 오버레이 */}
        {viewerOverlay.isOpen && (
          <div className={styles.viewerOverlay}>
            <div className={styles.viewerContainer}>
              <div className={styles.viewerHeader}>
                <h3>뷰 편집 - {viewerOverlay.viewType?.toUpperCase()}</h3>
                <div className={styles.viewerControls}>
                  {/* 뷰 모드 선택 */}
                  <div className={styles.viewModeButtons}>
                    <button
                      className={viewMode === '3D' ? styles.active : ''}
                      onClick={() => setViewMode('3D')}
                    >
                      3D
                    </button>
                    <button
                      className={viewMode === '2D' ? styles.active : ''}
                      onClick={() => setViewMode('2D')}
                    >
                      2D
                    </button>
                  </div>

                  {/* 2D 방향 선택 */}
                  {viewMode === '2D' && (
                    <div className={styles.view2DButtons}>
                      <button
                        className={view2DDirection === 'front' ? styles.active : ''}
                        onClick={() => setView2DDirection('front')}
                      >
                        정면
                      </button>
                      <button
                        className={view2DDirection === 'top' ? styles.active : ''}
                        onClick={() => setView2DDirection('top')}
                      >
                        상부
                      </button>
                      <button
                        className={view2DDirection === 'left' ? styles.active : ''}
                        onClick={() => setView2DDirection('left')}
                      >
                        좌측
                      </button>
                      <button
                        className={view2DDirection === 'right' ? styles.active : ''}
                        onClick={() => setView2DDirection('right')}
                      >
                        우측
                      </button>
                    </div>
                  )}

                  {/* 렌더 모드 선택 */}
                  <div className={styles.renderModeButtons}>
                    <button
                      className={renderMode === 'solid' ? styles.active : ''}
                      onClick={() => setRenderMode('solid')}
                    >
                      솔리드
                    </button>
                    <button
                      className={renderMode === 'wireframe' ? styles.active : ''}
                      onClick={() => setRenderMode('wireframe')}
                    >
                      와이어프레임
                    </button>
                  </div>
                </div>
              </div>

              {/* 3D 뷰어 */}
              <div ref={viewerContainerRef} className={styles.viewerContent}>
                <Space3DView
                  spaceInfo={spaceInfo}
                  viewMode={viewMode}
                  renderMode={renderMode}
                  showDimensions={true}
                  showAll={true}
                  showFrame={true}
                />
              </div>

              {/* 하단 버튼 */}
              <div className={styles.viewerFooter}>
                <button 
                  className={styles.captureButton}
                  onClick={handleCaptureFromViewer}
                >
                  캡처하기
                </button>
                <button 
                  className={styles.cancelButton}
                  onClick={() => setViewerOverlay({ isOpen: false, viewId: null, viewType: null })}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFTemplatePreview;