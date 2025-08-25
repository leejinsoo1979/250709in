import React, { useMemo, useState } from 'react';
import { Space3DViewProvider } from './context/Space3DViewContext';
import ThreeCanvas from './components/base/ThreeCanvas';
import Room from './components/elements/Room';
import CleanCAD2D from './components/elements/CleanCAD2D';
import { calculateOptimalDistance, mmToThreeUnits } from './components/base/utils/threeUtils';
import ViewerControls, { ViewMode, ViewDirection, RenderMode } from '../../Configurator/components/ViewerControls';

interface Space3DViewerReadOnlyProps {
  spaceConfig: any;
  placedModules?: any[];
  viewMode?: '2D' | '3D';
  renderMode?: 'solid' | 'wireframe';
}

/**
 * 읽기 전용 3D 뷰어 컴포넌트
 * 미리보기 전용으로 모든 상호작용 비활성화
 */
const Space3DViewerReadOnly: React.FC<Space3DViewerReadOnlyProps> = ({
  spaceConfig,
  placedModules = [],
  viewMode = '3D',
  renderMode = 'solid'
}) => {
  // 뷰어 컨트롤을 위한 상태 관리
  const [localViewMode, setLocalViewMode] = useState<ViewMode>(viewMode as ViewMode);
  const [localRenderMode, setLocalRenderMode] = useState<RenderMode>(renderMode as RenderMode);
  const [viewDirection, setViewDirection] = useState<ViewDirection>('front');
  const [showAll, setShowAll] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);
  const [showDimensionsText, setShowDimensionsText] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [showAxis, setShowAxis] = useState(false);
  const [showFurniture, setShowFurniture] = useState(true);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [hasDoorsInstalled, setHasDoorsInstalled] = useState(false);
  
  // 도어가 설치된 가구가 있는지 확인
  React.useEffect(() => {
    const hasDoors = placedModules.some(module => 
      module.hasDoor === true || module.hasDoor === undefined
    );
    setHasDoorsInstalled(hasDoors);
  }, [placedModules]);
  
  // 도어 토글 함수
  const handleDoorsToggle = () => {
    const newState = !doorsOpen;
    console.log('🚪🚪🚪 Space3DViewerReadOnly - 도어 토글:', {
      현재상태: doorsOpen,
      새로운상태: newState,
      hasDoorsInstalled
    });
    setDoorsOpen(newState);
  };
  
  // 도어 설치 토글 함수
  const handleDoorInstallationToggle = () => {
    console.log('🚪 도어 설치 토글');
    // 미리보기 모드에서는 실제 설치는 하지 않고 상태만 변경
    handleDoorsToggle();
  };
  
  console.log('🔍 Space3DViewerReadOnly 렌더링:', {
    hasSpaceConfig: !!spaceConfig,
    placedModulesCount: placedModules.length,
    placedModules: placedModules,
    spaceConfig: spaceConfig,
    viewMode: localViewMode,
    renderMode: localRenderMode,
    doorsOpen,
    hasDoorsInstalled
  });

  // 재질 설정
  const materialConfig = spaceConfig?.materialConfig || { 
    interiorColor: '#FFFFFF', 
    doorColor: '#E0E0E0'
  };

  // 카메라 위치 계산
  const cameraPosition = useMemo(() => {
    if (!spaceConfig) {
      return [0, 10, 20] as [number, number, number];
    }
    const { width, height, depth = 1500 } = spaceConfig;
    const distance = calculateOptimalDistance(width, height, depth, placedModules.length);
    const centerX = 0;
    const centerY = mmToThreeUnits(height * 0.5);
    
    return [centerX, centerY, distance] as [number, number, number];
  }, [spaceConfig?.width, spaceConfig?.height, spaceConfig?.depth, placedModules.length]);

  if (!spaceConfig) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#666'
      }}>
        공간 정보를 불러올 수 없습니다
      </div>
    );
  }

  return (
    <Space3DViewProvider 
      spaceInfo={spaceConfig} 
      svgSize={{ width: 800, height: 600 }} 
      renderMode={localRenderMode} 
      viewMode={localViewMode}
    >
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: '400px',
          position: 'relative'
        }}
      >
        {/* ViewerControls로 도어 버튼 표시 - 컨피규레이터와 동일한 컴포넌트 사용 */}
        <ViewerControls
          viewMode={localViewMode}
          onViewModeChange={setLocalViewMode}
          viewDirection={viewDirection}
          onViewDirectionChange={setViewDirection}
          renderMode={localRenderMode}
          onRenderModeChange={setLocalRenderMode}
          showAll={showAll}
          onShowAllToggle={() => setShowAll(!showAll)}
          showDimensions={showDimensions}
          onShowDimensionsToggle={() => setShowDimensions(!showDimensions)}
          showDimensionsText={showDimensionsText}
          onShowDimensionsTextToggle={() => setShowDimensionsText(!showDimensionsText)}
          showGuides={showGuides}
          onShowGuidesToggle={() => setShowGuides(!showGuides)}
          showAxis={showAxis}
          onShowAxisToggle={() => setShowAxis(!showAxis)}
          showFurniture={showFurniture}
          onShowFurnitureToggle={() => setShowFurniture(!showFurniture)}
          doorsOpen={doorsOpen}
          onDoorsToggle={handleDoorsToggle}
          hasDoorsInstalled={hasDoorsInstalled}
          onDoorInstallationToggle={undefined} // 미리보기에서는 도어 설치 버튼 숨김
        />
        
        {/* 도어가 설치된 경우에만 뷰어 상단에 Close/Open 토글 버튼 표시 */}
        {hasDoorsInstalled && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            display: 'flex',
            gap: '8px',
            background: 'transparent',
            padding: 0,
            border: 'none'
          }}>
            <button 
              style={{
                background: !doorsOpen ? 'var(--theme-primary, #007AFF)' : '#ffffff',
                border: '1px solid #e1e5e9',
                borderRadius: '20px',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: !doorsOpen ? '#ffffff' : '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(8px)',
                minWidth: '60px'
              }}
              onClick={() => !doorsOpen || handleDoorsToggle()}
            >
              Close
            </button>
            <button 
              style={{
                background: doorsOpen ? 'var(--theme-primary, #007AFF)' : '#ffffff',
                border: '1px solid #e1e5e9',
                borderRadius: '20px',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: doorsOpen ? '#ffffff' : '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(8px)',
                minWidth: '60px'
              }}
              onClick={() => doorsOpen || handleDoorsToggle()}
            >
              Open
            </button>
          </div>
        )}
        
        <ThreeCanvas 
          cameraPosition={cameraPosition}
          viewMode={localViewMode}
          view2DDirection={viewDirection}
          renderMode={localRenderMode}
        >
          <React.Suspense fallback={null}>
            {/* 조명 시스템 */}
            <directionalLight 
              position={[5, 15, 20]} 
              intensity={2.5} 
              color="#ffffff"
              castShadow={localViewMode === '3D'}
              shadow-mapSize-width={4096}
              shadow-mapSize-height={4096}
              shadow-camera-far={50}
              shadow-camera-left={-25}
              shadow-camera-right={25}
              shadow-camera-top={25}
              shadow-camera-bottom={-25}
              shadow-bias={-0.0005}
              shadow-radius={12}
              shadow-normalBias={0.02}
            />
            
            <directionalLight 
              position={[-8, 10, 15]} 
              intensity={0.6} 
              color="#ffffff"
            />
            
            <ambientLight intensity={localViewMode === '2D' ? 0.8 : 0.5} color="#ffffff" />
            
            {/* Room 컴포넌트에 placedModules 전달 - 미리보기 모드에서는 치수와 가이드 숨김 */}
            <Room 
              spaceInfo={spaceConfig} 
              viewMode={localViewMode} 
              materialConfig={materialConfig} 
              showAll={false}  // 편집 아이콘들 숨김
              showFrame={true}  // 프레임은 표시
              showDimensions={false}  // 치수 숨김
              placedModules={placedModules}
              isReadOnly={true}  // 읽기 전용 모드
              doorsOpen={doorsOpen}  // 도어 상태 전달
            />
            
            {/* 미리보기 모드에서는 치수 표시 제거 */}
          </React.Suspense>
        </ThreeCanvas>
      </div>
    </Space3DViewProvider>
  );
};

export default Space3DViewerReadOnly;