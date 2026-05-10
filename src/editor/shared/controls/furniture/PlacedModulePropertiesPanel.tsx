import React, { useState, useEffect, useCallback } from 'react';
import { FaExchangeAlt } from 'react-icons/fa';
import { useSpaceConfigStore, FURNITURE_LIMITS } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { getModuleById, buildModuleDataFromPlacedModule, ModuleData, calculateEvenShelfPositions } from '@/data/modules';
import type { SectionConfig } from '@/data/modules';
import { calculateInternalSpace, calculateTopBottomFrameHeight, calculateBaseFrameHeight } from '../../viewer3d/utils/geometry';
import { analyzeColumnSlots } from '../../utils/columnSlotProcessor';
import { calculateSpaceIndexing } from '../../utils/indexing';
import { useTranslation } from '@/i18n/useTranslation';
import { calculatePanelDetails, calculateSurroundPanels } from '@/editor/shared/utils/calculatePanelDetails';
import { withUpperSafetyShelfRemoved, isUpperSafetyShelfModule } from '@/editor/shared/utils/upperSafetyShelf';
import { getDefaultGrainDirection } from '@/editor/shared/utils/materialConstants';
import { isCustomizableModuleId, getCustomDimensionKey, getStandardDimensionKey } from './CustomizableFurnitureLibrary';
import { calcResizedPositionX } from '@/editor/shared/utils/freePlacementUtils';
import { parseBackWallGapInput, stepBackWallGapMm } from '@/editor/shared/utils/backWallGapValidation';
import { SURROUND_PANEL_THICKNESS } from '@/data/modules/surroundPanels';
import styles from './PlacedModulePropertiesPanel.module.css';

// 가구 썸네일 이미지 경로 — ModuleGallery와 동일한 규칙
const getImagePath = (filename: string) => {
  return `/images/furniture-thumbnails/${filename}`;
};

// ModuleGallery의 FURNITURE_ICONS와 동일하게 동기화 유지 (수정 시 양쪽 함께 변경)
const FURNITURE_ICONS: Record<string, string> = {
  // 키큰장 (주방)
  'built-in-fridge': getImagePath('single_builtin.png'),
  'insert-frame': getImagePath('insert_frame.png'),
  'dual-built-in-fridge': getImagePath('dual_builtin.png'),
  'single-pull-out-cabinet': getImagePath('microwave.png'),
  'single-pantry-cabinet': getImagePath('pantry.png'),
  'single-fridge-cabinet': getImagePath('single_builtin.png'),
  'single-2drawer-hanging': getImagePath('single-2drawer-hanging.png'),
  'single-2hanging': getImagePath('single-2hanging.png'),
  'single-4drawer-hanging': getImagePath('single-4drawer-hanging.png'),
  'dual-2drawer-hanging': getImagePath('dual-2drawer-hanging.png'),
  'dual-2hanging': getImagePath('dual-2hanging.png'),
  'dual-4drawer-hanging': getImagePath('dual-4drawer-hanging.png'),
  'dual-2drawer-styler': getImagePath('dual-2drawer-styler.png'),
  'dual-4drawer-pantshanger': getImagePath('dual-4drawer-pantshanger.png'),
  // 싱글 상부장
  'upper-cabinet-shelf': getImagePath('upper-cabinet-shelf.png'),
  'upper-cabinet-2tier': getImagePath('upper-cabinet-2tier.png'),
  'upper-cabinet-open': getImagePath('upper-cabinet-open.png'),
  'upper-cabinet-mixed': getImagePath('upper-cabinet-mixed.png'),
  // 싱글 하부장 (새)
  'lower-half-cabinet': getImagePath('lower-half-cabinet.png'),
  'lower-sink-cabinet': getImagePath('lower-sink-cabinet.png'),
  'lower-induction-cabinet': getImagePath('lower-induction-cabinet.png'),
  // 듀얼 상부장
  'dual-upper-cabinet-shelf': getImagePath('dual-upper-cabinet-shelf.png'),
  'dual-upper-cabinet-2tier': getImagePath('dual-upper-cabinet-2tier.png'),
  'dual-upper-cabinet-open': getImagePath('dual-upper-cabinet-open.png'),
  'dual-upper-cabinet-mixed': getImagePath('dual-upper-cabinet-mixed.png'),
  // 듀얼 하부장 (새)
  'dual-lower-half-cabinet': getImagePath('dual-lower-half-cabinet.png'),
  'dual-lower-sink-cabinet': getImagePath('dual-lower-sink-cabinet.png'),
  'dual-lower-induction-cabinet': getImagePath('dual-lower-induction-cabinet.png'),
  // 기본 하부장 서랍
  'lower-drawer-2tier': getImagePath('lower-drawer-2tier.png'),
  'dual-lower-drawer-2tier': getImagePath('dual-lower-drawer-2tier.png'),
  'lower-drawer-3tier': getImagePath('lower-drawer-3tier.png'),
  'dual-lower-drawer-3tier': getImagePath('dual-lower-drawer-3tier.png'),
  // 도어올림 하부장
  'lower-door-lift-half': getImagePath('lower-door-lift-half.png'),
  'dual-lower-door-lift-half': getImagePath('dual-lower-door-lift-half.png'),
  'lower-door-lift-2tier': getImagePath('lower-door-lift-2tier.png'),
  'dual-lower-door-lift-2tier': getImagePath('dual-lower-door-lift-2tier.png'),
  'lower-door-lift-3tier': getImagePath('lower-door-lift-3tier.png'),
  'dual-lower-door-lift-3tier': getImagePath('dual-lower-door-lift-3tier.png'),
  // 도어올림 터치 하부장
  'lower-door-lift-touch-2tier-a': getImagePath('lower-door-lift-touch-2tier-a.png'),
  'dual-lower-door-lift-touch-2tier-a': getImagePath('dual-lower-door-lift-touch-2tier-a.png'),
  'lower-door-lift-touch-2tier-b': getImagePath('lower-door-lift-touch-2tier-b.png'),
  'dual-lower-door-lift-touch-2tier-b': getImagePath('dual-lower-door-lift-touch-2tier-b.png'),
  'lower-door-lift-touch-3tier': getImagePath('lower-door-lift-touch-3tier.png'),
  'dual-lower-door-lift-touch-3tier': getImagePath('dual-lower-door-lift-touch-3tier.png'),
  // 상판내림 하부장
  'lower-top-down-half': getImagePath('lower-top-down-half.png'),
  'dual-lower-top-down-half': getImagePath('dual-lower-top-down-half.png'),
  'lower-top-down-2tier': getImagePath('lower-top-down-2tier.png'),
  'dual-lower-top-down-2tier': getImagePath('dual-lower-top-down-2tier.png'),
  'lower-top-down-3tier': getImagePath('lower-top-down-3tier.png'),
  'dual-lower-top-down-3tier': getImagePath('dual-lower-top-down-3tier.png'),
  'lower-top-down-touch-2tier': getImagePath('lower-top-down-touch-2tier.png'),
  'dual-lower-top-down-touch-2tier': getImagePath('dual-lower-top-down-touch-2tier.png'),
  'lower-top-down-touch-3tier': getImagePath('lower-top-down-touch-3tier.png'),
  'dual-lower-top-down-touch-3tier': getImagePath('dual-lower-top-down-touch-3tier.png'),
  // 싱글 선반장
  'single-2drawer-shelf': getImagePath('7.png'),
  'single-4drawer-shelf': getImagePath('8.png'),
  'single-shelf': getImagePath('9.png'),
  // 듀얼 선반장
  'dual-4drawer-shelf': getImagePath('18.png'),
  'dual-2drawer-shelf': getImagePath('19.png'),
  'dual-shelf': getImagePath('20.png'),
  // 현관장 H
  'single-entryway-h': getImagePath('entrance_single-H.png'),
  'dual-entryway-h': getImagePath('entrance_duel-H.png'),
};

