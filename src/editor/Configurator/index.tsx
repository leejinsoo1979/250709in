import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSpaceConfigStore, SPACE_LIMITS, DEFAULT_SPACE_VALUES } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useFurnitureSpaceAdapter } from '@/editor/shared/furniture/hooks/useFurnitureSpaceAdapter';
import { getProject, updateProject, createProject, createDesignFile, getDesignFiles } from '@/firebase/projects';
import { captureProjectThumbnail, generateDefaultThumbnail } from '@/editor/shared/utils/thumbnailCapture';
import { useAuth } from '@/auth/AuthProvider';
import { useProjectPermission } from '@/hooks/useProjectPermission';
import { getProjectCollaborators, type ProjectCollaborator } from '@/firebase/shareLinks';
import { SpaceCalculator, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useHistoryStore } from '@/store/historyStore';
import { useHistoryTracking } from './hooks/useHistoryTracking';
import { useGLBExport } from '@/editor/shared/hooks/useGLBExport';

// 새로운 컴포넌트들 import
import Header from './components/Header';
import Sidebar, { SidebarTab } from './components/Sidebar';
import ViewerControls, { ViewMode, ViewDirection, RenderMode } from './components/ViewerControls';
import RightPanel, { RightPanelTab, DoorCountSlider as DoorSlider } from './components/RightPanel';
import { ModuleContent } from './components/RightPanel';
import DashboardFileTree from '@/components/FileTree/DashboardFileTree';
import { TouchCompatibleControl } from './components/TouchCompatibleControls';
import SlotSelector from './components/SlotSelector';


// 기존 작동하는 컴포넌트들
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import ModuleGallery from '@/editor/shared/controls/furniture/ModuleGallery';
import ModulePropertiesPanel from '@/editor/shared/controls/furniture/ModulePropertiesPanel';
import PlacedModulePropertiesPanel from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel';
import MaterialPanel from '@/editor/shared/controls/styling/MaterialPanel';
import ExportPanel from './components/controls/ExportPanel';
import ColumnControl from '@/editor/shared/controls/structure/ColumnControl';
import ColumnEditModal from '@/editor/shared/controls/structure/ColumnEditModal';
import ConvertModal from './components/ConvertModal';
import { PDFTemplatePreview } from '@/editor/shared/components/PDFTemplatePreview';
import { ShareLinkModal } from '@/components/ShareLinkModal';
import PreviewViewer from './components/PreviewViewer';
import MobileBottomBar, { MobileTab } from './components/MobileBottomBar';
import MobileBottomSheet from './components/MobileBottomSheet';
import MobilePanel from './components/MobilePanel';
import MobileToolbar from './components/MobileToolbar';

import {
  WidthControl,
  HeightControl,
  InstallTypeControls,
  SurroundControls,
  BaseControls
} from '@/editor/shared/controls';
import GapControls from '@/editor/shared/controls/customization/components/GapControls';

import styles from './style.module.css';
import responsiveStyles from './responsive.module.css';
import rightPanelStyles from './components/RightPanel.module.css';

