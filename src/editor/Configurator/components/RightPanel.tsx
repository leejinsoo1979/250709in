import React, { useState, useEffect } from 'react';
import styles from './RightPanel.module.css';
import commonStyles from '@/editor/shared/controls/styles/common.module.css';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore, DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import ColumnProperties from '@/editor/shared/controls/structure/ColumnProperties';
import { SpaceCalculator, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useTranslation } from '@/i18n/useTranslation';
import PreviewViewer from './PreviewViewer';

// Window 인터페이스 확장
declare global {
  interface Window {
    handleSpaceInfoUpdate?: (updates: any) => void;
  }
}

export type RightPanelTab = 'placement' | 'module';

export const ModuleContent: React.FC = () => {
  const { activePopup } = useUIStore();
  const { spaceInfo } = useSpaceConfigStore();
  
  console.log('🔍 ModuleContent 렌더링:', { 
    activePopup,
    columnsCount: spaceInfo.columns?.length || 0,
    columns: spaceInfo.columns,
    hasSelectedColumn: activePopup.type === 'column' && !!activePopup.id
  });
  
  // column 팝업이 활성화되었으면 기둥 속성 표시
  if (activePopup.type === 'column' && activePopup.id) {
    const column = spaceInfo.columns?.find((col: any) => col.id === activePopup.id);
    console.log('✅ 기둥 속성 표시:', { 
      columnId: activePopup.id,
      foundColumn: !!column,
      column,
      allColumns: spaceInfo.columns
    });
    
    if (column) {
      console.log('✅ ColumnProperties 컴포넌트 렌더링:', column);
      return <ColumnProperties columnId={activePopup.id} />;
    } else {
      console.error('❌ 기둥을 찾을 수 없음:', activePopup.id);
      return (
        <div className={styles.placeholder}>
        </div>
      );
    }
  }
  
  // selectedColumnForProperties가 없으면 기본 메시지 표시
  console.log('🔍 ModuleContent - selectedColumnForProperties가 없음');
  return (
    <div className={styles.placeholder}>
    </div>
  );
};

interface FormControlProps {
  label: string;
  children: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
}

const FormControl: React.FC<FormControlProps> = ({ 
  label, 
  children, 
  expanded = true, 
  onToggle 
}) => (
  <div className={styles.formControl}>
    <div className={styles.formHeader} onClick={onToggle}>
      <div className={styles.formIndicator}></div>
      <h3 className={styles.formLabel}>{label}</h3>
      {onToggle && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className={`${styles.expandIcon} ${expanded ? styles.expanded : ''}`}
        >
          <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2.5"/>
        </svg>
      )}
    </div>
    {expanded && <div className={styles.formContent}>{children}</div>}
  </div>
);

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = 'mm'
}) => (
  <div className={styles.numberInput}>
    <div className={styles.inputLabel}>{label}</div>
    <div className={styles.inputGroup}>
      <button 
        className={styles.inputButton}
        onClick={() => onChange(Math.max(min || 0, value - step))}
        disabled={value <= (min || 0)}
      >
        −
      </button>
      <div className={styles.inputField}>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const newValue = Number(e.target.value);
            const clampedValue = Math.max(min || 0, Math.min(max || Infinity, newValue));
            onChange(clampedValue);
          }}
          min={min}
          max={max}
          step={step}
          style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-surface)' }}
        />
        <span className={styles.inputUnit}>{unit}</span>
      </div>
      <button 
        className={styles.inputButton}
        onClick={() => onChange(Math.min(max || Infinity, value + step))}
        disabled={value >= (max || Infinity)}
      >
        +
      </button>
    </div>
  </div>
);

interface ToggleGroupProps {
  options: { id: string; label: string }[];
  selected: string;
  onChange: (id: string) => void;
}

