import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { TbRulerMeasure } from 'react-icons/tb';
import { GoQuestion } from 'react-icons/go';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSpaceConfigStore, SPACE_LIMITS, DEFAULT_SPACE_VALUES, DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
import { inferFrameConfig } from '@/editor/shared/utils/frameConfigBridge';
import { generateSurround } from '@/editor/shared/utils/surroundGenerator';
import { useProjectStore } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { useUIStore, type EditorTab } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useFurnitureSpaceAdapter } from '@/editor/shared/furniture/hooks/useFurnitureSpaceAdapter';
import { getProject, updateProject, createProject, createDesignFile, getDesignFiles } from '@/firebase/projects';
import { captureProjectThumbnail, generateDefaultThumbnail } from '@/editor/shared/utils/thumbnailCapture';
import { useAuth } from '@/auth/AuthProvider';
import { useProjectPermission } from '@/hooks/useProjectPermission';
import { getProjectCollaborators, type ProjectCollaborator } from '@/firebase/shareLinks';
import { SpaceCalculator, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import { getModuleById } from '@/data/modules';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useHistoryStore } from '@/store/historyStore';
import { useHistoryTracking } from './hooks/useHistoryTracking';
import { use3DExport, type ExportFormat } from '@/editor/shared/hooks/use3DExport';

// 새로운 컴포넌트들 import
import Header from './components/Header';
import TabBar from './components/TabBar';
import Sidebar, { SidebarTab } from './components/Sidebar';
import ViewerControls, { ViewMode, ViewDirection, RenderMode } from './components/ViewerControls';
import RightPanel, { RightPanelTab, DoorCountSlider as DoorSlider } from './components/RightPanel';
import { ModuleContent } from './components/RightPanel';
import NavigationPane from '@/components/dashboard/NavigationPane';
import { getUserProjects, loadFolderData as loadFolderDataFn } from '@/firebase/projects';
import type { ProjectSummary, DesignFileSummary } from '@/firebase/types';
import type { FolderData as FolderDataType } from '@/firebase/projects';
import type { QuickAccessMenu } from '@/hooks/dashboard/types';
import { TouchCompatibleControl } from './components/TouchCompatibleControls';
import SlotSelector from './components/SlotSelector';


// 기존 작동하는 컴포넌트들
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import ModuleGallery, { type ModuleType } from '@/editor/shared/controls/furniture/ModuleGallery';
import ModulePropertiesPanel from '@/editor/shared/controls/furniture/ModulePropertiesPanel';
import PlacedModulePropertiesPanel from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel';
import doorSettingStyles from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel.module.css';
import CustomFurnitureLibrary from '@/editor/shared/controls/furniture/CustomFurnitureLibrary';
import CustomFurnitureUpload from '@/editor/shared/controls/furniture/CustomFurnitureUpload';
import CustomizableFurnitureLibrary from '@/editor/shared/controls/furniture/CustomizableFurnitureLibrary';
import CustomizablePropertiesPanel from '@/editor/shared/controls/furniture/CustomizablePropertiesPanel';
import MyCabinetGallery from '@/editor/shared/controls/furniture/MyCabinetGallery';
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
  BaseControls,
  FloorFinishControls
} from '@/editor/shared/controls';
import GapControls from '@/editor/shared/controls/customization/components/GapControls';
import { BoringExportDialog } from '@/editor/shared/controls/boring';
import { useFurnitureBoring } from '@/domain/boring';
import Step2SpaceAndCustomization from '@/editor/Step1/components/Step2SpaceAndCustomization';

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
  const saveInProgressRef = useRef(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentDesignFileId, setCurrentDesignFileId] = useState<string | null>(null);
  const [currentDesignFileName, setCurrentDesignFileName] = useState<string>('');
  const [currentFolderName, setCurrentFolderName] = useState<string>('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showSpaceConfigPopup, setShowSpaceConfigPopup] = useState(false);

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
  const { setSpaceInfo, spaceInfo, updateColumn, resetSpaceInfo } = useSpaceConfigStore();
  const { setPlacedModules, placedModules, setAllDoors, clearAllModules, updatePlacedModule } = useFurnitureStore();
  const derivedSpaceStore = useDerivedSpaceStore();
  const { updateFurnitureForNewSpace } = useFurnitureSpaceAdapter({ setPlacedModules });
  const { viewMode, setViewMode, doorsOpen, toggleDoors, setDoorsOpen, view2DDirection, setView2DDirection, showDimensions, toggleDimensions, showDimensionsText, toggleDimensionsText, setHighlightedFrame, selectedColumnId, setSelectedColumnId, activePopup, openColumnEditModal, closeAllPopups, showGuides, toggleGuides, showAxis, toggleAxis, activeDroppedCeilingTab, setActiveDroppedCeilingTab, showFurniture, setShowFurniture, setShadowEnabled, toggleIndividualDoor, showBorings, toggleBorings, renderMode, setRenderMode, setLayoutBuilderOpen, selectedFurnitureId } = useUIStore();

  // 새로운 UI 상태들
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab | null>(() => {
    // readonly 모드일 때는 좌측 사이드바 접힌 상태로 시작
    const mode = searchParams.get('mode');
    return mode === 'readonly' ? null : 'module';
  });
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<'placement' | 'module'>('placement');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => {
    // URL 파라미터로 패널 상태 초기화 (미리보기 팝업용)
    const panelClosed = searchParams.get('panelClosed');
    return panelClosed !== 'true';
  });
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  const [fileTreeProjects, setFileTreeProjects] = useState<ProjectSummary[]>([]);
  const [fileTreeActiveMenu, setFileTreeActiveMenu] = useState<QuickAccessMenu>('in-progress');
  const [fileTreeFolders, setFileTreeFolders] = useState<{ [projectId: string]: FolderDataType[] }>({});
  // 파일트리 우측 패널: 선택된 프로젝트의 디자인 파일 목록
  const [fileTreeSelectedProjectId, setFileTreeSelectedProjectId] = useState<string | null>(null);
  const [fileTreeSelectedFolderId, setFileTreeSelectedFolderId] = useState<string | null>(null);
  const [fileTreeDesignFiles, setFileTreeDesignFiles] = useState<DesignFileSummary[]>([]);
  const [moduleCategory, setModuleCategory] = useState<'tall' | 'upper' | 'lower'>('tall'); // 키큰장/상부장/하부장 토글
  const [moduleType, setModuleType] = useState<ModuleType>('all'); // 전체/싱글/듀얼 탭
  const [customCategory, setCustomCategory] = useState<'full' | 'upper' | 'lower'>('full'); // 커스텀 전체장/상부장/하부장 토글
  const [myCabinetCategory, setMyCabinetCategory] = useState<'full' | 'upper' | 'lower'>('full'); // My캐비닛 카테고리 필터
  const [myCabinetEditMode, setMyCabinetEditMode] = useState(false); // My캐비닛 편집 모드
  const [showCustomUploadModal, setShowCustomUploadModal] = useState(false); // 커스텀 가구 업로드 모달
  const [showBoringExportDialog, setShowBoringExportDialog] = useState(false); // 보링 내보내기 대화상자

  // 새 디자인 모달 상태
  const [isNewDesignModalOpen, setIsNewDesignModalOpen] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');
  const [newDesignProjects, setNewDesignProjects] = useState<ProjectSummary[]>([]);
  const [newDesignProjectId, setNewDesignProjectId] = useState<string | null>(null);
  const [isCreatingNewDesign, setIsCreatingNewDesign] = useState(false);

  // 도어 셋팅: 자유배치 모드 + 도어 달린 가구가 실제로 배치되어 있을 때만 표시
  const doorFurnitureList = useMemo(() =>
    placedModules.filter(m => m.hasDoor).sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0)),
    [placedModules]
  );
  // 도어 번호 매핑: 듀얼(양문) 가구는 도어 2개, 싱글 가구는 도어 1개
  const doorNumberMap = useMemo(() => {
    let doorNum = 1;
    return doorFurnitureList.map((mod) => {
      const isDual = mod.isDualSlot || mod.moduleId?.includes('dual-') || mod.baseModuleType?.includes('dual-');
      if (isDual) {
        const label = `도어 ${doorNum},${doorNum + 1}`;
        const nums = [doorNum, doorNum + 1];
        doorNum += 2;
        return { label, nums, isDual: true };
      } else {
        const label = `도어 ${doorNum}`;
        const nums = [doorNum];
        doorNum += 1;
        return { label, nums, isDual: false };
      }
    });
  }, [doorFurnitureList]);
  const showDoorSetup = (spaceInfo.layoutMode || 'equal-division') === 'free-placement'
    && doorFurnitureList.length > 0;
  const doorSetupMode = spaceInfo.doorSetupMode || 'furniture-fit';
  // 전체/개별 모드 ('global' = 전체, 'individual' = 개별)
  const [doorGapMode, setDoorGapMode] = useState<'global' | 'individual'>('global');
  const [doorTopGapInput, setDoorTopGapInput] = useState(String(spaceInfo.doorTopGap ?? 5));
  const [doorBottomGapInput, setDoorBottomGapInput] = useState(String(spaceInfo.doorBottomGap ?? 25));

  useEffect(() => {
    setDoorTopGapInput(String(spaceInfo.doorTopGap ?? 5));
    setDoorBottomGapInput(String(spaceInfo.doorBottomGap ?? 25));
  }, [spaceInfo.doorTopGap, spaceInfo.doorBottomGap]);

  // 전체 모드: 글로벌 도어 갭 변경
  const handleDoorGapChange = (field: 'doorTopGap' | 'doorBottomGap', val: string) => {
    if (field === 'doorTopGap') setDoorTopGapInput(val);
    else setDoorBottomGapInput(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      console.log('🔴🔴 handleDoorGapChange:', { field, val: num, doorModuleCount: placedModules.filter(m => m.hasDoor).length });
      setSpaceInfo({ [field]: num });
      placedModules.filter(m => m.hasDoor).forEach(m => {
        console.log('🔴🔴 updatePlacedModule:', { moduleId: m.id, field, val: num });
        updatePlacedModule(m.id, { [field]: num });
      });
    }
  };

  const handleDoorGapBlur = (field: 'doorTopGap' | 'doorBottomGap') => {
    const input = field === 'doorTopGap' ? doorTopGapInput : doorBottomGapInput;
    const setter = field === 'doorTopGap' ? setDoorTopGapInput : setDoorBottomGapInput;
    if (isNaN(parseFloat(input))) setter(field === 'doorTopGap' ? '5' : '25');
  };

  // 개별 모드: 개별 가구 도어 갭 변경
  const handleIndividualDoorGapChange = (moduleId: string, field: 'doorTopGap' | 'doorBottomGap', val: string) => {
    const num = parseFloat(val);
    console.log('🟡🟡 handleIndividualDoorGapChange:', { moduleId, field, val, num, isNaN: isNaN(num) });
    if (!isNaN(num)) {
      updatePlacedModule(moduleId, { [field]: num });
      // 확인: store에 실제로 반영됐는지
      setTimeout(() => {
        const updated = useFurnitureStore.getState().placedModules.find(m => m.id === moduleId);
        console.log('🟡🟡 store 확인:', { moduleId, doorTopGap: updated?.doorTopGap, doorBottomGap: updated?.doorBottomGap });
      }, 100);
    }
  };

  // 도어갭 변경 디버깅: store 값 확인
  React.useEffect(() => {
    console.log('🔴🔴 doorGap store 상태:', {
      storeTopGap: spaceInfo.doorTopGap,
      storeBotGap: spaceInfo.doorBottomGap,
      doorSetupMode: spaceInfo.doorSetupMode,
      hasDoorModules: placedModules.filter(m => m.hasDoor).map(m => ({ id: m.id, topGap: m.doorTopGap, botGap: m.doorBottomGap }))
    });
  }, [spaceInfo.doorTopGap, spaceInfo.doorBottomGap, spaceInfo.doorSetupMode, placedModules]);

  // 보링 데이터 생성 훅
  const { panels: boringPanels, totalBorings, furnitureCount: boringFurnitureCount } = useFurnitureBoring();

  // 모바일/태블릿 반응형 상태
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isSlotGuideOpen, setIsSlotGuideOpen] = useState(false);
  const slotGuideRef = useRef<HTMLDivElement>(null);
  const slotGuideBtnRef = useRef<HTMLButtonElement>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 슬롯 가이드 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!isSlotGuideOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        slotGuideRef.current && !slotGuideRef.current.contains(e.target as Node) &&
        slotGuideBtnRef.current && !slotGuideBtnRef.current.contains(e.target as Node)
      ) {
        setIsSlotGuideOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isSlotGuideOpen]);

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

  // 3D 모델 내보내기 훅
  const { exportTo3D, canExport } = use3DExport();

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
// console.log('📸 읽기 전용 모드: 3D 정면 뷰로 초기화 (섬네일과 동일)');
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
// console.log('📸 최초 썸네일 자동 생성 시작');

        const thumbnail = await captureProjectThumbnail();
        if (thumbnail) {
          const { dataURLToBlob } = await import('@/editor/shared/utils/thumbnailCapture');
          const thumbnailBlob = dataURLToBlob(thumbnail);

          await updateProject(currentProjectId, {
            thumbnail: thumbnailBlob
          });

// console.log('📸 최초 썸네일 자동 생성 완료');
        }
      } catch (error) {
        console.error('📸 최초 썸네일 생성 실패:', error);
      }
    };

    generateInitialThumbnail();
  }, [loading, currentProjectId, isReadOnlyMode]);

  // 뷰어 컨트롤 상태들 - view2DDirection과 showDimensions는 UIStore 사용
  const [showAll, setShowAll] = useState(true);
  const [isConvertPanelOpen, setIsConvertPanelOpen] = useState(false); // 컨버팅 패널 상태

  // 슬롯배치 모드 진입 시 컬럼 가이드 자동 켜기
  const isFurniturePlacementMode = useFurnitureStore(state => state.isFurniturePlacementMode);
  useEffect(() => {
    if (isFurniturePlacementMode && viewMode === '3D') {
      setShowAll(true);
    }
  }, [isFurniturePlacementMode, viewMode]);

  // 커스텀 가구 설계→배치→세부설정→저장 동안 UI 자동 전환
  // 사이드바 접기 + orthographic 카메라 + 그림자 끄기 → 저장/닫기 시 복원
  const isLayoutBuilderOpen = useUIStore(s => s.isLayoutBuilderOpen);
  const layoutBuilderRevision = useUIStore(s => s.layoutBuilderRevision);
  const cameraMode = useUIStore(s => s.cameraMode);
  const setCameraMode = useUIStore(s => s.setCameraMode);
  const shadowEnabled = useUIStore(s => s.shadowEnabled);
  // stale closure 방지: 최신 값을 ref로 추적
  const latestSidebarTab = useRef(activeSidebarTab);
  latestSidebarTab.current = activeSidebarTab;
  const latestRightPanel = useRef(isRightPanelOpen);
  latestRightPanel.current = isRightPanelOpen;
  const latestCameraMode = useRef(cameraMode);
  latestCameraMode.current = cameraMode;
  const latestShadow = useRef(shadowEnabled);
  latestShadow.current = shadowEnabled;
  const stateBeforeDesign = useRef<{
    activeSidebarTab: SidebarTab | null;
    isRightPanelOpen: boolean;
    cameraMode: 'perspective' | 'orthographic';
    shadowEnabled: boolean;
  } | null>(null);
  // 설계모드가 아닐 때의 기본 UI 상태로 복원하는 헬퍼
  const restoreNonDesignUI = useCallback(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    const defaultTab: SidebarTab = mode === 'readonly' ? 'material' : 'module';
    if (latestSidebarTab.current === null) setActiveSidebarTab(defaultTab);
    if (!latestRightPanel.current) setIsRightPanelOpen(true);
    if (latestCameraMode.current === 'orthographic') setCameraMode('perspective');
    if (!latestShadow.current) setShadowEnabled(true);
  }, [setCameraMode, setShadowEnabled]);

  useEffect(() => {
    if (isLayoutBuilderOpen) {
      // 설계모드 진입: 최초 1회만 백업
      if (!stateBeforeDesign.current) {
        stateBeforeDesign.current = {
          activeSidebarTab: latestSidebarTab.current,
          isRightPanelOpen: latestRightPanel.current,
          cameraMode: latestCameraMode.current,
          shadowEnabled: latestShadow.current,
        };
      }
      // 설계모드 동안 항상 강제: 사이드바 접기, orthographic, 그림자 끄기 (우측패널은 유지 — 커스텀 편집 패널이 덮음)
      setActiveSidebarTab(null);
      setCameraMode('orthographic');
      setShadowEnabled(false);
    } else {
      if (stateBeforeDesign.current) {
        // 백업에서 복원
        setActiveSidebarTab(stateBeforeDesign.current.activeSidebarTab ?? 'module');
        setIsRightPanelOpen(stateBeforeDesign.current.isRightPanelOpen ?? true);
        setCameraMode(stateBeforeDesign.current.cameraMode ?? 'perspective');
        setShadowEnabled(stateBeforeDesign.current.shadowEnabled ?? true);
        stateBeforeDesign.current = null;
      } else {
        // 백업 유실 시 — 기본값으로 복원
        restoreNonDesignUI();
      }
    }
    // 컴포넌트 언마운트(페이지 이탈) 시에도 복원
    return () => {
      if (stateBeforeDesign.current) {
        setCameraMode(stateBeforeDesign.current.cameraMode);
        setShadowEnabled(stateBeforeDesign.current.shadowEnabled);
        stateBeforeDesign.current = null;
      }
    };
  }, [isLayoutBuilderOpen, layoutBuilderRevision, restoreNonDesignUI]);

  // 프레임 입력을 위한 로컬 상태 (문자열로 관리하여 입력 중 백스페이스 허용)
  const [frameInputLeft, setFrameInputLeft] = useState<string>(String(spaceInfo.frameSize?.left || 50));
  const [frameInputRight, setFrameInputRight] = useState<string>(String(spaceInfo.frameSize?.right || 50));
  const [frameInputTop, setFrameInputTop] = useState<string>(String(spaceInfo.frameSize?.top || 30));
  const isEditingFrameRef = useRef<{ left: boolean; right: boolean; top: boolean }>({ left: false, right: false, top: false });

  // 외부 spaceInfo.frameSize가 변경되면 로컬 상태 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!isEditingFrameRef.current.left) {
      setFrameInputLeft(String(spaceInfo.frameSize?.left || 50));
    }
    if (!isEditingFrameRef.current.right) {
      setFrameInputRight(String(spaceInfo.frameSize?.right || 50));
    }
    if (!isEditingFrameRef.current.top) {
      setFrameInputTop(String(spaceInfo.frameSize?.top || 30));
    }
  }, [spaceInfo.frameSize?.left, spaceInfo.frameSize?.right, spaceInfo.frameSize?.top]);

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
  const { saveState, undo: historyUndo, redo: historyRedo } = useHistoryStore();

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
        const previousState = historyUndo();
        if (previousState) {
          setSpaceInfo(previousState.spaceInfo);
          setPlacedModules(previousState.placedModules);
          setBasicInfo(previousState.basicInfo);
        }
        return;
      }

      // Ctrl+Y / Cmd+Y 또는 Ctrl+Shift+Z / Cmd+Shift+Z로 Redo
      if (((event.ctrlKey || event.metaKey) && event.key === 'y') ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z')) {
        event.preventDefault();
        const nextState = historyRedo();
        if (nextState) {
          setSpaceInfo(nextState.spaceInfo);
          setPlacedModules(nextState.placedModules);
          setBasicInfo(nextState.basicInfo);
        }
        return;
      }

      // D 키로 도어 열기/닫기 토글
      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
