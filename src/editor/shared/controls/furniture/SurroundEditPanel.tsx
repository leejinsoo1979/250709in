/**
 * 서라운드 편집 패널 — 가구편집팝업과 동일한 우측 패널 형태
 * activePopup.type === 'surroundEdit' 일 때 렌더
 * CNC 재단리스트에 반영되는 서라운드 패널 목록 표시
 */
import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSurroundPanels } from '@/editor/shared/utils/calculatePanelDetails';
import styles from './PlacedModulePropertiesPanel.module.css';

const SurroundEditPanel: React.FC = () => {
  const spaceInfo = useSpaceConfigStore((s) => s.spaceInfo);
  const setSpaceInfo = useSpaceConfigStore((s) => s.setSpaceInfo);
  const activePopup = useUIStore((s) => s.activePopup);
  const closeAllPopups = useUIStore((s) => s.closeAllPopups);

  // surroundEdit 타입이 아니면 렌더하지 않음
  if (activePopup.type !== 'surroundEdit' || !activePopup.id) return null;

  const surroundId = activePopup.id; // 'middle-0', 'middle-1', 'left', 'right' 등
  const fs = spaceInfo.freeSurround;
  if (!fs) return null;

  // 중간 서라운드인지 판별
  const isMiddle = surroundId.startsWith('middle-');
  const midIdx = isMiddle ? parseInt(surroundId.replace('middle-', ''), 10) : -1;
  const midArr = fs.middle;
  const midCfg = isMiddle && midArr ? midArr[midIdx] : null;

  if (isMiddle && !midCfg) return null;

  // 서라운드 높이 계산 (CNC와 동일)
  const spaceH = spaceInfo.height || 2400;
  const floorFinishH = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinishHeight || 15) : 0;
  const floatH = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
    ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
  const surroundH = spaceH - floorFinishH - floatH;

  // 천장/바닥 이격 반영 높이
  const topGap = midCfg?.topGap || 0;
  const bottomGap = midCfg?.bottomGap || 0;
  const actualH = surroundH - topGap - bottomGap;

  // CNC 재단리스트에 표시될 패널 목록 계산
  const allPanels = calculateSurroundPanels(fs, surroundH);
  // 현재 서라운드에 해당하는 패널만 필터
  const label = isMiddle
    ? (midArr && midArr.length > 1 ? `중간${midIdx + 1}` : '중간')
    : surroundId === 'left' ? '좌측' : '우측';
  const filteredPanels = allPanels.filter((p: any) => p.name.includes(label));

  const gapMM = midCfg?.gap || 0;
  const SIDE_DEPTH = 40;

  // 중간 서라운드 설정 변경 핸들러
  const updateMiddleCfg = (updates: Record<string, any>) => {
    if (!isMiddle || !midArr) return;
    const newMiddle = [...midArr];
    newMiddle[midIdx] = { ...midCfg!, ...updates };
    setSpaceInfo({ freeSurround: { ...fs, middle: newMiddle } });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {/* 헤더 */}
        <div className={styles.header}>
          <div className={styles.headerTabs}>
            <button className={`${styles.tabButton} ${styles.activeTab}`}>
              서라운드 편집
            </button>
            <button className={`${styles.tabButton}`} style={{ cursor: 'default' }}>
              패널 목록
            </button>
          </div>
          <button className={styles.closeButton} onClick={() => closeAllPopups()} aria-label="닫기" />
        </div>

        {/* 콘텐츠 */}
        <div className={styles.content}>
          {/* 서라운드 정보 */}
          <div className={styles.moduleInfo}>
            <div className={styles.moduleDetails}>
              <h4 className={styles.moduleName}>
                {isMiddle ? `중간 서라운드 ${midIdx + 1}` : `${label} 서라운드`}
              </h4>
              <div className={styles.property}>
                <span className={styles.propertyValue}>
                  L자형 | gap: {Math.round(gapMM)}mm | 높이: {actualH}mm
                </span>
              </div>
            </div>
          </div>

          {/* 설정 섹션 */}
          {isMiddle && midCfg && (
            <div className={styles.propertySection}>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>깊이 (앞뒤 옵셋)</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={midCfg.offset ?? 0}
                    onChange={(e) => updateMiddleCfg({ offset: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>천장 이격</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={midCfg.topGap ?? 0}
                    onChange={(e) => updateMiddleCfg({ topGap: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>바닥 이격</span>
                <div className={styles.inputWithUnit}>
                  <input
                    type="number"
                    value={midCfg.bottomGap ?? 0}
                    onChange={(e) => updateMiddleCfg({ bottomGap: parseInt(e.target.value) || 0 })}
                    style={{ width: 70, textAlign: 'right' }}
                  />
                  <span>mm</span>
                </div>
              </div>
            </div>
          )}

          {/* CNC 재단 패널 목록 */}
          <div className={styles.propertySection}>
            <div className={styles.panelSectionHeader}>CNC 재단 패널 ({filteredPanels.length}개)</div>
            <div className={styles.panelList}>
              {filteredPanels.map((panel: any, i: number) => (
                <div key={i} className={styles.panelItem}>
                  <span className={styles.panelName}>{panel.name}</span>
                  <span className={styles.panelDimensions}>
                    {panel.width} × {panel.height} × {panel.thickness}mm
                  </span>
                </div>
              ))}
              {filteredPanels.length === 0 && (
                <div style={{ color: 'var(--theme-text-secondary)', fontSize: '12px', padding: '8px 0' }}>
                  해당 서라운드에 패널이 없습니다
                </div>
              )}
            </div>
          </div>

          {/* 재질 정보 */}
          <div className={styles.propertySection}>
            <div className={styles.property}>
              <span className={styles.propertyLabel}>재질</span>
              <span className={styles.propertyValue}>PET (고정)</span>
            </div>
            <div className={styles.property}>
              <span className={styles.propertyLabel}>두께</span>
              <span className={styles.propertyValue}>18mm (고정)</span>
            </div>
            {isMiddle && (
              <>
                <div className={styles.property}>
                  <span className={styles.propertyLabel}>측면판 깊이</span>
                  <span className={styles.propertyValue}>{SIDE_DEPTH}mm</span>
                </div>
                <div className={styles.property}>
                  <span className={styles.propertyLabel}>전면판 폭</span>
                  <span className={styles.propertyValue}>{Math.max(0, gapMM - 3)}mm</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SurroundEditPanel;