const ToggleGroup: React.FC<ToggleGroupProps> = ({ options, selected, onChange }) => {
  return (
    <div className={commonStyles.toggleButtonGroup}>
      {options.map((option) => (
        <button
          key={option.id}
          className={`${commonStyles.toggleButton} ${selected === option.id ? commonStyles.toggleButtonActive : ''}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

// 도어 슬라이더 컴포넌트
interface DoorSliderProps {
  value: number;
  onChange: (value: number) => void;
  width: number; // 공간 넓이
  label?: string; // 좌측 라벨 (메인구간, 단내림구간 등)
}

const DoorSlider: React.FC<DoorSliderProps> = ({ value, onChange, width, label }) => {
  const [isDragging, setIsDragging] = useState(false);
  const sliderTrackRef = React.useRef<HTMLDivElement>(null);
  const { spaceInfo } = useSpaceConfigStore();
  
  // 도어 1개 너비 (588mm)
  const DOOR_WIDTH = 588;
  
  // 단내림이 활성화된 경우 메인 구간의 폭 계산
  const getMainZoneWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      // 단내림 활성화 시 전체 폭에서 단내림 폭을 뺀 나머지가 메인 구간
      const mainZoneWidth = width - (spaceInfo.droppedCeiling.width || 1300);
      console.log('🎯 메인 구간 폭 계산 (DoorSlider):', {
        totalWidth: width,
        droppedWidth: spaceInfo.droppedCeiling.width || 1300,
        mainZoneWidth
      });
      return mainZoneWidth;
    }
    return width;
  };
  
  // 단내림 구간의 폭 계산 (단내림 구간 도어개수 슬라이더용)
  const getDroppedCeilingWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      return spaceInfo.droppedCeiling.width || 1300;
    }
    return width;
  };
  
  // 공간 넓이 기반 최소/최대 도어 개수 계산
  const calculateDoorRange = (spaceWidth: number, isForDroppedCeiling: boolean = false) => {
    // 단내림이 활성화된 경우의 계산 로직
    if (spaceInfo.droppedCeiling?.enabled) {
      const frameThickness = 50; // 프레임 두께
      const normalAreaInternalWidth = spaceWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600; // 슬롯 최대 너비 제한
      const MIN_SLOT_WIDTH = 400; // 슬롯 최소 너비 제한
      
      // 최소 필요 슬롯 개수 (600mm 제한)
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);
      // 최대 가능 슬롯 개수 (400mm 제한)
      const maxPossibleSlots = Math.floor(normalAreaInternalWidth / MIN_SLOT_WIDTH);
      
      console.log('🎯 슬롯 계산 (단내림 활성화):', {
        isForDroppedCeiling,
        구간: isForDroppedCeiling ? '단내림 구간' : '메인 구간',
        spaceWidth,
        normalAreaInternalWidth,
        minRequiredSlots,
        maxPossibleSlots,
        maxSlotWidth: MAX_SLOT_WIDTH,
        minSlotWidth: MIN_SLOT_WIDTH
      });
      
      return {
        min: Math.max(1, minRequiredSlots),
        max: Math.max(minRequiredSlots, maxPossibleSlots),
        ideal: Math.max(minRequiredSlots, Math.round(normalAreaInternalWidth / 500))
      };
    }
    
    // 단내림이 비활성화된 경우: SpaceCalculator 기반으로 실제 내부 너비 사용
    const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
    const limits = SpaceCalculator.getColumnCountLimits(internalWidth);

    // 이상적인 도어 개수 (500mm 기준)
    const idealDoorCount = Math.max(limits.minColumns, Math.round(internalWidth / 500));

    return {
      min: limits.minColumns,
      max: limits.maxColumns,
      ideal: idealDoorCount
    };
  };
  
  // 도어 범위 계산 - 단내림 구간의 도어개수 슬라이더인지 확인
  // 단내림 구간 슬라이더는 width가 단내림 폭과 정확히 같을 때
  const isDroppedCeilingSlider = spaceInfo.droppedCeiling?.enabled && 
    width === (spaceInfo.droppedCeiling.width || 1300);
  
  console.log('🔍 슬라이더 타입 확인:', {
    width,
    droppedWidth: spaceInfo.droppedCeiling?.width,
    isDroppedCeilingSlider,
    enabled: spaceInfo.droppedCeiling?.enabled
  });
  
  let doorRange;
  if (isDroppedCeilingSlider) {
    // 단내림 구간의 도어개수 슬라이더인 경우
    doorRange = calculateDoorRange(width, true); // 단내림 구간임을 명시
    console.log('🎯 단내림 구간 도어개수 슬라이더:', {
      width,
      droppedCeilingWidth: spaceInfo.droppedCeiling?.width,
      doorRange,
      value,
      isDroppedCeilingSlider
    });
  } else {
    // 메인 구간의 도어개수 슬라이더인 경우
    const mainZoneWidth = getMainZoneWidth();
    doorRange = calculateDoorRange(mainZoneWidth, false); // 메인 구간임을 명시
    console.log('🎯 메인 구간 도어개수 슬라이더:', {
      mainZoneWidth,
      doorRange,
      value,
      isDroppedCeilingSlider
    });
  }
  
  const minDoors = doorRange.min;
  const maxDoors = doorRange.max;
  
  // 현재 값이 범위를 벗어나면 조정
  const clampedValue = Math.max(minDoors, Math.min(maxDoors, value));
  
  // 슬라이더 위치 계산 (0-100%)
  const getSliderPosition = (doorCount: number) => {
    if (maxDoors === minDoors) return 0;
    return ((doorCount - minDoors) / (maxDoors - minDoors)) * 100;
  };
  
  // 위치에서 도어 개수 계산
  const getDoorCountFromPosition = React.useCallback((position: number) => {
    const normalizedPosition = Math.max(0, Math.min(100, position));
    const doorCount = Math.round(minDoors + (normalizedPosition / 100) * (maxDoors - minDoors));
    return Math.max(minDoors, Math.min(maxDoors, doorCount));
  }, [minDoors, maxDoors]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    
    // 클릭 시 바로 위치 계산하여 값 변경 - sliderTrackRef 사용
    if (sliderTrackRef.current) {
      const rect = sliderTrackRef.current.getBoundingClientRect();
      const position = ((e.clientX - rect.left) / rect.width) * 100;
      const newDoorCount = getDoorCountFromPosition(position);
      
      if (newDoorCount !== value) {
        onChange(newDoorCount);
      }
    }
  };
  
  const handleMouseMove = React.useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!isDragging || !sliderTrackRef.current) return;
    
    const rect = sliderTrackRef.current.getBoundingClientRect();
    const position = ((e.clientX - rect.left) / rect.width) * 100;
    const newDoorCount = getDoorCountFromPosition(position);
    
    if (newDoorCount !== value) {
      onChange(newDoorCount);
    }
  }, [isDragging, value, onChange, getDoorCountFromPosition]);
  
  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);
  
  React.useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
      const handleGlobalMouseUp = () => handleMouseUp();
      
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      // 드래그 중 텍스트 선택 방지
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  // 값이 범위를 벗어나면 자동 조정
  React.useEffect(() => {
    if (clampedValue !== value) {
      onChange(clampedValue);
    }
  }, [clampedValue, value]);

  // width 또는 단내림 설정 변경 시 현재 값이 새로운 범위를 벗어나면 자동 조정
  React.useEffect(() => {
    const mainZoneWidth = isDroppedCeilingSlider ? width : getMainZoneWidth();
    const range = calculateDoorRange(mainZoneWidth, isDroppedCeilingSlider);
    
    // 단내림이 활성화된 경우 메인 구간의 도어 개수가 너무 적으면 자동으로 증가
    if (spaceInfo.droppedCeiling?.enabled) {
      const frameThickness = 50; // 프레임 두께
      const normalAreaInternalWidth = mainZoneWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);
      
      if (value < minRequiredSlots) {
        console.log(`🔧 단내림 활성화 시 메인 구간 도어 개수 자동 조정: ${value} → ${minRequiredSlots}`);
        onChange(minRequiredSlots);
        return;
      }
    }
    
    if (value < range.min || value > range.max) {
      const newValue = Math.max(range.min, Math.min(range.max, value));
      onChange(newValue);
    }
  }, [width, value, spaceInfo.droppedCeiling]);
  
  // 슬라이더 라벨 생성 (동적)
  const generateLabels = () => {
    const doorCount = maxDoors - minDoors + 1;
    
    console.log('🎯 DoorSlider 라벨 생성:', {
      minDoors,
      maxDoors,
      doorCount,
      clampedValue
    });
    
    if (doorCount <= 8) {
      // 컬럼 수가 8개 이하면 모든 값 표시
      const labels = [];
      for (let i = minDoors; i <= maxDoors; i++) {
        labels.push(i);
      }
      console.log('🎯 생성된 라벨:', labels);
      return labels;
    } else {
      // 컬럼 수가 많으면 대표값들만 표시
      const labels = [];
      const step = Math.ceil(doorCount / 7);
      
      // minDoors부터 시작하되 maxDoors를 초과하지 않도록
      for (let i = minDoors; i <= maxDoors; i += step) {
        if (i <= maxDoors) {
          labels.push(i);
        }
      }
      
      // 마지막 값이 maxDoors가 아니고, 마지막 라벨이 maxDoors보다 작으면 maxDoors 추가
      if (labels.length > 0 && labels[labels.length - 1] < maxDoors) {
        labels.push(maxDoors);
      }
      
      console.log('🎯 생성된 라벨:', labels);
      return labels;
    }
  };
  
  const labels = generateLabels();
  const sliderPosition = getSliderPosition(clampedValue);
  
  console.log('🎯 DoorSlider 렌더링:', {
    labels,
    sliderPosition,
    clampedValue,
    minDoors,
    maxDoors
  });
  
  return (
    <div className={styles.doorSlider} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {label && (
        <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)', fontWeight: 500, flexShrink: 0, minWidth: '40px' }}>
          {label}
        </span>
      )}
      {/* 컬럼 수 버튼 */}
      <div className={styles.sliderLabels} style={{ flex: 1 }}>
        {labels.map((num) => (
          <span
            key={num}
            className={num === clampedValue ? styles.active : ''}
            onClick={() => onChange(num)}
          >
            {num}
          </span>
        ))}
      </div>
    </div>
  );
};

// 컬러 휠 컴포넌트
const ColorWheel: React.FC = () => (
  <div className={styles.colorWheel}>
    <div className={styles.colorWheelCircle}>
      <div className={styles.colorWheelSVG}>
        <svg width="148" height="148" viewBox="0 0 148 148">
          <defs>
            <linearGradient id="colorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff0000" />
              <stop offset="16.67%" stopColor="#ff8800" />
              <stop offset="33.33%" stopColor="#ffff00" />
              <stop offset="50%" stopColor="#00ff00" />
              <stop offset="66.67%" stopColor="#0088ff" />
              <stop offset="83.33%" stopColor="#4400ff" />
              <stop offset="100%" stopColor="#ff0088" />
            </linearGradient>
          </defs>
          <circle cx="74" cy="74" r="70" fill="url(#colorGradient)" />
          <circle cx="74" cy="74" r="30" fill="#ffffff" />
        </svg>
      </div>
      <div className={styles.colorSelector}></div>
    </div>
    <div className={styles.colorSlider}>
      <div className={styles.sliderHandle}></div>
    </div>
    <div className={styles.colorPreview}>
      <div className={styles.colorValue}># F8F8F8</div>
    </div>
  </div>
);

// 슬라이더 컴포넌트 추가
interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (val) => `${val}`
}) => {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div className={styles.sliderContainer}>
      <div className={styles.sliderTrack}>
        <div 
          className={styles.sliderFill} 
          style={{ width: `${percentage}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={styles.sliderInput}
        />
      </div>
      <div className={styles.sliderValue}>{format(value)}</div>
    </div>
  );
};

interface RightPanelProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  isOpen: boolean;
  onToggle: () => void;
  
  // 설치 타입
  installType: string;
  onInstallTypeChange: (type: string) => void;
  
  // 공간 설정
  width: number;
  height: number;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  
  // 단내림
  hasStep: boolean;
  onStepToggle: () => void;
  
  // 컬럼 수
  doorCount: number;
  onDoorCountChange: (count: number) => void;
  
  // 바닥 마감재
  hasFloorFinish: boolean;
  onFloorFinishToggle: () => void;
  
  // 받침대
  hasBase: boolean;
  onBaseToggle: () => void;
  baseHeight: number;
  baseDepth: number;
  onBaseHeightChange: (height: number) => void;
  onBaseDepthChange: (depth: number) => void;

  // 프레임 속성
  frameType: 'surround' | 'no-surround';
  onFrameTypeChange: (type: 'surround' | 'no-surround') => void;
}

const RightPanel: React.FC<RightPanelProps> = ({
  activeTab,
  onTabChange,
  isOpen,
  onToggle,
  installType,
  onInstallTypeChange,
  width,
  height,
  onWidthChange,
  onHeightChange,
  hasStep,
  onStepToggle,
  doorCount,
  onDoorCountChange,
  hasFloorFinish,
  onFloorFinishToggle,
  hasBase,
  onBaseToggle,
  baseHeight,
  baseDepth,
  onBaseHeightChange,
  onBaseDepthChange,
  frameType,
  onFrameTypeChange
}) => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules, clearAllModules } = useFurnitureStore();
  const { setActiveDroppedCeilingTab } = useUIStore();
  const { t, currentLanguage } = useTranslation();

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['space', 'layoutMode', 'layout'])
  );
  
  // 초기 렌더링 시 UIStore 동기화
  useEffect(() => {
    if (spaceInfo.droppedCeiling?.enabled) {
      setActiveDroppedCeilingTab(activeTab === 'placement' ? 'main' : 'dropped');
    }
  }, [activeTab, spaceInfo.droppedCeiling?.enabled, setActiveDroppedCeilingTab]);

  // 컬럼 수 범위 계산
  const DOOR_WIDTH = 588;
  
  // 단내림이 활성화된 경우 메인 구간의 폭 계산
  const getMainZoneWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      // 단내림 활성화 시 전체 폭에서 단내림 폭을 뺀 나머지가 메인 구간
      const mainZoneWidth = width - (spaceInfo.droppedCeiling.width || 1300);
      console.log('🎯 메인 구간 폭 계산 (RightPanel):', {
        totalWidth: width,
        droppedWidth: spaceInfo.droppedCeiling.width || 1300,
        mainZoneWidth
      });
      return mainZoneWidth;
    }
    return width;
  };
  
  const calculateDoorRange = (_spaceWidth: number) => {
    // SpaceCalculator 기반으로 실제 내부 너비 사용
    const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
    const limits = SpaceCalculator.getColumnCountLimits(internalWidth);

    const idealDoorCount = Math.max(limits.minColumns, Math.round(internalWidth / 500));

    return {
      min: limits.minColumns,
      max: limits.maxColumns,
      ideal: idealDoorCount
    };
  };

  // width 또는 단내림 설정 변경 시 doorCount 자동 조정
  React.useEffect(() => {
    const mainZoneWidth = getMainZoneWidth();
    const range = calculateDoorRange(mainZoneWidth);
    if (doorCount < range.min || doorCount > range.max) {
      // 현재 doorCount가 새로운 범위를 벗어나면 가장 가까운 유효한 값으로 조정
      const newDoorCount = Math.max(range.min, Math.min(range.max, doorCount));
      onDoorCountChange(newDoorCount);
    }
  }, [width, doorCount, onDoorCountChange, spaceInfo.droppedCeiling]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };


  
  // 메인 구간의 폭을 기준으로 도어 범위 계산
  const mainZoneWidth = getMainZoneWidth();
  const doorRange = calculateDoorRange(mainZoneWidth);
  const minDoors = doorRange.min;
  const maxDoors = doorRange.max;

  const tabs = spaceInfo.droppedCeiling?.enabled ? [
    { id: 'placement' as RightPanelTab, label: t('space.mainSection') },
    { id: 'module' as RightPanelTab, label: t('space.droppedSection') }
  ] : [
    { id: 'placement' as RightPanelTab, label: '배치속성' },
    { id: 'module' as RightPanelTab, label: '배치모듈' }
  ];

  const installTypes = [
    { id: 'builtin', label: t('space.wallMount') },
    { id: 'semistanding', label: t('space.semiStanding') },
    { id: 'freestanding', label: t('space.standing') }
  ];

  const materialOptions = React.useMemo(() => [
    { id: 'white', label: t('material.white') },
    { id: 'melamine', label: t('material.melamine') },
    { id: 'premium', label: t('material.premium') }
  ], [t, currentLanguage]);

  const floorOptions = React.useMemo(() => {
    const options = [
      { id: 'yes', label: t('common.enabled') },
      { id: 'no', label: t('common.none') }
    ];
    return options;
  }, [t, currentLanguage]);

  const frameTypeOptions = React.useMemo(() => [
    { id: 'surround', label: t('space.surround') },
    { id: 'no-surround', label: t('space.noSurround') }
  ], [t, currentLanguage]);

  // 단내림 위치 옵션
  const droppedCeilingPositionOptions = React.useMemo(() => [
    { id: 'left', label: t('furniture.left') },
    { id: 'right', label: t('furniture.right') }
  ], [t, currentLanguage]);

  return (
    <div className={`${styles.rightPanel} ${isOpen ? styles.open : ''}`}>
      {/* 미리보기 뷰어 */}
      <PreviewViewer />

      {/* 탭 헤더 */}
      <div className={styles.tabHeader}>
        <div className={styles.tabGroup}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => {
                onTabChange(tab.id);
                // 단내림이 활성화된 경우 UIStore 업데이트
                if (spaceInfo.droppedCeiling?.enabled) {
                  const newTab = tab.id === 'placement' ? 'main' : 'dropped';
                  console.log('🎯 RightPanel 탭 클릭 - activeDroppedCeilingTab 설정:', {
                    clickedTabId: tab.id,
                    newActiveTab: newTab,
                    droppedEnabled: spaceInfo.droppedCeiling?.enabled
                  });
                  setActiveDroppedCeilingTab(newTab);
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 패널 컨텐츠 */}
      <div className={styles.panelContent}>
        {activeTab === 'placement' && (
          <div className={styles.formContainer}>
            {/* 브랜드 타입 */}
            <FormControl
              label={t('common.brandType')}
              expanded={expandedSections.has('brand')}
              onToggle={() => toggleSection('brand')}
            >
              <div className={styles.brandType}>
                <div className={styles.brandLabel}>{t('furniture.single')}</div>
                <div className={styles.brandOptions}>
                  <button className={styles.brandOption}>{t('furniture.single')}</button>
                  <button className={styles.brandOption}>{t('furniture.dual')}</button>
                </div>
              </div>
            </FormControl>

            {/* 가격 정보 */}
            <FormControl
              label={t('common.priceInfo')}
              expanded={expandedSections.has('price')}
              onToggle={() => toggleSection('price')}
            >
              <div className={styles.priceInfo}>
                <div className={styles.priceLabel}>{t('common.priceInfo')}</div>
                <div className={styles.priceValue}>₩2,580,000</div>
              </div>
            </FormControl>

            {/* 다재 선택 */}
            <FormControl
              label={t('material.selection')}
              expanded={expandedSections.has('material')}
              onToggle={() => toggleSection('material')}
            >
              <ColorWheel />
              <div className={styles.materialToggle}>
                <div className={styles.materialLabel}>{t('material.title')}</div>
                <ToggleGroup
                  options={materialOptions}
                  selected="white"
                  onChange={() => {}}
                />
              </div>
            </FormControl>

            {/* 공간 설정 */}
            <FormControl
              label={t('space.title')}
              expanded={expandedSections.has('space')}
              onToggle={() => toggleSection('space')}
            >
              <NumberInput
                label={t('space.totalWidth')}
                value={width}
                onChange={(newWidth) => {
                  onWidthChange(newWidth);
                  // width 변경 시 doorCount 범위 체크 및 자동 조정은 useEffect에서 처리
                  
                  // 노서라운드 빌트인 모드에서 공간 너비 변경 시 자동 이격거리 계산
                  if (spaceInfo.surroundType === 'no-surround' && (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in')) {
                    const tempSpaceInfo = { ...spaceInfo, spaceWidth: newWidth };
                    const indexing = calculateSpaceIndexing(tempSpaceInfo);
                    
                    if (indexing.optimizedGapConfig) {
                      console.log('📏 공간 너비 변경 - 자동 이격거리 적용:', {
                        newWidth,
                        optimizedGap: indexing.optimizedGapConfig
                      });
                      setSpaceInfo({ gapConfig: indexing.optimizedGapConfig });
                    }
                  }
                }}
                min={1000}
                max={8000}
                step={100}
              />
              <NumberInput
                label={t('space.height')}
                value={height}
                onChange={onHeightChange}
                min={2000}
                max={3000}
                step={100}
              />
              
              {/* 단내림 활성화 시 구간별 정보 표시 */}
              {spaceInfo.droppedCeiling?.enabled && (
                <div className={styles.zoneInfo}>
                  <div className={styles.zoneInfoItem}>
                    <span className={styles.zoneLabel}>{t('space.mainSection')}:</span>
                    <span className={styles.zoneValue}>{(() => {
                      const mainOuter = width - spaceInfo.droppedCeiling.width;
                      const gapLeft = spaceInfo.gapConfig?.left ?? 1.5;
                      const gapRight = spaceInfo.gapConfig?.right ?? 1.5;
                      const gapMiddle = spaceInfo.gapConfig?.middle ?? 2;
                      const pos = spaceInfo.droppedCeiling.position || 'right';
                      return Math.round(pos === 'right' ? mainOuter - gapLeft - gapMiddle : mainOuter - gapMiddle - gapRight);
                    })()} mm</span>
                  </div>
                  <div className={styles.zoneInfoItem}>
                    <span className={styles.zoneLabel}>{t('space.droppedSection')}:</span>
                    <span className={styles.zoneValue}>{(() => {
                      const droppedOuter = spaceInfo.droppedCeiling.width;
                      const pos = spaceInfo.droppedCeiling.position || 'right';
                      const gap = pos === 'right' ? (spaceInfo.gapConfig?.right ?? 1.5) : (spaceInfo.gapConfig?.left ?? 1.5);
                      return Math.round(droppedOuter - gap);
                    })()} mm</span>
                  </div>
                </div>
              )}
            </FormControl>

            {/* 단내림 설정 - 공간 설정과 레이아웃 사이에 추가 */}
            <FormControl
              label={t('space.droppedCeiling')}
              expanded={expandedSections.has('droppedCeiling')}
              onToggle={() => toggleSection('droppedCeiling')}
            >
              {/* 단내림 있음/없음 토글 */}
              <ToggleGroup
                key={`dropped-ceiling-${currentLanguage}`}
                options={[
                  { id: 'no', label: t('common.none') },
                  { id: 'yes', label: t('common.enabled') }
                ]}
                selected={spaceInfo.droppedCeiling?.enabled ? 'yes' : 'no'}
                onChange={(value) => {
                  const isEnabled = value === 'yes';
                  if (isEnabled) {
                    // 단내림 활성화
                    onInstallTypeChange && onInstallTypeChange(installType); // 설치 타입 유지
                    const droppedWidth = 1300; // 기본 단내림 폭
                    const droppedHeight = 200; // 기본 단내림 높이
                    
                    // 단내림 구간의 내경폭으로 적절한 도어 개수 계산
                    const frameThickness = 50;
                    const droppedInternalWidth = droppedWidth - frameThickness;
                    const droppedDoorCount = SpaceCalculator.getDefaultColumnCount(droppedInternalWidth);
                    
                    console.log('🎯 단내림 활성화 시 도어개수 계산:', {
                      droppedWidth,
                      frameThickness,
                      droppedInternalWidth,
                      droppedDoorCount,
                      계산식: `Math.ceil(${droppedInternalWidth} / 600) = ${Math.ceil(droppedInternalWidth / 600)}`
                    });
                    
                    const updates: any = {
                      droppedCeiling: {
                        enabled: true,
                        width: droppedWidth,
                        dropHeight: droppedHeight,
                        position: 'right' // 기본 위치
                      },
                      droppedCeilingDoorCount: droppedDoorCount // 계산된 도어 개수로 설정
                    };
                    // spaceConfigStore 업데이트 호출
                    setSpaceInfo(updates);
                  } else {
                    // 단내림 비활성화
                    const updates: any = {
                      droppedCeiling: {
                        ...spaceInfo.droppedCeiling,
                        enabled: false
                      },
                      mainDoorCount: undefined,
                      droppedCeilingDoorCount: undefined
                    };
                    setSpaceInfo(updates);
                  }
                }}
              />
              
              {/* 단내림이 활성화된 경우 위치 선택 및 너비 조절 */}
              {spaceInfo.droppedCeiling?.enabled && (
                <>
                  <div style={{ marginTop: '16px' }}>
                    <div className={styles.inputLabel} style={{ marginBottom: '8px' }}>
                      {t('placement.droppedCeilingPosition')}
                    </div>
                    <ToggleGroup
                      key={`dropped-position-${currentLanguage}`}
                      options={droppedCeilingPositionOptions}
                      selected={spaceInfo.droppedCeiling?.position || 'right'}
                      onChange={(position) => {
                        const updates: any = {
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            position: position as 'left' | 'right'
                          }
                        };
                        setSpaceInfo(updates);
                      }}
                    />
                  </div>
                  
                  {/* 단내림 구간 너비 조절 슬라이더 */}
                  <div style={{ marginTop: '16px' }}>
                    <div className={styles.inputLabel} style={{ marginBottom: '8px' }}>{t('space.droppedCeilingWidth')}</div>
                    <Slider
                      value={spaceInfo.droppedCeiling?.width || 1300}
                      onChange={(newWidth) => {
                        // 너비가 변경되면 해당 너비에 맞는 적절한 컬럼수 재계산
                        const frameThickness = 50;
                        const droppedInternalWidth = newWidth - frameThickness;
                        const newDoorCount = SpaceCalculator.getDefaultColumnCount(droppedInternalWidth);
                        
                        const updates: any = {
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            width: newWidth
                          },
                          droppedCeilingDoorCount: newDoorCount
                        };
                        if (window.handleSpaceInfoUpdate) {
                          window.handleSpaceInfoUpdate(updates);
                        }
                      }}
                      min={600}
                      max={Math.min(width - 600, 2400)} // 전체 너비에서 최소 메인구간 600mm 확보, 최대 2400mm
                      step={100}
                      format={(val) => `${val}mm`}
                    />
                  </div>
                </>
              )}
            </FormControl>

            {/* 메인구간 사이즈 - 단내림 활성화되고 메인구간 탭일 때만 표시 */}
            {spaceInfo.droppedCeiling?.enabled && activeTab === 'placement' && (
              <FormControl
                label={t('space.mainSectionSize')}
                expanded={expandedSections.has('mainSpace')}
                onToggle={() => toggleSection('mainSpace')}
              >
                <div className={styles.numberInput}>
                  <div className={styles.inputLabel}>{t('space.width')}</div>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputField}>
                      <input
                        type="number"
                        value={(() => {
                          const mainOuter = width - spaceInfo.droppedCeiling.width;
                          const gapLeft = spaceInfo.gapConfig?.left ?? 1.5;
                          const gapRight = spaceInfo.gapConfig?.right ?? 1.5;
                          const gapMiddle = spaceInfo.gapConfig?.middle ?? 2;
                          const pos = spaceInfo.droppedCeiling.position || 'right';
                          return Math.round(pos === 'right' ? mainOuter - gapLeft - gapMiddle : mainOuter - gapMiddle - gapRight);
                        })()}
                        readOnly
                        style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-background-tertiary)', cursor: 'not-allowed' }}
                      />
                      <span className={styles.inputUnit}>mm</span>
                    </div>
                  </div>
                </div>
                <div className={styles.numberInput}>
                  <div className={styles.inputLabel}>{t('space.height')}</div>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputField}>
                      <input
                        type="number"
                        value={height}
                        readOnly
                        style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-background-tertiary)', cursor: 'not-allowed' }}
                      />
                      <span className={styles.inputUnit}>mm</span>
                    </div>
                  </div>
                </div>
              </FormControl>
            )}

            {/* 배치 방식 */}
            <FormControl
              label={t('space.layoutMode')}
              expanded={expandedSections.has('layoutMode')}
              onToggle={() => toggleSection('layoutMode')}
            >
              <ToggleGroup
                key={`layout-mode-${currentLanguage}`}
                options={[
                  { id: 'equal-division', label: t('space.equalDivision') },
                  { id: 'free-placement', label: t('space.freePlacement') },
                ]}
                selected={spaceInfo.layoutMode || 'equal-division'}
                onChange={(value) => {
                  const newMode = value as 'equal-division' | 'free-placement';
                  const currentMode = spaceInfo.layoutMode || 'equal-division';
                  if (newMode === currentMode) return;
                  if (placedModules.length > 0) {
                    if (!window.confirm(t('space.modeSwitchWarning'))) return;
                    clearAllModules();
                  }
                  setSpaceInfo({ layoutMode: newMode });
                }}
              />
            </FormControl>

            {/* 컬럼수 - 균등분할 모드에서만 표시 */}
            {(spaceInfo.layoutMode || 'equal-division') === 'equal-division' && (
              <FormControl
                label={t('space.columnCount')}
                expanded={expandedSections.has('layout')}
                onToggle={() => toggleSection('layout')}
              >
                <NumberInput
                  label={spaceInfo.droppedCeiling?.enabled ? t('space.columnCount') : t('space.columnCount')}
                  value={doorCount}
                  onChange={onDoorCountChange}
                  min={minDoors}
                  max={maxDoors}
                  unit={t('common.unit')}
                />

                <DoorSlider
                  value={doorCount}
                  onChange={onDoorCountChange}
                  width={width}
                />

              </FormControl>
            )}

            {/* 바닥 마감재 - 띄워서 배치일 때는 숨김 */}
            {(() => {
              const isFloat = spaceInfo.baseConfig?.placementType === 'float' && (spaceInfo.baseConfig?.floatHeight || 0) > 0;
              console.log('🔴🔴🔴 바닥마감재 메뉴 조건:', {
                baseConfig: spaceInfo.baseConfig,
                placementType: spaceInfo.baseConfig?.placementType,
                floatHeight: spaceInfo.baseConfig?.floatHeight,
                isFloat,
                shouldShow: !isFloat
              });
              return !isFloat;
            })() && (
              <FormControl
                label={t('material.floorFinish')}
                expanded={expandedSections.has('floor')}
                onToggle={() => toggleSection('floor')}
              >
                <ToggleGroup
                  key={`floor-${currentLanguage}`}
                  options={floorOptions}
                  selected={hasFloorFinish ? 'yes' : 'no'}
                  onChange={(value) => onFloorFinishToggle()}
                />
              </FormControl>
            )}

            {/* 프레임 속성 */}
            <FormControl
              label={t('frame.properties')}
              expanded={expandedSections.has('frame')}
              onToggle={() => toggleSection('frame')}
            >
              <ToggleGroup
                key={`frame-${currentLanguage}`}
                options={frameTypeOptions}
                selected={frameType}
                onChange={(value) => onFrameTypeChange(value as 'surround' | 'no-surround')}
              />
            </FormControl>
            
            {/* 노서라운드 모드에서 상부프레임 설정 표시 */}
            {frameType === 'no-surround' && (
              <FormControl
                label={t('space.topFrame')}
                expanded={expandedSections.has('topFrame')}
                onToggle={() => toggleSection('topFrame')}
              >
                <NumberInput
                  label={t('space.frameHeight')}
                  value={spaceInfo.frameSize?.top || 10}
                  onChange={(value) => {
                    const updates = {
                      frameSize: {
                        ...spaceInfo.frameSize,
                        top: value
                      }
                    };
                    setSpaceInfo(updates);
                  }}
                  min={10}
                  max={200}
                  step={1}
                  unit="mm"
                />
              </FormControl>
            )}
          </div>
        )}

        {activeTab === 'module' && (
          <div className={styles.moduleSettings}>
            {/* 단내림 구간이 활성화된 경우 도어 개수 표시 */}
            {spaceInfo.droppedCeiling?.enabled && (
              <div className={styles.formContainer}>
                <FormControl
                  label={t('space.droppedColumnCount')}
                  expanded={expandedSections.has('droppedLayout')}
                  onToggle={() => toggleSection('droppedLayout')}
                >
                  <DoorSlider
                    value={spaceInfo.droppedCeilingDoorCount || 1}
                    onChange={(newValue) => {
                      console.log('🎯 단내림 구간 도어 개수 변경:', newValue);

                      // 슬롯 개수에 맞춰 단내림 너비 자동 계산 (슬롯 1개 = 450mm)
                      const newWidth = newValue * 450;

                      const updates: any = {
                        droppedCeilingDoorCount: newValue,
                        droppedCeiling: {
                          ...spaceInfo.droppedCeiling,
                          width: newWidth
                        }
                      };
                      setSpaceInfo(updates);
                    }}
                    width={spaceInfo.droppedCeiling?.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH}
                  />
                  
                  <div className={styles.zoneInfo} style={{ marginTop: '12px' }}>
                    <div className={styles.zoneInfoItem}>
                      <span className={styles.zoneLabel}>{t('space.width')}:</span>
                      <span className={styles.zoneValue}>{spaceInfo.droppedCeiling.width} mm</span>
                    </div>
                    <div className={styles.zoneInfoItem}>
                      <span className={styles.zoneLabel}>{t('space.height')}:</span>
                      <span className={styles.zoneValue}>{height - spaceInfo.droppedCeiling.dropHeight} mm</span>
                    </div>
                    {(() => {
                      // 단내림 영역의 실제 내경 계산
                      const droppedInternalWidth = SpaceCalculator.calculateDroppedZoneInternalWidth(spaceInfo);
                      const doorCount = spaceInfo.droppedCeilingDoorCount || 1; // 기본값 1
                      // 소수점 1자리까지 정확히 계산
                      const slotWidth = droppedInternalWidth ? Math.round((droppedInternalWidth / doorCount) * 10) / 10 : 0;
                      
                      return (
                        <div className={styles.zoneInfoItem}>
                          <span className={styles.zoneLabel}>{t('space.slotWidth')}:</span>
                          <span className={styles.zoneValue}>
                            {slotWidth} mm
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </FormControl>
                
                {/* 일반 구간 정보 추가 */}
                <FormControl
                  label={t('space.normalColumnCount')}
                  expanded={expandedSections.has('normalLayout')}
                  onToggle={() => toggleSection('normalLayout')}
                  style={{ marginTop: '16px' }}
                >
                  <DoorSlider
                    value={spaceInfo.mainDoorCount || spaceInfo.customColumnCount || 3}
                    onChange={(newValue) => {
                      console.log('🎯 일반 구간 도어 개수 변경:', newValue);
                      const updates: any = {
                        mainDoorCount: newValue
                      };
                      setSpaceInfo(updates);
                    }}
                    width={spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0)}
                  />
                  
                  <div className={styles.zoneInfo} style={{ marginTop: '12px' }}>
                    <div className={styles.zoneInfoItem}>
                      <span className={styles.zoneLabel}>{t('space.width')}:</span>
                      <span className={styles.zoneValue}>{spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0)} mm</span>
                    </div>
                    <div className={styles.zoneInfoItem}>
                      <span className={styles.zoneLabel}>{t('space.height')}:</span>
                      <span className={styles.zoneValue}>{height} mm</span>
                    </div>
                    {(() => {
                      // 일반 영역의 실제 내경 계산
                      const normalInternalWidth = SpaceCalculator.calculateNormalZoneInternalWidth(spaceInfo);
                      const doorCount = spaceInfo.mainDoorCount || spaceInfo.customColumnCount || 3;
                      // 소수점 1자리까지 정확히 계산
                      const slotWidth = normalInternalWidth ? Math.round((normalInternalWidth / doorCount) * 10) / 10 : 0;
                      
                      return (
                        <div className={styles.zoneInfoItem}>
                          <span className={styles.zoneLabel}>{t('space.slotWidth')}:</span>
                          <span className={styles.zoneValue}>
                            {slotWidth} mm
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </FormControl>
              </div>
            )}
            <ModuleContent />
          </div>
        )}
      </div>

      {/* 완료 버튼 */}
      <div className={styles.panelFooter}>
        <button className={styles.completeButton}>
          {t('common.finish')}
        </button>
      </div>
    </div>
  );
};

export { DoorSlider as DoorCountSlider };
export default RightPanel; 