import React, { useState, useEffect, useCallback } from 'react';
import { useSpaceConfigStore, FURNITURE_LIMITS } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { getModuleById, buildModuleDataFromPlacedModule, ModuleData } from '@/data/modules';
import { calculateInternalSpace, calculateTopBottomFrameHeight, calculateBaseFrameHeight } from '../../viewer3d/utils/geometry';
import { analyzeColumnSlots } from '../../utils/columnSlotProcessor';
import { calculateSpaceIndexing } from '../../utils/indexing';
import { useTranslation } from '@/i18n/useTranslation';
import { calculatePanelDetails, calculateSurroundPanels } from '@/editor/shared/utils/calculatePanelDetails';
import { getDefaultGrainDirection } from '@/editor/shared/utils/materialConstants';
import { isCustomizableModuleId, getCustomDimensionKey, getStandardDimensionKey } from './CustomizableFurnitureLibrary';
import { calcResizedPositionX } from '@/editor/shared/utils/freePlacementUtils';
import { SURROUND_PANEL_THICKNESS } from '@/data/modules/surroundPanels';
import styles from './PlacedModulePropertiesPanel.module.css';

// 가구 썸네일 이미지 경로
const getImagePath = (filename: string) => {
  return `${import.meta.env.BASE_URL}images/furniture-thumbnails/${filename}`;
};

const FURNITURE_ICONS: Record<string, string> = {
  'single-2drawer-hanging': getImagePath('single-2drawer-hanging.png'),
  'single-2hanging': getImagePath('single-2hanging.png'), 
  'single-4drawer-hanging': getImagePath('single-4drawer-hanging.png'),
  'dual-2drawer-hanging': getImagePath('dual-2drawer-hanging.png'),
  'dual-2hanging': getImagePath('dual-2hanging.png'),
  'dual-4drawer-hanging': getImagePath('dual-4drawer-hanging.png'),
  'dual-2drawer-styler': getImagePath('dual-2drawer-styler.png'),
  'dual-4drawer-pantshanger': getImagePath('dual-4drawer-pantshanger.png'),
};

// 가구 이미지 매핑 함수
const getFurnitureImagePath = (moduleId: string) => {
  // moduleId에서 너비 정보 제거하여 기본 타입 추출
  const baseModuleType = moduleId.replace(/-\d+$/, '');
  const imagePath = FURNITURE_ICONS[baseModuleType] || FURNITURE_ICONS['single-2drawer-hanging'];
  
  if (import.meta.env.DEV) {
// console.log(`🖼️ [가구 팝업 이미지] ${moduleId} → ${baseModuleType} → ${imagePath}`);
  }
  return imagePath;
};

// Remove local calculatePanelDetails - now using shared utility
/* const calculatePanelDetails = (moduleData: ModuleData, customWidth: number, customDepth: number, hasDoor: boolean = false, t: any = (key: string) => key) => {
  const panels = {
    common: [],    // 공통 패널 (좌우측판, 뒷판)
    upper: [],     // 상부장 패널
    lower: [],     // 하부장 패널
    door: []       // 도어 패널
  };
  
  // 실제 3D 렌더링과 동일한 두께 값들 (BaseFurnitureShell.tsx와 DrawerRenderer.tsx 참조)
  const basicThickness = moduleData.modelConfig?.basicThickness || 18;
  const backPanelThickness = 9; // 백패널 두께
  const drawerHandleThickness = 15; // 서랍 손잡이판(마이다) 두께
  const drawerSideThickness = 15; // 서랍 측면 두께 (DRAWER_SIDE_THICKNESS) 
  const drawerBottomThickness = 5; // 서랍 바닥판 두께
  
  const height = moduleData.dimensions.height;
  const innerWidth = customWidth - (basicThickness * 2);
  const innerHeight = height - (basicThickness * 2);
  
  // 섹션 정보 가져오기
  // 듀얼 타입5,6 특별 처리 (leftSections/rightSections 구조)
  let sections;
  if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
    // leftSections를 기준으로 처리 (서랍 + 옷장)
    sections = moduleData.modelConfig?.leftSections || [];
  } else {
    sections = moduleData.modelConfig?.sections || [];
  }
  
  // availableHeight는 mm 단위로 사용 (내경이 아닌 전체 높이 기준)
  const availableHeightMm = height;
  
  
  // 전체 가구의 기본 구조는 일단 저장하지만 표시하지 않음
  // 나중에 필요시 사용할 수 있도록 보관
  
  // === 섹션별 패널 계산 ===
  if (sections && sections.length > 0) {
    // 실제 사용 가능한 내부 높이 (상하판 제외)
    const actualAvailableHeight = height - (basicThickness * 2);
    
    // 섹션 높이 계산 함수 (3D 렌더링과 동일한 로직)
    const calculateSectionHeight = (section, availableHeightMm) => {
      const heightType = section.heightType || 'percentage';
      
      if (heightType === 'absolute') {
        // 절대값인 경우 section.height는 이미 mm 단위
        // 하지만 availableHeightMm를 초과하지 않도록 제한
        return Math.min(section.height || 0, availableHeightMm);
      } else {
        // 비율인 경우
        return availableHeightMm * ((section.height || section.heightRatio || 100) / 100);
      }
    };
    
    // 고정 높이 섹션들 분리
    const fixedSections = sections.filter(s => s.heightType === 'absolute');
    const totalFixedHeight = fixedSections.reduce((sum, section) => {
      return sum + calculateSectionHeight(section, actualAvailableHeight);
    }, 0);
    
    // 중간 칸막이 두께 고려 (섹션 개수 - 1개의 칸막이)
    const dividerCount = sections.length > 1 ? (sections.length - 1) : 0;
    const dividerThickness = dividerCount * basicThickness;
    
    // 나머지 높이 계산 (전체 - 고정높이 - 칸막이)
    const remainingHeight = actualAvailableHeight - totalFixedHeight - dividerThickness;
    
    
    // 섹션 사이 구분판 (안전선반/칸막이) - 상부장과 하부장 사이
    if (sections.length > 1 && moduleData.id.includes('2hanging')) {
      // 2단 옷장의 경우 안전선반으로 표시
      panels.common.push({
        name: '선반 (칸막이)',
        width: innerWidth,
        depth: customDepth - backPanelThickness - 17, // 실제 렌더링 값
        thickness: basicThickness,
        material: 'PB'  // 기본 재질
      });
    } else if (sections.length > 1) {
      // 다른 가구의 경우 중간 칸막이로 표시
      panels.common.push({
        name: '중간 칸막이',
        width: innerWidth,
        depth: customDepth - backPanelThickness - 17, // 실제 렌더링 값
        thickness: basicThickness,
        material: 'PB'  // 기본 재질
      });
    }
    
    // 각 섹션별 내부 구조 처리
    sections.forEach((section, sectionIndex) => {
      // 상부장/하부장 구분 
      // 가구 타입에 따른 구분 로직
      let sectionName = '';
      let targetPanel = null;
      
      // 2단 옷장 (single-2hanging): 첫 번째 섹션(shelf)이 하부장, 두 번째 섹션(hanging)이 상부장
      if (moduleData.id.includes('2hanging')) {
        if (sectionIndex === 0) {
          sectionName = '하부장';
          targetPanel = panels.lower;
        } else {
          sectionName = '상부장';
          targetPanel = panels.upper;
        }
      }
      // 듀얼 타입5,6 (스타일러, 바지걸이장): leftSections 기준으로 처리
      else if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
        // 첫 번째 섹션이 drawer면 하부장, 두 번째가 hanging이면 상부장
        if (section.type === 'drawer') {
          sectionName = '하부장 (좌측)';
          targetPanel = panels.lower;
        } else if (section.type === 'hanging') {
          sectionName = '상부장 (좌측)';
          targetPanel = panels.upper;
        }
      }
      // 4단서랍+옷장: drawer는 하부장, hanging은 상부장
      else if (section.type === 'drawer') {
        sectionName = '하부장';
        targetPanel = panels.lower;
      } else if (section.type === 'hanging') {
        sectionName = '상부장';
        targetPanel = panels.upper;
      } 
      // 기타 가구: 인덱스 기반 구분 (0=상부, 1=하부)
      else {
        const isUpperSection = sectionIndex === 0;
        sectionName = isUpperSection ? '상부장' : '하부장';
        targetPanel = isUpperSection ? panels.upper : panels.lower;
      }
      
      // 섹션 실제 높이 계산 (mm 단위)
      const sectionHeightMm = section.heightType === 'absolute' 
        ? calculateSectionHeight(section, actualAvailableHeight)
        : calculateSectionHeight(section, remainingHeight);
      
      
      // 각 섹션의 기본 구조 패널 추가
      // 섹션 좌측판
      targetPanel.push({
        name: `${sectionName} ${t('furniture.leftPanel')}`,
        width: customDepth,
        height: Math.round(sectionHeightMm),
        thickness: basicThickness,
        material: 'PB'  // 기본 재질
      });
      
      // 섹션 우측판
      targetPanel.push({
        name: `${sectionName} ${t('furniture.rightPanel')}`,
        width: customDepth,
        height: Math.round(sectionHeightMm),
        thickness: basicThickness,
        material: 'PB'  // 기본 재질
      });
      
      // 섹션 상판 (마지막 섹션에만) - 뒤에서 26mm 줄임
      if (sectionIndex === sections.length - 1) {
        targetPanel.push({
          name: `${sectionName} ${t('furniture.topPanel')}`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'  // 기본 재질
        });
      }

      // 섹션 하판 (각 섹션의 바닥판) - 뒤에서 26mm 줄임
      if (sectionIndex === 0) {
        // 하부섹션의 바닥판 (가구 전체 하판)
        targetPanel.push({
          name: `${sectionName} ${t('furniture.bottomPanel')}`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'  // 기본 재질
        });
      } else {
        // 상부섹션의 바닥판 (하부 상판과 같은 깊이)
        targetPanel.push({
          name: `${sectionName} ${t('furniture.bottomPanel')}`,
          width: innerWidth,
          depth: customDepth - 26, // 백패널과 맞닿게 26mm 감소
          thickness: basicThickness,
          material: 'PB'  // 기본 재질
        });
      }
      
      // 안전선반 (칸막이)는 섹션 밖에서 별도 처리 (아래로 이동)
      
      // 섹션 뒷판
      targetPanel.push({
        name: `${sectionName} ${t('furniture.backPanel')}`,
        width: innerWidth + 10,
        height: Math.round(sectionHeightMm) + 10,
        thickness: backPanelThickness,
        material: 'MDF'  // 뒷판은 MDF 재질
      });

      // 백패널 보강대 (상단/하단) - 60mm 높이, 15mm 깊이
      // 양쪽 0.5mm씩 축소 (총 1mm)
      const reinforcementHeight = 60; // mm
      const reinforcementDepth = 15; // mm
      const reinforcementWidth = innerWidth - 1; // 양쪽 0.5mm씩 축소
      targetPanel.push({
        name: `${sectionName} 후면 보강대`,
        width: reinforcementWidth,
        height: reinforcementHeight,
        thickness: reinforcementDepth,
        material: 'PB'
      });
      targetPanel.push({
        name: `${sectionName} 후면 보강대`,
        width: reinforcementWidth,
        height: reinforcementHeight,
        thickness: reinforcementDepth,
        material: 'PB'
      });

      if (section.type === 'drawer' && section.count) {
        // 서랍 개별 높이 계산 (DrawerRenderer.tsx 로직 참조)
        const drawerHeights = section.drawerHeights || [];
        const gapHeight = section.gapHeight || 23.6; // mm
        
        // 각 서랍별로 계산
        for (let i = 0; i < section.count; i++) {
          const drawerNum = i + 1;
          
          // 개별 서랍 높이 (drawerHeights 배열에서 가져오거나 균등 분할)
          let individualDrawerHeight;
          if (drawerHeights && drawerHeights[i]) {
            individualDrawerHeight = drawerHeights[i];
          } else {
            // 균등 분할 (전체 섹션 높이 - 칸막이 두께) / 서랍 개수
            individualDrawerHeight = Math.floor((sectionHeightMm - basicThickness * (section.count - 1)) / section.count);
          }
          
          // 서랍 손잡이판 (마이다) - PB 15mm
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.handlePlate')}`,
            width: customWidth,
            height: individualDrawerHeight,
            thickness: drawerHandleThickness,
            material: 'PB'
          });
          
          // 서랍 본체 크기 계산 (DrawerRenderer 참조)
          // drawerWidth = innerWidth - 24mm (좌우 12mm 간격)
          // 앞판/뒷판: drawerWidth - 106mm (좌우 측판 안쪽에 끼워짐)
          // 좌측판/우측판: 전체 깊이 사용 (앞뒤 15mm씩 확장)
          const drawerWidth = customWidth - 24; // 서랍 전체 폭
          const drawerFrontBackWidth = drawerWidth - 106; // 앞판/뒷판 폭 (좌우 측판에 끼워짐)
          const drawerBodyHeight = individualDrawerHeight - 30; // 상하 15mm씩 감소
          const drawerBodyDepth = customDepth - 47 - drawerHandleThickness; // 앞30mm 뒤17mm 후퇴 + 손잡이판 두께

          // 서랍 앞판 (두께 15mm)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.frontPanel')}`,
            width: drawerFrontBackWidth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 뒷판 (두께 15mm)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.backPanel')}`,
            width: drawerFrontBackWidth,
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 좌측판 (전체 깊이 사용, 두께 15mm)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.leftPanel')}`,
            depth: drawerBodyDepth, // 전체 깊이 사용 (앞뒤로 확장됨)
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });

          // 서랍 우측판 (전체 깊이 사용, 두께 15mm)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.rightPanel')}`,
            depth: drawerBodyDepth, // 전체 깊이 사용 (앞뒤로 확장됨)
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB'  // 서랍 본체는 PB 재질
          });
          
          // 서랍 바닥판 (DrawerRenderer의 Drawer Bottom)
          // DrawerRenderer: drawerWidth - 70 - 26 = drawerWidth - 96
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.bottomPanel')}`,
            width: drawerWidth - 96, // drawerWidth - 70 - 26
            depth: drawerBodyDepth - 20, // drawerBodyDepth - 20
            thickness: drawerBottomThickness,
            material: 'MDF'  // 서랍 바닥판은 MDF 재질
          });
        }
        
        // 서랍 칸막이 (서랍 사이에만, 마지막 서랍 제외)
        for (let i = 1; i < section.count; i++) {
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawerDivider')} ${i}`,
            width: innerWidth,
            depth: customDepth - backPanelThickness - 17, // 뒷판 공간 고려
            thickness: basicThickness,
            material: 'PB'  // 기본 재질
          });
        }
      } else if (section.type === 'hanging') {
        // 옷장 섹션 (ShelfRenderer.tsx 참조)
        if (section.shelfPositions && section.shelfPositions.length > 0) {
          section.shelfPositions.forEach((pos, i) => {
            // BoxWithEdges args={[innerWidth, basicThickness, depth - basicThickness]}
            // 실제 선반 깊이 = adjustedDepthForShelves - basicThickness = (depth - 8) - basicThickness
            targetPanel.push({
              name: `${sectionName} 선반 ${i + 1}`,
              width: innerWidth,
              depth: customDepth - 8 - basicThickness, // 실제 렌더링되는 선반 깊이
              thickness: basicThickness,
              material: 'PB'  // 기본 재질
            });
          });
        } else {
          // 옷걸이 구역 내부 높이 정보
          const hangingInternalHeight = Math.round(sectionHeightMm);
          targetPanel.push({
            name: `${sectionName} 옷걸이 공간`,
            description: '내부 높이',
            height: hangingInternalHeight,
            isInfo: true
          });
        }
      } else if (section.type === 'shelf' && section.count) {
        // 선반 구역 (ShelfRenderer.tsx 참조)
        // 실제 선반 깊이 = adjustedDepthForShelves - basicThickness = (depth - 8) - basicThickness
        for (let i = 1; i <= section.count; i++) {
          targetPanel.push({
            name: `${sectionName} 선반 ${i}`,
            width: innerWidth,
            depth: customDepth - 8 - basicThickness, // 실제 렌더링되는 선반 깊이
            thickness: basicThickness,
            material: 'PB'  // 기본 재질
          });
        }
      } else if (section.type === 'open') {
        // 오픈 섹션 내부 높이 정보
        const openInternalHeight = Math.round(sectionHeightMm);
        targetPanel.push({
          name: `${sectionName} 오픈 공간`,
          description: '내부 높이',
          height: openInternalHeight,
          isInfo: true
        });
      }
    });
  }
  
  // === 도어 패널 ===
  if (hasDoor) {
    const doorGap = 2;
    
    if (moduleData.id.includes('dual')) {
      const doorWidth = Math.floor((customWidth - doorGap * 3) / 2);
      panels.door.push({
        name: '좌측 도어',
        width: doorWidth,
        height: height - doorGap * 2,
        thickness: basicThickness,
        material: 'PET'  // 도어는 PET 재질
      });
      panels.door.push({
        name: '우측 도어',
        width: doorWidth,
        height: height - doorGap * 2,
        thickness: basicThickness,
        material: 'PET'  // 도어는 PET 재질
      });
    } else {
      panels.door.push({
        name: '도어',
        width: customWidth - doorGap * 2,
        height: height - doorGap * 2,
        thickness: basicThickness,
        material: 'PET'  // 도어는 PET 재질
      });
    }
  }
  
  // 플랫 배열로 변환하여 반환 (상부장 → 안전선반 → 하부장 순서)
  const result = [];
  
  // 상부장 패널 (상부 섹션)
  if (panels.upper.length > 0) {
    result.push({ name: `=== ${t('furniture.upperSection')} ===` });
    result.push(...panels.upper);
  }
  
  // 공통 패널 (안전선반/칸막이) - 상부장과 하부장 사이
  if (panels.common.length > 0) {
    result.push(...panels.common);
  }
  
  // 하부장 패널 (하부 섹션)
  if (panels.lower.length > 0) {
    result.push({ name: `=== ${t('furniture.lowerSection')} ===` });
    result.push(...panels.lower);
  }
  
  // 도어 패널은 필요시 표시
  if (panels.door.length > 0 && hasDoor) {
    result.push({ name: `=== ${t('furniture.door')} ===` });
    result.push(...panels.door);
  }
  
  return result;
};
*/

