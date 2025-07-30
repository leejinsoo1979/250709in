import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSpaceConfigStore, SPACE_LIMITS, DEFAULT_SPACE_VALUES } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useFurnitureSpaceAdapter } from '@/editor/shared/furniture/hooks/useFurnitureSpaceAdapter';
import { getProject, updateProject, createProject, createDesignFile } from '@/firebase/projects';
import { captureProjectThumbnail, generateDefaultThumbnail } from '@/editor/shared/utils/thumbnailCapture';
import { useAuth } from '@/auth/AuthProvider';
import { SpaceCalculator } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// 새로운 컴포넌트들 import
import Header from './components/Header';
import Sidebar, { SidebarTab } from './components/Sidebar';
import ViewerControls, { ViewMode, ViewDirection, RenderMode } from './components/ViewerControls';
import RightPanel, { RightPanelTab, DoorCountSlider as DoorSlider } from './components/RightPanel';
import { ModuleContent } from './components/RightPanel';
import DashboardFileTree from '@/components/FileTree/DashboardFileTree';
import { TouchCompatibleControl } from './components/TouchCompatibleControls';


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

import { 
  WidthControl,
  HeightControl,
  InstallTypeControls, 
  SurroundControls,
  BaseControls
} from '@/editor/shared/controls';
import GapControls from '@/editor/shared/controls/customization/components/GapControls';

import styles from './style.module.css';
import rightPanelStyles from './components/RightPanel.module.css';

