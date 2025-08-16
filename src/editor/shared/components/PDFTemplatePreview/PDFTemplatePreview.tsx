import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';
import styles from './PDFTemplatePreview.module.css';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import { renderViewToSVG, svgToCanvas } from '@/editor/shared/utils/svgRenderer';
import { generateVectorDataFromConfig, convertToSVG } from '@/editor/shared/utils/vectorExtractor';
import 'svg2pdf.js';
import { Settings, ChevronDown, Edit3 } from 'lucide-react';
import SettingsPanel from '@/components/common/SettingsPanel';
import * as fabric from 'fabric';

// 용지 규격 타입
type PaperSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
type Orientation = 'landscape' | 'portrait';

interface PaperDimensions {
  width: number;  // mm
  height: number; // mm
  displayWidth: number; // px for preview
  displayHeight: number; // px for preview
}

// 용지 규격 정의 (가로 방향 기준)
const PAPER_SIZES_BASE: Record<PaperSize, PaperDimensions> = {
  A5: { width: 210, height: 148, displayWidth: 630, displayHeight: 444 },
  A4: { width: 297, height: 210, displayWidth: 891, displayHeight: 630 },
  A3: { width: 420, height: 297, displayWidth: 1260, displayHeight: 891 },
  A2: { width: 594, height: 420, displayWidth: 1782, displayHeight: 1260 },
  A1: { width: 841, height: 594, displayWidth: 2523, displayHeight: 1782 },
  A0: { width: 1189, height: 841, displayWidth: 3567, displayHeight: 2523 }
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
  viewConfig?: any; // 뷰 설정 저장
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

// Available text elements for dragging
const AVAILABLE_TEXT_ITEMS: ViewMenuItem[] = [
  { id: 'info', label: '프로젝트 정보' },
  { id: 'title', label: '제목' },
  { id: 'specs', label: '사양' },
  { id: 'notes', label: '메모' }
];

// const SNAP_THRESHOLD = 10; // 스냅이 작동하는 거리 (픽셀) - 비활성화
// const GRID_SIZE = 20; // 그리드 크기 - 비활성화

const PDFTemplatePreview: React.FC<PDFTemplatePreviewProps> = ({ isOpen, onClose, capturedViews }) => {
  const [selectedPaperSize, setSelectedPaperSize] = useState<PaperSize>('A3');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [isGenerating, setIsGenerating] = useState(false);
  const paperColor = '#ffffff'; // 용지 색상은 항상 흰색
  const [draggingView, setDraggingView] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [viewPositions, setViewPositions] = useState<ViewPosition[]>([]);
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
  const [editingInfo, setEditingInfo] = useState<string | null>(null); // 편집 중인 정보 카드 ID
  const [activeTab, setActiveTab] = useState<'views' | 'elements' | 'text'>('views'); // 좌측 탭 상태
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false); // 설정 패널 상태
  const [previewMode, setPreviewMode] = useState<'raster' | 'vector'>('vector'); // 프리뷰 모드
  const [showZoomDropdown, setShowZoomDropdown] = useState(false); // 줌 드롭다운 표시 상태
  const [isZoomDropdownOpen, setIsZoomDropdownOpen] = useState(false); // 줌 드롭다운 상태
  const [showExportPopup, setShowExportPopup] = useState(false); // 내보내기 팝업 표시 상태
  const [selectedExportFormat, setSelectedExportFormat] = useState<'pdf' | 'png' | 'jpg' | 'dxf'>('pdf'); // 선택된 내보내기 형식
  const [isPaperSizeDropdownOpen, setIsPaperSizeDropdownOpen] = useState(false); // 용지 사이즈 드롭다운 상태
  const [designSubTab, setDesignSubTab] = useState<'layout' | 'viewconfig'>('layout'); // 디자인 탭의 서브 탭 상태
  const [elementsSubTab, setElementsSubTab] = useState<'shapes' | 'lines' | 'symbols' | 'balloons' | 'frames'>('shapes'); // 요소 탭의 서브 탭 상태
  const [designScrollState, setDesignScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  const [elementsScrollState, setElementsScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  // Fabric.js 캔버스 참조
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  // 스크롤 컨테이너 ref
  const designTabRef = useRef<HTMLDivElement>(null);
  const elementsTabRef = useRef<HTMLDivElement>(null);
  
  // 스토어 훅을 먼저 선언
  const { title } = useProjectStore();
  const { spaceInfo, materialConfig } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const uiStore = useUIStore();
  
  // capturedViews가 있을 때 자동으로 viewPositions 초기화
  useEffect(() => {
    if (capturedViews && Object.keys(capturedViews).length > 0 && viewPositions.length === 0) {
      const initialPositions: ViewPosition[] = [];
      let xOffset = 50;
      let yOffset = 50;
      
      // 각 캡처된 뷰를 viewPositions에 추가
      if (capturedViews.top) {
        initialPositions.push({
          id: `top_${Date.now()}`,
          x: xOffset,
          y: yOffset,
          width: 150,
          height: 150,
          scale: 1
        });
        xOffset += 200;
      }
      
      if (capturedViews.front) {
        initialPositions.push({
          id: `front_${Date.now()+1}`,
          x: xOffset,
          y: yOffset,
          width: 150,
          height: 150,
          scale: 1
        });
        xOffset += 200;
      }
      
      if (capturedViews.side) {
        initialPositions.push({
          id: `side_${Date.now()+2}`,
          x: xOffset,
          y: yOffset,
          width: 150,
          height: 150,
          scale: 1
        });
        yOffset += 200;
        xOffset = 50;
      }
      
      if (capturedViews.door) {
        initialPositions.push({
          id: `door_${Date.now()+3}`,
          x: xOffset,
          y: yOffset,
          width: 150,
          height: 150,
          scale: 1
        });
      }
      
      setViewPositions(initialPositions);
    }
  }, [capturedViews]);
  const { viewMode, view2DDirection, setViewMode, setView2DDirection, renderMode, setRenderMode, view2DTheme } = uiStore;
  const { theme } = useTheme();
  
  // 스토어 값을 사용하는 상태 선언
  const [infoTexts, setInfoTexts] = useState<{ [key: string]: string }>({
    title: title || 'Untitled Project',
    size: `W${spaceInfo?.width || 0} × D${spaceInfo?.depth || 0} × H${spaceInfo?.height || 0}`,
    door: materialConfig?.door?.name || '18.5T_PET',
    body: materialConfig?.body?.name || '18.5T_LPM',
    notes: ''
  });
  const previewRef = useRef<HTMLDivElement>(null);
  const drawingAreaRef = useRef<HTMLDivElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

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
      
      // 뷰어 컨테이너 내의 캔버스를 찾기
      const canvas = viewerContainerRef.current.querySelector('canvas');
      if (!canvas) {
        console.error('Canvas not found in viewer container');
        return;
      }

      // 고품질 캡처를 위한 옵션 설정
      const options = {
        scale: 3, // 3배 해상도로 캡처
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: false,
        onclone: (clonedDoc: Document) => {
          // 클론된 문서에서 캔버스 찾기
          const clonedCanvas = clonedDoc.querySelector('canvas');
          if (clonedCanvas && canvas instanceof HTMLCanvasElement) {
            // 원본 캔버스의 컨텍스트를 클론된 캔버스에 복사
            const ctx = clonedCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(canvas, 0, 0);
            }
          }
        }
      };

      // html2canvas로 캡처
      const capturedCanvas = await html2canvas(viewerContainerRef.current, options);
      const imgData = capturedCanvas.toDataURL('image/png');
      
      const viewType = viewerOverlay.viewType;
      const viewId = viewerOverlay.viewId;
      
      if (viewType && viewId) {
        // 캡처된 이미지를 로컬 상태에 저장
        setLocalCapturedViews(prev => ({
          ...prev,
          [`${viewId}_${viewType}`]: imgData
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
        ? { ...view, scale: Math.max(0.3, Math.min(3, view.scale + delta)) }
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

  // 정렬 가이드라인 찾기 (시각적 가이드만, 스냅 없음)
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
    
    // 스크롤을 끝으로 이동
    setTimeout(() => {
      const pageListContainer = document.querySelector(`.${styles.pageListContainer}`);
      if (pageListContainer) {
        pageListContainer.scrollLeft = pageListContainer.scrollWidth;
      }
    }, 100);
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

  // 스냅 관련 함수들 제거됨

  // 드래그 중
  const handleMouseMove = (e: MouseEvent) => {
    // 리사이징 중인 경우
    if (isResizing && resizingView) {
      requestAnimationFrame(() => {
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
      
      // 정렬 가이드 업데이트 (시각적 표시만)
      const updatedView = {
        ...view,
        x: newX,
        y: newY,
        width: newWidth / view.scale,
        height: newHeight / view.scale,
        scale: view.scale
      };
      const guides = findAlignmentGuides(updatedView, resizingView);
      setAlignmentGuides(guides);
      
      setViewPositions(prev => prev.map(v => 
        v.id === resizingView ? {
          ...view,
          x: newX,
          y: newY,
          width: newWidth / view.scale,
          height: newHeight / view.scale
        } : v
      ));
      });
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
    
    requestAnimationFrame(() => {
      const currentView = viewPositions.find(v => v.id === draggingView);
      if (!currentView) return;

      const newX = (e.clientX - dragOffset.x) / scale;
      const newY = (e.clientY - dragOffset.y) / scale;
      
      // 경계 체크만 수행 (스냅 제거)
      const finalX = Math.max(0, Math.min(paperDimensions.displayWidth - currentView.width * currentView.scale, newX));
      const finalY = Math.max(0, Math.min(paperDimensions.displayHeight - currentView.height * currentView.scale, newY));
      
      // 정렬 가이드 업데이트 (시각적 표시만)
      const updatedView = {
        ...currentView,
        x: finalX,
        y: finalY
      };
      const guides = findAlignmentGuides(updatedView, draggingView);
      setAlignmentGuides(guides);
      
      setViewPositions(prev => prev.map(view => 
        view.id === draggingView 
          ? { ...view, x: finalX, y: finalY }
          : view
      ));
    });
  };

  // 드래그 종료
  const handleMouseUp = (e: MouseEvent) => {
    if (isResizing) {
      setIsResizing(false);
      setResizingView(null);
      setAlignmentGuides({ vertical: [], horizontal: [] }); // 가이드라인 제거
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
          x: x - 100, // 중앙 정렬을 위해 오프셋 (스냅 제거)
          y: y - 75,
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

  // Fabric.js 캔버스 초기화
  useEffect(() => {
    // DOM이 완전히 렌더링된 후 실행
    const timer = setTimeout(() => {
      if (!canvasContainerRef.current) {
        console.error('캔버스 컨테이너가 없습니다.');
        return;
      }

      console.log('Fabric.js 초기화 시작...', {
        displayWidth: paperDimensions.displayWidth,
        displayHeight: paperDimensions.displayHeight,
        paperColor: paperColor
      });

      // 이미 캔버스가 있으면 재사용
      let canvas = fabricCanvasRef.current;
      
      if (!canvas) {
        // 캔버스 엘리먼트가 있는지 확인
        const canvasElement = document.getElementById('fabric-canvas') as HTMLCanvasElement;
        if (!canvasElement) {
          console.error('fabric-canvas 엘리먼트를 찾을 수 없습니다.');
          return;
        }

        try {
          // 캔버스 생성
          canvas = new fabric.Canvas('fabric-canvas', {
            width: paperDimensions.displayWidth,
            height: paperDimensions.displayHeight,
            backgroundColor: paperColor,
            selection: true,
            preserveObjectStacking: true,
            renderOnAddRemove: true
          });

          fabricCanvasRef.current = canvas;
          
          // 캔버스가 제대로 생성되었는지 확인
          canvas.renderAll();
          
          console.log('Fabric.js 캔버스 초기화 완료', {
            canvas: canvas,
            width: canvas.width,
            height: canvas.height,
            backgroundColor: canvas.backgroundColor,
            element: canvas.getElement()
          });
        } catch (error) {
          console.error('Fabric.js 캔버스 생성 오류:', error);
        }
      } else {
        // 기존 캔버스 크기 업데이트
        canvas.setWidth(paperDimensions.displayWidth);
        canvas.setHeight(paperDimensions.displayHeight);
        canvas.backgroundColor = paperColor;
        canvas.renderAll();
        console.log('Fabric.js 캔버스 업데이트됨');
      }
      // 키보드 이벤트 핸들러
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!canvas) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const activeObjects = canvas.getActiveObjects();
          if (activeObjects.length > 0) {
            activeObjects.forEach(obj => canvas.remove(obj));
            canvas.discardActiveObject();
            canvas.renderAll();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      // cleanup 함수에서 이벤트 제거
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, 100); // 100ms 지연

    return () => {
      clearTimeout(timer);
      // canvas.dispose(); // 이것을 제거하여 캔버스가 삭제되지 않도록 함
    };
  }, []); // 초기화는 한 번만

  // 캔버스 크기 업데이트
  useEffect(() => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.setDimensions({
        width: paperDimensions.displayWidth,
        height: paperDimensions.displayHeight
      });
      fabricCanvasRef.current.renderAll();
    }
  }, [paperDimensions.displayWidth, paperDimensions.displayHeight]);

  // 뷰 위치가 변경될 때마다 현재 페이지에 저장
  useEffect(() => {
    const newPages = [...pages];
    newPages[currentPage] = viewPositions;
    setPages(newPages);
  }, [viewPositions]);

  // 스크롤 상태 확인
  const checkScrollState = () => {
    if (designTabRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = designTabRef.current;
      setDesignScrollState({
        canScrollLeft: scrollLeft > 0,
        canScrollRight: scrollLeft < scrollWidth - clientWidth - 1
      });
    }
    if (elementsTabRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = elementsTabRef.current;
      setElementsScrollState({
        canScrollLeft: scrollLeft > 0,
        canScrollRight: scrollLeft < scrollWidth - clientWidth - 1
      });
    }
  };

  // 스크롤 상태 모니터링
  useEffect(() => {
    checkScrollState();

    const handleScroll = () => {
      checkScrollState();
    };

    const designTab = designTabRef.current;
    const elementsTab = elementsTabRef.current;

    if (designTab) {
      designTab.addEventListener('scroll', handleScroll);
    }
    if (elementsTab) {
      elementsTab.addEventListener('scroll', handleScroll);
    }

    window.addEventListener('resize', checkScrollState);

    return () => {
      if (designTab) {
        designTab.removeEventListener('scroll', handleScroll);
      }
      if (elementsTab) {
        elementsTab.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('resize', checkScrollState);
    };
  }, []);

  // 스크롤 핸들러
  const handleDesignScroll = (direction: 'left' | 'right') => {
    if (designTabRef.current) {
      const scrollAmount = direction === 'left' ? -100 : 100;
      designTabRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleElementsScroll = (direction: 'left' | 'right') => {
    if (elementsTabRef.current) {
      const scrollAmount = direction === 'left' ? -100 : 100;
      elementsTabRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // 도형 클릭 핸들러
  const handleShapeClick = (svgContent: string, shapeType: string) => {
    console.log('도형 클릭됨:', shapeType);
    
    if (!fabricCanvasRef.current) {
      console.error('Fabric.js 캔버스가 초기화되지 않았습니다.');
      return;
    }

    const canvas = fabricCanvasRef.current;
    console.log('캔버스 상태:', {
      width: canvas.width,
      height: canvas.height,
      objects: canvas.getObjects().length
    });
    
    const centerX = canvas.width! / 2;
    const centerY = canvas.height! / 2;

    // SVG를 Fabric.js 객체로 변환
    fabric.loadSVGFromString(svgContent, (objects, options) => {
      console.log('SVG 로드됨:', { objects: objects.length, options });
      
      if (objects.length === 0) {
        console.error('SVG 객체를 생성할 수 없습니다.');
        return;
      }
      
      const obj = fabric.util.groupSVGElements(objects, options);
      obj.set({
        left: centerX - 40,
        top: centerY - 40,
        scaleX: 3.5,
        scaleY: 3.5,
        fill: '#333333',
        stroke: '#333333',
        strokeWidth: 0
      });
      
      console.log('도형 추가 전 객체 수:', canvas.getObjects().length);
      canvas.add(obj);
      console.log('도형 추가 후 객체 수:', canvas.getObjects().length);
      
      canvas.setActiveObject(obj);
      canvas.renderAll();
      console.log('도형이 캔버스에 추가되었습니다.');
    }, (error) => {
      console.error('SVG 로드 에러:', error);
    });
  };

  // 선 클릭 핸들러
  const handleLineClick = (lineType: string) => {
    console.log('선 클릭됨:', lineType);
    
    if (!fabricCanvasRef.current) {
      console.error('Fabric.js 캔버스가 초기화되지 않았습니다.');
      return;
    }

    const canvas = fabricCanvasRef.current;
    const centerX = canvas.width! / 2;
    const centerY = canvas.height! / 2;

    let line;
    switch (lineType) {
      case 'horizontal':
        line = new fabric.Line([centerX - 100, centerY, centerX + 100, centerY], {
          stroke: '#333333',
          strokeWidth: 2,
          strokeDashArray: null
        });
        break;
      case 'vertical':
        line = new fabric.Line([centerX, centerY - 100, centerX, centerY + 100], {
          stroke: '#333333',
          strokeWidth: 2,
          strokeDashArray: null
        });
        break;
      case 'diagonal1':
        line = new fabric.Line([centerX - 100, centerY - 100, centerX + 100, centerY + 100], {
          stroke: '#333333',
          strokeWidth: 2,
          strokeDashArray: null
        });
        break;
      case 'diagonal2':
        line = new fabric.Line([centerX - 100, centerY + 100, centerX + 100, centerY - 100], {
          stroke: '#333333',
          strokeWidth: 2,
          strokeDashArray: null
        });
        break;
    }

    if (line) {
      canvas.add(line);
      canvas.setActiveObject(line);
      canvas.renderAll();
    }
  };

  // 텍스트 클릭 핸들러
  const handleTextClick = () => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    const centerX = canvas.width! / 2;
    const centerY = canvas.height! / 2;

    const text = new fabric.IText('텍스트를 입력하세요', {
      left: centerX - 100,
      top: centerY,
      fontFamily: 'Arial',
      fontSize: 20,
      fill: '#333333'
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    canvas.renderAll();
  };

  // 심볼 클릭 핸들러
  const handleSymbolClick = (symbol: string) => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    const centerX = canvas.width! / 2;
    const centerY = canvas.height! / 2;

    const text = new fabric.Text(symbol, {
      left: centerX - 20,
      top: centerY - 20,
      fontFamily: 'Arial',
      fontSize: 40,
      fill: '#333333'
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  // 말풍선 클릭 핸들러
  const handleBalloonClick = (direction: string) => {
    console.log('말풍선 클릭됨:', direction);
    
    if (!fabricCanvasRef.current) {
      console.error('Fabric.js 캔버스가 초기화되지 않았습니다.');
      return;
    }

    const canvas = fabricCanvasRef.current;
    const centerX = canvas.width! / 2;
    const centerY = canvas.height! / 2;

    // 말풍선 그룹 생성
    const balloonGroup = new fabric.Group([], {
      left: centerX - 100,
      top: centerY - 50
    });

    // 말풍선 본체
    const rect = new fabric.Rect({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      rx: 10,
      ry: 10,
      fill: '#ffffff',
      stroke: '#333333',
      strokeWidth: 2
    });
    balloonGroup.addWithUpdate(rect);

    // 말풍선 꼬리
    let triangle;
    switch (direction) {
      case 'left':
        triangle = new fabric.Triangle({
          left: -10,
          top: 40,
          width: 20,
          height: 20,
          angle: -90,
          fill: '#ffffff',
          stroke: '#333333',
          strokeWidth: 2
        });
        break;
      case 'right':
        triangle = new fabric.Triangle({
          left: 190,
          top: 40,
          width: 20,
          height: 20,
          angle: 90,
          fill: '#ffffff',
          stroke: '#333333',
          strokeWidth: 2
        });
        break;
      case 'top':
        triangle = new fabric.Triangle({
          left: 90,
          top: -10,
          width: 20,
          height: 20,
          angle: 0,
          fill: '#ffffff',
          stroke: '#333333',
          strokeWidth: 2
        });
        break;
      case 'bottom':
        triangle = new fabric.Triangle({
          left: 90,
          top: 90,
          width: 20,
          height: 20,
          angle: 180,
          fill: '#ffffff',
          stroke: '#333333',
          strokeWidth: 2
        });
        break;
    }
    
    if (triangle) {
      balloonGroup.addWithUpdate(triangle);
    }

    // 텍스트 추가
    const text = new fabric.IText('텍스트를 입력하세요', {
      left: 10,
      top: 35,
      fontFamily: 'Arial',
      fontSize: 16,
      fill: '#333333'
    });
    balloonGroup.addWithUpdate(text);

    canvas.add(balloonGroup);
    canvas.setActiveObject(balloonGroup);
    canvas.renderAll();
    console.log('말풍선이 추가되었습니다.');
  };

  // 프레임 클릭 핸들러
  const handleFrameClick = (frameType: string) => {
    console.log('프레임 클릭됨:', frameType);
    
    if (!fabricCanvasRef.current) {
      console.error('Fabric.js 캔버스가 초기화되지 않았습니다.');
      return;
    }

    const canvas = fabricCanvasRef.current;
    const centerX = canvas.width! / 2;
    const centerY = canvas.height! / 2;

    let frame;
    switch (frameType) {
      case 'simple':
        frame = new fabric.Rect({
          left: centerX - 100,
          top: centerY - 75,
          width: 200,
          height: 150,
          fill: 'transparent',
          stroke: '#333333',
          strokeWidth: 2
        });
        break;
      case 'double':
        const outerFrame = new fabric.Rect({
          left: 0,
          top: 0,
          width: 200,
          height: 150,
          fill: 'transparent',
          stroke: '#333333',
          strokeWidth: 1
        });
        const innerFrame = new fabric.Rect({
          left: 10,
          top: 10,
          width: 180,
          height: 130,
          fill: 'transparent',
          stroke: '#333333',
          strokeWidth: 1
        });
        frame = new fabric.Group([outerFrame, innerFrame], {
          left: centerX - 100,
          top: centerY - 75
        });
        break;
      case 'dashed':
        frame = new fabric.Rect({
          left: centerX - 100,
          top: centerY - 75,
          width: 200,
          height: 150,
          fill: 'transparent',
          stroke: '#333333',
          strokeWidth: 2,
          strokeDashArray: [8, 4]
        });
        break;
      case 'rounded':
        frame = new fabric.Rect({
          left: centerX - 100,
          top: centerY - 75,
          width: 200,
          height: 150,
          rx: 10,
          ry: 10,
          fill: 'transparent',
          stroke: '#333333',
          strokeWidth: 2
        });
        break;
    }

    if (frame) {
      canvas.add(frame);
      canvas.setActiveObject(frame);
      canvas.renderAll();
      console.log('프레임이 추가되었습니다.');
    }
  };

  // 캔버스 클릭 핸들러
  const handleCanvasClick = () => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.discardActiveObject();
      fabricCanvasRef.current.renderAll();
    }
  };


  // 휠 이벤트 리스너 - 프리뷰 컨테이너에만 적용
  useEffect(() => {
    const handleWheelEvent = (e: WheelEvent) => {
      // 프리뷰 컨테이너 내부에서만 동작
      const target = e.target as HTMLElement;
      const previewContainer = previewRef.current;
      
      if (previewContainer && previewContainer.contains(target)) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          setPreviewScale(prev => Math.max(0.5, Math.min(2, prev + delta)));
        } else {
          // Ctrl/Cmd 키가 눌리지 않았을 때도 기본 스크롤 동작 방지
          e.preventDefault();
        }
      }
    };

    // 캡처 단계에서 이벤트 처리
    document.addEventListener('wheel', handleWheelEvent, { passive: false, capture: true });
    return () => {
      document.removeEventListener('wheel', handleWheelEvent, { capture: true });
    };
  }, []);

  // 줌 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.zoomPresetDropdown}`)) {
        setIsZoomDropdownOpen(false);
      }
    };

    if (isZoomDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [isZoomDropdownOpen]);

  // 내보내기 팝업 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.exportButtonWrapper}`)) {
        setShowExportPopup(false);
      }
    };

    if (showExportPopup) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showExportPopup]);

  // 용지 사이즈 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.paperSizeDropdown}`)) {
        setIsPaperSizeDropdownOpen(false);
      }
    };

    if (isPaperSizeDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [isPaperSizeDropdownOpen]);


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

      // 배경색 설정
      pdf.setFillColor(paperColor);
      pdf.rect(0, 0, paperDimensions.width, paperDimensions.height, 'F');

      // 각 뷰 위치에 대해 이미지 렌더링
      for (const view of viewPositions) {
        // 뷰 ID에서 원본 타입 추출 (timestamp 제거)
        const viewType = view.id.split('_')[0];
        
        // 뷰 크기를 mm 단위로 변환
        const viewWidthMm = (view.width * view.scale * paperDimensions.width) / paperDimensions.displayWidth;
        const viewHeightMm = (view.height * view.scale * paperDimensions.height) / paperDimensions.displayHeight;
        const viewXMm = (view.x * paperDimensions.width) / paperDimensions.displayWidth;
        const viewYMm = (view.y * paperDimensions.height) / paperDimensions.displayHeight;

        // capturedViews에서 이미지 가져오기
        let imageData = null;
        if (viewType === 'top') {
          imageData = capturedViews?.top;
        } else if (viewType === 'front') {
          imageData = capturedViews?.front;
        } else if (viewType === 'side') {
          imageData = capturedViews?.side;
        } else if (viewType === 'door') {
          imageData = capturedViews?.door;
        }
        
        // localCapturedViews에서도 확인
        if (!imageData) {
          imageData = localCapturedViews[view.id];
        }
        
        if (imageData) {
          try {
            pdf.addImage(imageData, 'PNG', viewXMm, viewYMm, viewWidthMm, viewHeightMm);
          } catch (imgErr) {
            console.error('이미지 추가 실패:', imgErr);
          }
        } else {
          console.warn('이미지를 찾을 수 없음:', viewType, view.id);
        }
      }

      // 텍스트 아이템 렌더링
      for (const view of viewPositions) {
        const viewType = view.id.split('_')[0];
        const isTextItem = AVAILABLE_TEXT_ITEMS.some(item => item.id === viewType);
        
        if (isTextItem) {
          const textXMm = (view.x * paperDimensions.width) / paperDimensions.displayWidth;
          const textYMm = (view.y * paperDimensions.height) / paperDimensions.displayHeight;
          const textWidthMm = (view.width * view.scale * paperDimensions.width) / paperDimensions.displayWidth;
          const textHeightMm = (view.height * view.scale * paperDimensions.height) / paperDimensions.displayHeight;
          
          // 배경 박스
          pdf.setFillColor('#2a2a2a');
          pdf.rect(textXMm, textYMm, textWidthMm, textHeightMm, 'F');
          
          if (viewType === 'info') {
            pdf.setTextColor('#00ffcc');
            pdf.setFontSize(18);
            pdf.text('INSHOW', textXMm + 5, textYMm + 10);
            
            pdf.setTextColor('#ffffff');
            pdf.setFontSize(14);
            pdf.text(infoTexts.title, textXMm + 5, textYMm + 20);
            
            pdf.setFontSize(10);
            pdf.setTextColor('#888888');
            pdf.text('Size:', textXMm + 5, textYMm + 30);
            pdf.setTextColor('#00ffcc');
            pdf.text(infoTexts.size, textXMm + 20, textYMm + 30);
            
            pdf.setTextColor('#888888');
            pdf.text('Door:', textXMm + 5, textYMm + 37);
            pdf.setTextColor('#00ffcc');
            pdf.text(infoTexts.door, textXMm + 20, textYMm + 37);
            
            pdf.setTextColor('#888888');
            pdf.text('Body:', textXMm + 5, textYMm + 44);
            pdf.setTextColor('#00ffcc');
            pdf.text(infoTexts.body, textXMm + 20, textYMm + 44);
          } else if (viewType === 'title') {
            pdf.setTextColor('#ffffff');
            pdf.setFontSize(16);
            pdf.text(infoTexts.title, textXMm + 5, textYMm + textHeightMm / 2);
          } else if (viewType === 'notes' && infoTexts.notes) {
            pdf.setTextColor('#cccccc');
            pdf.setFontSize(10);
            const lines = pdf.splitTextToSize(infoTexts.notes, textWidthMm - 10);
            pdf.text(lines, textXMm + 5, textYMm + 10);
          }
        }
      }
      
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

  if (!isOpen) return null;

  return (
    <div className={`${styles.overlay} ${theme.mode === 'dark' ? styles.darkTheme : styles.lightTheme}`}>
      <div className={styles.fullContainer}>
        {/* 헤더를 최상단으로 이동 */}
        <div className={styles.header}>
          <h2>도면 에디터</h2>
          <div className={styles.controls}>
            {/* 확대/축소 컨트롤 - 슬라이더 방식 */}
            <div className={styles.zoomControls}>
              <button 
                className={styles.zoomBtn}
                onClick={() => handleZoom(-0.1)}
                title="축소 (Ctrl+-)"
              >
                −
              </button>
              <input
                type="range"
                min="25"
                max="200"
                value={previewScale * 100}
                onChange={(e) => {
                  const newScale = parseInt(e.target.value) / 100;
                  setPreviewScale(newScale);
                }}
                className={styles.zoomSlider}
                title="확대/축소"
              />
              <span className={styles.zoomValue}>{(previewScale * 100).toFixed(0)}%</span>
              <button 
                className={styles.zoomBtn}
                onClick={() => handleZoom(0.1)}
                title="확대 (Ctrl++)"
              >
                +
              </button>
              
              {/* 화면 크기 드롭다운 */}
              <div className={styles.zoomPresetDropdown}>
                <button 
                  className={styles.zoomPresetButton}
                  onClick={() => setIsZoomDropdownOpen(!isZoomDropdownOpen)}
                  title="화면 크기 프리셋"
                >
                  <ChevronDown size={16} />
                </button>
                {isZoomDropdownOpen && (
                  <div className={styles.zoomPresetMenu}>
                    <button onClick={() => { setPreviewScale(0.25); setIsZoomDropdownOpen(false); }}>25%</button>
                    <button onClick={() => { setPreviewScale(0.5); setIsZoomDropdownOpen(false); }}>50%</button>
                    <button onClick={() => { setPreviewScale(0.75); setIsZoomDropdownOpen(false); }}>75%</button>
                    <button onClick={() => { setPreviewScale(1); setIsZoomDropdownOpen(false); }}>100%</button>
                    <button onClick={() => { setPreviewScale(1.25); setIsZoomDropdownOpen(false); }}>125%</button>
                    <button onClick={() => { setPreviewScale(1.5); setIsZoomDropdownOpen(false); }}>150%</button>
                    <button onClick={() => { setPreviewScale(2); setIsZoomDropdownOpen(false); }}>200%</button>
                    <div className={styles.zoomPresetDivider}></div>
                    <button onClick={() => { 
                      // 화면에 맞춤 로직
                      const container = document.querySelector(`.${styles.previewContainer}`);
                      if (container) {
                        const containerWidth = container.clientWidth - 80; // 패딩 고려
                        const containerHeight = container.clientHeight - 80;
                        const templateWidth = paperDimensions.displayWidth;
                        const templateHeight = paperDimensions.displayHeight;
                        const scaleX = containerWidth / templateWidth;
                        const scaleY = containerHeight / templateHeight;
                        setPreviewScale(Math.min(scaleX, scaleY, 2));
                      }
                      setIsZoomDropdownOpen(false);
                    }}>화면에 맞춤</button>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.paperSizeContainer}>
              <label className={styles.paperSizeLabel}>용지사이즈:</label>
              <div className={styles.paperSizeDropdown}>
                <button 
                  className={styles.paperSizeButton}
                  onClick={() => setIsPaperSizeDropdownOpen(!isPaperSizeDropdownOpen)}
                  title="용지 크기 선택"
                >
                  {selectedPaperSize}
                  <ChevronDown size={16} />
                </button>
                {isPaperSizeDropdownOpen && (
                  <div className={styles.paperSizeMenu}>
                    {(['A5', 'A4', 'A3', 'A2', 'A1', 'A0'] as PaperSize[]).map((size) => (
                      <button 
                        key={size}
                        className={selectedPaperSize === size ? styles.selected : ''}
                        onClick={() => { 
                          setSelectedPaperSize(size); 
                          setIsPaperSizeDropdownOpen(false); 
                        }}
                      >
                        {size}
                        <span className={styles.paperDimensions}>
                          {orientation === 'landscape' 
                            ? `${PAPER_SIZES_BASE[size].width} × ${PAPER_SIZES_BASE[size].height} mm`
                            : `${PAPER_SIZES_BASE[size].height} × ${PAPER_SIZES_BASE[size].width} mm`
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className={styles.orientationButtons}>
            <button 
              className={`${styles.orientButton} ${orientation === 'landscape' ? styles.active : ''}`}
              onClick={() => setOrientation('landscape')}
              title="가로 방향"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="7" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="20.5" cy="12" r="1" fill="currentColor" opacity="0.5"/>
              </svg>
            </button>
            <button 
              className={`${styles.orientButton} ${orientation === 'portrait' ? styles.active : ''}`}
              onClick={() => setOrientation('portrait')}
              title="세로 방향"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="7" y="4" width="10" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="20.5" r="1" fill="currentColor" opacity="0.5"/>
              </svg>
            </button>
            </div>
            
            {/* 캔버스 에디터 버튼 */}
            <button 
              className={styles.actionButton}
              onClick={() => setShowCanvasEditor(true)}
              title="캔버스 에디터"
            >
              <Edit3 size={20} />
            </button>

            {/* 설정 버튼 */}
            <button 
              className={styles.actionButton}
              onClick={() => setIsSettingsPanelOpen(true)}
              title="설정"
            >
              <Settings size={20} />
            </button>
            
            <div className={styles.exportButtonWrapper}>
              <button 
                onClick={() => setShowExportPopup(!showExportPopup)} 
                className={styles.generateButton}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  '내보내는 중...'
                ) : (
                  <>
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2"
                      style={{ marginRight: '6px' }}
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    내보내기
                  </>
                )}
              </button>
              
              {/* 내보내기 팝업 */}
              {showExportPopup && (
                <div className={styles.exportPopup}>
                  <div className={styles.exportPopupHeader}>
                    <h4>파일 형식 선택</h4>
                    <button 
                      className={styles.exportPopupClose}
                      onClick={() => setShowExportPopup(false)}
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.exportFormatList}>
                    <div 
                      className={`${styles.exportFormatItem} ${selectedExportFormat === 'pdf' ? styles.selected : ''}`}
                      onClick={() => setSelectedExportFormat('pdf')}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 12v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M10 12h2.5c.8 0 1.5.7 1.5 1.5S13.3 15 12.5 15H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>PDF 문서</span>
                      <small>벡터 형식, 인쇄 품질</small>
                    </div>
                    <div 
                      className={`${styles.exportFormatItem} ${selectedExportFormat === 'png' ? styles.selected : ''}`}
                      onClick={() => setSelectedExportFormat('png')}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                        <polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>PNG 이미지</span>
                      <small>투명 배경 지원</small>
                    </div>
                    <div 
                      className={`${styles.exportFormatItem} ${selectedExportFormat === 'jpg' ? styles.selected : ''}`}
                      onClick={() => setSelectedExportFormat('jpg')}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                        <polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>JPG 이미지</span>
                      <small>작은 파일 크기</small>
                    </div>
                    <div 
                      className={`${styles.exportFormatItem} ${selectedExportFormat === 'dxf' ? styles.selected : ''}`}
                      onClick={() => setSelectedExportFormat('dxf')}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M22 10v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 10h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M7 10V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M17 10V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>DXF 파일</span>
                      <small>CAD 프로그램용</small>
                    </div>
                  </div>
                  <div className={styles.exportPopupFooter}>
                    <button 
                      className={styles.exportButton}
                      onClick={() => {
                        setShowExportPopup(false);
                        if (selectedExportFormat === 'pdf') {
                          handleGeneratePDF();
                        } else {
                          // TODO: 다른 형식 내보내기 구현
                          alert(`${selectedExportFormat.toUpperCase()} 형식 내보내기는 준비 중입니다.`);
                        }
                      }}
                    >
                      내보내기
                    </button>
                    <button 
                      className={styles.cancelButton}
                      onClick={() => setShowExportPopup(false)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={onClose} className={styles.closeButton}>나가기</button>
          </div>
        </div>

        {/* 하단 컨테이너 - 사이드바와 메인 컨텐츠 */}
        <div className={styles.bottomContainer}>
          {/* 좌측 사이드바 */}
          <div className={styles.sidebar}>
          {/* 세로 탭 버튼들 */}
          <div className={styles.tabButtons}>
            <button
              className={`${styles.tabButton} ${activeTab === 'views' ? styles.active : ''}`}
              onClick={() => setActiveTab('views')}
              title="디자인"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="8" y="8" width="4" height="4" rx="1" fill="currentColor"/>
                <rect x="8" y="14" width="8" height="2" rx="1" fill="currentColor"/>
              </svg>
              <span className={styles.tabLabel}>디자인</span>
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === 'elements' ? styles.active : ''}`}
              onClick={() => setActiveTab('elements')}
              title="요소"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="12" y="12" width="8" height="8" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span className={styles.tabLabel}>요소</span>
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === 'text' ? styles.active : ''}`}
              onClick={() => setActiveTab('text')}
              title="텍스트"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M4 7V4h16v3M12 4v16m-2 0h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className={styles.tabLabel}>텍스트</span>
            </button>
          </div>

          {/* 탭 컨텐츠 */}
          <div className={styles.tabContent}>
            {activeTab === 'views' && (
              <>
                <h3 className={styles.menuTitle}>디자인</h3>
                {/* 서브 탭 */}
                <div className={styles.subTabContainer}>
                  <button
                    className={`${styles.subTab} ${designSubTab === 'layout' ? styles.active : ''}`}
                    onClick={() => setDesignSubTab('layout')}
                  >
                    레이아웃
                  </button>
                  <button
                    className={`${styles.subTab} ${designSubTab === 'viewconfig' ? styles.active : ''}`}
                    onClick={() => setDesignSubTab('viewconfig')}
                  >
                    뷰구성
                  </button>
                </div>
                {designSubTab === 'layout' && (
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
                )}
                {designSubTab === 'viewconfig' && (
                  <div className={styles.viewConfigContent}>
                    <p className={styles.placeholderText}>뷰 구성 옵션이 여기에 표시됩니다.</p>
                  </div>
                )}
              </>
            )}
            {activeTab === 'elements' && (
              <>
                <h3 className={styles.menuTitle}>요소</h3>
                {/* 서브 탭 */}
                <div className={styles.subTabScrollContainer}>
                  <button 
                    className={`${styles.scrollButton} ${styles.left} ${!elementsScrollState.canScrollLeft ? styles.disabled : ''}`}
                    onClick={() => handleElementsScroll('left')}
                  >
                    ‹
                  </button>
                  <div className={styles.subTabWrapper} ref={elementsTabRef}>
                    <button
                      className={`${styles.subTab} ${elementsSubTab === 'shapes' ? styles.active : ''}`}
                      onClick={() => setElementsSubTab('shapes')}
                    >
                      도형
                    </button>
                    <button
                      className={`${styles.subTab} ${elementsSubTab === 'lines' ? styles.active : ''}`}
                      onClick={() => setElementsSubTab('lines')}
                    >
                      선
                    </button>
                    <button
                      className={`${styles.subTab} ${elementsSubTab === 'symbols' ? styles.active : ''}`}
                      onClick={() => setElementsSubTab('symbols')}
                    >
                      기호
                    </button>
                    <button
                      className={`${styles.subTab} ${elementsSubTab === 'balloons' ? styles.active : ''}`}
                      onClick={() => setElementsSubTab('balloons')}
                    >
                      말풍선
                    </button>
                    <button
                      className={`${styles.subTab} ${elementsSubTab === 'frames' ? styles.active : ''}`}
                      onClick={() => setElementsSubTab('frames')}
                    >
                      프레임
                    </button>
                  </div>
                  <button 
                    className={`${styles.scrollButton} ${styles.right} ${!elementsScrollState.canScrollRight ? styles.disabled : ''}`}
                    onClick={() => handleElementsScroll('right')}
                  >
                    ›
                  </button>
                </div>
                {elementsSubTab === 'shapes' && (
                  <div className={styles.shapeGrid}>
                    {/* 첫 번째 줄 */}
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleShapeClick(
                        '<rect x="2" y="2" width="20" height="20" fill="currentColor" />',
                        'rectangle'
                      )}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="2" y="2" width="20" height="20" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleShapeClick(
                        '<rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />',
                        'rounded-rectangle'
                      )}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleShapeClick(
                        '<circle cx="12" cy="12" r="10" fill="currentColor" />',
                        'circle'
                      )}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <circle cx="12" cy="12" r="10" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleShapeClick(
                        '<ellipse cx="12" cy="12" rx="10" ry="6" fill="currentColor" />',
                        'ellipse'
                      )}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <ellipse cx="12" cy="12" rx="10" ry="6" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleShapeClick(
                        '<polygon points="12,2 22,20 2,20" fill="currentColor" />',
                        'triangle'
                      )}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 22,20 2,20" fill="currentColor" />
                      </svg>
                    </div>
                    
                    {/* 두 번째 줄 */}
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleShapeClick(
                        '<polygon points="2,12 8,6 22,6 22,18 8,18" fill="currentColor" />',
                        'pentagon'
                      )}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="2,12 8,6 22,6 22,18 8,18" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleShapeClick(
                        '<polygon points="2,12 8,6 16,6 22,12 16,18 8,18" fill="currentColor" />',
                        'hexagon'
                      )}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="2,12 8,6 16,6 22,12 16,18 8,18" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M12,3 Q7,3 7,8 Q7,10 9,10 Q9,8 11,8 Q11,10 12,10 Q13,10 15,10 Q17,10 17,8 Q17,3 12,3 Q17,3 17,8 Q17,13 12,13 Q7,13 7,8" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M12,2 A10,10 0 0,1 12,22 A10,10 0 0,1 12,2" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleShapeClick(
                        '<polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="currentColor" />',
                        'star'
                      )}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="currentColor" />
                      </svg>
                    </div>

                    {/* 세 번째 줄 */}
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <ellipse cx="12" cy="14" rx="8" ry="6" fill="currentColor" />
                        <polygon points="8,18 8,22 10,20" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M12,4 C7,4 3,8 3,12 C3,16 7,20 12,20 C17,20 21,16 21,12 C21,8 17,4 12,4" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="2,12 9,6 22,10 15,16" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 14,10 22,10 16,14 18,22 12,18 6,22 8,14 2,10 10,10" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="4,4 20,4 16,20 8,20" fill="currentColor" />
                      </svg>
                    </div>

                    {/* 네 번째 줄 */}
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M6,4 L18,4 Q22,4 22,8 L22,16 Q22,20 18,20 L6,20 Q2,20 2,16 L2,8 Q2,4 6,4" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="4,6 20,6 16,18 8,18" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 15,7 20,7 16,11 18,16 12,13 6,16 8,11 4,7 9,7" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 12,22 2,17 22,17" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="3,3 21,3 17,12 21,21 3,21 7,12" fill="currentColor" />
                      </svg>
                    </div>

                    {/* 다섯 번째 줄 */}
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="2,22 12,2 22,22" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="6,2 18,2 22,12 18,22 6,22 2,12" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="4" y="4" width="16" height="16" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
                        <rect x="8" y="18" width="8" height="4" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 16,8 22,8 18,13 20,20 12,16 4,20 6,13 2,8 8,8" fill="currentColor" />
                      </svg>
                    </div>

                    {/* 여섯 번째 줄 */}
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <circle cx="12" cy="12" r="10" fill="currentColor" />
                        <circle cx="12" cy="12" r="6" fill="white" />
                        <circle cx="12" cy="12" r="3" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="3,3 9,3 12,6 15,3 21,3 21,9 18,12 21,15 21,21 15,21 12,18 9,21 3,21 3,15 6,12 3,9" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="10" y="2" width="4" height="20" fill="currentColor" />
                        <rect x="2" y="10" width="20" height="4" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 17,7 22,12 17,17 12,22 7,17 2,12 7,7" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="5,3 19,3 21,12 19,21 5,21 3,12" fill="currentColor" />
                      </svg>
                    </div>

                    {/* 일곱 번째 줄 */}
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="2,3 8,3 12,7 16,3 22,3 22,9 18,12 22,15 22,21 16,21 12,17 8,21 2,21 2,15 6,12 2,9" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="7,2 17,2 22,12 17,22 7,22 2,12" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <circle cx="12" cy="12" r="10" fill="currentColor" />
                        <path d="M12,2 A10,10 0 0,1 12,22 Z" fill="white" opacity="0.3" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 16,6 20,6 20,10 24,12 20,14 20,18 16,18 12,22 8,18 4,18 4,14 0,12 4,10 4,6 8,6" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" />
                      </svg>
                    </div>

                    {/* 여덟 번째 줄 */}
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="2,12 7,7 12,12 17,7 22,12 17,17 12,12 7,17" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="4,2 20,2 22,8 18,22 6,22 2,8" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="5,2 12,5 19,2 22,9 19,16 22,22 16,19 12,22 8,19 2,22 5,16 2,9" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="3" y="3" width="18" height="18" fill="currentColor" />
                        <rect x="6" y="6" width="12" height="12" fill="white" />
                        <rect x="9" y="9" width="6" height="6" fill="currentColor" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 14,9 22,8 17,14 20,21 12,18 4,21 7,14 2,8 10,9" fill="currentColor" />
                      </svg>
                    </div>

                    {/* 아홉 번째 줄 */}
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="12,2 16,8 22,12 16,16 12,22 8,16 2,12 8,8" fill="currentColor" />
                        <polygon points="12,6 14,10 18,12 14,14 12,18 10,14 6,12 10,10" fill="white" />
                      </svg>
                    </div>
                    <div className={styles.shapeItem}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <polygon points="3,2 21,2 18,12 21,22 3,22 6,12" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                )}
                {elementsSubTab === 'lines' && (
                  <div className={styles.viewGrid}>
                    <div className={styles.shapeItem} onClick={() => handleLineClick('horizontal')}>━</div>
                    <div className={styles.shapeItem} onClick={() => handleLineClick('vertical')}>┃</div>
                    <div className={styles.shapeItem} onClick={() => handleLineClick('diagonal1')}>╱</div>
                    <div className={styles.shapeItem} onClick={() => handleLineClick('diagonal2')}>╲</div>
                  </div>
                )}
                {elementsSubTab === 'symbols' && (
                  <div className={styles.viewGrid}>
                    <div className={styles.shapeItem} onClick={() => handleSymbolClick('★')}>★</div>
                    <div className={styles.shapeItem} onClick={() => handleSymbolClick('♥')}>♥</div>
                    <div className={styles.shapeItem} onClick={() => handleSymbolClick('♦')}>♦</div>
                    <div className={styles.shapeItem} onClick={() => handleSymbolClick('♣')}>♣</div>
                  </div>
                )}
                {elementsSubTab === 'balloons' && (
                  <div className={styles.shapeGrid}>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleBalloonClick('left')}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M4,4 L20,4 Q22,4 22,6 L22,14 Q22,16 20,16 L8,16 L4,20 L4,16 Q2,16 2,14 L2,6 Q2,4 4,4" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleBalloonClick('right')}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M4,4 L20,4 Q22,4 22,6 L22,14 Q22,16 20,16 L20,20 L16,16 L4,16 Q2,16 2,14 L2,6 Q2,4 4,4" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleBalloonClick('top')}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M4,8 L20,8 Q22,8 22,10 L22,18 Q22,20 20,20 L4,20 Q2,20 2,18 L2,10 Q2,8 4,8 M12,8 L8,4 L16,4 Z" fill="currentColor" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleBalloonClick('bottom')}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M4,4 L20,4 Q22,4 22,6 L22,14 Q22,16 20,16 L4,16 Q2,16 2,14 L2,6 Q2,4 4,4 M12,16 L8,20 L16,20 Z" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                )}
                {elementsSubTab === 'frames' && (
                  <div className={styles.shapeGrid}>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleFrameClick('simple')}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleFrameClick('double')}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1" />
                        <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleFrameClick('dashed')}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" />
                      </svg>
                    </div>
                    <div 
                      className={styles.shapeItem}
                      onClick={() => handleFrameClick('rounded')}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </div>
                  </div>
                )}
              </>
            )}
            {activeTab === 'text' && (
              <>
                <h3 className={styles.menuTitle}>텍스트</h3>
                <div className={styles.viewGrid}>
                  <div
                    className={styles.viewMenuItem}
                    onClick={handleTextClick}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={styles.viewItemContent}>
                      <div className={styles.viewItemPlaceholder}>T</div>
                    </div>
                    <span className={styles.viewItemLabel}>텍스트 추가</span>
                  </div>
                  {AVAILABLE_TEXT_ITEMS.map(item => (
                    <div
                      key={item.id}
                      className={styles.viewMenuItem}
                      onMouseDown={(e) => handleMenuItemDragStart(item, e)}
                    >
                      <div className={styles.viewItemContent}>
                        <div className={styles.viewItemPlaceholder}>{item.label}</div>
                      </div>
                      <span className={styles.viewItemLabel}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

          {/* 메인 컨테이너 */}
          <div className={styles.mainContainer}>
            <div className={styles.contentWrapper}>
          <div className={styles.previewContainer}>
            <div 
              ref={previewRef}
              className={styles.previewContent}
              style={{
                width: `${paperDimensions.displayWidth}px`,
                height: `${paperDimensions.displayHeight}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                marginTop: '20px',
                backgroundColor: paperColor
              }}
            >
              {/* 메인 도면 영역 - 드래그 가능한 뷰들 */}
              <div 
                className={styles.drawingArea} 
                ref={drawingAreaRef}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelectedView(null);
                    handleCanvasClick();
                  }
                }}
                style={{ position: 'relative' }}
              >
                {/* Fabric.js 캔버스 */}
                <div 
                  ref={canvasContainerRef} 
                  style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: paperDimensions.displayWidth, 
                    height: paperDimensions.displayHeight, 
                    zIndex: 1 
                  }}
                >
                  <canvas 
                    id="fabric-canvas" 
                    style={{ 
                      position: 'absolute',
                      top: 0,
                      left: 0
                    }}
                  />
                </div>
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
                  const viewInfo = AVAILABLE_VIEWS.find(v => v.id === viewType) || AVAILABLE_TEXT_ITEMS.find(v => v.id === viewType);
                  // 로컬 캡처된 이미지가 있으면 사용, 없으면 기본 캡처 이미지 사용
                  const localImage = localCapturedViews[`${view.id}_${viewType}`];
                  const viewImage = localImage || capturedViews[viewType as keyof typeof capturedViews];
                  const isTextItem = AVAILABLE_TEXT_ITEMS.some(item => item.id === viewType);

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
                      onDoubleClick={() => !isTextItem && handleViewDoubleClick(view.id, viewType)}
                      onWheel={(e) => {
                        if (selectedView === view.id) {
                          e.preventDefault();
                          e.stopPropagation();
                          const delta = e.deltaY > 0 ? -0.1 : 0.1;
                          handleViewScale(view.id, delta);
                        }
                      }}
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
                            onClick={() => handleViewScale(view.id, -0.2)}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            -
                          </button>
                          <span className={styles.scaleValue}>{(view.scale * 100).toFixed(0)}%</span>
                          <button 
                            className={styles.scaleBtn}
                            onClick={() => handleViewScale(view.id, 0.2)}
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
                      
                      {isTextItem ? (
                        <div className={styles.textItemContent}>
                          {viewType === 'info' && (
                            <div className={styles.infoContent}>
                              <h3 className={styles.infoTitle}>INSHOW</h3>
                              {editingInfo === `${view.id}_title` ? (
                                <input
                                  type="text"
                                  value={infoTexts.title}
                                  onChange={(e) => setInfoTexts({ ...infoTexts, title: e.target.value })}
                                  onBlur={() => setEditingInfo(null)}
                                  onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                  className={styles.textInput}
                                  autoFocus
                                />
                              ) : (
                                <p onClick={() => setEditingInfo(`${view.id}_title`)}>{infoTexts.title}</p>
                              )}
                              <div className={styles.infoSpecs}>
                                <div className={styles.infoSpecItem}>
                                  <span>Size:</span>
                                  {editingInfo === `${view.id}_size` ? (
                                    <input
                                      type="text"
                                      value={infoTexts.size}
                                      onChange={(e) => setInfoTexts({ ...infoTexts, size: e.target.value })}
                                      onBlur={() => setEditingInfo(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                      className={styles.textInput}
                                      autoFocus
                                    />
                                  ) : (
                                    <span onClick={() => setEditingInfo(`${view.id}_size`)}>{infoTexts.size}</span>
                                  )}
                                </div>
                                <div className={styles.infoSpecItem}>
                                  <span>Door:</span>
                                  {editingInfo === `${view.id}_door` ? (
                                    <input
                                      type="text"
                                      value={infoTexts.door}
                                      onChange={(e) => setInfoTexts({ ...infoTexts, door: e.target.value })}
                                      onBlur={() => setEditingInfo(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                      className={styles.textInput}
                                      autoFocus
                                    />
                                  ) : (
                                    <span onClick={() => setEditingInfo(`${view.id}_door`)}>{infoTexts.door}</span>
                                  )}
                                </div>
                                <div className={styles.infoSpecItem}>
                                  <span>Body:</span>
                                  {editingInfo === `${view.id}_body` ? (
                                    <input
                                      type="text"
                                      value={infoTexts.body}
                                      onChange={(e) => setInfoTexts({ ...infoTexts, body: e.target.value })}
                                      onBlur={() => setEditingInfo(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                      className={styles.textInput}
                                      autoFocus
                                    />
                                  ) : (
                                    <span onClick={() => setEditingInfo(`${view.id}_body`)}>{infoTexts.body}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          {viewType === 'title' && (
                            <div className={styles.titleContent}>
                              {editingInfo === view.id ? (
                                <input
                                  type="text"
                                  value={infoTexts.title}
                                  onChange={(e) => setInfoTexts({ ...infoTexts, title: e.target.value })}
                                  onBlur={() => setEditingInfo(null)}
                                  onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                  className={styles.textInput}
                                  autoFocus
                                />
                              ) : (
                                <h2 onClick={() => setEditingInfo(view.id)}>{infoTexts.title}</h2>
                              )}
                            </div>
                          )}
                          {viewType === 'specs' && (
                            <div className={styles.specsContent}>
                              <h3>Specifications</h3>
                              <p>Size: {infoTexts.size}</p>
                              <p>Door: {infoTexts.door}</p>
                              <p>Body: {infoTexts.body}</p>
                            </div>
                          )}
                          {viewType === 'notes' && (
                            <div className={styles.notesContent}>
                              {editingInfo === view.id ? (
                                <textarea
                                  value={infoTexts.notes || ''}
                                  onChange={(e) => setInfoTexts({ ...infoTexts, notes: e.target.value })}
                                  onBlur={() => setEditingInfo(null)}
                                  className={styles.textAreaInput}
                                  placeholder="메모를 입력하세요..."
                                  autoFocus
                                />
                              ) : (
                                <p onClick={() => setEditingInfo(view.id)}>
                                  {infoTexts.notes || '메모를 입력하세요...'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className={styles.viewLabel}>{viewInfo?.label || viewType}</div>
                          {viewImage && (
                            <img src={viewImage} alt={viewInfo?.label} draggable={false} />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
          
          {/* 하단 페이지 미리보기 패널 */}
          <div className={styles.pagePreviewPanel}>
            <div className={styles.pageListContainer}>
              <div className={styles.pageList}>
                {pages.map((page, index) => (
                  <div key={index} className={styles.pageItemWrapper}>
                    <div 
                      className={`${styles.pageItem} ${currentPage === index ? styles.active : ''}`}
                      onClick={() => handlePageChange(index)}
                    >
                      <div className={styles.pageNumber}>페이지 {index + 1}</div>
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
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <line x1="12" y1="6" x2="12" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className={styles.addPageText}>페이지 추가</div>
                </div>
              </div>
            </div>
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
          <div className={`${styles.viewerOverlay} ${theme.mode === 'dark' ? styles.darkTheme : styles.lightTheme}`}>
            <div className={styles.viewerContainer}>
              <div className={styles.viewerHeader}>
                <h3>도면 편집기 - {viewerOverlay.viewType?.toUpperCase()}</h3>
                <button
                  className={styles.closeButton}
                  onClick={() => setViewerOverlay({ isOpen: false, viewId: null, viewType: null })}
                >
                  ✕
                </button>
              </div>
              
              {/* 서브헤더 - 가구 에디터의 모든 컨트롤 */}
              <div className={styles.viewerSubHeader}>
                <div className={styles.leftControls}>
                  {/* 치수 표시 토글 */}
                  <div className={styles.toggleGroup}>
                    <span 
                      className={`${styles.toggleLabel} ${styles.clickable}`}
                      onClick={() => {
                        // 토글이 꺼져있으면 켜고 모든 항목 체크
                        if (!uiStore.showDimensions) {
                          uiStore.setShowDimensions(true);
                          // 모든 항목이 체크되어 있지 않으면 체크
                          if (!uiStore.showAll) uiStore.setShowAll(true);
                          if (!uiStore.showDimensionsText) uiStore.setShowDimensionsText(true);
                          if (!uiStore.showGuides) uiStore.setShowGuides(true);
                          if (!uiStore.showAxis) uiStore.setShowAxis(true);
                          return;
                        }
                        
                        // 토글이 켜져있을 때: 토글을 끄지 않고 모든 체크박스 해제
                        const anyChecked = uiStore.showAll || uiStore.showDimensionsText || uiStore.showGuides || uiStore.showAxis;
                        
                        if (anyChecked) {
                          // 하나라도 체크되어 있으면 모두 체크 해제
                          if (uiStore.showAll) uiStore.setShowAll(false);
                          if (uiStore.showDimensionsText) uiStore.setShowDimensionsText(false);
                          if (uiStore.showGuides) uiStore.setShowGuides(false);
                          if (uiStore.showAxis) uiStore.setShowAxis(false);
                        } else {
                          // 모두 체크 해제되어 있으면 토글 OFF
                          uiStore.setShowDimensions(false);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {uiStore.showDimensions ? 'ON' : 'OFF'}
                    </span>
                    <button 
                      className={`${styles.switch} ${uiStore.showDimensions ? styles.on : styles.off}`}
                      onClick={() => {
                        // 치수 토글이 켜져있으면 끄고, 모든 관련 옵션들도 함께 끄기
                        if (uiStore.showDimensions) {
                          uiStore.setShowDimensions(false);
                          // 모든 하위 옵션들 OFF
                          if (uiStore.showAll) uiStore.setShowAll(false);
                          if (uiStore.showDimensionsText) uiStore.setShowDimensionsText(false);
                          if (uiStore.showGuides) uiStore.setShowGuides(false);
                          if (uiStore.showAxis) uiStore.setShowAxis(false);
                        } else {
                          // 치수 토글이 꺼져있으면 켜기
                          uiStore.setShowDimensions(true);
                        }
                      }}
                    >
                      <div className={styles.switchHandle}></div>
                    </button>
                  </div>

                  {/* 체크박스 옵션들 - 서브헤더가 ON일 때만 표시 */}
                  {uiStore.showDimensions ? (
                  <div className={styles.checkboxGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={uiStore.showDimensions && uiStore.showAll}
                        onChange={(e) => uiStore.setShowAll(e.target.checked)}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkmark}></span>
                      가이드
                    </label>

                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={uiStore.showDimensions && uiStore.showDimensionsText}
                        onChange={(e) => uiStore.setShowDimensionsText(e.target.checked)}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkmark}></span>
                      치수
                    </label>

                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={uiStore.showDimensions && uiStore.showGuides}
                        onChange={(e) => uiStore.setShowGuides(e.target.checked)}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkmark}></span>
                      그리드
                    </label>

                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={uiStore.showDimensions && uiStore.showAxis}
                        onChange={(e) => uiStore.setShowAxis(e.target.checked)}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkmark}></span>
                      축
                    </label>
                  </div>
                  ) : null}
                </div>

                <div className={styles.centerControls}>
                  {/* 렌더 모드 */}
                  <div className={styles.renderModeGroup}>
                    <button
                      className={`${styles.renderModeButton} ${renderMode === 'solid' ? styles.active : ''}`}
                      onClick={() => setRenderMode('solid')}
                    >
                      Solid
                    </button>
                    <button
                      className={`${styles.renderModeButton} ${renderMode === 'wireframe' ? styles.active : ''}`}
                      onClick={() => setRenderMode('wireframe')}
                    >
                      Wireframe
                    </button>
                  </div>

                  {/* 뷰 모드 */}
                  <div className={styles.viewModeGroup}>
                    <button
                      className={`${styles.viewModeButton} ${viewMode === '3D' ? styles.active : ''}`}
                      onClick={() => setViewMode('3D')}
                    >
                      3D
                    </button>
                    <button
                      className={`${styles.viewModeButton} ${viewMode === '2D' ? styles.active : ''}`}
                      onClick={() => setViewMode('2D')}
                    >
                      2D
                    </button>
                  </div>
                </div>

                <div className={styles.rightControls}>
                  {/* 2D 방향 선택 */}
                  {viewMode === '2D' && (
                    <>
                      <div className={styles.viewDirectionGroup}>
                        {['front', 'top', 'left', 'right'].map((direction) => (
                          <button
                            key={direction}
                            className={`${styles.viewDirectionButton} ${view2DDirection === direction ? styles.active : ''}`}
                            onClick={() => setView2DDirection(direction as any)}
                          >
                            {direction}
                          </button>
                        ))}
                      </div>
                      
                      {/* 다크모드/라이트모드 토글 - 2D 모드에서만 표시 */}
                      <button
                        className={styles.themeToggle}
                        onClick={() => uiStore.toggleView2DTheme()}
                        title={uiStore.view2DTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                      >
                        {uiStore.view2DTheme === 'dark' ? (
                          // 해 아이콘 (라이트 모드)
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="5" />
                            <line x1="12" y1="1" x2="12" y2="3" />
                            <line x1="12" y1="21" x2="12" y2="23" />
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                            <line x1="1" y1="12" x2="3" y2="12" />
                            <line x1="21" y1="12" x2="23" y2="12" />
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                          </svg>
                        ) : (
                          // 달 아이콘 (다크 모드)
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                          </svg>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 3D 뷰어 */}
              <div ref={viewerContainerRef} className={styles.viewerContent}>
                <Space3DView
                  spaceInfo={spaceInfo}
                  viewMode={viewMode}
                  renderMode={renderMode}
                  showDimensions={uiStore.showDimensions}
                  showAll={uiStore.showAll}
                  showFrame={true}
                  showDimensionsText={uiStore.showDimensionsText}
                  showGuides={uiStore.showGuides}
                  showAxis={uiStore.showAxis}
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
      
      {/* 설정 패널 */}
      <SettingsPanel 
        isOpen={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
      />

    </div>
  );
};

export default PDFTemplatePreview;