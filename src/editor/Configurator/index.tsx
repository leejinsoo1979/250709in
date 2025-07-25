import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useFurnitureSpaceAdapter } from '@/editor/shared/furniture/hooks/useFurnitureSpaceAdapter';
import { getProject, updateProject, createProject, createDesignFile } from '@/firebase/projects';
import { captureProjectThumbnail, generateDefaultThumbnail } from '@/editor/shared/utils/thumbnailCapture';
import { useAuth } from '@/auth/AuthProvider';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// 새로운 컴포넌트들 import
import Header from './components/Header';
import Sidebar, { SidebarTab } from './components/Sidebar';
import ViewerControls, { ViewMode, ViewDirection, RenderMode } from './components/ViewerControls';
import RightPanel, { RightPanelTab } from './components/RightPanel';
import { ModuleContent } from './components/RightPanel';
import FileTree from '@/components/FileTree/FileTree';


// 기존 작동하는 컴포넌트들
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import ModuleGallery from '@/editor/shared/controls/furniture/ModuleGallery';
import ModulePropertiesPanel from '@/editor/shared/controls/furniture/ModulePropertiesPanel';
import PlacedModulePropertiesPanel from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel';
import MaterialPanel from '@/editor/shared/controls/styling/MaterialPanel';
import ExportPanel from './components/controls/ExportPanel';
import ColumnControl from '@/editor/shared/controls/structure/ColumnControl';
import WallControl from '@/editor/shared/controls/structure/WallControl';
import ColumnEditModal from '@/editor/shared/controls/structure/ColumnEditModal';
import ConvertModal from './components/ConvertModal';

import { 
  WidthControl,
  HeightControl,
  InstallTypeControls, 
  SurroundControls,
  BaseControls
} from '@/editor/shared/controls';