const Configurator: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL 파라미터 미리 추출
  const modeParam = searchParams.get('mode');
  const isReadOnlyMode = modeParam === 'readonly';
  const isNewDesign = searchParams.get('design') === 'new';
  const projectIdParam = searchParams.get('projectId') || searchParams.get('id') || searchParams.get('project');

  const [loading, setLoading] = useState(!isNewDesign && !isReadOnlyMode); // 새 디자인이나 readonly 모드인 경우 로딩 건너뛰기
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentDesignFileId, setCurrentDesignFileId] = useState<string | null>(null);
  const [currentDesignFileName, setCurrentDesignFileName] = useState<string>('');

  // 프로젝트 권한 확인 (readonly 모드에서는 권한 체크 건너뛰기)
  // readonly 모드에서는 URL에서 직접 projectId 읽기
  const permissionProjectId = isReadOnlyMode ? projectIdParam : currentProjectId;
  const { permission, canEdit, isOwner } = useProjectPermission(permissionProjectId, isReadOnlyMode);

  // 읽기 전용 모드 계산 (상태 변경 없이 useMemo로 계산)
  const isReadOnly = useMemo(() => {
    // URL mode=readonly가 최우선
    if (isReadOnlyMode) return true;
    // viewer 권한이면 읽기 전용
    if (permission === 'viewer') return true;
    return false;
  }, [isReadOnlyMode, permission]);

  // 협업자 및 소유자 정보
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [projectOwner, setProjectOwner] = useState<{ userId: string; name: string; photoURL?: string } | null>(null);

  // Store hooks
  const { setBasicInfo, basicInfo } = useProjectStore();
  const { setSpaceInfo, spaceInfo, updateColumn } = useSpaceConfigStore();
  const { setPlacedModules, placedModules, setAllDoors, clearAllModules } = useFurnitureStore();
  const derivedSpaceStore = useDerivedSpaceStore();
  const { updateFurnitureForNewSpace } = useFurnitureSpaceAdapter({ setPlacedModules });
  const { viewMode, setViewMode, doorsOpen, toggleDoors, view2DDirection, setView2DDirection, showDimensions, toggleDimensions, showDimensionsText, toggleDimensionsText, setHighlightedFrame, selectedColumnId, setSelectedColumnId, activePopup, openColumnEditModal, closeAllPopups, showGuides, toggleGuides, showAxis, toggleAxis, activeDroppedCeilingTab, setActiveDroppedCeilingTab, showFurniture, setShowFurniture, setShadowEnabled, toggleIndividualDoor } = useUIStore();

  // 새로운 UI 상태들
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab | null>(() => {
    // readonly 모드일 때는 좌측 사이드바 접힌 상태로 시작
    const mode = searchParams.get('mode');
    return mode === 'readonly' ? null : 'module';
  });
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<'slotA'>('slotA');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => {
    // URL 파라미터로 패널 상태 초기화 (미리보기 팝업용)
    const panelClosed = searchParams.get('panelClosed');
    return panelClosed !== 'true';
  });
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  const [moduleCategory, setModuleCategory] = useState<'tall' | 'upper' | 'lower'>('tall'); // 키큰장/상부장/하부장 토글

  // 모바일/태블릿 반응형 상태
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // 화면 크기 감지
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // 모바일 탭 변경 핸들러
  const handleMobileTabChange = (tab: MobileTab) => {
    if (activeMobileTab === tab) {
      // 같은 탭 클릭 시 닫기
      setActiveMobileTab(null);
      setMobileSheetOpen(false);
    } else {
      setActiveMobileTab(tab);
      setMobileSheetOpen(true);
    }
  };

  // readonly 모드에서 로드 완료 추적 (무한 루프 방지)
  const hasLoadedInReadonlyRef = useRef(false);

  // 3D 씬 참조 (GLB 내보내기용)
  const sceneRef = useRef<any>(null);

  // 최초 썸네일 생성 여부 추적
  const hasGeneratedInitialThumbnailRef = useRef(false);

  // GLB 내보내기 훅
  const { exportToGLB, canExportGLB } = useGLBExport();

  // 권한에 따라 읽기 전용 모드 설정
  // isReadOnly는 이제 useMemo로 계산되므로 이 useEffect 제거

  // 읽기 전용 모드에서 3D 정면 뷰로 초기화 (섬네일과 동일한 뷰)
  useEffect(() => {
    if (isReadOnly) {
      const uiStore = useUIStore.getState();
      uiStore.setViewMode('3D');
      uiStore.setView2DDirection('front');
      uiStore.setCameraMode('perspective');
      uiStore.setShowDimensions(false);
      uiStore.setShowDimensionsText(false);
      console.log('📸 읽기 전용 모드: 3D 정면 뷰로 초기화 (섬네일과 동일)');
    }
  }, [isReadOnly]);

  // 프로젝트 로드 후 자동 썸네일 생성 (최초 1회만)
  useEffect(() => {
    const generateInitialThumbnail = async () => {
      // 이미 생성했거나, 로딩 중이거나, projectId가 없으면 스킵
      if (hasGeneratedInitialThumbnailRef.current || loading || !currentProjectId || isReadOnlyMode) {
        return;
      }

      // 3D 뷰어 렌더링을 기다림 (2초 대기)
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        hasGeneratedInitialThumbnailRef.current = true;
        console.log('📸 최초 썸네일 자동 생성 시작');

        const thumbnail = await captureProjectThumbnail();
        if (thumbnail) {
          const { dataURLToBlob } = await import('@/editor/shared/utils/thumbnailCapture');
          const thumbnailBlob = dataURLToBlob(thumbnail);

          await updateProject(currentProjectId, {
            thumbnail: thumbnailBlob
          });

          console.log('📸 최초 썸네일 자동 생성 완료');
        }
      } catch (error) {
        console.error('📸 최초 썸네일 생성 실패:', error);
      }
    };

    generateInitialThumbnail();
  }, [loading, currentProjectId, isReadOnlyMode]);

  // 뷰어 컨트롤 상태들 - view2DDirection과 showDimensions는 UIStore 사용
  const [renderMode, setRenderMode] = useState<RenderMode>('solid');
  const [showAll, setShowAll] = useState(true);
  const [isConvertPanelOpen, setIsConvertPanelOpen] = useState(false); // 컨버팅 패널 상태
  const [showPDFPreview, setShowPDFPreview] = useState(false); // PDF 미리보기 상태
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false); // 내보내기 모달 상태
  const [isShareModalOpen, setIsShareModalOpen] = useState(false); // 공유 모달 상태
  const [capturedViews, setCapturedViews] = useState<{
    top?: string;
    front?: string;
    side?: string;
    door?: string;
  }>({});

  // 기존 공간 변경 로직 복구
  const [previousSpaceInfo, setPreviousSpaceInfo] = useState(() => {
    // 초기 spaceInfo에서도 installType 변환
    const initialSpaceInfo = { ...spaceInfo };
    if (initialSpaceInfo.installType === 'built-in') {
      initialSpaceInfo.installType = 'builtin';
    }
    return initialSpaceInfo;
  });

  // History Store
  const { saveState } = useHistoryStore();

  // 히스토리 트래킹 활성화
  useHistoryTracking();

  // URL 파라미터에서 프로젝트명과 디자인파일명 읽기 (fallback용)
  const urlProjectName = useMemo(() => {
    const name = searchParams.get('projectName');
    return name ? decodeURIComponent(name) : null;
  }, [searchParams]);

  const urlDesignFileName = useMemo(() => {
    const name = searchParams.get('designFileName');
    return name ? decodeURIComponent(name) : null;
  }, [searchParams]);

  // 키보드 단축키 이벤트 리스너
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // input 필드에 포커스가 있으면 키보드 단축키 무시
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      // Ctrl+Z / Cmd+Z로 Undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        const headerUndo = document.querySelector('[title="실행 취소 (Ctrl+Z)"]') as HTMLButtonElement;
        headerUndo?.click();
        return;
      }

      // Ctrl+Y / Cmd+Y 또는 Ctrl+Shift+Z / Cmd+Shift+Z로 Redo
      if (((event.ctrlKey || event.metaKey) && event.key === 'y') ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z')) {
        event.preventDefault();
        const headerRedo = document.querySelector('[title="다시 실행 (Ctrl+Y)"]') as HTMLButtonElement;
        headerRedo?.click();
        return;
      }

      // D 키로 도어 열기/닫기 토글
      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        console.log('🚪 D 키로 도어 토글 시도');
        toggleDoors();
        return;
      }

      // Backspace 또는 Delete 키로 선택된 가구 삭제
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const { selectedFurnitureId } = useUIStore.getState();
        if (selectedFurnitureId) {
          event.preventDefault();
          console.log('🗑️ 키보드로 가구 삭제:', selectedFurnitureId);
          const { removeModule } = useFurnitureStore.getState();
          const { setSelectedFurnitureId } = useUIStore.getState();
          removeModule(selectedFurnitureId);
          setSelectedFurnitureId(null);
          return;
        }
      }

      // Ctrl+E 또는 Cmd+E로 선택된 기둥 편집 모달 열기
      if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault();
        if (selectedColumnId) {
          console.log('⌨️ 키보드 단축키로 기둥 편집 모달 열기:', selectedColumnId);
          openColumnEditModal(selectedColumnId);
        } else {
          console.log('⚠️ 선택된 기둥이 없습니다.');
        }
        return;
      }

      // 컬럼 편집 팝업이 열린 상태에서 좌우 화살표로 컬럼 이동
      if (activePopup.type === 'columnEdit' && activePopup.id) {
        const targetColumn = spaceInfo.columns?.find(col => col.id === activePopup.id);
        if (targetColumn && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();

          const currentX = targetColumn.position[0]; // Three.js 단위 (meters)
          const spaceWidthM = spaceInfo.width * 0.01; // mm to meters
          const columnWidthM = targetColumn.width * 0.01; // mm to meters

          // Shift 키가 눌려있으면 빠른 이동 (50mm), 그렇지 않으면 정밀 이동 (5mm)
          const moveStep = event.shiftKey ? 0.05 : 0.005; // Shift: 50mm, 일반: 5mm

          let newX = currentX;
          if (event.key === 'ArrowLeft') {
            newX = Math.max(-(spaceWidthM / 2) + (columnWidthM / 2), currentX - moveStep);
          } else if (event.key === 'ArrowRight') {
            newX = Math.min((spaceWidthM / 2) - (columnWidthM / 2), currentX + moveStep);
          }

          // 컬럼 위치 업데이트
          updateColumn(activePopup.id, { position: [newX, targetColumn.position[1], targetColumn.position[2]] });

          console.log('⌨️ 컬럼 키보드 이동:', {
            columnId: activePopup.id,
            direction: event.key,
            moveStep: moveStep,
            stepSize: event.shiftKey ? '50mm (빠름)' : '5mm (정밀)',
            oldX: currentX,
            newX
          });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedColumnId, openColumnEditModal, activePopup, spaceInfo.columns, spaceInfo.width, updateColumn]);

  // 파일 시작 시 3D 정면뷰로 초기화 (컴포넌트 마운트 시 1회만)
  useEffect(() => {
    setViewMode('3D');
    setView2DDirection('front');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 미리보기 창과 BroadcastChannel 동기화
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('preview-sync');

    // 미리보기 창에서 상태 요청이 오면 응답
    channel.onmessage = (event) => {
      if (event.data?.type === 'REQUEST_STATE') {
        channel.postMessage({
          type: 'STATE_RESPONSE',
          payload: {
            spaceInfo,
            placedModules
          }
        });
      }
    };

    return () => channel.close();
  }, [spaceInfo, placedModules]);

  // spaceInfo 또는 placedModules 변경 시 미리보기 창에 업데이트 전송
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('preview-sync');
    channel.postMessage({
      type: 'STATE_UPDATE',
      payload: {
        spaceInfo,
        placedModules
      }
    });
    channel.close();
  }, [spaceInfo, placedModules]);

  // MaterialConfig 변경 모니터링
  useEffect(() => {
    if (spaceInfo.materialConfig) {
      console.log('🔍 Configurator - MaterialConfig 변경 감지:', {
        interiorColor: spaceInfo.materialConfig.interiorColor,
        doorColor: spaceInfo.materialConfig.doorColor,
        interiorTexture: spaceInfo.materialConfig.interiorTexture,
        doorTexture: spaceInfo.materialConfig.doorTexture,
        isCabinetTexture1: {
          interior: spaceInfo.materialConfig.interiorTexture?.includes('cabinet texture1'),
          door: spaceInfo.materialConfig.doorTexture?.includes('cabinet texture1')
        }
      });
    }
  }, [spaceInfo.materialConfig]);


  // 현재 컬럼 수를 안전하게 가져오는 함수
  // FrameSize 업데이트 도우미 함수
  const updateFrameSize = (property: 'left' | 'right' | 'top', value: number) => {
    // 엔드패널인 경우 값 변경 불가 (20mm 고정)
    if (property === 'left' && (
      (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left) ||
      spaceInfo.installType === 'freestanding'
    )) {
      return; // 좌측 엔드패널은 20mm 고정
    }

    if (property === 'right' && (
      (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right) ||
      spaceInfo.installType === 'freestanding'
    )) {
      return; // 우측 엔드패널은 20mm 고정
    }

    const currentFrameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    handleSpaceInfoUpdate({
      frameSize: {
        ...currentFrameSize,
        [property]: value
      }
    });
  };

  // 공간 넓이 기반 최소/최대 도어 개수 계산
  const calculateDoorRange = (spaceWidth: number) => {
    const FRAME_MARGIN = 100; // 양쪽 50mm씩
    const usableWidth = spaceWidth - FRAME_MARGIN;

    // 슬롯 크기 제약 조건 (400mm ~ 600mm) - 이 범위를 절대 벗어날 수 없음
    const MIN_SLOT_WIDTH = 400;
    const MAX_SLOT_WIDTH = 600;

    // 엄격한 제약 조건: 슬롯이 400mm 미만이 되거나 600mm 초과가 되는 것을 방지
    const minPossible = Math.max(1, Math.ceil(usableWidth / MAX_SLOT_WIDTH)); // 슬롯 최대 600mm 엄격히 제한
    const maxPossible = Math.min(20, Math.floor(usableWidth / MIN_SLOT_WIDTH)); // 슬롯 최소 400mm 엄격히 제한

    // 실제 슬롯 크기가 400-600mm 범위 내에 있는지 검증
    const finalMin = Math.max(minPossible, 1);
    const finalMax = Math.min(maxPossible, 20);

    // 불가능한 경우 (공간이 너무 작아서 400mm 슬롯도 만들 수 없음)
    if (finalMin > finalMax) {
      return {
        min: 1,
        max: 1,
        ideal: 1
      };
    }

    return {
      min: finalMin,
      max: finalMax,
      ideal: Math.max(finalMin, Math.min(finalMax, Math.round(usableWidth / 500)))
    };
  };

  const getCurrentColumnCount = () => {
    // 단내림이 활성화된 경우 메인 구간의 폭을 기준으로 계산
    let effectiveWidth = spaceInfo.width || 4800;

    if (spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 활성화된 경우 전체 폭에서 단내림 폭을 뺀 나머지가 메인 구간
      effectiveWidth = effectiveWidth - (spaceInfo.droppedCeiling.width || 900);
    }

    const range = calculateDoorRange(effectiveWidth);

    // 기본값을 최소값으로 설정 (ideal 대신 min 사용)
    let count = range.min;

    // 단내림이 활성화된 경우 메인구간 도어 개수 사용
    if (spaceInfo.droppedCeiling?.enabled) {
      if (spaceInfo.mainDoorCount) {
        count = spaceInfo.mainDoorCount;
      } else {
        // mainDoorCount가 없으면 현재 customColumnCount 사용, 없으면 최소값
        count = spaceInfo.customColumnCount || derivedSpaceStore.columnCount || range.min;
      }
    } else {
      // 단내림이 비활성화된 경우 customColumnCount 우선 사용, 없으면 최소값
      count = spaceInfo.customColumnCount || derivedSpaceStore.columnCount || range.min;
    }

    // 반드시 400-600mm 범위 안에서만 동작하도록 강제
    count = Math.max(range.min, Math.min(range.max, count));

    // 실제 슬롯 크기 검증
    const usableWidth = effectiveWidth - 100;
    const slotWidth = usableWidth / count;

    // 슬롯 크기가 400-600mm 범위를 벗어나면 조정
    if (slotWidth < 400) {
      count = Math.floor(usableWidth / 400);
    } else if (slotWidth > 600) {
      count = Math.ceil(usableWidth / 600);
    }

    return Math.max(range.min, Math.min(range.max, count));
  };



  // 특수 듀얼 가구 배치 여부 확인
  const hasSpecialDualFurniture = placedModules.some(module =>
    module.moduleId.includes('dual-2drawer-styler') ||
    module.moduleId.includes('dual-4drawer-pantshanger')
  );

  console.log('🔧 Configurator - hasSpecialDualFurniture:', hasSpecialDualFurniture);
  console.log('🔧 Configurator - placedModules:', placedModules);

  // 배치된 가구 중 도어가 있는 가구가 있는지 확인
  const hasDoorsInstalled = placedModules.some(module => module.hasDoor);

  // 프로젝트 데이터 로드
  const loadProject = async (projectId: string) => {
    setLoading(true);

    // 프로젝트 로드 전에 store 초기화 (이전 데이터 제거)
    console.log('🧹 프로젝트 로드 전 store 초기화');
    setPlacedModules([]);

    try {
      console.log('🔄 프로젝트 로드 시작:', projectId);
      const { project, error } = await getProject(projectId);
      console.log('📦 프로젝트 로드 결과:', { project, error });

      if (error) {
        console.error('❌ 프로젝트 로드 에러:', error);
        // 읽기 전용 모드에서는 alert도 표시하지 않음
        const mode = searchParams.get('mode');
        if (mode !== 'readonly') {
          alert('프로젝트를 불러오는데 실패했습니다: ' + error);
          navigate('/');
        } else {
          console.log('👁️ 읽기 전용 모드 - 에러 무시');
        }
        return;
      }

      if (project) {
        // 프로젝트 데이터를 설정하되, title은 Firebase의 title을 우선 사용
        const projectTitle = project.title || project.projectData?.title || '새 프로젝트';
        setBasicInfo({
          title: projectTitle,
          location: project.projectData?.location || ''
        });
        console.log('🔍 loadProject에서 설정한 title:', projectTitle);
        // installType 하이픈 문제 수정
        const spaceConfig = { ...project.spaceConfig };
        if (spaceConfig.installType === 'built-in') {
          spaceConfig.installType = 'builtin';
        }

        // wallConfig가 없으면 installType에 맞게 기본값 설정
        if (!spaceConfig.wallConfig) {
          switch (spaceConfig.installType) {
            case 'builtin':
              spaceConfig.wallConfig = { left: true, right: true };
              break;
            case 'semistanding':
              spaceConfig.wallConfig = { left: true, right: false };
              break;
            case 'freestanding':
              spaceConfig.wallConfig = { left: false, right: false };
              break;
          }
        }

        // mainDoorCount와 customColumnCount를 undefined로 초기화하여 자동 계산 활성화
        spaceConfig.mainDoorCount = undefined;
        spaceConfig.droppedCeilingDoorCount = undefined;
        spaceConfig.customColumnCount = undefined;
        console.log('🔄 Firebase 프로젝트 로드 시 컬럼 관련 값 초기화');

        setSpaceInfo(spaceConfig);
        setPlacedModules(project.furniture?.placedModules || []);
        setCurrentProjectId(projectId);

        // 프로젝트 소유자 정보 설정
        if (project.userId) {
          console.log('👤 프로젝트 소유자 정보:', {
            projectUserId: project.userId,
            currentUserId: user?.uid,
            isOwner: user && project.userId === user.uid,
            userName: project.userName,
            userEmail: project.userEmail,
            userPhotoURL: project.userPhotoURL,
            currentUserPhotoURL: user?.photoURL
          });

          // 프로젝트 소유자가 현재 로그인한 사용자인 경우, 현재 사용자 정보 사용
          if (user && project.userId === user.uid) {
            console.log('📸 현재 사용자 Auth 정보:', {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoURL: user.photoURL,
              providerData: user.providerData
            });

            const ownerData = {
              userId: user.uid,
              name: user.displayName || user.email || '소유자',
              photoURL: user.photoURL || undefined
            };
            console.log('👑 소유자 정보 설정 (현재 사용자):', ownerData);
            setProjectOwner(ownerData);
          } else {
            // 다른 사용자의 프로젝트인 경우 저장된 정보 사용
            const ownerData = {
              userId: project.userId,
              name: project.userName || project.userEmail || '소유자',
              photoURL: project.userPhotoURL
            };
            console.log('👑 소유자 정보 설정 (저장된 정보):', ownerData);
            setProjectOwner(ownerData);
          }
        }

        // 디자인파일명 설정은 별도 useEffect에서 처리됨

        console.log('✅ 프로젝트 로드 성공:', project.title);
        console.log('🪑 배치된 가구 개수:', project.furniture?.placedModules?.length || 0);
        console.log('🎨 로드된 materialConfig:', project.spaceConfig.materialConfig);

        // 프로젝트 로드 후 derivedSpaceStore 명시적 재계산
        console.log('🔄 [프로젝트 로드 후] derivedSpaceStore 강제 재계산');
        derivedSpaceStore.recalculateFromSpaceInfo(project.spaceConfig);
      }
    } catch (error) {
      console.error('프로젝트 로드 실패:', error);
      // 읽기 전용 모드에서는 alert도 표시하지 않음
      const mode = searchParams.get('mode');
      if (mode !== 'readonly') {
        alert('프로젝트 로드 중 오류가 발생했습니다.');
        navigate('/');
      } else {
        console.log('👁️ 읽기 전용 모드 - 에러 무시');
      }
    } finally {
      setLoading(false);
    }
  };

  // Firebase 설정 확인
  const isFirebaseConfigured = () => {
    return !!(
      import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID
    );
  };

  // Firebase 호환을 위해 undefined 값 제거하는 헬퍼 함수
  const removeUndefinedValues = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (Array.isArray(obj)) {
      // 배열의 각 요소를 재귀적으로 처리하되, null이 아닌 요소만 유지
      return obj.map(removeUndefinedValues).filter(item => item !== null);
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          const cleanedValue = removeUndefinedValues(value);
          // null이 아닌 값만 포함
          if (cleanedValue !== null) {
            result[key] = cleanedValue;
          }
        }
      }
      return result;
    }

    return obj;
  };

  // 디자인 파일 저장 (프로젝트가 아닌 디자인 파일로 저장)
  const saveProject = async () => {
    console.log('💾 [DEBUG] saveProject 함수 시작');

    // 읽기 전용 모드에서는 저장 불가
    if (isReadOnly) {
      console.log('🚫 읽기 전용 모드 - 저장 차단');
      alert('읽기 전용 모드에서는 저장할 수 없습니다.');
      return;
    }

    // URL 파라미터에서 직접 읽기 (상태가 아직 업데이트되지 않았을 수 있음)
    const urlProjectId = searchParams.get('projectId') || searchParams.get('id') || searchParams.get('project');
    const urlDesignFileId = searchParams.get('designFileId');

    // currentProjectId가 없으면 URL에서 가져오기
    const effectiveProjectId = currentProjectId || urlProjectId;
    const effectiveDesignFileId = currentDesignFileId || urlDesignFileId;

    console.log('💾 [DEBUG] 현재 프로젝트 ID:', currentProjectId);
    console.log('💾 [DEBUG] URL 프로젝트 ID:', urlProjectId);
    console.log('💾 [DEBUG] 사용할 프로젝트 ID:', effectiveProjectId);
    console.log('💾 [DEBUG] 현재 디자인파일 ID:', currentDesignFileId);
    console.log('💾 [DEBUG] URL 디자인파일 ID:', urlDesignFileId);
    console.log('💾 [DEBUG] 사용할 디자인파일 ID:', effectiveDesignFileId);
    console.log('💾 [DEBUG] Firebase 설정:', isFirebaseConfigured());
    console.log('💾 [DEBUG] 사용자 상태:', !!user);
    console.log('💾 [DEBUG] 사용자 정보:', user ? { email: user.email, uid: user.uid } : 'null');

    // Firebase 연결 및 인증 상태 테스트
    try {
      const { db, auth } = await import('@/firebase/config');
      console.log('💾 [DEBUG] Firestore db 객체:', !!db);
      console.log('💾 [DEBUG] Auth 객체:', !!auth);

      // 현재 인증 상태 확인
      const currentAuthUser = auth.currentUser;
      console.log('💾 [DEBUG] auth.currentUser:', {
        exists: !!currentAuthUser,
        uid: currentAuthUser?.uid,
        email: currentAuthUser?.email
      });

      // 토큰 확인
      if (currentAuthUser) {
        try {
          const token = await currentAuthUser.getIdToken();
          console.log('💾 [DEBUG] 사용자 토큰 획득 성공');
        } catch (tokenError) {
          console.error('💾 [ERROR] 토큰 획득 실패:', tokenError);
        }
      }
    } catch (dbError) {
      console.error('💾 [ERROR] Firebase 연결 실패:', dbError);
    }

    if (!effectiveProjectId) {
      console.error('💾 [ERROR] 프로젝트 ID가 없습니다');
      alert('저장할 프로젝트가 없습니다. 새 프로젝트를 먼저 생성해주세요.');
      return;
    }

    // 상태 동기화 (URL에서 읽은 값이 있으면 상태 업데이트)
    if (effectiveProjectId && !currentProjectId) {
      setCurrentProjectId(effectiveProjectId);
    }
    if (effectiveDesignFileId && !currentDesignFileId) {
      setCurrentDesignFileId(effectiveDesignFileId);
    }

    setSaving(true);
    setSaveStatus('idle');

    try {
      console.log('💾 [DEBUG] 저장할 basicInfo:', basicInfo);
      console.log('💾 [DEBUG] 저장할 spaceInfo 요약:', {
        width: spaceInfo.width,
        height: spaceInfo.height,
        materialConfig: spaceInfo.materialConfig
      });

      // furnitureStore의 현재 상태 직접 확인
      const currentFurnitureState = useFurnitureStore.getState().placedModules;
      console.log('💾 [DEBUG] furnitureStore 현재 상태:', {
        storeCount: currentFurnitureState.length,
        propCount: placedModules.length,
        같은가: currentFurnitureState === placedModules,
        storeModules: currentFurnitureState.map(m => ({
          id: m.id,
          moduleId: m.moduleId,
          isUpperCabinet: m.moduleId?.includes('upper-cabinet'),
          isLowerCabinet: m.moduleId?.includes('lower-cabinet')
        }))
      });

      console.log('💾 [DEBUG] 저장할 placedModules 개수:', placedModules.length);
      console.log('💾 [DEBUG] 저장할 placedModules 상세:', placedModules.map(m => {
        const moduleData = m.moduleId ? getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo) : null;
        return {
          id: m.id,
          moduleId: m.moduleId,
          category: moduleData?.category || 'unknown',
          slotIndex: m.slotIndex,
          position: m.position,
          zone: m.zone,
          hasDoor: m.hasDoor,
          customDepth: m.customDepth,
          customWidth: m.customWidth
        };
      }));

      // 썸네일 생성
      let thumbnail;
      try {
        thumbnail = await captureProjectThumbnail();
        if (!thumbnail) {
          console.log('💾 [DEBUG] 3D 캔버스 캡처 실패, 기본 썸네일 생성');
          thumbnail = generateDefaultThumbnail(spaceInfo, placedModules.length);
        }
        console.log('💾 [DEBUG] 썸네일 생성 완료');
      } catch (thumbnailError) {
        console.error('💾 [DEBUG] 썸네일 생성 실패:', thumbnailError);
        thumbnail = null;
      }

      const firebaseConfigured = isFirebaseConfigured();

      if (firebaseConfigured && user) {
        console.log('💾 [DEBUG] Firebase 저장 모드 진입');

        try {
          // 디자인 파일이 있으면 디자인 파일 업데이트, 없으면 새로 생성
          if (effectiveDesignFileId) {
            console.log('💾 [DEBUG] 기존 디자인 파일 업데이트');
            const { updateDesignFile } = await import('@/firebase/projects');

            const updatePayload = {
              name: currentDesignFileName || basicInfo.title,
              projectData: removeUndefinedValues(basicInfo),
              spaceConfig: removeUndefinedValues(spaceInfo),
              furniture: {
                placedModules: removeUndefinedValues(placedModules)
              },
              thumbnail: thumbnail
            };

            console.log('💾 [DEBUG] updateDesignFile 호출 전 데이터:', {
              name: updatePayload.name,
              spaceConfigKeys: Object.keys(updatePayload.spaceConfig || {}),
              furnitureCount: updatePayload.furniture.placedModules.length,
              hasThumbnail: !!updatePayload.thumbnail,
              furnitureDetails: updatePayload.furniture.placedModules.map(m => {
                const moduleData = m.moduleId ? getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo) : null;
                return {
                  id: m.id,
                  moduleId: m.moduleId,
                  category: moduleData?.category || 'unknown',
                  slotIndex: m.slotIndex,
                  zone: m.zone,
                  hasDoor: m.hasDoor,
                  isUpperCabinet: m.moduleId?.includes('upper-cabinet'),
                  isLowerCabinet: m.moduleId?.includes('lower-cabinet')
                };
              })
            });

            console.log('💾 [DEBUG] updateDesignFile 호출 직전, ID:', effectiveDesignFileId);

            if (!effectiveDesignFileId) {
              console.error('💾 [ERROR] 디자인 파일 ID가 없습니다!');
              console.error('💾 [ERROR] effectiveDesignFileId:', effectiveDesignFileId);
              setSaveStatus('error');
              alert('디자인 파일 ID가 없습니다. 새 디자인을 생성하거나 기존 디자인을 선택해주세요.');
              return;
            }

            const result = await updateDesignFile(effectiveDesignFileId, updatePayload);
            console.log('💾 [DEBUG] updateDesignFile 결과:', result);

            if (result.error) {
              console.error('💾 [ERROR] 디자인 파일 업데이트 실패:', result.error);
              console.error('💾 [ERROR] 전체 결과 객체:', result);
              setSaveStatus('error');
              alert('디자인 파일 저장에 실패했습니다: ' + result.error);
            } else {
              // 디자인 파일 저장 성공 후 프로젝트도 업데이트 (공유 링크와 미리보기 모달에서 가구가 보이도록)
              console.log('💾 프로젝트에도 가구 데이터 저장 시작');
              try {
                const projectUpdateResult = await updateProject(effectiveProjectId, {
                  furniture: {
                    placedModules: removeUndefinedValues(placedModules)
                  },
                  spaceConfig: removeUndefinedValues(spaceInfo)
                }, thumbnail);

                if (projectUpdateResult.error) {
                  console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateResult.error);
                } else {
                  console.log('✅ 프로젝트에도 가구 데이터 저장 완료');
                }
              } catch (projectUpdateError) {
                console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateError);
              }

              setSaveStatus('success');
              console.log('✅ 디자인 파일 저장 성공');

              // URL에 프로젝트명과 디자인파일명 유지 (새로고침 시에도 유지)
              const currentParams = new URLSearchParams(window.location.search);
              let urlNeedsUpdate = false;

              // 프로젝트명 업데이트
              if (basicInfo.title && currentParams.get('projectName') !== encodeURIComponent(basicInfo.title)) {
                currentParams.set('projectName', encodeURIComponent(basicInfo.title));
                urlNeedsUpdate = true;
              }

              // 디자인파일명 업데이트
              const designFileName = currentDesignFileName || basicInfo.title;
              if (designFileName && currentParams.get('designFileName') !== encodeURIComponent(designFileName)) {
                currentParams.set('designFileName', encodeURIComponent(designFileName));
                urlNeedsUpdate = true;
              }

              if (urlNeedsUpdate) {
                const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                window.history.replaceState({}, '', newUrl);
                console.log('🔗 저장 후 URL 업데이트:', newUrl);
              }

              // BroadcastChannel로 디자인 파일 업데이트 알림 (readonly 모드에서는 전송하지 않음)
              console.log('💾 [DEBUG] BroadcastChannel 전송 체크:', { isReadOnly, mode: searchParams.get('mode') });
              if (!isReadOnly) {
                try {
                  const channel = new BroadcastChannel('project-updates');
                  channel.postMessage({
                    type: 'DESIGN_FILE_UPDATED',
                    projectId: effectiveProjectId,
                    designFileId: effectiveDesignFileId,
                    timestamp: Date.now()
                  });
                  console.log('📡 디자인 파일 업데이트 알림 전송');
                  channel.close();
                } catch (broadcastError) {
                  console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
                }
              } else {
                console.log('🚫 readonly 모드 - BroadcastChannel 전송 건너뜀');
              }
            }
          } else {
            console.log('💾 [DEBUG] 새 디자인 파일 생성');
            const { createDesignFile } = await import('@/firebase/projects');
            const { id: designFileId, error } = await createDesignFile({
              name: basicInfo.title || '새 디자인',
              projectId: effectiveProjectId,
              projectData: removeUndefinedValues(basicInfo),
              spaceConfig: removeUndefinedValues(spaceInfo),
              furniture: {
                placedModules: removeUndefinedValues(placedModules)
              },
              thumbnail: thumbnail
            });

            if (error) {
              console.error('💾 [ERROR] 디자인 파일 생성 실패:', error);
              setSaveStatus('error');
              alert('디자인 파일 생성에 실패했습니다: ' + error);
            } else if (designFileId) {
              // 디자인 파일 생성 성공 후 프로젝트도 업데이트 (공유 링크와 미리보기 모달에서 가구가 보이도록)
              console.log('💾 프로젝트에도 가구 데이터 저장 시작');
              try {
                const projectUpdateResult = await updateProject(effectiveProjectId, {
                  furniture: {
                    placedModules: removeUndefinedValues(placedModules)
                  },
                  spaceConfig: removeUndefinedValues(spaceInfo)
                }, thumbnail);

                if (projectUpdateResult.error) {
                  console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateResult.error);
                } else {
                  console.log('✅ 프로젝트에도 가구 데이터 저장 완료');
                }
              } catch (projectUpdateError) {
                console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateError);
              }

              setCurrentDesignFileId(designFileId);
              setCurrentDesignFileName('새 디자인');
              setSaveStatus('success');
              console.log('✅ 새 디자인 파일 생성 및 저장 성공');

              // BroadcastChannel로 디자인 파일 생성 알림 (readonly 모드에서는 전송하지 않음)
              if (!isReadOnly) {
                try {
                  const channel = new BroadcastChannel('project-updates');
                  channel.postMessage({
                    type: 'DESIGN_FILE_UPDATED',
                    projectId: effectiveProjectId,
                    designFileId: designFileId,
                    timestamp: Date.now()
                  });
                  console.log('📡 새 디자인 파일 생성 알림 전송');
                  channel.close();
                } catch (broadcastError) {
                  console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
                }
              }

              // URL 업데이트 (프로젝트명과 디자인파일명 포함)
              const params = new URLSearchParams();
              params.set('projectId', effectiveProjectId);
              params.set('designFileId', designFileId);
              if (basicInfo.title) {
                params.set('projectName', encodeURIComponent(basicInfo.title));
                params.set('designFileName', encodeURIComponent(basicInfo.title));
              }
              navigate(`/configurator?${params.toString()}`, { replace: true });
              console.log('🔗 새 디자인 파일 생성 후 URL 업데이트');
            }
          }

          // 다른 창(대시보드)에 프로젝트 업데이트 알림 (readonly 모드에서는 전송하지 않음)
          if (!isReadOnly) {
            try {
              const channel = new BroadcastChannel('project-updates');
              channel.postMessage({
                type: 'PROJECT_SAVED',
                projectId: effectiveProjectId,
                timestamp: Date.now()
              });
              console.log('💾 [DEBUG] BroadcastChannel 알림 전송 완료');
              channel.close();
            } catch (broadcastError) {
              console.warn('💾 [WARN] BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
            }
          }
        } catch (firebaseError) {
          console.error('💾 [ERROR] Firebase 저장 중 예외:', firebaseError);
          setSaveStatus('error');
          alert('디자인 파일 저장 중 오류가 발생했습니다: ' + firebaseError.message);
        }

        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        console.log('💾 [DEBUG] Firebase 인증 필요');
        setSaveStatus('error');
        alert('저장하려면 로그인이 필요합니다.');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (outerError) {
      console.error('💾 [ERROR] saveProject 최상위 예외:', outerError);
      setSaveStatus('error');
      alert('프로젝트 저장 중 예상치 못한 오류가 발생했습니다: ' + outerError.message);
    } finally {
      console.log('💾 [DEBUG] saveProject 완료, 저장 상태 해제');
      setSaving(false);
    }
  };

  // 새 디자인 생성 함수 (현재 프로젝트 내에)
  const handleNewDesign = async () => {
    console.log('🎨 [DEBUG] handleNewDesign 함수 시작');

    if (!currentProjectId) {
      alert('프로젝트가 선택되지 않았습니다.');
      return;
    }

    try {
      const confirmed = confirm('현재 작업 내용이 사라집니다. 새 디자인을 시작하시겠습니까?');
      console.log('🎨 [DEBUG] 사용자 확인 응답:', confirmed);

      if (!confirmed) {
        console.log('🎨 [DEBUG] 사용자가 취소함');
        return;
      }

      // 기본 설정으로 새 디자인 생성 (DEFAULT_SPACE_VALUES 사용)
      const defaultSpaceConfig = {
        width: DEFAULT_SPACE_VALUES.WIDTH,
        height: DEFAULT_SPACE_VALUES.HEIGHT,
        depth: DEFAULT_SPACE_VALUES.DEPTH,
        installType: 'builtin' as const,
        wallConfig: {
          left: true,
          right: true,
        },
        hasFloorFinish: false,
        columns: [], // 빈 배열로 초기화하여 spaceInfo.columns?.map() 오류 방지
        walls: [],
        panelBs: []
      };

      if (isFirebaseConfigured() && user) {
        // 현재 프로젝트의 기존 디자인 파일 목록 가져오기
        console.log('🔍 기존 디자인 파일 목록 조회 중...');
        const { designFiles } = await getDesignFiles(currentProjectId);

        // "untitle" 패턴의 이름 찾기 및 자동 증가 번호 계산
        const untitlePattern = /^untitle(?:\((\d+)\))?$/;
        const existingNumbers: number[] = [];

        designFiles.forEach(file => {
          const match = file.name.match(untitlePattern);
          if (match) {
            const num = match[1] ? parseInt(match[1], 10) : 0;
            existingNumbers.push(num);
          }
        });

        // 다음 사용 가능한 번호 찾기
        let nextNumber = 0;
        if (existingNumbers.length > 0) {
          existingNumbers.sort((a, b) => a - b);
          nextNumber = existingNumbers[existingNumbers.length - 1] + 1;
        }

        // 디자인명 생성
        const designName = nextNumber === 0 ? 'untitle' : `untitle(${nextNumber})`;
        console.log('📝 생성될 디자인명:', designName, '(기존 untitle 개수:', existingNumbers.length, ')');

        // Firebase에 새 디자인파일 생성
        const result = await createDesignFile({
          name: designName,
          projectId: currentProjectId,
          spaceConfig: defaultSpaceConfig,
          furniture: { placedModules: [] }
        });

        if (result.error) {
          console.error('🎨 [ERROR] 새 디자인 생성 실패:', result.error);
          alert('새 디자인 생성에 실패했습니다: ' + result.error);
          return;
        }

        if (result.id) {
          console.log('🎨 [DEBUG] 새 디자인 생성 성공:', result.id);

          // 상태 업데이트 (프로젝트는 그대로, 디자인만 초기화)
          setSpaceInfo(defaultSpaceConfig);
          setPlacedModules([]);
          setCurrentDesignFileId(result.id);
          setCurrentDesignFileName(designName);

          // derivedSpaceStore 재계산
          derivedSpaceStore.recalculateFromSpaceInfo(defaultSpaceConfig);

          console.log('✅ 새 디자인파일 생성 완료:', result.id);
          alert(`새 디자인 "${designName}"이(가) 생성되었습니다!`);
        }
      } else {
        // 데모 모드에서는 단순히 상태만 초기화
        setSpaceInfo(defaultSpaceConfig);
        setPlacedModules([]);
        derivedSpaceStore.recalculateFromSpaceInfo(defaultSpaceConfig);
        alert('새 디자인이 생성되었습니다!');
      }
    } catch (error) {
      console.error('🎨 [ERROR] 새 디자인 생성 중 오류:', error);
      alert('새 디자인 생성 중 오류가 발생했습니다.');
    }
  };

  // 새 프로젝트 생성 함수
  const handleNewProject = async () => {
    console.log('🆕 [DEBUG] handleNewProject 함수 시작');

    try {
      const confirmed = confirm('현재 작업 내용이 사라집니다. 새 디자인을 시작하시겠습니까?');
      console.log('🆕 [DEBUG] 사용자 확인 응답:', confirmed);

      if (!confirmed) {
        console.log('🆕 [DEBUG] 사용자가 취소함');
        return;
      }

      console.log('🆕 [DEBUG] 새 프로젝트 생성 시작');
      setSaving(true);

      // 기본 공간 설정 (Firebase 호환을 위해 undefined 값 제거)
      const defaultSpaceConfig = {
        width: 3600,
        height: 2400,
        depth: 1500,
        installationType: 'builtin' as const,
        hasFloorFinish: false,
        surroundType: 'three-sided' as const,
        frameSize: { top: 50, bottom: 50, left: 50, right: 50 },
        baseConfig: { type: 'floor' as const, height: 65 },
        materialConfig: { interiorColor: '#FFFFFF', doorColor: '#FFFFFF' },
        columns: []
      };

      console.log('🆕 [DEBUG] 기본 설정 준비됨:', defaultSpaceConfig);

      // 썸네일 생성
      let thumbnail;
      try {
        thumbnail = generateDefaultThumbnail(defaultSpaceConfig, 0);
        console.log('🆕 [DEBUG] 썸네일 생성 성공');
      } catch (thumbnailError) {
        console.error('🆕 [DEBUG] 썸네일 생성 실패:', thumbnailError);
        thumbnail = null;
      }

      const firebaseConfigured = isFirebaseConfigured();
      console.log('🆕 [DEBUG] Firebase 설정 확인:', firebaseConfigured);
      console.log('🆕 [DEBUG] 사용자 로그인 상태:', !!user);
      console.log('🆕 [DEBUG] 사용자 정보:', user ? { email: user.email, uid: user.uid } : 'null');

      if (firebaseConfigured && user) {
        console.log('🆕 [DEBUG] Firebase 모드로 진행');

        try {
          const projectData = {
            title: 'Untitled',
            projectData: { title: 'Untitled', location: '' },
            spaceConfig: removeUndefinedValues(defaultSpaceConfig),
            furniture: {
              placedModules: []
            },
            ...(thumbnail && { thumbnail })
          };

          console.log('🆕 [DEBUG] createProject 호출 시작, 정리된 데이터:', projectData);
          const result = await createProject(projectData);
          console.log('🆕 [DEBUG] createProject 결과:', result);

          if (result.error) {
            console.error('🆕 [ERROR] Firebase 프로젝트 생성 실패:', result.error);
            alert('새 프로젝트 생성에 실패했습니다: ' + result.error);
            return;
          }

          if (result.id) {
            console.log('🆕 [DEBUG] Firebase 프로젝트 생성 성공:', result.id);

            // 상태 업데이트
            setBasicInfo({ title: 'Untitled', location: '' });
            setSpaceInfo(defaultSpaceConfig);
            setPlacedModules([]);
            setCurrentProjectId(result.id);

            // derivedSpaceStore 재계산
            derivedSpaceStore.recalculateFromSpaceInfo(defaultSpaceConfig);

            // URL 업데이트
            navigate(`/configurator?projectId=${result.id}`, { replace: true });

            console.log('✅ 새 Firebase 프로젝트 "Untitled" 생성 완료:', result.id);
            alert('새 프로젝트가 생성되었습니다!');
          } else {
            console.error('🆕 [ERROR] projectId가 반환되지 않음');
            alert('프로젝트 ID를 받지 못했습니다. 다시 시도해주세요.');
          }
        } catch (firebaseError) {
          console.error('🆕 [ERROR] Firebase 작업 중 예외:', firebaseError);
          alert('Firebase 연결 중 오류가 발생했습니다: ' + firebaseError.message);
        }
      } else {
        console.log('🆕 [ERROR] Firebase 인증 필요');
        alert('새 프로젝트를 생성하려면 로그인이 필요합니다.');
      }
    } catch (outerError) {
      console.error('🆕 [ERROR] handleNewProject 최상위 예외:', outerError);
      alert('새 프로젝트 생성 중 예상치 못한 오류가 발생했습니다: ' + outerError.message);
    } finally {
      console.log('🆕 [DEBUG] handleNewProject 완료, 저장 상태 해제');
      setSaving(false);
    }
  };

  // 다른이름으로 저장 함수 (디자인 파일로 저장)
  const handleSaveAs = async () => {
    const newTitle = prompt('새 디자인 파일 이름을 입력하세요:', (currentDesignFileName || basicInfo.title) + ' 사본');
    if (newTitle && newTitle.trim()) {
      setSaving(true);
      setSaveStatus('idle');

      try {
        let thumbnail = await captureProjectThumbnail();

        if (!thumbnail) {
          console.log('📸 3D 캔버스 캡처 실패, 기본 썸네일 생성');
          thumbnail = generateDefaultThumbnail(spaceInfo, placedModules.length);
        }

        if (isFirebaseConfigured() && user) {
          // 현재 프로젝트가 없으면 먼저 프로젝트 생성
          let projectIdToUse = currentProjectId;

          if (!projectIdToUse) {
            // 프로젝트가 없으면 새 프로젝트 생성
            const { id: newProjectId, error: projectError } = await createProject({
              title: basicInfo.title || '새 프로젝트'
            });

            if (projectError || !newProjectId) {
              console.error('프로젝트 생성 실패:', projectError);
              setSaveStatus('error');
              alert('프로젝트 생성에 실패했습니다: ' + projectError);
              return;
            }

            projectIdToUse = newProjectId;
            setCurrentProjectId(newProjectId);
          }

          // Firebase에 새 디자인 파일로 저장
          const { createDesignFile } = await import('@/firebase/projects');
          const { id: designFileId, error } = await createDesignFile({
            name: newTitle.trim(),
            projectId: projectIdToUse,
            spaceConfig: removeUndefinedValues(spaceInfo),
            furniture: {
              placedModules: removeUndefinedValues(placedModules)
            },
            thumbnail: thumbnail
          });

          if (error) {
            console.error('디자인 파일 복사 저장 실패:', error);
            setSaveStatus('error');
            alert('다른이름으로 저장에 실패했습니다: ' + error);
            return;
          }

          if (designFileId) {
            setCurrentDesignFileId(designFileId);
            setCurrentDesignFileName(newTitle.trim());
            setBasicInfo({ ...basicInfo, title: newTitle.trim() });
            setSaveStatus('success');

            // URL 업데이트 - 프로젝트ID와 디자인파일ID 모두 포함
            navigate(`/configurator?projectId=${projectIdToUse}&designFileId=${designFileId}`, { replace: true });

            console.log('✅ 디자인 파일 다른이름으로 저장 성공:', newTitle);
            alert(`"${newTitle}" 디자인 파일로 저장되었습니다!`);
          }
        } else {
          console.log('💾 [ERROR] Firebase 인증 필요');
          setSaveStatus('error');
          alert('저장하려면 로그인이 필요합니다.');
        }

        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error('다른이름으로 저장 실패:', error);
        setSaveStatus('error');
        alert('다른이름으로 저장 중 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
    }
  };

  // 프로젝트 이름 변경 함수
  const handleProjectNameChange = async (newName: string) => {
    const oldName = basicInfo.title;

    // 즉시 UI 업데이트
    setBasicInfo({ ...basicInfo, title: newName });

    // 프로젝트가 저장된 상태라면 자동 저장
    if (currentProjectId) {
      setSaving(true);
      try {
        if (isFirebaseConfigured() && user) {
          const { error } = await updateProject(currentProjectId, {
            title: newName,
            projectData: removeUndefinedValues({ ...basicInfo, title: newName }),
            spaceConfig: removeUndefinedValues(spaceInfo),
            furniture: {
              placedModules: removeUndefinedValues(placedModules)
            }
          });

          if (error) {
            console.error('프로젝트 이름 변경 저장 실패:', error);
            // 실패 시 이전 이름으로 복원
            setBasicInfo({ ...basicInfo, title: oldName });
            alert('프로젝트 이름 변경에 실패했습니다: ' + error);
            return;
          }

          console.log('✅ 프로젝트 이름 변경 성공:', newName);
        } else {
          console.log('💾 [ERROR] Firebase 인증 필요');
          // 실패 시 이전 이름으로 복원
          setBasicInfo({ ...basicInfo, title: oldName });
          alert('프로젝트 이름을 변경하려면 로그인이 필요합니다.');
        }
      } catch (error) {
        console.error('프로젝트 이름 변경 실패:', error);
        // 실패 시 이전 이름으로 복원
        setBasicInfo({ ...basicInfo, title: oldName });
        alert('프로젝트 이름 변경 중 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
    }
  };

  // 디자인 파일명 변경 핸들러
  const handleDesignFileNameChange = async (newName: string) => {
    console.log('📝 디자인파일명 변경 시작:', {
      oldName: currentDesignFileName,
      newName,
      currentDesignFileId
    });

    const oldName = currentDesignFileName;

    // 즉시 UI 업데이트
    setCurrentDesignFileName(newName);
    console.log('✅ currentDesignFileName 상태 업데이트:', newName);

    // URL 파라미터도 업데이트
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('designFileName', encodeURIComponent(newName));
    const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
    window.history.replaceState({}, '', newUrl);
    console.log('🔗 디자인파일명 변경 후 URL 업데이트:', newUrl);

    // 디자인 파일이 저장된 상태라면 자동 저장
    if (currentDesignFileId) {
      setSaving(true);
      try {
        if (isFirebaseConfigured() && user) {
          const { updateDesignFile } = await import('@/firebase/projects');
          const { error } = await updateDesignFile(currentDesignFileId, {
            name: newName,
            projectData: removeUndefinedValues(basicInfo),
            spaceConfig: removeUndefinedValues(spaceInfo),
            furniture: {
              placedModules: removeUndefinedValues(placedModules)
            }
          });

          if (error) {
            console.error('디자인 파일명 변경 저장 실패:', error);
            // 실패 시 이전 이름으로 복원
            setCurrentDesignFileName(oldName);
            const prevParams = new URLSearchParams(window.location.search);
            prevParams.set('designFileName', encodeURIComponent(oldName));
            window.history.replaceState({}, '', `${window.location.pathname}?${prevParams.toString()}`);
            alert('디자인 파일명 변경에 실패했습니다: ' + error);
            return;
          }

          console.log('✅ 디자인 파일명 변경 성공:', newName);

          // BroadcastChannel로 대시보드에 알림 (readonly 모드에서는 전송하지 않음)
          if (!isReadOnly) {
            try {
              // URL에서 projectId 가져오기 (currentProjectId가 없을 수 있음)
              const urlProjectId = searchParams.get('projectId') || searchParams.get('id') || searchParams.get('project');
              const effectiveProjectId = currentProjectId || urlProjectId;
              const effectiveDesignFileId = currentDesignFileId || searchParams.get('designFileId');

              const channel = new BroadcastChannel('project-updates');
              channel.postMessage({
                type: 'DESIGN_FILE_UPDATED',
                projectId: effectiveProjectId,
                designFileId: effectiveDesignFileId,
                timestamp: Date.now()
              });
              console.log('📡 디자인 파일명 변경 알림 전송:', {
                projectId: effectiveProjectId,
                designFileId: effectiveDesignFileId
              });
              channel.close();
            } catch (broadcastError) {
              console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
            }
          }
        } else {
          console.log('💾 [ERROR] Firebase 인증 필요');
          // 실패 시 이전 이름으로 복원
          setCurrentDesignFileName(oldName);
          const prevParams = new URLSearchParams(window.location.search);
          prevParams.set('designFileName', encodeURIComponent(oldName));
          window.history.replaceState({}, '', `${window.location.pathname}?${prevParams.toString()}`);
          alert('디자인 파일명을 변경하려면 로그인이 필요합니다.');
        }
      } catch (error) {
        console.error('디자인 파일명 변경 실패:', error);
        // 실패 시 이전 이름으로 복원
        setCurrentDesignFileName(oldName);
        const prevParams = new URLSearchParams(window.location.search);
        prevParams.set('designFileName', encodeURIComponent(oldName));
        window.history.replaceState({}, '', `${window.location.pathname}?${prevParams.toString()}`);
        alert('디자인 파일명 변경 중 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
    }
  };

  // URL에서 디자인파일명 읽기 (별도 useEffect로 분리)
  useEffect(() => {
    const designFileName = searchParams.get('designFileName') || searchParams.get('fileName');

    console.log('🔍 URL에서 가져온 designFileName:', designFileName);
    console.log('🔍 현재 currentDesignFileName:', currentDesignFileName);

    // URL에 designFileName이 있으면 설정
    if (designFileName) {
      const decodedFileName = decodeURIComponent(designFileName);
      setCurrentDesignFileName(decodedFileName);
      console.log('📝 URL 파라미터로 디자인파일명 설정:', decodedFileName);
    }
    // currentDesignFileName이 이미 있으면 유지 (덮어쓰지 않음)
    else if (!currentDesignFileName) {
      setCurrentDesignFileName('새 디자인');
      console.log('📝 기본값으로 디자인파일명 설정: 새 디자인');
    }
  }, [searchParams]);

  // 단내림 상태 변경 감지 및 컬럼 수 리셋
  useEffect(() => {
    // 이전 상태를 추적하기 위한 ref가 필요하지만, 여기서는 단순히 비활성화될 때 처리
    if (!spaceInfo.droppedCeiling?.enabled && spaceInfo.customColumnCount) {
      const internalSpace = calculateInternalSpace(spaceInfo);
      const defaultColumnCount = SpaceCalculator.getDefaultColumnCount(internalSpace.width);

      console.log('🔧 [Configurator] Dropped ceiling disabled, checking column count:', {
        currentColumnCount: spaceInfo.customColumnCount,
        defaultColumnCount,
        internalWidth: internalSpace.width
      });

      // 현재 컬럼 수가 기본값과 다르면 리셋
      if (spaceInfo.customColumnCount !== defaultColumnCount) {
        console.log('🔧 [Configurator] Resetting column count to default:', defaultColumnCount);
        setSpaceInfo({
          customColumnCount: defaultColumnCount,
          mainDoorCount: undefined,
          droppedCeilingDoorCount: undefined
        });
      }
    }
  }, [spaceInfo.droppedCeiling?.enabled]);

  // URL에서 프로젝트 ID 읽기 및 로드
  // searchParams에서 필요한 값들을 미리 추출 (의존성 배열에서 객체 비교 문제 방지)
  // projectIdParam은 이미 위에서 선언됨
  const designFileIdParam = searchParams.get('designFileId');
  const urlDesignFileNameParam = searchParams.get('designFileName') || searchParams.get('fileName');
  // modeParam은 이미 위에서 선언됨
  const skipLoadParam = searchParams.get('skipLoad') === 'true';
  const isNewDesignParam = searchParams.get('design') === 'new';

  useEffect(() => {
    const projectId = projectIdParam;
    const designFileId = designFileIdParam;
    const urlDesignFileName = urlDesignFileNameParam;
    const mode = modeParam;
    const skipLoad = skipLoadParam;
    const isNewDesign = isNewDesignParam;

    // readonly 모드에서 이미 로드됐으면 재실행 방지 (무한 루프 방지)
    if (mode === 'readonly' && hasLoadedInReadonlyRef.current) {
      console.log('✅ readonly 모드 - 이미 로드 완료, useEffect 재실행 건너뜀 (무한 루프 방지)');
      return;
    }

    // 읽기 전용 모드는 useMemo로 계산됨 (상태 업데이트 제거로 리로드 루프 방지)
    if (mode === 'readonly') {
      console.log('👁️ 읽기 전용 모드 활성화 (useMemo로 처리됨)');
    }

    console.log('🔍 useEffect 실행:', {
      urlProjectId: projectId,
      urlDesignFileId: designFileId,
      urlDesignFileName,
      mode,
      isReadOnly: mode === 'readonly',
      currentProjectId,
      currentDesignFileId,
      placedModulesCount: placedModules.length
    });

    // URL에 designFileName이 있으면 즉시 설정 (최우선순위)
    if (urlDesignFileName) {
      const decodedFileName = decodeURIComponent(urlDesignFileName);
      console.log('🔗 URL에서 디자인파일명 바로 설정:', decodedFileName);
      setCurrentDesignFileName(decodedFileName);
    }

    // CNC에서 돌아오는 경우 - 이미 데이터가 로드되어 있으면 재로드하지 않음
    // 상태 업데이트 전에 먼저 체크해야 함!
    const isSameProject = projectId && projectId === currentProjectId;
    const isSameDesignFile = designFileId && designFileId === currentDesignFileId;
    const hasLoadedData = placedModules.length > 0 || spaceInfo.width > 0;

    if (isSameProject && isSameDesignFile && hasLoadedData && !skipLoad && mode !== 'new-design') {
      console.log('✅ 이미 로드된 프로젝트 - 재로드하지 않음 (CNC에서 복귀)');

      // ID만 동기화
      if (projectId !== currentProjectId) setCurrentProjectId(projectId);
      if (designFileId !== currentDesignFileId) setCurrentDesignFileId(designFileId);

      setLoading(false);
      return;
    }

    // readonly 모드에서는 상태 업데이트를 하지 않음 (리로드 루프 방지)
    if (mode !== 'readonly') {
      // 프로젝트 ID가 변경된 경우에만 상태 업데이트
      if (projectId && projectId !== currentProjectId) {
        setCurrentProjectId(projectId);
        console.log('📝 프로젝트 ID 업데이트:', projectId);
      }

      // designFileId가 변경된 경우에만 상태 업데이트
      if (designFileId && designFileId !== currentDesignFileId) {
        setCurrentDesignFileId(designFileId);
        console.log('📝 디자인파일 ID 업데이트:', designFileId);
      }
    } else {
      console.log('👁️ readonly 모드 - ID 상태 업데이트 건너뜀 (리로드 루프 방지)');
    }

    if (projectId) {
      if (skipLoad || isNewDesign) {
        // Step 1-3에서 넘어온 경우 또는 새 디자인 생성 - 이미 스토어에 데이터가 설정되어 있음
        console.log('✅ skipLoad=true 또는 design=new - Step 1-3에서 설정한 데이터 유지');
        console.log('🔍 현재 spaceInfo:', spaceInfo);
        console.log('🔍 현재 basicInfo:', basicInfo);
        console.log('🔍 현재 designFileId:', designFileId);

        // 로딩 완료 처리
        setTimeout(() => {
          setLoading(false);
        }, 500); // 로딩 화면이 보이도록 약간의 지연
      } else if (mode === 'new-design') {
        // 기존 프로젝트에 새 디자인 생성하는 경우 - 프로젝트명만 가져오기
        console.log('🎨 기존 프로젝트에 새 디자인 생성:', projectId);

        // 프로젝트명만 가져와서 헤더에 표시하기 위해
        getProject(projectId).then(({ project, error }) => {
          if (project && !error) {
            console.log('🔍 setBasicInfo 호출 전 basicInfo:', basicInfo);
            console.log('🔍 설정할 프로젝트명:', project.title);

            setBasicInfo({ title: project.title });
            console.log('📝 프로젝트명 설정:', project.title);

            // 읽기 전용 모드에서는 URL 변경 금지
            if (mode !== 'readonly') {
              // URL에 프로젝트명이 없으면 추가 (새로고침 시 유지하기 위해)
              const currentParams = new URLSearchParams(window.location.search);
              if (!currentParams.get('projectName')) {
                currentParams.set('projectName', encodeURIComponent(project.title));
                const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                window.history.replaceState({}, '', newUrl);
                console.log('🔗 URL에 프로젝트명 추가:', newUrl);
              }
            } else {
              console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
            }
          }
          setLoading(false);
        });
      } else if (designFileId && !skipLoad) {
        // readonly 모드에서 이미 로드된 디자인이면 재로드하지 않음 (2중 렌더링 방지)
        const isAlreadyLoaded = designFileId === currentDesignFileId && (placedModules.length > 0 || spaceInfo.width > 0);
        if (isAlreadyLoaded && mode === 'readonly') {
          console.log('✅ readonly 모드 - 이미 로드된 디자인 재사용 (2중 렌더링 방지):', designFileId);
          setLoading(false);
          return;
        }

        // designFileId가 있는 경우 디자인 파일 데이터 로드
        const isReadOnlyMode = mode === 'readonly';
        console.log('📂 디자인파일 데이터 로드 시작:', {
          designFileId,
          projectId,
          isReadOnlyMode,
          currentDesignFileId,
          currentProjectId
        });

        // readonly 모드에서는 항상 Public API 사용 (권한 체크 없이 접근)
        import('@/firebase/projects').then(({ getDesignFileByIdPublic, getProjectByIdPublic }) => {
          console.log('🔥 getDesignFileByIdPublic 호출 (readonly 모드):', designFileId);
          getDesignFileByIdPublic(designFileId).then(async ({ designFile, error }) => {
            // readonly 모드에서는 데이터 로드 전에 ref 먼저 설정 (setState 리렌더링 차단)
            if (mode === 'readonly') {
              hasLoadedInReadonlyRef.current = true;
              console.log('✅ readonly 모드 - ref 먼저 설정 (setState 리렌더링 차단)');
            }

            if (designFile && !error) {
              console.log('✅ 디자인파일 로드 성공:', {
                id: designFile.id,
                name: designFile.name,
                projectId: designFile.projectId,
                furnitureCount: designFile.furniture?.placedModules?.length || 0,
                spaceConfig: !!designFile.spaceConfig
              });

              // 프로젝트 기본 정보 설정 - projectId로 프로젝트 정보 가져오기
              if (designFile.projectId) {
                const { project, error: projectError } = await getProjectByIdPublic(designFile.projectId);
                if (project && !projectError) {
                  setBasicInfo({ title: project.title });
                  console.log('📝 프로젝트 데이터 설정:', project.title);

                  // 프로젝트 소유자 정보 설정
                  if (project.userId) {
                    console.log('👤 [디자인파일] 프로젝트 소유자 정보:', {
                      projectUserId: project.userId,
                      currentUserId: user?.uid,
                      isOwner: user && project.userId === user.uid,
                      userName: project.userName,
                      userEmail: project.userEmail,
                      userPhotoURL: project.userPhotoURL,
                      currentUserPhotoURL: user?.photoURL
                    });

                    // 프로젝트 소유자가 현재 로그인한 사용자인 경우, 현재 사용자 정보 사용
                    if (user && project.userId === user.uid) {
                      const ownerData = {
                        userId: user.uid,
                        name: user.displayName || user.email || '소유자',
                        photoURL: user.photoURL || undefined
                      };
                      console.log('👑 [디자인파일] 소유자 정보 설정 (현재 사용자):', ownerData);
                      setProjectOwner(ownerData);
                    } else {
                      // 다른 사용자의 프로젝트인 경우 저장된 정보 사용
                      const ownerData = {
                        userId: project.userId,
                        name: project.userName || project.userEmail || '소유자',
                        photoURL: project.userPhotoURL
                      };
                      console.log('👑 [디자인파일] 소유자 정보 설정 (저장된 정보):', ownerData);
                      setProjectOwner(ownerData);
                    }
                  }

                  // 읽기 전용 모드에서는 URL 변경 금지
                  if (mode !== 'readonly') {
                    // URL에 프로젝트명이 없으면 추가 (새로고침 시 유지하기 위해)
                    const currentParams = new URLSearchParams(window.location.search);
                    if (!currentParams.get('projectName')) {
                      currentParams.set('projectName', encodeURIComponent(project.title));
                      const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                      window.history.replaceState({}, '', newUrl);
                      console.log('🔗 URL에 프로젝트명 추가:', newUrl);
                    }
                  } else {
                    console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
                  }
                }
              }

              // 공간 설정
              if (designFile.spaceConfig) {
                // mainDoorCount와 customColumnCount를 undefined로 초기화하여 자동 계산 활성화
                const spaceConfig = {
                  ...designFile.spaceConfig,
                  mainDoorCount: undefined,
                  droppedCeilingDoorCount: undefined,
                  customColumnCount: undefined
                };
                setSpaceInfo(spaceConfig);
                console.log('📐 공간 설정 데이터 설정 (컬럼 관련 값 초기화):', spaceConfig);
              }

              // 가구 배치 데이터 설정
              if (designFile.furniture?.placedModules && designFile.furniture.placedModules.length > 0) {
                // 상하부장 필터링 확인
                const upperCabinets = designFile.furniture.placedModules.filter(m =>
                  m.moduleId?.includes('upper-cabinet')
                );
                const lowerCabinets = designFile.furniture.placedModules.filter(m =>
                  m.moduleId?.includes('lower-cabinet')
                );

                console.log('🗄️ [Configurator] 불러온 상하부장 데이터:', {
                  totalModules: designFile.furniture.placedModules.length,
                  upperCabinets: upperCabinets.length,
                  lowerCabinets: lowerCabinets.length,
                  upperDetails: upperCabinets.map(m => ({
                    id: m.id,
                    moduleId: m.moduleId,
                    slotIndex: m.slotIndex
                  })),
                  lowerDetails: lowerCabinets.map(m => ({
                    id: m.id,
                    moduleId: m.moduleId,
                    slotIndex: m.slotIndex
                  }))
                });

                // baseModuleType이 없는 경우 추가
                const modulesWithBaseType = designFile.furniture.placedModules.map(m => ({
                  ...m,
                  baseModuleType: m.baseModuleType || m.moduleId.replace(/-[\d.]+$/, '')
                }));

                setPlacedModules(modulesWithBaseType);
                console.log('🪑 가구 배치 데이터 설정:', {
                  count: modulesWithBaseType.length,
                  modules: modulesWithBaseType.map(m => ({
                    id: m.id,
                    moduleId: m.moduleId,
                    baseModuleType: m.baseModuleType,
                    slotIndex: m.slotIndex,
                    zone: m.zone,
                    position: m.position
                  }))
                });
              } else {
                // 가구 데이터가 없는 경우 빈 배열로 초기화
                setPlacedModules([]);
                console.log('🪑 가구 배치 데이터 초기화 (빈 디자인)');
              }

              // 디자인파일 이름 설정
              console.log('🔍 디자인파일 이름 체크:', {
                hasName: !!designFile.name,
                name: designFile.name,
                designFileKeys: Object.keys(designFile),
                fullDesignFile: designFile
              });

              if (designFile.name) {
                setCurrentDesignFileName(designFile.name);
                console.log('📝 디자인파일명 설정:', designFile.name);

                // 읽기 전용 모드에서는 URL 변경 금지 (무한 루프 방지)
                if (mode !== 'readonly') {
                  // URL에 디자인파일명이 없으면 추가 (새로고침 시 유지하기 위해)
                  const currentParams = new URLSearchParams(window.location.search);
                  if (!currentParams.get('designFileName')) {
                    currentParams.set('designFileName', encodeURIComponent(designFile.name));
                    const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                    window.history.replaceState({}, '', newUrl);
                    console.log('🔗 URL에 디자인파일명 추가:', newUrl);
                  }
                } else {
                  console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
                }
              } else {
                console.error('❌ 디자인파일에 name 필드가 없습니다!');
              }
            } else {
              console.error('디자인파일 로드 실패:', error);
            }

            setLoading(false);
          });
        });
      } else {
        // 기존 프로젝트 로드
        loadProject(projectId);
      }
    } else {
      // projectId가 없는 경우에도 로딩 해제
      setTimeout(() => {
        setLoading(false);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdParam, designFileIdParam, urlDesignFileNameParam, modeParam, skipLoadParam, isNewDesignParam]);

  // 협업자 정보 가져오기 (현재 디자인 파일 기준으로 필터링)
  useEffect(() => {
    // readonly 모드에서는 협업자 정보 조회 건너뛰기
    if (isReadOnly) {
      console.log('👁️ readonly 모드 - 협업자 정보 조회 건너뜀');
      return;
    }

    if (currentProjectId && currentDesignFileId) {
      console.log('🔍 협업자 정보 조회 시작:', { projectId: currentProjectId, designFileId: currentDesignFileId });
      getProjectCollaborators(currentProjectId)
        .then((collabs) => {
          // 현재 디자인 파일에 접근 권한이 있는 협업자만 필터링
          const filteredCollabs = collabs.filter(collab =>
            collab.designFileIds && collab.designFileIds.includes(currentDesignFileId)
          );
          console.log('✅ 협업자 정보 조회 성공:', {
            전체: collabs.length,
            현재파일: filteredCollabs.length,
            협업자: filteredCollabs
          });
          setCollaborators(filteredCollabs);
        })
        .catch((error) => {
          console.error('❌ 협업자 정보 조회 실패:', error);
        });
    } else if (currentProjectId && !currentDesignFileId) {
      // 디자인 파일이 없는 경우 (Step0 등) 협업자 초기화
      setCollaborators([]);
    }
  }, [currentProjectId, currentDesignFileId, isReadOnly]);

  // 폴더에서 실제 디자인파일명 찾기 (URL에 designFileId나 designFileName이 없을 때만)
  useEffect(() => {
    const loadActualDesignFileName = async () => {
      // URL 파라미터 확인
      const urlDesignFileName = searchParams.get('designFileName') || searchParams.get('fileName');
      const urlDesignFileId = searchParams.get('designFileId');

      // URL에 디자인파일 정보가 있으면 폴더 lookup 완전히 skip
      if (urlDesignFileName || urlDesignFileId) {
        console.log('⏭️ URL에 디자인파일 정보가 있어서 폴더 lookup skip:', {
          urlDesignFileName,
          urlDesignFileId
        });
        return;
      }

      if (!currentProjectId || !user) return;

      // 이미 디자인파일명이 설정되어 있으면 폴더에서 찾지 않음
      if (currentDesignFileName && currentDesignFileName !== '새로운 디자인') {
        console.log('📝 디자인파일명이 이미 설정되어 있음:', currentDesignFileName);
        return;
      }

      try {
        // 폴더 데이터 로드
        const { loadFolderData } = await import('@/firebase/projects');
        const folderResult = await loadFolderData(currentProjectId);

        if (folderResult.folders && folderResult.folders.length > 0) {
          // 폴더에서 첫 번째 디자인파일 찾기
          for (const folder of folderResult.folders) {
            if (folder.children && folder.children.length > 0) {
              const firstDesignFile = folder.children[0];
              if (firstDesignFile && firstDesignFile.name) {
                console.log('📝 폴더에서 찾은 디자인파일명:', firstDesignFile.name);
                setCurrentDesignFileName(firstDesignFile.name);
                return;
              }
            }
          }
        }

        // 폴더에 디자인파일이 없으면 '새로운 디자인' 유지

      } catch (error) {
        console.error('폴더 데이터 로드 실패:', error);
      }
    };

    loadActualDesignFileName();
  }, [currentProjectId, user, searchParams, currentDesignFileName]);

  // 공간 변경 시 가구 재배치 로직 복구
  useEffect(() => {
    // spaceInfo가 변경되었을 때만 실행
    if (JSON.stringify(previousSpaceInfo) !== JSON.stringify(spaceInfo)) {
      // materialConfig만 변경된 경우는 가구 재배치를 하지 않음
      const prevWithoutMaterial = { ...previousSpaceInfo };
      const currentWithoutMaterial = { ...spaceInfo };
      delete prevWithoutMaterial.materialConfig;
      delete currentWithoutMaterial.materialConfig;

      // 공간의 실제 구조가 변경된 경우에만 가구 업데이트
      // (너비, 높이, 깊이, 컬럼 수, 단내림 설정 등)
      const hasStructuralChange =
        prevWithoutMaterial.width !== currentWithoutMaterial.width ||
        prevWithoutMaterial.height !== currentWithoutMaterial.height ||
        prevWithoutMaterial.depth !== currentWithoutMaterial.depth ||
        prevWithoutMaterial.customColumnCount !== currentWithoutMaterial.customColumnCount ||
        JSON.stringify(prevWithoutMaterial.droppedCeiling) !== JSON.stringify(currentWithoutMaterial.droppedCeiling) ||
        prevWithoutMaterial.mainDoorCount !== currentWithoutMaterial.mainDoorCount ||
        prevWithoutMaterial.droppedCeilingDoorCount !== currentWithoutMaterial.droppedCeilingDoorCount ||
        JSON.stringify(prevWithoutMaterial.frameSize) !== JSON.stringify(currentWithoutMaterial.frameSize) ||
        JSON.stringify(prevWithoutMaterial.gapConfig) !== JSON.stringify(currentWithoutMaterial.gapConfig) ||
        JSON.stringify(prevWithoutMaterial.baseConfig) !== JSON.stringify(currentWithoutMaterial.baseConfig) ||
        prevWithoutMaterial.surroundType !== currentWithoutMaterial.surroundType ||
        prevWithoutMaterial.installType !== currentWithoutMaterial.installType ||
        JSON.stringify(prevWithoutMaterial.wallConfig) !== JSON.stringify(currentWithoutMaterial.wallConfig) ||
        prevWithoutMaterial.hasFloorFinish !== currentWithoutMaterial.hasFloorFinish ||
        JSON.stringify(prevWithoutMaterial.floorFinish) !== JSON.stringify(currentWithoutMaterial.floorFinish);

      if (hasStructuralChange) {
        console.log('🔄 공간 구조가 변경되었습니다. 가구 재배치 실행 중...', {
          width: prevWithoutMaterial.width !== currentWithoutMaterial.width,
          height: prevWithoutMaterial.height !== currentWithoutMaterial.height,
          depth: prevWithoutMaterial.depth !== currentWithoutMaterial.depth,
          customColumnCount: prevWithoutMaterial.customColumnCount !== currentWithoutMaterial.customColumnCount,
          droppedCeiling: JSON.stringify(prevWithoutMaterial.droppedCeiling) !== JSON.stringify(currentWithoutMaterial.droppedCeiling),
          mainDoorCount: prevWithoutMaterial.mainDoorCount !== currentWithoutMaterial.mainDoorCount,
          droppedCeilingDoorCount: prevWithoutMaterial.droppedCeilingDoorCount !== currentWithoutMaterial.droppedCeilingDoorCount,
          prevDroppedCeiling: prevWithoutMaterial.droppedCeiling,
          currentDroppedCeiling: currentWithoutMaterial.droppedCeiling
        });
        updateFurnitureForNewSpace(previousSpaceInfo, spaceInfo);
      }

      // 이전 상태 업데이트
      setPreviousSpaceInfo(spaceInfo);
    }
  }, [spaceInfo, previousSpaceInfo, updateFurnitureForNewSpace]);

  // derivedSpaceStore 재계산 (구조적 변경 시만 실행)
  useEffect(() => {
    console.log('🔄 derivedSpaceStore 재계산:', {
      customColumnCount: spaceInfo.customColumnCount,
      mainDoorCount: spaceInfo.mainDoorCount,
      width: spaceInfo.width
    });
    derivedSpaceStore.recalculateFromSpaceInfo(spaceInfo);
  }, [
    spaceInfo.width,
    spaceInfo.height,
    spaceInfo.depth,
    spaceInfo.customColumnCount,
    spaceInfo.mainDoorCount,
    spaceInfo.droppedCeilingDoorCount,
    spaceInfo.droppedCeiling?.enabled,
    spaceInfo.droppedCeiling?.width,
    spaceInfo.surroundType,
    spaceInfo.installType,
    spaceInfo.frameSize?.left,
    spaceInfo.frameSize?.right,
    spaceInfo.gapConfig?.left,
    spaceInfo.gapConfig?.right
  ]);

  // RightPanel에서 사용할 수 있도록 window 객체에 추가
  useEffect(() => {
    (window as any).handleSpaceInfoUpdate = handleSpaceInfoUpdate;

    return () => {
      delete (window as any).handleSpaceInfoUpdate;
    };
  }, []);



  // 사이드바 탭 클릭 핸들러
  const handleSidebarTabClick = (tab: SidebarTab) => {
    if (activeSidebarTab === tab) {
      setActiveSidebarTab(null); // 같은 탭 클릭 시 닫기
    } else {
      setActiveSidebarTab(tab);
    }
  };

  // 공간 설정 업데이트 핸들러
  const handleSpaceInfoUpdate = (updates: Partial<typeof spaceInfo>) => {
    console.log('🔧 handleSpaceInfoUpdate called with:', updates);
    console.log('🔧 Current spaceInfo.wallConfig:', spaceInfo.wallConfig);

    // baseConfig.depth 업데이트 감지
    if (updates.baseConfig?.depth !== undefined) {
      console.log('📏 Configurator - baseConfig.depth 업데이트:', {
        이전값: spaceInfo.baseConfig?.depth,
        새값: updates.baseConfig.depth,
        전체baseConfig: updates.baseConfig
      });
    }

    // mainDoorCount 업데이트 감지
    if (updates.mainDoorCount !== undefined) {
      console.log('🚪 mainDoorCount 업데이트:', {
        이전값: spaceInfo.mainDoorCount,
        새값: updates.mainDoorCount,
        단내림활성화: spaceInfo.droppedCeiling?.enabled
      });
    }

    // 단내림 설정 변경 감지
    const isDroppedCeilingUpdate = updates.droppedCeiling !== undefined;
    if (isDroppedCeilingUpdate) {
      console.log('🔄 단내림 설정 변경 감지:', updates.droppedCeiling);
    }

    // surroundType 업데이트 시 디버깅
    if (updates.surroundType) {
      console.log('🔧 Configurator - surroundType update:', {
        previous: spaceInfo.surroundType,
        new: updates.surroundType,
        willUpdateStore: true
      });
    }

    let finalUpdates = { ...updates };

    // installType 하이픈 문제 수정
    if (finalUpdates.installType === 'built-in') {
      finalUpdates.installType = 'builtin';
    }

    // 서라운드 타입 변경 시 프레임 설정 초기화
    if (updates.surroundType) {
      const currentInstallType = finalUpdates.installType || spaceInfo.installType;
      const currentWallConfig = finalUpdates.wallConfig || spaceInfo.wallConfig;
      const newFrameSize = { ...spaceInfo.frameSize, top: spaceInfo.frameSize?.top || 10 };

      if (updates.surroundType === 'surround') {
        // 서라운드 모드
        switch (currentInstallType) {
          case 'builtin':
            newFrameSize.left = 50;
            newFrameSize.right = 50;
            break;
          case 'semistanding':
            if (currentWallConfig.left && !currentWallConfig.right) {
              newFrameSize.left = 50;
              newFrameSize.right = 18;
            } else if (!currentWallConfig.left && currentWallConfig.right) {
              newFrameSize.left = 18;
              newFrameSize.right = 50;
            }
            break;
          case 'freestanding':
            newFrameSize.left = 18;
            newFrameSize.right = 18;
            break;
        }
      } else if (updates.surroundType === 'no-surround') {
        // 노서라운드 모드
        switch (currentInstallType) {
          case 'builtin':
            // 빌트인: 좌우 프레임 없음
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
          case 'semistanding':
            // 세미스탠딩: 벽 없는 쪽만 엔드패널
            if (currentWallConfig.left && !currentWallConfig.right) {
              newFrameSize.left = 0;
              newFrameSize.right = 18;
            } else if (!currentWallConfig.left && currentWallConfig.right) {
              newFrameSize.left = 18;
              newFrameSize.right = 0;
            }
            break;
          case 'freestanding':
            // 프리스탠딩: 양쪽 엔드패널
            newFrameSize.left = 18;
            newFrameSize.right = 18;
            break;
        }

        // 노서라운드일 때 gapConfig 설정
        finalUpdates.gapConfig = {
          left: currentWallConfig.left ? 2 : 0,
          right: currentWallConfig.right ? 2 : 0
        };
      }

      finalUpdates.frameSize = newFrameSize;
      console.log('🔧 서라운드 타입 변경에 따른 프레임 초기화:', {
        surroundType: updates.surroundType,
        installType: currentInstallType,
        frameSize: newFrameSize,
        gapConfig: finalUpdates.gapConfig
      });
    }

    // 세미스탠딩에서 벽 위치 변경 시 프레임 설정 자동 업데이트
    if (updates.wallConfig && spaceInfo.installType === 'semistanding' && (spaceInfo.surroundType === 'surround')) {
      const newFrameSize = { ...spaceInfo.frameSize };

      if (updates.wallConfig.left && !updates.wallConfig.right) {
        // 좌측벽만 있음: 좌측 프레임 50mm, 우측 엔드패널 18mm
        newFrameSize.left = 50;
        newFrameSize.right = 18;
      } else if (!updates.wallConfig.left && updates.wallConfig.right) {
        // 우측벽만 있음: 좌측 엔드패널 18mm, 우측 프레임 50mm
        newFrameSize.left = 18;
        newFrameSize.right = 50;
      }

      finalUpdates.frameSize = newFrameSize;
      console.log('🔧 세미스탠딩 프레임 자동 업데이트:', newFrameSize);
    }

    // 설치 타입 변경 시 wallConfig와 프레임 설정 자동 업데이트
    if (updates.installType) {
      // wallConfig가 함께 전달되었으면 그대로 사용, 아니면 자동 설정
      if (updates.wallConfig) {
        console.log('🔧 InstallTypeControls에서 전달된 wallConfig 사용:', updates.wallConfig);
        finalUpdates.wallConfig = updates.wallConfig;
      } else {
        // wallConfig 자동 설정
        switch (updates.installType) {
          case 'builtin':
            finalUpdates.wallConfig = { left: true, right: true };
            break;
          case 'semistanding':
            // 세미스탠딩은 기본값 좌측벽만 (사용자가 변경 가능)
            finalUpdates.wallConfig = { left: true, right: false };
            break;
          case 'freestanding':
            finalUpdates.wallConfig = { left: false, right: false };
            break;
        }
        console.log('🔧 자동 설정된 wallConfig:', finalUpdates.wallConfig);
      }

      // 프레임 설정
      const newFrameSize = { ...spaceInfo.frameSize };
      const wallConfig = finalUpdates.wallConfig || spaceInfo.wallConfig;

      if (spaceInfo.surroundType === 'surround') {
        // 서라운드 모드
        switch (updates.installType) {
          case 'builtin':
            // 양쪽벽: 양쪽 모두 프레임 50mm
            newFrameSize.left = 50;
            newFrameSize.right = 50;
            break;
          case 'semistanding':
            // 한쪽벽: 벽 위치에 따라 프레임/엔드패널 설정
            if (wallConfig.left && !wallConfig.right) {
              newFrameSize.left = 50;   // 좌측벽: 프레임
              newFrameSize.right = 18;  // 우측: 엔드패널
            } else if (!wallConfig.left && wallConfig.right) {
              newFrameSize.left = 18;   // 좌측: 엔드패널
              newFrameSize.right = 50;  // 우측벽: 프레임
            }
            break;
          case 'freestanding':
            // 벽없음: 양쪽 모두 엔드패널 18mm
            newFrameSize.left = 18;
            newFrameSize.right = 18;
            break;
        }
      } else if (spaceInfo.surroundType === 'no-surround') {
        // 노서라운드 모드
        switch (updates.installType) {
          case 'builtin':
            // 빌트인: 좌우 프레임 없음
            newFrameSize.left = 0;
            newFrameSize.right = 0;
            break;
          case 'semistanding':
            // 세미스탠딩: 벽 없는 쪽만 엔드패널
            if (wallConfig.left && !wallConfig.right) {
              newFrameSize.left = 0;
              newFrameSize.right = 18;
            } else if (!wallConfig.left && wallConfig.right) {
              newFrameSize.left = 18;
              newFrameSize.right = 0;
            }
            break;
          case 'freestanding':
            // 프리스탠딩: 양쪽 엔드패널
            newFrameSize.left = 18;
            newFrameSize.right = 18;
            break;
        }

        // 노서라운드일 때 gapConfig도 업데이트
        finalUpdates.gapConfig = {
          left: wallConfig.left ? 2 : 0,
          right: wallConfig.right ? 2 : 0
        };
      }

      finalUpdates.frameSize = newFrameSize;

      console.log('🔧 설치타입 변경에 따른 wallConfig 및 프레임 자동 업데이트:', {
        installType: updates.installType,
        wallConfig: finalUpdates.wallConfig,
        frameSize: finalUpdates.frameSize
      });
    }

    // 폭(width)이 변경되었을 때 도어 개수 자동 조정
    if (updates.width && updates.width !== spaceInfo.width) {
      const range = calculateDoorRange(updates.width);
      const currentCount = spaceInfo.customColumnCount || getCurrentColumnCount();

      // 400-600mm 범위 엄격 적용
      const usableWidth = updates.width - 100;
      let adjustedCount = currentCount;

      // 현재 카운트로 계산한 슬롯 크기 확인
      const currentSlotWidth = usableWidth / currentCount;

      if (currentSlotWidth < 400) {
        adjustedCount = Math.floor(usableWidth / 400);
      } else if (currentSlotWidth > 600) {
        adjustedCount = Math.ceil(usableWidth / 600);
      }

      // 최종 범위 검증
      const finalCount = Math.max(range.min, Math.min(range.max, adjustedCount));
      finalUpdates = { ...finalUpdates, customColumnCount: finalCount };
    }

    // customColumnCount가 직접 변경되었을 때 - 사용자가 설정한 값 그대로 사용
    if (updates.customColumnCount !== undefined) {
      console.log('🚨🚨🚨 customColumnCount 업데이트:', {
        요청값: updates.customColumnCount,
        현재값: spaceInfo.customColumnCount,
        finalUpdates_before: finalUpdates
      });
      // 사용자가 설정한 값을 그대로 사용
      finalUpdates = { ...finalUpdates, customColumnCount: updates.customColumnCount };
      console.log('🚨🚨🚨 finalUpdates after:', finalUpdates);
    }

    // 단내림이 활성화된 경우 메인 구간의 도어 개수 자동 조정
    if (updates.droppedCeiling?.enabled && !spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 새로 활성화된 경우
      const currentWidth = finalUpdates.width || spaceInfo.width || 4800;
      const droppedWidth = updates.droppedCeiling.width || 900;
      const mainZoneWidth = currentWidth - droppedWidth;
      const frameThickness = 50;
      const normalAreaInternalWidth = mainZoneWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);

      // 현재 도어 개수를 유지하되, 최소 필요 개수 이상으로 조정
      const currentDoorCount = getCurrentColumnCount();
      const adjustedMainDoorCount = Math.max(minRequiredSlots, currentDoorCount);
      console.log(`🔧 단내림 활성화 시 메인 구간 도어 개수 설정: ${currentDoorCount} → ${adjustedMainDoorCount}`);
      finalUpdates = { ...finalUpdates, mainDoorCount: adjustedMainDoorCount };

      // 단내림 구간 도어개수 기본값 설정
      const droppedFrameThickness = 50;
      const droppedInternalWidth = droppedWidth - droppedFrameThickness;
      const droppedMinSlots = Math.max(1, Math.ceil(droppedInternalWidth / MAX_SLOT_WIDTH));
      const droppedMaxSlots = Math.max(droppedMinSlots, Math.floor(droppedInternalWidth / 400));
      const droppedDefaultCount = droppedMinSlots;

      console.log(`🔧 단내림 활성화 시 단내림 구간 도어개수 기본값 설정: ${droppedDefaultCount}`, {
        droppedWidth,
        droppedInternalWidth,
        droppedMinSlots,
        droppedMaxSlots
      });

      finalUpdates = { ...finalUpdates, droppedCeilingDoorCount: droppedDefaultCount };
    }

    // 단내림 폭 변경 시 단내림 도어개수 자동 조정
    if (updates.droppedCeiling?.width && spaceInfo.droppedCeiling?.enabled) {
      const frameThickness = 50;
      const internalWidth = updates.droppedCeiling.width - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const MIN_SLOT_WIDTH = 400;
      const newDoorRange = {
        min: Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH)),
        max: Math.max(1, Math.floor(internalWidth / MIN_SLOT_WIDTH))
      };

      const currentDoorCount = spaceInfo.droppedCeilingDoorCount || 2;
      if (currentDoorCount < newDoorRange.min || currentDoorCount > newDoorRange.max) {
        const adjustedDoorCount = Math.max(newDoorRange.min, Math.min(newDoorRange.max, currentDoorCount));
        console.log(`🔧 단내림 폭 변경 시 도어개수 자동 조정: ${currentDoorCount} → ${adjustedDoorCount}`);
        finalUpdates = { ...finalUpdates, droppedCeilingDoorCount: adjustedDoorCount };
      }
    }

    // 노서라운드 빌트인 모드에서 컬럼 수 변경 시 자동 이격거리 계산
    if (spaceInfo.surroundType === 'no-surround' &&
      (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') &&
      (finalUpdates.customColumnCount !== undefined || finalUpdates.mainDoorCount !== undefined)) {

      const tempSpaceInfo = { ...spaceInfo, ...finalUpdates };
      const indexing = calculateSpaceIndexing(tempSpaceInfo);

      if (indexing.optimizedGapConfig) {
        console.log('📏 컬럼 수 변경 - 자동 이격거리 적용:', {
          customColumnCount: finalUpdates.customColumnCount,
          mainDoorCount: finalUpdates.mainDoorCount,
          optimizedGap: indexing.optimizedGapConfig
        });
        finalUpdates.gapConfig = indexing.optimizedGapConfig;
      }
    }

    console.log('🔧 최종 업데이트 적용:', {
      updates: finalUpdates,
      hasWallConfig: !!finalUpdates.wallConfig,
      wallConfig: finalUpdates.wallConfig,
      customColumnCount: finalUpdates.customColumnCount,
      gapConfig: finalUpdates.gapConfig
    });

    // installType 변경 감지
    const isInstallTypeChanged = finalUpdates.installType !== undefined &&
      finalUpdates.installType !== spaceInfo.installType;

    console.log('🚨🚨🚨 setSpaceInfo 호출 직전:', finalUpdates);
    console.log('📏 baseConfig.depth 전달 확인:', {
      finalUpdates_baseConfig: finalUpdates.baseConfig,
      depth: finalUpdates.baseConfig?.depth
    });
    setSpaceInfo(finalUpdates);
    console.log('🚨🚨🚨 setSpaceInfo 호출 완료');

    // Store 업데이트 직후 확인
    setTimeout(() => {
      const currentStore = useSpaceConfigStore.getState();
      console.log('📏 Store 업데이트 후 확인:', {
        baseConfig: currentStore.baseConfig,
        depth: currentStore.baseConfig?.depth
      });
    }, 0);

    // 단내림 설정 변경 시 강제로 3D 뷰 업데이트
    if (isDroppedCeilingUpdate) {
      console.log('🔄 단내림 설정 변경으로 3D 뷰 강제 업데이트');
      // 강제로 뷰 모드를 다시 설정하여 리렌더링 트리거
      setTimeout(() => {
        setViewMode(viewMode);
      }, 0);
    }

    // installType 변경 시 가구 너비 재계산
    if (isInstallTypeChanged && placedModules.length > 0) {
      console.log('🔧 InstallType 변경 - 가구 너비 재계산');
      // 약간의 지연을 두어 SpaceInfo가 먼저 업데이트되도록 함
      setTimeout(() => {
        const newSpaceInfo = { ...spaceInfo, ...finalUpdates };
        updateFurnitureForNewSpace(spaceInfo, newSpaceInfo);
      }, 100);
    }
  };

  // 도어 설치/제거 핸들러
  const handleDoorInstallation = () => {
    console.log('🚪 도어 설치/제거 핸들러 호출:', {
      hasDoorsInstalled,
      placedModulesCount: placedModules.length,
      doorsOpen
    });

    if (hasDoorsInstalled) {
      // 도어 제거: 모든 가구에서 도어 제거
      console.log('🚪 도어 제거 시도');
      setAllDoors(false);
    } else {
      // 도어 설치: 모든 가구에 도어 설치 (닫힌 상태로 설치)
      console.log('🚪 도어 설치 시도');
      setAllDoors(true);

      // 도어 설치 시 닫힌 상태로 유지
      if (doorsOpen) {
        console.log('🚪 도어가 열려있어서 닫기');
        toggleDoors(); // 문이 열려있으면 닫기
      }
    }
  };

  // 이전/다음 버튼 핸들러
  const handlePrevious = async () => {
    // 저장하지 않은 빈 디자인 파일인지 확인
    const { placedModules } = useFurnitureStore.getState();
    const hasContent = placedModules && placedModules.length > 0;

    // 가구가 없고, 디자인 파일 ID가 있으면 빈 디자인으로 간주
    if (!hasContent && currentDesignFileId && currentProjectId) {
      console.log('🗑️ 빈 디자인 파일 삭제:', currentDesignFileId);
      try {
        const { deleteDesignFile } = await import('@/firebase/projects');
        await deleteDesignFile(currentDesignFileId, currentProjectId);
        console.log('✅ 빈 디자인 파일 삭제 완료');
      } catch (error) {
        console.error('❌ 빈 디자인 파일 삭제 실패:', error);
      }
    }

    navigate('/dashboard?step=2');
  };

  const handleNext = () => {
    // Configurator가 최종 단계이므로 저장 후 대시보드로 이동
    if (window.confirm('현재 프로젝트를 저장하고 대시보드로 돌아가시겠습니까?')) {
      saveProject().then(() => {
        navigate('/dashboard');
      });
    }
  };

  const handleHelp = () => {
    window.open('/help', '_blank');
  };

  const handleConvert = () => {
    console.log('도면 편집기 열기');
    setShowPDFPreview(true);
  };

  const handleLogout = () => {
    // 읽기 전용 모드에서는 로그아웃 불가
    if (isReadOnly) {
      console.log('👁️ 읽기 전용 모드 - 로그아웃 차단');
      return;
    }
    navigate('/login');
  };

  const handleProfile = () => {
    console.log('프로필');
  };

  // FileTree 토글 핸들러
  const handleFileTreeToggle = () => {
    setIsFileTreeOpen(!isFileTreeOpen);
  };

  // GLB 내보내기 핸들러
  const handleExportGLB = async () => {
    console.log('🔧 GLB 내보내기 시작...');

    if (!sceneRef.current) {
      alert('3D 씬이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      console.error('❌ scene ref가 없습니다');
      return;
    }

    console.log('✅ Scene ref 확인:', {
      scene: sceneRef.current,
      childrenCount: sceneRef.current?.children?.length,
      children: sceneRef.current?.children
    });

    if (!canExportGLB(sceneRef.current)) {
      alert('내보낼 3D 모델이 없습니다.');
      console.error('❌ 내보낼 모델이 없습니다, children:', sceneRef.current.children);
      return;
    }

    // 파일명 생성
    const projectName = basicInfo.title || 'furniture-design';
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${projectName}-${timestamp}.glb`;

    console.log('📦 GLB 파일 생성:', filename);

    const result = await exportToGLB(sceneRef.current, filename);

    if (result.success) {
      alert(`GLB 파일이 다운로드되었습니다: ${filename}`);
      console.log('✅ GLB 내보내기 성공');
    } else {
      alert(`GLB 내보내기 실패: ${result.error}`);
      console.error('❌ GLB 내보내기 실패:', result.error);
    }
  };




  // 사이드바 컨텐츠 렌더링
  const renderSidebarContent = () => {
    if (!activeSidebarTab) return null;

    switch (activeSidebarTab) {
      case 'module':
        return (
          <div className={styles.sidebarPanel}>
            <div className={styles.modulePanelContent}>
              {/* 키큰장/상부장/하부장 토글 탭 */}
              <div className={styles.moduleCategoryTabs}>
                <button
                  className={`${styles.moduleCategoryTab} ${moduleCategory === 'tall' ? styles.active : ''}`}
                  onClick={() => setModuleCategory('tall')}
                >
                  키큰장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${moduleCategory === 'upper' ? styles.active : ''}`}
                  onClick={() => setModuleCategory('upper')}
                >
                  상부장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${moduleCategory === 'lower' ? styles.active : ''}`}
                  onClick={() => setModuleCategory('lower')}
                >
                  하부장
                </button>
              </div>

              <div className={styles.moduleSection}>
                <ModuleGallery
                  moduleCategory={moduleCategory}
                />
              </div>
            </div>
          </div>
        );

      case 'material':
        return (
          <div className={styles.sidebarPanel}>
            <MaterialPanel />
          </div>
        );
      case 'structure':
        return (
          <div className={styles.sidebarPanel}>
            <ColumnControl
              columns={spaceInfo.columns || []}
              onColumnsChange={(columns) => setSpaceInfo({ columns })}
            />
          </div>
        );
      case 'etc':
        return (
          <div className={styles.sidebarPanel}>
            <div className={styles.preparingPanel}>
              <h3>악세서리</h3>
              <p>준비중입니다.</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // 우측 패널 컨텐츠 렌더링
  const renderRightPanelContent = () => {
    return (
      <div className={styles.spaceControls}>
        {/* 공간 설정 - 양쪽 탭에서 모두 표시 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>공간 설정</h3>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ minWidth: '20px', color: 'var(--theme-primary)' }}>W</span>
              <div style={{ flex: 1 }}>
                <WidthControl
                  spaceInfo={spaceInfo}
                  onUpdate={handleSpaceInfoUpdate}
                  disabled={hasSpecialDualFurniture}
                />
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ minWidth: '20px', color: 'var(--theme-primary)' }}>H</span>
              <div style={{ flex: 1 }}>
                <HeightControl
                  spaceInfo={spaceInfo}
                  onUpdate={handleSpaceInfoUpdate}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 공간 유형 - 공간 설정과 단내림 사이 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>공간 유형</h3>
          </div>
          <InstallTypeControls
            spaceInfo={spaceInfo}
            onUpdate={handleSpaceInfoUpdate}
          />
        </div>

        {/* 단내림 설정 - 공간 설정과 레이아웃 사이에 추가 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>단내림</h3>
          </div>

          <div className={styles.toggleButtonGroup}>
            <button
              className={`${styles.toggleButton} ${!spaceInfo.droppedCeiling?.enabled ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                // 단내림 비활성화
                clearAllModules(); // 가구 제거
                handleSpaceInfoUpdate({
                  droppedCeiling: {
                    ...spaceInfo.droppedCeiling,
                    enabled: false
                  },
                  mainDoorCount: undefined,
                  droppedCeilingDoorCount: undefined
                });
                setActiveRightPanelTab('slotA');
              }}
            >
              없음
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.enabled ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                if (!spaceInfo.droppedCeiling?.enabled) {
                  // 단내림 활성화
                  clearAllModules(); // 가구 제거

                  const totalWidth = spaceInfo.width || 4800;
                  const droppedWidth = 900; // 단내림 기본 폭
                  const mainWidth = totalWidth - droppedWidth;
                  const mainRange = calculateDoorRange(mainWidth);
                  const currentCount = getCurrentColumnCount();
                  const adjustedMainDoorCount = Math.max(mainRange.min, Math.min(mainRange.max, currentCount));

                  // 단내림 구간의 내경폭으로 적절한 도어 개수 계산
                  const frameThickness = 50;
                  const droppedInternalWidth = droppedWidth - frameThickness;
                  const droppedDoorCount = SpaceCalculator.getDefaultColumnCount(droppedInternalWidth);

                  handleSpaceInfoUpdate({
                    droppedCeiling: {
                      enabled: true,
                      width: droppedWidth,
                      dropHeight: 200,
                      position: 'right'
                    },
                    droppedCeilingDoorCount: droppedDoorCount, // 계산된 도어 개수로 설정
                    mainDoorCount: adjustedMainDoorCount
                  });
                  setActiveRightPanelTab('slotA');
                }
              }}
            >
              있음
            </button>
          </div>

          {/* 단내림이 활성화된 경우 위치 선택 */}
          {spaceInfo.droppedCeiling?.enabled && (
            <div style={{ marginTop: '16px' }}>
              <div className={styles.inputLabel} style={{ marginBottom: '8px' }}>위치</div>
              <div className={styles.toggleButtonGroup}>
                <button
                  className={`${styles.toggleButton} ${(spaceInfo.droppedCeiling?.position || 'right') === 'left' ? styles.toggleButtonActive : ''}`}
                  onClick={() => {
                    handleSpaceInfoUpdate({
                      droppedCeiling: {
                        ...spaceInfo.droppedCeiling,
                        enabled: true,
                        position: 'left'
                      }
                    });
                  }}
                >
                  좌측
                </button>
                <button
                  className={`${styles.toggleButton} ${(spaceInfo.droppedCeiling?.position || 'right') === 'right' ? styles.toggleButtonActive : ''}`}
                  onClick={() => {
                    handleSpaceInfoUpdate({
                      droppedCeiling: {
                        ...spaceInfo.droppedCeiling,
                        enabled: true,
                        position: 'right'
                      }
                    });
                  }}
                >
                  우측
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 단내림이 있을 때 메인구간 사이즈 표시 */}
        {spaceInfo.droppedCeiling?.enabled && (
          <div className={styles.configSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionDot}></span>
              <h3 className={styles.sectionTitle}>메인구간 사이즈</h3>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              {/* 메인구간 폭 */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ minWidth: '20px', color: 'var(--theme-primary)' }}>W</span>
                <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                  <input
                    type="text"
                    min="100"
                    max={(spaceInfo.width || 4800) - 100}
                    step="10"
                    defaultValue={(spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.width || 900)}
                    key={`main-width-${(spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.width || 900)}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const inputValue = e.target.value;
                      const totalWidth = spaceInfo.width || 4800;
                      const currentDroppedWidth = spaceInfo.droppedCeiling?.width || 900;
                      const currentMainWidth = totalWidth - currentDroppedWidth;

                      // 빈 값이거나 유효하지 않은 경우 현재 값으로 복구
                      if (inputValue === '' || isNaN(parseInt(inputValue))) {
                        e.target.value = currentMainWidth.toString();
                        return;
                      }

                      const mainWidth = parseInt(inputValue);
                      const newDroppedWidth = totalWidth - mainWidth;

                      // 유효한 범위 밖인 경우 가장 가까운 유효값으로 조정
                      if (newDroppedWidth < 100) {
                        e.target.value = (totalWidth - 100).toString();
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: 100
                          }
                        });
                      } else if (newDroppedWidth > totalWidth - 100) {
                        e.target.value = '100';
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: totalWidth - 100
                          }
                        });
                      } else {
                        // 유효한 값이면 그대로 적용
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: newDroppedWidth
                          }
                        });
                      }
                    }}
                    className={`${styles.input} ${styles.inputWithUnitField}`}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>

              {/* 메인구간 높이 */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ minWidth: '20px', color: 'var(--theme-primary)' }}>H</span>
                <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                  <input
                    type="text"
                    defaultValue={spaceInfo.height || 2400}
                    key={`main-height-${spaceInfo.height || 2400}`}
                    onChange={(e) => {
                      // 숫자와 빈 문자열만 허용
                      const value = e.target.value;
                      if (value === '' || /^\d+$/.test(value)) {
                        // 로컴 상태만 업데이트 (입력 중에는 스토어 업데이트 안 함)
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        // 빈 값인 경우 기존 값으로 되돌림
                        e.target.value = (spaceInfo.height || 2400).toString();
                        return;
                      }

                      const numValue = parseInt(value);
                      const minValue = 1800;
                      const maxValue = 3000;

                      // 범위 검증
                      if (numValue < minValue) {
                        e.target.value = minValue.toString();
                        handleSpaceInfoUpdate({ height: minValue });
                      } else if (numValue > maxValue) {
                        e.target.value = maxValue.toString();
                        handleSpaceInfoUpdate({ height: maxValue });
                      } else {
                        handleSpaceInfoUpdate({ height: numValue });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();

                        const currentValue = parseInt(e.target.value) || (spaceInfo.height || 2400);
                        const minValue = 1800;
                        const maxValue = 3000;

                        let newValue;
                        if (e.key === 'ArrowUp') {
                          newValue = Math.min(currentValue + 1, maxValue);
                        } else {
                          newValue = Math.max(currentValue - 1, minValue);
                        }

                        if (newValue !== currentValue) {
                          e.target.value = newValue.toString();
                          handleSpaceInfoUpdate({ height: newValue });
                        }
                      }
                    }}
                    className={`${styles.input} ${styles.inputWithUnitField}`}
                    placeholder="1800-3000"
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 단내림 구간 사이즈 - 메인구간 사이즈 아래에 표시 */}
        {spaceInfo.droppedCeiling?.enabled && (
          <div className={styles.configSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionDot}></span>
              <h3 className={styles.sectionTitle}>단내림 구간 사이즈</h3>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              {/* 단내림 구간 폭 */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ minWidth: '20px', color: 'var(--theme-primary)' }}>W</span>
                <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                  <input
                    type="text"
                    min="100"
                    max={(spaceInfo.width || 4800) - 100}
                    step="10"
                    defaultValue={spaceInfo.droppedCeiling?.width || 900}
                    key={`dropped-width-${spaceInfo.droppedCeiling?.width || 900}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const inputValue = e.target.value;
                      const totalWidth = spaceInfo.width || 4800;
                      const currentDroppedWidth = spaceInfo.droppedCeiling?.width || 900;

                      // 빈 값이거나 유효하지 않은 경우 현재 값으로 복구
                      if (inputValue === '' || isNaN(parseInt(inputValue))) {
                        e.target.value = currentDroppedWidth.toString();
                        return;
                      }

                      const droppedWidth = parseInt(inputValue);
                      const mainWidth = totalWidth - droppedWidth;

                      // 유효한 범위 밖인 경우 가장 가까운 유효값으로 조정
                      if (droppedWidth < 100) {
                        e.target.value = '100';
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: 100
                          }
                        });
                      } else if (droppedWidth > totalWidth - 100) {
                        e.target.value = (totalWidth - 100).toString();
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: totalWidth - 100
                          }
                        });
                      } else {
                        // 유효한 값이면 그대로 적용
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: droppedWidth
                          }
                        });
                      }
                    }}
                    className={`${styles.input} ${styles.inputWithUnitField}`}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>

              {/* 단내림 구간 높이 */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ minWidth: '20px', color: 'var(--theme-primary)' }}>H</span>
                <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                  <input
                    type="text"
                    min="1800"
                    max="2900"
                    step="10"
                    defaultValue={(spaceInfo.height || 2400) - (spaceInfo.droppedCeiling?.dropHeight || 200)}
                    key={`dropped-height-${(spaceInfo.height || 2400) - (spaceInfo.droppedCeiling?.dropHeight || 200)}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const inputValue = e.target.value;
                      const totalHeight = spaceInfo.height || 2400;
                      const currentDroppedHeight = totalHeight - (spaceInfo.droppedCeiling?.dropHeight || 200);

                      // 빈 값이거나 유효하지 않은 경우 현재 값으로 복구
                      if (inputValue === '' || isNaN(parseInt(inputValue))) {
                        e.target.value = currentDroppedHeight.toString();
                        return;
                      }

                      const droppedHeight = parseInt(inputValue);
                      const newDropHeight = totalHeight - droppedHeight;

                      // 유효한 범위 밖인 경우 가장 가까운 유효값으로 조정 (단차 높이는 100~500mm)
                      if (newDropHeight < 100) {
                        const validDroppedHeight = totalHeight - 100;
                        e.target.value = validDroppedHeight.toString();
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            dropHeight: 100
                          }
                        });
                      } else if (newDropHeight > 500) {
                        const validDroppedHeight = totalHeight - 500;
                        e.target.value = validDroppedHeight.toString();
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            dropHeight: 500
                          }
                        });
                      } else {
                        // 유효한 값이면 그대로 적용
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            dropHeight: newDropHeight
                          }
                        });
                      }
                    }}
                    className={`${styles.input} ${styles.inputWithUnitField}`}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* 컬럼수 표시 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>컬럼수</h3>
          </div>
          {console.log('🔍 레이아웃 섹션 렌더링:', {
            activeTab: activeRightPanelTab,
            단내림활성화: spaceInfo.droppedCeiling?.enabled,
            mainDoorCount: spaceInfo.mainDoorCount,
            customColumnCount: spaceInfo.customColumnCount
          })}

          {/* 도어 개수 입력 - 제거 */}
          {!spaceInfo.droppedCeiling?.enabled ? (
            // 단내림이 없을 때 - 컬럼 개수만 표시
            <div className={styles.inputGroup}>
              <DoorSlider
                value={getCurrentColumnCount()}
                onChange={(value) => {
                  handleSpaceInfoUpdate({ customColumnCount: value });
                }}
                width={spaceInfo.width || 4800}
              />
            </div>
          ) : (
            // 단내림이 있을 때 - 도어 개수 입력 숨김
            <div>
              <div className={styles.inputGroup}>
                <DoorSlider
                  value={spaceInfo.mainDoorCount || getCurrentColumnCount()}
                  onChange={(value) => {
                    handleSpaceInfoUpdate({ mainDoorCount: value });
                  }}
                  width={spaceInfo.width || 4800}
                />
              </div>

              {/* 단내림구간 도어 개수 */}
              <div className={styles.inputGroup} style={{ marginTop: '24px' }}>
                <DoorSlider
                  value={spaceInfo.droppedCeilingDoorCount || 1}
                  onChange={(value) => {
                    handleSpaceInfoUpdate({ droppedCeilingDoorCount: value });
                  }}
                  width={spaceInfo.droppedCeiling?.width || 900}
                />
              </div>
            </div>
          )}

        </div>

        {/* 프레임 설정 - 양쪽 탭에서 모두 표시 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>프레임 설정</h3>
          </div>

          {/* 프레임 타입 */}
          <div className={styles.toggleButtonGroup}>
            <button
              className={`${styles.toggleButton} ${(spaceInfo.surroundType || 'surround') === 'surround' ? styles.active : ''}`}
              onClick={() => handleSpaceInfoUpdate({ surroundType: 'surround' })}
            >
              서라운드
            </button>
            <button
              className={`${styles.toggleButton} ${(spaceInfo.surroundType || 'surround') === 'no-surround' ? styles.active : ''}`}
              onClick={() => handleSpaceInfoUpdate({ surroundType: 'no-surround' })}
            >
              노서라운드
            </button>
          </div>

          {/* 프레임 속성 설정 */}
          {(spaceInfo.surroundType || 'surround') === 'surround' ? (
            <div className={styles.subSetting}>
              <label className={styles.subLabel}>프레임 폭 설정</label>

              <div className={styles.frameGrid}>
                {/* 좌측 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>
                    {spaceInfo.installType === 'builtin' ? '좌측' :
                      spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left ? '좌측' :
                        spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left ? '좌측(엔드패널)' :
                          spaceInfo.installType === 'freestanding' ? '좌측(엔드패널)' : '좌측'}
                  </label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentLeft = spaceInfo.frameSize?.left || 50;
                        const newLeft = Math.max(10, currentLeft - 1);
                        updateFrameSize('left', newLeft);
                      }}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={spaceInfo.frameSize?.left || 50}
                      onChange={(e) => {
                        const value = Math.min(100, Math.max(10, parseInt(e.target.value) || 50));
                        updateFrameSize('left', value);
                      }}
                      onFocus={() => setHighlightedFrame('left')}
                      onBlur={() => setHighlightedFrame(null)}
                      className={styles.frameNumberInput}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentLeft = spaceInfo.frameSize?.left || 50;
                        const newLeft = Math.min(100, currentLeft + 1);
                        updateFrameSize('left', newLeft);
                      }}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 우측 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>
                    {spaceInfo.installType === 'builtin' ? '우측' :
                      spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right ? '우측' :
                        spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right ? '우측(엔드패널)' :
                          spaceInfo.installType === 'freestanding' ? '우측(엔드패널)' : '우측'}
                  </label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentRight = spaceInfo.frameSize?.right || 50;
                        const newRight = Math.max(10, currentRight - 1);
                        updateFrameSize('right', newRight);
                      }}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={spaceInfo.frameSize?.right || 50}
                      onChange={(e) => {
                        const value = Math.min(100, Math.max(10, parseInt(e.target.value) || 50));
                        updateFrameSize('right', value);
                      }}
                      onFocus={() => setHighlightedFrame('right')}
                      onBlur={() => setHighlightedFrame(null)}
                      className={styles.frameNumberInput}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentRight = spaceInfo.frameSize?.right || 50;
                        const newRight = Math.min(100, currentRight + 1);
                        updateFrameSize('right', newRight);
                      }}
                      disabled={
                        (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right) ||
                        spaceInfo.installType === 'freestanding'
                      }
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 상부 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>상부</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentTop = spaceInfo.frameSize?.top || 50;
                        const newTop = Math.max(10, currentTop - 1);
                        updateFrameSize('top', newTop);
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={spaceInfo.frameSize?.top || 50}
                      onChange={(e) => {
                        const value = Math.min(100, Math.max(10, parseInt(e.target.value) || 50));
                        updateFrameSize('top', value);
                      }}
                      onFocus={() => setHighlightedFrame('top')}
                      onBlur={() => setHighlightedFrame(null)}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentTop = spaceInfo.frameSize?.top || 50;
                        const newTop = Math.min(100, currentTop + 1);
                        updateFrameSize('top', newTop);
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.frameUnit}>단위: mm</div>
            </div>
          ) : (spaceInfo.surroundType || 'surround') === 'no-surround' ? (
            <div className={styles.subSetting}>
              <label className={styles.subLabel}>상부 프레임 설정</label>

              <div className={styles.frameGrid}>
                {/* 상부 프레임만 표시 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>상부</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentTop = spaceInfo.frameSize?.top || 10;
                        const newTop = Math.max(10, currentTop - 1);
                        updateFrameSize('top', newTop);
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={spaceInfo.frameSize?.top || 10}
                      onChange={(e) => {
                        const value = Math.min(200, Math.max(10, parseInt(e.target.value) || 10));
                        updateFrameSize('top', value);
                      }}
                      onFocus={() => setHighlightedFrame('top')}
                      onBlur={() => setHighlightedFrame(null)}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentTop = spaceInfo.frameSize?.top || 10;
                        const newTop = Math.min(200, currentTop + 1);
                        updateFrameSize('top', newTop);
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.frameUnit}>단위: mm</div>
            </div>
          ) : null}

        </div>

        {/* 이격거리 설정 - 노서라운드 선택시에만 표시 */}
        <GapControls
          spaceInfo={spaceInfo}
          onUpdate={handleSpaceInfoUpdate}
        />


        {/* 받침대 - 양쪽 탭에서 모두 표시 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>받침대</h3>
          </div>
          <BaseControls
            spaceInfo={spaceInfo}
            onUpdate={handleSpaceInfoUpdate}
            disabled={hasSpecialDualFurniture}
          />
        </div>

      </div>
    );
  };

  // readonly 모드가 아닐 때만 로딩 화면 표시
  if (loading && !isReadOnly) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingSpinner
          message="에디터를 준비하는 중..."
          size="large"
          type="spinner"
        />
      </div>
    );
  }

  // 디버깅용 로그
  console.log('🔍 Configurator basicInfo.title:', basicInfo.title);
  console.log('🔍 currentProjectId:', currentProjectId);
  console.log('🔍 currentDesignFileName:', currentDesignFileName);
  console.log('🔍 basicInfo.title:', basicInfo.title);

  // 전역 함수 노출 (디버깅용) - window 객체에 직접 할당
  if (typeof window !== 'undefined') {
    (window as any).testSaveProject = async () => {
      console.log('💾💾💾 [테스트] 직접 저장 함수 호출');
      await saveProject();
    };

    // 현재 프로젝트의 모든 디자인 파일 목록 확인
    (window as any).listDesignFiles = async () => {
      if (!currentProjectId) {
        console.error('❌ 프로젝트 ID가 없습니다');
        return;
      }

      try {
        const { getDesignFiles } = await import('@/firebase/projects');
        const { designFiles, error } = await getDesignFiles(currentProjectId);

        if (error) {
          console.error('❌ 디자인 파일 목록 조회 실패:', error);
          return;
        }

        console.log('📁 현재 프로젝트의 디자인 파일 목록:');
        console.table(designFiles.map(f => ({
          ID: f.id,
          이름: f.name,
          생성일: new Date(f.createdAt).toLocaleString(),
          수정일: new Date(f.updatedAt).toLocaleString()
        })));

        return designFiles;
      } catch (error) {
        console.error('❌ 디자인 파일 목록 조회 중 오류:', error);
      }
    };

    // 디자인 파일 삭제
    (window as any).deleteDesignFile = async (designFileId: string) => {
      if (!currentProjectId) {
        console.error('❌ 프로젝트 ID가 없습니다');
        return;
      }

      if (!designFileId) {
        console.error('❌ 삭제할 디자인 파일 ID를 입력하세요');
        console.log('💡 사용법: window.deleteDesignFile("파일ID")');
        console.log('💡 파일 목록 확인: window.listDesignFiles()');
        return;
      }

      if (!confirm(`정말로 이 디자인 파일을 삭제하시겠습니까?\nID: ${designFileId}`)) {
        console.log('❌ 삭제 취소됨');
        return;
      }

      try {
        const { deleteDesignFile } = await import('@/firebase/projects');
        const { error } = await deleteDesignFile(designFileId, currentProjectId);

        if (error) {
          console.error('❌ 디자인 파일 삭제 실패:', error);
          return;
        }

        console.log('✅ 디자인 파일 삭제 성공:', designFileId);
        console.log('🔄 페이지를 새로고침하세요');
      } catch (error) {
        console.error('❌ 디자인 파일 삭제 중 오류:', error);
      }
    };

    console.log('💾 테스트: 브라우저 콘솔에서 window.testSaveProject()를 실행해보세요');
    console.log('📁 파일 목록: window.listDesignFiles()');
    console.log('🗑️ 파일 삭제: window.deleteDesignFile("파일ID")');
  }

  return (
    <div className={`${styles.configurator} ${isReadOnly ? responsiveStyles.readOnlyMode : ''}`}>
      {/* 헤더 */}
      <Header
        title={currentDesignFileName || urlDesignFileName || basicInfo.title || "새로운 디자인"}
        projectName={urlProjectName || basicInfo.title || "새로운 프로젝트"}
        designFileName={currentDesignFileName || urlDesignFileName}
        projectId={currentProjectId}
        designFileId={currentDesignFileId}
        owner={projectOwner}
        collaborators={collaborators}
        onSave={saveProject}
        onPrevious={handlePrevious}
        onHelp={handleHelp}
        onConvert={handleConvert}
        onLogout={isReadOnly ? undefined : handleLogout}
        onProfile={isReadOnly ? undefined : handleProfile}
        onShare={async () => {
          // 디자인이 저장되지 않았으면 먼저 자동 저장
          if (!currentDesignFileId) {
            const confirmSave = confirm('공유하기 전에 먼저 저장해야 합니다. 지금 저장하시겠습니까?');
            if (!confirmSave) return;

            // 저장 실행
            await handleSaveProject();

            // 저장 후에도 designFileId가 없으면 에러
            if (!currentDesignFileId) {
              alert('저장에 실패했습니다. 다시 시도해주세요.');
              return;
            }
          }

          // furniture 데이터가 있는지 확인
          if (placedModules.length === 0) {
            alert('⚠️ 공유할 가구 데이터가 없습니다. 가구를 배치한 후 공유해주세요.');
            return;
          }

          setIsShareModalOpen(true);
        }}
        saving={saving}
        saveStatus={saveStatus}
        hasDoorsInstalled={hasDoorsInstalled}
        onDoorInstallationToggle={handleDoorInstallation}
        onNewProject={handleNewDesign}
        onSaveAs={handleSaveAs}
        onProjectNameChange={handleProjectNameChange}
        onDesignFileNameChange={handleDesignFileNameChange}
        onFileTreeToggle={handleFileTreeToggle}
        isFileTreeOpen={isFileTreeOpen}
        onExportPDF={() => setIsConvertModalOpen(true)}
        onExportGLB={handleExportGLB}
        readOnly={isReadOnly}
        onMobileMenuToggle={handleMobileMenuToggle}
      />

      <div className={styles.mainContent}>
        {/* 파일 트리 오버레이 */}
        {isFileTreeOpen && (
          <>
            {/* 배경 오버레이 */}
            <div
              className={styles.fileTreeOverlay}
              onClick={() => setIsFileTreeOpen(false)}
            />
            {/* 파일 트리 패널 */}
            <div className={styles.fileTreePanel}>
              <DashboardFileTree
                onFileSelect={(projectId, designFileId, designFileName) => {
                  console.log('🗂️ 파일트리에서 선택된 파일:', { projectId, designFileId, designFileName });

                  // 읽기 전용 모드에서는 파일 선택 차단
                  if (isReadOnly) {
                    console.log('👁️ 읽기 전용 모드 - 파일 선택 차단');
                    setIsFileTreeOpen(false);
                    return;
                  }

                  // 디자인 파일 선택 시 해당 프로젝트 로드
                  navigate(`/configurator?projectId=${projectId}&designFileId=${designFileId}&designFileName=${encodeURIComponent(designFileName)}`);
                  setIsFileTreeOpen(false); // 파일트리 닫기
                  console.log('✅ 디자인 파일 선택 완료 - 네비게이션 완료');
                }}
                onCreateNew={() => {
                  console.log('🆕 파일트리에서 새 파일 생성 요청');

                  // 읽기 전용 모드에서는 새 파일 생성 차단
                  if (isReadOnly) {
                    console.log('👁️ 읽기 전용 모드 - 새 파일 생성 차단');
                    setIsFileTreeOpen(false);
                    return;
                  }

                  handleNewProject();
                  setIsFileTreeOpen(false); // 파일트리 닫기
                }}
                onClose={() => setIsFileTreeOpen(false)}
              />
            </div>
          </>
        )}

        {/* 좌측 사이드바 - PC에서는 항상 표시, 모바일 읽기 전용에서만 숨김 */}
        <>
          {/* 좌측 사이드바 토글 버튼 */}
          <button
            className={`${styles.leftPanelToggle} ${activeSidebarTab ? styles.open : ''}`}
            onClick={() => setActiveSidebarTab(activeSidebarTab ? null : (isReadOnly ? 'material' : 'module'))}
            title={activeSidebarTab ? "사이드바 접기" : "사이드바 펼치기"}
          >
            <span className={styles.foldToggleIcon}>{activeSidebarTab ? '<' : '>'}</span>
          </button>

          {/* 사이드바 - 읽기 전용 모드에서는 재질 탭만 보임 */}
          <Sidebar
            activeTab={activeSidebarTab}
            onTabClick={handleSidebarTabClick}
            isOpen={!!activeSidebarTab}
            onToggle={() => setActiveSidebarTab(activeSidebarTab ? null : (isReadOnly ? 'material' : 'module'))}
            onSave={saveProject}
            readOnly={isReadOnly}
            onShare={async () => {
              if (isReadOnly) {
                // 읽기 전용 모드: 현재 URL을 복사
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  alert('📋 읽기 전용 링크가 복사되었습니다.');
                } catch (error) {
                  console.error('링크 복사 실패:', error);
                  alert('링크 복사에 실패했습니다.');
                }
              } else {
                // 편집 모드: 공유 모달 열기
                // 디자인이 저장되지 않았으면 먼저 자동 저장
                if (!currentDesignFileId) {
                  const confirmSave = confirm('공유하기 전에 먼저 저장해야 합니다. 지금 저장하시겠습니까?');
                  if (!confirmSave) return;

                  // 저장 실행
                  await handleSaveProject();

                  // 저장 후에도 designFileId가 없으면 에러
                  if (!currentDesignFileId) {
                    alert('저장에 실패했습니다. 다시 시도해주세요.');
                    return;
                  }
                }

                // furniture 데이터가 있는지 확인
                if (placedModules.length === 0) {
                  alert('⚠️ 공유할 가구 데이터가 없습니다. 가구를 배치한 후 공유해주세요.');
                  return;
                }

                setIsShareModalOpen(true);
              }
            }}
          />

          {/* 사이드바 컨텐츠 패널 */}
          <div
            className={styles.sidebarContent}
            style={{
              transform: activeSidebarTab ? 'translateX(0) scale(1)' : 'translateX(-100%) scale(0.95)',
              opacity: activeSidebarTab ? 1 : 0,
              pointerEvents: activeSidebarTab ? 'auto' : 'none'
            }}
          >
            {renderSidebarContent()}
          </div>
        </>

        {/* 중앙 뷰어 영역 */}
        <div
          className={styles.viewerArea}
          data-main-viewer="true"
          style={isMobile ? {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: (activeMobileTab === 'modules' || activeMobileTab === 'column' || activeMobileTab === 'others') ? '35%' : '70px', /* 패널 열림: 화면 65% 뷰어, 35% 패널 */
            transition: 'bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: '0 40px', /* 좌우 치수 및 가이드가 잘리지 않도록 여백 확보 */
          } : {
            position: 'absolute',
            left: activeSidebarTab ? 'var(--sidebar-total-width, 304px)' : 'var(--sidebar-icon-width, 64px)', /* CSS 변수 사용 - 반응형 */
            right: isReadOnly ? '0' : (isRightPanelOpen ? 'var(--right-panel-width, 320px)' : '0'), /* CSS 변수 사용 - 반응형 */
            top: 0,
            bottom: 0,
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >

          {/* 모바일 툴바 */}
          {isMobile && !isReadOnly && (
            <MobileToolbar
              viewMode={viewMode as ViewMode}
              onViewModeChange={(mode) => {
                setViewMode(mode);
                if (mode === '2D') {
                  setRenderMode('wireframe');
                } else if (mode === '3D') {
                  setRenderMode('solid');
                }
              }}
              showDimensions={showDimensions}
              onToggleDimensions={toggleDimensions}
              showGuides={showGuides}
              onToggleGuides={toggleGuides}
              onMoreOptions={handleMobileMenuToggle}
            />
          )}

          {/* 뷰어 컨트롤 - 데스크탑용 */}
          {!isMobile && (
            <ViewerControls
              viewMode={viewMode as ViewMode}
              onViewModeChange={(mode) => {
                setViewMode(mode);
                // 2D 모드 선택 시 와이어프레임으로 자동 설정
                if (mode === '2D') {
                  setRenderMode('wireframe');
                } else if (mode === '3D') {
                  // 3D 모드 선택 시 솔리드로 자동 설정
                  setRenderMode('solid');
                }
              }}
              viewDirection={view2DDirection}
              onViewDirectionChange={setView2DDirection}
              renderMode={renderMode}
              onRenderModeChange={setRenderMode}
              showAll={showAll}
              onShowAllToggle={() => setShowAll(!showAll)}
              showDimensions={showDimensions}
              onShowDimensionsToggle={toggleDimensions}
              showDimensionsText={showDimensionsText}
              onShowDimensionsTextToggle={toggleDimensionsText}
              showGuides={showGuides}
              onShowGuidesToggle={toggleGuides}
              showAxis={showAxis}
              onShowAxisToggle={toggleAxis}
              showFurniture={showFurniture}
              onShowFurnitureToggle={() => {
                console.log('🎯 Configurator toggle - current:', showFurniture, '-> new:', !showFurniture);
                setShowFurniture(!showFurniture);
              }}
              doorsOpen={doorsOpen}
              onDoorsToggle={toggleDoors}
              hasDoorsInstalled={hasDoorsInstalled}
              onDoorInstallationToggle={handleDoorInstallation}
            />
          )}

          {/* 3D 뷰어 */}
          <div className={`${styles.viewer} ${isMobile ? responsiveStyles.mobileViewer : ''}`}>
            {/* 도어가 설치된 경우에만 뷰어 상단에 Close/Open 토글 버튼 표시 */}
            {hasDoorsInstalled && (
              <div className={styles.viewerDoorToggle}>
                <button
                  className={`${styles.viewerDoorButton} ${!doorsOpen ? styles.active : ''}`}
                  onClick={() => {
                    console.log('🚪 Close 버튼 클릭됨');
                    console.log('전역 doorsOpen:', doorsOpen);
                    console.log('placedModules 개수:', placedModules.length);

                    // 전역 상태를 닫힘으로 설정
                    if (doorsOpen) {
                      console.log('전역 상태 닫기');
                      toggleDoors();
                    }

                    // 모든 개별 도어를 닫기
                    let closedCount = 0;
                    placedModules.forEach((module) => {
                      console.log(`모듈 ${module.id}: hasDoor=${module.hasDoor}, doorSplit=${module.doorSplit}`);
                      if (module.hasDoor) {
                        const sectionCount = module.doorSplit ? 2 : 1;
                        for (let i = 0; i < sectionCount; i++) {
                          const { isIndividualDoorOpen } = useUIStore.getState();
                          const isOpen = isIndividualDoorOpen(module.id, i);
                          console.log(`  섹션 ${i}: 열림=${isOpen}`);
                          if (isOpen) {
                            console.log(`  섹션 ${i} 닫기`);
                            toggleIndividualDoor(module.id, i);
                            closedCount++;
                          }
                        }
                      }
                    });
                    console.log(`총 ${closedCount}개 도어 닫음`);
                  }}
                >
                  Close
                </button>
                <button
                  className={`${styles.viewerDoorButton} ${doorsOpen ? styles.active : ''}`}
                  onClick={() => {
                    console.log('🚪 Open 버튼 클릭됨');
                    console.log('전역 doorsOpen:', doorsOpen);
                    console.log('placedModules 개수:', placedModules.length);

                    // 전역 상태를 열림으로 설정
                    if (!doorsOpen) {
                      console.log('전역 상태 열기');
                      toggleDoors();
                    }

                    // 모든 개별 도어를 열기
                    let openedCount = 0;
                    placedModules.forEach((module) => {
                      console.log(`모듈 ${module.id}: hasDoor=${module.hasDoor}, doorSplit=${module.doorSplit}`);
                      if (module.hasDoor) {
                        const sectionCount = module.doorSplit ? 2 : 1;
                        for (let i = 0; i < sectionCount; i++) {
                          const { isIndividualDoorOpen } = useUIStore.getState();
                          const isOpen = isIndividualDoorOpen(module.id, i);
                          console.log(`  섹션 ${i}: 열림=${isOpen}`);
                          if (!isOpen) {
                            console.log(`  섹션 ${i} 열기`);
                            toggleIndividualDoor(module.id, i);
                            openedCount++;
                          }
                        }
                      }
                    });
                    console.log(`총 ${openedCount}개 도어 열음`);
                  }}
                >
                  Open
                </button>
              </div>
            )}
            <Space3DView
              key={`space3d-${spaceInfo.droppedCeiling?.enabled}-${spaceInfo.droppedCeiling?.position}-${spaceInfo.droppedCeiling?.width}-${spaceInfo.droppedCeiling?.dropHeight}`}
              spaceInfo={spaceInfo}
              viewMode={viewMode}
              setViewMode={setViewMode}
              renderMode={renderMode}
              showAll={showAll}
              showFrame={true}
              svgSize={{ width: 800, height: 600 }}
              activeZone={undefined} // 두 구간 모두 배치 가능하도록 undefined 전달
              readOnly={isReadOnly} // 읽기 전용 모드
              sceneRef={sceneRef} // GLB 내보내기용 씬 참조
            />

            {/* 측면뷰용 슬롯 선택 버튼 */}
            <SlotSelector />
          </div>
          {isMobile && <div className={responsiveStyles.mobileViewerDivider} aria-hidden="true" />}

        </div>

        {/* 우측 패널 폴드/언폴드 버튼 - 읽기 전용 모드에서는 숨김 */}
        {!isReadOnly && (
          <button
            className={`${styles.rightPanelToggle} ${isRightPanelOpen ? styles.open : ''}`}
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            title={isRightPanelOpen ? "우측 패널 접기" : "우측 패널 펼치기"}
          >
            <span className={styles.foldToggleIcon}>{isRightPanelOpen ? '>' : '<'}</span>
          </button>
        )}

        {/* 우측 패널 컨테이너 - 읽기 전용 모드에서는 숨김 */}
        {!isReadOnly && (
          <div
            className={styles.rightPanelContainer}
            style={{
              width: isRightPanelOpen ? 'var(--right-panel-width, 320px)' : '0',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >

            {/* 우측 패널 */}
            <div
              className={styles.rightPanel}
              style={{
                transform: isRightPanelOpen ? 'translateX(0)' : 'translateX(100%)',
                opacity: isRightPanelOpen ? 1 : 0,
                pointerEvents: isRightPanelOpen ? 'auto' : 'none'
              }}
            >
              {/* 미리보기 뷰어 - 2D/3D 모드 전환 */}
              <PreviewViewer />

              {/* 패널 컨텐츠 */}
              <div className={styles.rightPanelContent}>
                {renderRightPanelContent()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 가구 편집 창들 - 기존 기능 유지 */}
      <ModulePropertiesPanel />
      <PlacedModulePropertiesPanel />

      {/* 기둥 편집 모달 */}
      <ColumnEditModal
        columnId={activePopup.type === 'columnEdit' ? activePopup.id : null}
        isOpen={activePopup.type === 'columnEdit'}
        onClose={closeAllPopups}
      />

      {/* 컨버팅 모달 */}
      <ConvertModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        showAll={showAll}
        setShowAll={setShowAll}
      />

      {/* PDF 템플릿 미리보기 */}
      <PDFTemplatePreview
        isOpen={showPDFPreview}
        onClose={() => setShowPDFPreview(false)}
        capturedViews={capturedViews}
      />

      {/* 공유 링크 모달 */}
      {isShareModalOpen && currentProjectId && (
        <ShareLinkModal
          projectId={currentProjectId}
          projectName={urlProjectName || basicInfo.title || "프로젝트"}
          designFileId={currentDesignFileId || undefined}
          designFileName={currentDesignFileName || undefined}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {/* 모바일 읽기 전용 모드 전용 UI */}
      {isReadOnly && (
        <>
          {/* 하단 재질 선택 패널 */}
          <div className={responsiveStyles.materialPanel}>
            <MaterialPanel />
          </div>

          {/* 하단 네비게이션 바 */}
          <div className={responsiveStyles.bottomNav}>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-text)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>홈</span>
            </button>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-text)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              <span>도면</span>
            </button>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-text)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>달력</span>
            </button>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-primary)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>추가</span>
            </button>
            <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--theme-text)', fontSize: '11px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>계정</span>
            </button>
          </div>
        </>
      )}

      {/* 모바일 전용 UI (편집 모드) */}
      {isMobile && !isReadOnly && (
        <>
          {/* 하단 탭바 */}
          <MobileBottomBar
            activeTab={activeMobileTab}
            onTabChange={handleMobileTabChange}
          />

          {/* 모듈/기둥/기타 패널 */}
          <MobilePanel
            activeTab={activeMobileTab}
            isOpen={activeMobileTab === 'modules' || activeMobileTab === 'column' || activeMobileTab === 'others'}
          />

          {/* 바텀시트 - 재질 */}
          <MobileBottomSheet
            isOpen={mobileSheetOpen && activeMobileTab === 'material'}
            onClose={() => { setMobileSheetOpen(false); setActiveMobileTab(null); }}
            title="재질 선택"
          >
            <MaterialPanel />
          </MobileBottomSheet>

          {/* 바텀시트 - 기타 설정 (추후 확장용) */}
          <MobileBottomSheet
            isOpen={mobileSheetOpen && activeMobileTab === 'others'}
            onClose={() => { setMobileSheetOpen(false); setActiveMobileTab(null); }}
            title="기타 설정"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 도어 토글 */}
              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', display: 'block' }}>도어</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => toggleDoors()}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: `2px solid ${doorsOpen ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
                      borderRadius: '8px',
                      background: doorsOpen ? 'var(--theme-primary-light)' : 'var(--theme-surface)',
                      color: doorsOpen ? 'var(--theme-primary)' : 'var(--theme-text)',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {doorsOpen ? '도어 열림' : '도어 닫힘'}
                  </button>
                </div>
              </div>
            </div>
          </MobileBottomSheet>
        </>
      )}

      {/* 모바일 우측 메뉴 (Drawer) */}
      {isMobile && (
        <>
          <div className={`${responsiveStyles.mobileRightPanel} ${isMobileMenuOpen ? responsiveStyles.mobileRightPanelOpen : ''}`}>
            <div className={responsiveStyles.mobileRightPanelHeader}>
              <h2>설정</h2>
              <button
                className={responsiveStyles.mobileRightPanelClose}
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="설정 닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className={responsiveStyles.mobileRightPanelContent}>
              {renderRightPanelContent()}
            </div>
          </div>
          <div
            className={`${responsiveStyles.mobileBackdrop} ${isMobileMenuOpen ? responsiveStyles.mobileBackdropOpen : ''}`}
            onClick={() => setIsMobileMenuOpen(false)}
          />
        </>
      )}

    </div>
  );
};

export default Configurator; 