const PlacedModulePropertiesPanel: React.FC = () => {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState<number | null>(null);
  const setHighlightedPanel = useUIStore(state => state.setHighlightedPanel);
  const setSelectedFurnitureId = useUIStore(state => state.setSelectedFurnitureId);
  const setPanelListTabActive = useUIStore(state => state.setPanelListTabActive);
  const activePopup = useUIStore(state => state.activePopup);
  const closeAllPopups = useUIStore(state => state.closeAllPopups);

  // 컴포넌트 언마운트 시 패널 강조 해제
  useEffect(() => {
    return () => {
      setHighlightedPanel(null);
    };
  }, [setHighlightedPanel]);

  // 패널 목록 탭 활성 상태를 전역으로 공유하여 3D 툴바 표시를 제어
  useEffect(() => {
    setPanelListTabActive(showDetails);
    return () => {
      setPanelListTabActive(false);
    };
  }, [showDetails, setPanelListTabActive]);

  // 팝업이 열려 있는 동안 선택 상태 유지 (패널 목록 탭 전환 시 강조 유지)
  useEffect(() => {
    if (activePopup?.type === 'furnitureEdit' && activePopup.id) {
      setSelectedFurnitureId(activePopup.id);
    }
  }, [activePopup?.type, activePopup?.id, setSelectedFurnitureId]);

  // 컴포넌트 마운트 시 스타일 강제 적용 (다크모드 대응)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* 모든 테마에서 input 필드는 항상 흰 배경에 검은 텍스트 */
      .furniture-depth-input,
      input.furniture-depth-input,
      .${styles.depthInput},
      .${styles.panel} input[type="text"],
      .${styles.panel} input[type="number"],
      .${styles.depthInputWrapper} input,
      .${styles.inputWithUnit} input {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
        opacity: 1 !important;
        caret-color: #000000 !important;
      }
      .furniture-depth-input:focus,
      input.furniture-depth-input:focus,
      .${styles.depthInput}:focus,
      .${styles.panel} input[type="text"]:focus,
      .${styles.panel} input[type="number"]:focus,
      .${styles.depthInputWrapper} input:focus,
      .${styles.inputWithUnit} input:focus {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
      }
      /* 모든 상태에서 적용 */
      .${styles.depthInput}:hover,
      .${styles.depthInput}:active,
      .${styles.depthInput}:disabled,
      .${styles.depthInput}::placeholder {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
      }
      /* 다크 테마 클래스가 있는 경우 */
      .theme-dark .furniture-depth-input,
      .theme-dark input.furniture-depth-input,
      .theme-dark .${styles.depthInput},
      .theme-dark .${styles.panel} input,
      body.theme-dark .${styles.depthInput},
      html.theme-dark .${styles.depthInput} {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
      }
    `;
    // 스타일을 가장 마지막에 추가하여 우선순위 보장
    document.head.appendChild(style);
    style.setAttribute('data-furniture-panel-styles', 'true');
    
    return () => {
      if (style.parentNode) {
        document.head.removeChild(style);
      }
    };
  }, []);
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const removeModule = useFurnitureStore(state => state.removeModule);

  // 훅 선언부를 조건문 위로 이동
  const [customDepth, setCustomDepth] = useState<number>(580); // 임시 기본값
  const [depthInputValue, setDepthInputValue] = useState<string>('580');
  const [depthError, setDepthError] = useState<string>('');
  const [lowerSectionDepth, setLowerSectionDepth] = useState<number | undefined>(undefined); // 하부 섹션 깊이
  const [upperSectionDepth, setUpperSectionDepth] = useState<number | undefined>(undefined); // 상부 섹션 깊이
  const [lowerDepthInput, setLowerDepthInput] = useState<string>(''); // 하부 섹션 깊이 입력 필드
  const [upperDepthInput, setUpperDepthInput] = useState<string>(''); // 상부 섹션 깊이 입력 필드
  const [lowerDepthDirection, setLowerDepthDirection] = useState<'front' | 'back'>('front'); // 하부 깊이 줄이는 방향
  const [upperDepthDirection, setUpperDepthDirection] = useState<'front' | 'back'>('front'); // 상부 깊이 줄이는 방향
  const [lowerTopOffset, setLowerTopOffset] = useState<number>(0); // 하부 섹션 상판 옵셋 (mm)
  const [lowerTopOffsetInput, setLowerTopOffsetInput] = useState<string>('0'); // 하부 섹션 상판 옵셋 입력
  const [customWidth, setCustomWidth] = useState<number>(600); // 기본 컬럼 너비로 변경
  const [widthInputValue, setWidthInputValue] = useState<string>('600');
  const [widthError, setWidthError] = useState<string>('');
  const [hingePosition, setHingePosition] = useState<'left' | 'right'>('right');
  const [hingeType, setHingeType] = useState<'A' | 'B'>('A');
  const [hasDoor, setHasDoor] = useState<boolean>(false);
  const [doorSplit, setDoorSplit] = useState<boolean>(false);
  const [hasGapBackPanel, setHasGapBackPanel] = useState<boolean>(false); // 상하부장 사이 갭 백패널 상태
  const [backPanelThicknessValue, setBackPanelThicknessValue] = useState<number>(9); // 백패널 두께 (기본값: 9mm)
  const [columnPlacementMode, setColumnPlacementMode] = useState<'beside' | 'front'>('beside'); // 기둥 C 배치 모드

  // 자유배치 모드 치수 상태
  const [freeWidthInput, setFreeWidthInput] = useState<string>('');
  const [freeHeightInput, setFreeHeightInput] = useState<string>('');
  const [freeDepthInput, setFreeDepthInput] = useState<string>('');
  const [epDepthInput, setEpDepthInput] = useState<string>(''); // EP 깊이 로컬 버퍼
  const [leftGapInput, setLeftGapInput] = useState<string>('0'); // 좌측 이격 로컬 버퍼
  const [rightGapInput, setRightGapInput] = useState<string>('0'); // 우측 이격 로컬 버퍼

  // 섹션별 치수 상태 (자유배치 + customConfig 분할 가구용)
  const [sectionHeightInputs, setSectionHeightInputs] = useState<Record<number, string>>({});
  const [sectionDepthInputs, setSectionDepthInputs] = useState<Record<number, string>>({});
  const [sectionWidthInputs, setSectionWidthInputs] = useState<Record<number, string>>({});
  // 좌우분할(horizontalSplit) 서브박스 치수
  const [hsLeftWidthInput, setHsLeftWidthInput] = useState<Record<number, string>>({});
  const [hsRightWidthInput, setHsRightWidthInput] = useState<Record<number, string>>({});
  const [hsLeftDepthInput, setHsLeftDepthInput] = useState<Record<number, string>>({});
  const [hsRightDepthInput, setHsRightDepthInput] = useState<Record<number, string>>({});
  const [hsCenterWidthInput, setHsCenterWidthInput] = useState<Record<number, string>>({});
  const [hsCenterDepthInput, setHsCenterDepthInput] = useState<Record<number, string>>({});

  // 띄움배치일 때 바닥 이격거리를 띄움 높이로 연동
  const [doorTopGap, setDoorTopGap] = useState<number>(0); // 병합 모드: 천장에서 아래로 (바닥/천장 기준)
  const [doorBottomGap, setDoorBottomGap] = useState<number>(0); // 병합 모드: 바닥에서 위로 (바닥/천장 기준)
  const [doorTopGapInput, setDoorTopGapInput] = useState<string>('0');

  // 분할 모드용 섹션별 이격거리
  const [upperDoorTopGap, setUpperDoorTopGap] = useState<number>(0); // 상부: 천장에서 아래로
  const [upperDoorBottomGap, setUpperDoorBottomGap] = useState<number>(0); // 상부: 중간판에서 위로
  const [lowerDoorTopGap, setLowerDoorTopGap] = useState<number>(0); // 하부: 중간판에서 아래로
  const [lowerDoorBottomGap, setLowerDoorBottomGap] = useState<number>(0); // 하부: 바닥에서 위로
  const [upperDoorTopGapInput, setUpperDoorTopGapInput] = useState<string>('0');
  const [upperDoorBottomGapInput, setUpperDoorBottomGapInput] = useState<string>('0');
  const [lowerDoorTopGapInput, setLowerDoorTopGapInput] = useState<string>('0');
  const [lowerDoorBottomGapInput, setLowerDoorBottomGapInput] = useState<string>('0');
  const [doorBottomGapInput, setDoorBottomGapInput] = useState<string>('0');
  const [originalDoorTopGap, setOriginalDoorTopGap] = useState<number>(0);
  const [originalDoorBottomGap, setOriginalDoorBottomGap] = useState<number>(0);

  // 도어 셋팅 (자유배치 모드)
  const [doorSettingMode, setDoorSettingMode] = useState<'auto' | 'manual'>('auto');
  const [doorOverlayLeft, setDoorOverlayLeft] = useState<number>(0);
  const [doorOverlayRight, setDoorOverlayRight] = useState<number>(0);
  const [doorOverlayTop, setDoorOverlayTop] = useState<number>(0);
  const [doorOverlayBottom, setDoorOverlayBottom] = useState<number>(0);
  const [doorOverlayLeftInput, setDoorOverlayLeftInput] = useState<string>('0');
  const [doorOverlayRightInput, setDoorOverlayRightInput] = useState<string>('0');
  const [doorOverlayTopInput, setDoorOverlayTopInput] = useState<string>('0');
  const [doorOverlayBottomInput, setDoorOverlayBottomInput] = useState<string>('0');
  const [originalDoorSettingMode, setOriginalDoorSettingMode] = useState<'auto' | 'manual'>('auto');
  const [originalDoorOverlayLeft, setOriginalDoorOverlayLeft] = useState<number>(0);
  const [originalDoorOverlayRight, setOriginalDoorOverlayRight] = useState<number>(0);
  const [originalDoorOverlayTop, setOriginalDoorOverlayTop] = useState<number>(0);
  const [originalDoorOverlayBottom, setOriginalDoorOverlayBottom] = useState<number>(0);

  // 취소 시 복원을 위한 모든 초기값 저장
  const [originalCustomDepth, setOriginalCustomDepth] = useState<number>(580);
  const [originalCustomWidth, setOriginalCustomWidth] = useState<number>(600);
  const [originalLowerSectionDepth, setOriginalLowerSectionDepth] = useState<number | undefined>(undefined);
  const [originalUpperSectionDepth, setOriginalUpperSectionDepth] = useState<number | undefined>(undefined);
  const [originalLowerDepthDirection, setOriginalLowerDepthDirection] = useState<'front' | 'back'>('front');
  const [originalUpperDepthDirection, setOriginalUpperDepthDirection] = useState<'front' | 'back'>('front');
  const [originalLowerTopOffset, setOriginalLowerTopOffset] = useState<number>(0);
  const [originalHingePosition, setOriginalHingePosition] = useState<'left' | 'right'>('right');
  const [originalHingeType, setOriginalHingeType] = useState<'A' | 'B'>('A');
  const [originalHasDoor, setOriginalHasDoor] = useState<boolean>(false);
  const [originalDoorSplit, setOriginalDoorSplit] = useState<boolean>(false);
  const [originalHasGapBackPanel, setOriginalHasGapBackPanel] = useState<boolean>(false);
  const [originalBackPanelThickness, setOriginalBackPanelThickness] = useState<number>(9);
  const [originalColumnPlacementMode, setOriginalColumnPlacementMode] = useState<'beside' | 'front'>('beside');
  const [originalUpperDoorTopGap, setOriginalUpperDoorTopGap] = useState<number>(5);
  const [originalUpperDoorBottomGap, setOriginalUpperDoorBottomGap] = useState<number>(0);
  const [originalLowerDoorTopGap, setOriginalLowerDoorTopGap] = useState<number>(0);
  const [originalLowerDoorBottomGap, setOriginalLowerDoorBottomGap] = useState<number>(45);

  // 전체 팝업에서 엔터키 처리 - 조건문 위로 이동
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const isFormElement = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
      if (isFormElement) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAllPopups();
        }
        return;
      }

      // 메인 팝업이 열려있을 때 (furnitureEdit 타입 체크)
      if (activePopup.type === 'furnitureEdit') {
        if (e.key === 'Enter') {
          e.preventDefault();
          closeAllPopups();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeAllPopups();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePopup.type, closeAllPopups]);
  
  // 기본 가구 깊이 계산 (가구별 defaultDepth 우선, 없으면 fallback)
  const getDefaultDepth = useCallback((moduleData?: ModuleData) => {
    // 가구별 기본 깊이가 정의되어 있으면 사용
    if (moduleData?.defaultDepth) {
      return Math.min(moduleData.defaultDepth, spaceInfo.depth);
    }
    
    // 기존 로직 (fallback)
    const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
    return Math.min(spaceBasedDepth, FURNITURE_LIMITS.DEPTH.DEFAULT_FALLBACK);
  }, [spaceInfo.depth]);

  // 현재 편집 중인 배치된 모듈 찾기 (조건부 렌더링 전에 미리 계산)
  const currentPlacedModule = activePopup.type === 'furnitureEdit' && activePopup.id 
    ? placedModules.find(module => module.id === activePopup.id)
    : null;

  // 같은 슬롯의 반대편 캐비넷이 이미 백패널을 가지고 있는지 확인
  const isBackPanelAlreadyInSlot = React.useMemo(() => {
    if (!currentPlacedModule || currentPlacedModule.slotIndex === undefined) return false;
    
    const internalSpace = calculateInternalSpace(spaceInfo);
    const currentModuleData = getModuleById(currentPlacedModule.moduleId, internalSpace, spaceInfo)
      || buildModuleDataFromPlacedModule(currentPlacedModule);
    if (!currentModuleData) return false;

    const isCurrentUpper = currentModuleData.category === 'upper' || currentPlacedModule.moduleId.includes('upper-cabinet');
    const isCurrentLower = currentModuleData.category === 'lower' || currentPlacedModule.moduleId.includes('lower-cabinet');

    if (!isCurrentUpper && !isCurrentLower) return false;

    // 같은 슬롯의 다른 가구들 확인
    return placedModules.some(module => {
      if (module.id === currentPlacedModule.id) return false; // 자기 자신 제외
      if (module.slotIndex !== currentPlacedModule.slotIndex) return false; // 다른 슬롯 제외

      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo)
        || buildModuleDataFromPlacedModule(module);
      if (!moduleData) return false;
      
      const isUpper = moduleData.category === 'upper' || module.moduleId.includes('upper-cabinet');
      const isLower = moduleData.category === 'lower' || module.moduleId.includes('lower-cabinet');
      
      // 현재가 상부장이면 하부장 확인, 현재가 하부장이면 상부장 확인
      if (isCurrentUpper && isLower && module.hasGapBackPanel) return true;
      if (isCurrentLower && isUpper && module.hasGapBackPanel) return true;
      
      return false;
    });
  }, [currentPlacedModule, placedModules, spaceInfo]);

  // 모듈 데이터 가져오기 (조건부 렌더링 전에 미리 계산)
  const moduleData = currentPlacedModule
    ? (() => {
        // 커스텀 모듈 (My캐비넷 또는 customizable 자유배치): buildModuleDataFromPlacedModule 사용
        if (currentPlacedModule.customConfig && (!currentPlacedModule.isCustomizable || currentPlacedModule.moduleId.startsWith('customizable-'))) {
          return buildModuleDataFromPlacedModule(currentPlacedModule) || ({
            id: currentPlacedModule.moduleId,
            name: '커스텀 캐비넷',
            category: 'full' as const,
            dimensions: { width: 600, height: 2000, depth: 580 },
            color: '#C8B69E',
            hasDoor: false,
            isDynamic: false,
            modelConfig: { basicThickness: 18 },
          } as ModuleData);
        }

        // customWidth가 있으면 해당 너비로 모듈 ID 생성 (소수점 포함)
        let targetModuleId = currentPlacedModule.moduleId;
        if (currentPlacedModule.customWidth) {
          const baseType = currentPlacedModule.moduleId.replace(/-[\d.]+$/, '');
          targetModuleId = `${baseType}-${currentPlacedModule.customWidth}`;
        }
        return getModuleById(targetModuleId, calculateInternalSpace(spaceInfo), spaceInfo)
          || buildModuleDataFromPlacedModule(currentPlacedModule);
      })()
    : null;

  // 기둥 슬롯 정보 및 기둥 C 여부 확인 (조건부 렌더링 전에 미리 계산)
  const { slotInfo, isCoverDoor, isColumnC } = React.useMemo(() => {
    if (!currentPlacedModule || !moduleData) return { slotInfo: null, isCoverDoor: false, isColumnC: false };
    
    // 슬롯 인덱스가 있으면 기둥 슬롯 분석
    let slotInfo = null;
    if (currentPlacedModule.slotIndex !== undefined) {
      const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
      slotInfo = columnSlots[currentPlacedModule.slotIndex];
    } else {
      // 슬롯 인덱스가 없으면 위치 기반으로 판단
      const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
      const indexing = calculateSpaceIndexing(spaceInfo);
      
      // 가구 위치에서 가장 가까운 슬롯 찾기
      const slotIndex = indexing.threeUnitPositions.findIndex(pos => 
        Math.abs(pos - currentPlacedModule.position.x) < 0.1
      );
      
      if (slotIndex >= 0) {
        slotInfo = columnSlots[slotIndex];
      }
    }
    
    const isCoverDoor = slotInfo?.hasColumn || false;
    // 기둥 C 판단: columnType이 'medium'인 경우 (300mm 깊이 기둥)
    const isColumnC = slotInfo?.columnType === 'medium' || false;

    return { slotInfo, isCoverDoor, isColumnC };
  }, [currentPlacedModule, moduleData, spaceInfo]);

  const moduleDefaultLowerTopOffset = React.useMemo(() => {
    if (!moduleData?.id) return 0;
    return moduleData.id.includes('2drawer') || moduleData.id.includes('4drawer') ? 85 : 0;
  }, [moduleData?.id]);

  // 초기값 설정 - 의존성에서 getDefaultDepth 제거하여 불필요한 재실행 방지
  useEffect(() => {
    if (currentPlacedModule && moduleData) {
      const initialDepth = currentPlacedModule.customDepth !== undefined && currentPlacedModule.customDepth !== null
        ? currentPlacedModule.customDepth
        : getDefaultDepth(moduleData);

      // 기둥에 의해 조정된 너비가 있으면 우선 사용, 없으면 customWidth, 그것도 없으면 기본 너비
      const initialWidth = currentPlacedModule.adjustedWidth !== undefined && currentPlacedModule.adjustedWidth !== null
        ? currentPlacedModule.adjustedWidth
        : (currentPlacedModule.customWidth !== undefined && currentPlacedModule.customWidth !== null
          ? currentPlacedModule.customWidth
          : moduleData.dimensions.width);

      // customDepth가 이미 설정되어 있고 initialDepth와 같으면 업데이트하지 않음 (입력 중 방해 방지)
      if (customDepth !== initialDepth) {
        setCustomDepth(initialDepth);
        setDepthInputValue(initialDepth.toString());
        setOriginalCustomDepth(initialDepth); // 원래 값 저장
      }
      // 섹션별 깊이 초기화
      const lowerDepth = currentPlacedModule.lowerSectionDepth;
      const upperDepth = currentPlacedModule.upperSectionDepth;
      setLowerSectionDepth(lowerDepth);
      setUpperSectionDepth(upperDepth);
      setOriginalLowerSectionDepth(lowerDepth); // 원래 값 저장
      setOriginalUpperSectionDepth(upperDepth); // 원래 값 저장
      // 섹션별 깊이 입력 필드 초기화
      setLowerDepthInput(lowerDepth?.toString() ?? '');
      setUpperDepthInput(upperDepth?.toString() ?? '');

      const lowerOffset = currentPlacedModule.lowerSectionTopOffset ?? moduleDefaultLowerTopOffset;
      setLowerTopOffset(lowerOffset);
      setLowerTopOffsetInput(lowerOffset.toString());
      setOriginalLowerTopOffset(lowerOffset);
      // customWidth도 동일하게 처리
      const roundedWidth = Math.round(initialWidth);
      if (customWidth !== roundedWidth) {
        setCustomWidth(roundedWidth);
        setWidthInputValue(roundedWidth.toString());
        setOriginalCustomWidth(initialWidth); // 원래 값 저장
      }
      const hingePos = currentPlacedModule.hingePosition || 'right';
      const hingeTypeVal = currentPlacedModule.hingeType || 'A';
      const hasDoorVal = currentPlacedModule.hasDoor ?? moduleData.hasDoor ?? false;
      const doorSplitVal = currentPlacedModule.doorSplit ?? false;
      const hasGapVal = currentPlacedModule.hasGapBackPanel ?? false;
      const backPanelThicknessVal = currentPlacedModule.backPanelThickness ?? 9;
      setHingePosition(hingePos);
      setHingeType(hingeTypeVal);
      setHasDoor(hasDoorVal);
      setDoorSplit(doorSplitVal);
      setHasGapBackPanel(hasGapVal);
      setBackPanelThicknessValue(backPanelThicknessVal);
      setOriginalHingePosition(hingePos); // 원래 값 저장
      setOriginalHingeType(hingeTypeVal); // 원래 값 저장
      setOriginalHasDoor(hasDoorVal); // 원래 값 저장
      setOriginalDoorSplit(doorSplitVal); // 원래 값 저장
      setOriginalHasGapBackPanel(hasGapVal); // 원래 값 저장
      setOriginalBackPanelThickness(backPanelThicknessVal); // 원래 값 저장

      // 기둥 C 배치 모드 초기화
      const placementModeVal = currentPlacedModule.columnPlacementMode || 'beside';
      setColumnPlacementMode(placementModeVal);
      setOriginalColumnPlacementMode(placementModeVal);

      // 치수 초기화 (슬롯/자유배치 공통)
      {
        setFreeWidthInput(Math.round(currentPlacedModule.freeWidth || customWidth || moduleData.dimensions.width).toString());
        setFreeHeightInput(Math.round(currentPlacedModule.freeHeight || moduleData.dimensions.height).toString());
        setFreeDepthInput(Math.round(currentPlacedModule.freeDepth || customDepth || moduleData.dimensions.depth).toString());

        // EP 깊이 초기화
        const epFurnitureDepth = currentPlacedModule.freeDepth ?? customDepth ?? moduleData.dimensions.depth;
        setEpDepthInput(Math.round(currentPlacedModule.endPanelDepth ?? epFurnitureDepth).toString());

        // 좌우 이격거리 초기화
        setLeftGapInput((currentPlacedModule.freeLeftGap ?? 0).toString());
        setRightGapInput((currentPlacedModule.freeRightGap ?? 0).toString());

        // 섹션별 치수 초기화 (customConfig가 있을 때)
        const cc = currentPlacedModule.customConfig;
        if (cc && cc.sections && cc.sections.length > 0) {
          const pt = cc.panelThickness || 18;
          const totalDepth = currentPlacedModule.freeDepth || moduleData.dimensions.depth;
          const totalWidth = currentPlacedModule.freeWidth || moduleData.dimensions.width;
          const hInputs: Record<number, string> = {};
          const dInputs: Record<number, string> = {};
          const wInputs: Record<number, string> = {};
          const hsLW: Record<number, string> = {};
          const hsRW: Record<number, string> = {};
          const hsLD: Record<number, string> = {};
          const hsRD: Record<number, string> = {};
          const hsCW: Record<number, string> = {};
          const hsCD: Record<number, string> = {};
          cc.sections.forEach((sec: any, i: number) => {
            // 섹션 높이 (내경 + 상하판 = 외경)
            hInputs[i] = Math.round(sec.height + 2 * pt).toString();
            // 섹션 깊이 (개별 깊이가 없으면 전체 깊이)
            if (i === 0) dInputs[i] = Math.round(currentPlacedModule.lowerSectionDepth || totalDepth).toString();
            else if (i === 1) dInputs[i] = Math.round(currentPlacedModule.upperSectionDepth || totalDepth).toString();
            else dInputs[i] = Math.round(totalDepth).toString();
            // 섹션 너비 (개별 너비가 없으면 전체 너비)
            wInputs[i] = Math.round(sec.width || totalWidth).toString();
            // horizontalSplit 서브박스
            const hs = sec.horizontalSplit;
            if (hs) {
              const innerW = (sec.width || totalWidth) - 2 * pt;
              hsLW[i] = Math.round(hs.position || Math.floor(innerW / 2)).toString();
              if (hs.secondPosition) {
                hsCW[i] = Math.round(hs.secondPosition).toString();
                hsRW[i] = Math.round(innerW - (hs.position || 0) - (hs.secondPosition || 0) - 2 * pt).toString();
              } else {
                hsRW[i] = Math.round(innerW - (hs.position || Math.floor(innerW / 2)) - pt).toString();
              }
              hsLD[i] = Math.round(hs.leftDepth || totalDepth).toString();
              hsRD[i] = Math.round(hs.rightDepth || totalDepth).toString();
              if (hs.centerDepth) hsCD[i] = Math.round(hs.centerDepth).toString();
            }
          });
          setSectionHeightInputs(hInputs);
          setSectionDepthInputs(dInputs);
          setSectionWidthInputs(wInputs);
          setHsLeftWidthInput(hsLW);
          setHsRightWidthInput(hsRW);
          setHsLeftDepthInput(hsLD);
          setHsRightDepthInput(hsRD);
          setHsCenterWidthInput(hsCW);
          setHsCenterDepthInput(hsCD);
        } else {
          // 표준 가구: modelConfig.sections 기반 초기화
          const mcSections = moduleData.modelConfig?.sections || [];
          if (mcSections.length >= 2) {
            const pt = moduleData.modelConfig?.basicThickness || 18;
            const totalH = currentPlacedModule.freeHeight || moduleData.dimensions.height;
            const totalD = currentPlacedModule.freeDepth || moduleData.dimensions.depth;
            const totalW = currentPlacedModule.freeWidth || moduleData.dimensions.width;
            const innerH = totalH - 2 * pt;
            const dividerH = (mcSections.length - 1) * pt;
            const availH = innerH - dividerH;
            const hInputs: Record<number, string> = {};
            const dInputs: Record<number, string> = {};
            const wInputs: Record<number, string> = {};
            mcSections.forEach((sec: any, i: number) => {
              const ht = sec.heightType || 'percentage';
              const sH = ht === 'absolute'
                ? (sec.height || 0)
                : Math.round(availH * ((sec.height || sec.heightRatio || 50) / 100));
              hInputs[i] = Math.round(sH).toString();
              if (i === 0) dInputs[i] = Math.round(currentPlacedModule.lowerSectionDepth || totalD).toString();
              else if (i === 1) dInputs[i] = Math.round(currentPlacedModule.upperSectionDepth || totalD).toString();
              else dInputs[i] = Math.round(totalD).toString();
              wInputs[i] = Math.round(totalW).toString();
            });
            setSectionHeightInputs(hInputs);
            setSectionDepthInputs(dInputs);
            setSectionWidthInputs(wInputs);
          }
        }
      }

      // 도어 상하 갭 초기값 설정 (천장/바닥 기준, 입력 중 방해 방지)
      // 띄움배치일 때는 띄움 높이를 바닥 이격거리로 자동 설정
      const initialTopGap = currentPlacedModule.doorTopGap ?? 0;
      // 도어 상하갭은 항상 바닥/천장 기준 (받침대/띄움 무관, 0이면 공간 높이)
      const initialBottomGap = currentPlacedModule.doorBottomGap ?? 0;
      // State 업데이트
      const needsUpdate = doorTopGap !== initialTopGap || doorBottomGap !== initialBottomGap;

      if (doorTopGap !== initialTopGap) {
        setDoorTopGap(initialTopGap);
        setDoorTopGapInput(initialTopGap.toString());
        setOriginalDoorTopGap(initialTopGap);
      }
      if (doorBottomGap !== initialBottomGap) {
        setDoorBottomGap(initialBottomGap);
        setDoorBottomGapInput(initialBottomGap.toString());
        setOriginalDoorBottomGap(initialBottomGap);
      }

      // 바닥배치인데 doorTopGap이나 doorBottomGap이 기본값이 아니면 업데이트
      if (needsUpdate && (currentPlacedModule.doorTopGap !== initialTopGap || currentPlacedModule.doorBottomGap !== initialBottomGap)) {
        updatePlacedModule(currentPlacedModule.id, {
          doorTopGap: initialTopGap,
          doorBottomGap: initialBottomGap
        });
      }

      // 분할 모드용 섹션별 이격거리 초기화
      const upperTopGap = currentPlacedModule.upperDoorTopGap ?? 0;
      const upperBottomGap = currentPlacedModule.upperDoorBottomGap ?? 0;
      const lowerTopGap = currentPlacedModule.lowerDoorTopGap ?? 0;
      const lowerBottomGap = currentPlacedModule.lowerDoorBottomGap ?? 0;

      setUpperDoorTopGap(upperTopGap);
      setUpperDoorTopGapInput(upperTopGap.toString());
      setOriginalUpperDoorTopGap(upperTopGap); // 원래 값 저장

      setUpperDoorBottomGap(upperBottomGap);
      setUpperDoorBottomGapInput(upperBottomGap.toString());
      setOriginalUpperDoorBottomGap(upperBottomGap); // 원래 값 저장

      setLowerDoorTopGap(lowerTopGap);
      setLowerDoorTopGapInput(lowerTopGap.toString());
      setOriginalLowerDoorTopGap(lowerTopGap); // 원래 값 저장

      setLowerDoorBottomGap(lowerBottomGap);
      setLowerDoorBottomGapInput(lowerBottomGap.toString());
      setOriginalLowerDoorBottomGap(lowerBottomGap); // 원래 값 저장

      // 도어 셋팅 (자유배치 모드) 초기화
      const doorSettingModeVal = currentPlacedModule.doorSettingMode ?? 'auto';
      const overlayLeft = currentPlacedModule.doorOverlayLeft ?? 0;
      const overlayRight = currentPlacedModule.doorOverlayRight ?? 0;
      const overlayTop = currentPlacedModule.doorOverlayTop ?? 0;
      const overlayBottom = currentPlacedModule.doorOverlayBottom ?? 0;
      setDoorSettingMode(doorSettingModeVal);
      setDoorOverlayLeft(overlayLeft);
      setDoorOverlayRight(overlayRight);
      setDoorOverlayTop(overlayTop);
      setDoorOverlayBottom(overlayBottom);
      setDoorOverlayLeftInput(overlayLeft.toString());
      setDoorOverlayRightInput(overlayRight.toString());
      setDoorOverlayTopInput(overlayTop.toString());
      setDoorOverlayBottomInput(overlayBottom.toString());
      setOriginalDoorSettingMode(doorSettingModeVal);
      setOriginalDoorOverlayLeft(overlayLeft);
      setOriginalDoorOverlayRight(overlayRight);
      setOriginalDoorOverlayTop(overlayTop);
      setOriginalDoorOverlayBottom(overlayBottom);

      // 2섹션 가구의 섹션 깊이 초기화
      const sections = currentPlacedModule.customSections || moduleData.modelConfig?.sections || [];
      if (sections.length === 2) {
        const defaultDepth = moduleData.dimensions.depth;

        // 저장된 섹션별 깊이가 있으면 사용, 없으면 defaultDepth 사용하고 저장
        const lowerDepth = currentPlacedModule.lowerSectionDepth ?? defaultDepth;
        const upperDepth = currentPlacedModule.upperSectionDepth ?? defaultDepth;

        // placedModule에 값이 없었다면 기본값을 실제로 저장
        if (currentPlacedModule.lowerSectionDepth === undefined || currentPlacedModule.upperSectionDepth === undefined) {
// console.log('🔧 [섹션 깊이 초기화] 기본값을 placedModule에 저장:', { lowerDepth, upperDepth });
          updatePlacedModule(currentPlacedModule.id, {
            lowerSectionDepth: lowerDepth,
            upperSectionDepth: upperDepth,
            lowerSectionTopOffset: currentPlacedModule.lowerSectionTopOffset ?? moduleDefaultLowerTopOffset
          });
        }

        setLowerSectionDepth(lowerDepth);
        setUpperSectionDepth(upperDepth);
        setLowerDepthInput(lowerDepth.toString());
        setUpperDepthInput(upperDepth.toString());
        setLowerDepthDirection(currentPlacedModule.lowerSectionDepthDirection || 'front');
        setUpperDepthDirection(currentPlacedModule.upperSectionDepthDirection || 'front');
        setOriginalLowerDepthDirection(currentPlacedModule.lowerSectionDepthDirection || 'front');
        setOriginalUpperDepthDirection(currentPlacedModule.upperSectionDepthDirection || 'front');

        if (currentPlacedModule.lowerSectionTopOffset === undefined) {
          updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: moduleDefaultLowerTopOffset });
        }
      }
      
// console.log('🔧 팝업 초기값 설정:', {
        // moduleId: currentPlacedModule.moduleId,
        // hasCustomDepth: currentPlacedModule.customDepth !== undefined && currentPlacedModule.customDepth !== null,
        // customDepth: currentPlacedModule.customDepth,
        // defaultDepth: getDefaultDepth(moduleData),
        // finalDepth: initialDepth,
        // hasCustomWidth: currentPlacedModule.customWidth !== undefined && currentPlacedModule.customWidth !== null,
        // customWidth: currentPlacedModule.customWidth,
        // defaultWidth: moduleData.dimensions.width,
        // finalWidth: initialWidth
      // });
    }
  }, [currentPlacedModule?.id, moduleData?.id, currentPlacedModule?.customDepth, currentPlacedModule?.customWidth, currentPlacedModule?.adjustedWidth, currentPlacedModule?.hasDoor, currentPlacedModule?.doorTopGap, currentPlacedModule?.doorBottomGap, moduleDefaultLowerTopOffset]); // 실제 값이 바뀔 때만 실행

  // 도어 상하갭은 바닥/천장 기준 (받침대/띄움 무관)
  // 배치 타입 변경 시 갭값을 자동으로 바꾸지 않음 — 사용자가 도어갭에서 직접 조정

  // ⚠️ CRITICAL: 모든 hooks는 조건부 return 전에 호출되어야 함 (React hooks 규칙)
  // 듀얼 가구 여부 확인 (moduleId 기반)
  const isDualFurniture = moduleData ? moduleData.id.startsWith('dual-') : false;

  // 싱글 가구 여부 확인 (듀얼이 아닌 경우)
  const isSingleFurniture = !isDualFurniture;

  // 2섹션 가구 여부 확인
  const sections = moduleData?.modelConfig?.sections || [];
  const isTwoSectionFurniture = sections.length === 2;

  // 도어용 원래 너비 계산 (adjustedWidth가 없으면 customWidth가 원래 너비)
  const doorOriginalWidth = currentPlacedModule?.customWidth || moduleData?.dimensions.width;

  // 프레임 높이 계산 (상부프레임, 하부프레임)
  const topFrameHeightMm = calculateTopBottomFrameHeight(spaceInfo);
  const baseFrameHeightMm = calculateBaseFrameHeight(spaceInfo);
  // 받침대 높이는 바닥마감재와 무관하게 원래 값 사용
  const floorFinishH = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 15) : 0;
  const visualBaseFrameHeightMm = baseFrameHeightMm;

  // 패널 상세정보 계산 (hasDoor 변경 시 자동 재계산)
  const panelDetails = React.useMemo(() => {
    if (!moduleData) return [];
    return calculatePanelDetails(
      moduleData, customWidth, customDepth, hasDoor, t, doorOriginalWidth,
      undefined, undefined, undefined, undefined, undefined, undefined,
      backPanelThicknessValue, currentPlacedModule?.customConfig,
      currentPlacedModule?.hasLeftEndPanel, currentPlacedModule?.hasRightEndPanel,
      currentPlacedModule?.endPanelThickness, currentPlacedModule?.freeHeight,
      topFrameHeightMm, visualBaseFrameHeightMm,
      currentPlacedModule?.hasTopFrame, currentPlacedModule?.hasBase
    );
  }, [moduleData, customWidth, customDepth, hasDoor, t, doorOriginalWidth, backPanelThicknessValue, currentPlacedModule?.customConfig, currentPlacedModule?.hasLeftEndPanel, currentPlacedModule?.hasRightEndPanel, currentPlacedModule?.endPanelThickness, currentPlacedModule?.freeHeight, topFrameHeightMm, visualBaseFrameHeightMm, currentPlacedModule?.hasTopFrame, currentPlacedModule?.hasBase]);

  // 서라운드 패널 계산 — 맨 좌측 가구에 좌측 서라운드, 맨 우측 가구에 우측 서라운드 귀속
  const surroundPanels = React.useMemo(() => {
    if (!spaceInfo.freeSurround || !currentPlacedModule) return [];
    // 서라운드 높이 = 공간높이 - 바닥마감재 - 띄움높이
    const spaceH = spaceInfo.height || 2400;
    const floatH = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
      ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
    const surroundH = spaceH - floorFinishH - floatH;
    const allSurroundPanels = calculateSurroundPanels(spaceInfo.freeSurround, surroundH);
    if (allSurroundPanels.length === 0) return [];

    // 맨 좌측/우측 가구 판별
    let minSlot = Infinity, maxSlot = -Infinity;
    placedModules.forEach((pm, idx) => {
      const slot = pm.slotIndex ?? idx;
      if (slot < minSlot) minSlot = slot;
      if (slot > maxSlot) maxSlot = slot;
    });
    const currentSlot = currentPlacedModule.slotIndex ?? placedModules.indexOf(currentPlacedModule);
    const isLeftMost = currentSlot === minSlot;
    const isRightMost = currentSlot === maxSlot;

    // 현재 가구에 해당하는 서라운드만 필터
    const filtered = allSurroundPanels.filter((p: any) => {
      const isLeft = p.name.includes('좌측');
      const isRight = p.name.includes('우측');
      const isMiddle = !isLeft && !isRight; // 중간 서라운드
      if (isLeft) return isLeftMost;
      if (isRight) return isRightMost;
      return isMiddle; // 중간 서라운드는 모든 가구에 표시하지 않음 (별도)
    });
    // 중간 서라운드는 어떤 가구에도 표시하지 않음
    const finalFiltered = filtered.filter((p: any) => p.name.includes('좌측') || p.name.includes('우측'));

    if (finalFiltered.length === 0) return [];
    return [{ name: '=== 서라운드 ===' }, ...finalFiltered];
  }, [spaceInfo.freeSurround, spaceInfo.height, spaceInfo.baseConfig, floorFinishH, currentPlacedModule, placedModules]);

  // panelDetails + surroundPanels 합산
  const allPanelDetails = React.useMemo(() => {
    return [...panelDetails, ...surroundPanels];
  }, [panelDetails, surroundPanels]);

  // 디버깅용 로그 (개발 모드에서만 출력)
  if (import.meta.env.DEV) {
// console.log(`🔍 [가구 타입 확인] ${moduleData?.id}: 듀얼=${isDualFurniture}, 싱글=${isSingleFurniture}, 커버도어=${isCoverDoor}`);
// console.log(`🚪 [도어 경첩 표시 조건] hasDoor=${hasDoor}, isSingleFurniture=${isSingleFurniture}, 표시여부=${hasDoor && isSingleFurniture}`);
// console.log(`📐 [섹션 정보] sections.length=${sections.length}, isTwoSectionFurniture=${isTwoSectionFurniture}, showDetails=${showDetails}, sections=`, sections);
// console.log(`🎯 [섹션 깊이 UI 표시 조건] !showDetails=${!showDetails}, isTwoSectionFurniture=${isTwoSectionFurniture}, 표시여부=${!showDetails && isTwoSectionFurniture}`);
// console.log(`🔧 [도어 분할 UI 표시 조건] !showDetails=${!showDetails}, moduleData.hasDoor=${moduleData?.hasDoor}, hasDoor=${hasDoor}, isTwoSectionFurniture=${isTwoSectionFurniture}, 최종표시=${!showDetails && moduleData?.hasDoor && hasDoor && isTwoSectionFurniture}`);
// console.log(`📋 [전체 modelConfig]`, moduleData?.modelConfig);
  }

  // 가구 편집 팝업이 활성화되지 않았으면 렌더링하지 않음
  if (activePopup.type !== 'furnitureEdit' || !activePopup.id) {
// console.log('📝 PlacedModulePropertiesPanel 렌더링 안 함:', {
      // type: activePopup.type,
      // id: activePopup.id
    // });
    return null;
  }

// console.log('📝 PlacedModulePropertiesPanel 렌더링됨:', {
    // type: activePopup.type,
    // id: activePopup.id
  // });

  // ── 서라운드 패널 전용 속성 패널 ──
  if (currentPlacedModule?.isSurroundPanel) {
    const panelTypeLabel = currentPlacedModule.surroundPanelType === 'left' ? '좌측 패널'
      : currentPlacedModule.surroundPanelType === 'right' ? '우측 패널' : '상단 패널';
    const currentWidth = currentPlacedModule.surroundPanelWidth || 40;
    const isTopPanel = currentPlacedModule.surroundPanelType === 'top';
    const widthMin = 18;
    const widthMax = isTopPanel ? 100 : 200;

    const handleSurroundWidthChange = (value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      const clamped = Math.max(widthMin, Math.min(widthMax, num));
      updatePlacedModule(currentPlacedModule.id, {
        surroundPanelWidth: clamped,
        ...(isTopPanel ? { freeHeight: SURROUND_PANEL_THICKNESS } : { freeWidth: SURROUND_PANEL_THICKNESS }),
      });
    };

    return (
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.headerTabs}>
              <button className={`${styles.tabButton} ${styles.activeTab}`}>
                서라운드 패널
              </button>
            </div>
            <button className={styles.closeButton} onClick={() => closeAllPopups()} aria-label="닫기"></button>
          </div>
          <div className={styles.content}>
            <div className={styles.moduleInfo}>
              <div className={styles.moduleDetails}>
                <h4 className={styles.moduleName}>{panelTypeLabel}</h4>
                <div className={styles.property}>
                  <span className={styles.propertyValue}>
                    두께: {SURROUND_PANEL_THICKNESS}mm (고정) / 폭: {currentWidth}mm
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.propertySection}>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>패널 폭 (mm)</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentWidth}
                    min={widthMin}
                    max={widthMax}
                    onChange={(e) => handleSurroundWidthChange(e.target.value)}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>두께</span>
                <span className={styles.propertyValue}>{SURROUND_PANEL_THICKNESS}mm (고정)</span>
              </div>
            </div>

            <div style={{ padding: '12px 0', borderTop: '1px solid var(--theme-border, #eee)' }}>
              <button
                className={`${styles.deleteButton}`}
                onClick={() => {
                  if (activePopup.id) {
                    removeModule(activePopup.id);
                    closeAllPopups();
                  }
                }}
                style={{ width: '100%' }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 모듈 데이터가 없으면 렌더링하지 않음
  if (!currentPlacedModule || !moduleData) {
    return null;
  }

  const handleClose = () => {
    // 패널 강조 해제
    setHighlightedPanel(null);
    setSelectedPanelIndex(null);
    closeAllPopups();
  };

  const handleCancel = () => {
    // 패널 강조 해제
    setHighlightedPanel(null);
    setSelectedPanelIndex(null);

    // 취소 시 모든 값을 원래 값으로 복원
    if (currentPlacedModule) {
      updatePlacedModule(currentPlacedModule.id, {
        customDepth: originalCustomDepth,
        customWidth: originalCustomWidth,
        lowerSectionDepth: originalLowerSectionDepth,
        upperSectionDepth: originalUpperSectionDepth,
        lowerSectionDepthDirection: originalLowerDepthDirection,
        upperSectionDepthDirection: originalUpperDepthDirection,
        hingePosition: originalHingePosition,
        hasDoor: originalHasDoor,
        doorSplit: originalDoorSplit,
        hasGapBackPanel: originalHasGapBackPanel,
        backPanelThickness: originalBackPanelThickness,
        doorTopGap: originalDoorTopGap,
        doorBottomGap: originalDoorBottomGap,
        upperDoorTopGap: originalUpperDoorTopGap,
        upperDoorBottomGap: originalUpperDoorBottomGap,
        lowerDoorTopGap: originalLowerDoorTopGap,
        lowerDoorBottomGap: originalLowerDoorBottomGap,
        doorSettingMode: originalDoorSettingMode,
        doorOverlayLeft: originalDoorOverlayLeft,
        doorOverlayRight: originalDoorOverlayRight,
        doorOverlayTop: originalDoorOverlayTop,
        doorOverlayBottom: originalDoorOverlayBottom
      });
    }
    closeAllPopups();
  };

  const handleDeleteClick = () => {
    if (activePopup.id) {
      removeModule(activePopup.id);
      closeAllPopups();
    }
  };

  const handleCustomDepthChange = (newDepth: number) => {
    const oldDepth = customDepth;
    setCustomDepth(newDepth);
    if (activePopup.id) {
      const updates: Record<string, any> = { customDepth: newDepth };
      // 2섹션 가구: 섹션 깊이가 이전 전체 깊이와 같으면(기본값 그대로) 같이 변경
      if (currentPlacedModule) {
        const lowerD = currentPlacedModule.lowerSectionDepth;
        const upperD = currentPlacedModule.upperSectionDepth;
        if (lowerD !== undefined && lowerD === oldDepth) {
          updates.lowerSectionDepth = newDepth;
          setLowerSectionDepth(newDepth);
          setLowerDepthInput(newDepth.toString());
        }
        if (upperD !== undefined && upperD === oldDepth) {
          updates.upperSectionDepth = newDepth;
          setUpperSectionDepth(newDepth);
          setUpperDepthInput(newDepth.toString());
        }
        // horizontalSplit 서브박스 깊이도 동기화
        if (currentPlacedModule.customConfig) {
          const newSections = currentPlacedModule.customConfig.sections.map((sec: any) => {
            if (!sec.horizontalSplit) return sec;
            const hs = { ...sec.horizontalSplit };
            if (hs.leftDepth === oldDepth) hs.leftDepth = newDepth;
            if (hs.rightDepth === oldDepth) hs.rightDepth = newDepth;
            if (hs.centerDepth === oldDepth) hs.centerDepth = newDepth;
            return { ...sec, horizontalSplit: hs };
          });
          updates.customConfig = { ...currentPlacedModule.customConfig, sections: newSections };
        }
      }
      updatePlacedModule(activePopup.id, updates);
    }
  };

  const handleCustomWidthChange = (newWidth: number) => {
    setCustomWidth(newWidth);
    if (activePopup.id) {
      // 기존 customDepth 유지
      const updateData: any = { 
        customWidth: newWidth,
        isSplit: true // 너비가 조정되면 분할 상태로 표시
      };
      
      // 기존 customDepth가 있으면 유지
      if (currentPlacedModule.customDepth !== undefined) {
        updateData.customDepth = currentPlacedModule.customDepth;
      }
      
      updatePlacedModule(activePopup.id, updateData);
      
// console.log('📏 가구 너비 조정:', {
        // originalWidth: moduleData.dimensions.width,
        // newWidth,
        // columnPosition: slotInfo?.column?.position,
        // customDepth: currentPlacedModule.customDepth
      // });
    }
  };

  // 깊이 입력 필드 처리
  const handleDepthInputChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setDepthInputValue(value);
      setDepthError('');
    }
  };

  const handleDepthInputBlur = () => {
    const value = depthInputValue;
    if (value === '') {
      // 빈 값인 경우 기존 값으로 되돌림
      setDepthInputValue(customDepth.toString());
      return;
    }

    const numValue = parseInt(value);
    const minDepth = FURNITURE_LIMITS.DEPTH.MIN;
    const maxDepth = Math.min(spaceInfo.depth, FURNITURE_LIMITS.DEPTH.MAX);

    // 범위 검증
    if (numValue < minDepth) {
      setDepthError(t('furniture.minValue', { value: minDepth }));
    } else if (numValue > maxDepth) {
      setDepthError(t('furniture.maxValue', { value: maxDepth }));
    } else {
      setDepthError('');
      handleCustomDepthChange(numValue);
    }
  };

  const handleDepthKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDepthInputBlur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseInt(depthInputValue, 10) || customDepth;
      const minD = FURNITURE_LIMITS.DEPTH.MIN;
      const maxD = Math.min(spaceInfo.depth, FURNITURE_LIMITS.DEPTH.MAX);
      const next = Math.max(minD, Math.min(maxD, cur + (e.key === 'ArrowUp' ? 1 : -1)));
      setDepthInputValue(next.toString());
      setDepthError('');
      handleCustomDepthChange(next);
    }
  };

  // 도어 갭 입력 핸들러
  const handleDoorTopGapChange = (value: string) => {
    // 백스페이스 포함 모든 입력 허용
    setDoorTopGapInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
      setDoorTopGap(numValue);
      updatePlacedModule(currentPlacedModule.id, { doorTopGap: numValue });
    }
  };

  const handleDoorBottomGapChange = (value: string) => {
    // 백스페이스 포함 모든 입력 허용
    setDoorBottomGapInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
      setDoorBottomGap(numValue);
      updatePlacedModule(currentPlacedModule.id, { doorBottomGap: numValue });
    }
  };

  const handleDoorTopGapBlur = () => {
    const value = parseInt(doorTopGapInput);
    if (!isNaN(value) && value >= 0 && currentPlacedModule) {
      setDoorTopGap(value);
      updatePlacedModule(currentPlacedModule.id, { doorTopGap: value });
    } else {
      // 유효하지 않은 값이면 이전 값으로 복원
      setDoorTopGapInput(doorTopGap.toString());
    }
  };

  const handleDoorBottomGapBlur = () => {
    const value = parseInt(doorBottomGapInput);
    if (!isNaN(value) && value >= 0 && currentPlacedModule) {
      setDoorBottomGap(value);
      updatePlacedModule(currentPlacedModule.id, { doorBottomGap: value });
    } else {
      // 유효하지 않은 값이면 이전 값으로 복원
      setDoorBottomGapInput(doorBottomGap.toString());
    }
  };

  const handleDoorTopGapKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const value = parseInt(doorTopGapInput);
      if (!isNaN(value) && value >= 0 && currentPlacedModule) {
        setDoorTopGap(value);
        updatePlacedModule(currentPlacedModule.id, { doorTopGap: value });
      }
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentValue = parseInt(doorTopGapInput) || 0;
      const newValue = currentValue + 1;
      setDoorTopGapInput(newValue.toString());
      setDoorTopGap(newValue);
      if (currentPlacedModule) {
        updatePlacedModule(currentPlacedModule.id, { doorTopGap: newValue });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = parseInt(doorTopGapInput) || 0;
      const newValue = Math.max(0, currentValue - 1);
      setDoorTopGapInput(newValue.toString());
      setDoorTopGap(newValue);
      if (currentPlacedModule) {
        updatePlacedModule(currentPlacedModule.id, { doorTopGap: newValue });
      }
    }
  };

  const handleDoorBottomGapKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const value = parseInt(doorBottomGapInput);
      if (!isNaN(value) && value >= 0 && currentPlacedModule) {
        setDoorBottomGap(value);
        updatePlacedModule(currentPlacedModule.id, { doorBottomGap: value });
      }
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentValue = parseInt(doorBottomGapInput) || 0;
      const newValue = currentValue + 1;
      setDoorBottomGapInput(newValue.toString());
      setDoorBottomGap(newValue);
      if (currentPlacedModule) {
        updatePlacedModule(currentPlacedModule.id, { doorBottomGap: newValue });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = parseInt(doorBottomGapInput) || 0;
      const newValue = Math.max(0, currentValue - 1);
      setDoorBottomGapInput(newValue.toString());
      setDoorBottomGap(newValue);
      if (currentPlacedModule) {
        updatePlacedModule(currentPlacedModule.id, { doorBottomGap: newValue });
      }
    }
  };

  // 도어 셋팅 모드 변경 핸들러
  const handleDoorSettingModeChange = (mode: 'auto' | 'manual') => {
    setDoorSettingMode(mode);
    if (currentPlacedModule) {
      if (mode === 'auto') {
        // 자동 모드로 전환 시 오버레이 값 초기화
        setDoorOverlayLeft(0);
        setDoorOverlayRight(0);
        setDoorOverlayTop(0);
        setDoorOverlayBottom(0);
        setDoorOverlayLeftInput('0');
        setDoorOverlayRightInput('0');
        setDoorOverlayTopInput('0');
        setDoorOverlayBottomInput('0');
        updatePlacedModule(currentPlacedModule.id, {
          doorSettingMode: 'auto',
          doorOverlayLeft: 0,
          doorOverlayRight: 0,
          doorOverlayTop: 0,
          doorOverlayBottom: 0
        });
      } else {
        updatePlacedModule(currentPlacedModule.id, { doorSettingMode: 'manual' });
      }
    }
  };

  // 도어 오버레이 값 변경 핸들러
  const handleDoorOverlayChange = (direction: 'left' | 'right' | 'top' | 'bottom', inputValue: string) => {
    const setInput = { left: setDoorOverlayLeftInput, right: setDoorOverlayRightInput, top: setDoorOverlayTopInput, bottom: setDoorOverlayBottomInput }[direction];
    setInput(inputValue);

    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && currentPlacedModule) {
      const setValue = { left: setDoorOverlayLeft, right: setDoorOverlayRight, top: setDoorOverlayTop, bottom: setDoorOverlayBottom }[direction];
      const propKey = { left: 'doorOverlayLeft', right: 'doorOverlayRight', top: 'doorOverlayTop', bottom: 'doorOverlayBottom' }[direction];
      setValue(numValue);
      updatePlacedModule(currentPlacedModule.id, { [propKey]: numValue });
    }
  };

  const handleDoorOverlayBlur = (direction: 'left' | 'right' | 'top' | 'bottom') => {
    const inputMap = { left: doorOverlayLeftInput, right: doorOverlayRightInput, top: doorOverlayTopInput, bottom: doorOverlayBottomInput };
    const valueMap = { left: doorOverlayLeft, right: doorOverlayRight, top: doorOverlayTop, bottom: doorOverlayBottom };
    const setInputMap = { left: setDoorOverlayLeftInput, right: setDoorOverlayRightInput, top: setDoorOverlayTopInput, bottom: setDoorOverlayBottomInput };
    const numValue = parseFloat(inputMap[direction]);
    if (isNaN(numValue)) {
      setInputMap[direction](valueMap[direction].toString());
    }
  };

  // 섹션 높이 입력 핸들러
  const handleLowerHeightChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setLowerHeightInput(value);
    }
  };

  const handleUpperHeightChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setUpperHeightInput(value);
    }
  };

  // 섹션 깊이 입력 핸들러
  const handleLowerDepthChange = (value: string) => {
// console.log('⬇️⬇️⬇️ [하부 섹션 깊이 변경 시작] value=', value, 'currentPlacedModule.id=', currentPlacedModule?.id);
    setLowerDepthInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
// console.log('🔢 [숫자 파싱] numValue=', numValue, 'isValid=', !isNaN(numValue) && numValue > 0);

    if (!isNaN(numValue) && numValue > 0 && currentPlacedModule) {
// console.log('✅✅✅ [하부 섹션 깊이 적용 시작] numValue=', numValue, 'moduleId=', currentPlacedModule.id);
      setLowerSectionDepth(numValue);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionDepth: numValue });
// console.log('💾 [updatePlacedModule 호출 완료]');
    }
  };

  const handleUpperDepthChange = (value: string) => {
// console.log('⬆️⬆️⬆️ [상부 섹션 깊이 변경 시작] value=', value, 'currentPlacedModule.id=', currentPlacedModule?.id);
    setUpperDepthInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
// console.log('🔢 [숫자 파싱] numValue=', numValue, 'isValid=', !isNaN(numValue) && numValue > 0);

    if (!isNaN(numValue) && numValue > 0 && currentPlacedModule) {
// console.log('✅✅✅ [상부 섹션 깊이 적용 시작] numValue=', numValue, 'moduleId=', currentPlacedModule.id);
      setUpperSectionDepth(numValue);
      updatePlacedModule(currentPlacedModule.id, { upperSectionDepth: numValue });
// console.log('💾 [updatePlacedModule 호출 완료]');
    }
  };

  // ─── 섹션별 치수 핸들러 (자유배치 + customConfig) ───

  // 섹션 높이 변경 (onBlur) — 다른 섹션 높이를 재분배
  const handleSectionHeightBlur = (sIdx: number) => {
    if (!currentPlacedModule?.customConfig) return;
    const cc = currentPlacedModule.customConfig;
    const pt = cc.panelThickness || 18;
    const sections = [...cc.sections];
    const inputVal = parseInt(sectionHeightInputs[sIdx] || '0', 10);
    if (isNaN(inputVal) || inputVal < 100) {
      // 유효하지 않으면 원래값 복원
      const orig = sections[sIdx].height + 2 * pt;
      setSectionHeightInputs(prev => ({ ...prev, [sIdx]: Math.round(orig).toString() }));
      return;
    }
    const newInnerH = inputVal - 2 * pt;
    if (newInnerH < 50) return;

    const totalH = currentPlacedModule.freeHeight || 2000;
    const sectionCount = sections.length;
    const oldInnerH = sections[sIdx].height;
    const diff = newInnerH - oldInnerH;

    // 다른 섹션에서 diff만큼 빼기 (비율로 분배)
    const otherIndices = sections.map((_, i) => i).filter(i => i !== sIdx);
    const otherTotal = otherIndices.reduce((sum, i) => sum + sections[i].height, 0);
    if (otherTotal - diff < otherIndices.length * 50) return; // 다른 섹션 최소 50mm

    sections[sIdx] = { ...sections[sIdx], height: newInnerH };
    otherIndices.forEach(i => {
      const ratio = otherTotal > 0 ? sections[i].height / otherTotal : 1 / otherIndices.length;
      sections[i] = { ...sections[i], height: Math.round(sections[i].height - diff * ratio) };
    });
    // 반올림 오차 보정
    const allocated = sections.reduce((sum, s) => sum + s.height, 0);
    const totalInner = totalH - sectionCount * 2 * pt - (cc.sectionGap || 0) * (sectionCount - 1);
    const remainder = totalInner - allocated;
    if (Math.abs(remainder) > 0) {
      const lastOther = otherIndices[otherIndices.length - 1];
      sections[lastOther] = { ...sections[lastOther], height: sections[lastOther].height + remainder };
    }

    const newConfig = { ...cc, sections };
    updatePlacedModule(currentPlacedModule.id, { customConfig: newConfig });
    // 모든 입력 갱신
    const hInputs: Record<number, string> = {};
    sections.forEach((s, i) => { hInputs[i] = Math.round(s.height + 2 * pt).toString(); });
    setSectionHeightInputs(hInputs);
  };

  // 섹션 깊이 변경 (onBlur)
  const handleSectionDepthBlur = (sIdx: number) => {
    if (!currentPlacedModule) return;
    const val = parseInt(sectionDepthInputs[sIdx] || '0', 10);
    if (isNaN(val) || val < 100 || val > 800) {
      const orig = sIdx === 0
        ? (currentPlacedModule.lowerSectionDepth || currentPlacedModule.freeDepth || 580)
        : (currentPlacedModule.upperSectionDepth || currentPlacedModule.freeDepth || 580);
      setSectionDepthInputs(prev => ({ ...prev, [sIdx]: Math.round(orig).toString() }));
      return;
    }
    if (sIdx === 0) {
      setLowerSectionDepth(val);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionDepth: val });
      setLowerDepthInput(val.toString());
    } else if (sIdx === 1) {
      setUpperSectionDepth(val);
      updatePlacedModule(currentPlacedModule.id, { upperSectionDepth: val });
      setUpperDepthInput(val.toString());
    }
  };

  // 섹션 너비 변경 (onBlur) — 전체 가구 너비 변경
  const handleSectionWidthBlur = (sIdx: number) => {
    if (!currentPlacedModule?.customConfig) return;
    const val = parseInt(sectionWidthInputs[sIdx] || '0', 10);
    if (isNaN(val) || val < 100 || val > 2400) {
      const cc = currentPlacedModule.customConfig;
      const orig = cc.sections[sIdx]?.width || currentPlacedModule.freeWidth || 600;
      setSectionWidthInputs(prev => ({ ...prev, [sIdx]: Math.round(orig).toString() }));
      return;
    }
    const cc = currentPlacedModule.customConfig;
    const sections = cc.sections.map((s: any, i: number) => {
      if (i === sIdx) return { ...s, width: val };
      return { ...s, width: val }; // 모든 섹션 너비 연동
    });
    const newConfig = { ...cc, sections };
    // store에서 최신 모듈 가져오기 (stale state 방지)
    const fm = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule.id) || currentPlacedModule;
    const fa = useFurnitureStore.getState().placedModules;
    const freshSpaceInfo = useSpaceConfigStore.getState().spaceInfo;
    const newX = calcResizedPositionX(fm, val, fa, freshSpaceInfo);
    updatePlacedModule(currentPlacedModule.id, {
      customConfig: newConfig,
      freeWidth: val,
      moduleWidth: val,
      position: { ...fm.position, x: newX },
    });
    setFreeWidthInput(val.toString());
    // 모든 섹션 너비 입력 동기화
    const wInputs: Record<number, string> = {};
    sections.forEach((_: any, i: number) => { wInputs[i] = val.toString(); });
    setSectionWidthInputs(wInputs);
  };

  // horizontalSplit 좌측 너비 변경 (onBlur) — 우측이 자동 조정
  const handleHsLeftWidthBlur = (sIdx: number) => {
    if (!currentPlacedModule?.customConfig) return;
    const cc = currentPlacedModule.customConfig;
    const sec = cc.sections[sIdx];
    if (!sec?.horizontalSplit) return;
    const pt = cc.panelThickness || 18;
    const sectionW = sec.width || currentPlacedModule.freeWidth || 600;
    const innerW = sectionW - 2 * pt;
    const val = parseInt(hsLeftWidthInput[sIdx] || '0', 10);
    if (isNaN(val) || val < 50) {
      setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: Math.round(sec.horizontalSplit!.position || innerW / 2).toString() }));
      return;
    }
    const has3Split = !!sec.horizontalSplit.secondPosition;
    const maxLeft = has3Split
      ? innerW - (sec.horizontalSplit.secondPosition || 0) - 2 * pt - 50
      : innerW - pt - 50;
    const clamped = Math.min(val, maxLeft);
    const hs = { ...sec.horizontalSplit, position: clamped };
    const newSections = cc.sections.map((s: any, i: number) =>
      i === sIdx ? { ...s, horizontalSplit: hs } : s
    );
    updatePlacedModule(currentPlacedModule.id, { customConfig: { ...cc, sections: newSections } });
    setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: clamped.toString() }));
    // 우측 자동 업데이트
    const rightW = has3Split
      ? innerW - clamped - (hs.secondPosition || 0) - 2 * pt
      : innerW - clamped - pt;
    setHsRightWidthInput(prev => ({ ...prev, [sIdx]: Math.round(rightW).toString() }));
  };

  // horizontalSplit 우측 너비 변경 (onBlur) — 좌측이 자동 조정
  const handleHsRightWidthBlur = (sIdx: number) => {
    if (!currentPlacedModule?.customConfig) return;
    const cc = currentPlacedModule.customConfig;
    const sec = cc.sections[sIdx];
    if (!sec?.horizontalSplit) return;
    const pt = cc.panelThickness || 18;
    const sectionW = sec.width || currentPlacedModule.freeWidth || 600;
    const innerW = sectionW - 2 * pt;
    const val = parseInt(hsRightWidthInput[sIdx] || '0', 10);
    if (isNaN(val) || val < 50) {
      const origRight = sec.horizontalSplit.secondPosition
        ? innerW - (sec.horizontalSplit.position || 0) - (sec.horizontalSplit.secondPosition || 0) - 2 * pt
        : innerW - (sec.horizontalSplit.position || innerW / 2) - pt;
      setHsRightWidthInput(prev => ({ ...prev, [sIdx]: Math.round(origRight).toString() }));
      return;
    }
    const has3Split = !!sec.horizontalSplit.secondPosition;
    const maxRight = has3Split
      ? innerW - (sec.horizontalSplit.secondPosition || 0) - 2 * pt - 50
      : innerW - pt - 50;
    const clamped = Math.min(val, maxRight);
    const newLeftW = has3Split
      ? innerW - clamped - (sec.horizontalSplit.secondPosition || 0) - 2 * pt
      : innerW - clamped - pt;
    const hs = { ...sec.horizontalSplit, position: Math.max(50, newLeftW) };
    const newSections = cc.sections.map((s: any, i: number) =>
      i === sIdx ? { ...s, horizontalSplit: hs } : s
    );
    updatePlacedModule(currentPlacedModule.id, { customConfig: { ...cc, sections: newSections } });
    setHsRightWidthInput(prev => ({ ...prev, [sIdx]: clamped.toString() }));
    setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: Math.max(50, newLeftW).toString() }));
  };

  // horizontalSplit 서브박스 깊이 변경 (onBlur)
  const handleHsDepthBlur = (sIdx: number, side: 'left' | 'right' | 'center') => {
    if (!currentPlacedModule?.customConfig) return;
    const cc = currentPlacedModule.customConfig;
    const sec = cc.sections[sIdx];
    if (!sec?.horizontalSplit) return;
    const inputMap = { left: hsLeftDepthInput, right: hsRightDepthInput, center: hsCenterDepthInput };
    const val = parseInt(inputMap[side][sIdx] || '0', 10);
    const totalDepth = currentPlacedModule.freeDepth || 580;
    if (isNaN(val) || val < 100 || val > 800) {
      const orig = (sec.horizontalSplit as any)[`${side}Depth`] || totalDepth;
      const setMap = { left: setHsLeftDepthInput, right: setHsRightDepthInput, center: setHsCenterDepthInput };
      setMap[side](prev => ({ ...prev, [sIdx]: Math.round(orig).toString() }));
      return;
    }
    const hs = { ...sec.horizontalSplit, [`${side}Depth`]: val };
    const newSections = cc.sections.map((s: any, i: number) =>
      i === sIdx ? { ...s, horizontalSplit: hs } : s
    );
    updatePlacedModule(currentPlacedModule.id, { customConfig: { ...cc, sections: newSections } });
  };

  const handleLowerTopOffsetChange = (value: string) => {
    if (value === '' || /^-?\d+$/.test(value)) {
      setLowerTopOffsetInput(value);

      const numValue = parseInt(value, 10);
      if (!isNaN(numValue) && currentPlacedModule) {
        setLowerTopOffset(numValue);
        updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: numValue });
      }
    }
  };

  const handleLowerTopOffsetBlur = () => {
    if (lowerTopOffsetInput === '') {
      setLowerTopOffsetInput(lowerTopOffset.toString());
      return;
    }

    const numValue = parseInt(lowerTopOffsetInput, 10);
    if (isNaN(numValue)) {
      setLowerTopOffsetInput(lowerTopOffset.toString());
    } else if (currentPlacedModule) {
      setLowerTopOffset(numValue);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: numValue });
    }
  };

  const handleLowerTopOffsetKeyDown = (e: React.KeyboardEvent) => {
    if (!currentPlacedModule) return;

    if (e.key === 'Enter') {
      handleLowerTopOffsetBlur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = parseInt(lowerTopOffsetInput, 10) || 0;
      const nextValue = currentValue + (e.key === 'ArrowUp' ? 1 : -1);
      setLowerTopOffsetInput(nextValue.toString());
      setLowerTopOffset(nextValue);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: nextValue });
    }
  };

  // 너비 입력 필드 처리
  const handleWidthInputChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setWidthInputValue(value);
      setWidthError('');
    }
  };

  const handleWidthInputBlur = () => {
    const value = widthInputValue;
    if (value === '') {
      // 빈 값인 경우 기존 값으로 되돌림
      setWidthInputValue(customWidth.toString());
      return;
    }
    
    const numValue = parseInt(value);
    const minWidth = 150; // 최소 너비
    const maxWidth = moduleData.dimensions.width; // 최대 너비는 원래 크기
    
    // 범위 검증
    if (numValue < minWidth) {
      setWidthError(t('furniture.minValue', { value: minWidth }));
    } else if (numValue > maxWidth) {
      setWidthError(t('furniture.maxValue', { value: maxWidth }));
    } else {
      setWidthError('');
      handleCustomWidthChange(numValue);
    }
  };

  const handleWidthKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleWidthInputBlur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseInt(widthInputValue, 10) || customWidth;
      const minW = 150;
      const maxW = moduleData?.dimensions?.width || 2400;
      const next = Math.max(minW, Math.min(maxW, cur + (e.key === 'ArrowUp' ? 1 : -1)));
      setWidthInputValue(next.toString());
      handleCustomWidthChange(next);
    }
  };

  const handleHingePositionChange = (position: 'left' | 'right') => {
    setHingePosition(position);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hingePosition: position });
    }
  };

  const handleHingeTypeChange = (type: 'A' | 'B') => {
    setHingeType(type);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hingeType: type });
    }
  };

  const handleDoorChange = (doorEnabled: boolean) => {
    setHasDoor(doorEnabled);
    if (activePopup.id) {
      // 현재 showDimensions 상태 저장
      const currentShowDimensions = useUIStore.getState().showDimensions;
      
      updatePlacedModule(activePopup.id, { hasDoor: doorEnabled });
      
      // showDimensions 상태 복원 (도어 변경이 슬롯 가이드를 끄지 않도록)
      useUIStore.getState().setShowDimensions(currentShowDimensions);
    }
  };

  const handleGapBackPanelChange = (gapBackPanelEnabled: boolean) => {
    setHasGapBackPanel(gapBackPanelEnabled);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hasGapBackPanel: gapBackPanelEnabled });
    }
  };

  const handleBackPanelThicknessChange = (thickness: number) => {
    setBackPanelThicknessValue(thickness);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { backPanelThickness: thickness });
    }
  };

  // 기둥 C 배치 모드 변경 핸들러
  const handleColumnPlacementModeChange = (mode: 'beside' | 'front') => {
    setColumnPlacementMode(mode);
    if (activePopup.id && slotInfo && currentPlacedModule) {
      const indexing = calculateSpaceIndexing(spaceInfo);
      const slotWidth = indexing.columnWidth; // 슬롯 전체 너비 (586mm)
      const columnDepth = slotInfo.column?.depth || 300; // 기둥 깊이 (300mm)
      const remainingDepth = 730 - columnDepth; // 남은 깊이 (430mm)

      // 슬롯 중심 위치 계산 (치수가이드 동기화용)
      const slotIndex = currentPlacedModule.slotIndex;
      const slotCenterX = slotIndex !== undefined && indexing.threeUnitPositions[slotIndex] !== undefined
        ? indexing.threeUnitPositions[slotIndex]
        : currentPlacedModule.position.x;

      if (mode === 'front') {
        // 기둥 앞에 배치: 폭은 슬롯 전체, 깊이는 줄임, 위치는 슬롯 중심
        // 도어가 BoxModule 내부에서 렌더링되도록 adjustedWidth와 columnSlotInfo 클리어
        updatePlacedModule(activePopup.id, {
          columnPlacementMode: mode,
          customWidth: slotWidth, // 586mm (슬롯 전체)
          customDepth: remainingDepth, // 430mm (730 - 300)
          lowerSectionDepth: remainingDepth, // 하부 섹션 깊이도 430mm
          upperSectionDepth: remainingDepth, // 상부 섹션 깊이도 430mm
          adjustedWidth: undefined, // 폭 조정 해제 (도어가 BoxModule 내부에서 렌더링되도록)
          columnSlotInfo: undefined, // 기둥 슬롯 정보 클리어
          position: {
            ...currentPlacedModule.position,
            x: slotCenterX // 슬롯 중심으로 위치 업데이트 (치수가이드 동기화)
          }
        });
        // UI 입력 필드도 업데이트
        setCustomWidth(slotWidth.toString());
        setLowerSectionDepth(remainingDepth.toString());
        setUpperSectionDepth(remainingDepth.toString());
      } else {
        // 기둥 측면 배치: 폭은 줄임, 깊이는 원래대로
        const availableWidth = slotInfo.availableWidth || (slotWidth - 200); // 기둥 침범 후 가용 폭
        const originalDepth = moduleData?.dimensions.depth || 600;

        // 위치 계산 (FurnitureItem.tsx와 동일한 로직)
        const widthReduction = slotWidth - availableWidth;
        const halfReductionUnits = (widthReduction / 2) * 0.01; // mm를 Three.js 단위로 변환

        let besidePositionX = slotCenterX;
        if (slotInfo.intrusionDirection === 'from-left') {
          // 기둥이 왼쪽에서 침범 - 가구를 오른쪽으로 이동
          besidePositionX = slotCenterX + halfReductionUnits;
        } else if (slotInfo.intrusionDirection === 'from-right') {
          // 기둥이 오른쪽에서 침범 - 가구를 왼쪽으로 이동
          besidePositionX = slotCenterX - halfReductionUnits;
        }

        updatePlacedModule(activePopup.id, {
          columnPlacementMode: mode,
          customWidth: availableWidth, // 줄어든 폭
          customDepth: undefined, // 깊이 원래대로
          lowerSectionDepth: undefined, // 섹션 깊이 원래대로
          upperSectionDepth: undefined, // 섹션 깊이 원래대로
          adjustedWidth: availableWidth, // beside 모드에서 폭 조정
          position: {
            ...currentPlacedModule.position,
            x: besidePositionX // 기둥 침범 방향에 따른 위치
          }
        });
        // UI 입력 필드도 업데이트
        setCustomWidth(availableWidth.toString());
        setLowerSectionDepth(originalDepth.toString());
        setUpperSectionDepth(originalDepth.toString());
      }
    }
  };


  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerTabs}>
            <button
              className={`${styles.tabButton} ${!showDetails ? styles.activeTab : ''}`}
              onClick={() => {
                setShowDetails(false);
                if (activePopup?.type === 'furnitureEdit' && activePopup.id) {
                  setSelectedFurnitureId(activePopup.id);
                }
              }}
            >
              {t('furniture.editFurniture')}
            </button>
            <button
              className={`${styles.tabButton} ${showDetails ? styles.activeTab : ''}`}
              onClick={() => {
                setShowDetails(true);
                if (activePopup?.type === 'furnitureEdit' && activePopup.id) {
                  setSelectedFurnitureId(activePopup.id);
                }
              }}
            >
              {t('furniture.viewDetails')}
            </button>
          </div>
          <button className={styles.closeButton} onClick={handleClose} aria-label="닫기"></button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.moduleInfo}>
            <div className={styles.modulePreview}>
              <img 
                src={getFurnitureImagePath(moduleData.id)}
                alt={moduleData.name}
                className={styles.moduleImage}
                onError={(e) => {
                  // 이미지 로드 실패 시 기본 색상 박스로 대체
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                  const container = img.parentElement;
                  if (container) {
                    container.innerHTML = `<div 
                      class="${styles.moduleBox}"
                      style="
                        background-color: ${moduleData.color};
                        aspect-ratio: ${moduleData.dimensions.width} / ${moduleData.dimensions.height}
                      "
                    ></div>`;
                  }
                }}
              />
            </div>
            
            <div className={styles.moduleDetails}>
              <h4 className={styles.moduleName}>
                {customWidth && customWidth !== moduleData.dimensions.width
                  ? moduleData.name.replace(/[\d.]+mm/, `${customWidth}mm`)
                  : moduleData.name}
              </h4>
              
              <div className={styles.property}>
                <span className={styles.propertyValue}>
                  {customWidth} × {moduleData.dimensions.height} × {customDepth}mm
                </span>
              </div>
            </div>
          </div>
          
          {/* 상세보기 패널 */}
          {showDetails && (() => {
            // 실제 패널 개수 계산 (섹션 구분자와 정보성 항목 제외)
            const actualPanelCount = allPanelDetails.filter(panel =>
              !panel.name?.startsWith('===') && !panel.isInfo
            ).length;

            return (
              <div className={styles.detailsSection}>
                <h5 className={styles.sectionTitle}>
                  {t('furniture.panelDetails')} (총 {actualPanelCount}장)
                </h5>
                <div className={styles.panelList}>
                  {allPanelDetails.map((panel, index) => {
                  // 섹션 구분자인 경우
                  if (panel.name && panel.name.startsWith('===')) {
                    // 현재 섹션부터 다음 섹션 구분자 전까지의 실제 패널 개수 계산
                    let sectionPanelCount = 0;
                    for (let i = index + 1; i < allPanelDetails.length; i++) {
                      if (allPanelDetails[i].name?.startsWith('===')) break;
                      if (!allPanelDetails[i].isInfo) sectionPanelCount++;
                    }

                    return (
                      <div key={index} className={styles.panelSectionHeader}>
                        <strong>{panel.name.replace(/=/g, '').trim()} (총 {sectionPanelCount}장)</strong>
                      </div>
                    );
                  }
                  
                  // 정보성 항목인 경우 (오픈 공간 등)
                  if (panel.isInfo) {
                    return (
                      <div
                        key={index}
                        className={`${styles.panelItem} ${selectedPanelIndex === index ? styles.panelItemSelected : selectedPanelIndex !== null ? styles.panelItemDimmed : ''}`}
                        onClick={() => {
                          const newIndex = selectedPanelIndex === index ? null : index;
                          setSelectedPanelIndex(newIndex);

                          // 3D 뷰어 강조용: 패널 정보를 uiStore에 저장
                          if (newIndex !== null && currentPlacedModule && panel.name) {
                            const panelId = `${currentPlacedModule.id}-${panel.name}`;
// console.log('🎯 패널 강조 설정 (정보성):', panelId);
                            setHighlightedPanel(panelId);
                          } else {
// console.log('🎯 패널 강조 해제');
                            setHighlightedPanel(null);
                          }
                        }}
                      >
                        <span className={styles.panelName}>{panel.name}:</span>
                        <span className={styles.panelSize}>
                          {panel.description && panel.height ? `${panel.description} ${panel.height}mm` : panel.description || ''}
                        </span>
                      </div>
                    );
                  }

                  // 일반 패널
                  const defaultDirection = getDefaultGrainDirection(panel.name);
                  const currentDirection = currentPlacedModule?.panelGrainDirections?.[panel.name] || defaultDirection;

                  // 디버그: 마이다 패널 정보 출력
                  if (panel.name.includes('마이다')) {
// console.log('🎯 마이다 패널:', {
                      // name: panel.name,
                      // width: panel.width,
                      // height: panel.height,
                      // defaultDirection,
                      // currentDirection,
                      // storedDirection: currentPlacedModule?.panelGrainDirections?.[panel.name]
                    // });
                  }

                  // 결 방향에 따라 W/L 레이블 결정
                  const isVerticalGrain = currentDirection === 'vertical';

                  // W/L 표시 로직
                  // - 일반 가구 패널: height가 긴쪽(L)
                  // - 서랍 패널 특수 케이스: width 또는 depth가 긴쪽(L)
                  let dimensionDisplay = '';

                  // 서랍 패널인지 확인
                  const isDrawerPanel = panel.name.includes('서랍');

                  if (panel.diameter) {
                    dimensionDisplay = `Φ ${panel.diameter} × L ${panel.width}`;
                  } else if (panel.width && panel.height) {
                    // width/height를 가진 패널
                    if (isDrawerPanel) {
                      // 서랍 패널 (마이다, 앞판, 뒷판): width가 가로(긴쪽 L), height가 세로(짧은쪽 W)
                      if (isVerticalGrain) {
                        // L 방향: width가 긴쪽
                        dimensionDisplay = `W ${panel.height} × L ${panel.width}`;
                      } else {
                        // W 방향: height가 짧은쪽
                        dimensionDisplay = `W ${panel.width} × L ${panel.height}`;
                      }
                    } else {
                      // 일반 가구 패널: height가 세로(긴쪽 L), width가 가로(짧은쪽 W)
                      if (isVerticalGrain) {
                        // L 방향: height가 긴쪽
                        dimensionDisplay = `W ${panel.width} × L ${panel.height}`;
                      } else {
                        // W 방향: width가 짧은쪽
                        dimensionDisplay = `W ${panel.height} × L ${panel.width}`;
                      }
                    }
                  } else if (panel.width && panel.depth) {
                    // width/depth를 가진 패널 (상판, 바닥판, 선반)
                    // 가로로 긴 패널: width가 긴쪽(L)
                    if (isVerticalGrain) {
                      // L 방향: width가 긴쪽
                      dimensionDisplay = `W ${panel.depth} × L ${panel.width}`;
                    } else {
                      // W 방향: depth가 짧은쪽
                      dimensionDisplay = `W ${panel.width} × L ${panel.depth}`;
                    }
                  } else if (panel.height && panel.depth) {
                    // height/depth를 가진 패널
                    if (isDrawerPanel) {
                      // 서랍 측판: depth가 깊이(긴쪽 L), height가 세로(짧은쪽 W)
                      if (isVerticalGrain) {
                        // L 방향: depth가 긴쪽
                        dimensionDisplay = `W ${panel.height} × L ${panel.depth}`;
                      } else {
                        // W 방향: height가 짧은쪽
                        dimensionDisplay = `W ${panel.depth} × L ${panel.height}`;
                      }
                    } else {
                      // 일반 가구 측판: height가 세로(긴쪽 L), depth가 깊이(짧은쪽 W)
                      dimensionDisplay = `W ${panel.depth} × L ${panel.height}`;
                    }
                  } else if (panel.description) {
                    dimensionDisplay = panel.description;
                  } else {
                    dimensionDisplay = `${panel.width || panel.height || panel.depth}`;
                  }

                  return (
                    <div
                      key={index}
                      className={`${styles.panelItem} ${selectedPanelIndex === index ? styles.panelItemSelected : selectedPanelIndex !== null ? styles.panelItemDimmed : ''}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                      onClick={() => {
                        const newIndex = selectedPanelIndex === index ? null : index;
                        setSelectedPanelIndex(newIndex);

                        // 3D 뷰어 강조용: 패널 정보를 uiStore에 저장
                        if (newIndex !== null && currentPlacedModule && panel.name) {
                          const panelId = `${currentPlacedModule.id}-${panel.name}`;
// console.log('🎯 패널 강조 설정 (일반):', panelId);
                          setHighlightedPanel(panelId);
                        } else {
// console.log('🎯 패널 강조 해제');
                          setHighlightedPanel(null);
                        }
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <span className={styles.panelName}>{panel.name}:</span>
                        <span className={styles.panelSize}>
                          {dimensionDisplay}
                          {panel.thickness && panel.showThickness !== false && !panel.diameter && ` (T: ${panel.thickness})`}
                          {panel.material && ` [${panel.material}]`}
                        </span>
                      </div>
                      <button
                        style={{
                          padding: '4px 8px',
                          background: currentDirection === 'vertical' ? '#4CAF50' : '#2196F3',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          minWidth: '50px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '2px'
                        }}
                        onClick={(e) => {
                          e.stopPropagation(); // 패널 선택 방지
                          if (!currentPlacedModule) return;
                          const newDirection = currentDirection === 'horizontal' ? 'vertical' : 'horizontal';
                          const newDirections = {
                            ...(currentPlacedModule.panelGrainDirections || {}),
                            [panel.name]: newDirection
                          };
                          updatePlacedModule(currentPlacedModule.id, { panelGrainDirections: newDirections });
                        }}
                        title={`${panel.name} 나무결 방향 전환`}
                      >
                        <span style={{ fontSize: '11px', lineHeight: '18px' }}>{currentDirection === 'vertical' ? 'L' : 'W'}</span>
                        <span style={{ fontSize: '18px', lineHeight: '18px' }}>{currentDirection === 'vertical' ? '↓' : '→'}</span>
                      </button>
                    </div>
                  );
                  })}
                </div>
              </div>
            );
          })()}
          
          {/* 너비 설정 (기둥 C인 경우만 표시) */}
          {isColumnC && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>{t('furniture.widthSettings')}</h5>
              <div className={styles.depthInputWrapper}>
                <div className={styles.inputWithUnit}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={widthInputValue}
                    onChange={(e) => handleWidthInputChange(e.target.value)}
                    onBlur={handleWidthInputBlur}
                    onKeyDown={handleWidthKeyDown}
                    className={`${styles.depthInput} furniture-depth-input ${widthError ? styles.inputError : ''}`}
                    placeholder={`150-${moduleData.dimensions.width}`}
                    style={{
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      WebkitTextFillColor: '#000000',
                      opacity: 1
                    }}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
                {widthError && <div className={styles.errorMessage}>{widthError}</div>}
                <div className={styles.depthRange}>
                  {t('furniture.range')}: 150mm ~ {moduleData.dimensions.width}mm
                </div>
              </div>
            </div>
          )}

          {/* 가구 치수 편집 — 한 줄 가로 배치 */}
          {currentPlacedModule && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>가구 치수</h5>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {/* 너비 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', marginBottom: '1px' }}>W</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeWidthInput}
                      onChange={(e) => setFreeWidthInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeWidthInput, 10);
                        if (!isNaN(val) && val >= 100 && val <= 2400 && currentPlacedModule) {
                          // store에서 최신 모듈/spaceInfo 가져오기 (stale state 방지)
                          const freshModule = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule.id) || currentPlacedModule;
                          const freshAll = useFurnitureStore.getState().placedModules;
                          const freshSI = useSpaceConfigStore.getState().spaceInfo;
                          const newX = freshModule.isFreePlacement
                            ? calcResizedPositionX(freshModule, val, freshAll, freshSI)
                            : freshModule.position.x;
                          updatePlacedModule(currentPlacedModule.id, {
                            freeWidth: val,
                            moduleWidth: val,
                            position: { ...freshModule.position, x: newX },
                          });
                          setFreeWidthInput(val.toString());
                          const store = useFurnitureStore.getState();
                          const dims = {
                            width: val,
                            height: currentPlacedModule.freeHeight || moduleData.dimensions.height,
                            depth: currentPlacedModule.freeDepth || moduleData.dimensions.depth,
                          };
                          if (isCustomizableModuleId(currentPlacedModule.moduleId)) {
                            const key = getCustomDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(key, dims);
                            if (key === 'full-dual') {
                              store.setLastCustomDimensions('full-single', { ...dims, width: Math.round(val / 2) });
                            } else if (key === 'full-single') {
                              store.setLastCustomDimensions('full-dual', { ...dims, width: val * 2 });
                            }
                          } else {
                            const stdKey = getStandardDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(stdKey, dims);
                            if (stdKey === 'std-dual-full') {
                              store.setLastCustomDimensions('std-single-full', { ...dims, width: Math.round(val / 2) });
                            } else if (stdKey === 'std-single-full') {
                              store.setLastCustomDimensions('std-dual-full', { ...dims, width: val * 2 });
                            } else if (stdKey === 'std-dual-upper') {
                              store.setLastCustomDimensions('std-single-upper', { ...dims, width: Math.round(val / 2) });
                            } else if (stdKey === 'std-single-upper') {
                              store.setLastCustomDimensions('std-dual-upper', { ...dims, width: val * 2 });
                            } else if (stdKey === 'std-dual-lower') {
                              store.setLastCustomDimensions('std-single-lower', { ...dims, width: Math.round(val / 2) });
                            } else if (stdKey === 'std-single-lower') {
                              store.setLastCustomDimensions('std-dual-lower', { ...dims, width: val * 2 });
                            }
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          // store에서 최신 너비 읽기 (React state 대신)
                          const freshMod = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule?.id);
                          const curW = freshMod?.freeWidth || parseInt(freeWidthInput, 10) || (currentPlacedModule?.freeWidth || moduleData.dimensions.width);
                          const next = Math.max(100, Math.min(2400, curW + (e.key === 'ArrowUp' ? 1 : -1)));
                          setFreeWidthInput(next.toString());
                          if (currentPlacedModule && freshMod) {
                            const freshAll = useFurnitureStore.getState().placedModules;
                            const freshSI = useSpaceConfigStore.getState().spaceInfo;
                            const newX = freshMod.isFreePlacement
                              ? calcResizedPositionX(freshMod, next, freshAll, freshSI)
                              : freshMod.position.x;
                            updatePlacedModule(currentPlacedModule.id, {
                              freeWidth: next,
                              moduleWidth: next,
                              position: { ...freshMod.position, x: newX },
                            });
                          }
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="너비"
                      style={{ color: '#000000', backgroundColor: '#ffffff', WebkitTextFillColor: '#000000', opacity: 1, fontSize: '12px', padding: '4px 6px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                {/* 높이 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', marginBottom: '1px' }}>H</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeHeightInput}
                      onChange={(e) => setFreeHeightInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeHeightInput, 10);
                        if (!isNaN(val) && val >= 100 && val <= 3000 && currentPlacedModule) {
                          updatePlacedModule(currentPlacedModule.id, { freeHeight: val });
                          setFreeHeightInput(val.toString());
                          const store = useFurnitureStore.getState();
                          const dims = {
                            width: currentPlacedModule.freeWidth || moduleData.dimensions.width,
                            height: val,
                            depth: currentPlacedModule.freeDepth || moduleData.dimensions.depth,
                          };
                          if (isCustomizableModuleId(currentPlacedModule.moduleId)) {
                            const key = getCustomDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(key, dims);
                            if (key === 'full-dual') {
                              store.setLastCustomDimensions('full-single', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (key === 'full-single') {
                              store.setLastCustomDimensions('full-dual', { ...dims, width: dims.width * 2 });
                            }
                          } else {
                            const stdKey = getStandardDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(stdKey, dims);
                            if (stdKey === 'std-dual-full') {
                              store.setLastCustomDimensions('std-single-full', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-full') {
                              store.setLastCustomDimensions('std-dual-full', { ...dims, width: dims.width * 2 });
                            } else if (stdKey === 'std-dual-upper') {
                              store.setLastCustomDimensions('std-single-upper', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-upper') {
                              store.setLastCustomDimensions('std-dual-upper', { ...dims, width: dims.width * 2 });
                            } else if (stdKey === 'std-dual-lower') {
                              store.setLastCustomDimensions('std-single-lower', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-lower') {
                              store.setLastCustomDimensions('std-dual-lower', { ...dims, width: dims.width * 2 });
                            }
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const cur = parseInt(freeHeightInput, 10) || (currentPlacedModule?.freeHeight || moduleData.dimensions.height);
                          const next = Math.max(100, Math.min(3000, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                          setFreeHeightInput(next.toString());
                          if (currentPlacedModule) {
                            updatePlacedModule(currentPlacedModule.id, { freeHeight: next });
                          }
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="높이"
                      style={{ color: '#000000', backgroundColor: '#ffffff', WebkitTextFillColor: '#000000', opacity: 1, fontSize: '12px', padding: '4px 6px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                {/* 깊이 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', marginBottom: '1px' }}>D</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeDepthInput}
                      onChange={(e) => setFreeDepthInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeDepthInput, 10);
                        if (!isNaN(val) && val >= 100 && val <= 800 && currentPlacedModule) {
                          updatePlacedModule(currentPlacedModule.id, { freeDepth: val });
                          setFreeDepthInput(val.toString());
                          const store = useFurnitureStore.getState();
                          const dims = {
                            width: currentPlacedModule.freeWidth || moduleData.dimensions.width,
                            height: currentPlacedModule.freeHeight || moduleData.dimensions.height,
                            depth: val,
                          };
                          if (isCustomizableModuleId(currentPlacedModule.moduleId)) {
                            const key = getCustomDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(key, dims);
                            if (key === 'full-dual') {
                              store.setLastCustomDimensions('full-single', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (key === 'full-single') {
                              store.setLastCustomDimensions('full-dual', { ...dims, width: dims.width * 2 });
                            }
                          } else {
                            const stdKey = getStandardDimensionKey(currentPlacedModule.moduleId);
                            store.setLastCustomDimensions(stdKey, dims);
                            if (stdKey === 'std-dual-full') {
                              store.setLastCustomDimensions('std-single-full', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-full') {
                              store.setLastCustomDimensions('std-dual-full', { ...dims, width: dims.width * 2 });
                            } else if (stdKey === 'std-dual-upper') {
                              store.setLastCustomDimensions('std-single-upper', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-upper') {
                              store.setLastCustomDimensions('std-dual-upper', { ...dims, width: dims.width * 2 });
                            } else if (stdKey === 'std-dual-lower') {
                              store.setLastCustomDimensions('std-single-lower', { ...dims, width: Math.round(dims.width / 2) });
                            } else if (stdKey === 'std-single-lower') {
                              store.setLastCustomDimensions('std-dual-lower', { ...dims, width: dims.width * 2 });
                            }
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const cur = parseInt(freeDepthInput, 10) || (currentPlacedModule?.freeDepth || moduleData.dimensions.depth);
                          const next = Math.max(100, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                          setFreeDepthInput(next.toString());
                          if (currentPlacedModule) {
                            updatePlacedModule(currentPlacedModule.id, { freeDepth: next });
                          }
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="깊이"
                      style={{ color: '#000000', backgroundColor: '#ffffff', WebkitTextFillColor: '#000000', opacity: 1, fontSize: '12px', padding: '4px 6px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 섹션별 치수 설정 (2섹션 이상 가구: customConfig 또는 modelConfig) */}
          {currentPlacedModule && (() => {
            const cc = currentPlacedModule.customConfig;
            const ccSections = cc?.sections;
            const mcSections = moduleData?.modelConfig?.sections;
            const hasSections = (ccSections && ccSections.length >= 2) || (mcSections && mcSections.length >= 2);
            if (!hasSections) return null;

            // 섹션 소스 결정: customConfig 우선, 없으면 modelConfig
            const isCustom = !!(ccSections && ccSections.length >= 2);
            const sectionCount = isCustom ? ccSections!.length : mcSections!.length;
            const pt = isCustom ? (cc!.panelThickness || 18) : (moduleData?.modelConfig?.basicThickness || 18);
            const totalH = currentPlacedModule.freeHeight || moduleData?.dimensions?.height || 2200;
            const totalW = currentPlacedModule.freeWidth || moduleData?.dimensions?.width || 600;
            const totalD = currentPlacedModule.freeDepth || moduleData?.dimensions?.depth || 580;

            // 표준 가구의 섹션 높이 계산 (비율 기반)
            const getStdSectionHeightMM = (sIdx: number): number => {
              if (!mcSections || mcSections.length < 2) return totalH;
              const sec = mcSections[sIdx];
              const innerH = totalH - 2 * pt; // 상하판 제외
              const dividerH = (mcSections.length - 1) * pt; // 중간 칸막이
              const availH = innerH - dividerH;
              const ht = sec.heightType || 'percentage';
              if (ht === 'absolute') return sec.height || 0;
              const ratio = (sec.height || sec.heightRatio || 50) / 100;
              return Math.round(availH * ratio);
            };

            return (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>섹션별 치수</h5>
              {Array.from({ length: sectionCount }).map((_, i) => sectionCount - 1 - i).map((sIdx) => {
                const sec = isCustom ? ccSections![sIdx] : mcSections![sIdx];
                const sectionLabel = sectionCount === 2
                  ? (sIdx === 0 ? '하부' : '상부')
                  : `섹션 ${sIdx + 1}`;
                const hasHS = isCustom && !!(sec as any).horizontalSplit;

                // 높이 표시값
                const displayH = sectionHeightInputs[sIdx]
                  || (isCustom
                    ? Math.round((sec as any).height + 2 * pt).toString()
                    : Math.round(getStdSectionHeightMM(sIdx)).toString());
                // 깊이 표시값
                const displayD = sectionDepthInputs[sIdx]
                  || (sIdx === 0
                    ? Math.round(currentPlacedModule.lowerSectionDepth || totalD).toString()
                    : Math.round(currentPlacedModule.upperSectionDepth || totalD).toString());
                // 너비 표시값
                const displayW = sectionWidthInputs[sIdx]
                  || Math.round((sec as any).width || totalW).toString();

                return (
                  <div key={sIdx} style={{
                    background: 'var(--theme-background)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    marginBottom: sIdx < sectionCount - 1 ? '8px' : 0,
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--theme-text)', marginBottom: '6px' }}>
                      {sectionLabel}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {/* 섹션 너비 */}
                      <div style={{ flex: 1, minWidth: '70px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', display: 'block', marginBottom: '2px' }}>너비</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text" inputMode="numeric"
                            value={displayW}
                            onChange={(e) => setSectionWidthInputs(prev => ({ ...prev, [sIdx]: e.target.value }))}
                            onBlur={() => {
                              // 너비 변경 → 전체 가구 너비 변경 (모든 섹션 연동)
                              const val = parseInt(sectionWidthInputs[sIdx] || displayW, 10);
                              if (!isNaN(val) && val >= 100 && val <= 2400) {
                                const fm = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule.id) || currentPlacedModule;
                                const fa = useFurnitureStore.getState().placedModules;
                                const freshSI = useSpaceConfigStore.getState().spaceInfo;
                                const newX = calcResizedPositionX(fm, val, fa, freshSI);
                                const updates: any = {
                                  freeWidth: val,
                                  moduleWidth: val,
                                  position: { ...fm.position, x: newX },
                                };
                                if (isCustom) {
                                  const newSecs = cc!.sections.map((s: any) => ({ ...s, width: val }));
                                  updates.customConfig = { ...cc!, sections: newSecs };
                                }
                                updatePlacedModule(currentPlacedModule.id, updates);
                                setFreeWidthInput(val.toString());
                                const wInputs: Record<number, string> = {};
                                for (let i = 0; i < sectionCount; i++) wInputs[i] = val.toString();
                                setSectionWidthInputs(wInputs);
                              } else {
                                setSectionWidthInputs(prev => ({ ...prev, [sIdx]: Math.round(totalW).toString() }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const fm2 = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule.id) || currentPlacedModule;
                                const curW2 = fm2.freeWidth || parseInt(displayW, 10) || Math.round(totalW);
                                const next = Math.max(100, Math.min(2400, curW2 + (e.key === 'ArrowUp' ? 1 : -1)));
                                setSectionWidthInputs(prev => ({ ...prev, [sIdx]: next.toString() }));
                                const fa2 = useFurnitureStore.getState().placedModules;
                                const freshSI2 = useSpaceConfigStore.getState().spaceInfo;
                                const newX = calcResizedPositionX(fm2, next, fa2, freshSI2);
                                const updates: any = { freeWidth: next, moduleWidth: next, position: { ...fm2.position, x: newX } };
                                if (isCustom) {
                                  const newSecs = cc!.sections.map((s: any) => ({ ...s, width: next }));
                                  updates.customConfig = { ...cc!, sections: newSecs };
                                }
                                updatePlacedModule(currentPlacedModule.id, updates);
                                setFreeWidthInput(next.toString());
                              }
                            }}
                            className={styles.depthInput}
                            style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1 }}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      {/* 섹션 높이 (읽기 전용 — 표준 가구는 비율 고정, 커스텀은 편집 가능) */}
                      <div style={{ flex: 1, minWidth: '70px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', display: 'block', marginBottom: '2px' }}>높이</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text" inputMode="numeric"
                            value={displayH}
                            onChange={(e) => setSectionHeightInputs(prev => ({ ...prev, [sIdx]: e.target.value }))}
                            onBlur={() => {
                              if (isCustom) {
                                handleSectionHeightBlur(sIdx);
                              } else {
                                // 표준 가구: 높이 비율은 고정이므로 전체 높이를 변경
                                setSectionHeightInputs(prev => ({ ...prev, [sIdx]: displayH }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                              else if (isCustom && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                e.preventDefault();
                                const cur = parseInt(displayH, 10) || 0;
                                const next = Math.max(100, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                setSectionHeightInputs(prev => ({ ...prev, [sIdx]: next.toString() }));
                              }
                            }}
                            className={styles.depthInput}
                            readOnly={!isCustom}
                            style={{
                              color: '#000', backgroundColor: isCustom ? '#fff' : '#f5f5f5',
                              WebkitTextFillColor: '#000', opacity: isCustom ? 1 : 0.7,
                              cursor: isCustom ? 'text' : 'default',
                            }}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      {/* 섹션 깊이 */}
                      <div style={{ flex: 1, minWidth: '70px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', display: 'block', marginBottom: '2px' }}>깊이</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text" inputMode="numeric"
                            value={displayD}
                            onChange={(e) => setSectionDepthInputs(prev => ({ ...prev, [sIdx]: e.target.value }))}
                            onBlur={() => {
                              const val = parseInt(sectionDepthInputs[sIdx] || displayD, 10);
                              if (!isNaN(val) && val >= 100 && val <= 800) {
                                if (sIdx === 0) {
                                  setLowerSectionDepth(val);
                                  updatePlacedModule(currentPlacedModule.id, { lowerSectionDepth: val });
                                  setLowerDepthInput(val.toString());
                                } else if (sIdx === 1) {
                                  setUpperSectionDepth(val);
                                  updatePlacedModule(currentPlacedModule.id, { upperSectionDepth: val });
                                  setUpperDepthInput(val.toString());
                                }
                              } else {
                                setSectionDepthInputs(prev => ({ ...prev, [sIdx]: displayD }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = parseInt(displayD, 10) || Math.round(totalD);
                                const next = Math.max(100, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                setSectionDepthInputs(prev => ({ ...prev, [sIdx]: next.toString() }));
                                if (sIdx === 0) {
                                  setLowerSectionDepth(next);
                                  updatePlacedModule(currentPlacedModule.id, { lowerSectionDepth: next });
                                  setLowerDepthInput(next.toString());
                                } else if (sIdx === 1) {
                                  setUpperSectionDepth(next);
                                  updatePlacedModule(currentPlacedModule.id, { upperSectionDepth: next });
                                  setUpperDepthInput(next.toString());
                                }
                              }
                            }}
                            className={styles.depthInput}
                            style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1 }}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>

                    {/* 좌우 분할 서브박스 치수 (커스텀 가구 전용) */}
                    {hasHS && (() => {
                      const hs = (sec as any).horizontalSplit;
                      return (
                      <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed var(--theme-border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', marginBottom: '4px' }}>좌우 분할</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {/* 좌측 */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>좌측</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>너비</label>
                                <div className={styles.inputWithUnit}>
                                  <input type="text" inputMode="numeric"
                                    value={hsLeftWidthInput[sIdx] || ''}
                                    onChange={(e) => setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                    onBlur={() => handleHsLeftWidthBlur(sIdx)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = parseInt(hsLeftWidthInput[sIdx] || '0', 10);
                                        const next = Math.max(100, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                        setHsLeftWidthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                      }
                                    }}
                                    className={styles.depthInput}
                                    style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                  />
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>깊이</label>
                                <div className={styles.inputWithUnit}>
                                  <input type="text" inputMode="numeric"
                                    value={hsLeftDepthInput[sIdx] || ''}
                                    onChange={(e) => setHsLeftDepthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                    onBlur={() => handleHsDepthBlur(sIdx, 'left')}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = parseInt(hsLeftDepthInput[sIdx] || '0', 10);
                                        const next = Math.max(100, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                        setHsLeftDepthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                      }
                                    }}
                                    className={styles.depthInput}
                                    style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* 중앙 (3분할 시) */}
                          {hs.secondPosition && (
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>중앙</div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>너비</label>
                                  <div className={styles.inputWithUnit}>
                                    <input type="text" inputMode="numeric"
                                      value={hsCenterWidthInput[sIdx] || ''} readOnly
                                      className={styles.depthInput}
                                      style={{ color: '#000', backgroundColor: '#f5f5f5', WebkitTextFillColor: '#000', opacity: 0.7, fontSize: '12px' }}
                                    />
                                  </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>깊이</label>
                                  <div className={styles.inputWithUnit}>
                                    <input type="text" inputMode="numeric"
                                      value={hsCenterDepthInput[sIdx] || ''}
                                      onChange={(e) => setHsCenterDepthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                      onBlur={() => handleHsDepthBlur(sIdx, 'center')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                          e.preventDefault();
                                          const cur = parseInt(hsCenterDepthInput[sIdx] || '0', 10);
                                          const next = Math.max(100, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                          setHsCenterDepthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                        }
                                      }}
                                      className={styles.depthInput}
                                      style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {/* 우측 */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '3px' }}>우측</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>너비</label>
                                <div className={styles.inputWithUnit}>
                                  <input type="text" inputMode="numeric"
                                    value={hsRightWidthInput[sIdx] || ''}
                                    onChange={(e) => setHsRightWidthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                    onBlur={() => handleHsRightWidthBlur(sIdx)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = parseInt(hsRightWidthInput[sIdx] || '0', 10);
                                        const next = Math.max(100, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                        setHsRightWidthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                      }
                                    }}
                                    className={styles.depthInput}
                                    style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                  />
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)' }}>깊이</label>
                                <div className={styles.inputWithUnit}>
                                  <input type="text" inputMode="numeric"
                                    value={hsRightDepthInput[sIdx] || ''}
                                    onChange={(e) => setHsRightDepthInput(prev => ({ ...prev, [sIdx]: e.target.value }))}
                                    onBlur={() => handleHsDepthBlur(sIdx, 'right')}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = parseInt(hsRightDepthInput[sIdx] || '0', 10);
                                        const next = Math.max(100, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                        setHsRightDepthInput(prev => ({ ...prev, [sIdx]: next.toString() }));
                                      }
                                    }}
                                    className={styles.depthInput}
                                    style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, fontSize: '12px' }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* 엔드패널(EP) 토글 */}
          {currentPlacedModule && moduleData && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>엔드패널</h5>
              <div style={{ display: 'flex', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={currentPlacedModule.hasLeftEndPanel === true}
                    onChange={() => {
                      updatePlacedModule(currentPlacedModule.id, {
                        hasLeftEndPanel: !currentPlacedModule.hasLeftEndPanel,
                      });
                    }}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--theme-primary)' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--theme-text)' }}>좌측 EP</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={currentPlacedModule.hasRightEndPanel === true}
                    onChange={() => {
                      updatePlacedModule(currentPlacedModule.id, {
                        hasRightEndPanel: !currentPlacedModule.hasRightEndPanel,
                      });
                    }}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--theme-primary)' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--theme-text)' }}>우측 EP</span>
                </label>
              </div>
              {(currentPlacedModule.hasLeftEndPanel || currentPlacedModule.hasRightEndPanel) && (
                <>
                  {/* EP 높이 모드 토글 */}
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>EP 높이</label>
                    <div style={{ display: 'flex', gap: '0', border: '1px solid var(--theme-border)', borderRadius: '6px', overflow: 'hidden' }}>
                      {(['floor', 'furniture'] as const).map((mode) => {
                        const isActive = (currentPlacedModule.endPanelHeightMode ?? 'floor') === mode;
                        return (
                          <button
                            key={mode}
                            onClick={() => updatePlacedModule(currentPlacedModule.id, { endPanelHeightMode: mode })}
                            style={{
                              flex: 1,
                              padding: '5px 8px',
                              fontSize: '12px',
                              border: 'none',
                              cursor: 'pointer',
                              backgroundColor: isActive ? 'var(--theme-primary)' : 'var(--theme-bg-secondary)',
                              color: isActive ? '#fff' : 'var(--theme-text-secondary)',
                              fontWeight: isActive ? 600 : 400,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {mode === 'floor' ? '바닥에 맞춤' : '가구에 맞춤'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>EP 두께</label>
                    <div className={styles.inputWithUnit}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={currentPlacedModule.endPanelThickness ?? 18}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || /^\d+$/.test(v)) {
                            const num = v === '' ? 18 : Math.max(10, Math.min(50, parseInt(v, 10)));
                            updatePlacedModule(currentPlacedModule.id, { endPanelThickness: num });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const cur = currentPlacedModule.endPanelThickness ?? 18;
                            const next = Math.max(10, Math.min(50, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                            updatePlacedModule(currentPlacedModule.id, { endPanelThickness: next });
                          }
                        }}
                        className={styles.dimensionInput}
                      />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                  {/* EP 깊이 */}
                  {(() => {
                    const furnitureDepth = currentPlacedModule.freeDepth ?? (moduleData ? moduleData.dimensions.depth : 580);
                    return (
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>EP 깊이</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epDepthInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
                                setEpDepthInput(v);
                              }
                            }}
                            onBlur={() => {
                              const val = parseInt(epDepthInput, 10);
                              if (!isNaN(val) && val >= 50 && val <= furnitureDepth && currentPlacedModule) {
                                updatePlacedModule(currentPlacedModule.id, { endPanelDepth: val });
                                setEpDepthInput(val.toString());
                              } else {
                                const fallback = currentPlacedModule.endPanelDepth ?? furnitureDepth;
                                setEpDepthInput(Math.round(fallback).toString());
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = parseInt(epDepthInput, 10) || (currentPlacedModule.endPanelDepth ?? furnitureDepth);
                                const next = Math.max(50, Math.min(furnitureDepth, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                setEpDepthInput(next.toString());
                                updatePlacedModule(currentPlacedModule.id, { endPanelDepth: next });
                              }
                            }}
                            className={styles.dimensionInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    );
                  })()}
                  {/* 좌측 EP 옵셋 */}
                  {currentPlacedModule.hasLeftEndPanel && (() => {
                    const rawVal = currentPlacedModule.leftEndPanelOffset ?? currentPlacedModule.endPanelOffset ?? 0;
                    return (
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>좌측 EP 옵셋</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rawVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                const num = (v === '' || v === '-') ? 0 : Math.max(-50, Math.min(50, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const next = Math.max(-50, Math.min(50, rawVal + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelOffset: next });
                              }
                            }}
                            className={styles.dimensionInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', marginTop: '2px', display: 'block' }}>+ 앞 / - 뒤</span>
                      </div>
                    );
                  })()}
                  {/* 우측 EP 옵셋 */}
                  {currentPlacedModule.hasRightEndPanel && (() => {
                    const rawVal = currentPlacedModule.rightEndPanelOffset ?? currentPlacedModule.endPanelOffset ?? 0;
                    return (
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>우측 EP 옵셋</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rawVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                const num = (v === '' || v === '-') ? 0 : Math.max(-50, Math.min(50, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const next = Math.max(-50, Math.min(50, rawVal + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelOffset: next });
                              }
                            }}
                            className={styles.dimensionInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', marginTop: '2px', display: 'block' }}>+ 앞 / - 뒤</span>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* 노서라운드 좌우 이격거리 (노서라운드 모드) */}
          {currentPlacedModule &&
           spaceInfo.surroundType === 'no-surround' && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>좌우 이격거리</h5>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>좌측</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={leftGapInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d*\.?\d{0,1}$/.test(v)) {
                          setLeftGapInput(v);
                        }
                      }}
                      onBlur={() => {
                        const num = parseFloat(leftGapInput);
                        if (!isNaN(num) && num >= 0) {
                          const snapped = Math.round(num * 2) / 2;
                          updatePlacedModule(currentPlacedModule.id, { freeLeftGap: snapped });
                          setLeftGapInput(snapped.toString());
                        } else {
                          setLeftGapInput((currentPlacedModule.freeLeftGap ?? 0).toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const cur = currentPlacedModule.freeLeftGap ?? 0;
                          const next = Math.max(0, cur + (e.key === 'ArrowUp' ? 0.5 : -0.5));
                          updatePlacedModule(currentPlacedModule.id, { freeLeftGap: next });
                          setLeftGapInput(next.toString());
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                      style={{ color: '#000000', backgroundColor: '#ffffff', WebkitTextFillColor: '#000000', opacity: 1 }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>우측</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rightGapInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d*\.?\d{0,1}$/.test(v)) {
                          setRightGapInput(v);
                        }
                      }}
                      onBlur={() => {
                        const num = parseFloat(rightGapInput);
                        if (!isNaN(num) && num >= 0) {
                          const snapped = Math.round(num * 2) / 2;
                          updatePlacedModule(currentPlacedModule.id, { freeRightGap: snapped });
                          setRightGapInput(snapped.toString());
                        } else {
                          setRightGapInput((currentPlacedModule.freeRightGap ?? 0).toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const cur = currentPlacedModule.freeRightGap ?? 0;
                          const next = Math.max(0, cur + (e.key === 'ArrowUp' ? 0.5 : -0.5));
                          updatePlacedModule(currentPlacedModule.id, { freeRightGap: next });
                          setRightGapInput(next.toString());
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                      style={{ color: '#000000', backgroundColor: '#ffffff', WebkitTextFillColor: '#000000', opacity: 1 }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 기둥 C 배치 모드 선택 (기둥 C인 경우만 표시) */}
          {isColumnC && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>배치 모드</h5>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleColumnPlacementModeChange('beside')}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: columnPlacementMode === 'beside' ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                    borderRadius: '8px',
                    backgroundColor: columnPlacementMode === 'beside' ? 'var(--theme-primary-light, #e8f5e9)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: columnPlacementMode === 'beside' ? 600 : 400,
                    color: columnPlacementMode === 'beside' ? 'var(--theme-primary)' : '#333',
                    transition: 'all 0.2s ease'
                  }}
                >
                  기둥 측면 배치
                </button>
                <button
                  onClick={() => handleColumnPlacementModeChange('front')}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: columnPlacementMode === 'front' ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                    borderRadius: '8px',
                    backgroundColor: columnPlacementMode === 'front' ? 'var(--theme-primary-light, #e8f5e9)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: columnPlacementMode === 'front' ? 600 : 400,
                    color: columnPlacementMode === 'front' ? 'var(--theme-primary)' : '#333',
                    transition: 'all 0.2s ease'
                  }}
                >
                  기둥 앞에 배치
                </button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--theme-text-secondary)' }}>
                {columnPlacementMode === 'beside'
                  ? '가구가 기둥 옆에 배치됩니다 (기본)'
                  : '가구가 기둥 앞에 배치되어 기둥을 가립니다'}
              </div>
            </div>
          )}

          {/* 섹션 깊이 설정 (2섹션 가구만, 상세보기 아닐 때만) */}
          {!showDetails && isTwoSectionFurniture && (() => {
// console.log('🎨 [섹션 깊이 UI 렌더링] lowerDepthInput=', lowerDepthInput, 'upperDepthInput=', upperDepthInput);
            return (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>섹션 깊이 설정</h5>
              <div style={{ display: 'flex', gap: '12px' }}>
                {/* 하부 섹션 */}
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>하부 섹션</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lowerDepthInput}
                      onChange={(e) => handleLowerDepthChange(e.target.value)}
                      onFocus={() => useUIStore.getState().setHighlightedSection(`${currentPlacedModule?.id}-0`)}
                      onBlur={() => useUIStore.getState().setHighlightedSection(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const cur = parseInt(lowerDepthInput, 10) || 0;
                          const next = Math.max(100, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                          handleLowerDepthChange(next.toString());
                        }
                      }}
                      className={styles.depthInput}
                      placeholder="580"
                      style={{
                        color: '#000000',
                        backgroundColor: '#ffffff',
                        WebkitTextFillColor: '#000000',
                        opacity: 1
                      }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <button
                      style={{
                        flex: 1, padding: '4px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                        background: lowerDepthDirection === 'front' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                        color: lowerDepthDirection === 'front' ? '#fff' : 'var(--theme-text-secondary)',
                        fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s'
                      }}
                      onClick={() => {
                        setLowerDepthDirection('front');
                        if (currentPlacedModule) {
                          updatePlacedModule(currentPlacedModule.id, { lowerSectionDepthDirection: 'front' });
                        }
                      }}
                    >
                      뒤고정
                    </button>
                    <button
                      style={{
                        flex: 1, padding: '4px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                        background: lowerDepthDirection === 'back' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                        color: lowerDepthDirection === 'back' ? '#fff' : 'var(--theme-text-secondary)',
                        fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s'
                      }}
                      onClick={() => {
                        setLowerDepthDirection('back');
                        if (currentPlacedModule) {
                          updatePlacedModule(currentPlacedModule.id, { lowerSectionDepthDirection: 'back' });
                        }
                      }}
                    >
                      앞고정
                    </button>
                  </div>
                </div>

                {/* 상부 섹션 */}
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>상부 섹션</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={upperDepthInput}
                      onChange={(e) => handleUpperDepthChange(e.target.value)}
                      onFocus={() => useUIStore.getState().setHighlightedSection(`${currentPlacedModule?.id}-1`)}
                      onBlur={() => useUIStore.getState().setHighlightedSection(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const cur = parseInt(upperDepthInput, 10) || 0;
                          const next = Math.max(100, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                          handleUpperDepthChange(next.toString());
                        }
                      }}
                      className={styles.depthInput}
                      placeholder="580"
                      style={{
                        color: '#000000',
                        backgroundColor: '#ffffff',
                        WebkitTextFillColor: '#000000',
                        opacity: 1
                      }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <button
                      style={{
                        flex: 1, padding: '4px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                        background: upperDepthDirection === 'front' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                        color: upperDepthDirection === 'front' ? '#fff' : 'var(--theme-text-secondary)',
                        fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s'
                      }}
                      onClick={() => {
                        setUpperDepthDirection('front');
                        if (currentPlacedModule) {
                          updatePlacedModule(currentPlacedModule.id, { upperSectionDepthDirection: 'front' });
                        }
                      }}
                    >
                      뒤고정
                    </button>
                    <button
                      style={{
                        flex: 1, padding: '4px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                        background: upperDepthDirection === 'back' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                        color: upperDepthDirection === 'back' ? '#fff' : 'var(--theme-text-secondary)',
                        fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s'
                      }}
                      onClick={() => {
                        setUpperDepthDirection('back');
                        if (currentPlacedModule) {
                          updatePlacedModule(currentPlacedModule.id, { upperSectionDepthDirection: 'back' });
                        }
                      }}
                    >
                      앞고정
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* 하부장 상부패널 옵셋 (2섹션 가구만, 상세보기 아닐 때만) */}
          {!showDetails && isTwoSectionFurniture && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>하부장 상부패널 옵셋</h5>
              <div className={styles.inputWithUnit}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={lowerTopOffsetInput}
                  onChange={(e) => handleLowerTopOffsetChange(e.target.value)}
                  onFocus={() => {
                    if (currentPlacedModule) {
                      const panelId = `${currentPlacedModule.id}-(하)상판`;
// console.log('🎯 하부장 상부패널 강조:', panelId);
                      setHighlightedPanel(panelId);
                    }
                  }}
                  onBlur={() => {
// console.log('🎯 패널 강조 해제');
                    setHighlightedPanel(null);
                  }}
                  onKeyDown={handleLowerTopOffsetKeyDown}
                  className={styles.depthInput}
                  placeholder="0"
                  style={{
                    color: '#000000',
                    backgroundColor: '#ffffff',
                    WebkitTextFillColor: '#000000',
                    opacity: 1
                  }}
                />
                <span className={styles.unit}>mm</span>
              </div>
              <div className={styles.depthRange}>
                범위: -50mm ~ 50mm
              </div>
            </div>
          )}

          {/* 도어 병합/분할 (2섹션 가구만, 도어가 있을 때만, 상세보기 아닐 때만) */}
          {/* 주석 처리: 도어 병합/분할 기능 숨김
          {!showDetails && moduleData.hasDoor && hasDoor && isTwoSectionFurniture && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>도어 병합/분할</h5>
              <div className={styles.doorTabSelector}>
                <button
                  className={`${styles.doorTab} ${!doorSplit ? styles.activeDoorTab : ''}`}
                  onClick={() => {
                    setDoorSplit(false);
                    if (currentPlacedModule) {
                      updatePlacedModule(currentPlacedModule.id, { doorSplit: false });
                    }
                  }}
                >
                  병합
                </button>
                <button
                  className={`${styles.doorTab} ${doorSplit ? styles.activeDoorTab : ''}`}
                  onClick={() => {
                    setDoorSplit(true);
                    if (currentPlacedModule) {
                      updatePlacedModule(currentPlacedModule.id, { doorSplit: true });
                    }
                  }}
                >
                  분할
                </button>
              </div>
            </div>
          )}
          */}

          {/* 경첩 방향 선택 (도어가 있고 싱글 가구인 경우만, 상세보기 아닐 때만) */}
          {!showDetails && moduleData.hasDoor && hasDoor && (
            <div className={styles.propertySection}>
              {/* 경첩 방향 선택 (도어가 있고 싱글 가구인 경우만) */}
              {hasDoor && isSingleFurniture && (
                <div className={styles.hingeSubSection}>
                  <h6 className={styles.subSectionTitle}>{t('furniture.hingeDirection')}</h6>
                  <div className={styles.hingeTabSelector}>
                    <button
                      className={`${styles.hingeTab} ${hingePosition === 'left' ? styles.activeHingeTab : ''}`}
                      onClick={() => handleHingePositionChange('left')}
                    >
                      {t('furniture.left')}
                      <span className={styles.hingeTabSubtitle}>{t('furniture.openToRight')}</span>
                    </button>
                    <button
                      className={`${styles.hingeTab} ${hingePosition === 'right' ? styles.activeHingeTab : ''}`}
                      onClick={() => handleHingePositionChange('right')}
                    >
                      {t('furniture.right')}
                      <span className={styles.hingeTabSubtitle}>{t('furniture.openToLeft')}</span>
                    </button>
                  </div>
                  {isCoverDoor && (
                    <div className={styles.coverDoorNote}>
                      {t('furniture.coverDoorNote')}
                    </div>
                  )}
                </div>
              )}
              {/* 경첩 타입 선택 — 숨김 처리
              <div className={styles.hingeSubSection}>
                <h6 className={styles.subSectionTitle}>경첩 타입</h6>
                <div className={styles.hingeTabSelector}>
                  <button
                    className={`${styles.hingeTab} ${hingeType === 'A' ? styles.activeHingeTab : ''}`}
                    onClick={() => handleHingeTypeChange('A')}
                  >
                    A-type
                    <span className={styles.hingeTabSubtitle}>45mm</span>
                  </button>
                  <button
                    className={`${styles.hingeTab} ${hingeType === 'B' ? styles.activeHingeTab : ''}`}
                    onClick={() => handleHingeTypeChange('B')}
                  >
                    B-type
                    <span className={styles.hingeTabSubtitle}>48mm</span>
                  </button>
                </div>
              </div>
              */}
            </div>
          )}

          {/* 도어 상하 이격거리 — 도어 셋팅 섹션으로 통합됨 */}

          {/* 분할 모드: 섹션별 도어 이격거리 */}
          {/* 주석 처리: 도어 분할 모드 이격거리 설정 숨김
          {!showDetails && moduleData.hasDoor && hasDoor && doorSplit && isTwoSectionFurniture && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>도어 상하 이격거리 (분할)</h5>

              <h6 className={styles.subSectionTitle}>상부 도어</h6>
              <div className={styles.doorGapContainer}>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>천장에서 ↓</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={upperDoorTopGapInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setUpperDoorTopGapInput(value);
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
                          setUpperDoorTopGap(numValue);
                          updatePlacedModule(currentPlacedModule.id, { upperDoorTopGap: numValue });
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>중간판에서 ↑</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={upperDoorBottomGapInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setUpperDoorBottomGapInput(value);
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
                          setUpperDoorBottomGap(numValue);
                          updatePlacedModule(currentPlacedModule.id, { upperDoorBottomGap: numValue });
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
              </div>

              <h6 className={styles.subSectionTitle} style={{marginTop: '12px'}}>하부 도어</h6>
              <div className={styles.doorGapContainer}>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>중간판에서 ↓</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lowerDoorTopGapInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLowerDoorTopGapInput(value);
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
                          setLowerDoorTopGap(numValue);
                          updatePlacedModule(currentPlacedModule.id, { lowerDoorTopGap: numValue });
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>바닥에서 ↑</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lowerDoorBottomGapInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLowerDoorBottomGapInput(value);
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0 && currentPlacedModule) {
                          setLowerDoorBottomGap(numValue);
                          updatePlacedModule(currentPlacedModule.id, { lowerDoorBottomGap: numValue });
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="0"
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          */}

          {/* 도어 셋팅 (도어가 있을 때만) */}
          {!showDetails && currentPlacedModule && moduleData.hasDoor && hasDoor && (() => {
            const doorSetupMode = spaceInfo.doorSetupMode || 'furniture-fit';
            return (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>도어 셋팅</h5>
              <div className={styles.doorTabSelector}>
                <button
                  className={`${styles.doorTab} ${doorSetupMode === 'furniture-fit' || doorSetupMode === 'default' ? styles.activeDoorTab : ''}`}
                  onClick={() => setSpaceInfo({ doorSetupMode: 'furniture-fit' })}
                >
                  가구에 맞춤
                </button>
                <button
                  className={`${styles.doorTab} ${doorSetupMode === 'space-fit' || doorSetupMode === 'frame-cover' ? styles.activeDoorTab : ''}`}
                  onClick={() => setSpaceInfo({ doorSetupMode: 'space-fit' })}
                >
                  공간에 맞춤
                </button>
              </div>

              <div style={{ marginTop: '8px' }}>
                <div className={styles.doorGapContainer}>
                  <div className={styles.doorGapField}>
                    <label className={styles.doorGapLabel}>상단 ↑</label>
                    <div className={styles.inputWithUnit}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={doorTopGapInput}
                        onChange={(e) => handleDoorTopGapChange(e.target.value)}
                        onBlur={handleDoorTopGapBlur}
                        onKeyDown={handleDoorTopGapKeyDown}
                        className={`${styles.depthInput} furniture-depth-input`}
                        placeholder="5"
                        style={{ color: '#000000', backgroundColor: '#ffffff', WebkitTextFillColor: '#000000', opacity: 1 }}
                      />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                  <div className={styles.doorGapField}>
                    <label className={styles.doorGapLabel}>하단 ↓</label>
                    <div className={styles.inputWithUnit}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={doorBottomGapInput}
                        onChange={(e) => handleDoorBottomGapChange(e.target.value)}
                        onBlur={handleDoorBottomGapBlur}
                        onKeyDown={handleDoorBottomGapKeyDown}
                        className={`${styles.depthInput} furniture-depth-input`}
                        placeholder="25"
                        style={{ color: '#000000', backgroundColor: '#ffffff', WebkitTextFillColor: '#000000', opacity: 1 }}
                      />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* 백패널 두께 설정 */}
          <div className={styles.propertySection}>
            <h5 className={styles.sectionTitle}>백패널 두께</h5>
            <div className={styles.doorTabSelector}>
              {[3, 5, 9].map((thickness) => (
                <button
                  key={thickness}
                  className={`${styles.doorTab} ${backPanelThicknessValue === thickness ? styles.activeDoorTab : ''}`}
                  onClick={() => handleBackPanelThicknessChange(thickness)}
                >
                  {thickness}mm
                </button>
              ))}
            </div>
          </div>

          {/* 상하부장 사이 갭 백패널 설정 (상부장/하부장만) */}
          {(moduleData.category === 'upper' || moduleData.category === 'lower') && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>{t('furniture.gapBackPanelSettings')}</h5>
              {isBackPanelAlreadyInSlot ? (
                <div className={styles.backPanelDisabledNote}>
                  {t('furniture.backPanelAlreadySet', { position: moduleData.category === 'upper' ? t('furniture.lowerCabinet') : t('furniture.upperCabinet') })}
                </div>
              ) : (
                <div className={styles.doorTabSelector}>
                  <button
                    className={`${styles.doorTab} ${!hasGapBackPanel ? styles.activeDoorTab : ''}`}
                    onClick={() => handleGapBackPanelChange(false)}
                  >
                    {t('common.none')}
                  </button>
                  <button
                    className={`${styles.doorTab} ${hasGapBackPanel ? styles.activeDoorTab : ''}`}
                    onClick={() => handleGapBackPanelChange(true)}
                  >
                    {t('common.enabled')}
                  </button>
                </div>
              )}
            </div>
          )}


          {/* 삭제 버튼 */}
          <button 
            className={styles.deleteButton}
            onClick={handleDeleteClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            {t('common.delete')}
          </button>

          {/* 확인/취소 버튼 */}
          <div className={styles.confirmButtons}>
            <button
              className={styles.cancelButton}
              onClick={handleCancel}
            >
              {t('common.cancel')}
            </button>
            <button
              className={styles.confirmButton}
              onClick={handleClose}
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default PlacedModulePropertiesPanel; 