// console.log('🚪 D 키로 도어 토글 시도');
        toggleDoors();
        return;
      }

      // Backspace 또는 Delete 키로 선택된 가구 삭제
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const { selectedFurnitureId } = useUIStore.getState();
        if (selectedFurnitureId) {
          event.preventDefault();
// console.log('🗑️ 키보드로 가구 삭제:', selectedFurnitureId);
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
// console.log('⌨️ 키보드 단축키로 기둥 편집 모달 열기:', selectedColumnId);
          openColumnEditModal(selectedColumnId);
        } else {
// console.log('⚠️ 선택된 기둥이 없습니다.');
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

// console.log('⌨️ 컬럼 키보드 이동:', {
            // columnId: activePopup.id,
            // direction: event.key,
            // moveStep: moveStep,
            // stepSize: event.shiftKey ? '50mm (빠름)' : '5mm (정밀)',
            // oldX: currentX,
            // newX
          // });
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
// console.log('🔍 Configurator - MaterialConfig 변경 감지:', {
        // interiorColor: spaceInfo.materialConfig.interiorColor,
        // doorColor: spaceInfo.materialConfig.doorColor,
        // interiorTexture: spaceInfo.materialConfig.interiorTexture,
        // doorTexture: spaceInfo.materialConfig.doorTexture,
        // isCabinetTexture1: {
          // interior: spaceInfo.materialConfig.interiorTexture?.includes('cabinet texture1'),
          // door: spaceInfo.materialConfig.doorTexture?.includes('cabinet texture1')
        // }
      // });
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

  // 프레임 입력 핸들러 함수들
  const handleFrameInputChange = (dimension: 'left' | 'right' | 'top', value: string) => {
    // 숫자만 허용 (빈 문자열도 허용)
    if (value === '' || /^\d+$/.test(value)) {
      if (dimension === 'left') setFrameInputLeft(value);
      else if (dimension === 'right') setFrameInputRight(value);
      else setFrameInputTop(value);
    }
  };

  const handleFrameInputFocus = (dimension: 'left' | 'right' | 'top') => {
    isEditingFrameRef.current[dimension] = true;
    setHighlightedFrame(dimension);
  };

  const handleFrameInputBlur = (dimension: 'left' | 'right' | 'top', min: number, max: number, defaultValue: number) => {
    isEditingFrameRef.current[dimension] = false;
    setHighlightedFrame(null);

    const inputValue = dimension === 'left' ? frameInputLeft : dimension === 'right' ? frameInputRight : frameInputTop;
    let numValue = parseInt(inputValue, 10);

    // 유효하지 않은 숫자라면 기본값 사용
    if (isNaN(numValue)) {
      numValue = defaultValue;
    }

    // 범위 검증
    numValue = Math.min(max, Math.max(min, numValue));

    // 로컬 상태 업데이트
    if (dimension === 'left') setFrameInputLeft(String(numValue));
    else if (dimension === 'right') setFrameInputRight(String(numValue));
    else setFrameInputTop(String(numValue));

    // Store 업데이트
    updateFrameSize(dimension, numValue);
  };

  const handleFrameInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, dimension: 'left' | 'right' | 'top', min: number, max: number, defaultValue: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const inputValue = dimension === 'left' ? frameInputLeft : dimension === 'right' ? frameInputRight : frameInputTop;
      let currentValue = parseInt(inputValue, 10);
      if (isNaN(currentValue)) currentValue = defaultValue;

      const newValue = e.key === 'ArrowUp'
        ? Math.min(max, currentValue + 1)
        : Math.max(min, currentValue - 1);

      if (dimension === 'left') setFrameInputLeft(String(newValue));
      else if (dimension === 'right') setFrameInputRight(String(newValue));
      else setFrameInputTop(String(newValue));

      updateFrameSize(dimension, newValue);
    }
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
      effectiveWidth = effectiveWidth - (spaceInfo.droppedCeiling.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900));
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

