import React from 'react';
import { useThree } from '@react-three/fiber';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store';
import { useSlotOccupancy } from './useSlotOccupancy';
import { useDropPositioning } from './useDropPositioning';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import { isSlotAvailable } from '../../utils/slotAvailability';
import { useAlert } from '@/hooks/useAlert';
import { analyzeColumnSlots, calculateFurnitureBounds } from '../../utils/columnSlotProcessor';

export const useFurnitureDragHandlers = (spaceInfo: SpaceInfo) => {
  const addModule = useFurnitureStore(state => state.addModule);
  const placedModules = useFurnitureStore(state => state.placedModules);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { checkSlotOccupancy } = useSlotOccupancy(spaceInfo);
  const { calculateDropPosition, findAvailableSlot } = useDropPositioning(spaceInfo);
  const { showAlert, AlertComponent } = useAlert();
  
  // Three.js 컨텍스트 접근 (그림자 업데이트용)
  const { gl, invalidate } = useThree();

  // 기본 가구 깊이 계산 (가구별 defaultDepth 우선, 없으면 fallback)
  const getDefaultDepth = (moduleData?: ModuleData) => {
    if (moduleData?.defaultDepth) {
      return Math.min(moduleData.defaultDepth, spaceInfo.depth);
    }
    
    // 기존 fallback 로직
    const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
    return Math.min(spaceBasedDepth, 580);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = () => {
    // 드래그 리브 처리
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    try {
      const dragDataString = e.dataTransfer.getData('application/json');
      if (!dragDataString) return;
      
      const currentDragData = JSON.parse(dragDataString);
      
      if (currentDragData && currentDragData.type === 'furniture') {
        // 특수 듀얼 가구 체크 (바지걸이장, 스타일러장)
        const isSpecialDualFurniture = currentDragData.moduleData.id.includes('dual-2drawer-styler-') || 
                                     currentDragData.moduleData.id.includes('dual-4drawer-pantshanger-');
        
        const indexing = calculateSpaceIndexing(spaceInfo);
        
        // 특수 듀얼 가구이고 슬롯폭이 550mm 미만인 경우 - 콘솔 로그만 출력
        if (isSpecialDualFurniture && indexing.columnWidth < 550) {
          console.log('⚠️ 특수 듀얼 가구는 550mm 이상 슬롯에만 배치 가능');
          setFurniturePlacementMode(false);
          return;
        }
        
        // 드롭 위치 계산
        const dropPosition = calculateDropPosition(e, currentDragData);
        if (!dropPosition) return;
        
        // 듀얼 가구 여부를 모듈 ID로 정확히 판단하고 dropPosition에도 반영
        const isDualFurniture = currentDragData.moduleData.id.includes('dual-');
        dropPosition.isDualFurniture = isDualFurniture; // dropPosition 업데이트
        
        // 노서라운드 엔드패널 슬롯에 듀얼 가구 배치 체크
        if (spaceInfo.surroundType === 'no-surround') {
          console.log('🔍 노서라운드 모드 체크:', {
            isDualFurniture,
            moduleId: currentDragData.moduleData.id,
            dropColumn: dropPosition.column,
            columnCount: indexing.columnCount
          });
          
          if (isDualFurniture) {
            const isFirstSlot = dropPosition.column === 0;
            const isLastSlot = dropPosition.column >= indexing.columnCount - 2; // 듀얼은 2슬롯 차지
            
            console.log('🔍 슬롯 위치 체크:', {
              isFirstSlot,
              isLastSlot,
              dropColumn: dropPosition.column,
              columnCount: indexing.columnCount
            });
            
            // 엔드패널이 있는 슬롯인지 확인
            const hasLeftEndPanel = isFirstSlot && (spaceInfo.installType === 'freestanding' || 
                                   (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right));
            const hasRightEndPanel = isLastSlot && (spaceInfo.installType === 'freestanding' || 
                                    (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left));
            
            console.log('🔍 엔드패널 체크:', {
              hasLeftEndPanel,
              hasRightEndPanel,
              installType: spaceInfo.installType,
              wallConfig: spaceInfo.wallConfig
            });
            
            if (hasLeftEndPanel || hasRightEndPanel) {
              console.log('✅ 엔드패널 구간 듀얼 가구 배치 허용');
              // 엔드패널 구간의 듀얼 가구는 customWidth 설정
              const slotWidths = indexing.slotWidths || [];
              if (dropPosition.targetSlotIndex < slotWidths.length - 1) {
                const firstSlotWidth = slotWidths[dropPosition.targetSlotIndex];
                const secondSlotWidth = slotWidths[dropPosition.targetSlotIndex + 1];
                adjustedWidth = firstSlotWidth + secondSlotWidth;
                console.log('🎯 엔드패널 구간 듀얼 가구 customWidth:', adjustedWidth);
                
                // 듀얼 가구는 두 슬롯의 중앙에 위치해야 함
                // 위치 조정은 하지 않음 (기본 위치가 이미 올바름)
              }
            }
          }
        }

        let finalX = dropPosition.x;
        
        // 슬롯 사용 가능 여부 확인 - 기둥이 있어도 150mm 이상 공간이 있으면 배치 가능
        console.log('🎯 새 가구 배치 시도:', {
          moduleId: currentDragData.moduleData.id,
          targetSlot: dropPosition.column,
          isDual: dropPosition.isDualFurniture,
          existingModules: placedModules.map(m => ({ id: m.moduleId, slot: m.slotIndex }))
        });
        
        const isAvailable = isSlotAvailable(
          dropPosition.column,
          dropPosition.isDualFurniture,
          placedModules,
          spaceInfo,
          currentDragData.moduleData.id
        );
        
        // 사용 불가능하면 다음 사용 가능한 슬롯 찾기
        if (!isAvailable) {
          // isSlotAvailable을 사용하는 래퍼 함수
          const checkSlotWithColumn = (column: number, isDual: boolean) => {
            return !isSlotAvailable(column, isDual, placedModules, spaceInfo, currentDragData.moduleData.id);
          };
          
          const availableSlot = findAvailableSlot(
            dropPosition.column,
            dropPosition.isDualFurniture,
            indexing,
            checkSlotWithColumn,
            placedModules
          );
          
          if (!availableSlot) {
            return;
          }
          
          finalX = availableSlot.x;
        }
        
        // 고유 ID 생성
        const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // 가구 데이터 조회하여 기본 깊이 계산
        const internalSpace = calculateInternalSpace(spaceInfo);
        const moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
        const customDepth = getDefaultDepth(moduleData);
        
        // 기둥 슬롯 정보 확인
        const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
        const targetSlotInfo = columnSlots[dropPosition.column];
        
        let adjustedWidth: number | undefined = undefined;
        const adjustedPosition = { x: finalX, y: 0, z: 0 };
        let adjustedDepth = customDepth;
        
        // 디버그 로그 추가
        console.log('🔍 가구 배치 전 기둥 슬롯 정보:', {
          slotIndex: dropPosition.column,
          targetSlotInfo: targetSlotInfo ? {
            hasColumn: targetSlotInfo.hasColumn,
            columnType: targetSlotInfo.columnType,
            columnDepth: targetSlotInfo.column?.depth,
            columnWidth: targetSlotInfo.column?.width,
            availableWidth: targetSlotInfo.availableWidth
          } : 'No column info'
        });
        
        // 기둥이 있는 슬롯에 배치하는 경우
        if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
          const columnDepth = targetSlotInfo.column.depth;
          
          // Column C (300mm) 특별 처리
          if (targetSlotInfo.columnType === 'medium' && targetSlotInfo.allowMultipleFurniture && targetSlotInfo.subSlots) {
            console.log('🔵 Column C 슬롯에 듀얼 배치 처리:', {
              slotIndex: dropPosition.column,
              isDualFurniture: dropPosition.isDualFurniture,
              columnDepth,
              subSlots: targetSlotInfo.subSlots
            });
            
            // 듀얼 가구를 Column C 슬롯에 배치하는 경우 두 개의 싱글로 분할
            if (dropPosition.isDualFurniture) {
              // 왼쪽 싱글 캐비넷
              const leftModule = {
                id: `placed-left-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                moduleId: currentDragData.moduleData.id.replace('dual-', 'single-'),
                position: { 
                  x: targetSlotInfo.subSlots.left.center, 
                  y: 0, 
                  z: 0 
                },
                rotation: 0,
                slotIndex: dropPosition.column,
                subSlotPosition: 'left', // Column C 서브슬롯 위치
                isDualSlot: false,
                hasDoor: false,
                customDepth: getDefaultDepth(moduleData),
                adjustedWidth: targetSlotInfo.subSlots.left.availableWidth
              };
              
              // 오른쪽 싱글 캐비넷
              const rightModule = {
                id: `placed-right-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                moduleId: currentDragData.moduleData.id.replace('dual-', 'single-'),
                position: { 
                  x: targetSlotInfo.subSlots.right.center, 
                  y: 0, 
                  z: 0 
                },
                rotation: 0,
                slotIndex: dropPosition.column,
                subSlotPosition: 'right', // Column C 서브슬롯 위치
                isDualSlot: false,
                hasDoor: false,
                customDepth: getDefaultDepth(moduleData),
                adjustedWidth: targetSlotInfo.subSlots.right.availableWidth
              };
              
              // 두 개의 싱글 캐비넷 추가
              addModule(leftModule);
              addModule(rightModule);
              
              console.log('✅ Column C에 듀얼 가구를 2개의 싱글로 분할 배치:', {
                leftModule: leftModule.id,
                rightModule: rightModule.id,
                leftPosition: leftModule.position.x,
                rightPosition: rightModule.position.x
              });
              
              // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
              window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
              
              // 그림자 업데이트
              invalidate();
              if (gl && gl.shadowMap) {
                gl.shadowMap.needsUpdate = true;
              }
              
              setFurniturePlacementMode(false);
              return; // 추가 처리 방지
            }
            
            // 싱글 가구를 Column C 슬롯에 배치하는 경우
            // 빈 서브슬롯 찾기
            const existingModulesInSlot = placedModules.filter(m => 
              m.slotIndex === dropPosition.column
            );
            
            let targetSubSlot: 'left' | 'right' = 'left';
            if (existingModulesInSlot.some(m => m.subSlotPosition === 'left')) {
              targetSubSlot = 'right';
            }
            
            adjustedWidth = targetSlotInfo.subSlots[targetSubSlot].availableWidth;
            adjustedPosition.x = targetSlotInfo.subSlots[targetSubSlot].center;
            
            console.log('🔵 Column C에 싱글 가구 배치:', {
              targetSubSlot,
              adjustedWidth,
              adjustedPosition
            });
            
            // 새 모듈 배치 (아래에서 처리됨)
          } else {
            // 일반 기둥 처리 (기존 로직)
            // 엔드패널 구간에서 듀얼 가구 처리
            if (dropPosition.isDualFurniture && targetSlotInfo.column?.depth === 18) {
              // 엔드패널 구간의 듀얼 가구 - customWidth 설정
              const slotWidths = indexing.slotWidths || [];
              if (dropPosition.targetSlotIndex < slotWidths.length - 1) {
                adjustedWidth = slotWidths[dropPosition.targetSlotIndex] + slotWidths[dropPosition.targetSlotIndex + 1];
                console.log('🎯 엔드패널 구간 듀얼 가구 customWidth:', adjustedWidth);
              }
            } else if (dropPosition.isDualFurniture) {
              // 일반 기둥에는 듀얼 가구 배치 불가
              console.log('❌ 듀얼 가구는 일반 기둥 슬롯에 배치 불가');
              return;
            }
            
            // calculateFurnitureBounds를 사용하여 정확한 위치와 크기 계산
            const slotWidthM = indexing.columnWidth * 0.01;
            const originalSlotBounds = {
              left: finalX - slotWidthM / 2,
              right: finalX + slotWidthM / 2,
              center: finalX
            };
            
            const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
            
            // 크기와 위치 조정
            adjustedWidth = furnitureBounds.renderWidth;
            adjustedPosition.x = furnitureBounds.center;
            
            console.log('🎯 기둥 A 폭 조정 적용:', {
              originalWidth: indexing.columnWidth,
              adjustedWidth: adjustedWidth,
              furnitureBounds: furnitureBounds
            });
            
            // 공간이 부족한 경우 배치 취소
            if (adjustedWidth < 150) {
              console.log('❌ 기둥 슬롯에 공간 부족:', adjustedWidth, 'mm');
              return;
            }
            
            // Column C (300mm) 특별 처리 - 깊이 조정
            if (furnitureBounds.depthAdjustmentNeeded || (columnDepth === 300 && furnitureBounds.renderWidth === indexing.columnWidth)) {
              adjustedDepth = 730 - columnDepth; // 430mm
              console.log('🟣 Column C 깊이 조정:', adjustedDepth, 'mm');
            }
            
            console.log('🎯 기둥 슬롯 배치:', {
              slotIndex: dropPosition.column,
              columnDepth,
              originalWidth: indexing.columnWidth,
              adjustedWidth,
              adjustedPosition,
              adjustedDepth
            });
          }
        }
        
        // 노서라운드 엔드패널 슬롯 확인 - adjustedWidth 설정 제거
        // FurnitureItem에서 직접 처리하도록 변경
        const isNoSurroundEndSlot = spaceInfo.surroundType === 'no-surround' && 
          dropPosition.column !== undefined &&
          ((spaceInfo.installType === 'freestanding' && 
            (dropPosition.column === 0 || dropPosition.column === indexing.columnCount - 1)) ||
           (spaceInfo.installType === 'semistanding' && 
            ((spaceInfo.wallConfig?.left && dropPosition.column === indexing.columnCount - 1) || 
             (spaceInfo.wallConfig?.right && dropPosition.column === 0))));
        
        if (isNoSurroundEndSlot) {
          console.log('🎯 노서라운드 엔드패널 슬롯 감지:', {
            슬롯인덱스: dropPosition.column,
            설명: 'FurnitureItem에서 자동으로 18mm 감소 처리'
          });
        }
        
        // 새 모듈 배치
        const newModuleData: any = {
          id: placedId,
          moduleId: currentDragData.moduleData.id,
          baseModuleType: currentDragData.moduleData.id.replace(/-\d+$/, ''), // 너비를 제외한 기본 타입
          moduleWidth: currentDragData.moduleData.dimensions.width, // 실제 모듈 너비 저장
          position: adjustedPosition,
          rotation: 0,
          slotIndex: dropPosition.column, // 슬롯 인덱스 저장
          isDualSlot: dropPosition.isDualFurniture, // 듀얼 슬롯 여부 저장
          hasDoor: false, // 배치 시 항상 도어 없음 (오픈형)
          customDepth: adjustedDepth, // 기둥에 따른 깊이 조정
          adjustedWidth: adjustedWidth // 기둥에 따른 폭 조정 또는 노서라운드 엔드패널 슬롯 너비
        };
        
        // Column C의 경우 서브슬롯 위치 추가
        if (targetSlotInfo && targetSlotInfo.columnType === 'medium' && targetSlotInfo.allowMultipleFurniture) {
          // 이미 Column C 처리 로직에서 서브슬롯이 설정된 경우
          const existingModulesInSlot = placedModules.filter(m => 
            m.slotIndex === dropPosition.column
          );
          
          if (existingModulesInSlot.some(m => m.subSlotPosition === 'left')) {
            newModuleData.subSlotPosition = 'right';
          } else {
            newModuleData.subSlotPosition = 'left';
          }
        }
        
        const newModule = newModuleData;
        
        addModule(newModule);
        
        // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
        window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
        
        // 가구 배치 후 그림자 업데이트 (강화된 접근)
        invalidate();
        
        // 3D 모드에서 그림자 강제 업데이트
        if (gl && gl.shadowMap) {
          gl.shadowMap.needsUpdate = true;
          
          // 여러 프레임에 걸쳐 강제 업데이트 (React 렌더링 완료 보장)
          requestAnimationFrame(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
              
              requestAnimationFrame(() => {
                if (gl && gl.shadowMap) {
                  gl.shadowMap.needsUpdate = true;
                  invalidate();
                  
                  // 추가 3번째 프레임에서도 업데이트 (완전한 렌더링 보장)
                  requestAnimationFrame(() => {
                    if (gl && gl.shadowMap) {
                      gl.shadowMap.needsUpdate = true;
                      invalidate();
                    }
                  });
                }
              });
            }
          });
          
          // 추가 타이머 기반 업데이트 (완전한 렌더링 보장)
          setTimeout(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
            }
          }, 100);
          
          setTimeout(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
            }
          }, 300);
          
          // 추가 지연 업데이트 (완전한 보장)
          setTimeout(() => {
            if (gl && gl.shadowMap) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
            }
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
    
    setFurniturePlacementMode(false);
  };

  return {
    handleDragOver,
    handleDragLeave,
    handleDrop,
    AlertComponent
  };
}; 