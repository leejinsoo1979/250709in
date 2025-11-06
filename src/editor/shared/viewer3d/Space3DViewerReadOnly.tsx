import React, { useMemo, useEffect } from 'react';
import { Space3DViewProvider } from './context/Space3DViewContext';
import ThreeCanvas from './components/base/ThreeCanvas';
import Room from './components/elements/Room';
import CleanCAD2D from './components/elements/CleanCAD2D';
import { calculateOptimalDistance, mmToThreeUnits } from './components/base/utils/threeUtils';
import { useUIStore } from '@/store/uiStore';

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
  console.log('🔍 Space3DViewerReadOnly 렌더링:', {
    hasSpaceConfig: !!spaceConfig,
    placedModulesCount: placedModules.length,
    placedModules: placedModules,
    spaceConfig: spaceConfig,
    viewMode,
    renderMode
  });

  // 미리보기 모드에서는 치수 표시 끄기
  useEffect(() => {
    const uiStore = useUIStore.getState();

    // 현재 상태 저장
    const prevShowDimensions = uiStore.showDimensions;
    const prevShowDimensionsText = uiStore.showDimensionsText;

    console.log('🔍 미리보기 모드 - 치수 표시 끄기:', {
      prevShowDimensions,
      prevShowDimensionsText
    });

    // 치수 표시 끄기
    uiStore.setShowDimensions(false);
    uiStore.setShowDimensionsText(false);

    // 언마운트 시 원래 상태로 복원
    return () => {
      console.log('🔍 미리보기 모드 종료 - 치수 표시 복원:', {
        prevShowDimensions,
        prevShowDimensionsText
      });
      uiStore.setShowDimensions(prevShowDimensions);
      uiStore.setShowDimensionsText(prevShowDimensionsText);
    };
  }, []);

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
      renderMode={renderMode} 
      viewMode={viewMode}
    >
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: '400px',
          position: 'relative'
        }}
      >
        <ThreeCanvas 
          cameraPosition={cameraPosition}
          viewMode={viewMode}
          view2DDirection="front"
          renderMode={renderMode}
        >
          <React.Suspense fallback={null}>
            {/* 조명 시스템 */}
            <directionalLight 
              position={[5, 15, 20]} 
              intensity={2.5} 
              color="#ffffff"
              castShadow={viewMode === '3D'}
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
            
            <ambientLight intensity={viewMode === '2D' ? 0.8 : 0.5} color="#ffffff" />
            
            {/* Room 컴포넌트에 placedModules 전달 - 미리보기 모드에서는 치수와 가이드 숨김 */}
            <Room 
              spaceInfo={spaceConfig} 
              viewMode={viewMode} 
              materialConfig={materialConfig} 
              showAll={false}  // 편집 아이콘들 숨김
              showFrame={true}  // 프레임은 표시
              showDimensions={false}  // 치수 숨김
              placedModules={placedModules}
              isReadOnly={true}  // 읽기 전용 모드
            />
            
            {/* 미리보기 모드에서는 치수 표시 제거 */}
          </React.Suspense>
        </ThreeCanvas>
      </div>
    </Space3DViewProvider>
  );
};

export default Space3DViewerReadOnly;