// console.log('🔧 Configurator - hasSpecialDualFurniture:', hasSpecialDualFurniture);
// console.log('🔧 Configurator - placedModules:', placedModules);

  // 배치된 가구 중 도어가 있는 가구가 있는지 확인
  const hasDoorsInstalled = placedModules.some(module => module.hasDoor);

  // 프로젝트 데이터 로드
  const loadProject = async (projectId: string) => {
    setLoading(true);

    // 프로젝트 로드 전에 store 초기화 (이전 데이터 제거)
// console.log('🧹 프로젝트 로드 전 store 초기화');
    setPlacedModules([]);

    try {
// console.log('🔄 프로젝트 로드 시작:', projectId);
      const { project, error } = await getProject(projectId);
// console.log('📦 프로젝트 로드 결과:', { project, error });

      if (error) {
        console.error('❌ 프로젝트 로드 에러:', error);
        // 읽기 전용 모드에서는 alert도 표시하지 않음
        const mode = searchParams.get('mode');
        if (mode !== 'readonly') {
          alert('프로젝트를 불러오는데 실패했습니다: ' + error);
          navigate('/');
        } else {
// console.log('👁️ 읽기 전용 모드 - 에러 무시');
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
// console.log('🔍 loadProject에서 설정한 title:', projectTitle);
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
        delete spaceConfig.lockedWallGaps; // 세션 전용
// console.log('🔄 Firebase 프로젝트 로드 시 컬럼 관련 값 초기화');

        // 이전 프로젝트 상태 완전 초기화 후 새 데이터 로드
        resetSpaceInfo();
        setSpaceInfo(spaceConfig);
        setPlacedModules(project.furniture?.placedModules || []);
        setCurrentProjectId(projectId);

        // 프로젝트 소유자 정보 설정
        if (project.userId) {
// console.log('👤 프로젝트 소유자 정보:', {
            // projectUserId: project.userId,
            // currentUserId: user?.uid,
            // isOwner: user && project.userId === user.uid,
            // userName: project.userName,
            // userEmail: project.userEmail,
            // userPhotoURL: project.userPhotoURL,
            // currentUserPhotoURL: user?.photoURL
          // });

          // 프로젝트 소유자가 현재 로그인한 사용자인 경우, 현재 사용자 정보 사용
          if (user && project.userId === user.uid) {
// console.log('📸 현재 사용자 Auth 정보:', {
              // uid: user.uid,
              // displayName: user.displayName,
              // email: user.email,
              // photoURL: user.photoURL,
              // providerData: user.providerData
            // });

            const ownerData = {
              userId: user.uid,
              name: user.displayName || user.email || '소유자',
              photoURL: user.photoURL || undefined
            };
// console.log('👑 소유자 정보 설정 (현재 사용자):', ownerData);
            setProjectOwner(ownerData);
          } else {
            // 다른 사용자의 프로젝트인 경우 저장된 정보 사용
            const ownerData = {
              userId: project.userId,
              name: project.userName || project.userEmail || '소유자',
              photoURL: project.userPhotoURL
            };
// console.log('👑 소유자 정보 설정 (저장된 정보):', ownerData);
            setProjectOwner(ownerData);
          }
        }

        // 디자인파일명 설정은 별도 useEffect에서 처리됨

// console.log('✅ 프로젝트 로드 성공:', project.title);
// console.log('🪑 배치된 가구 개수:', project.furniture?.placedModules?.length || 0);
// console.log('🎨 로드된 materialConfig:', project.spaceConfig.materialConfig);

        // 프로젝트 로드 후 derivedSpaceStore 명시적 재계산
// console.log('🔄 [프로젝트 로드 후] derivedSpaceStore 강제 재계산');
        derivedSpaceStore.recalculateFromSpaceInfo(project.spaceConfig);

        // 프로젝트 로드 후 isDirty 초기화 (로드 시 설정된 dirty 플래그 리셋)
        useProjectStore.getState().markAsSaved();
        useSpaceConfigStore.getState().markAsSaved();
        useFurnitureStore.getState().markAsSaved();
      }
    } catch (error) {
      console.error('프로젝트 로드 실패:', error);
      // 읽기 전용 모드에서는 alert도 표시하지 않음
      const mode = searchParams.get('mode');
      if (mode !== 'readonly') {
        alert('프로젝트 로드 중 오류가 발생했습니다.');
        navigate('/');
      } else {
// console.log('👁️ 읽기 전용 모드 - 에러 무시');
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

  // lockedWallGaps는 세션 전용 — Firebase에 저장하지 않음
  const stripSessionOnlyFields = (si: any) => {
    if (!si || typeof si !== 'object') return si;
    const { lockedWallGaps, ...rest } = si;
    return rest;
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
// console.log('💾 [DEBUG] saveProject 함수 시작');

    // 중복 저장 방지
    if (saveInProgressRef.current) {
// console.log('⚠️ 저장이 이미 진행 중 - 중복 호출 무시');
      return;
    }
    saveInProgressRef.current = true;

    // 읽기 전용 모드에서는 저장 불가
    if (isReadOnly) {
// console.log('🚫 읽기 전용 모드 - 저장 차단');
      // alert('읽기 전용 모드에서는 저장할 수 없습니다.');
      saveInProgressRef.current = false;
      return;
    }

    // URL 파라미터에서 직접 읽기 (상태가 아직 업데이트되지 않았을 수 있음)
    const urlProjectId = searchParams.get('projectId') || searchParams.get('id') || searchParams.get('project');
    const urlDesignFileId = searchParams.get('designFileId');

    // currentProjectId가 없으면 URL에서 가져오기
    const effectiveProjectId = currentProjectId || urlProjectId;
    const effectiveDesignFileId = currentDesignFileId || urlDesignFileId;

// console.log('💾 [DEBUG] 현재 프로젝트 ID:', currentProjectId);
// console.log('💾 [DEBUG] URL 프로젝트 ID:', urlProjectId);
// console.log('💾 [DEBUG] 사용할 프로젝트 ID:', effectiveProjectId);
// console.log('💾 [DEBUG] 현재 디자인파일 ID:', currentDesignFileId);
// console.log('💾 [DEBUG] URL 디자인파일 ID:', urlDesignFileId);
// console.log('💾 [DEBUG] 사용할 디자인파일 ID:', effectiveDesignFileId);
// console.log('💾 [DEBUG] Firebase 설정:', isFirebaseConfigured());
// console.log('💾 [DEBUG] 사용자 상태:', !!user);
// console.log('💾 [DEBUG] 사용자 정보:', user ? { email: user.email, uid: user.uid } : 'null');

    // Firebase 연결 및 인증 상태 테스트
    try {
      const { db, auth } = await import('@/firebase/config');
// console.log('💾 [DEBUG] Firestore db 객체:', !!db);
// console.log('💾 [DEBUG] Auth 객체:', !!auth);

      // 현재 인증 상태 확인
      const currentAuthUser = auth.currentUser;
// console.log('💾 [DEBUG] auth.currentUser:', {
        // exists: !!currentAuthUser,
        // uid: currentAuthUser?.uid,
        // email: currentAuthUser?.email
      // });

      // 토큰 확인
      if (currentAuthUser) {
        try {
          const token = await currentAuthUser.getIdToken();
// console.log('💾 [DEBUG] 사용자 토큰 획득 성공');
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
      saveInProgressRef.current = false;
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
// console.log('💾 [DEBUG] 저장할 basicInfo:', basicInfo);
// console.log('💾 [DEBUG] 저장할 spaceInfo 요약:', {
        // width: spaceInfo.width,
        // height: spaceInfo.height,
        // materialConfig: spaceInfo.materialConfig
      // });

      // furnitureStore의 현재 상태 직접 확인
      const currentFurnitureState = useFurnitureStore.getState().placedModules;
// console.log('💾 [DEBUG] furnitureStore 현재 상태:', {
        // storeCount: currentFurnitureState.length,
        // propCount: placedModules.length,
        // 같은가: currentFurnitureState === placedModules,
        // storeModules: currentFurnitureState.map(m => ({
          // id: m.id,
          // moduleId: m.moduleId,
          // isUpperCabinet: m.moduleId?.includes('upper-cabinet'),
          // isLowerCabinet: m.moduleId?.includes('lower-cabinet')
        // }))
      // });

// console.log('💾 [DEBUG] 저장할 placedModules 개수:', placedModules.length);
// console.log('💾 [DEBUG] 저장할 placedModules 상세:', placedModules.map(m => {
//         const moduleData = m.moduleId ? getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo) : null;
//         return {
//           id: m.id,
//           moduleId: m.moduleId,
//           category: moduleData?.category || 'unknown',
//           slotIndex: m.slotIndex,
//           position: m.position,
//           zone: m.zone,
//           hasDoor: m.hasDoor,
//           customDepth: m.customDepth,
//           customWidth: m.customWidth
//         };
//       }));

      // 썸네일 생성
      let thumbnail;
      try {
        thumbnail = await captureProjectThumbnail();
        if (!thumbnail) {
// console.log('💾 [DEBUG] 3D 캔버스 캡처 실패, 기본 썸네일 생성');
          thumbnail = generateDefaultThumbnail(spaceInfo, placedModules.length);
        }
// console.log('💾 [DEBUG] 썸네일 생성 완료');
      } catch (thumbnailError) {
        console.error('💾 [DEBUG] 썸네일 생성 실패:', thumbnailError);
        thumbnail = null;
      }

      const firebaseConfigured = isFirebaseConfigured();

      if (firebaseConfigured && user) {
// console.log('💾 [DEBUG] Firebase 저장 모드 진입');

        try {
          // 디자인 파일이 있으면 디자인 파일 업데이트, 없으면 새로 생성
          if (effectiveDesignFileId) {
// console.log('💾 [DEBUG] 기존 디자인 파일 업데이트');
            const { updateDesignFile } = await import('@/firebase/projects');

            const updatePayload = {
              name: currentDesignFileName || basicInfo.title,
              projectData: removeUndefinedValues(basicInfo),
              spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
              furniture: {
                placedModules: removeUndefinedValues(placedModules)
              },
              thumbnail: thumbnail
            };

// console.log('💾 [DEBUG] updateDesignFile 호출 전 데이터:', {
              // name: updatePayload.name,
              // spaceConfigKeys: Object.keys(updatePayload.spaceConfig || {}),
              // furnitureCount: updatePayload.furniture.placedModules.length,
              // hasThumbnail: !!updatePayload.thumbnail,
              // furnitureDetails: updatePayload.furniture.placedModules.map(m => {
                // const moduleData = m.moduleId ? getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo) : null;
                // return {
                  // id: m.id,
                  // moduleId: m.moduleId,
                  // category: moduleData?.category || 'unknown',
                  // slotIndex: m.slotIndex,
                  // zone: m.zone,
                  // hasDoor: m.hasDoor,
                  // isUpperCabinet: m.moduleId?.includes('upper-cabinet'),
                  // isLowerCabinet: m.moduleId?.includes('lower-cabinet')
                // };
              // })
            // });

// console.log('💾 [DEBUG] updateDesignFile 호출 직전, ID:', effectiveDesignFileId);

            if (!effectiveDesignFileId) {
              console.error('💾 [ERROR] 디자인 파일 ID가 없습니다!');
              console.error('💾 [ERROR] effectiveDesignFileId:', effectiveDesignFileId);
              setSaveStatus('error');
              alert('디자인 파일 ID가 없습니다. 새 디자인을 생성하거나 기존 디자인을 선택해주세요.');
              return;
            }

            const result = await updateDesignFile(effectiveDesignFileId, updatePayload);
// console.log('💾 [DEBUG] updateDesignFile 결과:', result);

            if (result.error) {
              console.error('💾 [ERROR] 디자인 파일 업데이트 실패:', result.error);
              console.error('💾 [ERROR] 전체 결과 객체:', result);
              setSaveStatus('error');
              alert('디자인 파일 저장에 실패했습니다: ' + result.error);
            } else {
              // 디자인 파일 저장 성공 후 프로젝트도 업데이트 (공유 링크와 미리보기 모달에서 가구가 보이도록)
// console.log('💾 프로젝트에도 가구 데이터 저장 시작');
              try {
                const projectUpdateResult = await updateProject(effectiveProjectId, {
                  furniture: {
                    placedModules: removeUndefinedValues(placedModules)
                  },
                  spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo))
                }, thumbnail);

                if (projectUpdateResult.error) {
                  console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateResult.error);
                } else {
// console.log('✅ 프로젝트에도 가구 데이터 저장 완료');
                }
              } catch (projectUpdateError) {
                console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateError);
              }

              setSaveStatus('success');
              useProjectStore.getState().markAsSaved();
              useSpaceConfigStore.getState().markAsSaved();
              useFurnitureStore.getState().markAsSaved();
// console.log('✅ 디자인 파일 저장 성공');

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
// console.log('🔗 저장 후 URL 업데이트:', newUrl);
              }

              // BroadcastChannel로 디자인 파일 업데이트 알림 (readonly 모드에서는 전송하지 않음)
// console.log('💾 [DEBUG] BroadcastChannel 전송 체크:', { isReadOnly, mode: searchParams.get('mode') });
              if (!isReadOnly) {
                try {
                  const channel = new BroadcastChannel('project-updates');
                  channel.postMessage({
                    type: 'DESIGN_FILE_UPDATED',
                    projectId: effectiveProjectId,
                    designFileId: effectiveDesignFileId,
                    timestamp: Date.now()
                  });
// console.log('📡 디자인 파일 업데이트 알림 전송');
                  channel.close();
                } catch (broadcastError) {
                  console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
                }
              } else {
// console.log('🚫 readonly 모드 - BroadcastChannel 전송 건너뜀');
              }
            }
          } else {
// console.log('💾 [DEBUG] 새 디자인 파일 생성');
            const { createDesignFile } = await import('@/firebase/projects');
            const { id: designFileId, error } = await createDesignFile({
              name: basicInfo.title || '새 디자인',
              projectId: effectiveProjectId,
              projectData: removeUndefinedValues(basicInfo),
              spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
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
// console.log('💾 프로젝트에도 가구 데이터 저장 시작');
              try {
                const projectUpdateResult = await updateProject(effectiveProjectId, {
                  furniture: {
                    placedModules: removeUndefinedValues(placedModules)
                  },
                  spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo))
                }, thumbnail);

                if (projectUpdateResult.error) {
                  console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateResult.error);
                } else {
// console.log('✅ 프로젝트에도 가구 데이터 저장 완료');
                }
              } catch (projectUpdateError) {
                console.warn('⚠️ 프로젝트 업데이트 실패 (디자인 파일은 저장됨):', projectUpdateError);
              }

              setCurrentDesignFileId(designFileId);
              setCurrentDesignFileName('새 디자인');
              setSaveStatus('success');
              useProjectStore.getState().markAsSaved();
              useSpaceConfigStore.getState().markAsSaved();
              useFurnitureStore.getState().markAsSaved();
// console.log('✅ 새 디자인 파일 생성 및 저장 성공');

              // 첫 저장 후 탭에 designFileId 반영
              if (effectiveProjectId) {
                useUIStore.getState().addTab({
                  projectId: effectiveProjectId,
                  projectName: basicInfo.title || '프로젝트',
                  designFileId,
                  designFileName: basicInfo.title || '새 디자인',
                });
              }

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
// console.log('📡 새 디자인 파일 생성 알림 전송');
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
// console.log('🔗 새 디자인 파일 생성 후 URL 업데이트');
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
// console.log('💾 [DEBUG] BroadcastChannel 알림 전송 완료');
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
// console.log('💾 [DEBUG] Firebase 인증 필요');
        setSaveStatus('error');
        alert('저장하려면 로그인이 필요합니다.');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (outerError) {
      console.error('💾 [ERROR] saveProject 최상위 예외:', outerError);
      setSaveStatus('error');
      alert('프로젝트 저장 중 예상치 못한 오류가 발생했습니다: ' + outerError.message);
    } finally {
// console.log('💾 [DEBUG] saveProject 완료, 저장 상태 해제');
      setSaving(false);
      saveInProgressRef.current = false;
    }
  };

  // 새 디자인 생성 함수 (현재 프로젝트 내에)
  // 새 디자인 모달 열기
  const handleNewDesign = async () => {
    // 현재 작업 자동 저장
    try { await saveProject(); } catch { /* ignore */ }

    // 프로젝트 목록 로드
    if (user) {
      try {
        const result = await getUserProjects(user.uid);
        if (result.projects) {
          setNewDesignProjects(result.projects.filter(p => !p.isDeleted));
        }
      } catch { /* ignore */ }
    }
    setNewDesignProjectId(currentProjectId);
    setNewDesignName('');
    setIsNewDesignModalOpen(true);
  };

  // 새 디자인 생성 실행
  const handleNewDesignSubmit = async () => {
    if (!newDesignName.trim() || !newDesignProjectId || isCreatingNewDesign) return;

    setIsCreatingNewDesign(true);
    try {
      const defaultSpaceConfig = {
        width: DEFAULT_SPACE_VALUES.WIDTH,
        height: DEFAULT_SPACE_VALUES.HEIGHT,
        depth: DEFAULT_SPACE_VALUES.DEPTH,
        installType: 'builtin' as const,
        wallConfig: { left: true, right: true },
        hasFloorFinish: false,
        columns: [],
        walls: [],
        panelBs: []
      };

      const createData: any = {
        name: newDesignName.trim(),
        projectId: newDesignProjectId,
        spaceConfig: defaultSpaceConfig,
        furniture: { placedModules: [] }
      };
      // 같은 프로젝트 내에서 생성 시 현재 폴더 유지
      if (currentFolderId && newDesignProjectId === currentProjectId) {
        createData.folderId = currentFolderId;
      }
      const result = await createDesignFile(createData);

      if (result.error) {
        alert('새 디자인 생성에 실패했습니다: ' + result.error);
        return;
      }

      if (result.id) {
        setIsNewDesignModalOpen(false);

        // 탭 추가
        const project = newDesignProjects.find(p => p.id === newDesignProjectId);
        useUIStore.getState().addTab({
          projectId: newDesignProjectId,
          projectName: project?.title || newDesignProjectId,
          designFileId: result.id,
          designFileName: newDesignName.trim(),
        });

        // 새 디자인으로 이동
        navigate(`/configurator?projectId=${newDesignProjectId}&designFileId=${result.id}`, { replace: true });
      }
    } catch (error) {
      console.error('새 디자인 생성 중 오류:', error);
      alert('새 디자인 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingNewDesign(false);
    }
  };

  // 새 프로젝트 생성 함수
  const handleNewProject = async () => {
// console.log('🆕 [DEBUG] handleNewProject 함수 시작');

    try {
      const confirmed = confirm('현재 작업 내용이 사라집니다. 새 디자인을 시작하시겠습니까?');
// console.log('🆕 [DEBUG] 사용자 확인 응답:', confirmed);

      if (!confirmed) {
// console.log('🆕 [DEBUG] 사용자가 취소함');
        return;
      }

// console.log('🆕 [DEBUG] 새 프로젝트 생성 시작');
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

// console.log('🆕 [DEBUG] 기본 설정 준비됨:', defaultSpaceConfig);

      // 썸네일 생성
      let thumbnail;
      try {
        thumbnail = generateDefaultThumbnail(defaultSpaceConfig, 0);
// console.log('🆕 [DEBUG] 썸네일 생성 성공');
      } catch (thumbnailError) {
        console.error('🆕 [DEBUG] 썸네일 생성 실패:', thumbnailError);
        thumbnail = null;
      }

      const firebaseConfigured = isFirebaseConfigured();
// console.log('🆕 [DEBUG] Firebase 설정 확인:', firebaseConfigured);
// console.log('🆕 [DEBUG] 사용자 로그인 상태:', !!user);
// console.log('🆕 [DEBUG] 사용자 정보:', user ? { email: user.email, uid: user.uid } : 'null');

      if (firebaseConfigured && user) {
// console.log('🆕 [DEBUG] Firebase 모드로 진행');

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

// console.log('🆕 [DEBUG] createProject 호출 시작, 정리된 데이터:', projectData);
          const result = await createProject(projectData);
// console.log('🆕 [DEBUG] createProject 결과:', result);

          if (result.error) {
            console.error('🆕 [ERROR] Firebase 프로젝트 생성 실패:', result.error);
            alert('새 프로젝트 생성에 실패했습니다: ' + result.error);
            return;
          }

          if (result.id) {
// console.log('🆕 [DEBUG] Firebase 프로젝트 생성 성공:', result.id);

            // 상태 업데이트
            setBasicInfo({ title: 'Untitled', location: '' });
            resetSpaceInfo();
            setSpaceInfo(defaultSpaceConfig);
            setPlacedModules([]);
            setCurrentProjectId(result.id);

            // derivedSpaceStore 재계산
            derivedSpaceStore.recalculateFromSpaceInfo(defaultSpaceConfig);

            // URL 업데이트
            navigate(`/configurator?projectId=${result.id}`, { replace: true });

// console.log('✅ 새 Firebase 프로젝트 "Untitled" 생성 완료:', result.id);
            // alert('새 프로젝트가 생성되었습니다!');
          } else {
            console.error('🆕 [ERROR] projectId가 반환되지 않음');
            alert('프로젝트 ID를 받지 못했습니다. 다시 시도해주세요.');
          }
        } catch (firebaseError) {
          console.error('🆕 [ERROR] Firebase 작업 중 예외:', firebaseError);
          alert('Firebase 연결 중 오류가 발생했습니다: ' + firebaseError.message);
        }
      } else {
// console.log('🆕 [ERROR] Firebase 인증 필요');
        // alert('새 프로젝트를 생성하려면 로그인이 필요합니다.');
      }
    } catch (outerError) {
      console.error('🆕 [ERROR] handleNewProject 최상위 예외:', outerError);
      alert('새 프로젝트 생성 중 예상치 못한 오류가 발생했습니다: ' + outerError.message);
    } finally {
// console.log('🆕 [DEBUG] handleNewProject 완료, 저장 상태 해제');
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
// console.log('📸 3D 캔버스 캡처 실패, 기본 썸네일 생성');
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
            spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
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
            useProjectStore.getState().markAsSaved();
            useSpaceConfigStore.getState().markAsSaved();
            useFurnitureStore.getState().markAsSaved();

            // URL 업데이트 - 프로젝트ID와 디자인파일ID 모두 포함
            navigate(`/configurator?projectId=${projectIdToUse}&designFileId=${designFileId}`, { replace: true });

// console.log('✅ 디자인 파일 다른이름으로 저장 성공:', newTitle);
            // alert(`"${newTitle}" 디자인 파일로 저장되었습니다!`);
          }
        } else {
// console.log('💾 [ERROR] Firebase 인증 필요');
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

    // 탭의 프로젝트명도 업데이트
    if (currentProjectId && currentDesignFileId) {
      const tabId = `${currentProjectId}_${currentDesignFileId}`;
      useUIStore.getState().updateTab(tabId, { projectName: newName });
    }

    // 프로젝트가 저장된 상태라면 자동 저장
    if (currentProjectId) {
      setSaving(true);
      try {
        if (isFirebaseConfigured() && user) {
          const { error } = await updateProject(currentProjectId, {
            title: newName,
            projectData: removeUndefinedValues({ ...basicInfo, title: newName }),
            spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
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

// console.log('✅ 프로젝트 이름 변경 성공:', newName);
        } else {
// console.log('💾 [ERROR] Firebase 인증 필요');
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
// console.log('📝 디자인파일명 변경 시작:', {
      // oldName: currentDesignFileName,
      // newName,
      // currentDesignFileId
    // });

    const oldName = currentDesignFileName;

    // 즉시 UI 업데이트
    setCurrentDesignFileName(newName);
// console.log('✅ currentDesignFileName 상태 업데이트:', newName);

    // 탭 이름도 업데이트
    if (currentProjectId && currentDesignFileId) {
      const tabId = `${currentProjectId}_${currentDesignFileId}`;
      useUIStore.getState().updateTab(tabId, { designFileName: newName });
    }

    // URL 파라미터도 업데이트
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('designFileName', encodeURIComponent(newName));
    const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
    window.history.replaceState({}, '', newUrl);
// console.log('🔗 디자인파일명 변경 후 URL 업데이트:', newUrl);

    // 디자인 파일이 저장된 상태라면 자동 저장
    if (currentDesignFileId) {
      setSaving(true);
      try {
        if (isFirebaseConfigured() && user) {
          const { updateDesignFile } = await import('@/firebase/projects');
          const { error } = await updateDesignFile(currentDesignFileId, {
            name: newName,
            projectData: removeUndefinedValues(basicInfo),
            spaceConfig: removeUndefinedValues(stripSessionOnlyFields(spaceInfo)),
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

// console.log('✅ 디자인 파일명 변경 성공:', newName);

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
// console.log('📡 디자인 파일명 변경 알림 전송:', {
                // projectId: effectiveProjectId,
                // designFileId: effectiveDesignFileId
              // });
              channel.close();
            } catch (broadcastError) {
              console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
            }
          }
        } else {
// console.log('💾 [ERROR] Firebase 인증 필요');
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

// console.log('🔍 URL에서 가져온 designFileName:', designFileName);
// console.log('🔍 현재 currentDesignFileName:', currentDesignFileName);

    // URL에 designFileName이 있으면 설정
    if (designFileName) {
      const decodedFileName = decodeURIComponent(designFileName);
      setCurrentDesignFileName(decodedFileName);
// console.log('📝 URL 파라미터로 디자인파일명 설정:', decodedFileName);
    }
    // currentDesignFileName이 이미 있으면 유지 (덮어쓰지 않음)
    else if (!currentDesignFileName) {
      setCurrentDesignFileName('새 디자인');
// console.log('📝 기본값으로 디자인파일명 설정: 새 디자인');
    }
  }, [searchParams]);

  // 단내림 상태 변경 감지 및 컬럼 수 리셋
  useEffect(() => {
    // 이전 상태를 추적하기 위한 ref가 필요하지만, 여기서는 단순히 비활성화될 때 처리
    if (!spaceInfo.droppedCeiling?.enabled && spaceInfo.customColumnCount) {
      const internalSpace = calculateInternalSpace(spaceInfo);
      const defaultColumnCount = SpaceCalculator.getDefaultColumnCount(internalSpace.width);

// console.log('🔧 [Configurator] Dropped ceiling disabled, checking column count:', {
        // currentColumnCount: spaceInfo.customColumnCount,
        // defaultColumnCount,
        // internalWidth: internalSpace.width
      // });

      // 현재 컬럼 수가 기본값과 다르면 리셋
      if (spaceInfo.customColumnCount !== defaultColumnCount) {
// console.log('🔧 [Configurator] Resetting column count to default:', defaultColumnCount);
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
// console.log('✅ readonly 모드 - 이미 로드 완료, useEffect 재실행 건너뜀 (무한 루프 방지)');
      return;
    }

    // 읽기 전용 모드는 useMemo로 계산됨 (상태 업데이트 제거로 리로드 루프 방지)
    if (mode === 'readonly') {
// console.log('👁️ 읽기 전용 모드 활성화 (useMemo로 처리됨)');
    }

// console.log('🔍 useEffect 실행:', {
      // urlProjectId: projectId,
      // urlDesignFileId: designFileId,
      // urlDesignFileName,
      // mode,
      // isReadOnly: mode === 'readonly',
      // currentProjectId,
      // currentDesignFileId,
      // placedModulesCount: placedModules.length
    // });

    // URL에 designFileName이 있으면 즉시 설정 (최우선순위)
    if (urlDesignFileName) {
      const decodedFileName = decodeURIComponent(urlDesignFileName);
// console.log('🔗 URL에서 디자인파일명 바로 설정:', decodedFileName);
      setCurrentDesignFileName(decodedFileName);
    }

    // CNC에서 돌아오는 경우 - 이미 데이터가 로드되어 있으면 재로드하지 않음
    // 상태 업데이트 전에 먼저 체크해야 함!
    const isSameProject = projectId && projectId === currentProjectId;
    const isSameDesignFile = designFileId && designFileId === currentDesignFileId;
    const hasLoadedData = placedModules.length > 0 || spaceInfo.width > 0;

    if (isSameProject && isSameDesignFile && hasLoadedData && !skipLoad && mode !== 'new-design') {
// console.log('✅ 이미 로드된 프로젝트 - 재로드하지 않음 (CNC에서 복귀)');

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
// console.log('📝 프로젝트 ID 업데이트:', projectId);
      }

      // designFileId가 변경된 경우에만 상태 업데이트
      if (designFileId && designFileId !== currentDesignFileId) {
        setCurrentDesignFileId(designFileId);
// console.log('📝 디자인파일 ID 업데이트:', designFileId);
      }
    } else {
// console.log('👁️ readonly 모드 - ID 상태 업데이트 건너뜀 (리로드 루프 방지)');
    }

    if (projectId) {
      if (skipLoad || isNewDesign) {
        // Step 1-3에서 넘어온 경우 또는 새 디자인 생성 또는 CNC에서 복귀 - 이미 스토어에 데이터가 설정되어 있음
// console.log('✅ skipLoad=true 또는 design=new - 기존 스토어 데이터 유지');

        // skipLoad 파라미터를 URL에서 제거 (새로고침 시 정상 로드되도록)
        if (skipLoad) {
          const currentParams = new URLSearchParams(window.location.search);
          currentParams.delete('skipLoad');
          const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
          window.history.replaceState({}, '', newUrl);
        }

        // ID 동기화
        if (projectId) setCurrentProjectId(projectId);
        if (designFileId) setCurrentDesignFileId(designFileId);

        // 로딩 완료 처리
        setTimeout(() => {
          setLoading(false);
        }, 500); // 로딩 화면이 보이도록 약간의 지연
      } else if (mode === 'new-design') {
        // 기존 프로젝트에 새 디자인 생성하는 경우 - 프로젝트명만 가져오기
// console.log('🎨 기존 프로젝트에 새 디자인 생성:', projectId);

        // 프로젝트명만 가져와서 헤더에 표시하기 위해
        getProject(projectId).then(({ project, error }) => {
          if (project && !error) {
// console.log('🔍 setBasicInfo 호출 전 basicInfo:', basicInfo);
// console.log('🔍 설정할 프로젝트명:', project.title);

            setBasicInfo({ title: project.title });
// console.log('📝 프로젝트명 설정:', project.title);

            // 읽기 전용 모드에서는 URL 변경 금지
            if (mode !== 'readonly') {
              // URL에 프로젝트명이 없으면 추가 (새로고침 시 유지하기 위해)
              const currentParams = new URLSearchParams(window.location.search);
              if (!currentParams.get('projectName')) {
                currentParams.set('projectName', encodeURIComponent(project.title));
                const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                window.history.replaceState({}, '', newUrl);
// console.log('🔗 URL에 프로젝트명 추가:', newUrl);
              }
            } else {
// console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
            }
          }
          setLoading(false);
        });
      } else if (designFileId && !skipLoad) {
        // readonly 모드에서 이미 로드된 디자인이면 재로드하지 않음 (2중 렌더링 방지)
        const isAlreadyLoaded = designFileId === currentDesignFileId && (placedModules.length > 0 || spaceInfo.width > 0);
        if (isAlreadyLoaded && mode === 'readonly') {
// console.log('✅ readonly 모드 - 이미 로드된 디자인 재사용 (2중 렌더링 방지):', designFileId);
          setLoading(false);
          return;
        }

        // designFileId가 있는 경우 디자인 파일 데이터 로드
        const isReadOnlyMode = mode === 'readonly';
// console.log('📂 디자인파일 데이터 로드 시작:', {
//           designFileId,
//           projectId,
//           isReadOnlyMode,
//           currentDesignFileId,
//           currentProjectId
//         });

        // readonly 모드에서는 항상 Public API 사용 (권한 체크 없이 접근)
        import('@/firebase/projects').then(({ getDesignFileByIdPublic, getProjectByIdPublic }) => {
// console.log('🔥 getDesignFileByIdPublic 호출 (readonly 모드):', designFileId);
          getDesignFileByIdPublic(designFileId).then(async ({ designFile, error }) => {
            // readonly 모드에서는 데이터 로드 전에 ref 먼저 설정 (setState 리렌더링 차단)
            if (mode === 'readonly') {
              hasLoadedInReadonlyRef.current = true;
// console.log('✅ readonly 모드 - ref 먼저 설정 (setState 리렌더링 차단)');
            }

            if (designFile && !error) {
// console.log('✅ 디자인파일 로드 성공:', {
                // id: designFile.id,
                // name: designFile.name,
                // projectId: designFile.projectId,
                // furnitureCount: designFile.furniture?.placedModules?.length || 0,
                // spaceConfig: !!designFile.spaceConfig
              // });

              // 프로젝트 기본 정보 설정 - projectId로 프로젝트 정보 가져오기
              if (designFile.projectId) {
                const { project, error: projectError } = await getProjectByIdPublic(designFile.projectId);
                if (project && !projectError) {
                  setBasicInfo({ title: project.title });
// console.log('📝 프로젝트 데이터 설정:', project.title);

                  // 프로젝트 소유자 정보 설정
                  if (project.userId) {
// console.log('👤 [디자인파일] 프로젝트 소유자 정보:', {
                      // projectUserId: project.userId,
                      // currentUserId: user?.uid,
                      // isOwner: user && project.userId === user.uid,
                      // userName: project.userName,
                      // userEmail: project.userEmail,
                      // userPhotoURL: project.userPhotoURL,
                      // currentUserPhotoURL: user?.photoURL
                    // });

                    // 프로젝트 소유자가 현재 로그인한 사용자인 경우, 현재 사용자 정보 사용
                    if (user && project.userId === user.uid) {
                      const ownerData = {
                        userId: user.uid,
                        name: user.displayName || user.email || '소유자',
                        photoURL: user.photoURL || undefined
                      };
// console.log('👑 [디자인파일] 소유자 정보 설정 (현재 사용자):', ownerData);
                      setProjectOwner(ownerData);
                    } else {
                      // 다른 사용자의 프로젝트인 경우 저장된 정보 사용
                      const ownerData = {
                        userId: project.userId,
                        name: project.userName || project.userEmail || '소유자',
                        photoURL: project.userPhotoURL
                      };
// console.log('👑 [디자인파일] 소유자 정보 설정 (저장된 정보):', ownerData);
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
// console.log('🔗 URL에 프로젝트명 추가:', newUrl);
                    }
                  } else {
// console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
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
                // 이전 디자인 파일 상태 완전 초기화 후 새 데이터 로드
                resetSpaceInfo();
                setSpaceInfo(spaceConfig);
// console.log('📐 공간 설정 데이터 설정 (컬럼 관련 값 초기화):', spaceConfig);
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

// console.log('🗄️ [Configurator] 불러온 상하부장 데이터:', {
                  // totalModules: designFile.furniture.placedModules.length,
                  // upperCabinets: upperCabinets.length,
                  // lowerCabinets: lowerCabinets.length,
                  // upperDetails: upperCabinets.map(m => ({
                    // id: m.id,
                    // moduleId: m.moduleId,
                    // slotIndex: m.slotIndex
                  // })),
                  // lowerDetails: lowerCabinets.map(m => ({
                    // id: m.id,
                    // moduleId: m.moduleId,
                    // slotIndex: m.slotIndex
                  // }))
                // });

                // baseModuleType이 없는 경우 추가
                const modulesWithBaseType = designFile.furniture.placedModules.map(m => ({
                  ...m,
                  baseModuleType: m.baseModuleType || m.moduleId.replace(/-[\d.]+$/, '')
                }));

                setPlacedModules(modulesWithBaseType);
// console.log('🪑 가구 배치 데이터 설정:', {
                  // count: modulesWithBaseType.length,
                  // modules: modulesWithBaseType.map(m => ({
                    // id: m.id,
                    // moduleId: m.moduleId,
                    // baseModuleType: m.baseModuleType,
                    // slotIndex: m.slotIndex,
                    // zone: m.zone,
                    // position: m.position
                  // }))
                // });
              } else {
                // 가구 데이터가 없는 경우 빈 배열로 초기화
                setPlacedModules([]);
// console.log('🪑 가구 배치 데이터 초기화 (빈 디자인)');
              }

              // 디자인파일 이름 설정
// console.log('🔍 디자인파일 이름 체크:', {
                // hasName: !!designFile.name,
                // name: designFile.name,
                // designFileKeys: Object.keys(designFile),
                // fullDesignFile: designFile
              // });

              if (designFile.name) {
                setCurrentDesignFileName(designFile.name);
// console.log('📝 디자인파일명 설정:', designFile.name);

                // 디자인 파일 로드 성공 → 탭 추가 (확정된 이름 사용)
                if (projectId && designFileId) {
                  useUIStore.getState().addTab({
                    projectId,
                    projectName: useProjectStore.getState().basicInfo.title || '프로젝트',
                    designFileId,
                    designFileName: designFile.name,
                  });
                }

                // 읽기 전용 모드에서는 URL 변경 금지 (무한 루프 방지)
                if (mode !== 'readonly') {
                  // URL에 디자인파일명이 없으면 추가 (새로고침 시 유지하기 위해)
                  const currentParams = new URLSearchParams(window.location.search);
                  if (!currentParams.get('designFileName')) {
                    currentParams.set('designFileName', encodeURIComponent(designFile.name));
                    const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
                    window.history.replaceState({}, '', newUrl);
// console.log('🔗 URL에 디자인파일명 추가:', newUrl);
                  }
                } else {
// console.log('👁️ 읽기 전용 모드 - URL 변경 건너뜀');
                }
              } else {
                console.error('❌ 디자인파일에 name 필드가 없습니다!');
              }

              // 폴더명 설정 (폴더 데이터에서 이름 조회)
              if (designFile.projectId) {
                try {
                  const folderResult = await loadFolderDataFn(designFile.projectId);
                  if (folderResult.folders && folderResult.folders.length > 0) {
                    let foundFolder = null;
                    // 1차: folderId로 직접 매칭
                    if (designFile.folderId) {
                      foundFolder = folderResult.folders.find(f => f.id === designFile.folderId);
                    }
                    // 2차: folderId가 없으면 children에서 designFileId로 검색
                    if (!foundFolder && designFileId) {
                      foundFolder = folderResult.folders.find(f =>
                        f.children?.some(c => c.id === designFileId)
                      );
                    }
                    setCurrentFolderName(foundFolder ? foundFolder.name : '');
                    setCurrentFolderId(designFile.folderId || (foundFolder ? foundFolder.id : null));
                  } else {
                    setCurrentFolderName('');
                    setCurrentFolderId(designFile.folderId || null);
                  }
                } catch (e) {
                  console.error('폴더명 조회 실패:', e);
                  setCurrentFolderName('');
                  setCurrentFolderId(designFile.folderId || null);
                }
              } else {
                setCurrentFolderName('');
                setCurrentFolderId(designFile.folderId || null);
              }
              // 공간 설정 미완료 감지 → 팝업 표시
              if ((designFile as any).isSpaceConfigured === false && mode !== 'readonly') {
// console.log('⚠️ 공간 설정 미완료 디자인 감지 → 공간 설정 팝업 표시');
                setShowSpaceConfigPopup(true);
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
// console.log('👁️ readonly 모드 - 협업자 정보 조회 건너뜀');
      return;
    }

    if (currentProjectId && currentDesignFileId) {
// console.log('🔍 협업자 정보 조회 시작:', { projectId: currentProjectId, designFileId: currentDesignFileId });
      getProjectCollaborators(currentProjectId)
        .then((collabs) => {
          // 현재 디자인 파일에 접근 권한이 있는 협업자만 필터링
          const filteredCollabs = collabs.filter(collab =>
            collab.designFileIds && collab.designFileIds.includes(currentDesignFileId)
          );
// console.log('✅ 협업자 정보 조회 성공:', {
            // 전체: collabs.length,
            // 현재파일: filteredCollabs.length,
            // 협업자: filteredCollabs
          // });
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

  // 탭 동기화는 useEffect 대신 명시적 호출로만 처리
  // (디자인 파일 로드 성공, 파일트리 클릭, 첫 저장 시에만 addTab 호출)

  // 폴더명 자동 조회 (디자인파일이 폴더에 속한 경우)
  useEffect(() => {
    if (!currentProjectId || !currentDesignFileId || !user) return;
    // 이미 폴더명이 설정되어 있으면 스킵
    if (currentFolderName) return;

    const resolveFolderName = async () => {
      try {
        const folderResult = await loadFolderDataFn(currentProjectId);
        if (folderResult.folders && folderResult.folders.length > 0) {
          const foundFolder = folderResult.folders.find(f =>
            f.children?.some(c => c.id === currentDesignFileId)
          );
          if (foundFolder) {
            setCurrentFolderName(foundFolder.name);
          }
        }
      } catch (e) {
        // 폴더 조회 실패 시 무시
      }
    };
    resolveFolderName();
  }, [currentProjectId, currentDesignFileId, user]);

  // 폴더에서 실제 디자인파일명 찾기 (URL에 designFileId나 designFileName이 없을 때만)
  useEffect(() => {
    const loadActualDesignFileName = async () => {
      // URL 파라미터 확인
      const urlDesignFileName = searchParams.get('designFileName') || searchParams.get('fileName');
      const urlDesignFileId = searchParams.get('designFileId');

      // URL에 디자인파일 정보가 있으면 폴더 lookup 완전히 skip
      if (urlDesignFileName || urlDesignFileId) {
// console.log('⏭️ URL에 디자인파일 정보가 있어서 폴더 lookup skip:', {
//           urlDesignFileName,
//           urlDesignFileId
//         });
        return;
      }

      if (!currentProjectId || !user) return;

      // 이미 디자인파일명이 설정되어 있으면 폴더에서 찾지 않음
      if (currentDesignFileName && currentDesignFileName !== '새로운 디자인') {
// console.log('📝 디자인파일명이 이미 설정되어 있음:', currentDesignFileName);
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
// console.log('📝 폴더에서 찾은 디자인파일명:', firstDesignFile.name);
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
// console.log('🔄 공간 구조가 변경되었습니다. 가구 재배치 실행 중...', {
          // width: prevWithoutMaterial.width !== currentWithoutMaterial.width,
          // height: prevWithoutMaterial.height !== currentWithoutMaterial.height,
          // depth: prevWithoutMaterial.depth !== currentWithoutMaterial.depth,
          // customColumnCount: prevWithoutMaterial.customColumnCount !== currentWithoutMaterial.customColumnCount,
          // droppedCeiling: JSON.stringify(prevWithoutMaterial.droppedCeiling) !== JSON.stringify(currentWithoutMaterial.droppedCeiling),
          // mainDoorCount: prevWithoutMaterial.mainDoorCount !== currentWithoutMaterial.mainDoorCount,
          // droppedCeilingDoorCount: prevWithoutMaterial.droppedCeilingDoorCount !== currentWithoutMaterial.droppedCeilingDoorCount,
          // prevDroppedCeiling: prevWithoutMaterial.droppedCeiling,
          // currentDroppedCeiling: currentWithoutMaterial.droppedCeiling
        // });
        updateFurnitureForNewSpace(previousSpaceInfo, spaceInfo);
      }

      // 이전 상태 업데이트
      setPreviousSpaceInfo(spaceInfo);
    }
  }, [spaceInfo, previousSpaceInfo, updateFurnitureForNewSpace]);

  // derivedSpaceStore 재계산 (구조적 변경 시만 실행)
  useEffect(() => {
// console.log('🔄 derivedSpaceStore 재계산:', {
      // customColumnCount: spaceInfo.customColumnCount,
      // mainDoorCount: spaceInfo.mainDoorCount,
      // width: spaceInfo.width
    // });
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
// console.log('🔧 handleSpaceInfoUpdate called with:', updates);
// console.log('🔧 Current spaceInfo.wallConfig:', spaceInfo.wallConfig);

    // baseConfig.depth 업데이트 감지
    if (updates.baseConfig?.depth !== undefined) {
// console.log('📏 Configurator - baseConfig.depth 업데이트:', {
        // 이전값: spaceInfo.baseConfig?.depth,
        // 새값: updates.baseConfig.depth,
        // 전체baseConfig: updates.baseConfig
      // });
    }

    // mainDoorCount 업데이트 감지
    if (updates.mainDoorCount !== undefined) {
// console.log('🚪 mainDoorCount 업데이트:', {
        // 이전값: spaceInfo.mainDoorCount,
        // 새값: updates.mainDoorCount,
        // 단내림활성화: spaceInfo.droppedCeiling?.enabled
      // });
    }

    // 단내림 설정 변경 감지
    const isDroppedCeilingUpdate = updates.droppedCeiling !== undefined;
    if (isDroppedCeilingUpdate) {
// console.log('🔄 단내림 설정 변경 감지:', updates.droppedCeiling);
    }

    // surroundType 업데이트 시 디버깅
    if (updates.surroundType) {
// console.log('🔧 Configurator - surroundType update:', {
        // previous: spaceInfo.surroundType,
        // new: updates.surroundType,
        // willUpdateStore: true
      // });
    }

    let finalUpdates = { ...updates };

    // installType 하이픈 문제 수정
    if (finalUpdates.installType === 'built-in') {
      finalUpdates.installType = 'builtin';
    }

    // 서라운드 타입 변경 시 프레임 설정 초기화 (실제로 surroundType이 변경된 경우에만)
    if (updates.surroundType && updates.surroundType !== spaceInfo.surroundType) {
      const currentInstallType = finalUpdates.installType || spaceInfo.installType;
      const currentWallConfig = finalUpdates.wallConfig || spaceInfo.wallConfig;
      const newFrameSize = { ...spaceInfo.frameSize, top: spaceInfo.frameSize?.top || 30 };

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
          left: currentWallConfig.left ? 1.5 : 0,
          right: currentWallConfig.right ? 1.5 : 0
        };
      }

      finalUpdates.frameSize = newFrameSize;
// console.log('🔧 서라운드 타입 변경에 따른 프레임 초기화:', {
        // surroundType: updates.surroundType,
        // installType: currentInstallType,
        // frameSize: newFrameSize,
        // gapConfig: finalUpdates.gapConfig
      // });
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
// console.log('🔧 세미스탠딩 프레임 자동 업데이트:', newFrameSize);
    }

    // 설치 타입 변경 시 wallConfig와 프레임 설정 자동 업데이트
    if (updates.installType) {
      // wallConfig가 함께 전달되었으면 그대로 사용, 아니면 자동 설정
      if (updates.wallConfig) {
// console.log('🔧 InstallTypeControls에서 전달된 wallConfig 사용:', updates.wallConfig);
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
// console.log('🔧 자동 설정된 wallConfig:', finalUpdates.wallConfig);
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

// console.log('🔧 설치타입 변경에 따른 wallConfig 및 프레임 자동 업데이트:', {
        // installType: updates.installType,
        // wallConfig: finalUpdates.wallConfig,
        // frameSize: finalUpdates.frameSize
      // });
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
// console.log('🚨🚨🚨 customColumnCount 업데이트:', {
        // 요청값: updates.customColumnCount,
        // 현재값: spaceInfo.customColumnCount,
        // finalUpdates_before: finalUpdates
      // });
      // 사용자가 설정한 값을 그대로 사용
      finalUpdates = { ...finalUpdates, customColumnCount: updates.customColumnCount };
// console.log('🚨🚨🚨 finalUpdates after:', finalUpdates);
    }

    // 단내림이 활성화된 경우 메인 구간의 도어 개수 자동 조정
    if (updates.droppedCeiling?.enabled && !spaceInfo.droppedCeiling?.enabled) {
      // 단내림이 새로 활성화된 경우
      const currentWidth = finalUpdates.width || spaceInfo.width || 4800;
      const droppedWidth = updates.droppedCeiling.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);
      const mainZoneWidth = currentWidth - droppedWidth;
      const frameThickness = 50;
      const normalAreaInternalWidth = mainZoneWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);

      // 현재 도어 개수를 유지하되, 최소 필요 개수 이상으로 조정
      const currentDoorCount = getCurrentColumnCount();
      const adjustedMainDoorCount = Math.max(minRequiredSlots, currentDoorCount);
// console.log(`🔧 단내림 활성화 시 메인 구간 도어 개수 설정: ${currentDoorCount} → ${adjustedMainDoorCount}`);
      finalUpdates = { ...finalUpdates, mainDoorCount: adjustedMainDoorCount };

      // 단내림 구간 도어개수 기본값 설정
      const droppedFrameThickness = 50;
      const droppedInternalWidth = droppedWidth - droppedFrameThickness;
      const droppedMinSlots = Math.max(1, Math.ceil(droppedInternalWidth / MAX_SLOT_WIDTH));
      const droppedMaxSlots = Math.max(droppedMinSlots, Math.floor(droppedInternalWidth / 400));
      const droppedDefaultCount = droppedMinSlots;

// console.log(`🔧 단내림 활성화 시 단내림 구간 도어개수 기본값 설정: ${droppedDefaultCount}`, {
//         droppedWidth,
//         droppedInternalWidth,
//         droppedMinSlots,
//         droppedMaxSlots
//       });

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
// console.log(`🔧 단내림 폭 변경 시 도어개수 자동 조정: ${currentDoorCount} → ${adjustedDoorCount}`);
        finalUpdates = { ...finalUpdates, droppedCeilingDoorCount: adjustedDoorCount };
      }
    }

    // 노서라운드 빌트인 모드에서 컬럼 수 변경 시 자동 이격거리 계산
    // 최적화 로직이 비활성화(if false)되어 있어 optimizedGapConfig가 기존 gapConfig를 그대로 반환하므로
    // gapConfig를 덮어쓰면 middle/top 등 추가 필드가 유실됨 → 비활성화
    // if (spaceInfo.surroundType === 'no-surround' && ...) { ... }

// console.log('🔧 최종 업데이트 적용:', {
      // updates: finalUpdates,
      // hasWallConfig: !!finalUpdates.wallConfig,
      // wallConfig: finalUpdates.wallConfig,
      // customColumnCount: finalUpdates.customColumnCount,
      // gapConfig: finalUpdates.gapConfig
    // });

    // installType 변경 감지
    const isInstallTypeChanged = finalUpdates.installType !== undefined &&
      finalUpdates.installType !== spaceInfo.installType;

// console.log('🚨🚨🚨 setSpaceInfo 호출 직전:', finalUpdates);
// console.log('📏 baseConfig.depth 전달 확인:', {
      // finalUpdates_baseConfig: finalUpdates.baseConfig,
      // depth: finalUpdates.baseConfig?.depth
    // });
    setSpaceInfo(finalUpdates);
// console.log('🚨🚨🚨 setSpaceInfo 호출 완료');

    // Store 업데이트 직후 확인
    setTimeout(() => {
      const currentStore = useSpaceConfigStore.getState();
// console.log('📏 Store 업데이트 후 확인:', {
        // baseConfig: currentStore.baseConfig,
        // depth: currentStore.baseConfig?.depth
      // });
    }, 0);

    // 단내림 설정 변경 시 강제로 3D 뷰 업데이트
    if (isDroppedCeilingUpdate) {
// console.log('🔄 단내림 설정 변경으로 3D 뷰 강제 업데이트');
      // 강제로 뷰 모드를 다시 설정하여 리렌더링 트리거
      setTimeout(() => {
        setViewMode(viewMode);
      }, 0);
    }

    // installType 변경 시 가구 너비 재계산
    if (isInstallTypeChanged && placedModules.length > 0) {
// console.log('🔧 InstallType 변경 - 가구 너비 재계산');
      // 약간의 지연을 두어 SpaceInfo가 먼저 업데이트되도록 함
      setTimeout(() => {
        const newSpaceInfo = { ...spaceInfo, ...finalUpdates };
        updateFurnitureForNewSpace(spaceInfo, newSpaceInfo);
      }, 100);
    }
  };

  // 도어 설치/제거 핸들러
  const handleDoorInstallation = () => {
// console.log('🚪 도어 설치/제거 핸들러 호출:', {
//       hasDoorsInstalled,
//       placedModulesCount: placedModules.length,
//       doorsOpen
//     });

    if (hasDoorsInstalled) {
      // 도어 제거: 모든 가구에서 도어 제거
// console.log('🚪 도어 제거 시도');
      setAllDoors(false);
    } else {
      // 도어 설치: 모든 가구에 도어 설치 (닫힌 상태로 설치)
// console.log('🚪 도어 설치 시도');
      setAllDoors(true);

      // 도어 설치 시 닫힌 상태로 유지
      if (doorsOpen !== null) {
        setDoorsOpen(null); // 개별 상태로 리셋
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
// console.log('🗑️ 빈 디자인 파일 삭제:', currentDesignFileId);
      try {
        const { deleteDesignFile } = await import('@/firebase/projects');
        await deleteDesignFile(currentDesignFileId, currentProjectId);
// console.log('✅ 빈 디자인 파일 삭제 완료');
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
// console.log('도면 편집기 열기');
    setShowPDFPreview(true);
  };

  const handleLogout = () => {
    // 읽기 전용 모드에서는 로그아웃 불가
    if (isReadOnly) {
// console.log('👁️ 읽기 전용 모드 - 로그아웃 차단');
      return;
    }
    navigate('/login');
  };

  const handleProfile = () => {
// console.log('프로필');
  };

  // FileTree 토글 핸들러
  const handleFileTreeToggle = async () => {
    const willOpen = !isFileTreeOpen;
    setIsFileTreeOpen(willOpen);
    // 파일트리 열릴 때 프로젝트 목록 로드
    if (willOpen && user) {
      if (fileTreeProjects.length === 0) {
        try {
          const result = await getUserProjects(user.uid);
          setFileTreeProjects(result.projects || []);
        } catch (err) {
          console.error('파일트리 프로젝트 로드 에러:', err);
        }
      }
      // 현재 프로젝트의 디자인 파일 자동 로드
      const currentPid = searchParams.get('projectId');
      if (currentPid && !fileTreeSelectedProjectId) {
        setFileTreeSelectedProjectId(currentPid);
        try {
          const { designFiles } = await getDesignFiles(currentPid);
          setFileTreeDesignFiles(designFiles);
        } catch {
          setFileTreeDesignFiles([]);
        }
      }
    }
  };

  // 탭 전환 핸들러 (자동 저장 → 활성 탭 전환 → 네비게이션)
  const handleTabSwitch = async (tab: EditorTab) => {
    // 현재 파일 자동 저장
    try {
      await saveProject();
    } catch (e) {
      console.warn('탭 전환 전 자동 저장 실패:', e);
    }
    useUIStore.getState().setActiveTab(tab.id);
    navigate(`/configurator?projectId=${tab.projectId}&designFileId=${tab.designFileId}`, { replace: true });
  };

  // 탭 닫기 핸들러 (자동 저장 → 탭 제거 → 인접 탭 또는 대시보드)
  const handleTabClose = async (tab: EditorTab) => {
    // 닫히는 탭이 활성 탭이면 저장
    if (useUIStore.getState().activeTabId === tab.id) {
      try {
        await saveProject();
      } catch (e) {
        console.warn('탭 닫기 전 자동 저장 실패:', e);
      }
    }
    const nextTabId = useUIStore.getState().removeTab(tab.id);
    if (nextTabId) {
      const nextTab = useUIStore.getState().openTabs.find(t => t.id === nextTabId);
      if (nextTab) {
        navigate(`/configurator?projectId=${nextTab.projectId}&designFileId=${nextTab.designFileId}`, { replace: true });
      }
    } else {
      // 마지막 탭 → 대시보드로 이동
      navigate('/dashboard');
    }
  };

  // 3D 모델 내보내기 핸들러
  const handleExport3D = async (format: ExportFormat) => {
// console.log(`🔧 ${format.toUpperCase()} 내보내기 시작...`);

    if (!sceneRef.current) {
      alert('3D 씬이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      console.error('❌ scene ref가 없습니다');
      return;
    }

// console.log('✅ Scene ref 확인:', {
      // scene: sceneRef.current,
      // childrenCount: sceneRef.current?.children?.length,
      // children: sceneRef.current?.children
    // });

    if (!canExport(sceneRef.current)) {
      alert('내보낼 3D 모델이 없습니다.');
      console.error('❌ 내보낼 모델이 없습니다, children:', sceneRef.current.children);
      return;
    }

    // 파일명 생성
    const projectName = basicInfo.title || 'furniture-design';
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${projectName}-${timestamp}.${format}`;

// console.log(`📦 ${format.toUpperCase()} 파일 생성:`, filename);

    const result = await exportTo3D(sceneRef.current, format, filename);

    if (result.success) {
      alert(`${format.toUpperCase()} 파일이 다운로드되었습니다: ${filename}`);
// console.log(`✅ ${format.toUpperCase()} 내보내기 성공`);
    } else {
      alert(`${format.toUpperCase()} 내보내기 실패: ${result.error}`);
      console.error(`❌ ${format.toUpperCase()} 내보내기 실패:`, result.error);
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

              {/* 전체/싱글/듀얼 탭 - 스크롤 영역 밖에 고정 */}
              <div className={styles.moduleCategoryTabs}>
                <button
                  className={`${styles.moduleCategoryTab} ${moduleType === 'all' ? styles.active : ''}`}
                  onClick={() => setModuleType('all')}
                >
                  전체
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${moduleType === 'single' ? styles.active : ''}`}
                  onClick={() => setModuleType('single')}
                >
                  싱글
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${moduleType === 'dual' ? styles.active : ''}`}
                  onClick={() => setModuleType('dual')}
                >
                  듀얼
                </button>
              </div>

              <div className={styles.moduleSection}>
                <ModuleGallery
                  moduleCategory={moduleCategory}
                  selectedType={moduleType}
                  onSelectedTypeChange={setModuleType}
                  hideTabMenu
                />
              </div>

              {/* 커스텀 캐비닛 만들기는 My캐비넷 탭으로 이동 */}
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
            <div style={{ padding: 24, color: 'var(--theme-text-tertiary)', textAlign: 'center' }}>
              준비중입니다
            </div>
          </div>
        );
      case 'upload':
        return (
          <div className={styles.sidebarPanel}>
            <div className={styles.modulePanelContent}>
              {/* 전체장/상부장/하부장 토글 탭 */}
              <div className={styles.moduleCategoryTabs}>
                <button
                  className={`${styles.moduleCategoryTab} ${customCategory === 'full' ? styles.active : ''}`}
                  onClick={() => setCustomCategory('full')}
                >
                  전체장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${customCategory === 'upper' ? styles.active : ''}`}
                  onClick={() => setCustomCategory('upper')}
                >
                  상부장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${customCategory === 'lower' ? styles.active : ''}`}
                  onClick={() => setCustomCategory('lower')}
                >
                  하부장
                </button>
              </div>

              <div className={styles.moduleSection}>
                <CustomFurnitureLibrary
                  filter={customCategory}
                  showHeader={false}
                />
              </div>
            </div>

            {/* 업로드 모달 */}
            {showCustomUploadModal && (
              <div className={styles.customModalOverlay}>
                <CustomFurnitureUpload
                  onClose={() => setShowCustomUploadModal(false)}
                  onSuccess={() => setShowCustomUploadModal(false)}
                />
              </div>
            )}
          </div>
        );
      case 'myCabinet':
        return (
          <div className={styles.sidebarPanel}>
            <div className={styles.modulePanelContent}>
              <div className={styles.moduleCategoryTabs}>
                <button
                  className={`${styles.moduleCategoryTab} ${myCabinetCategory === 'full' ? styles.active : ''}`}
                  onClick={() => setMyCabinetCategory('full')}
                >
                  전체장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${myCabinetCategory === 'upper' ? styles.active : ''}`}
                  onClick={() => setMyCabinetCategory('upper')}
                >
                  상부장
                </button>
                <button
                  className={`${styles.moduleCategoryTab} ${myCabinetCategory === 'lower' ? styles.active : ''}`}
                  onClick={() => setMyCabinetCategory('lower')}
                >
                  하부장
                </button>
              </div>

              <div className={styles.moduleSection}>
                <MyCabinetGallery filter={myCabinetCategory} editMode={myCabinetEditMode} />
              </div>

              {/* 커스텀 캐비넷 만들기 버튼 */}
              {activePopup.type !== 'customizableEdit' && (
                <div style={{ flex: '0 0 auto', padding: '8px 12px', borderTop: '1px solid var(--theme-border)' }}>
                  <CustomizableFurnitureLibrary
                    filter={myCabinetCategory}
                  />
                </div>
              )}

              {/* 하단 고정 편집 모드 토글 */}
              <button
                onClick={() => setMyCabinetEditMode(!myCabinetEditMode)}
                style={{
                  flexShrink: 0,
                  margin: '8px 0 0',
                  padding: '10px 12px',
                  border: myCabinetEditMode ? '1px solid var(--theme-primary, #4a90d9)' : '1px solid var(--theme-border, #e0e0e0)',
                  borderRadius: '8px',
                  background: myCabinetEditMode ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-surface, #fff)',
                  color: myCabinetEditMode ? '#fff' : 'var(--theme-text-secondary, #666)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {myCabinetEditMode ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </>
                  )}
                </svg>
                {myCabinetEditMode ? '편집 완료' : '설정 · 삭제'}
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // 섹션 헬프 버튼
  const HelpBtn: React.FC<{ title: string; text: string }> = ({ title, text }) => {
    const [open, setOpen] = useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);
    return (
      <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
        <button className={styles.helpBtn} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}><GoQuestion size={16} /></button>
        {open && (
          <div className={styles.helpPopover}>
            <div className={styles.helpPopoverTitle}>{title}</div>
            <div className={styles.helpPopoverText}>{text}</div>
          </div>
        )}
      </div>
    );
  };

  // 우측 패널 컨텐츠 렌더링
  const renderRightPanelContent = () => {
    const isFreeMode = (spaceInfo.layoutMode || 'equal-division') === 'free-placement';
    return (
      <div className={`${styles.spaceControls} ${isFreeMode ? styles.spaceControlsRelaxed : ''}`}>
        {/* 공간 설정 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>공간 설정</h3>
            <HelpBtn title="공간 설정" text="가구가 설치될 공간의 전체 너비(W)와 높이(H)를 mm 단위로 입력합니다. 벽 안쪽 실측 치수를 기준으로 하며, 너비는 1,000~8,000mm, 높이는 2,000~3,000mm 범위에서 설정 가능합니다. 이 값에 따라 슬롯 너비, 가구 높이, 프레임 사이즈가 자동 계산됩니다." />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>W</span>
              <div style={{ flex: 1 }}>
                <WidthControl
                  spaceInfo={spaceInfo}
                  onUpdate={handleSpaceInfoUpdate}
                  disabled={hasSpecialDualFurniture}
                />
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>H</span>
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
            <HelpBtn title="공간 유형" text="빌트인: 벽면에 완전히 매립되는 방식으로, 좌우 벽과 천장에 프레임이 밀착됩니다. 세미빌트인: 한쪽 벽만 밀착하고 반대쪽은 개방됩니다. 스탠드: 벽과 무관하게 독립적으로 배치합니다. 유형에 따라 프레임 구성과 이격거리가 달라집니다." />
          </div>
          <InstallTypeControls
            spaceInfo={spaceInfo}
            onUpdate={handleSpaceInfoUpdate}
          />
        </div>

        {/* 컬럼수 표시 - 공간유형 바로 아래 */}
        {(spaceInfo.layoutMode || 'equal-division') === 'equal-division' && (
          <div className={styles.configSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionDot}></span>
              <h3 className={styles.sectionTitle}>컬럼수</h3>
              <HelpBtn title="컬럼수" text="공간을 균등하게 나눌 칸(슬롯) 수를 설정합니다. 전체 너비에서 프레임과 이격거리를 뺀 내경을 칸 수로 나누어 각 슬롯의 너비가 자동 계산됩니다. 단내림이 있는 경우 메인 구간과 단내림 구간의 칸 수를 각각 설정할 수 있습니다." />
            </div>

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
              // 단내림이 있을 때
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className={styles.inputGroup}>
                  <DoorSlider
                    value={spaceInfo.mainDoorCount || getCurrentColumnCount()}
                    onChange={(value) => {
                      handleSpaceInfoUpdate({ mainDoorCount: value });
                    }}
                    width={spaceInfo.width || 4800}
                    label="메인"
                  />
                </div>

                {/* 단내림구간 도어 개수 */}
                <div className={styles.inputGroup}>
                  <DoorSlider
                    value={spaceInfo.droppedCeilingDoorCount || 1}
                    onChange={(value) => {
                      handleSpaceInfoUpdate({ droppedCeilingDoorCount: value });
                    }}
                    width={spaceInfo.droppedCeiling?.width || 900}
                    label="단내림"
                  />
                </div>
              </div>
            )}

          </div>
        )}

        {/* 자유배치 모드에서는 이격거리 불필요 — 제거됨 */}

        {/* 단내림 설정 */}
        {(<div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>{isFreeMode ? '커튼박스' : '단내림'}</h3>
            <HelpBtn title={isFreeMode ? '커튼박스' : '단내림'} text={isFreeMode
              ? "벽 상단에 커튼레일 박스가 있는 경우 활성화합니다. 커튼박스 구간은 메인구간보다 천장이 높아 가구가 배치되지 않는 영역입니다. 위치(좌/우)와 너비를 설정하여 가구 배치 가능 영역을 정확히 구분합니다."
              : "공간의 한쪽 천장이 낮아지는(단이 내려오는) 구간이 있을 때 활성화합니다. 에어컨 배관, 보 등으로 천장 높이가 달라지는 경우에 사용합니다. 좌측/우측 위치, 구간 너비, 단 높이를 설정하면 해당 영역의 가구 높이가 자동으로 맞춰집니다."
            } />
          </div>

          <div className={styles.toggleButtonGroup}>
            <button
              className={`${styles.toggleButton} ${!spaceInfo.droppedCeiling?.enabled ? styles.toggleButtonActive : ''}`}
              onClick={() => {
                // 단내림 비활성화
                clearAllModules();
                handleSpaceInfoUpdate({
                  droppedCeiling: {
                    ...spaceInfo.droppedCeiling,
                    enabled: false
                  },
                  mainDoorCount: undefined,
                  droppedCeilingDoorCount: undefined
                });
                setActiveRightPanelTab('placement');
              }}
            >
              없음
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.enabled ? styles.toggleButtonActive : ''}`}
              disabled={!spaceInfo.wallConfig?.left && !spaceInfo.wallConfig?.right}
              onClick={() => {
                if (!spaceInfo.droppedCeiling?.enabled) {
                  // 단내림 활성화
                  clearAllModules();

                  const totalWidth = spaceInfo.width || 4800;
                  const droppedWidth = isFreeMode ? 150 : 900; // 자유배치: 커튼박스 150mm, 슬롯: 단내림 900mm
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
                      dropHeight: isFreeMode ? Math.max(10, 2400 - (spaceInfo.height || DEFAULT_SPACE_VALUES.HEIGHT)) : 200,
                      position: 'right'
                    },
                    droppedCeilingDoorCount: droppedDoorCount,
                    mainDoorCount: adjustedMainDoorCount
                  });
                  setActiveRightPanelTab('placement');
                }
              }}
            >
              있음
            </button>
          </div>

          {/* 단내림이 활성화된 경우 위치 선택 */}
          {spaceInfo.droppedCeiling?.enabled && (
            <div style={{ marginTop: '6px' }}>
              <div className={styles.inputLabel} style={{ marginBottom: '4px' }}>위치</div>
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
        </div>)}

        {/* 단내림이 있을 때 메인구간 사이즈 표시 */}
        {spaceInfo.droppedCeiling?.enabled && (
          <div className={styles.configSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionDot}></span>
              <h3 className={styles.sectionTitle}>메인구간 사이즈</h3>
              <HelpBtn title="메인구간 사이즈" text="단내림이 없는 메인 구간의 실제 사용 가능한 너비와 높이를 표시합니다. 전체 공간 너비에서 단내림 구간 너비를 뺀 값이며, 이격거리가 반영된 순수 내경입니다. 이 영역에 배치되는 가구는 전체 높이를 사용합니다." />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {/* 메인구간 폭 */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>W</span>
                <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                  <input
                    type="text"
                    min="100"
                    max={(spaceInfo.width || 4800) - 100}
                    step="10"
                    defaultValue={(() => {
                      const dcDefaultW = isFreeMode ? 150 : 900;
                      const mainOuter = (spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.width || dcDefaultW);
                      if (isFreeMode) return Math.round(mainOuter);
                      const gapLeft = spaceInfo.gapConfig?.left ?? 1.5;
                      const gapRight = spaceInfo.gapConfig?.right ?? 1.5;
                      const gapMiddle = spaceInfo.gapConfig?.middle ?? 2;
                      const pos = spaceInfo.droppedCeiling?.position || 'right';
                      const internal = pos === 'right' ? mainOuter - gapLeft - gapMiddle : mainOuter - gapMiddle - gapRight;
                      return Math.round(internal);
                    })()}
                    key={`main-width-${(spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.width || (isFreeMode ? 150 : 900))}-${isFreeMode ? 'free' : `${spaceInfo.gapConfig?.left}-${spaceInfo.gapConfig?.right}-${spaceInfo.gapConfig?.middle}`}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const inputValue = e.target.value;
                      const totalWidth = spaceInfo.width || 4800;
                      const currentDroppedWidth = spaceInfo.droppedCeiling?.width || (isFreeMode ? 150 : 900);
                      // 자유배치: 이격 없이 순수 너비, 슬롯배치: 이격 반영
                      const pos = spaceInfo.droppedCeiling?.position || 'right';
                      const gapLeft = spaceInfo.gapConfig?.left ?? 1.5;
                      const gapRight = spaceInfo.gapConfig?.right ?? 1.5;
                      const gapMiddle = spaceInfo.gapConfig?.middle ?? 2;
                      const gapToAdd = isFreeMode ? 0 : (pos === 'right' ? gapLeft + gapMiddle : gapMiddle + gapRight);
                      const currentMainOuter = totalWidth - currentDroppedWidth;
                      const currentMainInternal = Math.round(currentMainOuter - gapToAdd);

                      // 빈 값이거나 유효하지 않은 경우 현재 값으로 복구
                      if (inputValue === '' || isNaN(parseInt(inputValue))) {
                        e.target.value = currentMainInternal.toString();
                        return;
                      }

                      const mainInternal = parseInt(inputValue);
                      const mainOuter = Math.round(mainInternal + gapToAdd);
                      const newDroppedWidth = totalWidth - mainOuter;

                      // 유효한 범위 밖인 경우 가장 가까운 유효값으로 조정
                      if (newDroppedWidth < 100) {
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: 100
                          }
                        });
                      } else if (newDroppedWidth > totalWidth - 100) {
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: totalWidth - 100
                          }
                        });
                      } else {
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
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>H</span>
                <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                  <input
                    type="text"
                    defaultValue={spaceInfo.height || 2400}
                    key={`main-height-${spaceInfo.height || 2400}`}
                    readOnly={isFreeMode}
                    style={isFreeMode ? { opacity: 0.6, cursor: 'default' } : undefined}
                    onChange={(e) => {
                      // 숫자와 빈 문자열만 허용
                      const value = e.target.value;
                      if (value === '' || /^\d+$/.test(value)) {
                        // 로컴 상태만 업데이트 (입력 중에는 스토어 업데이트 안 함)
                      }
                    }}
                    onBlur={(e) => {
                      if (isFreeMode) return; // 자유배치: 메인구간 높이는 공간설정에서 결정 (읽기전용)
                      const value = e.target.value;
                      const totalHeight = spaceInfo.height || 2400;
                      if (value === '') {
                        e.target.value = totalHeight.toString();
                        return;
                      }

                      const numValue = parseInt(value);

                      // 슬롯배치: 전체 높이 변경
                      const minValue = 1800;
                      const maxValue = 3000;
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
                      if (isFreeMode) return; // 자유배치: 읽기전용
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();

                        const totalHeight = spaceInfo.height || 2400;
                        const currentValue = parseInt(e.target.value) || totalHeight;
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
                    placeholder={isFreeMode ? '' : '1800-3000'}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 단내림 구간 사이즈 */}
        {spaceInfo.droppedCeiling?.enabled && (
          <div className={styles.configSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionDot}></span>
              <h3 className={styles.sectionTitle}>{isFreeMode ? '커튼박스 구간 사이즈' : '단내림 구간 사이즈'}</h3>
              <HelpBtn title={isFreeMode ? '커튼박스 구간 사이즈' : '단내림 구간 사이즈'} text={isFreeMode
                ? "커튼박스 구간의 너비를 표시합니다. 이 영역은 커튼레일 박스가 차지하는 공간으로, 가구가 배치되지 않습니다."
                : "단내림 구간의 실제 사용 가능한 너비와 높이를 표시합니다. 높이는 전체 높이에서 단 높이를 뺀 값이며, 이 영역에 배치되는 가구는 줄어든 높이에 맞게 자동 조절됩니다."
              } />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {/* 단내림 구간 폭 */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>W</span>
                <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                  <input
                    type="text"
                    min="100"
                    max={(spaceInfo.width || 4800) - 100}
                    step="10"
                    defaultValue={(() => {
                      const dcDefaultW = isFreeMode ? 150 : 900;
                      const droppedOuter = spaceInfo.droppedCeiling?.width || dcDefaultW;
                      if (isFreeMode) return Math.round(droppedOuter);
                      const gapLeft = spaceInfo.gapConfig?.left ?? 1.5;
                      const gapRight = spaceInfo.gapConfig?.right ?? 1.5;
                      const pos = spaceInfo.droppedCeiling?.position || 'right';
                      const internal = pos === 'right' ? droppedOuter - gapRight : droppedOuter - gapLeft;
                      return Math.round(internal);
                    })()}
                    key={`dropped-width-${spaceInfo.droppedCeiling?.width || (isFreeMode ? 150 : 900)}-${isFreeMode ? 'free' : `${spaceInfo.gapConfig?.left}-${spaceInfo.gapConfig?.right}`}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const inputValue = e.target.value;
                      const totalWidth = spaceInfo.width || 4800;
                      const currentDroppedWidth = spaceInfo.droppedCeiling?.width || (isFreeMode ? 150 : 900);
                      // 자유배치: 이격 없이 순수 너비, 슬롯배치: 이격 반영
                      const pos = spaceInfo.droppedCeiling?.position || 'right';
                      const gapToAdd = isFreeMode ? 0 : (pos === 'right' ? (spaceInfo.gapConfig?.right ?? 1.5) : (spaceInfo.gapConfig?.left ?? 1.5));

                      // 빈 값이거나 유효하지 않은 경우 현재 값으로 복구
                      if (inputValue === '' || isNaN(parseInt(inputValue))) {
                        const currentInternal = Math.round(currentDroppedWidth - gapToAdd);
                        e.target.value = currentInternal.toString();
                        return;
                      }

                      const internalWidth = parseInt(inputValue);
                      const droppedWidth = Math.round(internalWidth + gapToAdd);

                      // 유효한 범위 밖인 경우 가장 가까운 유효값으로 조정
                      if (droppedWidth < 100) {
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: 100
                          }
                        });
                      } else if (droppedWidth > totalWidth - 100) {
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            width: totalWidth - 100
                          }
                        });
                      } else {
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

              {/* 단내림/커튼박스 구간 높이 */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ minWidth: '16px', color: 'var(--theme-primary)' }}>H</span>
                <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                  <input
                    type="text"
                    min="1800"
                    max="2900"
                    step="10"
                    defaultValue={isFreeMode ? (spaceInfo.height || 2400) + (spaceInfo.droppedCeiling?.dropHeight || 100) : (spaceInfo.height || 2400) - (spaceInfo.droppedCeiling?.dropHeight || 200)}
                    key={`dropped-height-${isFreeMode ? `${spaceInfo.height}-${spaceInfo.droppedCeiling?.dropHeight}` : (spaceInfo.height || 2400) - (spaceInfo.droppedCeiling?.dropHeight || 200)}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const inputValue = e.target.value;
                      const totalHeight = spaceInfo.height || 2400;

                      if (isFreeMode) {
                        // 자유배치: 커튼박스 높이 = 메인높이 + dropHeight
                        const currentCurtainH = totalHeight + (spaceInfo.droppedCeiling?.dropHeight || 100);
                        if (inputValue === '' || isNaN(parseInt(inputValue))) {
                          e.target.value = currentCurtainH.toString();
                          return;
                        }
                        const newCurtainH = parseInt(inputValue);
                        // dropHeight = 커튼박스높이 - 메인높이
                        const newDropHeight = newCurtainH - totalHeight;
                        const clampedDrop = Math.max(10, Math.min(500, newDropHeight));
                        e.target.value = (totalHeight + clampedDrop).toString();
                        handleSpaceInfoUpdate({
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            enabled: true,
                            dropHeight: clampedDrop
                          }
                        });
                      } else {
                        // 슬롯배치: 단내림 구간 높이 → dropHeight 조정
                        const currentDroppedHeight = totalHeight - (spaceInfo.droppedCeiling?.dropHeight || 200);
                        if (inputValue === '' || isNaN(parseInt(inputValue))) {
                          e.target.value = currentDroppedHeight.toString();
                          return;
                        }
                        const droppedHeight = parseInt(inputValue);
                        const newDropHeight = totalHeight - droppedHeight;
                        if (newDropHeight < 100) {
                          e.target.value = (totalHeight - 100).toString();
                          handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, dropHeight: 100 } });
                        } else if (newDropHeight > 500) {
                          e.target.value = (totalHeight - 500).toString();
                          handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, dropHeight: 500 } });
                        } else {
                          handleSpaceInfoUpdate({ droppedCeiling: { ...spaceInfo.droppedCeiling, enabled: true, dropHeight: newDropHeight } });
                        }
                      }
                    }}
                    className={`${styles.input} ${styles.inputWithUnitField}`}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
            </div>

            {/* 커튼박스 마감은 서라운드 섹션에서 통합 관리 */}
          </div>
        )}

        {/* 배치 방식 - 좌측 사이드바 상단으로 이동됨 */}

        {/* 프레임 설정 (슬롯배치 모드만) */}
        {(spaceInfo.layoutMode || 'equal-division') !== 'free-placement' && (
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>프레임 설정</h3>
            <HelpBtn title="프레임 설정" text="가구 외곽을 감싸는 프레임 방식을 선택합니다. 전체서라운드: 상하좌우 모두 프레임으로 마감. 양쪽서라운드: 좌우와 상단만 프레임 적용. 노서라운드: 프레임 없이 가구만 배치하며, 빌트인 시 벽면에 직접 밀착됩니다. 프레임 타입에 따라 가구의 실제 사용 가능 공간이 달라집니다." />
          </div>

          {/* 프레임 타입: 전체서라운드 / 양쪽서라운드 / 노서라운드 (슬롯배치 모드만) */}
          {(spaceInfo.layoutMode || 'equal-division') !== 'free-placement' && (() => {
            const currentFrameConfig = inferFrameConfig(spaceInfo);
            const st = spaceInfo.surroundType || 'surround';
            const mode = st === 'no-surround' ? 'no-surround'
              : (!currentFrameConfig.top && !currentFrameConfig.bottom) ? 'sides-only'
                : 'full-surround';

            const handleModeChange = (newMode: string) => {
              if (newMode === 'full-surround') {
                handleSpaceInfoUpdate({
                  surroundType: 'surround',
                  frameConfig: { ...currentFrameConfig, top: true, bottom: true },
                  frameSize: {
                    ...(spaceInfo.frameSize || { left: 50, right: 50, top: 30 }),
                  },
                });
              } else if (newMode === 'sides-only') {
                // 양쪽서라운드 = 기존 서라운드와 100% 동일, frameConfig만 구분용
                handleSpaceInfoUpdate({
                  surroundType: 'surround',
                  frameConfig: { ...currentFrameConfig, top: false, bottom: false },
                });
              } else {
                handleSpaceInfoUpdate({
                  surroundType: 'no-surround',
                  frameConfig: { left: false, right: false, top: true, bottom: false },
                });
              }
            };

            return (
              <div className={styles.toggleButtonGroup}>
                <button
                  className={`${styles.toggleButton} ${mode === 'full-surround' ? styles.toggleButtonActive : ''}`}
                  onClick={() => handleModeChange('full-surround')}
                >
                  전체서라운드
                </button>
                <button
                  className={`${styles.toggleButton} ${mode === 'sides-only' ? styles.toggleButtonActive : ''}`}
                  onClick={() => handleModeChange('sides-only')}
                >
                  양쪽서라운드
                </button>
                <button
                  className={`${styles.toggleButton} ${mode === 'no-surround' ? styles.toggleButtonActive : ''}`}
                  onClick={() => handleModeChange('no-surround')}
                >
                  노서라운드
                </button>
              </div>
            );
          })()}

          {/* 프레임 속성 설정 (슬롯배치 모드만) */}
          {(spaceInfo.layoutMode || 'equal-division') !== 'free-placement' && ((spaceInfo.surroundType || 'surround') === 'surround' ? (
            <div className={styles.subSetting}>
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
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={frameInputLeft}
                      onChange={(e) => handleFrameInputChange('left', e.target.value)}
                      onFocus={() => handleFrameInputFocus('left')}
                      onBlur={() => handleFrameInputBlur('left', 10, 100, 50)}
                      onKeyDown={(e) => handleFrameInputKeyDown(e, 'left', 10, 100, 50)}
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
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={frameInputRight}
                      onChange={(e) => handleFrameInputChange('right', e.target.value)}
                      onFocus={() => handleFrameInputFocus('right')}
                      onBlur={() => handleFrameInputBlur('right', 10, 100, 50)}
                      onKeyDown={(e) => handleFrameInputKeyDown(e, 'right', 10, 100, 50)}
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

                {/* 상부 - 항상 표시 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>상부</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentTop = spaceInfo.frameSize?.top || 30;
                        const newTop = Math.max(10, currentTop - 1);
                        updateFrameSize('top', newTop);
                      }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={frameInputTop}
                      onChange={(e) => handleFrameInputChange('top', e.target.value)}
                      onFocus={() => handleFrameInputFocus('top')}
                      onBlur={() => handleFrameInputBlur('top', 10, 200, 30)}
                      onKeyDown={(e) => handleFrameInputKeyDown(e, 'top', 10, 200, 30)}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentTop = spaceInfo.frameSize?.top || 30;
                        const newTop = Math.min(200, currentTop + 1);
                        updateFrameSize('top', newTop);
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

            </div>
          ) : (spaceInfo.surroundType || 'surround') === 'no-surround' ? (
            <div className={styles.subSetting}>
              <div className={styles.frameGrid}>
                {/* 좌측 이격거리 - 벽없음이면 비활성화 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>좌이격</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const cur = spaceInfo.gapConfig?.left ?? 1.5;
                        const val = Math.max(0, Math.round((cur - 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, left: val } });
                      }}
                      disabled={!spaceInfo.wallConfig?.left}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={spaceInfo.wallConfig?.left ? (spaceInfo.gapConfig?.left ?? 1.5) : 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, left: val } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, left: val } });
                      }}
                      className={styles.frameNumberInput}
                      disabled={!spaceInfo.wallConfig?.left}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const cur = spaceInfo.gapConfig?.left ?? 1.5;
                        const val = Math.min(5, Math.round((cur + 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, left: val } });
                      }}
                      disabled={!spaceInfo.wallConfig?.left}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 우측 이격거리 - 벽없음이면 비활성화 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>우이격</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const cur = spaceInfo.gapConfig?.right ?? 1.5;
                        const val = Math.max(0, Math.round((cur - 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, right: val } });
                      }}
                      disabled={!spaceInfo.wallConfig?.right}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={spaceInfo.wallConfig?.right ? (spaceInfo.gapConfig?.right ?? 1.5) : 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, right: val } });
                        }
                      }}
                      onBlur={(e) => {
                        const val = Math.max(0, Math.min(5, Math.round((parseFloat(e.target.value) || 0) * 2) / 2));
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, right: val } });
                      }}
                      className={styles.frameNumberInput}
                      disabled={!spaceInfo.wallConfig?.right}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const cur = spaceInfo.gapConfig?.right ?? 1.5;
                        const val = Math.min(5, Math.round((cur + 0.5) * 10) / 10);
                        handleSpaceInfoUpdate({ gapConfig: { ...spaceInfo.gapConfig, right: val } });
                      }}
                      disabled={!spaceInfo.wallConfig?.right}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 상부 프레임 */}
                <div className={styles.frameItem}>
                  <label className={styles.frameItemLabel}>상부</label>
                  <div className={styles.frameItemInput}>
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentTop = spaceInfo.frameSize?.top || 30;
                        const newTop = Math.max(10, currentTop - 1);
                        updateFrameSize('top', newTop);
                      }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={frameInputTop}
                      onChange={(e) => handleFrameInputChange('top', e.target.value)}
                      onFocus={() => handleFrameInputFocus('top')}
                      onBlur={() => handleFrameInputBlur('top', 10, 200, 30)}
                      onKeyDown={(e) => handleFrameInputKeyDown(e, 'top', 10, 200, 30)}
                      className={styles.frameNumberInput}
                    />
                    <button
                      className={styles.frameButton}
                      onClick={() => {
                        const currentTop = spaceInfo.frameSize?.top || 30;
                        const newTop = Math.min(200, currentTop + 1);
                        updateFrameSize('top', newTop);
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

            </div>
          ) : null)}

        </div>
        )}

        {/* 서라운드 섹션 — freeSurround 존재 시 항상 표시 */}
        {isFreeMode && (() => {
          const fs = spaceInfo.freeSurround;
          if (!fs) return null;
          const middleGaps = fs.middle || [];

          // 서라운드 목록: 좌 → 중간들 → 우 (좌→우 순서)
          type SurroundItem =
            | { kind: 'left' }
            | { kind: 'right' }
            | { kind: 'middle'; idx: number };
          const surroundItems: SurroundItem[] = [];
          if (fs.left.enabled) surroundItems.push({ kind: 'left' });
          middleGaps.forEach((_m, i) => {
            if (_m.enabled) surroundItems.push({ kind: 'middle', idx: i });
          });
          if (fs.right.enabled) surroundItems.push({ kind: 'right' });

          // 활성된 서라운드 항목이 없으면 섹션 자체를 숨김
          if (surroundItems.length === 0) return null;

          const droppedPos = spaceInfo.droppedCeiling?.enabled ? spaceInfo.droppedCeiling.position : null;
          const getSurroundLabel = (kind: string) => {
            if (kind === 'left') return droppedPos === 'left' ? '커튼박스' : '좌측';
            if (kind === 'right') return droppedPos === 'right' ? '커튼박스' : '우측';
            return '중간';
          };
          const renderOffsetRow = (
            label: string,
            enabled: boolean,
            sizeMM: number,
            offset: number,
            onToggle: () => void,
            onSizeChange: (val: number) => void,
            onOffsetChange: (val: number) => void,
            highlightKey: string,
          ) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
              <span className={styles.frameItemLabel} style={{ minWidth: '44px', textAlign: 'left', margin: 0, fontSize: '11px' }}>{label}</span>
              <button
                onClick={onToggle}
                className={`${styles.miniToggle} ${enabled ? styles.miniToggleActive : ''}`}
              />
              {enabled ? (
                <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>size</span>
                    <input
                      type="text" inputMode="numeric"
                      value={sizeMM || ''} placeholder="0"
                      onFocus={() => setHighlightedFrame(highlightKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onSizeChange(Math.max(0, Math.min(9999, (sizeMM || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d+$/.test(v)) onSizeChange(v === '' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        onSizeChange(Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>옵셋</span>
                    <input
                      type="text" inputMode="numeric"
                      value={offset !== 0 ? offset : ''} placeholder="0"
                      onFocus={() => setHighlightedFrame(highlightKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onOffsetChange(Math.max(-200, Math.min(200, (offset || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || v === '-' || /^-?\d+$/.test(v)) onOffsetChange(v === '' || v === '-' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        const parsed = parseInt(e.target.value) || 0;
                        onOffsetChange(Math.max(-200, Math.min(200, parsed)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );

          return (
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>좌,우 서라운드</h3>
                <HelpBtn title="서라운드" text="서라운드 프레임의 상·하·좌·우 각 면의 두께를 개별 설정합니다. 벽면과 가구 사이의 마감재 역할을 하며, 값이 클수록 가구 배치 가능 공간이 줄어듭니다. 옵셋 기준을 '외경'으로 하면 전체 공간 기준, '내경'으로 하면 가구 기준으로 계산됩니다." />
              </div>
              {/* 서라운드 옵셋 기준 선택 */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', padding: '0 4px' }}>
                <button
                  style={{
                    flex: 1, padding: '5px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                    background: (spaceInfo.surroundOffsetBase || 'furniture') === 'furniture' ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-background)',
                    color: (spaceInfo.surroundOffsetBase || 'furniture') === 'furniture' ? '#fff' : 'var(--theme-text-secondary)',
                    fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onClick={() => setSpaceInfo({ surroundOffsetBase: 'furniture' })}
                >
                  가구에 맞춤
                </button>
                <button
                  style={{
                    flex: 1, padding: '5px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                    background: spaceInfo.surroundOffsetBase === 'door' ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-background)',
                    color: spaceInfo.surroundOffsetBase === 'door' ? '#fff' : 'var(--theme-text-secondary)',
                    fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onClick={() => setSpaceInfo({ surroundOffsetBase: 'door' })}
                >
                  도어에 맞춤
                </button>
              </div>
              <div className={styles.subSetting}>
                {surroundItems.map((si) => {
                  if (si.kind === 'left') {
                    const d = fs.left;
                    return <React.Fragment key="surround-left">{renderOffsetRow(getSurroundLabel('left'), d.enabled, d.gap || 0, d.offset,
                      () => setSpaceInfo({ freeSurround: { ...fs, left: { ...d, enabled: !d.enabled } } }),
                      (v) => setSpaceInfo({ freeSurround: { ...fs, left: { ...d, gap: v } } }),
                      (v) => setSpaceInfo({ freeSurround: { ...fs, left: { ...d, offset: v } } }),
                      'surround-left',
                    )}</React.Fragment>;
                  }
                  if (si.kind === 'right') {
                    const d = fs.right;
                    return <React.Fragment key="surround-right">{renderOffsetRow(getSurroundLabel('right'), d.enabled, d.gap || 0, d.offset,
                      () => setSpaceInfo({ freeSurround: { ...fs, right: { ...d, enabled: !d.enabled } } }),
                      (v) => setSpaceInfo({ freeSurround: { ...fs, right: { ...d, gap: v } } }),
                      (v) => setSpaceInfo({ freeSurround: { ...fs, right: { ...d, offset: v } } }),
                      'surround-right',
                    )}</React.Fragment>;
                  }
                  if (si.kind === 'middle') {
                    const midCfg = middleGaps[si.idx];
                    return <React.Fragment key={`surround-middle-${si.idx}`}>{renderOffsetRow(`중간${middleGaps.length > 1 ? si.idx + 1 : ''}`, midCfg.enabled, midCfg.gap || 0, midCfg.offset || 0,
                      () => {
                        const newMiddle = [...middleGaps];
                        newMiddle[si.idx] = { ...newMiddle[si.idx], enabled: !newMiddle[si.idx].enabled };
                        setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                      },
                      (v) => {
                        const newMiddle = [...middleGaps];
                        newMiddle[si.idx] = { ...newMiddle[si.idx], gap: v };
                        setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                      },
                      (v) => {
                        const newMiddle = [...middleGaps];
                        newMiddle[si.idx] = { ...newMiddle[si.idx], offset: v };
                        setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
                      },
                      `surround-middle-${si.idx}`,
                    )}</React.Fragment>;
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })()}

        {/* 상,하부프레임 섹션 — 가구별 좌→우 순서 (서라운드 무관하게 항상 표시) */}
        {isFreeMode && (() => {
          const freeMods = placedModules.filter(m => m.isFreePlacement);
          if (freeMods.length === 0) return null;
          const sorted = [...freeMods].sort((a, b) => a.position.x - b.position.x);
          const toAlpha = (n: number) => String.fromCharCode(64 + n);

          const renderFrameOffsetRow = (
            num: number,
            label: string,
            enabled: boolean,
            sizeMM: number,
            offset: number,
            onToggle: () => void,
            onSizeChange: (val: number) => void,
            onOffsetChange: (val: number) => void,
            highlightKey: string,
          ) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
              <span className={styles.frameItemLabel} style={{ minWidth: '34px', textAlign: 'left', margin: 0 }}>{toAlpha(num)}{label}</span>
              <button
                onClick={onToggle}
                className={`${styles.miniToggle} ${enabled ? styles.miniToggleActive : ''}`}
              />
              {enabled ? (
                <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>size</span>
                    <input
                      type="text" inputMode="numeric"
                      value={sizeMM || ''} placeholder="0"
                      onFocus={() => setHighlightedFrame(highlightKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onSizeChange(Math.max(0, Math.min(9999, (sizeMM || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d+$/.test(v)) onSizeChange(v === '' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        onSizeChange(Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                  <div className={styles.frameItemInput} style={{ flex: 1 }}>
                    <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', padding: '0 2px', flexShrink: 0 }}>옵셋</span>
                    <input
                      type="text" inputMode="numeric"
                      value={offset !== 0 ? offset : ''} placeholder="0"
                      onFocus={() => setHighlightedFrame(highlightKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const delta = e.key === 'ArrowUp' ? 1 : -1;
                          onOffsetChange(Math.max(-200, Math.min(200, (offset || 0) + delta)));
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || v === '-' || /^-?\d+$/.test(v)) onOffsetChange(v === '' || v === '-' ? 0 : parseInt(v, 10));
                      }}
                      onBlur={(e) => {
                        setHighlightedFrame(null);
                        const parsed = parseInt(e.target.value) || 0;
                        onOffsetChange(Math.max(-200, Math.min(200, parsed)));
                      }}
                      className={styles.frameNumberInput}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );

          let topNum = 0;
          let baseNum = 0;
          return (
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>상,하부프레임</h3>
                <HelpBtn title="상,하부프레임" text="상부프레임: 가구 위쪽과 천장 사이의 마감 패널 높이입니다. 하부프레임(베이스): 가구 아래쪽 받침대의 높이와 깊이를 설정합니다. 베이스 높이는 조절발이나 받침대의 높이, 깊이는 가구 본체 대비 베이스가 들어가는 정도를 결정합니다." />
              </div>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', padding: '0 4px' }}>
                <button
                  style={{
                    flex: 1, padding: '5px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                    background: (spaceInfo.frameOffsetBase || 'furniture') === 'furniture' ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-background)',
                    color: (spaceInfo.frameOffsetBase || 'furniture') === 'furniture' ? '#fff' : 'var(--theme-text-secondary)',
                    fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onClick={() => setSpaceInfo({ frameOffsetBase: 'furniture' })}
                >
                  가구에 맞춤
                </button>
                <button
                  style={{
                    flex: 1, padding: '5px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                    background: spaceInfo.frameOffsetBase === 'door' ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-background)',
                    color: spaceInfo.frameOffsetBase === 'door' ? '#fff' : 'var(--theme-text-secondary)',
                    fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onClick={() => setSpaceInfo({ frameOffsetBase: 'door' })}
                >
                  도어에 맞춤
                </button>
              </div>
              <div className={styles.subSetting}>
                {/* 상부프레임 먼저 */}
                {sorted.map((mod) => {
                  const cat = getModuleCategory(mod);
                  if (cat !== 'upper' && cat !== 'full') return null;
                  topNum++;
                  const tn = topNum;
                  // 실제 렌더링되는 상부프레임 높이
                  // actualTopFrameSize = 공간높이 - 받침대 - 띄움높이 - 가구높이
                  const baseH = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;
                  const isStandFloat = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
                  const floatH = isStandFloat ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
                  const internalH = calculateInternalSpace(spaceInfo).height;
                  // freeHeight가 stale(이전 배치모드 값)일 수 있으므로 최대값 제한
                  const rawFreeH = mod.freeHeight || internalH;
                  const maxFreeH = internalH - floatH;
                  const modHeight = Math.min(rawFreeH, maxFreeH);
                  const actualTopFrameSize = Math.max(0, spaceInfo.height - baseH - floatH - modHeight);
                  return <React.Fragment key={`top-${mod.id}`}>{renderFrameOffsetRow(tn, '(상)',
                    mod.hasTopFrame !== false, actualTopFrameSize, mod.topFrameOffset ?? 0,
                    () => updatePlacedModule(mod.id, { hasTopFrame: !(mod.hasTopFrame !== false) }),
                    (v) => {
                      // 상부프레임 size 변경 → freeHeight 역산 (가구 높이 조정)
                      // 역산 시에는 항상 floatH 반영 (새 freeHeight에 floatH가 포함되어야 하므로)
                      const revFloatH = (spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float')
                        ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
                      const newFreeHeight = Math.max(100, spaceInfo.height - baseH - revFloatH - v);
                      updatePlacedModule(mod.id, { freeHeight: newFreeHeight });
                    },
                    (v) => updatePlacedModule(mod.id, { topFrameOffset: v }),
                    `top-${mod.id}`,
                  )}</React.Fragment>;
                })}
                {/* 하부프레임 — 띄워서 배치(stand)면 받침대 없으므로 숨김 */}
                {spaceInfo.baseConfig?.type !== 'stand' && sorted.map((mod) => {
                  const cat = getModuleCategory(mod);
                  if (cat !== 'lower' && cat !== 'full') return null;
                  baseNum++;
                  const bn = baseNum;
                  return <React.Fragment key={`base-${mod.id}`}>{renderFrameOffsetRow(bn, '(하)',
                    mod.hasBase !== false, spaceInfo.baseConfig?.height || 65, mod.baseFrameOffset || 0,
                    () => updatePlacedModule(mod.id, { hasBase: !(mod.hasBase !== false) }),
                    (v) => setSpaceInfo({ baseConfig: { ...(spaceInfo.baseConfig || { type: 'floor', height: 65 }), height: v } }),
                    (v) => updatePlacedModule(mod.id, { baseFrameOffset: v }),
                    `base-${mod.id}`,
                  )}</React.Fragment>;
                })}
              </div>
            </div>
          );
        })()}

        {/* 하부프레임 높이/깊이 (글로벌) — 자유배치에서는 상하부프레임 섹션에서 개별 설정 가능하므로 숨김 */}

        {/* 도어 셋팅: 자유배치 + 도어 가구 존재 시 */}
        {showDoorSetup && (
          <div className={styles.configSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionDot}></span>
              <h3 className={styles.sectionTitle}>도어 셋팅</h3>
              <HelpBtn title="도어 셋팅" text="전체: 모든 도어 가구에 동일한 상단/하단 갭을 적용합니다. 개별: 각 도어 가구마다 개별적으로 갭을 설정합니다." />
            </div>
            {/* 전체/개별 토글 */}
            <div className={styles.toggleButtonGroup}>
              <button
                className={`${styles.toggleButton} ${doorGapMode === 'global' ? styles.toggleButtonActive : ''}`}
                onClick={() => setDoorGapMode('global')}
              >
                전체
              </button>
              <button
                className={`${styles.toggleButton} ${doorGapMode === 'individual' ? styles.toggleButtonActive : ''}`}
                onClick={() => setDoorGapMode('individual')}
              >
                개별
              </button>
            </div>
            {/* 가구에 맞춤/공간에 맞춤 */}
            <div style={{ marginTop: '6px' }}>
              <div className={styles.toggleButtonGroup}>
                <button
                  className={`${styles.toggleButton} ${doorSetupMode === 'furniture-fit' || doorSetupMode === 'default' ? styles.toggleButtonActive : ''}`}
                  onClick={() => {
                    setSpaceInfo({ doorSetupMode: 'furniture-fit', frameOffsetBase: 'door' });
                    // R3F Canvas 내부 DoorModule 리렌더 보장: furnitureStore도 터치
                    placedModules.filter(m => m.hasDoor).forEach(m => {
                      updatePlacedModule(m.id, { _doorSetupTs: Date.now() });
                    });
                  }}
                >
                  가구에 맞춤
                </button>
                <button
                  className={`${styles.toggleButton} ${doorSetupMode === 'space-fit' || doorSetupMode === 'frame-cover' ? styles.toggleButtonActive : ''}`}
                  onClick={() => {
                    setSpaceInfo({ doorSetupMode: 'space-fit', frameOffsetBase: 'furniture' });
                    // R3F Canvas 내부 DoorModule 리렌더 보장: furnitureStore도 터치
                    placedModules.filter(m => m.hasDoor).forEach(m => {
                      updatePlacedModule(m.id, { _doorSetupTs: Date.now() });
                    });
                  }}
                >
                  공간에 맞춤
                </button>
              </div>
            </div>

            {doorGapMode === 'global' ? (
              /* 전체 모드: 글로벌 상단/하단 갭 */
              <div style={{ marginTop: '8px' }}>
                <div className={doorSettingStyles.doorGapContainer}>
                  <div className={doorSettingStyles.doorGapField}>
                    <label className={doorSettingStyles.doorGapLabel}>상단 ↓</label>
                    <div className={doorSettingStyles.inputWithUnit}>
                      <input type="text" inputMode="numeric" value={doorTopGapInput}
                        onChange={(e) => handleDoorGapChange('doorTopGap', e.target.value)}
                        onBlur={() => handleDoorGapBlur('doorTopGap')}
                        className={`${doorSettingStyles.depthInput} furniture-depth-input`}
                        placeholder="5" style={{ color: '#000', backgroundColor: '#fff' }} />
                      <span className={doorSettingStyles.unit}>mm</span>
                    </div>
                  </div>
                  <div className={doorSettingStyles.doorGapField}>
                    <label className={doorSettingStyles.doorGapLabel}>하단 ↑</label>
                    <div className={doorSettingStyles.inputWithUnit}>
                      <input type="text" inputMode="numeric" value={doorBottomGapInput}
                        onChange={(e) => handleDoorGapChange('doorBottomGap', e.target.value)}
                        onBlur={() => handleDoorGapBlur('doorBottomGap')}
                        className={`${doorSettingStyles.depthInput} furniture-depth-input`}
                        placeholder="25" style={{ color: '#000', backgroundColor: '#fff' }} />
                      <span className={doorSettingStyles.unit}>mm</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 개별 모드: 가로 테이블 형태 — 헤더행 + 상단갭행 + 하단갭행 */
              <div style={{ marginTop: '8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  {/* 헤더: 도어 1, 도어 2, ... */}
                  <thead>
                    <tr>
                      <th style={{ width: '52px', padding: '2px 4px', fontSize: '10px', fontWeight: 500, color: 'var(--theme-text-secondary, #999)', textAlign: 'left', whiteSpace: 'nowrap' }}></th>
                      {doorNumberMap.map((info, idx) => (
                        <th key={idx} style={{ padding: '2px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--theme-text-secondary, #666)', textAlign: 'center' }}>
                          {info.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* 상단갭 행 */}
                    <tr>
                      <td style={{ padding: '3px 4px', fontSize: '11px', color: 'var(--theme-text-secondary, #999)', whiteSpace: 'nowrap' }}>상단갭</td>
                      {doorFurnitureList.map((mod) => (
                        <td key={mod.id} style={{ padding: '3px 4px' }}>
                          <input type="text" inputMode="numeric"
                            defaultValue={String(mod.doorTopGap ?? spaceInfo.doorTopGap ?? 5)}
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) handleIndividualDoorGapChange(mod.id, 'doorTopGap', e.target.value);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            placeholder="5"
                            style={{ width: '100%', padding: '8px 4px', border: '1px solid var(--theme-border, #ddd)', borderRadius: '6px', fontSize: '14px', textAlign: 'center', color: '#000', backgroundColor: '#fff', outline: 'none' }} />
                        </td>
                      ))}
                    </tr>
                    {/* 하단갭 행 */}
                    <tr>
                      <td style={{ padding: '3px 4px', fontSize: '11px', color: 'var(--theme-text-secondary, #999)', whiteSpace: 'nowrap' }}>하단갭</td>
                      {doorFurnitureList.map((mod) => (
                        <td key={mod.id} style={{ padding: '3px 4px' }}>
                          <input type="text" inputMode="numeric"
                            defaultValue={String(mod.doorBottomGap ?? spaceInfo.doorBottomGap ?? 25)}
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) handleIndividualDoorGapChange(mod.id, 'doorBottomGap', e.target.value);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            placeholder="25"
                            style={{ width: '100%', padding: '8px 4px', border: '1px solid var(--theme-border, #ddd)', borderRadius: '6px', fontSize: '14px', textAlign: 'center', color: '#000', backgroundColor: '#fff', outline: 'none' }} />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {/* 배치방식 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>배치방식</h3>
            <HelpBtn title="배치방식" text="가구 하단의 바닥 처리 방식을 선택합니다. 받침대: 고정된 베이스 위에 가구를 올립니다. 조절발: 바닥 수평이 맞지 않을 때 높이 조절이 가능한 발을 사용합니다. 띄움(플로팅): 벽에 고정하여 바닥에서 떠 있는 형태로 설치하며, 띄움 높이를 지정할 수 있습니다." />
          </div>
          <BaseControls
            spaceInfo={spaceInfo}
            onUpdate={handleSpaceInfoUpdate}
            disabled={hasSpecialDualFurniture}
            renderMode="type-only"
          />
        </div>

        {/* 바닥마감재 */}
        <div className={styles.configSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot}></span>
            <h3 className={styles.sectionTitle}>바닥마감재</h3>
            <HelpBtn title="바닥마감재" text="가구 설치 후 바닥에 마감재(마루, 타일 등)를 시공할 예정인지 설정합니다. '있음'으로 설정하면 가구 하단에 바닥재 두께(약 10~15mm)만큼 여유 공간을 확보하여, 나중에 마감재를 가구 아래로 밀어넣을 수 있도록 합니다." />
          </div>
          <FloorFinishControls
            spaceInfo={spaceInfo}
            onUpdate={handleSpaceInfoUpdate}
          />
        </div>

      </div>
    );
  };

  // readonly 모드가 아닐 때만 로딩 화면 표시
  if (loading && !isReadOnly) {
    return (
      <LoadingSpinner
        fullscreen
        message="에디터를 준비하는 중..."
      />
    );
  }

  // 디버깅용 로그
// console.log('🔍 Configurator basicInfo.title:', basicInfo.title);
// console.log('🔍 currentProjectId:', currentProjectId);
// console.log('🔍 currentDesignFileName:', currentDesignFileName);
// console.log('🔍 basicInfo.title:', basicInfo.title);

  // 전역 함수 노출 (디버깅용) - window 객체에 직접 할당
  if (typeof window !== 'undefined') {
    (window as any).testSaveProject = async () => {
// console.log('💾💾💾 [테스트] 직접 저장 함수 호출');
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

// console.log('📁 현재 프로젝트의 디자인 파일 목록:');
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
// console.log('💡 사용법: window.deleteDesignFile("파일ID")');
// console.log('💡 파일 목록 확인: window.listDesignFiles()');
        return;
      }

      if (!confirm(`정말로 이 디자인 파일을 삭제하시겠습니까?\nID: ${designFileId}`)) {
// console.log('❌ 삭제 취소됨');
        return;
      }

      try {
        const { deleteDesignFile } = await import('@/firebase/projects');
        const { error } = await deleteDesignFile(designFileId, currentProjectId);

        if (error) {
          console.error('❌ 디자인 파일 삭제 실패:', error);
          return;
        }

// console.log('✅ 디자인 파일 삭제 성공:', designFileId);
// console.log('🔄 페이지를 새로고침하세요');
      } catch (error) {
        console.error('❌ 디자인 파일 삭제 중 오류:', error);
      }
    };

// console.log('💾 테스트: 브라우저 콘솔에서 window.testSaveProject()를 실행해보세요');
// console.log('📁 파일 목록: window.listDesignFiles()');
// console.log('🗑️ 파일 삭제: window.deleteDesignFile("파일ID")');
  }

  return (
    <div className={`${styles.configurator} ${isReadOnly ? responsiveStyles.readOnlyMode : ''}`}>
      {/* 헤더 */}
      <Header
        title={currentDesignFileName || urlDesignFileName || basicInfo.title || "새로운 디자인"}
        projectName={urlProjectName || basicInfo.title || "새로운 프로젝트"}
        folderName={currentFolderName}
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
        onExport3D={handleExport3D}
        readOnly={isReadOnly}
        onMobileMenuToggle={handleMobileMenuToggle}
        showBorings={showBorings}
        onToggleBorings={toggleBorings}
        onBoringExport={() => setShowBoringExportDialog(true)}
        totalBorings={totalBorings}
        boringFurnitureCount={boringFurnitureCount}
      />

      {/* 에디터 파일 탭 바 */}
      {!isMobile && (
        <TabBar
          onTabSwitch={handleTabSwitch}
          onTabClose={handleTabClose}
          onNewDesign={handleNewDesign}
        />
      )}

      <div className={styles.mainContent}>
        {/* 파일 트리 오버레이 (대시보드 좌측바 스타일) */}
        <div
          className={`${styles.fileTreeOverlay} ${isFileTreeOpen ? styles.open : ''}`}
          onClick={() => setIsFileTreeOpen(false)}
        />
        <div className={`${styles.fileTreePanel} ${isFileTreeOpen ? styles.open : ''}`}>
          {/* 접기 버튼 */}
          <button
            className={styles.fileTreeFoldButton}
            onClick={() => setIsFileTreeOpen(false)}
            title="파일 트리 접기"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* 좌측: 프로젝트/폴더 트리 */}
          <NavigationPane
            projects={fileTreeProjects}
            folders={fileTreeFolders}
            currentProjectId={fileTreeSelectedProjectId || searchParams.get('projectId')}
            currentFolderId={fileTreeSelectedFolderId}
            activeMenu={fileTreeActiveMenu}
            autoExpandProjectId={searchParams.get('projectId')}
            onNavigate={async (projectId, folderId, _label) => {
              if (projectId) {
                setFileTreeSelectedProjectId(projectId);
                setFileTreeSelectedFolderId(folderId || null);
                try {
                  const { designFiles } = await getDesignFiles(projectId);
                  // 폴더 선택 시 해당 폴더의 파일만 필터링
                  if (folderId) {
                    setFileTreeDesignFiles(designFiles.filter(f => f.folderId === folderId));
                  } else {
                    setFileTreeDesignFiles(designFiles);
                  }
                } catch {
                  setFileTreeDesignFiles([]);
                }
              }
            }}
            onMenuChange={(menu) => {
              setFileTreeActiveMenu(menu);
            }}
          />
          {/* 우측: 선택 프로젝트의 디자인 파일 타일 목록 */}
          <div className={styles.fileTreeContent}>
            {fileTreeSelectedProjectId ? (
              fileTreeDesignFiles.length > 0 ? (
                <div className={styles.fileTreeFileList}>
                  {fileTreeDesignFiles.map(file => (
                    <button
                      key={file.id}
                      className={`${styles.fileTreeFileCard} ${searchParams.get('designFileId') === file.id ? styles.fileTreeFileCardActive : ''
                        }`}
                      onClick={async () => {
                        // 현재 파일 자동 저장
                        try { await saveProject(); } catch { }
                        // 탭 추가 (프로젝트명 조회) — 닫힌 탭 기록에서 제거하여 재오픈 허용
                        const proj = fileTreeProjects.find(p => p.id === fileTreeSelectedProjectId);
                        useUIStore.getState().addTab({
                          projectId: fileTreeSelectedProjectId!,
                          projectName: proj?.title || '프로젝트',
                          designFileId: file.id,
                          designFileName: file.name,
                        });
                        navigate(`/configurator?projectId=${fileTreeSelectedProjectId}&designFileId=${file.id}`, { replace: true });
                        setIsFileTreeOpen(false);
                      }}
                    >
                      <div className={styles.fileTreeFileThumbnail}>
                        {file.thumbnail ? (
                          <img src={file.thumbnail} alt={file.name} />
                        ) : (
                          <div className={styles.fileTreeFilePlaceholder}>
                            <span>{file.spaceSize ? `${file.spaceSize.width}x${file.spaceSize.depth}` : ''}</span>
                          </div>
                        )}
                      </div>
                      <div className={styles.fileTreeFileInfo}>
                        <div className={styles.fileTreeFilePath}>
                          {(() => {
                            const proj = fileTreeProjects.find(p => p.id === fileTreeSelectedProjectId);
                            const folder = file.folderId ? fileTreeFolders[fileTreeSelectedProjectId!]?.find(f => f.id === file.folderId) : null;
                            const parts = [proj?.title || '프로젝트', folder?.name, file.name].filter(Boolean);
                            return parts.join(' > ');
                          })()}
                        </div>
                        <div className={styles.fileTreeFileMeta}>
                          {file.spaceSize ? `${file.spaceSize.width}x${file.spaceSize.depth}` : '-'}
                        </div>
                        <div className={styles.fileTreeFileMeta}>
                          {file.updatedAt?.toDate ? file.updatedAt.toDate().toLocaleDateString('ko-KR') : '-'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.fileTreeEmpty}>디자인 파일이 없습니다</div>
              )
            ) : (
              <div className={styles.fileTreeEmpty}>프로젝트를 선택하세요</div>
            )}
          </div>
        </div>

        {/* 좌측 사이드바 - 설계모드에서는 숨김, PC에서는 항상 표시 */}
        <>
          {/* 좌측 사이드바 토글 버튼 — 설계모드에서 숨김 */}
          {!isLayoutBuilderOpen && (
            <button
              className={`${styles.leftPanelToggle} ${activeSidebarTab ? styles.open : ''}`}
              onClick={() => setActiveSidebarTab(activeSidebarTab ? null : (isReadOnly ? 'material' : 'module'))}
              title={activeSidebarTab ? "사이드바 접기" : "사이드바 펼치기"}
            >
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d={activeSidebarTab ? "M6 1L1 6L6 11" : "M1 1L6 6L1 11"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* 사이드바 - 설계모드에서 숨김, 읽기 전용 모드에서는 재질 탭만 보임 */}
          {!isLayoutBuilderOpen && (
            <Sidebar
              activeTab={activeSidebarTab}
              onTabClick={handleSidebarTabClick}
              isOpen={!!activeSidebarTab}
              onToggle={() => setActiveSidebarTab(activeSidebarTab ? null : (isReadOnly ? 'material' : 'module'))}
              onSave={saveProject}
              readOnly={isReadOnly}
              owner={projectOwner}
              collaborators={collaborators}
              onAddCollaborator={() => setIsShareModalOpen(true)}
              onFileTreeToggle={handleFileTreeToggle}
              isFileTreeOpen={isFileTreeOpen}
            />
          )}

          {/* 사이드바 컨텐츠 패널 — 설계모드에서 숨김 */}
          <div
            className={styles.sidebarContent}
            style={{
              transform: (activeSidebarTab && !isLayoutBuilderOpen) ? 'translateX(0) scale(1)' : 'translateX(-100%) scale(0.95)',
              opacity: (activeSidebarTab && !isLayoutBuilderOpen) ? 1 : 0,
              pointerEvents: (activeSidebarTab && !isLayoutBuilderOpen) ? 'auto' : 'none'
            }}
          >
            {/* 배치 모드 토글 */}
            {!isReadOnly && (
              <div className={styles.layoutModeToggle}>
                <button
                  className={`${styles.layoutModeBtn} ${(spaceInfo.layoutMode || 'equal-division') === 'equal-division' ? styles.layoutModeActive : ''}`}
                  onClick={() => {
                    if ((spaceInfo.layoutMode || 'equal-division') === 'equal-division') return;
                    if (placedModules.length > 0) {
                      if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
                      clearAllModules();
                      setSpaceInfo({ freeSurround: undefined });
                    }
                    const updates: Record<string, unknown> = { layoutMode: 'equal-division' };
                    // 자유배치→슬롯 전환 시 기존 커튼박스가 켜져 있으면 단내림 기본값으로 변경
                    if (spaceInfo.droppedCeiling?.enabled) {
                      updates.droppedCeiling = {
                        ...spaceInfo.droppedCeiling,
                        width: DEFAULT_DROPPED_CEILING_VALUES.WIDTH,
                        dropHeight: DEFAULT_DROPPED_CEILING_VALUES.DROP_HEIGHT,
                      };
                    }
                    handleSpaceInfoUpdate(updates);
                  }}
                >
                  슬롯배치
                </button>
                <button
                  className={`${styles.layoutModeBtn} ${(spaceInfo.layoutMode || 'equal-division') === 'free-placement' ? styles.layoutModeActive : ''}`}
                  onClick={() => {
                    if ((spaceInfo.layoutMode || 'equal-division') === 'free-placement') return;
                    if (placedModules.length > 0) {
                      if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
                      clearAllModules();
                      setSpaceInfo({ freeSurround: undefined });
                    }
                    const updates: Record<string, unknown> = { layoutMode: 'free-placement' };
                    // 슬롯→자유배치 전환 시 커튼박스 기본값: 없음
                    if (spaceInfo.droppedCeiling?.enabled) {
                      updates.droppedCeiling = {
                        ...spaceInfo.droppedCeiling,
                        enabled: false,
                      };
                    }
                    handleSpaceInfoUpdate(updates);
                  }}
                >
                  자유배치
                </button>
              </div>
            )}
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
            bottom: (activeMobileTab === 'modules' || activeMobileTab === 'column') ? '35%' : '70px', /* 패널 열림: 화면 65% 뷰어, 35% 패널 */
            transition: 'bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: '0 40px', /* 좌우 치수 및 가이드가 잘리지 않도록 여백 확보 */
          } : {
            position: 'absolute',
            left: isLayoutBuilderOpen ? '0' : (activeSidebarTab ? 'var(--sidebar-total-width, 304px)' : 'var(--sidebar-icon-width, 56px)'),
            right: isLayoutBuilderOpen ? '0' : (isReadOnly ? '0' : (isRightPanelOpen ? 'var(--right-panel-width, 320px)' : '0')),
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
                  setShowAll(false);
                } else if (mode === '3D') {
                  setRenderMode('solid');
                }
              }}
              showDimensions={showDimensions}
              onToggleDimensions={toggleDimensions}
              showGuides={showGuides}
              onToggleGuides={toggleGuides}
            />
          )}

          {/* 뷰어 컨트롤 - 데스크탑용 */}
          {!isMobile && (
            <ViewerControls
              viewMode={viewMode as ViewMode}
              onViewModeChange={(mode) => {
                setViewMode(mode);
                // 2D 모드 선택 시 와이어프레임으로 자동 설정 + 컬럼 끄기
                if (mode === '2D') {
                  setRenderMode('wireframe');
                  setShowAll(false);
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
// console.log('🎯 Configurator toggle - current:', showFurniture, '-> new:', !showFurniture);
                setShowFurniture(!showFurniture);
              }}
              doorsOpen={doorsOpen}
              onDoorsToggle={toggleDoors}
              hasDoorsInstalled={hasDoorsInstalled}
              onDoorInstallationToggle={handleDoorInstallation}
              surroundGenerated={(() => {
                const fs = spaceInfo.freeSurround;
                return fs ? (fs.left.enabled || fs.top.enabled || fs.right.enabled || (fs.middle?.some(m => m.enabled) ?? false)) : false;
              })()}
              onSurroundGenerate={() => {
                const fs = spaceInfo.freeSurround;
                const isActive = fs ? (fs.left.enabled || fs.top.enabled || fs.right.enabled || (fs.middle?.some(m => m.enabled) ?? false)) : false;

                if (isActive) {
                  // 서라운드 비활성화 — 기존 middle 데이터 유지하면서 enabled만 false
                  setSpaceInfo({
                    freeSurround: {
                      left: { ...fs!.left, enabled: false },
                      top: { ...fs!.top, enabled: false },
                      right: { ...fs!.right, enabled: false },
                      middle: fs!.middle?.map(m => ({ ...m, enabled: false })),
                    }
                  });
                  return;
                }

                // 서라운드 생성
                const result = generateSurround(spaceInfo, placedModules);
                if (!result.success) {
                  alert(result.errorMessage);
                  return;
                }
                setSpaceInfo({ freeSurround: result.config });
              }}
            />
          )}

          {/* 3D 뷰어 */}
          <div className={`${styles.viewer} ${isMobile ? responsiveStyles.mobileViewer : ''}`}>
            {/* 도어가 설치된 경우에만 뷰어 상단에 Close/Open 토글 버튼 표시 */}
            {hasDoorsInstalled && (
              <div className={styles.viewerDoorToggle}>
                <button
                  className={`${styles.viewerDoorButton} ${doorsOpen !== true ? styles.active : ''}`}
                  onClick={() => {
                    setDoorsOpen(false);
                  }}
                >
                  Close
                </button>
                <button
                  className={`${styles.viewerDoorButton} ${doorsOpen === true ? styles.active : ''}`}
                  onClick={() => {
                    setDoorsOpen(true);
                  }}
                >
                  Open
                </button>
              </div>
            )}
            <Space3DView
              key={`space3d-${spaceInfo.droppedCeiling?.enabled}-${spaceInfo.droppedCeiling?.position}-${spaceInfo.droppedCeiling?.width}-${spaceInfo.droppedCeiling?.dropHeight}-${spaceInfo.curtainBoxFinished}`}
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

            {/* 커스텀 가구 설계모드 종료 버튼 — 뷰어 중앙 하단 */}
            {isLayoutBuilderOpen && (
              <button
                className={styles.exitDesignModeBtn}
                onClick={() => {
                  const wantSave = window.confirm(
                    '설계모드를 종료합니다.\n\n[확인] → 저장하고 돌아가기\n[취소] → 저장하지 않고 돌아가기'
                  );

                  if (wantSave) {
                    // "저장하고 돌아가기" — CustomizablePropertiesPanel이 감지하여 저장 처리
                    useUIStore.getState().setDesignExitSaveRequest(true);
                    return;
                  }

                  // "그냥 돌아가기" — 저장 없이 종료
                  const furnitureState = useFurnitureStore.getState();
                  const newlyPlacedId = furnitureState.newlyPlacedCustomModuleId;

                  if (newlyPlacedId) {
                    furnitureState.removeModule(newlyPlacedId);
                    furnitureState.setNewlyPlacedCustomModuleId(null);
                  }

                  const myCabinetState = useMyCabinetStore.getState();
                  if (myCabinetState.editingCabinetId && myCabinetState.editBackup) {
                    const { setPlacedModules: setModules } = furnitureState;
                    setModules(myCabinetState.editBackup.modules);
                    setSpaceInfo({ layoutMode: myCabinetState.editBackup.layoutMode });
                    myCabinetState.setEditBackup(null);
                  }
                  myCabinetState.setEditingCabinetId(null);
                  furnitureState.setFurniturePlacementMode(false);
                  furnitureState.setPendingCustomConfig(null);
                  closeAllPopups();
                  setLayoutBuilderOpen(false);
                }}
              >
                설계모드 종료
              </button>
            )}

            {/* 슬롯 분할 가이드 도움말 ? 아이콘 (자유배치 모드에서는 숨김) */}
            {(spaceInfo.layoutMode || 'equal-division') !== 'free-placement' && (
              <button
                ref={slotGuideBtnRef}
                className={`${styles.slotGuideHelpButton} ${isSlotGuideOpen ? styles.active : ''}`}
                onClick={() => setIsSlotGuideOpen(!isSlotGuideOpen)}
                title="슬롯 분할 가이드"
              >
                ?
              </button>
            )}

            {/* 슬롯 가이드 딤 오버레이 */}
            {isSlotGuideOpen && <div className={styles.slotGuideOverlay} />}

            {/* 슬롯 분할 가이드 설명 팝업 */}
            {isSlotGuideOpen && (() => {
              const totalW = spaceInfo.width;
              const isSurround = spaceInfo.surroundType === 'surround';
              const installType = spaceInfo.installType || 'builtin';
              const isBuiltin = installType === 'builtin' || installType === 'built-in';
              const isSemi = installType === 'semistanding' || installType === 'semi-standing';
              const isFree = installType === 'freestanding' || installType === 'free-standing';
              const wallLeft = spaceInfo.wallConfig?.left ?? true;
              const EP = 18; // 엔드패널 두께

              // 내경 계산: 서라운드 vs 노서라운드
              let leftReduction = 0;
              let rightReduction = 0;
              let leftLabel = '';
              let rightLabel = '';
              let installLabel = '';

              if (isSurround) {
                const defaultFrame = 50;
                const frameL = spaceInfo.frameSize?.left !== undefined ? spaceInfo.frameSize.left : defaultFrame;
                const frameR = spaceInfo.frameSize?.right !== undefined ? spaceInfo.frameSize.right : defaultFrame;

                if (isBuiltin) {
                  leftReduction = frameL;
                  rightReduction = frameR;
                  leftLabel = `좌측 프레임 ${frameL}mm`;
                  rightLabel = `우측 프레임 ${frameR}mm`;
                  installLabel = '양쪽벽 (빌트인)';
                } else if (isSemi) {
                  if (wallLeft) {
                    leftReduction = frameL;
                    rightReduction = EP;
                    leftLabel = `좌측 프레임 ${frameL}mm (벽)`;
                    rightLabel = `우측 엔드패널 ${EP}mm`;
                  } else {
                    leftReduction = EP;
                    rightReduction = frameR;
                    leftLabel = `좌측 엔드패널 ${EP}mm`;
                    rightLabel = `우측 프레임 ${frameR}mm (벽)`;
                  }
                  installLabel = '한쪽벽 (세미스탠딩)';
                } else {
                  leftReduction = EP;
                  rightReduction = EP;
                  leftLabel = `좌측 엔드패널 ${EP}mm`;
                  rightLabel = `우측 엔드패널 ${EP}mm`;
                  installLabel = '벽없음 (프리스탠딩)';
                }
              } else {
                // 노서라운드
                const gapL = spaceInfo.gapConfig?.left ?? 2;
                const gapR = spaceInfo.gapConfig?.right ?? 2;

                if (isBuiltin) {
                  leftReduction = gapL;
                  rightReduction = gapR;
                  leftLabel = `좌측 이격 ${gapL}mm`;
                  rightLabel = `우측 이격 ${gapR}mm`;
                  installLabel = '양쪽벽 (빌트인)';
                } else if (isSemi) {
                  if (wallLeft) {
                    leftReduction = spaceInfo.gapConfig?.left || 0;
                    rightReduction = 0;
                    leftLabel = `좌측 이격 ${leftReduction}mm (벽)`;
                    rightLabel = '우측 0mm (엔드패널 포함)';
                  } else {
                    leftReduction = 0;
                    rightReduction = spaceInfo.gapConfig?.right || 0;
                    leftLabel = '좌측 0mm (엔드패널 포함)';
                    rightLabel = `우측 이격 ${rightReduction}mm (벽)`;
                  }
                  installLabel = '한쪽벽 (세미스탠딩)';
                } else {
                  leftReduction = 0;
                  rightReduction = 0;
                  leftLabel = '좌측 0mm (엔드패널 포함)';
                  rightLabel = '우측 0mm (엔드패널 포함)';
                  installLabel = '벽없음 (프리스탠딩)';
                }
              }

              const internalW = totalW - leftReduction - rightReduction;
              const hasReduction = leftReduction > 0 || rightReduction > 0;
              const gapM = spaceInfo.gapConfig?.middle ?? 2;
              const hasDropped = spaceInfo.droppedCeiling?.enabled === true;
              const droppedW = spaceInfo.droppedCeiling?.width || ((spaceInfo.layoutMode === 'free-placement') ? 150 : 900);
              const droppedPos = spaceInfo.droppedCeiling?.position || 'right';

              // 단내림 구간별 슬롯 영역 계산 (B안)
              // 메인구간: 외벽쪽 이격 + 중간이격 차감
              // 단내림구간: 중간이격 흡수(+) + 외벽쪽 이격 차감(-)
              const mainOuterW = totalW - droppedW; // 메인구간 외부 너비
              let mainSlotW: number;
              let droppedSlotW: number;

              if (hasDropped) {
                if (droppedPos === 'right') {
                  // 메인(좌), 단내림(우)
                  mainSlotW = mainOuterW - leftReduction - gapM;
                  droppedSlotW = droppedW + gapM - rightReduction;
                } else {
                  // 단내림(좌), 메인(우)
                  droppedSlotW = droppedW + gapM - leftReduction;
                  mainSlotW = mainOuterW - rightReduction - gapM;
                }
              } else {
                mainSlotW = internalW;
                droppedSlotW = 0;
              }

              // 일반 구간 계산
              const normalW = hasDropped ? mainSlotW : internalW;
              const normalCols = spaceInfo.mainDoorCount || spaceInfo.customColumnCount || Math.max(1, Math.round(normalW / 600));
              const normalRawSlot = normalW / normalCols;
              const normalSingleW = Math.floor(normalRawSlot);
              const normalDualW = Math.floor(normalRawSlot * 2 * 2) / 2;

              // 단내림 구간 계산
              const droppedCols = spaceInfo.droppedCeilingDoorCount || Math.max(1, Math.round((hasDropped ? droppedSlotW : droppedW) / 600));
              const droppedRawSlot = hasDropped ? droppedSlotW / droppedCols : droppedW / droppedCols;
              const droppedSingleW = Math.floor(droppedRawSlot);
              const droppedDualW = Math.floor(droppedRawSlot * 2 * 2) / 2;

              const fmtSlot = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1);
              const fmtDual = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1);

              return (
                <div ref={slotGuideRef} className={styles.slotGuidePopup}>
                  <div className={styles.slotGuidePopupTitle}>
                    <TbRulerMeasure size={18} /> 슬롯 분할 가이드
                  </div>

                  {/* 설치 타입 표시 */}
                  <div className={styles.slotGuidePopupSection}>
                    <div className={styles.slotGuidePopupLabel}>
                      {isSurround ? '서라운드' : '노서라운드'} · {installLabel}
                    </div>
                  </div>

                  {/* 내경 계산 */}
                  <div className={styles.slotGuidePopupSection}>
                    <div className={styles.slotGuidePopupLabel}>내경 계산</div>
                    <p className={styles.slotGuidePopupDesc}>
                      전체 너비({totalW}mm)에서 {hasReduction ? (<>{leftLabel} + {rightLabel}를 빼서</>) : '양쪽 차감이 없어'} <strong>내경 {internalW}mm</strong>{hasReduction ? '를 구합니다.' : '가 전체 너비와 동일합니다.'}
                    </p>
                    <p className={styles.slotGuidePopupDesc}>
                      <span className={styles.slotGuidePopupFormula}>
                        {totalW} − {leftReduction} − {rightReduction} = {internalW}mm
                      </span>
                    </p>
                  </div>

                  <div className={styles.slotGuidePopupDivider} />

                  {hasDropped ? (
                    <>
                      {/* 단내림 — 구간별 슬롯 계산 */}
                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>메인 구간 ({droppedPos === 'right' ? '좌' : '우'})</div>
                        <p className={styles.slotGuidePopupDesc}>
                          메인 {mainOuterW}mm에서 {droppedPos === 'right' ? leftLabel : rightLabel} + 중간이격 {gapM}mm를 빼서 <strong>슬롯 영역 {fmtSlot(normalW)}mm</strong>
                        </p>
                        <p className={styles.slotGuidePopupDesc}>
                          <span className={styles.slotGuidePopupFormula}>
                            ({mainOuterW} − {droppedPos === 'right' ? leftReduction : rightReduction} − {gapM}) ÷ {normalCols} = {fmtSlot(normalRawSlot)}mm
                          </span>
                        </p>
                      </div>

                      <div className={styles.slotGuidePopupDivider} />

                      {/* 단내림 구간 슬롯 */}
                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>단내림 구간 ({droppedPos === 'left' ? '좌' : '우'})</div>
                        <p className={styles.slotGuidePopupDesc}>
                          단내림 {droppedW}mm + 중간이격 {gapM}mm − {droppedPos === 'right' ? rightLabel : leftLabel}로 <strong>슬롯 영역 {fmtSlot(droppedSlotW)}mm</strong>
                        </p>
                        <p className={styles.slotGuidePopupDesc}>
                          <span className={styles.slotGuidePopupFormula}>
                            ({droppedW} + {gapM} − {droppedPos === 'right' ? rightReduction : leftReduction}) ÷ {droppedCols} = {fmtSlot(droppedRawSlot)}mm
                          </span>
                        </p>
                      </div>

                      <div className={styles.slotGuidePopupDivider} />

                      {/* 내림 규칙 — 구간별 */}
                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>가구 너비 결정 (내림 규칙)</div>
                        <p className={styles.slotGuidePopupDesc}>가구 제작 오차를 고려해 내림 처리합니다.</p>
                      </div>

                      <div className={styles.slotGuidePopupExample}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>일반 구간</div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>싱글 (1칸)</span>
                          <span>{normalSingleW}mm</span>
                        </div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>듀얼 (2칸)</span>
                          <span>{fmtDual(normalDualW)}mm</span>
                        </div>
                      </div>
                      <div className={styles.slotGuidePopupExample} style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>단내림 구간</div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>싱글 (1칸)</span>
                          <span>{droppedSingleW}mm</span>
                        </div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>듀얼 (2칸)</span>
                          <span>{fmtDual(droppedDualW)}mm</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* 단내림 없음 — 기존 로직 */}
                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>슬롯 분할</div>
                        <p className={styles.slotGuidePopupDesc}>
                          내경 {internalW}mm를 {normalCols}개 컬럼으로 나누면 각 슬롯은 <strong>{fmtSlot(normalRawSlot)}mm</strong>입니다.
                        </p>
                        <p className={styles.slotGuidePopupDesc}>
                          <span className={styles.slotGuidePopupFormula}>
                            {internalW} ÷ {normalCols} = {fmtSlot(normalRawSlot)}mm
                          </span>
                        </p>
                      </div>

                      <div className={styles.slotGuidePopupDivider} />

                      <div className={styles.slotGuidePopupSection}>
                        <div className={styles.slotGuidePopupLabel}>가구 너비 결정 (내림 규칙)</div>
                        <p className={styles.slotGuidePopupDesc}>
                          {isSurround
                            ? <>프레임/엔드패널 차감으로 슬롯이 {normalRawSlot % 1 === 0 ? '정수' : '소수점'}이므로, 가구 제작 오차를 고려해 내림 처리합니다.</>
                            : hasReduction
                              ? <>이격거리로 인해 슬롯이 {normalRawSlot % 1 === 0 ? '정수' : '소수점'}이므로, 가구 제작 오차를 고려해 내림 처리합니다.</>
                              : '가구 제작 시 오차를 고려하여 슬롯 너비를 내림 처리합니다.'}
                        </p>
                      </div>

                      <div className={styles.slotGuidePopupExample}>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>싱글 가구 (1칸)</span>
                          <span>{normalSingleW}mm (정수 내림)</span>
                        </div>
                        <div className={styles.slotGuidePopupExampleRow}>
                          <span>듀얼 가구 (2칸)</span>
                          <span>{fmtDual(normalDualW)}mm (0.5 단위 내림)</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

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
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d={isRightPanelOpen ? "M1 1L6 6L1 11" : "M6 1L1 6L6 11"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* 우측 패널 컨테이너 - 읽기 전용 모드에서는 숨김 */}
        {!isReadOnly && (
          <div
            className={styles.rightPanelContainer}
            style={{
              width: isRightPanelOpen ? 'var(--right-panel-width, 320px)' : '0',
              visibility: isRightPanelOpen ? 'visible' : 'hidden',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear ' + (isRightPanelOpen ? '0s' : '0.3s')
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
      <CustomizablePropertiesPanel />

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

      {/* 보링 데이터 내보내기 대화상자 */}
      <BoringExportDialog
        isOpen={showBoringExportDialog}
        onClose={() => setShowBoringExportDialog(false)}
        panels={boringPanels}
      />

      {/* 새 디자인 생성 모달 */}
      {isNewDesignModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsNewDesignModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ padding: '24px', maxWidth: '420px' }}>
            <button className={styles.modalCloseButton} onClick={() => setIsNewDesignModalOpen(false)}>×</button>
            <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: 'var(--theme-text)' }}>새 디자인</h3>

            {/* 프로젝트 선택 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: '6px' }}>프로젝트</label>
              <select
                value={newDesignProjectId || ''}
                onChange={e => setNewDesignProjectId(e.target.value || null)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid var(--theme-border)',
                  borderRadius: '6px', background: 'var(--theme-surface)', color: 'var(--theme-text)',
                  fontSize: '13px', outline: 'none',
                }}
              >
                <option value="">프로젝트를 선택하세요</option>
                {newDesignProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            {/* 디자인 이름 */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: '6px' }}>디자인 이름</label>
              <input
                type="text"
                value={newDesignName}
                onChange={e => setNewDesignName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isCreatingNewDesign && handleNewDesignSubmit()}
                placeholder="디자인 이름을 입력하세요"
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid var(--theme-border)',
                  borderRadius: '6px', background: 'var(--theme-surface)', color: 'var(--theme-text)',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsNewDesignModalOpen(false)}
                style={{
                  padding: '8px 20px', border: '1px solid var(--theme-border)', borderRadius: '6px',
                  background: 'var(--theme-surface)', color: 'var(--theme-text)', fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleNewDesignSubmit}
                disabled={!newDesignName.trim() || !newDesignProjectId || isCreatingNewDesign}
                style={{
                  padding: '8px 20px', border: 'none', borderRadius: '6px',
                  background: !newDesignName.trim() || !newDesignProjectId || isCreatingNewDesign ? '#ccc' : 'var(--theme-primary)',
                  color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {isCreatingNewDesign ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공간 설정 팝업 (isSpaceConfigured === false 일 때) */}
      {showSpaceConfigPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: '90vw',
            maxWidth: '1200px',
            height: '85vh',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          }}>
            <Step2SpaceAndCustomization
              mode="configure"
              designFileId={currentDesignFileId || undefined}
              projectId={currentProjectId || undefined}
              onPrevious={() => { }}
              onClose={() => setShowSpaceConfigPopup(false)}
              onComplete={() => {
// console.log('✅ 공간 설정 팝업 완료');
                setShowSpaceConfigPopup(false);
              }}
            />
          </div>
        </div>
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
            onSettingsClick={handleMobileMenuToggle}
          />

          {/* 모듈/기둥/기타 패널 */}
          <MobilePanel
            activeTab={activeMobileTab}
            isOpen={activeMobileTab === 'modules' || activeMobileTab === 'column'}
          />

          {/* 바텀시트 - 재질 */}
          <MobileBottomSheet
            isOpen={mobileSheetOpen && activeMobileTab === 'material'}
            onClose={() => { setMobileSheetOpen(false); setActiveMobileTab(null); }}
            title="재질 선택"
          >
            <MaterialPanel />
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
