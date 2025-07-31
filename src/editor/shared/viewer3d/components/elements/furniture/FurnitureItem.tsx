import React, { useEffect } from 'react';
import { Box, Edges, Html } from '@react-three/drei';
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
import { useUIStore } from '@/store/uiStore';
import { EditIcon } from '@/components/common/Icons';
import { getEdgeColor } from '../../../utils/edgeColorUtils';
import { useColumnCResize } from '@/editor/shared/furniture/hooks/useColumnCResize';

interface FurnitureItemProps {
  placedModule: PlacedModule;
  spaceInfo: SpaceInfo;
  furnitureStartY: number;
  isDragMode: boolean;
  isEditMode: boolean;
  isDraggingThis: boolean;
  viewMode: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
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
  view2DDirection,
  renderMode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick
}) => {
  // Three.js 컨텍스트 접근
  const { gl, invalidate, scene, camera } = useThree();
  const { isFurnitureDragging, showDimensions, view2DTheme } = useUIStore();
  const [isHovered, setIsHovered] = React.useState(false);
  
  // 테마 색상 가져오기
  const getThemeColor = () => {
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue('--theme-primary').trim() || '#10b981';
  };
  
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
  const isColumnC = (slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture) || false;
  
  // 듀얼 → 싱글 변환 확인 (드래그 중이 아닐 때만, 기둥 C가 아닐 때만)
  let actualModuleData = moduleData;
  if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn && !isColumnC) {
    const conversionResult = convertDualToSingleIfNeeded(moduleData, slotInfo, spaceInfo);
    if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
      actualModuleData = conversionResult.convertedModuleData;
    }
  }
  
  // Column C에서 싱글 가구로 변환 (듀얼 가구가 Column C에 배치된 경우)
  if (!isFurnitureDragging && isColumnC && moduleData.id.includes('dual-')) {
    actualModuleData = {
      ...moduleData,
      id: moduleData.id.replace('dual-', 'single-'),
      name: moduleData.name.replace('듀얼', '싱글'),
      dimensions: {
        ...moduleData.dimensions,
        width: slotInfo?.subSlots ? 
          (placedModule.subSlotPosition === 'left' ? 
            slotInfo.subSlots.left.availableWidth : 
            slotInfo.subSlots.right.availableWidth) : 
          indexing.columnWidth / 2
      }
    };
  }
  
  // 기둥 침범 상황 확인 및 가구/도어 크기 조정
  // customWidth는 Column C 분할 배치 시 사용, adjustedWidth는 일반 기둥 침범 시 사용
  let furnitureWidthMm = placedModule.customWidth || placedModule.adjustedWidth || actualModuleData.dimensions.width;
  let adjustedPosition = placedModule.position;
  let adjustedDepthMm = actualModuleData.dimensions.depth;
  
  // Column C 가구 너비 디버깅
  if (slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture) {
    console.log('🟦 FurnitureItem Column C 너비 확인:', {
      moduleId: placedModule.id,
      customWidth: placedModule.customWidth,
      adjustedWidth: placedModule.adjustedWidth,
      originalWidth: actualModuleData.dimensions.width,
      finalWidth: furnitureWidthMm,
      position: {
        x: placedModule.position.x.toFixed(3),
        z: placedModule.position.z.toFixed(3)
      }
    });
  }
  
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
  
  if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn && slotInfo.column) {
    // 기둥 타입에 따른 처리 방식 확인
    const columnProcessingMethod = slotInfo.columnProcessingMethod || 'width-adjustment';
    
    console.log('🏛️ 기둥 처리 방식:', {
      slotIndex: placedModule.slotIndex,
      columnType: slotInfo.columnType,
      columnDepth: slotInfo.column.depth,
      columnProcessingMethod,
      isColumnC,
      allowMultipleFurniture: slotInfo.allowMultipleFurniture
    });
    
    const slotWidthM = indexing.columnWidth * 0.01; // mm to meters
    const originalSlotBounds = {
      left: originalSlotCenterX - slotWidthM / 2,
      right: originalSlotCenterX + slotWidthM / 2,
      center: originalSlotCenterX
    };
    
    // 기둥 침범에 따른 새로운 가구 경계 계산
    const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
    
    // 모든 기둥에 대해 폭 조정 방식 적용 (기둥 C 포함)
    if (columnProcessingMethod === 'width-adjustment') {
      // Column C의 경우 서브슬롯 위치 사용
      if (isColumnC && slotInfo.subSlots && placedModule.subSlotPosition) {
        const subSlot = slotInfo.subSlots[placedModule.subSlotPosition];
        furnitureWidthMm = subSlot.availableWidth;
        adjustedPosition = {
          ...placedModule.position,
          x: subSlot.center
        };
        
        console.log('🔵 Column C 서브슬롯 위치 적용:', {
          subSlotPosition: placedModule.subSlotPosition,
          width: furnitureWidthMm,
          center: subSlot.center,
          originalPosition: placedModule.position.x
        });
      } else {
        // 일반 폭 조정 방식: 가구 크기와 위치 조정
        furnitureWidthMm = furnitureBounds.renderWidth;
        adjustedPosition = {
          ...placedModule.position,
          x: furnitureBounds.center
        };
      }
      
      console.log('🪑 폭 조정 방식 - 가구 크기 및 위치 조정:', {
        columnType: slotInfo.columnType,
        columnDepth: slotInfo.column.depth,
        originalWidth: actualModuleData.dimensions.width,
        adjustedWidth: furnitureWidthMm,
        originalPosition: placedModule.position.x,
        adjustedPosition: adjustedPosition.x,
        intrusionDirection: slotInfo.intrusionDirection,
        allowMultipleFurniture: slotInfo.allowMultipleFurniture
      });
    } else if (columnProcessingMethod === 'depth-adjustment') {
      // 깊이 조정 방식 (얕은 기둥만 해당, 기둥 C 제외)
      const slotDepth = 730; // 슬롯 기본 깊이
      const columnDepth = slotInfo.column.depth;
      const remainingDepth = slotDepth - columnDepth;
      
      // 듀얼캐비닛인지 확인
      const isDualFurniture = Math.abs(actualModuleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
      
      if (isDualFurniture && remainingDepth <= 300) {
        // 듀얼캐비닛이고 남은 깊이가 300mm 이하면 배치 불가
        console.log('❌ 듀얼캐비닛 배치 불가 - 남은 깊이 부족:', {
          slotDepth: slotDepth,
          columnDepth: columnDepth,
          remainingDepth: remainingDepth,
          minimumRequired: 300,
          isDualFurniture: true
        });
        // 배치 불가 처리 (원래 깊이 유지하거나 다른 처리)
        adjustedDepthMm = actualModuleData.dimensions.depth;
      } else {
        // 배치 가능 - 깊이만 조정, 폭과 위치는 그대로
        adjustedDepthMm = remainingDepth;
        
        console.log('✅ 얕은 기둥 - 깊이만 줄임, 폭과 위치 유지:', {
          slotDepth: slotDepth,
          columnDepth: columnDepth,
          originalDepth: actualModuleData.dimensions.depth,
          adjustedDepthMm: adjustedDepthMm,
          originalWidth: actualModuleData.dimensions.width,
          keepOriginalWidth: true,
          keepOriginalPosition: true,
          isDualFurniture: isDualFurniture,
          계산식: `${slotDepth} - ${columnDepth} = ${adjustedDepthMm}`
        });
      }
    }
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
  
  // 깊이 계산: customDepth 우선, 기둥 충돌로 조정된 깊이, 기본 깊이 순
  const actualDepthMm = placedModule.customDepth || (adjustedDepthMm !== actualModuleData.dimensions.depth ? adjustedDepthMm : actualModuleData.dimensions.depth);
  const depth = mmToThreeUnits(actualDepthMm);
  
  // Column C 깊이 디버깅
  if (isColumnC && slotInfo) {
    console.log('🟪 FurnitureItem Column C 깊이 확인:', {
      moduleId: placedModule.id,
      placedModuleCustomDepth: placedModule.customDepth,
      adjustedDepthMm,
      actualModuleDepth: actualModuleData.dimensions.depth,
      finalActualDepthMm: actualDepthMm,
      slotIndex: placedModule.slotIndex,
      isSplit: placedModule.isSplit,
      spaceType: placedModule.columnSlotInfo?.spaceType
    });
  }
  

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
  
  // Z축 위치는 항상 기본 위치 사용 (사이즈만 확장)
  const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;

  // 색상 설정: 드래그 중일 때만 색상 전달, 다른 상태에서는 MaterialPanel 색상 사용
  const furnitureColor = isDraggingThis ? '#66ff66' : undefined;
  
  // 기둥 침범 상황에 따른 최적 힌지 방향 계산 (드래그 중이 아닐 때만)
  let optimalHingePosition = placedModule.hingePosition || 'right';
  if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn) {
    optimalHingePosition = calculateOptimalHingePosition(slotInfo);
    console.log('🚪 기둥 침범에 따른 힌지 방향 조정:', {
      slotIndex: slotInfo.slotIndex,
      intrusionDirection: slotInfo.intrusionDirection,
      furniturePosition: slotInfo.furniturePosition,
      originalHinge: placedModule.hingePosition || 'right',
      optimalHinge: optimalHingePosition
         });
   }

  // Column C 기둥 앞 가구인지 확인
  const isColumnCFront = isColumnC && placedModule.columnSlotInfo?.spaceType === 'front';
  
  // Column C 크기 조절 훅 사용 (기둥 앞 가구일 때만)
  const columnCResize = useColumnCResize(
    placedModule,
    isColumnCFront,
    slotInfo?.column?.depth || 300,
    indexing.columnWidth // 동적으로 실제 슬롯 너비 사용
  );

  // Column C 전용 이벤트 핸들러 래핑
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (isColumnCFront && !isDragMode) {
      // Column C 기둥 앞 가구는 리사이즈 모드
      columnCResize.handlePointerDown(e);
    } else {
      // 일반 가구는 드래그 모드
      onPointerDown(e, placedModule.id);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (columnCResize.isResizing) {
      columnCResize.handlePointerMove(e);
    } else {
      onPointerMove(e);
    }
  };

  const handlePointerUp = () => {
    if (columnCResize.isResizing) {
      columnCResize.handlePointerUp();
    } else {
      onPointerUp();
    }
  };

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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={() => {
          if (isColumnCFront && !isDragMode) {
            document.body.style.cursor = columnCResize.isResizing ? 'crosshair' : 'move';
          } else {
            document.body.style.cursor = isDragMode ? 'grab' : (isDraggingThis ? 'grabbing' : 'grab');
          }
          setIsHovered(true);
        }}
        onPointerOut={() => {
          if (!columnCResize.isResizing) {
            document.body.style.cursor = 'default';
          }
          setIsHovered(false);
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
            viewMode={viewMode}
            renderMode={renderMode}
            hasDoor={!isFurnitureDragging && slotInfo && slotInfo.hasColumn ? false : (placedModule.hasDoor ?? false)} // 기둥 침범 시 도어는 별도 렌더링 (드래그 중이 아닐 때만)
            customDepth={actualDepthMm}
            hingePosition={optimalHingePosition}
            spaceInfo={spaceInfo}
            originalSlotWidth={originalSlotWidthMm}
            slotCenterX={0} // 기둥 침범과 무관하게 가구 본체와 동일한 위치
          />
        ) : (
          // 기본 가구 (단순 Box) 렌더링
          <>
            <Box 
              args={[width, height, depth]}
            >
              <meshPhysicalMaterial 
                color={furnitureColor}
                clearcoat={0.1}
                clearcoatRoughness={0.8}
                metalness={0.0}
                roughness={0.7}
                reflectivity={0.2}
                transparent={isDraggingThis || isEditMode}
                opacity={isDraggingThis || isEditMode ? 0.8 : 1.0}
              />
            </Box>
            <Edges 
              color={columnCResize.isResizing ? '#ff6600' : getEdgeColor({
                isDragging: isDraggingThis,
                isEditMode,
                isDragMode,
                viewMode,
                view2DTheme,
                renderMode
              })} 
              threshold={1} 
              scale={1.001}
              linewidth={columnCResize.isResizing ? 3 : 1}
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
        
        {/* Column C 기둥 앞 가구 리사이즈 안내 표시 */}
        {isColumnCFront && isHovered && !isDragMode && !columnCResize.isResizing && (
          <Html
            position={[0, height/2 + 0.5, depth/2 + 0.1]}
            center
            style={{
              userSelect: 'none',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          >
            <div
              style={{
                background: 'rgba(255, 102, 0, 0.9)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              ↔️ 드래그하여 크기 조절
            </div>
          </Html>
        )}
        
        {/* Column C 리사이즈 방향 표시 */}
        {columnCResize.isResizing && columnCResize.resizeDirection && (
          <Html
            position={[0, 0, depth/2 + 0.1]}
            center
            style={{
              userSelect: 'none',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          >
            <div
              style={{
                background: 'rgba(255, 102, 0, 0.9)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              {columnCResize.resizeDirection === 'horizontal' ? '↔️ 너비 조절' : '↕️ 깊이 조절'}
            </div>
          </Html>
        )}
        
      </group>

      {/* 기둥 침범 시 도어를 별도로 렌더링 (원래 슬롯 위치에 고정) - 드래그 중이 아닐 때만 */}
      {(placedModule.hasDoor ?? false) && !isFurnitureDragging && slotInfo && slotInfo.hasColumn && moduleData.type === 'box' && spaceInfo && (
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
          />
        </group>
      )}

      {/* 도어는 BoxModule 내부에서 렌더링하도록 변경 */}
      
      {/* 3D 모드에서 편집 아이콘 표시 - showDimensions가 true이고 3D 모드일 때만 표시 */}
      {showDimensions && viewMode === '3D' && (
        <Html
          position={[
            adjustedPosition.x,
            furnitureStartY - 1.8, // 원래 위치로 (하부 프레임 아래)
            furnitureZ + depth / 2 + 0.5 // 가구 앞쪽
          ]}
          center
          style={{
            userSelect: 'none',
            pointerEvents: 'auto',
            zIndex: 100,
            background: 'transparent'
          }}
        >
          <div
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              border: `2px solid ${getThemeColor()}`,
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              transition: 'all 0.2s ease',
              opacity: isHovered ? 1 : 0.8,
              transform: isHovered ? 'scale(1.1)' : 'scale(1)',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => {
              e.stopPropagation();
              // 이미 편집 모드라면 팝업 닫기
              if (isEditMode) {
                const closeAllPopups = useUIStore.getState().closeAllPopups;
                closeAllPopups();
              } else {
                // 편집 모드가 아니면 팝업 열기
                onDoubleClick(e as any, placedModule.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title="가구 속성 편집"
          >
            <EditIcon color={getThemeColor()} size={18} />
          </div>
        </Html>
      )}
    </group>
  );
};

export default FurnitureItem; 