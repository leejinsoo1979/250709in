import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { getThemeHex } from '@/theme';
import DxfParser from 'dxf-parser';

// 용지 규격 타입
type PaperSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
type Orientation = 'landscape' | 'portrait';

interface PaperDimensions {
  width: number;  // mm
  height: number; // mm
  displayWidth: number; // px for preview
  displayHeight: number; // px for preview
}

// 용지 규격 정의 (세로 방향 기준 - 실제 표준 크기)
// displayWidth/Height는 2픽셀 = 1mm 비율로 정확히 계산 (화면에 적절한 크기)
const PAPER_SIZES_BASE: Record<PaperSize, PaperDimensions> = {
  A5: { width: 148, height: 210, displayWidth: 148 * 2, displayHeight: 210 * 2 },
  A4: { width: 210, height: 297, displayWidth: 210 * 2, displayHeight: 297 * 2 },
  A3: { width: 297, height: 420, displayWidth: 297 * 2, displayHeight: 420 * 2 },
  A2: { width: 420, height: 594, displayWidth: 420 * 2, displayHeight: 594 * 2 },
  A1: { width: 594, height: 841, displayWidth: 594 * 2, displayHeight: 841 * 2 },
  A0: { width: 841, height: 1189, displayWidth: 841 * 2, displayHeight: 1189 * 2 }
};

// 방향에 따른 용지 크기 계산
const getPaperDimensions = (size: PaperSize, orientation: Orientation): PaperDimensions => {
  const base = PAPER_SIZES_BASE[size];
  if (orientation === 'landscape') {
    // 가로 방향일 때는 width와 height를 바꿈
    return {
      width: base.height,
      height: base.width,
      displayWidth: base.displayHeight,
      displayHeight: base.displayWidth
    };
  }
  // 세로 방향일 때는 기본값 그대로
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
  rotation?: number; // 회전 각도 (degree)
  viewConfig?: any; // 뷰 설정 저장
  visible?: boolean;  // 도면 데이터로 대체되면 false
  hasDrawingData?: boolean; // 도면 데이터가 삽입되었는지 여부
  hideTitle?: boolean;
  hideInfo?: boolean;
  type?: 'view' | 'image' | 'pdf' | 'dxf'; // 뷰 타입
  imageUrl?: string; // 이미지 URL
  fileName?: string; // 파일 이름
  cropRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  imageAspectRatio?: number;
}

interface ViewMenuItem {
  id: string;
  label: string;
  img?: string;
  type?: string;
  uploadedFile?: {
    id: string;
    name: string;
    type: string;
    thumbnail?: string;
    url: string;
    uploadDate: Date;
  };
}

// Available views for dragging
const AVAILABLE_VIEWS: ViewMenuItem[] = [
  { id: 'top', label: 'TOP VIEW' },
  { id: 'front', label: 'Front VIEW' },
  { id: 'side', label: 'Left VIEW' },
  { id: 'door', label: 'Door Front' },
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

type CaptureRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CaptureHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface TemplateSlot {
  id: string;
  type: 'view' | 'text';
  target: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maintainScale?: boolean;
}

interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  preview: string;
  paperSize: PaperSize;
  orientation: Orientation;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | string;
  slots: TemplateSlot[];
}

const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'a3-portrait-standard',
    name: 'A3 표준 템플릿',
    description: '정보 카드 + 상부/정면/측면/도어 뷰 배치',
    preview: '/templates/a3-template.png',
    paperSize: 'A3',
    orientation: 'portrait',
    backgroundColor: '#2d3035',
    backgroundImage: '/templates/a3-template.png',
    backgroundSize: 'cover',
    slots: [
      { id: 'info', type: 'text', target: 'info', x: 28, y: 28, width: 240, height: 140 },
      { id: 'detail1', type: 'view', target: 'detail1', x: 28, y: 188, width: 120, height: 120 },
      { id: 'top', type: 'view', target: 'top', x: 280, y: 28, width: 300, height: 140, maintainScale: true },
      { id: 'front', type: 'view', target: 'front', x: 212, y: 188, width: 360, height: 360, maintainScale: true },
      { id: 'side', type: 'view', target: 'side', x: 28, y: 328, width: 180, height: 320, maintainScale: true },
      { id: 'door', type: 'view', target: 'door', x: 212, y: 560, width: 360, height: 240, maintainScale: true }
    ]
  }
];

const normalizeTemplateViewTarget = (target: string): string => (
  target === 'right' ? 'side' : target
);

const PDF_TEMPLATE_VIEW_DIRECTIONS = ['all', 'front', 'top', 'left'] as const;

const DEFAULT_CAPTURE_REGION: CaptureRegion = {
  x: 0,
  y: 0,
  width: 1,
  height: 1
};

const MIN_CAPTURE_REGION_SIZE = 0.05;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const sanitizeRegion = (region: CaptureRegion): CaptureRegion => {
  const width = clamp(region.width, MIN_CAPTURE_REGION_SIZE, 1);
  const height = clamp(region.height, MIN_CAPTURE_REGION_SIZE, 1);
  const maxX = Math.max(0, 1 - width);
  const maxY = Math.max(0, 1 - height);

  return {
    x: clamp(region.x, 0, maxX),
    y: clamp(region.y, 0, maxY),
    width,
    height
  };
};

type CaptureDragState =
  | {
      mode: 'move';
      offsetX: number;
      offsetY: number;
      startRegion: CaptureRegion;
    }
  | {
      mode: 'resize';
      handle: CaptureHandle;
      startRegion: CaptureRegion;
    };

// const SNAP_THRESHOLD = 10; // 스냅이 작동하는 거리 (픽셀) - 비활성화
// const GRID_SIZE = 20; // 그리드 크기 - 비활성화

