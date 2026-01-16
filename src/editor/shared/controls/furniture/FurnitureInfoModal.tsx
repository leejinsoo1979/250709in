import React, { useState, useEffect } from 'react';
import { Module, PlacedModule } from '@/types/module';
import { ModuleData } from '@/data/modules';
import { useTranslation } from '@/i18n/useTranslation';
import { calculatePanelDetails } from '@/editor/shared/utils/calculatePanelDetails';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import styles from './FurnitureInfoModal.module.css';


interface FurnitureInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleData: Module | null;
  placedModule: PlacedModule | null;
}

const FurnitureInfoModal: React.FC<FurnitureInfoModalProps> = ({
  isOpen,
  onClose,
  moduleData,
  placedModule
}) => {
  const { t } = useTranslation();
  const { updateModule } = useFurnitureStore();

  // 결 방향 상태 (기본값: horizontal)
  const [grainDirection, setGrainDirection] = useState<'horizontal' | 'vertical'>('horizontal');

  // placedModule이 변경될 때 grainDirection 업데이트
  useEffect(() => {
    if (placedModule?.grainDirection) {
      setGrainDirection(placedModule.grainDirection);
    } else {
      setGrainDirection('horizontal');
    }
  }, [placedModule?.id, placedModule?.grainDirection]);

  // 결 방향 토글 핸들러
  const handleToggleGrainDirection = () => {
    const newDirection = grainDirection === 'horizontal' ? 'vertical' : 'horizontal';
    setGrainDirection(newDirection);

    // 가구 정보 업데이트
    if (placedModule) {
      updateModule(placedModule.id, { grainDirection: newDirection });
    }
  };

  if (!isOpen || !moduleData || !placedModule) return null;

  // Remove local calculatePanelDetails - now using shared utility
  /* const calculatePanelDetails = (moduleData: ModuleData, customWidth: number, customDepth: number, hasDoor: boolean = false, t: any = (key: string) => key) => {
    const panels = {
      common: [],    // 공통 패널 (좌우측판, 뒷판)
      upper: [],     // 상부장 패널
      lower: [],     // 하부장 패널
      door: []       // 도어 패널
    };
    
    // 실제 3D 렌더링과 동일한 두께 값들
    const basicThickness = moduleData.modelConfig?.basicThickness || 18;
    const backPanelThickness = 9;
    const drawerHandleThickness = 18;
    const drawerSideThickness = 15;
    const drawerBottomThickness = 5;
    
    const height = moduleData.dimensions.height;
    const innerWidth = customWidth - (basicThickness * 2);
    const innerHeight = height - (basicThickness * 2);
    
    // 섹션 정보 가져오기
    let sections;
    if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
      sections = moduleData.modelConfig?.leftSections || [];
    } else {
      sections = moduleData.modelConfig?.sections || [];
    }
    
    const availableHeightMm = height;
    
    // 섹션별 패널 계산
    if (sections && sections.length > 0) {
      const actualAvailableHeight = height - (basicThickness * 2);
      
      const calculateSectionHeight = (section, availableHeightMm) => {
        const heightType = section.heightType || 'percentage';
        if (heightType === 'absolute') {
          return Math.min(section.height || 0, availableHeightMm);
        } else {
          return availableHeightMm * ((section.height || section.heightRatio || 100) / 100);
        }
      };
      
      const fixedSections = sections.filter(s => s.heightType === 'absolute');
      const totalFixedHeight = fixedSections.reduce((sum, section) => {
        return sum + calculateSectionHeight(section, actualAvailableHeight);
      }, 0);
      
      const dividerCount = sections.length > 1 ? (sections.length - 1) : 0;
      const dividerThickness = dividerCount * basicThickness;
      const remainingHeight = actualAvailableHeight - totalFixedHeight - dividerThickness;
      
      // 섹션 사이 구분판
      if (sections.length > 1 && moduleData.id.includes('2hanging')) {
        panels.common.push({
          name: '안전선반 (칸막이)',
          width: innerWidth,
          depth: customDepth - backPanelThickness - 17,
          thickness: basicThickness,
          material: 'PB'
        });
      } else if (sections.length > 1) {
        panels.common.push({
          name: '중간 칸막이',
          width: innerWidth,
          depth: customDepth - backPanelThickness - 17,
          thickness: basicThickness,
          material: 'PB'
        });
      }
      
      // 각 섹션별 내부 구조 처리
      sections.forEach((section, sectionIndex) => {
        let sectionName = '';
        let targetPanel = null;
        
        // 2단 옷장: 첫 번째 섹션이 하부장, 두 번째가 상부장
        if (moduleData.id.includes('2hanging')) {
          if (sectionIndex === 0) {
            sectionName = '하부장';
            targetPanel = panels.lower;
          } else {
            sectionName = '상부장';
            targetPanel = panels.upper;
          }
        }
        // 듀얼 타입5,6
        else if (moduleData.id.includes('dual-4drawer-pantshanger') || moduleData.id.includes('dual-2drawer-styler')) {
          if (section.type === 'drawer') {
            sectionName = '하부장';
            targetPanel = panels.lower;
          } else {
            sectionName = '상부장';
            targetPanel = panels.upper;
          }
        }
        // 일반 서랍장
        else if (section.type === 'drawer') {
          targetPanel = panels.lower;
          sectionName = '';
        }
        // 기타
        else {
          targetPanel = panels.upper;
          sectionName = '';
        }
        
        const variableSections = sections.filter(s => s.heightType !== 'absolute');
        const totalPercentage = variableSections.reduce((sum, s) => sum + (s.height || s.heightRatio || 100), 0);
        
        let sectionHeightMm;
        if (section.heightType === 'absolute') {
          sectionHeightMm = calculateSectionHeight(section, actualAvailableHeight);
        } else {
          const percentage = (section.height || section.heightRatio || 100) / totalPercentage;
          sectionHeightMm = remainingHeight * percentage;
        }
        
        // 서랍 섹션 처리
        if (section.type === 'drawer' && section.count) {
          const drawerHeights = section.drawerHeights;
          
          for (let i = 0; i < section.count; i++) {
            const drawerNum = i + 1;
            
            let individualDrawerHeight;
            if (drawerHeights && drawerHeights[i]) {
              individualDrawerHeight = drawerHeights[i];
            } else {
              individualDrawerHeight = Math.floor((sectionHeightMm - basicThickness * (section.count - 1)) / section.count);
            }
            
            // 서랍 손잡이판
            targetPanel.push({
              name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.handlePlate')}`,
              width: customWidth,
              height: individualDrawerHeight,
              thickness: drawerHandleThickness,
              material: 'PET'
            });
            
            // 서랍 본체 크기 계산 (DrawerRenderer 참조)
            // drawerWidth = innerWidth - 24mm (좌우 12mm 간격)
            // 앞판/뒷판: drawerWidth - 106mm (좌우 측판 안쪽에 끼워짐)
            // 좌측판/우측판: 전체 깊이 사용 (앞뒤 15mm씩 확장)
            const drawerWidth = customWidth - 24;
            const drawerFrontBackWidth = drawerWidth - 106;
            const drawerBodyHeight = individualDrawerHeight - 30;
            const drawerBodyDepth = customDepth - 47 - drawerHandleThickness;

            // 서랍 앞판
            targetPanel.push({
              name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.frontPanel')}`,
              width: drawerFrontBackWidth,
              height: drawerBodyHeight,
              thickness: basicThickness,
              material: 'PB'
            });

            // 서랍 뒷판
            targetPanel.push({
              name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.backPanel')}`,
              width: drawerFrontBackWidth,
              height: drawerBodyHeight,
              thickness: basicThickness,
              material: 'PB'
            });

            // 서랍 좌측판 (전체 깊이 사용)
            targetPanel.push({
              name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.leftPanel')}`,
              depth: drawerBodyDepth,
              height: drawerBodyHeight,
              thickness: basicThickness,
              material: 'PB'
            });

            // 서랍 우측판 (전체 깊이 사용)
            targetPanel.push({
              name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.rightPanel')}`,
              depth: drawerBodyDepth,
              height: drawerBodyHeight,
              thickness: basicThickness,
              material: 'PB'
            });
            
            // 서랍 바닥판
            // DrawerRenderer: drawerWidth - 70 - 26 = drawerWidth - 96
            targetPanel.push({
              name: `${sectionName} ${t('furniture.drawer')}${drawerNum} ${t('furniture.bottomPanel')}`,
              width: drawerWidth - 96,
              depth: drawerBodyDepth - 20,
              thickness: drawerBottomThickness,
              material: 'MDF'
            });
          }
          
          // 서랍 칸막이
          for (let i = 1; i < section.count; i++) {
            targetPanel.push({
              name: `${sectionName} ${t('furniture.drawerDivider')} ${i}`,
              width: innerWidth,
              depth: customDepth - backPanelThickness - 17,
              thickness: basicThickness,
              material: 'PB'
            });
          }
        } else if (section.type === 'hanging') {
          // 옷장 섹션
          if (section.shelfPositions && section.shelfPositions.length > 0) {
            section.shelfPositions.forEach((pos, i) => {
              targetPanel.push({
                name: `${sectionName} 선반 ${i + 1}`,
                width: innerWidth,
                depth: customDepth - 8,
                thickness: basicThickness,
                material: 'PB'
              });
            });
          } else {
            const hangingInternalHeight = Math.round(sectionHeightMm);
            targetPanel.push({
              name: `${sectionName} 옷걸이 공간`,
              description: '내부 높이',
              height: hangingInternalHeight,
              isInfo: true
            });
          }
        } else if (section.type === 'shelf' && section.count) {
          // 선반 구역
          for (let i = 1; i <= section.count; i++) {
            targetPanel.push({
              name: `${sectionName} 선반 ${i}`,
              width: innerWidth,
              depth: customDepth - 8,
              thickness: basicThickness,
              material: 'PB'
            });
          }
        } else if (section.type === 'open') {
          // 오픈 섹션
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
    
    // 도어 패널
    if (hasDoor) {
      const doorGap = 2;
      
      if (moduleData.id.includes('dual')) {
        const doorWidth = Math.floor((customWidth - doorGap * 3) / 2);
        panels.door.push({
          name: '좌측 도어',
          width: doorWidth,
          height: height - doorGap * 2,
          thickness: basicThickness,
          material: 'PET'
        });
        panels.door.push({
          name: '우측 도어',
          width: doorWidth,
          height: height - doorGap * 2,
          thickness: basicThickness,
          material: 'PET'
        });
      } else {
        panels.door.push({
          name: '도어',
          width: customWidth - doorGap * 2,
          height: height - doorGap * 2,
          thickness: basicThickness,
          material: 'PET'
        });
      }
    }
    
    // 플랫 배열로 변환하여 반환
    const result = [];
    
    // 상부장 패널
    if (panels.upper.length > 0) {
      result.push({ name: `=== ${t('furniture.upperSection')} ===` });
      result.push(...panels.upper);
    }
    
    // 공통 패널
    if (panels.common.length > 0) {
      result.push(...panels.common);
    }
    
    // 하부장 패널
    if (panels.lower.length > 0) {
      result.push({ name: `=== ${t('furniture.lowerSection')} ===` });
      result.push(...panels.lower);
    }
    
    // 도어 패널
    if (panels.door.length > 0 && hasDoor) {
      result.push({ name: `=== ${t('furniture.door')} ===` });
      result.push(...panels.door);
    }
    
    return result;
  }; */

  const customWidth = placedModule.customWidth || moduleData.dimensions.width;
  const customDepth = placedModule.customDepth || moduleData.dimensions.depth;
  const hasDoor = placedModule.doorConfig?.enabled || false;
  
  const panels = calculatePanelDetails(moduleData as ModuleData, customWidth, customDepth, hasDoor, t);
  const totalPanels = panels.filter(p => !p.name?.startsWith('===')).length;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <h2 className={styles.title}>가구 상세 정보</h2>
            <button
              onClick={handleToggleGrainDirection}
              title="나무결 방향 전환"
              style={{
                padding: '10px 20px',
                background: '#FF0000',
                color: 'white',
                border: '3px solid #000',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                minWidth: '150px'
              }}
            >
              나무결: {grainDirection === 'horizontal' ? '가로 →' : '세로 ↓'}
            </button>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>기본 정보</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.label}>가구명:</span>
                <span className={styles.value}>
                  {placedModule.customWidth && placedModule.customWidth !== moduleData.dimensions.width
                    ? moduleData.name.replace(/\d+mm/, `${placedModule.customWidth}mm`)
                    : moduleData.name}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>타입:</span>
                <span className={styles.value}>{moduleData.category}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>크기:</span>
                <span className={styles.value}>
                  {placedModule.customWidth || moduleData.dimensions.width} × 
                  {moduleData.dimensions.height} × 
                  {placedModule.customDepth || moduleData.dimensions.depth}mm
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>슬롯 위치:</span>
                <span className={styles.value}>슬롯 {placedModule.slotIndex + 1}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>나무결 방향:</span>
                <button
                  className={styles.grainButton}
                  onClick={handleToggleGrainDirection}
                  title="나무결 방향 전환"
                >
                  {grainDirection === 'horizontal' ? '가로 (→)' : '세로 (↓)'}
                </button>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('furniture.panelDetails')} (총 {totalPanels}개)</h3>
            <div className={styles.panelTable}>
              <div className={styles.tableHeader}>
                <div className={styles.headerCell}>패널</div>
                <div className={styles.headerCell}>크기</div>
                <div className={styles.headerCell}>재질</div>
              </div>
              <div className={styles.tableBody}>
                {panels.map((panel, index) => {
                  // 섹션 구분자인 경우
                  if (panel.name && panel.name.startsWith('===')) {
                    return (
                      <div key={index} className={styles.sectionHeader}>
                        <strong>{panel.name.replace(/=/g, '').trim()}</strong>
                      </div>
                    );
                  }
                  
                  // 정보성 항목인 경우 (오픈 공간 등)
                  if (panel.isInfo) {
                    return (
                      <div key={index} className={styles.tableRow}>
                        <div className={styles.cell}>{panel.name}</div>
                        <div className={styles.cell}>
                          {panel.description && panel.height ? `${panel.description} ${panel.height}mm` : panel.description || ''}
                        </div>
                        <div className={styles.cell}>-</div>
                      </div>
                    );
                  }
                  
                  // 일반 패널
                  return (
                    <div key={index} className={styles.tableRow}>
                      <div className={styles.cell}>{panel.name}</div>
                      <div className={styles.cell}>
                        {panel.diameter ? (
                          `Φ${panel.diameter}mm × L${panel.width}mm`
                        ) : panel.width && panel.height ? (
                          `${panel.width} × ${panel.height}mm`
                        ) : panel.width && panel.depth ? (
                          `${panel.width} × ${panel.depth}mm`
                        ) : panel.height && panel.depth ? (
                          `${panel.height} × ${panel.depth}mm`
                        ) : panel.description ? (
                          panel.description
                        ) : (
                          `${panel.width || panel.height || panel.depth}mm`
                        )}
                        {panel.thickness && panel.showThickness !== false && !panel.diameter && ` (T:${panel.thickness})`}
                      </div>
                      <div className={styles.cell}>{panel.material || '-'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FurnitureInfoModal;
