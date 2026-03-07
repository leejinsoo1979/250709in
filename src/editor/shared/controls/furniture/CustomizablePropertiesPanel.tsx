import React, { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { CustomFurnitureConfig, CustomSection, CustomElement } from '@/editor/shared/furniture/types';
import { getCustomizableCategory } from './CustomizableFurnitureLibrary';
import styles from './CustomizablePropertiesPanel.module.css';

/**
 * 커스터마이징 가구 편집 패널
 * activePopup.type === 'customizableEdit' 일 때 렌더링
 */
const CustomizablePropertiesPanel: React.FC = () => {
  const { activePopup, closeAllPopups } = useUIStore();
  const { placedModules, updatePlacedModule, removeModule } = useFurnitureStore();
  const { saveCabinet } = useMyCabinetStore();

  const moduleId = activePopup.id;
  const placedModule = placedModules.find((m) => m.id === moduleId);
  // sectionIndex가 있으면 톱니 아이콘 클릭 → 해당 섹션 세부설정만 표시
  const focusedSectionIndex = activePopup.sectionIndex;

  // 편집용 로컬 상태 (customConfig 복사본)
  const [config, setConfig] = useState<CustomFurnitureConfig | null>(null);

  // 너비/깊이 입력용 문자열 상태 (기존 가구 패턴과 동일)
  const [widthInput, setWidthInput] = useState<string>('');
  const [depthInput, setDepthInput] = useState<string>('');
  const [widthError, setWidthError] = useState<string>('');
  const [depthError, setDepthError] = useState<string>('');
  // 섹션 높이 입력용 문자열 상태 (직접 바인딩 시 입력 불가 문제 방지)
  const [sectionHeightInputs, setSectionHeightInputs] = useState<Record<number, string>>({});
  // 선반/서랍 높이 입력용 문자열 상태 (숫자 입력 시 전체 삭제 가능하도록)
  const [heightInputs, setHeightInputs] = useState<Record<string, string>>({});
  // 선반 위치 기준 (위에서/아래에서) - 키: "sIdx-side-hIdx"
  const [shelfRefDir, setShelfRefDir] = useState<Record<string, 'top' | 'bottom'>>({});

  // 팝업 열릴 때 config 및 입력값 초기화
  useEffect(() => {
    if (placedModule?.customConfig) {
      const cfg = JSON.parse(JSON.stringify(placedModule.customConfig)) as CustomFurnitureConfig;
      setConfig(cfg);
      // 섹션 높이 입력 초기화
      const sectionHInputs: Record<number, string> = {};
      cfg.sections.forEach((s, i) => { sectionHInputs[i] = s.height.toString(); });
      setSectionHeightInputs(sectionHInputs);
      // 선반/서랍 높이 입력 초기화
      const hInputs: Record<string, string> = {};
      cfg.sections.forEach((s, sIdx) => {
        const initElements = (elements: CustomElement[] | undefined, prefix: string) => {
          elements?.forEach((el, eIdx) => {
            if ((el.type === 'shelf' || el.type === 'drawer') && 'heights' in el) {
              el.heights.forEach((h, hIdx) => {
                hInputs[`${prefix}-${eIdx}-${hIdx}`] = h.toString();
              });
            }
          });
        };
        initElements(s.elements, `${sIdx}-full`);
        initElements(s.leftElements, `${sIdx}-left`);
        initElements(s.rightElements, `${sIdx}-right`);
      });
      setHeightInputs(hInputs);
      setShelfRefDir({});
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
  // 2단 분할 시 각 섹션은 독립 박스(상하판 각 panelThickness)로 렌더링됨
  // 총 높이 = (section0.height + 2*pt) + (section1.height + 2*pt) = furnitureHeight
  // → section0.height + section1.height = furnitureHeight - 4*pt
  const handleSectionSplit = (split: boolean) => {
    if (split && config.sections.length === 1) {
      const availableHeight = furnitureHeight - 4 * panelThickness;
      const halfH = Math.round(availableHeight / 2);
      const sec1H = availableHeight - halfH;
      applyConfig({
        ...config,
        sections: [
          { ...config.sections[0], id: 'section-0', height: halfH },
          { id: 'section-1', height: sec1H, elements: [{ type: 'open' }] },
        ],
      });
      setSectionHeightInputs({ 0: halfH.toString(), 1: sec1H.toString() });
    } else if (!split && config.sections.length > 1) {
      applyConfig({
        ...config,
        sections: [{ id: 'section-0', height: innerHeight, elements: config.sections[0].elements || [{ type: 'open' }] }],
      });
      setSectionHeightInputs({ 0: innerHeight.toString() });
    }
  };

  // 섹션 높이 입력 변경 (문자열 state만 업데이트, 확정은 blur에서)
  const handleSectionHeightInputChange = (idx: number, value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setSectionHeightInputs((prev) => ({ ...prev, [idx]: value }));
    }
  };

  // 섹션 높이 확정 (onBlur / Enter)
  const handleSectionHeightBlur = (idx: number) => {
    if (config.sections.length !== 2) return;
    const availableHeight = furnitureHeight - 4 * panelThickness;
    const raw = sectionHeightInputs[idx] ?? '';
    if (raw === '') {
      // 빈 값이면 원래 값으로 복원
      setSectionHeightInputs((prev) => ({ ...prev, [idx]: config.sections[idx].height.toString() }));
      return;
    }
    const num = parseInt(raw, 10);
    const clamped = Math.max(100, Math.min(availableHeight - 100, num));
    const otherH = availableHeight - clamped;
    const sections = [...config.sections];
    sections[idx] = { ...sections[idx], height: clamped };
    sections[1 - idx] = { ...sections[1 - idx], height: otherH };
    applyConfig({ ...config, sections });
    setSectionHeightInputs({ [idx]: clamped.toString(), [1 - idx]: otherH.toString() });
  };

  // 서랍 단수별 표준 높이 (mm) - 서랍 1개당 약 200mm
  const DRAWER_HEIGHT_PER_UNIT = 200;

  // 섹션 타입 변경 (연필 메뉴용) — 서랍 선택 시 단수도 함께 처리
  const handleSectionTypeChange = (sIdx: number, elementType: CustomElement['type'], drawerCount?: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };

    let newElement: CustomElement;
    switch (elementType) {
      case 'shelf':
        newElement = { type: 'shelf', heights: [Math.round(sec.height / 2)] };
        break;
      case 'drawer': {
        const count = drawerCount || 2;
        // 서랍 단수에 따라 하부 섹션 높이 자동 조절 (2단 분할 시)
        if (config.sections.length === 2 && sIdx === 0) {
          const availableHeight = furnitureHeight - 4 * panelThickness;
          const lowerH = Math.min(count * DRAWER_HEIGHT_PER_UNIT, availableHeight - 100);
          const upperH = availableHeight - lowerH;
          sec.height = lowerH;
          sections[1] = { ...sections[1], height: upperH };
          setSectionHeightInputs({ 0: lowerH.toString(), 1: upperH.toString() });
        }
        // 균등 분배 서랍 개별 높이 배열 (DrawerRenderer는 각 값을 개별 서랍 높이로 사용)
        // gap 공간(상하 + 서랍 사이)을 제외한 유효 높이로 계산
        const gapPerDrawer = 23.6; // DrawerRenderer의 gapHeight와 동일
        const totalGap = gapPerDrawer * (count + 1); // 상단 + 서랍 사이 + 하단
        const usableHeight = Math.max(sec.height - totalGap, count * 80);
        const perDrawer = Math.round(usableHeight / count);
        const heights = Array.from({ length: count }, () => perDrawer);
        newElement = { type: 'drawer', heights };
        break;
      }
      case 'rod':
        newElement = { type: 'rod', height: Math.round(sec.height * 0.85) };
        break;
      case 'pants':
        newElement = { type: 'pants', height: Math.round(sec.height * 0.85) };
        break;
      default:
        newElement = { type: 'open' };
    }

    sec.elements = [newElement];
    sec.hasPartition = false;
    sec.partitionPosition = undefined;
    sec.leftElements = undefined;
    sec.rightElements = undefined;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
    // heightInputs 동기화
    if ('heights' in newElement) {
      const newHInputs: Record<string, string> = {};
      newElement.heights.forEach((h, hIdx) => {
        newHInputs[`${sIdx}-full-0-${hIdx}`] = h.toString();
      });
      setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
    }
  };

  // 현재 섹션의 주요 타입과 서랍 단수 추출
  const getSectionTypeInfo = (section: CustomSection) => {
    const el = section.elements?.[0] || section.leftElements?.[0] || { type: 'open' as const };
    const type = el.type;
    const drawerCount = type === 'drawer' && 'heights' in el ? el.heights.length : 0;
    return { type, drawerCount };
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
      case 'drawer': {
        const gapTotal = 23.6 * 2; // 1단 서랍 기본: 상하 gap
        const usable = Math.max(sectionHeight - gapTotal, 80);
        newElement = { type: 'drawer', heights: [Math.round(usable)] };
        break;
      }
      case 'rod':
        newElement = { type: 'rod', height: Math.round(sectionHeight * 0.85) };
        break;
      case 'pants':
        newElement = { type: 'pants', height: Math.round(sectionHeight * 0.85) };
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
    // heightInputs 동기화
    if ('heights' in newElement) {
      const newHInputs: Record<string, string> = {};
      newElement.heights.forEach((h, hIdx) => {
        newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
      });
      setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
    }
  };

  // 선반/서랍 높이 입력 변경 (문자열 상태만 업데이트, 확정은 blur에서)
  const handleHeightInputChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    heightIdx: number,
    value: string,
  ) => {
    if (value === '' || /^\d+$/.test(value)) {
      const key = `${sIdx}-${side}-0-${heightIdx}`;
      setHeightInputs((prev) => ({ ...prev, [key]: value }));
    }
  };

  // 선반/서랍 높이 확정 (onBlur / Enter)
  const handleHeightInputBlur = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    heightIdx: number,
    sectionHeight: number,
  ) => {
    const key = `${sIdx}-${side}-0-${heightIdx}`;
    const raw = heightInputs[key] ?? '';

    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];
    const el = elements[0];

    if (!el || (el.type !== 'shelf' && el.type !== 'drawer')) return;

    if (raw === '') {
      // 빈 값이면 원래 값으로 복원
      setHeightInputs((prev) => ({ ...prev, [key]: el.heights[heightIdx]?.toString() || '0' }));
      return;
    }

    let num = parseInt(raw, 10);

    // 선반 "위에서" 기준일 경우 변환
    const refKey = `${sIdx}-${side}-${heightIdx}`;
    const refDir = shelfRefDir[refKey] || 'bottom';
    if (el.type === 'shelf' && refDir === 'top') {
      num = sectionHeight - num;
    }

    if (el.type === 'drawer') {
      // 서랍: 개별 높이 변경 시 나머지 서랍에 잔여 높이 재분배
      const gapPerDrawer = 23.6; // DrawerRenderer의 gapHeight와 동일
      const totalGap = gapPerDrawer * (el.heights.length + 1);
      const usableHeight = sectionHeight - totalGap;
      const minDrawerH = 80;
      const clamped = Math.max(minDrawerH, Math.min(usableHeight - minDrawerH * (el.heights.length - 1), num));

      const heights = [...el.heights];
      heights[heightIdx] = clamped;

      // 나머지 서랍에 잔여 높이 균등 재분배
      const othersCount = heights.length - 1;
      if (othersCount > 0) {
        const remaining = usableHeight - clamped;
        const perOther = Math.max(minDrawerH, Math.round(remaining / othersCount));
        for (let i = 0; i < heights.length; i++) {
          if (i !== heightIdx) heights[i] = perOther;
        }
      }

      elements[0] = { ...el, heights };

      if (side === 'full') sec.elements = elements;
      else if (side === 'left') sec.leftElements = elements;
      else sec.rightElements = elements;

      sections[sIdx] = sec;
      applyConfig({ ...config, sections });

      // heightInputs 전체 갱신
      const newHInputs: Record<string, string> = {};
      heights.forEach((h, hIdx) => {
        newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
      });
      setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
      return;
    }

    const clamped = Math.max(50, Math.min(sectionHeight, num));
    const heights = [...el.heights];
    heights[heightIdx] = clamped;
    elements[0] = { ...el, heights };

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });

    // 표시값도 갱신 (기준 방향에 따라)
    const displayVal = el.type === 'shelf' && refDir === 'top' ? sectionHeight - clamped : clamped;
    setHeightInputs((prev) => ({ ...prev, [key]: displayVal.toString() }));
  };

  // 선반 위치 기준 토글 (위에서 ↔ 아래에서)
  const handleShelfRefDirChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    heightIdx: number,
    dir: 'top' | 'bottom',
    storedValue: number,
    sectionHeight: number,
  ) => {
    const refKey = `${sIdx}-${side}-${heightIdx}`;
    const inputKey = `${sIdx}-${side}-0-${heightIdx}`;
    setShelfRefDir((prev) => ({ ...prev, [refKey]: dir }));
    // 표시값 변환
    const displayVal = dir === 'top' ? sectionHeight - storedValue : storedValue;
    setHeightInputs((prev) => ({ ...prev, [inputKey]: displayVal.toString() }));
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
      const newH = lastH + 200;
      const newIdx = el.heights.length;
      elements[0] = { ...el, heights: [...el.heights, newH] };
      // heightInputs에 새 항목 추가
      const key = `${sIdx}-${side}-0-${newIdx}`;
      setHeightInputs((prev) => ({ ...prev, [key]: newH.toString() }));
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

  // 바지걸이 높이 변경
  const handlePantsHeightChange = (sIdx: number, side: 'full' | 'left' | 'right', value: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    if (elements[0]?.type === 'pants') {
      elements[0] = { type: 'pants', height: Math.max(100, value) };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // My캐비닛에 저장
  const handleSaveToCabinet = async () => {
    const name = window.prompt('My캐비닛에 저장할 이름을 입력하세요:', config.sections.length > 1 ? '커스텀 2단 캐비닛' : '커스텀 캐비닛');
    if (!name) return;

    const category = getCustomizableCategory(placedModule.moduleId);
    const { error } = await saveCabinet({
      name,
      category,
      width: furnitureWidth,
      height: furnitureHeight,
      depth: furnitureDepth,
      customConfig: config,
    });

    if (error) {
      alert(error);
    } else {
      alert('My캐비닛에 저장되었습니다.');
    }
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

    // 상부섹션(sIdx===1, 2단분할)에는 서랍 불가
    const isUpperSection = config.sections.length > 1 && sIdx === 1;
    const availableTypes = isUpperSection
      ? (['open', 'shelf', 'rod'] as const)
      : (['open', 'shelf', 'drawer', 'rod', 'pants'] as const);

    return (
      <div>
        <div className={styles.elementSelector}>
          {availableTypes.map((type) => (
            <button
              key={type}
              className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
              onClick={() => handleElementChange(sIdx, side, type)}
            >
              {type === 'open' ? '비움' : type === 'shelf' ? '선반' : type === 'drawer' ? '서랍' : type === 'rod' ? '옷봉' : '바지걸이'}
            </button>
          ))}
        </div>

        {/* 선반/서랍 높이 목록 */}
        {(currentType === 'shelf' || currentType === 'drawer') && 'heights' in el && (
          <div>
            <div className={styles.heightList}>
              {el.heights.map((h, hi) => {
                const inputKey = `${sIdx}-${side}-0-${hi}`;
                const refKey = `${sIdx}-${side}-${hi}`;
                const refDir = shelfRefDir[refKey] || 'bottom';
                const displayVal = heightInputs[inputKey] ?? (
                  currentType === 'shelf' && refDir === 'top'
                    ? (sectionHeight - h).toString()
                    : h.toString()
                );

                return (
                  <div key={hi} className={styles.heightItem}>
                    <span className={styles.heightIndex}>{hi + 1}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`${styles.input} ${styles.inputSmall}`}
                      value={displayVal}
                      onChange={(e) => handleHeightInputChange(sIdx, side, hi, e.target.value)}
                      onBlur={() => handleHeightInputBlur(sIdx, side, hi, sectionHeight)}
                      onKeyDown={handleInputKeyDown}
                    />
                    <span className={styles.unit}>mm</span>
                    {/* 선반: 위에서/아래에서 기준 선택 */}
                    {currentType === 'shelf' && (
                      <div className={styles.refDirToggle}>
                        <button
                          className={`${styles.refDirButton} ${refDir === 'bottom' ? styles.active : ''}`}
                          onClick={() => handleShelfRefDirChange(sIdx, side, hi, 'bottom', h, sectionHeight)}
                          title="아래에서"
                        >
                          ↑
                        </button>
                        <button
                          className={`${styles.refDirButton} ${refDir === 'top' ? styles.active : ''}`}
                          onClick={() => handleShelfRefDirChange(sIdx, side, hi, 'top', h, sectionHeight)}
                          title="위에서"
                        >
                          ↓
                        </button>
                      </div>
                    )}
                    {el.heights.length > 1 && (
                      <button className={styles.removeButton} onClick={() => handleRemoveHeight(sIdx, side, hi)}>
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
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

        {/* 바지걸이 높이 */}
        {currentType === 'pants' && el.type === 'pants' && (
          <div className={styles.row}>
            <span className={styles.label}>높이</span>
            <input
              type="number"
              className={`${styles.input} ${styles.inputSmall}`}
              value={el.height}
              onChange={(e) => handlePantsHeightChange(sIdx, side, parseInt(e.target.value) || 0)}
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
              type="text"
              inputMode="numeric"
              className={`${styles.input} ${styles.inputSmall}`}
              value={sectionHeightInputs[sIdx] ?? section.height.toString()}
              onChange={(e) => handleSectionHeightInputChange(sIdx, e.target.value)}
              onBlur={() => handleSectionHeightBlur(sIdx)}
              onKeyDown={handleInputKeyDown}
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
          <span className={styles.headerTitle}>
            {focusedSectionIndex !== undefined
              ? `${focusedSectionIndex === 0 ? '하부' : '상부'} 섹션 설정`
              : '커스터마이징 가구 편집'}
          </span>
          <button className={styles.closeButton} onClick={closeAllPopups}>
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className={styles.body}>
          {focusedSectionIndex !== undefined ? (
            /* 톱니 아이콘 클릭: 해당 섹션 세부설정만 */
            <>
              {config.sections[focusedSectionIndex] &&
                renderSectionEditor(config.sections[focusedSectionIndex], focusedSectionIndex)
              }
            </>
          ) : (
            /* 연필 아이콘 클릭: 치수 + 섹션 분할/크기 + 전체 섹션 편집 */
            <>
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

              {/* 섹션별 타입 선택 (연필 메뉴) */}
              {config.sections.length > 1 ? (
                /* 2단 분할: 상부→하부 순서로 타입 선택 */
                [...config.sections].reverse().map((section, _i) => {
                  const realIdx = config.sections.length - 1 - _i;
                  const isUpper = realIdx === 1;
                  const { type: currentType, drawerCount } = getSectionTypeInfo(section);
                  const typeOptions = isUpper
                    ? (['open', 'shelf', 'rod'] as const)
                    : (['open', 'shelf', 'drawer', 'rod', 'pants'] as const);

                  return (
                    <div key={realIdx} className={styles.section}>
                      <div className={styles.sectionTitle}>
                        {isUpper ? '상부 섹션' : '하부 섹션'}
                        <span style={{ fontSize: '11px', color: '#999', marginLeft: '8px' }}>
                          {section.height}mm
                        </span>
                      </div>
                      <div className={styles.elementSelector}>
                        {typeOptions.map((type) => (
                          <button
                            key={type}
                            className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
                            onClick={() => handleSectionTypeChange(realIdx, type, type === 'drawer' ? 2 : undefined)}
                          >
                            {type === 'open' ? '비움' : type === 'shelf' ? '선반' : type === 'drawer' ? '서랍' : type === 'rod' ? '옷봉' : '바지걸이'}
                          </button>
                        ))}
                      </div>
                      {/* 서랍 단수 선택 + 개별 높이 편집 (하부만) */}
                      {currentType === 'drawer' && !isUpper && (
                        <div style={{ marginTop: '8px' }}>
                          <span className={styles.label} style={{ marginBottom: '6px', display: 'block' }}>서랍 단수</span>
                          <div className={styles.elementSelector}>
                            {[1, 2, 3, 4].map((count) => (
                              <button
                                key={count}
                                className={`${styles.elementButton} ${drawerCount === count ? styles.active : ''}`}
                                onClick={() => handleSectionTypeChange(realIdx, 'drawer', count)}
                              >
                                {count}단
                              </button>
                            ))}
                          </div>
                          {/* 개별 서랍 높이 편집 */}
                          {section.elements?.[0]?.type === 'drawer' && 'heights' in section.elements[0] && (
                            <div style={{ marginTop: '8px' }}>
                              <span className={styles.label} style={{ marginBottom: '4px', display: 'block' }}>서랍 개별 높이</span>
                              <div className={styles.heightList}>
                                {(section.elements[0] as { type: 'drawer'; heights: number[] }).heights.map((h, hi) => {
                                  const inputKey = `${realIdx}-full-0-${hi}`;
                                  const displayVal = heightInputs[inputKey] ?? h.toString();
                                  return (
                                    <div key={hi} className={styles.heightItem}>
                                      <span className={styles.heightIndex}>{hi + 1}단</span>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        className={`${styles.input} ${styles.inputSmall}`}
                                        value={displayVal}
                                        onChange={(e) => handleHeightInputChange(realIdx, 'full', hi, e.target.value)}
                                        onBlur={() => handleHeightInputBlur(realIdx, 'full', hi, section.height)}
                                        onKeyDown={handleInputKeyDown}
                                      />
                                      <span className={styles.unit}>mm</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* 선반/옷봉/바지걸이 세부 설정 */}
                      {currentType !== 'open' && currentType !== 'drawer' && (
                        <div style={{ marginTop: '8px' }}>
                          {renderElementEditor(realIdx, 'full', section.elements, section.height)}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                /* 분할 없음: 단일 섹션 타입 선택 */
                (() => {
                  const section = config.sections[0];
                  const { type: currentType, drawerCount } = getSectionTypeInfo(section);
                  return (
                    <div className={styles.section}>
                      <div className={styles.sectionTitle}>내부 구조</div>
                      <div className={styles.elementSelector}>
                        {(['open', 'shelf', 'drawer', 'rod', 'pants'] as const).map((type) => (
                          <button
                            key={type}
                            className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
                            onClick={() => handleSectionTypeChange(0, type, type === 'drawer' ? 2 : undefined)}
                          >
                            {type === 'open' ? '비움' : type === 'shelf' ? '선반' : type === 'drawer' ? '서랍' : type === 'rod' ? '옷봉' : '바지걸이'}
                          </button>
                        ))}
                      </div>
                      {currentType === 'drawer' && (
                        <div style={{ marginTop: '8px' }}>
                          <span className={styles.label} style={{ marginBottom: '6px', display: 'block' }}>서랍 단수</span>
                          <div className={styles.elementSelector}>
                            {[1, 2, 3, 4].map((count) => (
                              <button
                                key={count}
                                className={`${styles.elementButton} ${drawerCount === count ? styles.active : ''}`}
                                onClick={() => handleSectionTypeChange(0, 'drawer', count)}
                              >
                                {count}단
                              </button>
                            ))}
                          </div>
                          {/* 개별 서랍 높이 편집 */}
                          {section.elements?.[0]?.type === 'drawer' && 'heights' in section.elements[0] && (
                            <div style={{ marginTop: '8px' }}>
                              <span className={styles.label} style={{ marginBottom: '4px', display: 'block' }}>서랍 개별 높이</span>
                              <div className={styles.heightList}>
                                {(section.elements[0] as { type: 'drawer'; heights: number[] }).heights.map((h, hi) => {
                                  const inputKey = `0-full-0-${hi}`;
                                  const displayVal = heightInputs[inputKey] ?? h.toString();
                                  return (
                                    <div key={hi} className={styles.heightItem}>
                                      <span className={styles.heightIndex}>{hi + 1}단</span>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        className={`${styles.input} ${styles.inputSmall}`}
                                        value={displayVal}
                                        onChange={(e) => handleHeightInputChange(0, 'full', hi, e.target.value)}
                                        onBlur={() => handleHeightInputBlur(0, 'full', hi, section.height)}
                                        onKeyDown={handleInputKeyDown}
                                      />
                                      <span className={styles.unit}>mm</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* 선반/옷봉/바지걸이 세부 설정 */}
                      {currentType !== 'open' && currentType !== 'drawer' && (
                        <div style={{ marginTop: '8px' }}>
                          {renderElementEditor(0, 'full', section.elements, section.height)}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </>
          )}
        </div>

        {/* My캐비닛 저장 */}
        <div style={{ padding: '0 20px 8px' }}>
          <button className={styles.saveButton} onClick={handleSaveToCabinet}>
            My캐비닛에 저장
          </button>
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
