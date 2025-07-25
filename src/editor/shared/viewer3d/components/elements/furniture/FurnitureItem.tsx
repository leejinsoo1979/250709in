import React, { useEffect, useMemo } from 'react';
import { Box, Edges } from '@react-three/drei';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import BoxModule from '../../modules/BoxModule';
import * as THREE from 'three';
import { analyzeColumnSlots, calculateFurnitureWidthWithColumn, convertDualToSingleIfNeeded, calculateFurnitureBounds, calculateOptimalHingePosition } from '@/editor/shared/utils/columnSlotProcessor';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import DoorModule from '../../modules/DoorModule';
import { useTheme } from '@/contexts/ThemeContext';
import { useFurnitureStore } from '@/store/core/furnitureStore';

interface FurnitureItemProps {
  placedModule: PlacedModule;
  spaceInfo: SpaceInfo;
  furnitureStartY: number;
  isDragMode: boolean;
  isEditMode: boolean;
  isDraggingThis: boolean;
  viewMode: '2D' | '3D';
  renderMode: 'solid' | 'wireframe';
  onPointerDown: (e: ThreeEvent<PointerEvent>, id: string) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: () => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>, id: string) => void;
}

const FurnitureItem: React.FC<FurnitureItemProps> = ({
  placedModule,
  spaceInfo,
  furnitureStartY,
  isDragMode,
  isEditMode,
  isDraggingThis,
  viewMode,
  renderMode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick
}) => {
  // Three.js 컨텍스트 접근
  const { gl, invalidate, scene, camera } = useThree();
  
  // 테마 컨텍스트에서 색상 가져오기
  const { theme } = useTheme();
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 모듈 데이터 가져오기
  let moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
  
  if (!moduleData) {
    return null; // 모듈 데이터가 없으면 렌더링하지 않음
  }

  // 가구 위치 변경 시 렌더링 업데이트 및 그림자 업데이트
  useEffect(() => {
    invalidate();
    
    // 3D 모드에서 그림자 강제 업데이트
    if (gl && gl.shadowMap) {
      gl.shadowMap.needsUpdate = true;
      
      // 메쉬 렌더링 완료 보장을 위한 지연 업데이트
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, 100);
      
      // 추가로 300ms 후에도 한 번 더 (완전한 렌더링 보장)
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, 300);
    }
  }, [placedModule.position.x, placedModule.position.y, placedModule.position.z, placedModule.id, invalidate, gl]);
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 기둥 포함 슬롯 분석 (기둥 변경사항 실시간 반영)
  const columnSlots = React.useMemo(() => {
    console.log('🔄 FurnitureItem - 기둥 슬롯 분석 업데이트:', {
      moduleId: placedModule.id,
      slotIndex: placedModule.slotIndex,
      columnsCount: spaceInfo.columns?.length || 0
    });
    return analyzeColumnSlots(spaceInfo);
  }, [spaceInfo, spaceInfo.columns, placedModule.id, placedModule.slotIndex]);
  
  const slotInfo = placedModule.slotIndex !== undefined ? columnSlots[placedModule.slotIndex] : undefined;
  
  // 듀얼 → 싱글 변환 확인
  let actualModuleData = moduleData;
  if (slotInfo && slotInfo.hasColumn) {
    const conversionResult = convertDualToSingleIfNeeded(moduleData, slotInfo, spaceInfo);
    if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
      actualModuleData = conversionResult.convertedModuleData;
    }
  }
  
  // 기둥 침범 상황 확인 및 가구/도어 크기 조정
  let furnitureWidthMm = actualModuleData.dimensions.width;
  let adjustedPosition = placedModule.position;
  
  // 도어 위치 고정을 위한 원래 슬롯 정보 계산
  const indexing = calculateSpaceIndexing(spaceInfo);
  
  // 듀얼 가구인지 확인하여 도어 크기 결정
  const isDualFurniture = Math.abs(actualModuleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
  const originalSlotWidthMm = isDualFurniture ? (indexing.columnWidth * 2) : indexing.columnWidth; // 듀얼이면 2배, 싱글이면 1배
  
  // 도어는 항상 원래 슬롯 중심에 고정 (가구 이동과 무관)
  let originalSlotCenterX: number;
  
  // 슬롯 인덱스가 있으면 정확한 슬롯 중심 위치 계산 (우선순위)
  if (placedModule.slotIndex !== undefined && indexing.threeUnitPositions[placedModule.slotIndex] !== undefined) {
    originalSlotCenterX = indexing.threeUnitPositions[placedModule.slotIndex]; // 실제 슬롯 중심 위치
  } else {
    // 슬롯 인덱스가 없는 경우, 듀얼 가구라면 듀얼 위치에서 찾기
    
    if (isDualFurniture && indexing.threeUnitDualPositions) {
      // 듀얼 가구의 경우 듀얼 위치에서 가장 가까운 위치 찾기
      const closestDualIndex = indexing.threeUnitDualPositions.findIndex(pos => 
        Math.abs(pos - placedModule.position.x) < 0.2 // 20cm 오차 허용
      );
      if (closestDualIndex >= 0) {
        originalSlotCenterX = indexing.threeUnitDualPositions[closestDualIndex];
      } else {
        // 백업: 현재 위치 사용 (기존 동작)
        originalSlotCenterX = placedModule.position.x;
      }
    } else {
      // 싱글 가구의 경우 싱글 위치에서 가장 가까운 위치 찾기
      const closestSingleIndex = indexing.threeUnitPositions.findIndex(pos => 
        Math.abs(pos - placedModule.position.x) < 0.2 // 20cm 오차 허용
      );
      if (closestSingleIndex >= 0) {
        originalSlotCenterX = indexing.threeUnitPositions[closestSingleIndex];
      } else {
        // 백업: 현재 위치 사용 (기존 동작)
        originalSlotCenterX = placedModule.position.x;
      }
    }
  }
  
  if (slotInfo && slotInfo.hasColumn) {
    // 기둥C의 경우 침범량 먼저 확인
    const columnDepth = slotInfo.column?.depth || 0;
    let shouldUseDepthAdjustment = false;
    
    if (columnDepth === 300) { // 기둥C
      // X축 침범량 계산 (calculateFurnitureBounds와 동일한 방식)
      const slotCenterX = originalSlotCenterX;
      const columnCenterX = slotInfo.column.position[0];
      
      const distanceFromCenterX = Math.abs(columnCenterX - slotCenterX) * 1000;
      const slotHalfWidth = (indexing.columnWidth / 2);
      const columnHalfWidth = ((slotInfo.column.width || 0) / 2);
      const maxAllowedDistanceX = slotHalfWidth - columnHalfWidth;
      const xAxisIntrusion = Math.max(0, distanceFromCenterX - maxAllowedDistanceX);
      
      console.log('🔍 기둥C 침범량 계산:', {
        moduleId: placedModule.moduleId,
        distanceFromCenterX: distanceFromCenterX.toFixed(1) + 'mm',
        slotHalfWidth: slotHalfWidth.toFixed(1) + 'mm',
        columnHalfWidth: columnHalfWidth.toFixed(1) + 'mm',
        maxAllowedDistanceX: maxAllowedDistanceX.toFixed(1) + 'mm',
        xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm'
      });
      
      shouldUseDepthAdjustment = xAxisIntrusion >= 150;
    }
    
    if (!shouldUseDepthAdjustment) {
      // 기둥C 150mm 미만 침범 또는 다른 기둥: 폭 조정
      const slotWidthM = indexing.columnWidth * 0.01;
      const originalSlotBounds = {
        left: originalSlotCenterX - slotWidthM / 2,
        right: originalSlotCenterX + slotWidthM / 2,
        center: originalSlotCenterX
      };
      
      const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
      furnitureWidthMm = furnitureBounds.renderWidth;
      adjustedPosition = {
        ...placedModule.position,
        x: furnitureBounds.center
      };
      
      console.log('📏 폭 조정 모드:', {
        moduleId: placedModule.moduleId,
        originalWidth: actualModuleData.dimensions.width,
        adjustedWidth: furnitureWidthMm,
        columnDepth
      });
    }
    
    console.log('🪑 기둥 침범 - 가구 크기 및 위치 조정:', {
      moduleId: placedModule.moduleId,
      slotIndex: placedModule.slotIndex,
      columnId: slotInfo.column?.id,
      columnDepth: slotInfo.column?.depth,
      originalWidth: actualModuleData.dimensions.width,
      furnitureWidth: furnitureWidthMm,
      widthReduced: actualModuleData.dimensions.width > furnitureWidthMm,
      reductionAmount: actualModuleData.dimensions.width - furnitureWidthMm,
      originalSlotWidth: originalSlotWidthMm,
      originalSlotCenter: originalSlotCenterX,
      originalFurniturePosition: placedModule.position.x,
      newFurniturePosition: adjustedPosition.x,
      intrusionDirection: slotInfo.intrusionDirection,
      furniturePosition: slotInfo.furniturePosition,
      logic: '가구는 이동, 도어는 원래 슬롯 위치 고정 (커버 방식)',
      doorWillStayAt: originalSlotCenterX,
      furnitureMovesTo: adjustedPosition.x,
      adjustmentWorking: furnitureWidthMm < actualModuleData.dimensions.width ? '✅ 폭 조정됨' : '❌ 폭 조정 안됨'
    });
  }
  
  // 가구 치수를 Three.js 단위로 변환
  const width = mmToThreeUnits(furnitureWidthMm);
  
  // 가구 높이 계산: 받침대 설정에 따라 조정
  let furnitureHeightMm = internalSpace.height;
  if (spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig.placementType === 'float') {
    // 띄워서 배치일 때: 내경 높이에서 띄움 높이를 뺌
    const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
    furnitureHeightMm = internalSpace.height - floatHeightMm;
  }
  
  const height = mmToThreeUnits(furnitureHeightMm);
  
  // 깊이 계산: customDepth가 있으면 사용, 없으면 기본 깊이 사용
  let actualDepthMm = placedModule.customDepth || actualModuleData.dimensions.depth;
  
  // 기둥C가 150mm 이상 침범하는 경우에만 깊이 조정 (150mm 미만은 기존 폭 조정 로직 사용)
  if (slotInfo && slotInfo.hasColumn && slotInfo.column) {
    const columnDepth = slotInfo.column.depth;
    if (columnDepth === 300) { // 기둥C
      // X축 침범량 재계산 (위와 동일한 방식)
      const slotCenterX = originalSlotCenterX;
      const columnCenterX = slotInfo.column.position[0];
      
      const distanceFromCenterX = Math.abs(columnCenterX - slotCenterX) * 1000;
      const slotHalfWidth = (indexing.columnWidth / 2);
      const columnHalfWidth = ((slotInfo.column.width || 0) / 2);
      const maxAllowedDistanceX = slotHalfWidth - columnHalfWidth;
      const xAxisIntrusion = Math.max(0, distanceFromCenterX - maxAllowedDistanceX);
      
      // 150mm 이상 침범 시에만 깊이 조정 모드로 전환
      if (xAxisIntrusion >= 150) {
        const slotDepth = 730; // 슬롯 깊이
        actualDepthMm = slotDepth - columnDepth; // 430mm
        
        // 150mm 이상 침범 시에는 위의 폭 조정을 덮어쓰기
        furnitureWidthMm = actualModuleData.dimensions.width;
        adjustedPosition = {
          ...placedModule.position,
          x: originalSlotCenterX // 원래 슬롯 중앙으로
        };
        
        console.log('🏛️ 기둥C 150mm 이상 침범 - 깊이 조정 모드:', {
          moduleId: placedModule.moduleId,
          xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
          originalDepth: actualModuleData.dimensions.depth,
          adjustedDepth: actualDepthMm,
          originalWidth: actualModuleData.dimensions.width,
          furnitureWidth: furnitureWidthMm,
          position: originalSlotCenterX
        });
      } else if (xAxisIntrusion > 0 && xAxisIntrusion < 150) {
        // 150mm 미만 침범: 폭 조정은 이미 위에서 처리됨
        console.log('🏛️ 기둥C 150mm 미만 침범 - 폭 조정 확인:', {
          moduleId: placedModule.moduleId,
          xAxisIntrusion: xAxisIntrusion.toFixed(1) + 'mm',
          originalWidth: actualModuleData.dimensions.width,
          adjustedWidth: furnitureWidthMm,
          widthReduced: actualModuleData.dimensions.width > furnitureWidthMm,
          widthReduction: actualModuleData.dimensions.width - furnitureWidthMm,
          position: adjustedPosition.x,
          note: '폭 조정은 이미 위의 calculateFurnitureBounds에서 처리됨'
        });
        // 폭 조정은 이미 처리되었으므로 추가 작업 없음
      }
    }
  }
  
  const depth = mmToThreeUnits(actualDepthMm);

  // 도어 두께 (20mm)
  const doorThicknessMm = 20;
  const doorThickness = mmToThreeUnits(doorThicknessMm);

  // Room.tsx와 동일한 Z축 위치 계산
  const panelDepthMm = 1500; // 전체 공간 깊이
  const furnitureDepthMm = 600; // 가구 공간 깊이
  const panelDepth = mmToThreeUnits(panelDepthMm);
  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
  
  // Room.tsx와 동일한 계산: 뒷벽에서 600mm만 나오도록
  const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 뒷벽에서 600mm
  
  // 가구를 가구 공간의 뒷쪽에 배치 (프레임 앞면에서 도어 두께만큼 뒤)
  const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;

  // 색상 설정: 드래그 중일 때만 색상 전달, 다른 상태에서는 MaterialPanel 색상 사용
  const furnitureColor = useMemo(() => isDraggingThis ? new THREE.Color(theme.color) : undefined, [isDraggingThis, theme.color]);
  
  // 기둥 침범 상황에 따른 최적 힌지 방향 계산
  let optimalHingePosition = placedModule.hingePosition || 'right';
  if (slotInfo && slotInfo.hasColumn) {
    optimalHingePosition = calculateOptimalHingePosition(slotInfo);
    console.log('🚪 기둥 침범에 따른 힌지 방향 조정:', {
      slotIndex: slotInfo.slotIndex,
      intrusionDirection: slotInfo.intrusionDirection,
      furniturePosition: slotInfo.furniturePosition,
      originalHinge: placedModule.hingePosition || 'right',
      optimalHinge: optimalHingePosition
         });
   }

  // 위치 변경 로깅 (adjustedPosition 계산 후)
  useEffect(() => {
    console.log('📍 FurnitureItem 위치 변경:', {
      id: placedModule.id,
      placedModulePosition: placedModule.position,
      adjustedPosition: adjustedPosition,
      positionDifference: {
        x: adjustedPosition.x - placedModule.position.x,
        y: adjustedPosition.y - placedModule.position.y,
        z: adjustedPosition.z - placedModule.position.z
      }
    });
  }, [placedModule.position.x, placedModule.position.y, placedModule.position.z, adjustedPosition.x, adjustedPosition.y, adjustedPosition.z, placedModule.id]);

  // adjustedWidth와 adjustedPosition 업데이트
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  
  useEffect(() => {
    // 기둥 침범으로 폭이나 위치가 조정되었거나, 원래대로 돌아왔을 때 업데이트
    const shouldUpdate = slotInfo && slotInfo.hasColumn ? 
      (furnitureWidthMm !== actualModuleData.dimensions.width || adjustedPosition.x !== placedModule.position.x) : 
      (placedModule.adjustedWidth !== undefined || placedModule.adjustedPosition !== undefined);
    
    if (shouldUpdate) {
      const newAdjustedWidth = slotInfo && slotInfo.hasColumn && furnitureWidthMm !== actualModuleData.dimensions.width ? 
        furnitureWidthMm : 
        undefined;
      
      const newAdjustedPosition = slotInfo && slotInfo.hasColumn && adjustedPosition.x !== placedModule.position.x ?
        adjustedPosition :
        undefined;
      
      const needsUpdate = placedModule.adjustedWidth !== newAdjustedWidth || 
        (placedModule.adjustedPosition?.x !== newAdjustedPosition?.x);
      
      if (needsUpdate) {
        console.log('📏 가구 폭/위치 조정 업데이트:', {
          id: placedModule.id,
          originalWidth: actualModuleData.dimensions.width,
          adjustedWidth: newAdjustedWidth,
          originalPosition: placedModule.position,
          adjustedPosition: newAdjustedPosition,
          hasColumn: slotInfo?.hasColumn
        });
        
        updatePlacedModule(placedModule.id, {
          adjustedWidth: newAdjustedWidth,
          adjustedPosition: newAdjustedPosition
        });
      }
    }
  }, [furnitureWidthMm, actualModuleData.dimensions.width, adjustedPosition.x, placedModule.position.x, slotInfo?.hasColumn, placedModule.id, placedModule.adjustedWidth, placedModule.adjustedPosition, updatePlacedModule]);

  return (
    <group>
      {/* 가구 본체 (기둥에 의해 밀려날 수 있음) */}
      <group
        position={[
          adjustedPosition.x,
          furnitureStartY + height / 2, // 내경 바닥 높이 + 가구 높이의 절반
          furnitureZ // 공간 앞면에서 뒤쪽으로 배치
        ]}
        rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
        onDoubleClick={(e) => onDoubleClick(e, placedModule.id)}
        onPointerDown={(e) => onPointerDown(e, placedModule.id)}
        onPointerMove={(e) => onPointerMove(e)}
        onPointerUp={onPointerUp}
        onPointerOver={() => {
          document.body.style.cursor = isDragMode ? 'grab' : (isDraggingThis ? 'grabbing' : 'grab');
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        {/* 노서라운드 모드에서 가구 위치 디버깅 */}
        {spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && (() => {
          console.log(`🪑 [가구위치] 이격거리${spaceInfo.gapConfig.left}mm: X=${placedModule.position.x.toFixed(3)}, 폭=${moduleData.dimensions.width}mm`);
          return null;
        })()}


        {/* 가구 타입에 따라 다른 컴포넌트 렌더링 */}
        {moduleData.type === 'box' ? (
          // 박스형 가구 렌더링 (도어 제외)
          <BoxModule 
            viewMode={viewMode}
            renderMode={renderMode}
            moduleData={{
              ...actualModuleData, // 변환된 모듈 데이터 사용
              dimensions: {
                ...actualModuleData.dimensions,
                width: furnitureWidthMm // 조정된 너비 전달
              }
            }}
            isDragging={isDraggingThis} // 실제로 이 가구를 드래그하는 경우만 true
            color={furnitureColor}
            internalHeight={furnitureHeightMm}
            hasDoor={slotInfo && slotInfo.hasColumn ? false : (placedModule.hasDoor ?? false)} // 기둥 침범 시 도어는 별도 렌더링
            customDepth={actualDepthMm}
            hingePosition={optimalHingePosition}
            spaceInfo={spaceInfo}
            originalSlotWidth={originalSlotWidthMm}
            slotCenterX={0} // 기둥 침범과 무관하게 가구 본체와 동일한 위치
          />
        ) : (
          // 기본 가구 (단순 Box) 렌더링
          <>
            {/* 항상 메시 렌더링 - 와이어프레임 모드에서는 투명하게 */}
            <mesh key={`furniture-${placedModule.id}-${isDraggingThis ? theme.color : 'default'}`}>
              <boxGeometry args={[width, height, depth]} />
              {viewMode === '2D' && renderMode === 'wireframe' ? (
                <meshBasicMaterial transparent opacity={0.0} />
              ) : (
                <meshPhysicalMaterial 
                  color={isDraggingThis ? theme.color : '#cccccc'}
                  clearcoat={0.1}
                  clearcoatRoughness={0.8}
                  metalness={0.0}
                  roughness={0.7}
                  reflectivity={0.2}
                  transparent={isDraggingThis || isEditMode}
                  opacity={isDraggingThis || isEditMode ? 0.8 : 1.0}
                />
              )}
            </mesh>
            <Edges 
              color={isDraggingThis ? theme.color : isEditMode ? '#ff8800' : isDragMode ? '#ff0000' : (theme?.mode === 'dark' ? '#ffffff' : '#cccccc')} 
              threshold={1} 
              scale={1.001}
            />
            
            {/* 편집 모드일 때 안내 텍스트 */}
            {isEditMode && (
              <primitive 
                object={(() => {
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d')!;
                  canvas.width = 256;
                  canvas.height = 128;
                  context.fillStyle = 'rgba(255, 140, 0, 0.9)';
                  context.fillRect(0, 0, 256, 128);
                  context.fillStyle = '#ffffff';
                  context.font = '16px Arial';
                  context.textAlign = 'center';
                  context.fillText('편집 모드', 128, 25);
                  context.font = '12px Arial';
                  context.fillText('더블클릭으로 진입', 128, 40);
                  context.fillText('드래그: 이동', 128, 55);
                  context.fillText('←→: 이동', 128, 70);
                  context.fillText('Del: 삭제', 128, 85);
                  context.fillText('Esc: 해제', 128, 100);
                  
                  const texture = new THREE.CanvasTexture(canvas);
                  const material = new THREE.MeshBasicMaterial({ 
                    map: texture, 
                    transparent: true,
                    depthTest: false
                  });
                  const geometry = new THREE.PlaneGeometry(3, 1.5);
                  const mesh = new THREE.Mesh(geometry, material);
                  mesh.position.set(0, height + 2, 0);
                  mesh.renderOrder = 1002;
                  return mesh;
                })()}
              />
            )}
          </>
        )}
      </group>

      {/* 기둥 침범 시 도어를 별도로 렌더링 (원래 슬롯 위치에 고정) */}
      {(placedModule.hasDoor ?? false) && slotInfo && slotInfo.hasColumn && moduleData.type === 'box' && spaceInfo && (
        <group
          position={[
            originalSlotCenterX, // 항상 원래 슬롯 중심
            furnitureStartY + height / 2, // 가구와 동일한 Y 위치
            furnitureZ // 가구와 동일한 Z 위치
          ]}
          rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
        >
          <DoorModule
            moduleWidth={originalSlotWidthMm} // 원래 슬롯 크기 사용
            moduleDepth={actualDepthMm}
            hingePosition={optimalHingePosition}
            spaceInfo={spaceInfo}
            color={furnitureColor}
            doorXOffset={0} // 사용하지 않음
            originalSlotWidth={originalSlotWidthMm}
            slotCenterX={0} // 이미 절대 좌표로 배치했으므로 0
            moduleData={actualModuleData} // 실제 모듈 데이터
            isDragging={isDraggingThis}
          />
        </group>
      )}

      {/* 도어는 BoxModule 내부에서 렌더링하도록 변경 */}
    </group>
  );
};

export default FurnitureItem; 