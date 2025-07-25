import React, { useEffect, useMemo, useState } from 'react';
import { Space3DViewProps } from './types';
import { Space3DViewProvider } from './context/Space3DViewContext';
import ThreeCanvas from './components/base/ThreeCanvas';
import Room from './components/elements/Room';
import ColumnAsset from './components/elements/space/ColumnAsset';
import WallAsset from './components/elements/space/WallAsset';
import ColumnDistanceLabels from './components/elements/space/ColumnDistanceLabels';
import ColumnGhostPreview from './components/elements/space/ColumnGhostPreview';
import ColumnCreationMarkers from './components/elements/space/ColumnCreationMarkers';

import ColumnGuides from './components/elements/ColumnGuides';
import CleanCAD2D from './components/elements/CleanCAD2D';
import CADGrid from './components/elements/CADGrid';

import SlotDropZones from './components/elements/SlotDropZones';


import { useLocation } from 'react-router-dom';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { Environment } from '@react-three/drei';
import { calculateOptimalDistance, mmToThreeUnits } from './components/base/utils/threeUtils';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';

/**
 * Space3DView 컴포넌트
 * 공간 정보를 3D로 표시하는 Three.js 뷰어
 * 2D 모드에서는 orthographic 카메라로 정면 뷰 제공
 */
