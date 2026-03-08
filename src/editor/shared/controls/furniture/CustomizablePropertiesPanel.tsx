import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { CustomFurnitureConfig, CustomSection, CustomElement, AreaSubSplit } from '@/editor/shared/furniture/types';
import { getCustomizableCategory } from './CustomizableFurnitureLibrary';
import { generateCabinetThumbnail } from '@/editor/shared/utils/cabinetThumbnailGenerator';
import { captureFurnitureThumbnail } from '@/editor/shared/utils/furnitureThumbnailCapture';
import styles from './CustomizablePropertiesPanel.module.css';

/**
 * 커스터마이징 가구 편집 패널
 * activePopup.type === 'customizableEdit' 일 때 렌더링
 */
const CustomizablePropertiesPanel: React.FC = () => {
  const { activePopup, closeAllPopups, openCustomizableEditPopup, setHighlightedSection } = useUIStore();
  const { placedModules, updatePlacedModule, removeModule, setPlacedModules } = useFurnitureStore();
  const { saveCabinet, updateCabinet, editingCabinetId, setEditingCabinetId, editBackup, setEditBackup } = useMyCabinetStore();
  const { setSpaceInfo } = useSpaceConfigStore();

  // 수정 모드 종료 시 기존 배치 상태 복원
  const restoreEditBackup = useCallback(() => {
    if (editBackup) {
      // 편집 중인 임시 모듈 제거 후 백업 복원
      setPlacedModules(editBackup.modules);
      setSpaceInfo({ layoutMode: editBackup.layoutMode });
      setEditBackup(null);
    }
  }, [editBackup, setPlacedModules, setSpaceInfo, setEditBackup]);

  const moduleId = activePopup.id;
  const placedModule = placedModules.find((m) => m.id === moduleId);
  // sectionIndex가 있으면 톱니 아이콘 클릭 → 해당 섹션 세부설정만 표시
  const focusedSectionIndex = activePopup.sectionIndex;
  // areaSide가 있으면 칸막이 좌/우 중 특정 영역만 편집
  const focusedAreaSide = activePopup.areaSide;
  // subPart가 있으면 상하 서브분할 중 특정 영역만 편집
  const focusedSubPart = activePopup.subPart;
  // 편집용 로컬 상태 (customConfig 복사본)
  const [config, setConfig] = useState<CustomFurnitureConfig | null>(null);
  // 취소 시 복원할 원본 스냅샷
  const [originalSnapshot, setOriginalSnapshot] = useState<{
    customConfig: CustomFurnitureConfig;
    freeWidth: number;
    moduleWidth: number;
    freeDepth: number;
  } | null>(null);

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
  // 칸막이 좌/우 거리 입력용 문자열 상태 - 키: "sIdx-left" / "sIdx-right"
  const [partitionInputs, setPartitionInputs] = useState<Record<string, string>>({});
  // 영역 서브분할 높이 입력 - 키: "sIdx-areaKey"
  const [subSplitHeightInputs, setSubSplitHeightInputs] = useState<Record<string, string>>({});
  // 섹션별 깊이 입력 - 키: sIdx (0, 1)
  const [sectionDepthInputs, setSectionDepthInputs] = useState<Record<number, string>>({});

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
      // 칸막이 좌/우 입력 초기화
      const pInputs: Record<string, string> = {};
      const iW = (placedModule?.freeWidth || placedModule?.moduleWidth || 600) - 2 * (cfg.panelThickness || 18);
      cfg.sections.forEach((s, sIdx) => {
        if (s.hasPartition && s.partitionPosition) {
          pInputs[`${sIdx}-left`] = s.partitionPosition.toString();
          pInputs[`${sIdx}-right`] = Math.round(iW - s.partitionPosition).toString();
        }
      });
      setPartitionInputs(pInputs);
    }
    if (placedModule) {
      const w = placedModule.freeWidth || placedModule.moduleWidth || 600;
      const d = placedModule.freeDepth || 580;
      setWidthInput(w.toString());
      setDepthInput(d.toString());
      setWidthError('');
      setDepthError('');
      // 섹션별 깊이 초기화
      const lD = placedModule.lowerSectionDepth ?? d;
      const uD = placedModule.upperSectionDepth ?? d;
      setSectionDepthInputs({ 0: lD.toString(), 1: uD.toString() });
      // 원본 스냅샷 저장 (취소 시 복원용)
      setOriginalSnapshot({
        customConfig: placedModule.customConfig
          ? JSON.parse(JSON.stringify(placedModule.customConfig))
          : null as unknown as CustomFurnitureConfig,
        freeWidth: w,
        moduleWidth: w,
        freeDepth: d,
      });
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

  // 팝업 닫힐 때 하이라이트 해제
  useEffect(() => {
    return () => setHighlightedSection(null);
  }, [setHighlightedSection]);

  // screenX/screenY가 있으면 가구 우측에 붙여서 표시 (hooks는 조건부 return 전에 호출)
  const panelStyle = useMemo<React.CSSProperties>(() => {
    const sx = activePopup.screenX;
    const sy = activePopup.screenY;
    const isMainPopup = activePopup.sectionIndex === undefined;
    if (sx != null) {
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(sx, window.innerWidth - 350));
      if (isMainPopup) {
        // 메인 팝업: 가구 우측, 화면 세로 중앙
        return { top: '50%', left, right: 'auto', transform: 'translateY(-50%)', maxHeight: vh - 24 };
      }
      // 섹션 팝업: 클릭 Y에서 위로 올려 배치, 화면 안에 clamp
      const estimatedHeight = 700;
      const idealTop = (sy ?? 0) - estimatedHeight * 0.4;
      const top = Math.max(8, Math.min(idealTop, vh - estimatedHeight));
      const maxHeight = vh - top - 8;
      return { top, left, right: 'auto', transform: 'none', maxHeight };
    }
    return {};
  }, [activePopup.screenX, activePopup.screenY, activePopup.sectionIndex]);


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

  // 섹션별 깊이 입력 변경
  const handleSectionDepthInputChange = (sIdx: number, value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setSectionDepthInputs((prev) => ({ ...prev, [sIdx]: value }));
    }
  };

  // 섹션별 깊이 확정
  const handleSectionDepthBlur = (sIdx: number) => {
    const raw = sectionDepthInputs[sIdx] ?? '';
    const currentDepth = sIdx === 0
      ? (placedModule.lowerSectionDepth ?? furnitureDepth)
      : (placedModule.upperSectionDepth ?? furnitureDepth);
    if (raw === '') {
      setSectionDepthInputs((prev) => ({ ...prev, [sIdx]: currentDepth.toString() }));
      return;
    }
    const num = parseInt(raw, 10);
    const clamped = Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, num));
    const updateKey = sIdx === 0 ? 'lowerSectionDepth' : 'upperSectionDepth';
    updatePlacedModule(moduleId, { [updateKey]: clamped });
    setSectionDepthInputs((prev) => ({ ...prev, [sIdx]: clamped.toString() }));
  };

  // Enter 키 핸들러
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  // 선반/서랍 높이 ArrowUp/ArrowDown 키 핸들러 (10mm 단위)
  const handleShelfHeightKeyDown = (
    e: React.KeyboardEvent,
    sIdx: number,
    side: 'full' | 'left' | 'right',
    heightIdx: number,
    sectionHeight: number,
  ) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();

    const step = 10; // 1cm = 10mm
    const delta = e.key === 'ArrowUp' ? step : -step;

    const sections = [...config!.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];
    const el = elements[0];
    if (!el || (el.type !== 'shelf' && el.type !== 'drawer')) return;

    const heights = [...el.heights];
    const refKey = `${sIdx}-${side}-${heightIdx}`;
    const refDir = shelfRefDir[refKey] || 'bottom';

    // 실제 저장값(아래에서 기준) 기준으로 delta 적용
    let newVal = heights[heightIdx] + (refDir === 'top' ? -delta : delta);
    newVal = Math.max(50, Math.min(sectionHeight, newVal));
    heights[heightIdx] = newVal;

    elements[0] = { ...el, heights };
    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config!, sections });

    // 표시값 갱신
    const displayVal = el.type === 'shelf' && refDir === 'top' ? sectionHeight - newVal : newVal;
    const inputKey = `${sIdx}-${side}-0-${heightIdx}`;
    setHeightInputs((prev) => ({ ...prev, [inputKey]: displayVal.toString() }));
  };

  // 섹션 높이 ArrowUp/ArrowDown 키 핸들러 (1mm 단위, Shift 10mm)
  const handleSectionHeightKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    if (config.sections.length !== 2) return;

    const step = e.shiftKey ? 10 : 1;
    const delta = e.key === 'ArrowUp' ? step : -step;
    const availableHeight = furnitureHeight - 4 * panelThickness;
    const current = config.sections[idx].height;
    const clamped = Math.max(100, Math.min(availableHeight - 100, current + delta));
    if (clamped === current) return;

    const otherH = availableHeight - clamped;
    const sections = [...config.sections];
    sections[idx] = { ...sections[idx], height: clamped };
    sections[1 - idx] = { ...sections[1 - idx], height: otherH };

    // 서랍 높이: 섹션 높이가 줄어서 서랍이 넘칠 때만 축소 (기존 높이 유지 원칙)
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const sec = sections[sIdx];
      const el = sec.elements?.[0];
      if (el?.type === 'drawer' && 'heights' in el) {
        const newH = sections[sIdx].height;
        const gapTotal = 23.6 * (el.heights.length + 1);
        const totalDrawerH = el.heights.reduce((s: number, h: number) => s + h, 0);
        const maxAllowed = newH - gapTotal;
        if (totalDrawerH > maxAllowed) {
          // 축소 필요: 비례 축소
          const ratio = Math.max(maxAllowed, el.heights.length * 80) / totalDrawerH;
          const newHeights = el.heights.map((h: number) => Math.round(h * ratio));
          sections[sIdx] = {
            ...sec,
            elements: [{ ...el, heights: newHeights }],
          };
        }
        // 섹션이 커졌을 때는 서랍 높이를 유지 (덮개선반이 남은 공간 채움)
      }
    }

    applyConfig({ ...config, sections });
    setSectionHeightInputs({ [idx]: clamped.toString(), [1 - idx]: otherH.toString() });
  };

  // 섹션 분할 (상/하 분할만 지원)
  const handleSectionSplit = (split: boolean) => {
    if (split) {
      const availableHeight = furnitureHeight - 4 * panelThickness;
      const lowerOuterDefault = 1000; // 외경 기준 하부 1000mm
      const lowerH = Math.min(lowerOuterDefault - 2 * panelThickness, availableHeight - 200); // 내경 = 외경 - 상하판 두께
      const upperH = availableHeight - lowerH;
      applyConfig({
        ...config,
        splitDirection: 'topBottom',
        splitPosition: lowerH,
        sections: [
          { id: 'section-lower', height: lowerH, elements: [{ type: 'open' }] },
          { id: 'section-upper', height: upperH, elements: [{ type: 'open' }] },
        ],
      });
      setSectionHeightInputs({ 0: lowerH.toString(), 1: upperH.toString() });
    } else {
      // 분할 해제 → 단일 섹션
      applyConfig({
        ...config,
        splitDirection: undefined,
        splitPosition: undefined,
        sections: [{ id: 'section-0', height: innerHeight, elements: config.sections[0]?.elements || [{ type: 'open' }] }],
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

    // 서랍 높이: 섹션 높이가 줄어서 서랍이 넘칠 때만 축소 (기존 높이 유지 원칙)
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const sec = sections[sIdx];
      const el = sec.elements?.[0];
      if (el?.type === 'drawer' && 'heights' in el) {
        const newH = sIdx === idx ? clamped : otherH;
        const gapTotal = 23.6 * (el.heights.length + 1);
        const totalDrawerH = el.heights.reduce((s: number, h: number) => s + h, 0);
        const maxAllowed = newH - gapTotal;
        if (totalDrawerH > maxAllowed) {
          const ratio = Math.max(maxAllowed, el.heights.length * 80) / totalDrawerH;
          const newHeights = el.heights.map((h: number) => Math.round(h * ratio));
          sections[sIdx] = {
            ...sec,
            elements: [{ ...el, heights: newHeights }],
          };
        }
      }
    }

    applyConfig({ ...config, sections });
    setSectionHeightInputs({ [idx]: clamped.toString(), [1 - idx]: otherH.toString() });
  };

  // 기존 모듈 기준 서랍 단수별 표준 사양 (shelving.ts FURNITURE_SPECS 참조)
  // sectionHeight는 외경(패널 포함) 기준
  const DRAWER_STANDARD: Record<number, { sectionHeight: number; heights: number[] }> = {
    1: { sectionHeight: 321, heights: [255] },
    2: { sectionHeight: 600, heights: [255, 255] },
    3: { sectionHeight: 800, heights: [255, 255, 176] },
    4: { sectionHeight: 1000, heights: [255, 255, 176, 176] },
  };

  // 섹션 타입 변경 (연필 메뉴용) — 서랍 선택 시 단수도 함께 처리
  const handleSectionTypeChange = (sIdx: number, elementType: CustomElement['type'], drawerCount?: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };

    let newElement: CustomElement;
    switch (elementType) {
      case 'shelf':
        newElement = { type: 'shelf', heights: [Math.round(sec.height / 2)], shelfMethod: 'dowel', shelfFrontInset: 30 };
        break;
      case 'drawer': {
        const count = drawerCount || 2;
        const standard = DRAWER_STANDARD[count] || DRAWER_STANDARD[2];
        // 서랍 단수에 따라 하부 섹션 높이 자동 조절 (2단 분할 시)
        // sectionHeight는 외경(패널 포함)이므로 내경(sec.height)으로 변환: 외경 - 2 * panelThickness
        if (config.sections.length === 2 && sIdx === 0) {
          const availableHeight = furnitureHeight - 4 * panelThickness;
          const lowerInner = standard.sectionHeight - 2 * panelThickness;
          const lowerH = Math.min(lowerInner, availableHeight - 100);
          const upperH = availableHeight - lowerH;
          sec.height = lowerH;
          sections[1] = { ...sections[1], height: upperH };
          setSectionHeightInputs({ 0: lowerH.toString(), 1: upperH.toString() });
        }
        // 기존 모듈과 동일한 개별 서랍 높이 적용
        newElement = { type: 'drawer', heights: [...standard.heights] };
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
      const halfW = Math.round(innerW / 2);
      sec.hasPartition = true;
      sec.partitionPosition = halfW;
      sec.leftElements = sec.elements || [{ type: 'open' }];
      sec.rightElements = [{ type: 'open' }];
      sec.elements = undefined;
      // 칸막이 좌/우 입력 초기화
      setPartitionInputs((prev) => ({
        ...prev,
        [`${sIdx}-left`]: halfW.toString(),
        [`${sIdx}-right`]: (innerW - halfW).toString(),
      }));
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

  // 영역별 상하 서브분할 토글
  const handleAreaSubSplitToggle = (sIdx: number, areaKey: 'full' | 'left' | 'right', enabled: boolean) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const subSplits = { ...(sec.areaSubSplits || {}) };
    if (enabled) {
      const halfH = Math.round(sec.height / 2);
      // 기존 요소를 하부로 이동
      const existingElements = areaKey === 'full'
        ? sec.elements || [{ type: 'open' as const }]
        : areaKey === 'left'
          ? sec.leftElements || [{ type: 'open' as const }]
          : sec.rightElements || [{ type: 'open' as const }];
      subSplits[areaKey] = {
        enabled: true,
        lowerHeight: halfH,
        lowerElements: existingElements,
        upperElements: [{ type: 'open' }],
      };
    } else {
      // 서브분할 해제: 하부 요소를 원래 영역으로 복원
      const sub = subSplits[areaKey];
      const restoredElements = sub?.lowerElements || [{ type: 'open' as const }];
      if (areaKey === 'full') {
        sec.elements = restoredElements;
      } else if (areaKey === 'left') {
        sec.leftElements = restoredElements;
      } else {
        sec.rightElements = restoredElements;
      }
      delete subSplits[areaKey];
    }
    sec.areaSubSplits = Object.keys(subSplits).length > 0 ? subSplits : undefined;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 영역별 서브분할 높이 변경
  const handleAreaSubSplitHeight = (sIdx: number, areaKey: string, lowerHeight: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const subSplits = { ...(sec.areaSubSplits || {}) };
    const sub = subSplits[areaKey];
    if (sub) {
      subSplits[areaKey] = { ...sub, lowerHeight };
      sec.areaSubSplits = subSplits;
      sections[sIdx] = sec;
      applyConfig({ ...config, sections });
    }
  };

  // 서브분할 요소 변경
  const handleSubSplitElementChange = (
    sIdx: number,
    areaKey: string,
    subPart: 'upper' | 'lower',
    elementType: CustomElement['type'],
  ) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const subSplits = { ...(sec.areaSubSplits || {}) };
    const sub = subSplits[areaKey];
    if (!sub) return;

    const subHeight = subPart === 'lower' ? sub.lowerHeight : sec.height - sub.lowerHeight;
    let newElement: CustomElement;
    switch (elementType) {
      case 'shelf':
        newElement = { type: 'shelf', heights: [Math.round(subHeight / 2)], shelfMethod: 'dowel', shelfFrontInset: 30 };
        break;
      case 'drawer': {
        const maxCount = getMaxDrawerCount(subHeight);
        const standard = DRAWER_STANDARD[maxCount] || DRAWER_STANDARD[1];
        newElement = { type: 'drawer', heights: [...standard.heights] };
        break;
      }
      case 'rod':
        newElement = subHeight >= 1100
          ? { type: 'rod', height: Math.round(subHeight * 0.85), withShelf: true, shelfGap: 280 }
          : { type: 'rod', height: Math.round(subHeight * 0.85), withShelf: false };
        break;
      case 'pants':
        newElement = { type: 'pants', height: Math.round(subHeight * 0.85) };
        break;
      default:
        newElement = { type: 'open' };
    }
    subSplits[areaKey] = {
      ...sub,
      [subPart === 'upper' ? 'upperElements' : 'lowerElements']: [newElement],
    };
    sec.areaSubSplits = subSplits;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 영역 높이 기반 최대 서랍 수 계산
  const getMaxDrawerCount = (areaHeight: number): number => {
    // DRAWER_STANDARD 기준: 각 단수별 필요 내경(sectionHeight - 36mm)
    // 4단: 1000-36=964, 3단: 800-36=764, 2단: 600-36=564, 1단: 321-36=285
    for (let count = 4; count >= 1; count--) {
      const standard = DRAWER_STANDARD[count];
      const requiredInner = standard.sectionHeight - 2 * panelThickness;
      if (areaHeight >= requiredInner) return count;
    }
    return 1;
  };

  // 서랍 균등 채움 계산: 섹션을 서랍으로 꽉 채우되, 마이다 간격 23.6mm 유지, 마이다 최대 높이 320mm
  // effectiveHeight = 내경(sec.height) + 상판두께(panelThickness)
  // → 서랍 스택은 상판까지 포함해서 분할 (맨 위 gap이 상판에 밀착)
  const calculateEvenFillDrawers = (sectionInnerHeight: number): { count: number; heights: number[] } => {
    const gap = 23.6; // 마이다 간격 (DrawerRenderer gapHeight와 동일)
    const maxDrawerH = 320; // 마이다 최대 높이
    const minDrawerH = 80; // 서랍 최소 높이
    const effectiveHeight = sectionInnerHeight + panelThickness; // 상판 포함

    // 최소 서랍 수: 각 서랍이 maxDrawerH 이하가 되려면
    // effectiveHeight - gap*(n+1) <= maxDrawerH * n
    // n >= (effectiveHeight - gap) / (maxDrawerH + gap)
    const minCount = Math.max(1, Math.ceil((effectiveHeight - gap) / (maxDrawerH + gap)));

    // 최대 서랍 수: 각 서랍이 minDrawerH 이상이 되려면
    const maxCount = Math.max(1, Math.floor((effectiveHeight - gap) / (minDrawerH + gap)));

    const count = Math.min(minCount, maxCount);
    if (count < 1) return { count: 1, heights: [Math.max(minDrawerH, effectiveHeight - gap * 2)] };

    const totalGap = gap * (count + 1);
    const perDrawer = Math.round((effectiveHeight - totalGap) / count);
    const clampedHeight = Math.max(minDrawerH, Math.min(maxDrawerH, perDrawer));

    return { count, heights: Array(count).fill(clampedHeight) };
  };

  // 서랍 균등 채움 핸들러 (focused section 편집용)
  const handleEvenFillDrawers = (sIdx: number, side: 'full' | 'left' | 'right') => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const sectionHeight = sec.height;
    const { heights } = calculateEvenFillDrawers(sectionHeight);

    const newElement: CustomElement = { type: 'drawer', heights };

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
    const newHInputs: Record<string, string> = {};
    heights.forEach((h, hIdx) => {
      newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
    });
    setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
  };

  // 서랍 균등 채움 핸들러 (섹션 타입 선택 영역용)
  const handleEvenFillDrawersForSection = (sIdx: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const sectionHeight = sec.height;
    const { heights } = calculateEvenFillDrawers(sectionHeight);

    sec.elements = [{ type: 'drawer', heights }];
    sec.hasPartition = false;
    sec.partitionPosition = undefined;
    sec.leftElements = undefined;
    sec.rightElements = undefined;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });

    const newHInputs: Record<string, string> = {};
    heights.forEach((h, hIdx) => {
      newHInputs[`${sIdx}-full-0-${hIdx}`] = h.toString();
    });
    setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
  };

  // 요소 타입 변경 (drawerCount 파라미터 추가)
  const handleElementChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    elementType: CustomElement['type'],
    drawerCount?: number,
  ) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const sectionHeight = sec.height;

    let newElement: CustomElement;
    switch (elementType) {
      case 'shelf':
        newElement = { type: 'shelf', heights: [Math.round(sectionHeight / 2)], shelfMethod: 'dowel', shelfFrontInset: 30 };
        break;
      case 'drawer': {
        // 서랍 단수: 명시적 지정 또는 영역 높이 기반 최대값
        const maxCount = getMaxDrawerCount(sectionHeight);
        const count = drawerCount || maxCount;
        const standard = DRAWER_STANDARD[count] || DRAWER_STANDARD[1];
        newElement = { type: 'drawer', heights: [...standard.heights] };
        break;
      }
      case 'rod':
        newElement = sectionHeight >= 1100
          ? { type: 'rod', height: Math.round(sectionHeight * 0.85), withShelf: true, shelfGap: 280 }
          : { type: 'rod', height: Math.round(sectionHeight * 0.85), withShelf: false };
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

    // 칸막이가 있을 때: 양쪽 영역 중 서랍이 있으면 칸막이 앞 오프셋 85mm 자동 적용
    if (sec.hasPartition) {
      const leftEl = (sec.leftElements || [])[0];
      const rightEl = (sec.rightElements || [])[0];
      const hasDrawer = leftEl?.type === 'drawer' || rightEl?.type === 'drawer';
      if (hasDrawer) {
        sec.partitionFrontInset = 85;
      } else {
        sec.partitionFrontInset = 0;
      }
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

  // 서랍 덮개 선반 앞 들여쓰기(coverInset) 변경
  const handleCoverInsetChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    value: number,
  ) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const getElements = () => {
      if (side === 'full') return sec.elements ? [...sec.elements] : [];
      if (side === 'left') return sec.leftElements ? [...sec.leftElements] : [];
      return sec.rightElements ? [...sec.rightElements] : [];
    };
    const els = getElements();
    if (els.length > 0 && els[0].type === 'drawer') {
      els[0] = { ...els[0], coverInset: value };
    }
    if (side === 'full') sec.elements = els;
    else if (side === 'left') sec.leftElements = els;
    else sec.rightElements = els;

    // 칸막이 앞 오프셋도 동기화 (서랍 있으면 85mm)
    if (sec.hasPartition) {
      const leftEl = (sec.leftElements || [])[0];
      const rightEl = (sec.rightElements || [])[0];
      const hasDrawer = leftEl?.type === 'drawer' || rightEl?.type === 'drawer';
      sec.partitionFrontInset = hasDrawer ? 85 : 0;
    }

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 서랍 배치 방향(위/아래) 변경
  const handleDrawerAlignChange = (
    sIdx: number,
    side: 'full' | 'left' | 'right',
    align: 'top' | 'bottom',
  ) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const getElements = () => {
      if (side === 'full') return sec.elements ? [...sec.elements] : [];
      if (side === 'left') return sec.leftElements ? [...sec.leftElements] : [];
      return sec.rightElements ? [...sec.rightElements] : [];
    };
    const els = getElements();
    if (els.length > 0 && els[0].type === 'drawer') {
      els[0] = { ...els[0], drawerAlign: align };
      // heightInputs 클리어 → 다음 렌더에서 마이다/본체 높이로 재계산
      const newHInputs: Record<string, string> = {};
      els[0].heights.forEach((h: number, hIdx: number) => {
        const mOffset = (align === 'top' && hIdx === 0) ? 42 : 0;
        newHInputs[`${sIdx}-${side}-0-${hIdx}`] = (h + mOffset).toString();
      });
      setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
    }
    if (side === 'full') sec.elements = els;
    else if (side === 'left') sec.leftElements = els;
    else sec.rightElements = els;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
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
      // 빈 값이면 원래 값으로 복원 (위배치 맨 아래 서랍은 마이다 높이)
      const isTopBottom = el.type === 'drawer' && heightIdx === 0 && 'drawerAlign' in el && el.drawerAlign === 'top';
      const restoreVal = (el.heights[heightIdx] || 0) + (isTopBottom ? 42 : 0);
      setHeightInputs((prev) => ({ ...prev, [key]: restoreVal.toString() }));
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
      // 위배치 맨 아래 서랍: 마이다 높이 입력 → 본체 높이로 변환 (-42mm)
      const isTopAlignBottom = heightIdx === 0 && 'drawerAlign' in el && el.drawerAlign === 'top';
      if (isTopAlignBottom) num = num - 42;
      // 서랍 스택은 상판까지 포함 (내경 + 상판두께)
      const gapPerDrawer = 23.6; // DrawerRenderer의 gapHeight와 동일
      const totalGap = gapPerDrawer * (el.heights.length + 1);
      const usableHeight = (sectionHeight + panelThickness) - totalGap;
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

      // heightInputs 전체 갱신 (위배치 맨 아래 서랍은 마이다 높이로 표시)
      const isTopAlign = 'drawerAlign' in el && el.drawerAlign === 'top';
      const newHInputs: Record<string, string> = {};
      heights.forEach((h, hIdx) => {
        const mOffset = (isTopAlign && hIdx === 0) ? 42 : 0;
        newHInputs[`${sIdx}-${side}-0-${hIdx}`] = (h + mOffset).toString();
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

  // 서랍 추가 가능 여부 판정 (공간이 부족하면 false)
  const canAddDrawer = (sIdx: number, side: 'full' | 'left' | 'right'): boolean => {
    const sec = config.sections[sIdx];
    if (!sec) return false;
    const elements =
      side === 'full' ? (sec.elements || []) : side === 'left' ? (sec.leftElements || []) : (sec.rightElements || []);
    const el = elements[0];
    if (!el || el.type !== 'drawer') return true; // 서랍이 아니면 제한 없음

    const gap = 23.6;
    const minDrawerH = 80;
    const effectiveHeight = sec.height + panelThickness; // 상판 포함
    const newCount = el.heights.length + 1;
    const totalGap = gap * (newCount + 1);
    const usable = effectiveHeight - totalGap;
    return usable >= minDrawerH * newCount; // 모든 서랍이 최소 높이 이상인지
  };

  // 선반/서랍 추가
  const handleAddHeight = (sIdx: number, side: 'full' | 'left' | 'right') => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    const el = elements[0];
    if (el && (el.type === 'shelf' || el.type === 'drawer')) {
      if (el.type === 'shelf') {
        // 선반: 균등 간격으로 재분배
        const newCount = el.heights.length + 1;
        const newHeights = Array.from({ length: newCount }, (_, i) =>
          Math.round(sec.height * (i + 1) / (newCount + 1))
        );
        elements[0] = { ...el, heights: newHeights };
        // heightInputs 전체 갱신
        const newHInputs: Record<string, string> = {};
        newHeights.forEach((h, hIdx) => {
          newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
        });
        setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
      } else {
        // 서랍: 공간 부족 시 추가 차단
        if (!canAddDrawer(sIdx, side)) return;

        // 새 서랍 높이를 균등 재분배로 계산
        const gap = 23.6;
        const newCount = el.heights.length + 1;
        const effectiveHeight = sec.height + panelThickness;
        const totalGap = gap * (newCount + 1);
        const perDrawer = Math.max(80, Math.round((effectiveHeight - totalGap) / newCount));
        const newHeights = Array(newCount).fill(perDrawer);

        elements[0] = { ...el, heights: newHeights };
        // heightInputs 전체 갱신
        const newHInputs: Record<string, string> = {};
        newHeights.forEach((h: number, hIdx: number) => {
          newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
        });
        setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
      }
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
      if (el.type === 'shelf') {
        // 선반: 제거 후 균등 간격으로 재분배
        const newCount = el.heights.length - 1;
        const newHeights = Array.from({ length: newCount }, (_, i) =>
          Math.round(sec.height * (i + 1) / (newCount + 1))
        );
        elements[0] = { ...el, heights: newHeights };
        // heightInputs 전체 갱신
        const newHInputs: Record<string, string> = {};
        newHeights.forEach((h, hIdx) => {
          newHInputs[`${sIdx}-${side}-0-${hIdx}`] = h.toString();
        });
        setHeightInputs((prev) => ({ ...prev, ...newHInputs }));
      } else {
        const heights = el.heights.filter((_, i) => i !== heightIdx);
        elements[0] = { ...el, heights };
      }
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 선반 옷봉 토글
  const handleShelfRodToggle = (sIdx: number, side: 'full' | 'left' | 'right', hasRod: boolean) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    if (elements[0]?.type === 'shelf') {
      elements[0] = { ...elements[0], hasRod };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 선반 방식 변경 (고정/다보)
  const handleShelfMethodChange = (sIdx: number, side: 'full' | 'left' | 'right', method: 'fixed' | 'dowel') => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    if (elements[0]?.type === 'shelf') {
      elements[0] = { ...elements[0], shelfMethod: method, shelfFrontInset: method === 'dowel' ? (elements[0].shelfFrontInset ?? 30) : 0 };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 서브분할 선반 방식 변경
  const handleSubSplitShelfMethodChange = (sIdx: number, areaKey: string, subPart: 'upper' | 'lower', method: 'fixed' | 'dowel') => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const subSplits = { ...(sec.areaSubSplits || {}) };
    const sub = subSplits[areaKey];
    if (!sub) return;

    const elemKey = subPart === 'upper' ? 'upperElements' : 'lowerElements';
    const elements = [...(sub[elemKey] || [])];
    if (elements[0]?.type === 'shelf') {
      elements[0] = { ...elements[0], shelfMethod: method, shelfFrontInset: method === 'dowel' ? (elements[0].shelfFrontInset ?? 30) : 0 };
    }
    subSplits[areaKey] = { ...sub, [elemKey]: elements };
    sec.areaSubSplits = subSplits;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 서브분할 선반 앞 들여쓰기 변경
  const handleSubSplitShelfFrontInsetChange = (sIdx: number, areaKey: string, subPart: 'upper' | 'lower', inset: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const subSplits = { ...(sec.areaSubSplits || {}) };
    const sub = subSplits[areaKey];
    if (!sub) return;

    const elemKey = subPart === 'upper' ? 'upperElements' : 'lowerElements';
    const elements = [...(sub[elemKey] || [])];
    if (elements[0]?.type === 'shelf') {
      elements[0] = { ...elements[0], shelfFrontInset: inset };
    }
    subSplits[areaKey] = { ...sub, [elemKey]: elements };
    sec.areaSubSplits = subSplits;
    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // 선반 앞 들여쓰기 변경
  const handleShelfFrontInsetChange = (sIdx: number, side: 'full' | 'left' | 'right', inset: number) => {
    const sections = [...config.sections];
    const sec = { ...sections[sIdx] };
    const elements =
      side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];

    if (elements[0]?.type === 'shelf') {
      elements[0] = { ...elements[0], shelfFrontInset: inset };
    }

    if (side === 'full') sec.elements = elements;
    else if (side === 'left') sec.leftElements = elements;
    else sec.rightElements = elements;

    sections[sIdx] = sec;
    applyConfig({ ...config, sections });
  };

  // My캐비닛에 저장 (수정 모드: 덮어쓰기/새로생성 선택, 일반: 신규 저장)
  const handleSaveToCabinet = async () => {
    const category = getCustomizableCategory(placedModule.moduleId);

    // 1차: 3D scene에서 해당 가구만 offscreen 렌더링
    // 2차 폴백: Canvas2D 다이어그램
    const thumbnailDataUrl =
      captureFurnitureThumbnail(placedModule.id, { width: 300, height: 400 })
      || generateCabinetThumbnail(config, furnitureWidth, furnitureHeight, { width: 300, height: 400 });

    if (editingCabinetId) {
      // 수정 모드: 덮어쓰기 or 새로 생성 선택
      const choice = window.confirm(
        '기존 My캐비닛을 덮어쓰시겠습니까?\n\n[확인] → 기존 캐비닛 덮어쓰기\n[취소] → 새 캐비닛으로 저장'
      );

      if (choice) {
        // 덮어쓰기: thumbnail dataURL도 함께 저장
        const { error } = await updateCabinet(editingCabinetId, {
          category,
          width: furnitureWidth,
          height: furnitureHeight,
          depth: furnitureDepth,
          customConfig: config,
          thumbnail: thumbnailDataUrl || undefined,
        });

        if (error) {
          alert(error);
        } else {
          alert('My캐비닛이 수정되었습니다.');
          restoreEditBackup();
          setEditingCabinetId(null);
          closeAllPopups();
        }
      } else {
        // 새로 생성
        const name = window.prompt('새 My캐비닛 이름을 입력하세요:', config.sections.length > 1 ? '커스텀 2단 캐비닛' : '커스텀 캐비닛');
        if (!name) return;

        const { id, error } = await saveCabinet({
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
          // 저장 직후 thumbnail 업데이트
          if (id && thumbnailDataUrl) {
            await updateCabinet(id, { thumbnail: thumbnailDataUrl });
          }
          alert('새 My캐비닛으로 저장되었습니다.');
          restoreEditBackup();
          setEditingCabinetId(null);
          closeAllPopups();
        }
      }
    } else {
      // 신규 저장
      const name = window.prompt('My캐비닛에 저장할 이름을 입력하세요:', config.sections.length > 1 ? '커스텀 2단 캐비닛' : '커스텀 캐비닛');
      if (!name) return;

      const { id, error } = await saveCabinet({
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
        // 저장 직후 thumbnail 업데이트
        if (id && thumbnailDataUrl) {
          await updateCabinet(id, { thumbnail: thumbnailDataUrl });
        }
        alert('My캐비닛에 저장되었습니다.');
      }
    }
  };

  // 취소: 원본 스냅샷으로 복원 후 닫기
  const handleCancel = () => {
    if (editingCabinetId && editBackup) {
      // 수정 모드: 임시 모듈 제거 + 기존 배치 복원
      restoreEditBackup();
    } else if (originalSnapshot && moduleId) {
      updatePlacedModule(moduleId, {
        customConfig: originalSnapshot.customConfig,
        freeWidth: originalSnapshot.freeWidth,
        moduleWidth: originalSnapshot.moduleWidth,
        freeDepth: originalSnapshot.freeDepth,
      });
    }
    setEditingCabinetId(null);
    closeAllPopups();
  };

  // 가구 삭제
  const handleDelete = () => {
    if (editingCabinetId && editBackup) {
      // 수정 모드: 기존 배치 복원
      restoreEditBackup();
    } else {
      removeModule(moduleId);
    }
    setEditingCabinetId(null);
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

        {/* 선반 방식 선택 (고정/다보) */}
        {currentType === 'shelf' && el.type === 'shelf' && (
          <div style={{ marginTop: '8px' }}>
            <div className={styles.row}>
              <span className={styles.label}>방식</span>
              <div className={styles.toggleGroup}>
                <button
                  className={`${styles.toggleButton} ${(el.shelfMethod || 'dowel') === 'fixed' ? styles.active : ''}`}
                  onClick={() => handleShelfMethodChange(sIdx, side, 'fixed')}
                >
                  고정선반
                </button>
                <button
                  className={`${styles.toggleButton} ${(el.shelfMethod || 'dowel') === 'dowel' ? styles.active : ''}`}
                  onClick={() => handleShelfMethodChange(sIdx, side, 'dowel')}
                >
                  다보선반
                </button>
              </div>
            </div>
            {(el.shelfMethod || 'dowel') === 'dowel' && (
              <div className={styles.row} style={{ marginTop: '4px' }}>
                <span className={styles.label}>앞 옵셋</span>
                <input
                  type="number"
                  className={`${styles.input} ${styles.inputSmall}`}
                  style={{ width: '60px' }}
                  value={el.shelfFrontInset ?? 30}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 0 && v <= 100) {
                      handleShelfFrontInsetChange(sIdx, side, v);
                    }
                  }}
                />
                <span className={styles.unit}>mm</span>
              </div>
            )}
          </div>
        )}

        {/* 서랍 단수 선택 */}
        {currentType === 'drawer' && 'heights' in el && (() => {
          const maxCount = getMaxDrawerCount(sectionHeight);
          const currentCount = el.heights.length;
          return (
            <div style={{ marginTop: '8px' }}>
              <div className={styles.elementSelector}>
                {Array.from({ length: maxCount }, (_, i) => i + 1).map((count) => (
                  <button
                    key={count}
                    className={`${styles.elementButton} ${currentCount === count ? styles.active : ''}`}
                    onClick={() => handleElementChange(sIdx, side, 'drawer', count)}
                  >
                    {count}단
                  </button>
                ))}
              </div>
              <button
                style={{
                  marginTop: '6px', width: '100%', padding: '6px 10px',
                  border: '1px solid #4A90D9', borderRadius: '6px',
                  background: '#4A90D9', color: '#fff',
                  fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s'
                }}
                onClick={() => handleEvenFillDrawers(sIdx, side)}
              >
                균등 채움
              </button>
            </div>
          );
        })()}

        {/* 서랍 배치 방향 (위/아래) + 덮개 옵셋 */}
        {currentType === 'drawer' && 'heights' in el && (() => {
          const currentAlign = ('drawerAlign' in el && el.drawerAlign) || 'bottom';
          const defaultCoverInset = currentAlign === 'top' ? 85 : 60;
          const coverInset = ('coverInset' in el && el.coverInset !== undefined) ? el.coverInset : defaultCoverInset;
          // 서랍이 영역을 꽉 채우는지 판단 (fullFill이면 배치방향/덮개 무의미)
          const gap = 23.6;
          const totalH = el.heights.reduce((s: number, h: number) => s + h, 0) + gap * (el.heights.length + 1);
          const isFullFill = totalH >= sectionHeight;
          return (
            <>
              {/* 배치 방향: fullFill이 아닐 때만 표시 */}
              {!isFullFill && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>배치</span>
                  <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                    <button
                      style={{
                        flex: 1, padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
                        border: `1px solid ${currentAlign === 'bottom' ? '#4A90D9' : '#555'}`,
                        background: currentAlign === 'bottom' ? '#4A90D9' : 'transparent',
                        color: currentAlign === 'bottom' ? '#fff' : '#aaa',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleDrawerAlignChange(sIdx, side, 'bottom')}
                    >
                      아래
                    </button>
                    <button
                      style={{
                        flex: 1, padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
                        border: `1px solid ${currentAlign === 'top' ? '#4A90D9' : '#555'}`,
                        background: currentAlign === 'top' ? '#4A90D9' : 'transparent',
                        color: currentAlign === 'top' ? '#fff' : '#aaa',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleDrawerAlignChange(sIdx, side, 'top')}
                    >
                      위
                    </button>
                  </div>
                </div>
              )}
              {/* 덮개 옵셋 */}
              {!isFullFill && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>덮개 옵셋</span>
                  <input
                    type="number"
                    className={`${styles.input} ${styles.inputSmall}`}
                    style={{ width: '60px' }}
                    value={coverInset}
                    min={0}
                    max={150}
                    step={5}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 0 && v <= 150) {
                        handleCoverInsetChange(sIdx, side, v);
                      }
                    }}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              )}
            </>
          );
        })()}

        {/* 선반/서랍 높이 목록 */}
        {(currentType === 'shelf' || currentType === 'drawer') && 'heights' in el && (
          <div>
            <div className={styles.heightList}>
              {el.heights.map((h, hi) => {
                const inputKey = `${sIdx}-${side}-0-${hi}`;
                const refKey = `${sIdx}-${side}-${hi}`;
                const refDir = shelfRefDir[refKey] || 'bottom';
                // 위배치 맨 아래 서랍: 마이다 높이 표시 (본체 + 상18 + 하24 = +42mm)
                const isTopAlignBottomDrawer = currentType === 'drawer' && hi === 0
                  && 'drawerAlign' in el && el.drawerAlign === 'top';
                const maidaOffset = isTopAlignBottomDrawer ? 42 : 0;
                const displayVal = heightInputs[inputKey] ?? (
                  currentType === 'shelf' && refDir === 'top'
                    ? (sectionHeight - h).toString()
                    : (h + maidaOffset).toString()
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
                      onKeyDown={(e) => handleShelfHeightKeyDown(e, sIdx, side, hi, sectionHeight)}
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
            <button
              className={styles.addButton}
              onClick={() => handleAddHeight(sIdx, side)}
              disabled={currentType === 'drawer' && !canAddDrawer(sIdx, side)}
              style={currentType === 'drawer' && !canAddDrawer(sIdx, side) ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              + {currentType === 'shelf' ? '선반' : '서랍'} 추가
            </button>
          </div>
        )}

        {/* 옷봉: 고정선반+옷봉 / 옷봉만 선택 (섹션 높이 1100 이상만 선반+옷봉 가능) */}
        {currentType === 'rod' && el.type === 'rod' && (() => {
          const withShelf = el.withShelf ?? false;
          const shelfGap = el.shelfGap ?? 280;
          const sectionH = config.sections[sIdx].height;
          const canHaveShelf = sectionH >= 1100;
          return (
            <div style={{ marginTop: '8px' }}>
              {canHaveShelf && (
                <div className={styles.row}>
                  <span className={styles.label}>옵션</span>
                  <div className={styles.toggleGroup}>
                    <button
                      className={`${styles.toggleButton} ${withShelf ? styles.active : ''}`}
                      onClick={() => {
                        const sections = [...config.sections];
                        const sec = { ...sections[sIdx] };
                        const elArr = side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];
                        if (elArr[0]?.type === 'rod') {
                          elArr[0] = { ...elArr[0], withShelf: true, shelfGap: elArr[0].shelfGap ?? 280 };
                        }
                        if (side === 'full') sec.elements = elArr;
                        else if (side === 'left') sec.leftElements = elArr;
                        else sec.rightElements = elArr;
                        sections[sIdx] = sec;
                        applyConfig({ ...config, sections });
                      }}
                    >
                      선반+옷봉
                    </button>
                    <button
                      className={`${styles.toggleButton} ${!withShelf ? styles.active : ''}`}
                      onClick={() => {
                        const sections = [...config.sections];
                        const sec = { ...sections[sIdx] };
                        const elArr = side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];
                        if (elArr[0]?.type === 'rod') {
                          elArr[0] = { ...elArr[0], withShelf: false };
                        }
                        if (side === 'full') sec.elements = elArr;
                        else if (side === 'left') sec.leftElements = elArr;
                        else sec.rightElements = elArr;
                        sections[sIdx] = sec;
                        applyConfig({ ...config, sections });
                      }}
                    >
                      옷봉만
                    </button>
                  </div>
                </div>
              )}
              {canHaveShelf && withShelf && (
                <div className={styles.row} style={{ marginTop: '6px' }}>
                  <span className={styles.label}>간격</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${styles.inputSmall}`}
                    value={shelfGap}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d+$/.test(v)) {
                        const sections = [...config.sections];
                        const sec = { ...sections[sIdx] };
                        const elArr = side === 'full' ? [...(sec.elements || [])] : side === 'left' ? [...(sec.leftElements || [])] : [...(sec.rightElements || [])];
                        if (elArr[0]?.type === 'rod') {
                          elArr[0] = { ...elArr[0], shelfGap: v === '' ? 0 : Math.min(350, parseInt(v, 10)) };
                        }
                        if (side === 'full') sec.elements = elArr;
                        else if (side === 'left') sec.leftElements = elArr;
                        else sec.rightElements = elArr;
                        sections[sIdx] = sec;
                        applyConfig({ ...config, sections });
                      }
                    }}
                  />
                  <span className={styles.unit}>mm</span>
                  <span style={{ fontSize: '11px', color: '#888' }}>상판~선반</span>
                </div>
              )}
              <div className={styles.row} style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                {canHaveShelf && withShelf ? '고정선반 아래에 옷봉이 설치됩니다' : '상판 바로 아래에 옷봉이 설치됩니다'}
              </div>
            </div>
          );
        })()}

        {/* 바지걸이: 상판 바로 아래에 자동 배치 */}
        {currentType === 'pants' && (
          <div className={styles.row} style={{ color: '#888', fontSize: '12px' }}>
            상판 바로 아래에 설치됩니다
          </div>
        )}

        {/* 선반 + 옷봉 토글 */}
        {currentType === 'shelf' && el.type === 'shelf' && (
          <>
            <div className={styles.row} style={{ marginTop: '6px' }}>
              <span className={styles.label}>옷봉</span>
              <div className={styles.toggleGroup}>
                <button
                  className={`${styles.toggleButton} ${!el.hasRod ? styles.active : ''}`}
                  onClick={() => handleShelfRodToggle(sIdx, side, false)}
                >
                  없음
                </button>
                <button
                  className={`${styles.toggleButton} ${el.hasRod ? styles.active : ''}`}
                  onClick={() => handleShelfRodToggle(sIdx, side, true)}
                >
                  추가
                </button>
              </div>
            </div>
            {el.hasRod && (
              <div className={styles.row} style={{ color: '#888', fontSize: '12px' }}>
                최상단 선반 바로 아래에 옷봉이 설치됩니다
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // 서브분할 영역 요소 편집기 (상부/하부)
  const renderSubSplitElementEditor = (
    sIdx: number,
    areaKey: string,
    subPart: 'upper' | 'lower',
    elements: CustomElement[] | undefined,
    subHeight: number,
  ) => {
    const el = elements?.[0] || { type: 'open' as const };
    const currentType = el.type;

    // 상부에는 서랍 불가
    const availableTypes = subPart === 'upper'
      ? (['open', 'shelf', 'rod'] as const)
      : (['open', 'shelf', 'drawer', 'rod', 'pants'] as const);

    return (
      <div>
        <div className={styles.elementSelector}>
          {availableTypes.map((type) => (
            <button
              key={type}
              className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
              onClick={() => handleSubSplitElementChange(sIdx, areaKey, subPart, type)}
            >
              {type === 'open' ? '비움' : type === 'shelf' ? '선반' : type === 'drawer' ? '서랍' : type === 'rod' ? '옷봉' : '바지걸이'}
            </button>
          ))}
        </div>

        {/* 선반 방식 선택 (고정/다보) - 서브분할 */}
        {currentType === 'shelf' && el.type === 'shelf' && (
          <div style={{ marginTop: '8px' }}>
            <div className={styles.row}>
              <span className={styles.label}>방식</span>
              <div className={styles.toggleGroup}>
                <button
                  className={`${styles.toggleButton} ${(el.shelfMethod || 'dowel') === 'fixed' ? styles.active : ''}`}
                  onClick={() => handleSubSplitShelfMethodChange(sIdx, areaKey, subPart, 'fixed')}
                >
                  고정선반
                </button>
                <button
                  className={`${styles.toggleButton} ${(el.shelfMethod || 'dowel') === 'dowel' ? styles.active : ''}`}
                  onClick={() => handleSubSplitShelfMethodChange(sIdx, areaKey, subPart, 'dowel')}
                >
                  다보선반
                </button>
              </div>
            </div>
            {(el.shelfMethod || 'dowel') === 'dowel' && (
              <div className={styles.row} style={{ marginTop: '4px' }}>
                <span className={styles.label}>앞 옵셋</span>
                <input
                  type="number"
                  className={`${styles.input} ${styles.inputSmall}`}
                  style={{ width: '60px' }}
                  value={el.shelfFrontInset ?? 30}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 0 && v <= 100) {
                      handleSubSplitShelfFrontInsetChange(sIdx, areaKey, subPart, v);
                    }
                  }}
                />
                <span className={styles.unit}>mm</span>
              </div>
            )}
          </div>
        )}

        {/* 옷봉 자동 배치 안내 */}
        {currentType === 'rod' && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
            상판 바로 아래에 설치됩니다
          </div>
        )}

        {/* 선반 + 옷봉 추가 안내 */}
        {currentType === 'shelf' && el.type === 'shelf' && el.hasRod && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
            최상단 선반 바로 아래에 옷봉이 설치됩니다
          </div>
        )}
      </div>
    );
  };

  // 섹션 편집 UI 렌더링
  const renderSectionEditor = (section: CustomSection, sIdx: number, areaSide?: 'left' | 'right') => {
    const innerW = furnitureWidth - 2 * panelThickness;
    const hasPartition = section.hasPartition || false;

    // areaSide가 지정되면 해당 영역의 요소 편집 + 상하 서브분할 표시
    if (areaSide) {
      const elements = areaSide === 'left' ? section.leftElements : section.rightElements;
      const subSplit = section.areaSubSplits?.[areaSide];
      const isSubSplit = subSplit?.enabled || false;
      const subSplitKey = `${sIdx}-${areaSide}`;

      // subPart가 지정되면 해당 서브영역의 요소 편집기만 표시
      if (focusedSubPart && isSubSplit && subSplit) {
        const subElements = focusedSubPart === 'upper' ? subSplit.upperElements : subSplit.lowerElements;
        const subHeight = focusedSubPart === 'lower' ? subSplit.lowerHeight : section.height - subSplit.lowerHeight;
        const subAreaW = areaSide === 'left'
          ? (section.partitionPosition || Math.round(innerW / 2)) - panelThickness / 2
          : innerW - (section.partitionPosition || Math.round(innerW / 2)) - panelThickness / 2;
        const otherSubHeight = focusedSubPart === 'lower' ? section.height - subSplit.lowerHeight : subSplit.lowerHeight;
        return (
          <div key={`${sIdx}-${areaSide}-${focusedSubPart}`}>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>치수</div>
              {/* 너비 (칸막이 위치 조절) */}
              <div className={styles.row}>
                <span className={styles.label}>너비</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={`${styles.input} ${styles.inputSmall}`}
                  value={partitionInputs[`${sIdx}-${areaSide}`] ?? Math.round(subAreaW).toString()}
                  onChange={(e) => {
                    setPartitionInputs((prev) => ({ ...prev, [`${sIdx}-${areaSide}`]: e.target.value }));
                  }}
                  onBlur={() => {
                    const val = parseInt(partitionInputs[`${sIdx}-${areaSide}`] || '0');
                    const minV = 100;
                    const maxV = innerW - 100 - panelThickness / 2;
                    const clamped = Math.max(minV, Math.min(maxV, isNaN(val) ? Math.round(innerW / 2) : val));
                    const newPos = areaSide === 'left'
                      ? clamped + panelThickness / 2
                      : innerW - clamped - panelThickness / 2;
                    const clampedPos = Math.max(100, Math.min(innerW - 100, Math.round(newPos)));
                    handlePartitionPosition(sIdx, clampedPos);
                    const leftW = clampedPos - panelThickness / 2;
                    const rightW = innerW - clampedPos - panelThickness / 2;
                    setPartitionInputs((prev) => ({
                      ...prev,
                      [`${sIdx}-left`]: Math.round(leftW).toString(),
                      [`${sIdx}-right`]: Math.round(rightW).toString(),
                    }));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={{ width: '70px' }}
                />
                <span className={styles.unit}>mm</span>
              </div>
              {/* 높이 (서브분할 높이 조절 가능) */}
              <div className={styles.row}>
                <span className={styles.label}>높이</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={`${styles.input} ${styles.inputSmall}`}
                  value={subSplitHeightInputs[`${subSplitKey}-${focusedSubPart}`] ?? Math.round(subHeight).toString()}
                  onChange={(e) => {
                    if (e.target.value === '' || /^\d+$/.test(e.target.value)) {
                      setSubSplitHeightInputs((prev) => ({ ...prev, [`${subSplitKey}-${focusedSubPart}`]: e.target.value }));
                    }
                  }}
                  onBlur={() => {
                    const raw = subSplitHeightInputs[`${subSplitKey}-${focusedSubPart}`];
                    if (!raw || raw === '') {
                      setSubSplitHeightInputs((prev) => ({ ...prev, [`${subSplitKey}-${focusedSubPart}`]: Math.round(subHeight).toString() }));
                      return;
                    }
                    const val = parseInt(raw);
                    const minV = 100;
                    const maxV = section.height - 100;
                    const clamped = Math.max(minV, Math.min(maxV, isNaN(val) ? Math.round(subHeight) : val));
                    // 입력한 값이 해당 subPart 높이 → lowerHeight 역산
                    const newLowerH = focusedSubPart === 'lower' ? clamped : section.height - clamped;
                    handleAreaSubSplitHeight(sIdx, areaSide, newLowerH);
                    setSubSplitHeightInputs((prev) => ({ ...prev, [`${subSplitKey}-${focusedSubPart}`]: clamped.toString() }));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={{ width: '70px' }}
                />
                <span className={styles.unit}>mm</span>
              </div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                {focusedSubPart === 'lower' ? '상부' : '하부'}: {Math.round(otherSubHeight)}mm
              </div>
              {/* 깊이 (섹션별) */}
              <div className={styles.row}>
                <span className={styles.label}>깊이</span>
                {config.sections.length > 1 ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${styles.inputSmall}`}
                    value={sectionDepthInputs[sIdx] ?? (sIdx === 0 ? (placedModule.lowerSectionDepth ?? furnitureDepth) : (placedModule.upperSectionDepth ?? furnitureDepth)).toString()}
                    onChange={(e) => handleSectionDepthInputChange(sIdx, e.target.value)}
                    onBlur={() => handleSectionDepthBlur(sIdx)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ width: '70px' }}
                  />
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${styles.inputSmall}`}
                    value={depthInput}
                    placeholder={`${MIN_DEPTH}-${MAX_DEPTH}`}
                    onChange={(e) => handleDepthInputChange(e.target.value)}
                    onBlur={handleDepthInputBlur}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ width: '70px' }}
                  />
                )}
                <span className={styles.unit}>mm</span>
              </div>
              {/* 깊이 줄이는 방향 (2섹션일 때만) */}
              {config.sections.length > 1 && (
                <div className={styles.row}>
                  <span className={styles.label}>방향</span>
                  <div className={styles.toggleGroup}>
                    <button
                      className={`${styles.toggleButton} ${(sIdx === 0 ? (placedModule.lowerSectionDepthDirection ?? 'front') : (placedModule.upperSectionDepthDirection ?? 'front')) === 'front' ? styles.active : ''}`}
                      onClick={() => {
                        const key = sIdx === 0 ? 'lowerSectionDepthDirection' : 'upperSectionDepthDirection';
                        updatePlacedModule(moduleId, { [key]: 'front' });
                      }}
                    >
                      앞에서
                    </button>
                    <button
                      className={`${styles.toggleButton} ${(sIdx === 0 ? (placedModule.lowerSectionDepthDirection ?? 'front') : (placedModule.upperSectionDepthDirection ?? 'front')) === 'back' ? styles.active : ''}`}
                      onClick={() => {
                        const key = sIdx === 0 ? 'lowerSectionDepthDirection' : 'upperSectionDepthDirection';
                        updatePlacedModule(moduleId, { [key]: 'back' });
                      }}
                    >
                      뒤에서
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                {focusedSubPart === 'upper' ? '상부' : '하부'} 내부 구조
              </div>
              <div className={styles.areaCard}>
                {renderSubSplitElementEditor(sIdx, areaSide, focusedSubPart, subElements, subHeight)}
              </div>
            </div>
          </div>
        );
      }

      // 영역 너비/높이 계산
      const areaW = areaSide === 'left'
        ? (section.partitionPosition || Math.round(innerW / 2)) - panelThickness / 2
        : innerW - (section.partitionPosition || Math.round(innerW / 2)) - panelThickness / 2;

      return (
        <div key={`${sIdx}-${areaSide}`}>
          {/* 영역 치수 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>치수</div>
            {/* 너비 (칸막이 위치 조절) */}
            <div className={styles.row}>
              <span className={styles.label}>너비</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputSmall}`}
                value={partitionInputs[`${sIdx}-${areaSide}`] ?? Math.round(areaW).toString()}
                onChange={(e) => {
                  setPartitionInputs((prev) => ({ ...prev, [`${sIdx}-${areaSide}`]: e.target.value }));
                }}
                onBlur={() => {
                  const val = parseInt(partitionInputs[`${sIdx}-${areaSide}`] || '0');
                  const minV = 100;
                  const maxV = innerW - 100 - panelThickness / 2;
                  const clamped = Math.max(minV, Math.min(maxV, isNaN(val) ? Math.round(innerW / 2) : val));
                  const newPos = areaSide === 'left'
                    ? clamped + panelThickness / 2
                    : innerW - clamped - panelThickness / 2;
                  const clampedPos = Math.max(100, Math.min(innerW - 100, Math.round(newPos)));
                  handlePartitionPosition(sIdx, clampedPos);
                  const leftW = clampedPos - panelThickness / 2;
                  const rightW = innerW - clampedPos - panelThickness / 2;
                  setPartitionInputs((prev) => ({
                    ...prev,
                    [`${sIdx}-left`]: Math.round(leftW).toString(),
                    [`${sIdx}-right`]: Math.round(rightW).toString(),
                  }));
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ width: '70px' }}
              />
              <span className={styles.unit}>mm</span>
            </div>
            {/* 높이 (2단분할: 상/하 중 어디서 줄일지 선택 가능, 단일: 전체 높이) */}
            <div className={styles.row}>
              <span className={styles.label}>높이</span>
              {config.sections.length > 1 ? (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${styles.inputSmall}`}
                    value={sectionHeightInputs[sIdx] ?? section.height.toString()}
                    onChange={(e) => handleSectionHeightInputChange(sIdx, e.target.value)}
                    onBlur={() => handleSectionHeightBlur(sIdx)}
                    onKeyDown={(e) => handleSectionHeightKeyDown(e, sIdx)}
                    style={{ width: '70px' }}
                  />
                  <span className={styles.unit}>mm</span>
                </>
              ) : (
                <>
                  <span className={styles.input} style={{ cursor: 'default', opacity: 0.7, width: '70px' }}>
                    {section.height}
                  </span>
                  <span className={styles.unit}>mm</span>
                </>
              )}
            </div>
            {/* 2단 분할 시 반대 섹션 높이 표시 */}
            {config.sections.length > 1 && (
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                {sIdx === 0 ? '상부' : '하부'}: {config.sections[1 - sIdx].height}mm
              </div>
            )}
            {/* 깊이 */}
            <div className={styles.row}>
              <span className={styles.label}>깊이</span>
              {config.sections.length > 1 ? (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${styles.inputSmall}`}
                    value={sectionDepthInputs[sIdx] ?? (sIdx === 0 ? (placedModule.lowerSectionDepth ?? furnitureDepth) : (placedModule.upperSectionDepth ?? furnitureDepth)).toString()}
                    placeholder={`${MIN_DEPTH}-${MAX_DEPTH}`}
                    onChange={(e) => handleSectionDepthInputChange(sIdx, e.target.value)}
                    onBlur={() => handleSectionDepthBlur(sIdx)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ width: '70px' }}
                  />
                  <span className={styles.unit}>mm</span>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${styles.inputSmall}`}
                    value={depthInput}
                    placeholder={`${MIN_DEPTH}-${MAX_DEPTH}`}
                    onChange={(e) => handleDepthInputChange(e.target.value)}
                    onBlur={handleDepthInputBlur}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ width: '70px' }}
                  />
                  <span className={styles.unit}>mm</span>
                </>
              )}
            </div>
            {/* 깊이 줄이는 방향 (2섹션일 때만) */}
            {config.sections.length > 1 && (
              <div className={styles.row}>
                <span className={styles.label}>방향</span>
                <div className={styles.toggleGroup}>
                  <button
                    className={`${styles.toggleButton} ${(sIdx === 0 ? (placedModule.lowerSectionDepthDirection ?? 'front') : (placedModule.upperSectionDepthDirection ?? 'front')) === 'front' ? styles.active : ''}`}
                    onClick={() => {
                      const key = sIdx === 0 ? 'lowerSectionDepthDirection' : 'upperSectionDepthDirection';
                      updatePlacedModule(moduleId, { [key]: 'front' });
                    }}
                  >
                    앞에서
                  </button>
                  <button
                    className={`${styles.toggleButton} ${(sIdx === 0 ? (placedModule.lowerSectionDepthDirection ?? 'front') : (placedModule.upperSectionDepthDirection ?? 'front')) === 'back' ? styles.active : ''}`}
                    onClick={() => {
                      const key = sIdx === 0 ? 'lowerSectionDepthDirection' : 'upperSectionDepthDirection';
                      updatePlacedModule(moduleId, { [key]: 'back' });
                    }}
                  >
                    뒤에서
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            {/* 상하분할 토글 */}
            <div className={styles.row}>
              <span className={styles.label}>상하분할</span>
              <div className={styles.toggleGroup}>
                <button
                  className={`${styles.toggleButton} ${!isSubSplit ? styles.active : ''}`}
                  onClick={() => handleAreaSubSplitToggle(sIdx, areaSide, false)}
                >
                  없음
                </button>
                <button
                  className={`${styles.toggleButton} ${isSubSplit ? styles.active : ''}`}
                  onClick={() => handleAreaSubSplitToggle(sIdx, areaSide, true)}
                >
                  추가
                </button>
              </div>
            </div>

            {isSubSplit && subSplit ? (
              <>
                {/* 서브분할 하부 높이 입력 */}
                <div className={styles.row}>
                  <span className={styles.label}>하부 높이</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles.input} ${styles.inputSmall}`}
                    value={subSplitHeightInputs[subSplitKey] ?? subSplit.lowerHeight.toString()}
                    onChange={(e) => {
                      setSubSplitHeightInputs((prev) => ({ ...prev, [subSplitKey]: e.target.value }));
                    }}
                    onBlur={() => {
                      const val = parseInt(subSplitHeightInputs[subSplitKey] || '0');
                      const minV = 100;
                      const maxV = section.height - 100;
                      const clamped = Math.max(minV, Math.min(maxV, isNaN(val) ? Math.round(section.height / 2) : val));
                      handleAreaSubSplitHeight(sIdx, areaSide, clamped);
                      setSubSplitHeightInputs((prev) => ({ ...prev, [subSplitKey]: clamped.toString() }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    style={{ width: '70px' }}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#999' }}>
                  상부: {section.height - subSplit.lowerHeight}mm / 하부: {subSplit.lowerHeight}mm
                </div>
              </>
            ) : (
              /* 서브분할 안 됨: 기존 요소 편집기 */
              <div className={styles.areaCard}>
                {renderElementEditor(sIdx, areaSide, elements, section.height)}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={sIdx}>
        {/* 치수 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            {config.sections.length > 1 ? (sIdx === 0 ? '하부 섹션' : '상부 섹션') : '섹션'} 치수
          </div>
          {/* 너비 */}
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
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              style={{ width: '70px' }}
            />
            <span className={styles.unit}>mm</span>
          </div>
          {widthError && <div className={styles.errorMessage}>{widthError}</div>}
          {/* 높이 */}
          <div className={styles.row}>
            <span className={styles.label}>높이</span>
            {config.sections.length > 1 ? (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  className={`${styles.input} ${styles.inputSmall}`}
                  value={sectionHeightInputs[sIdx] ?? section.height.toString()}
                  onChange={(e) => handleSectionHeightInputChange(sIdx, e.target.value)}
                  onBlur={() => handleSectionHeightBlur(sIdx)}
                  onKeyDown={(e) => handleSectionHeightKeyDown(e, sIdx)}
                  style={{ width: '70px' }}
                />
                <span className={styles.unit}>mm</span>
              </>
            ) : (
              <>
                <span className={styles.input} style={{ cursor: 'default', opacity: 0.7, width: '70px' }}>
                  {section.height}
                </span>
                <span className={styles.unit}>mm</span>
              </>
            )}
          </div>
          {config.sections.length > 1 && (
            <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
              {sIdx === 0 ? '상부' : '하부'}: {config.sections[1 - sIdx].height}mm
            </div>
          )}
          {/* 깊이 (2단분할: 섹션별 / 단일: 전체) */}
          <div className={styles.row}>
            <span className={styles.label}>깊이</span>
            {config.sections.length > 1 ? (
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputSmall}`}
                value={sectionDepthInputs[sIdx] ?? (sIdx === 0 ? (placedModule.lowerSectionDepth ?? furnitureDepth) : (placedModule.upperSectionDepth ?? furnitureDepth)).toString()}
                onChange={(e) => handleSectionDepthInputChange(sIdx, e.target.value)}
                onBlur={() => handleSectionDepthBlur(sIdx)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ width: '70px' }}
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${depthError ? styles.inputError : ''}`}
                value={depthInput}
                placeholder={`${MIN_DEPTH}-${MAX_DEPTH}`}
                onChange={(e) => handleDepthInputChange(e.target.value)}
                onBlur={handleDepthInputBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ width: '70px' }}
              />
            )}
            <span className={styles.unit}>mm</span>
          </div>
          {!config.sections.length && depthError && <div className={styles.errorMessage}>{depthError}</div>}
          {config.sections.length > 1 && (
            <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
              {sIdx === 0 ? '상부' : '하부'} 깊이: {sIdx === 0 ? (placedModule.upperSectionDepth ?? furnitureDepth) : (placedModule.lowerSectionDepth ?? furnitureDepth)}mm
            </div>
          )}
          {/* 깊이 줄이는 방향 (2섹션일 때만) */}
          {config.sections.length > 1 && (
            <div className={styles.row}>
              <span className={styles.label}>방향</span>
              <div className={styles.toggleGroup}>
                <button
                  className={`${styles.toggleButton} ${(sIdx === 0 ? (placedModule.lowerSectionDepthDirection ?? 'front') : (placedModule.upperSectionDepthDirection ?? 'front')) === 'front' ? styles.active : ''}`}
                  onClick={() => {
                    const key = sIdx === 0 ? 'lowerSectionDepthDirection' : 'upperSectionDepthDirection';
                    updatePlacedModule(moduleId, { [key]: 'front' });
                  }}
                >
                  앞에서
                </button>
                <button
                  className={`${styles.toggleButton} ${(sIdx === 0 ? (placedModule.lowerSectionDepthDirection ?? 'front') : (placedModule.upperSectionDepthDirection ?? 'front')) === 'back' ? styles.active : ''}`}
                  onClick={() => {
                    const key = sIdx === 0 ? 'lowerSectionDepthDirection' : 'upperSectionDepthDirection';
                    updatePlacedModule(moduleId, { [key]: 'back' });
                  }}
                >
                  뒤에서
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.section}>
        <div className={styles.sectionTitle}>내부 구조</div>

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

        {/* 칸막이 좌/우 거리 입력 */}
        {hasPartition && (
          <>
            <div className={styles.row}>
              <span className={styles.label}>좌</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputSmall}`}
                value={partitionInputs[`${sIdx}-left`] ?? (section.partitionPosition || Math.round(innerW / 2)).toString()}
                onChange={(e) => {
                  setPartitionInputs((prev) => ({ ...prev, [`${sIdx}-left`]: e.target.value }));
                }}
                onBlur={() => {
                  const val = parseInt(partitionInputs[`${sIdx}-left`] || '0');
                  const minV = 100;
                  const maxV = innerW - 100;
                  const clamped = Math.max(minV, Math.min(maxV, isNaN(val) ? Math.round(innerW / 2) : val));
                  handlePartitionPosition(sIdx, clamped);
                  setPartitionInputs((prev) => ({
                    ...prev,
                    [`${sIdx}-left`]: clamped.toString(),
                    [`${sIdx}-right`]: (innerW - clamped).toString(),
                  }));
                }}
                style={{ width: '70px' }}
              />
              <span className={styles.unit}>mm</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>우</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputSmall}`}
                value={partitionInputs[`${sIdx}-right`] ?? (innerW - (section.partitionPosition || Math.round(innerW / 2))).toString()}
                onChange={(e) => {
                  setPartitionInputs((prev) => ({ ...prev, [`${sIdx}-right`]: e.target.value }));
                }}
                onBlur={() => {
                  const val = parseInt(partitionInputs[`${sIdx}-right`] || '0');
                  const minV = 100;
                  const maxV = innerW - 100;
                  const clamped = Math.max(minV, Math.min(maxV, isNaN(val) ? Math.round(innerW / 2) : val));
                  const newPos = innerW - clamped;
                  handlePartitionPosition(sIdx, newPos);
                  setPartitionInputs((prev) => ({
                    ...prev,
                    [`${sIdx}-left`]: newPos.toString(),
                    [`${sIdx}-right`]: clamped.toString(),
                  }));
                }}
                style={{ width: '70px' }}
              />
              <span className={styles.unit}>mm</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>앞 오프셋</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputSmall}`}
                value={section.partitionFrontInset ?? 0}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) {
                    const sections = [...config.sections];
                    const sec = { ...sections[sIdx] };
                    sec.partitionFrontInset = v === '' ? 0 : Math.min(furnitureDepth - 100, parseInt(v, 10));
                    sections[sIdx] = sec;
                    applyConfig({ ...config, sections });
                  }
                }}
                style={{ width: '70px' }}
              />
              <span className={styles.unit}>mm</span>
            </div>
          </>
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
      </div>
    );
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} style={panelStyle}>
        {/* 헤더 */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            {(() => {
              if (focusedSectionIndex === undefined) return '커스터마이징 가구 편집';
              const sec = config.sections[focusedSectionIndex];
              if (!sec) return '섹션 설정';

              // 영역 높이 계산
              let areaH = sec.height;
              if (focusedSubPart && focusedAreaSide) {
                const subSplit = sec.areaSubSplits?.[focusedAreaSide];
                if (subSplit?.enabled) {
                  areaH = focusedSubPart === 'lower' ? subSplit.lowerHeight : sec.height - subSplit.lowerHeight;
                }
              }

              // 영역 너비 계산
              const innerW = furnitureWidth - 2 * panelThickness;
              let areaW = innerW;
              if (focusedAreaSide && sec.hasPartition && sec.partitionPosition) {
                areaW = focusedAreaSide === 'left'
                  ? sec.partitionPosition - panelThickness / 2
                  : innerW - sec.partitionPosition - panelThickness / 2;
              }

              // 라벨 조합
              const sectionLabel = config.sections.length === 1 ? '섹션' : (focusedSectionIndex === 0 ? '하부섹션' : '상부섹션');
              const sideLabel = focusedAreaSide ? ` ${focusedAreaSide === 'left' ? '좌측' : '우측'}` : '';
              const subPartLabel = focusedSubPart ? (focusedSubPart === 'upper' ? ' 상부' : ' 하부') : '';

              return `${sectionLabel}${sideLabel}${subPartLabel} (${Math.round(areaW)}×${Math.round(areaH)})`;
            })()}
          </span>
          <button className={styles.closeButton} onClick={handleCancel}>
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className={styles.body}>
          {focusedSectionIndex !== undefined ? (
            focusedAreaSide ? (
              /* 칸막이 좌/우 영역 톱니 아이콘 클릭: 해당 영역만 편집 */
              config.sections[focusedSectionIndex] &&
                renderSectionEditor(config.sections[focusedSectionIndex], focusedSectionIndex, focusedAreaSide)
            ) : (
            /* 톱니 아이콘 클릭: 해당 섹션 세부설정 (칸막이 + 내부 요소) */
            config.sections[focusedSectionIndex] &&
              renderSectionEditor(config.sections[focusedSectionIndex], focusedSectionIndex)
            )
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

              {/* 섹션 분할 (상/하만 지원) */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>섹션 분할</div>
                <div className={styles.row}>
                  <span className={styles.label}>상,하</span>
                  <div className={styles.toggleGroup}>
                    <button
                      className={`${styles.toggleButton} ${!config.splitDirection ? styles.active : ''}`}
                      onClick={() => {
                        if (config.splitDirection) handleSectionSplit(false);
                      }}
                    >
                      없음
                    </button>
                    <button
                      className={`${styles.toggleButton} ${config.splitDirection === 'topBottom' ? styles.active : ''}`}
                      onClick={() => handleSectionSplit(true)}
                    >
                      분할
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.divider} />

              {/* 섹션 설정: 높이 + 타입 */}
              {config.sections.length > 1 ? (
                /* 2단 분할: 상부→하부 순서 */
                [...config.sections].reverse().map((section, _i) => {
                  const realIdx = config.sections.length - 1 - _i;
                  const isUpper = realIdx === 1;
                  const { type: currentType, drawerCount } = getSectionTypeInfo(section);
                  const typeOptions = isUpper
                    ? (['open', 'shelf', 'rod'] as const)
                    : (['open', 'shelf', 'drawer', 'rod'] as const);

                  return (
                    <div
                      key={realIdx}
                      className={styles.section}
                      onMouseEnter={() => moduleId && setHighlightedSection(`${moduleId}-${realIdx}`)}
                      onMouseLeave={() => setHighlightedSection(null)}
                    >
                      <div className={styles.sectionTitle}>
                        {isUpper ? '상부 섹션' : '하부 섹션'}
                      </div>
                      <div className={styles.row}>
                        <span className={styles.label}>높이</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`${styles.input} ${styles.inputSmall}`}
                          value={sectionHeightInputs[realIdx] ?? section.height.toString()}
                          onChange={(e) => handleSectionHeightInputChange(realIdx, e.target.value)}
                          onBlur={() => handleSectionHeightBlur(realIdx)}
                          onKeyDown={(e) => handleSectionHeightKeyDown(e, realIdx)}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                      <div className={styles.row} style={{ marginTop: '8px' }}>
                        <span className={styles.label}>타입</span>
                      </div>
                      <div className={styles.elementSelector}>
                        {typeOptions.map((type) => (
                          <button
                            key={type}
                            className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
                            onClick={() => handleSectionTypeChange(realIdx, type, type === 'drawer' ? 2 : undefined)}
                          >
                            {type === 'open' ? '비움' : type === 'shelf' ? '선반장' : type === 'drawer' ? '서랍장' : '옷장'}
                          </button>
                        ))}
                      </div>
                      {/* 서랍장: 단수 선택 (하부만) */}
                      {currentType === 'drawer' && !isUpper && (
                        <div style={{ marginTop: '8px' }}>
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
                          <button
                            style={{
                              marginTop: '6px', width: '100%', padding: '6px 10px',
                              border: '1px solid #4A90D9', borderRadius: '6px',
                              background: '#4A90D9', color: '#fff',
                              fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s'
                            }}
                            onClick={() => handleEvenFillDrawersForSection(realIdx)}
                          >
                            균등 채움
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                /* 단일 섹션 타입 선택 */
                (() => {
                  const section = config.sections[0];
                  const { type: currentType, drawerCount } = getSectionTypeInfo(section);
                  return (
                    <div className={styles.section}>
                      <div className={styles.sectionTitle}>내부 구조</div>
                      <div className={styles.elementSelector}>
                        {(['open', 'shelf', 'drawer', 'rod'] as const).map((type) => (
                          <button
                            key={type}
                            className={`${styles.elementButton} ${currentType === type ? styles.active : ''}`}
                            onClick={() => handleSectionTypeChange(0, type, type === 'drawer' ? 2 : undefined)}
                          >
                            {type === 'open' ? '비움' : type === 'shelf' ? '선반장' : type === 'drawer' ? '서랍장' : '옷장'}
                          </button>
                        ))}
                      </div>
                      {/* 서랍장: 단수 선택 */}
                      {currentType === 'drawer' && (
                        <div style={{ marginTop: '8px' }}>
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
                          <button
                            style={{
                              marginTop: '6px', width: '100%', padding: '6px 10px',
                              border: '1px solid #4A90D9', borderRadius: '6px',
                              background: '#4A90D9', color: '#fff',
                              fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s'
                            }}
                            onClick={() => handleEvenFillDrawersForSection(0)}
                          >
                            균등 채움
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              <div className={styles.divider} />

              {/* 안내 */}
              <div className={styles.section}>
                <p className={styles.helpText} style={{ margin: '0', fontSize: '12px', color: '#999' }}>
                  각 섹션의 세부 구조(칸막이, 선반 높이, 서랍 높이 등)는 3D 뷰에서 해당 섹션의 ⚙️ 아이콘을 클릭하여 설정하세요.
                </p>
              </div>
            </>
          )}
        </div>

        {/* 섹션 설정 하단 버튼 (톱니 메뉴에서 표시) */}
        {focusedSectionIndex !== undefined && moduleId && (
          <div className={styles.footer}>
            <button
              className={`${styles.footerButton} ${styles.secondaryButton}`}
              onClick={() => openCustomizableEditPopup(moduleId)}
            >
              취소
            </button>
            <button
              className={`${styles.footerButton} ${styles.primaryButton}`}
              onClick={() => openCustomizableEditPopup(moduleId)}
            >
              확인
            </button>
          </div>
        )}

        {/* My캐비닛 저장 + 하단 버튼 (연필 메뉴에서만 표시) */}
        {focusedSectionIndex === undefined && (
          <>
            <div style={{ padding: '0 20px 8px', flexShrink: 0 }}>
              <button className={styles.saveButton} onClick={handleSaveToCabinet}>
                {editingCabinetId ? 'My캐비닛 수정 저장' : 'My캐비닛에 저장'}
              </button>
            </div>
            <div className={styles.footer} style={{ flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className={`${styles.footerButton} ${styles.secondaryButton}`} onClick={handleCancel}>
                  취소
                </button>
                <button className={`${styles.footerButton} ${styles.primaryButton}`} onClick={closeAllPopups}>
                  확인
                </button>
              </div>
              <button
                onClick={handleDelete}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--theme-text-tertiary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px 0',
                  textDecoration: 'underline',
                  alignSelf: 'center',
                }}
              >
                가구 삭제
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CustomizablePropertiesPanel;
