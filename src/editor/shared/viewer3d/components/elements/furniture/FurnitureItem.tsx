import React, { useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '@/contexts/ThemeContext';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { EditIcon } from '@/components/common/Icons';

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
  
  // UI 상태에서 showDimensions 가져오기
  const showDimensions = useUIStore(state => state.showDimensions);
  
  // 호버 상태 관리
  const [isHovered, setIsHovered] = useState(false);
  
  // 디버깅 로그는 나중에 adjustedPosition이 계산된 후에 출력합니다
  
  // 테마 색상 가져오기
  const getThemeColor = () => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
      if (primaryColor) {
        return primaryColor;
      }
    }
    return '#10b981'; // 기본값 (green)
  };
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 모듈 데이터 가져오기
  let moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
  
  console.log('🔥 FurnitureItem 렌더링:', {
    placedModuleId: placedModule.id,
    moduleId: placedModule.moduleId,
    moduleDataFound: !!moduleData,
    placedModuleData: placedModule,
    internalSpace
  });
  
  if (!moduleData) {
    console.error('❌ 모듈 데이터를 찾을 수 없음:', placedModule.moduleId);
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
  
  // 드래그 상태가 변경될 때만 렌더링 업데이트 (성능 최적화)
  useEffect(() => {
    if (isDraggingThis !== undefined) {
      invalidate();
    }
  }, [isDraggingThis, invalidate]);
  
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
    // 슬롯의 원래 경계 계산 (실제 슬롯 중심 위치 기준)
    const slotWidthM = indexing.columnWidth * 0.01; // mm to meters
    const originalSlotBounds = {
      left: originalSlotCenterX - slotWidthM / 2,
      right: originalSlotCenterX + slotWidthM / 2,
      center: originalSlotCenterX
    };
    
    // 기둥 침범에 따른 새로운 가구 경계 계산
    const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
    
    // 가구 크기: 밀어내는 효과로 실제 렌더링 너비 조정
    furnitureWidthMm = furnitureBounds.renderWidth;
    
    // 가구 위치 조정
    adjustedPosition = {
      ...placedModule.position,
      x: furnitureBounds.center
    };
    
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
      bounds: {
        left: furnitureBounds.left,
        right: furnitureBounds.right,
        renderWidth: furnitureBounds.renderWidth
      },
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
  const actualDepthMm = placedModule.customDepth || actualModuleData.dimensions.depth;
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

  // 드래그 중일 때만 테마 색상 사용, 평소에는 undefined (재질 기본 색상 사용)
  const furnitureColor = isDraggingThis ? getThemeColor() : undefined;
  
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
    // 기둥이 있는 슬롯인지 확인
    const hasColumn = slotInfo?.hasColumn || false;
    
    // 폭이 조정되었는지 확인
    const isWidthAdjusted = furnitureWidthMm !== actualModuleData.dimensions.width;
    
    // 위치가 조정되었는지 확인
    const isPositionAdjusted = Math.abs(adjustedPosition.x - placedModule.position.x) > 0.001;
    
    // 현재 저장된 값과 비교하여 실제로 변경이 필요한지 확인
    const needsWidthUpdate = hasColumn && isWidthAdjusted && placedModule.adjustedWidth !== furnitureWidthMm;
    const needsPositionUpdate = hasColumn && isPositionAdjusted && 
      (!placedModule.adjustedPosition || Math.abs(placedModule.adjustedPosition.x - adjustedPosition.x) > 0.001);
    const needsClearUpdate = !hasColumn && (placedModule.adjustedWidth !== undefined || placedModule.adjustedPosition !== undefined);
    
    // 실제로 업데이트가 필요한 경우만 수행
    if (needsWidthUpdate || needsPositionUpdate || needsClearUpdate) {
      console.log('📏 가구 폭/위치 업데이트:', {
        id: placedModule.id,
        needsWidthUpdate,
        needsPositionUpdate,
        needsClearUpdate,
        adjustedWidth: hasColumn && isWidthAdjusted ? furnitureWidthMm : undefined,
        adjustedPosition: hasColumn && isPositionAdjusted ? adjustedPosition : undefined
      });
      
      updatePlacedModule(placedModule.id, {
        adjustedWidth: hasColumn && isWidthAdjusted ? furnitureWidthMm : undefined,
        adjustedPosition: hasColumn && isPositionAdjusted ? adjustedPosition : undefined
      });
    }
  }, [furnitureWidthMm, actualModuleData.dimensions.width, adjustedPosition.x, placedModule.position.x, slotInfo?.hasColumn, placedModule.id]);

  // 연필 아이콘 디버깅 로그 (adjustedPosition 계산 후)
  console.log('🖊️ 연필 아이콘 표시 조건:', {
    viewMode,
    showDimensions,
    should3DMode: viewMode === '3D',
    shouldShowIcon: viewMode === '3D',
    moduleId: placedModule.moduleId,
    furnitureId: placedModule.id,
    position: {
      x: adjustedPosition.x,
      y: furnitureStartY + height / 2 + 1,
      z: furnitureZ + depth / 2 + 0.5
    }
  });

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
          setIsHovered(true);
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
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
          <>
            <BoxModule 
              viewMode={viewMode}
              renderMode={renderMode}
              moduleData={{
                ...actualModuleData,
                dimensions: {
                  ...actualModuleData.dimensions,
                  width: furnitureWidthMm
                }
              }}
              isDragging={isDraggingThis}
              isEditMode={isEditMode}
              color={(isDraggingThis || isEditMode) ? getThemeColor() : undefined}
              internalHeight={furnitureHeightMm}
              hasDoor={isDraggingThis ? false : (slotInfo && slotInfo.hasColumn ? false : (placedModule.hasDoor ?? actualModuleData.hasDoor ?? false))}
              customDepth={actualDepthMm}
              hingePosition={optimalHingePosition}
              spaceInfo={spaceInfo}
              originalSlotWidth={originalSlotWidthMm}
              slotCenterX={0}
              adjustedWidth={furnitureWidthMm}
            />
          </>
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
                  color={isDraggingThis || isEditMode ? getThemeColor() : '#cccccc'}
                  clearcoat={0.1}
                  clearcoatRoughness={0.8}
                  metalness={0.0}
                  roughness={0.7}
                  reflectivity={0.2}
                  transparent={isDraggingThis || isEditMode}
                  opacity={isDraggingThis ? 0.6 : (isEditMode ? 0.2 : 1.0)}
                  depthWrite={isEditMode ? false : true}
                  emissive={isEditMode ? getThemeColor() : undefined}
                  emissiveIntensity={isEditMode ? 0.1 : 0}
                />
              )}
            </mesh>
            <Edges 
              color={isDraggingThis || isEditMode ? getThemeColor() : isDragMode ? '#ff0000' : (theme?.mode === 'dark' ? '#ffffff' : '#cccccc')} 
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
                  // 테마 색상을 16진수에서 RGBA로 변환
                  const themeColor = getThemeColor();
                  const r = parseInt(themeColor.slice(1, 3), 16);
                  const g = parseInt(themeColor.slice(3, 5), 16);
                  const b = parseInt(themeColor.slice(5, 7), 16);
                  context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
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
            furnitureStartY + height / 2, // 가구 중심과 동일한 Y 위치 (DoorModule 내부 계산과 맞춤)
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
            moduleData={{ ...actualModuleData, id: placedModule.id }} // ID 추가
            isDragging={isDraggingThis}
            isEditMode={isEditMode}
          />
        </group>
      )}

      {/* 도어는 BoxModule 내부에서 렌더링하도록 변경 */}
      
      {/* 3D 모드에서 편집 아이콘 표시 */}
      {viewMode === '3D' && (
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