import React, { useState, useMemo } from 'react';
import { getModulesByCategory, ModuleData } from '@/data/modules';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import ModuleItem from './ModuleItem';
import CabinetModuleItem from './CabinetModuleItem';
import styles from './ModuleLibrary.module.css';

// 모듈 타입 정의
type ModuleType = 'single' | 'dual';

// 카테고리 타입 정의
type CategoryType = 'full' | 'upper-lower';

const ModuleLibrary: React.FC = () => {
  // 선택된 탭 상태 (싱글/듀얼)
  const [selectedType, setSelectedType] = useState<ModuleType>('single');
  // 선택된 카테고리 상태 (전체형/상하부장)
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('full');
  
  // 에디터 스토어에서 공간 정보 가져오기
  const { spaceInfo } = useSpaceConfigStore();

  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 인덱싱 정보 계산 (컬럼 정보)
  const indexing = calculateSpaceIndexing(spaceInfo);
  
  // 단일 컬럼의 너비 계산
  const columnWidth = indexing.columnWidth;
  
  // 선택된 카테고리에 따라 모듈 가져오기
  const fullModules = getModulesByCategory('full', internalSpace, spaceInfo);
  const upperModules = getModulesByCategory('upper', internalSpace, spaceInfo);
  const lowerModules = getModulesByCategory('lower', internalSpace, spaceInfo);
  
  // 상하부장 모듈 합치기
  const upperLowerModules = [...upperModules, ...lowerModules];
  
  // 디버깅용 로그
  if (selectedCategory === 'upper-lower') {
    console.log('🎯 상하부장 모듈 선택됨:', {
      upperCount: upperModules.length,
      lowerCount: lowerModules.length,
      totalCount: upperLowerModules.length,
      upperModules: upperModules.map(m => ({ id: m.id, name: m.name, category: m.category })),
      lowerModules: lowerModules.map(m => ({ id: m.id, name: m.name, category: m.category }))
    });
  }
  
  // 현재 카테고리에 따라 모듈 선택
  const categoryModules = selectedCategory === 'full' ? fullModules : upperLowerModules;
  
  // 싱글(1컬럼)과 듀얼(2컬럼) 모듈로 분류
  const { singleModules, dualModules } = useMemo(() => {
    console.log('🎯 모듈 분류 시작:', {
      categoryModulesCount: categoryModules.length,
      selectedCategory,
      categoryModules: categoryModules.map(m => ({ id: m.id, name: m.name, category: m.category }))
    });
    
    // 여백 허용치 축소 (기존 50mm에서 30mm로 감소)
    const MARGIN_TOLERANCE = 30;
    
    // 컬럼이 1개인 경우 모두 싱글로 처리
    if (indexing.columnCount <= 1) {
      return {
        singleModules: categoryModules,
        dualModules: []
      };
    }
    
    // 일반적인 컬럼 계산 로직
    return categoryModules.reduce((acc, module) => {
      const moduleWidth = module.dimensions.width;
      
      // 싱글 컬럼 모듈 판단 (1컬럼 너비 ± 여백 허용치)
      if (Math.abs(moduleWidth - columnWidth) <= MARGIN_TOLERANCE) {
        acc.singleModules.push(module);
      } 
      // 듀얼 컬럼 모듈 판단 (2컬럼 너비 ± 여백 허용치)
      else if (Math.abs(moduleWidth - (columnWidth * 2)) <= MARGIN_TOLERANCE) {
        // 특수 듀얼 가구 조건부 노출: 슬롯폭이 550mm 이상일 때만 표시
        const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler-') || 
                                       module.id.includes('dual-4drawer-pantshanger-');
        if (isSpecialDualFurniture && columnWidth < 550) {
          // 슬롯폭이 550mm 미만이면 특수 가구는 제외 (스타일러, 바지걸이장)
          return acc;
        }
        acc.dualModules.push(module);
      } 
      // 그 외 케이스는 가장 가까운 컬럼 수에 할당
      else if (moduleWidth < (columnWidth * 1.5)) {
        acc.singleModules.push(module);
      } else {
        // 특수 듀얼 가구 조건부 노출: 슬롯폭이 550mm 이상일 때만 표시
        const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler-') || 
                                       module.id.includes('dual-4drawer-pantshanger-');
        if (isSpecialDualFurniture && columnWidth < 550) {
          // 슬롯폭이 550mm 미만이면 특수 가구는 제외 (스타일러, 바지걸이장)
          return acc;
        }
        acc.dualModules.push(module);
      }
      
      return acc;
    }, { singleModules: [] as ModuleData[], dualModules: [] as ModuleData[] });
  }, [categoryModules, columnWidth, indexing.columnCount, selectedCategory]);

  // 현재 선택된 탭에 따른 모듈 목록
  const currentModules = selectedType === 'single' ? singleModules : dualModules;
  
  // 디버깅: 최종 모듈 확인
  console.log('🎯 최종 모듈 표시:', {
    selectedCategory,
    selectedType,
    singleModulesCount: singleModules.length,
    dualModulesCount: dualModules.length,
    currentModulesCount: currentModules.length,
    currentModules: currentModules.map(m => ({ id: m.id, name: m.name, category: m.category }))
  });

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>가구 라이브러리</h3>
      
      <div className={styles.internalSpaceInfo}>
        <div className={styles.internalSpaceTitle}>내경 공간 (맞춤형 가구 기준)</div>
        <div className={styles.internalSpaceDimensions}>
          폭: {internalSpace.width}mm × 높이: {internalSpace.height}mm × 깊이: {internalSpace.depth}mm
        </div>
        <div className={styles.internalSpaceNote}>
          * 모든 가구는 내경 높이({internalSpace.height}mm)와 깊이({internalSpace.depth}mm)에 맞춰 제작됩니다
        </div>
        {indexing.columnCount > 1 && (
          <div className={styles.internalSpaceNote}>
            * 컬럼 수: {indexing.columnCount}개 / 컬럼당 너비: {columnWidth}mm
          </div>
        )}
      </div>
      
      <div className={styles.category}>
        {/* 카테고리 탭 메뉴 */}
        <div className={styles.tabMenu}>
          <button
            className={`${styles.tabButton} ${selectedCategory === 'full' ? styles.activeTab : ''}`}
            onClick={() => setSelectedCategory('full')}
          >
            전체형
          </button>
          <button
            className={`${styles.tabButton} ${selectedCategory === 'upper-lower' ? styles.activeTab : ''}`}
            onClick={() => setSelectedCategory('upper-lower')}
          >
            상하부장
          </button>
        </div>
        
        {/* 싱글/듀얼 탭 메뉴 */}
        <div className={styles.tabMenu} style={{ marginTop: '10px' }}>
          <button
            className={`${styles.tabButton} ${selectedType === 'single' ? styles.activeTab : ''}`}
            onClick={() => setSelectedType('single')}
          >
            싱글 ({singleModules.length})
          </button>
          <button
            className={`${styles.tabButton} ${selectedType === 'dual' ? styles.activeTab : ''}`}
            onClick={() => setSelectedType('dual')}
          >
            듀얼 ({dualModules.length})
          </button>
        </div>
        
        {/* 모듈 설명 */}
        <div className={styles.tabDescription}>
          {selectedCategory === 'upper-lower' ? (
            <p>
              {selectedType === 'single' ? 
                `상하부장 - 1개 컬럼 (약 ${columnWidth}mm 폭)` : 
                `상하부장 - 2개 컬럼 (약 ${columnWidth * 2}mm 폭)`}
            </p>
          ) : (
            selectedType === 'single' ? (
              <p>전체형 - 1개 컬럼을 차지하는 가구 (약 {columnWidth}mm 폭)</p>
            ) : (
              <p>전체형 - 2개 컬럼을 차지하는 가구 (약 {columnWidth * 2}mm 폭)</p>
            )
          )}
        </div>
        
        {/* 모듈 그리드 */}
        <div className={styles.moduleGrid}>
          {currentModules.length > 0 ? (
            currentModules.map(module => {
              // 상하부장 카테고리인 경우 CabinetModuleItem 사용
              if (selectedCategory === 'upper-lower') {
                return (
                  <CabinetModuleItem 
                    key={module.id} 
                    module={module} 
                    internalSpace={internalSpace} 
                  />
                );
              }
              // 전체형 카테고리인 경우 ModuleItem 사용
              return (
                <ModuleItem 
                  key={module.id} 
                  module={module} 
                  internalSpace={internalSpace} 
                />
              );
            })
          ) : (
            <div className={styles.emptyMessage}>
              이 유형에 맞는 가구가 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModuleLibrary; 