const Configurator: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentDesignFileId, setCurrentDesignFileId] = useState<string | null>(null);
  const [currentDesignFileName, setCurrentDesignFileName] = useState<string>('');

  // Store hooks
  const { setBasicInfo, basicInfo } = useProjectStore();
  const { setSpaceInfo, spaceInfo, updateColumn } = useSpaceConfigStore();
  const { setPlacedModules, placedModules, setAllDoors, clearAllModules } = useFurnitureStore();
  const derivedSpaceStore = useDerivedSpaceStore();
  const { updateFurnitureForNewSpace } = useFurnitureSpaceAdapter({ setPlacedModules });
  const { viewMode, setViewMode, doorsOpen, toggleDoors, view2DDirection, setView2DDirection, showDimensions, toggleDimensions, showDimensionsText, toggleDimensionsText, setHighlightedFrame, selectedColumnId, setSelectedColumnId, activePopup, openColumnEditModal, closeAllPopups, showGuides, toggleGuides, showAxis, toggleAxis, setActiveDroppedCeilingTab } = useUIStore();

  // 새로운 UI 상태들
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab | null>('module');
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<'slotA' | 'stepDown'>('slotA');
  const [showStepDownTab, setShowStepDownTab] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  const [moduleCategory, setModuleCategory] = useState<'tall' | 'upperlower'>('tall'); // 키큰장/상하부장 토글
  const [upperLowerTab, setUpperLowerTab] = useState<'upper' | 'lower'>('upper'); // 상부장/하부장 탭
  
  // 뷰어 컨트롤 상태들 - view2DDirection과 showDimensions는 UIStore 사용
  const [renderMode, setRenderMode] = useState<RenderMode>('solid'); // wireframe → solid로 기본값 변경
  const [showAll, setShowAll] = useState(true);
  const [isConvertPanelOpen, setIsConvertPanelOpen] = useState(false); // 컨버팅 패널 상태

  // 기존 공간 변경 로직 복구
  const [previousSpaceInfo, setPreviousSpaceInfo] = useState(() => {
    // 초기 spaceInfo에서도 installType 변환
    const initialSpaceInfo = { ...spaceInfo };
    if (initialSpaceInfo.installType === 'built-in') {
      initialSpaceInfo.installType = 'builtin';
    }
    return initialSpaceInfo;
  });

  // 키보드 단축키 이벤트 리스너
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // D 키로 도어 열기/닫기 토글
      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        console.log('🚪 D 키로 도어 토글 시도');
        toggleDoors();
        return;
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
            newX = Math.max(-(spaceWidthM/2) + (columnWidthM/2), currentX - moveStep);
          } else if (event.key === 'ArrowRight') {
            newX = Math.min((spaceWidthM/2) - (columnWidthM/2), currentX + moveStep);
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

  // 파일 시작 시 3D 정면뷰로 초기화
  useEffect(() => {
    setViewMode('3D');
    setView2DDirection('front');
  }, [setViewMode, setView2DDirection]);
  
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
    
    let count = range.ideal;
    
    // 단내림이 활성화된 경우 메인구간 도어 개수 사용
    if (spaceInfo.droppedCeiling?.enabled) {
      if (spaceInfo.mainDoorCount) {
        count = spaceInfo.mainDoorCount;
      } else {
        // mainDoorCount가 없으면 현재 customColumnCount 사용
        count = spaceInfo.customColumnCount || derivedSpaceStore.columnCount || range.ideal;
      }
    } else {
      // 단내림이 비활성화된 경우 mainDoorCount는 무시하고 customColumnCount 사용
      if (spaceInfo.customColumnCount) {
        count = spaceInfo.customColumnCount;
      } else if (derivedSpaceStore.isCalculated && derivedSpaceStore.columnCount) {
        count = derivedSpaceStore.columnCount;
      }
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

  // 배치된 가구 중 도어가 있는 가구가 있는지 확인
  const hasDoorsInstalled = placedModules.some(module => module.hasDoor);

  // 프로젝트 데이터 로드
  const loadProject = async (projectId: string) => {
    setLoading(true);
    try {
      const { project, error } = await getProject(projectId);
      if (error) {
        console.error('프로젝트 로드 에러:', error);
        alert('프로젝트를 불러오는데 실패했습니다: ' + error);
        navigate('/');
        return;
      }

      if (project) {
        // 프로젝트 데이터를 설정하되, title은 Firebase의 title을 우선 사용
        const projectTitle = project.title || project.projectData.title || '새 프로젝트';
        setBasicInfo({
          title: projectTitle,
          location: project.projectData.location || ''
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
        
        setSpaceInfo(spaceConfig);
        setPlacedModules(project.furniture.placedModules);
        setCurrentProjectId(projectId);
        
        // 디자인파일명 설정은 별도 useEffect에서 처리됨
        
        console.log('✅ 프로젝트 로드 성공:', project.title);
        console.log('🎨 로드된 materialConfig:', project.spaceConfig.materialConfig);
        
        // 프로젝트 로드 후 derivedSpaceStore 명시적 재계산
        console.log('🔄 [프로젝트 로드 후] derivedSpaceStore 강제 재계산');
        derivedSpaceStore.recalculateFromSpaceInfo(project.spaceConfig);
      }
    } catch (error) {
      console.error('프로젝트 로드 실패:', error);
      alert('프로젝트 로드 중 오류가 발생했습니다.');
      navigate('/');
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
      return obj.map(removeUndefinedValues);
    }
    
    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = removeUndefinedValues(value);
        }
      }
      return result;
    }
    
    return obj;
  };

  // 디자인 파일 저장 (프로젝트가 아닌 디자인 파일로 저장)
  const saveProject = async () => {
    console.log('💾 [DEBUG] saveProject 함수 시작');
    console.log('💾 [DEBUG] 현재 프로젝트 ID:', currentProjectId);
    console.log('💾 [DEBUG] 현재 디자인파일 ID:', currentDesignFileId);
    console.log('💾 [DEBUG] Firebase 설정:', isFirebaseConfigured());
    console.log('💾 [DEBUG] 사용자 상태:', !!user);
    console.log('💾 [DEBUG] 사용자 정보:', user ? { email: user.email, uid: user.uid } : 'null');
    
    if (!currentProjectId) {
      console.error('💾 [ERROR] 프로젝트 ID가 없습니다');
      alert('저장할 프로젝트가 없습니다. 새 프로젝트를 먼저 생성해주세요.');
      return;
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
      console.log('💾 [DEBUG] 저장할 placedModules 개수:', placedModules.length);
      
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
          if (currentDesignFileId) {
            console.log('💾 [DEBUG] 기존 디자인 파일 업데이트');
            const { updateDesignFile } = await import('@/firebase/projects');
            
            const updatePayload = {
              name: currentDesignFileName || basicInfo.title,
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
              hasThumbnail: !!updatePayload.thumbnail
            });
            
            const { error } = await updateDesignFile(currentDesignFileId, updatePayload);
            
            if (error) {
              console.error('💾 [ERROR] 디자인 파일 업데이트 실패:', error);
              setSaveStatus('error');
              alert('디자인 파일 저장에 실패했습니다: ' + error);
            } else {
              setSaveStatus('success');
              console.log('✅ 디자인 파일 저장 성공');
            }
          } else {
            console.log('💾 [DEBUG] 새 디자인 파일 생성');
            const { createDesignFile } = await import('@/firebase/projects');
            const { id: designFileId, error } = await createDesignFile({
              name: basicInfo.title || '새 디자인',
              projectId: currentProjectId,
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
              setCurrentDesignFileId(designFileId);
              setCurrentDesignFileName(basicInfo.title);
              setSaveStatus('success');
              console.log('✅ 새 디자인 파일 생성 및 저장 성공');
              
              // URL 업데이트
              navigate(`/configurator?projectId=${currentProjectId}&designFileId=${designFileId}`, { replace: true });
            }
          }
            
          // 다른 창(대시보드)에 프로젝트 업데이트 알림
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ 
              type: 'PROJECT_SAVED', 
              projectId: currentProjectId,
              timestamp: Date.now()
            });
            console.log('💾 [DEBUG] BroadcastChannel 알림 전송 완료');
            channel.close();
          } catch (broadcastError) {
            console.warn('💾 [WARN] BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
          }
        } catch (firebaseError) {
          console.error('💾 [ERROR] Firebase 저장 중 예외:', firebaseError);
          setSaveStatus('error');
          alert('디자인 파일 저장 중 오류가 발생했습니다: ' + firebaseError.message);
        }
        
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        console.log('💾 [DEBUG] 데모 모드 저장 진입');
        
        try {
          const demoProject = {
            id: currentProjectId,
            title: basicInfo.title || '데모 프로젝트',
            projectData: basicInfo,
            spaceConfig: spaceInfo,
            furniture: {
              placedModules: placedModules
            },
            thumbnail: thumbnail,
            savedAt: new Date().toISOString(),
            furnitureCount: placedModules.length
          };
          
          // 로컬 스토리지에 저장
          const storageKey = `demoProject_${currentProjectId}`;
          localStorage.setItem(storageKey, JSON.stringify(demoProject));
          console.log('💾 [DEBUG] 데모 프로젝트 로컬 저장 완료, key:', storageKey);
          
          setSaveStatus('success');
          console.log('✅ 데모 프로젝트 저장 성공');
          alert('데모 프로젝트가 로컬에 저장되었습니다!');
        } catch (demoError) {
          console.error('💾 [ERROR] 데모 저장 중 예외:', demoError);
          setSaveStatus('error');
          alert('데모 프로젝트 저장 중 오류가 발생했습니다: ' + demoError.message);
        }
        
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

      // 기본 설정으로 새 디자인 생성
      const defaultSpaceConfig = {
        width: 4000,
        height: 2400,
        depth: 3000,
        frameThickness: 20,
        frameColor: '#E5E5DC',
        frameColorName: 'Beige',
        subdivisionMode: 'none' as const,
        columns: 0,
        rows: 0,
        showHorizontalLines: false,
        enableSnapping: true,
        snapDistance: 10,
        gridVisible: true,
        gridSize: 100,
        selectedFinish: 'natural-wood' as const,
        material: {
          type: 'laminate' as const,
          finish: 'natural-wood' as const,
          colorName: 'Natural Wood',
          colorCode: '#D2B48C'
        }
      };

      if (isFirebaseConfigured() && user) {
        // Firebase에 새 디자인파일 생성
        const result = await createDesignFile({
          name: `디자인 ${new Date().toLocaleTimeString()}`,
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
          
          // derivedSpaceStore 재계산
          derivedSpaceStore.recalculateFromSpaceInfo(defaultSpaceConfig);
          
          console.log('✅ 새 디자인파일 생성 완료:', result.id);
          alert('새 디자인이 생성되었습니다!');
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
        console.log('🆕 [DEBUG] 데모 모드로 진행');
        
        try {
          const newProjectId = `demo-${Date.now()}`;
          console.log('🆕 [DEBUG] 새 데모 프로젝트 ID:', newProjectId);
          
          const demoProject = {
            id: newProjectId,
            title: 'Untitled',
            projectData: { title: 'Untitled', location: '' },
            spaceConfig: defaultSpaceConfig,
            furniture: {
              placedModules: []
            },
            thumbnail: thumbnail,
            savedAt: new Date().toISOString(),
            furnitureCount: 0
          };
          
          // 로컬 스토리지에 저장
          localStorage.setItem(`demoProject_${newProjectId}`, JSON.stringify(demoProject));
          console.log('🆕 [DEBUG] 데모 프로젝트 로컬 저장 완료');
          
          // 상태 업데이트
          setBasicInfo({ title: 'Untitled', location: '' });
          setSpaceInfo(defaultSpaceConfig);
          setPlacedModules([]);
          setCurrentProjectId(newProjectId);
          
          // derivedSpaceStore 재계산
          derivedSpaceStore.recalculateFromSpaceInfo(defaultSpaceConfig);
          
          // URL 업데이트
          navigate(`/configurator?projectId=${newProjectId}`, { replace: true });
          
          console.log('✅ 데모 프로젝트 "Untitled" 생성 완료:', newProjectId);
          alert('새 데모 프로젝트가 생성되었습니다!');
        } catch (demoError) {
          console.error('🆕 [ERROR] 데모 프로젝트 생성 실패:', demoError);
          alert('데모 프로젝트 생성 중 오류가 발생했습니다: ' + demoError.message);
        }
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
          // 데모 모드: 로컬에 새 이름으로 저장 (기존 로직 유지)
          const newProjectId = `demo-${Date.now()}`;
          const demoProject = {
            id: newProjectId,
            title: newTitle.trim(),
            projectData: { ...basicInfo, title: newTitle.trim() },
            spaceConfig: spaceInfo,
            furniture: {
              placedModules: placedModules
            },
            thumbnail: thumbnail,
            savedAt: new Date().toISOString(),
            furnitureCount: placedModules.length
          };
          
          localStorage.setItem(`demoProject_${newProjectId}`, JSON.stringify(demoProject));
          setCurrentProjectId(newProjectId);
          setBasicInfo({ ...basicInfo, title: newTitle.trim() });
          setSaveStatus('success');
          
          console.log('✅ 데모 프로젝트 다른이름으로 저장 성공:', newTitle);
          alert(`"${newTitle}"로 로컬에 저장되었습니다!`);
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
          // 데모 모드: 로컬 업데이트
          const demoProject = {
            id: currentProjectId,
            title: newName,
            projectData: { ...basicInfo, title: newName },
            spaceConfig: spaceInfo,
            furniture: {
              placedModules: placedModules
            },
            thumbnail: generateDefaultThumbnail(spaceInfo, placedModules.length),
            savedAt: new Date().toISOString(),
            furnitureCount: placedModules.length
          };
          
          localStorage.setItem(`demoProject_${currentProjectId}`, JSON.stringify(demoProject));
          console.log('✅ 데모 프로젝트 이름 변경 성공:', newName);
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

  // URL에서 디자인파일명 읽기 (별도 useEffect로 분리)
  useEffect(() => {
    const designFileName = searchParams.get('designFileName') || searchParams.get('fileName');
    
    console.log('🔍 URL에서 가져온 designFileName:', designFileName);
    console.log('🔍 현재 basicInfo.title:', basicInfo.title);
    
    if (designFileName) {
      const decodedFileName = decodeURIComponent(designFileName);
      setCurrentDesignFileName(decodedFileName);
      console.log('📝 URL 파라미터로 디자인파일명 설정:', decodedFileName);
    } else if (basicInfo.title) {
      // URL에 디자인파일명이 없으면 현재 작업중인 프로젝트명을 사용
      setCurrentDesignFileName(basicInfo.title);
      console.log('📝 프로젝트명으로 디자인파일명 설정:', basicInfo.title);
    } else {
      // 둘 다 없으면 기본값
      setCurrentDesignFileName('새로운 디자인');
      console.log('📝 기본값으로 디자인파일명 설정: 새로운 디자인');
    }
  }, [searchParams, basicInfo.title]);

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
  useEffect(() => {
    const projectId = searchParams.get('projectId') || searchParams.get('id');
    const mode = searchParams.get('mode');
    const skipLoad = searchParams.get('skipLoad') === 'true';
    
    if (projectId && projectId !== currentProjectId) {
      setCurrentProjectId(projectId);
      
      if (skipLoad) {
        // Step 1-3에서 넘어온 경우 - 이미 스토어에 데이터가 설정되어 있음
        console.log('✅ skipLoad=true - Step 1-3에서 설정한 데이터 유지');
        console.log('🔍 현재 spaceInfo:', spaceInfo);
        console.log('🔍 현재 basicInfo:', basicInfo);
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
          }
        });
      } else {
        // 기존 프로젝트 로드
        loadProject(projectId);
      }
    }
  }, [searchParams, currentProjectId]);

  // 폴더에서 실제 디자인파일명 찾기
  useEffect(() => {
    const loadActualDesignFileName = async () => {
      if (!currentProjectId || !user) return;
      
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
        
        // 폴더에 디자인파일이 없으면 프로젝트명 사용
        if (basicInfo.title && currentDesignFileName === '새로운 디자인') {
          setCurrentDesignFileName(basicInfo.title);
          console.log('📝 폴더에 디자인파일이 없어서 프로젝트명 사용:', basicInfo.title);
        }
        
      } catch (error) {
        console.error('폴더 데이터 로드 실패:', error);
      }
    };
    
    // URL에 디자인파일명이 없을 때만 폴더에서 찾기
    const urlDesignFileName = searchParams.get('designFileName') || searchParams.get('fileName');
    if (!urlDesignFileName && currentProjectId && user) {
      loadActualDesignFileName();
    }
  }, [currentProjectId, user, basicInfo.title, currentDesignFileName, searchParams]);

  // 공간 변경 시 가구 재배치 로직 복구
  useEffect(() => {
    // spaceInfo가 변경되었을 때만 실행
    if (JSON.stringify(previousSpaceInfo) !== JSON.stringify(spaceInfo)) {
      // materialConfig만 변경된 경우는 가구 재배치를 하지 않음
      const prevWithoutMaterial = { ...previousSpaceInfo };
      const currentWithoutMaterial = { ...spaceInfo };
      delete prevWithoutMaterial.materialConfig;
      delete currentWithoutMaterial.materialConfig;
      
      // materialConfig를 제외한 나머지 속성이 변경된 경우에만 가구 업데이트
      if (JSON.stringify(prevWithoutMaterial) !== JSON.stringify(currentWithoutMaterial)) {
        console.log('🔄 공간이 변경되었습니다. 가구 재배치 실행 중...');
        updateFurnitureForNewSpace(previousSpaceInfo, spaceInfo);
      }
      
      // 이전 상태 업데이트
      setPreviousSpaceInfo(spaceInfo);
    }
  }, [spaceInfo, previousSpaceInfo, updateFurnitureForNewSpace]);

  // derivedSpaceStore 강제 재계산 (컬럼 수 동기화를 위해)
  useEffect(() => {
    if (!derivedSpaceStore.isCalculated) {
      console.log('🔄 derivedSpaceStore 강제 재계산 (컬럼 수 동기화)');
      derivedSpaceStore.recalculateFromSpaceInfo(spaceInfo);
    }
  }, [spaceInfo, derivedSpaceStore]);



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
              newFrameSize.right = 20;
            } else if (!currentWallConfig.left && currentWallConfig.right) {
              newFrameSize.left = 20;
              newFrameSize.right = 50;
            }
            break;
          case 'freestanding':
            newFrameSize.left = 20;
            newFrameSize.right = 20;
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
              newFrameSize.right = 20;
            } else if (!currentWallConfig.left && currentWallConfig.right) {
              newFrameSize.left = 20;
              newFrameSize.right = 0;
            }
            break;
          case 'freestanding':
            // 프리스탠딩: 양쪽 엔드패널
            newFrameSize.left = 20;
            newFrameSize.right = 20;
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
        // 좌측벽만 있음: 좌측 프레임 50mm, 우측 엔드패널 20mm
        newFrameSize.left = 50;
        newFrameSize.right = 20;
      } else if (!updates.wallConfig.left && updates.wallConfig.right) {
        // 우측벽만 있음: 좌측 엔드패널 20mm, 우측 프레임 50mm
        newFrameSize.left = 20;
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
              newFrameSize.right = 20;  // 우측: 엔드패널
            } else if (!wallConfig.left && wallConfig.right) {
              newFrameSize.left = 20;   // 좌측: 엔드패널
              newFrameSize.right = 50;  // 우측벽: 프레임
            }
            break;
          case 'freestanding':
            // 벽없음: 양쪽 모두 엔드패널 20mm
            newFrameSize.left = 20;
            newFrameSize.right = 20;
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
              newFrameSize.right = 20;
            } else if (!wallConfig.left && wallConfig.right) {
              newFrameSize.left = 20;
              newFrameSize.right = 0;
            }
            break;
          case 'freestanding':
            // 프리스탠딩: 양쪽 엔드패널
            newFrameSize.left = 20;
            newFrameSize.right = 20;
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
    
    // customColumnCount가 직접 변경되었을 때도 검증
    if (updates.customColumnCount) {
      const currentWidth = finalUpdates.width || spaceInfo.width || 4800;
      const range = calculateDoorRange(currentWidth);
      const usableWidth = currentWidth - 100;
      const proposedSlotWidth = usableWidth / updates.customColumnCount;
      
      // 400-600mm 범위를 벗어나면 조정
      if (proposedSlotWidth < 400 || proposedSlotWidth > 600) {
        const correctedCount = Math.max(range.min, Math.min(range.max, 
          proposedSlotWidth < 400 ? Math.floor(usableWidth / 400) : Math.ceil(usableWidth / 600)
        ));
        finalUpdates = { ...finalUpdates, customColumnCount: correctedCount };
      }
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
      const droppedDefaultCount = Math.max(droppedMinSlots, Math.min(droppedMaxSlots, 2));
      
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
    
    console.log('🔧 최종 업데이트 적용:', {
      updates: finalUpdates,
      hasWallConfig: !!finalUpdates.wallConfig,
      wallConfig: finalUpdates.wallConfig
    });
    
    setSpaceInfo(finalUpdates);
    
    // 단내림 설정 변경 시 강제로 3D 뷰 업데이트
    if (isDroppedCeilingUpdate) {
      console.log('🔄 단내림 설정 변경으로 3D 뷰 강제 업데이트');
      // 강제로 뷰 모드를 다시 설정하여 리렌더링 트리거
      setTimeout(() => {
        setViewMode(viewMode);
      }, 0);
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
  const handlePrevious = () => {
    navigate('/');
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
    console.log('컨버팅 패널 열기');
    setIsConvertPanelOpen(true);
  };

  const handleLogout = () => {
    navigate('/login');
  };

  const handleProfile = () => {
    console.log('프로필');
  };

  // FileTree 토글 핸들러
  const handleFileTreeToggle = () => {
    setIsFileTreeOpen(!isFileTreeOpen);
  };





  // 사이드바 컨텐츠 렌더링
  const renderSidebarContent = () => {
    if (!activeSidebarTab) return null;

    switch (activeSidebarTab) {
      case 'module':
        return (
          <div className={styles.sidebarPanel}>
            <div className={styles.modulePanelContent}>
              {/* 키큰장/상하부장 토글 탭 */}
              <div className={styles.moduleCategoryTabs}>
                <button 
                  className={`${styles.moduleCategoryTab} ${moduleCategory === 'tall' ? styles.active : ''}`}
                  onClick={() => setModuleCategory('tall')}
                >
                  키큰장
                </button>
                <button 
                  className={`${styles.moduleCategoryTab} ${moduleCategory === 'upperlower' ? styles.active : ''}`}
                  onClick={() => setModuleCategory('upperlower')}
                >
                  상하부장
                </button>
              </div>
              
              {/* 상하부장 선택 시 상부장/하부장 탭 표시 */}
              {moduleCategory === 'upperlower' && (
                <div className={styles.upperLowerTabs}>
                  <button 
                    className={`${styles.upperLowerTab} ${upperLowerTab === 'upper' ? styles.active : ''}`}
                    onClick={() => setUpperLowerTab('upper')}
                  >
                    상부장
                  </button>
                  <button 
                    className={`${styles.upperLowerTab} ${upperLowerTab === 'lower' ? styles.active : ''}`}
                    onClick={() => setUpperLowerTab('lower')}
                  >
                    하부장
                  </button>
                </div>
              )}
              
              <div className={styles.moduleSection}>
                <ModuleGallery 
                  moduleCategory={moduleCategory} 
                  upperLowerTab={moduleCategory === 'upperlower' ? upperLowerTab : undefined}
                  activeZone={spaceInfo.droppedCeiling?.enabled ? (activeRightPanelTab === 'stepDown' ? 'dropped' : 'normal') : undefined}
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
    switch (activeRightPanelTab) {
      case 'slotA':
      case 'stepDown':
        return (
          <div className={styles.spaceControls}>
            {/* 공간 설정 - 양쪽 탭에서 모두 표시 */}
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>공간 설정</h3>
              </div>
              
              <WidthControl 
                spaceInfo={spaceInfo}
                onUpdate={handleSpaceInfoUpdate}
                disabled={hasSpecialDualFurniture}
              />
              
              <HeightControl 
                spaceInfo={spaceInfo}
                onUpdate={handleSpaceInfoUpdate}
              />
            </div>

            {/* 메인구간 탭에서 단내림이 있을 때 메인공간 사이즈 표시 */}
            {activeRightPanelTab === 'slotA' && spaceInfo.droppedCeiling?.enabled && (
              <div className={styles.configSection}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionDot}></span>
                  <h3 className={styles.sectionTitle}>메인공간 사이즈</h3>
                </div>
                
                <div className={styles.inputGroup}>
                  <div className={styles.inputGroupTwoColumns}>
                    {/* 메인구간 폭 */}
                    <div className={styles.inputWrapper}>
                      <label className={styles.inputLabel}>메인구간 폭</label>
                      <div className={styles.inputWithUnit}>
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
                    <div className={styles.inputWrapper}>
                      <label className={styles.inputLabel}>메인구간 높이</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          min="1800"
                          max="3000"
                          step="10"
                          value={spaceInfo.height || 2400}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            if (inputValue === '') return;
                            
                            const newHeight = parseInt(inputValue);
                            if (!isNaN(newHeight) && newHeight > 0) {
                              handleSpaceInfoUpdate({ 
                                height: Math.max(1800, Math.min(3000, newHeight))
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
              </div>
            )}

            {/* 단내림 구간일 때만 표시 */}
            {activeRightPanelTab === 'stepDown' && (
              <>
                {/* 단내림 설정 */}
                <div className={styles.configSection}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionDot}></span>
                    <h3 className={styles.sectionTitle}>단내림 구간 사이즈</h3>
                  </div>
                  
                  <div className={styles.inputGroup}>
                    {/* X축 폭과 Y축 높이를 한 줄에 배치 */}
                    <div className={styles.inputGroupTwoColumns}>
                      {/* X축 폭 설정 */}
                      <div className={styles.inputWrapper}>
                        <label className={styles.inputLabel}>단내림 구간 폭</label>
                        <div className={styles.inputWithUnit}>
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
                              const currentWidth = spaceInfo.droppedCeiling?.width || 900;
                              
                              // 빈 값이거나 유효하지 않은 경우 현재 값으로 복구
                              if (inputValue === '' || isNaN(parseInt(inputValue))) {
                                e.target.value = currentWidth.toString();
                                return;
                              }
                              
                              const value = parseInt(inputValue);
                              
                              // 유효한 범위 밖인 경우 가장 가까운 유효값으로 조정
                              if (value < 100) {
                                e.target.value = '100';
                                handleSpaceInfoUpdate({ 
                                  droppedCeiling: {
                                    ...spaceInfo.droppedCeiling,
                                    enabled: true,
                                    width: 100
                                  }
                                });
                              } else if (value > totalWidth - 100) {
                                const maxValue = totalWidth - 100;
                                e.target.value = maxValue.toString();
                                handleSpaceInfoUpdate({ 
                                  droppedCeiling: {
                                    ...spaceInfo.droppedCeiling,
                                    enabled: true,
                                    width: maxValue
                                  }
                                });
                              } else {
                                // 유효한 값이면 그대로 적용하고, 도어 개수도 업데이트
                                const range = calculateDoorRange(value);
                                const currentDoorCount = spaceInfo.droppedCeilingDoorCount || 0;
                                
                                // 현재 도어 개수가 범위를 벗어나면 조정
                                let newDoorCount = currentDoorCount;
                                if (currentDoorCount < range.min || currentDoorCount === 0) {
                                  newDoorCount = range.min;
                                } else if (currentDoorCount > range.max) {
                                  newDoorCount = range.max;
                                }
                                
                                handleSpaceInfoUpdate({ 
                                  droppedCeiling: {
                                    ...spaceInfo.droppedCeiling,
                                    enabled: true,
                                    width: value
                                  }
                                });
                              }
                            }}
                            className={`${styles.input} ${styles.inputWithUnitField}`}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      
                      {/* Y축 단차 설정 */}
                      <div className={styles.inputWrapper}>
                        <label className={styles.inputLabel}>단차 높이</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="number"
                            min="100"
                            max="500"
                            step="10"
                            value={spaceInfo.droppedCeiling?.dropHeight || 200}
                            onChange={(e) => {
                              const inputValue = e.target.value;
                              if (inputValue === '') return;
                              
                              const dropHeight = parseInt(inputValue);
                              if (!isNaN(dropHeight) && dropHeight > 0) {
                                handleSpaceInfoUpdate({ 
                                  droppedCeiling: {
                                    ...spaceInfo.droppedCeiling,
                                    enabled: true,
                                    dropHeight: Math.max(100, Math.min(500, dropHeight))
                                  }
                                });
                              }
                            }}
                            onBlur={(e) => {
                              const dropHeight = Math.max(100, Math.min(500, parseInt(e.target.value) || 200));
                              handleSpaceInfoUpdate({ 
                                droppedCeiling: {
                                  ...spaceInfo.droppedCeiling,
                                  enabled: true,
                                  dropHeight: dropHeight
                                }
                              });
                            }}
                            className={`${styles.input} ${styles.inputWithUnitField}`}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 계산된 단내림 구간 높이 표시 */}
                  <div className={styles.inputGroup}>
                    <div className={styles.inputRow}>
                      <label className={styles.inputLabel}>단내림 구간 높이 (계산값)</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          value={spaceInfo.height - (spaceInfo.droppedCeiling?.dropHeight || 200)}
                          readOnly
                          className={`${styles.input} ${styles.inputWithUnitField}`}
                          style={{ backgroundColor: 'var(--theme-background-tertiary)', cursor: 'not-allowed' }}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* 단내림 위치 설정 */}
                <div className={styles.configSection}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionDot}></span>
                    <h3 className={styles.sectionTitle}>단내림 위치</h3>
                  </div>
                  
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
                
                {/* 단내림 구간 도어 개수 설정 */}
                <div className={styles.configSection}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionDot}></span>
                    <h3 className={styles.sectionTitle}>레이아웃</h3>
                  </div>
                  
                  {/* 단내림 구간 도어 개수 입력 */}
                  <div className={styles.inputGroup}>
                    <div className={styles.inputRow}>
                      <label className={styles.inputLabel}>단내림 구간 도어 개수</label>
                      <div className={styles.numberInputGroup}>
                        <button 
                          className={styles.numberInputButton}
                          onClick={() => {
                            const current = spaceInfo.droppedCeilingDoorCount || 2;
                            const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                            const frameThickness = 50;
                            const internalWidth = droppedWidth - frameThickness;
                            const MAX_SLOT_WIDTH = 600;
                            const MIN_SLOT_WIDTH = 400;
                            const doorRange = {
                              min: Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH)),
                              max: Math.max(1, Math.floor(internalWidth / MIN_SLOT_WIDTH))
                            };
                            if (current > doorRange.min) {
                              handleSpaceInfoUpdate({ droppedCeilingDoorCount: current - 1 });
                            }
                          }}
                          disabled={(() => {
                            const currentValue = spaceInfo.droppedCeilingDoorCount || (() => {
                              const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                              const frameThickness = 50;
                              const internalWidth = droppedWidth - frameThickness;
                              const MAX_SLOT_WIDTH = 600;
                              return Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH));
                            })();
                            const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                            const frameThickness = 50;
                            const internalWidth = droppedWidth - frameThickness;
                            const minValue = Math.max(1, Math.ceil(internalWidth / 600));
                            return currentValue <= minValue;
                          })()}
                        >
                          −
                        </button>
                        <div className={styles.numberInputValue}>
                          {(() => {
                            const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                            const frameThickness = 50;
                            const internalWidth = droppedWidth - frameThickness;
                            const MAX_SLOT_WIDTH = 600;
                            const calculatedMin = Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH));
                            const finalValue = spaceInfo.droppedCeilingDoorCount || calculatedMin;
                            
                            console.log('🔍 단내림 구간 도어개수 입력필드:', {
                              droppedCeilingDoorCount: spaceInfo.droppedCeilingDoorCount,
                              droppedCeiling: spaceInfo.droppedCeiling,
                              droppedWidth,
                              internalWidth,
                              calculatedMin,
                              finalValue
                            });
                            
                            return null;
                          })()}
                          <input
                            type="number"
                            value={(() => {
                              const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                              const frameThickness = 50;
                              const internalWidth = droppedWidth - frameThickness;
                              const MAX_SLOT_WIDTH = 600;
                              const calculatedMin = Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH));
                              
                              // 단내림이 활성화되어 있고 droppedCeilingDoorCount가 유효한 값이면 사용
                              if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeilingDoorCount && spaceInfo.droppedCeilingDoorCount >= calculatedMin) {
                                return spaceInfo.droppedCeilingDoorCount;
                              }
                              // 그렇지 않으면 계산된 기본값 사용
                              return calculatedMin;
                            })()}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 2;
                              console.log('🔍 단내림 구간 도어개수 변경:', {
                                inputValue: e.target.value,
                                parsedValue: value,
                                previousValue: spaceInfo.droppedCeilingDoorCount
                              });
                              handleSpaceInfoUpdate({ droppedCeilingDoorCount: value });
                            }}
                            style={{ 
                              width: '60px', 
                              textAlign: 'center',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--theme-text)',
                              fontSize: '14px',
                              fontWeight: '500'
                            }}
                          />
                        </div>
                        <button 
                          className={styles.numberInputButton}
                          onClick={() => {
                            const current = spaceInfo.droppedCeilingDoorCount || 2;
                            const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                            const frameThickness = 50;
                            const internalWidth = droppedWidth - frameThickness;
                            const MAX_SLOT_WIDTH = 600;
                            const MIN_SLOT_WIDTH = 400;
                            const doorRange = {
                              min: Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH)),
                              max: Math.max(1, Math.floor(internalWidth / MIN_SLOT_WIDTH))
                            };
                            if (current < doorRange.max) {
                              handleSpaceInfoUpdate({ droppedCeilingDoorCount: current + 1 });
                            }
                          }}
                          disabled={(() => {
                            const currentValue = spaceInfo.droppedCeilingDoorCount || (() => {
                              const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                              const frameThickness = 50;
                              const internalWidth = droppedWidth - frameThickness;
                              const MAX_SLOT_WIDTH = 600;
                              return Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH));
                            })();
                            const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                            const frameThickness = 50;
                            const internalWidth = droppedWidth - frameThickness;
                            const maxValue = Math.max(1, Math.floor(internalWidth / 400));
                            return currentValue >= maxValue;
                          })()}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <DoorSlider
                      value={(() => {
                        // 단내림이 활성화되어 있고 droppedCeilingDoorCount가 설정되어 있으면 사용
                        if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeilingDoorCount) {
                          return spaceInfo.droppedCeilingDoorCount;
                        }
                        // 그렇지 않으면 계산된 기본값 사용
                        const droppedWidth = spaceInfo.droppedCeiling?.width || 900;
                        const frameThickness = 50;
                        const internalWidth = droppedWidth - frameThickness;
                        const MAX_SLOT_WIDTH = 600;
                        const calculatedMin = Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH));
                        return calculatedMin;
                      })()}
                      onChange={(value) => {
                        handleSpaceInfoUpdate({ droppedCeilingDoorCount: value });
                      }}
                      width={spaceInfo.droppedCeiling?.width || 900}
                    />
                  </div>
                  

                </div>
              </>
            )}

            {/* 슬롯A 탭일 때만 레이아웃 표시 */}
            {activeRightPanelTab === 'slotA' && (
              <div className={styles.configSection}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionDot}></span>
                  <h3 className={styles.sectionTitle}>레이아웃</h3>
                </div>
                {console.log('🔍 레이아웃 섹션 렌더링:', {
                  activeTab: activeRightPanelTab,
                  단내림활성화: spaceInfo.droppedCeiling?.enabled,
                  mainDoorCount: spaceInfo.mainDoorCount,
                  customColumnCount: spaceInfo.customColumnCount
                })}
                
                {/* 도어 개수 입력 */}
                {!spaceInfo.droppedCeiling?.enabled ? (
                // 단내림이 없을 때 - 기존 도어 개수
                <div className={styles.inputGroup}>
                  <div className={styles.inputRow}>
                    <label className={styles.inputLabel}>도어 개수</label>
                    <div className={styles.numberInputGroup}>
                      <button 
                        className={styles.numberInputButton}
                        onClick={() => {
                          const current = getCurrentColumnCount();
                          const doorRange = calculateDoorRange(spaceInfo.width || 4800);
                          if (current > doorRange.min) {
                            handleSpaceInfoUpdate({ customColumnCount: current - 1 });
                          }
                        }}
                        disabled={getCurrentColumnCount() <= calculateDoorRange(spaceInfo.width || 4800).min}
                      >
                        −
                      </button>
                      <div className={styles.numberInputValue}>
                        <input
                          type="number"
                          value={getCurrentColumnCount()}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 1;
                            handleSpaceInfoUpdate({ customColumnCount: value });
                          }}
                          style={{ 
                            width: '60px', 
                            textAlign: 'center',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--theme-text)',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        />
                      </div>
                      <button 
                        className={styles.numberInputButton}
                        onClick={() => {
                          const current = getCurrentColumnCount();
                          const doorRange = calculateDoorRange(spaceInfo.width || 4800);
                          if (current < doorRange.max) {
                            handleSpaceInfoUpdate({ customColumnCount: current + 1 });
                          }
                        }}
                        disabled={getCurrentColumnCount() >= calculateDoorRange(spaceInfo.width || 4800).max}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <DoorSlider
                    value={getCurrentColumnCount()}
                    onChange={(value) => {
                      handleSpaceInfoUpdate({ customColumnCount: value });
                    }}
                    width={spaceInfo.width || 4800}
                  />
                </div>
              ) : (
                // 단내림이 있을 때 - 기존 구간과 단내림 구간 분리
                <>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputRow}>
                      <label className={styles.inputLabel}>메인구간 도어 개수</label>
                      <div className={styles.numberInputGroup}>
                        <button 
                          className={styles.numberInputButton}
                          onClick={() => {
                            const current = spaceInfo.mainDoorCount || getCurrentColumnCount();
                            const mainWidth = (spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.width || 900);
                            const doorRange = calculateDoorRange(mainWidth);
                            if (current > doorRange.min) {
                              handleSpaceInfoUpdate({ mainDoorCount: current - 1 });
                            }
                          }}
                          disabled={(spaceInfo.mainDoorCount || getCurrentColumnCount()) <= calculateDoorRange((spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.width || 900)).min}
                        >
                          −
                        </button>
                        <div className={styles.numberInputValue}>
                          <input
                            type="number"
                            value={spaceInfo.mainDoorCount || getCurrentColumnCount()}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 1;
                              handleSpaceInfoUpdate({ mainDoorCount: value });
                            }}
                            style={{ 
                              width: '60px', 
                              textAlign: 'center',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--theme-text)',
                              fontSize: '14px',
                              fontWeight: '500'
                            }}
                          />
                        </div>
                        <button 
                          className={styles.numberInputButton}
                          onClick={() => {
                            const current = spaceInfo.mainDoorCount || getCurrentColumnCount();
                            const mainWidth = (spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.width || 900);
                            const doorRange = calculateDoorRange(mainWidth);
                            if (current < doorRange.max) {
                              handleSpaceInfoUpdate({ mainDoorCount: current + 1 });
                            }
                          }}
                          disabled={(spaceInfo.mainDoorCount || getCurrentColumnCount()) >= calculateDoorRange((spaceInfo.width || 4800) - (spaceInfo.droppedCeiling?.width || 900)).max}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <DoorSlider
                      value={spaceInfo.mainDoorCount || getCurrentColumnCount()}
                      onChange={(value) => {
                        handleSpaceInfoUpdate({ mainDoorCount: value });
                      }}
                      width={spaceInfo.width || 4800}
                    />
                  </div>
                </>
              )}

              </div>
            )}

            {/* 공간 유형 - 양쪽 탭에서 모두 표시 */}
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

              {/* 서라운드 선택 시 - 프레임 속성 설정 */}
              {(spaceInfo.surroundType || 'surround') === 'surround' && (
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
              )}

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
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingSpinner size="large" />
        <p>프로젝트를 불러오는 중...</p>
      </div>
    );
  }

  // 디버깅용 로그
  console.log('🔍 Configurator basicInfo.title:', basicInfo.title);
  console.log('🔍 currentProjectId:', currentProjectId);
  console.log('🔍 currentDesignFileName:', currentDesignFileName);
  console.log('🔍 basicInfo.title:', basicInfo.title);

  return (
    <div className={styles.configurator}>
      {/* 헤더 */}
      <Header
        title={currentDesignFileName || basicInfo.title || "새로운 디자인"}
        projectName={currentDesignFileName || basicInfo.title || "새로운 디자인"}
        onSave={saveProject}
        onPrevious={handlePrevious}
        onHelp={handleHelp}
        onConvert={handleConvert}
        onLogout={handleLogout}
        onProfile={handleProfile}
        saving={saving}
        saveStatus={saveStatus}
        hasDoorsInstalled={hasDoorsInstalled}
        onNewProject={handleNewDesign}
        onSaveAs={handleSaveAs}
        onProjectNameChange={handleProjectNameChange}
        onFileTreeToggle={handleFileTreeToggle}
        isFileTreeOpen={isFileTreeOpen}
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
                onFileSelect={(projectId, designFileName) => {
                  console.log('🗂️ 파일트리에서 선택된 파일:', projectId, designFileName);
                  // 디자인 파일 선택 시 해당 프로젝트 로드
                  navigate(`/configurator?projectId=${projectId}&designFileName=${encodeURIComponent(designFileName)}`);
                  setIsFileTreeOpen(false); // 파일트리 닫기
                  // 페이지 새로고침하여 새 디자인 파일 로드
                  window.location.reload();
                }}
                onCreateNew={() => {
                  console.log('🆕 파일트리에서 새 파일 생성 요청');
                  handleNewProject();
                  setIsFileTreeOpen(false); // 파일트리 닫기
                }}
                onClose={() => setIsFileTreeOpen(false)}
              />
            </div>
          </>
        )}

        {/* 좌측 사이드바 토글 버튼 - 항상 같은 위치에 고정 */}
        <button
          className={`${styles.leftPanelToggle} ${activeSidebarTab ? styles.open : ''}`}
          onClick={() => setActiveSidebarTab(activeSidebarTab ? null : 'module')}
          title={activeSidebarTab ? "사이드바 접기" : "사이드바 펼치기"}
        >
          <span className={styles.foldToggleIcon}>{activeSidebarTab ? '<' : '>'}</span>
        </button>

        {/* 사이드바 - 항상 표시 */}
        <Sidebar
          activeTab={activeSidebarTab}
          onTabClick={handleSidebarTabClick}
          isOpen={!!activeSidebarTab}
          onToggle={() => setActiveSidebarTab(activeSidebarTab ? null : 'module')}
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

        {/* 중앙 뷰어 영역 */}
        <div 
          className={styles.viewerArea}
          style={{
            position: 'absolute',
            left: activeSidebarTab ? '304px' : '64px', /* 64px는 사이드바 너비 */
            right: isRightPanelOpen ? '320px' : '0',
            top: 0,
            bottom: 0,
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >

          {/* 뷰어 컨트롤 */}
          <ViewerControls
            viewMode={viewMode as ViewMode}
            onViewModeChange={(mode) => setViewMode(mode)}
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
            doorsOpen={doorsOpen}
            onDoorsToggle={toggleDoors}
            hasDoorsInstalled={hasDoorsInstalled}
            onDoorInstallationToggle={handleDoorInstallation}
          />

          {/* 3D 뷰어 */}
          <div className={styles.viewer}>
            {/* 도어가 설치된 경우에만 뷰어 상단에 Close/Open 토글 버튼 표시 */}
            {hasDoorsInstalled && (
              <div className={styles.viewerDoorToggle}>
                <button 
                  className={`${styles.viewerDoorButton} ${!doorsOpen ? styles.active : ''}`}
                  onClick={() => !doorsOpen || toggleDoors()}
                >
                  Close
                </button>
                <button 
                  className={`${styles.viewerDoorButton} ${doorsOpen ? styles.active : ''}`}
                  onClick={() => doorsOpen || toggleDoors()}
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
              activeZone={spaceInfo.droppedCeiling?.enabled ? (activeRightPanelTab === 'stepDown' ? 'dropped' : 'normal') : undefined}
            />
          </div>

        </div>

        {/* 우측 패널 폴드/언폴드 버튼 */}
        <button
          className={`${styles.rightPanelToggle} ${isRightPanelOpen ? styles.open : ''}`}
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          title={isRightPanelOpen ? "우측 패널 접기" : "우측 패널 펼치기"}
        >
          <span className={styles.foldToggleIcon}>{isRightPanelOpen ? '>' : '<'}</span>
        </button>

        {/* 우측 패널 컨테이너 */}
        <div 
          className={styles.rightPanelContainer}
          style={{
            width: isRightPanelOpen ? '320px' : '0',
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
          {/* 탭 헤더 */}
          <div className={styles.rightPanelHeader}>
            <div className={styles.rightPanelTabs}>
              <div className={styles.tabGroup}>
                <button
                  className={`${styles.rightPanelTab} ${activeRightPanelTab === 'slotA' ? styles.active : ''}`}
                  onClick={() => {
                    setActiveRightPanelTab('slotA');
                    setActiveDroppedCeilingTab('main');
                  }}
                >
                  {showStepDownTab ? '메인구간' : '슬롯A'}
                </button>
                {showStepDownTab && (
                  <button
                    className={`${styles.rightPanelTab} ${activeRightPanelTab === 'stepDown' ? styles.active : ''}`}
                    onClick={() => {
                      setActiveRightPanelTab('stepDown');
                      setActiveDroppedCeilingTab('dropped');
                    }}
                  >
                    단내림 구간
                  </button>
                )}
              </div>
              <button
                className={`${styles.addTabButton} ${showStepDownTab ? styles.active : ''}`}
                onClick={() => {
                  setShowStepDownTab(!showStepDownTab);
                  if (!showStepDownTab) {
                    // 단내림 추가 시 배치된 가구 모두 제거
                    clearAllModules();
                    
                    // 메인구간 도어 개수 계산 - 현재 도어 개수 유지
                    const totalWidth = spaceInfo.width || 4800;
                    const droppedWidth = 900; // 단내림 기본 폭 (올바른 값)
                    const mainWidth = totalWidth - droppedWidth;
                    const mainRange = calculateDoorRange(mainWidth);
                    // 현재 도어 개수를 유지하되, 새로운 범위에 맞게 조정
                    const currentCount = getCurrentColumnCount();
                    const adjustedMainDoorCount = Math.max(mainRange.min, Math.min(mainRange.max, currentCount));
                    
                    handleSpaceInfoUpdate({ 
                      droppedCeiling: {
                        enabled: true,
                        width: droppedWidth,  // 기본값 설정
                        dropHeight: 200,  // 기본값 설정 (높이 2200mm = 2400mm - 200mm)
                        position: 'right'  // 기본값 설정
                      },
                      droppedCeilingDoorCount: 2,  // 기본값 설정
                      mainDoorCount: adjustedMainDoorCount  // 현재 도어 개수 유지
                    });
                    // 강제로 3D 뷰 업데이트
                    setTimeout(() => {
                      handleSpaceInfoUpdate({ 
                        droppedCeiling: {
                          ...spaceInfo.droppedCeiling,
                          enabled: true
                        }
                      });
                    }, 0);
                    setActiveRightPanelTab('slotA');
                    setActiveDroppedCeilingTab('main');
                  } else {
                    // 단내림을 비활성화할 때 도어 개수 설정도 초기화
                    handleSpaceInfoUpdate({ 
                      droppedCeiling: {
                        ...spaceInfo.droppedCeiling,
                        enabled: false
                      },
                      mainDoorCount: undefined,
                      droppedCeilingDoorCount: undefined
                    });
                    setActiveRightPanelTab('slotA');
                    setActiveDroppedCeilingTab('main');
                  }
                }}
                title={showStepDownTab ? "단내림 구간 제거" : "단내림 구간 추가"}
              >
                {showStepDownTab ? '−' : '+'}
              </button>
            </div>
          </div>
          {/* 패널 컨텐츠 */}
          <div className={styles.rightPanelContent}>
            {renderRightPanelContent()}
          </div>
        </div>
        </div>
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
        isOpen={isConvertPanelOpen}
        onClose={() => setIsConvertPanelOpen(false)}
      />

    </div>
  );
};

export default Configurator; 