const Space3DView: React.FC<Space3DViewProps> = (props) => {
  const { 
    spaceInfo, 
    svgSize, 
    viewMode = '3D', 
    setViewMode, 
    renderMode = 'wireframe', 
    showAll = true,
    isViewerOnly = false,
    project,
    projectId = ''
  } = props;
  
  const location = useLocation();
  const { spaceInfo: storeSpaceInfo, updateColumn, removeColumn, updateWall, removeWall, addWall } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { view2DDirection, showDimensions, showDimensionsText, showGuides, selectedColumnId, activePopup } = useUIStore();
  
  // 드래그 중인 기둥 ID 추적
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);

  // 뷰어 전용 모드에서는 프로젝트 데이터 사용, 일반 모드에서는 스토어 데이터 사용
  const currentSpaceInfo = isViewerOnly && project?.spaceInfo ? project.spaceInfo : (spaceInfo || storeSpaceInfo);
  const currentSvgSize = svgSize || { width: 800, height: 600 };
  
  // 가구 데이터도 뷰어 모드에 따라 분기
  const currentPlacedModules = isViewerOnly && project?.placedModules ? project.placedModules : placedModules;
  
  console.log('🔧 Space3DView 가구 데이터:', {
    isViewerOnly,
    projectPlacedModules: project?.placedModules?.length || 0,
    storePlacedModules: placedModules.length,
    currentPlacedModules: currentPlacedModules.length,
    currentPlacedModulesData: currentPlacedModules
  });
  
  // 컴포넌트 마운트시 재질 설정 초기화 제거 (Firebase 로드 색상 유지)
  
  // 재질 설정 가져오기 - spaceInfo에서 직접 가져오기
  const materialConfig = currentSpaceInfo?.materialConfig || { 
    interiorColor: '#FFFFFF', 
    doorColor: '#E0E0E0'  // 기본값 변경
  };
  
  // 도어 텍스처도 포함된 완전한 materialConfig 생성
  const fullMaterialConfig = {
    ...materialConfig
  };
  
  // 기둥 변경 감지하여 즉시 리렌더링 (뷰어 모드에서는 비활성화)
  useEffect(() => {
    if (!isViewerOnly) {
      console.log('🔄 Space3DView - 기둥 상태 변경 감지:', {
        columnsCount: currentSpaceInfo.columns?.length || 0,
        columnsData: currentSpaceInfo.columns?.map(col => ({ id: col.id, position: col.position, depth: col.depth }))
      });
    }
    // Three.js 씬 강제 업데이트는 ThreeCanvas에서 자동으로 처리됨
  }, [currentSpaceInfo.columns, isViewerOnly]);
  
  // 가구 개수 계산
  const furnitureCount = currentPlacedModules.length;

  // 2D 뷰 방향별 카메라 위치 계산 - threeUtils의 최적화된 거리 사용
  const cameraPosition = useMemo(() => {
    const { width, height, depth = 600 } = currentSpaceInfo; // 기본 깊이 600mm
    
    // threeUtils의 calculateOptimalDistance 사용 (3D와 동일한 계산)
    const distance = calculateOptimalDistance(width, height, depth, furnitureCount);
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
        const leftDistance = calculateOptimalDistance(depth, height, width, furnitureCount);
        return [-leftDistance, centerY, centerZ] as [number, number, number];
      case 'right':
        // 우측: X축에서 너비를 고려한 최적 거리
        const rightDistance = calculateOptimalDistance(depth, height, width, furnitureCount);
        return [rightDistance, centerY, centerZ] as [number, number, number];
      case 'top':
        // 상단: Y축에서 너비와 깊이를 고려한 최적 거리 (비율 보정)
        const topDistance = calculateOptimalDistance(width, depth, height, furnitureCount);
        return [centerX, centerY + topDistance, centerZ] as [number, number, number];
      default:
        return frontPosition;
    }
  }, [currentSpaceInfo.width, currentSpaceInfo.height, currentSpaceInfo.depth, viewMode, view2DDirection, furnitureCount]);
  
  // 뷰어 모드에서는 간단한 키 사용
  const viewerKey = useMemo(() => 
    isViewerOnly ? `viewer-${projectId}-${viewMode}` : `${location.pathname}-${viewMode}-${view2DDirection}`, 
    [isViewerOnly, projectId, location.pathname, viewMode, view2DDirection]
  );
  
  // 드롭 이벤트 핸들러 (뷰어 모드에서는 비활성화)
  const handleDrop = (e: React.DragEvent) => {
    if (isViewerOnly) return; // 뷰어 모드에서는 드롭 비활성화
    
    e.preventDefault();
    e.stopPropagation();
    
    // Canvas 요소 찾기
    const canvas = e.currentTarget.querySelector('canvas');
    if (!canvas) {
      return;
    }

    // 드래그 데이터 확인
    const dragData = e.dataTransfer.getData('application/json');
    if (!dragData) {
      return;
    }

    try {
      const parsedData = JSON.parse(dragData);
      
      // 기둥 드롭 처리
      if (parsedData.type === 'column') {
        handleColumnDrop(e, parsedData);
        return;
      }
      
      // 가벽 드롭 처리
      if (parsedData.type === 'wall') {
        handleWallDrop(e, parsedData);
        return;
      }
      
      // 기존 가구 드롭 처리
      const handleSlotDrop = window.handleSlotDrop;
      if (typeof handleSlotDrop === 'function') {
        handleSlotDrop(e.nativeEvent, canvas);
      }
    } catch (error) {
      console.error('드롭 데이터 파싱 오류:', error);
    }
  };

  // 기둥 드롭 핸들러
  const handleColumnDrop = (e: React.DragEvent, columnData: any) => {
    // 캔버스 중앙에 기둥 배치 (임시)
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = (e.clientX - rect.left - rect.width / 2) / 100; // 대략적인 위치 계산
    
    // 공간 깊이 계산하여 뒷벽에 맞닿도록 배치
    const spaceDepthM = (currentSpaceInfo.depth || 1500) * 0.01; // mm를 Three.js 단위로 변환
    const columnDepthM = (columnData.depth || 730) * 0.01; // columnData에서 깊이 가져오기
    const zPosition = -(spaceDepthM / 2) + (columnDepthM / 2); // 뒷벽에 맞닿도록
    
    // 기둥 생성 (바닥 기준으로 위치 설정)
    const newColumn = {
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, zPosition] as [number, number, number], // 바닥 기준: Y=0
      width: columnData.width || 300, // columnData에서 폭 가져오기
      height: columnData.height || currentSpaceInfo.height || 2400, // columnData에서 높이 가져오기
      depth: columnData.depth || 730, // columnData에서 깊이 가져오기
      color: columnData.color || '#888888',
      material: columnData.material || 'concrete'
    };

    console.log('🏗️ 기둥 드롭 배치:', {
      centerX,
      zPosition,
      spaceDepthM,
      columnDepthM,
      column: newColumn
    });
    
    // 스토어에 기둥 추가
    const { addColumn } = useSpaceConfigStore.getState();
    addColumn(newColumn);
  };

  // 가벽 드롭 핸들러
  const handleWallDrop = (e: React.DragEvent, wallData: any) => {
    // 캔버스 중앙에 가벽 배치 (임시)
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = (e.clientX - rect.left - rect.width / 2) / 100; // 대략적인 위치 계산
    
    // 공간 깊이 계산하여 뒷벽에 맞닿도록 배치
    const spaceDepthM = (spaceInfo.depth || 1500) * 0.01; // mm를 Three.js 단위로 변환
    const wallDepthM = (wallData.depth || 730) * 0.01; // 730mm를 Three.js 단위로 변환
    const zPosition = -(spaceDepthM / 2) + (wallDepthM / 2); // 뒷벽에 맞닿도록
    
    // 가벽 생성 (바닥 기준으로 위치 설정)
    const newWall = {
      id: `wall-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, zPosition] as [number, number, number], // 바닥 기준: Y=0
      width: wallData.width || 120, // 120mm 
      height: wallData.height || spaceInfo.height || 2400, // 공간 높이와 동일 (2400mm)
      depth: wallData.depth || 730, // 730mm
      color: wallData.color || '#888888',
      material: wallData.material || 'concrete'
    };

    console.log('🧱 가벽 드롭 배치:', {
      centerX,
      zPosition,
      spaceDepthM,
      wallDepthM,
      wall: newWall
    });
    
    // 스토어에 가벽 추가
    addWall(newWall);
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
  

  // 필수 데이터 검증
  if (!currentSpaceInfo) {
    console.error('❌ Space3DView: spaceInfo가 없습니다');
    return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
      공간 정보를 불러올 수 없습니다.
    </div>;
  }

  console.log('✅ Space3DView 렌더링:', {
    hasSpaceInfo: !!currentSpaceInfo,
    spaceInfo: currentSpaceInfo,
    isViewerOnly,
    viewMode,
    cameraPosition,
    renderMode,
    materialConfig: fullMaterialConfig
  });

  return (
    <Space3DViewProvider spaceInfo={currentSpaceInfo} svgSize={currentSvgSize} renderMode={renderMode} viewMode={viewMode}>
      <div 
        key={viewerKey}
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: '400px',
          position: 'relative',
          background: '#f5f5f5'
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
            {/* 확실히 작동하는 CAD 그리드 */}
            {viewMode === '2D' && (
              <CADGrid viewMode={viewMode} view2DDirection={view2DDirection} enabled={showGuides} />
            )}
            
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
              shadow-bias={-0.0005}
              shadow-radius={12}
              shadow-normalBias={0.02}
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
            <Room 
              spaceInfo={{
                ...currentSpaceInfo,
                // 드래그 중인 기둥은 제외하고 전달하여 프레임 분절 재계산 방지
                columns: draggingColumnId 
                  ? (currentSpaceInfo.columns || []).filter(col => col.id !== draggingColumnId)
                  : currentSpaceInfo.columns
              }} 
              viewMode={viewMode} 
              materialConfig={fullMaterialConfig} 
              showAll={showAll} 
              placedModules={currentPlacedModules} 
            />
            
            {/* 기둥 에셋 렌더링 */}
            {(currentSpaceInfo.columns || []).map((column) => (
              <React.Fragment key={column.id}>
                <ColumnAsset
                  id={column.id}
                  position={column.position}
                  width={column.width} // mm 단위 그대로 전달
                  height={column.height}
                  depth={column.depth}
                  color={column.color}
                  spaceInfo={currentSpaceInfo}
                  renderMode={renderMode}
                  onPositionChange={isViewerOnly ? undefined : (id, newPosition) => {
                    updateColumn(id, { position: newPosition });
                  }}
                  onRemove={isViewerOnly ? undefined : (id) => {
                    removeColumn(id);
                  }}
                  onDragStart={isViewerOnly ? undefined : (id) => {
                    setDraggingColumnId(id);
                  }}
                  onDragEnd={isViewerOnly ? undefined : (id) => {
                    setDraggingColumnId(null);
                  }}
                />
                {/* 기둥 벽면 간격 라벨 (기둥 팝업이 열렸을 때 표시, 드래그 중이 아닐 때만) */}
                {!isViewerOnly && (activePopup.type === 'column' || activePopup.type === 'columnEdit') && activePopup.id === column.id && draggingColumnId !== column.id && (
                  <ColumnDistanceLabels
                    column={column}
                    spaceInfo={currentSpaceInfo}
                    onPositionChange={(columnId, newPosition) => {
                      updateColumn(columnId, { position: newPosition });
                    }}
                    onColumnUpdate={(columnId, updates) => {
                      updateColumn(columnId, updates);
                    }}
                    showLabels={true}
                  />
                )}
              </React.Fragment>
            ))}
            
            {/* 가벽 에셋 렌더링 */}
            {(currentSpaceInfo.walls || []).map((wall) => (
              <WallAsset
                key={wall.id}
                id={wall.id}
                position={wall.position}
                width={wall.width} // mm 단위 그대로 전달
                height={wall.height}
                depth={wall.depth}
                color={wall.color}
                spaceInfo={currentSpaceInfo}
                renderMode={renderMode}
                onPositionChange={isViewerOnly ? undefined : (id, newPosition) => {
                  updateWall(id, { position: newPosition });
                }}
                onRemove={isViewerOnly ? undefined : (id) => {
                  removeWall(id);
                }}
              />
            ))}
            
            {/* 기둥 드래그 시 고스트 프리뷰 (뷰어 모드에서는 비활성화) */}
            {!isViewerOnly && <ColumnGhostPreview spaceInfo={currentSpaceInfo} />}
            
            
            {/* 기둥 생성 마커는 드래그 앤 드롭 방식으로 대체됨 */}
            
            {/* Configurator에서 표시되는 요소들 */}
            {/* 컬럼 가이드 표시 - 2D/3D 모두에서 표시, showDimensions가 true이고 showAll(가이드)이 true일 때만, 뷰어 모드에서는 비활성화 */}
            {!isViewerOnly && showDimensions && showAll && <ColumnGuides />}
            
            {/* CAD 스타일 치수/가이드 표시 - 2D와 3D 모두에서 표시, showDimensions가 true이고 showDimensionsText가 true일 때만, 뷰어 모드에서는 비활성화 */}
            {!isViewerOnly && showDimensions && showDimensionsText && <CleanCAD2D viewDirection={viewMode === '3D' ? '3D' : view2DDirection} />}
            
            {/* PlacedFurniture는 Room 내부에서 렌더링되므로 중복 제거 */}

            {/* 슬롯 드롭존 (뷰어 모드에서는 비활성화) */}
            {!isViewerOnly && <SlotDropZones spaceInfo={currentSpaceInfo} showAll={showAll} />}
          </React.Suspense>
        </ThreeCanvas>

      </div>
    </Space3DViewProvider>
  );
};

export default React.memo(Space3DView); 