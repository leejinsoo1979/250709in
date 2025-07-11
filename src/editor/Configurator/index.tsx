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
  
  // 뷰어 컨트롤 상태들 - view2DDirection과 showDimensions는 UIStore 사용
  const [renderMode, setRenderMode] = useState<RenderMode>('solid'); // wireframe → solid로 기본값 변경
  const [showAll, setShowAll] = useState(true);
  const [showGuides, setShowGuides] = useState(false);

  // 기존 공간 변경 로직 복구
  const [previousSpaceInfo, setPreviousSpaceInfo] = useState(spaceInfo);

  // 현재 컬럼 수를 안전하게 가져오는 함수
  const getCurrentColumnCount = () => {
    if (spaceInfo.customColumnCount) {
      return spaceInfo.customColumnCount;
    }
    if (derivedSpaceStore.isCalculated && derivedSpaceStore.columnCount) {
      return derivedSpaceStore.columnCount;
    }
    // 기본값 (내경폭 기준 자동 계산)
    const internalWidth = (spaceInfo.width || 4800) - 100; // 기본 내경폭
    return Math.max(8, Math.min(15, Math.floor(internalWidth / 600))); // 600mm당 1컬럼 기준
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

  // 프로젝트 저장
  const saveProject = async () => {
    if (!currentProjectId) {
      alert('저장할 프로젝트가 없습니다.');
      return;
    }

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
    setSpaceInfo(updates);
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
                        const newCount = Math.max(8, currentCount - 1);
                        handleSpaceInfoUpdate({ customColumnCount: newCount });
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="8"
                      max="15"
                      value={getCurrentColumnCount()}
                      onChange={(e) => {
                        const value = Math.min(15, Math.max(8, parseInt(e.target.value) || 8));
                        handleSpaceInfoUpdate({ customColumnCount: value });
                      }}
                      className={styles.numberInput}
                    />
                    <button 
                      className={styles.incrementButton}
                      onClick={() => {
                        const currentCount = getCurrentColumnCount();
                        const newCount = Math.min(15, currentCount + 1);
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
                <input
                  type="range"
                  min="8"
                  max="15"
                  value={getCurrentColumnCount()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    handleSpaceInfoUpdate({ customColumnCount: value });
                  }}
                  className={styles.doorSlider}
                />
                <div className={styles.sliderLabels}>
                  {[8, 9, 10, 11, 12, 13, 14, 15].map(num => (
                    <span 
                      key={num} 
                      className={`${styles.sliderLabel} ${getCurrentColumnCount() === num ? styles.active : ''}`}
                    >
                      {num}
                    </span>
                  ))}
                </div>
              </div>

              {/* 슬롯 생성 범위 안내 */}
              <div className={styles.slotInfoBox}>
                <p className={styles.slotInfoText}>
                  현 사이즈 기준 슬롯 생성 범위: 최소 8개 ~ 최대 15개<br/>
                  도어 1개 너비: {Math.floor((spaceInfo.width || 4800) / getCurrentColumnCount())}mm
                </p>
              </div>
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
        {/* 사이드바 */}
        <Sidebar
          activeTab={activeSidebarTab}
          onTabClick={handleSidebarTabClick}
          isOpen={!!activeSidebarTab}
        />

        {/* 사이드바 컨텐츠 패널 */}
        {activeSidebarTab && (
          <div className={styles.sidebarContent}>
            {renderSidebarContent()}
          </div>
        )}

        {/* 중앙 뷰어 영역 */}
        <div className={styles.viewerArea}>
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
              svgSize={{ width: 600, height: 400 }}
            />
          </div>
        </div>

        {/* 우측 패널 */}
        {isRightPanelOpen && (
          <div className={styles.rightPanel}>
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
      </div>

      {/* 가구 편집 창들 - 기존 기능 유지 */}
      <ModulePropertiesPanel />
      <PlacedModulePropertiesPanel />
    </div>
  );
};

export default Configurator; 