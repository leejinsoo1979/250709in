import { useState, useCallback, useEffect } from 'react';
import { PlacedModule } from '../types';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, findSlotIndexFromPosition } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';
import { ColumnIndexer } from '@/editor/shared/utils/indexing';

interface UseFurnitureSpaceAdapterProps {
  setPlacedModules: React.Dispatch<React.SetStateAction<PlacedModule[]>>;
}

export const useFurnitureSpaceAdapter = ({ setPlacedModules }: UseFurnitureSpaceAdapterProps) => {
  // 공간 변경 모드 상태 관리
  const [spaceChangeMode, setSpaceChangeMode] = useState<boolean>(false);



  // 새로운 공간에 맞게 가구 업데이트 함수 (간단한 버전)
  const updateFurnitureForNewSpace = useCallback((oldSpaceInfo: SpaceInfo, newSpaceInfo: SpaceInfo) => {
    console.log('🚨🚨🚨 [SPACE ADAPTER] updateFurnitureForNewSpace 호출됨 - 설치타입 변경:', {
      oldInstallType: oldSpaceInfo.installType,
      newInstallType: newSpaceInfo.installType,
      oldSurroundType: oldSpaceInfo.surroundType,
      newSurroundType: newSpaceInfo.surroundType,
      oldWidth: oldSpaceInfo.width,
      newWidth: newSpaceInfo.width,
      oldColumnCount: oldSpaceInfo.customColumnCount,
      newColumnCount: newSpaceInfo.customColumnCount,
      '중요': '컬럼수가 동일해도 설치타입 변경시 내부 공간이 달라짐'
    });
    console.trace('🚨 [TRACE] updateFurnitureForNewSpace 호출 스택');
    setPlacedModules(currentModules => {
      console.log('🚨🚨🚨 [SPACE ADAPTER] setPlacedModules 시작:', {
        currentModulesCount: currentModules.length,
        currentModules: currentModules.map(m => ({
          id: m.id,
          moduleId: m.moduleId,
          slotIndex: m.slotIndex,
          position: m.position,
          isValidInCurrentSpace: m.isValidInCurrentSpace
        }))
      });
      
      if (currentModules.length === 0) return currentModules;
      
      const oldIndexing = calculateSpaceIndexing(oldSpaceInfo);
      const newIndexing = calculateSpaceIndexing(newSpaceInfo);
      
      // 세미스탠딩에서 벽 위치만 변경된 경우 감지
      const isOnlyWallPositionChange = 
        oldSpaceInfo.installType === 'semistanding' && 
        newSpaceInfo.installType === 'semistanding' &&
        oldSpaceInfo.width === newSpaceInfo.width &&
        oldSpaceInfo.wallConfig?.left !== newSpaceInfo.wallConfig?.left &&
        oldIndexing.columnWidth === newIndexing.columnWidth;
      
      if (isOnlyWallPositionChange) {
        console.log('🔄 세미스탠딩 벽 위치만 변경됨 - 가구 너비는 유지하되 위치는 재계산 필요');
        // 벽 위치 변경 시에도 듀얼 가구의 경우 엔드패널 정렬이 달라질 수 있으므로
        // 전체 가구 위치를 재계산해야 함
        // return currentModules; // 이 부분을 제거하여 아래 로직이 실행되도록 함
      }
      
      // 컬럼 변경이 있을 때만 로그 출력
      // 컬럼 수와 너비 변화 상세 확인
      console.log('🔍 인덱싱 변화 상세:', {
        oldColumnCount: oldIndexing.columnCount,
        newColumnCount: newIndexing.columnCount,
        컬럼수동일: oldIndexing.columnCount === newIndexing.columnCount,
        oldColumnWidth: oldIndexing.columnWidth,
        newColumnWidth: newIndexing.columnWidth,
        컬럼너비동일: oldIndexing.columnWidth === newIndexing.columnWidth,
        설치타입변경: `${oldSpaceInfo.installType} → ${newSpaceInfo.installType}`,
        중요: '컬럼수가 동일해도 내부 위치는 변경될 수 있음'
      });
      
      const updatedModules: PlacedModule[] = [];
      
      // 중요: 설치타입이 변경되어도 가구를 모두 보존해야 함!
      console.log('🔴🔴🔴 가구 업데이트 전 상태:', {
        '설치타입변경': `${oldSpaceInfo.installType} → ${newSpaceInfo.installType}`,
        '전체가구수': currentModules.length,
        '각가구정보': currentModules.map(m => ({
          id: m.id,
          moduleId: m.moduleId,
          slotIndex: m.slotIndex,
          position: m.position?.x,
          isValid: m.isValidInCurrentSpace
        }))
      });
      
      // 우측 가구를 먼저 처리하기 위해 슬롯 인덱스 기준으로 내림차순 정렬
      const sortedModules = [...currentModules].sort((a, b) => {
        const aSlot = a.slotIndex ?? 0;
        const bSlot = b.slotIndex ?? 0;
        return bSlot - aSlot; // 내림차순 (큰 슬롯 인덱스부터)
      });
      
      console.log('🔄 가구 정렬 완료:', {
        originalOrder: currentModules.map(m => ({ id: m.id, slot: m.slotIndex })),
        sortedOrder: sortedModules.map(m => ({ id: m.id, slot: m.slotIndex })),
        설명: '우측 가구부터 처리하여 공간 축소시 좌측으로 압축'
      });
      
      sortedModules.forEach(module => {
        // 가구가 이미 zone 정보를 가지고 있는 경우 해당 영역 내에서만 처리
        if (module.zone && newSpaceInfo.droppedCeiling?.enabled) {
          console.log('🔍 Zone 가구 처리 시작:', {
            moduleId: module.moduleId,
            zone: module.zone,
            customWidth: module.customWidth,
            isDualSlot: module.isDualSlot
          });
          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(newSpaceInfo, newSpaceInfo.customColumnCount);
          
          if (!zoneInfo.dropped && module.zone === 'dropped') {
            // 단내림이 제거된 경우 단내림 영역 가구를 일반 영역으로 이동
            console.log('⚠️ 단내림 제거됨 - 가구를 일반 영역으로 이동:', module.moduleId);
            module.zone = 'normal';
            // return 제거 - 계속 처리
          }
          
          // 영역별 처리
          const targetZone = module.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
          const zoneSpaceInfo = {
            ...newSpaceInfo,
            width: targetZone.width,
            customColumnCount: targetZone.columnCount
          };
          const zoneInternalSpace = {
            ...calculateInternalSpace(newSpaceInfo),
            width: targetZone.width,
            startX: targetZone.startX
          };
          
          // 영역별 모듈 데이터 가져오기
          const moduleData = getModuleById(module.moduleId, zoneInternalSpace, zoneSpaceInfo);
          if (!moduleData) {
            updatedModules.push({
              ...module,
              isValidInCurrentSpace: false
            });
            return;
          }
          
          // 영역 내에서 위치 재계산
          let slotIndex = module.slotIndex || 0;
          if (slotIndex >= targetZone.columnCount) {
            // 슬롯 범위 초과시 마지막 슬롯으로 이동
            console.log('⚠️ Zone 슬롯 범위 초과 - 마지막 슬롯으로 이동:', {
              moduleId: module.moduleId,
              원래슬롯: slotIndex,
              최대슬롯: targetZone.columnCount - 1
            });
            slotIndex = targetZone.columnCount - 1;
            // return 제거 - 계속 처리
          }
          
          const isDual = module.moduleId.startsWith('dual-');
          const newX = targetZone.startX + (slotIndex * targetZone.columnWidth) + 
                      (isDual ? targetZone.columnWidth : targetZone.columnWidth / 2);
          
          // 영역에 맞는 새로운 moduleId 생성
          // 모듈 타입(single/dual)을 유지하면서 새로운 너비로 업데이트
          const baseType = module.moduleId.replace(/-\d+$/, '');
          const newModuleId = `${baseType}-${targetZone.columnWidth * (isDual ? 2 : 1)}`;
          
          console.log('🔄 Zone 가구 업데이트:', {
            originalModuleId: module.moduleId,
            baseType,
            isDual,
            zone: module.zone,
            targetZone: targetZone,
            slotIndex,
            newX: newX * 0.01,
            newModuleId,
            oldWidth: module.customWidth || module.adjustedWidth,
            newWidth: targetZone.columnWidth * (isDual ? 2 : 1),
            targetZoneSlotWidths: targetZone.slotWidths
          });
          
          updatedModules.push({
            ...module,
            moduleId: newModuleId,
            position: { ...module.position, x: newX * 0.01 }, // mm to Three.js units
            isValidInCurrentSpace: true,
            adjustedWidth: undefined, // 공간 변경 시 초기화 - indexing.slotWidths 사용하도록
            customWidth: undefined, // 공간 변경 시 초기화 - indexing.slotWidths 사용하도록
            isDualSlot: isDual
          });
          return;
        }
        
        // zone 정보가 없는 기존 가구들을 위한 폴백 로직
        const oldInternalSpace = calculateInternalSpace(oldSpaceInfo);
        const moduleData = getModuleById(module.moduleId, oldInternalSpace, oldSpaceInfo);
        
        let slotIndex: number | undefined = module.slotIndex;
        
        // slotIndex가 없는 경우에만 위치에서 계산 (하위 호환성)
        if (slotIndex === undefined && moduleData) {
          const isDualFurniture = Math.abs(moduleData.dimensions.width - (oldIndexing.columnWidth * 2)) < 50;
          slotIndex = findSlotIndexFromPosition(module.position, oldIndexing, isDualFurniture);
        }
        
        if (slotIndex === undefined || slotIndex < 0) {
          // 슬롯을 찾을 수 없으면 첫 번째 슬롯에 배치
          console.log('⚠️ 슬롯 인덱스 없음 - 첫 번째 슬롯으로 이동:', module.moduleId);
          slotIndex = 0;
          // return 제거 - 계속 처리
        }
        
        // 새로운 moduleId 계산 (동적 모듈의 경우 숫자 부분을 새로운 컬럼 폭으로 교체)
        let newModuleId = module.moduleId;
        let isDualModule = false;
        
        // 듀얼 모듈 패턴 처리 (숫자가 컬럼폭*2인 경우)
        const dualPatterns = [
          /^dual-([^-]+(?:-[^-]+)*)-(\d+)$/,  // dual-open-1200, dual-hang-shelf2-1200 등 (하이픈 포함)
        ];
        
        for (const pattern of dualPatterns) {
          const match = module.moduleId.match(pattern);
          if (match) {
            const oldWidth = parseInt(match[2]); // 두 번째 캡처 그룹이 숫자
            // 듀얼 모듈인지 확인 (기존 폭이 컬럼폭*2와 유사한지)
            if (Math.abs(oldWidth - (oldIndexing.columnWidth * 2)) < 50) {
              newModuleId = module.moduleId.replace(pattern, `dual-$1-${newIndexing.columnWidth * 2}`);
              isDualModule = true;
              break;
            }
          }
        }
        
        // 싱글 모듈 패턴 처리 (듀얼이 아닌 경우)
        if (!isDualModule) {
          const singlePatterns = [
            /^single-([^-]+(?:-[^-]+)*)-(\d+)$/,  // single-open-600, single-hang-shelf2-600 등 (하이픈 포함)
          ];
          
          let patternMatched = false;
          for (const pattern of singlePatterns) {
            const match = module.moduleId.match(pattern);
            if (match) {
              newModuleId = module.moduleId.replace(pattern, `single-$1-${newIndexing.columnWidth}`);
              patternMatched = true;
              break;
            }
          }
          
          // 패턴 매칭 실패 시 기본 패턴으로 폴백
          if (!patternMatched) {
            newModuleId = `single-open-${newIndexing.columnWidth}`;
          }
        }
        
        // 새 공간에서 슬롯이 유효한지 확인
        console.log('📍 슬롯 검증:', {
          moduleId: module.moduleId,
          slotIndex,
          newColumnCount: newIndexing.columnCount,
          유효함: slotIndex < newIndexing.columnCount,
          isDualModule
        });
        
        if (slotIndex >= newIndexing.columnCount) {
          console.log('⚠️ 슬롯 범위 초과 감지:', {
            moduleId: module.moduleId,
            originalSlot: slotIndex,
            maxSlot: newIndexing.columnCount - 1,
            isDualModule,
            설명: '공간 축소로 인한 슬롯 범위 초과'
          });
          
          // 슬롯 범위 초과 시 가능한 한 오른쪽에 유지
          let foundSlot = null;
          
          // 1. 먼저 가능한 가장 오른쪽 슬롯 시도
          const maxPossibleSlot = newIndexing.columnCount - (isDualModule ? 2 : 1);
          if (maxPossibleSlot >= 0) {
            // 가장 오른쪽 슬롯이 비어있는지 확인
            if (isSlotAvailable(maxPossibleSlot, isDualModule, updatedModules, newSpaceInfo, module.moduleId, module.id)) {
              foundSlot = maxPossibleSlot;
              console.log('✅ 가장 오른쪽 슬롯 사용:', foundSlot);
            } else {
              // 오른쪽에서 왼쪽으로 빈 슬롯 찾기
              for (let i = maxPossibleSlot - 1; i >= 0; i--) {
                if (isSlotAvailable(i, isDualModule, updatedModules, newSpaceInfo, module.moduleId, module.id)) {
                  foundSlot = i;
                  console.log('✅ 빈 슬롯 찾음 (우->좌 탐색):', foundSlot);
                  break;
                }
              }
            }
          }
          
          if (foundSlot !== null) {
            slotIndex = foundSlot;
            console.log('✅ 슬롯 재배치 성공:', {
              moduleId: module.moduleId,
              originalSlot: module.slotIndex,
              newSlot: foundSlot,
              설명: '범위 초과 가구를 유효한 슬롯으로 이동'
            });
          } else if (isDualModule && newIndexing.columnCount > 0) {
            // 듀얼 가구인데 배치할 곳이 없으면 싱글로 변환 시도
            isDualModule = false;
            newModuleId = newModuleId.replace(/^dual-/, 'single-').replace(/-(\d+)$/, `-${newIndexing.columnWidth}`);
            
            // 싱글로 변환 후 다시 빈 슬롯 찾기
            for (let i = newIndexing.columnCount - 1; i >= 0; i--) {
              if (isSlotAvailable(i, false, updatedModules, newSpaceInfo, module.moduleId, module.id)) {
                foundSlot = i;
                break;
              }
            }
            
            if (foundSlot !== null) {
              slotIndex = foundSlot;
              console.log('✅ 듀얼→싱글 변환 후 배치:', {
                originalModuleId: module.moduleId,
                newModuleId,
                newSlot: foundSlot
              });
            } else {
              // 그래도 배치할 곳이 없으면 가장 오른쪽 슬롯에 강제 배치
              slotIndex = newIndexing.columnCount - 1;
              console.log('⚠️ 강제 배치 (마지막 슬롯):', {
                moduleId: newModuleId,
                slotIndex
              });
            }
          } else if (newIndexing.columnCount > 0) {
            // 싱글 가구인 경우 빈 슬롯이 없으면 가장 오른쪽에 강제 배치
            slotIndex = newIndexing.columnCount - 1;
            console.log('⚠️ 싱글 가구 강제 배치 (마지막 슬롯):', {
              moduleId: module.moduleId,
              slotIndex
            });
          } else {
            // 정말로 배치할 공간이 없는 경우만 제거
            console.log('❌ 배치할 공간 없음 - 가구 제거:', {
              moduleId: module.moduleId,
              newColumnCount: newIndexing.columnCount
            });
            return; // 공간이 없으면 가구 제거가 맞음
          }
        }
        
        // 듀얼 가구의 경우 추가 검증: 다음 슬롯도 유효해야 함
        // zone이 있는 경우 해당 zone의 columnCount 확인
        let maxColumnCount = newIndexing.columnCount;
        if (module.zone && newSpaceInfo.droppedCeiling?.enabled) {
          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(newSpaceInfo, newSpaceInfo.customColumnCount);
          if (module.zone === 'dropped' && zoneInfo.dropped) {
            maxColumnCount = zoneInfo.dropped.columnCount;
          } else if (module.zone === 'normal') {
            maxColumnCount = zoneInfo.normal.columnCount;
          }
        }
        
        if (isDualModule && (slotIndex + 1) >= maxColumnCount) {
          // 듀얼 가구를 싱글로 변환 시도
          newModuleId = newModuleId.replace(/^dual-/, 'single-').replace(/-(\d+)$/, `-${newIndexing.columnWidth}`);
          isDualModule = false;
        }
        
        // 충돌 검사 및 슬롯 재배치
        if (!isSlotAvailable(slotIndex, isDualModule, updatedModules, newSpaceInfo, module.moduleId, module.id)) {
          // 오른쪽으로 빈 슬롯 찾기
          let newSlot = findNextAvailableSlot(slotIndex, 'right', isDualModule, updatedModules, newSpaceInfo, module.moduleId, module.id);
          
          // 오른쪽에 없으면 왼쪽으로 찾기
          if (newSlot === null) {
            newSlot = findNextAvailableSlot(slotIndex, 'left', isDualModule, updatedModules, newSpaceInfo, module.moduleId, module.id);
          }
          
          if (newSlot !== null) {
            slotIndex = newSlot;
            console.log('⚠️ 충돌 회피 - 새 슬롯으로 이동:', {
              moduleId: module.moduleId,
              originalSlot: module.slotIndex,
              newSlot: slotIndex
            });
          } else {
            // 듀얼 가구인데 배치할 곳이 없으면 싱글로 변환 시도
            if (isDualModule) {
              isDualModule = false;
              newModuleId = newModuleId.replace(/^dual-/, 'single-').replace(/-(\d+)$/, `-${newIndexing.columnWidth}`);
              
              // 싱글로 변환 후 다시 빈 슬롯 찾기
              newSlot = findNextAvailableSlot(slotIndex, 'right', false, updatedModules, newSpaceInfo, module.moduleId, module.id);
              if (newSlot === null) {
                newSlot = findNextAvailableSlot(slotIndex, 'left', false, updatedModules, newSpaceInfo, module.moduleId, module.id);
              }
              
              if (newSlot !== null) {
                slotIndex = newSlot;
                console.log('⚠️ 듀얼→싱글 변환 후 배치:', {
                  originalModuleId: module.moduleId,
                  newModuleId,
                  slotIndex
                });
              } else {
                // 충돌 회피 실패해도 가구 보존 (현재 슬롯 유지)
                console.log('⚠️ 충돌 회피 실패 - 현재 슬롯 유지:', {
                  moduleId: module.moduleId,
                  slotIndex
                });
                // return 제거 - 계속 처리하여 가구 보존
              }
            } else {
              // 싱글 가구인데 배치할 곳이 없어도 보존
              console.log('⚠️ 싱글 가구 충돌 회피 실패 - 현재 슬롯 유지:', {
                moduleId: module.moduleId,
                slotIndex
              });
              // return 제거 - 계속 처리하여 가구 보존
            }
          }
        }

        // 새로운 위치 계산
        let newX: number;
        let zone: 'normal' | 'dropped' = 'normal';
        let customWidth: number | undefined;
        
        // 단내림 활성화 시 영역 확인
        if (newSpaceInfo.droppedCeiling?.enabled && newIndexing.zones) {
          // 현재 슬롯의 영역 확인
          const moduleX = newIndexing.threeUnitPositions[slotIndex] * 1000; // Three.js units to mm
          const zoneInfo = ColumnIndexer.findZoneAndSlotFromPosition(
            { x: moduleX },
            newSpaceInfo,
            newIndexing
          );
          
          if (zoneInfo) {
            zone = zoneInfo.zone;
            const zoneSlots = zone === 'dropped' && newIndexing.zones.dropped
              ? newIndexing.zones.dropped
              : newIndexing.zones.normal;
            
            // 영역별 위치 계산
            const slotCenterX = zoneSlots.startX + (zoneInfo.slotIndex * zoneSlots.columnWidth) + (zoneSlots.columnWidth / 2);
            newX = slotCenterX * 0.001; // mm to Three.js units
            
            // 단내림 영역의 경우 커스텀 너비 설정
            if (zone === 'dropped') {
              customWidth = zoneSlots.columnWidth;
            }
          } else {
            // 영역을 찾을 수 없는 경우 기본값 사용
            newX = isDualModule && newIndexing.threeUnitDualPositions
              ? newIndexing.threeUnitDualPositions[slotIndex]
              : newIndexing.threeUnitPositions[slotIndex];
          }
        } else {
          // 단내림 비활성화 시 기존 로직
          if (isDualModule && newIndexing.threeUnitDualPositions) {
            // 듀얼 가구: 듀얼 위치 배열 사용
            newX = newIndexing.threeUnitDualPositions[slotIndex];
            
            // 노서라운드 모드에서 엔드패널 슬롯의 듀얼 가구는 위치 조정이 필요함
            // FurnitureItem에서도 동일한 조정을 적용하므로 여기서 미리 적용
            if (newSpaceInfo.surroundType === 'no-surround') {
              const isLastSlotForDual = slotIndex === newIndexing.columnCount - 2;
              
              if (slotIndex === 0 && 
                  (newSpaceInfo.installType === 'freestanding' || 
                   (newSpaceInfo.installType === 'semistanding' && newSpaceInfo.wallConfig?.right))) {
                // 첫 번째 슬롯: 우측으로 엔드패널 두께의 절반만큼 이동 (좌측 엔드패널 정렬)
                // FurnitureItem에서도 동일한 조정이 적용되므로 여기서는 적용하지 않음
                console.log('🔄 듀얼 가구 첫번째 슬롯 (공간 변경) - FurnitureItem에서 엔드패널 조정 예정');
              } else if (isLastSlotForDual && 
                        (newSpaceInfo.installType === 'freestanding' || 
                         (newSpaceInfo.installType === 'semistanding' && newSpaceInfo.wallConfig?.left))) {
                // 마지막 슬롯: 좌측으로 엔드패널 두께의 절반만큼 이동 (우측 엔드패널 정렬)
                // FurnitureItem에서도 동일한 조정이 적용되므로 여기서는 적용하지 않음
                console.log('🔄 듀얼 가구 마지막 슬롯 (공간 변경) - FurnitureItem에서 엔드패널 조정 예정');
              }
            }
            
            console.log('🔄 듀얼 가구 위치 (공간 변경):', {
              slotIndex,
              newX,
              surroundType: newSpaceInfo.surroundType,
              installType: newSpaceInfo.installType,
              wallConfig: newSpaceInfo.wallConfig,
              설명: '기본 경계 위치 사용 (FurnitureItem에서 엔드패널 조정 적용)'
            });
          } else {
            // 싱글 가구: 일반 위치 배열 사용
            newX = newIndexing.threeUnitPositions[slotIndex];
          }
        }
        
        // 실제 가구 너비 계산 - 슬롯에 맞는 너비 사용
        let newCustomWidth: number | undefined;
        
        // 서라운드 모드에서만 customWidth 계산
        if (newSpaceInfo.surroundType === 'surround') {
          // slotWidths가 있으면 사용
          if (newIndexing.slotWidths && newIndexing.slotWidths[slotIndex] !== undefined) {
            if (isDualModule && slotIndex + 1 < newIndexing.slotWidths.length) {
              // 듀얼 가구: 두 슬롯의 너비 합
              newCustomWidth = newIndexing.slotWidths[slotIndex] + newIndexing.slotWidths[slotIndex + 1];
            } else {
              // 싱글 가구: 해당 슬롯의 너비
              newCustomWidth = newIndexing.slotWidths[slotIndex];
            }
          } else if (zone === 'dropped' && customWidth) {
            // 단내림 영역은 이미 계산된 customWidth 사용
            newCustomWidth = customWidth;
          }
        }
        // 노서라운드 모드에서는 customWidth를 undefined로 설정
        
        updatedModules.push({
          ...module,
          moduleId: newModuleId,
          position: { ...module.position, x: newX },
          slotIndex,
          isDualSlot: newModuleId.includes('dual'),
          isValidInCurrentSpace: true,
          zone,
          customWidth: newCustomWidth,
          adjustedWidth: undefined // adjustedWidth는 FurnitureItem에서 다시 계산됨
        });
      });
      
      // 전체적인 안전장치: 모든 가구 보존
      console.log('🔴🔴🔴 [SPACE ADAPTER] 업데이트 완료 - 가구 보존 확인:', {
        '원래가구수': currentModules.length,
        '업데이트된가구수': updatedModules.length,
        '가구손실': currentModules.length - updatedModules.length,
        '문제': currentModules.length !== updatedModules.length ? '⚠️ 가구가 사라졌음!' : '✅ 모든 가구 보존됨',
        '업데이트된가구': updatedModules.map(m => ({
          id: m.id,
          moduleId: m.moduleId,
          slotIndex: m.slotIndex,
          positionX: m.position?.x,
          isValid: m.isValidInCurrentSpace,
          zone: m.zone
        })),
        '사라진가구': currentModules.filter(cm => 
          !updatedModules.find(um => um.id === cm.id)
        ).map(m => ({
          id: m.id,
          moduleId: m.moduleId,
          slotIndex: m.slotIndex,
          이유: 'return으로 인한 스킵'
        }))
      });
      
      // 가구가 사라지면 경고!
      if (currentModules.length !== updatedModules.length) {
        console.error('🔥🔥🔥 가구가 사라졌습니다! 이것은 버그입니다!', {
          사라진개수: currentModules.length - updatedModules.length
        });
      }
      
      return updatedModules;
    });
  }, [setPlacedModules]);

  return {
    spaceChangeMode,
    setSpaceChangeMode,
    updateFurnitureForNewSpace
  };
}; 