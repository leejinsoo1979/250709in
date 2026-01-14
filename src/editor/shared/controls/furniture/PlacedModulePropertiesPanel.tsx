import React, { useState, useEffect, useCallback } from 'react';
import { useSpaceConfigStore, FURNITURE_LIMITS } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import { analyzeColumnSlots } from '../../utils/columnSlotProcessor';
import { calculateSpaceIndexing } from '../../utils/indexing';
import { useTranslation } from '@/i18n/useTranslation';
import { calculatePanelDetails } from '@/editor/shared/utils/calculatePanelDetails';
import { getDefaultGrainDirection } from '@/editor/shared/utils/materialConstants';
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
    console.log(`🖼️ [가구 팝업 이미지] ${moduleId} → ${baseModuleType} → ${imagePath}`);
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
  const drawerHandleThickness = 18; // 서랍 손잡이판 두께 (SPECIAL_PANEL_THICKNESS)
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
        name: '안전선반 (칸막이)',
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
      
      // 섹션 상판 (마지막 섹션에만)
      if (sectionIndex === sections.length - 1) {
        targetPanel.push({
          name: `${sectionName} ${t('furniture.topPanel')}`,
          width: innerWidth,
          depth: customDepth,
          thickness: basicThickness,
          material: 'PB'  // 기본 재질
        });
      }
      
      // 섹션 하판 (각 섹션의 바닥판)
      if (sectionIndex === 0) {
        // 하부섹션의 바닥판 (가구 전체 하판)
        targetPanel.push({
          name: `${sectionName} ${t('furniture.bottomPanel')}`,
          width: innerWidth,
          depth: customDepth,
          thickness: basicThickness,
          material: 'PB'  // 기본 재질
        });
      } else {
        // 상부섹션의 바닥판
        targetPanel.push({
          name: `${sectionName} ${t('furniture.bottomPanel')}`,
          width: innerWidth,
          depth: customDepth - backPanelThickness - 17, // 안전선반과 같은 깊이
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
          
          // 서랍 손잡이판 (DrawerRenderer의 HANDLE_PLATE) - PET 재질
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.handlePlate')}`,
            width: customWidth,
            height: individualDrawerHeight,
            thickness: drawerHandleThickness,
            material: 'PET'  // 서랍 손잡이판은 PET 재질
          });
          
          // 서랍 본체 크기 계산 (DrawerRenderer 참조)
          const drawerBodyWidth = customWidth - 76; // 좌우 38mm씩 감소
          const drawerBodyHeight = individualDrawerHeight - 30; // 상하 15mm씩 감소
          const drawerBodyDepth = customDepth - 47 - drawerHandleThickness; // 앞30mm 뒤17mm 후퇴 + 손잡이판 두께
          
          // 서랍 앞판
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.frontPanel')}`,
            width: drawerBodyWidth,
            height: drawerBodyHeight,
            thickness: basicThickness,
            material: 'PB'  // 서랍 본체는 PB 재질
          });
          
          // 서랍 뒷판
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.backPanel')}`,
            width: drawerBodyWidth,
            height: drawerBodyHeight,
            thickness: basicThickness,
            material: 'PB'  // 서랍 본체는 PB 재질
          });
          
          // 서랍 좌측판
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.leftPanel')}`,
            depth: drawerBodyDepth - basicThickness * 2, // 앞뒤 판재 두께 제외
            height: drawerBodyHeight,
            thickness: basicThickness,
            material: 'PB'  // 서랍 본체는 PB 재질
          });
          
          // 서랍 우측판
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.rightPanel')}`,
            depth: drawerBodyDepth - basicThickness * 2, // 앞뒤 판재 두께 제외
            height: drawerBodyHeight,
            thickness: basicThickness,
            material: 'PB'  // 서랍 본체는 PB 재질
          });
          
          // 서랍 바닥판 (DrawerRenderer의 Drawer Bottom)
          targetPanel.push({
            name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.bottomPanel')}`,
            width: drawerBodyWidth - 26, // 추가로 26mm 감소
            depth: drawerBodyDepth - 26, // 추가로 26mm 감소
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
  const { spaceInfo } = useSpaceConfigStore();
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
  const [lowerTopOffset, setLowerTopOffset] = useState<number>(0); // 하부 섹션 상판 옵셋 (mm)
  const [lowerTopOffsetInput, setLowerTopOffsetInput] = useState<string>('0'); // 하부 섹션 상판 옵셋 입력
  const [customWidth, setCustomWidth] = useState<number>(600); // 기본 컬럼 너비로 변경
  const [widthInputValue, setWidthInputValue] = useState<string>('600');
  const [widthError, setWidthError] = useState<string>('');
  const [hingePosition, setHingePosition] = useState<'left' | 'right'>('right');
  const [hasDoor, setHasDoor] = useState<boolean>(false);
  const [doorSplit, setDoorSplit] = useState<boolean>(false);
  const [hasGapBackPanel, setHasGapBackPanel] = useState<boolean>(false); // 상하부장 사이 갭 백패널 상태
  const [columnPlacementMode, setColumnPlacementMode] = useState<'beside' | 'front'>('beside'); // 기둥 C 배치 모드

  // 띄움배치일 때 바닥 이격거리를 띄움 높이로 연동
  const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
  const floatHeight = spaceInfo.baseConfig?.floatHeight || 0;
  const defaultDoorBottomGap = isFloatPlacement ? floatHeight : 25;
  const [doorTopGap, setDoorTopGap] = useState<number>(5); // 병합 모드: 천장에서 아래로
  const [doorBottomGap, setDoorBottomGap] = useState<number>(defaultDoorBottomGap); // 병합 모드: 바닥에서 위로
  const [doorTopGapInput, setDoorTopGapInput] = useState<string>('5');

  // 분할 모드용 섹션별 이격거리
  const [upperDoorTopGap, setUpperDoorTopGap] = useState<number>(0); // 상부: 천장에서 아래로
  const [upperDoorBottomGap, setUpperDoorBottomGap] = useState<number>(0); // 상부: 중간판에서 위로
  const [lowerDoorTopGap, setLowerDoorTopGap] = useState<number>(0); // 하부: 중간판에서 아래로
  const [lowerDoorBottomGap, setLowerDoorBottomGap] = useState<number>(0); // 하부: 바닥에서 위로
  const [upperDoorTopGapInput, setUpperDoorTopGapInput] = useState<string>('0');
  const [upperDoorBottomGapInput, setUpperDoorBottomGapInput] = useState<string>('0');
  const [lowerDoorTopGapInput, setLowerDoorTopGapInput] = useState<string>('0');
  const [lowerDoorBottomGapInput, setLowerDoorBottomGapInput] = useState<string>('0');
  const [doorBottomGapInput, setDoorBottomGapInput] = useState<string>(defaultDoorBottomGap.toString());
  const [originalDoorTopGap, setOriginalDoorTopGap] = useState<number>(5);
  const [originalDoorBottomGap, setOriginalDoorBottomGap] = useState<number>(defaultDoorBottomGap);

  // 취소 시 복원을 위한 모든 초기값 저장
  const [originalCustomDepth, setOriginalCustomDepth] = useState<number>(580);
  const [originalCustomWidth, setOriginalCustomWidth] = useState<number>(600);
  const [originalLowerSectionDepth, setOriginalLowerSectionDepth] = useState<number | undefined>(undefined);
  const [originalUpperSectionDepth, setOriginalUpperSectionDepth] = useState<number | undefined>(undefined);
  const [originalLowerTopOffset, setOriginalLowerTopOffset] = useState<number>(0);
  const [originalHingePosition, setOriginalHingePosition] = useState<'left' | 'right'>('right');
  const [originalHasDoor, setOriginalHasDoor] = useState<boolean>(false);
  const [originalDoorSplit, setOriginalDoorSplit] = useState<boolean>(false);
  const [originalHasGapBackPanel, setOriginalHasGapBackPanel] = useState<boolean>(false);
  const [originalColumnPlacementMode, setOriginalColumnPlacementMode] = useState<'beside' | 'front'>('beside');
  const [originalUpperDoorTopGap, setOriginalUpperDoorTopGap] = useState<number>(5);
  const [originalUpperDoorBottomGap, setOriginalUpperDoorBottomGap] = useState<number>(0);
  const [originalLowerDoorTopGap, setOriginalLowerDoorTopGap] = useState<number>(0);
  const [originalLowerDoorBottomGap, setOriginalLowerDoorBottomGap] = useState<number>(45);

  const [showWarning, setShowWarning] = useState(false);

  // 전체 팝업에서 엔터키 처리 - 조건문 위로 이동
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('🔑 키 입력 감지:', e.key, 'activePopup.type:', activePopup.type, 'showWarning:', showWarning);
      
      // 경고창이 열려있을 때
      if (showWarning) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          setShowWarning(false);
          console.log('✅ 경고창 닫기');
        }
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const isFormElement = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
      if (isFormElement) {
        if (e.key === 'Escape') {
          e.preventDefault();
          console.log('✅ ESC키로 팝업 닫기 (입력 필드 포커스)');
          closeAllPopups();
        }
        return;
      }
      
      // 메인 팝업이 열려있을 때 (furnitureEdit 타입 체크)
      if (activePopup.type === 'furnitureEdit') {
        if (e.key === 'Enter') {
          e.preventDefault();
          console.log('✅ 엔터키로 팝업 닫기');
          closeAllPopups(); // 확인 버튼과 동일한 동작
        } else if (e.key === 'Escape') {
          e.preventDefault();
          console.log('✅ ESC키로 팝업 닫기');
          closeAllPopups(); // 취소와 동일한 동작
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    console.log('🎯 키 이벤트 리스너 등록');
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      console.log('🎯 키 이벤트 리스너 제거');
    };
  }, [activePopup.type, showWarning, closeAllPopups]);
  
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
    const currentModuleData = getModuleById(currentPlacedModule.moduleId, internalSpace, spaceInfo);
    if (!currentModuleData) return false;
    
    const isCurrentUpper = currentModuleData.category === 'upper' || currentPlacedModule.moduleId.includes('upper-cabinet');
    const isCurrentLower = currentModuleData.category === 'lower' || currentPlacedModule.moduleId.includes('lower-cabinet');
    
    if (!isCurrentUpper && !isCurrentLower) return false;
    
    // 같은 슬롯의 다른 가구들 확인
    return placedModules.some(module => {
      if (module.id === currentPlacedModule.id) return false; // 자기 자신 제외
      if (module.slotIndex !== currentPlacedModule.slotIndex) return false; // 다른 슬롯 제외
      
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
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
        // customWidth가 있으면 해당 너비로 모듈 ID 생성 (소수점 포함)
        let targetModuleId = currentPlacedModule.moduleId;
        if (currentPlacedModule.customWidth) {
          const baseType = currentPlacedModule.moduleId.replace(/-[\d.]+$/, '');
          targetModuleId = `${baseType}-${currentPlacedModule.customWidth}`;
        }
        return getModuleById(targetModuleId, calculateInternalSpace(spaceInfo), spaceInfo);
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
    const isColumnC = slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture || false;
    
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
      if (customWidth !== initialWidth) {
        setCustomWidth(initialWidth);
        setWidthInputValue(initialWidth.toString());
        setOriginalCustomWidth(initialWidth); // 원래 값 저장
      }
      const hingePos = currentPlacedModule.hingePosition || 'right';
      const hasDoorVal = currentPlacedModule.hasDoor ?? moduleData.hasDoor ?? false;
      const doorSplitVal = currentPlacedModule.doorSplit ?? false;
      const hasGapVal = currentPlacedModule.hasGapBackPanel ?? false;
      setHingePosition(hingePos);
      setHasDoor(hasDoorVal);
      setDoorSplit(doorSplitVal);
      setHasGapBackPanel(hasGapVal);
      setOriginalHingePosition(hingePos); // 원래 값 저장
      setOriginalHasDoor(hasDoorVal); // 원래 값 저장
      setOriginalDoorSplit(doorSplitVal); // 원래 값 저장
      setOriginalHasGapBackPanel(hasGapVal); // 원래 값 저장

      // 기둥 C 배치 모드 초기화
      const placementModeVal = currentPlacedModule.columnPlacementMode || 'beside';
      setColumnPlacementMode(placementModeVal);
      setOriginalColumnPlacementMode(placementModeVal);

      // 도어 상하 갭 초기값 설정 (천장/바닥 기준, 입력 중 방해 방지)
      // 띄움배치일 때는 띄움 높이를 바닥 이격거리로 자동 설정
      const initialTopGap = currentPlacedModule.doorTopGap ?? 5;
      // 바닥배치인데 doorBottomGap이 0이면 기본값 25 사용
      const initialBottomGap = currentPlacedModule.doorBottomGap !== undefined &&
                                (isFloatPlacement || currentPlacedModule.doorBottomGap > 0)
        ? currentPlacedModule.doorBottomGap
        : defaultDoorBottomGap;
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

      // 2섹션 가구의 섹션 깊이 초기화
      const sections = currentPlacedModule.customSections || moduleData.modelConfig?.sections || [];
      if (sections.length === 2) {
        const defaultDepth = moduleData.dimensions.depth;

        // 저장된 섹션별 깊이가 있으면 사용, 없으면 defaultDepth 사용하고 저장
        const lowerDepth = currentPlacedModule.lowerSectionDepth ?? defaultDepth;
        const upperDepth = currentPlacedModule.upperSectionDepth ?? defaultDepth;

        // placedModule에 값이 없었다면 기본값을 실제로 저장
        if (currentPlacedModule.lowerSectionDepth === undefined || currentPlacedModule.upperSectionDepth === undefined) {
          console.log('🔧 [섹션 깊이 초기화] 기본값을 placedModule에 저장:', { lowerDepth, upperDepth });
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

        if (currentPlacedModule.lowerSectionTopOffset === undefined) {
          updatePlacedModule(currentPlacedModule.id, { lowerSectionTopOffset: moduleDefaultLowerTopOffset });
        }
      }
      
      console.log('🔧 팝업 초기값 설정:', {
        moduleId: currentPlacedModule.moduleId,
        hasCustomDepth: currentPlacedModule.customDepth !== undefined && currentPlacedModule.customDepth !== null,
        customDepth: currentPlacedModule.customDepth,
        defaultDepth: getDefaultDepth(moduleData),
        finalDepth: initialDepth,
        hasCustomWidth: currentPlacedModule.customWidth !== undefined && currentPlacedModule.customWidth !== null,
        customWidth: currentPlacedModule.customWidth,
        defaultWidth: moduleData.dimensions.width,
        finalWidth: initialWidth
      });
    }
  }, [currentPlacedModule?.id, moduleData?.id, currentPlacedModule?.customDepth, currentPlacedModule?.customWidth, currentPlacedModule?.adjustedWidth, currentPlacedModule?.hasDoor, moduleDefaultLowerTopOffset]); // 실제 값이 바뀔 때만 실행

  // 띄움 높이 또는 배치 타입이 변경될 때 모든 가구의 바닥 이격거리 자동 업데이트
  useEffect(() => {
    const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
    const floatHeight = spaceInfo.baseConfig?.floatHeight || 0;
    const targetBottomGap = isFloatPlacement ? floatHeight : 25;

    // 모든 배치된 가구에 일괄 적용
    placedModules.forEach(module => {
      if (module.doorBottomGap !== targetBottomGap) {
        updatePlacedModule(module.id, { doorBottomGap: targetBottomGap });
      }
    });

    // 현재 선택된 가구의 UI 상태도 업데이트
    if (currentPlacedModule) {
      setDoorBottomGap(targetBottomGap);
      setDoorBottomGapInput(targetBottomGap.toString());
    }
  }, [spaceInfo.baseConfig?.floatHeight, spaceInfo.baseConfig?.placementType]);

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

  // 패널 상세정보 계산 (hasDoor 변경 시 자동 재계산)
  const panelDetails = React.useMemo(() => {
    if (!moduleData) return [];
    return calculatePanelDetails(moduleData, customWidth, customDepth, hasDoor, t, doorOriginalWidth);
  }, [moduleData, customWidth, customDepth, hasDoor, t, doorOriginalWidth]);

  // 디버깅용 로그 (개발 모드에서만 출력)
  if (import.meta.env.DEV) {
    console.log(`🔍 [가구 타입 확인] ${moduleData?.id}: 듀얼=${isDualFurniture}, 싱글=${isSingleFurniture}, 커버도어=${isCoverDoor}`);
    console.log(`🚪 [도어 경첩 표시 조건] hasDoor=${hasDoor}, isSingleFurniture=${isSingleFurniture}, 표시여부=${hasDoor && isSingleFurniture}`);
    console.log(`📐 [섹션 정보] sections.length=${sections.length}, isTwoSectionFurniture=${isTwoSectionFurniture}, showDetails=${showDetails}, sections=`, sections);
    console.log(`🎯 [섹션 깊이 UI 표시 조건] !showDetails=${!showDetails}, isTwoSectionFurniture=${isTwoSectionFurniture}, 표시여부=${!showDetails && isTwoSectionFurniture}`);
    console.log(`🔧 [도어 분할 UI 표시 조건] !showDetails=${!showDetails}, moduleData.hasDoor=${moduleData?.hasDoor}, hasDoor=${hasDoor}, isTwoSectionFurniture=${isTwoSectionFurniture}, 최종표시=${!showDetails && moduleData?.hasDoor && hasDoor && isTwoSectionFurniture}`);
    console.log(`📋 [전체 modelConfig]`, moduleData?.modelConfig);
  }

  // 가구 편집 팝업이 활성화되지 않았으면 렌더링하지 않음
  if (activePopup.type !== 'furnitureEdit' || !activePopup.id) {
    console.log('📝 PlacedModulePropertiesPanel 렌더링 안 함:', {
      type: activePopup.type,
      id: activePopup.id
    });
    return null;
  }

  console.log('📝 PlacedModulePropertiesPanel 렌더링됨:', {
    type: activePopup.type,
    id: activePopup.id
  });

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
        hingePosition: originalHingePosition,
        hasDoor: originalHasDoor,
        doorSplit: originalDoorSplit,
        hasGapBackPanel: originalHasGapBackPanel,
        doorTopGap: originalDoorTopGap,
        doorBottomGap: originalDoorBottomGap,
        upperDoorTopGap: originalUpperDoorTopGap,
        upperDoorBottomGap: originalUpperDoorBottomGap,
        lowerDoorTopGap: originalLowerDoorTopGap,
        lowerDoorBottomGap: originalLowerDoorBottomGap
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
    setCustomDepth(newDepth);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { customDepth: newDepth });
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
      
      console.log('📏 가구 너비 조정:', {
        originalWidth: moduleData.dimensions.width,
        newWidth,
        columnPosition: slotInfo?.column?.position,
        customDepth: currentPlacedModule.customDepth
      });
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
    console.log('⬇️⬇️⬇️ [하부 섹션 깊이 변경 시작] value=', value, 'currentPlacedModule.id=', currentPlacedModule?.id);
    setLowerDepthInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
    console.log('🔢 [숫자 파싱] numValue=', numValue, 'isValid=', !isNaN(numValue) && numValue > 0);

    if (!isNaN(numValue) && numValue > 0 && currentPlacedModule) {
      console.log('✅✅✅ [하부 섹션 깊이 적용 시작] numValue=', numValue, 'moduleId=', currentPlacedModule.id);
      setLowerSectionDepth(numValue);
      updatePlacedModule(currentPlacedModule.id, { lowerSectionDepth: numValue });
      console.log('💾 [updatePlacedModule 호출 완료]');
    }
  };

  const handleUpperDepthChange = (value: string) => {
    console.log('⬆️⬆️⬆️ [상부 섹션 깊이 변경 시작] value=', value, 'currentPlacedModule.id=', currentPlacedModule?.id);
    setUpperDepthInput(value);

    // 유효한 숫자면 즉시 반영
    const numValue = parseInt(value);
    console.log('🔢 [숫자 파싱] numValue=', numValue, 'isValid=', !isNaN(numValue) && numValue > 0);

    if (!isNaN(numValue) && numValue > 0 && currentPlacedModule) {
      console.log('✅✅✅ [상부 섹션 깊이 적용 시작] numValue=', numValue, 'moduleId=', currentPlacedModule.id);
      setUpperSectionDepth(numValue);
      updatePlacedModule(currentPlacedModule.id, { upperSectionDepth: numValue });
      console.log('💾 [updatePlacedModule 호출 완료]');
    }
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
    }
  };

  const handleHingePositionChange = (position: 'left' | 'right') => {
    // 커버도어인 경우 경고 표시
    if (isCoverDoor) {
      setShowWarning(true);
      // 3초 후 자동으로 경고 숨김
      setTimeout(() => setShowWarning(false), 3000);
      return;
    }
    
    setHingePosition(position);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hingePosition: position });
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

  // 기둥 C 배치 모드 변경 핸들러
  const handleColumnPlacementModeChange = (mode: 'beside' | 'front') => {
    setColumnPlacementMode(mode);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { columnPlacementMode: mode });
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
            const actualPanelCount = panelDetails.filter(panel =>
              !panel.name?.startsWith('===') && !panel.isInfo
            ).length;

            return (
              <div className={styles.detailsSection}>
                <h5 className={styles.sectionTitle}>
                  {t('furniture.panelDetails')} (총 {actualPanelCount}장)
                </h5>
                <div className={styles.panelList}>
                  {panelDetails.map((panel, index) => {
                  // 섹션 구분자인 경우
                  if (panel.name && panel.name.startsWith('===')) {
                    // 현재 섹션부터 다음 섹션 구분자 전까지의 실제 패널 개수 계산
                    let sectionPanelCount = 0;
                    for (let i = index + 1; i < panelDetails.length; i++) {
                      if (panelDetails[i].name?.startsWith('===')) break;
                      if (!panelDetails[i].isInfo) sectionPanelCount++;
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
                            console.log('🎯 패널 강조 설정 (정보성):', panelId);
                            setHighlightedPanel(panelId);
                          } else {
                            console.log('🎯 패널 강조 해제');
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
                    console.log('🎯 마이다 패널:', {
                      name: panel.name,
                      width: panel.width,
                      height: panel.height,
                      defaultDirection,
                      currentDirection,
                      storedDirection: currentPlacedModule?.panelGrainDirections?.[panel.name]
                    });
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
                          console.log('🎯 패널 강조 설정 (일반):', panelId);
                          setHighlightedPanel(panelId);
                        } else {
                          console.log('🎯 패널 강조 해제');
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
                    border: columnPlacementMode === 'beside' ? '2px solid var(--theme-primary)' : '1px solid #ddd',
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
                    border: columnPlacementMode === 'front' ? '2px solid var(--theme-primary)' : '1px solid #ddd',
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
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                {columnPlacementMode === 'beside'
                  ? '가구가 기둥 옆에 배치됩니다 (기본)'
                  : '가구가 기둥 앞에 배치되어 기둥을 가립니다'}
              </div>
            </div>
          )}

          {/* 섹션 깊이 설정 (2섹션 가구만, 상세보기 아닐 때만) */}
          {!showDetails && isTwoSectionFurniture && (() => {
            console.log('🎨 [섹션 깊이 UI 렌더링] lowerDepthInput=', lowerDepthInput, 'upperDepthInput=', upperDepthInput);
            return (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>섹션 깊이 설정</h5>
              <div style={{ display: 'flex', gap: '12px' }}>
                {/* 하부 섹션 */}
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666' }}>하부 섹션</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lowerDepthInput}
                      onChange={(e) => handleLowerDepthChange(e.target.value)}
                      onFocus={() => useUIStore.getState().setHighlightedSection(`${currentPlacedModule?.id}-0`)}
                      onBlur={() => useUIStore.getState().setHighlightedSection(null)}
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
                </div>

                {/* 상부 섹션 */}
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666' }}>상부 섹션</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={upperDepthInput}
                      onChange={(e) => handleUpperDepthChange(e.target.value)}
                      onFocus={() => useUIStore.getState().setHighlightedSection(`${currentPlacedModule?.id}-1`)}
                      onBlur={() => useUIStore.getState().setHighlightedSection(null)}
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
                      console.log('🎯 하부장 상부패널 강조:', panelId);
                      setHighlightedPanel(panelId);
                    }
                  }}
                  onBlur={() => {
                    console.log('🎯 패널 강조 해제');
                    setHighlightedPanel(null);
                  }}
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

          {/* 깊이 설정 (상세보기 아닐 때만) */}
          {!showDetails && (
          <div className={styles.propertySection}>
            <h5 className={styles.sectionTitle}>{t('furniture.depthSettings')}</h5>
            <div className={styles.depthInputWrapper}>
              <div className={styles.inputWithUnit}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={depthInputValue}
                  onChange={(e) => handleDepthInputChange(e.target.value)}
                  onBlur={handleDepthInputBlur}
                  onKeyDown={handleDepthKeyDown}
                  className={`${styles.depthInput} furniture-depth-input ${depthError ? styles.inputError : ''}`}
                  placeholder={`${FURNITURE_LIMITS.DEPTH.MIN}-${FURNITURE_LIMITS.DEPTH.MAX}`}
                  style={{
                    color: '#000000',
                    backgroundColor: '#ffffff',
                    WebkitTextFillColor: '#000000',
                    opacity: 1
                  }}
                />
                <span className={styles.unit}>mm</span>
              </div>
              {depthError && <div className={styles.errorMessage}>{depthError}</div>}
              <div className={styles.depthRange}>
                {t('furniture.range')}: {FURNITURE_LIMITS.DEPTH.MIN}mm ~ {Math.min(spaceInfo.depth, FURNITURE_LIMITS.DEPTH.MAX)}mm
              </div>
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
            </div>
          )}

          {/* 도어 상하 이격거리 설정 (도어가 있는 경우만) */}
          {!showDetails && moduleData.hasDoor && hasDoor && !doorSplit && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>
                도어 상하 이격거리 ({isFloatPlacement ? '띄움배치' : '바닥배치'})
              </h5>
              <div className={styles.doorGapContainer}>
                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>천장에서 ↓</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={doorTopGapInput}
                      onChange={(e) => handleDoorTopGapChange(e.target.value)}
                      onBlur={handleDoorTopGapBlur}
                      onKeyDown={handleDoorTopGapKeyDown}
                      className={`${styles.depthInput} furniture-depth-input`}
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
                </div>

                <div className={styles.doorGapField}>
                  <label className={styles.doorGapLabel}>바닥에서 ↑</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={doorBottomGapInput}
                      onChange={(e) => handleDoorBottomGapChange(e.target.value)}
                      onBlur={handleDoorBottomGapBlur}
                      onKeyDown={handleDoorBottomGapKeyDown}
                      className={`${styles.depthInput} furniture-depth-input`}
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
                </div>
              </div>
            </div>
          )}

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
      
      {/* 경고 팝업 */}
      {showWarning && (
        <div className={styles.warningOverlay}>
          <div className={styles.warningModal}>
            <div className={styles.warningIcon}>⚠️</div>
            <div className={styles.warningMessage}>
              {t('furniture.coverDoorNote')}
            </div>
            <button 
              className={styles.warningCloseButton}
              onClick={() => setShowWarning(false)}
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      )}


    </div>
  );
};

export default PlacedModulePropertiesPanel; 