const PDFTemplatePreview: React.FC<PDFTemplatePreviewProps> = ({ isOpen, onClose, capturedViews }) => {
  const { t } = useTranslation();
  const [selectedPaperSize, setSelectedPaperSize] = useState<PaperSize>('A3');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [isGenerating, setIsGenerating] = useState(false);
  const [paperColor, setPaperColor] = useState('#ffffff');
  const [paperBackgroundImage, setPaperBackgroundImage] = useState<string | null>(null);
  const [paperBackgroundSize, setPaperBackgroundSize] = useState<'cover' | 'contain' | string>('cover');
  const [paperBackgroundDataUrl, setPaperBackgroundDataUrl] = useState<string | null>(null);
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
  
  // 회전 관련 상태
  const [isRotating, setIsRotating] = useState(false);
  const [rotatingView, setRotatingView] = useState<string | null>(null);
  const [rotateStart, setRotateStart] = useState({ x: 0, y: 0, angle: 0, startAngle: 0 });
  
  // 가이드 라인 상태 (포토샵 스타일)
  const [guides, setGuides] = useState<{
    vertical: number[];
    horizontal: number[];
  }>({
    vertical: [],
    horizontal: []
  });
  const [isDraggingGuide, setIsDraggingGuide] = useState<{
    type: 'vertical' | 'horizontal' | null;
    index: number;
  }>({ type: null, index: -1 });
  const [isDraggingNewGuide, setIsDraggingNewGuide] = useState<{
    type: 'vertical' | 'horizontal' | null;
    position: number;
  }>({ type: null, position: 0 });
  
  const [previewScale, setPreviewScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<ViewPosition[][]>([[]]);
  const [thumbnailRefresh, setThumbnailRefresh] = useState(0); // 썸네일 새로고침 트리거
  const [viewerOverlay, setViewerOverlay] = useState<{
    isOpen: boolean;
    viewId: string | null;
    viewType: string | null;
  }>({ isOpen: false, viewId: null, viewType: null });
  const [localCapturedViews, setLocalCapturedViews] = useState<{
    [key: string]: string;
  }>({});
  const [captureRegion, setCaptureRegion] = useState<CaptureRegion | null>(null);
  const [editingInfo, setEditingInfo] = useState<string | null>(null); // 편집 중인 정보 카드 ID
  const [activeTab, setActiveTab] = useState<'views' | 'elements' | 'text' | 'upload'>('views'); // 좌측 탭 상태
  const [uploadedFiles, setUploadedFiles] = useState<{
    id: string;
    name: string;
    type: string;
    thumbnail?: string;
    url: string;
    uploadDate: Date;
  }[]>([]); // 업로드된 파일 목록
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false); // 설정 패널 상태
  const [previewMode, setPreviewMode] = useState<'raster' | 'vector'>('vector'); // 프리뷰 모드
  const [showZoomDropdown, setShowZoomDropdown] = useState(false); // 줌 드롭다운 표시 상태
  const [isZoomDropdownOpen, setIsZoomDropdownOpen] = useState(false); // 줌 드롭다운 상태
  const [showExportPopup, setShowExportPopup] = useState(false); // 내보내기 팝업 표시 상태
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [selectedExportFormat, setSelectedExportFormat] = useState<'pdf' | 'png' | 'jpg' | 'dxf'>('pdf'); // 선택된 내보내기 형식
  const [isPaperSizeDropdownOpen, setIsPaperSizeDropdownOpen] = useState(false); // 용지 사이즈 드롭다운 상태
  const [designSubTab, setDesignSubTab] = useState<'template' | '2d' | '3d'>('template'); // 레이아웃 탭의 서브 탭 상태
  const [elementsSubTab, setElementsSubTab] = useState<'shapes' | 'lines' | 'symbols' | 'balloons' | 'frames'>('shapes'); // 요소 탭의 서브 탭 상태
  const [designScrollState, setDesignScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  const [elementsScrollState, setElementsScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  // Fabric.js 캔버스 참조
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const isInitializingRef = useRef<boolean>(false);
  const currentCanvasIdRef = useRef<string>('');
  
  // 스크롤 컨테이너 ref
  const designTabRef = useRef<HTMLDivElement>(null);
  const elementsTabRef = useRef<HTMLDivElement>(null);
  
  // 스토어 훅을 먼저 선언
  const { title } = useProjectStore();
  const { spaceInfo, materialConfig } = useSpaceConfigStore();
  const { placedModules, setAllDoors } = useFurnitureStore();
  const uiStore = useUIStore();

  // 배치된 가구 중 도어가 있는 가구가 있는지 확인
  const hasDoorsInstalled = placedModules.some(module => module.hasDoor);
  
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
          scale: 1,
          cropRegion: { ...DEFAULT_CAPTURE_REGION },
          imageAspectRatio: 1
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
          scale: 1,
          cropRegion: { ...DEFAULT_CAPTURE_REGION },
          imageAspectRatio: 1
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
          scale: 1,
          cropRegion: { ...DEFAULT_CAPTURE_REGION },
          imageAspectRatio: 1
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
          scale: 1,
          cropRegion: { ...DEFAULT_CAPTURE_REGION },
          imageAspectRatio: 1
        });
      }
      
      setViewPositions(initialPositions);
    }
  }, [capturedViews]);
  const { viewMode, view2DDirection, setViewMode, setView2DDirection, renderMode, setRenderMode, view2DTheme } = uiStore;
  const { theme } = useTheme();
  const overlayTargetView = useMemo(() => {
    if (!viewerOverlay.viewId) return null;
    return viewPositions.find(view => view.id === viewerOverlay.viewId) ?? null;
  }, [viewerOverlay.viewId, viewPositions]);
  
  // 스토어 값을 사용하는 상태 선언
  const [infoTexts, setInfoTexts] = useState<{ [key: string]: string }>({
    title: title || 'Untitled Project',
    size: `W${spaceInfo?.width || 0} × D${spaceInfo?.depth || 0} × H${spaceInfo?.height || 0}`,
    door: materialConfig?.door?.name || '18T_PET',
    body: materialConfig?.body?.name || '18.5T_LPM',
    notes: ''
  });
  const previewRef = useRef<HTMLDivElement>(null);
  const drawingAreaRef = useRef<HTMLDivElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const captureRegionRef = useRef<CaptureRegion | null>(null);
  const captureDragStateRef = useRef<CaptureDragState | null>(null);

  useEffect(() => {
    captureRegionRef.current = captureRegion;
  }, [captureRegion]);

  useEffect(() => {
    if (!viewerOverlay.isOpen || !viewerOverlay.viewId) {
      setCaptureRegion(null);
      captureDragStateRef.current = null;
      return;
    }

    let frameId: number | null = null;
    let attempts = 0;

    const initializeRegion = () => {
      const targetView = overlayTargetView;
      const canvas = viewerContainerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;

      if (!targetView) {
        setCaptureRegion(sanitizeRegion({ ...DEFAULT_CAPTURE_REGION }));
        return;
      }

      if (!canvas) {
        if (attempts < 30) {
          attempts += 1;
          frameId = requestAnimationFrame(initializeRegion);
        }
        return;
      }

      const canvasWidth = canvas.width || canvas.clientWidth;
      const canvasHeight = canvas.height || canvas.clientHeight;

      if (!canvasWidth || !canvasHeight) {
        if (attempts < 30) {
          attempts += 1;
          frameId = requestAnimationFrame(initializeRegion);
        }
        return;
      }

      if (targetView.cropRegion) {
        setCaptureRegion(sanitizeRegion(targetView.cropRegion));
        return;
      }

      const aspectRatio = targetView.width && targetView.height
        ? targetView.width / targetView.height
        : canvasWidth / canvasHeight;

      let regionWidthPx = canvasWidth;
      let regionHeightPx = regionWidthPx / aspectRatio;

      if (regionHeightPx > canvasHeight) {
        regionHeightPx = canvasHeight;
        regionWidthPx = regionHeightPx * aspectRatio;
      }

      const normalizedRegion: CaptureRegion = {
        x: (canvasWidth - regionWidthPx) / 2 / canvasWidth,
        y: (canvasHeight - regionHeightPx) / 2 / canvasHeight,
        width: regionWidthPx / canvasWidth,
        height: regionHeightPx / canvasHeight
      };

      setCaptureRegion(sanitizeRegion(normalizedRegion));
    };

    initializeRegion();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [overlayTargetView, viewerOverlay.isOpen, viewerOverlay.viewId]);

  const paperDimensions = useMemo(() => {
    const dims = getPaperDimensions(selectedPaperSize, orientation);
    console.log('📏 Paper dimensions:', {
      size: selectedPaperSize,
      orientation,
      width: dims.width + 'mm',
      height: dims.height + 'mm',
      displayWidth: dims.displayWidth + 'px',
      displayHeight: dims.displayHeight + 'px'
    });
    return dims;
  }, [selectedPaperSize, orientation]);

  const scale = useMemo(() => {
    // 뷰어 영역의 실제 사용 가능한 크기 계산 (사이드바와 미리보기 패널 제외)
    const availableWidth = window.innerWidth - 344 - 180 - 60; // 사이드바(344) + 미리보기(180) + 패딩(60)
    const availableHeight = window.innerHeight - 120; // 헤더 및 패딩
    
    // 용지 크기에 맞춰 최적의 스케일 계산 (너비와 높이 중 작은 값 사용)
    const optimalScale = Math.min(
      availableWidth / paperDimensions.displayWidth,
      availableHeight / paperDimensions.displayHeight
    );
    
    // 용지가 너무 작을 때는 확대, 너무 클 때는 축소하여 화면에 최적화
    return optimalScale * previewScale * 0.9; // 0.9를 곱해서 약간의 여백 확보
  }, [paperDimensions, previewScale]);

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
    
    console.log('🎯 뷰 클릭됨:', viewId, view.type);
    setSelectedView(viewId);
    console.log('✅ selectedView 설정됨:', viewId);
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
      viewType: normalizeTemplateViewTarget(viewType)
    });
  };

  const fetchImageAsDataUrl = useCallback(async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`템플릿 이미지를 불러오지 못했습니다: ${response.status}`);
      }
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('템플릿 이미지 변환 실패'));
          }
        };
        reader.onerror = () => reject(reader.error ?? new Error('템플릿 이미지 로딩 실패'));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('템플릿 배경 이미지를 불러오지 못했습니다:', error);
      return null;
    }
  }, []);

  const getViewDimensionsMm = useCallback((viewType: string) => {
    const normalizedViewType = normalizeTemplateViewTarget(viewType);
    const fallbackWidth = spaceInfo?.width ?? 3000;
    const fallbackDepth = spaceInfo?.depth ?? 600;
    const fallbackHeight = spaceInfo?.height ?? 2400;

    switch (normalizedViewType) {
      case 'top':
        return { width: fallbackWidth, height: fallbackDepth };
      case 'front':
        return { width: fallbackWidth, height: fallbackHeight };
      case 'side':
        return { width: fallbackDepth, height: fallbackHeight };
      case 'door':
        return { width: fallbackWidth, height: fallbackHeight };
      default:
        return { width: fallbackWidth, height: fallbackHeight };
    }
  }, [spaceInfo?.width, spaceInfo?.depth, spaceInfo?.height]);

  const applyLayoutTemplate = useCallback(async (template: LayoutTemplate) => {
    setActiveTemplateId(template.id);
    setSelectedPaperSize(template.paperSize);
    setOrientation(template.orientation);
    setPreviewScale(0.9);

    if (template.backgroundColor) {
      setPaperColor(template.backgroundColor);
    } else {
      setPaperColor('#ffffff');
    }

    if (template.backgroundImage) {
      setPaperBackgroundImage(template.backgroundImage);
      setPaperBackgroundSize(template.backgroundSize ?? 'cover');
      const dataUrl = await fetchImageAsDataUrl(template.backgroundImage);
      setPaperBackgroundDataUrl(dataUrl);
    } else {
      setPaperBackgroundImage(null);
      setPaperBackgroundDataUrl(null);
    }

    const templateDimensions = getPaperDimensions(template.paperSize, template.orientation);
    const templateWidth = templateDimensions.displayWidth;
    const templateHeight = templateDimensions.displayHeight;
    const baseViews = viewPositions.map(view => ({ ...view }));
    const updatedViews = [...baseViews];
    const usedViewIds = new Set<string>();

    const mmToPxCandidates: number[] = [];
    template.slots.forEach(slot => {
      if (slot.type === 'view' && slot.maintainScale) {
        const dimsMm = getViewDimensionsMm(slot.target);
        if (dimsMm.width > 0 && dimsMm.height > 0) {
          mmToPxCandidates.push(slot.width / dimsMm.width);
          mmToPxCandidates.push(slot.height / dimsMm.height);
        }
      }
    });

    const mmToPx = mmToPxCandidates.length > 0 ? Math.min(...mmToPxCandidates) : 1;
    const timestampBase = Date.now();

    const ensureViewForSlot = (slot: TemplateSlot, index: number) => {
      let viewIndex = updatedViews.findIndex(view => {
        const prefix = view.id.split('_')[0];
        return !usedViewIds.has(view.id) && prefix === slot.target;
      });

      if (viewIndex === -1) {
        const newView: ViewPosition = {
          id: `${slot.target}_${timestampBase}_${index}`,
          x: slot.x,
          y: slot.y,
          width: slot.width,
          height: slot.height,
          scale: 1,
          rotation: 0,
          cropRegion: { ...DEFAULT_CAPTURE_REGION },
          imageAspectRatio: slot.width / Math.max(slot.height, 1)
        };
        updatedViews.push(newView);
        viewIndex = updatedViews.length - 1;
      }

      usedViewIds.add(updatedViews[viewIndex].id);
      return viewIndex;
    };

    template.slots.forEach((slot, slotIndex) => {
      const viewIndex = ensureViewForSlot(slot, slotIndex);
      const originalView = updatedViews[viewIndex];
      const view = { ...originalView };

      let targetWidthPx = slot.width;
      let targetHeightPx = slot.height;
      let targetAspect = view.imageAspectRatio ?? (slot.width / Math.max(slot.height, 1));

      if (slot.type === 'view' && slot.maintainScale) {
        const dimsMm = getViewDimensionsMm(slot.target);
        if (dimsMm.width > 0 && dimsMm.height > 0) {
          const scaledWidth = dimsMm.width * mmToPx;
          const scaledHeight = dimsMm.height * mmToPx;
          targetWidthPx = Math.min(slot.width, scaledWidth);
          targetHeightPx = Math.min(slot.height, scaledHeight);
          targetAspect = dimsMm.width / Math.max(dimsMm.height, 1);
        }
      }

      const baseX = slot.x + (slot.width - targetWidthPx) / 2;
      const baseY = slot.y + (slot.height - targetHeightPx) / 2;

      view.x = clamp(baseX, 0, Math.max(0, templateWidth - targetWidthPx));
      view.y = clamp(baseY, 0, Math.max(0, templateHeight - targetHeightPx));
      view.width = targetWidthPx;
      view.height = targetHeightPx;
      view.scale = 1;
      view.rotation = 0;
      view.cropRegion = view.cropRegion ?? { ...DEFAULT_CAPTURE_REGION };

      if (slot.type === 'view') {
        view.imageAspectRatio = targetAspect;
      }

      updatedViews[viewIndex] = view;
    });

    setViewPositions(updatedViews);
    setPages([updatedViews.map(view => ({ ...view }))]);
    setCurrentPage(0);
  }, [
    fetchImageAsDataUrl,
    getViewDimensionsMm,
    viewPositions,
    setViewPositions,
    setPages,
    setCurrentPage,
    setPreviewScale,
    setPaperColor,
    setPaperBackgroundImage,
    setPaperBackgroundSize,
    setPaperBackgroundDataUrl,
    setActiveTemplateId
  ]);

  const handleRegionPointerMove = useCallback((event: PointerEvent) => {
    const dragState = captureDragStateRef.current;
    if (!dragState || !viewerContainerRef.current) {
      return;
    }

    const rect = viewerContainerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const pointerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const pointerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    if (dragState.mode === 'move') {
      const proposedRegion: CaptureRegion = {
        x: pointerX - dragState.offsetX,
        y: pointerY - dragState.offsetY,
        width: dragState.startRegion.width,
        height: dragState.startRegion.height
      };

      setCaptureRegion(sanitizeRegion(proposedRegion));
    } else if (dragState.mode === 'resize') {
      let { x, y, width, height } = dragState.startRegion;
      const right = x + width;
      const bottom = y + height;

      const handle = dragState.handle;

      if (handle.includes('w')) {
        const newX = clamp(pointerX, 0, right - MIN_CAPTURE_REGION_SIZE);
        x = newX;
        width = right - newX;
      }

      if (handle.includes('e')) {
        const newRight = clamp(pointerX, x + MIN_CAPTURE_REGION_SIZE, 1);
        width = newRight - x;
      }

      if (handle.includes('n')) {
        const newY = clamp(pointerY, 0, bottom - MIN_CAPTURE_REGION_SIZE);
        y = newY;
        height = bottom - newY;
      }

      if (handle.includes('s')) {
        const newBottom = clamp(pointerY, y + MIN_CAPTURE_REGION_SIZE, 1);
        height = newBottom - y;
      }

      setCaptureRegion(sanitizeRegion({ x, y, width, height }));
    }

    event.preventDefault();
  }, []);

  const handleRegionPointerUp = useCallback(() => {
    captureDragStateRef.current = null;
    window.removeEventListener('pointermove', handleRegionPointerMove);
    window.removeEventListener('pointerup', handleRegionPointerUp);
  }, [handleRegionPointerMove]);

  const handleCaptureRegionPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!captureRegion || !viewerContainerRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = viewerContainerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const pointerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const pointerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    const startRegion = sanitizeRegion(captureRegion);
    captureDragStateRef.current = {
      mode: 'move',
      offsetX: pointerX - startRegion.x,
      offsetY: pointerY - startRegion.y,
      startRegion
    };

    window.addEventListener('pointermove', handleRegionPointerMove, { passive: false });
    window.addEventListener('pointerup', handleRegionPointerUp);
  };

  const handleCaptureHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>, handle: CaptureHandle) => {
    if (!captureRegion || !viewerContainerRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    const startRegion = sanitizeRegion(captureRegion);
    captureDragStateRef.current = {
      mode: 'resize',
      handle,
      startRegion
    };

    window.addEventListener('pointermove', handleRegionPointerMove, { passive: false });
    window.addEventListener('pointerup', handleRegionPointerUp);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleRegionPointerMove);
      window.removeEventListener('pointerup', handleRegionPointerUp);
    };
  }, [handleRegionPointerMove, handleRegionPointerUp]);

  useEffect(() => {
    if (!viewerOverlay.isOpen) {
      window.removeEventListener('pointermove', handleRegionPointerMove);
      window.removeEventListener('pointerup', handleRegionPointerUp);
      captureDragStateRef.current = null;
    }
  }, [handleRegionPointerMove, handleRegionPointerUp, viewerOverlay.isOpen]);

  // 뷰어에서 캡처 버튼 핸들러
  const handleCaptureFromViewer = async () => {
    if (!viewerContainerRef.current || !viewerOverlay.viewId) return;
    console.log('🎯 handleCaptureFromViewer 호출', {
      viewType: viewerOverlay.viewType,
      viewId: viewerOverlay.viewId
    });

    try {
      const targetView = viewPositions.find(v => v.id === viewerOverlay.viewId);
      if (!targetView) {
        console.error('뷰를 찾을 수 없습니다');
        return;
      }

      const canvas = viewerContainerRef.current.querySelector('canvas');
      if (!canvas) {
        console.error('Canvas not found in viewer container');
        return;
      }

      // 렌더 프레임이 완료된 뒤 데이터를 읽도록 한 틱 대기
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));

      const sourceCanvas = canvas as HTMLCanvasElement;
      const sourceWidth = sourceCanvas.width || sourceCanvas.clientWidth;
      const sourceHeight = sourceCanvas.height || sourceCanvas.clientHeight;

      if (!sourceWidth || !sourceHeight) {
        console.error('소스 캔버스 크기를 확인할 수 없습니다');
        return;
      }

      const activeRegion = sanitizeRegion(captureRegionRef.current ?? { ...DEFAULT_CAPTURE_REGION });
      const regionWidthPxRaw = Math.round(activeRegion.width * sourceWidth);
      const regionHeightPxRaw = Math.round(activeRegion.height * sourceHeight);
      const regionWidthPx = clamp(regionWidthPxRaw, 1, sourceWidth);
      const regionHeightPx = clamp(regionHeightPxRaw, 1, sourceHeight);
      const maxX = sourceWidth - regionWidthPx;
      const maxY = sourceHeight - regionHeightPx;
      const regionX = clamp(Math.round(activeRegion.x * sourceWidth), 0, maxX);
      const regionY = clamp(Math.round(activeRegion.y * sourceHeight), 0, maxY);
      const imageAspectRatio = regionWidthPx / Math.max(regionHeightPx, 1);

      // 캔버스 이미지를 고해상도로 리샘플링 (PDF 출력용 8192px)
      const maxDimension = 8192; // 4096 → 8192로 증가
      const scaleFactor = Math.min(2, maxDimension / Math.max(regionWidthPx, regionHeightPx)); // 최소 2배 확대
      const targetWidth = Math.max(1, Math.round(regionWidthPx * scaleFactor));
      const targetHeight = Math.max(1, Math.round(regionHeightPx * scaleFactor));

      const offscreen = document.createElement('canvas');
      offscreen.width = targetWidth;
      offscreen.height = targetHeight;
      const ctx = offscreen.getContext('2d');

      if (!ctx) {
        console.error('오프스크린 캔버스 컨텍스트를 생성할 수 없습니다');
        return;
      }

      // 배경을 투명하게 유지 (fillRect 제거)
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceCanvas, regionX, regionY, regionWidthPx, regionHeightPx, 0, 0, targetWidth, targetHeight);

      const imgData = offscreen.toDataURL('image/png');

      if (!imgData) {
        console.error('이미지 데이터를 생성하지 못했습니다');
        return;
      }

      const viewId = viewerOverlay.viewId;
      const viewType = viewerOverlay.viewType
        ? normalizeTemplateViewTarget(viewerOverlay.viewType)
        : null;

      setLocalCapturedViews(prev => ({
        ...prev,
        [viewId]: imgData,
        ...(viewType ? { [viewType]: imgData } : {})
      }));

      setViewPositions(prev => prev.map(view => 
        view.id === viewId
          ? {
              ...view,
              imageUrl: imgData,
              type: 'image',
              hasDrawingData: false,
              visible: true,
              cropRegion: activeRegion,
              imageAspectRatio
            }
          : view
      ));

      setTimeout(() => {
        setThumbnailRefresh(prev => prev + 1);
        if (fabricCanvasRef.current) {
          fabricCanvasRef.current.renderAll();
        }
      }, 0);

      setViewerOverlay({ isOpen: false, viewId: null, viewType: null });
      console.log('✅ 캔버스 캡처 완료:', { viewId, viewType });
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

  // Delete/Backspace 키로 선택된 뷰 삭제
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedView) {
        // 텍스트 입력 중이 아닐 때만 삭제
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleDeleteView(selectedView);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyPress);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isOpen, selectedView]);

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

  // 회전 시작
  const handleRotateStart = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const view = viewPositions.find(v => v.id === viewId);
    if (!view) return;
    
    console.log('🔄 회전 시작:', viewId, view.type);
    setIsRotating(true);
    setRotatingView(viewId);
    
    // 뷰의 중심점 계산
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (rect) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      
      console.log('📐 회전 초기값:', {
        centerX, 
        centerY, 
        startAngle,
        currentRotation: view.rotation || 0
      });
      
      setRotateStart({
        x: centerX,
        y: centerY,
        angle: view.rotation || 0,
        startAngle: startAngle // 시작 각도 저장
      });
    }
  };

  // 정렬 가이드라인 찾기 (시각적 가이드만, 스냅 없음)
  const findAlignmentGuides = React.useCallback((view: ViewPosition, excludeId: string) => {
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
  }, [viewPositions]);

  // 페이지 추가
  const handleAddPage = () => {
    // 현재 페이지의 뷰들을 먼저 저장
    const newPages = [...pages];
    newPages[currentPage] = viewPositions;
    
    // 새로운 빈 페이지 추가
    newPages.push([]);
    setPages(newPages);
    
    // 새 페이지로 이동하고 뷰 초기화
    const newPageIndex = newPages.length - 1;
    setCurrentPage(newPageIndex);
    setViewPositions([]);  // 새 페이지이므로 빈 배열로 설정
    
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
  // 줌 레벨 단계 정의
  const zoomLevels = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 1.75, 2];
  
  const handleZoom = (delta: number) => {
    setPreviewScale(prev => {
      // 현재 값과 가장 가까운 단계를 찾기
      let currentIndex = 0;
      let minDiff = Math.abs(zoomLevels[0] - prev);
      
      for (let i = 1; i < zoomLevels.length; i++) {
        const diff = Math.abs(zoomLevels[i] - prev);
        if (diff < minDiff) {
          minDiff = diff;
          currentIndex = i;
        }
      }
      
      if (delta > 0) {
        // 확대 - 현재 값보다 큰 다음 단계로
        for (let i = currentIndex; i < zoomLevels.length; i++) {
          if (zoomLevels[i] > prev + 0.01) {
            return zoomLevels[i];
          }
        }
        return zoomLevels[zoomLevels.length - 1];
      } else {
        // 축소 - 현재 값보다 작은 이전 단계로
        for (let i = currentIndex; i >= 0; i--) {
          if (zoomLevels[i] < prev - 0.01) {
            return zoomLevels[i];
          }
        }
        return zoomLevels[0];
      }
    });
  };

  // 스냅 관련 함수들 제거됨

  // 드래그 중
  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    // 회전 중인 경우
    if (isRotating && rotatingView) {
      const view = viewPositions.find(v => v.id === rotatingView);
      if (!view) return;
      
      const currentAngle = Math.atan2(e.clientY - rotateStart.y, e.clientX - rotateStart.x) * (180 / Math.PI);
      const angleDelta = currentAngle - rotateStart.startAngle;
      let newRotation = rotateStart.angle + angleDelta;
      
      // 각도를 0-360 범위로 정규화
      while (newRotation < 0) newRotation += 360;
      while (newRotation >= 360) newRotation -= 360;
      
      // Shift 키를 누르면 15도 단위로 스냅
      if (e.shiftKey) {
        newRotation = Math.round(newRotation / 15) * 15;
      }
      
      console.log('🔄 회전 중:', {
        viewId: rotatingView,
        currentAngle,
        angleDelta,
        newRotation,
        shiftKey: e.shiftKey
      });
      
      setViewPositions(prev => prev.map(v => 
        v.id === rotatingView 
          ? { ...v, rotation: newRotation }
          : v
      ));
      return;
    }
    
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
  }, [isRotating, rotatingView, rotateStart, isResizing, resizingView, viewPositions, resizeStart, scale, isDraggingFromMenu, draggedMenuItem, dragOffset, draggingView, paperDimensions, findAlignmentGuides]);

  // 드래그 종료
  const handleMouseUp = React.useCallback((e: MouseEvent) => {
    if (isRotating) {
      setIsRotating(false);
      setRotatingView(null);
      return;
    }
    
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
      
      console.log('🎯 드롭 위치 계산:', { x, y, scale, paperDimensions });
      
      // 경계 내에 드롭했는지 확인
      if (x >= 0 && y >= 0 && x <= paperDimensions.displayWidth && y <= paperDimensions.displayHeight) {
        // 도형인 경우 Fabric 캔버스에 추가
        if (draggedMenuItem.type === 'shape' && fabricCanvasRef.current) {
          const canvas = fabricCanvasRef.current;
          
          if (draggedMenuItem.shapeType === 'rectangle') {
            const rect = new fabric.Rect({
              left: x - 50,
              top: y - 50,
              fill: '#333333',
              width: 100,
              height: 100,
              selectable: true,
              hasControls: true
            });
            canvas.add(rect);
          } else if (draggedMenuItem.shapeType === 'circle') {
            const circle = new fabric.Circle({
              left: x - 50,
              top: y - 50,
              fill: '#333333',
              radius: 50,
              selectable: true,
              hasControls: true
            });
            canvas.add(circle);
          } else if (draggedMenuItem.shapeType === 'triangle') {
            const triangle = new fabric.Triangle({
              left: x - 50,
              top: y - 50,
              fill: '#333333',
              width: 100,
              height: 100,
              selectable: true,
              hasControls: true
            });
            canvas.add(triangle);
          } else if (draggedMenuItem.shapeType === 'rounded-rectangle') {
            const rect = new fabric.Rect({
              left: x - 50,
              top: y - 50,
              fill: '#333333',
              width: 100,
              height: 100,
              rx: 10,
              ry: 10,
              selectable: true,
              hasControls: true
            });
            canvas.add(rect);
          } else if (draggedMenuItem.shapeType === 'ellipse') {
            const ellipse = new fabric.Ellipse({
              left: x - 50,
              top: y - 50,
              fill: '#333333',
              rx: 60,
              ry: 40,
              selectable: true,
              hasControls: true
            });
            canvas.add(ellipse);
          } else if (draggedMenuItem.shapeType === 'pentagon') {
            // Pentagon as a polygon
            const pentagon = new fabric.Polygon([
              {x: 50, y: 0},
              {x: 100, y: 35},
              {x: 80, y: 90},
              {x: 20, y: 90},
              {x: 0, y: 35}
            ], {
              left: x - 50,
              top: y - 45,
              fill: '#333333',
              selectable: true,
              hasControls: true
            });
            canvas.add(pentagon);
          } else if (draggedMenuItem.shapeType === 'hexagon') {
            // Hexagon as a polygon
            const hexagon = new fabric.Polygon([
              {x: 30, y: 0},
              {x: 70, y: 0},
              {x: 100, y: 50},
              {x: 70, y: 100},
              {x: 30, y: 100},
              {x: 0, y: 50}
            ], {
              left: x - 50,
              top: y - 50,
              fill: '#333333',
              selectable: true,
              hasControls: true
            });
            canvas.add(hexagon);
          } else if (draggedMenuItem.shapeType === 'star') {
            // Star as a path
            const star = new fabric.Path('M 50,0 L 61,35 L 98,35 L 68,57 L 79,91 L 50,70 L 21,91 L 32,57 L 2,35 L 39,35 z', {
              left: x - 50,
              top: y - 45,
              fill: '#333333',
              selectable: true,
              hasControls: true
            });
            canvas.add(star);
          }
          
          canvas.renderAll();
          console.log('✅ 도형 추가됨:', draggedMenuItem.shapeType);
        }
        // 심볼인 경우 Fabric 캔버스에 추가
        else if (draggedMenuItem.type === 'symbol' && fabricCanvasRef.current) {
          const canvas = fabricCanvasRef.current;
          const text = new fabric.Text(draggedMenuItem.symbol || '', {
            left: x - 30,
            top: y - 30,
            fontSize: 60,
            fill: '#333333',
            selectable: true,
            hasControls: true
          });
          canvas.add(text);
          canvas.renderAll();
          console.log('✅ 심볼 추가됨:', draggedMenuItem.symbol);
        }
        // 업로드된 파일인 경우 viewPositions에 추가
        else if (draggedMenuItem.type === 'uploaded-file' && draggedMenuItem.uploadedFile) {
          const file = draggedMenuItem.uploadedFile;
          
          if (file.type === 'image') {
            // 이미지를 뷰카드로 추가
            const newImageView: ViewPosition = {
              id: `image_${Date.now()}`,
              x: x - 100, // 중앙 정렬을 위해 오프셋
              y: y - 75,
              width: 200,
              height: 150,
              scale: 1,
              rotation: 0, // 회전 초기값
              type: 'image',
              imageUrl: file.url,
              fileName: file.name,
              cropRegion: { ...DEFAULT_CAPTURE_REGION },
              imageAspectRatio: 4 / 3
            };
            
            console.log('✅ 이미지 뷰카드 추가:', newImageView);
            setViewPositions(prev => [...prev, newImageView]);
          } else if (file.type === 'pdf') {
            // PDF를 뷰카드로 추가
            const newPdfView: ViewPosition = {
              id: `pdf_${Date.now()}`,
              x: x - 100,
              y: y - 75,
              width: 200,
              height: 150,
              scale: 1,
              rotation: 0, // 회전 초기값
              type: 'pdf',
              fileName: file.name
            };
            
            console.log('✅ PDF 뷰카드 추가:', newPdfView);
            setViewPositions(prev => [...prev, newPdfView]);
          } else if (file.type === 'dxf') {
            // DXF를 뷰카드로 추가
            const newDxfView: ViewPosition = {
              id: `dxf_${Date.now()}`,
              x: x - 100,
              y: y - 75,
              width: 200,
              height: 150,
              scale: 1,
              rotation: 0, // 회전 초기값
              type: 'dxf',
              fileName: file.name
            };
            
            console.log('✅ DXF 뷰카드 추가:', newDxfView);
            setViewPositions(prev => [...prev, newDxfView]);
          }
        } else {
          // 기존 뷰 카드 처리
          const newView: ViewPosition = {
            id: `${draggedMenuItem.id}_${Date.now()}`,
            x: x - 100, // 중앙 정렬을 위해 오프셋 (스냅 제거)
            y: y - 75,
            width: 200,
            height: 150,
            scale: 1,
            cropRegion: { ...DEFAULT_CAPTURE_REGION },
            imageAspectRatio: 4 / 3
          };
          console.log('✅ 뷰카드 추가:', newView);
          setViewPositions(prev => {
            const updated = [...prev, newView];
            console.log('📊 업데이트된 viewPositions:', updated);
            return updated;
          });
        }
      } else {
        console.log('❌ 드롭 위치가 경계 밖:', { x, y, paperDimensions });
      }
      
      setIsDraggingFromMenu(false);
      setDraggedMenuItem(null);
    }
    
    setDraggingView(null);
    setDragPreviewPos(null);
    setAlignmentGuides({ vertical: [], horizontal: [] }); // 가이드라인 제거
  }, [isRotating, isResizing, isDraggingFromMenu, draggedMenuItem, scale, paperDimensions]);

  // 마우스 이벤트 리스너
  useEffect(() => {
    if (draggingView || isDraggingFromMenu || isResizing || isRotating) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingView, isDraggingFromMenu, isResizing, isRotating, dragOffset, scale, resizeStart, rotateStart, handleMouseMove, handleMouseUp]);

  // 캔버스 초기화 함수 (useEffect 밖에서 정의)
  const initCanvas = useCallback(async () => {
      if (!canvasContainerRef.current) {
        console.error('캔버스 컨테이너가 없습니다.');
        return false;
      }

      // 중복 초기화 방지
      if (isInitializingRef.current) {
        console.log('⚠️ Canvas initialization already in progress');
        return false;
      }

      isInitializingRef.current = true;
      console.log('🔧 Canvas initialization started - orientation:', orientation);
      
      try {
        // 1. 모든 Fabric 캔버스 인스턴스 제거
        if (fabricCanvasRef.current) {
          console.log('🗑️ Destroying existing canvas');
          try {
            fabricCanvasRef.current.clear();
            fabricCanvasRef.current.dispose();
          } catch (e) {
            console.warn('Canvas dispose error (ignored):', e);
          }
          fabricCanvasRef.current = null;
        }
        
        // 2. 현재 컨테이너 범위에서만 기존 캔버스 정리
        const scopedContainers = canvasContainerRef.current.querySelectorAll('.canvas-container');
        scopedContainers.forEach(container => container.remove());

        const scopedCanvases = canvasContainerRef.current.querySelectorAll('canvas');
        scopedCanvases.forEach(canvas => canvas.remove());

        // 3. 컨테이너 내부 완전히 비우기
        canvasContainerRef.current.innerHTML = '';
        console.log('✅ Canvas container completely cleared');
      
        // 고유 ID 생성
        const uniqueId = `fabric-canvas-${Date.now()}`;
        currentCanvasIdRef.current = uniqueId;
        
        // 기존 캔버스 요소 확인 및 제거
        const existingCanvas = document.getElementById(uniqueId);
        if (existingCanvas) {
          console.warn('⚠️ Existing canvas found, removing');
          existingCanvas.remove();
        }
        
        const newCanvas = document.createElement('canvas');
        newCanvas.id = uniqueId;
        newCanvas.style.position = 'absolute';
        newCanvas.style.top = '0';
        newCanvas.style.left = '0';
        canvasContainerRef.current.appendChild(newCanvas);
        
        // DOM 업데이트 대기
        await new Promise(resolve => setTimeout(resolve, 20));
        
        // Fabric.js가 생성한 컨테이너가 있으면 제거
        const existingContainers = canvasContainerRef.current.querySelectorAll('.canvas-container');
        existingContainers.forEach(container => container.remove());
        
        // 새 캔버스 생성
        const canvas = new fabric.Canvas(uniqueId, {
            width: paperDimensions.displayWidth,
            height: paperDimensions.displayHeight,
            backgroundColor: paperBackgroundImage ? 'rgba(0,0,0,0)' : paperColor,
            selection: true,
            preserveObjectStacking: true,
            renderOnAddRemove: true
          });

          fabricCanvasRef.current = canvas;
          
          // 캔버스 생성 직후 즉시 중복 체크
          requestAnimationFrame(() => {
            if (!canvasContainerRef.current) return;
            const containers = canvasContainerRef.current.querySelectorAll('.canvas-container');
            console.log(`🔍 Canvas created, found ${containers.length} containers`);
            
            if (containers.length > 1) {
              console.log('🚑 Emergency cleanup: Removing duplicate containers');
              // 첫 번째를 제외한 모든 컨테이너 제거
              for (let i = 1; i < containers.length; i++) {
                containers[i].remove();
              }
            }
            
            // 컨테이너 내부의 중복 캔버스도 체크
            if (canvasContainerRef.current) {
              const innerContainers = canvasContainerRef.current.querySelectorAll('.canvas-container');
              if (innerContainers.length > 1) {
                console.log('🚑 Removing inner duplicate containers');
                for (let i = 1; i < innerContainers.length; i++) {
                  innerContainers[i].remove();
                }
              }
            }
          });
          
          // 추가 검증: 100ms 후 다시 한번 체크
          setTimeout(() => {
            if (!canvasContainerRef.current) return;
            const finalContainers = canvasContainerRef.current.querySelectorAll('.canvas-container');
            const finalCanvases = canvasContainerRef.current.querySelectorAll('canvas');
            console.log(`🎯 Final check - containers: ${finalContainers.length}, canvases: ${finalCanvases.length}`);
            
            if (finalContainers.length > 1) {
              console.log('🔥 Still duplicated! Force removing all but first');
              for (let i = 1; i < finalContainers.length; i++) {
                finalContainers[i].remove();
              }
            }
          }, 100);

          // CAD 스타일 그리드 생성
          console.log('🎯 그리드 생성 시작');
          const gridSize = 20; // 그리드 간격 증가
          const majorGridSize = gridSize * 5; // 주 그리드 간격
          
          // 캔버스 배경을 흰색으로 설정
          canvas.setBackgroundColor('#ffffff', () => {
            canvas.renderAll();
          });
          
          // 보조 그리드선 (연한 선)
          for (let i = 0; i <= paperDimensions.displayWidth; i += gridSize) {
            const line = new fabric.Line([i, 0, i, paperDimensions.displayHeight], {
              stroke: '#cccccc',
              strokeWidth: 1,
              selectable: false,
              evented: false,
              excludeFromExport: false,
              hasControls: false,
              hasBorders: false
            });
            canvas.add(line);
            canvas.sendToBack(line);
          }
          
          for (let i = 0; i <= paperDimensions.displayHeight; i += gridSize) {
            const line = new fabric.Line([0, i, paperDimensions.displayWidth, i], {
              stroke: '#cccccc',
              strokeWidth: 1,
              selectable: false,
              evented: false,
              excludeFromExport: false,
              hasControls: false,
              hasBorders: false
            });
            canvas.add(line);
            canvas.sendToBack(line);
          }

          // 주 그리드선 (진한 선)
          for (let i = 0; i <= paperDimensions.displayWidth; i += majorGridSize) {
            const line = new fabric.Line([i, 0, i, paperDimensions.displayHeight], {
              stroke: '#888888',
              strokeWidth: 2,
              selectable: false,
              evented: false,
              excludeFromExport: false,
              hasControls: false,
              hasBorders: false
            });
            canvas.add(line);
          }
          
          for (let i = 0; i <= paperDimensions.displayHeight; i += majorGridSize) {
            const line = new fabric.Line([0, i, paperDimensions.displayWidth, i], {
              stroke: '#888888',
              strokeWidth: 2,
              selectable: false,
              evented: false,
              excludeFromExport: false,
              hasControls: false,
              hasBorders: false
            });
            canvas.add(line);
          }

          // 중심선 (십자선)
          const centerX = paperDimensions.displayWidth / 2;
          const centerY = paperDimensions.displayHeight / 2;
          
          const centerLineV = new fabric.Line([centerX, 0, centerX, paperDimensions.displayHeight], {
            stroke: '#0080ff',
            strokeWidth: 2,
            strokeDashArray: [10, 5],
            selectable: false,
            evented: false,
            excludeFromExport: false,
            hasControls: false,
            hasBorders: false
          });
          
          const centerLineH = new fabric.Line([0, centerY, paperDimensions.displayWidth, centerY], {
            stroke: '#0080ff',
            strokeWidth: 2,
            strokeDashArray: [10, 5],
            selectable: false,
            evented: false,
            excludeFromExport: false,
            hasControls: false,
            hasBorders: false
          });
          
          canvas.add(centerLineV);
          canvas.add(centerLineH);
          
          // 그리드 렌더링 강제 적용
          canvas.renderAll();
          console.log('✅ 그리드 생성 완료');
          
          // 캔버스 변경 시 썸네일 업데이트 (객체 변경 시에만)
          canvas.on('object:modified', () => {
            setThumbnailRefresh(prev => prev + 1);
          });
          canvas.on('object:added', () => {
            setThumbnailRefresh(prev => prev + 1);
          });
          canvas.on('object:removed', () => {
            setThumbnailRefresh(prev => prev + 1);
          });

          // Delete/Backspace 키로 선택된 객체 삭제
          const handleCanvasKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && canvas) {
              const activeObject = canvas.getActiveObject();
              if (activeObject) {
                // 텍스트 편집 중이 아닐 때만 삭제
                const activeElement = document.activeElement;
                if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
                  e.preventDefault();
                  canvas.remove(activeObject);
                  canvas.discardActiveObject();
                  canvas.renderAll();
                }
              }
            }
          };

          document.addEventListener('keydown', handleCanvasKeyDown);
          
          // 클린업 함수에 이벤트 리스너 제거 추가
          (window as any).handleCanvasKeyDown = handleCanvasKeyDown;
          
          // 캔버스가 제대로 생성되었는지 확인
          canvas.renderAll();
          
          // 캔버스 엘리먼트에 z-index 설정
          const wrapperEl = canvas.wrapperEl;
          if (wrapperEl) {
            wrapperEl.style.zIndex = '10';
            wrapperEl.style.position = 'absolute';
            wrapperEl.style.top = '0';
            wrapperEl.style.left = '0';
          }
          
          console.log('Fabric.js 캔버스 초기화 완료', {
            canvas: canvas,
            width: canvas.width,
            height: canvas.height,
            backgroundColor: canvas.backgroundColor,
            element: canvas.getElement(),
            wrapper: canvas.wrapperEl
          });
          
          console.log('✅ Canvas reinitialized - orientation:', orientation);
          return true;
        } catch (error) {
          console.error('Fabric.js 캔버스 생성 오류:', error);
          return false;
        } finally {
          // 초기화 플래그 리셋
          isInitializingRef.current = false;
          console.log('🔓 Canvas initialization flag reset');
        }
    }, [isOpen, orientation, paperDimensions, paperColor, paperBackgroundImage]);

  // Fabric.js 캔버스 초기화
  useEffect(() => {
    // MutationObserver로 중복 캔버스 감지 및 제거
    let observer: MutationObserver | null = null;
    
    if (canvasContainerRef.current && isOpen) {
      observer = new MutationObserver((mutations) => {
        const containers = canvasContainerRef.current?.querySelectorAll('.canvas-container');
        if (containers && containers.length > 1) {
          console.log('🚨 MutationObserver: 중복 캔버스 감지!', containers.length);
          // 첫 번째를 제외한 모든 컨테이너 제거
          for (let i = 1; i < containers.length; i++) {
            containers[i].remove();
          }
        }
      });
      
      observer.observe(canvasContainerRef.current, {
        childList: true,
        subtree: true
      });
    }
    
    // 모달이 열려있지 않으면 초기화하지 않음
    if (!isOpen) {
      // 캔버스 정리
      if (fabricCanvasRef.current) {
        console.log('모달 닫힘 - 캔버스 정리');
        try {
          fabricCanvasRef.current.clear();
          fabricCanvasRef.current.dispose();
        } catch (e) {
          console.error('캔버스 정리 중 오류:', e);
        }
        fabricCanvasRef.current = null;
      }
      
      // 모든 캔버스 관련 요소 제거
      if (canvasContainerRef.current) {
        const allCanvasContainers = canvasContainerRef.current.querySelectorAll('.canvas-container');
        console.log(`🧹 모달 닫힘 - canvas-container ${allCanvasContainers.length}개 제거`);
        allCanvasContainers.forEach(container => container.remove());
        
        const allCanvases = canvasContainerRef.current.querySelectorAll('canvas');
        console.log(`🧹 모달 닫힘 - canvas ${allCanvases.length}개 제거`);
        allCanvases.forEach(canvas => canvas.remove());
      }
      return;
    }

    // 초기화 실행 - 최초 오픈 시 한 번만
    if (isOpen && canvasContainerRef.current && !fabricCanvasRef.current) {
      console.log('🚀 캔버스 초기화 시도:', {
        isOpen,
        hasContainer: !!canvasContainerRef.current,
        hasCanvas: !!fabricCanvasRef.current
      });
      initCanvas();
      
      // 100ms마다 중복 캔버스 체크 (처음 1초 동안만)
      let checkCount = 0;
      const intervalId = setInterval(() => {
        if (canvasContainerRef.current) {
          const containers = canvasContainerRef.current.querySelectorAll('.canvas-container');
          if (containers.length > 1) {
            console.log(`🔥 Interval: 중복 제거 ${containers.length}개 → 1개`);
            for (let i = 1; i < containers.length; i++) {
              containers[i].remove();
            }
          }
        }
        checkCount++;
        if (checkCount >= 10) {
          clearInterval(intervalId);
        }
      }, 100);
    }
    
    // 키보드 이벤트 핸들러
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!fabricCanvasRef.current) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObjects = fabricCanvasRef.current.getActiveObjects();
        if (activeObjects.length > 0) {
          activeObjects.forEach(obj => fabricCanvasRef.current!.remove(obj));
          fabricCanvasRef.current.discardActiveObject();
          fabricCanvasRef.current.renderAll();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Fabric 캔버스 키보드 이벤트 리스너 제거
      if ((window as any).handleCanvasKeyDown) {
        document.removeEventListener('keydown', (window as any).handleCanvasKeyDown);
        delete (window as any).handleCanvasKeyDown;
      }
      // MutationObserver 정리
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }, [isOpen]); // 의존성을 isOpen만으로 최소화

  // 이미 아래에서 처리하므로 주석 처리
  /*
  useEffect(() => {
    if (fabricCanvasRef.current && isOpen) {
      const currentWidth = fabricCanvasRef.current.getWidth();
      const currentHeight = fabricCanvasRef.current.getHeight();
      
      if (currentWidth !== paperDimensions.displayWidth || currentHeight !== paperDimensions.displayHeight) {
        console.log('캔버스 크기 업데이트:', { 
          from: { width: currentWidth, height: currentHeight },
          to: { width: paperDimensions.displayWidth, height: paperDimensions.displayHeight }
        });
        
        fabricCanvasRef.current.setDimensions({
          width: paperDimensions.displayWidth,
          height: paperDimensions.displayHeight
        });
        fabricCanvasRef.current.renderAll();
      }
    }
  }, [paperDimensions.displayWidth, paperDimensions.displayHeight, isOpen]);
  */
  
  // paperDimensions 변경 시에만 캔버스 크기 업데이트
  useEffect(() => {
    if (!isOpen || !fabricCanvasRef.current) return;
    
    console.log('🔄 Paper dimensions 변경 감지');
    
    // 캔버스 크기만 업데이트 (재생성 X)
    fabricCanvasRef.current.setDimensions({
      width: paperDimensions.displayWidth,
      height: paperDimensions.displayHeight
    });
    fabricCanvasRef.current.renderAll();
    
  }, [paperDimensions.displayWidth, paperDimensions.displayHeight, isOpen]);

  // 뷰 위치가 변경될 때마다 현재 페이지에 저장
  useEffect(() => {
    // 실제로 변경이 있을 때만 업데이트
    if (pages[currentPage] !== viewPositions) {
      const newPages = [...pages];
      newPages[currentPage] = viewPositions;
      setPages(newPages);
    }
  }, [viewPositions, currentPage]);
  
  // 가이드 드래그 처리
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 새 가이드 생성 중
      if (isDraggingNewGuide.type) {
        const rulerWrapper = document.querySelector(`.${styles.rulerWrapper}`) as HTMLElement;
        if (rulerWrapper) {
          const rect = rulerWrapper.getBoundingClientRect();
          const paperContent = document.querySelector(`.${styles.previewContent}`) as HTMLElement;
          const paperRect = paperContent?.getBoundingClientRect();
          
          if (paperRect) {
            if (isDraggingNewGuide.type === 'vertical') {
              const x = (e.clientX - paperRect.left) / scale;
              if (x >= 0 && x <= paperDimensions.displayWidth) {
                setGuides(prev => ({
                  ...prev,
                  vertical: [...prev.vertical, x]
                }));
              }
            } else {
              const y = (e.clientY - paperRect.top) / scale;
              if (y >= 0 && y <= paperDimensions.displayHeight) {
                setGuides(prev => ({
                  ...prev,
                  horizontal: [...prev.horizontal, y]
                }));
              }
            }
          }
        }
        setIsDraggingNewGuide({ type: null, position: 0 });
      }
      
      // 기존 가이드 이동 중
      if (isDraggingGuide.type) {
        const paperContent = document.querySelector(`.${styles.previewContent}`) as HTMLElement;
        const paperRect = paperContent?.getBoundingClientRect();
        
        if (paperRect) {
          if (isDraggingGuide.type === 'vertical') {
            const x = (e.clientX - paperRect.left) / scale;
            if (x >= 0 && x <= paperDimensions.displayWidth) {
              setGuides(prev => ({
                ...prev,
                vertical: prev.vertical.map((g, i) => i === isDraggingGuide.index ? x : g)
              }));
            }
          } else {
            const y = (e.clientY - paperRect.top) / scale;
            if (y >= 0 && y <= paperDimensions.displayHeight) {
              setGuides(prev => ({
                ...prev,
                horizontal: prev.horizontal.map((g, i) => i === isDraggingGuide.index ? y : g)
              }));
            }
          }
        }
      }
    };
    
    const handleMouseUp = () => {
      setIsDraggingNewGuide({ type: null, position: 0 });
      setIsDraggingGuide({ type: null, index: -1 });
    };
    
    if (isDraggingNewGuide.type || isDraggingGuide.type) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingNewGuide, isDraggingGuide, scale, paperDimensions]);

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
    
    // 캔버스가 없으면 리턴
    if (!fabricCanvasRef.current) {
      console.error('캔버스가 초기화되지 않았습니다.');
      return;
    }

    const canvas = fabricCanvasRef.current;
    console.log('캔버스 상태:', {
      width: canvas.width,
      height: canvas.height,
      objects: canvas.getObjects().length,
      isReady: canvas.getElement() !== null
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
      
      // 캔버스 상태 확인
      const canvasEl = canvas.getElement();
      console.log('캔버스 엘리먼트 상태:', {
        width: canvasEl.width,
        height: canvasEl.height,
        style: canvasEl.style.cssText,
        parent: canvasEl.parentElement?.className
      });
    }, (error) => {
      console.error('SVG 로드 에러:', error);
    });
  };

  // 선 클릭 핸들러
  const handleLineClick = (lineType: string) => {
    console.log('선 클릭됨:', lineType);
    
    // 캔버스가 없으면 리턴
    if (!fabricCanvasRef.current) {
      console.error('캔버스가 초기화되지 않았습니다.');
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
      console.log('선 추가 전 객체 수:', canvas.getObjects().length);
      canvas.add(line);
      console.log('선 추가 후 객체 수:', canvas.getObjects().length);
      canvas.setActiveObject(line);
      canvas.renderAll();
      console.log('선이 캔버스에 추가되었습니다.');
    }
  };

  // DXF 파일 처리 함수
  const processDXFFile = async (file: File) => {
    if (!fabricCanvasRef.current) return;
    
    try {
      const fileContent = await file.text();
      const parser = new DxfParser();
      const dxf = parser.parseSync(fileContent);
      
      if (!dxf) {
        console.error('DXF 파싱 실패');
        return;
      }
      
      const canvas = fabricCanvasRef.current;
      const canvasWidth = canvas.width!;
      const canvasHeight = canvas.height!;
      
      // DXF 좌표 범위 계산
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      // 모든 엔티티의 좌표 범위 계산
      if (dxf.entities) {
        dxf.entities.forEach((entity: any) => {
          if (entity.type === 'LINE') {
            minX = Math.min(minX, entity.vertices[0].x, entity.vertices[1].x);
            minY = Math.min(minY, entity.vertices[0].y, entity.vertices[1].y);
            maxX = Math.max(maxX, entity.vertices[0].x, entity.vertices[1].x);
            maxY = Math.max(maxY, entity.vertices[0].y, entity.vertices[1].y);
          } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            entity.vertices.forEach((vertex: any) => {
              minX = Math.min(minX, vertex.x);
              minY = Math.min(minY, vertex.y);
              maxX = Math.max(maxX, vertex.x);
              maxY = Math.max(maxY, vertex.y);
            });
          } else if (entity.type === 'CIRCLE') {
            minX = Math.min(minX, entity.center.x - entity.radius);
            minY = Math.min(minY, entity.center.y - entity.radius);
            maxX = Math.max(maxX, entity.center.x + entity.radius);
            maxY = Math.max(maxY, entity.center.y + entity.radius);
          } else if (entity.type === 'ARC') {
            minX = Math.min(minX, entity.center.x - entity.radius);
            minY = Math.min(minY, entity.center.y - entity.radius);
            maxX = Math.max(maxX, entity.center.x + entity.radius);
            maxY = Math.max(maxY, entity.center.y + entity.radius);
          }
        });
      }
      
      // DXF 도면의 크기와 스케일 계산
      const dxfWidth = maxX - minX;
      const dxfHeight = maxY - minY;
      const scaleX = (canvasWidth * 0.8) / dxfWidth;
      const scaleY = (canvasHeight * 0.8) / dxfHeight;
      const scale = Math.min(scaleX, scaleY);
      
      // 중앙 정렬을 위한 오프셋 계산
      const offsetX = (canvasWidth - dxfWidth * scale) / 2 - minX * scale;
      const offsetY = (canvasHeight - dxfHeight * scale) / 2 + maxY * scale;
      
      // DXF 엔티티를 Fabric.js 객체로 변환
      const group: fabric.Object[] = [];
      
      if (dxf.entities) {
        dxf.entities.forEach((entity: any) => {
          if (entity.type === 'LINE') {
            const line = new fabric.Line(
              [
                entity.vertices[0].x * scale + offsetX,
                -entity.vertices[0].y * scale + offsetY,
                entity.vertices[1].x * scale + offsetX,
                -entity.vertices[1].y * scale + offsetY
              ],
              {
                stroke: getThemeHex('text', view2DTheme),
                strokeWidth: 1,
                selectable: true
              }
            );
            group.push(line);
          } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            const points = entity.vertices.map((vertex: any) => ({
              x: vertex.x * scale + offsetX,
              y: -vertex.y * scale + offsetY
            }));
            
            const polyline = new fabric.Polyline(points, {
              stroke: getThemeHex('text', view2DTheme),
              strokeWidth: 1,
              fill: 'transparent',
              selectable: true
            });
            group.push(polyline);
          } else if (entity.type === 'CIRCLE') {
            const circle = new fabric.Circle({
              left: entity.center.x * scale + offsetX - entity.radius * scale,
              top: -entity.center.y * scale + offsetY - entity.radius * scale,
              radius: entity.radius * scale,
              stroke: getThemeHex('text', view2DTheme),
              strokeWidth: 1,
              fill: 'transparent',
              selectable: true
            });
            group.push(circle);
          } else if (entity.type === 'ARC') {
            const startAngle = entity.startAngle || 0;
            const endAngle = entity.endAngle || 360;
            const radius = entity.radius * scale;
            const centerX = entity.center.x * scale + offsetX;
            const centerY = -entity.center.y * scale + offsetY;
            
            // Arc를 Path로 변환
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
            
            const x1 = centerX + radius * Math.cos(startRad);
            const y1 = centerY - radius * Math.sin(startRad);
            const x2 = centerX + radius * Math.cos(endRad);
            const y2 = centerY - radius * Math.sin(endRad);
            
            const path = new fabric.Path(
              `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 0 ${x2} ${y2}`,
              {
                stroke: getThemeHex('text', view2DTheme),
                strokeWidth: 1,
                fill: 'transparent',
                selectable: true
              }
            );
            group.push(path);
          }
        });
      }
      
      // 모든 객체를 그룹으로 묶어서 캔버스에 추가
      if (group.length > 0) {
        const dxfGroup = new fabric.Group(group, {
          selectable: true,
          hasControls: true,
          hasBorders: true
        });
        
        canvas.add(dxfGroup);
        canvas.setActiveObject(dxfGroup);
        canvas.renderAll();
      }
      
    } catch (error) {
      console.error('DXF 파일 처리 오류:', error);
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
    console.log('심볼 클릭됨:', symbol);
    
    // 캔버스가 없으면 리턴
    if (!fabricCanvasRef.current) {
      console.error('캔버스가 초기화되지 않았습니다.');
      return;
    }

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

    console.log('심볼 추가 전 객체 수:', canvas.getObjects().length);
    canvas.add(text);
    console.log('심볼 추가 후 객체 수:', canvas.getObjects().length);
    canvas.setActiveObject(text);
    canvas.renderAll();
    console.log('심볼이 캔버스에 추가되었습니다.');
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
          const delta = e.deltaY > 0 ? -1 : 1;
          handleZoom(delta);
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

      // 배경색 설정 (흰색)
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, paperDimensions.width, paperDimensions.height, 'F');

      if (paperBackgroundDataUrl) {
        try {
          pdf.addImage(paperBackgroundDataUrl, 'PNG', 0, 0, paperDimensions.width, paperDimensions.height, undefined, 'FAST');
        } catch (error) {
          console.error('PDF 배경 이미지 추가 실패:', error);
        }
      }

      // 각 뷰 위치에 대해 이미지 렌더링
      for (const view of viewPositions) {
        // 뷰 ID에서 원본 타입 추출 (timestamp 제거)
        const viewType = normalizeTemplateViewTarget(view.id.split('_')[0]);
        const isTextItem = AVAILABLE_TEXT_ITEMS.some(item => item.id === viewType);

        // 텍스트 아이템은 나중에 처리
        if (isTextItem) continue;

        // 뷰 크기를 mm 단위로 변환
        const viewWidthMm = (view.width * view.scale * paperDimensions.width) / paperDimensions.displayWidth;
        const viewHeightMm = (view.height * view.scale * paperDimensions.height) / paperDimensions.displayHeight;
        const viewXMm = (view.x * paperDimensions.width) / paperDimensions.displayWidth;
        const viewYMm = (view.y * paperDimensions.height) / paperDimensions.displayHeight;

        // 뷰카드의 원본 이미지를 직접 PDF에 추가 (고품질 유지)
        try {
          console.log(`🔍 뷰카드 추가 시작: viewType=${viewType}, view.id=${view.id}`);

          // data-capture-image 속성을 가진 img 요소를 찾음
          const imageElement = document.querySelector(`[data-capture-image="${view.id}"]`) as HTMLImageElement;
          console.log(`🖼️ 이미지 요소 검색 결과:`, imageElement ? '찾음' : '못 찾음');

          if (imageElement && imageElement.src) {
            // 원본 이미지 src를 직접 PDF에 추가 (화질 손실 없음)
            console.log(`📄 원본 이미지를 PDF에 직접 추가: ${imageElement.src.substring(0, 100)}...`);
            const naturalWidth = imageElement.naturalWidth || view.width || 1;
            const naturalHeight = imageElement.naturalHeight || view.height || 1;
            const imageAspect = view.imageAspectRatio ?? naturalWidth / Math.max(naturalHeight, 1);

            let drawWidthMm = viewWidthMm;
            let drawHeightMm = drawWidthMm / imageAspect;

            if (drawHeightMm > viewHeightMm) {
              drawHeightMm = viewHeightMm;
              drawWidthMm = drawHeightMm * imageAspect;
            }

            const offsetXMm = viewXMm + (viewWidthMm - drawWidthMm) / 2;
            const offsetYMm = viewYMm + (viewHeightMm - drawHeightMm) / 2;

            pdf.addImage(imageElement.src, 'PNG', offsetXMm, offsetYMm, drawWidthMm, drawHeightMm);
            console.log(`✅ ${viewType} 뷰카드가 고품질로 PDF에 추가되었습니다.`);
          } else {
            console.warn(`❌ 뷰카드 이미지를 찾을 수 없음: ${view.id}`);
            console.log(`모든 data-capture-image 요소:`, document.querySelectorAll('[data-capture-image]'));
          }
        } catch (err) {
          console.error('❌ 뷰카드 이미지 추가 실패:', err);

          // 폴백: 기존 래스터 이미지 사용
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
            imageData = localCapturedViews[view.id] ?? (viewType ? localCapturedViews[viewType] : undefined);
          }

          if (imageData) {
            try {
              const imageAspect = view.imageAspectRatio
                ?? (view.width > 0 && view.height > 0 ? view.width / view.height : 1);

              let drawWidthMm = viewWidthMm;
              let drawHeightMm = drawWidthMm / imageAspect;

              if (drawHeightMm > viewHeightMm) {
                drawHeightMm = viewHeightMm;
                drawWidthMm = drawHeightMm * imageAspect;
              }

              const offsetXMm = viewXMm + (viewWidthMm - drawWidthMm) / 2;
              const offsetYMm = viewYMm + (viewHeightMm - drawHeightMm) / 2;

              pdf.addImage(imageData, 'PNG', offsetXMm, offsetYMm, drawWidthMm, drawHeightMm);
              console.log(`⚠️ ${viewType} 뷰는 래스터 이미지로 렌더링되었습니다.`);
            } catch (imgErr) {
              console.error('이미지 추가 실패:', imgErr);
            }
          } else {
            console.warn('이미지를 찾을 수 없음:', viewType, view.id);
          }
        }
      }

      // 텍스트 아이템을 html2canvas로 캡처하여 이미지로 추가
      console.log('📝 텍스트 아이템 렌더링 시작, 전체 뷰:', viewPositions.length);

      // DOM이 완전히 렌더링될 때까지 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100));

      for (const view of viewPositions) {
        const viewType = normalizeTemplateViewTarget(view.id.split('_')[0]);
        const isTextItem = AVAILABLE_TEXT_ITEMS.some(item => item.id === viewType);

        console.log(`뷰 확인: ${view.id}, 타입: ${viewType}, isTextItem: ${isTextItem}`);

        if (isTextItem) {
          console.log(`✅ 텍스트 아이템 감지됨: ${viewType}`);

          const textXMm = (view.x * paperDimensions.width) / paperDimensions.displayWidth;
          const textYMm = (view.y * paperDimensions.height) / paperDimensions.displayHeight;
          const textWidthMm = (view.width * view.scale * paperDimensions.width) / paperDimensions.displayWidth;
          const textHeightMm = (view.height * view.scale * paperDimensions.height) / paperDimensions.displayHeight;

          console.log(`📍 텍스트 아이템 위치: x=${textXMm}mm, y=${textYMm}mm, w=${textWidthMm}mm, h=${textHeightMm}mm`);

          try {
            // DOM에서 해당 텍스트 아이템 요소 찾기
            const textElement = document.querySelector(`[data-text-id="${view.id}"]`);
            console.log(`🔍 텍스트 요소 검색: [data-text-id="${view.id}"]`, textElement ? '찾음' : '못 찾음');

            if (textElement) {
              console.log('📸 html2canvas 캡처 시작...');
              const canvas = await html2canvas(textElement as HTMLElement, {
                backgroundColor: '#ffffff',
                scale: 4, // 품질 향상 (2 → 4)
                logging: false,
                useCORS: true,
                allowTaint: true,
                imageTimeout: 0,
                removeContainer: true,
                onclone: (clonedDoc) => {
                  // 캡처되는 복사본에서 border, boxShadow 제거
                  const clonedElement = clonedDoc.querySelector(`[data-text-id="${view.id}"]`) as HTMLElement;
                  if (clonedElement) {
                    clonedElement.style.border = 'none';
                    clonedElement.style.boxShadow = 'none';
                    clonedElement.style.borderRadius = '0';
                  }
                }
              });
              console.log('✅ 캡처 완료, canvas 크기:', canvas.width, 'x', canvas.height);
              // PNG 형식 사용 (고품질)
              const imgData = canvas.toDataURL('image/png');
              console.log('🖼️ 이미지 데이터 길이:', imgData.length);
              pdf.addImage(imgData, 'PNG', textXMm, textYMm, textWidthMm, textHeightMm);
              console.log(`✅ 텍스트 아이템 ${viewType}이(가) 고품질로 PDF에 추가되었습니다.`);
            } else {
              console.warn(`❌ 텍스트 아이템 요소를 찾을 수 없음: ${view.id}`);
              console.log('모든 data-text-id 요소:', document.querySelectorAll('[data-text-id]'));
            }
          } catch (err) {
            console.error('❌ 텍스트 아이템 캡처 실패:', err);
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
                onClick={() => handleZoom(-1)}
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
                onClick={() => handleZoom(1)}
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
                    <button onClick={() => { setPreviewScale(0.33); setIsZoomDropdownOpen(false); }}>33%</button>
                    <button onClick={() => { setPreviewScale(0.5); setIsZoomDropdownOpen(false); }}>50%</button>
                    <button onClick={() => { setPreviewScale(0.66); setIsZoomDropdownOpen(false); }}>66%</button>
                    <button onClick={() => { setPreviewScale(0.75); setIsZoomDropdownOpen(false); }}>75%</button>
                    <button onClick={() => { setPreviewScale(1); setIsZoomDropdownOpen(false); }}>100%</button>
                    <button onClick={() => { setPreviewScale(1.25); setIsZoomDropdownOpen(false); }}>125%</button>
                    <button onClick={() => { setPreviewScale(1.5); setIsZoomDropdownOpen(false); }}>150%</button>
                    <button onClick={() => { setPreviewScale(1.75); setIsZoomDropdownOpen(false); }}>175%</button>
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
                          {orientation === 'portrait' 
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
              title="레이아웃"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="8" y="8" width="4" height="4" rx="1" fill="currentColor"/>
                <rect x="8" y="14" width="8" height="2" rx="1" fill="currentColor"/>
              </svg>
              <span className={styles.tabLabel}>레이아웃</span>
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
            <button
              className={`${styles.tabButton} ${activeTab === 'upload' ? styles.active : ''}`}
              onClick={() => setActiveTab('upload')}
              title="업로드"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className={styles.tabLabel}>업로드</span>
            </button>
          </div>

          {/* 탭 컨텐츠 */}
          <div className={styles.tabContent}>
            {activeTab === 'views' && (
              <>
                <h3 className={styles.menuTitle}>레이아웃</h3>
                {/* 서브 탭 */}
                <div className={styles.subTabContainer}>
                  <button
                    className={`${styles.subTab} ${designSubTab === 'template' ? styles.active : ''}`}
                    onClick={() => setDesignSubTab('template')}
                  >
                    템플릿
                  </button>
                  <button
                    className={`${styles.subTab} ${designSubTab === '2d' ? styles.active : ''}`}
                    onClick={() => setDesignSubTab('2d')}
                  >
                    2D
                  </button>
                  <button
                    className={`${styles.subTab} ${designSubTab === '3d' ? styles.active : ''}`}
                    onClick={() => setDesignSubTab('3d')}
                  >
                    3D
                  </button>
                </div>
                {designSubTab === 'template' && (
                  <div className={styles.templateGrid}>
                    {LAYOUT_TEMPLATES.map(template => (
                      <button
                        key={template.id}
                        className={`${styles.templateCard} ${activeTemplateId === template.id ? styles.templateCardActive : ''}`}
                        onClick={() => void applyLayoutTemplate(template)}
                      >
                        <div className={styles.templateThumbnail}>
                          <img src={template.preview} alt={template.name} draggable={false} />
                          <span className={styles.templateTag}>
                            {template.paperSize} · {template.orientation === 'portrait' ? '세로' : '가로'}
                          </span>
                        </div>
                        <div className={styles.templateMeta}>
                          <span className={styles.templateMetaTitle}>{template.name}</span>
                          <span className={styles.templateMetaDesc}>{template.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {designSubTab === '2d' && (
                  <div className={styles.viewGrid}>
                    {AVAILABLE_VIEWS.map(view => {
                      const menuImage = localCapturedViews[view.id] ?? capturedViews[view.id as keyof typeof capturedViews];
                      return (
                        <div
                          key={view.id}
                          className={styles.viewMenuItem}
                          onMouseDown={(e) => handleMenuItemDragStart(view, e)}
                        >
                          <div className={styles.viewItemContent}>
                            {menuImage ? (
                              <img 
                                src={menuImage} 
                                alt={view.label} 
                                draggable={false}
                              />
                            ) : (
                              <div className={styles.viewItemPlaceholder}>{view.label}</div>
                            )}
                          </div>
                          <span className={styles.viewItemLabel}>{view.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {designSubTab === '3d' && (
                  <div className={styles.view3dContent}>
                    <p className={styles.placeholderText}>3D 뷰 옵션이 여기에 표시됩니다.</p>
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'shape',
                          label: 'Rectangle',
                          shapeData: '<rect x="2" y="2" width="20" height="20" fill="currentColor" />',
                          shapeType: 'rectangle'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'shape',
                          label: 'Rounded Rectangle',
                          shapeData: '<rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />',
                          shapeType: 'rounded-rectangle'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'shape',
                          label: 'Circle',
                          shapeData: '<circle cx="12" cy="12" r="10" fill="currentColor" />',
                          shapeType: 'circle'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'shape',
                          label: 'Ellipse',
                          shapeData: '<ellipse cx="12" cy="12" rx="10" ry="6" fill="currentColor" />',
                          shapeType: 'ellipse'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'shape',
                          label: 'Triangle',
                          shapeData: '<polygon points="12,2 22,20 2,20" fill="currentColor" />',
                          shapeType: 'triangle'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'shape',
                          label: 'Pentagon',
                          shapeData: '<polygon points="2,12 8,6 22,6 22,18 8,18" fill="currentColor" />',
                          shapeType: 'pentagon'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'shape',
                          label: 'Hexagon',
                          shapeData: '<polygon points="2,12 8,6 16,6 22,12 16,18 8,18" fill="currentColor" />',
                          shapeType: 'hexagon'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'shape',
                          label: 'Star',
                          shapeData: '<polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="currentColor" />',
                          shapeType: 'star'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
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
                    <div 
                      className={styles.shapeItem} 
                      onClick={() => handleSymbolClick('★')}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'symbol',
                          label: '★',
                          symbol: '★'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
                    >★</div>
                    <div 
                      className={styles.shapeItem} 
                      onClick={() => handleSymbolClick('♥')}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'symbol',
                          label: '♥',
                          symbol: '♥'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
                    >♥</div>
                    <div 
                      className={styles.shapeItem} 
                      onClick={() => handleSymbolClick('♦')}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'symbol',
                          label: '♦',
                          symbol: '♦'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
                    >♦</div>
                    <div 
                      className={styles.shapeItem} 
                      onClick={() => handleSymbolClick('♣')}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDraggedMenuItem({
                          type: 'symbol',
                          label: '♣',
                          symbol: '♣'
                        });
                        setIsDraggingFromMenu(true);
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        setDragPreviewPos({
                          x: e.clientX - 100,
                          y: e.clientY - 75
                        });
                      }}
                      draggable={false}
                    >♣</div>
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
            {activeTab === 'upload' && (
              <>
                <h3 className={styles.menuTitle}>업로드</h3>
                <div className={styles.uploadContent}>
                  <div className={styles.uploadArea}>
                    <input
                      type="file"
                      id="uploadInput"
                      accept="image/*,.pdf,.dxf"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const fileName = file.name.toLowerCase();
                          const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                          
                          // 썸네일 생성 함수
                          const generateThumbnail = async (file: File): Promise<string | undefined> => {
                            return new Promise((resolve) => {
                              if (file.type.startsWith('image/')) {
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                  const img = new Image();
                                  img.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    const maxSize = 100;
                                    const scale = Math.min(maxSize / img.width, maxSize / img.height);
                                    canvas.width = img.width * scale;
                                    canvas.height = img.height * scale;
                                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                                  };
                                  img.src = e.target?.result as string;
                                };
                                reader.readAsDataURL(file);
                              } else {
                                resolve(undefined);
                              }
                            });
                          };
                          
                          if (fileName.endsWith('.dxf')) {
                            // DXF 파일 처리
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                              const url = event.target?.result as string;
                              const newFile = {
                                id: fileId,
                                name: file.name,
                                type: 'dxf',
                                url: url,
                                uploadDate: new Date()
                              };
                              setUploadedFiles(prev => [...prev, newFile]);
                              await processDXFFile(file);
                            };
                            reader.readAsDataURL(file);
                          } else if (fileName.endsWith('.pdf')) {
                            // PDF 파일 처리
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const url = event.target?.result as string;
                              const newFile = {
                                id: fileId,
                                name: file.name,
                                type: 'pdf',
                                url: url,
                                uploadDate: new Date()
                              };
                              setUploadedFiles(prev => [...prev, newFile]);
                              console.log('PDF 파일 추가됨:', file.name);
                            };
                            reader.readAsDataURL(file);
                          } else {
                            // 이미지 파일 처리
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                              if (fabricCanvasRef.current && event.target?.result) {
                                const imgUrl = event.target.result as string;
                                const thumbnail = await generateThumbnail(file);
                                
                                // 업로드된 파일 목록에 추가
                                const newFile = {
                                  id: fileId,
                                  name: file.name,
                                  type: 'image',
                                  thumbnail: thumbnail,
                                  url: imgUrl,
                                  uploadDate: new Date()
                                };
                                setUploadedFiles(prev => [...prev, newFile]);
                                console.log('✅ 이미지가 업로드됨. 드래그해서 배치하세요.');
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }
                        // 입력 초기화 (같은 파일 재선택 가능)
                        e.target.value = '';
                      }}
                    />
                    <label htmlFor="uploadInput" className={styles.uploadButton}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>파일 선택</span>
                      <small>이미지, PDF, DXF 파일 지원</small>
                    </label>
                  </div>
                  
                  {/* 업로드된 파일 목록 */}
                  {uploadedFiles.length > 0 && (
                    <div className={styles.uploadedFilesList}>
                      <h4 className={styles.uploadedFilesTitle}>업로드된 파일</h4>
                      <div className={styles.filesGrid}>
                        {uploadedFiles.map(file => (
                          <div 
                            key={file.id} 
                            className={styles.fileItem}
                            onMouseDown={(e) => {
                              // 드래그 시작
                              e.preventDefault();
                              setIsDraggingFromMenu(true);
                              
                              // ViewMenuItem 형태로 변환
                              const fileMenuItem: ViewMenuItem = {
                                id: file.id,
                                type: 'uploaded-file',
                                label: file.name,
                                uploadedFile: file // 파일 정보 추가
                              };
                              
                              setDraggedMenuItem(fileMenuItem);
                              
                              // 드래그 프리뷰를 마우스 중앙에 위치
                              const previewWidth = file.type === 'image' ? 75 : 75;
                              const previewHeight = 75;
                              
                              setDragOffset({
                                x: previewWidth,
                                y: previewHeight
                              });
                              
                              // 초기 프리뷰 위치 설정
                              setDragPreviewPos({
                                x: e.clientX - previewWidth,
                                y: e.clientY - previewHeight
                              });
                            }}
                            style={{ cursor: 'grab' }}
                          >
                            <div className={styles.fileThumbnail}>
                              {file.thumbnail ? (
                                <img src={file.thumbnail} alt={file.name} draggable={false} />
                              ) : (
                                <div className={styles.fileIcon}>
                                  {file.type === 'pdf' ? (
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                      <polyline points="14 2 14 8 20 8" />
                                      <line x1="16" y1="13" x2="8" y2="13" />
                                      <line x1="16" y1="17" x2="8" y2="17" />
                                      <polyline points="10 9 9 9 8 9" />
                                    </svg>
                                  ) : file.type === 'dxf' ? (
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                      <line x1="3" y1="9" x2="21" y2="9" />
                                      <line x1="9" y1="21" x2="9" y2="9" />
                                    </svg>
                                  ) : (
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                      <circle cx="8.5" cy="8.5" r="1.5" />
                                      <polyline points="21 15 16 10 5 21" />
                                    </svg>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className={styles.fileName} title={file.name}>
                              {file.name.length > 15 ? `${file.name.substring(0, 12)}...` : file.name}
                            </div>
                            <div className={styles.fileActions}>
                              <div style={{ fontSize: '11px', color: '#666' }}>
                                드래그해서 배치
                              </div>
                              <button 
                                className={styles.fileActionBtn}
                                onClick={() => {
                                  setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
                                }}
                                title="삭제"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

          {/* 메인 컨테이너 */}
          <div className={styles.mainContainer}>
            <div className={styles.contentWrapper}>
          <div className={styles.previewContainer}>
            {/* 줄자 영역을 포함한 전체 래퍼 */}
            <div className={styles.rulerWrapper} style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center'
            }}>
              {/* 왼쪽 상단 코너 박스 */}
              <div className={styles.rulerCorner}>
                <span style={{ fontSize: '8px', color: 'var(--theme-text)', opacity: 0.6 }}>mm</span>
              </div>
              
              {/* 상단 가로 줄자 - 드래그하면 가이드 생성 */}
              <div 
                className={styles.rulerHorizontal}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / scale;
                  setIsDraggingNewGuide({ type: 'vertical', position: x });
                }}
                style={{ cursor: 'ns-resize', width: paperDimensions.displayWidth }}
              >
                <svg width={paperDimensions.displayWidth} height="20" style={{ display: 'block' }}>
                  {/* 5mm 단위로 세밀한 눈금 표시 */}
                  {Array.from({ length: Math.ceil(paperDimensions.width / 5) + 1 }, (_, i) => {
                    const mmValue = i * 5; // 실제 mm 값 (5mm 단위)
                    
                    // 용지 크기를 넘으면 그리지 않음
                    if (mmValue > paperDimensions.width) return null;
                    
                    const x = mmValue * 2; // 2픽셀 = 1mm 고정 비율
                    const isMajor = mmValue % 50 === 0; // 50mm마다 큰 눈금
                    const isMedium = mmValue % 10 === 0; // 10mm마다 중간 눈금
                    
                    return (
                      <g key={i}>
                        <line
                          x1={x}
                          y1={isMajor ? 12 : (isMedium ? 16 : 18)}
                          x2={x}
                          y2={20}
                          stroke="var(--theme-text)"
                          strokeWidth={isMajor ? 1.5 : (isMedium ? 0.8 : 0.3)}
                          opacity={isMajor ? 1 : (isMedium ? 0.6 : 0.3)}
                        />
                        {/* 50mm마다만 숫자 표시 */}
                        {isMajor && (
                          <text
                            x={x}
                            y={10}
                            fontSize="9"
                            fill="var(--theme-text)"
                            textAnchor="middle"
                            style={{ userSelect: 'none' }}
                          >
                            {mmValue}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
              
              {/* 왼쪽 세로 줄자 - 드래그하면 가이드 생성 */}
              <div 
                className={styles.rulerVertical}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = (e.clientY - rect.top) / scale;
                  setIsDraggingNewGuide({ type: 'horizontal', position: y });
                }}
                style={{ cursor: 'ew-resize', height: paperDimensions.displayHeight }}
              >
                <svg width="20" height={paperDimensions.displayHeight} style={{ display: 'block' }}>
                  {/* 5mm 단위로 세밀한 눈금 표시 */}
                  {Array.from({ length: Math.ceil(paperDimensions.height / 5) + 1 }, (_, i) => {
                    const mmValue = i * 5; // 실제 mm 값 (5mm 단위)
                    
                    // 용지 크기를 넘으면 그리지 않음
                    if (mmValue > paperDimensions.height) return null;
                    
                    const y = mmValue * 2; // 2픽셀 = 1mm 고정 비율
                    const isMajor = mmValue % 50 === 0; // 50mm마다 큰 눈금
                    const isMedium = mmValue % 10 === 0; // 10mm마다 중간 눈금
                    
                    return (
                      <g key={i}>
                        <line
                          x1={isMajor ? 12 : (isMedium ? 16 : 18)}
                          y1={y}
                          x2={20}
                          y2={y}
                          stroke="var(--theme-text)"
                          strokeWidth={isMajor ? 1.5 : (isMedium ? 0.8 : 0.3)}
                          opacity={isMajor ? 1 : (isMedium ? 0.6 : 0.3)}
                        />
                        {/* 50mm마다만 숫자 표시 */}
                        {isMajor && mmValue > 0 && (
                          <text
                            x={10}
                            y={y}
                            fontSize="9"
                            fill="var(--theme-text)"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={`rotate(-90 10 ${y})`}
                            style={{ userSelect: 'none' }}
                          >
                            {mmValue}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
              
              {/* 실제 캔버스 영역 */}
              <div 
                ref={previewRef}
                className={styles.previewContent}
                style={{
                  width: `${paperDimensions.displayWidth}px`,
                  height: `${paperDimensions.displayHeight}px`,
                  backgroundColor: paperBackgroundImage ? 'transparent' : paperColor,
                  backgroundImage: paperBackgroundImage ? `url(${paperBackgroundImage})` : 'none',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: paperBackgroundSize,
                  backgroundPosition: 'center'
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
                  style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                  {/* 페이퍼 컨테이너 - 흰색 배경의 실제 도면 영역 */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedView(null);
                      handleCanvasClick();
                    }}
                    style={{
                      position: 'relative',
                      width: paperDimensions.displayWidth,
                      height: paperDimensions.displayHeight,
                      backgroundColor: paperBackgroundImage ? 'transparent' : paperColor,
                      backgroundImage: paperBackgroundImage ? `url(${paperBackgroundImage})` : 'none',
                      backgroundSize: paperBackgroundSize,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                      overflow: 'visible',
                      // transform 제거 - 캔버스 중복 문제의 원인
                      transformOrigin: 'center'
                    }}
                  >
                  {/* Fabric.js 캔버스 컨테이너 */}
                  <div 
                    ref={canvasContainerRef}
                    className={styles.canvasContainer}
                    data-portrait={orientation === 'portrait'}
                    style={{ 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      width: paperDimensions.displayWidth, 
                      height: paperDimensions.displayHeight, 
                      zIndex: 1,
                      pointerEvents: 'auto' // 캔버스가 클릭 이벤트를 받을 수 있도록
                    }}
                  >
                    {/* 캔버스는 JavaScript로 동적 생성 */}
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
                  
                  {/* 포토샵 스타일 가이드 라인 */}
                  {guides.vertical.map((x, index) => (
                    <div
                      key={`guide-v-${index}`}
                      style={{
                        position: 'absolute',
                        left: `${x}px`,
                        top: 0,
                        width: '1px',
                        height: '100%',
                        backgroundColor: '#00BFFF',
                        opacity: 0.8,
                        cursor: 'ew-resize',
                        zIndex: 9
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsDraggingGuide({ type: 'vertical', index });
                      }}
                      onDoubleClick={() => {
                        // 더블클릭으로 가이드 삭제
                        setGuides(prev => ({
                          ...prev,
                          vertical: prev.vertical.filter((_, i) => i !== index)
                        }));
                      }}
                    />
                  ))}
                  {guides.horizontal.map((y, index) => (
                    <div
                      key={`guide-h-${index}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: `${y}px`,
                        width: '100%',
                        height: '1px',
                        backgroundColor: '#00BFFF',
                        opacity: 0.8,
                        cursor: 'ns-resize',
                        zIndex: 9
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsDraggingGuide({ type: 'horizontal', index });
                      }}
                      onDoubleClick={() => {
                        // 더블클릭으로 가이드 삭제
                        setGuides(prev => ({
                          ...prev,
                          horizontal: prev.horizontal.filter((_, i) => i !== index)
                        }));
                      }}
                    />
                  ))}

                  {/* 뷰카드 렌더링 - 페이퍼 내부에 */}
                  {viewPositions.length > 0 && viewPositions.map(view => {
                    const viewType = normalizeTemplateViewTarget(view.id.split('_')[0]);
                    const viewInfo = AVAILABLE_VIEWS.find(v => v.id === viewType);
                    const capturedImage = localCapturedViews[view.id] 
                      ?? (viewType ? localCapturedViews[viewType] : undefined)
                      ?? capturedViews[viewType as keyof typeof capturedViews];
                    const isTextItem = AVAILABLE_TEXT_ITEMS.some(item => item.id === viewType);
                    
                    console.log('🎨 뷰카드 렌더링:', { 
                      view, 
                      viewType, 
                      capturedImage, 
                      isTextItem,
                      type: view.type,
                      imageUrl: view.imageUrl?.substring(0, 100)
                    });

                    return (
                      <div
                        key={view.id}
                        data-view-id={view.id}
                        style={{
                          position: 'absolute',
                          left: view.x,
                          top: view.y,
                          width: view.width * view.scale,
                          height: view.height * view.scale,
                          backgroundColor: capturedImage ? 'white' : '#f5f5f5',
                          border: selectedView === view.id ? '2px solid #7c3aed' : 'none',
                          borderRadius: '4px',
                          boxShadow: selectedView === view.id ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                          zIndex: 10,
                          cursor: 'move',
                          overflow: 'visible',
                          transform: `rotate(${view.rotation || 0}deg)`,
                          transformOrigin: 'center'
                        }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleViewMouseDown(view.id, e);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
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
                          {console.log('🔧 리사이즈 핸들 렌더링:', view.id, view.type)}
                          {console.log('🔄 회전 핸들 표시 여부:', selectedView === view.id)}
                          {/* 회전 핸들 - 상단 중앙 */}
                          <div 
                            className={styles.rotateHandle}
                            onMouseDown={(e) => handleRotateStart(view.id, e)}
                            title="회전 (Shift: 15도 단위)"
                            style={{
                              position: 'absolute',
                              top: '-40px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: '28px',
                              height: '28px',
                              background: '#7c3aed',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'grab',
                              zIndex: 100,
                              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                              <path d="M23 4v6h-6" />
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                          </div>
                          
                          {/* 리사이즈 핸들 */}
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
                      
                      {isTextItem ? (
                        <div className={styles.textItemContent} data-text-id={view.id}>
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
                                  <span style={{ color: '#22c55e' }}>실측:</span>
                                  {editingInfo === `${view.id}_size` ? (
                                    <input
                                      type="text"
                                      value={infoTexts.size}
                                      onChange={(e) => setInfoTexts({ ...infoTexts, size: e.target.value })}
                                      onBlur={() => setEditingInfo(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                      className={styles.textInput}
                                      autoFocus
                                      style={{ color: '#22c55e' }}
                                    />
                                  ) : (
                                    <span onClick={() => setEditingInfo(`${view.id}_size`)} style={{ color: '#22c55e' }}>{infoTexts.size}</span>
                                  )}
                                </div>
                                <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #ccc', margin: '2px 0' }} />
                                <div className={styles.infoSpecItem}>
                                  <span style={{ color: '#f97316' }}>속장:</span>
                                  {editingInfo === `${view.id}_body` ? (
                                    <input
                                      type="text"
                                      value={infoTexts.body}
                                      onChange={(e) => setInfoTexts({ ...infoTexts, body: e.target.value })}
                                      onBlur={() => setEditingInfo(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                      className={styles.textInput}
                                      autoFocus
                                      style={{ color: '#f97316' }}
                                    />
                                  ) : (
                                    <span onClick={() => setEditingInfo(`${view.id}_body`)} style={{ color: '#f97316' }}>{infoTexts.body}</span>
                                  )}
                                </div>
                                <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #ccc', margin: '2px 0' }} />
                                <div className={styles.infoSpecItem}>
                                  <span style={{ color: '#000000' }}>도어:</span>
                                  {editingInfo === `${view.id}_door` ? (
                                    <input
                                      type="text"
                                      value={infoTexts.door}
                                      onChange={(e) => setInfoTexts({ ...infoTexts, door: e.target.value })}
                                      onBlur={() => setEditingInfo(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                      className={styles.textInput}
                                      autoFocus
                                      style={{ color: '#000000' }}
                                    />
                                  ) : (
                                    <span onClick={() => setEditingInfo(`${view.id}_door`)} style={{ color: '#000000' }}>{infoTexts.door}</span>
                                  )}
                                </div>
                                <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #ccc', margin: '2px 0' }} />
                                <div className={styles.infoSpecItem}>
                                  <span style={{ color: '#000000' }}>속장:</span>
                                  {editingInfo === `${view.id}_body2` ? (
                                    <input
                                      type="text"
                                      value={infoTexts.body}
                                      onChange={(e) => setInfoTexts({ ...infoTexts, body: e.target.value })}
                                      onBlur={() => setEditingInfo(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingInfo(null)}
                                      className={styles.textInput}
                                      autoFocus
                                      style={{ color: '#000000' }}
                                    />
                                  ) : (
                                    <span onClick={() => setEditingInfo(`${view.id}_body2`)} style={{ color: '#000000' }}>{infoTexts.body}</span>
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
                              <p><span style={{ color: '#22c55e' }}>실측:</span> <span style={{ color: '#22c55e' }}>{infoTexts.size}</span></p>
                              <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #ccc', margin: '8px 0' }} />
                              <p><span style={{ color: '#f97316' }}>속장:</span> <span style={{ color: '#f97316' }}>{infoTexts.body}</span></p>
                              <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #ccc', margin: '8px 0' }} />
                              <p><span style={{ color: '#000000' }}>도어:</span> <span style={{ color: '#000000' }}>{infoTexts.door}</span></p>
                              <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #ccc', margin: '8px 0' }} />
                              <p><span style={{ color: '#000000' }}>속장:</span> <span style={{ color: '#000000' }}>{infoTexts.body}</span></p>
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
                      ) : view.type === 'image' ? (
                        // 이미지 뷰카드 렌더링
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#f9f9f9'
                        }}>
                          {view.imageUrl ? (
                            <img
                              src={view.imageUrl}
                              alt={view.fileName || 'Image'}
                              data-capture-image={view.id}
                              style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain'
                              }}
                              draggable={false}
                              onError={(e) => {
                                console.error('이미지 로드 실패:', view.imageUrl);
                                console.log('뷰 정보:', view);
                              }}
                              onLoad={() => {
                                console.log('✅ 이미지 로드 성공:', view.fileName);
                              }}
                            />
                          ) : (
                            <div style={{ color: '#999', fontSize: '14px' }}>
                              이미지 없음
                            </div>
                          )}
                        </div>
                      ) : view.type === 'pdf' ? (
                        // PDF/SVG 벡터 뷰카드 렌더링
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#ffffff',
                          overflow: 'hidden'
                        }}>
                          {view.imageUrl && view.hasDrawingData ? (
                            // SVG 벡터 데이터가 있을 때 렌더링
                            <img
                              src={view.imageUrl}
                              alt={view.fileName || 'Vector View'}
                              data-capture-image={view.id}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                pointerEvents: 'none'
                              }}
                            />
                          ) : (
                            // 기본 PDF 아이콘 표시
                            <>
                              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                              </svg>
                              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px', textAlign: 'center', padding: '0 8px' }}>
                                {view.fileName}
                              </div>
                            </>
                          )}
                        </div>
                      ) : view.type === 'dxf' ? (
                        // DXF 뷰카드 렌더링
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#e8f4fd'
                        }}>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0066cc" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                            <line x1="9" y1="21" x2="9" y2="9" />
                          </svg>
                          <div style={{ fontSize: '12px', color: '#0066cc', marginTop: '8px', textAlign: 'center', padding: '0 8px' }}>
                            {view.fileName}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative'
                        }}>
                          {/* 캡처된 이미지 또는 플레이스홀더 */}
                          {capturedImage ? (
                            <img
                              src={capturedImage}
                              alt={viewInfo?.label}
                              data-capture-image={view.id}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                pointerEvents: 'none'
                              }}
                              draggable={false}
                            />
                          ) : (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px'
                            }}>
                              <div style={{
                                fontSize: '24px',
                                color: '#999'
                              }}>
                                {viewType === 'front' ? '👀' :
                                 viewType === 'side' ? '👁️' :
                                 viewType === 'top' ? '⬆️' :
                                 viewType === 'iso' ? '🔷' : '📐'}
                              </div>
                              <div style={{
                                fontSize: '14px',
                                fontWeight: 'bold',
                                color: '#666'
                              }}>
                                {viewInfo?.label || viewType || 'VIEW'}
                              </div>
                            </div>
                          )}
                          
                          {/* 타이틀 오버레이 (이미지가 있을 때만) */}
                          {capturedImage && view.hideTitle !== true && (
                            <div style={{ 
                              position: 'absolute', 
                              top: '8px', 
                              left: '8px', 
                              fontSize: '12px', 
                              fontWeight: 'bold',
                              color: '#333',
                              backgroundColor: 'rgba(255,255,255,0.9)',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }}>
                              {viewInfo?.label || viewType || 'VIEW'}
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
            </div>
          </div>
          </div>
          
          {/* 하단 페이지 미리보기 패널 */}
          <div className={styles.pagePreviewPanel}>
            <div className={styles.pageListContainer}>
              <div className={`${styles.pageList} ${orientation === 'portrait' ? styles.portraitList : ''}`}>
                {/* 페이지 추가 카드 - 상단에 배치 */}
                <div 
                  className={`${styles.pageItemWrapper} ${orientation === 'portrait' ? styles.portrait : ''}`}
                >
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
                
                {pages.map((page, index) => (
                  <div key={index} className={`${styles.pageItemWrapper} ${orientation === 'portrait' ? styles.portrait : ''}`}>
                    <div 
                      className={`${styles.pageItem} ${currentPage === index ? styles.active : ''}`}
                      onClick={() => handlePageChange(index)}
                    >
                      <div className={styles.pageNumber}>{index + 1}</div>
                      <div className={styles.pageThumbnail}>
                        {currentPage === index && fabricCanvasRef.current ? (
                          // 현재 페이지는 캔버스 내용을 실시간으로 보여줌
                          <div 
                            style={{ 
                              width: '100%', 
                              height: '100%',
                              position: 'relative',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: paperBackgroundImage ? 'transparent' : (paperColor || '#ffffff')
                            }}
                          >
                            <canvas 
                              key={`thumbnail-${index}-${thumbnailRefresh}-${orientation}`}
                              ref={(el) => {
                                if (el && fabricCanvasRef.current) {
                                  const ctx = el.getContext('2d');
                                  if (ctx) {
                                    // 카드 크기에 맞춰 썸네일 크기 설정
                                    const cardWidth = orientation === 'portrait' ? 90 : 145;
                                    const cardHeight = orientation === 'portrait' ? 110 : 70;
                                    
                                    // 페이지 비율 계산
                                    const pageRatio = paperDimensions.displayWidth / paperDimensions.displayHeight;
                                    const cardRatio = cardWidth / cardHeight;
                                    
                                    let canvasWidth, canvasHeight;
                                    
                                    if (pageRatio > cardRatio) {
                                      // 페이지가 카드보다 넓은 경우
                                      canvasWidth = cardWidth;
                                      canvasHeight = cardWidth / pageRatio;
                                    } else {
                                      // 페이지가 카드보다 좁은 경우
                                      canvasHeight = cardHeight;
                                      canvasWidth = cardHeight * pageRatio;
                                    }
                                    el.width = canvasWidth;
                                    el.height = canvasHeight;

                                    const drawBackground = (next: () => void) => {
                                      if (paperBackgroundDataUrl) {
                                        const bgImg = new Image();
                                        bgImg.onload = () => {
                                          ctx.drawImage(bgImg, 0, 0, el.width, el.height);
                                          next();
                                        };
                                        bgImg.onerror = () => {
                                          ctx.fillStyle = paperColor || '#ffffff';
                                          ctx.fillRect(0, 0, el.width, el.height);
                                          next();
                                        };
                                        bgImg.src = paperBackgroundDataUrl;
                                      } else {
                                        ctx.fillStyle = paperColor || '#ffffff';
                                        ctx.fillRect(0, 0, el.width, el.height);
                                        next();
                                      }
                                    };

                                    // Fabric 캔버스 내용을 그리기
                                    setTimeout(() => {
                                      if (fabricCanvasRef.current) {
                                        const scale = canvasWidth / paperDimensions.displayWidth;
                                        const dataUrl = fabricCanvasRef.current.toDataURL({
                                          format: 'png',
                                          multiplier: scale
                                        });

                                        const img = new Image();
                                        img.onload = () => {
                                          ctx.clearRect(0, 0, el.width, el.height);
                                          drawBackground(() => {
                                            ctx.drawImage(img, 0, 0, el.width, el.height);
                                          });
                                        };
                                        img.onerror = () => {
                                          drawBackground(() => void 0);
                                        };
                                        img.src = dataUrl;
                                      }
                                    }, 100);
                                  }
                                }
                              }}
                              style={{ 
                                maxWidth: '100%',
                                maxHeight: '100%',
                                width: 'auto',
                                height: 'auto'
                              }}
                            />
                          </div>
                        ) : page.length > 0 ? (
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
              width: draggedMenuItem.type === 'uploaded-file' ? '150px' : '200px',
              height: draggedMenuItem.type === 'uploaded-file' ? '150px' : '150px',
              border: `2px dashed ${getThemeHex()}`,
              backgroundColor: `${getThemeHex()}20`, // 20 = 12.5% opacity in hex
              pointerEvents: 'none',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: getThemeHex(),
              fontSize: '14px',
              borderRadius: '8px'
            }}
          >
            {draggedMenuItem.type === 'uploaded-file' && draggedMenuItem.uploadedFile ? (
              draggedMenuItem.uploadedFile.thumbnail ? (
                <img 
                  src={draggedMenuItem.uploadedFile.thumbnail} 
                  alt={draggedMenuItem.uploadedFile.name}
                  style={{
                    width: '80%',
                    height: '80%',
                    objectFit: 'contain',
                    opacity: 0.8
                  }}
                />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  {draggedMenuItem.uploadedFile.type === 'pdf' ? (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  ) : draggedMenuItem.uploadedFile.type === 'dxf' ? (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                  ) : null}
                  <div style={{ marginTop: '8px', fontSize: '12px' }}>
                    {draggedMenuItem.uploadedFile.name.length > 15 
                      ? `${draggedMenuItem.uploadedFile.name.substring(0, 12)}...` 
                      : draggedMenuItem.uploadedFile.name}
                  </div>
                </div>
              )
            ) : (
              draggedMenuItem.label
            )}
          </div>
      )}

      {/* 뷰어 오버레이 */}
      {viewerOverlay.isOpen && (
          <div className={`${styles.viewerOverlay} ${theme.mode === 'dark' ? styles.darkTheme : styles.lightTheme}`}>
            <div className={styles.viewerContainer}>
              <div className={styles.viewerHeader}>
                <h3>{t('export.drawingEditor')} - {viewerOverlay.viewType?.toUpperCase()}</h3>
                <button
                  className={styles.closeButton}
                  onClick={() => setViewerOverlay({ isOpen: false, viewId: null, viewType: null })}
                >
                  ✕
                </button>
              </div>
              
              {/* 서브헤더 - ViewerControls와 동일 */}
              <div className={styles.viewerSubHeader}>
                <div className={styles.leftControls}>
                  {/* 치수 표시 토글 */}
                  <div className={styles.toggleGroup}>
                    <span
                      className={`${styles.toggleLabel} ${styles.clickable}`}
                      onClick={() => {
                        // 단순히 치수 표시만 토글
                        uiStore.setShowDimensions(!uiStore.showDimensions);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {uiStore.showDimensions ? t('viewer.on').toUpperCase() : t('viewer.off').toUpperCase()}
                    </span>
                    <button
                      className={`${styles.switch} ${uiStore.showDimensions ? styles.on : styles.off}`}
                      onClick={() => {
                        // 단순히 치수 표시만 토글
                        uiStore.setShowDimensions(!uiStore.showDimensions);
                      }}
                    >
                      <div className={styles.switchHandle}></div>
                    </button>
                  </div>

                  {/* 체크박스 옵션들 - showDimensions가 true일 때만 표시 */}
                  {uiStore.showDimensions && (
                  <div className={styles.checkboxGroup}>
                    {/* 2D 모드에서만 가구 체크박스 표시 */}
                    {viewMode === '2D' && (
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={uiStore.showFurniture}
                          onChange={(e) => uiStore.setShowFurniture(e.target.checked)}
                          className={styles.checkbox}
                        />
                        <span className={styles.checkmark}></span>
                        {t('furniture.title')}
                      </label>
                    )}

                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={uiStore.showAll}
                        onChange={(e) => uiStore.setShowAll(e.target.checked)}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkmark}></span>
                      {t('viewer.column')}
                    </label>

                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={uiStore.showDimensionsText}
                        onChange={(e) => uiStore.setShowDimensionsText(e.target.checked)}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkmark}></span>
                      {t('viewer.dimensions')}
                    </label>

                    {viewMode === '3D' && (
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={uiStore.showFurnitureEditHandles}
                          onChange={(e) => uiStore.setShowFurnitureEditHandles(e.target.checked)}
                          className={styles.checkbox}
                        />
                        <span className={styles.checkmark}></span>
                        아이콘
                      </label>
                    )}

                    {/* 그리드와 축 - 2D 모드에서만 표시 */}
                    {viewMode === '2D' && (
                      <>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={uiStore.showGuides}
                            onChange={(e) => uiStore.setShowGuides(e.target.checked)}
                            className={styles.checkbox}
                          />
                          <span className={styles.checkmark}></span>
                          {t('viewer.grid')}
                        </label>

                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={uiStore.showAxis}
                            onChange={(e) => uiStore.setShowAxis(e.target.checked)}
                            className={styles.checkbox}
                          />
                          <span className={styles.checkmark}></span>
                          {t('viewer.axis')}
                        </label>
                      </>
                    )}
                  </div>
                  )}
                </div>

                <div className={styles.centerControls}>
                  {/* 렌더 모드 */}
                  <div className={styles.renderModeGroup}>
                    <button
                      className={`${styles.renderModeButton} ${renderMode === 'solid' ? styles.active : ''}`}
                      onClick={() => setRenderMode('solid')}
                    >
                      {t('viewer.solid')}
                    </button>
                    <button
                      className={`${styles.renderModeButton} ${renderMode === 'wireframe' ? styles.active : ''}`}
                      onClick={() => setRenderMode('wireframe')}
                    >
                      {t('viewer.wireframe')}
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

                  {/* 도어 설치 버튼 */}
                  <div className={styles.doorButtonGroup}>
                    <button
                      className={`${styles.doorButton} ${hasDoorsInstalled ? styles.active : ''}`}
                      onClick={() => {
                        console.log('🚪 도어 설치/제거 핸들러 호출:', {
                          hasDoorsInstalled,
                          placedModulesCount: placedModules.length
                        });

                        if (hasDoorsInstalled) {
                          // 도어 제거: 모든 가구에서 도어 제거
                          console.log('🚪 도어 제거 시도');
                          setAllDoors(false);
                        } else {
                          // 도어 설치: 모든 가구에 도어 설치
                          console.log('🚪 도어 설치 시도');
                          setAllDoors(true);
                        }
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M9 3v18" />
                        <circle cx="15" cy="12" r="1" fill="currentColor" />
                      </svg>
                      {t('viewer.doorInstallation')}
                    </button>
                  </div>
                </div>

                <div className={styles.rightControls}>
                  {/* 2D 방향 선택 */}
                  {viewMode === '2D' && (
                    <>
                      <div className={styles.viewDirectionGroup}>
                        {PDF_TEMPLATE_VIEW_DIRECTIONS.map((direction) => (
                          <button
                            key={direction}
                            className={`${styles.viewDirectionButton} ${view2DDirection === direction ? styles.active : ''}`}
                            onClick={() => setView2DDirection(direction)}
                          >
                            {direction === 'all' ? t('viewer.all') :
                             direction === 'front' ? t('viewer.front') :
                             direction === 'top' ? t('viewer.top') :
                             t('viewer.left')}
                          </button>
                        ))}
                      </div>

                      {/* 다크모드/라이트모드 토글 - 2D 모드에서만 표시 */}
                      <button
                        className={styles.themeToggle}
                        onClick={() => uiStore.toggleView2DTheme()}
                        title={uiStore.view2DTheme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
                      >
                        {uiStore.view2DTheme === 'dark' ? (
                          // 달 아이콘 (다크 모드 상태)
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                          </svg>
                        ) : (
                          // 해 아이콘 (라이트 모드 상태)
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
                  hideEdges={true}
                />
                {captureRegion && (
                  <>
                    <div
                      className={styles.captureShade}
                      style={{
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${captureRegion.y * 100}%`
                      }}
                    />
                    <div
                      className={styles.captureShade}
                      style={{
                        top: `${(captureRegion.y + captureRegion.height) * 100}%`,
                        left: 0,
                        width: '100%',
                        height: `${Math.max(0, 1 - captureRegion.y - captureRegion.height) * 100}%`
                      }}
                    />
                    <div
                      className={styles.captureShade}
                      style={{
                        top: `${captureRegion.y * 100}%`,
                        left: 0,
                        width: `${captureRegion.x * 100}%`,
                        height: `${captureRegion.height * 100}%`
                      }}
                    />
                    <div
                      className={styles.captureShade}
                      style={{
                        top: `${captureRegion.y * 100}%`,
                        left: `${(captureRegion.x + captureRegion.width) * 100}%`,
                        width: `${Math.max(0, 1 - captureRegion.x - captureRegion.width) * 100}%`,
                        height: `${captureRegion.height * 100}%`
                      }}
                    />
                    <div
                      className={styles.captureRegion}
                      style={{
                        left: `${captureRegion.x * 100}%`,
                        top: `${captureRegion.y * 100}%`,
                        width: `${captureRegion.width * 100}%`,
                        height: `${captureRegion.height * 100}%`
                      }}
                      onPointerDown={handleCaptureRegionPointerDown}
                    >
                      <span className={styles.captureRegionLabel}>캡처 영역</span>
                      <div
                        className={`${styles.captureHandle} ${styles.handleNw}`}
                        onPointerDown={(e) => handleCaptureHandlePointerDown(e, 'nw')}
                      />
                      <div
                        className={`${styles.captureHandle} ${styles.handleN}`}
                        onPointerDown={(e) => handleCaptureHandlePointerDown(e, 'n')}
                      />
                      <div
                        className={`${styles.captureHandle} ${styles.handleNe}`}
                        onPointerDown={(e) => handleCaptureHandlePointerDown(e, 'ne')}
                      />
                      <div
                        className={`${styles.captureHandle} ${styles.handleE}`}
                        onPointerDown={(e) => handleCaptureHandlePointerDown(e, 'e')}
                      />
                      <div
                        className={`${styles.captureHandle} ${styles.handleSe}`}
                        onPointerDown={(e) => handleCaptureHandlePointerDown(e, 'se')}
                      />
                      <div
                        className={`${styles.captureHandle} ${styles.handleS}`}
                        onPointerDown={(e) => handleCaptureHandlePointerDown(e, 's')}
                      />
                      <div
                        className={`${styles.captureHandle} ${styles.handleSw}`}
                        onPointerDown={(e) => handleCaptureHandlePointerDown(e, 'sw')}
                      />
                      <div
                        className={`${styles.captureHandle} ${styles.handleW}`}
                        onPointerDown={(e) => handleCaptureHandlePointerDown(e, 'w')}
                      />
                    </div>
                    <div className={styles.captureRegionHint}>드래그해서 영역을 이동하거나 모서리를 잡고 크기를 조절하세요</div>
                  </>
                )}
              </div>

              {/* 하단 버튼 */}
              <div className={styles.viewerFooter}>
                <button 
                  className={styles.captureButton}
                  onClick={handleCaptureFromViewer}
                >
                  삽입
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
