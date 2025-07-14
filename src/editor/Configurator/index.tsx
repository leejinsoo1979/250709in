import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useFurnitureSpaceAdapter } from '@/editor/shared/furniture/hooks/useFurnitureSpaceAdapter';
import { getProject, updateProject } from '@/firebase/projects';
import { captureProjectThumbnail, generateDefaultThumbnail } from '@/editor/shared/utils/thumbnailCapture';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// 새로운 컴포넌트들 import
import Header from './components/Header';
import Sidebar, { SidebarTab } from './components/Sidebar';
import ViewerControls, { ViewMode, ViewDirection, RenderMode } from './components/ViewerControls';
import RightPanel, { RightPanelTab } from './components/RightPanel';
import FileTree from '@/components/FileTree/FileTree';

// 기존 작동하는 컴포넌트들
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import ModuleGallery from '@/editor/shared/controls/furniture/ModuleGallery';
import ModulePropertiesPanel from '@/editor/shared/controls/furniture/ModulePropertiesPanel';
import PlacedModulePropertiesPanel from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel';
import MaterialPanel from '@/editor/shared/controls/styling/MaterialPanel';
import ExportPanel from './components/controls/ExportPanel';
import { 
  WidthControl,
  HeightControl,
  InstallTypeControls, 
  FloorFinishControls, 
  SurroundControls,
  BaseControls
} from '@/editor/shared/controls';

import styles from './style.module.css';