import styles from './style.module.css';

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
  const { setPlacedModules, placedModules, setAllDoors } = useFurnitureStore();
  const derivedSpaceStore = useDerivedSpaceStore();
  const { updateFurnitureForNewSpace } = useFurnitureSpaceAdapter({ setPlacedModules });
  const { viewMode, setViewMode, doorsOpen, toggleDoors, view2DDirection, setView2DDirection, showDimensions, toggleDimensions, showDimensionsText, toggleDimensionsText, setHighlightedFrame, selectedColumnId, setSelectedColumnId, activePopup, openColumnEditModal, closeAllPopups, showGuides, toggleGuides } = useUIStore();

  // 새로운 UI 상태들
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab | null>('module');
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<RightPanelTab>('placement');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  const [moduleCategory, setModuleCategory] = useState<'tall' | 'lower'>('tall'); // 키큰장/하부장 토글
  
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


  // 현재 컬럼 수를 안전하게 가져오는 함수
  // FrameSize 업데이트 도우미 함수
  const updateFrameSize = (property: 'left' | 'right' | 'top', value: number) => {
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
    const spaceWidth = spaceInfo.width || 4800;
    const range = calculateDoorRange(spaceWidth);
    
    let count = range.ideal;
    
    if (spaceInfo.customColumnCount) {
      count = spaceInfo.customColumnCount;
    } else if (derivedSpaceStore.isCalculated && derivedSpaceStore.columnCount) {
      count = derivedSpaceStore.columnCount;
    }
    
    // 반드시 400-600mm 범위 안에서만 동작하도록 강제
    count = Math.max(range.min, Math.min(range.max, count));
    
    // 실제 슬롯 크기 검증
    const usableWidth = spaceWidth - 100;
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
            const { error } = await updateDesignFile(currentDesignFileId, {
              name: currentDesignFileName || basicInfo.title,
              spaceConfig: removeUndefinedValues(spaceInfo),
              furniture: {
                placedModules: removeUndefinedValues(placedModules)
              },
              thumbnail: thumbnail
            });
            
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
    let finalUpdates = { ...updates };
    
    // installType 하이픈 문제 수정
    if (finalUpdates.installType === 'built-in') {
      finalUpdates.installType = 'builtin';
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
    
    setSpaceInfo(finalUpdates);
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
              {/* 키큰장/하부장 토글 탭 */}
              <div className={styles.moduleCategoryTabs}>
                <button 
                  className={`${styles.moduleCategoryTab} ${moduleCategory === 'tall' ? styles.active : ''}`}
                  onClick={() => setModuleCategory('tall')}
                >
                  키큰장
                </button>
                <button 
                  className={`${styles.moduleCategoryTab} ${moduleCategory === 'lower' ? styles.active : ''}`}
                  onClick={() => setModuleCategory('lower')}
                >
                  하부장
                </button>
              </div>
              
              <div className={styles.moduleSection}>
                <ModuleGallery moduleCategory={moduleCategory} />
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
      case 'placement':
        return (
          <div className={styles.spaceControls}>
            {/* 설치 타입 */}
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>설치 타입</h3>
              </div>
              <InstallTypeControls 
                spaceInfo={spaceInfo}
                onUpdate={handleSpaceInfoUpdate}
              />
            </div>

            {/* 공간 설정 */}
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>공간 설정</h3>
              </div>
              
              <div className={styles.inputGroup}>
                <WidthControl 
                  spaceInfo={spaceInfo}
                  onUpdate={handleSpaceInfoUpdate}
                  disabled={hasSpecialDualFurniture}
                />
              </div>
              
              <div className={styles.inputGroup}>
                <HeightControl 
                  spaceInfo={spaceInfo}
                  onUpdate={handleSpaceInfoUpdate}
                />
              </div>
            </div>

            {/* 레이아웃 */}
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>레이아웃</h3>
              </div>
              
              {/* 도어 개수 입력 */}
              <div className={styles.inputGroup}>
                <div className={styles.inputRow}>
                  <label className={styles.inputLabel}>도어 개수</label>
                  <div className={styles.numberInputGroup}>
                    <button 
                      className={styles.decrementButton}
                      onClick={() => {
                        const currentCount = getCurrentColumnCount();
                        const range = calculateDoorRange(spaceInfo.width || 4800);
                        const newCount = Math.max(range.min, currentCount - 1);
                        handleSpaceInfoUpdate({ customColumnCount: newCount });
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={(() => {
                        const range = calculateDoorRange(spaceInfo.width || 4800);
                        return range.min;
                      })()}
                      max={(() => {
                        const range = calculateDoorRange(spaceInfo.width || 4800);
                        return range.max;
                      })()}
                      value={getCurrentColumnCount()}
                      onChange={(e) => {
                        const range = calculateDoorRange(spaceInfo.width || 4800);
                        const value = Math.min(range.max, Math.max(range.min, parseInt(e.target.value) || range.min));
                        handleSpaceInfoUpdate({ customColumnCount: value });
                      }}
                      className={styles.numberInput}
                    />
                    <button 
                      className={styles.incrementButton}
                      onClick={() => {
                        const currentCount = getCurrentColumnCount();
                        const range = calculateDoorRange(spaceInfo.width || 4800);
                        const newCount = Math.min(range.max, currentCount + 1);
                        handleSpaceInfoUpdate({ customColumnCount: newCount });
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* 도어 개수 슬라이더 */}
              <div className={styles.doorSliderContainer}>
                {(() => {
                  const range = calculateDoorRange(spaceInfo.width || 4800);
                  return (
                    <>
                      <input
                        type="range"
                        min={range.min}
                        max={range.max}
                        value={getCurrentColumnCount()}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          handleSpaceInfoUpdate({ customColumnCount: value });
                        }}
                        className={styles.doorSlider}
                      />
                      <div className={styles.sliderLabels}>
                        {(() => {
                          const labels = [];
                          const step = Math.max(1, Math.floor((range.max - range.min) / 6)); // 최대 7개 라벨
                          for (let i = range.min; i <= range.max; i += step) {
                            labels.push(i);
                          }
                          if (!labels.includes(range.max)) {
                            labels.push(range.max);
                          }
                          return labels.map(num => (
                            <span 
                              key={num} 
                              className={`${styles.sliderLabel} ${getCurrentColumnCount() === num ? styles.active : ''}`}
                            >
                              {num}
                            </span>
                          ));
                        })()}
                      </div>
                      
                    </>
                  );
                })()}
              </div>
            </div>

            {/* 프레임 설정 */}
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>프레임 설정</h3>
              </div>
              
              {/* 프레임 타입 */}
              <div className={styles.toggleButtonGroup}>
                <button
                  className={`${styles.toggleButton} ${(spaceInfo.surroundType || 'no-surround') === 'surround' ? styles.active : ''}`}
                  onClick={() => handleSpaceInfoUpdate({ surroundType: 'surround' })}
                >
                  서라운드
                </button>
                <button
                  className={`${styles.toggleButton} ${(spaceInfo.surroundType || 'no-surround') === 'no-surround' ? styles.active : ''}`}
                  onClick={() => handleSpaceInfoUpdate({ surroundType: 'no-surround' })}
                >
                  노서라운드
                </button>
              </div>

              {/* 서라운드 선택 시 - 프레임 속성 설정 */}
              {(spaceInfo.surroundType || 'no-surround') === 'surround' && (
                <div className={styles.subSetting}>
                  <label className={styles.subLabel}>프레임 폭 설정</label>
                  
                  <div className={styles.frameGrid}>
                    {/* 좌측 */}
                    <div className={styles.frameItem}>
                      <label className={styles.frameItemLabel}>좌측</label>
                      <div className={styles.frameItemInput}>
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentLeft = spaceInfo.frameSize?.left || 50;
                            const newLeft = Math.max(10, currentLeft - 1);
                            updateFrameSize('left', newLeft);
                          }}
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
                        />
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentLeft = spaceInfo.frameSize?.left || 50;
                            const newLeft = Math.min(100, currentLeft + 1);
                            updateFrameSize('left', newLeft);
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 우측 */}
                    <div className={styles.frameItem}>
                      <label className={styles.frameItemLabel}>우측</label>
                      <div className={styles.frameItemInput}>
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentRight = spaceInfo.frameSize?.right || 50;
                            const newRight = Math.max(10, currentRight - 1);
                            updateFrameSize('right', newRight);
                          }}
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
                        />
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentRight = spaceInfo.frameSize?.right || 50;
                            const newRight = Math.min(100, currentRight + 1);
                            updateFrameSize('right', newRight);
                          }}
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

              {/* 이격거리 설정 - 노서라운드 선택 시에만 표시 */}
              {(spaceInfo.surroundType || 'no-surround') === 'no-surround' && (
                <div className={styles.subSetting}>
                  <label className={styles.subLabel}>이격거리</label>
                  
                  <div className={styles.frameGrid}>
                    {/* 좌측 이격거리 */}
                    <div className={styles.frameItem}>
                      <label className={styles.frameItemLabel}>좌측</label>
                      <div className={styles.frameItemInput}>
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentLeft = spaceInfo.gapConfig?.left || 2;
                            const newLeft = Math.max(1, currentLeft - 1);
                            handleSpaceInfoUpdate({ 
                              gapConfig: { 
                                left: newLeft, 
                                right: spaceInfo.gapConfig?.right || 2
                              }
                            });
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={spaceInfo.gapConfig?.left || 2}
                          onChange={(e) => {
                            const value = Math.min(10, Math.max(1, parseInt(e.target.value) || 2));
                            handleSpaceInfoUpdate({ 
                              gapConfig: { 
                                left: value, 
                                right: spaceInfo.gapConfig?.right || 2
                              }
                            });
                          }}
                          className={styles.frameNumberInput}
                        />
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentLeft = spaceInfo.gapConfig?.left || 2;
                            const newLeft = Math.min(10, currentLeft + 1);
                            handleSpaceInfoUpdate({ 
                              gapConfig: { 
                                left: newLeft, 
                                right: spaceInfo.gapConfig?.right || 2
                              }
                            });
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 우측 이격거리 */}
                    <div className={styles.frameItem}>
                      <label className={styles.frameItemLabel}>우측</label>
                      <div className={styles.frameItemInput}>
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentRight = spaceInfo.gapConfig?.right || 2;
                            const newRight = Math.max(1, currentRight - 1);
                            handleSpaceInfoUpdate({ 
                              gapConfig: { 
                                left: spaceInfo.gapConfig?.left || 2,
                                right: newRight
                              }
                            });
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={spaceInfo.gapConfig?.right || 2}
                          onChange={(e) => {
                            const value = Math.min(10, Math.max(1, parseInt(e.target.value) || 2));
                            handleSpaceInfoUpdate({ 
                              gapConfig: { 
                                left: spaceInfo.gapConfig?.left || 2,
                                right: value
                              }
                            });
                          }}
                          className={styles.frameNumberInput}
                        />
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentRight = spaceInfo.gapConfig?.right || 2;
                            const newRight = Math.min(10, currentRight + 1);
                            handleSpaceInfoUpdate({ 
                              gapConfig: { 
                                left: spaceInfo.gapConfig?.left || 2,
                                right: newRight
                              }
                            });
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 상부 프레임 높이 */}
                    <div className={styles.frameItem}>
                      <label className={styles.frameItemLabel}>상부</label>
                      <div className={styles.frameItemInput}>
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentTop = spaceInfo.frameSize?.top || 10;
                            const newTop = Math.max(1, currentTop - 1);
                            handleSpaceInfoUpdate({ 
                              frameSize: { 
                                left: spaceInfo.frameSize?.left || 50,
                                right: spaceInfo.frameSize?.right || 50,
                                top: newTop
                              }
                            });
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={spaceInfo.frameSize?.top || 10}
                          onChange={(e) => {
                            const value = Math.min(50, Math.max(1, parseInt(e.target.value) || 10));
                            handleSpaceInfoUpdate({ 
                              frameSize: { 
                                left: spaceInfo.frameSize?.left || 50,
                                right: spaceInfo.frameSize?.right || 50,
                                top: value
                              }
                            });
                          }}
                          className={styles.frameNumberInput}
                        />
                        <button 
                          className={styles.frameButton}
                          onClick={() => {
                            const currentTop = spaceInfo.frameSize?.top || 10;
                            const newTop = Math.min(50, currentTop + 1);
                            handleSpaceInfoUpdate({ 
                              frameSize: { 
                                left: spaceInfo.frameSize?.left || 50,
                                right: spaceInfo.frameSize?.right || 50,
                                top: newTop
                              }
                            });
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

            {/* 받침대 */}
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
      case 'module':
        return (
          <div className={styles.moduleSettings}>
            <ModuleContent />
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
        onNext={handleNext}
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
              <FileTree 
                onFileSelect={(file) => {
                  console.log('🗂️ 파일트리에서 선택된 파일:', file);
                  if (file.nodeType === 'design') {
                    // 디자인 파일 선택 시 해당 프로젝트 로드
                    console.log('📂 프로젝트 로드 시작:', file.id);
                    loadProject(file.id);
                    setIsFileTreeOpen(false); // 파일트리 닫기
                  }
                }}
                onCreateNew={() => {
                  console.log('🆕 파일트리에서 새 파일 생성 요청');
                  handleNewProject();
                  setIsFileTreeOpen(false); // 파일트리 닫기
                }}
              />
            </div>
          </>
        )}

        {/* 사이드바 */}
        <Sidebar
          activeTab={activeSidebarTab}
          onTabClick={handleSidebarTabClick}
          isOpen={!!activeSidebarTab}
          onToggle={() => setActiveSidebarTab(activeSidebarTab ? null : 'module')}
        />

        {/* 사이드바 컨텐츠 패널 */}
        {activeSidebarTab && (
          <div className={styles.sidebarContent}>
            {renderSidebarContent()}
          </div>
        )}

        {/* 중앙 뷰어 영역 */}
        <div className={
          isRightPanelOpen
            ? styles.viewerArea
            : styles.viewerArea + ' ' + styles['viewerArea--rightPanelClosed']
        } style={{position: 'relative'}}>

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
              spaceInfo={spaceInfo}
              viewMode={viewMode}
              setViewMode={setViewMode}
              renderMode={renderMode}
              showAll={showAll}
              svgSize={{ width: 800, height: 600 }}
            />
          </div>

          {/* 우측바가 접힌 상태일 때 펼치기 버튼 - viewerArea 기준으로 오른쪽 끝 중앙에 */}
          {!isRightPanelOpen && !isFileTreeOpen && (
            <button
              className={styles.rightUnfoldButton}
              onClick={() => setIsRightPanelOpen(true)}
              title="우측 패널 펼치기"
            >
              {'>'}
            </button>
          )}
        </div>

        {/* 우측 패널 */}
        {isRightPanelOpen && (
          <div className={styles.rightPanel}>
            <button
              className={styles.foldToggleButton}
              onClick={() => setIsRightPanelOpen(false)}
              title="우측 패널 접기"
            >
              <span className={styles.foldToggleIcon}>{'>'}</span>
            </button>
            {/* 탭 헤더 */}
            <div className={styles.rightPanelHeader}>
              <div className={styles.rightPanelTabs}>
                <button
                  className={`${styles.rightPanelTab} ${activeRightPanelTab === 'placement' ? styles.active : ''}`}
                  onClick={() => setActiveRightPanelTab('placement')}
                >
                  배치 속성
                </button>
                <button
                  className={`${styles.rightPanelTab} ${activeRightPanelTab === 'module' ? styles.active : ''}`}
                  onClick={() => setActiveRightPanelTab('module')}
                >
                  모듈 속성
                </button>
              </div>
            </div>
            {/* 패널 컨텐츠 */}
            <div className={styles.rightPanelContent}>
              {renderRightPanelContent()}
            </div>
          </div>
        )}
        {/* 우측바가 접힌 상태일 때 펼치기 버튼 */}
        {!isRightPanelOpen && (
          <button
            className={styles.foldToggleButton}
            onClick={() => setIsRightPanelOpen(true)}
            title="우측 패널 펼치기"
            style={{ left: -16, top: '50%', transform: 'translateY(-50%)', position: 'absolute', zIndex: 100 }}
          >
            <span className={styles.foldToggleIcon}>◀</span>
          </button>
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
        isOpen={isConvertPanelOpen}
        onClose={() => setIsConvertPanelOpen(false)}
      />

    </div>
  );
};

export default Configurator; 