// 가구 이미지 매핑 함수 — 매핑에 없으면 null 반환 (텍스트 썸네일로 대체)
const getFurnitureImagePath = (moduleId: string): string | null => {
  // 너비 접미사 제거 (정수/소수 모두 처리: e.g., -586, -586.4)
  const baseModuleType = moduleId.replace(/-[\d.]+$/, '');
  return FURNITURE_ICONS[baseModuleType] || null;
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
  const backPanelThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? 9.5 : 9; // MDF+PET 코팅 시 +0.5mm
  const drawerHandleThickness = basicThickness; // 마이다는 외부 노출 패널이므로 도어와 동일한 basicThickness
  const drawerSideThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? 15.5 : 15; // PB+PET 코팅 시 15.5mm
  const drawerBottomThickness = backPanelThickness; // 서랍 바닥판 - MDF 재질, 백패널과 동일
  
  const height = moduleData.dimensions.height;
  // 18.5/15.5mm는 양면 접합 두께이므로 innerWidth는 정수 두께로 계산 (슬롯폭 유지)
  const innerWidthThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? Math.floor(basicThickness) : basicThickness;
  const innerWidth = customWidth - (innerWidthThickness * 2);
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
      // 15mm/18mm: 양쪽 0.5mm씩 축소 (총 1mm), 15.5mm/18.5mm: 갭 없음
      const reinforcementHeight = 60; // mm
      const reinforcementDepth = 15; // mm
      const sidePanelGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
      const reinforcementWidth = innerWidth - sidePanelGap;
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
        thickness: 18.5,  // 도어는 PET 항상 18.5mm
        material: 'PET'
      });
      panels.door.push({
        name: '우측 도어',
        width: doorWidth,
        height: height - doorGap * 2,
        thickness: 18.5,  // 도어는 PET 항상 18.5mm
        material: 'PET'
      });
    } else {
      panels.door.push({
        name: '도어',
        width: customWidth - doorGap * 2,
        height: height - doorGap * 2,
        thickness: 18.5,  // 도어는 PET 항상 18.5mm
        material: 'PET'
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

// 뒷턱 다채움 높이 계산: 상판 윗면 ~ 상부장 하단 (또는 천장)
const calcBackLipFillHeight = (
  currentMod: any, moduleData: any, spaceInfo: any, placedModules: any[]
): number => {
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 상판 윗면 절대 위치
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatH = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const isStandType = spaceInfo.baseConfig?.type === 'stand';
  const modHasBaseOff = currentMod.hasBase === false && !isStandType;
  const railOrBaseH = modHasBaseOff ? 0
    : (currentMod.baseFrameHeight !== undefined && !isStandType) ? currentMod.baseFrameHeight
    : isStandType ? (isFloating ? 0 : (spaceInfo.baseConfig?.height || 0))
    : calculateBaseFrameHeight(spaceInfo);
  const indivFloat = modHasBaseOff ? (currentMod.individualFloatHeight ?? 0) : 0;
  const baseH = isFloating ? floatH : (railOrBaseH + indivFloat);
  const floorH = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const lowerBodyH = currentMod.cabinetBodyHeight ?? moduleData?.dimensions?.height ?? 785;
  const stoneT = currentMod.stoneTopThickness || 0;
  const lowerTopMm = floorH + baseH + lowerBodyH + stoneT;

  // 현재 하부장의 X 영역(좌→우 mm)
  const selfWmm = (currentMod.isFreePlacement && currentMod.freeWidth)
    ? currentMod.freeWidth
    : (currentMod.customWidth || currentMod.adjustedWidth || currentMod.moduleWidth || moduleData?.dimensions?.width || 0);
  const selfCxMm = Math.round((currentMod.position?.x ?? 0) * 100);
  const selfL = selfCxMm - selfWmm / 2;
  const selfR = selfCxMm + selfWmm / 2;

  // X 영역이 겹치는 상부장 모두 찾기 (듀얼/싱글 혼용 대응)
  const overlappingUppers = placedModules.filter((m: any) => {
    if (m.id === currentMod.id) return false;
    const md = getModuleById(m.moduleId, internalSpace, spaceInfo) || buildModuleDataFromPlacedModule(m);
    if (md?.category !== 'upper') return false;
    const wmm = (m.isFreePlacement && m.freeWidth)
      ? m.freeWidth
      : (m.customWidth || m.adjustedWidth || m.moduleWidth || md?.dimensions?.width || 0);
    const cxMm = Math.round((m.position?.x ?? 0) * 100);
    const l = cxMm - wmm / 2;
    const r = cxMm + wmm / 2;
    return l < selfR - 1 && r > selfL + 1; // 1mm 미만 접촉은 비겹침
  });

  let targetMm: number;
  if (overlappingUppers.length > 0) {
    // 겹치는 상부장 중 가장 낮은(=가구 하단이 가장 아래) 천장 한계로 결정
    let minTarget = Infinity;
    for (const upper of overlappingUppers) {
      const upperMd = getModuleById(upper.moduleId, internalSpace, spaceInfo) || buildModuleDataFromPlacedModule(upper);
      const upperH = upper.cabinetBodyHeight ?? upperMd?.dimensions?.height ?? 785;
      const topFrame = upper.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
      const t = (spaceInfo.height || 2400) - topFrame - upperH;
      if (t < minTarget) minTarget = t;
    }
    targetMm = minTarget;
  } else {
    targetMm = spaceInfo.height || 2400;
  }

  return Math.max(0, Math.round(targetMm - lowerTopMm));
};

const PlacedModulePropertiesPanel: React.FC = () => {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState<number | null>(null);
  const setHighlightedPanel = useUIStore(state => state.setHighlightedPanel);
  const setHighlightedSection = useUIStore(state => state.setHighlightedSection);
  const setSelectedFurnitureId = useUIStore(state => state.setSelectedFurnitureId);
  const setPanelListTabActive = useUIStore(state => state.setPanelListTabActive);
  const activePopup = useUIStore(state => state.activePopup);
  const closeAllPopups = useUIStore(state => state.closeAllPopups);
  const setHighlightedFrame = useUIStore(state => state.setHighlightedFrame);

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
  const [lowerWidthInput, setLowerWidthInput] = useState<string>(''); // 하부 섹션 너비 입력 필드
  const [upperWidthInput, setUpperWidthInput] = useState<string>(''); // 상부 섹션 너비 입력 필드
  const [lowerWidthDirection, setLowerWidthDirection] = useState<'left' | 'right'>('left'); // 하부 너비 줄이는 방향 (left: 좌고정, right: 우고정)
  const [upperWidthDirection, setUpperWidthDirection] = useState<'left' | 'right'>('left'); // 상부 너비 줄이는 방향
  const [lowerTopOffset, setLowerTopOffset] = useState<number>(0); // 하부 섹션 상판 옵셋 (mm)
  const [lowerTopOffsetInput, setLowerTopOffsetInput] = useState<string>('0'); // 하부 섹션 상판 옵셋 입력
  // EP 옵셋 입력 임시 문자열 — '-' 단독 입력 허용용 (undefined면 store값 표시)
  const [epInputs, setEpInputs] = useState<{
    leftFront?: string;
    leftBack?: string;
    rightFront?: string;
    rightBack?: string;
  }>({});
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
  const [cabinetBodyHeightInput, setCabinetBodyHeightInput] = useState<string>('785'); // 하부장 몸통 높이 입력

  // 자유배치 모드 치수 상태
  const [freeWidthInput, setFreeWidthInput] = useState<string>('');
  const [freeHeightInput, setFreeHeightInput] = useState<string>('');
  const [freeDepthInput, setFreeDepthInput] = useState<string>('');
  const epDepthFocusedRef = React.useRef(false); // EP 깊이 (unused, kept for compat)
  const [epThicknessInput, setEpThicknessInput] = useState<string>(''); // EP 두께 로컬 버퍼
  const epThicknessFocusedRef = React.useRef(false); // EP 두께 입력 포커스 추적

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

  // 선반장 편집 상태 (섹션별)
  const [lowerShelfCount, setLowerShelfCount] = useState<number>(0);
  const [lowerShelfPositionInputs, setLowerShelfPositionInputs] = useState<string[]>([]);
  const [upperShelfCount, setUpperShelfCount] = useState<number>(0);
  const [upperShelfPositionInputs, setUpperShelfPositionInputs] = useState<string[]>([]);

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
            modelConfig: { basicThickness: spaceInfo.panelThickness ?? 18 },
          } as ModuleData);
        }

        // customWidth가 있으면 해당 너비로 모듈 ID 생성 (소수점 포함)
        let targetModuleId = currentPlacedModule.moduleId;
        if (currentPlacedModule.customWidth) {
          const baseType = currentPlacedModule.moduleId.replace(/-[\d.]+$/, '');
          targetModuleId = `${baseType}-${currentPlacedModule.customWidth}`;
        }
        // 단내림 구간 가구는 zone 정보를 포함한 spaceInfo로 moduleData 조회
        // (3D 렌더링의 FurnitureItem.tsx와 동일하게 zone 반영)
        let effectiveSpaceInfo = spaceInfo;
        if (currentPlacedModule.zone === 'dropped') {
          effectiveSpaceInfo = { ...spaceInfo, zone: 'dropped' as const };
        }
        const data = getModuleById(targetModuleId, calculateInternalSpace(effectiveSpaceInfo), effectiveSpaceInfo)
          || buildModuleDataFromPlacedModule(currentPlacedModule);
        return withUpperSafetyShelfRemoved(data as ModuleData, currentPlacedModule.removeUpperSafetyShelf);
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
    // 2단/4단 서랍장, 인출장: 85mm 기본 (1·2단 상판 앞 옵셋)
    // 팬트리장: 0 (1단 상판 풀깊이)
    return moduleData.id.includes('2drawer') || moduleData.id.includes('4drawer') || moduleData.id.includes('pull-out-cabinet') ? 85 : 0;
  }, [moduleData?.id]);

  // 초기값 설정 - 의존성에서 getDefaultDepth 제거하여 불필요한 재실행 방지
  useEffect(() => {
    if (currentPlacedModule && moduleData) {
      const initialDepth = currentPlacedModule.customDepth !== undefined && currentPlacedModule.customDepth !== null
        ? currentPlacedModule.customDepth
        : getDefaultDepth(moduleData);

      // 기둥에 의해 조정된 너비가 있으면 우선 사용, 없으면 slotCustomWidth, customWidth, 기본 너비 순
      const initialWidth = currentPlacedModule.adjustedWidth !== undefined && currentPlacedModule.adjustedWidth !== null
        ? currentPlacedModule.adjustedWidth
        : (currentPlacedModule.slotCustomWidth !== undefined
          ? currentPlacedModule.slotCustomWidth
          : (currentPlacedModule.customWidth !== undefined && currentPlacedModule.customWidth !== null
            ? currentPlacedModule.customWidth
            : moduleData.dimensions.width));
      console.log('🔍 [팝업 치수 디버그]', {
        moduleId: currentPlacedModule.moduleId,
        isDualSlot: currentPlacedModule.isDualSlot,
        adjustedWidth: currentPlacedModule.adjustedWidth,
        customWidth_prop: currentPlacedModule.customWidth,
        moduleDimWidth: moduleData.dimensions.width,
        initialWidth,
        freeWidth: currentPlacedModule.freeWidth,
      });

      // customDepth 초기화 — 가구 변경 시 항상 갱신
      setCustomDepth(initialDepth);
      setDepthInputValue(initialDepth.toString());
      setOriginalCustomDepth(initialDepth);
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
      // customWidth 초기화 — 가구 변경 시 항상 갱신
      const roundedWidth = Math.round(initialWidth * 10) / 10;
      setCustomWidth(roundedWidth);
      setWidthInputValue(roundedWidth % 1 === 0 ? roundedWidth.toString() : roundedWidth.toFixed(1));
      setOriginalCustomWidth(initialWidth);
      const hingePos = currentPlacedModule.hingePosition || 'right';
      const hingeTypeVal = currentPlacedModule.hingeType || 'A';
      const hasDoorVal = currentPlacedModule.hasDoor ?? false; // 3D 렌더링(FurnitureItem)과 동일 기준
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

      // 하부장 몸통 높이 초기화 (2단서랍장만)
      setCabinetBodyHeightInput((currentPlacedModule.cabinetBodyHeight ?? 785).toString());

      // 치수 초기화 (슬롯/자유배치 공통)
      // NOTE: roundedWidth를 사용 (customWidth state는 이 useEffect 내에서 아직 이전 값)
      {
        const isSlotMode = spaceInfo.layoutMode !== 'free-placement';
        const slotModeWidth = isSlotMode
          ? (currentPlacedModule.slotCustomWidth ?? roundedWidth ?? moduleData.dimensions.width)
          : (currentPlacedModule.freeWidth || roundedWidth || moduleData.dimensions.width);
        setFreeWidthInput((() => { const v = Math.round(slotModeWidth * 10) / 10; return v % 1 === 0 ? v.toString() : v.toFixed(1); })());
        // 2단서랍장: cabinetBodyHeight 우선, 그 외: freeHeight → moduleData.dimensions.height
        const is2TierDrawer = currentPlacedModule.moduleId.includes('lower-drawer-2tier') || currentPlacedModule.moduleId.includes('dual-lower-drawer-2tier');
        const effectiveHeight = is2TierDrawer && currentPlacedModule.cabinetBodyHeight
          ? currentPlacedModule.cabinetBodyHeight
          : (currentPlacedModule.freeHeight || moduleData.dimensions.height);
        setFreeHeightInput(Math.round(effectiveHeight).toString());
        setFreeDepthInput(Math.round(currentPlacedModule.freeDepth || initialDepth).toString());

        // EP 두께 초기화
        if (!epThicknessFocusedRef.current) {
          setEpThicknessInput((currentPlacedModule.endPanelThickness ?? 18).toString());
        }

        // 섹션별 치수 초기화 (customConfig가 있을 때)
        const cc = currentPlacedModule.customConfig;
        if (cc && cc.sections && cc.sections.length > 0) {
          const pt = cc.panelThickness || 18;
          const totalDepth = currentPlacedModule.customDepth || currentPlacedModule.freeDepth || moduleData.dimensions.depth;
          const totalWidth = currentPlacedModule.freeWidth || currentPlacedModule.customWidth || moduleData.dimensions.width;
          // 신발장: 옛 데이터의 섹션 깊이가 moduleData.dimensions.depth(600)로 stale 저장된 경우 무시
          const _isShoeCat =
            currentPlacedModule.moduleId.includes('-entryway-') ||
            currentPlacedModule.moduleId.includes('-shelf-') ||
            currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
            currentPlacedModule.moduleId.includes('-2drawer-shelf-');
          const _modDim = moduleData.dimensions.depth;
          const _hasCustom = typeof currentPlacedModule.customDepth === 'number' && currentPlacedModule.customDepth > 0;
          const _sec = (v: number | undefined) => (_isShoeCat && _hasCustom && v === _modDim) ? undefined : v;
          const _lowerSec = _sec(currentPlacedModule.lowerSectionDepth);
          const _upperSec = _sec(currentPlacedModule.upperSectionDepth);
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
            if (i === 0) dInputs[i] = Math.round(_lowerSec ?? totalDepth).toString();
            else if (i === 1) dInputs[i] = Math.round(_upperSec ?? totalDepth).toString();
            else dInputs[i] = Math.round(totalDepth).toString();
            // 섹션 너비 (개별 너비가 없으면 전체 너비)
            wInputs[i] = (() => { const v = Math.round((sec.width || totalWidth) * 10) / 10; return v % 1 === 0 ? v.toString() : v.toFixed(1); })();
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
            // moduleData는 zone 반영된 getModuleById로 조회되므로 dimensions.height에 단내림이 반영됨
            const totalH = currentPlacedModule.freeHeight || moduleData.dimensions.height;
            const totalD = currentPlacedModule.customDepth || currentPlacedModule.freeDepth || moduleData.dimensions.depth;
            const totalW = currentPlacedModule.freeWidth
              ?? currentPlacedModule.adjustedWidth
              ?? currentPlacedModule.customWidth
              ?? moduleData.dimensions.width;
            const dimH = moduleData.dimensions.height; // 원래 모듈 높이
            // 신발장: 옛 데이터의 섹션 깊이가 moduleData.dimensions.depth(600)로 stale 저장된 경우 무시
            const _isShoeCat2 =
              currentPlacedModule.moduleId.includes('-entryway-') ||
              currentPlacedModule.moduleId.includes('-shelf-') ||
              currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
              currentPlacedModule.moduleId.includes('-2drawer-shelf-');
            const _modDim2 = moduleData.dimensions.depth;
            const _hasCustom2 = typeof currentPlacedModule.customDepth === 'number' && currentPlacedModule.customDepth > 0;
            const _sec2 = (v: number | undefined) => (_isShoeCat2 && _hasCustom2 && v === _modDim2) ? undefined : v;
            const _lowerSec2 = _sec2(currentPlacedModule.lowerSectionDepth);
            const _upperSec2 = _sec2(currentPlacedModule.upperSectionDepth);
            const hInputs: Record<number, string> = {};
            const dInputs: Record<number, string> = {};
            const wInputs: Record<number, string> = {};
            mcSections.forEach((sec: any, i: number) => {
              const ht = sec.heightType || 'percentage';
              const isLast = i === mcSections.length - 1;
              let sH: number;
              if (ht === 'absolute') {
                if (isLast) {
                  // 마지막 섹션: sec.height + freeHeight 차이 흡수
                  const diff = totalH - dimH;
                  sH = (sec.height || 0) + diff;
                } else {
                  sH = sec.height || 0;
                }
              } else {
                sH = Math.round(totalH * ((sec.height || sec.heightRatio || 50) / 100));
              }
              hInputs[i] = Math.round(sH).toString();
              if (i === 0) dInputs[i] = Math.round(_lowerSec2 ?? totalD).toString();
              else if (i === 1) dInputs[i] = Math.round(_upperSec2 ?? totalD).toString();
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
      // 모듈별 기본 doorTopGap: 도어올림=30, 상판내림=-80, 일반하부장=-20, 그 외=0
      const modId = currentPlacedModule.moduleId || '';
      const isLowerMod = modId.startsWith('lower-') || modId.includes('dual-lower-');
      const isDoorLift = modId.includes('lower-door-lift-') && !modId.includes('-half-');
      const isTopDown = modId.includes('lower-top-down-') && !modId.includes('-half-');
      const defaultTopGap = isDoorLift ? 30 : isTopDown ? -80 : isLowerMod ? -20 : 0;
      // 하부장에서 doorTopGap=0은 이전 버그값 → 모듈별 기본값으로 보정
      const rawTopGap = currentPlacedModule.doorTopGap;
      const initialTopGap = (rawTopGap === undefined || (isLowerMod && rawTopGap === 0)) ? defaultTopGap : rawTopGap;
      // 도어 상하갭은 항상 바닥/천장 기준 (받침대/띄움 무관, 0이면 공간 높이)
      const rawBotGap = currentPlacedModule.doorBottomGap;
      const initialBottomGap = (rawBotGap === undefined || (isLowerMod && rawBotGap === 0)) ? (isLowerMod ? 5 : 0) : rawBotGap;
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

      // 인조대리석 상판 앞 오프셋 자동 보정: 상판 설치 상태에서 frontOffset 미설정 시 기본값 적용
      const stoneT = currentPlacedModule.stoneTopThickness || 0;
      const stoneFO = currentPlacedModule.stoneTopFrontOffset;
      if (stoneT > 0 && (stoneFO === undefined || stoneFO === 0)) {
        const defaultFO = isTopDown
          ? (stoneT === 30 ? 33 : 23)
          : isDoorLift ? 0 : 23;
        if (defaultFO > 0) {
          updatePlacedModule(currentPlacedModule.id, { stoneTopFrontOffset: defaultFO });
        }
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

      // 2섹션 가구의 섹션 깊이 초기화 (인출장/팬트리장은 N섹션도 포함)
      const sections = currentPlacedModule.customSections || moduleData.modelConfig?.sections || [];
      const isPullOutOrPantryInit = !!(
        currentPlacedModule.moduleId?.includes('pull-out-cabinet') ||
        currentPlacedModule.moduleId?.includes('pantry-cabinet') ||
        (currentPlacedModule.moduleId?.includes('fridge-cabinet') && !currentPlacedModule.moduleId?.includes('built-in-fridge'))
      );
      if (sections.length === 2 || (isPullOutOrPantryInit && sections.length >= 2)) {
        // customDepth/freeDepth 우선 (신발장 380 등), 없으면 모듈 템플릿 깊이
        const defaultDepth = currentPlacedModule.customDepth
          ?? currentPlacedModule.freeDepth
          ?? moduleData.dimensions.depth;

        // 신발장(entryway/shelf) 카테고리 판별 — 옛 데이터에 섹션 깊이가 모듈 기본(600)으로
        // 잘못 저장된 경우가 있어 무효값으로 간주하고 customDepth(380)로 대체
        const isShoeCategory =
          currentPlacedModule.moduleId.includes('-entryway-') ||
          currentPlacedModule.moduleId.includes('-shelf-') ||
          currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
          currentPlacedModule.moduleId.includes('-2drawer-shelf-');
        const modDimDepth = moduleData.dimensions.depth;
        const hasCustomDepth = typeof currentPlacedModule.customDepth === 'number' && currentPlacedModule.customDepth > 0;
        const resolveStored = (v: number | undefined): number | undefined => {
          if (v === undefined) return undefined;
          if (isShoeCategory && hasCustomDepth && v === modDimDepth) return undefined; // stale 값 무시
          return v;
        };

        // 저장된 섹션 깊이가 있으면 그대로 존중 (상/하 동기화 금지)
        // 없을 때만 defaultDepth로 초기화
        const storedLower = resolveStored(currentPlacedModule.lowerSectionDepth);
        const storedUpper = resolveStored(currentPlacedModule.upperSectionDepth);
        const lowerDepth = storedLower ?? defaultDepth;
        const upperDepth = storedUpper ?? defaultDepth;

        // 인출장/팬트리장은 sectionDepths 배열 사용 — lowerSectionDepth/upperSectionDepth 자동 설정 안 함
        const needsLowerFix = !isPullOutOrPantryInit && (currentPlacedModule.lowerSectionDepth === undefined
          || (isShoeCategory && hasCustomDepth && currentPlacedModule.lowerSectionDepth === modDimDepth));
        const needsUpperFix = !isPullOutOrPantryInit && (currentPlacedModule.upperSectionDepth === undefined
          || (isShoeCategory && hasCustomDepth && currentPlacedModule.upperSectionDepth === modDimDepth));
        if (needsLowerFix || needsUpperFix) {
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

        // 섹션별 너비 초기화 (기둥 침범 시 adjustedWidth 기준)
        const baseW = currentPlacedModule.adjustedWidth || currentPlacedModule.customWidth || initialWidth;
        const lw = currentPlacedModule.lowerSectionWidth ?? baseW;
        const uw = currentPlacedModule.upperSectionWidth ?? baseW;
        setLowerWidthInput(Math.round(lw).toString());
        setUpperWidthInput(Math.round(uw).toString());
        setLowerWidthDirection(currentPlacedModule.lowerSectionWidthDirection || 'left');
        setUpperWidthDirection(currentPlacedModule.upperSectionWidthDirection || 'left');

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

      // 선반장 모듈 초기화 (2섹션: 하단/상단 각각)
      const isShelfModule = currentPlacedModule.moduleId.includes('-shelf-') ||
        currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
        currentPlacedModule.moduleId.includes('-2drawer-shelf-') ||
        currentPlacedModule.moduleId.includes('-entryway-');
      if (isShelfModule) {
        const effectiveSections = currentPlacedModule.customSections || moduleData.modelConfig?.sections || [];
        // 하단(섹션0) shelf
        const sec0 = effectiveSections[0];
        if (sec0 && sec0.type === 'shelf') {
          setLowerShelfCount(sec0.count || 0);
          setLowerShelfPositionInputs((sec0.shelfPositions || []).map((p: number) => Math.round(p).toString()));
        } else {
          setLowerShelfCount(0);
          setLowerShelfPositionInputs([]);
        }
        // 상단(섹션1) shelf
        const sec1 = effectiveSections[1];
        if (sec1 && sec1.type === 'shelf') {
          setUpperShelfCount(sec1.count || 0);
          setUpperShelfPositionInputs((sec1.shelfPositions || []).map((p: number) => Math.round(p).toString()));
        } else {
          setUpperShelfCount(0);
          setUpperShelfPositionInputs([]);
        }
      }
    }
  }, [currentPlacedModule?.id, moduleData?.id, currentPlacedModule?.customDepth, currentPlacedModule?.customWidth, currentPlacedModule?.adjustedWidth, currentPlacedModule?.hasDoor, currentPlacedModule?.doorTopGap, currentPlacedModule?.doorBottomGap, moduleDefaultLowerTopOffset, currentPlacedModule?.customSections]); // customSections 변경 시 즉시 반영

  // 도어 상하갭은 바닥/천장 기준 (받침대/띄움 무관)
  // 배치 타입 변경 시 갭값을 자동으로 바꾸지 않음 — 사용자가 도어갭에서 직접 조정

  // ⚠️ CRITICAL: 모든 hooks는 조건부 return 전에 호출되어야 함 (React hooks 규칙)
  // 듀얼 가구 여부 확인 (moduleId 기반)
  const isDualFurniture = moduleData ? moduleData.id.startsWith('dual-') : false;

  // 싱글 가구 여부 확인 (듀얼이 아닌 경우)
  const isSingleFurniture = !isDualFurniture;

  // 2섹션 가구 여부 확인
  const sections = moduleData?.modelConfig?.sections || [];
  // 인출장(3섹션)/팬트리장(2섹션) 모두 상판 옵셋 입력 필드 노출
  // 인출장/팬트리장/냉장고장: sectionDepths 배열 사용
  const isPullOutOrPantry = !!(
    moduleData?.id?.includes('pull-out-cabinet') ||
    moduleData?.id?.includes('pantry-cabinet') ||
    (moduleData?.id?.includes('fridge-cabinet') && !moduleData?.id?.includes('built-in-fridge'))
  );
  const isTwoSectionFurniture = sections.length === 2 || (isPullOutOrPantry && sections.length >= 2);

  // 도어용 원래 너비 계산 (adjustedWidth가 없으면 slotCustomWidth → customWidth → 기본 너비)
  const doorOriginalWidth = currentPlacedModule?.slotCustomWidth ?? currentPlacedModule?.customWidth ?? moduleData?.dimensions.width;

  // 프레임 높이 계산 (상단몰딩, 걸래받이)
  const topFrameHeightMm = calculateTopBottomFrameHeight(spaceInfo);
  // 개별 가구 baseFrameHeight 우선 → 글로벌 spaceInfo 폴백 (FurnitureItem.tsx와 동일 우선순위)
  const globalBaseFrameHeightMm = calculateBaseFrameHeight(spaceInfo);
  const baseFrameHeightMm = currentPlacedModule?.baseFrameHeight ?? globalBaseFrameHeightMm;
  // 받침대 높이는 바닥마감재와 무관하게 원래 값 사용
  const floorFinishH = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 15) : 0;
  const visualBaseFrameHeightMm = baseFrameHeightMm;

  // 패널 상세정보 계산 (hasDoor 변경 시 자동 재계산)
  // moduleData는 zone 반영된 effectiveSpaceInfo로 getModuleById 조회되므로
  // dimensions.height에 이미 단내림이 반영됨 → freeHeight 추가 보정 불필요
  // EP ㄷ자 프레임: 인접 가구 판단 (측판 생략 여부)
  const { leftEpAdjacent, rightEpAdjacent } = React.useMemo(() => {
    if (!currentPlacedModule) return { leftEpAdjacent: false, rightEpAdjacent: false };
    const mySlot = currentPlacedModule.slotIndex;
    const myZone = currentPlacedModule.zone || 'normal';
    const isDual = currentPlacedModule.isDualSlot;
    if (mySlot === undefined || currentPlacedModule.isFreePlacement) return { leftEpAdjacent: false, rightEpAdjacent: false };
    const leftAdj = placedModules.some(m =>
      m.id !== currentPlacedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
      m.slotIndex !== undefined && (m.slotIndex === mySlot - 1 || (m.isDualSlot && m.slotIndex === mySlot - 2))
    );
    const rightEnd = isDual ? mySlot + 1 : mySlot;
    const rightAdj = placedModules.some(m =>
      m.id !== currentPlacedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
      m.slotIndex !== undefined && (m.slotIndex === rightEnd + 1 || (m.isDualSlot && m.slotIndex === rightEnd + 1))
    );
    return { leftEpAdjacent: leftAdj, rightEpAdjacent: rightAdj };
  }, [currentPlacedModule, placedModules]);

  // 개별 baseFrameHeight가 글로벌과 다르면 가구 높이 보정
  // moduleData.dimensions.height는 글로벌 baseFrame 기준이므로, 차이만큼 가구 높이에 반영
  const baseFrameDelta = globalBaseFrameHeightMm - baseFrameHeightMm; // 글로벌65 - 개별60 = +5mm
  const adjustedFreeHeight = (() => {
    const base = currentPlacedModule?.freeHeight || currentPlacedModule?.customHeight;
    if (baseFrameDelta !== 0) {
      // freeHeight가 있으면 delta 보정, 없으면 moduleData 높이 + delta
      return (base || moduleData?.dimensions.height || 0) + baseFrameDelta;
    }
    return base;
  })();

  const panelDetails = React.useMemo(() => {
    if (!moduleData) return [];
    return calculatePanelDetails(
      moduleData, customWidth, customDepth, hasDoor, t, doorOriginalWidth,
      undefined, undefined, undefined, currentPlacedModule?.doorTopGap, currentPlacedModule?.doorBottomGap, undefined,
      backPanelThicknessValue, currentPlacedModule?.customConfig,
      currentPlacedModule?.hasLeftEndPanel, currentPlacedModule?.hasRightEndPanel,
      currentPlacedModule?.endPanelThickness, adjustedFreeHeight,
      topFrameHeightMm, visualBaseFrameHeightMm,
      currentPlacedModule?.hasTopFrame, currentPlacedModule?.hasBase,
      currentPlacedModule?.isDualSlot,
      leftEpAdjacent, rightEpAdjacent,
      currentPlacedModule?.topPanelNotchSize, currentPlacedModule?.topPanelNotchSide,
      // 인조대리석 상판설치
      currentPlacedModule?.stoneTopThickness,
      currentPlacedModule?.stoneTopFrontOffset,
      currentPlacedModule?.stoneTopBackOffset,
      currentPlacedModule?.stoneTopLeftOffset,
      currentPlacedModule?.stoneTopRightOffset
    );
  }, [moduleData, customWidth, customDepth, hasDoor, t, doorOriginalWidth, backPanelThicknessValue, currentPlacedModule?.customConfig, currentPlacedModule?.hasLeftEndPanel, currentPlacedModule?.hasRightEndPanel, currentPlacedModule?.endPanelThickness, adjustedFreeHeight, topFrameHeightMm, visualBaseFrameHeightMm, currentPlacedModule?.hasTopFrame, currentPlacedModule?.hasBase, currentPlacedModule?.isDualSlot, leftEpAdjacent, rightEpAdjacent, currentPlacedModule?.topPanelNotchSize, currentPlacedModule?.topPanelNotchSide, currentPlacedModule?.stoneTopThickness, currentPlacedModule?.stoneTopFrontOffset, currentPlacedModule?.stoneTopBackOffset, currentPlacedModule?.stoneTopLeftOffset, currentPlacedModule?.stoneTopRightOffset, currentPlacedModule?.doorTopGap, currentPlacedModule?.doorBottomGap]);

  // 서라운드 패널 계산 — 맨 좌측 가구에 좌측 서라운드, 맨 우측 가구에 우측 서라운드 귀속
  const surroundPanels = React.useMemo(() => {
    if (!spaceInfo.freeSurround || !currentPlacedModule) return [];
    // 서라운드 높이 = 공간높이 - 바닥마감재 - 띄움높이
    const spaceH = spaceInfo.height || 2400;
    const floatH = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
      ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
    const surroundH = spaceH - floorFinishH - floatH;
    const allSurroundPanels = calculateSurroundPanels(spaceInfo.freeSurround, surroundH, spaceInfo.panelThickness ?? 18);
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
        ...(isTopPanel ? { freeHeight: 18.5 } : { freeWidth: 18.5 }), // 서라운드(PET) 항상 18.5mm
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
                    두께: 18.5mm (고정) / 폭: {currentWidth}mm
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
                <span className={styles.propertyValue}>18.5mm (고정)</span>
              </div>
            </div>

            {/* 서라운드 옵셋 설정 */}
            <div className={styles.propertySection}>
              <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>옵셋 조정</h5>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>좌 ←</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetLeft ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetLeft: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>우 →</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetRight ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetRight: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>상 ↑</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetTop ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetTop: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>하 ↓</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetBottom ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetBottom: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>깊이</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={currentPlacedModule.surroundOffsetDepth ?? 0}
                    onChange={(e) => updatePlacedModule(currentPlacedModule.id, { surroundOffsetDepth: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
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

      // 자유배치 가구는 freeWidth/moduleWidth도 함께 갱신하고 userResizedWidth 표시
      // (화살표 이동 시 원래 폭으로 되돌아가는 문제 방지)
      if (currentPlacedModule.isFreePlacement) {
        updateData.freeWidth = newWidth;
        updateData.moduleWidth = newWidth;
        updateData.userResizedWidth = true;
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
    const totalDepth = currentPlacedModule.customDepth || currentPlacedModule.freeDepth || 580;
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
      
      // hasDoor 켤 때 doorTopGap/doorBottomGap 기본값도 함께 설정
      const mod = useFurnitureStore.getState().placedModules.find(m => m.id === activePopup.id);
      const updates: Record<string, unknown> = { hasDoor: doorEnabled };
      if (doorEnabled && mod) {
        const mId = mod.moduleId || '';
        const cat = mId.includes('upper-') ? 'upper' : mId.startsWith('lower-') ? 'lower' : 'full';
        const isDL = mId.includes('lower-door-lift-') && !mId.includes('-half-');
        const isTD = mId.includes('lower-top-down-') && !mId.includes('-half-');
        if (mod.doorTopGap === undefined) {
          updates.doorTopGap = isDL ? 30 : isTD ? -80 : cat === 'lower' ? -20 : cat === 'upper' ? -20 : 5;
        }
        if (mod.doorBottomGap === undefined) {
          updates.doorBottomGap = cat === 'lower' ? 5 : cat === 'upper' ? 5 : 25;
        }
      }
      updatePlacedModule(activePopup.id, updates);

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
      const columnDepth = slotInfo.column?.depth || 300; // 기둥 깊이
      // 가구 기본 깊이(moduleData 기준) - 기둥 깊이 = 기둥 앞에 배치할 수 있는 남은 깊이
      const baseFurnitureDepth = moduleData?.dimensions?.depth || moduleData?.defaultDepth || 600;
      const remainingDepth = Math.max(50, baseFurnitureDepth - columnDepth); // 최소 50mm 보장

      // 슬롯 중심 위치 계산 (치수가이드 동기화용)
      const slotIndex = currentPlacedModule.slotIndex;
      const slotCenterX = slotIndex !== undefined && indexing.threeUnitPositions[slotIndex] !== undefined
        ? indexing.threeUnitPositions[slotIndex]
        : currentPlacedModule.position.x;

      if (mode === 'front') {
        // 기둥 앞에 배치: 화살표 버튼과 동일한 로직
        // customDepth 축소 + sectionDepthDirection='back'으로 뒷면 고정 (가구 앞쪽으로 이동)
        updatePlacedModule(activePopup.id, {
          columnPlacementMode: mode,
          customWidth: slotWidth,
          customDepth: remainingDepth,
          lowerSectionDepth: remainingDepth,
          upperSectionDepth: remainingDepth,
          lowerSectionDepthDirection: 'back',
          upperSectionDepthDirection: 'back',
          adjustedWidth: undefined,
          columnSlotInfo: undefined,
          position: {
            ...currentPlacedModule.position,
            x: slotCenterX
          }
        } as any);
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
              {(() => {
                const imgPath = getFurnitureImagePath(moduleData.id);
                if (imgPath) {
                  return (
                    <img
                      src={imgPath}
                      alt={moduleData.name}
                      className={styles.moduleImage}
                      onError={(e) => {
                        // 이미지 로드 실패 시 텍스트 썸네일로 대체
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                        const container = img.parentElement;
                        if (container) {
                          const name = moduleData.name.replace(/\s*\d+(\.\d+)?mm$/, '');
                          container.innerHTML = `<div style="
                            display: flex; align-items: center; justify-content: center;
                            width: 100%; height: 100%; background: #f5f5f5; border-radius: 6px;
                            font-size: 12px; color: #666; text-align: center; padding: 4px;
                          ">${name}</div>`;
                        }
                      }}
                    />
                  );
                }
                // 이미지 없으면 텍스트 썸네일
                const name = moduleData.name.replace(/\s*\d+(\.\d+)?mm$/, '');
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', height: '100%', background: '#f5f5f5', borderRadius: '6px',
                    fontSize: '12px', color: '#666', textAlign: 'center', padding: '4px',
                  }}>{name}</div>
                );
              })()}
            </div>
            
            <div className={styles.moduleDetails}>
              <h4 className={styles.moduleName}>
                {(() => {
                  // currentPlacedModule에서 직접 너비를 계산 (state 의존 제거로 갱신 지연 방지)
                  const directW = currentPlacedModule
                    ? Math.round((currentPlacedModule.adjustedWidth ?? currentPlacedModule.customWidth ?? moduleData.dimensions.width) * 10) / 10
                    : customWidth;
                  return directW && directW !== moduleData.dimensions.width
                    ? moduleData.name.replace(/[\d.]+mm/, `${directW}mm`)
                    : moduleData.name;
                })()}
              </h4>

              <div className={styles.property}>
                <span className={styles.propertyValue}>
                  {(() => {
                    const directW = currentPlacedModule
                      ? Math.round((currentPlacedModule.adjustedWidth ?? currentPlacedModule.customWidth ?? moduleData.dimensions.width) * 10) / 10
                      : customWidth;
                    const directD = currentPlacedModule
                      ? (currentPlacedModule.customDepth ?? getDefaultDepth(moduleData))
                      : customDepth;
                    const is2Tier = currentPlacedModule?.moduleId.includes('lower-drawer-2tier') || currentPlacedModule?.moduleId.includes('dual-lower-drawer-2tier');
                    const displayH = is2Tier && currentPlacedModule?.cabinetBodyHeight ? currentPlacedModule.cabinetBodyHeight : moduleData.dimensions.height;
                    return `${directW} × ${displayH} × ${directD}mm`;
                  })()}
                </span>
              </div>
              {/* 뒷벽과 이격 */}
              {currentPlacedModule && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>뒷벽 이격</span>
                  <div className={styles.inputWithUnit} style={{ flex: 1 }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={String(currentPlacedModule.backWallGap ?? 0)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const parsed = parseBackWallGapInput(raw);
                        if (parsed !== null) {
                          updatePlacedModule(currentPlacedModule.id, { backWallGap: parsed });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const next = stepBackWallGapMm(
                            currentPlacedModule.backWallGap,
                            e.key === 'ArrowUp' ? 1 : -1
                          );
                          updatePlacedModule(currentPlacedModule.id, { backWallGap: next });
                        }
                      }}
                      className={styles.depthInput}
                      style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1, width: '70px', textAlign: 'center' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
              )}
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

                  // 백패널 여부 확인 (무결이어도 Length는 항상 높이 축)
                  const isBackPanel = panel.name.includes('백패널');

                  if (panel.diameter) {
                    dimensionDisplay = `Φ ${panel.diameter} × L ${panel.width}`;
                  } else if (panel.width && panel.height) {
                    // width/height를 가진 패널 (도어, 측판, 백패널 등)
                    if (isBackPanel) {
                      // 백패널: 높이(height) = L (항상), 가로(width) = W
                      dimensionDisplay = `W ${panel.width} × L ${panel.height}`;
                    } else if (isVerticalGrain) {
                      // 세로 결: height가 L
                      dimensionDisplay = `W ${panel.width} × L ${panel.height}`;
                    } else {
                      // 가로 결: width가 L
                      dimensionDisplay = `W ${panel.height} × L ${panel.width}`;
                    }
                  } else if (panel.width && panel.depth) {
                    // width/depth를 가진 패널 (상판, 바닥판, 선반 - 기본 가로 결)
                    if (isVerticalGrain) {
                      // 세로 결: depth가 L
                      dimensionDisplay = `W ${panel.width} × L ${panel.depth}`;
                    } else {
                      // 가로 결: width가 L (선반·상판·바닥은 width가 재단방향)
                      dimensionDisplay = `W ${panel.depth} × L ${panel.width}`;
                    }
                  } else if (panel.height && panel.depth) {
                    // height/depth를 가진 패널
                    if (isDrawerPanel) {
                      // 서랍 측판: depth가 재단방향(L)
                      dimensionDisplay = `W ${panel.height} × L ${panel.depth}`;
                    } else if (isVerticalGrain) {
                      // 일반 가구 측판 (세로 결): height가 L
                      dimensionDisplay = `W ${panel.depth} × L ${panel.height}`;
                    } else {
                      // 가로 결: depth가 L
                      dimensionDisplay = `W ${panel.height} × L ${panel.depth}`;
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
                          background: '#757575',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          minWidth: '36px',
                          height: '26px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
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
                        title={`${panel.name} 나무결 방향 전환 (W ↔ L)`}
                      >
                        <FaExchangeAlt size={12} />
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

          {/* 가구 치수 편집 — 한 줄 가로 배치 (편집 탭 전용) */}
          {!showDetails && currentPlacedModule && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>몸통치수</h5>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                {/* 너비 — 슬롯배치/자유배치 모두 편집 가능 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>W</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeWidthInput}
                      onChange={(e) => setFreeWidthInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeWidthInput, 10);
                        const isSlotMode = spaceInfo.layoutMode !== 'free-placement';

                        if (isSlotMode && currentPlacedModule) {
                          // 슬롯 모드: adjustSlotWidth 사용
                          if (!isNaN(val) && val >= 200 && currentPlacedModule.slotIndex !== undefined) {
                            // max 검증: internalWidth - 다른 고정합 - 남은슬롯×200
                            const { adjustSlotWidth } = useFurnitureStore.getState();
                            adjustSlotWidth(currentPlacedModule.id, val);
                            setFreeWidthInput(val.toString());
                          }
                        } else if (!isNaN(val) && val >= 100 && val <= 2400 && currentPlacedModule) {
                          // 자유배치 모드: 기존 로직
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
                            userResizedWidth: true, // 사용자가 직접 폭 변경 → 이동 시 자동 리사이즈 차단
                          } as any);
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
                          const isSlotMode = spaceInfo.layoutMode !== 'free-placement';
                          const freshMod = useFurnitureStore.getState().placedModules.find(m => m.id === currentPlacedModule?.id);

                          if (isSlotMode && currentPlacedModule && freshMod) {
                            // 슬롯 모드: adjustSlotWidth 사용
                            const curW = freshMod.slotCustomWidth ?? freshMod.customWidth ?? moduleData.dimensions.width;
                            const next = Math.max(200, curW + (e.key === 'ArrowUp' ? 1 : -1));
                            setFreeWidthInput(next.toString());
                            const { adjustSlotWidth } = useFurnitureStore.getState();
                            adjustSlotWidth(currentPlacedModule.id, next);
                          } else {
                            // 자유배치 모드: 기존 로직
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
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="너비"
                      style={{ fontSize: '12px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                {/* 높이 — 2단서랍장은 '몸통 높이'로만 조절, H는 읽기전용 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>H</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeHeightInput}
                      readOnly={!!(currentPlacedModule && (currentPlacedModule.moduleId.includes('lower-drawer-2tier') || currentPlacedModule.moduleId.includes('dual-lower-drawer-2tier')))}
                      onChange={(e) => setFreeHeightInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeHeightInput, 10);
                        if (!isNaN(val) && val >= 100 && val <= 3000 && currentPlacedModule) {
                          const updates: any = { freeHeight: val };
                          // 키큰장(full): 가구 높이 줄이면 상단몰딩이 늘어나야 함
                          if (moduleData.category === 'full') {
                            const iSpace = calculateInternalSpace(spaceInfo);
                            const originalH = iSpace.height; // 원래 내경 높이
                            const globalTopFrame = spaceInfo.frameSize?.top || 30;
                            const heightDiff = originalH - val; // 줄어든 만큼
                            if (heightDiff > 0) {
                              updates.topFrameThickness = globalTopFrame + heightDiff;
                            } else {
                              // 원래보다 크거나 같으면 상단몰딩 기본값
                              updates.topFrameThickness = Math.max(0, globalTopFrame + heightDiff);
                            }
                          }
                          updatePlacedModule(currentPlacedModule.id, updates);
                          setFreeHeightInput(val.toString());
                          setSectionHeightInputs({}); // 섹션 높이 캐시 초기화 → 재계산
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
                            const arrowUpdates: any = { freeHeight: next };
                            if (moduleData.category === 'full') {
                              const iSpace = calculateInternalSpace(spaceInfo);
                              const globalTopFrame = spaceInfo.frameSize?.top || 30;
                              arrowUpdates.topFrameThickness = Math.max(0, globalTopFrame + (iSpace.height - next));
                            }
                            updatePlacedModule(currentPlacedModule.id, arrowUpdates);
                            setSectionHeightInputs({}); // 섹션 높이 캐시 초기화
                          }
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="높이"
                      style={{ fontSize: '12px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                {/* 깊이 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>D</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freeDepthInput}
                      onChange={(e) => setFreeDepthInput(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(freeDepthInput, 10);
                        const isLowerDrawer = currentPlacedModule?.moduleId?.includes('lower-drawer-');
                        const minDepth = isLowerDrawer ? 400 : 100;
                        if (!isNaN(val) && val >= minDepth && val <= 800 && currentPlacedModule) {
                          // 몸통 깊이 변경 시 섹션별 깊이도 함께 업데이트 (이미 사용자가 섹션별 깊이를
                          // 별도로 설정한 경우는 보존하지 않고 일괄 따라감 → 섹션 치수가 몸통 치수 따라가도록)
                          updatePlacedModule(currentPlacedModule.id, {
                            freeDepth: val,
                            customDepth: val,
                            lowerSectionDepth: val,
                            upperSectionDepth: val,
                          });
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
                          const isLowerDrawerArrow = currentPlacedModule?.moduleId?.includes('lower-drawer-');
                          const minDepthArrow = isLowerDrawerArrow ? 400 : 100;
                          const next = Math.max(minDepthArrow, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                          setFreeDepthInput(next.toString());
                          if (currentPlacedModule) {
                            updatePlacedModule(currentPlacedModule.id, {
                              freeDepth: next,
                              customDepth: next,
                              lowerSectionDepth: next,
                              upperSectionDepth: next,
                            });
                          }
                        }
                      }}
                      className={`${styles.depthInput} furniture-depth-input`}
                      placeholder="깊이"
                      style={{ fontSize: '12px' }}
                    />
                    <span className={styles.unit}>mm</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 도어 치수 (읽기 전용) — 몸통치수 바로 아래, 편집 탭 전용 */}
          {!showDetails && currentPlacedModule && currentPlacedModule.hasDoor && (() => {
            const bodyWidth = (() => {
              const v = parseInt(freeWidthInput, 10);
              if (!isNaN(v) && v > 0) return v;
              return currentPlacedModule.freeWidth || currentPlacedModule.customWidth || moduleData.dimensions.width;
            })();
            // 실제 3D 렌더링과 동일한 공식 (DoorModule.tsx 의 doorGap=3)
            // 슬롯(도어 1장이 차지하는 너비) - 3mm = 좌우 1.5mm씩 안쪽 갭
            const isDualSlot = currentPlacedModule.isDualSlot || currentPlacedModule.moduleId?.startsWith('dual-');
            // 듀얼: 도어 2장 → 슬롯 1개 너비 = 몸통/2 → 도어 1장 너비 = (몸통/2) - 3
            // 싱글: 도어 1장 → 도어 너비 = 몸통 - 3
            const doorW = isDualSlot
              ? Math.max(0, Math.round(bodyWidth / 2) - 3)
              : Math.max(0, bodyWidth - 3);
            // 도어 높이: 공간 높이 - 도어 상갭 - 도어 하갭 (전체 가구 높이 기준)
            const spaceH = spaceInfo.height || 0;
            const doorH = Math.max(0, spaceH - (doorTopGap || 0) - (doorBottomGap || 0));
            const doorThickness = 20;
            return (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>
                  도어치수
                  {isDualSlot && <span style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', fontWeight: 'normal', marginLeft: '6px' }}>(도어 1장 / 총 2장)</span>}
                </h5>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>W</label>
                    <div className={styles.inputWithUnit}>
                      <input type="text" value={doorW} readOnly className={styles.depthInput} style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }} />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                  <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>H</label>
                    <div className={styles.inputWithUnit}>
                      <input type="text" value={doorH} readOnly className={styles.depthInput} style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }} />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                  <span style={{ color: 'var(--theme-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>×</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '10px', color: 'var(--theme-text-tertiary)', display: 'block', lineHeight: 1 }}>t</label>
                    <div className={styles.inputWithUnit}>
                      <input type="text" value={doorThickness} readOnly className={styles.depthInput} style={{ fontSize: '12px', cursor: 'default', color: 'var(--theme-text-secondary)' }} />
                      <span className={styles.unit}>mm</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 경첩 방향 선택 (도어치수 바로 아래로 이동) — 도어 + 싱글 가구 + 상세보기 아닐 때 */}
          {!showDetails && hasDoor && isSingleFurniture && (
            <div className={styles.propertySection}>
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
            </div>
          )}

          {/* 섹션별 치수 설정 (2섹션 이상 가구: customConfig 또는 modelConfig) — 편집 탭 전용 */}
          {!showDetails && currentPlacedModule && (() => {
            const cc = currentPlacedModule.customConfig;
            const ccSections = cc?.sections;
            // 사용자가 customSections로 직접 갱신한 경우 우선 (팬트리장 하부 섹션 변경 등)
            const userCustomSections = (currentPlacedModule as any).customSections;
            const mcSections = (Array.isArray(userCustomSections) && userCustomSections.length >= 2)
              ? userCustomSections
              : moduleData?.modelConfig?.sections;
            const hasSections = (ccSections && ccSections.length >= 2) || (mcSections && mcSections.length >= 2);
            if (!hasSections) return null;

            // 섹션 소스 결정: customConfig 우선, 없으면 modelConfig
            const isCustom = !!(ccSections && ccSections.length >= 2);
            const sectionCount = isCustom ? ccSections!.length : mcSections!.length;
            const pt = isCustom ? (cc!.panelThickness || 18) : (moduleData?.modelConfig?.basicThickness || 18);
            const totalH = currentPlacedModule.freeHeight || moduleData?.dimensions?.height || 2200;
            const totalW = currentPlacedModule.freeWidth
              ?? currentPlacedModule.adjustedWidth
              ?? currentPlacedModule.customWidth
              ?? moduleData?.dimensions?.width
              ?? 600;
            const totalD = currentPlacedModule.customDepth || currentPlacedModule.freeDepth || moduleData?.dimensions?.depth || 580;

            // 표준 가구의 섹션 높이: 마지막(상부) 섹션은 실제 공간에서 하부섹션/프레임 빼서 계산
            const realTopFrame = currentPlacedModule.hasTopFrame === false
              ? 0
              : (currentPlacedModule.topFrameThickness ?? spaceInfo.frameSize?.top ?? 30);
            const realBottomFrame = currentPlacedModule.hasBase === false
              ? 0
              : (currentPlacedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0));
            const realFloorFinish = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
            const sectionBasisH = Math.max(0, spaceInfo.height - realTopFrame - realBottomFrame - realFloorFinish);

            const getStdSectionHeightMM = (sIdx: number): number => {
              if (!mcSections || mcSections.length < 2) return totalH;
              const sec = mcSections[sIdx];
              const ht = sec.heightType || 'percentage';
              const isLast = sIdx === mcSections.length - 1;
              if (isLast) {
                // 마지막(상부) 섹션 = sectionBasisH - 이전 섹션 합
                const fixedSum = mcSections.slice(0, -1).reduce((acc, s) => {
                  if (s.heightType === 'absolute') return acc + (s.height || 0);
                  const r = (s.height || s.heightRatio || 50) / 100;
                  return acc + Math.round(sectionBasisH * r);
                }, 0);
                return Math.max(0, sectionBasisH - fixedSum);
              }
              if (ht === 'absolute') return sec.height || 0;
              const ratio = (sec.height || sec.heightRatio || 50) / 100;
              return Math.round(sectionBasisH * ratio);
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
                // 깊이 표시값: 섹션별 저장값 우선, 없으면 customDepth(신발장 380 등), 최후 totalD
                // 옛 데이터의 stale 값(moduleDim과 일치) 무시
                const cDepth = currentPlacedModule.customDepth;
                const _isShoeCat3 =
                  currentPlacedModule.moduleId.includes('-entryway-') ||
                  currentPlacedModule.moduleId.includes('-shelf-') ||
                  currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
                  currentPlacedModule.moduleId.includes('-2drawer-shelf-');
                const _modDimD = moduleData.dimensions.depth;
                const _hasCustomD = typeof cDepth === 'number' && cDepth > 0;
                const _validSec = (v: number | undefined) =>
                  (_isShoeCat3 && _hasCustomD && v === _modDimD) ? undefined : v;
                const secStored = sIdx === 0
                  ? _validSec(currentPlacedModule.lowerSectionDepth)
                  : _validSec(currentPlacedModule.upperSectionDepth);
                const displayD = sectionDepthInputs[sIdx]
                  || (secStored !== undefined
                    ? Math.round(secStored).toString()
                    : (cDepth !== undefined
                      ? Math.round(cDepth).toString()
                      : Math.round(totalD).toString()));
                // 너비 표시값
                const displayW = sectionWidthInputs[sIdx]
                  || (() => { const v = Math.round(((sec as any).width || totalW) * 10) / 10; return v % 1 === 0 ? v.toString() : v.toFixed(1); })();

                return (
                  <div
                    key={sIdx}
                    onMouseEnter={() => currentPlacedModule && setHighlightedSection(`${currentPlacedModule.id}-${sIdx}`)}
                    onMouseLeave={() => setHighlightedSection(null)}
                    style={{
                      background: 'var(--theme-background)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: '5px',
                      padding: '6px 8px',
                      marginBottom: sIdx < sectionCount - 1 ? '6px' : 0,
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--theme-text)', marginBottom: '4px' }}>
                      {sectionLabel}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {/* 섹션 너비 — 기둥 침범이 있는 슬롯 모드에서는 섹션별 너비 편집 + 좌/우고정 방향 */}
                      {(() => {
                        const hasColumnIntrusion =
                          spaceInfo.layoutMode !== 'free-placement' &&
                          (currentPlacedModule.adjustedWidth !== undefined && currentPlacedModule.adjustedWidth !== null);
                        const isLowerSec = sIdx === 0;
                        const isUpperSec = sIdx === 1;
                        const sectionWidthVal = isLowerSec
                          ? lowerWidthInput
                          : isUpperSec
                            ? upperWidthInput
                            : displayW;
                        const setSectionWidthVal = isLowerSec
                          ? setLowerWidthInput
                          : setUpperWidthInput;
                        const widthDir = isLowerSec ? lowerWidthDirection : upperWidthDirection;
                        const setWidthDir = isLowerSec ? setLowerWidthDirection : setUpperWidthDirection;
                        const widthField = isLowerSec ? 'lowerSectionWidth' : 'upperSectionWidth';
                        const widthDirField = isLowerSec ? 'lowerSectionWidthDirection' : 'upperSectionWidthDirection';
                        const baseAdjW = currentPlacedModule.adjustedWidth || currentPlacedModule.customWidth || totalW;

                        const commitWidth = (raw: string) => {
                          const v = parseInt(raw, 10);
                          if (isNaN(v) || v < 100 || v > 2400) {
                            setSectionWidthVal(Math.round(baseAdjW).toString());
                            return;
                          }
                          updatePlacedModule(currentPlacedModule.id, { [widthField]: v } as any);
                        };

                        return (
                      <div style={{ flex: 1, minWidth: '70px' }}>
                        <label style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', display: 'block', lineHeight: 1 }}>너비</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text" inputMode="numeric"
                            value={hasColumnIntrusion ? sectionWidthVal : displayW}
                            disabled={spaceInfo.layoutMode !== 'free-placement' && !hasColumnIntrusion}
                            onChange={(e) => {
                              if (hasColumnIntrusion) setSectionWidthVal(e.target.value);
                              else setSectionWidthInputs(prev => ({ ...prev, [sIdx]: e.target.value }));
                            }}
                            onBlur={() => {
                              if (hasColumnIntrusion) {
                                commitWidth(sectionWidthVal);
                                return;
                              }
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
                                if (hasColumnIntrusion) {
                                  const cur = parseInt(sectionWidthVal, 10) || Math.round(baseAdjW);
                                  const next = Math.max(100, Math.min(2400, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                  setSectionWidthVal(next.toString());
                                  updatePlacedModule(currentPlacedModule.id, { [widthField]: next } as any);
                                  return;
                                }
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
                            style={{
                              color: (spaceInfo.layoutMode !== 'free-placement' && !hasColumnIntrusion) ? '#999' : '#000',
                              backgroundColor: (spaceInfo.layoutMode !== 'free-placement' && !hasColumnIntrusion) ? '#f0f0f0' : '#fff',
                              WebkitTextFillColor: (spaceInfo.layoutMode !== 'free-placement' && !hasColumnIntrusion) ? '#999' : '#000',
                              opacity: 1,
                            }}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                        {/* 좌고정/우고정 (기둥 침범 시에만 표시) */}
                        {hasColumnIntrusion && sectionCount === 2 && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            <button
                              style={{
                                flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                                background: widthDir === 'left' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                                color: widthDir === 'left' ? '#fff' : 'var(--theme-text-secondary)',
                                fontSize: '10px', cursor: 'pointer',
                              }}
                              onClick={() => {
                                setWidthDir('left');
                                updatePlacedModule(currentPlacedModule.id, { [widthDirField]: 'left' } as any);
                              }}
                            >좌고정</button>
                            <button
                              style={{
                                flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                                background: widthDir === 'right' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                                color: widthDir === 'right' ? '#fff' : 'var(--theme-text-secondary)',
                                fontSize: '10px', cursor: 'pointer',
                              }}
                              onClick={() => {
                                setWidthDir('right');
                                updatePlacedModule(currentPlacedModule.id, { [widthDirField]: 'right' } as any);
                              }}
                            >우고정</button>
                          </div>
                        )}
                      </div>
                        );
                      })()}
                      {/* 섹션 높이 — 표준 가구: 마지막(상부) 섹션만 편집 가능 (전체 높이 역계산), 커스텀: 모두 편집 가능
                          단, 팬트리장/인출장은 모든 섹션 편집 가능 (하부 변경 시 상부 자동 동기화) */}
                      {(() => {
                        // 표준 가구에서 마지막 섹션(상부=가변)만 편집 가능
                        const isLastSection = sIdx === sectionCount - 1;
                        const isStdEditable = !isCustom && isLastSection && sectionCount >= 2;
                        const isPantryOrPullOut = isPullOutOrPantry;
                        const canEdit = isCustom || isStdEditable || (isPantryOrPullOut && sectionCount >= 2);
                        return (
                      <div style={{ flex: 1, minWidth: '70px' }}>
                        <label style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', display: 'block', lineHeight: 1 }}>높이</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text" inputMode="numeric"
                            value={displayH}
                            onChange={(e) => setSectionHeightInputs(prev => ({ ...prev, [sIdx]: e.target.value }))}
                            onBlur={() => {
                              if (isCustom) {
                                handleSectionHeightBlur(sIdx);
                              } else if (isStdEditable && mcSections) {
                                // 표준 가구 마지막(상부) 섹션 높이 변경 → 전체 높이 역계산
                                const inputVal = parseInt(sectionHeightInputs[sIdx] || '0', 10);
                                if (isNaN(inputVal) || inputVal < 100) {
                                  setSectionHeightInputs({});
                                  return;
                                }
                                // 하부 고정 섹션 합 + 패널 두께 → 전체 높이 역계산
                                const prevFixed = mcSections
                                  .filter((_: any, idx: number) => idx < sIdx)
                                  .reduce((sum: number, s: any) => sum + ((s.heightType === 'absolute' ? s.height : 0) || 0), 0);
                                // 역계산: 상부 = sec.height + (totalH - dimH)
                                // → totalH = inputVal - sec.height + dimH  (단, sec.height는 원래 모듈의 상부 높이)
                                // 더 단순하게: newTotalH = prevFixed + inputVal (하부+상부 = 전체)
                                const newTotalH = prevFixed + inputVal;
                                const clampedH = Math.max(300, Math.min(3000, newTotalH));
                                const secUpdates: any = { freeHeight: clampedH };
                                // 키큰장: 상단몰딩도 연동
                                if (moduleData.category === 'full') {
                                  const iSpace = calculateInternalSpace(spaceInfo);
                                  const globalTopFrame = spaceInfo.frameSize?.top || 30;
                                  secUpdates.topFrameThickness = Math.max(0, globalTopFrame + (iSpace.height - clampedH));
                                }
                                updatePlacedModule(currentPlacedModule.id, secUpdates);
                                setFreeHeightInput(clampedH.toString());
                                setSectionHeightInputs({});
                              } else if (isPantryOrPullOut && mcSections) {
                                // 팬트리장/인출장: 하부(또는 중간) 섹션 변경
                                // 1) 변경된 섹션의 height 갱신
                                // 2) 상부(마지막) 섹션 height = freeHeight - (다른 섹션 합) 으로 재계산
                                // 3) 상부 섹션의 shelfPositions 균등 재배치
                                const inputVal = parseInt(sectionHeightInputs[sIdx] || '0', 10);
                                if (isNaN(inputVal) || inputVal < 100) {
                                  setSectionHeightInputs({});
                                  return;
                                }
                                const totalH = currentPlacedModule.freeHeight ?? currentPlacedModule.customHeight ?? moduleData.dimensions.height;
                                const lastIdx = mcSections.length - 1;
                                // 변경된 섹션 height 적용한 임시 배열
                                const tentative = mcSections.map((s: any, idx: number) => {
                                  if (idx === sIdx) return { ...s, height: inputVal };
                                  return s;
                                });
                                // 마지막 섹션을 제외한 합
                                const otherSum = tentative
                                  .filter((_: any, idx: number) => idx !== lastIdx)
                                  .reduce((sum: number, s: any) => sum + (s.height || 0), 0);
                                const newLastH = Math.max(100, totalH - otherSum);
                                const basicThickness = (spaceInfo as any).panelThickness || 18;
                                const newSections = tentative.map((s: any, idx: number) => {
                                  if (idx !== lastIdx) return s;
                                  // 마지막(상부) 섹션 갱신
                                  const updated: any = { ...s, height: newLastH };
                                  // shelf 타입이고 count가 있으면 선반 균등 재배치
                                  if ((s.type === 'shelf' || s.type === 'open') && (s.count > 0 || (Array.isArray(s.shelfPositions) && s.shelfPositions.length > 0))) {
                                    const shelfCount = s.count || (s.shelfPositions?.length ?? 0);
                                    const innerH = Math.max(0, newLastH - 2 * basicThickness);
                                    updated.shelfPositions = calculateEvenShelfPositions(innerH, shelfCount, basicThickness);
                                  }
                                  return updated;
                                });
                                updatePlacedModule(currentPlacedModule.id, { customSections: newSections } as any);
                                setSectionHeightInputs({});
                              } else {
                                setSectionHeightInputs(prev => ({ ...prev, [sIdx]: displayH }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                              else if (canEdit && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                e.preventDefault();
                                const cur = parseInt(displayH, 10) || 0;
                                const next = Math.max(100, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                setSectionHeightInputs(prev => ({ ...prev, [sIdx]: next.toString() }));
                              }
                            }}
                            className={styles.depthInput}
                            readOnly={!canEdit}
                            style={{
                              color: '#000', backgroundColor: canEdit ? '#fff' : '#f5f5f5',
                              WebkitTextFillColor: '#000', opacity: canEdit ? 1 : 0.7,
                              cursor: canEdit ? 'text' : 'default',
                            }}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                        );
                      })()}
                      {/* 섹션 깊이 (2섹션 가구 + 인출장/팬트리장 N섹션 한정) */}
                      {(sectionCount === 2 || isPullOutOrPantry) && (() => {
                        // 인출장/팬트리장: sectionDepths 배열 사용 (각 섹션 독립)
                        const sectionDepths = (currentPlacedModule as any)?.sectionDepths as number[] | undefined;
                        const sectionDirs = (currentPlacedModule as any)?.sectionDepthDirections as ('front'|'back')[] | undefined;
                        const moduleDefaultDepth = moduleData?.dimensions.depth || 600;
                        const sectionDepthVal = isPullOutOrPantry
                          ? (sectionDepths?.[sIdx] ?? currentPlacedModule?.customDepth ?? moduleDefaultDepth).toString()
                          : '';
                        const sectionDirVal = isPullOutOrPantry
                          ? (sectionDirs?.[sIdx] ?? 'front')
                          : 'front';
                        // 2섹션 가구: 기존 매핑 사용
                        // N섹션 가구: 마지막 섹션을 "상부"로 매핑, 그 외 모든 섹션은 "하부" 사용
                        const isLowerSec = sIdx < sectionCount - 1;
                        const onSectionDepthChange = (val: string) => {
                          if (isPullOutOrPantry && currentPlacedModule) {
                            const numV = parseInt(val);
                            if (!isNaN(numV) && numV > 0) {
                              const arr = [...(sectionDepths ?? new Array(sectionCount).fill(moduleDefaultDepth))];
                              arr[sIdx] = numV;
                              // 마지막 섹션 변경 시 upperSectionDepth도 동기화 (Room/CleanCAD2D 등 다른 가구 인터페이스와 호환)
                              const updates: any = { sectionDepths: arr };
                              if (sIdx === sectionCount - 1) {
                                updates.upperSectionDepth = numV;
                              } else if (sIdx === 0) {
                                updates.lowerSectionDepth = numV;
                              }
                              updatePlacedModule(currentPlacedModule.id, updates);
                            }
                          } else {
                            (isLowerSec ? handleLowerDepthChange : handleUpperDepthChange)(val);
                          }
                        };
                        const depthVal = isPullOutOrPantry ? sectionDepthVal : (isLowerSec ? lowerDepthInput : upperDepthInput);
                        const onDepthChange = onSectionDepthChange;
                        const dir = isPullOutOrPantry ? sectionDirVal : (isLowerSec ? lowerDepthDirection : upperDepthDirection);
                        const setDir = isPullOutOrPantry
                          ? (newDir: 'front' | 'back') => {
                              if (currentPlacedModule) {
                                const arr = [...(sectionDirs ?? new Array(sectionCount).fill('front'))];
                                arr[sIdx] = newDir;
                                updatePlacedModule(currentPlacedModule.id, { sectionDepthDirections: arr } as any);
                              }
                            }
                          : (isLowerSec ? setLowerDepthDirection : setUpperDepthDirection);
                        const dirField = isLowerSec ? 'lowerSectionDepthDirection' : 'upperSectionDepthDirection';
                        return (
                        <div style={{ flex: 1, minWidth: '70px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', display: 'block', lineHeight: 1 }}>깊이</label>
                          <div className={styles.inputWithUnit}>
                            <input
                              type="text" inputMode="numeric"
                              value={depthVal}
                              onChange={(e) => onDepthChange(e.target.value)}
                              onFocus={() => currentPlacedModule && setHighlightedSection(`${currentPlacedModule.id}-${sIdx}`)}
                              onBlur={() => setHighlightedSection(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const cur = parseInt(depthVal, 10) || 0;
                                  const next = Math.max(100, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                  onDepthChange(next.toString());
                                }
                              }}
                              className={styles.depthInput}
                              style={{ color: '#000', backgroundColor: '#fff', WebkitTextFillColor: '#000', opacity: 1 }}
                            />
                            <span className={styles.unit}>mm</span>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            <button
                              style={{
                                flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                                background: dir === 'front' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                                color: dir === 'front' ? '#fff' : 'var(--theme-text-secondary)',
                                fontSize: '10px', cursor: 'pointer',
                              }}
                              onClick={() => {
                                setDir('front');
                                if (currentPlacedModule) updatePlacedModule(currentPlacedModule.id, { [dirField]: 'front' } as any);
                              }}
                            >뒤고정</button>
                            <button
                              style={{
                                flex: 1, padding: '3px 6px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                                background: dir === 'back' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                                color: dir === 'back' ? '#fff' : 'var(--theme-text-secondary)',
                                fontSize: '10px', cursor: 'pointer',
                              }}
                              onClick={() => {
                                setDir('back');
                                if (currentPlacedModule) updatePlacedModule(currentPlacedModule.id, { [dirField]: 'back' } as any);
                              }}
                            >앞고정</button>
                          </div>
                        </div>
                        );
                      })()}
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

          {/* 상,걸래받이 — 우측바와 동일 형태 (해당 가구 단일) — 편집 탭 전용 */}
          {!showDetails && currentPlacedModule && !currentPlacedModule.isSurroundPanel && (() => {
            const mod = currentPlacedModule;
            const globalTop = spaceInfo.frameSize?.top ?? 30;
            const globalBase = spaceInfo.baseConfig?.height ?? 65;
            const isStandType = spaceInfo.baseConfig?.type === 'stand';
            const isLowerMod = mod.moduleId?.startsWith('lower-') || mod.moduleId?.includes('-lower-');
            const bfMin = isLowerMod ? 60 : 40;
            const bfMax = isLowerMod ? 150 : 100;
            const bfDefault = isLowerMod ? 100 : 60;

            const topEnabled = mod.hasTopFrame !== false;
            const baseEnabled = mod.hasBase !== false;
            const topSize = mod.topFrameThickness ?? globalTop;
            // 서라운드(전체/양쪽 포함) + 상부장일 때 기본 옵셋 23mm
            const isUpperCat = mod.moduleId?.includes('upper-cabinet') || mod.moduleId?.startsWith('upper-');
            const isSurroundForOffset = spaceInfo.surroundType === 'surround';
            const topOffsetDefault = (isUpperCat && isSurroundForOffset) ? 23 : 0;
            const topOffset = mod.topFrameOffset ?? topOffsetDefault;
            const topGap = mod.topFrameGap ?? 0;
            const baseSize = mod.baseFrameHeight ?? bfDefault;
            const baseOffset = mod.baseFrameOffset ?? 0;
            const baseGap = mod.baseFrameGap ?? 0;

            const toggleStyle = (on: boolean): React.CSSProperties => ({
              width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              backgroundColor: on ? 'var(--theme-primary, #4a90d9)' : '#ccc',
              position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
            });
            const knobStyle = (on: boolean): React.CSSProperties => ({
              position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%',
              backgroundColor: '#fff', transition: 'left 0.2s', left: on ? '18px' : '2px',
            });
            const cellStyle: React.CSSProperties = {
              flex: 1, display: 'flex', alignItems: 'center', gap: '2px',
              border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px',
            };
            const cellLabelStyle: React.CSSProperties = { fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 };
            const inputStyle: React.CSSProperties = {
              width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center',
              background: 'transparent', color: 'var(--theme-text-primary)',
            };
            const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' };
            const labelStyle: React.CSSProperties = { minWidth: '50px', fontSize: '11px', color: 'var(--theme-text-secondary)', fontWeight: 500 };
            const getUpperShelfGapSyncUpdates = (nextFrameState: Partial<typeof mod>) => {
              const nextMod = { ...mod, ...nextFrameState } as typeof mod;
              const basicThicknessMm = (spaceInfo as any).panelThickness || 18;
              const sections = (mod as any).customSections
                ?? (mod as any).customConfig?.sections
                ?? moduleData?.modelConfig?.sections;
              const hasExplicitCustomSections = Array.isArray((mod as any).customSections);
              const sectionList = Array.isArray(sections) ? sections : [];
              const upperHangingIndex = (() => {
                for (let i = sectionList.length - 1; i >= 0; i--) {
                  const section = sectionList[i] as any;
                  if (
                    section.type === 'hanging' &&
                    Array.isArray(section.shelfPositions) &&
                    section.shelfPositions.some((pos: number) => pos > 0)
                  ) {
                    return i;
                  }
                }
                for (let i = sectionList.length - 1; i >= 0; i--) {
                  if ((sectionList[i] as any).type === 'hanging') return i;
                }
                return -1;
              })();
              if (upperHangingIndex < 0) return {};

              const getEffectiveTotalHeight = (targetMod: typeof mod) => {
                const baseTotalHeight = targetMod.freeHeight
                  || targetMod.customHeight
                  || moduleData?.dimensions?.height
                  || 0;
                const globalTopFrame = spaceInfo.frameSize?.top ?? 30;
                const topFrameMm = targetMod.topFrameThickness ?? globalTopFrame;
                const topFrameDelta = targetMod.topFrameThickness !== undefined
                  ? topFrameMm - globalTopFrame
                  : 0;
                const absorbedTopHeight = targetMod.hasTopFrame === false
                  ? topFrameMm - (targetMod.topFrameGap ?? 0)
                  : 0;
                const absorbedBaseHeight = targetMod.hasBase === false
                  ? ((targetMod.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0))
                    - (targetMod.individualFloatHeight ?? 0))
                  : 0;
                const isStandTypeForHeight = spaceInfo.baseConfig?.type === 'stand';
                const baseFrameDelta = targetMod.baseFrameHeight !== undefined && !isStandTypeForHeight
                  ? targetMod.baseFrameHeight - (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0)
                  : 0;
                return Math.max(0, baseTotalHeight - topFrameDelta - baseFrameDelta + absorbedTopHeight + absorbedBaseHeight);
              };
              const getSectionHeight = (sectionIndex: number, targetMod: typeof mod) => {
                const section = sectionList[sectionIndex] as any;
                if (!section) return 0;
                if (sectionList.length >= 2 && sectionIndex === sectionList.length - 1) {
                  const previousSectionsHeight = sectionList
                    .slice(0, sectionIndex)
                    .reduce((sum: number, prevSection: any) => sum + (prevSection.height || 0), 0);
                  return Math.max(0, getEffectiveTotalHeight(targetMod) - previousSectionsHeight);
                }
                return section.height || 0;
              };

              const upperSection = sectionList[upperHangingIndex] as any;
              const shelfPositions = Array.isArray(upperSection.shelfPositions)
                ? upperSection.shelfPositions
                : [];
              const safetyIndex = shelfPositions.findIndex((pos: number) => pos > 0);
              if (safetyIndex < 0) return {};
              const getRenderedShelfPosition = (section: any, sectionHeight: number) => {
                const rawPos = shelfPositions[safetyIndex];
                if (hasExplicitCustomSections || upperHangingIndex !== sectionList.length - 1) {
                  return rawPos;
                }
                const originalInnerH = Math.max(0, (section.height || 0) - 2 * basicThicknessMm);
                const renderedInnerH = Math.max(0, sectionHeight - 2 * basicThicknessMm);
                const originalGap = Math.max(0, Math.round(
                  originalInnerH -
                  rawPos -
                  basicThicknessMm / 2
                ));
                return Math.max(0, Math.round(renderedInnerH - originalGap - basicThicknessMm / 2));
              };
              const currentSectionHeight = getSectionHeight(upperHangingIndex, mod);
              const currentShelfPos = getRenderedShelfPosition(upperSection, currentSectionHeight);
              const currentGap = Math.max(0, Math.round(
                Math.max(0, currentSectionHeight - 2 * basicThicknessMm) -
                currentShelfPos -
                basicThicknessMm / 2
              ));
              const nextInnerH = Math.max(0, getSectionHeight(upperHangingIndex, nextMod) - 2 * basicThicknessMm);
              const nextShelfPos = Math.max(0, Math.round(nextInnerH - currentGap - basicThicknessMm / 2));
              const nextSections = sectionList.map((section: any, index: number) => {
                if (index !== upperHangingIndex) return section;
                const nextShelfPositions = Array.isArray(section.shelfPositions)
                  ? [...section.shelfPositions]
                  : [];
                nextShelfPositions[safetyIndex] = nextShelfPos;
                return { ...section, shelfPositions: nextShelfPositions };
              });
              return {
                upperShelfTopGap: currentGap,
                customSections: nextSections,
              };
            };

            return (
              <>
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>상단몰딩</h5>

                {/* 상단 몰딩 */}
                <div style={rowStyle}>
                  <span style={labelStyle}>전체</span>
                  <button
                    onClick={() => {
                      const nextHasTopFrame = !topEnabled;
                      updatePlacedModule(mod.id, {
                        hasTopFrame: nextHasTopFrame,
                        ...getUpperShelfGapSyncUpdates({ hasTopFrame: nextHasTopFrame }),
                      });
                    }}
                    style={toggleStyle(topEnabled)}
                  >
                    <span style={knobStyle(topEnabled)} />
                  </button>
                  {(
                    <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                      <div style={cellStyle}>
                        <span style={cellLabelStyle}>높이</span>
                        <input type="text" inputMode="numeric"
                          value={topSize || ''} placeholder="0"
                          onFocus={() => setHighlightedFrame(`top-${mod.id}` as any)}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const next = Math.max(0, Math.min(9999, (topSize || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                              updatePlacedModule(mod.id, {
                                topFrameThickness: next,
                                ...getUpperShelfGapSyncUpdates({ topFrameThickness: next }),
                              });
                            } else if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^\d+$/.test(v)) {
                              const num = v === '' ? 0 : parseInt(v, 10);
                              const next = Math.max(0, Math.min(9999, num));
                              updatePlacedModule(mod.id, {
                                topFrameThickness: next,
                                ...getUpperShelfGapSyncUpdates({ topFrameThickness: next }),
                              });
                            }
                          }}
                          onBlur={(e) => {
                            setHighlightedFrame(null);
                            const clamped = Math.max(0, Math.min(9999, parseInt(e.target.value) || 0));
                            updatePlacedModule(mod.id, {
                              topFrameThickness: clamped,
                              ...getUpperShelfGapSyncUpdates({ topFrameThickness: clamped }),
                            });
                          }}
                          style={inputStyle}
                        />
                      </div>
                      <div style={cellStyle}>
                        <span style={cellLabelStyle}>옵셋</span>
                        <input type="text" inputMode="numeric"
                          value={topOffset !== 0 ? topOffset : ''} placeholder="0"
                          onFocus={() => setHighlightedFrame(`top-${mod.id}` as any)}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const next = Math.max(-200, Math.min(200, (topOffset || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                              updatePlacedModule(mod.id, { topFrameOffset: next });
                            } else if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                              updatePlacedModule(mod.id, { topFrameOffset: v === '' || v === '-' ? 0 : parseInt(v, 10) });
                            }
                          }}
                          onBlur={(e) => {
                            setHighlightedFrame(null);
                            const clamped = Math.max(-200, Math.min(200, parseInt(e.target.value) || 0));
                            updatePlacedModule(mod.id, { topFrameOffset: clamped });
                          }}
                          style={inputStyle}
                        />
                      </div>
                      <div style={cellStyle}>
                        <span style={cellLabelStyle}>갭</span>
                        <input type="text" inputMode="numeric"
                          value={topGap !== 0 ? topGap : ''} placeholder="0"
                          onFocus={() => setHighlightedFrame(`top-${mod.id}` as any)}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const next = Math.max(0, Math.min(2000, (topGap || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                              updatePlacedModule(mod.id, {
                                topFrameGap: next,
                                ...getUpperShelfGapSyncUpdates({ topFrameGap: next }),
                              });
                            } else if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^\d+$/.test(v)) {
                              const num = v === '' ? 0 : parseInt(v, 10);
                              const next = Math.max(0, Math.min(2000, num));
                              updatePlacedModule(mod.id, {
                                topFrameGap: next,
                                ...getUpperShelfGapSyncUpdates({ topFrameGap: next }),
                              });
                            }
                          }}
                          onBlur={(e) => {
                            setHighlightedFrame(null);
                            const clamped = Math.max(0, Math.min(2000, parseInt(e.target.value) || 0));
                            updatePlacedModule(mod.id, {
                              topFrameGap: clamped,
                              ...getUpperShelfGapSyncUpdates({ topFrameGap: clamped }),
                            });
                          }}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* 걸레받이 — stand 타입/상부장이면 숨김. 별도 섹션으로 분리 */}
              {!isStandType && !isUpperCat && (
                <div className={styles.propertySection}>
                  <h5 className={styles.sectionTitle}>걸레받이</h5>
                  <div style={rowStyle}>
                    <span style={labelStyle}>전체</span>
                    <button
                      onClick={() => {
                        const nextHasBase = !baseEnabled;
                        const nextFrameState = {
                          hasBase: nextHasBase,
                          ...(baseEnabled ? { individualFloatHeight: 0 } : {}),
                        };
                        updatePlacedModule(mod.id, {
                          ...nextFrameState,
                          ...(baseEnabled
                            ? {}
                            : { doorBottomGap: 25 }),
                          ...getUpperShelfGapSyncUpdates(nextFrameState),
                        });
                      }}
                      style={toggleStyle(baseEnabled)}
                    >
                      <span style={knobStyle(baseEnabled)} />
                    </button>
                    {baseEnabled ? (
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        <div style={cellStyle}>
                          <span style={cellLabelStyle}>높이</span>
                          <input type="text" inputMode="numeric"
                            value={baseSize || ''} placeholder="0"
                            onFocus={() => setHighlightedFrame(`base-${mod.id}` as any)}
                            onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const cur = mod.baseFrameHeight ?? bfDefault;
                                const next = Math.max(bfMin, Math.min(bfMax, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(mod.id, {
                                  baseFrameHeight: next,
                                  ...getUpperShelfGapSyncUpdates({ baseFrameHeight: next }),
                                });
                              } else if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
                                const num = v === '' ? 0 : parseInt(v, 10);
                                const next = num > bfMax ? bfMax : num;
                                updatePlacedModule(mod.id, {
                                  baseFrameHeight: next,
                                  ...getUpperShelfGapSyncUpdates({ baseFrameHeight: next }),
                                });
                              }
                            }}
                            onBlur={(e) => {
                              setHighlightedFrame(null);
                              const next = Math.max(bfMin, Math.min(bfMax, parseInt(e.target.value) || bfDefault));
                              updatePlacedModule(mod.id, {
                                baseFrameHeight: next,
                                ...getUpperShelfGapSyncUpdates({ baseFrameHeight: next }),
                              });
                            }}
                            style={inputStyle}
                          />
                        </div>
                        <div style={cellStyle}>
                          <span style={cellLabelStyle}>옵셋</span>
                          <input type="text" inputMode="numeric"
                            value={baseOffset !== 0 ? baseOffset : ''} placeholder="0"
                            onFocus={() => setHighlightedFrame(`base-${mod.id}` as any)}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = mod.baseFrameOffset ?? 0;
                                updatePlacedModule(mod.id, { baseFrameOffset: Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1))) });
                              } else if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                updatePlacedModule(mod.id, { baseFrameOffset: v === '' || v === '-' ? 0 : parseInt(v, 10) });
                              }
                            }}
                            onBlur={(e) => {
                              setHighlightedFrame(null);
                              updatePlacedModule(mod.id, { baseFrameOffset: Math.max(-200, Math.min(200, parseInt(e.target.value) || 0)) });
                            }}
                            style={inputStyle}
                          />
                        </div>
                        <div style={cellStyle}>
                          <span style={cellLabelStyle}>갭</span>
                          <input type="text" inputMode="numeric"
                            value={baseGap !== 0 ? baseGap : ''} placeholder="0"
                            onFocus={() => setHighlightedFrame(`base-${mod.id}` as any)}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const maxGap = Math.max(0, baseSize - 1);
                                const next = Math.max(0, Math.min(maxGap, (baseGap || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(mod.id, { baseFrameGap: next });
                              } else if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
                                const num = v === '' ? 0 : parseInt(v, 10);
                                const maxGap = Math.max(0, baseSize - 1);
                                updatePlacedModule(mod.id, { baseFrameGap: Math.max(0, Math.min(maxGap, num)) });
                              }
                            }}
                            onBlur={(e) => {
                              setHighlightedFrame(null);
                              const maxGap = Math.max(0, baseSize - 1);
                              const clamped = Math.max(0, Math.min(maxGap, parseInt(e.target.value) || 0));
                              updatePlacedModule(mod.id, { baseFrameGap: clamped });
                            }}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                        <div style={cellStyle}>
                          <span style={cellLabelStyle}>띄움</span>
                          <input type="text" inputMode="numeric"
                            value={(mod.individualFloatHeight ?? 0) || ''} placeholder="0"
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = mod.individualFloatHeight ?? 0;
                                const nv = Math.max(0, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(mod.id, {
                                  individualFloatHeight: nv,
                                  doorBottomGap: nv,
                                  ...getUpperShelfGapSyncUpdates({ individualFloatHeight: nv }),
                                });
                              } else if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
                                const nv = v === '' ? 0 : parseInt(v, 10);
                                updatePlacedModule(mod.id, {
                                  individualFloatHeight: nv,
                                  doorBottomGap: nv,
                                  ...getUpperShelfGapSyncUpdates({ individualFloatHeight: nv }),
                                });
                              }
                            }}
                            onBlur={() => { /* blur 시 doorBottomGap 덮어쓰기 방지 */ }}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}
              </>
            );
          })()}

          {/* 하부장(1섹션) 깊이 + 뒤고정/앞고정 */}
          {currentPlacedModule && moduleData?.category === 'lower' && !isTwoSectionFurniture && (() => {
            const depthDir = currentPlacedModule.lowerSectionDepthDirection || 'front';
            const curDepth = currentPlacedModule.freeDepth || currentPlacedModule.customDepth || moduleData.dimensions.depth;
            return (
              <div className={styles.propertySection}>
                <div className={styles.inputWithUnit}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={freeDepthInput}
                    onChange={(e) => setFreeDepthInput(e.target.value)}
                    onBlur={() => {
                      const val = parseInt(freeDepthInput, 10);
                      const isLowerDrawer = currentPlacedModule?.moduleId?.includes('lower-drawer-');
                      const minDepth = isLowerDrawer ? 400 : 100;
                      if (!isNaN(val) && val >= minDepth && val <= 800 && currentPlacedModule) {
                        updatePlacedModule(currentPlacedModule.id, {
                          freeDepth: val,
                          customDepth: val,
                          lowerSectionDepth: val,
                          upperSectionDepth: val,
                        });
                        setFreeDepthInput(val.toString());
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const cur = parseInt(freeDepthInput, 10) || curDepth;
                        const isLowerDrawerArrow = currentPlacedModule?.moduleId?.includes('lower-drawer-');
                        const minDepthArrow = isLowerDrawerArrow ? 400 : 100;
                        const next = Math.max(minDepthArrow, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                        setFreeDepthInput(next.toString());
                        if (currentPlacedModule) {
                          updatePlacedModule(currentPlacedModule.id, {
                            freeDepth: next,
                            customDepth: next,
                            lowerSectionDepth: next,
                            upperSectionDepth: next,
                          });
                        }
                      }
                    }}
                    className={styles.depthInput}
                    style={{ fontSize: '14px' }}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                  <button
                    style={{
                      flex: 1, padding: '6px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                      background: depthDir === 'front' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                      color: depthDir === 'front' ? '#fff' : 'var(--theme-text-secondary)',
                      fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: depthDir === 'front' ? 600 : 400
                    }}
                    onClick={() => {
                      if (currentPlacedModule) {
                        updatePlacedModule(currentPlacedModule.id, { lowerSectionDepthDirection: 'front' });
                      }
                    }}
                  >
                    뒤고정
                  </button>
                  <button
                    style={{
                      flex: 1, padding: '6px 8px', border: '1px solid var(--theme-border)', borderRadius: '4px',
                      background: depthDir === 'back' ? 'var(--theme-primary)' : 'var(--theme-surface)',
                      color: depthDir === 'back' ? '#fff' : 'var(--theme-text-secondary)',
                      fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: depthDir === 'back' ? 600 : 400
                    }}
                    onClick={() => {
                      if (currentPlacedModule) {
                        updatePlacedModule(currentPlacedModule.id, { lowerSectionDepthDirection: 'back' });
                      }
                    }}
                  >
                    앞고정
                  </button>
                </div>
              </div>
            );
          })()}


          {/* 엔드패널(EP) 설정 — 편집 탭 전용 */}
          {!showDetails && currentPlacedModule && moduleData && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>엔드패널</h5>
              {/* 좌/우 EP 체크박스 */}
              <div className={styles.epCheckboxRow}>
                <label className={styles.epCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={currentPlacedModule.hasLeftEndPanel === true}
                    onChange={() => {
                      const turning = !currentPlacedModule.hasLeftEndPanel;
                      const isFullSurround = spaceInfo.surroundType === 'surround' && spaceInfo.frameConfig?.top !== false;
                      const isNotFull = moduleData.category === 'upper' || moduleData.category === 'lower';
                      const update: Record<string, unknown> = { hasLeftEndPanel: turning };
                      if (turning && isFullSurround) {
                        update.leftEndPanelOffset = 23;
                      }
                      // 하부장/상부장은 EP 높이를 가구에 맞춤으로 자동 설정
                      if (turning && isNotFull && !currentPlacedModule.endPanelHeightMode) {
                        update.endPanelHeightMode = 'furniture';
                      }
                      updatePlacedModule(currentPlacedModule.id, update);
                    }}
                  />
                  좌측 EP
                </label>
                <label className={styles.epCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={currentPlacedModule.hasRightEndPanel === true}
                    onChange={() => {
                      const turning = !currentPlacedModule.hasRightEndPanel;
                      const isFullSurround = spaceInfo.surroundType === 'surround' && spaceInfo.frameConfig?.top !== false;
                      const isNotFull = moduleData.category === 'upper' || moduleData.category === 'lower';
                      const update: Record<string, unknown> = { hasRightEndPanel: turning };
                      if (turning && isFullSurround) {
                        update.rightEndPanelOffset = 23;
                      }
                      // 하부장/상부장은 EP 높이를 가구에 맞춤으로 자동 설정
                      if (turning && isNotFull && !currentPlacedModule.endPanelHeightMode) {
                        update.endPanelHeightMode = 'furniture';
                      }
                      updatePlacedModule(currentPlacedModule.id, update);
                    }}
                  />
                  우측 EP
                </label>
                {/* 하부 EP — 상부장 전용 (가구 아래쪽 마감판) */}
                {moduleData.category === 'upper' && (
                  <label className={styles.epCheckboxLabel}>
                    <input
                      type="checkbox"
                      checked={currentPlacedModule.hasBottomEndPanel !== false}
                      onChange={() => {
                        const turning = !(currentPlacedModule.hasBottomEndPanel !== false);
                        updatePlacedModule(currentPlacedModule.id, { hasBottomEndPanel: turning } as any);
                      }}
                    />
                    하부 EP
                  </label>
                )}
              </div>
              {(currentPlacedModule.hasLeftEndPanel || currentPlacedModule.hasRightEndPanel || (moduleData.category === 'upper' && currentPlacedModule.hasBottomEndPanel !== false)) && (
                <>
                  {/* EP 높이 모드 — 키큰장(full)만 표시 (하부장/상부장은 카테고리별 자동 결정) */}
                  {/* 상단/하단 갭 — 좌/우 EP 전용 (하부 EP는 전면갭/후면갭 사용) */}
                  {(currentPlacedModule.hasLeftEndPanel || currentPlacedModule.hasRightEndPanel) && (
                    <div className={styles.epRow}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>
                          {moduleData.category === 'lower' ? '상단 갭 (가구↓)' : '상단 갭 (천장↓)'}
                        </label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={currentPlacedModule.endPanelTopOffset ?? 0}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
                                const num = v === '' ? 0 : Math.max(0, Math.min(500, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { endPanelTopOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.endPanelTopOffset ?? 0;
                                const next = Math.max(0, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { endPanelTopOffset: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>
                          {moduleData.category === 'upper' ? '하단 갭 (가구↑)' : '하단 갭 (바닥↑)'}
                        </label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={currentPlacedModule.endPanelBottomOffset ?? 0}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
                                const num = v === '' ? 0 : Math.max(0, Math.min(500, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { endPanelBottomOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.endPanelBottomOffset ?? 0;
                                const next = Math.max(0, Math.min(500, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { endPanelBottomOffset: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* EP 두께 / EP 깊이 — 한 줄에 나란히 */}
                  {(() => {
                    const furnitureDepth = currentPlacedModule.freeDepth ?? (moduleData ? moduleData.dimensions.depth : 580);
                    return (
                      <div className={styles.epRow}>
                        <div className={styles.epField}>
                          <label className={styles.epFieldLabel}>EP 두께</label>
                          <div className={styles.inputWithUnit}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={epThicknessInput}
                              onFocus={() => { epThicknessFocusedRef.current = true; }}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '' || /^\d+$/.test(v)) {
                                  setEpThicknessInput(v);
                                }
                              }}
                              onBlur={() => {
                                epThicknessFocusedRef.current = false;
                                const val = parseInt(epThicknessInput, 10);
                                if (!isNaN(val) && val >= 10) {
                                  setEpThicknessInput(val.toString());
                                  updatePlacedModule(currentPlacedModule.id, { endPanelThickness: val });
                                } else {
                                  const fallback = currentPlacedModule.endPanelThickness ?? 18;
                                  setEpThicknessInput(fallback.toString());
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const cur = parseInt(epThicknessInput, 10) || (currentPlacedModule.endPanelThickness ?? 18);
                                  const next = Math.max(10, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                  setEpThicknessInput(next.toString());
                                  updatePlacedModule(currentPlacedModule.id, { endPanelThickness: next });
                                }
                              }}
                              className={styles.epInput}
                            />
                            <span className={styles.unit}>mm</span>
                          </div>
                        </div>
                        {currentPlacedModule.hasLeftEndPanel && (
                          <div className={styles.epField}>
                            <label className={styles.epFieldLabel}>좌EP깊이</label>
                            <div className={styles.inputWithUnit}>
                              <input
                                type="text"
                                readOnly
                                value={Math.round(
                                  (currentPlacedModule.endPanelDepth ?? furnitureDepth)
                                  + (currentPlacedModule.leftEndPanelOffset ?? 0)
                                  + (currentPlacedModule.leftEndPanelBackOffset ?? 0)
                                )}
                                className={styles.epInput}
                                style={{ background: 'var(--theme-background-tertiary)', cursor: 'default' }}
                              />
                              <span className={styles.unit}>mm</span>
                            </div>
                          </div>
                        )}
                        {currentPlacedModule.hasRightEndPanel && (
                          <div className={styles.epField}>
                            <label className={styles.epFieldLabel}>우EP깊이</label>
                            <div className={styles.inputWithUnit}>
                              <input
                                type="text"
                                readOnly
                                value={Math.round(
                                  (currentPlacedModule.endPanelDepth ?? furnitureDepth)
                                  + (currentPlacedModule.rightEndPanelOffset ?? 0)
                                  + (currentPlacedModule.rightEndPanelBackOffset ?? 0)
                                )}
                                className={styles.epInput}
                                style={{ background: 'var(--theme-background-tertiary)', cursor: 'default' }}
                              />
                              <span className={styles.unit}>mm</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* 좌/우 EP 옵셋 — 한 줄에 나란히 */}
                  {/* 좌측 EP 앞/뒤 옵셋 */}
                  {currentPlacedModule.hasLeftEndPanel && (
                    <div className={styles.epRow}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>좌EP 앞</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epInputs.leftFront ?? String(currentPlacedModule.leftEndPanelOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, leftFront: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-200, Math.min(200, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { leftEndPanelOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.leftFront;
                              if (v === '' || v === '-' || v === undefined) {
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, leftFront: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.leftEndPanelOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelOffset: next });
                                setEpInputs(s => ({ ...s, leftFront: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>좌EP 뒤</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epInputs.leftBack ?? String(currentPlacedModule.leftEndPanelBackOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, leftBack: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-200, Math.min(200, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { leftEndPanelBackOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.leftBack;
                              if (v === '' || v === '-' || v === undefined) {
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelBackOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, leftBack: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.leftEndPanelBackOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { leftEndPanelBackOffset: next });
                                setEpInputs(s => ({ ...s, leftBack: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 우측 EP 앞/뒤 옵셋 */}
                  {currentPlacedModule.hasRightEndPanel && (
                    <div className={styles.epRow}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>우EP 앞</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epInputs.rightFront ?? String(currentPlacedModule.rightEndPanelOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, rightFront: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-200, Math.min(200, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { rightEndPanelOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.rightFront;
                              if (v === '' || v === '-' || v === undefined) {
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, rightFront: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.rightEndPanelOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelOffset: next });
                                setEpInputs(s => ({ ...s, rightFront: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>우EP 뒤</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={epInputs.rightBack ?? String(currentPlacedModule.rightEndPanelBackOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, rightBack: v }));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-200, Math.min(200, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { rightEndPanelBackOffset: num });
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = epInputs.rightBack;
                              if (v === '' || v === '-' || v === undefined) {
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelBackOffset: 0 });
                              }
                              setEpInputs(s => ({ ...s, rightBack: undefined }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.rightEndPanelBackOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { rightEndPanelBackOffset: next });
                                setEpInputs(s => ({ ...s, rightBack: undefined }));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 하부 EP(상부장 하부 마감판) 전면갭/후면갭 — 상부장 전용. 기본 전면 0 / 후면 35mm */}
                  {moduleData.category === 'upper' && currentPlacedModule.hasBottomEndPanel !== false && (
                    <div className={styles.epRow}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>전면갭</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={(epInputs as any).bottomFront ?? String((currentPlacedModule as any).bottomEndPanelOffset ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, bottomFront: v } as any));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-200, Math.min(200, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { bottomEndPanelOffset: num } as any);
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = (epInputs as any).bottomFront;
                              if (v === '' || v === '-' || v === undefined) {
                                updatePlacedModule(currentPlacedModule.id, { bottomEndPanelOffset: 0 } as any);
                              }
                              setEpInputs(s => ({ ...s, bottomFront: undefined } as any));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = (currentPlacedModule as any).bottomEndPanelOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { bottomEndPanelOffset: next } as any);
                                setEpInputs(s => ({ ...s, bottomFront: undefined } as any));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>후면갭</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={(epInputs as any).bottomBack ?? String((currentPlacedModule as any).bottomEndPanelBackOffset ?? 35)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                setEpInputs(s => ({ ...s, bottomBack: v } as any));
                                if (v !== '' && v !== '-') {
                                  const num = Math.max(-200, Math.min(200, parseInt(v, 10)));
                                  updatePlacedModule(currentPlacedModule.id, { bottomEndPanelBackOffset: num } as any);
                                }
                              }
                            }}
                            onBlur={() => {
                              const v = (epInputs as any).bottomBack;
                              if (v === '' || v === '-' || v === undefined) {
                                updatePlacedModule(currentPlacedModule.id, { bottomEndPanelBackOffset: 35 } as any);
                              }
                              setEpInputs(s => ({ ...s, bottomBack: undefined } as any));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = (currentPlacedModule as any).bottomEndPanelBackOffset ?? 35;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { bottomEndPanelBackOffset: next } as any);
                                setEpInputs(s => ({ ...s, bottomBack: undefined } as any));
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 좌우 이격거리 섹션 제거됨 */}

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

          {/* 하부장 몸통 높이 설정 (2단서랍장 반통/한통만) */}
          {!showDetails && currentPlacedModule && (
            currentPlacedModule.moduleId.includes('lower-drawer-2tier') ||
            currentPlacedModule.moduleId.includes('dual-lower-drawer-2tier')
          ) && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>몸통 높이</h5>
              <div className={styles.inputWithUnit}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cabinetBodyHeightInput}
                  onChange={(e) => setCabinetBodyHeightInput(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(cabinetBodyHeightInput, 10);
                    if (!isNaN(val) && val >= 760 && val <= 800 && currentPlacedModule) {
                      updatePlacedModule(currentPlacedModule.id, { cabinetBodyHeight: val });
                      setCabinetBodyHeightInput(val.toString());
                      setFreeHeightInput(val.toString());
                    } else {
                      // 범위 밖이면 이전 값 복원
                      setCabinetBodyHeightInput((currentPlacedModule?.cabinetBodyHeight ?? 785).toString());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const cur = parseInt(cabinetBodyHeightInput, 10) || 785;
                      const next = Math.max(760, Math.min(800, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                      setCabinetBodyHeightInput(next.toString());
                      setFreeHeightInput(next.toString());
                      if (currentPlacedModule) {
                        updatePlacedModule(currentPlacedModule.id, { cabinetBodyHeight: next });
                      }
                    }
                  }}
                  className={styles.depthInput}
                  placeholder="785"
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
                범위: 760mm ~ 800mm (기본 785mm)
              </div>
            </div>
          )}

          {/* 인조대리석 상판설치 (하부장 전용) */}
          {!showDetails && currentPlacedModule && moduleData && (moduleData.id?.includes('lower-') || moduleData.id?.includes('dual-lower-') || moduleData.category === 'lower') && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>상판설치</h5>
              {/* 재질 선택 (인조대리석 / PET) */}
              <div className={styles.doorTabSelector} style={{ marginBottom: '6px' }}>
                {([
                  { key: 'stone', label: '인조대리석' },
                  { key: 'pet', label: 'PET' },
                ] as const).map(({ key, label }) => {
                  const currentMaterial = currentPlacedModule.stoneTopMaterial || 'stone';
                  const isActive = currentMaterial === key;
                  return (
                    <button
                      key={key}
                      className={`${styles.doorTab} ${isActive ? styles.activeDoorTab : ''}`}
                      onClick={() => {
                        if (!currentPlacedModule) return;
                        const updates: Record<string, unknown> = { stoneTopMaterial: key };
                        // PET 선택 시 두께 선택 UI는 무시되고 18.5 고정 (내부 계산에서 처리)
                        // 기존 두께가 0이면 기본 10으로 설정 (재질 전환 시 상판이 나타나도록)
                        if ((currentPlacedModule.stoneTopThickness || 0) === 0) {
                          updates.stoneTopThickness = 10;
                          updates.stoneTopFrontOffset = (currentPlacedModule.moduleId || '').includes('lower-top-down') ? 23 : 23;
                        }
                        updatePlacedModule(currentPlacedModule.id, updates);
                        // 배치된 모든 하부장에 재질 일괄 적용
                        placedModules.forEach(m => {
                          if (m.id === currentPlacedModule.id) return;
                          const mid = m.moduleId || '';
                          const isLower = mid.startsWith('lower-') || mid.includes('-lower-') ||
                                          mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
                                          mid.includes('lower-drawer') || mid.includes('lower-sink') ||
                                          mid.includes('lower-induction');
                          if (!isLower) return;
                          updatePlacedModule(m.id, { stoneTopMaterial: key } as any);
                        });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {/* 두께 선택 — 인조대리석(stone)일 때만 표시, PET은 가구재 기반 자동 매핑 */}
              {(currentPlacedModule.stoneTopMaterial || 'stone') !== 'pet' && (
              <div className={styles.doorTabSelector}>
                {([0, 10, 20, 30] as const).map(thickness => (
                  <button
                    key={thickness}
                    className={`${styles.doorTab} ${(currentPlacedModule.stoneTopThickness || 0) === thickness ? styles.activeDoorTab : ''}`}
                    onClick={() => {
                      if (currentPlacedModule) {
                        const updates: Record<string, unknown> = { stoneTopThickness: thickness };
                        const mid = currentPlacedModule.moduleId || '';
                        const isDoorLift = mid.includes('lower-door-lift');
                        const isTopDown = mid.includes('lower-top-down');
                        if (thickness === 0) {
                          updates.stoneTopFrontOffset = 0;
                          updates.stoneTopBackOffset = 0;
                          updates.stoneTopLeftOffset = 0;
                          updates.stoneTopRightOffset = 0;
                          updates.stoneTopBackLip = 0;
                          updates.stoneTopBackLipThickness = 0;
                          // 도어올림: 상판 제거 시 doorTopGap 기본값(30) 복원
                          if (isDoorLift) {
                            const defaultGap = 30;
                            updates.doorTopGap = defaultGap;
                            setDoorTopGap(defaultGap);
                            setDoorTopGapInput(String(defaultGap));
                          }
                        } else {
                          // 두께 선택/변경 시 기본 앞 오프셋 적용
                          if (isTopDown) {
                            // 상판내림: 두께 무관 앞 오프셋 23mm (인조대리석 상판 깊이 623 고정)
                            updates.stoneTopFrontOffset = 23;
                          } else if ((currentPlacedModule.stoneTopThickness || 0) === 0 && !isDoorLift) {
                            updates.stoneTopFrontOffset = 23;
                          }
                          // 상판 최초 설치 시 (0→두께): 상판 재질이 미설정이면 루나쉐도우를 기본값으로 적용
                          if ((currentPlacedModule.stoneTopThickness || 0) === 0) {
                            const mc = spaceInfo.materialConfig;
                            if (!mc?.countertopTexture && !mc?.countertopColor) {
                              setSpaceInfo({
                                materialConfig: {
                                  ...mc,
                                  countertopColor: '#FFFFFF',
                                  countertopTexture: '/materials/countertop/luna_shadow_hanwha.png',
                                } as any
                              });
                            }
                          }
                          // 도어올림: 상판 두께별 도어 상단갭 (10mm→25, 20mm→35, 30mm→45)
                          if (isDoorLift) {
                            const newGap = thickness + 15;
                            updates.doorTopGap = newGap;
                            setDoorTopGap(newGap);
                            setDoorTopGapInput(String(newGap));
                          }
                          // 뒷턱 다채움 상태이면 새 두께 기준으로 재계산
                          const prevThickness = currentPlacedModule.stoneTopThickness || 0;
                          const curBackLip = currentPlacedModule.stoneTopBackLip || 0;
                          if (curBackLip > 0 && prevThickness > 0) {
                            const prevFillH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                            if (curBackLip === prevFillH) {
                              // 다채움 상태 → 새 두께로 재계산
                              const tempMod = { ...currentPlacedModule, stoneTopThickness: thickness };
                              const newFillH = calcBackLipFillHeight(tempMod, moduleData, spaceInfo, placedModules);
                              if (newFillH > 0) {
                                updates.stoneTopBackLip = newFillH;
                              }
                            }
                          }
                        }
                        // 현재 가구 적용
                        updatePlacedModule(currentPlacedModule.id, updates);
                        // 배치된 모든 하부장에 동일하게 일괄 적용
                        placedModules.forEach(m => {
                          if (m.id === currentPlacedModule.id) return;
                          const mid = m.moduleId || '';
                          const isLower = mid.startsWith('lower-') || mid.includes('-lower-') ||
                                          mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
                                          mid.includes('lower-drawer') || mid.includes('lower-sink') ||
                                          mid.includes('lower-induction');
                          if (!isLower) return;
                          const bulk: Record<string, unknown> = { stoneTopThickness: thickness };
                          if (thickness === 0) {
                            bulk.stoneTopFrontOffset = 0;
                            bulk.stoneTopBackOffset = 0;
                            bulk.stoneTopLeftOffset = 0;
                            bulk.stoneTopRightOffset = 0;
                            bulk.stoneTopBackLip = 0;
                            bulk.stoneTopBackLipThickness = 0;
                          } else {
                            // 처음 설치되는 하부장은 기본 앞 오프셋 23 적용
                            if ((m.stoneTopThickness || 0) === 0) {
                              bulk.stoneTopFrontOffset = 23;
                            }
                          }
                          updatePlacedModule(m.id, bulk);
                        });
                      }
                    }}
                  >
                    {thickness === 0 ? '없음' : `${thickness}mm`}
                  </button>
                ))}
              </div>
              )}
              {/* 높이 제한 경고 — 800mm 초과 시에만 표시 */}
              {(currentPlacedModule.stoneTopThickness || 0) > 0 && (() => {
                const bodyH = currentPlacedModule.cabinetBodyHeight ?? moduleData.dimensions.height ?? 785;
                const totalH = bodyH + (currentPlacedModule.stoneTopThickness || 0);
                return totalH > 800 ? (
                  <div style={{ color: '#e53e3e', fontSize: '11px', marginTop: '4px' }}>
                    ⚠ 총 높이 {totalH}mm (본체 {bodyH} + 상판 {currentPlacedModule.stoneTopThickness}) — 800mm 초과
                  </div>
                ) : null;
              })()}
              {/* 오프셋 입력 (상판이 있을 때만) */}
              {(currentPlacedModule.stoneTopThickness || 0) > 0 && (
                <>
                  <div className={styles.epRow} style={{ marginTop: '8px' }}>
                    <div className={styles.epField}>
                      <label className={styles.epFieldLabel}>앞</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={currentPlacedModule.stoneTopFrontOffset ?? 0}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                              const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                              updatePlacedModule(currentPlacedModule.id, { stoneTopFrontOffset: num });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const cur = currentPlacedModule.stoneTopFrontOffset ?? 0;
                              const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                              updatePlacedModule(currentPlacedModule.id, { stoneTopFrontOffset: next });
                            }
                          }}
                          className={styles.epInput}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                    <div className={styles.epField}>
                      <label className={styles.epFieldLabel}>뒤</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={currentPlacedModule.stoneTopBackOffset ?? 0}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                              const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                              updatePlacedModule(currentPlacedModule.id, { stoneTopBackOffset: num });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const cur = currentPlacedModule.stoneTopBackOffset ?? 0;
                              const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                              updatePlacedModule(currentPlacedModule.id, { stoneTopBackOffset: next });
                            }
                          }}
                          className={styles.epInput}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                  </div>

                  {/* 뒷턱 옵션 — 상판 설정과 동일 패턴 */}
                  <div style={{ marginTop: '8px' }}>
                    <label className={styles.epFieldLabel}>뒷턱</label>
                    <div className={styles.doorTabSelector} style={{ marginTop: '4px' }}>
                      {([0, 10, 20, 30] as const).map(thickness => (
                        <button
                          key={thickness}
                          className={`${styles.doorTab} ${
                            thickness === 0
                              ? !(currentPlacedModule.stoneTopBackLip) ? styles.activeDoorTab : ''
                              : (currentPlacedModule.stoneTopBackLip || 0) > 0 && (currentPlacedModule.stoneTopBackLipThickness || currentPlacedModule.stoneTopThickness || 20) === thickness ? styles.activeDoorTab : ''
                          }`}
                          onClick={() => {
                            // 일괄 적용: 배치된 모든 하부장에 동일 적용
                            const applyToLowers = (updates: Record<string, unknown>, fillHeightFor: (m: any) => number) => {
                              // 현재 가구
                              updatePlacedModule(currentPlacedModule.id, updates);
                              // 다른 하부장들
                              placedModules.forEach(m => {
                                if (m.id === currentPlacedModule.id) return;
                                const mid = m.moduleId || '';
                                const isLower = mid.startsWith('lower-') || mid.includes('-lower-') ||
                                                mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
                                                mid.includes('lower-drawer') || mid.includes('lower-sink') ||
                                                mid.includes('lower-induction');
                                if (!isLower) return;
                                // 상판이 없는 하부장은 뒷턱도 의미 없음 — 상판 있는 것만
                                if (!(m.stoneTopThickness || 0)) return;
                                const bulk: Record<string, unknown> = { ...updates };
                                // stoneTopBackLip 값이 포함되어 있고 100이면, 다채움이었던 가구는 재계산
                                if (bulk.stoneTopBackLip === 100 && m.stoneTopBackLipFullFill) {
                                  const h = fillHeightFor(m);
                                  if (h > 0) bulk.stoneTopBackLip = h;
                                }
                                updatePlacedModule(m.id, bulk);
                              });
                            };
                            if (thickness === 0) {
                              applyToLowers({ stoneTopBackLip: 0, stoneTopBackLipThickness: 0 }, () => 0);
                            } else {
                              const updates: Record<string, unknown> = { stoneTopBackLipThickness: thickness };
                              if (!(currentPlacedModule.stoneTopBackLip)) {
                                updates.stoneTopBackLip = 100;
                              }
                              applyToLowers(updates, (m) => calcBackLipFillHeight(m, moduleData, spaceInfo, placedModules));
                            }
                          }}
                        >
                          {thickness === 0 ? '없음' : `${thickness}mm`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(currentPlacedModule.stoneTopBackLip || 0) > 0 && (
                    <div className={styles.epRow} style={{ marginTop: '6px', alignItems: 'center' }}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>뒷턱 높이</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={(() => {
                              const fullH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                              return currentPlacedModule.stoneTopBackLipFullFill || (fullH > 0 && (currentPlacedModule.stoneTopBackLip || 0) === fullH);
                            })()}
                            value={currentPlacedModule.stoneTopBackLip ?? 100}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d+$/.test(v)) {
                                const num = v === '' ? 0 : Math.max(1, parseInt(v, 10));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLip: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.stoneTopBackLip ?? 100;
                                const next = Math.max(1, cur + (e.key === 'ArrowUp' ? 1 : -1));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLip: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        <input
                          type="checkbox"
                          checked={currentPlacedModule.stoneTopBackLipFullFill || (() => {
                            const fullH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                            return fullH > 0 && (currentPlacedModule.stoneTopBackLip || 0) === fullH;
                          })()}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const applyFullFill = (m: any) => {
                              const mid = m.moduleId || '';
                              const isLower = mid.startsWith('lower-') || mid.includes('-lower-') ||
                                              mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
                                              mid.includes('lower-drawer') || mid.includes('lower-sink') ||
                                              mid.includes('lower-induction');
                              if (!isLower) return;
                              // 상판과 뒷턱이 있는 하부장만 다채움 적용
                              if (!(m.stoneTopThickness || 0)) return;
                              if (!(m.stoneTopBackLip || 0)) return;

                              if (checked) {
                                const fullH = calcBackLipFillHeight(m, moduleData, spaceInfo, placedModules);
                                if (fullH > 0) {
                                  updatePlacedModule(m.id, {
                                    stoneTopBackLipFillHeight: fullH,
                                    stoneTopBackLipFullFill: true,
                                  });
                                }
                              } else {
                                updatePlacedModule(m.id, {
                                  stoneTopBackLipFillHeight: 0,
                                  stoneTopBackLipFullFill: false,
                                });
                              }
                            };
                            // 현재 가구 (뒷턱 없어도 체크 동작 보장)
                            if (checked) {
                              const fullH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                              if (fullH > 0) {
                                updatePlacedModule(currentPlacedModule.id, {
                                  stoneTopBackLipFillHeight: fullH,
                                  stoneTopBackLipFullFill: true,
                                });
                              }
                            } else {
                              updatePlacedModule(currentPlacedModule.id, {
                                stoneTopBackLipFillHeight: 0,
                                stoneTopBackLipFullFill: false,
                              });
                            }
                            // 나머지 모든 하부장에 일괄 적용
                            placedModules.forEach(m => {
                              if (m.id === currentPlacedModule.id) return;
                              applyFullFill(m);
                            });
                          }}
                        />
                        다채움
                      </label>
                    </div>
                  )}
                  {(currentPlacedModule.stoneTopBackLip || 0) > 0 && (
                    <div className={styles.epRow} style={{ marginTop: '6px' }}>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>뒷턱 앞옵셋</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={(() => {
                              const fullH = calcBackLipFillHeight(currentPlacedModule, moduleData, spaceInfo, placedModules);
                              return fullH > 0 && (currentPlacedModule.stoneTopBackLip || 0) === fullH;
                            })()}
                            value={currentPlacedModule.stoneTopBackLipDepthOffset ?? 0}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipDepthOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.stoneTopBackLipDepthOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipDepthOffset: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>상판 앞돌출</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={currentPlacedModule.stoneTopBackLipTopOffset ?? 20}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipTopOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.stoneTopBackLipTopOffset ?? 20;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipTopOffset: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                      <div className={styles.epField}>
                        <label className={styles.epFieldLabel}>상판 뒤돌출</label>
                        <div className={styles.inputWithUnit}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={currentPlacedModule.stoneTopBackLipTopBackOffset ?? 0}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || v === '-' || /^-?\d+$/.test(v)) {
                                const num = (v === '' || v === '-') ? 0 : Math.max(-200, Math.min(200, parseInt(v, 10)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipTopBackOffset: num });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const cur = currentPlacedModule.stoneTopBackLipTopBackOffset ?? 0;
                                const next = Math.max(-200, Math.min(200, cur + (e.key === 'ArrowUp' ? 1 : -1)));
                                updatePlacedModule(currentPlacedModule.id, { stoneTopBackLipTopBackOffset: next });
                              }
                            }}
                            className={styles.epInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 선반장 선반 설정 (2섹션: 하단/상단 각각 편집) */}
          {!showDetails && currentPlacedModule && (
            currentPlacedModule.moduleId.includes('-shelf-') ||
            currentPlacedModule.moduleId.includes('-4drawer-shelf-') ||
            currentPlacedModule.moduleId.includes('-2drawer-shelf-')
          ) && (() => {
            const effectiveSections: SectionConfig[] = currentPlacedModule.customSections || moduleData.modelConfig?.sections || [];
            const basicThickness = moduleData.modelConfig?.basicThickness || 18;

            // 각 섹션별 shelf 편집 블록 렌더링 헬퍼
            const renderShelfEditor = (
              sectionIdx: number,
              label: string,
              count: number,
              setCount: (n: number) => void,
              posInputs: string[],
              setPosInputs: (arr: string[]) => void
            ) => {
              const section = effectiveSections[sectionIdx];
              if (!section || section.type !== 'shelf') return null;
              // 섹션 외경을 spaceInfo 실시간 값으로 재계산
              // 마지막 섹션: 가구외경 - 고정섹션합, 첫 섹션: section.height 그대로
              const topFrameR = spaceInfo.frameSize?.top ?? 30;
              // 가구 개별 baseFrameHeight 우선, 없으면 글로벌 spaceInfo 사용
              const baseFrameR = currentPlacedModule?.baseFrameHeight !== undefined
                ? currentPlacedModule.baseFrameHeight
                : (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0);
              const furnitureOuterR = (spaceInfo.height || 0) - topFrameR - baseFrameR;
              const fixedSumR = effectiveSections.slice(0, -1).reduce((s: number, sec: any) => s + (sec.height || 0), 0);
              const isLastR = sectionIdx === effectiveSections.length - 1;
              const sectionHeight = isLastR
                ? Math.max(0, furnitureOuterR - fixedSumR)
                : ((section.height as number) || 0);

              const handleCountChange = (delta: number) => {
                const newCount = Math.max(0, Math.min(10, count + delta));
                setCount(newCount);
                // 내경 기반(섹션 외경 - 2t)으로 균등 선반 위치 계산
                const innerH = sectionHeight - 2 * basicThickness;
                const newPositions = calculateEvenShelfPositions(innerH, newCount, basicThickness);
                setPosInputs(newPositions.map(p => Math.round(p).toString()));
                const newSections = [...effectiveSections];
                newSections[sectionIdx] = { ...section, count: newCount, shelfPositions: newPositions };
                updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
              };

              const handlePosChange = (i: number, value: string) => {
                const newInputs = [...posInputs];
                newInputs[i] = value;
                setPosInputs(newInputs);
              };

              const handlePosBlur = (i: number) => {
                const val = parseInt(posInputs[i], 10);
                if (isNaN(val) || val < 0 || val > sectionHeight) {
                  const positions = section.shelfPositions || [];
                  const newInputs = [...posInputs];
                  newInputs[i] = Math.round(positions[i] || 0).toString();
                  setPosInputs(newInputs);
                  return;
                }
                const currentPositions = section.shelfPositions ? [...section.shelfPositions] : [];
                currentPositions[i] = val;
                const newSections = [...effectiveSections];
                newSections[sectionIdx] = { ...section, shelfPositions: currentPositions };
                updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
              };

              const handlePosArrow = (i: number, direction: 'up' | 'down') => {
                const cur = parseInt(posInputs[i], 10) || 0;
                const next = Math.max(0, Math.min(Math.round(sectionHeight), cur + (direction === 'up' ? 1 : -1)));
                handlePosChange(i, next.toString());
                const currentPositions = section.shelfPositions ? [...section.shelfPositions] : [];
                currentPositions[i] = next;
                const newSections = [...effectiveSections];
                newSections[sectionIdx] = { ...section, shelfPositions: currentPositions };
                updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
              };

              return (
                <div key={sectionIdx} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--theme-text-primary)', marginBottom: '6px' }}>{label} (높이 {Math.round(sectionHeight)}mm)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--theme-text-secondary)' }}>선반 갯수</span>
                    <button
                      onClick={() => handleCountChange(-1)}
                      disabled={count <= 0}
                      style={{
                        width: '28px', height: '28px', border: '1px solid var(--theme-border)',
                        borderRadius: '4px', background: 'var(--theme-surface)', cursor: count <= 0 ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                        color: count <= 0 ? 'var(--theme-text-disabled)' : 'var(--theme-text-primary)'
                      }}
                    >−</button>
                    <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{count}</span>
                    <button
                      onClick={() => handleCountChange(1)}
                      disabled={count >= 10}
                      style={{
                        width: '28px', height: '28px', border: '1px solid var(--theme-border)',
                        borderRadius: '4px', background: 'var(--theme-surface)', cursor: count >= 10 ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                        color: count >= 10 ? 'var(--theme-text-disabled)' : 'var(--theme-text-primary)'
                      }}
                    >+</button>
                    <button
                      onClick={() => {
                        if (count <= 0) return;
                        const halfT = basicThickness / 2;
                        const innerH = Math.max(0, sectionHeight - 2 * basicThickness);
                        const totalInner = innerH - count * basicThickness;
                        const baseGap = Math.floor(totalInner / (count + 1));
                        const remainder = totalInner - baseGap * (count + 1);
                        const evenGaps: number[] = Array(count + 1).fill(baseGap);
                        evenGaps[0] += remainder;
                        const newPositions: number[] = [];
                        let acc = 0;
                        for (let k = 0; k < count; k++) {
                          acc += evenGaps[k];
                          newPositions.push(Math.round(acc + k * basicThickness + halfT));
                        }
                        setPosInputs(newPositions.map(p => Math.round(p).toString()));
                        const newSections = [...effectiveSections];
                        newSections[sectionIdx] = { ...section, shelfPositions: newPositions };
                        updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
                      }}
                      disabled={count <= 0}
                      style={{
                        marginLeft: '8px', height: '28px', padding: '0 10px',
                        border: '1px solid var(--theme-border)', borderRadius: '4px',
                        background: 'var(--theme-surface)',
                        cursor: count <= 0 ? 'not-allowed' : 'pointer',
                        fontSize: '11px',
                        color: count <= 0 ? 'var(--theme-text-disabled)' : 'var(--theme-text-primary)',
                      }}
                    >초기화</button>
                  </div>
                  {(() => {
                    const shelfPos: number[] = [...((section.shelfPositions || []) as number[])].sort((a, b) => a - b);
                    if (shelfPos.length === 0) return null;
                    const n = shelfPos.length;
                    const halfT = basicThickness / 2;
                    // 섹션 내경: sectionHeight(외경) - 2t
                    const innerH = Math.max(0, sectionHeight - 2 * basicThickness);
                    // gaps를 실제 저장된 shelfPositions에서 파생 (뷰어 스피너로 선반 이동 시 즉시 반영)
                    const gaps: number[] = [];
                    for (let k = 0; k <= n; k++) {
                      if (k === 0) {
                        gaps.push(Math.max(0, Math.round(shelfPos[0] - halfT)));
                      } else if (k === n) {
                        gaps.push(Math.max(0, Math.round(innerH - shelfPos[n - 1] - halfT)));
                      } else {
                        gaps.push(Math.max(0, Math.round(shelfPos[k] - shelfPos[k - 1] - basicThickness)));
                      }
                    }
                    return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ padding: '6px 8px', background: 'var(--theme-background)', border: '1px solid var(--theme-border)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', marginBottom: '4px' }}>칸 내경</div>
                        {gaps.map((_ignored, dispIdx) => {
                          const i = gaps.length - 1 - dispIdx; // 위(높은 칸) → 아래(낮은 칸) 순서로 표시
                          const g = gaps[i];
                          const applyGap = (newGap: number) => {
                            const safeGap = Math.max(0, Math.round(newGap));
                            const updatedGaps = [...gaps];
                            updatedGaps[i] = safeGap;
                            // 변경된 칸 제외 나머지를 내경 내에서 균등 재분배
                            const otherCount = updatedGaps.length - 1;
                            if (otherCount > 0) {
                              const remaining = innerH - safeGap - n * basicThickness;
                              const eachOther = Math.max(0, Math.round(remaining / otherCount));
                              for (let k = 0; k < updatedGaps.length; k++) {
                                if (k !== i) updatedGaps[k] = eachOther;
                              }
                              // 반올림 오차 흡수
                              const lastIdx = i === updatedGaps.length - 1 ? updatedGaps.length - 2 : updatedGaps.length - 1;
                              const sumAll = updatedGaps.reduce((s, v) => s + v, 0);
                              updatedGaps[lastIdx] += Math.round(innerH - sumAll - n * basicThickness);
                              updatedGaps[lastIdx] = Math.max(0, updatedGaps[lastIdx]);
                            }
                            // pos[k] = 누적(gaps[0..k]) + k*t + t/2 (선반 중심)
                            const resultPositions: number[] = [];
                            let acc = 0;
                            for (let k = 0; k < n; k++) {
                              acc += updatedGaps[k];
                              resultPositions.push(Math.round(acc + k * basicThickness + halfT));
                            }
                            setPosInputs(resultPositions.map(p => Math.round(p).toString()));
                            const newSections = [...effectiveSections];
                            newSections[sectionIdx] = { ...section, shelfPositions: resultPositions };
                            updatePlacedModule(currentPlacedModule.id, { customSections: newSections });
                          };
                          const gapLabel = sectionIdx === 1 ? `상부 칸 ${dispIdx + 1}` : `하부 칸 ${dispIdx + 1}`;
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--theme-text-primary)', marginBottom: '3px', gap: '6px' }}>
                              <span style={{ flexShrink: 0 }}>{gapLabel}</span>
                              <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={g}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '' || raw === '-') return;
                                    const v = parseInt(raw, 10);
                                    if (!isNaN(v)) applyGap(v);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                                    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      const cur = parseInt((e.target as HTMLInputElement).value, 10) || 0;
                                      applyGap(cur + (e.key === 'ArrowUp' ? 1 : -1));
                                    }
                                  }}
                                  style={{
                                    color: 'var(--theme-text-primary)',
                                    backgroundColor: 'var(--theme-surface)',
                                    width: '60px', height: '28px', textAlign: 'center', boxSizing: 'border-box',
                                    border: '1px solid var(--theme-border)', borderRadius: '4px',
                                    fontSize: '12px', padding: '0 4px', flexShrink: 0,
                                  }}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyGap((typeof g === 'number' ? g : parseFloat(String(g))) + 1)}
                                    style={{
                                      width: '20px', height: '14px', padding: 0, fontSize: '10px',
                                      border: '1px solid var(--theme-border)', background: 'var(--theme-surface)',
                                      color: 'var(--theme-text-primary)',
                                      cursor: 'pointer', borderRadius: '3px 3px 0 0', lineHeight: '1',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >▲</button>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyGap((typeof g === 'number' ? g : parseFloat(String(g))) - 1)}
                                    style={{
                                      width: '20px', height: '14px', padding: 0, fontSize: '10px',
                                      border: '1px solid var(--theme-border)', background: 'var(--theme-surface)',
                                      color: 'var(--theme-text-primary)',
                                      cursor: 'pointer', borderRadius: '0 0 3px 3px', lineHeight: '1', borderTop: 'none',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >▼</button>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', flexShrink: 0, minWidth: '18px' }}>mm</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              );
            };

            return (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>선반 설정</h5>
                {renderShelfEditor(1, '상단 섹션', upperShelfCount, setUpperShelfCount, upperShelfPositionInputs, setUpperShelfPositionInputs)}
                {renderShelfEditor(0, '하단 섹션', lowerShelfCount, setLowerShelfCount, lowerShelfPositionInputs, setLowerShelfPositionInputs)}
              </div>
            );
          })()}

          {/* 상부 선반 제거 토글: 코트장/붙박이장B/붙박이장D 전용 */}
          {!showDetails && currentPlacedModule && isUpperSafetyShelfModule(currentPlacedModule.moduleId) && (() => {
            const removed = !!currentPlacedModule.removeUpperSafetyShelf;
            const toggleStyle: React.CSSProperties = {
              width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              backgroundColor: removed ? 'var(--theme-primary, #4a90d9)' : '#ccc',
              position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
            };
            const knobStyle: React.CSSProperties = {
              position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%',
              backgroundColor: '#fff', transition: 'left 0.2s', left: removed ? '18px' : '2px',
            };
            // 상부섹션 안전선반 윗면 ~ 천판 바닥 사이 간격 계산
            // 2D 표시 공식과 동일: innerH - shelfPos - halfT
            // = (sectionOuterH - 2*basicThickness) - shelfPos - (basicThickness / 2)
            const basicThicknessMm = (spaceInfo as any).panelThickness || 18;
            const sections = (currentPlacedModule as any).customSections
              ?? (currentPlacedModule.customConfig as any)?.sections
              ?? moduleData?.modelConfig?.sections;
            const hasExplicitCustomSections = Array.isArray((currentPlacedModule as any).customSections);
            const sectionList = Array.isArray(sections) ? sections : [];
            const upperHangingIndex = (() => {
              for (let i = sectionList.length - 1; i >= 0; i--) {
                const section = sectionList[i] as any;
                if (
                  section.type === 'hanging' &&
                  Array.isArray(section.shelfPositions) &&
                  section.shelfPositions.some((pos: number) => pos > 0)
                ) {
                  return i;
                }
              }
              for (let i = sectionList.length - 1; i >= 0; i--) {
                if ((sectionList[i] as any).type === 'hanging') return i;
              }
              return -1;
            })();
            const hangingSection = upperHangingIndex >= 0 ? sectionList[upperHangingIndex] : null;
            const baseTotalHeight = currentPlacedModule.freeHeight
              || currentPlacedModule.customHeight
              || moduleData?.dimensions?.height
              || 0;
            const globalTopFrame = spaceInfo.frameSize?.top ?? 30;
            const topFrameMm = currentPlacedModule.topFrameThickness ?? globalTopFrame;
            const topFrameDelta = currentPlacedModule.topFrameThickness !== undefined
              ? topFrameMm - globalTopFrame
              : 0;
            const absorbedTopHeight = currentPlacedModule.hasTopFrame === false
              ? topFrameMm - (currentPlacedModule.topFrameGap ?? 0)
              : 0;
            const absorbedBaseHeight = currentPlacedModule.hasBase === false
              ? ((currentPlacedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0))
                - (currentPlacedModule.individualFloatHeight ?? 0))
              : 0;
            const isStandTypeForHeight = spaceInfo.baseConfig?.type === 'stand';
            const baseFrameDelta = currentPlacedModule.baseFrameHeight !== undefined && !isStandTypeForHeight
              ? currentPlacedModule.baseFrameHeight - (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0)
              : 0;
            const effectiveTotalHeight = Math.max(0, baseTotalHeight - topFrameDelta - baseFrameDelta + absorbedTopHeight + absorbedBaseHeight);
            const getEffectiveSectionHeight = (sectionIndex: number) => {
              const section = sectionList[sectionIndex] as any;
              if (!section) return 0;
              if (sectionList.length >= 2 && sectionIndex === sectionList.length - 1) {
                const previousSectionsHeight = sectionList
                  .slice(0, sectionIndex)
                  .reduce((sum: number, prevSection: any) => sum + (prevSection.height || 0), 0);
                return Math.max(0, effectiveTotalHeight - previousSectionsHeight);
              }
              return section.height || 0;
            };
            let topGap: number | null = null;
            if (hangingSection && !removed) {
              const hangingH = getEffectiveSectionHeight(upperHangingIndex);
              const posArr = (hangingSection.shelfPositions || []) as number[];
              const shelfPos = posArr.length > 0 ? posArr[posArr.length - 1] : null;
              if (shelfPos !== null) {
                const innerH = Math.max(0, hangingH - 2 * basicThicknessMm);
                let renderedShelfPos = shelfPos;
                if (!hasExplicitCustomSections && upperHangingIndex === sectionList.length - 1) {
                  const originalInnerH = Math.max(0, ((hangingSection as any).height || 0) - 2 * basicThicknessMm);
                  const originalGap = Math.max(0, Math.round(
                    originalInnerH -
                    shelfPos -
                    basicThicknessMm / 2
                  ));
                  renderedShelfPos = Math.max(0, Math.round(innerH - originalGap - basicThicknessMm / 2));
                }
                topGap = Math.max(0, Math.round(innerH - renderedShelfPos - basicThicknessMm / 2));
              }
            }
            return (
              <div className={styles.propertySection}>
                <h5 className={styles.sectionTitle}>상부 선반</h5>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
                  <button
                    onClick={() => updatePlacedModule(currentPlacedModule.id, { removeUpperSafetyShelf: !removed })}
                    style={toggleStyle}
                    aria-label="상부 선반 제거"
                  >
                    <span style={knobStyle} />
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--theme-text-primary)' }}>
                    선반 제거 (옷봉을 상판에 부착)
                  </span>
                </div>
                {topGap !== null && (() => {
                  // 저장값이 아니라 현재 섹션 높이와 선반 위치에서 항상 재계산한다.
                  const currentGap = topGap;
                  const updateGap = (v: number) => {
                    const clamped = Math.max(0, Math.min(2000, v));
                    const updates: any = { upperShelfTopGap: clamped };
                    if (upperHangingIndex >= 0) {
                      const nextSections = sectionList.map((section: any, index: number) => {
                        if (index !== upperHangingIndex) return section;
                        const innerH = Math.max(0, getEffectiveSectionHeight(index) - 2 * basicThicknessMm);
                        const nextShelfPos = Math.max(0, Math.round(innerH - clamped - basicThicknessMm / 2));
                        const shelfPositions = Array.isArray(section.shelfPositions)
                          ? [...section.shelfPositions]
                          : [];
                        const safetyIndex = shelfPositions.findIndex((pos: number) => pos > 0);
                        if (safetyIndex >= 0) {
                          shelfPositions[safetyIndex] = nextShelfPos;
                        } else {
                          shelfPositions.push(nextShelfPos);
                        }
                        return { ...section, shelfPositions };
                      });
                      updates.customSections = nextSections;
                    }
                    updatePlacedModule(currentPlacedModule.id, updates);
                  };
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' }}>
                      <span style={{ color: 'var(--theme-text-secondary)' }}>옷봉선반 간격</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={currentGap}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^\d+$/.test(v)) {
                              updateGap(v === '' ? 0 : parseInt(v, 10));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              updateGap(currentGap + (e.key === 'ArrowUp' ? 1 : -1));
                            }
                          }}
                          onBlur={(e) => updateGap(parseInt(e.target.value) || 0)}
                          style={{ width: '60px', padding: '2px 4px', border: '1px solid var(--theme-border)', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }}
                        />
                        <span style={{ color: 'var(--theme-text-secondary)' }}>mm</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}


          {/* 하부섹션 상판 옵셋 (2섹션 가구만, 상세보기 아닐 때만) */}
          {!showDetails && isTwoSectionFurniture && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>하부섹션 상판 옵셋</h5>
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

          {/* 도어 셋팅 — 우측바로 이동됨 */}

          {/* 상판 따내기 설정 (상부장만) */}
          {moduleData.category === 'upper' && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>상판 따내기</h5>
              <div className={styles.doorTabSelector}>
                <button
                  className={`${styles.doorTab} ${!currentPlacedModule?.topPanelNotchSize ? styles.activeDoorTab : ''}`}
                  onClick={() => {
                    updatePlacedModule(activePopup.id, { topPanelNotchSize: undefined, topPanelNotchSide: undefined });
                  }}
                >
                  없음
                </button>
                {currentPlacedModule?.isDualSlot && (
                  <button
                    className={`${styles.doorTab} ${currentPlacedModule?.topPanelNotchSize === '680x140' ? styles.activeDoorTab : ''}`}
                    onClick={() => {
                      updatePlacedModule(activePopup.id, {
                        topPanelNotchSize: '680x140',
                        topPanelNotchSide: currentPlacedModule?.topPanelNotchSide || 'right'
                      });
                    }}
                  >
                    680×140
                  </button>
                )}
                <button
                  className={`${styles.doorTab} ${currentPlacedModule?.topPanelNotchSize === '340x140' ? styles.activeDoorTab : ''}`}
                  onClick={() => {
                    updatePlacedModule(activePopup.id, {
                      topPanelNotchSize: '340x140',
                      topPanelNotchSide: currentPlacedModule?.topPanelNotchSide || 'right'
                    });
                  }}
                >
                  340×140
                </button>
              </div>
              {currentPlacedModule?.topPanelNotchSize && (
                <div className={styles.doorTabSelector} style={{ marginTop: '4px' }}>
                  <button
                    className={`${styles.doorTab} ${currentPlacedModule?.topPanelNotchSide === 'left' ? styles.activeDoorTab : ''}`}
                    onClick={() => {
                      updatePlacedModule(activePopup.id, { topPanelNotchSide: 'left' });
                    }}
                  >
                    좌
                  </button>
                  <button
                    className={`${styles.doorTab} ${(currentPlacedModule?.topPanelNotchSide || 'right') === 'right' ? styles.activeDoorTab : ''}`}
                    onClick={() => {
                      updatePlacedModule(activePopup.id, { topPanelNotchSide: 'right' });
                    }}
                  >
                    우
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 상하부장 사이 갭 백패널 설정 — 숨김 처리 */}


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