const Configurator: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Store hooks
  const { setBasicInfo, basicInfo } = useProjectStore();
  const { setSpaceInfo, spaceInfo } = useSpaceConfigStore();
  const { setPlacedModules, placedModules, setAllDoors } = useFurnitureStore();
  const derivedSpaceStore = useDerivedSpaceStore();
  const { updateFurnitureForNewSpace } = useFurnitureSpaceAdapter({ setPlacedModules });
  const { viewMode, setViewMode, doorsOpen, toggleDoors, view2DDirection, setView2DDirection, showDimensions, toggleDimensions } = useUIStore();

  // 새로운 UI 상태들
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab | null>('module');
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<RightPanelTab>('placement');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  
  // 뷰어 컨트롤 상태들 - view2DDirection과 showDimensions는 UIStore 사용
  const [renderMode, setRenderMode] = useState<RenderMode>('solid'); // wireframe → solid로 기본값 변경
  const [showAll, setShowAll] = useState(true);
  const [showGuides, setShowGuides] = useState(false);

  // 기존 공간 변경 로직 복구
  const [previousSpaceInfo, setPreviousSpaceInfo] = useState(spaceInfo);

  // 현재 컬럼 수를 안전하게 가져오는 함수
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
        setBasicInfo(project.projectData);
        setSpaceInfo(project.spaceConfig);
        setPlacedModules(project.furniture.placedModules);
        setCurrentProjectId(projectId);
        
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

  // 프로젝트 저장 (Firebase 또는 로컬 저장)
  const saveProject = async () => {
    setSaving(true);
    setSaveStatus('idle');
    
    try {
      console.log('💾 저장할 spaceInfo:', spaceInfo);
      console.log('🎨 저장할 materialConfig:', spaceInfo.materialConfig);
      
      let thumbnail = await captureProjectThumbnail();
      
      if (!thumbnail) {
        console.log('📸 3D 캔버스 캡처 실패, 기본 썸네일 생성');
        thumbnail = generateDefaultThumbnail(spaceInfo, placedModules.length);
      }

      if (isFirebaseConfigured() && currentProjectId) {
        // Firebase 저장 모드
        const { error } = await updateProject(currentProjectId, {
          title: basicInfo.title,
          projectData: basicInfo,
          spaceConfig: spaceInfo,
          furniture: {
            placedModules: placedModules
          }
        }, thumbnail);

        if (error) {
          console.error('프로젝트 저장 에러:', error);
          setSaveStatus('error');
          alert('프로젝트 저장에 실패했습니다: ' + error);
        } else {
          setSaveStatus('success');
          console.log('✅ 프로젝트 저장 성공 (썸네일 포함)');
          
          // 다른 창(대시보드)에 프로젝트 업데이트 알림
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ 
              type: 'PROJECT_SAVED', 
              projectId: currentProjectId,
              timestamp: Date.now()
            });
            console.log('📡 다른 창에 프로젝트 업데이트 알림 전송');
          } catch (error) {
            console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
          }
          
          setTimeout(() => setSaveStatus('idle'), 3000);
        }
      } else {
        // 데모 모드: 로컬 저장
        const demoProject = {
          id: currentProjectId || `demo-${Date.now()}`,
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
        localStorage.setItem('demoProject', JSON.stringify(demoProject));
        
        setSaveStatus('success');
        console.log('✅ 데모 프로젝트 로컬 저장 성공 (썸네일 포함)');
        alert('데모 프로젝트가 로컬에 저장되었습니다!\n\n썸네일과 함께 저장되어 나중에 확인할 수 있습니다.');
        
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('프로젝트 저장 실패:', error);
      setSaveStatus('error');
      alert('프로젝트 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // URL에서 프로젝트 ID 읽기 및 로드
  useEffect(() => {
    const projectId = searchParams.get('id');
    if (projectId && projectId !== currentProjectId) {
      loadProject(projectId);
    }
  }, [searchParams]);

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
    let finalUpdates = { ...updates };
    
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
    if (hasDoorsInstalled) {
      // 도어 제거: 모든 가구에서 도어 제거
      setAllDoors(false);
    } else {
      // 도어 설치: 모든 가구에 도어 설치 (닫힌 상태로 설치)
      setAllDoors(true);
      
      // 도어 설치 시 닫힌 상태로 유지
      if (doorsOpen) {
        toggleDoors(); // 문이 열려있으면 닫기
      }
    }
  };

  // 이전/다음 버튼 핸들러
  const handlePrevious = () => {
    navigate('/');
  };

  const handleNext = () => {
    console.log('다음 단계로');
  };

  const handleHelp = () => {
    window.open('/help', '_blank');
  };

  const handleConvert = () => {
    console.log('컨버팅');
  };

  const handleLogout = () => {
    navigate('/login');
  };

  const handleProfile = () => {
    console.log('프로필');
  };

  // 파일 트리 핸들러들
  const handleFileSelect = (file: any) => {
    console.log('파일 선택:', file);
    
    // 파일 타입에 따라 적절한 UI 탭으로 이동
    if (file.nodeType === 'material') {
      // 재질 설정 탭 활성화
      setActiveSidebarTab('material');
    } else if (file.nodeType === 'space') {
      // 배치 속성 탭 활성화 (우측 패널)
      setActiveRightPanelTab('placement');
      setIsRightPanelOpen(true);
    } else if (file.nodeType === 'module') {
      // 가구 모듈 탭 활성화
      setActiveSidebarTab('module');
    } else if (file.nodeType === 'furniture') {
      // 가구 갤러리 탭 활성화
      setActiveSidebarTab('module');
    }
  };

  const handleCreateNew = () => {
    console.log('새 프로젝트 생성');
  };

  const handleToggleFileTree = () => {
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
              <h3 className={styles.modulePanelTitle}>가구 모듈</h3>
              
              <div className={styles.moduleSection}>
                <ModuleGallery />
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
            <div className={styles.placeholder}>구조물 설정</div>
          </div>
        );
      case 'etc':
        return (
          <div className={styles.sidebarPanel}>
            <ExportPanel />
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
                          for (let i = range.min; i <= range.max; i++) {
                            labels.push(i);
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
                      <div className={styles.sliderInfo}>
                        {(() => {
                          const currentWidth = spaceInfo.width || 4800;
                          const range = calculateDoorRange(currentWidth);
                          const usableWidth = currentWidth - 100;
                          const currentSlotWidth = Math.round(usableWidth / getCurrentColumnCount());
                          return (
                            <div>
                              <p>슬롯 크기 제약: 400mm ~ 600mm</p>
                              <p>현재 슬롯당 할당: {currentSlotWidth}mm</p>
                              <p>공간 기준 범위: {range.min}개 ~ {range.max}개</p>
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* 슬롯 생성 범위 안내 */}
              <div className={styles.slotInfoBox}>
                {(() => {
                  const currentWidth = spaceInfo.width || 4800;
                  const range = calculateDoorRange(currentWidth);
                  const usableWidth = currentWidth - 100; // 프레임 마진
                  const currentSlotWidth = Math.round(usableWidth / getCurrentColumnCount());
                  
                  return (
                    <p className={styles.slotInfoText}>
                      현 사이즈 기준 슬롯 생성 범위: 최소 {range.min}개 ~ 최대 {range.max}개<br/>
                      도어 1개 너비: {currentSlotWidth}mm
                      {currentSlotWidth < 400 && <span style={{color: '#ef4444'}}> (⚠️ 최소 400mm 미만)</span>}
                      {currentSlotWidth > 600 && <span style={{color: '#ef4444'}}> (⚠️ 최대 600mm 초과)</span>}
                    </p>
                  );
                })()}
              </div>
            </div>

            {/* 단내림 */}
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>단내림</h3>
              </div>
              <SurroundControls 
                spaceInfo={spaceInfo}
                onUpdate={handleSpaceInfoUpdate}
                disabled={hasSpecialDualFurniture}
              />
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

            {/* 바닥 마감재 */}
            <div className={styles.configSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionDot}></span>
                <h3 className={styles.sectionTitle}>바닥 마감재</h3>
              </div>
              <FloorFinishControls 
                spaceInfo={spaceInfo}
                onUpdate={handleSpaceInfoUpdate}
              />
            </div>
          </div>
        );
      case 'module':
        return (
          <div className={styles.moduleSettings}>
            <div className={styles.placeholder}>모듈 속성 설정이 여기에 표시됩니다</div>
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

  return (
    <div className={styles.configurator}>
      {/* 헤더 */}
      <Header
        title={basicInfo.title || "가구 설계"}
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
        onDoorInstallationToggle={handleDoorInstallation}
      />

      <div className={styles.mainContent}>
        {/* 파일 트리 */}
        {isFileTreeOpen && (
          <div className={styles.fileTreePanel}>
            <FileTree 
              onFileSelect={handleFileSelect}
              onCreateNew={handleCreateNew}
            />
          </div>
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
          {/* 파일 트리 토글 버튼 */}
          <button 
            className={styles.fileTreeToggle}
            onClick={handleToggleFileTree}
            title="파일 트리 토글"
          >
            📁
          </button>

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
            showGuides={showGuides}
            onShowGuidesToggle={() => setShowGuides(!showGuides)}
            doorsOpen={doorsOpen}
            onDoorsToggle={toggleDoors}
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
              svgSize={{ width: 800, height: 600 }}
            />
          </div>

          {/* 우측바가 접힌 상태일 때 펼치기 버튼 - viewerArea 기준으로 오른쪽 끝 중앙에 */}
          {!isRightPanelOpen && (
            <button
              className={styles.rightUnfoldButton}
              onClick={() => setIsRightPanelOpen(true)}
              title="우측 패널 펼치기"
              style={{ right: 0, top: '50%', transform: 'translateY(-50%)', position: 'absolute', zIndex: 200 }}
            >
              {'<'}
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
              <span className={styles.foldToggleIcon}>▶</span>
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
    </div>
  );
};

export default Configurator; 