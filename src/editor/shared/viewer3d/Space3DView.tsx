import React, { useEffect, useMemo } from 'react';
import { Space3DViewProps } from './types';
import { Space3DViewProvider } from './context/Space3DViewContext';
import ThreeCanvas from './components/base/ThreeCanvas';
import Room from './components/elements/Room';

import ColumnGuides from './components/elements/ColumnGuides';
import CleanCAD2D from './components/elements/CleanCAD2D';

// import FurniturePlacementPlane from './components/elements/FurniturePlacementPlane';
import SlotDropZones from './components/elements/SlotDropZones';
import KeyboardShortcuts from './components/ui/KeyboardShortcuts';

import { useLocation } from 'react-router-dom';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { Environment } from '@react-three/drei';
import { calculateOptimalDistance, mmToThreeUnits } from './components/base/utils/threeUtils';

/**
 * Space3DView 컴포넌트
 * 공간 정보를 3D로 표시하는 Three.js 뷰어
 * 2D 모드에서는 orthographic 카메라로 정면 뷰 제공
 */
const Space3DView: React.FC<Space3DViewProps> = (props) => {
  const { spaceInfo, svgSize, viewMode = '3D', setViewMode, renderMode = 'wireframe' } = props;
  const location = useLocation();
  const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { view2DDirection } = useUIStore();
  
  // 컴포넌트 마운트시 재질 설정 초기화 제거 (Firebase 로드 색상 유지)
  
  // 재질 설정 가져오기
  const materialConfig = storeSpaceInfo.materialConfig || { 
    interiorColor: '#FFFFFF', 
    doorColor: '#FFFFFF'  // 기본값도 흰색으로 변경 (테스트용)
  };
  
  // 2D 뷰 방향별 카메라 위치 계산 - threeUtils의 최적화된 거리 사용
  const cameraPosition = useMemo(() => {
    const { width, height, depth = 600 } = spaceInfo; // 기본 깊이 600mm
    
    // threeUtils의 calculateOptimalDistance 사용 (3D와 동일한 계산)
    const distance = calculateOptimalDistance(width, height, depth, placedModules.length);
    const centerX = 0;
    const centerY = mmToThreeUnits(height * 0.5);
    const centerZ = 0;

    // 2D front 위치 계산 - 3D와 동일한 거리 사용
    const frontPosition = [centerX, centerY, distance] as [number, number, number];

    // 3D 모드에서는 2D front와 완전히 동일한 위치 사용
    if (viewMode === '3D') {
      return frontPosition;
    }

    // 2D 모드에서는 방향별 카메라 위치 - 각 방향에 최적화된 거리 사용
    switch (view2DDirection) {
      case 'front':
        // 정면: Z축에서 깊이를 고려한 최적 거리
        return [centerX, centerY, distance] as [number, number, number];
      case 'left':
        // 좌측: X축에서 너비를 고려한 최적 거리
        const leftDistance = calculateOptimalDistance(depth, height, width, placedModules.length);
        return [-leftDistance, centerY, centerZ] as [number, number, number];
      case 'right':
        // 우측: X축에서 너비를 고려한 최적 거리
        const rightDistance = calculateOptimalDistance(depth, height, width, placedModules.length);
        return [rightDistance, centerY, centerZ] as [number, number, number];
      case 'top':
        // 상단: Y축에서 너비와 깊이를 고려한 최적 거리 (비율 보정)
        const topDistance = calculateOptimalDistance(width, depth, height, placedModules.length);
        return [centerX, centerY + topDistance, centerZ] as [number, number, number];
      default:
        return frontPosition;
    }
  }, [spaceInfo.width, spaceInfo.height, spaceInfo.depth, viewMode, view2DDirection, placedModules.length]);
  
  // 각 위치별 고유한 키를 생성하여 2D 방향 변경 시 ThreeCanvas 재생성 (OrbitControls 리셋)
  // 공간 크기 변경 시에도 강제 재렌더링하도록 spaceInfo 포함
  const viewerKey = useMemo(() => 
    `${location.pathname}-${viewMode}-${view2DDirection}-${spaceInfo.width}x${spaceInfo.height}x${spaceInfo.depth}`, 
    [location.pathname, viewMode, view2DDirection, spaceInfo.width, spaceInfo.height, spaceInfo.depth]
  );
  
  // 드롭 이벤트 핸들러
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Canvas 요소 찾기
    const canvas = e.currentTarget.querySelector('canvas');
    if (!canvas) {
      return;
    }

    // SlotDropZones에서 노출한 함수 호출
    const handleSlotDrop = window.handleSlotDrop;
    if (typeof handleSlotDrop === 'function') {
      handleSlotDrop(e.nativeEvent, canvas);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // 드롭 허용
  };
  
  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      // 컴포넌트 언마운트 시 캔버스 정리
      const cleanupCanvases = () => {
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(canvas => {
          // 2D 컨텍스트를 사용하여 캔버스 지우기
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // WebGL 컨텍스트 정리
          const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
          if (gl && !gl.isContextLost()) {
            try {
              // 타입 안전하게 WebGL 컨텍스트 손실 처리
              const ext = gl.getExtension('WEBGL_lose_context');
              if (ext) {
                ext.loseContext();
              }
            } catch (e) {
              console.log('WebGL context cleanup error:', e);
            }
          }
        });
      };
      
      cleanupCanvases();
    };
  }, []);
  

  return (
    <Space3DViewProvider spaceInfo={spaceInfo} svgSize={svgSize} renderMode={renderMode} viewMode={viewMode}>
      <div 
        key={viewerKey}
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: '400px',
          position: 'relative'
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <ThreeCanvas 
          key={viewerKey}
          cameraPosition={cameraPosition}
          viewMode={viewMode}
          view2DDirection={view2DDirection}
          renderMode={renderMode}
        >
          <React.Suspense fallback={null}>
            {/* 조명 시스템 - 2D 모드에서는 그림자 없음 */}
            
            {/* 메인 자연광 - 3D 모드에서만 그림자 생성 */}
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
              shadow-bias={-0.0001}
              shadow-radius={8}
              shadow-normalBias={0.015}
            />
            
            {/* 부드러운 필 라이트 - 그림자 대비 조절 */}
            <directionalLight 
              position={[-8, 10, 15]} 
              intensity={0.6} 
              color="#ffffff"
            />
            <directionalLight 
              position={[8, 10, 15]} 
              intensity={0.6} 
              color="#ffffff"
            />
            
            {/* 환경광 - 2D 모드에서는 더 밝게 */}
            <ambientLight intensity={viewMode === '2D' ? 0.8 : 0.5} color="#ffffff" />
            
            {/* HDRI 환경맵 제거 - 순수 조명만 사용 */}
            {/* Environment 컴포넌트가 렌더링을 방해할 수 있으므로 비활성화 */}
            
            {/* 기본 요소들 */}
            <Room spaceInfo={spaceInfo} viewMode={viewMode} materialConfig={materialConfig} />
            
            {/* Configurator에서 표시되는 요소들 */}
            {/* 3D 모드에서만 컬럼 가이드 표시 */}
            {viewMode === '3D' && <ColumnGuides />}
            
            {/* CAD 스타일 치수/가이드 표시 - 2D와 3D 모두에서 표시 */}
            <CleanCAD2D viewDirection={viewMode === '3D' ? '3D' : view2DDirection} />
            
            {/* 초록색 바닥배치면 주석처리 */}
            {/* <FurniturePlacementPlane spaceInfo={spaceInfo} /> */}
            {/* PlacedFurniture는 Room 내부에서 렌더링되므로 중복 제거 */}

            <SlotDropZones spaceInfo={spaceInfo} />
          </React.Suspense>
        </ThreeCanvas>
        {/* 2D/3D 토글 버튼과 단축키 안내 */}
        <KeyboardShortcuts />
      </div>
    </Space3DViewProvider>
  );
};

export default Space3DView; 