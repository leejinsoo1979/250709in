import React, { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { CustomFurnitureConfig, CustomSection, CustomElement } from '@/editor/shared/furniture/types';
import styles from './CustomizablePropertiesPanel.module.css';

/**
 * 커스터마이징 가구 편집 패널
 * activePopup.type === 'customizableEdit' 일 때 렌더링
 */
const CustomizablePropertiesPanel: React.FC = () => {
  const { activePopup, closeAllPopups } = useUIStore();
  const { placedModules, updatePlacedModule, removeModule } = useFurnitureStore();

  const moduleId = activePopup.id;
  const placedModule = placedModules.find((m) => m.id === moduleId);

  // 편집용 로컬 상태 (customConfig 복사본)
  const [config, setConfig] = useState<CustomFurnitureConfig | null>(null);

  // 너비/깊이 입력용 문자열 상태 (기존 가구 패턴과 동일)
  const [widthInput, setWidthInput] = useState<string>('');
  const [depthInput, setDepthInput] = useState<string>('');
  const [widthError, setWidthError] = useState<string>('');
  const [depthError, setDepthError] = useState<string>('');

  // 팝업 열릴 때 config 및 입력값 초기화
  useEffect(() => {
    if (placedModule?.customConfig) {
      setConfig(JSON.parse(JSON.stringify(placedModule.customConfig)));
    }
    if (placedModule) {
      const w = placedModule.freeWidth || placedModule.moduleWidth || 600;
      const d = placedModule.freeDepth || 580;
      setWidthInput(w.toString());
      setDepthInput(d.toString());
      setWidthError('');
      setDepthError('');
    }
  }, [placedModule?.id]);

  // config 업데이트 + 즉시 store 반영 (useCallback은 조건부 return 전에 호출해야 함)
  const applyConfig = useCallback(
    (newConfig: CustomFurnitureConfig) => {
      setConfig(newConfig);
      if (moduleId) {
        updatePlacedModule(moduleId, { customConfig: newConfig });
      }
    },
    [moduleId, updatePlacedModule],
  );

  // 렌더링 조건 체크 (모든 hooks 호출 이후)
  if (activePopup.type !== 'customizableEdit' || !moduleId || !placedModule || !config) {
    return null;
  }

  const furnitureWidth = placedModule.freeWidth || placedModule.moduleWidth || 600;
  const furnitureHeight = placedModule.freeHeight || 2000;
  const furnitureDepth = placedModule.freeDepth || 580;
  const panelThickness = config.panelThickness || 18;

  // 내부 유효 높이 (상하판 두께 제외)
  const innerHeight = furnitureHeight - 2 * panelThickness;

  // 너비/깊이 범위 (기존 가구와 동일 패턴)
  const MIN_WIDTH = 150;
  const MAX_WIDTH = 2400;
  const MIN_DEPTH = 200;
  const MAX_DEPTH = 800;

  // 너비 입력 핸들러 (숫자와 빈 문자열만 허용)
  const handleWidthInputChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setWidthInput(value);
      setWidthError('');
    }
  };

  // 너비 확정 (onBlur / Enter)
  const handleWidthInputBlur = () => {
    if (widthInput === '') {
      setWidthInput(furnitureWidth.toString());
      return;
    }
    const num = parseInt(widthInput, 10);
    if (num < MIN_WIDTH) {
      setWidthError(`최소 ${MIN_WIDTH}mm`);
      setWidthInput(furnitureWidth.toString());
    } else if (num > MAX_WIDTH) {
      setWidthError(`최대 ${MAX_WIDTH}mm`);
      setWidthInput(furnitureWidth.toString());
    } else {
      setWidthError('');
      updatePlacedModule(moduleId, { freeWidth: num, moduleWidth: num });
    }
  };

  // 깊이 입력 핸들러
  const handleDepthInputChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setDepthInput(value);
      setDepthError('');
    }
  };

  // 깊이 확정 (onBlur / Enter)
  const handleDepthInputBlur = () => {
    if (depthInput === '') {
      setDepthInput(furnitureDepth.toString());
      return;
    }
    const num = parseInt(depthInput, 10);
    if (num < MIN_DEPTH) {
      setDepthError(`최소 ${MIN_DEPTH}mm`);
      setDepthInput(furnitureDepth.toString());
    } else if (num > MAX_DEPTH) {
      setDepthError(`최대 ${MAX_DEPTH}mm`);
      setDepthInput(furnitureDepth.toString());
    } else {
      setDepthError('');
      updatePlacedModule(moduleId, { freeDepth: num });
    }
  };

  // Enter 키 핸들러
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  // 섹션 분할 토글
  const handleSectionSplit = (split: boolean) => {
    if (split && config.sections.length === 1) {
      // 분할판 두께를 빼고 남은 공간을 2등분
      const availableHeight = innerHeight - panelThickness;
      const halfH = Math.round(availableHeight / 2);
      applyConfig({
        ...config,
        sections: [
          { ...config.sections[0], id: 'section-0', height: halfH },
          { id: 'section-1', height: availableHeight - halfH, elements: [{ type: 'open' }] },
        ],
      });
    } else if (!split && config.sections.length > 1) {
      applyConfig({
        ...config,
        sections: [{ id: 'section-0', height: innerHeight, elements: config.sections[0].elements || [{ type: 'open' }] }],
      });
    }
  };

  // 섹션 높이 변경
  const handleSectionHeightChange = (idx: number, newHeight: number) => {
    if (config.sections.length !== 2) return;
    // 분할판 두께를 빼고 남은 공간 내에서 높이 조정
    const availableHeight = innerHeight - panelThickness;
    const clamped = Math.max(100, Math.min(availableHeight - 100, newHeight));
    const sections = [...config.sections];
    sections[idx] = { ...sections[idx], height: clamped };
    sections[1 - idx] = { ...sections[1 - idx], height: availableHeight - clamped };
    applyConfig({ ...config, sections });
  };

  // 칸막이 토글
  const handlePartitionToggle = (sIdx: number, hasPartition: boolean) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    if (hasPartition) {
      const innerW = furnitureWidth - 2 * panelThickness;
      sec.hasPartition = true;
      sec.partitionPosition = Math.round(innerW / 2);
      sec.leftElements = sec.elements || [{ type: 'open' }];
      sec.rightElements = [{ type: 'open' }];
      sec.elements = undefined;
    } else {
      sec.hasPartition = false;
      sec.partitionPosition = undefined;
      sec.elements = sec.leftElements || [{ type: 'open' }];
      sec.leftElements = undefined;
      sec.rightElements = undefined;
    }
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 칸막이 위치 변경
  const handlePartitionPosition = (sIdx: number, pos: number) => {
    const sections = [...config.sections];
    sections[sIdx] = { ...sections[sIdx], partitionPosition: pos };
    applyConfig({ ...config, sections });
  };

  // 요소 타입 변경
  const handleElementChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    elementType: CustomElement['type'],
  ) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const sectionHeight = sec.height;

    let newElement: CustomElement;
    switch (elementType) {
      case 'shelf':
        newElement = { type: 'shelf', heights: [Math.round(sectionHeight / 2)] };
        break;
      case 'drawer':
        newElement = { type: 'drawer', heights: [Math.round(sectionHeight / 3)] };
        break;
      case 'rod':
        newElement = { type: 'rod', height: Math.round(sectionHeight * 0.85) };
        break;
      default:
        newElement = { type: 'open' };
    }

    if (side === 'full') {
      sec.elements = [newElement];
    } else if (side === 'left') {
      sec.leftElements = [newElement];
    } else {
      sec.rightElements = [newElement];
    }
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 선반/서랍 높이 변경
  const handleHeightListChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    heightIdx: number,
    value: number,
  ) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    const el = elements[0];
    if (el && (el.type === 'shelf' || el.type === 'drawer')) {
      const heights = [...el.heights];
      heights[heightIdx] = Math.max(50, value);
      elements[0] = { ...el, heights };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 선반/서랍 추가
  const handleAddHeight = (sIdx: number, side: 'full' | 'left' | 'right') => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    const el = elements[0];
    if (el && (el.type === 'shelf' || el.type === 'drawer')) {
      const lastH = el.heights[el.heights.length - 1] || Math.round(sec.height / 3);
      elements[0] = { ...el, heights: [...el.heights, lastH + 200] };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 선반/서랍 제거
  const handleRemoveHeight = (sIdx: number, side: 'full' | 'left' | 'right', heightIdx: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    const el = elements[0];
    if (el && (el.type === 'shelf' || el.type === 'drawer') && el.heights.length > 1) {
      const heights = el.heights.filter((_, i) => i !== heightIdx);
      elements[0] = { ...el, heights };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 옷봉 높이 변경
  const handleRodHeightChange = (sIdx: number, side: 'full' | 'left' | 'right', value: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    if (elements[0]?.type === 'rod') {
      elements[0] = { type: 'rod', height: Math.max(100, value) };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 가구 삭제
  const handleDelete = () => {
    removeModule(moduleId);
    closeAllPopups();
  };

  // 요소 편집 UI 렌더링
  const renderElementEditor = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    elements: CustomElement[] | undefined,
    sectionHeight: number,
  ) => {
    const el = elements?.[0] || { type: 'open' as const };
    const currentType = el.type;

    return (
      <div>
        <div className={styles.elementSelector}>
          {(['open', 'shelf', 'drawer', 'rod'] as const).map((type) => (
            <button
              key={type}
              className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
              onClick={() => handleElementChange(sIdx, side, type)}
            >
              {type === 'open' ? '비움' : type === 'shelf' ? '선반' : type === 'drawer' ? '서랍' : '옷봉'}
            </button>
          ))}
        </div>

        {/* 선반/서랍 높이 목록 */}
        {(currentType === 'shelf' || currentType === 'drawer') && 'heights' in el && (
          <div>
            <div className={styles.heightList}>
              {el.heights.map((h, hi) => (
                <div key={hi} className={styles.heightItem}>
                  <span className={styles.heightIndex}>{hi + 1}</span>
                  <input
                    type="number"
                    className={`${styles.input} ${styles.inputSmall}`}
                    value={h}
                    onChange={(e) => handleHeightListChange(sIdx, side, hi, parseInt(e.target.value) || 0)}
                    min={50}
                    max={sectionHeight}
                  />
                  <span className={styles.unit}>mm</span>
                  {el.heights.length > 1 && (
                    <button className={styles.removeButton} onClick={() => handleRemoveHeight(sIdx, side, hi)}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className={styles.addButton} onClick={() => handleAddHeight(sIdx, side)}>
              + {currentType === 'shelf' ? '선반' : '서랍'} 추가
            </button>
          </div>
        )}

        {/* 옷봉 높이 */}
        {currentType === 'rod' && el.type === 'rod' && (
          <div className={styles.row}>
            <span className={styles.label}>높이</span>
            <input
              type="number"
              className={`${styles.input} ${styles.inputSmall}`}
              value={el.height}
              onChange={(e) => handleRodHeightChange(sIdx, side, parseInt(e.target.value) || 0)}
              min={100}
              max={sectionHeight}
            />
            <span className={styles.unit}>mm</span>
          </div>
        )}
      </div>
    );
  };

  // 섹션 편집 UI 렌더링
  const renderSectionEditor = (section: CustomSection, sIdx: number) => {
    const innerW = furnitureWidth - 2 * panelThickness;
    const hasPartition = section.hasPartition || false;

    return (
      <div key={sIdx} className={styles.section}>
        <div className={styles.sectionTitle}>
          {config.sections.length > 1 ? (sIdx === 0 ? '하부 섹션' : '상부 섹션') : '내부 구조'}
        </div>

        {/* 섹션 높이 (2단 분할 시) */}
        {config.sections.length > 1 && (
          <div className={styles.row}>
            <span className={styles.label}>높이</span>
            <input
              type="number"
              className={`${styles.input} ${styles.inputSmall}`}
              value={section.height}
              onChange={(e) => handleSectionHeightChange(sIdx, parseInt(e.target.value) || 0)}
              min={100}
            />
            <span className={styles.unit}>mm</span>
          </div>
        )}

        {/* 칸막이 토글 */}
        <div className={styles.row}>
          <span className={styles.label}>칸막이</span>
          <div className={styles.toggleGroup}>
            <button
              className={`${styles.toggleButton} ${!hasPartition ? styles.active : ''}`}
              onClick={() => handlePartitionToggle(sIdx, false)}
            >
              없음
            </button>
            <button
              className={`${styles.toggleButton} ${hasPartition ? styles.active : ''}`}
              onClick={() => handlePartitionToggle(sIdx, true)}
            >
              추가
            </button>
          </div>
        </div>

        {/* 칸막이 위치 */}
        {hasPartition && (
          <div className={styles.sliderRow}>
            <span className={styles.label}>위치</span>
            <input
              type="range"
              className={styles.slider}
              min={panelThickness + 100}
              max={innerW - 100}
              value={section.partitionPosition || Math.round(innerW / 2)}
              onChange={(e) => handlePartitionPosition(sIdx, parseInt(e.target.value))}
            />
            <span className={styles.sliderValue}>{section.partitionPosition || Math.round(innerW / 2)}mm</span>
          </div>
        )}

        {/* 내부 요소 편집 */}
        {hasPartition ? (
          <>
            <div className={styles.areaCard}>
              <div className={styles.areaTitle}>좌측 영역</div>
              {renderElementEditor(sIdx, 'left', section.leftElements, section.height)}
            </div>
            <div className={styles.areaCard}>
              <div className={styles.areaTitle}>우측 영역</div>
              {renderElementEditor(sIdx, 'right', section.rightElements, section.height)}
            </div>
          </>
        ) : (
          <div className={styles.areaCard}>
            <div className={styles.areaTitle}>전체 영역</div>
            {renderElementEditor(sIdx, 'full', section.elements, section.height)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {/* 헤더 */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>커스터마이징 가구 편집</span>
          <button className={styles.closeButton} onClick={closeAllPopups}>
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className={styles.body}>
          {/* 기본 치수 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>치수</div>
            <div className={styles.row}>
              <span className={styles.label}>너비</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${widthError ? styles.inputError : ''}`}
                value={widthInput}
                placeholder={`${MIN_WIDTH}-${MAX_WIDTH}`}
                onChange={(e) => handleWidthInputChange(e.target.value)}
                onBlur={handleWidthInputBlur}
                onKeyDown={handleInputKeyDown}
              />
              <span className={styles.unit}>mm</span>
            </div>
            {widthError && <div className={styles.errorMessage}>{widthError}</div>}
            <div className={styles.row}>
              <span className={styles.label}>높이</span>
              <span className={styles.input} style={{ cursor: 'default', opacity: 0.7 }}>
                {furnitureHeight}
              </span>
              <span className={styles.unit}>mm</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>깊이</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${depthError ? styles.inputError : ''}`}
                value={depthInput}
                placeholder={`${MIN_DEPTH}-${MAX_DEPTH}`}
                onChange={(e) => handleDepthInputChange(e.target.value)}
                onBlur={handleDepthInputBlur}
                onKeyDown={handleInputKeyDown}
              />
              <span className={styles.unit}>mm</span>
            </div>
            {depthError && <div className={styles.errorMessage}>{depthError}</div>}
          </div>

          <div className={styles.divider} />

          {/* 섹션 분할 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>섹션 분할</div>
            <div className={styles.row}>
              <div className={styles.toggleGroup}>
                <button
                  className={`${styles.toggleButton} ${config.sections.length === 1 ? styles.active : ''}`}
                  onClick={() => handleSectionSplit(false)}
                >
                  분할 없음
                </button>
                <button
                  className={`${styles.toggleButton} ${config.sections.length === 2 ? styles.active : ''}`}
                  onClick={() => handleSectionSplit(true)}
                >
                  2단 분할
                </button>
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          {/* 섹션별 편집 (상부→하부 순서로 표시, 3D 렌더링은 index 0=하부, 1=상부) */}
          {config.sections.length > 1
            ? [...config.sections].reverse().map((section, _i) => {
                const realIdx = config.sections.length - 1 - _i;
                return renderSectionEditor(section, realIdx);
              })
            : config.sections.map((section, sIdx) => renderSectionEditor(section, sIdx))
          }
        </div>

        {/* 하단 버튼 */}
        <div className={styles.footer}>
          <button className={`${styles.footerButton} ${styles.secondaryButton}`} onClick={handleDelete}>
            취소
          </button>
          <button className={`${styles.footerButton} ${styles.primaryButton}`} onClick={closeAllPopups}>
            생성
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomizablePropertiesPanel;
